import {
  Customer,
  CustomerGroup,
  Wallet,
  WalletTransaction,
  PaymentRecord,
  TaxInvoice,
  PendingVerification,
  MasterLead,
  Lead,
  LeadAssignment,
  SalesTask,
  SupportQuery,
} from '../models/index.js';
import { withMongoTransaction } from './tx.js';
import {
  ciExact,
  escapeRegex,
  leadToRow,
  leadsToRows,
  paymentToRow,
  invoiceToRow,
  pendingVerificationToRow,
  supportQueryToRow,
  salesTaskToRow,
  makeCustomerMatcher,
} from './salesViewRepo.js';
import { getEvaluatedRecipients } from '../services/leadEligibility.js';
import { recordOutboxEvent } from '../services/outboxWorker.js';

const scalar = (v) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');

// ---------------------------------------------------------------------------
// Leads (/api/leads)
// ---------------------------------------------------------------------------
export async function listLeadRows({ customerId, phone, username } = {}) {
  const cid = scalar(customerId).trim();
  const cleanPhone = scalar(phone).replace(/\D/g, '').slice(-10);
  const uname = scalar(username).trim();

  if (cid || cleanPhone || uname) {
    const custOr = [];
    if (cid) custOr.push({ _id: cid });
    if (cleanPhone) custOr.push({ phone: cleanPhone });
    if (uname) custOr.push({ username: ciExact(uname) });
    const matchedCustomers = custOr.length ? await Customer.find({ $or: custOr }).lean() : [];
    const matchedIds = matchedCustomers.map((c) => c._id);

    const leadOr = [];
    if (cid) leadOr.push({ customerId: cid });
    if (matchedIds.length) leadOr.push({ customerId: { $in: matchedIds } });
    if (cleanPhone) leadOr.push({ customerPhone: cleanPhone });
    if (uname) leadOr.push({ customerUsername: ciExact(uname) });

    const leads = leadOr.length
      ? await Lead.find({ $or: leadOr }).sort({ assignedAt: -1 }).lean()
      : [];
    const extraCustIds = Array.from(new Set(leads.map((l) => l.customerId).filter(Boolean)));
    const customers = extraCustIds.length
      ? await Customer.find({ _id: { $in: extraCustIds } }).lean()
      : matchedCustomers;
    return leadsToRows(leads, customers);
  }

  const [leads, customers] = await Promise.all([
    Lead.find({}).sort({ assignedAt: -1 }).lean(),
    Customer.find({}).lean(),
  ]);
  return leadsToRows(leads, customers);
}

export async function createDirectLeadRow(body = {}) {
  const {
    customerId,
    customerPhone,
    customerUsername,
    company,
    assignedCompany,
    phone,
    name,
    city = '',
    requirement = 'Verified Business Enquiry',
    budget = '₹1.5L – ₹3.5L',
    source = 'Direct Intake',
    priority = 'Urgent',
    notes = '',
  } = body;

  const targetCompany = scalar(company || assignedCompany).trim();
  const cleanCustPhone = scalar(customerPhone).replace(/\D/g, '').slice(-10);
  const cid = scalar(customerId).trim();
  const uname = scalar(customerUsername).trim();

  const or = [];
  if (cid) or.push({ _id: cid });
  if (cleanCustPhone) or.push({ phone: cleanCustPhone });
  if (uname) or.push({ username: ciExact(uname) });
  if (targetCompany) or.push({ companyName: ciExact(targetCompany) });

  const cust = or.length
    ? await Customer.findOne({ $or: or }).sort({ registeredAt: -1 }).lean()
    : null;
  if (!cust) {
    return { notFound: true, targetCompany };
  }

  const buyerDigits = scalar(phone || name).replace(/\D/g, '').slice(-10);
  const leadId = scalar(body.id).trim() || `lead_${Date.now()}`;
  const displayPhone = `+91 ${buyerDigits}`;
  const now = new Date();

  const created = await Lead.create({
    _id: leadId,
    masterLeadId: null,
    customerId: cust._id,
    customerPhone: cust.phone || '',
    customerUsername: cust.username || '',
    companyName: cust.companyName || '',
    category: cust.category || 'Other',
    phone: buyerDigits,
    displayPhone,
    fullName: scalar(name).trim() || displayPhone,
    email: `lead_${buyerDigits.slice(-4)}@example.com`,
    city: scalar(city) || cust.city || '',
    requirement: scalar(requirement) || 'Verified Business Enquiry',
    budget: scalar(budget) || '₹1.5L – ₹3.5L',
    source: scalar(source) || 'Direct Intake',
    priority: scalar(priority) || 'Urgent',
    status: 'new',
    isHot: true,
    isRead: false,
    notes: scalar(notes) || `Direct intake for ${cust.companyName}`,
    assignedAt: now,
    updatedAt: now,
  });

  await recordOutboxEvent(null, {
    aggregateType: 'lead',
    aggregateId: leadId,
    eventType: 'LEAD_DISPATCHED',
    payload: {
      leadId,
      customerId: cust._id,
      buyerName: scalar(name).trim() || displayPhone,
      city: scalar(city) || cust.city || '',
      category: cust.category || 'Other',
    },
  }).catch(() => {});

  return { row: leadToRow(created.toObject(), cust) };
}

