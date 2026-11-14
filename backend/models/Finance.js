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
  walletId: { type: String, required: true, index: true },
  txType: { type: String, enum: ['Credit', 'Debit'], required: true, index: true },
  amount: { type: Number, required: true, min: 0.01 },
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
  status: { type: String, default: 'Verified ✓', index: true },
  createdAt: { type: Date, default: Date.now, index: true }
}, {
  collection: 'payment_records',
  timestamps: true
});

export const PaymentRecord = mongoose.models.PaymentRecord || mongoose.model('PaymentRecord', PaymentRecordSchema);

// 4. TAX INVOICE (GST COMPLIANT)
const TaxInvoiceSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  customerId: { type: String, required: true, index: true },
  paymentRecordId: { type: String, default: null, index: true },
  invoiceNumber: { type: String, required: true, unique: true, index: true },
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
  walletId: { type: String, required: true },
  amount: { type: Number, required: true },
  reason: { type: String, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'processed'], default: 'pending', index: true },
  reviewedBy: { type: String, default: null },
  reviewedAt: { type: Date, default: null },
  payoutUtr: { type: String, default: null },
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
  walletId: { type: String, required: true },
  amount: { type: Number, required: true },
  referenceUtr: { type: String, required: true },
  proofUrl: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  approvedBy: { type: String, default: null },
  approvedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
}, {
  collection: 'topup_requests',
  timestamps: true
});

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
  purgedAt: { type: Date, default: Date.now }
}, {
  collection: 'deleted_failed_transactions',
  timestamps: true
});

export const DeletedFailedTransaction = mongoose.models.DeletedFailedTransaction || mongoose.model('DeletedFailedTransaction', DeletedFailedTransactionSchema);
