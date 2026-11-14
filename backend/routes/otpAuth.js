import express from 'express';
import { Customer, OtpDeliveryLog } from '../models/index.js';
import { resolveVisitorCountry } from '../services/countryDetection.js';
import {
  normalizeWhatsAppPhone,
  issueOtpChallenge,
  verifyOtpCode,
  consumeOtpVerificationToken,
} from '../services/whatsappOtpService.js';
import { hashPassword } from '../utils/passwordCrypto.js';
import { ciExact } from '../repositories/salesViewRepo.js';
import { getClientIp } from '../middleware/securityMiddleware.js';

export const otpAuthRouter = express.Router();

/**
 * GET /api/auth/check-username?username=...
 * Real-time availability check for Step 2 of progressive registration (returns boolean only, zero PII).
 */
otpAuthRouter.get('/auth/check-username', async (req, res) => {
  try {
    const cleanUser = String(req.query?.username || '')
      .trim()
      .replace(/^@/, '');
    if (cleanUser.length < 3 || cleanUser.length > 32 || !/^[a-zA-Z0-9_.-]+$/.test(cleanUser)) {
      return res.json({
        ok: true,
        available: false,
        reason: 'Username must be 3–32 characters (letters, numbers, underscores, dots, or hyphens).',
      });
    }
    const exists = await Customer.exists({ username: ciExact(cleanUser) });
    return res.json({
      ok: true,
      available: !exists,
      reason: exists ? `Username "@${cleanUser}" is already taken.` : null,
    });
  } catch {
    return res.status(500).json({ ok: false, available: false });
  }
});

/**
 * POST /api/auth/otp/send
 * Dispatches 6-digit Meta WhatsApp Cloud API (`v26.0`) OTP for:
 * - `register`: Pre-checks phone & username uniqueness BEFORE spending Meta WhatsApp credits!
 * - `password_reset`: Verifies account exists before sending OTP.
 * - `verify_phone`: Verifies unverified existing customer's WhatsApp number on first login.
 */
otpAuthRouter.post('/auth/otp/send', async (req, res) => {
  try {
    const {
      phone,
      mobile,
      username,
      countryCode: reqCountryCode,
      dialCode = '',
      purpose = 'register',
    } = req.body || {};

    const allowedPurposes = ['register', 'password_reset', 'verify_phone'];
    const cleanPurpose = allowedPurposes.includes(purpose) ? purpose : 'register';

    // Use server-detected visitor country for new registrations unless international phone supplied
    let effectiveCountry = String(reqCountryCode || '').trim().toUpperCase();
    if (!effectiveCountry) {
      const detection = await resolveVisitorCountry(req).catch(() => ({ detectedCode: 'IN' }));
      effectiveCountry = detection?.detectedCode || 'IN';
    }

    const norm = normalizeWhatsAppPhone(phone || mobile, effectiveCountry, dialCode);
    if (!norm.valid) {
      return res.status(400).json({ ok: false, error: norm.error });
    }

    if (cleanPurpose === 'register') {
      // Pre-check 1: Never overwrite or waste Meta credits if phone is already registered
      const existingPhone = await Customer.exists({ phone: norm.cleanPhone });
      if (existingPhone) {
        return res.status(409).json({
          ok: false,
          code: 'PHONE_ALREADY_EXISTS',
          error: 'An account with this WhatsApp number already exists. Please sign in to your workspace instead.',
        });
      }

      // Pre-check 2: If username was provided on form, check availability upfront
      const cleanUser = String(username || '').trim().replace(/^@/, '');
      if (cleanUser) {
        const existingUsername = await Customer.exists({ username: ciExact(cleanUser) });
        if (existingUsername) {
          return res.status(409).json({
            ok: false,
            code: 'USERNAME_TAKEN',
            error: `The username "${cleanUser}" is already taken. Please choose a different username.`,
          });
        }
      }
    } else if (cleanPurpose === 'password_reset' || cleanPurpose === 'verify_phone') {
      const existingCust = await Customer.findOne({ phone: norm.cleanPhone }).select('_id status').lean();
      if (!existingCust) {
        return res.status(404).json({
          ok: false,
          error: 'No registered business account found with this WhatsApp number.',
        });
      }
      if (existingCust.status === 'suspended') {
        return res.status(403).json({
          ok: false,
          error: 'This workspace is currently suspended. Please contact support.',
        });
      }
    }

    const ipAddress = getClientIp(req);
    const result = await issueOtpChallenge({
      rawPhone: norm.cleanPhone,
      countryCode: norm.countryCode,
      dialCode,
      purpose: cleanPurpose,
      ipAddress,
    });

    return res.json({
      ok: true,
      message: `Verification code sent via WhatsApp to ${result.maskedPhone}`,
      maskedPhone: result.maskedPhone,
      countryCode: result.countryCode,
      expiresInSeconds: result.expiresInSeconds,
      resendCooldownSeconds: result.resendCooldownSeconds,
      mode: result.mode,
    });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({
      ok: false,
      error: err.message || 'Failed to send WhatsApp verification code.',
      retryAfterSeconds: err.retryAfterSeconds || undefined,
    });
  }
});

/**
 * POST /api/auth/otp/verify
 * Verifies the 6-digit WhatsApp OTP and returns a 10-minute single-use `otpVerificationToken`.
 */
