import mongoose from 'mongoose';

const CustomerSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // Preserves original customer ID (e.g. cust_179464...)
  username: { type: String, required: true, unique: true, index: true },
  phone: { type: String, required: true, unique: true, index: true },
  email: { type: String, default: '', index: true },
  personalEmail: { type: String, default: '' },
  passwordHash: { type: String, required: true, default: 'Client@2026' },

  // Business Information
  companyName: { type: String, required: true },
  category: { type: String, default: 'IT & Software', index: true },
  industry: { type: String, default: 'Other' },
  website: { type: String, default: '' },
  contactPerson: { type: String, required: true },

  // Headquarter & Localization
  city: { type: String, default: '' },
  state: { type: String, default: 'Maharashtra' },
  country: { type: String, default: 'India' },
  countryCode: { type: String, default: 'IN' },
  currency: { type: String, default: 'INR' },

  // Group Memberships
  groupId: { type: String, default: null, index: true },
  groupMemberships: [{
    groupId: { type: String, required: true },
    assignedAt: { type: Date, default: Date.now }
  }],

  // Operational Flags
  status: {
    type: String,
    enum: ['active', 'suspended', 'inactive'],
    default: 'active',
    index: true
  },
  profileStatus: {
    type: String,
    enum: ['incomplete', 'complete'],
    default: 'complete',
    index: true
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid'],
    default: 'pending',
    index: true
  },
  kycPercent: { type: Number, min: 0, max: 100, default: 100 },
  verified: { type: Boolean, default: true },
  isSelfRegistered: { type: Boolean, default: true },
  registeredFrom: { type: String, default: 'http://localhost:5173/#register' },

  // Suspension & Status Audit History
  statusHistory: [{
    oldStatus: String,
    newStatus: String,
    reason: String,
    changedBy: String,
    changedAt: { type: Date, default: Date.now }
  }],

  marketingCode: { type: String, default: null },

  registeredAt: { type: Date, default: Date.now, index: true },
  completedAt: { type: Date, default: null },
  updatedAt: { type: Date, default: Date.now }
}, {
  collection: 'customers',
  timestamps: { createdAt: 'registeredAt', updatedAt: 'updatedAt' }
});

CustomerSchema.index({ phone: 1, status: 1 });
CustomerSchema.index({ category: 1, status: 1 });

export const Customer = mongoose.models.Customer || mongoose.model('Customer', CustomerSchema);
export default Customer;