export async function updateLeadAndSyncAssignment(leadId, body = {}) {
  const id = scalar(leadId).trim();
  let existing = id ? await Lead.findById(id).lean() : null;
  if (!existing) {
    const cleanDigits = id.replace(/\D/g, '').slice(-10);
    if (cleanDigits.length === 10) {
      existing = await Lead.findOne({ phone: cleanDigits }).sort({ assignedAt: -1 }).lean();
    }
  }
  if (!existing) return null;

  const { status, read, is_read, notes } = body;
  const nextStatus = status !== undefined ? scalar(status) : existing.status;
  const nextRead =
    read !== undefined ? Boolean(read) : is_read !== undefined ? Boolean(is_read) : Boolean(existing.isRead);
  const nextNotes = notes !== undefined ? scalar(notes) : existing.notes;
  const now = new Date();

  const updated = await Lead.findOneAndUpdate(
    { _id: existing._id },
    { $set: { status: nextStatus, isRead: nextRead, notes: nextNotes, updatedAt: now } },
    { new: true }
  ).lean();

  let interest = null;
  if (nextStatus === 'Interested') interest = 'Interested';
  else if (nextStatus === 'In Follow-up' || nextStatus === 'Callback') interest = 'In Follow-up';
  else if (nextStatus === 'Converted' || nextStatus === 'Won') interest = 'Converted';
  else if (nextStatus === 'Dropped' || nextStatus === 'Not Interested') interest = 'Not Interested';

  try {
    const or = [{ customerLeadId: existing._id }];
    const cleanMasterId =
      existing.masterLeadId && !String(existing.masterLeadId).startsWith('standalone_')
        ? existing.masterLeadId
        : null;
    if (cleanMasterId && existing.customerId) {
      or.push({ masterLeadId: cleanMasterId, customerId: existing.customerId });
    }
    const $set = {
      status: nextStatus,
      isRead: nextRead,
      responseNotes: nextNotes,
      respondedAt: now,
    };
    if (interest !== null) $set.responseStatus = interest;
    await LeadAssignment.updateMany({ $or: or }, { $set });
  } catch (assignErr) {
    console.warn('[lead_assignments sync warning]', assignErr.message);
  }

  const cust = updated?.customerId ? await Customer.findById(updated.customerId).lean() : null;
  return leadToRow(updated, cust);
}

// ---------------------------------------------------------------------------
// Payments, Invoices, Verifications
// ---------------------------------------------------------------------------
export async function listPaymentRecordRows() {
  const [payments, customers] = await Promise.all([
    PaymentRecord.find({}).sort({ createdAt: -1 }).lean(),
    Customer.find({}).lean(),
  ]);
  const match = makeCustomerMatcher(customers);
  return payments.map((p) => paymentToRow(p, match(p.customerId, p.phone)));
}

