import mongoose from 'mongoose';

const SuperAdminAuditLogSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  action: { type: String, required: true, index: true },
  adminId: { type: String, required: true, index: true },
  adminEmail: { type: String },
  targetEntity: { type: String }, // e.g. 'Customer', 'Wallet', 'Campaign'
  targetId: { type: String, index: true },
  details: { type: mongoose.Schema.Types.Mixed },
  ipAddress: { type: String },
  userAgent: { type: String },
  timestamp: { type: Date, default: Date.now, index: true }
}, {
  collection: 'superadmin_audit_logs',
  timestamps: false
});

const MarketingAuditEventSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  customerId: { type: String, required: true, index: true },
  eventType: { type: String, required: true, index: true },
  postId: { type: String, index: true },
  campaignId: { type: String, index: true },
  payload: { type: mongoose.Schema.Types.Mixed },
  timestamp: { type: Date, default: Date.now, index: true }
}, {
  collection: 'marketing_audit_events',
  timestamps: false
});

export const SuperAdminAuditLog = mongoose.models.SuperAdminAuditLog || mongoose.model('SuperAdminAuditLog', SuperAdminAuditLogSchema);
export const MarketingAuditEvent = mongoose.models.MarketingAuditEvent || mongoose.model('MarketingAuditEvent', MarketingAuditEventSchema);
