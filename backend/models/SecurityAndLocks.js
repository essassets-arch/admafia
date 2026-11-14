import mongoose from 'mongoose';

const CronLockSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // jobName (e.g. 'daily_ad_spend_pacing')
  holderId: { type: String, required: true },
  lockedAt: { type: Date, default: Date.now },
  lockedUntil: { type: Date, required: true, index: true },
}, {
  collection: 'cron_locks',
  timestamps: false,
});

const SecurityEventLogSchema = new mongoose.Schema({
  category: {
    type: String,
    enum: ['RATE_LIMIT', 'AUTH_FAILURE', 'OTP_LOCKOUT', 'NOSQL_SANITIZED', 'CORS_BLOCKED', 'UPLOAD_REJECTED', 'RBAC_DENIED'],
    required: true,
    index: true,
  },
  ipAddress: { type: String, default: '', index: true },
  path: { type: String, default: '' },
  method: { type: String, default: '' },
  actorId: { type: String, default: null },
  detail: { type: String, default: '' },
}, {
  collection: 'security_event_logs',
  timestamps: true,
});

SecurityEventLogSchema.index({ createdAt: -1, category: 1 });
SecurityEventLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export const CronLock = mongoose.models.CronLock || mongoose.model('CronLock', CronLockSchema);
export const SecurityEventLog =
  mongoose.models.SecurityEventLog || mongoose.model('SecurityEventLog', SecurityEventLogSchema);
export default CronLock;