export async function deletePaymentOrTestEntries(rawId) {
  if (rawId === 'test-entries' || rawId === 'testing-data') {
    const testUtrs = ['aaggg', 'aa', 'pay_TvCjRvjJKpHawP', 'pay_TvCfjhW56ixevu'];
    const testReceipts = ['REC_1793882500916_D467', 'REC_1793881526162_E051', 'RCP-2026-5814', 'RCP-2026-9969'];
    const testPayIds = ['pay_1793882500916_18d1ec', 'pay_1793881526162_89c397', 'pay_1793600155814', 'pay_1793600029969'];
    const testTxIds = ['tx_sales_1793882500877_e9eea9', 'tx_sales_1793881526137_245853', 'tx_1793600155807', 'tx_1793600029957', 'tx_deb_1793600430780_cz2cl5'];
    const targetPhones = ['7383198428', '8200792130'];

    await withMongoTransaction(async (session) => {
      await PaymentRecord.deleteMany(
        {
          $or: [
            { receiptNumber: { $in: testReceipts } },
            { referenceUtr: { $in: testUtrs } },
            { _id: { $in: testPayIds } },
          ],
        },
        { session }
      );
      await WalletTransaction.deleteMany(
        { $or: [{ referenceUtr: { $in: testUtrs } }, { _id: { $in: testTxIds } }] },
        { session }
      );
      const utrRegexes = testUtrs.map((u) => new RegExp(escapeRegex(u), 'i'));
      await TaxInvoice.deleteMany(
        {
          $or: [
            { invoiceNumber: { $in: testReceipts } },
            ...(utrRegexes.length ? [{ paymentMode: { $in: utrRegexes } }] : []),
          ],
        },
        { session }
      );

      const testCusts = await Customer.find({ phone: { $in: targetPhones } }, { _id: 1 }).session(session).lean();
      const testCustIds = testCusts.map((c) => c._id);
      if (testCustIds.length) {
        await Wallet.updateMany(
          { customerId: { $in: testCustIds } },
          { $set: { availableBalance: 0, totalLifetimePaid: 0, updatedAt: new Date() } },
          { session }
        );
      }
      await Customer.updateMany(
        { phone: { $in: targetPhones } },
        { $set: { paymentStatus: 'pending', updatedAt: new Date() } },
        { session }
      );
    });

    return { status: 200, body: { ok: true, deleted: true, purgedTestEntries: true } };
  }

  const payDoc = await PaymentRecord.findOne({
    $or: [{ _id: rawId }, { receiptNumber: rawId }, { referenceUtr: rawId }],
  }).lean();

  if (!payDoc) {
    const delWt = await WalletTransaction.deleteMany({
      $or: [{ _id: rawId }, { referenceUtr: rawId }],
    });
    if (delWt.deletedCount > 0) {
      return {
        status: 200,
        body: { ok: true, deleted: true, from: 'wallet_transactions', count: delWt.deletedCount },
      };
    }
    return { status: 404, body: { ok: false, error: 'Payment record not found' } };
  }

  const receiptNo = payDoc.receiptNumber;
  const utrRef = payDoc.referenceUtr;
  const custId = payDoc.customerId;
  const payAmt = Number(payDoc.amount || 0);

  await withMongoTransaction(async (session) => {
    await PaymentRecord.deleteOne({ _id: payDoc._id }, { session });

    const refCandidates = [utrRef, receiptNo, payDoc._id].filter(Boolean);
    const custCandidates = [custId, payDoc.phone].filter(Boolean);
    if (refCandidates.length && custCandidates.length) {
      await WalletTransaction.deleteMany(
        {
          $or: [{ referenceUtr: { $in: refCandidates } }, { _id: payDoc._id }],
          customerId: { $in: custCandidates },
        },
        { session }
      );
    }

    const invOr = [{ paymentRecordId: payDoc._id }];
    if (receiptNo) invOr.push({ invoiceNumber: receiptNo });
    if (utrRef) invOr.push({ paymentMode: new RegExp(escapeRegex(utrRef), 'i') });
    await TaxInvoice.deleteMany({ $or: invOr }, { session });

    if (custId && payAmt > 0) {
      await Wallet.updateOne(
        { customerId: custId },
        [
          {
            $set: {
              availableBalance: { $max: [0, { $subtract: ['$availableBalance', payAmt] }] },
              totalLifetimePaid: { $max: [0, { $subtract: ['$totalLifetimePaid', payAmt] }] },
              updatedAt: new Date(),
            },
          },
        ],
        { session, updatePipeline: true }
      );
    }
  });

  return { status: 200, body: { ok: true, deleted: true, receiptNumber: receiptNo, utr: utrRef } };
}

export async function listTaxInvoiceRows(customerId) {
  const cid = scalar(customerId).trim();
  const docs = await TaxInvoice.find(cid ? { customerId: cid } : {}).sort({ createdAt: -1 }).lean();
  return docs.map(invoiceToRow);
}

export async function listPendingVerificationRows() {
  const [pvs, customers] = await Promise.all([
    PendingVerification.find({}).sort({ submittedAt: -1 }).lean(),
    Customer.find({}).lean(),
  ]);
  const match = makeCustomerMatcher(customers);
  return pvs.map((pv) => pendingVerificationToRow(pv, match(pv.customerId, pv.phone)));
}

