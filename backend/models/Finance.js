import mongoose from 'mongoose';

// 1. WALLET
const WalletSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  customerId: { type: String, required: true, unique: true, index: true },
  availableBalance: { type: Number, required: true, default: 0, min: 0 },
  currency: { type: String, required: true, default: 'INR' },
  dailyAdSpend: { type: Number, required: true, default: 300, min: 0 },
  totalLifetimePaid: { type: Number, required: true, default: 0, min: 0 },
  totalAdSpent: { type: Number, required: true, default: 0, min: 0 },
  adCampaignActive: { type: Boolean, default: false, index: true },
  activeDays: [{ type: String }],
  schedulePreset: { type: String, default: 'custom' },
  lastDeductedAt: { type: Date, default: null },
  bookedDates: [{ type: String }],
  marketingCode: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  collection: 'wallets',
  timestamps: true
});

export const Wallet = mongoose.models.Wallet || mongoose.model('Wallet', WalletSchema);

// 2. WALLET TRANSACTION (IMMUTABLE LEDGER)
const WalletTransactionSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  customerId: { type: String, required: true, index: true },
  walletId: { type: String, default: '', index: true },
  txType: { type: String, enum: ['Credit', 'Debit'], required: true, index: true },
  amount: { type: Number, required: true, min: 0 },
  balanceAfter: { type: Number, required: true, min: 0 },
  referenceUtr: { type: String, required: true }, // Bank UTR or Payment ID (Idempotency Key)
  description: { type: String, required: true },
  paymentMethod: { type: String, default: 'Razorpay Secure (UPI/Card)' },
  status: { type: String, default: 'Verified ✓' },
  currency: { type: String, default: 'INR' },
  createdAt: { type: Date, default: Date.now, index: true }
}, {
  collection: 'wallet_transactions',
  timestamps: { createdAt: 'createdAt', updatedAt: false }
});

WalletTransactionSchema.index({ referenceUtr: 1 }, { unique: true, sparse: true });
WalletTransactionSchema.index({ customerId: 1, txType: 1 });
WalletTransactionSchema.index({ customerId: 1, createdAt: -1 });
WalletTransactionSchema.index({ status: 1, createdAt: -1 });

export const WalletTransaction = mongoose.models.WalletTransaction || mongoose.model('WalletTransaction', WalletTransactionSchema);

// 3. PAYMENT RECORD
const PaymentRecordSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  customerId: { type: String, required: true, index: true },
  walletId: { type: String, default: null },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  paymentMethod: { type: String, default: 'Razorpay' },
  gatewayOrderId: { type: String, default: null, index: true },
  gatewayPaymentId: { type: String, default: null, index: true },
  gatewaySignature: { type: String, default: null },
  referenceUtr: { type: String, default: null, index: true },
  receiptNumber: { type: String, default: null },
  notes: { type: String, default: '' },
  // Legacy payment_records columns (additive; used by sales desk payment listings)
  companyName: { type: String, default: '' },
  contactPerson: { type: String, default: '' },
  phone: { type: String, default: '' },
  city: { type: String, default: '' },
  txType: { type: String, default: 'topup' },
  gstAmount: { type: Number, default: 0 },
  totalAmount: { type: Number, default: null },
  daysOverdue: { type: Number, default: 0 },
  status: { type: String, default: 'Verified ✓', index: true },
  createdAt: { type: Date, default: Date.now, index: true }
}, {
  collection: 'payment_records',
  timestamps: true
});

PaymentRecordSchema.index({ status: 1, createdAt: -1 });
PaymentRecordSchema.index({ customerId: 1, createdAt: -1 });

export const PaymentRecord = mongoose.models.PaymentRecord || mongoose.model('PaymentRecord', PaymentRecordSchema);

