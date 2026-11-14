import mongoose from 'mongoose';

// 1. MARKETING CAMPAIGNS (BUDGET & PACING LEDGER)
const MarketingCampaignSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  customerId: { type: String, required: true, index: true },
  postId: { type: String, default: null, index: true },
  campaignName: { type: String, required: true },
  objective: { type: String, default: 'lead_generation' },
  platform: { type: String, default: 'Meta Ads' },
  targetAudience: { type: String, default: '' },
  dailyBudget: { type: Number, required: true, default: 300 },
  totalSpend: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['Draft', 'Active', 'Paused', 'Stopped', 'Completed'],
    default: 'Active',
    index: true
  },
  activeDays: [{ type: String }],
  startDate: { type: Date, default: Date.now },
  endDate: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  collection: 'marketing_campaigns',
  timestamps: true
});

export const MarketingCampaign = mongoose.models.MarketingCampaign || mongoose.model('MarketingCampaign', MarketingCampaignSchema);

// 2. COUNTRY PRICING (AUTHORITATIVE TWO-RULE LOCALIZATION)
const CountryPricingSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // country_code (e.g. 'IN', 'US', 'AE')
  countryCode: { type: String, required: true, unique: true, index: true },
  countryName: { type: String, required: true },
  currencyCode: { type: String, required: true, default: 'INR' },
  currencySymbol: { type: String, required: true, default: '₹' },
  currencyPosition: { type: String, default: 'before' },
  decimalPrecision: { type: Number, default: 0 },
  dailyMinBudget: { type: Number, required: true, default: 300 },
  monthlyBudget: { type: Number, required: true, default: 9000 },
  minWalletTopup: { type: Number, required: true, default: 300 },
  taxName: { type: String, default: 'GST' },
  taxRate: { type: Number, default: 18 },
  paymentGateway: { type: String, default: 'razorpay' },
  phoneCode: { type: String, default: '+91' },
  flagEmoji: { type: String, default: '🇮🇳' },
  isActive: { type: Boolean, default: true, index: true },
  isDefault: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  collection: 'country_pricing',
  timestamps: true
});

export const CountryPricing = mongoose.models.CountryPricing || mongoose.model('CountryPricing', CountryPricingSchema);

// 3. COUNTRY PRICING AUDIT LOG
const CountryPricingAuditLogSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  countryCode: { type: String, required: true, index: true },
  countryName: { type: String, required: true },
  oldPricing: { type: mongoose.Schema.Types.Mixed },
  newPricing: { type: mongoose.Schema.Types.Mixed },
  changedBy: { type: String, default: 'Super Admin' },
  changeReason: { type: String, default: '' },
  effectiveDate: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now, index: true }
}, {
  collection: 'country_pricing_audit_logs',
  timestamps: { createdAt: 'createdAt', updatedAt: false }
});

export const CountryPricingAuditLog = mongoose.models.CountryPricingAuditLog || mongoose.model('CountryPricingAuditLog', CountryPricingAuditLogSchema);

// 4. MONGODB-NATIVE TRANSACTIONAL OUTBOX
const OutboxEventSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  aggregateType: { type: String, required: true, index: true }, // e.g. 'wallet', 'payment', 'marketing_post'
  aggregateId: { type: String, required: true, index: true },
  eventType: { type: String, required: true, index: true },
  payload: { type: mongoose.Schema.Types.Mixed, required: true },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending',
    index: true
  },
  retryCount: { type: Number, default: 0 },
  lastError: { type: String, default: null },
  createdAt: { type: Date, default: Date.now, index: true },
  processedAt: { type: Date, default: null }
}, {
  collection: 'outbox_events',
  timestamps: { createdAt: 'createdAt', updatedAt: false }
});

OutboxEventSchema.index({ status: 1, createdAt: 1 });

export const OutboxEvent = mongoose.models.OutboxEvent || mongoose.model('OutboxEvent', OutboxEventSchema);
