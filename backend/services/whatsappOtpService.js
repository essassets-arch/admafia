import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { OtpVerification, OtpDeliveryLog, SecurityEventLog } from '../models/index.js';
import { incrWithTtl, getKey, setKeyEx } from './redisStore.js';

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const VERIFICATION_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes to complete multi-step signup/reset form
const MAX_OTP_ATTEMPTS = 5;

function getOtpHmacSecret() {
  return (
    process.env.OTP_HMAC_SECRET ||
    process.env.JWT_SECRET ||
    'admafia_otp_fallback_hmac_secret_2026'
  ).trim();
}

export function getWhatsAppConfig() {
  const accessToken = (process.env.WHATSAPP_ACCESS_TOKEN || '').trim();
  const phoneNumberId = (process.env.WHATSAPP_PHONE_NUMBER_ID || '1410175982181803').trim();
  const apiVersion = (process.env.WHATSAPP_API_VERSION || 'v26.0').trim();
  const templateName = (process.env.WHATSAPP_TEMPLATE_NAME || 'authentication').trim();
  const templateLang = (process.env.WHATSAPP_TEMPLATE_LANG || 'en').trim();
  const rawMode = (process.env.OTP_MODE || 'live').trim().toLowerCase();
  // Never allow sandbox OTP in production unless explicitly forced for isolated staging
  const mode = rawMode === 'sandbox' && process.env.NODE_ENV !== 'production' ? 'sandbox' : 'live';

  return {
    accessToken,
    phoneNumberId,
    apiVersion,
    templateName,
    templateLang,
    mode,
    configured: Boolean(accessToken && phoneNumberId),
  };
}

const COUNTRY_DIAL_MAP = {
  IN: '91',
  US: '1',
  CA: '1',
  GB: '44',
  UK: '44',
  AE: '971',
  SA: '966',
  AU: '61',
  SG: '65',
  DE: '49',
  FR: '33',
  QA: '974',
  KW: '965',
  OM: '968',
  BH: '973',
  MY: '60',
  NZ: '64',
};

/**
 * Normalizes any phone input into:
 * - `cleanPhone`: canonical CRM lookup key (`10` digits for India, `7-15` digits international)
 * - `e164Digits`: Meta WhatsApp Cloud API `to` parameter (country code + subscriber digits, no `+`)
 */
export function normalizeWhatsAppPhone(rawPhone, countryCode = 'IN', explicitDialCode = '') {
  const cc = String(countryCode || 'IN').trim().toUpperCase();
  const digits = String(rawPhone || '').replace(/\D/g, '');

  if (cc === 'IN') {
    const sub10 = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits.slice(-10);
    if (sub10.length !== 10 || !/^[6-9]\d{9}$/.test(sub10)) {
      return {
        valid: false,
        error: 'Please enter a valid 10-digit Indian WhatsApp mobile number.',
      };
    }
    return {
      valid: true,
      cleanPhone: sub10,
      e164Digits: `91${sub10}`,
      countryCode: 'IN',
      masked: `+91 ${sub10.slice(0, 2)}••••${sub10.slice(-4)}`,
    };
  }

  if (digits.length < 7 || digits.length > 15) {
    return {
      valid: false,
      error: 'Please enter a valid international WhatsApp number including country code (7–15 digits).',
    };
  }

  const dial = String(explicitDialCode || COUNTRY_DIAL_MAP[cc] || '').replace(/\D/g, '');
  let e164Digits = digits;
  if (dial && !digits.startsWith(dial) && digits.length <= 10) {
    e164Digits = `${dial}${digits}`;
  }

  return {
    valid: true,
    cleanPhone: digits,
    e164Digits,
    countryCode: cc,
    masked: `+${e164Digits.slice(0, Math.max(2, e164Digits.length - 6))}••••${e164Digits.slice(-4)}`,
  };
}

function computeOtpHash(cleanPhone, purpose, otpCode) {
  return createHmac('sha256', getOtpHmacSecret())
    .update(`${cleanPhone}:${purpose}:${String(otpCode).trim()}`)
    .digest('hex');
}