// ---------------------------------------------------------------------------
// Support Queries & Sales Tasks
// ---------------------------------------------------------------------------
export async function listSupportQueryRows(customerId) {
  const cid = scalar(customerId).trim();
  const docs = await SupportQuery.find(cid ? { customerId: cid } : {}).sort({ createdAt: -1 }).lean();
  return docs.map((q) => supportQueryToRow(q));
}

export async function createSupportQueryRow(body = {}) {
  const {
    customerId = null,
    company = 'Client Account',
    companyName,
    contactName = '',
    contactEmail = '',
    contactPhone = '',
    category = 'Campaign Delivery & Pacing',
    subject = 'Customer Support Inquiry',
    priority = 'Normal',
    internalNotes = '',
    status = 'open',
  } = body;

  const id = `qry_${Date.now()}_${Math.floor(100 + Math.random() * 900)}`;
  const comp = scalar(companyName || company) || 'Client Account';
  const cleanPhone = scalar(contactPhone).replace(/\D/g, '').slice(-10);
  const now = new Date();

  const created = await SupportQuery.create({
    _id: id,
    ticketNumber: `TKT-${id}`,
    customerId: scalar(customerId) || null,
    companyName: comp,
    contactName: scalar(contactName),
    contactEmail: scalar(contactEmail),
    contactPhone: cleanPhone,
    category: scalar(category) || 'Campaign Delivery & Pacing',
    subject: scalar(subject) || 'Customer Support Inquiry',
    priority: scalar(priority) || 'Normal',
    internalNotes: scalar(internalNotes),
    status: (scalar(status) || 'open').toLowerCase(),
    createdAt: now,
  });

  return supportQueryToRow(created.toObject());
}

export async function updateSupportQueryRow(id, body = {}) {
  const qid = scalar(id).trim();
  const { status, internalNotes, assignedAdmin } = body;
  const $set = {};

  if (status) {
    const lower = scalar(status).toLowerCase();
    $set.status = lower;
    $set.resolvedAt = lower === 'resolved' ? new Date() : null;
  }
  if (internalNotes !== undefined) {
    $set.internalNotes = scalar(internalNotes);
  }
  if (assignedAdmin !== undefined) {
    $set.assignedAgent = scalar(assignedAdmin);
  }

  if (Object.keys($set).length === 0) {
    const existing = await SupportQuery.findById(qid).lean();
    return { notFound: false, row: supportQueryToRow(existing) };
  }

  const updated = await SupportQuery.findOneAndUpdate(
    { _id: qid },
    { $set },
    { new: true }
  ).lean();
  if (!updated) return { notFound: true, row: null };
  return { notFound: false, row: supportQueryToRow(updated) };
}

export async function deleteSupportQueryById(id) {
  const res = await SupportQuery.deleteOne({ _id: scalar(id).trim() });
  return res.deletedCount || 0;
}

export async function createSalesTaskRow(body = {}) {
  const {
    customerId = null,
    company = 'Client Account',
    contact = '',
    phone = '9876543210',
    taskType = 'Follow-up Call',
    priority = 'High',
    dueStatus = 'today',
    dueTime = 'Today, 04:00 PM',
    notes = '',
  } = body;
  const id = `tsk_${Date.now()}`;
  const cleanPhone = scalar(phone).replace(/\D/g, '').slice(-10).padEnd(10, '0');
  const comp = scalar(company) || 'Client Account';
  const tType = scalar(taskType) || 'Follow-up Call';

  const created = await SalesTask.create({
    _id: id,
    customerId: scalar(customerId) || null,
    companyName: comp,
    contactPerson: scalar(contact) || comp,
    phone: cleanPhone,
    taskType: tType,
    title: tType,
    priority: scalar(priority) || 'High',
    dueStatus: scalar(dueStatus) || 'today',
    dueTime: scalar(dueTime) || 'Today, 04:00 PM',
    notes: scalar(notes),
    status: 'pending',
    createdAt: new Date(),
  });

  return salesTaskToRow(created.toObject());
}

// ---------------------------------------------------------------------------
// Customer Groups & Memberships
// ---------------------------------------------------------------------------
export function groupDocToRow(g, counts = {}) {
  if (!g) return null;
  return {
    id: g._id,
    name: g.name,
    category: g.category,
    icon: g.icon,
    description: g.description,
    status: g.status,
    created_at: g.createdAt,
    updated_at: g.updatedAt,
    customer_count: counts.customer_count ?? 0,
    leads_received: counts.leads_received ?? 0,
    leads_distributed: counts.leads_distributed ?? 0,
  };
}

