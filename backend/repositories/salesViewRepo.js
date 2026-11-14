import {
  Customer,
  CustomerGroup,
  SystemUser,
  Wallet,
  WalletTransaction,
  PaymentRecord,
  TaxInvoice,
  DeletedFailedTransaction,
  MasterLead,
  Lead,
  LeadAssignment,
  SalesTask,
  SupportQuery,
  PendingVerification,
} from '../models/index.js';

/**
 * Mongo read-side adapters for the CRM server.
 *
 * The legacy API mappers in server.js (mapCustomerRow, mapLeadRow, mapWalletTxRow, ...) consume
 * snake_case "rows" as returned by PostgreSQL (incl. the vw_sales_customer_accounts view).
 * These helpers load Mongo documents and convert them into exactly that row shape so the HTTP
 * response shape stays identical.
 */

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
export function escapeRegex(value) {
  return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Case-insensitive exact-match RegExp with user input escaped (replaces LOWER(col) = LOWER($1)). */
export function ciExact(value) {
  return new RegExp(`^${escapeRegex(value)}$`, 'i');
}

export function last10Digits(value) {
  return String(value ?? '').replace(/\D/g, '').slice(-10);
}

function joinList(value) {
  if (Array.isArray(value)) return value.join(',');
  return value ? String(value) : '';
}

const num = (v, d = 0) => (v === undefined || v === null || Number.isNaN(Number(v)) ? d : Number(v));

// ---------------------------------------------------------------------------
// Customers (vw_sales_customer_accounts equivalent)
// ---------------------------------------------------------------------------
export function buildCustomerViewRow(c, w, leadCount = 0) {
  if (!c) return null;
  const currency = w?.currency || c.currency || 'INR';
  const dailyPacing = num(w?.dailyAdSpend, currency === 'INR' ? 300 : 10);
  const balance = num(w?.availableBalance, 0);
  return {
    id: c._id,
    username: c.username,
    name: c.companyName,
    company_name: c.companyName,
    contact: c.contactPerson,
    contact_person: c.contactPerson,
    phone: c.phone,
    email: c.email,
    personal_email: c.personalEmail,
    category: c.category,
    industry: c.industry,
    website: c.website,
    city: c.city,
    state: c.state,
    country: c.country,
    country_code: c.countryCode || 'IN',
    currency,
    status: c.status,
    profile_status: c.profileStatus,
    payment_status: c.paymentStatus,
    kyc_percent: c.kycPercent,
    verified: c.verified,
    registered_from: c.registeredFrom,
    registered_at: c.registeredAt,
    completed_at: c.completedAt ?? null,
    balance,
    wallet_balance: balance,
    daily_pacing: dailyPacing,
    amount_paid: num(w?.totalLifetimePaid, 0),
    total_ad_spent: num(w?.totalAdSpent, 0),
    ad_campaign_active: Boolean(w?.adCampaignActive),
    active_days: joinList(w?.activeDays),
    schedule_preset: w?.schedulePreset || 'custom',
    last_deducted_at: w?.lastDeductedAt ?? null,
    booked_dates: joinList(w?.bookedDates),
    runway_days: Math.floor(balance / Math.max(dailyPacing, 1)),
    total_leads_dispatched: leadCount,
  };
}

/** List customer view rows (newest first). `filter` is a Mongoose filter for Customer. */
export async function getCustomerViewRows(filter = {}) {
  const customers = await Customer.find(filter).sort({ registeredAt: -1 }).lean();
  return buildViewRowsFor(customers, Object.keys(filter).length === 0);
}

async function buildViewRowsFor(customers, loadAll = false) {
  if (customers.length === 0) return [];
  const ids = customers.map((c) => c._id);
  const idFilter = loadAll ? {} : { customerId: { $in: ids } };
  const [wallets, leadCounts] = await Promise.all([
    Wallet.find(idFilter).lean(),
    Lead.aggregate([
      ...(loadAll ? [] : [{ $match: { customerId: { $in: ids } } }]),
      { $group: { _id: '$customerId', n: { $sum: 1 } } },
    ]),
  ]);
  const walletByCust = new Map(wallets.map((w) => [w.customerId, w]));
  const leadCountByCust = new Map(leadCounts.map((l) => [l._id, l.n]));
  return customers.map((c) => buildCustomerViewRow(c, walletByCust.get(c._id), leadCountByCust.get(c._id) || 0));
}

/** Single customer view row by exact customer id (or null). */
export async function getCustomerViewRowById(customerId, { session } = {}) {
  if (!customerId) return null;
  const c = await Customer.findById(String(customerId)).session(session || null).lean();
  if (!c) return null;
  const [w, leadCount] = await Promise.all([
    Wallet.findOne({ customerId: c._id }).session(session || null).lean(),
    Lead.countDocuments({ customerId: c._id }).session(session || null),
  ]);
  return buildCustomerViewRow(c, w, leadCount);
}

/** Customer filter for `id = $1 OR phone = $2 OR LOWER(username) = LOWER($1)` lookups. */
export function customerIdentifierFilter(rawId) {
  const id = String(rawId || '').trim();
  const cleanPhone = id.replace(/\D/g, '').slice(-10);
  const or = [{ _id: id }, { username: ciExact(id) }];
  if (cleanPhone) or.push({ phone: cleanPhone });
  return { $or: or };
}

/** Customer view row looked up by id / phone / username (first match). */
export async function getCustomerViewRowByIdentifier(rawId) {
  const c = await Customer.findOne(customerIdentifierFilter(rawId)).lean();
  if (!c) return null;
  const [rows] = await Promise.all([buildViewRowsFor([c])]);
  return rows[0] || null;
}

// ---------------------------------------------------------------------------
// Row adapters (Mongo doc -> legacy snake_case row)
// ---------------------------------------------------------------------------
export function leadToRow(l, cust) {
  if (!l) return null;
  return {
    id: l._id,
    customer_id: l.customerId,
    master_lead_id: l.masterLeadId && !String(l.masterLeadId).startsWith('standalone_') ? l.masterLeadId : null,
    customer_phone: l.customerPhone || cust?.phone || '',
    customer_username: l.customerUsername || cust?.username || '',
    company_name: l.companyName || cust?.companyName || '',
    category: l.category,
    buyer_phone: l.phone,
    display_phone: l.displayPhone || '',
    buyer_name: l.fullName,
    buyer_email: l.email,
    city: l.city,
    requirement: l.requirement,
    budget: l.budget,
    source: l.source,
    priority: l.priority,
    status: l.status,
    is_hot: l.isHot ?? true,
    is_read: Boolean(l.isRead),
    notes: l.notes,
    created_at: l.assignedAt || l.createdAt || null,
    updated_at: l.updatedAt || null,
  };
}

export function leadsToRows(leads, customers) {
  const byId = new Map((customers || []).map((c) => [c._id, c]));
  return leads.map((l) => leadToRow(l, byId.get(l.customerId)));
}

export function walletTxToRow(t) {
  if (!t) return null;
  return {
    id: t._id,
    customer_id: t.customerId,
    wallet_id: t.walletId,
    tx_type: t.txType,
    amount: t.amount,
    balance_after: t.balanceAfter,
    reference_utr: t.referenceUtr,
    description: t.description,
    payment_method: t.paymentMethod,
    status: t.status,
    currency: t.currency,
    created_at: t.createdAt,
  };
}

export function invoiceToRow(i) {
  if (!i) return null;
  return {
    id: i._id,
    invoice_no: i.invoiceNumber,
    customer_id: i.customerId,
    payment_record_id: i.paymentRecordId ?? null,
    particulars: i.particulars || 'Meta Ads Campaign Ad Spend Budget Credit',
    sac_code: i.sacCode,
    base_amount: i.baseAmount ?? i.subtotalAmount,
    cgst_amount: i.cgstAmount,
    sgst_amount: i.sgstAmount,
    total_amount: i.totalAmount,
    payment_mode: i.paymentMode || '',
    status: i.status || 'Paid',
    issued_date: i.invoiceDate || i.createdAt || null,
    currency: i.currency,
    created_at: i.createdAt,
  };
}

/** Normalise stored payment status to the legacy paid | pending | overdue vocabulary. */
function legacyPaymentStatus(status) {
  const s = String(status || '').toLowerCase();
  if (!s) return 'paid';
  if (s.includes('verified') || s.includes('✓') || s === 'paid' || s === 'success' || s === 'captured') return 'paid';
  if (s.includes('overdue')) return 'overdue';
  if (s.includes('pend')) return 'pending';
  return status;
}

export function paymentToRow(p, cust) {
  if (!p) return null;
  const amount = num(p.amount, 0);
  return {
    id: p._id,
    receipt_number: p.receiptNumber,
    customer_id: p.customerId,
    company_name: p.companyName || undefined,
    contact_person: p.contactPerson || undefined,
    phone: p.phone || cust?.phone || '',
    city: p.city || cust?.city || undefined,
    tx_type: p.txType || 'topup',
    amount,
    currency: p.currency,
    gst_amount: num(p.gstAmount, 0),
    total_amount: p.totalAmount === undefined || p.totalAmount === null ? amount : num(p.totalAmount),
    payment_mode: p.paymentMethod,
    utr_reference: p.referenceUtr,
    status: legacyPaymentStatus(p.status),
    days_overdue: num(p.daysOverdue, 0),
    notes: p.notes,
    paid_at: p.createdAt,
    username: cust?.username,
    cust_company: cust?.companyName,
    cust_contact: cust?.contactPerson,
  };
}

/** Builds a resolver replicating `x.customer_id = c.id OR x.phone = c.phone OR c.phone = RIGHT(digits(x.customer_id), 10)`. */
export function makeCustomerMatcher(customers) {
  const byId = new Map();
  const byPhone = new Map();
  for (const c of customers) {
    byId.set(c._id, c);
    if (c.phone && !byPhone.has(c.phone)) byPhone.set(c.phone, c);
  }
  return (customerId, phone) => {
    const cid = customerId == null ? '' : String(customerId);
    return (
      byId.get(cid) ||
      (phone ? byPhone.get(String(phone)) : undefined) ||
      byPhone.get(cid) ||
      (last10Digits(cid) ? byPhone.get(last10Digits(cid)) : undefined) ||
      null
    );
  };
}

const PRIORITY_LABEL = { low: 'Low', medium: 'Normal', high: 'High', urgent: 'Urgent' };

export function supportQueryToRow(q, cust) {
  if (!q) return null;
  const pr = String(q.priority || '').toLowerCase();
  return {
    id: q._id,
    customer_id: q.customerId,
    company_name: q.companyName || cust?.companyName || '',
    contact_name: q.contactName ?? cust?.contactPerson ?? '',
    contact_email: q.contactEmail ?? cust?.email ?? '',
    contact_phone: q.contactPhone ?? cust?.phone ?? '',
    category: q.category,
    subject: q.subject,
    priority: PRIORITY_LABEL[pr] || q.priority,
    assigned_admin: q.assignedAgent || '',
    internal_notes: q.internalNotes || '',
    sla_breached: Boolean(q.slaBreached),
    hours_open: num(q.hoursOpen, 0),
    status: q.status,
    created_at: q.createdAt,
    resolved_at: q.resolvedAt ?? null,
  };
}

export function salesTaskToRow(t, cust) {
  if (!t) return null;
  return {
    id: t._id,
    customer_id: t.customerId,
    company_name: t.companyName || cust?.companyName || '',
    contact_person: t.contactPerson || cust?.contactPerson || '',
    phone: t.phone || cust?.phone || '',
    task_type: t.taskType,
    priority: t.priority || 'High',
    due_status: t.dueStatus || 'today',
    due_time: t.dueTime || '',
    notes: t.notes,
    status: t.status,
    created_at: t.createdAt,
  };
}

export function pendingVerificationToRow(pv, cust) {
  if (!pv) return null;
  return {
    id: pv._id,
    customer_id: pv.customerId,
    company_name: pv.companyName,
    contact_person: pv.contactPerson,
    phone: pv.phone,
    package_tier: pv.packageTier,
    amount: pv.amount,
    daily_rate: pv.dailyRate,
    utr_number: pv.utrNumber,
    payment_status: pv.paymentStatus,
    profile_status: pv.profileStatus,
    queue_type: pv.queueType,
    submitted_at: pv.submittedAt,
    verified_at: pv.verifiedAt ?? null,
    username: cust?.username,
    cust_company: cust?.companyName,
    cust_contact: cust?.contactPerson,
  };
}

export function deletedFailedTxToRow(d) {
  if (!d) return null;
  return {
    id: d._id,
    original_id: d.originalId || d.originalTxId || d._id,
    customer_id: d.customerId,
    customer_name: d.customerName,
    company_name: d.companyName,
    contact_person: d.contactPerson,
    phone: d.phone,
    email: d.email,
    city: d.city,
    state: d.state,
    category: d.category,
    amount: num(d.amount, 0),
    reference_utr: d.referenceUtr,
    description: d.description || d.reason,
    payment_method: d.paymentMethod,
    failure_reason: d.failureReason || d.reason,
    original_created_at: d.originalCreatedAt ?? null,
    deleted_at: d.deletedAt || d.purgedAt || d.createdAt || null,
    deleted_by: d.deletedBy || d.purgedBy,
  };
}

// ---------------------------------------------------------------------------
// /api/state bundle
// ---------------------------------------------------------------------------
const FAIL_STATUS_RE = /fail|declin|cancel|dismiss|reject/i;
const FAIL_DESC_RE = /fail|declin|dismiss|cancel/i;
const FAIL_TYPE_RE = /fail/i;
const FAIL_UTR_RE = /^(DISMISS-|FAIL-)/;

export const FAILED_TX_FILTER = {
  $or: [
    { status: FAIL_STATUS_RE },
    { txType: FAIL_TYPE_RE },
    { description: FAIL_DESC_RE },
    { paymentMethod: FAIL_TYPE_RE },
    { referenceUtr: FAIL_UTR_RE },
  ],
};

const byDateDesc = (field) => (a, b) => new Date(b[field] || 0) - new Date(a[field] || 0);

/** Row-shaped data for GET /api/state (everything the legacy handler loaded with raw SQL). */
export async function loadSalesStateRows() {
  const [
    customers, wallets, leadCounts, leads, payments, pendingVerifs, queries, tasks, groups,
    memberAgg, groupMasterAgg, groupAssignAgg, masterLeads, assignAgg, failedTxs, deletedFailed, allTxs,
  ] = await Promise.all([
    Customer.find({}).sort({ registeredAt: -1 }).lean(),
    Wallet.find({}).lean(),
    Lead.aggregate([{ $group: { _id: '$customerId', n: { $sum: 1 } } }]),
    Lead.find({}).sort({ assignedAt: -1 }).lean(),
    PaymentRecord.find({}).sort({ createdAt: -1 }).lean(),
    PendingVerification.find({}).sort({ submittedAt: -1 }).lean(),
    SupportQuery.find({}).sort({ createdAt: -1 }).lean(),
    SalesTask.find({}).sort({ createdAt: -1 }).lean(),
    CustomerGroup.find({}).sort({ createdAt: 1 }).lean(),
    Customer.aggregate([
      { $unwind: '$groupMemberships' },
      { $group: { _id: '$groupMemberships.groupId', ids: { $addToSet: '$_id' } } },
    ]),
    MasterLead.aggregate([{ $match: { groupId: { $ne: null } } }, { $group: { _id: '$groupId', n: { $sum: 1 } } }]),
    LeadAssignment.aggregate([{ $match: { groupId: { $ne: null } } }, { $group: { _id: '$groupId', n: { $sum: 1 } } }]),
    MasterLead.find({}).sort({ createdAt: -1 }).lean(),
    LeadAssignment.aggregate([
      {
        $group: {
          _id: '$masterLeadId',
          recipients: { $sum: 1 },
          interested: { $sum: { $cond: [{ $eq: ['$responseStatus', 'Interested'] }, 1, 0] } },
          converted: { $sum: { $cond: [{ $in: ['$status', ['Converted', 'Won']] }, 1, 0] } },
        },
      },
    ]),
    WalletTransaction.find(FAILED_TX_FILTER).sort({ createdAt: -1 }).lean(),
    DeletedFailedTransaction.find({}).lean(),
    WalletTransaction.find({}).sort({ createdAt: -1 }).lean(),
  ]);

  const walletByCust = new Map(wallets.map((w) => [w.customerId, w]));
  const leadCountByCust = new Map(leadCounts.map((l) => [l._id, l.n]));
  const custViewRows = customers.map((c) => buildCustomerViewRow(c, walletByCust.get(c._id), leadCountByCust.get(c._id) || 0));
  const custById = new Map(customers.map((c) => [c._id, c]));
  const match = makeCustomerMatcher(customers);

  const paymentRows = payments.map((p) => paymentToRow(p, match(p.customerId, p.phone)));
  const verificationRows = pendingVerifs.map((pv) => pendingVerificationToRow(pv, match(pv.customerId, pv.phone)));
  const queryRows = queries.map((q) => supportQueryToRow(q, custById.get(q.customerId)));
  const taskRows = tasks.map((t) => salesTaskToRow(t, custById.get(t.customerId)));

  // Groups: customer_count = distinct members from customer memberships (+ group.members array)
  const memberSets = new Map(memberAgg.map((m) => [m._id, new Set(m.ids)]));
  const groupMasterCount = new Map(groupMasterAgg.map((g) => [g._id, g.n]));
  const groupAssignCount = new Map(groupAssignAgg.map((g) => [g._id, g.n]));
  const groupRows = groups.map((g) => {
    const members = new Set(memberSets.get(g._id) || []);
    for (const m of g.members || []) members.add(m);
    return {
      id: g._id,
      name: g.name,
      category: g.category,
      icon: g.icon,
      description: g.description,
      status: g.status,
      created_at: g.createdAt,
      updated_at: g.updatedAt,
      customer_count: members.size,
      leads_received: groupMasterCount.get(g._id) || 0,
      leads_distributed: groupAssignCount.get(g._id) || 0,
    };
  });
  const groupById = new Map(groups.map((g) => [g._id, g]));

  const assignByMaster = new Map(assignAgg.map((a) => [a._id, a]));
  const masterLeadRows = masterLeads.map((m) => {
    const g = m.groupId ? groupById.get(m.groupId) : null;
    const a = assignByMaster.get(m._id);
    return {
      id: m._id,
      title: m.title || m.requirement || m.leadNumber,
      description: m.description || '',
      category: m.category,
      group_id: m.groupId ?? null,
      group_name: g?.name,
      group_icon: g?.icon,
      buyer_name: m.fullName,
      buyer_phone: m.phone,
      buyer_email: m.email,
      city: m.city,
      requirement: m.requirement,
      budget: m.budget,
      location: m.location || m.state || '',
      priority: m.priority,
      source: m.source,
      deadline_date: m.deadlineDate ?? null,
      created_by: m.createdBy,
      recipients_count: a?.recipients || 0,
      interested_count: a?.interested || 0,
      converted_count: a?.converted || 0,
      created_at: m.createdAt,
      updated_at: m.updatedAt || m.createdAt,
    };
  });

  const failedRows = failedTxs.map((t) => {
    const c = match(t.customerId, null);
    return {
      id: t._id,
      customer_id: t.customerId,
      amount: t.amount,
      reference_utr: t.referenceUtr,
      description: t.description,
      payment_method: t.paymentMethod,
      status: t.status,
      created_at: t.createdAt,
      matched_cust_id: c?._id,
      username: c?.username,
      company_name: c?.companyName,
      contact_person: c?.contactPerson,
      phone: c?.phone,
      email: c?.email,
      city: c?.city,
      state: c?.state,
      country: c?.country,
      category: c?.category,
    };
  });

  const deletedFailedRows = deletedFailed.map(deletedFailedTxToRow).sort(byDateDesc('deleted_at'));

  const payByUtr = new Map();
  const payByReceipt = new Map();
  const payById = new Map();
  for (const p of payments) {
    if (p.referenceUtr && !payByUtr.has(p.referenceUtr)) payByUtr.set(p.referenceUtr, p);
    if (p.receiptNumber && !payByReceipt.has(p.receiptNumber)) payByReceipt.set(p.receiptNumber, p);
    payById.set(p._id, p);
  }
  const allWtRows = allTxs.map((t) => {
    const c = match(t.customerId, null);
    const pr = payByUtr.get(t.referenceUtr) || payByReceipt.get(t.referenceUtr) || payById.get(t._id);
    return {
      ...walletTxToRow(t),
      username: c?.username,
      company_name: c?.companyName,
      contact_person: c?.contactPerson,
      phone: c?.phone,
      email: c?.email,
      city: c?.city,
      state: c?.state,
      category: c?.category,
      receipt_number: pr?.receiptNumber,
      payment_paid_at: pr?.createdAt,
      pr_payment_mode: pr?.paymentMethod,
    };
  });

  return {
    customers: custViewRows,
    leads: leadsToRows(leads, customers),
    payments: paymentRows,
    verifications: verificationRows,
    queries: queryRows,
    tasks: taskRows,
    groups: groupRows,
    masterLeads: masterLeadRows,
    failed: failedRows,
    deletedFailed: deletedFailedRows,
    allWalletTx: allWtRows,
  };
}

// ---------------------------------------------------------------------------
// System users (admin auth)
// ---------------------------------------------------------------------------
export function systemUserToRow(u) {
  if (!u) return null;
  return {
    id: u._id,
    customer_id: u.customerId ?? null,
    full_name: u.fullName,
    email: u.email,
    username: u.username,
    phone: u.phone,
    password_hash: u.passwordHash,
    role: u.role,
    department: u.department || '',
    permissions: u.permissions,
    status: u.status,
    last_login_at: u.lastLoginAt ?? null,
  };
}

export async function findSystemUserRowByLogin(q, cleanPhone, { requireTenDigitPhone = false } = {}) {
  const or = [{ username: ciExact(q) }, { email: ciExact(q) }];
  if (cleanPhone && (!requireTenDigitPhone || cleanPhone.length === 10)) or.push({ phone: cleanPhone });
  const u = await SystemUser.findOne({ $or: or }).lean();
  return systemUserToRow(u);
}
