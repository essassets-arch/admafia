import mongoose from 'mongoose';

// 1. MASTER LEADS (INGESTION)
const MasterLeadSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  leadNumber: { type: String, required: true, unique: true, index: true },
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
  createdAt: { type: Date, default: Date.now, index: true }
}, {
  collection: 'master_leads',
  timestamps: true
});

export const MasterLead = mongoose.models.MasterLead || mongoose.model('MasterLead', MasterLeadSchema);

// 2. DISPATCHED CUSTOMER LEADS
const LeadSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  masterLeadId: { type: String, required: true, index: true },
  customerId: { type: String, required: true, index: true },
  fullName: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String, default: '' },
  category: { type: String, required: true, index: true },
  city: { type: String, default: '' },
  state: { type: String, default: '' },
  status: {
    type: String,
    enum: ['New', 'Contacted', 'Qualified', 'Proposal Sent', 'Won', 'Lost', 'Invalid', 'Interested', 'In Follow-up', 'Pending'],
    default: 'New',
    index: true
  },
  isRead: { type: Boolean, default: false, index: true },
  assignedAt: { type: Date, default: Date.now, index: true },
  lastContactedAt: { type: Date, default: null },
  notes: { type: String, default: '' },
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

LeadSchema.index({ customerId: 1, masterLeadId: 1 }, { unique: true });
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
  customerId: { type: String, required: true, index: true },
  assignedTo: { type: String, default: 'Sales Executive', index: true },
  taskType: { type: String, default: 'Call', index: true },
  title: { type: String, required: true },
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
  customerId: { type: String, required: true, index: true },
  ticketNumber: { type: String, required: true, unique: true, index: true },
  subject: { type: String, required: true },
  category: { type: String, default: 'Billing' },
  priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
  status: { type: String, enum: ['Open', 'In Progress', 'Resolved', 'Closed'], default: 'Open', index: true },
  assignedAgent: { type: String, default: null },
  messages: [{
    sender: { type: String, required: true },
    senderRole: { type: String, enum: ['customer', 'agent', 'system'], default: 'customer' },
    message: { type: String, required: true },
    attachments: [{ type: String }],
    createdAt: { type: Date, default: Date.now }
  }],
  resolvedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
}, {
  collection: 'support_queries',
  timestamps: true
});

export const SupportQuery = mongoose.models.SupportQuery || mongoose.model('SupportQuery', SupportQuerySchema);
