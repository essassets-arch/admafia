import mongoose from 'mongoose';

// PENDING VERIFICATIONS QUEUE (Sales Desk 02) - replaces PostgreSQL `pending_verifications`
const PendingVerificationSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  customerId: { type: String, required: true, unique: true, index: true },
  companyName: { type: String, default: '' },
  contactPerson: { type: String, default: '' },
  phone: { type: String, default: '' },
  packageTier: { type: String, default: 'Self-Registered (Wallet Top-Up)' },
  amount: { type: Number, default: 0 },
  dailyRate: { type: Number, default: 300 },
  utrNumber: { type: String, default: 'Awaiting Payment' },
  paymentStatus: { type: String, default: 'pending' }, // pending | verified | paid
  profileStatus: { type: String, default: 'complete' }, // incomplete | complete
  queueType: { type: String, default: 'Payment Pending', index: true },
  submittedAt: { type: Date, default: Date.now, index: true },
  verifiedAt: { type: Date, default: null }
}, {
  collection: 'pending_verifications',
  timestamps: false
});

export const PendingVerification = mongoose.models.PendingVerification || mongoose.model('PendingVerification', PendingVerificationSchema);
export default PendingVerification;
