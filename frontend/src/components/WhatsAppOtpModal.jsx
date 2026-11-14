import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, RefreshCw, X, Lock, Eye, EyeOff, MessageCircle, CheckCircle2 } from 'lucide-react';
import crmApi from '../services/crmApi';

/**
 * Reusable Meta WhatsApp Cloud API (v26.0) 6-Digit OTP Verification Modal
 * Supports purposes: 'register' | 'password_reset' | 'verify_phone'
 */
export default function WhatsAppOtpModal({
  isOpen,
  onClose,
  phone,
  countryCode = 'IN',
  maskedPhone = '',
  purpose = 'register',
  title = 'Verify Your WhatsApp Number',
  subtitle = '',
  initialCooldown = 60,
  sandboxHint = '',
  onVerified,
}) {
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [cooldown, setCooldown] = useState(initialCooldown);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPwd, setShowNewPwd] = useState(false);
  const inputRefs = useRef([]);

  useEffect(() => {
    if (!isOpen) return;
    setDigits(['', '', '', '', '', '']);
    setError('');
    setInfoMsg('');
    setCooldown(initialCooldown || 60);
    setNewPassword('');
    setTimeout(() => {
      if (inputRefs.current[0]) inputRefs.current[0].focus();
    }, 80);
  }, [isOpen, phone, purpose, initialCooldown]);

  useEffect(() => {
    if (!isOpen || cooldown <= 0) return undefined;
    const timer = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [isOpen, cooldown]);

  if (!isOpen) return null;

  const otpValue = digits.join('');

  const handleDigitChange = (idx, rawVal) => {
    const clean = String(rawVal || '').replace(/\D/g, '');
    if (!clean) {
      const next = [...digits];
      next[idx] = '';
      setDigits(next);
      return;
    }
    if (clean.length > 1) {
      const chars = clean.slice(0, 6).split('');
      const next = ['', '', '', '', '', ''];
      chars.forEach((c, i) => {
        next[i] = c;
      });
      setDigits(next);
      const focusIdx = Math.min(chars.length, 5);
      if (inputRefs.current[focusIdx]) inputRefs.current[focusIdx].focus();
      return;
    }
    const next = [...digits];
    next[idx] = clean;
    setDigits(next);
    if (idx < 5 && inputRefs.current[idx + 1]) {
      inputRefs.current[idx + 1].focus();
    }
  };

  const handleKeyDown = (idx, e) => {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
      if (inputRefs.current[idx - 1]) inputRefs.current[idx - 1].focus();
    }
  };

  const handlePaste = (e) => {
    const pasted = (e.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, 6);
    if (pasted.length > 0) {
      e.preventDefault();
      const next = ['', '', '', '', '', ''];
      pasted.split('').forEach((c, i) => {
        next[i] = c;
      });
      setDigits(next);
      const focusIdx = Math.min(pasted.length, 5);
      if (inputRefs.current[focusIdx]) inputRefs.current[focusIdx].focus();
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || resending) return;
    setResending(true);
    setError('');
    setInfoMsg('');
    try {
      const res = await crmApi.sendWhatsAppOtp({
        phone,
        countryCode,
        purpose,
      });
      setCooldown(res.resendAfterSeconds || 60);
      setDigits(['', '', '', '', '', '']);
      setInfoMsg('A fresh 6-digit verification code has been sent to your WhatsApp.');
      if (inputRefs.current[0]) inputRefs.current[0].focus();
    } catch (err) {
      setError(err.message || 'Could not resend OTP. Please wait and try again.');
    } finally {
      setResending(false);
    }
  };

  const handleVerifySubmit = async (e) => {
    e.preventDefault();
    if (otpValue.length !== 6) {
      setError('Please enter the complete 6-digit WhatsApp verification code.');
      return;
    }
    if (purpose === 'password_reset' && newPassword.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }

    setVerifying(true);
    setError('');
    setInfoMsg('');

    try {
      const verifyRes = await crmApi.verifyWhatsAppOtp({
        phone,
        countryCode,
        otp: otpValue,
        purpose,
      });

      await onVerified({
        otpVerificationToken: verifyRes.otpVerificationToken,
        verifiedPhone: verifyRes.phone || phone,
        newPassword,
      });
    } catch (err) {
      setError(err.message || 'Invalid verification code. Please check WhatsApp and try again.');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(15, 23, 42, 0.72)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '450px',
          background: '#ffffff',
          borderRadius: '20px',
          padding: '28px 26px',
          boxShadow: '0 24px 60px rgba(15, 23, 42, 0.28)',
          border: '1px solid #e2e8f0',
          position: 'relative',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          disabled={verifying}
          aria-label="Close OTP Modal"
          style={{
            position: 'absolute',
            top: '18px',
            right: '18px',
            background: '#f1f5f9',
            border: 'none',
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            cursor: 'pointer',
            color: '#475569',
          }}
        >
          <X size={17} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '14px',
              background: '#dcfce7',
              color: '#15803d',
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
            }}
          >
            <MessageCircle size={24} />
          </div>
          <div>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '0.72rem',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: '#15803d',
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                padding: '2px 8px',
                borderRadius: '999px',
                marginBottom: '4px',
              }}
            >
              <CheckCircle2 size={12} /> Official WhatsApp Verification
            </span>
            <h3 style={{ margin: 0, fontSize: '1.22rem', fontWeight: 800, color: '#0f172a' }}>{title}</h3>
          </div>
        </div>

        <p style={{ margin: '0 0 18px', fontSize: '0.88rem', lineHeight: 1.55, color: '#475569' }}>
          {subtitle || (
            <>
              We sent a 6-digit verification code on WhatsApp to{' '}
              <strong style={{ color: '#0f172a' }}>{maskedPhone || phone}</strong>. Enter it below within 5 minutes.
            </>
          )}
        </p>

        {sandboxHint && (
          <div
            style={{
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              color: '#1e40af',
              padding: '9px 12px',
              borderRadius: '10px',
              fontSize: '0.8rem',
              fontWeight: 600,
              marginBottom: '14px',
            }}
          >
            Local Sandbox OTP: <strong>{sandboxHint}</strong>
          </div>
        )}

        {error && (
          <div
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#b91c1c',
              padding: '10px 13px',
              borderRadius: '10px',
              fontSize: '0.83rem',
              fontWeight: 600,
              marginBottom: '14px',
            }}
          >
            ⚠️ {error}
          </div>
        )}

        {infoMsg && (
          <div
            style={{
              background: '#ecfdf5',
              border: '1px solid #a7f3d0',
              color: '#065f46',
              padding: '10px 13px',
              borderRadius: '10px',
              fontSize: '0.83rem',
              fontWeight: 600,
              marginBottom: '14px',
            }}
          >
            ✓ {infoMsg}
          </div>
        )}

        <form onSubmit={handleVerifySubmit}>
          <div
            onPaste={handlePaste}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(6, 1fr)',
              gap: '8px',
              marginBottom: '18px',
            }}
          >
            {digits.map((digit, idx) => (
              <input
                key={idx}
                ref={(el) => {
                  inputRefs.current[idx] = el;
                }}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={digit}
                onChange={(e) => handleDigitChange(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                aria-label={`OTP Digit ${idx + 1}`}
                style={{
                  width: '100%',
                  height: '52px',
                  textAlign: 'center',
                  fontSize: '1.3rem',
                  fontWeight: 800,
                  color: '#0f172a',
                  background: digit ? '#f0fdf4' : '#f8fafc',
                  border: digit ? '2px solid #16a34a' : '1.5px solid #cbd5e1',
                  borderRadius: '12px',
                  outline: 'none',
                  transition: 'all 0.15s ease',
                }}
              />
            ))}
          </div>

          {purpose === 'password_reset' && (
            <div style={{ marginBottom: '18px' }}>
              <label
                htmlFor="otpResetNewPwd"
                style={{
                  display: 'block',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  color: '#334155',
                  marginBottom: '6px',
                }}
              >
                Create New Workspace Password (Min. 6 characters) *
              </label>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  border: '1.5px solid #cbd5e1',
                  borderRadius: '10px',
                  padding: '0 10px',
                  background: '#f8fafc',
                }}
              >
                <Lock size={16} color="#64748b" />
                <input
                  id="otpResetNewPwd"
                  type={showNewPwd ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new strong password"
                  style={{
                    flex: 1,
                    border: 'none',
                    background: 'transparent',
                    padding: '12px 10px',
                    fontSize: '0.92rem',
                    outline: 'none',
                    color: '#0f172a',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPwd(!showNewPwd)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'grid', placeItems: 'center' }}
                >
                  {showNewPwd ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={verifying || otpValue.length !== 6}
            style={{
              width: '100%',
              padding: '14px 18px',
              borderRadius: '12px',
              border: 'none',
              background: otpValue.length === 6 ? '#16a34a' : '#94a3b8',
              color: '#ffffff',
              fontSize: '0.96rem',
              fontWeight: 800,
              cursor: verifying || otpValue.length !== 6 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: otpValue.length === 6 ? '0 8px 20px rgba(22, 163, 74, 0.25)' : 'none',
            }}
          >
            <ShieldCheck size={18} />
            <span>
              {verifying
                ? 'Verifying Code...'
                : purpose === 'password_reset'
                ? 'Verify OTP & Reset Password'
                : 'Verify WhatsApp Code & Continue'}
            </span>
          </button>
        </form>

        <div
          style={{
            marginTop: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.82rem',
            color: '#64748b',
          }}
        >
          <span>Didn&apos;t receive the code on WhatsApp?</span>
          <button
            type="button"
            disabled={cooldown > 0 || resending}
            onClick={handleResend}
            style={{
              background: 'none',
              border: 'none',
              color: cooldown > 0 ? '#94a3b8' : '#16a34a',
              fontWeight: 700,
              cursor: cooldown > 0 || resending ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: 0,
            }}
          >
            <RefreshCw size={13} />
            <span>{resending ? 'Sending...' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend Code'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

