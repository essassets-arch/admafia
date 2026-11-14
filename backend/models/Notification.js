import mongoose from 'mongoose';

const NotificationSchema = new mongoose.Schema({
  recipientType: {
    type: String,
    enum: ['customer', 'staff', 'broadcast_staff'],
    required: true,
    index: true,
  },
  recipientId: { type: String, required: true, index: true }, // customer._id or systemUser._id or department name
  department: { type: String, default: '' },
  type: {
    type: String,
    default: 'SYSTEM_ALERT',
    index: true,
  },
  title: { type: String, required: true },
  body: { type: String, required: true },
  deepLink: { type: String, default: '/portal' },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  isRead: { type: Boolean, default: false, index: true },
  readAt: { type: Date, default: null },
  fcmDispatched: { type: Boolean, default: false },
  fcmSentCount: { type: Number, default: 0 },
}, {
  collection: 'notifications',
  timestamps: true,
});

NotificationSchema.index({ recipientType: 1, recipientId: 1, isRead: 1, createdAt: -1 });
// Automatically purge notification history older than 90 days
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

const FcmTokenSchema = new mongoose.Schema({
  ownerType: { type: String, enum: ['customer', 'staff'], required: true, index: true },
  ownerId: { type: String, required: true, index: true },
  department: { type: String, default: '' },
  token: { type: String, required: true, unique: true },
  userAgent: { type: String, default: '' },
  platform: { type: String, default: 'web' },
  isActive: { type: Boolean, default: true, index: true },
  lastSeenAt: { type: Date, default: Date.now },
}, {
  collection: 'fcm_tokens',
  timestamps: true,
});

FcmTokenSchema.index({ ownerType: 1, ownerId: 1, isActive: 1 });

export const Notification =
  mongoose.models.Notification || mongoose.model('Notification', NotificationSchema);
export const FcmToken =
  mongoose.models.FcmToken || mongoose.model('FcmToken', FcmTokenSchema);
export default Notification;

