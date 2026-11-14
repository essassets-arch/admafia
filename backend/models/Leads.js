import mongoose from 'mongoose';

// 1. MASTER LEADS (INGESTION)
const MasterLeadSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  leadNumber: { type: String, required: true, unique: true, index: true, default: function () { return this?._id ? `ML-${this._id}` : `ML-${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; } },
  fullName: { type: String, required: true },
  phone: { type: String, required: true, index: true },
  email: { type: String, default: '' },
  category: { type: String, required: true, index: true },
  subCategory: { type: String, default: '' },
  city: { type: String, default: '' },
  state: { type: String, default: '' },
  country: { type: String, default: 'India' },
  source: { type: String, default: 'Meta Ads' },
  requirement: { type: String, default: '' },
  budget: { type: String, default: '' },
  status: { type: String, default: 'Unassigned', index: true },
  totalDispatched: { type: Number, default: 0 },
  // Legacy master_leads columns (additive)
  title: { type: String, default: '' },
  description: { type: String, default: '' },
  groupId: { type: String, default: null, index: true },
  priority: { type: String, default: 'Urgent' },
  location: { type: String, default: '' },
  deadlineDate: { type: Date, default: null },
  createdBy: { type: String, default: 'Admin Operations' },
  createdAt: { type: Date, default: Date.now, index: true }
}, {
  collection: 'master_leads',
  timestamps: true
});

export const MasterLead = mongoose.models.MasterLead || mongoose.model('MasterLead', MasterLeadSchema);

// 2. DISPATCHED CUSTOMER LEADS
const LeadSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  masterLeadId: { type: String, default: null, index: true },
  customerId: { type: String, required: true, index: true },
  fullName: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String, default: '' },
  category: { type: String, required: true, index: true },
  city: { type: String, default: '' },
  state: { type: String, default: '' },
  // Free-form: SQL leads.status was VARCHAR (uses lowercase 'new', 'Callback', 'Converted', 'Dropped', 'Not Interested', etc.)
  status: {
    type: String,
    default: 'new',
    index: true
  },
  isRead: { type: Boolean, default: false, index: true },
  assignedAt: { type: Date, default: Date.now, index: true },
  lastContactedAt: { type: Date, default: null },
  notes: { type: String, default: '' },
  // Legacy leads columns (additive)
  displayPhone: { type: String, default: '' },
  requirement: { type: String, default: '' },
  budget: { type: String, default: '' },
  source: { type: String, default: '' },
  priority: { type: String, default: '' },
  isHot: { type: Boolean, default: true },
  customerPhone: { type: String, default: '' },
  customerUsername: { type: String, default: '' },
  companyName: { type: String, default: '' },
  followups: [{
    note: { type: String, required: true },
    stage: { type: String, default: 'Contacted' },
    createdBy: { type: String, default: 'Sales' },
    createdAt: { type: Date, default: Date.now }
  }],
  updatedAt: { type: Date, default: Date.now }
}, {
  collection: 'leads',
  timestamps: { createdAt: 'assignedAt', updatedAt: 'updatedAt' }
});

LeadSchema.index({ customerId: 1, masterLeadId: 1 });
LeadSchema.index({ customerId: 1, status: 1 });

export const Lead = mongoose.models.Lead || mongoose.model('Lead', LeadSchema);

// 3. LEAD ASSIGNMENT AUDIT
const LeadAssignmentSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  masterLeadId: { type: String, required: true, index: true },
  customerId: { type: String, required: true, index: true },
  customerLeadId: { type: String, default: null },
  groupId: { type: String, default: null },
  status: { type: String, default: 'Assigned' },
  responseStatus: { type: String, default: 'Pending' },
  responseNotes: { type: String, default: '' },
  isRead: { type: Boolean, default: false },
  notificationStatus: { type: String, default: 'Delivered' },
  respondedAt: { type: Date, default: null },
  assignedAt: { type: Date, default: Date.now, index: true }
}, {
  collection: 'lead_assignments',
  timestamps: { createdAt: 'assignedAt', updatedAt: false }
});

LeadAssignmentSchema.index({ masterLeadId: 1, customerId: 1 }, { unique: true });

export const LeadAssignment = mongoose.models.LeadAssignment || mongoose.model('LeadAssignment', LeadAssignmentSchema);

// 4. SALES TASKS
const SalesTaskSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  customerId: { type: String, default: null, index: true },
  assignedTo: { type: String, default: 'Sales Executive', index: true },
  taskType: { type: String, default: 'Call', index: true },
  // Legacy sales_tasks columns (additive)
  companyName: { type: String, default: '' },
  contactPerson: { type: String, default: '' },
  phone: { type: String, default: '' },
  priority: { type: String, default: 'High' },
  dueStatus: { type: String, default: 'today' },
  dueTime: { type: String, default: '' },
  title: { type: String, default: '' },
  notes: { type: String, default: '' },
  dueAt: { type: Date, default: null },
  status: { type: String, enum: ['pending', 'in_progress', 'completed', 'cancelled'], default: 'pending', index: true },
  completedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
}, {
  collection: 'sales_tasks',
  timestamps: true
});

export const SalesTask = mongoose.models.SalesTask || mongoose.model('SalesTask', SalesTaskSchema);

// 5. SUPPORT QUERIES & TICKETS
const SupportQuerySchema = new mongoose.Schema({
  _id: { type: String, required: true },
  customerId: { type: String, default: null, index: true }, // SQL customer_id was nullable (admin-created "Direct Business Enquiry")
  ticketNumber: { type: String, required: true, unique: true, index: true, default: function () { return this?._id ? `TKT-${this._id}` : `TKT-${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; } },
  subject: { type: String, required: true },
  category: { type: String, default: 'Billing' },
  // priority / status: free-form (SQL VARCHAR, no CHECK). Sales desk uses 'Open'/'In Progress'/'Resolved'/'Closed',
  // super admin desk uses lowercase 'open'/'pending'/'resolved' and priority 'normal'.
  priority: { type: String, default: 'medium' },
  status: { type: String, default: 'Open', index: true },
  assignedAgent: { type: String, default: null },
  // Legacy support_queries columns (additive)
  companyName: { type: String, default: '' },
  contactName: { type: String, default: '' },
  contactEmail: { type: String, default: '' },
  contactPhone: { type: String, default: '' },
  internalNotes: { type: String, default: '' },
  lastRepliedAt: { type: Date, default: null },
  lastRepliedBy: { type: String, default: '' },
  slaBreached: { type: Boolean, default: false },
  hoursOpen: { type: Number, default: 0 },
  messages: [{
    sender: { type: String, required: true },
    senderRole: { type: String, enum: ['customer', 'agent', 'system'], default: 'customer' },
    message: { type: String, required: true },
    attachments: [{ type: String }],
    // support_query_messages legacy columns (additive)
    messageId: { type: String, default: null },
    senderType: { type: String, default: null }, // 'admin' | 'internal_note' | 'customer' | 'system'
    isInternalNote: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
  }],
  resolvedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
}, {
  collection: 'support_queries',
  timestamps: true
});

export const SupportQuery = mongoose.models.SupportQuery || mongoose.model('SupportQuery', SupportQuerySchema);
