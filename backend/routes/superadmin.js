/**
 * AdMafia Super Admin Control Center - Authoritative Express Router
 * Module Path: /api/superadmin/*
 * Provides verified MongoDB (Mongoose) endpoints for:
 * 1. Super Admin Dashboard (live metrics, wallet liabilities, audit actions)
 * 2. Check Queries (ticket management, replies, internal notes, assignments)
 * 3. Manage Finance (account-wise balance, global ledger, CSV reports)
 * 4. Check Refunds (refund queue, atomic wallet debit, duplicate prevention)
 * 5. Account Top-Up (UTR verification, atomic wallet credit, manual credit)
 * 6. Account Block / Activate (business/user suspension with mandatory reason & audit)
 * 7. Add User / Business (business onboarding & system user registration)
 * 8. Administrative Audit Logs
 */

import express from 'express';
import {
  Customer,
  SystemUser,
  Wallet,
  WalletTransaction,
  PaymentRecord,
  RefundRequest,
  TopupRequest,
  SupportQuery,
  MarketingCampaign,
  Lead,
  SuperAdminAuditLog,
} from '../models/index.js';
import { withMongoTransaction, genId } from '../repositories/tx.js';
import { evaluateCustomerProfileCompletion } from '../utils/profileCompletion.js';
import {
  HttpError,
  ciContains,
  ciExact,
  ciAny,
  round2,
  num,
  PAID_RECORD_STATUS,
  parsePaging,
  buildPagination,
  isDuplicateKey,
  withCompensation,
  creditWalletLedger,
  debitWalletForRefund,
} from '../repositories/superadminRepo.js';
import { hashPassword } from '../utils/passwordCrypto.js';

export const superadminRouter = express.Router();

// -----------------------------------------------------------------------------
// Shared helpers (row mappers keep the legacy snake_case response shapes)
// -----------------------------------------------------------------------------
const FINAL_REFUND_RE = /^(completed|approved|rejected)$/i;
const FINAL_TOPUP_RE = /^(approved|rejected)$/i;
const SUPER_ADMIN_ROLE_RE = /^super[\s_-]?admin$/i;

function sendError(res, err) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ ok: false, error: err.message });
  }
  return res.status(500).json({ ok: false, error: err.message });
}

/** Run an aggregation + $facet to get { total, rows } for a paginated list. */
async function runPaged(Model, stages, sort, offset, limit) {
  const [out] = await Model.aggregate([
    ...stages,
    {
      $facet: {
        total: [{ $count: 'n' }],
        rows: [{ $sort: sort }, { $skip: offset }, { $limit: limit }],
      },
    },
  ]).allowDiskUse(true);
  return { total: out?.total?.[0]?.n || 0, rows: out?.rows || [] };
}

const lookupCustomer = (as = 'c') => [
  { $lookup: { from: 'customers', localField: 'customerId', foreignField: '_id', as } },
  { $unwind: `$${as}` }, // inner join semantics
];

const lookupWallet = (as = 'w') => [
  { $lookup: { from: 'wallets', localField: 'customerId', foreignField: 'customerId', as } },
  { $unwind: { path: `$${as}`, preserveNullAndEmptyArrays: true } },
];

function mapAudit(l) {
  let details = l.details;
  if (typeof details !== 'string') details = JSON.stringify(details ?? {});
  return {
    id: l._id,
    actor_id: l.actorId ?? l.adminId ?? null,
    actor_name: l.actorName ?? null,
    actor_role: l.actorRole ?? 'Super Admin',
    action_type: l.actionType ?? l.action ?? null,
    target_type: l.targetType ?? l.targetEntity ?? null,
    target_id: l.targetId ?? null,
    reason: l.reason || null,
    details,
    ip_address: l.ipAddress || '',
    created_at: l.createdAt ?? l.timestamp ?? null,
  };
}

function mapWalletRow(w) {
  if (!w) return null;
  return {
    id: w._id,
    customer_id: w.customerId,
    available_balance: num(w.availableBalance),
    currency: w.currency || 'INR',
    daily_ad_spend: num(w.dailyAdSpend ?? 300),
    total_lifetime_paid: num(w.totalLifetimePaid),
    total_ad_spent: num(w.totalAdSpent),
    ad_campaign_active: Boolean(w.adCampaignActive),
    active_days: Array.isArray(w.activeDays) ? w.activeDays.join(',') : w.activeDays || null,
    schedule_preset: w.schedulePreset || 'custom',
    last_deducted_at: w.lastDeductedAt ?? null,
    booked_dates: Array.isArray(w.bookedDates) ? w.bookedDates.join(',') : w.bookedDates || null,
    created_at: w.createdAt ?? null,
    updated_at: w.updatedAt ?? null,
  };
}

function mapTxRow(t, c) {
  return {
    id: t._id,
    customer_id: t.customerId,
    wallet_id: t.walletId,
    company_name: c?.companyName,
    phone: c?.phone,
    email: c?.email,
    tx_type: t.txType,
    amount: num(t.amount),
    balance_after: num(t.balanceAfter),
    reference_utr: t.referenceUtr,
    description: t.description,
    payment_method: t.paymentMethod,
    status: t.status,
    currency: t.currency || 'INR',
    created_at: t.createdAt,
  };
}

function mapQueryRow(sq, c) {
  return {
    id: sq._id,
    customer_id: sq.customerId ?? null,
    company_name: sq.companyName || c?.companyName || '',
    contact_name: sq.contactName || c?.contactPerson || '',
    contact_email: sq.contactEmail || c?.email || '',
    contact_phone: sq.contactPhone || c?.phone || '',
    category: sq.category,
    subject: sq.subject,
    priority: sq.priority,
    assigned_admin: sq.assignedAgent || '',
    internal_notes: sq.internalNotes || '',
    last_replied_at: sq.lastRepliedAt ?? null,
    last_replied_by: sq.lastRepliedBy || '',
    sla_breached: Boolean(sq.slaBreached),
    hours_open: num(sq.hoursOpen),
    status: sq.status,
    created_at: sq.createdAt,
    resolved_at: sq.resolvedAt ?? null,
  };
}

function mapMessageRow(m, queryId) {
  return {
    id: m.messageId || String(m._id),
    query_id: queryId,
    sender_type: m.senderType || (m.senderRole === 'agent' ? 'admin' : m.senderRole || 'customer'),
    sender_name: m.senderName || m.sender,
    message: m.message,
    is_internal_note: Boolean(m.isInternalNote),
    created_at: m.createdAt,
  };
}

function mapRefundBase(rf) {
  return {
    original_tx_ref: rf.originalTxRef || null,
    amount: num(rf.amount),
    reason: rf.reason,
    status: rf.status,
    rejection_reason: rf.rejectionReason ?? null,
    review_notes: rf.reviewNotes ?? null,
    reviewed_by: rf.reviewedBy ?? null,
    reviewed_at: rf.reviewedAt ?? null,
    provider_ref: rf.providerRef ?? rf.payoutUtr ?? null,
  };
}

function mapTopupRow(tp, c, w) {
  return {
    id: tp._id,
    customer_id: tp.customerId,
    company_name: c?.companyName,
    contact_person: c?.contactPerson,
    phone: c?.phone,
    email: c?.email,
    available_balance: w ? num(w.availableBalance) : null,
    amount: num(tp.amount),
    payment_method: tp.paymentMethod || 'Razorpay Secure (UPI/Card)',
    reference_utr: tp.referenceUtr,
    payment_evidence_url: tp.evidenceUrl || tp.proofUrl || null,
    notes: tp.notes || null,
    status: tp.status,
    rejection_reason: tp.rejectionReason ?? null,
    processed_by: tp.processedBy ?? tp.approvedBy ?? null,
    processed_at: tp.processedAt ?? tp.approvedAt ?? null,
    created_at: tp.createdAt,
    updated_at: tp.updatedAt ?? tp.createdAt,
  };
}

async function sumRefunds(match) {
  const r = await RefundRequest.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: '$amount' }, n: { $sum: 1 } } }]);
  return { total: round2(r[0]?.total || 0), count: r[0]?.n || 0 };
}

// Helper to log administrative audit events
export async function logSuperAdminAudit({
  actorId = 'superadmin',
  actorName = 'Super Admin',
  actorRole = 'Super Admin',
  actionType,
  targetType,
  targetId,
  reason = '',
  details = {},
  ipAddress = '',
}) {
  try {
    let detailsObj = details;
    if (typeof details === 'string') {
      try {
        detailsObj = JSON.parse(details);
      } catch {
        detailsObj = { raw: details };
      }
    }
    const now = new Date();
    await SuperAdminAuditLog.create({
      _id: genId('audit'),
      actorId,
      actorName,
      actorRole,
      actionType,
      targetType,
      targetId,
      reason: reason || '',
      details: detailsObj ?? {},
      ipAddress: ipAddress || '127.0.0.1',
      // fields of the Mongo-native audit schema, kept in sync
      action: actionType,
      adminId: actorId,
      targetEntity: targetType,
      timestamp: now,
      createdAt: now,
    });
  } catch (err) {
    console.error('[logSuperAdminAudit] Failed to record audit log:', err.message);
  }
}