function hashVerificationToken(rawToken) {
  return createHmac('sha256', getOtpHmacSecret())
    .update(`vtok:${String(rawToken || '').trim()}`)
    .digest('hex');
}

/**
 * Dispatches 6-digit authentication OTP via Meta WhatsApp Cloud API v26.0
 * using the approved `authentication` template (body + copy-code URL button).
 */
export async function sendMetaWhatsAppOtp({ e164Digits, maskedPhone, countryCode, purpose, otpCode, ipAddress = '' }) {
  const cfg = getWhatsAppConfig();
  const startedAt = Date.now();

  if (cfg.mode === 'sandbox') {
    const sandboxWamid = `wamid.sandbox_${Date.now()}_${randomBytes(4).toString('hex')}`;
    await OtpDeliveryLog.create({
      phoneMasked: maskedPhone,
      countryCode,
      purpose,
      provider: 'meta_whatsapp_sandbox',
      templateName: cfg.templateName,
      wamid: sandboxWamid,
      httpStatus: 200,
      latencyMs: Date.now() - startedAt,
      status: 'sandbox',
      ipAddress,
    }).catch(() => {});

    return {
      ok: true,
      mode: 'sandbox',
      wamid: sandboxWamid,
    };
  }

  if (!cfg.configured) {
    throw new Error('WhatsApp OTP verification service temporarily unavailable');
  }

  const endpoint = `https://graph.facebook.com/${cfg.apiVersion}/${cfg.phoneNumberId}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: e164Digits,
    type: 'template',
    template: {
      name: cfg.templateName,
      language: {
        code: cfg.templateLang,
      },
      components: [
        {
          type: 'body',
          parameters: [
            {
              type: 'text',
              text: String(otpCode),
            },
          ],
        },
        {
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [
            {
              type: 'text',
              text: String(otpCode),
            },
          ],
        },
      ],
    },
  };

  let httpStatus = 500;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(12_000),
    });

    httpStatus = response.status;
    const data = await response.json().catch(() => ({}));
    const latencyMs = Date.now() - startedAt;

    if (!response.ok) {
      const errMsg = data?.error?.message || `WhatsApp OTP gateway HTTP ${response.status}`;
      await OtpDeliveryLog.create({
        phoneMasked: maskedPhone,
        countryCode,
        purpose,
        templateName: cfg.templateName,
        wamid: null,
        httpStatus,
        latencyMs,
        status: 'failed',
        errorMessage: errMsg,
        ipAddress,
      }).catch(() => {});

      throw new Error('WhatsApp OTP verification service temporarily unavailable');
    }

    const wamid = data?.messages?.[0]?.id || `wamid.accepted_${Date.now()}`;
    await OtpDeliveryLog.create({
      phoneMasked: maskedPhone,
      countryCode,
      purpose,
      templateName: cfg.templateName,
      wamid,
      httpStatus,
      latencyMs,
      status: 'accepted',
      ipAddress,
    }).catch(() => {});

    return {
      ok: true,
      mode: 'live',
      wamid,
    };
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      await OtpDeliveryLog.create({
        phoneMasked: maskedPhone,
        countryCode,
        purpose,
        templateName: cfg.templateName,
        httpStatus: 504,
        latencyMs: Date.now() - startedAt,
        status: 'failed',
        errorMessage: 'WhatsApp OTP delivery timed out (12s)',
        ipAddress,
      }).catch(() => {});
      throw new Error('WhatsApp OTP delivery timed out (12s)');
    }
    throw err;
  }
}

/**
 * Enforces multi-layer cooldowns & rate limits, creates hashed OTP challenge, and sends via WhatsApp.
 */
export async function issueOtpChallenge({ rawPhone, countryCode = 'IN', dialCode = '', purpose = 'register', ipAddress = '' }) {
  const norm = normalizeWhatsAppPhone(rawPhone, countryCode, dialCode);
  if (!norm.valid) {
    const e = new Error(norm.error);
    e.statusCode = 400;
    throw e;
  }

  // 1. Per-IP burst protection (max 10 OTP sends per 15 minutes per IP)
  if (ipAddress) {
    const ipLimit = await incrWithTtl(`rl:otp:ip:${ipAddress}`, 15 * 60);
    if (ipLimit.count > 10) {
      await SecurityEventLog.create({
        category: 'RATE_LIMIT',
        ipAddress,
        path: '/api/auth/otp/send',
        method: 'POST',
        detail: `IP OTP send burst exceeded (${ipLimit.count}/10 in 15m)`,
      }).catch(() => {});
      const e = new Error('Too many OTP requests from this network. Please wait 15 minutes before retrying.');
      e.statusCode = 429;
      throw e;
    }
  }

  // 2. Per-phone 60-second resend cooldown
  const cooldownKey = `rl:otp:cooldown:${norm.cleanPhone}:${purpose}`;
  const activeCooldown = await getKey(cooldownKey);
  if (activeCooldown) {
    const remainingSec = Math.max(1, Math.ceil((Number(activeCooldown) - Date.now()) / 1000));
    const e = new Error(`Please wait ${remainingSec}s before requesting another WhatsApp OTP.`);
    e.statusCode = 429;
    e.retryAfterSeconds = remainingSec;
    throw e;
  }

  // 3. Per-phone hourly cap (max 5 OTPs/hour to prevent WhatsApp billing abuse / SMS bombing)
  const phoneHourly = await incrWithTtl(`rl:otp:hour:${norm.cleanPhone}`, 60 * 60);
  if (phoneHourly.count > 5) {
    await SecurityEventLog.create({
      category: 'RATE_LIMIT',
      ipAddress,
      path: '/api/auth/otp/send',
      method: 'POST',
      detail: `Phone hourly WhatsApp OTP cap exceeded for ${norm.masked}`,
    }).catch(() => {});
    const e = new Error('Maximum WhatsApp OTP limit (5 per hour) reached for this number. Please try again later.');
    e.statusCode = 429;
    throw e;
  }

  const cfg = getWhatsAppConfig();
  const otpCode = cfg.mode === 'sandbox' ? '123456' : String(randomInt(100000, 1000000));
  const otpHash = computeOtpHash(norm.cleanPhone, purpose, otpCode);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  // Invalidate any previous unverified challenges for the same phone + purpose
  await OtpVerification.deleteMany({ phone: norm.cleanPhone, purpose, verified: false });

  const challenge = await OtpVerification.create({
    phone: norm.cleanPhone,
    e164Phone: norm.e164Digits,
    countryCode: norm.countryCode,
    purpose,
    otpHash,
    attempts: 0,
    verified: false,
    ipAddress,
    expiresAt,
  });

  try {
    const delivery = await sendMetaWhatsAppOtp({
      e164Digits: norm.e164Digits,
      maskedPhone: norm.masked,
      countryCode: norm.countryCode,
      purpose,
      otpCode,
      ipAddress,
    });

    challenge.wamid = delivery.wamid;
    await challenge.save();
    await setKeyEx(cooldownKey, String(Date.now() + 60_000), 60);

    return {
      ok: true,
      maskedPhone: norm.masked,
      cleanPhone: norm.cleanPhone,
      countryCode: norm.countryCode,
      expiresInSeconds: Math.floor(OTP_TTL_MS / 1000),
      resendCooldownSeconds: 60,
      mode: delivery.mode,
    };
  } catch (sendErr) {
    // Remove unsent challenge so user isn't stuck if Meta API rejected the number
    await OtpVerification.deleteOne({ _id: challenge._id }).catch(() => {});
    throw sendErr;
  }
}

/**
 * Verifies user-submitted 6-digit OTP in constant time and mints a single-use verification token.
 */
export async function verifyOtpCode({ rawPhone, countryCode = 'IN', purpose = 'register', otpCode, ipAddress = '' }) {
  const norm = normalizeWhatsAppPhone(rawPhone, countryCode);
  if (!norm.valid) {
    const e = new Error(norm.error);
    e.statusCode = 400;
    throw e;
  }

  const cleanOtp = String(otpCode || '').replace(/\D/g, '');
  if (cleanOtp.length !== 6) {
    const e = new Error('Please enter a valid 6-digit verification code.');
    e.statusCode = 400;
    throw e;
  }

  const challenge = await OtpVerification.findOne({
    phone: norm.cleanPhone,
    purpose,
    verified: false,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });

  if (!challenge) {
    const e = new Error('Verification code has expired or was not requested. Please request a new WhatsApp OTP.');
    e.statusCode = 400;
    throw e;
  }

  if (challenge.attempts >= MAX_OTP_ATTEMPTS) {
    await SecurityEventLog.create({
      category: 'OTP_LOCKOUT',
      ipAddress,
      path: '/api/auth/otp/verify',
      method: 'POST',
      detail: `Locked OTP challenge after ${challenge.attempts} failed tries for ${norm.masked}`,
    }).catch(() => {});
    const e = new Error('Too many incorrect OTP attempts. Please request a fresh verification code.');
    e.statusCode = 429;
    throw e;
  }

  const candidateHash = computeOtpHash(norm.cleanPhone, purpose, cleanOtp);
  const expectedBuf = Buffer.from(challenge.otpHash, 'hex');
  const candidateBuf = Buffer.from(candidateHash, 'hex');
  const isMatch = expectedBuf.length === candidateBuf.length && timingSafeEqual(expectedBuf, candidateBuf);

  if (!isMatch) {
    challenge.attempts += 1;
    await challenge.save();
    const remaining = Math.max(0, MAX_OTP_ATTEMPTS - challenge.attempts);
    if (remaining === 0) {
      await SecurityEventLog.create({
        category: 'OTP_LOCKOUT',
        ipAddress,
        path: '/api/auth/otp/verify',
        method: 'POST',
        detail: `OTP challenge locked out on attempt ${challenge.attempts} for ${norm.masked}`,
      }).catch(() => {});
    }
    const e = new Error(
      remaining > 0
        ? `Incorrect verification code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
        : 'Too many incorrect attempts. This code is now locked — please request a new OTP.'
    );
    e.statusCode = remaining > 0 ? 401 : 429;
    throw e;
  }

  const rawToken = `wa_vtok_${randomBytes(24).toString('hex')}`;
  challenge.verified = true;
  challenge.verifiedAt = new Date();
  challenge.verificationTokenHash = hashVerificationToken(rawToken);
  challenge.tokenConsumed = false;
  challenge.tokenExpiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);
  await challenge.save();

  return {
    ok: true,
    cleanPhone: norm.cleanPhone,
    e164Digits: norm.e164Digits,
    otpVerificationToken: rawToken,
    expiresInSeconds: Math.floor(VERIFICATION_TOKEN_TTL_MS / 1000),
  };
}

/**
 * Atomically validates and consumes a single-use `otpVerificationToken` for exact phone + purpose.
 */
export async function consumeOtpVerificationToken({ token, cleanPhone, purpose = 'register' }) {
  const raw = String(token || '').trim();
  if (!raw) {
    return { valid: false, error: 'WhatsApp OTP verification is required to continue.' };
  }

  const tokenHash = hashVerificationToken(raw);
  const consumed = await OtpVerification.findOneAndUpdate(
    {
      verificationTokenHash: tokenHash,
      phone: cleanPhone,
      purpose,
      verified: true,
      tokenConsumed: false,
      tokenExpiresAt: { $gt: new Date() },
    },
    {
      $set: { tokenConsumed: true },
    },
    { new: true }
  );

  if (!consumed) {
    return {
      valid: false,
      error: 'WhatsApp OTP session is invalid, expired, or does not match this phone number. Please verify your WhatsApp number again.',
    };
  }

  return { valid: true, record: consumed };
}