otpAuthRouter.post('/auth/otp/verify', async (req, res) => {
  try {
    const { phone, mobile, otp, code, countryCode: reqCountryCode, purpose = 'register' } = req.body || {};
    let effectiveCountry = String(reqCountryCode || '').trim().toUpperCase();
    if (!effectiveCountry) {
      const detection = await resolveVisitorCountry(req).catch(() => ({ detectedCode: 'IN' }));
      effectiveCountry = detection?.detectedCode || 'IN';
    }

    const ipAddress = getClientIp(req);
    const verified = await verifyOtpCode({
      rawPhone: phone || mobile,
      countryCode: effectiveCountry,
      purpose,
      otpCode: otp || code,
      ipAddress,
    });

    return res.json({
      ok: true,
      verified: true,
      otpVerificationToken: verified.otpVerificationToken,
      expiresInSeconds: verified.expiresInSeconds,
    });
  } catch (err) {
    const status = err.statusCode || 400;
    return res.status(status).json({
      ok: false,
      error: err.message || 'Verification failed.',
    });
  }
});

/**
 * POST /api/auth/password/reset-otp
 * Resets a customer's password using a verified WhatsApp OTP token (`purpose='password_reset'`).
 */
otpAuthRouter.post('/auth/password/reset-otp', async (req, res) => {
  try {
    const { phone, mobile, countryCode = 'IN', otpVerificationToken, newPassword } = req.body || {};
    const cleanNewPassword = String(newPassword || '').trim();
    if (cleanNewPassword.length < 6) {
      return res.status(400).json({ ok: false, error: 'New password must be at least 6 characters long.' });
    }

    const norm = normalizeWhatsAppPhone(phone || mobile, countryCode);
    if (!norm.valid) {
      return res.status(400).json({ ok: false, error: norm.error });
    }

    const consumed = await consumeOtpVerificationToken({
      token: otpVerificationToken,
      cleanPhone: norm.cleanPhone,
      purpose: 'password_reset',
    });
    if (!consumed.valid) {
      return res.status(401).json({ ok: false, error: consumed.error });
    }

    const hashed = await hashPassword(cleanNewPassword);
    const updated = await Customer.findOneAndUpdate(
      { phone: norm.cleanPhone },
      {
        $set: {
          passwordHash: hashed,
          phoneVerified: true,
          phoneVerifiedAt: new Date(),
        },
      },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ ok: false, error: 'Account not found for this WhatsApp number.' });
    }

    return res.json({
      ok: true,
      message: 'Your password has been securely updated. You can now sign in.',
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/auth/verify-existing-phone
 * Completes mandatory WhatsApp verification for admin/sales-provisioned accounts on first login.
 */
otpAuthRouter.post('/auth/verify-existing-phone', async (req, res) => {
  try {
    const { phone, mobile, countryCode = 'IN', otpVerificationToken } = req.body || {};
    const norm = normalizeWhatsAppPhone(phone || mobile, countryCode);
    if (!norm.valid) {
      return res.status(400).json({ ok: false, error: norm.error });
    }

    const consumed = await consumeOtpVerificationToken({
      token: otpVerificationToken,
      cleanPhone: norm.cleanPhone,
      purpose: 'verify_phone',
    });
    if (!consumed.valid) {
      return res.status(401).json({ ok: false, error: consumed.error });
    }

    const updated = await Customer.findOneAndUpdate(
      { phone: norm.cleanPhone },
      {
        $set: {
          phoneVerified: true,
          phoneVerifiedAt: new Date(),
        },
      },
      { new: true }
    ).lean();

    if (!updated) {
      return res.status(404).json({ ok: false, error: 'Customer account not found.' });
    }

    return res.json({
      ok: true,
      phoneVerified: true,
      phoneVerifiedAt: updated.phoneVerifiedAt,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET & POST /api/webhooks/whatsapp
 * Meta WhatsApp Cloud API webhook verification & real-time delivery status updates (`sent`, `delivered`, `read`, `failed`).
 */
otpAuthRouter.get('/webhooks/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const expected = (process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'admafia_wa_webhook_verify_2026').trim();

  if (mode === 'subscribe' && token === expected) {
    return res.status(200).send(String(challenge || ''));
  }
  return res.status(403).json({ ok: false, error: 'Invalid webhook verify token' });
});

otpAuthRouter.post('/webhooks/whatsapp', async (req, res) => {
  try {
    const entries = Array.isArray(req.body?.entry) ? req.body.entry : [];
    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const ch of changes) {
        const statuses = Array.isArray(ch?.value?.statuses) ? ch.value.statuses : [];
        for (const st of statuses) {
          if (st?.id && st?.status) {
            const mappedStatus = ['sent', 'delivered', 'read', 'failed'].includes(st.status)
              ? st.status
              : 'sent';
            const errTitle = st?.errors?.[0]?.title || st?.errors?.[0]?.message || null;
            await OtpDeliveryLog.updateOne(
              { wamid: st.id },
              {
                $set: {
                  status: mappedStatus,
                  ...(errTitle ? { errorMessage: errTitle } : {}),
                },
              }
            ).catch(() => {});
          }
        }
      }
    }
    return res.status(200).json({ ok: true });
  } catch {
    return res.status(200).json({ ok: true });
  }
});

export default otpAuthRouter;