export async function createCustomerGroupRow(body = {}) {
  const { name, category = 'Other', icon = '🏢', description = '', status = 'active' } = body;
  const cleanName = scalar(name).trim();
  const id = scalar(body.id).trim() || `grp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date();
  const created = await CustomerGroup.create({
    _id: id,
    name: cleanName,
    category: scalar(category) || 'Other',
    icon: scalar(icon) || '🏢',
    description: scalar(description),
    status: scalar(status) || 'active',
    members: [],
    createdAt: now,
    updatedAt: now,
  });
  return groupDocToRow(created.toObject(), { customer_count: 0, leads_received: 0, leads_distributed: 0 });
}

export async function updateCustomerGroupRow(groupId, body = {}) {
  const gid = scalar(groupId).trim();
  const existing = await CustomerGroup.findById(gid).lean();
  if (!existing) return null;

  const { name, category, icon, description, status } = body;
  const updated = await CustomerGroup.findOneAndUpdate(
    { _id: gid },
    {
      $set: {
        name: name !== undefined ? scalar(name).trim() : existing.name,
        category: category !== undefined ? scalar(category) : existing.category,
        icon: icon !== undefined ? scalar(icon) : existing.icon,
        description: description !== undefined ? scalar(description) : existing.description,
        status: status !== undefined ? scalar(status) : existing.status,
        updatedAt: new Date(),
      },
    },
    { new: true, runValidators: true }
  ).lean();

  const [memberCusts, leadsReceived, leadsDistributed] = await Promise.all([
    Customer.find({ 'groupMemberships.groupId': gid }, { _id: 1 }).lean(),
    MasterLead.countDocuments({ groupId: gid }),
    LeadAssignment.countDocuments({ groupId: gid }),
  ]);
  const memberSet = new Set(memberCusts.map((c) => c._id));
  for (const m of updated.members || []) memberSet.add(m);

  return groupDocToRow(updated, {
    customer_count: memberSet.size,
    leads_received: leadsReceived,
    leads_distributed: leadsDistributed,
  });
}

export async function deleteCustomerGroupCascade(groupId) {
  const gid = scalar(groupId).trim();
  await CustomerGroup.deleteOne({ _id: gid });
  await Promise.all([
    Customer.updateMany(
      { 'groupMemberships.groupId': gid },
      { $pull: { groupMemberships: { groupId: gid } } }
    ),
    Customer.updateMany({ groupId: gid }, { $set: { groupId: null } }),
  ]);
}

export async function listGroupMembers(groupId) {
  const gid = scalar(groupId).trim();
  const group = await CustomerGroup.findById(gid).lean();
  const extraIds = group?.members || [];
  const or = [{ 'groupMemberships.groupId': gid }];
  if (extraIds.length) or.push({ _id: { $in: extraIds } });

  const customers = await Customer.find({ $or: or }).lean();
  if (!customers.length) return [];

  const wallets = await Wallet.find({ customerId: { $in: customers.map((c) => c._id) } }).lean();
  const walletByCust = new Map(wallets.map((w) => [w.customerId, w]));

  const items = customers.map((c) => {
    const gm = (c.groupMemberships || []).find((m) => m.groupId === gid);
    const assignedAt = gm?.assignedAt || group?.updatedAt || c.registeredAt || null;
    const w = walletByCust.get(c._id);
    return {
      id: c._id,
      customerId: c._id,
      username: c.username,
      companyName: c.companyName,
      contactPerson: c.contactPerson,
      phone: (c.phone || '').trim(),
      email: c.email || '',
      category: c.category || 'Other',
      city: c.city || '',
      state: c.state || '',
      status: c.status,
      balance: Number(w?.availableBalance || 0),
      assignedAt,
    };
  });

  items.sort((a, b) => new Date(b.assignedAt || 0) - new Date(a.assignedAt || 0));
  return items;
}

export async function assignGroupMembers(groupId, customerIds = []) {
  const gid = scalar(groupId).trim();
  const group = await CustomerGroup.findById(gid).lean();
  if (!group) return null;

  let assignedCount = 0;
  const now = new Date();
  const validAssignedIds = [];

  for (const rawId of customerIds) {
    const cId = scalar(rawId).trim();
    if (!cId) continue;
    const cust = await Customer.findById(cId, { _id: 1, groupMemberships: 1 }).lean();
    if (!cust) continue;

    const already =
      (cust.groupMemberships || []).some((m) => m.groupId === gid) ||
      (group.members || []).includes(cId);

    const $set = { updatedAt: now };
    if (group.category) {
      $set.groupId = gid;
      $set.category = group.category;
    }

    if (!already) {
      await Customer.updateOne(
        { _id: cId, 'groupMemberships.groupId': { $ne: gid } },
        { $set, $push: { groupMemberships: { groupId: gid, assignedAt: now } } }
      );
      assignedCount++;
    } else if (group.category) {
      await Customer.updateOne({ _id: cId }, { $set });
    }
    validAssignedIds.push(cId);
  }

  if (validAssignedIds.length) {
    await CustomerGroup.updateOne(
      { _id: gid },
      { $addToSet: { members: { $each: validAssignedIds } }, $set: { updatedAt: now } }
    );
  }

  const [memberCusts, freshGroup] = await Promise.all([
    Customer.find({ 'groupMemberships.groupId': gid }, { _id: 1 }).lean(),
    CustomerGroup.findById(gid, { members: 1 }).lean(),
  ]);
  const memberSet = new Set(memberCusts.map((c) => c._id));
  for (const m of freshGroup?.members || []) memberSet.add(m);

  return {
    groupName: group.name,
    assignedCount,
    totalGroupMembers: memberSet.size,
  };
}

export async function removeGroupMember(groupId, customerId) {
  const gid = scalar(groupId).trim();
  const cid = scalar(customerId).trim();
  await Promise.all([
    Customer.updateOne(
      { _id: cid },
      { $pull: { groupMemberships: { groupId: gid } } }
    ),
    CustomerGroup.updateOne({ _id: gid }, { $pull: { members: cid } }),
  ]);
  await Customer.updateOne({ _id: cid, groupId: gid }, { $set: { groupId: null } });
}

export async function findGroupById(groupId) {
  const g = await CustomerGroup.findById(scalar(groupId).trim()).lean();
  return groupDocToRow(g);
}

export async function resolveDistributionGroup({ targetGroupId, targetCat }) {
  if (targetGroupId) {
    const byId = await CustomerGroup.findById(targetGroupId).lean();
    if (byId) return groupDocToRow(byId);
  }
  if (targetCat) {
    const rx = ciExact(targetCat);
    const byCat = await CustomerGroup.findOne({ $or: [{ category: rx }, { name: rx }] }).lean();
    if (byCat) return groupDocToRow(byCat);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Lead Distribution & Assignment Tracking
// ---------------------------------------------------------------------------
export function masterLeadDocToRow(m, extra = {}) {
  if (!m) return null;
  return {
    id: m._id,
    title: m.title || m.requirement || m.leadNumber,
    description: m.description || '',
    category: m.category,
    group_id: m.groupId ?? null,
    group_name: extra.group_name ?? '',
    group_icon: extra.group_icon ?? '🏢',
    buyer_name: m.fullName,
    buyer_phone: m.phone,
    buyer_email: m.email || '',
    city: m.city || '',
    requirement: m.requirement || '',
    budget: m.budget || '₹1.5L – ₹3.5L',
    location: m.location || m.state || '',
    priority: m.priority || 'Normal',
    source: m.source || 'Category Lead Distribution',
    deadline_date: m.deadlineDate ?? null,
    created_by: m.createdBy || 'Admin Operations',
    recipients_count: extra.recipients_count ?? 0,
    interested_count: extra.interested_count ?? 0,
    converted_count: extra.converted_count ?? 0,
    created_at: m.createdAt,
    updated_at: m.updatedAt || m.createdAt,
  };
}

export async function distributeMasterLeadAtomic({
  masterLeadId,
  leadTitle,
  description,
  finalCategory,
  finalGroupId,
  finalGroupName,
  bName,
  cleanBuyerDigits,
  displayPhone,
  buyerEmail,
  city,
  reqText,
  budget,
  location,
  priority,
  source,
  deadlineDate,
}) {
  return withMongoTransaction(async (session) => {
    const now = new Date();
    const txEvalData = await getEvaluatedRecipients({
      groupId: finalGroupId,
      category: finalCategory,
      masterLeadId,
      session,
    });

    if (txEvalData.eligibleCount === 0) {
      const err = new Error('No Eligible Customers');
      err.statusCode = 400;
      err.skippedCount = txEvalData.excludedCount;
      err.skippedBreakdown = txEvalData.skippedBreakdown;
      throw err;
    }

    const savedMasterLead = await MasterLead.findOneAndUpdate(
      { _id: masterLeadId },
      {
        $set: {
          title: leadTitle,
          description: description || reqText,
          category: finalCategory,
          groupId: finalGroupId,
          fullName: bName || displayPhone,
          phone: cleanBuyerDigits,
          email: buyerEmail || `lead_${cleanBuyerDigits.slice(-4)}@example.com`,
          city: city || location || '',
          state: location || city || '',
          location: location || city || '',
          requirement: reqText,
          budget: budget || '₹1.5L – ₹3.5L',
          priority: priority || 'Normal',
          source: source || 'Category Lead Distribution',
          deadlineDate: deadlineDate || null,
          status: 'Distributed',
          totalDispatched: txEvalData.eligible.length,
          updatedAt: now,
        },
        $setOnInsert: {
          leadNumber: `ML-${masterLeadId}`,
          createdBy: 'Admin Operations',
          createdAt: now,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, session }
    ).lean();

    const createdAssignments = [];

    for (const cust of txEvalData.eligible) {
      const custLeadId = `lead_${masterLeadId}_${cust.customerId}`.slice(0, 64);
      const assignId = `asgn_${masterLeadId}_${cust.customerId}`.slice(0, 64);

      await Lead.findOneAndUpdate(
        { _id: custLeadId },
        {
          $set: { updatedAt: now },
          $setOnInsert: {
            masterLeadId,
            customerId: cust.customerId,
            customerPhone: cust.phone || '',
            customerUsername: cust.username || cust.phone || '',
            companyName: cust.companyName || '',
            category: finalCategory,
            phone: cleanBuyerDigits,
            displayPhone,
            fullName: bName || displayPhone,
            email: buyerEmail || `lead_${cleanBuyerDigits.slice(-4)}@example.com`,
            city: city || cust.city || '',
            requirement: reqText,
            budget: budget || '₹1.5L – ₹3.5L',
            source: source || 'Category Lead Distribution',
            priority: priority || 'Normal',
            status: 'new',
            isHot: true,
            isRead: false,
            notes: description || `Category lead dispatched for ${finalGroupName}`,
            assignedAt: now,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true, session }
      );

      await LeadAssignment.findOneAndUpdate(
        { masterLeadId, customerId: cust.customerId },
        {
          $set: { assignedAt: now },
          $setOnInsert: {
            _id: assignId,
            groupId: finalGroupId,
            customerLeadId: custLeadId,
            status: 'new',
            responseStatus: 'Pending',
            responseNotes: '',
            isRead: false,
            notificationStatus: 'Delivered',
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true, session }
      );

      createdAssignments.push({
        id: assignId,
        customerId: cust.customerId,
        companyName: cust.companyName,
        contactPerson: cust.contactPerson,
        phone: cust.phone,
        status: 'new',
        responseInterest: 'Pending',
        notificationStatus: 'Delivered',
      });

      await recordOutboxEvent(session, {
        aggregateType: 'lead',
        aggregateId: custLeadId,
        eventType: 'LEAD_DISPATCHED',
        payload: {
          leadId: custLeadId,
          masterLeadId,
          customerId: cust.customerId,
          buyerName: bName || displayPhone,
          city: city || cust.city || '',
          category: finalCategory,
        },
      });
    }

    return {
      masterLeadRow: masterLeadDocToRow(savedMasterLead),
      assignments: createdAssignments,
      excludedCount: txEvalData.excludedCount,
      skippedBreakdown: txEvalData.skippedBreakdown,
    };
  });
}

export async function listDistributionHistory() {
  const [masterLeads, groups, assignAgg] = await Promise.all([
    MasterLead.find({}).sort({ createdAt: -1 }).lean(),
    CustomerGroup.find({}).lean(),
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
  ]);

  const groupById = new Map(groups.map((g) => [g._id, g]));
  const statsByMaster = new Map(assignAgg.map((a) => [a._id, a]));

  return masterLeads.map((m) => {
    const g = m.groupId ? groupById.get(m.groupId) : null;
    const s = statsByMaster.get(m._id);
    const buyerPhone = (m.phone || '').trim();
    return {
      id: m._id,
      title: m.title || m.requirement || m.leadNumber,
      description: m.description || '',
      category: m.category,
      groupId: m.groupId ?? null,
      groupName: g?.name || 'All Groups',
      groupIcon: g?.icon || '🏢',
      buyerName: m.fullName,
      buyerPhone,
      displayPhone: `+91 ${buyerPhone}`,
      city: m.city || '',
      priority: m.priority || 'Urgent',
      source: m.source || 'Direct Intake',
      budget: m.budget || '',
      requirement: m.requirement || '',
      createdBy: m.createdBy || 'Admin Operations',
      totalRecipients: Number(s?.recipients || 0),
      interestedCount: Number(s?.interested || 0),
      convertedCount: Number(s?.converted || 0),
      createdAt: m.createdAt,
    };
  });
}

export async function getDistributionDetail(masterLeadId) {
  const mlId = scalar(masterLeadId).trim();
  const ml = await MasterLead.findById(mlId).lean();
  if (!ml) return null;

  const [group, assignments] = await Promise.all([
    ml.groupId ? CustomerGroup.findById(ml.groupId).lean() : Promise.resolve(null),
    LeadAssignment.find({ masterLeadId: mlId }).sort({ assignedAt: 1 }).lean(),
  ]);

  const custIds = assignments.map((a) => a.customerId).filter(Boolean);
  const customers = custIds.length ? await Customer.find({ _id: { $in: custIds } }).lean() : [];
  const custById = new Map(customers.map((c) => [c._id, c]));

  let interestedCount = 0;
  let convertedCount = 0;
  const recipients = [];
  for (const a of assignments) {
    const c = custById.get(a.customerId);
    if (!c) continue; // Matches INNER JOIN customers c ON c.id = la.customer_id
    if (a.responseStatus === 'Interested') interestedCount++;
    if (a.status === 'Converted' || a.status === 'Won') convertedCount++;
    recipients.push({
      id: a._id,
      customerId: a.customerId,
      companyName: c.companyName,
      contactPerson: c.contactPerson,
      phone: (c.phone || '').trim(),
      email: c.email || '',
      city: c.city || '',
      status: a.status,
      responseInterest: a.responseStatus || 'Pending',
      responseNotes: a.responseNotes || '',
      isRead: Boolean(a.isRead),
      notificationStatus: a.notificationStatus || 'Delivered',
      assignedAt: a.assignedAt,
      respondedAt: a.respondedAt ?? null,
    });
  }

  return {
    masterLeadRow: masterLeadDocToRow(ml, {
      group_name: group?.name || '',
      group_icon: group?.icon || '🏢',
      recipients_count: assignments.length,
      interested_count: interestedCount,
      converted_count: convertedCount,
    }),
    recipients,
  };
}

export async function updateLeadAssignmentAndSync(assignmentId, body = {}) {
  const aid = scalar(assignmentId).trim();
  const existing = await LeadAssignment.findById(aid).lean();
  if (!existing) return null;

  const { status, responseInterest, responseNotes, isRead } = body;
  const nextStatus = status !== undefined ? scalar(status) : existing.status;
  const nextInterest = responseInterest !== undefined ? scalar(responseInterest) : (existing.responseStatus || 'Pending');
  const nextNotes = responseNotes !== undefined ? scalar(responseNotes) : (existing.responseNotes || '');
  const nextRead = isRead !== undefined ? Boolean(isRead) : Boolean(existing.isRead);
  const nextRespondedAt = nextInterest !== 'Pending' ? new Date() : (existing.respondedAt ?? null);

  const updated = await LeadAssignment.findOneAndUpdate(
    { _id: aid },
    {
      $set: {
        status: nextStatus,
        responseStatus: nextInterest,
        responseNotes: nextNotes,
        isRead: nextRead,
        respondedAt: nextRespondedAt,
      },
    },
    { new: true }
  ).lean();

  if (existing.customerLeadId) {
    await Lead.updateOne(
      { _id: existing.customerLeadId },
      { $set: { status: nextStatus, isRead: nextRead, notes: nextNotes, updatedAt: new Date() } }
    );
  }

  return {
    id: updated._id,
    master_lead_id: updated.masterLeadId,
    customer_id: updated.customerId,
    group_id: updated.groupId ?? null,
    customer_lead_id: updated.customerLeadId ?? null,
    status: updated.status,
    response_interest: updated.responseStatus,
    response_notes: updated.responseNotes,
    is_read: Boolean(updated.isRead),
    notification_status: updated.notificationStatus,
    assigned_at: updated.assignedAt,
    responded_at: updated.respondedAt ?? null,
  };
}
