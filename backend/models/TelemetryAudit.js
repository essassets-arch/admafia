import mongoose from 'mongoose';

const SuperAdminAuditLogSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  action: { type: String, index: true },
  adminId: { type: String, index: true },
  adminEmail: { type: String },
  targetEntity: { type: String }, // e.g. 'Customer', 'Wallet', 'Campaign'
  targetId: { type: String, index: true },
  details: { type: mongoose.Schema.Types.Mixed },
  ipAddress: { type: String },
  userAgent: { type: String },
  timestamp: { type: Date, default: Date.now, index: true },
  // --- legacy SQL superadmin_audit_logs columns (additive; migration script uses these names) ---
  actorId: { type: String, index: true },
  actorName: { type: String },
  actorRole: { type: String, default: 'Super Admin' },
  actionType: { type: String, index: true },
  targetType: { type: String, index: true },
  reason: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now, index: true }
}, {
  collection: 'superadmin_audit_logs',
  timestamps: false
});

const MarketingAuditEventSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  customerId: { type: String, default: null, index: true },
  eventType: { type: String, default: null, index: true },
  postId: { type: String, index: true },
  campaignId: { type: String, index: true },
  payload: { type: mongoose.Schema.Types.Mixed },
  timestamp: { type: Date, default: Date.now, index: true },
  // --- legacy SQL marketing_audit_events columns (additive) ---
  entityType: { type: String, index: true },
  entityId: { type: String, index: true },
  action: { type: String },
  actor: { type: String },
  details: { type: mongoose.Schema.Types.Mixed },
  ipAddress: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now, index: true }
}, {
  collection: 'marketing_audit_events',
  timestamps: false
});

export const SuperAdminAuditLog = mongoose.models.SuperAdminAuditLog || mongoose.model('SuperAdminAuditLog', SuperAdminAuditLogSchema);
export const MarketingAuditEvent = mongoose.models.MarketingAuditEvent || mongoose.model('MarketingAuditEvent', MarketingAuditEventSchema);
