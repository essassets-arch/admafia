import mongoose from 'mongoose';

const OtpDeliveryLogSchema = new mongoose.Schema({
  phoneMasked: { type: String, required: true, index: true }, // e.g. 9198****3210
  countryCode: { type: String, default: 'IN', index: true },
  purpose: {
    type: String,
    enum: ['register', 'password_reset', 'verify_phone'],
    default: 'register',
    index: true,
  },
  provider: { type: String, default: 'meta_whatsapp_cloud_v26' },
  templateName: { type: String, default: 'authentication' },
  wamid: { type: String, default: null, index: true },
  httpStatus: { type: Number, default: 200 },
  latencyMs: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['accepted', 'sent', 'delivered', 'read', 'failed', 'sandbox'],
    default: 'accepted',
    index: true,
  },
  errorMessage: { type: String, default: null },
  ipAddress: { type: String, default: '' },
}, {
  collection: 'otp_delivery_logs',
  timestamps: true,
});

OtpDeliveryLogSchema.index({ createdAt: -1, status: 1 });
// Retain delivery telemetry for 90 days
OtpDeliveryLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const OtpDeliveryLog =
  mongoose.models.OtpDeliveryLog || mongoose.model('OtpDeliveryLog', OtpDeliveryLogSchema);
export default OtpDeliveryLog;