// =============================================================================
// 1. DASHBOARD OVERVIEW & LIVE METRICS (/api/superadmin/dashboard/summary)
// =============================================================================
superadminRouter.get('/dashboard/summary', async (req, res) => {
  try {
    const [
      totalBusinesses,
      totalUsers,
      activeAccounts,
      blockedAccounts,
      pendingQueries,
      pendingRefunds,
      pendingTopups,
      liabilityAgg,
      recentTx,
      recentAudit,
    ] = await Promise.all([
      Customer.countDocuments({}),
      SystemUser.countDocuments({}),
      Customer.countDocuments({ status: 'active' }),
      Customer.countDocuments({ status: 'suspended' }),
      SupportQuery.countDocuments({ status: { $not: /^resolved$/i } }),
      RefundRequest.countDocuments({ status: { $in: ciAny('Pending') } }),
      TopupRequest.countDocuments({ status: { $in: ciAny('Pending') } }),
      Wallet.aggregate([{ $group: { _id: null, total: { $sum: '$availableBalance' } } }]),
      WalletTransaction.aggregate([
        { $sort: { createdAt: -1 } },
        ...lookupCustomer('c'),
        { $limit: 8 },
      ]),
      SuperAdminAuditLog.find({}).sort({ createdAt: -1, timestamp: -1 }).limit(8).lean(),
    ]);

    res.json({
      ok: true,
      summary: {
        totalBusinesses: totalBusinesses || 0,
        totalUsers: totalUsers || 0,
        activeAccounts: activeAccounts || 0,
        blockedAccounts: blockedAccounts || 0,
        pendingQueries: pendingQueries || 0,
        pendingRefunds: pendingRefunds || 0,
        pendingTopups: pendingTopups || 0,
        totalWalletLiability: round2(liabilityAgg[0]?.total || 0),
      },
      recentTransactions: recentTx.map((t) => ({
        id: t._id,
        customer_id: t.customerId,
        company_name: t.c?.companyName,
        tx_type: t.txType,
        amount: num(t.amount),
        reference_utr: t.referenceUtr,
        status: t.status,
        created_at: t.createdAt,
      })),
      recentAuditActions: recentAudit.map((l) => {
        const a = mapAudit(l);
        return {
          id: a.id,
          actor_name: a.actor_name,
          action_type: a.action_type,
          target_type: a.target_type,
          target_id: a.target_id,
          reason: a.reason,
          created_at: a.created_at,
        };
      }),
    });
  } catch (err) {
    console.error('[GET /api/superadmin/dashboard/summary]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// =============================================================================
// 2. CHECK QUERIES (/api/superadmin/queries)
// =============================================================================
superadminRouter.get('/queries', async (req, res) => {
  try {
    const { status, priority, search } = req.query;
    const { pageNum, limitNum, offset } = parsePaging(req.query, 20);

    const stages = [
      ...[
        { $lookup: { from: 'customers', localField: 'customerId', foreignField: '_id', as: 'c' } },
        { $unwind: { path: '$c', preserveNullAndEmptyArrays: true } },
        {
          $addFields: {
            _company: {
              $cond: [
                { $gt: [{ $strLenCP: { $ifNull: ['$companyName', ''] } }, 0] },
                '$companyName',
                { $ifNull: ['$c.companyName', ''] },
              ],
            },
            _rank: {
              $switch: {
                branches: [
                  { case: { $eq: [{ $toLower: { $ifNull: ['$status', ''] } }, 'open'] }, then: 1 },
                  { case: { $eq: [{ $toLower: { $ifNull: ['$status', ''] } }, 'pending'] }, then: 2 },
                ],
                default: 3,
              },
            },
          },
        },
      ],
    ];

    const match = {};
    if (status && status !== 'all') match.status = ciExact(status);
    if (priority && priority !== 'all') match.priority = ciExact(priority);
    if (search && search.trim()) {
      const rx = ciContains(search);
      match.$or = [{ subject: rx }, { _company: rx }, { category: rx }, { _id: rx }];
    }
    if (Object.keys(match).length) stages.push({ $match: match });

    const { total, rows } = await runPaged(SupportQuery, stages, { _rank: 1, createdAt: -1 }, offset, limitNum);

    res.json({
      ok: true,
      queries: rows.map((sq) => ({
        ...mapQueryRow(sq, sq.c),
        company_name: sq._company,
        customer_contact: sq.c?.contactPerson ?? null,
        customer_phone: sq.c?.phone ?? null,
      })),
      pagination: buildPagination(total, pageNum, limitNum),
    });
  } catch (err) {
    console.error('[GET /api/superadmin/queries]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Single query detail with conversation thread
superadminRouter.get('/queries/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const sq = await SupportQuery.findById(id).lean();

    if (!sq) {
      return res.status(404).json({ ok: false, error: 'Support query not found.' });
    }

    const c = sq.customerId ? await Customer.findById(sq.customerId).lean() : null;
    const messages = (sq.messages || [])
      .map((m) => mapMessageRow(m, id))
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    res.json({
      ok: true,
      query: {
        ...mapQueryRow(sq, c),
        customer_contact: c?.contactPerson ?? null,
        customer_phone: c?.phone ?? null,
        customer_email: c?.email ?? null,
      },
      messages,
    });
  } catch (err) {
    console.error('[GET /api/superadmin/queries/:id]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Post a reply or internal note to a query
superadminRouter.post('/queries/:id/reply', async (req, res) => {
  try {
    const { id } = req.params;
    const { message, isInternalNote = false, adminName = 'Super Admin', adminId = 'superadmin' } = req.body || {};

    if (!message || !message.trim()) {
      return res.status(400).json({ ok: false, error: 'Reply message cannot be empty.' });
    }

    const exists = await SupportQuery.exists({ _id: id });
    if (!exists) {
      return res.status(404).json({ ok: false, error: 'Query not found.' });
    }

    const msgId = genId('msg');
    const senderType = isInternalNote ? 'internal_note' : 'admin';

    await withMongoTransaction(async (session) => {
      const now = new Date();
      const update = {
        $push: {
          messages: {
            messageId: msgId,
            sender: adminName,
            senderName: adminName,
            senderRole: 'agent',
            senderType,
            message: message.trim(),
            isInternalNote: Boolean(isInternalNote),
            attachments: [],
            createdAt: now,
          },
        },
      };

      // If not internal note, update query last_replied_at
      if (!isInternalNote) {
        update.$set = { lastRepliedAt: now, lastRepliedBy: adminName, updatedAt: now };
      }
      await SupportQuery.updateOne({ _id: id }, update, { session });

      if (!isInternalNote) {
        // status = CASE WHEN status = 'open' THEN 'pending' ELSE status END
        await SupportQuery.updateOne({ _id: id, status: ciExact('open') }, { $set: { status: 'pending' } }, { session });
      }
    });

    await logSuperAdminAudit({
      actorId: adminId,
      actorName: adminName,
      actionType: isInternalNote ? 'QUERY_INTERNAL_NOTE' : 'QUERY_REPLIED',
      targetType: 'query',
      targetId: id,
      details: { message: message.trim().slice(0, 100), isInternalNote },
    });

    res.json({ ok: true, messageId: msgId, message: 'Reply sent successfully.' });
  } catch (err) {
    console.error('[POST /api/superadmin/queries/:id/reply]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update query status or assignment
superadminRouter.patch('/queries/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, assignedAdmin, internalNotes, adminName = 'Super Admin', adminId = 'superadmin' } = req.body || {};

    const current = await SupportQuery.findById(id).lean();
    if (!current) {
      return res.status(404).json({ ok: false, error: 'Query not found.' });
    }

    const newStatus = status || current.status;
    const isResolved = newStatus === 'resolved';

    const now = new Date();
    const $set = { status: newStatus, updatedAt: now };
    if (assignedAdmin) $set.assignedAgent = assignedAdmin; // COALESCE($2, assigned_admin)
    if (internalNotes) $set.internalNotes = internalNotes; // COALESCE($3, internal_notes)
    if (isResolved) $set.resolvedAt = now;

    await SupportQuery.updateOne({ _id: id }, { $set });

    await logSuperAdminAudit({
      actorId: adminId,
      actorName: adminName,
      actionType: 'QUERY_STATUS_CHANGED',
      targetType: 'query',
      targetId: id,
      details: { previousStatus: current.status, newStatus, assignedAdmin },
    });

    res.json({ ok: true, message: `Query status updated to ${newStatus}.` });
  } catch (err) {
    console.error('[PATCH /api/superadmin/queries/:id/status]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Create new customer query
superadminRouter.post('/queries', async (req, res) => {
  try {
    const {
      customerId,
      companyName,
      subject,
      category = 'Account Support',
      priority = 'normal',
      message,
      adminName = 'Super Admin',
      adminId = 'superadmin',
    } = req.body || {};

    if (!subject || !subject.trim()) {
      return res.status(400).json({ ok: false, error: 'Query subject is required.' });
    }

    let customer = null;
    if (customerId) {
      customer = await Customer.findById(customerId).lean();
    }

    const resolvedCompanyName = companyName || customer?.companyName || 'Direct Business Enquiry';
    const queryId = genId('query');

    await withMongoTransaction(async (session) => {
      const now = new Date();
      const messages = [];

      if (message && message.trim()) {
        messages.push({
          messageId: genId('msg'),
          sender: adminName,
          senderName: adminName,
          senderRole: 'agent',
          senderType: 'admin',
          message: message.trim(),
          isInternalNote: false,
          attachments: [],
          createdAt: now,
        });
      }

      await SupportQuery.create(
        [
          {
            _id: queryId,
            customerId: customerId || null,
            ticketNumber: `TICK-${queryId}`,
            companyName: resolvedCompanyName,
            category,
            subject: subject.trim(),
            priority,
            status: 'open',
            contactName: customer?.contactPerson || 'Administrator',
            contactEmail: customer?.email || '',
            contactPhone: customer?.phone || '',
            messages,
            createdAt: now,
          },
        ],
        { session }
      );
    });

    await logSuperAdminAudit({
      actorId: adminId,
      actorName: adminName,
      actionType: 'QUERY_CREATED',
      targetType: 'query',
      targetId: queryId,
      details: { subject: subject.trim(), category, companyName: resolvedCompanyName },
    });

    res.status(201).json({ ok: true, queryId, message: 'Query registered successfully.' });
  } catch (err) {
    console.error('[POST /api/superadmin/queries]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// =============================================================================
// 3. MANAGE FINANCE (/api/superadmin/finance/*)
// =============================================================================
superadminRouter.get('/finance/summary', async (req, res) => {
  try {
    const [walletsAgg, txAgg, pendingRefund, pendingTopupAgg] = await Promise.all([
      Wallet.aggregate([
        {
          $group: {
            _id: null,
            total_balance: { $sum: '$availableBalance' },
            total_lifetime_paid: { $sum: '$totalLifetimePaid' },
            total_ad_spent: { $sum: '$totalAdSpent' },
            total_wallets: { $sum: 1 },
          },
        },
      ]),
      WalletTransaction.aggregate([
        {
          $group: {
            _id: null,
            total_tx_count: { $sum: 1 },
            total_credited: { $sum: { $cond: [{ $eq: ['$txType', 'Credit'] }, '$amount', 0] } },
            total_debited: { $sum: { $cond: [{ $eq: ['$txType', 'Debit'] }, '$amount', 0] } },
          },
        },
      ]),
      sumRefunds({ status: { $in: ciAny('Pending') } }),
      TopupRequest.aggregate([
        { $match: { status: { $in: ciAny('Pending') } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);

    const w = walletsAgg[0] || {};
    const t = txAgg[0] || {};

    res.json({
      ok: true,
      summary: {
        totalWalletLiability: round2(w.total_balance),
        totalLifetimePaid: round2(w.total_lifetime_paid),
        totalCampaignSpent: round2(w.total_ad_spent),
        totalWallets: w.total_wallets || 0,
        totalCredited: round2(t.total_credited),
        totalDebited: round2(t.total_debited),
        totalTxCount: t.total_tx_count || 0,
        pendingRefundsAmount: pendingRefund.total,
        pendingTopupsAmount: round2(pendingTopupAgg[0]?.total),
      },
    });
  } catch (err) {
    console.error('[GET /api/superadmin/finance/summary]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Account-wise financial overview
superadminRouter.get('/finance/accounts', async (req, res) => {
  try {
    const { search } = req.query;
    const { pageNum, limitNum, offset } = parsePaging(req.query, 25);

    const match = {};
    if (search && search.trim()) {
      const rx = ciContains(search);
      match.$or = [{ companyName: rx }, { contactPerson: rx }, { phone: rx }, { _id: rx }];
    }

    const stages = [
      { $match: match },
      { $lookup: { from: 'wallets', localField: '_id', foreignField: 'customerId', as: 'w' } },
      { $unwind: { path: '$w', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'wallet_transactions',
          localField: '_id',
          foreignField: 'customerId',
          pipeline: [{ $group: { _id: null, last: { $max: '$createdAt' } } }],
          as: 'lt',
        },
      },
    ];

    // available_balance DESC NULLS LAST, registered_at DESC
    const { total, rows } = await runPaged(
      Customer,
      stages,
      { 'w.availableBalance': -1, registeredAt: -1 },
      offset,
      limitNum
    );

    res.json({
      ok: true,
      accounts: rows.map((c) => ({
        id: c._id,
        company_name: c.companyName,
        contact_person: c.contactPerson,
        phone: c.phone,
        email: c.email,
        city: c.city,
        status: c.status,
        wallet_id: c.w?._id ?? null,
        available_balance: num(c.w?.availableBalance),
        total_lifetime_paid: num(c.w?.totalLifetimePaid),
        total_ad_spent: num(c.w?.totalAdSpent),
        daily_ad_spend: num(c.w?.dailyAdSpend ?? 300),
        ad_campaign_active: Boolean(c.w?.adCampaignActive),
        last_transaction_at: c.lt?.[0]?.last ?? null,
      })),
      pagination: buildPagination(total, pageNum, limitNum),
    });
  } catch (err) {
    console.error('[GET /api/superadmin/finance/accounts]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

function parseDateParam(v, name) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`invalid input syntax for type timestamp with time zone: "${v}" (${name})`);
  }
  return d;
}

// Global transaction ledger
superadminRouter.get('/finance/transactions', async (req, res) => {
  try {
    const { txType, search, startDate, endDate } = req.query;
    const { pageNum, limitNum, offset } = parsePaging(req.query, 25);

    const pre = {};
    if (txType && txType !== 'all') pre.txType = txType;
    if (startDate || endDate) {
      pre.createdAt = {};
      if (startDate) pre.createdAt.$gte = parseDateParam(startDate, 'startDate');
      if (endDate) pre.createdAt.$lte = parseDateParam(endDate, 'endDate');
    }

    const stages = [{ $match: pre }, ...lookupCustomer('c')];
    if (search && search.trim()) {
      const rx = ciContains(search);
      stages.push({
        $match: { $or: [{ 'c.companyName': rx }, { referenceUtr: rx }, { description: rx }, { _id: rx }] },
      });
    }

    const { total, rows } = await runPaged(WalletTransaction, stages, { createdAt: -1 }, offset, limitNum);

    res.json({
      ok: true,
      transactions: rows.map((t) => {
        const r = mapTxRow(t, t.c);
        delete r.wallet_id;
        delete r.currency;
        return r;
      }),
      pagination: buildPagination(total, pageNum, limitNum),
    });
  } catch (err) {
    console.error('[GET /api/superadmin/finance/transactions]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Isolated single account ledger
superadminRouter.get('/finance/accounts/:customerId/ledger', async (req, res) => {
  try {
    const { customerId } = req.params;

    const [cust, wallet, txs] = await Promise.all([
      Customer.findById(customerId).lean(),
      Wallet.findOne({ customerId }).lean(),
      WalletTransaction.find({ customerId }).sort({ createdAt: -1 }).limit(100).lean(),
    ]);

    if (!cust) {
      return res.status(404).json({ ok: false, error: 'Customer account not found.' });
    }

    res.json({
      ok: true,
      customer: {
        id: cust._id,
        company_name: cust.companyName,
        contact_person: cust.contactPerson,
        phone: cust.phone,
        email: cust.email,
        status: cust.status,
      },
      wallet: mapWalletRow(wallet),
      transactions: txs.map((t) => {
        const r = mapTxRow(t, null);
        delete r.company_name;
        delete r.phone;
        delete r.email;
        return r;
      }),
    });
  } catch (err) {
    console.error('[GET /api/superadmin/finance/accounts/:customerId/ledger]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// CSV Export for transactions
superadminRouter.get('/finance/export', async (req, res) => {
  try {
    const rows = await WalletTransaction.aggregate([
      { $sort: { createdAt: -1 } },
      ...lookupCustomer('c'),
      { $limit: 1000 },
    ]);

    const money = (n) => num(n).toFixed(2);

    let csv = 'Transaction ID,Company Name,Customer ID,Type,Amount (INR),Balance After,Reference UTR,Payment Mode,Status,Description,Date\n';
    rows.forEach((t) => {
      const r = {
        id: t._id,
        company_name: t.c?.companyName,
        customer_id: t.customerId,
        tx_type: t.txType,
        amount: money(t.amount),
        balance_after: money(t.balanceAfter),
        reference_utr: t.referenceUtr,
        payment_method: t.paymentMethod,
        status: t.status,
        description: t.description,
        created_at: t.createdAt,
      };
      csv += `"${r.id}","${(r.company_name || '').replace(/"/g, '""')}","${r.customer_id}","${r.tx_type}","${r.amount}","${r.balance_after}","${r.reference_utr || ''}","${r.payment_method}","${r.status}","${(r.description || '').replace(/"/g, '""')}","${r.created_at}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="admafia_finance_ledger.csv"');
    res.send(csv);
  } catch (err) {
    console.error('[GET /api/superadmin/finance/export]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// =============================================================================
// 4. CHECK REFUNDS (/api/superadmin/refunds/*)
// =============================================================================

// Pipeline stages that attach wallet + "has paid record" + "has verified credit tx" flags to customers
function paidCustomerStages({ includeVerifiedCredit }) {
  const stages = [
    { $lookup: { from: 'wallets', localField: '_id', foreignField: 'customerId', as: 'wallet' } },
    { $unwind: { path: '$wallet', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'payment_records',
        localField: '_id',
        foreignField: 'customerId',
        pipeline: [{ $match: { status: { $in: PAID_RECORD_STATUS } } }, { $limit: 1 }, { $project: { _id: 1 } }],
        as: 'paidPr',
      },
    },
  ];
  const or = [{ paymentStatus: 'paid' }, { 'wallet.totalLifetimePaid': { $gt: 0 } }, { 'paidPr.0': { $exists: true } }];
  if (includeVerifiedCredit) {
    stages.push({
      $lookup: {
        from: 'wallet_transactions',
        localField: '_id',
        foreignField: 'customerId',
        pipeline: [{ $match: { txType: 'Credit', status: 'Verified ✓' } }, { $limit: 1 }, { $project: { _id: 1 } }],
        as: 'verCredit',
      },
    });
    or.push({ 'verCredit.0': { $exists: true } });
  }
  stages.push({ $match: { $or: or } });
  return stages;
}

// Get all registered customers who completed payment with refund eligibility
superadminRouter.get('/refunds/paid-customers', async (req, res) => {
  try {
    const { search } = req.query;
    const { pageNum, limitNum, offset } = parsePaging(req.query, 25);

    const searchStage = [];
    if (search && search.trim()) {
      const rx = ciContains(search);
      searchStage.push({
        $match: { $or: [{ companyName: rx }, { contactPerson: rx }, { phone: rx }, { email: rx }, { _id: rx }] },
      });
    }

    const stages = [
      ...searchStage,
      ...paidCustomerStages({ includeVerifiedCredit: true }),
      { $addFields: { _noWallet: { $cond: [{ $ifNull: ['$wallet', false] }, 0, 1] } } },
    ];

    const { total, rows } = await runPaged(
      Customer,
      stages,
      { _noWallet: -1, 'wallet.availableBalance': -1, 'wallet.totalLifetimePaid': -1, registeredAt: -1 },
      offset,
      limitNum
    );

    const ids = rows.map((r) => r._id);
    const [prs, refunds] = await Promise.all([
      ids.length ? PaymentRecord.find({ customerId: { $in: ids } }).sort({ createdAt: -1 }).lean() : [],
      ids.length ? RefundRequest.find({ customerId: { $in: ids } }).lean() : [],
    ]);
    const prsBy = new Map();
    const refBy = new Map();
    prs.forEach((p) => (prsBy.get(p.customerId) || prsBy.set(p.customerId, []).get(p.customerId)).push(p));
    refunds.forEach((r) => (refBy.get(r.customerId) || refBy.set(r.customerId, []).get(r.customerId)).push(r));

    const isPaid = (s) => /^paid$/i.test(s || '') || /^verified/i.test(s || '');
    const paidCustomers = rows.map((c) => {
      const w = c.wallet || {};
      const myPrs = prsBy.get(c._id) || []; // sorted by paid_at DESC
      const myRefs = refBy.get(c._id) || [];
      const paidPrs = myPrs.filter((p) => isPaid(p.status));
      const approvedSum = myRefs
        .filter((r) => /^(approved|completed)$/i.test(r.status || ''))
        .reduce((s, r) => s + num(r.amount), 0);
      const pendingSum = myRefs.filter((r) => /^pending$/i.test(r.status || '')).reduce((s, r) => s + num(r.amount), 0);
      const bal = num(w.availableBalance);
      const lifetime = num(w.totalLifetimePaid);
      const eligible = Math.max(0, Math.min(bal, Math.max(0, lifetime - approvedSum - pendingSum)));

      return {
        id: c._id,
        company_name: c.companyName,
        contact_person: c.contactPerson,
        phone: c.phone,
        email: c.email,
        city: c.city,
        state: c.state,
        status: c.status,
        payment_status: c.paymentStatus,
        registered_at: c.registeredAt,
        available_balance: round2(bal),
        total_lifetime_paid: round2(lifetime),
        total_ad_spent: round2(num(w.totalAdSpent)),
        paid_receipts_count: paidPrs.length,
        last_payment_date: myPrs[0]?.createdAt ?? null,
        last_utr_ref: myPrs[0]?.referenceUtr ?? null,
        total_refund_requests: myRefs.length,
        total_refunded_amount: round2(approvedSum),
        pending_refund_amount: round2(pendingSum),
        eligible_bank_refundable: round2(eligible),
        verified_deposits: paidPrs.map((p) => ({
          receipt_number: p.receiptNumber,
          utr_reference: p.referenceUtr,
          amount: num(p.amount),
          paid_at: p.createdAt,
          payment_mode: p.paymentMethod,
        })),
      };
    });

    // Authoritative Summary stats
    const [statAgg, refunded] = await Promise.all([
      Customer.aggregate([
        ...paidCustomerStages({ includeVerifiedCredit: false }),
        {
          $group: {
            _id: null,
            total_paid_customers: { $sum: 1 },
            total_amount_paid: { $sum: '$wallet.totalLifetimePaid' },
            total_refundable_balance: { $sum: '$wallet.availableBalance' },
          },
        },
      ]),
      sumRefunds({ status: { $in: ciAny('Approved', 'Completed') } }),
    ]);
    const st = statAgg[0] || {};

    res.json({
      ok: true,
      paidCustomers,
      summary: {
        totalPaidCustomers: st.total_paid_customers || 0,
        totalAmountPaid: round2(st.total_amount_paid),
        totalRefundableBalance: round2(st.total_refundable_balance),
        totalRefundedAmount: refunded.total,
      },
      pagination: buildPagination(total, pageNum, limitNum),
    });
  } catch (err) {
    console.error('[GET /api/superadmin/refunds/paid-customers]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

superadminRouter.get('/refunds', async (req, res) => {
  try {
    const { status, search } = req.query;
    const { pageNum, limitNum, offset } = parsePaging(req.query, 20);

    const pre = {};
    if (status && status !== 'all') pre.status = ciExact(status);

    const stages = [
      { $match: pre },
      ...lookupCustomer('c'),
      ...lookupWallet('w'),
      {
        $addFields: {
          _rank: {
            $switch: {
              branches: [
                { case: { $eq: [{ $toLower: { $ifNull: ['$status', ''] } }, 'pending'] }, then: 1 },
                { case: { $eq: [{ $toLower: { $ifNull: ['$status', ''] } }, 'under review'] }, then: 2 },
              ],
              default: 3,
            },
          },
        },
      },
    ];
    if (search && search.trim()) {
      const rx = ciContains(search);
      stages.push({
        $match: { $or: [{ 'c.companyName': rx }, { _id: rx }, { reason: rx }, { originalTxRef: rx }] },
      });
    }

    const { total, rows } = await runPaged(RefundRequest, stages, { _rank: 1, createdAt: -1 }, offset, limitNum);

    res.json({
      ok: true,
      refunds: rows.map((rf) => ({
        id: rf._id,
        customer_id: rf.customerId,
        company_name: rf.c?.companyName,
        contact_person: rf.c?.contactPerson,
        phone: rf.c?.phone,
        email: rf.c?.email,
        available_balance: rf.w ? num(rf.w.availableBalance) : null,
        ...mapRefundBase(rf),
        supporting_info: rf.supportingInfo || null,
        created_at: rf.createdAt,
        updated_at: rf.updatedAt ?? rf.createdAt,
      })),
      pagination: buildPagination(total, pageNum, limitNum),
    });
  } catch (err) {
    console.error('[GET /api/superadmin/refunds]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Submit a new refund request (with Authoritative Eligibility & Overdraft Protection)
superadminRouter.post('/refunds', async (req, res) => {
  try {
    const {
      customerId,
      amount,
      reason,
      supportingInfo = '',
      originalTxRef = '',
      adminName = 'Super Admin',
      adminId = 'superadmin',
    } = req.body || {};

    const refundAmount = parseFloat(amount);
    if (!customerId) return res.status(400).json({ ok: false, error: 'Customer ID is required.' });
    if (!refundAmount || refundAmount <= 0) {
      return res.status(400).json({ ok: false, error: 'Refund amount must be greater than zero.' });
    }
    if (!reason || !reason.trim()) {
      return res.status(400).json({ ok: false, error: 'Refund reason is mandatory.' });
    }

    const [customer, wallet, prevRefunds, pendingRefunds] = await Promise.all([
      Customer.findById(customerId).lean(),
      Wallet.findOne({ customerId }).lean(),
      sumRefunds({ customerId, status: { $in: ciAny('Approved', 'Completed') } }),
      sumRefunds({ customerId, status: { $in: ciAny('Pending') } }),
    ]);

    if (!customer) {
      return res.status(404).json({ ok: false, error: 'Customer not found.' });
    }

    const currentBal = num(wallet?.availableBalance);
    const totalLifetimePaid = num(wallet?.totalLifetimePaid);
    const totalPreviouslyRefunded = prevRefunds.total;
    const totalPendingRefunds = pendingRefunds.total;

    // Safeguard 1: Separate wallet balance from bank refund eligibility
    // Refund cannot exceed current wallet available balance
    if (refundAmount > currentBal) {
      return res.status(400).json({
        ok: false,
        error: `Requested refund (₹${refundAmount.toFixed(2)}) exceeds current wallet available balance (₹${currentBal.toFixed(2)}).`,
      });
    }

    // Safeguard 2: Refund cannot exceed actual deposited money minus already refunded minus pending claims
    if (totalLifetimePaid > 0) {
      const eligibleBankRefundable = Math.max(0, totalLifetimePaid - totalPreviouslyRefunded - totalPendingRefunds);
      if (refundAmount > eligibleBankRefundable) {
        return res.status(400).json({
          ok: false,
          error: `Requested refund (₹${refundAmount.toFixed(2)}) exceeds eligible bank-refundable cap (₹${eligibleBankRefundable.toFixed(2)}). Total lifetime deposited: ₹${totalLifetimePaid.toFixed(2)}, Already refunded: ₹${totalPreviouslyRefunded.toFixed(2)}, Pending requests: ₹${totalPendingRefunds.toFixed(2)}.`,
        });
      }
    }

    const refundId = genId('ref');
    const now = new Date();
    await RefundRequest.create({
      _id: refundId,
      customerId,
      walletId: wallet?._id || '',
      originalTxRef: originalTxRef.trim(),
      amount: refundAmount,
      reason: reason.trim(),
      supportingInfo: supportingInfo.trim(),
      status: 'Pending',
      createdAt: now,
      updatedAt: now,
    });

    await logSuperAdminAudit({
      actorId: adminId,
      actorName: adminName,
      actionType: 'REFUND_REQUESTED',
      targetType: 'refund',
      targetId: refundId,
      details: { customerId, amount: refundAmount, reason: reason.trim() },
    });

    res.status(201).json({ ok: true, refundId, message: 'Refund request registered successfully.' });
  } catch (err) {
    console.error('[POST /api/superadmin/refunds]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Review refund decision (Approve or Reject with atomic safeguards and concurrency guards)
superadminRouter.patch('/refunds/:id/review', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      decision, // 'Approved' or 'Rejected'
      status, // alias for decision
      reason,
      reviewNotes = '',
      adminName = 'Super Admin',
      adminId = 'superadmin',
    } = req.body || {};

    const finalDecision = decision || status;
    if (!['Approved', 'Rejected'].includes(finalDecision)) {
      return res.status(400).json({ ok: false, error: 'Decision must be Approved or Rejected.' });
    }

    if (finalDecision === 'Rejected' && (!reason || !reason.trim())) {
      return res.status(400).json({ ok: false, error: 'Mandatory rejection reason must be provided.' });
    }

    let reviewResult = null;

    await withMongoTransaction((session) =>
      withCompensation(session, async (registerUndo) => {
        const refund = await RefundRequest.findById(id).session(session).lean();
        if (!refund) {
          throw new HttpError(404, 'Refund request not found.');
        }

        if (/^(completed|approved)$/i.test(refund.status || '')) {
          throw new HttpError(409, 'This refund request has already been approved and completed.');
        }
        if (/^rejected$/i.test(refund.status || '')) {
          throw new HttpError(409, 'This refund request has already been rejected.');
        }

        const refundAmount = Number(refund.amount);
        const now = new Date();

        // Concurrency safeguard: only one reviewer can move the request out of a non-final state.
        const claimFilter = { _id: id, status: { $not: FINAL_REFUND_RE } };

        if (finalDecision === 'Rejected') {
          const rejected = await RefundRequest.findOneAndUpdate(
            claimFilter,
            {
              $set: {
                status: 'Rejected',
                rejectionReason: reason.trim(),
                reviewNotes: reviewNotes.trim(),
                reviewedBy: adminName,
                reviewedAt: now,
                updatedAt: now,
              },
            },
            { new: true, session }
          );
          if (!rejected) {
            throw new HttpError(409, 'This refund request has already been processed.');
          }

          reviewResult = {
            ok: true,
            status: 'Rejected',
            message: 'Refund request rejected with recorded reason.',
          };
          return;
        }

        // 1. Claim the request (atomic; flips it to Completed) so a concurrent approval cannot double-debit.
        const providerRef = `REF_PAY_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
        const claimed = await RefundRequest.findOneAndUpdate(
          claimFilter,
          {
            $set: {
              status: 'Completed',
              reviewNotes: reviewNotes.trim() || 'Approved by Super Admin',
              reviewedBy: adminName,
              reviewedAt: now,
              providerRef,
              payoutUtr: providerRef,
              updatedAt: now,
            },
          },
          { new: true, session }
        );
        if (!claimed) {
          throw new HttpError(409, 'This refund request has already been processed.');
        }
        registerUndo(() =>
          RefundRequest.updateOne(
            { _id: id },
            {
              $set: {
                status: refund.status,
                reviewNotes: refund.reviewNotes ?? null,
                reviewedBy: refund.reviewedBy ?? null,
                reviewedAt: refund.reviewedAt ?? null,
                providerRef: refund.providerRef ?? null,
                payoutUtr: refund.payoutUtr ?? null,
              },
            }
          )
        );

        // 2 + 3. Atomic conditional wallet debit (balance >= amount) and immutable ledger Debit row
        await debitWalletForRefund({
          session,
          registerUndo,
          customerId: refund.customerId,
          amount: refundAmount,
          referenceUtr: providerRef,
          description: `Super Admin Approved Refund (Ref: ${id}) - ${reason || 'Processed'}`,
        });

        reviewResult = {
          ok: true,
          status: 'Completed',
          providerRef,
          message: `Refund of ₹${refundAmount.toFixed(2)} approved and deducted atomically from wallet.`,
        };
      })
    );

    if (reviewResult && reviewResult.status === 'Completed') {
      await logSuperAdminAudit({
        actorId: adminId,
        actorName: adminName,
        actionType: 'REFUND_APPROVED',
        targetType: 'refund',
        targetId: id,
        reason: reason || 'Approved and credited back to customer banking source',
        details: { providerRef: reviewResult.providerRef },
      });
    } else if (reviewResult && reviewResult.status === 'Rejected') {
      await logSuperAdminAudit({
        actorId: adminId,
        actorName: adminName,
        actionType: 'REFUND_REJECTED',
        targetType: 'refund',
        targetId: id,
        reason: reason.trim(),
        details: {},
      });
    }

    res.json(reviewResult);
  } catch (err) {
    console.error('[PATCH /api/superadmin/refunds/:id/review]', err);
    sendError(res, err);
  }
});

// =============================================================================
// 4B. REFUND RECONCILIATION & AUDIT HISTORY
// Original Deposit (UTR) ➔ Eligible Cap ➔ Refund Request ➔ Provider Ref ➔ Final State
// =============================================================================
superadminRouter.get('/refunds/reconciliation', async (req, res) => {
  try {
    const { search, status = 'all' } = req.query;
    const { pageNum, limitNum, offset } = parsePaging(req.query, 25);

    const pre = {};
    if (status && status !== 'all') pre.status = ciExact(status);

    const stages = [{ $match: pre }, ...lookupCustomer('c'), ...lookupWallet('w')];
    if (search && search.trim()) {
      const rx = ciContains(search);
      stages.push({
        $match: {
          $or: [{ 'c.companyName': rx }, { _id: rx }, { originalTxRef: rx }, { providerRef: rx }],
        },
      });
    }

    const { total, rows } = await runPaged(RefundRequest, stages, { createdAt: -1 }, offset, limitNum);

    // Reconciliation trace: original deposit info from payment_records
    const custIds = [...new Set(rows.map((r) => r.customerId))];
    const prs = custIds.length
      ? await PaymentRecord.find({ customerId: { $in: custIds } }).sort({ createdAt: -1 }).lean()
      : [];

    const records = rows.map((rf) => {
      const ref = rf.originalTxRef;
      const pr = prs.find(
        (p) =>
          p.customerId === rf.customerId &&
          ((ref && p.referenceUtr === ref) || /^paid$/i.test(p.status || '') || /^verified/i.test(p.status || ''))
      );
      const st = String(rf.status || '');
      const walletBal = rf.w ? num(rf.w.availableBalance) : null;
      let reconciliationState = rf.status;
      if (/^completed$/i.test(st) && walletBal === 0) reconciliationState = 'Fully Refunded (Zero Balance)';
      else if (/^completed$/i.test(st) && walletBal !== null && walletBal > 0) reconciliationState = 'Partially Refunded (Active Balance)';
      else if (/^rejected$/i.test(st)) reconciliationState = 'Rejected by Auditor';
      else if (/^pending$/i.test(st)) reconciliationState = 'Pending Audit Decision';

      return {
        refund_id: rf._id,
        customer_id: rf.customerId,
        company_name: rf.c?.companyName,
        contact_person: rf.c?.contactPerson,
        phone: rf.c?.phone,
        email: rf.c?.email,
        available_balance: round2(rf.w?.availableBalance),
        total_lifetime_paid: round2(rf.w?.totalLifetimePaid),
        total_ad_spent: round2(rf.w?.totalAdSpent),
        verified_utr: rf.originalTxRef || null,
        requested_amount: num(rf.amount),
        refund_status: rf.status,
        provider_ref: rf.providerRef ?? rf.payoutUtr ?? null,
        reason: rf.reason,
        review_notes: rf.reviewNotes ?? null,
        reviewed_by: rf.reviewedBy ?? null,
        reviewed_at: rf.reviewedAt ?? null,
        request_date: rf.createdAt,
        original_deposit_info: pr
          ? {
              receipt_number: pr.receiptNumber,
              paid_at: pr.createdAt,
              amount: num(pr.amount),
              payment_mode: pr.paymentMethod,
            }
          : null,
        reconciliation_state: reconciliationState,
      };
    });

    // Global Financial Summary
    const [walletAgg, refunded, pending, completedCnt, rejectedCnt] = await Promise.all([
      Wallet.aggregate([
        {
          $group: {
            _id: null,
            dep: { $sum: '$totalLifetimePaid' },
            spend: { $sum: '$totalAdSpent' },
            liab: { $sum: '$availableBalance' },
          },
        },
      ]),
      sumRefunds({ status: { $in: ciAny('Approved', 'Completed') } }),
      sumRefunds({ status: { $in: ciAny('Pending') } }),
      RefundRequest.countDocuments({ status: { $in: ciAny('Approved', 'Completed') } }),
      RefundRequest.countDocuments({ status: { $in: ciAny('Rejected') } }),
    ]);
    const wa = walletAgg[0];

    res.json({
      ok: true,
      records,
      summary: {
        total_customer_deposits: round2(wa?.dep),
        total_delivered_ad_spend: round2(wa?.spend),
        total_current_liability: round2(wa?.liab),
        total_refunded_to_bank: refunded.total,
        total_pending_claims: pending.total,
        completed_refund_count: completedCnt,
        rejected_refund_count: rejectedCnt,
      },
      pagination: buildPagination(total, pageNum, limitNum),
    });
  } catch (err) {
    console.error('[GET /api/superadmin/refunds/reconciliation]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Export Refund Reconciliation Ledger as CSV
superadminRouter.get('/refunds/reconciliation/export', async (req, res) => {
  try {
    const rows = await RefundRequest.aggregate([
      { $sort: { createdAt: -1 } },
      ...lookupCustomer('c'),
      ...lookupWallet('w'),
    ]);

    const headers = [
      'Refund ID',
      'Company Name',
      'Contact Person',
      'Phone',
      'Verified Deposit UTR',
      'Refund Amount (INR)',
      'Remaining Wallet Balance',
      'Total Lifetime Deposited',
      'Delivered Ad Spend',
      'Banking Reversal Ref',
      'Status',
      'Reason',
      'Reviewed By',
      'Reviewed At',
      'Request Date',
    ];

    const escapeCsv = (str) => {
      if (str === null || str === undefined) return '""';
      const s = String(str).replace(/"/g, '""');
      return `"${s}"`;
    };
    const money = (n) => (n === null || n === undefined ? null : num(n).toFixed(2));

    let csv = headers.join(',') + '\n';
    rows.forEach((rf) => {
      csv +=
        [
          escapeCsv(rf._id),
          escapeCsv(rf.c?.companyName),
          escapeCsv(rf.c?.contactPerson),
          escapeCsv(rf.c?.phone),
          escapeCsv(rf.originalTxRef || null),
          escapeCsv(money(rf.amount)),
          escapeCsv(rf.w ? money(rf.w.availableBalance) : null),
          escapeCsv(rf.w ? money(rf.w.totalLifetimePaid) : null),
          escapeCsv(rf.w ? money(rf.w.totalAdSpent) : null),
          escapeCsv(rf.providerRef ?? rf.payoutUtr ?? null),
          escapeCsv(rf.status),
          escapeCsv(rf.reason),
          escapeCsv(rf.reviewedBy ?? null),
          escapeCsv(rf.reviewedAt ?? null),
          escapeCsv(rf.createdAt),
        ].join(',') + '\n';
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="admafia_refund_reconciliation_${Date.now()}.csv"`);
    res.status(200).send(csv);
  } catch (err) {
    console.error('[GET /api/superadmin/refunds/reconciliation/export]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// =============================================================================
// 5. ACCOUNT TOP-UP (/api/superadmin/topups/*)
// =============================================================================
superadminRouter.get('/topups', async (req, res) => {
  try {
    const { status, search } = req.query;
    const { pageNum, limitNum, offset } = parsePaging(req.query, 20);

    const pre = {};
    if (status && status !== 'all') pre.status = ciExact(status);

    const stages = [
      { $match: pre },
      ...lookupCustomer('c'),
      ...lookupWallet('w'),
      { $addFields: { _rank: { $cond: [{ $eq: [{ $toLower: { $ifNull: ['$status', ''] } }, 'pending'] }, 1, 2] } } },
    ];
    if (search && search.trim()) {
      const rx = ciContains(search);
      stages.push({ $match: { $or: [{ 'c.companyName': rx }, { referenceUtr: rx }, { _id: rx }] } });
    }

    const { total, rows } = await runPaged(TopupRequest, stages, { _rank: 1, createdAt: -1 }, offset, limitNum);

    res.json({
      ok: true,
      topups: rows.map((tp) => mapTopupRow(tp, tp.c, tp.w)),
      pagination: buildPagination(total, pageNum, limitNum),
    });
  } catch (err) {
    console.error('[GET /api/superadmin/topups]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Submit a customer top-up request
superadminRouter.post('/topups', async (req, res) => {
  try {
    const {
      customerId,
      amount,
      referenceUtr,
      paymentMethod = 'Razorpay UPI / NetBanking',
      paymentEvidenceUrl = '',
      notes = '',
      adminName = 'Super Admin',
      adminId = 'superadmin',
    } = req.body || {};

    const topupAmount = parseFloat(amount);
    const cleanUtr = String(referenceUtr || '').trim();

    if (!customerId) return res.status(400).json({ ok: false, error: 'Customer ID is required.' });
    if (!topupAmount || topupAmount < 300) {
      return res.status(400).json({ ok: false, error: 'Minimum top-up amount is ₹300.00.' });
    }
    if (!cleanUtr) {
      return res.status(400).json({ ok: false, error: 'Payment Bank UTR / Reference ID is required.' });
    }

    const duplicateMessage = `Duplicate Reference: Payment UTR "${cleanUtr}" is already registered or credited in the system.`;

    // Check duplicate UTR
    const [dupTopup, dupTx] = await Promise.all([
      TopupRequest.exists({ referenceUtr: cleanUtr }),
      WalletTransaction.exists({ referenceUtr: cleanUtr }),
    ]);
    if (dupTopup || dupTx) {
      return res.status(409).json({ ok: false, error: duplicateMessage });
    }

    const [cust, wallet] = await Promise.all([
      Customer.exists({ _id: customerId }),
      Wallet.findOne({ customerId }).select('_id').lean(),
    ]);

    if (!cust) {
      return res.status(404).json({ ok: false, error: 'Customer business not found.' });
    }

    const topupId = genId('topup');
    const now = new Date();

    try {
      await TopupRequest.create({
        _id: topupId,
        customerId,
        walletId: wallet?._id || '',
        amount: topupAmount,
        paymentMethod,
        referenceUtr: cleanUtr,
        evidenceUrl: paymentEvidenceUrl.trim(),
        proofUrl: paymentEvidenceUrl.trim(),
        notes: notes.trim(),
        status: 'Pending',
        createdAt: now,
        updatedAt: now,
      });
    } catch (err) {
      if (isDuplicateKey(err)) return res.status(409).json({ ok: false, error: duplicateMessage });
      throw err;
    }

    await logSuperAdminAudit({
      actorId: adminId,
      actorName: adminName,
      actionType: 'TOPUP_SUBMITTED',
      targetType: 'topup',
      targetId: topupId,
      details: { customerId, amount: topupAmount, referenceUtr: cleanUtr },
    });

    res.status(201).json({ ok: true, topupId, message: 'Top-up request registered for Super Admin verification.' });
  } catch (err) {
    console.error('[POST /api/superadmin/topups]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Approve top-up request (atomic ledger credit)
superadminRouter.patch('/topups/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const { adminName = 'Super Admin', adminId = 'superadmin', notes = '' } = req.body || {};

    const topup = await TopupRequest.findById(id).lean();
    if (!topup) {
      return res.status(404).json({ ok: false, error: 'Top-up request not found.' });
    }

    if (/^approved$/i.test(topup.status || '')) {
      return res.status(409).json({ ok: false, error: 'This top-up request has already been approved and credited.' });
    }
    if (/^rejected$/i.test(topup.status || '')) {
      return res.status(409).json({ ok: false, error: 'This top-up request was previously rejected.' });
    }

    const topupAmount = Number(topup.amount);
    const cleanUtr = topup.referenceUtr;
    const utrProcessedMessage = `Payment UTR "${cleanUtr}" has already been processed in the wallet transactions ledger.`;

    // Check duplicate in wallet_transactions
    if (await WalletTransaction.exists({ referenceUtr: cleanUtr })) {
      return res.status(409).json({ ok: false, error: utrProcessedMessage });
    }

    await withMongoTransaction((session) =>
      withCompensation(session, async (registerUndo) => {
        const now = new Date();
        const cleanNotes = String(notes || '').trim();

        // 1. Claim the request atomically (only one approver can win; a concurrent approval cannot double-credit)
        const $set = {
          status: 'Approved',
          processedBy: adminName,
          processedAt: now,
          approvedBy: adminName,
          approvedAt: now,
          updatedAt: now,
        };
        if (cleanNotes) $set.notes = cleanNotes; // notes = CASE WHEN $2 != '' THEN $2 ELSE notes END

        const claimed = await TopupRequest.findOneAndUpdate(
          { _id: id, status: { $not: FINAL_TOPUP_RE } },
          { $set },
          { new: true, session }
        );
        if (!claimed) {
          const cur = await TopupRequest.findById(id).session(session).lean();
          if (cur && /^rejected$/i.test(cur.status || '')) {
            throw new HttpError(409, 'This top-up request was previously rejected.');
          }
          throw new HttpError(409, 'This top-up request has already been approved and credited.');
        }
        registerUndo(() =>
          TopupRequest.updateOne(
            { _id: id },
            {
              $set: {
                status: topup.status,
                processedBy: topup.processedBy ?? null,
                processedAt: topup.processedAt ?? null,
                approvedBy: topup.approvedBy ?? null,
                approvedAt: topup.approvedAt ?? null,
                notes: topup.notes ?? '',
              },
            }
          )
        );

        // 2-5. Atomic $inc wallet credit + Credit ledger row + payment record (UTR is unique => idempotent)
        const customer = await Customer.findById(topup.customerId).session(session).lean();
        try {
          await creditWalletLedger({
            session,
            registerUndo,
            customerId: topup.customerId,
            amount: topupAmount,
            referenceUtr: cleanUtr,
            paymentMethod: topup.paymentMethod || 'Razorpay Secure (UPI/Card)',
            description: `Super Admin Verified Account Top-Up (Req: ${id})`,
            txIdPrefix: 'tx_topup',
            receiptCustomer: customer, // payment record only if the customer exists (SQL INSERT..SELECT)
          });
        } catch (err) {
          if (err instanceof HttpError && err.message === 'DUPLICATE_UTR') {
            throw new HttpError(409, utrProcessedMessage);
          }
          throw err;
        }
      })
    );

    await logSuperAdminAudit({
      actorId: adminId,
      actorName: adminName,
      actionType: 'TOPUP_APPROVED',
      targetType: 'topup',
      targetId: id,
      details: { customerId: topup.customerId, amount: topupAmount, referenceUtr: cleanUtr },
    });

    res.json({
      ok: true,
      message: `Top-up of ₹${topupAmount.toFixed(2)} approved and credited to wallet.`,
    });
  } catch (err) {
    console.error('[PATCH /api/superadmin/topups/:id/approve]', err);
    sendError(res, err);
  }
});

// Reject top-up request
superadminRouter.patch('/topups/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, adminName = 'Super Admin', adminId = 'superadmin' } = req.body || {};

    if (!reason || !reason.trim()) {
      return res.status(400).json({ ok: false, error: 'Mandatory rejection reason must be provided.' });
    }

    const topup = await TopupRequest.findById(id).lean();
    if (!topup) {
      return res.status(404).json({ ok: false, error: 'Top-up request not found.' });
    }

    if (/^approved$/i.test(topup.status || '')) {
      return res.status(409).json({ ok: false, error: 'Cannot reject an already approved and credited top-up.' });
    }

    const now = new Date();
    // Atomic guard: never overwrite a request that was approved concurrently
    const updated = await TopupRequest.findOneAndUpdate(
      { _id: id, status: { $not: /^approved$/i } },
      {
        $set: {
          status: 'Rejected',
          rejectionReason: reason.trim(),
          processedBy: adminName,
          processedAt: now,
          updatedAt: now,
        },
      },
      { new: true }
    );
    if (!updated) {
      return res.status(409).json({ ok: false, error: 'Cannot reject an already approved and credited top-up.' });
    }

    await logSuperAdminAudit({
      actorId: adminId,
      actorName: adminName,
      actionType: 'TOPUP_REJECTED',
      targetType: 'topup',
      targetId: id,
      reason: reason.trim(),
      details: { customerId: topup.customerId, amount: topup.amount },
    });

    res.json({ ok: true, message: 'Top-up request rejected with recorded reason.' });
  } catch (err) {
    console.error('[PATCH /api/superadmin/topups/:id/reject]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Authorized direct manual wallet credit
superadminRouter.post('/topups/manual-credit', async (req, res) => {
  try {
    const {
      customerId,
      amount,
      referenceUtr,
      paymentMethod = 'Bank NEFT / RTGS Transfer',
      description = 'Super Admin Direct Credit',
      adminName = 'Super Admin',
      adminId = 'superadmin',
    } = req.body || {};

    const creditAmount = parseFloat(amount);
    const cleanUtr = String(referenceUtr || '').trim();

    if (!customerId) return res.status(400).json({ ok: false, error: 'Customer ID is required.' });
    if (!creditAmount || creditAmount <= 0) {
      return res.status(400).json({ ok: false, error: 'Credit amount must be greater than zero.' });
    }
    if (!cleanUtr) {
      return res.status(400).json({ ok: false, error: 'Transaction reference UTR is required.' });
    }

    const duplicateMessage = `Duplicate Reference: Payment UTR "${cleanUtr}" has already been credited in the ledger.`;

    // Check duplicate UTR
    if (await WalletTransaction.exists({ referenceUtr: cleanUtr })) {
      return res.status(409).json({ ok: false, error: duplicateMessage });
    }

    const customer = await Customer.findById(customerId).lean();
    if (!customer) {
      return res.status(404).json({ ok: false, error: 'Customer account not found.' });
    }

    let recordedNewBalance = 0;
    let recordedOldBalance = 0;

    await withMongoTransaction((session) =>
      withCompensation(session, async (registerUndo) => {
        try {
          const result = await creditWalletLedger({
            session,
            registerUndo,
            customerId,
            amount: creditAmount,
            referenceUtr: cleanUtr,
            paymentMethod,
            description: description.trim(),
            txIdPrefix: 'tx_manual',
            // Auto-create customer wallet record if not present
            createWalletIfMissing: true,
            newWalletId: `wal_${customerId.replace(/[^a-zA-Z0-9_]/g, '_')}`,
            // Mark customer payment status active/paid
            markCustomerPaid: true,
            receiptCustomer: customer,
          });
          recordedOldBalance = result.previousBalance;
          recordedNewBalance = result.newBalance;
        } catch (err) {
          if (err instanceof HttpError && err.message === 'DUPLICATE_UTR') {
            throw new HttpError(409, duplicateMessage);
          }
          throw err;
        }
      })
    );

    await logSuperAdminAudit({
      actorId: adminId,
      actorName: adminName,
      actionType: 'MANUAL_WALLET_CREDIT',
      targetType: 'wallet',
      targetId: customerId,
      details: {
        companyName: customer.companyName,
        amount: creditAmount,
        previousBalance: recordedOldBalance,
        newBalance: recordedNewBalance,
        referenceUtr: cleanUtr,
        description: description.trim(),
      },
    });

    res.json({
      ok: true,
      customerId,
      companyName: customer.companyName,
      amount: creditAmount,
      previousBalance: recordedOldBalance,
      newBalance: recordedNewBalance,
      referenceUtr: cleanUtr,
      message: `Top-up of ₹${creditAmount.toFixed(2)} applied successfully to ${customer.companyName}'s wallet.`,
    });
  } catch (err) {
    console.error('[POST /api/superadmin/topups/manual-credit]', err);
    sendError(res, err);
  }
});

// =============================================================================
// 6. ACCOUNT BLOCK / ACTIVATE (/api/superadmin/accounts/*)
// =============================================================================
superadminRouter.get('/accounts', async (req, res) => {
  try {
    const { status, type = 'business', search } = req.query;
    const { pageNum, limitNum, offset } = parsePaging(req.query, 25);

    if (type === 'user') {
      const filter = {};
      if (status && status !== 'all') filter.status = ciExact(status);
      if (search && search.trim()) {
        const rx = ciContains(search);
        filter.$or = [{ fullName: rx }, { email: rx }, { username: rx }];
      }

      const [totalCount, users] = await Promise.all([
        SystemUser.countDocuments(filter),
        SystemUser.find(filter).sort({ createdAt: -1 }).skip(offset).limit(limitNum).lean(),
      ]);

      const custIds = [...new Set(users.map((u) => u.customerId).filter(Boolean))];
      const custs = custIds.length ? await Customer.find({ _id: { $in: custIds } }).select('companyName').lean() : [];
      const custMap = new Map(custs.map((c) => [c._id, c.companyName]));

      return res.json({
        ok: true,
        type: 'user',
        accounts: users.map((u) => ({
          id: u._id,
          full_name: u.fullName,
          email: u.email,
          username: u.username,
          phone: u.phone || null,
          role: u.role,
          permissions: u.permissions || [],
          status: u.status,
          last_login_at: u.lastLoginAt ?? null,
          created_at: u.createdAt,
          business_name: u.customerId ? custMap.get(u.customerId) ?? null : null,
        })),
        pagination: buildPagination(totalCount, pageNum, limitNum),
      });
    }

    // Business Accounts (customers)
    const filter = {};
    if (status && status !== 'all') filter.status = ciExact(status);
    if (search && search.trim()) {
      const rx = ciContains(search);
      filter.$or = [{ companyName: rx }, { contactPerson: rx }, { phone: rx }, { email: rx }, { _id: rx }];
    }

    const [totalCount, customers] = await Promise.all([
      Customer.countDocuments(filter),
      Customer.find(filter).sort({ registeredAt: -1 }).skip(offset).limit(limitNum).lean(),
    ]);

    const ids = customers.map((c) => c._id);
    const [wallets, running, leadCounts] = ids.length
      ? await Promise.all([
          Wallet.find({ customerId: { $in: ids } }).lean(),
          MarketingCampaign.aggregate([
            { $match: { customerId: { $in: ids }, status: { $in: ciAny('Running', 'Active') } } },
            { $group: { _id: '$customerId', n: { $sum: 1 } } },
          ]),
          Lead.aggregate([
            { $match: { customerId: { $in: ids } } },
            { $group: { _id: '$customerId', n: { $sum: 1 } } },
          ]),
        ])
      : [[], [], []];
    const walletMap = new Map(wallets.map((w) => [w.customerId, w]));
    const runMap = new Map(running.map((r) => [r._id, r.n]));
    const leadMap = new Map(leadCounts.map((r) => [r._id, r.n]));

    res.json({
      ok: true,
      type: 'business',
      accounts: customers.map((c) => {
        const w = walletMap.get(c._id);
        return {
          id: c._id,
          company_name: c.companyName,
          contact_person: c.contactPerson,
          phone: c.phone,
          email: c.email,
          category: c.category,
          city: c.city,
          status: c.status,
          registered_at: c.registeredAt,
          created_at: c.registeredAt || new Date(),
          available_balance: num(w?.availableBalance),
          daily_ad_spend: num(w?.dailyAdSpend ?? 300),
          ad_campaign_active: Boolean(w?.adCampaignActive),
          running_campaigns: runMap.get(c._id) || 0,
          total_leads: leadMap.get(c._id) || 0,
        };
      }),
      pagination: buildPagination(totalCount, pageNum, limitNum),
    });
  } catch (err) {
    console.error('[GET /api/superadmin/accounts]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Change account status (Block or Reactivate with mandatory reason)
superadminRouter.patch('/accounts/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      accountType = 'business', // 'business' or 'user'
      status, // 'active' or 'suspended'
      reason,
      adminName = 'Super Admin',
      adminId = 'superadmin',
    } = req.body || {};

    if (!['active', 'suspended', 'inactive'].includes(status)) {
      return res.status(400).json({ ok: false, error: 'Status must be active, suspended, or inactive.' });
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({ ok: false, error: 'Mandatory reason must be provided for account status change.' });
    }

    if (accountType === 'user') {
      const user = await SystemUser.findById(id).lean();
      if (!user) {
        return res.status(404).json({ ok: false, error: 'System user not found.' });
      }

      // Protect last active Super Admin from accidental lockout
      if (SUPER_ADMIN_ROLE_RE.test(user.role || '') && status !== 'active') {
        const activeAdmins = await SystemUser.countDocuments({
          role: SUPER_ADMIN_ROLE_RE,
          status: 'active',
          _id: { $ne: id },
        });
        if (activeAdmins < 1) {
          return res.status(403).json({
            ok: false,
            error: 'Lockout Prevention: Cannot suspend or block the last active Super Admin account.',
          });
        }
      }

      await SystemUser.updateOne({ _id: id }, { $set: { status, updatedAt: new Date() } });

      await logSuperAdminAudit({
        actorId: adminId,
        actorName: adminName,
        actionType: status === 'active' ? 'USER_ACTIVATED' : 'USER_SUSPENDED',
        targetType: 'user',
        targetId: id,
        reason: reason.trim(),
        details: { previousStatus: user.status, newStatus: status, username: user.username },
      });

      return res.json({ ok: true, message: `User account is now ${status}.` });
    }

    // Business Account (customers)
    const customer = await Customer.findById(id).lean();
    if (!customer) {
      return res.status(404).json({ ok: false, error: 'Business account not found.' });
    }

    const previousStatus = customer.status;

    await withMongoTransaction(async (session) => {
      const now = new Date();

      // 1 + 2. Update customer status and record it in the status history
      await Customer.updateOne(
        { _id: id },
        {
          $set: { status, updatedAt: now },
          $push: {
            statusHistory: {
              oldStatus: previousStatus,
              newStatus: status,
              reason: reason.trim(),
              changedBy: adminName,
              changedAt: now,
            },
          },
        },
        { session }
      );

      // 3. If suspending, pause active campaigns and wallet pacing
      if (status === 'suspended') {
        await MarketingCampaign.updateMany(
          { customerId: id, status: { $in: ciAny('Running', 'Active') } },
          {
            $set: {
              status: 'Paused',
              lastAction: 'System Hold (Suspended)',
              lastActor: adminName,
              lastActionAt: now,
              updatedAt: now,
            },
          },
          { session }
        );

        await Wallet.updateOne({ customerId: id }, { $set: { adCampaignActive: false, updatedAt: now } }, { session });
      }
    });

    await logSuperAdminAudit({
      actorId: adminId,
      actorName: adminName,
      actionType: status === 'active' ? 'ACCOUNT_ACTIVATED' : 'ACCOUNT_SUSPENDED',
      targetType: 'business',
      targetId: id,
      reason: reason.trim(),
      details: { previousStatus, newStatus: status, companyName: customer.companyName },
    });

    res.json({
      ok: true,
      message: `Business account "${customer.companyName}" status updated to ${status}.`,
    });
  } catch (err) {
    console.error('[PATCH /api/superadmin/accounts/:id/status]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// View account status change history
superadminRouter.get('/accounts/:id/history', async (req, res) => {
  try {
    const { id } = req.params;
    const customer = await Customer.findById(id).select('statusHistory').lean();

    const history = (customer?.statusHistory || [])
      .map((h) => ({
        id: String(h._id),
        customer_id: id,
        previous_status: h.oldStatus,
        new_status: h.newStatus,
        reason: h.reason,
        changed_by: h.changedBy,
        created_at: h.changedAt,
      }))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json({ ok: true, history });
  } catch (err) {
    console.error('[GET /api/superadmin/accounts/:id/history]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// =============================================================================
// 7. ADD USER / BUSINESS (/api/superadmin/businesses & /api/superadmin/users)
// =============================================================================
superadminRouter.post('/businesses', async (req, res) => {
  try {
    const {
      companyName,
      contactPerson,
      phone,
      email = '',
      username = '',
      category = '',
      city = '',
      state = '',
      password = '',
      initialBalance = 0,
      adminName = 'Super Admin',
      adminId = 'superadmin',
    } = req.body || {};

    if (!companyName || !companyName.trim()) {
      return res.status(400).json({ ok: false, error: 'Business legal/company name is required.' });
    }
    if (!contactPerson || !contactPerson.trim()) {
      return res.status(400).json({ ok: false, error: 'Authorized contact person name is required.' });
    }

    const cleanPhone = String(phone || '').replace(/\D/g, '').slice(-10);
    if (!cleanPhone || cleanPhone.length !== 10) {
      return res.status(400).json({ ok: false, error: 'A valid 10-digit mobile number is required.' });
    }

    const finalPassword = password && password.trim() ? password.trim() : `AdMafia@${cleanPhone.slice(-4)}`;
    const finalUsername = username && username.trim() ? username.trim().toLowerCase().replace(/\s+/g, '') : `biz_${cleanPhone}`;

    const duplicateMessage = `A business with mobile ${cleanPhone} or username "${finalUsername}" is already registered.`;

    // Check duplicate phone or username
    const phoneCheck = await Customer.exists({
      $or: [{ phone: cleanPhone }, { username: ciExact(finalUsername) }],
    });
    if (phoneCheck) {
      return res.status(409).json({ ok: false, error: duplicateMessage });
    }

    const custId = genId('cust');
    const walletId = genId('wlt');
    const parsedInitialBalance = Math.max(0, parseFloat(initialBalance) || 0);
    const hashedBusinessPassword = await hashPassword(finalPassword);

    try {
      const evalProf = evaluateCustomerProfileCompletion({
        phone: cleanPhone,
        contactPerson: contactPerson.trim(),
        companyName: companyName.trim(),
        email: email.trim(),
        category: category.trim(),
        city: city.trim(),
        state: state.trim(),
      });

      await withMongoTransaction(async (session) => {
        const now = new Date();

        // 1. Create Customer Business
        await Customer.create(
          [
            {
              _id: custId,
              username: finalUsername,
              phone: cleanPhone,
              email: email.trim() || '',
              passwordHash: hashedBusinessPassword,
              companyName: companyName.trim(),
              category: evalProf.sanitized.category,
              contactPerson: contactPerson.trim(),
              city: evalProf.sanitized.city,
              state: evalProf.sanitized.state,
              status: 'active',
              profileStatus: evalProf.profileStatus,
              paymentStatus: parsedInitialBalance > 0 ? 'paid' : 'pending',
              kycPercent: evalProf.kycPercent,
              verified: evalProf.isComplete,
              completedAt: evalProf.isComplete ? now : null,
              isSelfRegistered: false,
              registeredFrom: 'Super Admin Control Center',
              registeredAt: now,
            },
          ],
          { session }
        );

        // 2. Create Marketing Wallet
        await Wallet.create(
          [
            {
              _id: walletId,
              customerId: custId,
              availableBalance: parsedInitialBalance,
              dailyAdSpend: 300,
              totalLifetimePaid: parsedInitialBalance,
              totalAdSpent: 0,
              adCampaignActive: false,
              createdAt: now,
            },
          ],
          { session }
        );

        // 3. If initial balance provided, record initial deposit transaction
        if (parsedInitialBalance > 0) {
          await WalletTransaction.create(
            [
              {
                _id: genId('tx_init'),
                customerId: custId,
                walletId,
                txType: 'Credit',
                amount: parsedInitialBalance,
                balanceAfter: parsedInitialBalance,
                referenceUtr: `INIT_${Date.now()}_${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
                description: 'Super Admin Initial Account Balance',
                paymentMethod: 'Admin Verified Credit',
                status: 'Verified ✓',
                createdAt: now,
              },
            ],
            { session }
          );
        }
      });
    } catch (err) {
      if (isDuplicateKey(err)) return res.status(409).json({ ok: false, error: duplicateMessage });
      throw err;
    }

    await logSuperAdminAudit({
      actorId: adminId,
      actorName: adminName,
      actionType: 'BUSINESS_CREATED',
      targetType: 'business',
      targetId: custId,
      details: { companyName: companyName.trim(), contactPerson: contactPerson.trim(), phone: cleanPhone, username: finalUsername },
    });

    res.status(201).json({
      ok: true,
      customerId: custId,
      username: finalUsername,
      phone: cleanPhone,
      email: email.trim() || null,
      password: finalPassword,
      companyName: companyName.trim(),
      loginUrl: 'https://admafia.marketing/portal',
      message: 'Business account and customer login created successfully.',
    });
  } catch (err) {
    console.error('[POST /api/superadmin/businesses]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Create new system user
superadminRouter.post('/users', async (req, res) => {
  try {
    const {
      fullName,
      email,
      username,
      phone = '',
      password = '',
      role = 'Support Agent',
      permissions = ['view_all'],
      customerId = null,
      status = 'active',
      adminName = 'Super Admin',
      adminId = 'superadmin',
    } = req.body || {};

    if (!fullName || !fullName.trim()) {
      return res.status(400).json({ ok: false, error: 'Full name is required.' });
    }
    if (!email || !email.trim()) {
      return res.status(400).json({ ok: false, error: 'Valid email address is required.' });
    }
    if (!username || !username.trim()) {
      return res.status(400).json({ ok: false, error: 'Username is required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = username.trim().toLowerCase();
    const cleanPhone = phone ? String(phone).replace(/\D/g, '').slice(-10) : '';
    const finalPassword = password && password.trim() ? password.trim() : 'User@2026!';
    const userDept = req.body.department || (
      role.includes('Marketing') ? 'Marketing' :
      (role.includes('Graphic') || role.includes('Creative')) ? 'Graphics' :
      (role.includes('Sales') || role.includes('Telecaller')) ? 'Sales' :
      (role.includes('Client') || role.includes('Staff')) ? 'Customer Portal' :
      'Super Admin'
    );

    const duplicateMessage = 'A user with this email or username already exists.';

    // Check duplicate
    const dupCheck = await SystemUser.exists({
      $or: [{ email: ciExact(cleanEmail) }, { username: ciExact(cleanUsername) }],
    });
    if (dupCheck) {
      return res.status(409).json({ ok: false, error: duplicateMessage });
    }

    const userId = genId('usr');
    const now = new Date();
    const hashedUserPassword = await hashPassword(finalPassword);

    try {
      await SystemUser.create({
        _id: userId,
        customerId: customerId || null,
        fullName: fullName.trim(),
        email: cleanEmail,
        username: cleanUsername,
        phone: cleanPhone || '',
        passwordHash: hashedUserPassword,
        role,
        department: userDept,
        permissions: Array.isArray(permissions) ? permissions : ['all'],
        status,
        createdBy: adminName,
        createdAt: now,
        updatedAt: now,
      });
    } catch (err) {
      if (isDuplicateKey(err)) return res.status(409).json({ ok: false, error: duplicateMessage });
      throw err;
    }

    await logSuperAdminAudit({
      actorId: adminId,
      actorName: adminName,
      actionType: 'USER_CREATED',
      targetType: 'user',
      targetId: userId,
      details: { fullName: fullName.trim(), email: cleanEmail, username: cleanUsername, role, customerId },
    });

    res.status(201).json({
      ok: true,
      userId,
      username: cleanUsername,
      email: cleanEmail,
      phone: cleanPhone || null,
      password: finalPassword,
      role,
      customerId: customerId || null,
      loginUrl: 'https://admafia.marketing/portal',
      message: 'System user and login credentials registered successfully.',
    });
  } catch (err) {
    console.error('[POST /api/superadmin/users]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Reset Password for Customer Business Account
superadminRouter.post('/accounts/:id/reset-password', async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword, adminName = 'Super Admin' } = req.body || {};
    if (!newPassword || !newPassword.trim()) {
      return res.status(400).json({ ok: false, error: 'New password is required.' });
    }

    const check = await Customer.findById(id).select('companyName username phone email').lean();
    if (!check) {
      return res.status(404).json({ ok: false, error: 'Customer business not found.' });
    }

    const hashedResetCustPwd = await hashPassword(newPassword.trim());
    await Customer.updateOne({ _id: id }, { $set: { passwordHash: hashedResetCustPwd, updatedAt: new Date() } });

    await logSuperAdminAudit({
      actorId: 'superadmin',
      actorName: adminName,
      actionType: 'ACCOUNT_PASSWORD_RESET',
      targetType: 'business',
      targetId: id,
      details: { companyName: check.companyName },
    });

    res.json({
      ok: true,
      customerId: id,
      username: check.username,
      companyName: check.companyName,
      message: 'Password reset successfully for customer business.',
    });
  } catch (err) {
    console.error('[POST /api/superadmin/accounts/:id/reset-password]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Reset Password for System User
superadminRouter.post('/users/:id/reset-password', async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword, adminName = 'Super Admin' } = req.body || {};
    if (!newPassword || !newPassword.trim()) {
      return res.status(400).json({ ok: false, error: 'New password is required.' });
    }

    const check = await SystemUser.findById(id).select('fullName username email').lean();
    if (!check) {
      return res.status(404).json({ ok: false, error: 'User not found.' });
    }

    const hashedResetUserPwd = await hashPassword(newPassword.trim());
    await SystemUser.updateOne({ _id: id }, { $set: { passwordHash: hashedResetUserPwd, updatedAt: new Date() } });

    await logSuperAdminAudit({
      actorId: 'superadmin',
      actorName: adminName,
      actionType: 'USER_PASSWORD_RESET',
      targetType: 'user',
      targetId: id,
      details: { username: check.username, fullName: check.fullName },
    });

    res.json({
      ok: true,
      userId: id,
      username: check.username,
      message: 'Password reset successfully for user.',
    });
  } catch (err) {
    console.error('[POST /api/superadmin/users/:id/reset-password]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// List all system users with associated business name
superadminRouter.get('/users', async (req, res) => {
  try {
    const users = await SystemUser.find({}).sort({ createdAt: -1 }).lean();

    const custIds = [...new Set(users.map((u) => u.customerId).filter(Boolean))];
    const custs = custIds.length ? await Customer.find({ _id: { $in: custIds } }).select('companyName').lean() : [];
    const custMap = new Map(custs.map((c) => [c._id, c.companyName]));

    res.json({
      ok: true,
      users: users.map((u) => ({
        id: u._id,
        customer_id: u.customerId ?? null,
        full_name: u.fullName,
        email: u.email,
        username: u.username,
        phone: u.phone || null,
        role: u.role,
        department: u.department || 'Super Admin',
        permissions: u.permissions || [],
        status: u.status,
        last_login_at: u.lastLoginAt ?? null,
        created_by: u.createdBy || null,
        created_at: u.createdAt,
        business_name: u.customerId ? custMap.get(u.customerId) ?? null : null,
      })),
    });
  } catch (err) {
    console.error('[GET /api/superadmin/users]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// =============================================================================
// 8. AUDIT LOGS (/api/superadmin/audit-logs)
// =============================================================================
superadminRouter.get('/audit-logs', async (req, res) => {
  try {
    const { actionType, targetType, search } = req.query;
    const { pageNum, limitNum, offset } = parsePaging(req.query, 30);

    const and = [];

    if (actionType && actionType !== 'all') {
      and.push({ $or: [{ actionType }, { action: actionType }] });
    }

    if (targetType && targetType !== 'all') {
      and.push({ $or: [{ targetType }, { targetEntity: targetType }] });
    }

    if (search && search.trim()) {
      const rx = ciContains(search);
      and.push({ $or: [{ actorName: rx }, { targetId: rx }, { reason: rx }] });
    }

    const filter = and.length ? { $and: and } : {};

    const [totalCount, logs] = await Promise.all([
      SuperAdminAuditLog.countDocuments(filter),
      SuperAdminAuditLog.find(filter).sort({ createdAt: -1, timestamp: -1 }).skip(offset).limit(limitNum).lean(),
    ]);

    res.json({
      ok: true,
      logs: logs.map(mapAudit),
      pagination: buildPagination(totalCount, pageNum, limitNum),
    });
  } catch (err) {
    console.error('[GET /api/superadmin/audit-logs]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});
