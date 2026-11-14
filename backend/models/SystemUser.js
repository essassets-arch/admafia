import mongoose from 'mongoose';

const CustomerGroupSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  name: { type: String, required: true, unique: true, index: true },
  category: { type: String, default: 'Other', index: true },
  icon: { type: String, default: '🏢' },
  description: { type: String, default: '' },
  status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
  members: [{ type: String, index: true }], // array of customer IDs
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  collection: 'customer_groups',
  timestamps: true
});

export const CustomerGroup = mongoose.models.CustomerGroup || mongoose.model('CustomerGroup', CustomerGroupSchema);

const SystemUserSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  customerId: { type: String, default: null, index: true },
  fullName: { type: String, required: true },
  email: { type: String, required: true, unique: true, index: true },
  username: { type: String, required: true, unique: true, index: true },
  phone: { type: String, default: '', index: true },
  passwordHash: { type: String, required: true },
  role: {
    type: String,
    // Free-form: legacy SQL role was VARCHAR(60) with no CHECK (UI creates e.g. 'Support Agent', 'Finance Auditor').
    // Short codes ('superadmin','sales',...) and legacy display roles ('Super Admin', ...) are all valid.
    default: 'sales',
    index: true
  },
  department: { type: String, default: '' },
  createdBy: { type: String, default: '' },
  permissions: [{ type: String }],
  status: { type: String, enum: ['active', 'inactive', 'suspended'], default: 'active', index: true },
  lastLoginAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  collection: 'system_users',
  timestamps: true
});

export const SystemUser = mongoose.models.SystemUser || mongoose.model('SystemUser', SystemUserSchema);