// 4. TAX INVOICE (GST COMPLIANT)
const TaxInvoiceSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  customerId: { type: String, required: true, index: true },
  paymentRecordId: { type: String, default: null, index: true },
  invoiceNumber: { type: String, required: true, unique: true, index: true },
  particulars: { type: String, default: 'Lead Generation & Growth Wallet Credit' },
  paymentMode: { type: String, default: '' },
  status: { type: String, default: 'Paid' },
  invoiceDate: { type: Date, default: Date.now },
  sacCode: { type: String, default: '998311' },
  baseAmount: { type: Number, required: true },
  cgstAmount: { type: Number, default: 0 },
  sgstAmount: { type: Number, default: 0 },
  igstAmount: { type: Number, default: 0 },
  totalAmount: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  pdfUrl: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
}, {
  collection: 'tax_invoices',
  timestamps: true
});

export const TaxInvoice = mongoose.models.TaxInvoice || mongoose.model('TaxInvoice', TaxInvoiceSchema);

// 5. REFUND REQUEST
const RefundRequestSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  customerId: { type: String, required: true, index: true },
  walletId: { type: String, default: '' },
  amount: { type: Number, required: true },
  reason: { type: String, required: true },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'processed',
      'Pending', 'Under Review', 'Approved', 'Rejected', 'Processing', 'Completed', 'Failed'],
    default: 'Pending',
    index: true
  },
  reviewedBy: { type: String, default: null },
  reviewedAt: { type: Date, default: null },
  payoutUtr: { type: String, default: null },
  // Legacy refund_requests columns (additive)
  originalTxRef: { type: String, default: '' },
  supportingInfo: { type: String, default: '' },
  rejectionReason: { type: String, default: null },
  reviewNotes: { type: String, default: null },
  providerRef: { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
}, {
  collection: 'refund_requests',
  timestamps: true
});

export const RefundRequest = mongoose.models.RefundRequest || mongoose.model('RefundRequest', RefundRequestSchema);

// 6. TOPUP REQUEST (OFFLINE BANK TRANSFERS)
const TopupRequestSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  customerId: { type: String, required: true, index: true },
  walletId: { type: String, default: '' },
  amount: { type: Number, required: true },
  referenceUtr: { type: String, required: true },
  proofUrl: { type: String, default: '' },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'Pending', 'Approved', 'Rejected', 'Processing'],
    default: 'Pending',
    index: true
  },
  approvedBy: { type: String, default: null },
  approvedAt: { type: Date, default: null },
  // Legacy topup_requests columns (additive)
  paymentMethod: { type: String, default: 'Razorpay Secure (UPI/Card)' },
  evidenceUrl: { type: String, default: '' },
  notes: { type: String, default: '' },
  processedBy: { type: String, default: null },
  processedAt: { type: Date, default: null },
  rejectionReason: { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
}, {
  collection: 'topup_requests',
  timestamps: true
});

// UTR idempotency guard (legacy SQL: reference_utr UNIQUE)
TopupRequestSchema.index({ referenceUtr: 1 }, { unique: true });

export const TopupRequest = mongoose.models.TopupRequest || mongoose.model('TopupRequest', TopupRequestSchema);

// 7. DELETED/FAILED TRANSACTION AUDIT
const DeletedFailedTransactionSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  originalTxId: { type: String },
  customerId: { type: String, index: true },
  referenceUtr: { type: String },
  amount: { type: Number },
  reason: { type: String },
  purgedBy: { type: String },
  purgedAt: { type: Date, default: Date.now },
  // Legacy deleted_failed_transactions columns (additive; as mapped by the PG->Mongo migration)
  originalId: { type: String, default: null },
  customerName: { type: String, default: '' },
  companyName: { type: String, default: '' },
  contactPerson: { type: String, default: '' },
  phone: { type: String, default: '' },
  email: { type: String, default: '' },
  city: { type: String, default: '' },
  state: { type: String, default: '' },
  category: { type: String, default: '' },
  description: { type: String, default: '' },
  paymentMethod: { type: String, default: '' },
  failureReason: { type: String, default: '' },
  originalCreatedAt: { type: Date, default: null },
  deletedAt: { type: Date, default: Date.now },
  deletedBy: { type: String, default: 'Sales Admin' }
}, {
  collection: 'deleted_failed_transactions',
  timestamps: true
});

export const DeletedFailedTransaction = mongoose.models.DeletedFailedTransaction || mongoose.model('DeletedFailedTransaction', DeletedFailedTransactionSchema);
