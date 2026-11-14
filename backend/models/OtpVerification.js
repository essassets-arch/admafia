import mongoose from 'mongoose';

const OtpVerificationSchema = new mongoose.Schema({
  phone: { type: String, required: true, index: true }, // Normalized subscriber digits (10 digits for IN, 7-15 intl)
  e164Phone: { type: String, required: true, index: true }, // Meta Cloud API recipient digits (e.g. 919876543210)
  countryCode: { type: String, default: 'IN' },
  purpose: {
    type: String,
    enum: ['register', 'password_reset', 'verify_phone'],
    default: 'register',
    index: true,
  },
  otpHash: { type: String, required: true }, // HMAC-SHA256(secret, phone:purpose:otp) — NEVER plaintext
  attempts: { type: Number, default: 0 }, // Locked after 5 failed attempts
  verified: { type: Boolean, default: false, index: true },
  verifiedAt: { type: Date, default: null },
  verificationTokenHash: { type: String, default: null, index: true }, // Single-use registration/reset proof
  tokenConsumed: { type: Boolean, default: false },
  tokenExpiresAt: { type: Date, default: null },
  wamid: { type: String, default: null },
  ipAddress: { type: String, default: '' },
  expiresAt: { type: Date, required: true },
}, {
  collection: 'otp_verifications',
  timestamps: true,
});

// MongoDB native TTL index automatically purges expired OTP challenges
OtpVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
OtpVerificationSchema.index({ phone: 1, purpose: 1, createdAt: -1 });

export const OtpVerification =
  mongoose.models.OtpVerification || mongoose.model('OtpVerification', OtpVerificationSchema);
export default OtpVerification;

