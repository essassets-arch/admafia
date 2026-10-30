/**
 * AdMafia Super Admin Control Center - Authoritative Express Router
 * Module Path: /api/superadmin/*
 * Provides verified PostgreSQL endpoints for:
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
import { query, withTransaction } from '../db.js';

export const superadminRouter = express.Router();

// Helper to log administrative audit events
async function logSuperAdminAudit({
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
    const auditId = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    await query(
      `INSERT INTO superadmin_audit_logs (
        id, actor_id, actor_name, actor_role, action_type, target_type, target_id, reason, details, ip_address, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
      [
        auditId,
        actorId,
        actorName,
        actorRole,
        actionType,
        targetType,
        targetId,
        reason || null,
        typeof details === 'string' ? details : JSON.stringify(details),
        ipAddress || '127.0.0.1',
      ]
    );
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
      bizCountRes,
      userCountRes,
      activeBizRes,
      blockedBizRes,
      queriesRes,
      refundsRes,
      topupsRes,
      liabilityRes,
      recentTxRes,
      recentAuditRes,
    ] = await Promise.all([
      query(`SELECT COUNT(*)::INT AS count FROM customers`),
      query(`SELECT COUNT(*)::INT AS count FROM system_users`),
      query(`SELECT COUNT(*)::INT AS count FROM customers WHERE status = 'active'`),
      query(`SELECT COUNT(*)::INT AS count FROM customers WHERE status = 'suspended'`),
      query(`SELECT COUNT(*)::INT AS count FROM support_queries WHERE status != 'resolved'`),
      query(`SELECT COUNT(*)::INT AS count FROM refund_requests WHERE status = 'Pending'`),
      query(`SELECT COUNT(*)::INT AS count FROM topup_requests WHERE status = 'Pending'`),
      query(`SELECT COALESCE(SUM(available_balance), 0)::NUMERIC(12,2) AS total FROM wallets`),
      query(
        `SELECT wt.id, wt.customer_id, c.company_name, wt.tx_type, wt.amount, wt.reference_utr, wt.status, wt.created_at
         FROM wallet_transactions wt
         JOIN customers c ON c.id = wt.customer_id
         ORDER BY wt.created_at DESC
         LIMIT 8`
      ),
      query(
        `SELECT id, actor_name, action_type, target_type, target_id, reason, created_at
         FROM superadmin_audit_logs
         ORDER BY created_at DESC
         LIMIT 8`
      ),
    ]);

    res.json({
      ok: true,
      summary: {
        totalBusinesses: bizCountRes.rows[0]?.count || 0,
        totalUsers: userCountRes.rows[0]?.count || 0,
        activeAccounts: activeBizRes.rows[0]?.count || 0,
        blockedAccounts: blockedBizRes.rows[0]?.count || 0,
        pendingQueries: queriesRes.rows[0]?.count || 0,
        pendingRefunds: refundsRes.rows[0]?.count || 0,
        pendingTopups: topupsRes.rows[0]?.count || 0,
        totalWalletLiability: Number(liabilityRes.rows[0]?.total || 0),
      },
      recentTransactions: recentTxRes.rows,
      recentAuditActions: recentAuditRes.rows,
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
    const { status, priority, search, page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];

    if (status && status !== 'all') {
      params.push(status);
      conditions.push(`sq.status = $${params.length}`);
    }

    if (priority && priority !== 'all') {
      params.push(priority);
      conditions.push(`sq.priority = $${params.length}`);
    }

    if (search && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      const idx = params.length;
      conditions.push(
        `(LOWER(sq.subject) LIKE $${idx} OR LOWER(sq.company_name) LIKE $${idx} OR LOWER(COALESCE(sq.category, '')) LIKE $${idx} OR LOWER(sq.id) LIKE $${idx})`
      );
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await query(
      `SELECT COUNT(*)::INT AS total FROM support_queries sq ${whereClause}`,
      params
    );
    const totalCount = countRes.rows[0]?.total || 0;

    const listRes = await query(
      `SELECT
        sq.id, sq.customer_id, sq.company_name, sq.category, sq.subject, sq.priority,
        sq.sla_breached, sq.hours_open, sq.status, sq.contact_name, sq.contact_email,
        sq.contact_phone, sq.assigned_admin, sq.internal_notes, sq.last_replied_at,
        sq.last_replied_by, sq.created_at, sq.resolved_at,
        c.contact_person AS customer_contact, c.phone AS customer_phone
       FROM support_queries sq
       LEFT JOIN customers c ON c.id = sq.customer_id
       ${whereClause}
       ORDER BY
         CASE WHEN sq.status = 'open' THEN 1 WHEN sq.status = 'pending' THEN 2 ELSE 3 END,
         sq.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limitNum, offset]
    );

    res.json({
      ok: true,
      queries: listRes.rows,
      pagination: {
        total: totalCount,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(totalCount / limitNum) || 1,
      },
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
    const queryRes = await query(
      `SELECT sq.*, c.contact_person AS customer_contact, c.phone AS customer_phone, c.email AS customer_email
       FROM support_queries sq
       LEFT JOIN customers c ON c.id = sq.customer_id
       WHERE sq.id = $1`,
      [id]
    );

    if (queryRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Support query not found.' });
    }

    const messagesRes = await query(
      `SELECT * FROM support_query_messages WHERE query_id = $1 ORDER BY created_at ASC`,
      [id]
    );

    res.json({
      ok: true,
      query: queryRes.rows[0],
      messages: messagesRes.rows,
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

    const checkRes = await query(`SELECT * FROM support_queries WHERE id = $1`, [id]);
    if (checkRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Query not found.' });
    }

    const msgId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const senderType = isInternalNote ? 'internal_note' : 'admin';

    await withTransaction(async (tx) => {
      await tx(
        `INSERT INTO support_query_messages (id, query_id, sender_type, sender_name, message, is_internal_note, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [msgId, id, senderType, adminName, message.trim(), Boolean(isInternalNote)]
      );

      // If not internal note, update query last_replied_at
      if (!isInternalNote) {
        await tx(
          `UPDATE support_queries
           SET last_replied_at = NOW(), last_replied_by = $1, status = CASE WHEN status = 'open' THEN 'pending' ELSE status END
           WHERE id = $2`,
          [adminName, id]
        );
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

    const checkRes = await query(`SELECT * FROM support_queries WHERE id = $1`, [id]);
    if (checkRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Query not found.' });
    }

    const current = checkRes.rows[0];
    const newStatus = status || current.status;
    const isResolved = newStatus === 'resolved';

    await query(
      `UPDATE support_queries
       SET status = $1,
           assigned_admin = COALESCE($2, assigned_admin),
           internal_notes = COALESCE($3, internal_notes),
           resolved_at = CASE WHEN $4 = TRUE THEN NOW() ELSE resolved_at END
       WHERE id = $5`,
      [newStatus, assignedAdmin || null, internalNotes || null, isResolved, id]
    );

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
      const cRes = await query(`SELECT * FROM customers WHERE id = $1`, [customerId]);
      customer = cRes.rows[0] || null;
    }

    const resolvedCompanyName = companyName || customer?.company_name || 'Direct Business Enquiry';
    const queryId = `query_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    await withTransaction(async (tx) => {
      await tx(
        `INSERT INTO support_queries (
          id, customer_id, company_name, category, subject, priority, status, contact_name, contact_email, contact_phone, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, 'open', $7, $8, $9, NOW())`,
        [
          queryId,
          customerId || null,
          resolvedCompanyName,
          category,
          subject.trim(),
          priority,
          customer?.contact_person || 'Administrator',
          customer?.email || '',
          customer?.phone || '',
        ]
      );

      if (message && message.trim()) {
        const msgId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        await tx(
          `INSERT INTO support_query_messages (id, query_id, sender_type, sender_name, message, is_internal_note, created_at)
           VALUES ($1, $2, 'admin', $3, $4, FALSE, NOW())`,
          [msgId, queryId, adminName, message.trim()]
        );
      }
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
    const [walletsRes, txRes, pendingRefundRes, pendingTopupRes] = await Promise.all([
      query(
        `SELECT
          COALESCE(SUM(available_balance), 0)::NUMERIC(12,2) AS total_balance,
          COALESCE(SUM(total_lifetime_paid), 0)::NUMERIC(12,2) AS total_lifetime_paid,
          COALESCE(SUM(total_ad_spent), 0)::NUMERIC(12,2) AS total_ad_spent,
          COUNT(*)::INT AS total_wallets
         FROM wallets`
      ),
      query(
        `SELECT
          COUNT(*)::INT AS total_tx_count,
          COALESCE(SUM(CASE WHEN tx_type = 'Credit' THEN amount ELSE 0 END), 0)::NUMERIC(12,2) AS total_credited,
          COALESCE(SUM(CASE WHEN tx_type = 'Debit' THEN amount ELSE 0 END), 0)::NUMERIC(12,2) AS total_debited
         FROM wallet_transactions`
      ),
      query(`SELECT COALESCE(SUM(amount), 0)::NUMERIC(12,2) AS total FROM refund_requests WHERE status = 'Pending'`),
      query(`SELECT COALESCE(SUM(amount), 0)::NUMERIC(12,2) AS total FROM topup_requests WHERE status = 'Pending'`),
    ]);

    res.json({
      ok: true,
      summary: {
        totalWalletLiability: Number(walletsRes.rows[0]?.total_balance || 0),
        totalLifetimePaid: Number(walletsRes.rows[0]?.total_lifetime_paid || 0),
        totalCampaignSpent: Number(walletsRes.rows[0]?.total_ad_spent || 0),
        totalWallets: walletsRes.rows[0]?.total_wallets || 0,
        totalCredited: Number(txRes.rows[0]?.total_credited || 0),
        totalDebited: Number(txRes.rows[0]?.total_debited || 0),
        totalTxCount: txRes.rows[0]?.total_tx_count || 0,
        pendingRefundsAmount: Number(pendingRefundRes.rows[0]?.total || 0),
        pendingTopupsAmount: Number(pendingTopupRes.rows[0]?.total || 0),
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
    const { search, page = 1, limit = 25 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;

    const params = [];
    let whereClause = '';

    if (search && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      whereClause = `WHERE LOWER(c.company_name) LIKE $1 OR LOWER(c.contact_person) LIKE $1 OR c.phone LIKE $1 OR LOWER(c.id) LIKE $1`;
    }

    const countRes = await query(
      `SELECT COUNT(*)::INT AS total FROM customers c ${whereClause}`,
      params
    );
    const totalCount = countRes.rows[0]?.total || 0;

    const listRes = await query(
      `SELECT
        c.id, c.company_name, c.contact_person, c.phone, c.email, c.city, c.status,
        w.id AS wallet_id,
        COALESCE(w.available_balance, 0)::NUMERIC(12,2) AS available_balance,
        COALESCE(w.total_lifetime_paid, 0)::NUMERIC(12,2) AS total_lifetime_paid,
        COALESCE(w.total_ad_spent, 0)::NUMERIC(12,2) AS total_ad_spent,
        COALESCE(w.daily_ad_spend, 300.00)::NUMERIC(10,2) AS daily_ad_spend,
        COALESCE(w.ad_campaign_active, FALSE) AS ad_campaign_active,
        (SELECT MAX(created_at) FROM wallet_transactions WHERE customer_id = c.id) AS last_transaction_at
       FROM customers c
       LEFT JOIN wallets w ON w.customer_id = c.id
       ${whereClause}
       ORDER BY w.available_balance DESC NULLS LAST, c.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limitNum, offset]
    );

    res.json({
      ok: true,
      accounts: listRes.rows,
      pagination: {
        total: totalCount,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(totalCount / limitNum) || 1,
      },
    });
  } catch (err) {
    console.error('[GET /api/superadmin/finance/accounts]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Global transaction ledger
superadminRouter.get('/finance/transactions', async (req, res) => {
  try {
    const { txType, search, startDate, endDate, page = 1, limit = 25 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];

    if (txType && txType !== 'all') {
      params.push(txType);
      conditions.push(`wt.tx_type = $${params.length}`);
    }

    if (search && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      const idx = params.length;
      conditions.push(
        `(LOWER(c.company_name) LIKE $${idx} OR LOWER(wt.reference_utr) LIKE $${idx} OR LOWER(wt.description) LIKE $${idx} OR LOWER(wt.id) LIKE $${idx})`
      );
    }

    if (startDate) {
      params.push(startDate);
      conditions.push(`wt.created_at >= $${params.length}::TIMESTAMPTZ`);
    }

    if (endDate) {
      params.push(endDate);
      conditions.push(`wt.created_at <= $${params.length}::TIMESTAMPTZ`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await query(
      `SELECT COUNT(*)::INT AS total
       FROM wallet_transactions wt
       JOIN customers c ON c.id = wt.customer_id
       ${whereClause}`,
      params
    );
    const totalCount = countRes.rows[0]?.total || 0;

    const listRes = await query(
      `SELECT
        wt.id, wt.customer_id, c.company_name, c.phone, c.email,
        wt.tx_type, wt.amount, wt.balance_after, wt.reference_utr,
        wt.description, wt.payment_method, wt.status, wt.created_at
       FROM wallet_transactions wt
       JOIN customers c ON c.id = wt.customer_id
       ${whereClause}
       ORDER BY wt.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limitNum, offset]
    );

    res.json({
      ok: true,
      transactions: listRes.rows,
      pagination: {
        total: totalCount,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(totalCount / limitNum) || 1,
      },
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

    const [custRes, walletRes, txRes] = await Promise.all([
      query(`SELECT id, company_name, contact_person, phone, email, status FROM customers WHERE id = $1`, [customerId]),
      query(`SELECT * FROM wallets WHERE customer_id = $1`, [customerId]),
      query(
        `SELECT * FROM wallet_transactions WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 100`,
        [customerId]
      ),
    ]);

    if (custRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Customer account not found.' });
    }

    res.json({
      ok: true,
      customer: custRes.rows[0],
      wallet: walletRes.rows[0] || null,
      transactions: txRes.rows,
    });
  } catch (err) {
    console.error('[GET /api/superadmin/finance/accounts/:customerId/ledger]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// CSV Export for transactions
superadminRouter.get('/finance/export', async (req, res) => {
  try {
    const listRes = await query(
      `SELECT
        wt.id, c.company_name, wt.customer_id, wt.tx_type, wt.amount, wt.balance_after,
        wt.reference_utr, wt.payment_method, wt.status, wt.description, wt.created_at
       FROM wallet_transactions wt
       JOIN customers c ON c.id = wt.customer_id
       ORDER BY wt.created_at DESC
       LIMIT 1000`
    );

    let csv = 'Transaction ID,Company Name,Customer ID,Type,Amount (INR),Balance After,Reference UTR,Payment Mode,Status,Description,Date\n';
    listRes.rows.forEach((r) => {
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

// Get all registered customers who completed payment with refund eligibility
superadminRouter.get('/refunds/paid-customers', async (req, res) => {
  try {
    const { search, page = 1, limit = 25 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];

    // Financial Safeguard 1: Genuinely verified paid customer check
    // Active wallet balance alone does not prove customer paid - must have verified deposits
    conditions.push(
      `(c.payment_status = 'paid' OR COALESCE(w.total_lifetime_paid, 0) > 0 OR EXISTS (SELECT 1 FROM payment_records pr WHERE pr.customer_id = c.id AND pr.status = 'paid') OR EXISTS (SELECT 1 FROM wallet_transactions wt WHERE wt.customer_id = c.id AND wt.tx_type = 'Credit' AND wt.status = 'Verified ✓'))`
    );

    if (search && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      const idx = params.length;
      conditions.push(
        `(LOWER(c.company_name) LIKE $${idx} OR LOWER(c.contact_person) LIKE $${idx} OR c.phone LIKE $${idx} OR LOWER(COALESCE(c.email, '')) LIKE $${idx} OR LOWER(c.id) LIKE $${idx})`
      );
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const countRes = await query(
      `SELECT COUNT(*)::INT AS total
       FROM customers c
       LEFT JOIN wallets w ON w.customer_id = c.id
       ${whereClause}`,
      params
    );
    const totalCount = countRes.rows[0]?.total || 0;

    const listRes = await query(
      `SELECT
        c.id, c.company_name, c.contact_person, c.phone, c.email, c.city, c.state, c.status, c.payment_status, c.registered_at,
        COALESCE(w.available_balance, 0)::NUMERIC(12,2) AS available_balance,
        COALESCE(w.total_lifetime_paid, 0)::NUMERIC(12,2) AS total_lifetime_paid,
        COALESCE(w.total_ad_spent, 0)::NUMERIC(12,2) AS total_ad_spent,
        (SELECT COUNT(*)::INT FROM payment_records pr WHERE pr.customer_id = c.id AND pr.status = 'paid') AS paid_receipts_count,
        (SELECT MAX(pr.paid_at) FROM payment_records pr WHERE pr.customer_id = c.id) AS last_payment_date,
        (SELECT pr.utr_reference FROM payment_records pr WHERE pr.customer_id = c.id ORDER BY pr.paid_at DESC LIMIT 1) AS last_utr_ref,
        (SELECT COUNT(*)::INT FROM refund_requests rf WHERE rf.customer_id = c.id) AS total_refund_requests,
        (SELECT COALESCE(SUM(amount), 0)::NUMERIC(12,2) FROM refund_requests rf WHERE rf.customer_id = c.id AND rf.status IN ('Approved', 'Completed')) AS total_refunded_amount,
        (SELECT COALESCE(SUM(amount), 0)::NUMERIC(12,2) FROM refund_requests rf WHERE rf.customer_id = c.id AND rf.status = 'Pending') AS pending_refund_amount,
        -- Financial Safeguard: Strict bank-refundable eligibility calculation
        -- Capped at MIN(available_balance, total_lifetime_paid - already_refunded - pending_refunds)
        GREATEST(0, LEAST(
          COALESCE(w.available_balance, 0),
          GREATEST(0, COALESCE(w.total_lifetime_paid, 0) - COALESCE((SELECT SUM(amount) FROM refund_requests rf WHERE rf.customer_id = c.id AND rf.status IN ('Approved', 'Completed')), 0) - COALESCE((SELECT SUM(amount) FROM refund_requests rf WHERE rf.customer_id = c.id AND rf.status = 'Pending'), 0))
        ))::NUMERIC(12,2) AS eligible_bank_refundable,
        -- Verified deposits array for tracing exact payment UTRs
        (SELECT COALESCE(json_agg(
          json_build_object(
            'receipt_number', pr.receipt_number,
            'utr_reference', pr.utr_reference,
            'amount', pr.amount,
            'paid_at', pr.paid_at,
            'payment_mode', pr.payment_mode
          ) ORDER BY pr.paid_at DESC
        ), '[]'::json) FROM payment_records pr WHERE pr.customer_id = c.id AND pr.status = 'paid') AS verified_deposits
       FROM customers c
       LEFT JOIN wallets w ON w.customer_id = c.id
       ${whereClause}
       ORDER BY w.available_balance DESC, w.total_lifetime_paid DESC, c.registered_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limitNum, offset]
    );

    // Authoritative Summary stats
    const statRes = await query(
      `SELECT
        COUNT(DISTINCT c.id)::INT AS total_paid_customers,
        COALESCE(SUM(w.total_lifetime_paid), 0)::NUMERIC(12,2) AS total_amount_paid,
        COALESCE(SUM(w.available_balance), 0)::NUMERIC(12,2) AS total_refundable_balance,
        COALESCE((SELECT SUM(amount) FROM refund_requests WHERE status IN ('Approved', 'Completed')), 0)::NUMERIC(12,2) AS total_refunded_amount
       FROM customers c
       LEFT JOIN wallets w ON w.customer_id = c.id
       WHERE (c.payment_status = 'paid' OR COALESCE(w.total_lifetime_paid, 0) > 0 OR EXISTS (SELECT 1 FROM payment_records pr WHERE pr.customer_id = c.id AND pr.status = 'paid'))`
    );

    res.json({
      ok: true,
      paidCustomers: listRes.rows,
      summary: {
        totalPaidCustomers: statRes.rows[0]?.total_paid_customers || 0,
        totalAmountPaid: Number(statRes.rows[0]?.total_amount_paid || 0),
        totalRefundableBalance: Number(statRes.rows[0]?.total_refundable_balance || 0),
        totalRefundedAmount: Number(statRes.rows[0]?.total_refunded_amount || 0),
      },
      pagination: {
        total: totalCount,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(totalCount / limitNum) || 1,
      },
    });
  } catch (err) {
    console.error('[GET /api/superadmin/refunds/paid-customers]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

superadminRouter.get('/refunds', async (req, res) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];

    if (status && status !== 'all') {
      params.push(status);
      conditions.push(`rf.status = $${params.length}`);
    }

    if (search && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      const idx = params.length;
      conditions.push(
        `(LOWER(c.company_name) LIKE $${idx} OR LOWER(rf.id) LIKE $${idx} OR LOWER(rf.reason) LIKE $${idx} OR LOWER(COALESCE(rf.original_tx_ref, '')) LIKE $${idx})`
      );
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await query(
      `SELECT COUNT(*)::INT AS total FROM refund_requests rf JOIN customers c ON c.id = rf.customer_id ${whereClause}`,
      params
    );
    const totalCount = countRes.rows[0]?.total || 0;

    const listRes = await query(
      `SELECT
        rf.id, rf.customer_id, c.company_name, c.contact_person, c.phone, c.email,
        w.available_balance,
        rf.original_tx_ref, rf.amount, rf.reason, rf.supporting_info, rf.status,
        rf.rejection_reason, rf.review_notes, rf.reviewed_by, rf.reviewed_at,
        rf.provider_ref, rf.created_at, rf.updated_at
       FROM refund_requests rf
       JOIN customers c ON c.id = rf.customer_id
       LEFT JOIN wallets w ON w.customer_id = rf.customer_id
       ${whereClause}
       ORDER BY
         CASE WHEN rf.status = 'Pending' THEN 1 WHEN rf.status = 'Under Review' THEN 2 ELSE 3 END,
         rf.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limitNum, offset]
    );

    res.json({
      ok: true,
      refunds: listRes.rows,
      pagination: {
        total: totalCount,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(totalCount / limitNum) || 1,
      },
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

    const [custRes, walletRes, prevRefundsRes, pendingRefundsRes] = await Promise.all([
      query(`SELECT * FROM customers WHERE id = $1`, [customerId]),
      query(`SELECT * FROM wallets WHERE customer_id = $1`, [customerId]),
      query(
        `SELECT COALESCE(SUM(amount), 0)::NUMERIC(12,2) AS total FROM refund_requests WHERE customer_id = $1 AND status IN ('Approved', 'Completed')`,
        [customerId]
      ),
      query(
        `SELECT COALESCE(SUM(amount), 0)::NUMERIC(12,2) AS total FROM refund_requests WHERE customer_id = $1 AND status = 'Pending'`,
        [customerId]
      ),
    ]);

    if (custRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Customer not found.' });
    }

    const currentBal = Number(walletRes.rows[0]?.available_balance || 0);
    const totalLifetimePaid = Number(walletRes.rows[0]?.total_lifetime_paid || 0);
    const totalPreviouslyRefunded = Number(prevRefundsRes.rows[0]?.total || 0);
    const totalPendingRefunds = Number(pendingRefundsRes.rows[0]?.total || 0);

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

    const refundId = `ref_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    await query(
      `INSERT INTO refund_requests (
        id, customer_id, wallet_id, original_tx_ref, amount, reason, supporting_info, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'Pending', NOW(), NOW())`,
      [
        refundId,
        customerId,
        walletRes.rows[0]?.id || null,
        originalTxRef.trim(),
        refundAmount,
        reason.trim(),
        supportingInfo.trim(),
      ]
    );

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

// Review refund decision (Approve or Reject with atomic safeguards and concurrency row locks)
superadminRouter.patch('/refunds/:id/review', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      decision, // 'Approved' or 'Rejected'
      status,   // alias for decision
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

    await withTransaction(async (tx) => {
      // Concurrency Safeguard: Row-level lock on refund_requests
      const refundCheck = await tx(`SELECT * FROM refund_requests WHERE id = $1 FOR UPDATE`, [id]);
      if (refundCheck.rowCount === 0) {
        throw new Error('NOT_FOUND: Refund request not found.');
      }

      const refund = refundCheck.rows[0];
      if (refund.status === 'Completed' || refund.status === 'Approved') {
        throw new Error('ALREADY_PROCESSED: This refund request has already been approved and completed.');
      }
      if (refund.status === 'Rejected') {
        throw new Error('ALREADY_PROCESSED: This refund request has already been rejected.');
      }

      const refundAmount = Number(refund.amount);

      if (finalDecision === 'Rejected') {
        await tx(
          `UPDATE refund_requests
           SET status = 'Rejected',
               rejection_reason = $1,
               review_notes = $2,
               reviewed_by = $3,
               reviewed_at = NOW(),
               updated_at = NOW()
           WHERE id = $4`,
          [reason.trim(), reviewNotes.trim(), adminName, id]
        );

        reviewResult = {
          ok: true,
          status: 'Rejected',
          message: 'Refund request rejected with recorded reason.',
        };
        return;
      }

      // Concurrency Safeguard: Row-level lock on customer's wallet
      const walletRes = await tx(
        `SELECT id, available_balance, total_lifetime_paid FROM wallets WHERE customer_id = $1 FOR UPDATE`,
        [refund.customer_id]
      );

      if (walletRes.rowCount === 0) {
        throw new Error('Customer wallet not found for refund processing.');
      }

      const currentBalance = Number(walletRes.rows[0].available_balance);
      if (currentBalance < refundAmount) {
        throw new Error(
          `Insufficient wallet balance (₹${currentBalance.toFixed(2)}) for refund of ₹${refundAmount.toFixed(2)}.`
        );
      }

      const balanceAfter = Number((currentBalance - refundAmount).toFixed(2));

      // 1. Deduct wallet atomically
      await tx(
        `UPDATE wallets
         SET available_balance = $1,
             updated_at = NOW()
         WHERE customer_id = $2`,
        [balanceAfter, refund.customer_id]
      );

      // 2. Insert immutable debit transaction in ledger
      const providerRef = `REF_PAY_${Date.now()}_${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
      const txId = `tx_refund_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      await tx(
        `INSERT INTO wallet_transactions (
          id, customer_id, wallet_id, tx_type, amount, balance_after, reference_utr, description, payment_method, status, created_at
        ) VALUES ($1, $2, $3, 'Debit', $4, $5, $6, $7, 'Official Bank / Gateway Refund', 'Completed ✓', NOW())`,
        [
          txId,
          refund.customer_id,
          walletRes.rows[0].id,
          refundAmount,
          balanceAfter,
          providerRef,
          `Super Admin Approved Refund (Ref: ${id}) - ${reason || 'Processed'}`,
        ]
      );

      // 3. Mark refund as Completed
      await tx(
        `UPDATE refund_requests
         SET status = 'Completed',
             review_notes = $1,
             reviewed_by = $2,
             reviewed_at = NOW(),
             provider_ref = $3,
             updated_at = NOW()
         WHERE id = $4`,
        [reviewNotes.trim() || 'Approved by Super Admin', adminName, providerRef, id]
      );

      reviewResult = {
        ok: true,
        status: 'Completed',
        providerRef,
        message: `Refund of ₹${refundAmount.toFixed(2)} approved and deducted atomically from wallet.`,
      };
    });

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
    if (err.message && err.message.startsWith('ALREADY_PROCESSED')) {
      return res.status(409).json({ ok: false, error: err.message.replace('ALREADY_PROCESSED: ', '') });
    }
    if (err.message && err.message.startsWith('NOT_FOUND')) {
      return res.status(404).json({ ok: false, error: err.message.replace('NOT_FOUND: ', '') });
    }
    res.status(500).json({ ok: false, error: err.message });
  }
});

// =============================================================================
// 4B. REFUND RECONCILIATION & AUDIT HISTORY
// Original Deposit (UTR) ➔ Eligible Cap ➔ Refund Request ➔ Provider Ref ➔ Final State
// =============================================================================
superadminRouter.get('/refunds/reconciliation', async (req, res) => {
  try {
    const { search, status = 'all', page = 1, limit = 25 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];

    if (status && status !== 'all') {
      params.push(status);
      conditions.push(`rf.status = $${params.length}`);
    }

    if (search && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      const idx = params.length;
      conditions.push(
        `(LOWER(c.company_name) LIKE $${idx} OR LOWER(rf.id) LIKE $${idx} OR LOWER(COALESCE(rf.original_tx_ref, '')) LIKE $${idx} OR LOWER(COALESCE(rf.provider_ref, '')) LIKE $${idx})`
      );
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await query(
      `SELECT COUNT(*)::INT AS total
       FROM refund_requests rf
       JOIN customers c ON c.id = rf.customer_id
       ${whereClause}`,
      params
    );
    const totalCount = countRes.rows[0]?.total || 0;

    const listRes = await query(
      `SELECT
        rf.id AS refund_id,
        rf.customer_id,
        c.company_name,
        c.contact_person,
        c.phone,
        c.email,
        COALESCE(w.available_balance, 0)::NUMERIC(12,2) AS available_balance,
        COALESCE(w.total_lifetime_paid, 0)::NUMERIC(12,2) AS total_lifetime_paid,
        COALESCE(w.total_ad_spent, 0)::NUMERIC(12,2) AS total_ad_spent,
        rf.original_tx_ref AS verified_utr,
        rf.amount AS requested_amount,
        rf.status AS refund_status,
        rf.provider_ref,
        rf.reason,
        rf.review_notes,
        rf.reviewed_by,
        rf.reviewed_at,
        rf.created_at AS request_date,
        -- Reconciliation trace: original deposit info from payment_records
        (SELECT json_build_object('receipt_number', pr.receipt_number, 'paid_at', pr.paid_at, 'amount', pr.amount, 'payment_mode', pr.payment_mode)
         FROM payment_records pr
         WHERE pr.customer_id = rf.customer_id AND (pr.utr_reference = rf.original_tx_ref OR pr.status = 'paid')
         ORDER BY pr.paid_at DESC LIMIT 1) AS original_deposit_info,
        -- Calculated Reconciliation State
        CASE
          WHEN rf.status = 'Completed' AND w.available_balance = 0 THEN 'Fully Refunded (Zero Balance)'
          WHEN rf.status = 'Completed' AND w.available_balance > 0 THEN 'Partially Refunded (Active Balance)'
          WHEN rf.status = 'Rejected' THEN 'Rejected by Auditor'
          WHEN rf.status = 'Pending' THEN 'Pending Audit Decision'
          ELSE rf.status
        END AS reconciliation_state
       FROM refund_requests rf
       JOIN customers c ON c.id = rf.customer_id
       LEFT JOIN wallets w ON w.customer_id = rf.customer_id
       ${whereClause}
       ORDER BY rf.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limitNum, offset]
    );

    // Global Financial Summary
    const summaryRes = await query(
      `SELECT
        COALESCE(SUM(w.total_lifetime_paid), 0)::NUMERIC(12,2) AS total_customer_deposits,
        COALESCE(SUM(w.total_ad_spent), 0)::NUMERIC(12,2) AS total_delivered_ad_spend,
        COALESCE(SUM(w.available_balance), 0)::NUMERIC(12,2) AS total_current_liability,
        COALESCE((SELECT SUM(amount) FROM refund_requests WHERE status IN ('Approved', 'Completed')), 0)::NUMERIC(12,2) AS total_refunded_to_bank,
        COALESCE((SELECT SUM(amount) FROM refund_requests WHERE status = 'Pending'), 0)::NUMERIC(12,2) AS total_pending_claims,
        COALESCE((SELECT COUNT(*) FROM refund_requests WHERE status IN ('Approved', 'Completed')), 0)::INT AS completed_refund_count,
        COALESCE((SELECT COUNT(*) FROM refund_requests WHERE status = 'Rejected'), 0)::INT AS rejected_refund_count
       FROM wallets w`
    );

    res.json({
      ok: true,
      records: listRes.rows,
      summary: summaryRes.rows[0] || {},
      pagination: {
        total: totalCount,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(totalCount / limitNum) || 1,
      },
    });
  } catch (err) {
    console.error('[GET /api/superadmin/refunds/reconciliation]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Export Refund Reconciliation Ledger as CSV
superadminRouter.get('/refunds/reconciliation/export', async (req, res) => {
  try {
    const listRes = await query(
      `SELECT
        rf.id AS refund_id,
        c.company_name,
        c.contact_person,
        c.phone,
        rf.original_tx_ref AS verified_utr,
        rf.amount AS refunded_amount,
        w.available_balance AS remaining_wallet_balance,
        w.total_lifetime_paid AS total_deposited,
        w.total_ad_spent AS delivered_ad_spend,
        rf.provider_ref AS banking_reversal_ref,
        rf.status,
        rf.reason,
        rf.reviewed_by,
        rf.reviewed_at,
        rf.created_at
       FROM refund_requests rf
       JOIN customers c ON c.id = rf.customer_id
       LEFT JOIN wallets w ON w.customer_id = rf.customer_id
       ORDER BY rf.created_at DESC`
    );

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

    let csv = headers.join(',') + '\n';
    listRes.rows.forEach((r) => {
      csv +=
        [
          escapeCsv(r.refund_id),
          escapeCsv(r.company_name),
          escapeCsv(r.contact_person),
          escapeCsv(r.phone),
          escapeCsv(r.verified_utr),
          escapeCsv(r.refunded_amount),
          escapeCsv(r.remaining_wallet_balance),
          escapeCsv(r.total_deposited),
          escapeCsv(r.delivered_ad_spend),
          escapeCsv(r.banking_reversal_ref),
          escapeCsv(r.status),
          escapeCsv(r.reason),
          escapeCsv(r.reviewed_by),
          escapeCsv(r.reviewed_at),
          escapeCsv(r.created_at),
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
    const { status, search, page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];

    if (status && status !== 'all') {
      params.push(status);
      conditions.push(`tp.status = $${params.length}`);
    }

    if (search && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      const idx = params.length;
      conditions.push(
        `(LOWER(c.company_name) LIKE $${idx} OR LOWER(tp.reference_utr) LIKE $${idx} OR LOWER(tp.id) LIKE $${idx})`
      );
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await query(
      `SELECT COUNT(*)::INT AS total FROM topup_requests tp JOIN customers c ON c.id = tp.customer_id ${whereClause}`,
      params
    );
    const totalCount = countRes.rows[0]?.total || 0;

    const listRes = await query(
      `SELECT
        tp.id, tp.customer_id, c.company_name, c.contact_person, c.phone, c.email,
        w.available_balance,
        tp.amount, tp.payment_method, tp.reference_utr, tp.payment_evidence_url,
        tp.notes, tp.status, tp.rejection_reason, tp.processed_by, tp.processed_at,
        tp.created_at, tp.updated_at
       FROM topup_requests tp
       JOIN customers c ON c.id = tp.customer_id
       LEFT JOIN wallets w ON w.customer_id = tp.customer_id
       ${whereClause}
       ORDER BY
         CASE WHEN tp.status = 'Pending' THEN 1 ELSE 2 END,
         tp.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limitNum, offset]
    );

    res.json({
      ok: true,
      topups: listRes.rows,
      pagination: {
        total: totalCount,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(totalCount / limitNum) || 1,
      },
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

    // Check duplicate UTR
    const duplicateCheck = await query(
      `SELECT id FROM topup_requests WHERE reference_utr = $1
       UNION
       SELECT id FROM wallet_transactions WHERE reference_utr = $1`,
      [cleanUtr]
    );

    if (duplicateCheck.rowCount > 0) {
      return res.status(409).json({
        ok: false,
        error: `Duplicate Reference: Payment UTR "${cleanUtr}" is already registered or credited in the system.`,
      });
    }

    const [custRes, walletRes] = await Promise.all([
      query(`SELECT id FROM customers WHERE id = $1`, [customerId]),
      query(`SELECT id FROM wallets WHERE customer_id = $1`, [customerId]),
    ]);

    if (custRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Customer business not found.' });
    }

    const topupId = `topup_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    await query(
      `INSERT INTO topup_requests (
        id, customer_id, wallet_id, amount, payment_method, reference_utr, payment_evidence_url, notes, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Pending', NOW(), NOW())`,
      [
        topupId,
        customerId,
        walletRes.rows[0]?.id || null,
        topupAmount,
        paymentMethod,
        cleanUtr,
        paymentEvidenceUrl.trim(),
        notes.trim(),
      ]
    );

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

    const topupCheck = await query(`SELECT * FROM topup_requests WHERE id = $1`, [id]);
    if (topupCheck.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Top-up request not found.' });
    }

    const topup = topupCheck.rows[0];
    if (topup.status === 'Approved') {
      return res.status(409).json({ ok: false, error: 'This top-up request has already been approved and credited.' });
    }
    if (topup.status === 'Rejected') {
      return res.status(409).json({ ok: false, error: 'This top-up request was previously rejected.' });
    }

    const topupAmount = Number(topup.amount);
    const cleanUtr = topup.reference_utr;

    // Check duplicate in wallet_transactions
    const utrCheck = await query(`SELECT id FROM wallet_transactions WHERE reference_utr = $1`, [cleanUtr]);
    if (utrCheck.rowCount > 0) {
      return res.status(409).json({
        ok: false,
        error: `Payment UTR "${cleanUtr}" has already been processed in the wallet transactions ledger.`,
      });
    }

    await withTransaction(async (tx) => {
      // 1. Lock wallet row
      const walletRes = await tx(
        `SELECT id, available_balance, total_lifetime_paid FROM wallets WHERE customer_id = $1 FOR UPDATE`,
        [topup.customer_id]
      );

      if (walletRes.rowCount === 0) {
        throw new Error('Wallet not found for customer.');
      }

      const currentBalance = Number(walletRes.rows[0].available_balance);
      const newBalance = Number((currentBalance + topupAmount).toFixed(2));
      const newLifetime = Number((Number(walletRes.rows[0].total_lifetime_paid) + topupAmount).toFixed(2));

      // 2. Credit wallet
      await tx(
        `UPDATE wallets
         SET available_balance = $1,
             total_lifetime_paid = $2,
             updated_at = NOW()
         WHERE customer_id = $3`,
        [newBalance, newLifetime, topup.customer_id]
      );

      // 3. Record in wallet_transactions ledger
      const txId = `tx_topup_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      await tx(
        `INSERT INTO wallet_transactions (
          id, customer_id, wallet_id, tx_type, amount, balance_after, reference_utr, description, payment_method, status, created_at
        ) VALUES ($1, $2, $3, 'Credit', $4, $5, $6, $7, $8, 'Verified ✓', NOW())`,
        [
          txId,
          topup.customer_id,
          walletRes.rows[0].id,
          topupAmount,
          newBalance,
          cleanUtr,
          `Super Admin Verified Account Top-Up (Req: ${id})`,
          topup.payment_method,
        ]
      );

      // 4. Update topup_requests
      await tx(
        `UPDATE topup_requests
         SET status = 'Approved',
             processed_by = $1,
             processed_at = NOW(),
             notes = CASE WHEN $2 != '' THEN $2 ELSE notes END,
             updated_at = NOW()
         WHERE id = $3`,
        [adminName, notes.trim(), id]
      );

      // 5. Insert payment record for accounting
      const receiptNo = `REC_${Date.now()}_${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
      await tx(
        `INSERT INTO payment_records (
          id, receipt_number, customer_id, company_name, contact_person, phone, tx_type, amount, gst_amount, total_amount, payment_mode, utr_reference, status, paid_at
        )
        SELECT
          $1, $2, c.id, c.company_name, c.contact_person, c.phone, 'topup', $3, 0.00, $3, $4, $5, 'paid', NOW()
        FROM customers c WHERE c.id = $6`,
        [
          `pay_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          receiptNo,
          topupAmount,
          topup.payment_method,
          cleanUtr,
          topup.customer_id,
        ]
      );
    });

    await logSuperAdminAudit({
      actorId: adminId,
      actorName: adminName,
      actionType: 'TOPUP_APPROVED',
      targetType: 'topup',
      targetId: id,
      details: { customerId: topup.customer_id, amount: topupAmount, referenceUtr: cleanUtr },
    });

    res.json({
      ok: true,
      message: `Top-up of ₹${topupAmount.toFixed(2)} approved and credited to wallet.`,
    });
  } catch (err) {
    console.error('[PATCH /api/superadmin/topups/:id/approve]', err);
    res.status(500).json({ ok: false, error: err.message });
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

    const checkRes = await query(`SELECT * FROM topup_requests WHERE id = $1`, [id]);
    if (checkRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Top-up request not found.' });
    }

    const topup = checkRes.rows[0];
    if (topup.status === 'Approved') {
      return res.status(409).json({ ok: false, error: 'Cannot reject an already approved and credited top-up.' });
    }

    await query(
      `UPDATE topup_requests
       SET status = 'Rejected',
           rejection_reason = $1,
           processed_by = $2,
           processed_at = NOW(),
           updated_at = NOW()
       WHERE id = $3`,
      [reason.trim(), adminName, id]
    );

    await logSuperAdminAudit({
      actorId: adminId,
      actorName: adminName,
      actionType: 'TOPUP_REJECTED',
      targetType: 'topup',
      targetId: id,
      reason: reason.trim(),
      details: { customerId: topup.customer_id, amount: topup.amount },
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

    // Check duplicate UTR
    const dupCheck = await query(`SELECT id FROM wallet_transactions WHERE reference_utr = $1`, [cleanUtr]);
    if (dupCheck.rowCount > 0) {
      return res.status(409).json({
        ok: false,
        error: `Duplicate Reference: Payment UTR "${cleanUtr}" has already been credited in the ledger.`,
      });
    }

    const custCheck = await query(`SELECT id, company_name, contact_person, phone FROM customers WHERE id = $1`, [customerId]);
    if (custCheck.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Customer account not found.' });
    }
    const customer = custCheck.rows[0];

    let recordedNewBalance = 0;
    let recordedOldBalance = 0;

    await withTransaction(async (tx) => {
      const walletRes = await tx(
        `SELECT id, available_balance, total_lifetime_paid FROM wallets WHERE customer_id = $1 FOR UPDATE`,
        [customerId]
      );

      if (walletRes.rowCount === 0) {
        throw new Error('Customer wallet record not found.');
      }

      const currentBalance = Number(walletRes.rows[0].available_balance);
      const newBalance = Number((currentBalance + creditAmount).toFixed(2));
      const newLifetime = Number((Number(walletRes.rows[0].total_lifetime_paid) + creditAmount).toFixed(2));
      recordedOldBalance = currentBalance;
      recordedNewBalance = newBalance;

      // 1. Update wallet balance
      await tx(
        `UPDATE wallets
         SET available_balance = $1,
             total_lifetime_paid = $2,
             updated_at = NOW()
         WHERE customer_id = $3`,
        [newBalance, newLifetime, customerId]
      );

      // 2. Mark customer payment status active/paid
      await tx(
        `UPDATE customers
         SET payment_status = 'paid',
             updated_at = NOW()
         WHERE id = $1`,
        [customerId]
      );

      // 3. Insert into wallet transactions
      const txId = `tx_manual_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      await tx(
        `INSERT INTO wallet_transactions (
          id, customer_id, wallet_id, tx_type, amount, balance_after, reference_utr, description, payment_method, status, created_at
        ) VALUES ($1, $2, $3, 'Credit', $4, $5, $6, $7, $8, 'Verified ✓', NOW())`,
        [
          txId,
          customerId,
          walletRes.rows[0].id,
          creditAmount,
          newBalance,
          cleanUtr,
          description.trim(),
          paymentMethod,
        ]
      );

      // 4. Insert into payment_records for billing / invoices
      const receiptNo = `REC_${Date.now()}_${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
      await tx(
        `INSERT INTO payment_records (
          id, receipt_number, customer_id, company_name, contact_person, phone, tx_type, amount, gst_amount, total_amount, payment_mode, utr_reference, status, paid_at
        ) VALUES ($1, $2, $3, $4, $5, $6, 'topup', $7, 0.00, $7, $8, $9, 'paid', NOW())`,
        [
          `pay_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          receiptNo,
          customerId,
          customer.company_name,
          customer.contact_person,
          customer.phone,
          creditAmount,
          paymentMethod,
          cleanUtr,
        ]
      );
    });

    await logSuperAdminAudit({
      actorId: adminId,
      actorName: adminName,
      actionType: 'MANUAL_WALLET_CREDIT',
      targetType: 'wallet',
      targetId: customerId,
      details: {
        companyName: customer.company_name,
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
      companyName: customer.company_name,
      amount: creditAmount,
      previousBalance: recordedOldBalance,
      newBalance: recordedNewBalance,
      referenceUtr: cleanUtr,
      message: `Top-up of ₹${creditAmount.toFixed(2)} applied successfully to ${customer.company_name}'s wallet.`,
    });
  } catch (err) {
    console.error('[POST /api/superadmin/topups/manual-credit]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// =============================================================================
// 6. ACCOUNT BLOCK / ACTIVATE (/api/superadmin/accounts/*)
// =============================================================================
superadminRouter.get('/accounts', async (req, res) => {
  try {
    const { status, type = 'business', search, page = 1, limit = 25 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;

    if (type === 'user') {
      const conditions = [];
      const params = [];

      if (status && status !== 'all') {
        params.push(status);
        conditions.push(`u.status = $${params.length}`);
      }

      if (search && search.trim()) {
        params.push(`%${search.trim().toLowerCase()}%`);
        const idx = params.length;
        conditions.push(
          `(LOWER(u.full_name) LIKE $${idx} OR LOWER(u.email) LIKE $${idx} OR LOWER(u.username) LIKE $${idx})`
        );
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countRes = await query(`SELECT COUNT(*)::INT AS total FROM system_users u ${whereClause}`, params);
      const totalCount = countRes.rows[0]?.total || 0;

      const listRes = await query(
        `SELECT
          u.id, u.full_name, u.email, u.username, u.phone, u.role, u.permissions,
          u.status, u.last_login_at, u.created_at,
          c.company_name AS business_name
         FROM system_users u
         LEFT JOIN customers c ON c.id = u.customer_id
         ${whereClause}
         ORDER BY u.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limitNum, offset]
      );

      return res.json({
        ok: true,
        type: 'user',
        accounts: listRes.rows,
        pagination: {
          total: totalCount,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(totalCount / limitNum) || 1,
        },
      });
    }

    // Business Accounts (customers)
    const conditions = [];
    const params = [];

    if (status && status !== 'all') {
      params.push(status);
      conditions.push(`c.status = $${params.length}`);
    }

    if (search && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      const idx = params.length;
      conditions.push(
        `(LOWER(c.company_name) LIKE $${idx} OR LOWER(c.contact_person) LIKE $${idx} OR c.phone LIKE $${idx} OR LOWER(COALESCE(c.email, '')) LIKE $${idx} OR LOWER(c.id) LIKE $${idx})`
      );
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await query(`SELECT COUNT(*)::INT AS total FROM customers c ${whereClause}`, params);
    const totalCount = countRes.rows[0]?.total || 0;

    const listRes = await query(
      `SELECT
        c.id, c.company_name, c.contact_person, c.phone, c.email, c.category, c.city,
        c.status, c.registered_at, c.created_at,
        w.available_balance, w.daily_ad_spend, w.ad_campaign_active,
        (SELECT COUNT(*)::INT FROM marketing_campaigns mc WHERE mc.customer_id = c.id AND mc.status = 'Running') AS running_campaigns,
        (SELECT COUNT(*)::INT FROM leads l WHERE l.customer_id = c.id) AS total_leads
       FROM customers c
       LEFT JOIN wallets w ON w.customer_id = c.id
       ${whereClause}
       ORDER BY c.registered_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limitNum, offset]
    );

    res.json({
      ok: true,
      type: 'business',
      accounts: listRes.rows,
      pagination: {
        total: totalCount,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(totalCount / limitNum) || 1,
      },
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
      const userRes = await query(`SELECT * FROM system_users WHERE id = $1`, [id]);
      if (userRes.rowCount === 0) {
        return res.status(404).json({ ok: false, error: 'System user not found.' });
      }

      const user = userRes.rows[0];

      // Protect last active Super Admin from accidental lockout
      if (user.role === 'Super Admin' && status !== 'active') {
        const activeAdmins = await query(
          `SELECT COUNT(*)::INT AS count FROM system_users WHERE role = 'Super Admin' AND status = 'active' AND id != $1`,
          [id]
        );
        if ((activeAdmins.rows[0]?.count || 0) < 1) {
          return res.status(403).json({
            ok: false,
            error: 'Lockout Prevention: Cannot suspend or block the last active Super Admin account.',
          });
        }
      }

      await query(`UPDATE system_users SET status = $1, updated_at = NOW() WHERE id = $2`, [status, id]);

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
    const custRes = await query(`SELECT * FROM customers WHERE id = $1`, [id]);
    if (custRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Business account not found.' });
    }

    const customer = custRes.rows[0];
    const previousStatus = customer.status;

    await withTransaction(async (tx) => {
      // 1. Update customer status
      await tx(`UPDATE customers SET status = $1, updated_at = NOW() WHERE id = $2`, [status, id]);

      // 2. Record in account_status_history
      const historyId = `ash_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      await tx(
        `INSERT INTO account_status_history (id, customer_id, previous_status, new_status, reason, changed_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [historyId, id, previousStatus, status, reason.trim(), adminName]
      );

      // 3. If suspending, pause active campaigns and wallet pacing
      if (status === 'suspended') {
        await tx(
          `UPDATE marketing_campaigns
           SET status = 'Paused', last_action = 'System Hold (Suspended)', last_actor = $1, last_action_at = NOW(), updated_at = NOW()
           WHERE customer_id = $2 AND status = 'Running'`,
          [adminName, id]
        );

        await tx(
          `UPDATE wallets SET ad_campaign_active = FALSE, updated_at = NOW() WHERE customer_id = $1`,
          [id]
        );
      }
    });

    await logSuperAdminAudit({
      actorId: adminId,
      actorName: adminName,
      actionType: status === 'active' ? 'ACCOUNT_ACTIVATED' : 'ACCOUNT_SUSPENDED',
      targetType: 'business',
      targetId: id,
      reason: reason.trim(),
      details: { previousStatus, newStatus: status, companyName: customer.company_name },
    });

    res.json({
      ok: true,
      message: `Business account "${customer.company_name}" status updated to ${status}.`,
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
    const historyRes = await query(
      `SELECT * FROM account_status_history WHERE customer_id = $1 ORDER BY created_at DESC`,
      [id]
    );

    res.json({ ok: true, history: historyRes.rows });
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
      category = 'IT & Software',
      city = 'Mumbai',
      state = 'Maharashtra',
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

    // Check duplicate phone or username
    const phoneCheck = await query(`SELECT id FROM customers WHERE phone = $1 OR LOWER(username) = $2`, [cleanPhone, finalUsername]);
    if (phoneCheck.rowCount > 0) {
      return res.status(409).json({ ok: false, error: `A business with mobile ${cleanPhone} or username "${finalUsername}" is already registered.` });
    }

    const custId = `cust_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const walletId = `wlt_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const parsedInitialBalance = Math.max(0, parseFloat(initialBalance) || 0);

    await withTransaction(async (tx) => {
      // 1. Create Customer Business
      await tx(
        `INSERT INTO customers (
          id, username, phone, email, password_hash, company_name, category, contact_person, city, state,
          status, profile_status, payment_status, kyc_percent, verified, is_self_registered, registered_from, registered_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          'active', 'complete', 'paid', 100, TRUE, FALSE, 'Super Admin Control Center', NOW()
        )`,
        [
          custId,
          finalUsername,
          cleanPhone,
          email.trim() || null,
          finalPassword,
          companyName.trim(),
          category.trim(),
          contactPerson.trim(),
          city.trim(),
          state.trim(),
        ]
      );

      // 2. Create Marketing Wallet
      await tx(
        `INSERT INTO wallets (
          id, customer_id, available_balance, daily_ad_spend, total_lifetime_paid, total_ad_spent, ad_campaign_active, created_at
        ) VALUES ($1, $2, $3, 300.00, $4, 0.00, FALSE, NOW())`,
        [walletId, custId, parsedInitialBalance, parsedInitialBalance]
      );

      // 3. If initial balance provided, record initial deposit transaction
      if (parsedInitialBalance > 0) {
        const txId = `tx_init_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        await tx(
          `INSERT INTO wallet_transactions (
            id, customer_id, wallet_id, tx_type, amount, balance_after, reference_utr, description, payment_method, status, created_at
          ) VALUES ($1, $2, $3, 'Credit', $4, $5, $6, 'Super Admin Initial Account Balance', 'Admin Verified Credit', 'Verified ✓', NOW())`,
          [
            txId,
            custId,
            walletId,
            parsedInitialBalance,
            parsedInitialBalance,
            `INIT_${Date.now()}_${Math.random().toString(36).substr(2, 4).toUpperCase()}`,
          ]
        );
      }
    });

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

    // Check duplicate
    const dupCheck = await query(
      `SELECT id FROM system_users WHERE LOWER(email) = $1 OR LOWER(username) = $2`,
      [cleanEmail, cleanUsername]
    );

    if (dupCheck.rowCount > 0) {
      return res.status(409).json({ ok: false, error: 'A user with this email or username already exists.' });
    }

    const userId = `usr_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const permsJson = JSON.stringify(Array.isArray(permissions) ? permissions : ['all']);

    await query(
      `INSERT INTO system_users (
        id, customer_id, full_name, email, username, phone, password_hash, role, department, permissions, status, created_by, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())`,
      [
        userId,
        customerId || null,
        fullName.trim(),
        cleanEmail,
        cleanUsername,
        cleanPhone || null,
        finalPassword,
        role,
        userDept,
        permsJson,
        status,
        adminName,
      ]
    );

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

    const check = await query(`SELECT id, company_name, username, phone, email FROM customers WHERE id = $1`, [id]);
    if (check.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Customer business not found.' });
    }

    await query(`UPDATE customers SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [newPassword.trim(), id]);

    await logSuperAdminAudit({
      actorId: 'superadmin',
      actorName: adminName,
      actionType: 'ACCOUNT_PASSWORD_RESET',
      targetType: 'business',
      targetId: id,
      details: { companyName: check.rows[0].company_name },
    });

    res.json({
      ok: true,
      customerId: id,
      username: check.rows[0].username,
      companyName: check.rows[0].company_name,
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

    const check = await query(`SELECT id, full_name, username, email FROM system_users WHERE id = $1`, [id]);
    if (check.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'User not found.' });
    }

    await query(`UPDATE system_users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [newPassword.trim(), id]);

    await logSuperAdminAudit({
      actorId: 'superadmin',
      actorName: adminName,
      actionType: 'USER_PASSWORD_RESET',
      targetType: 'user',
      targetId: id,
      details: { username: check.rows[0].username, fullName: check.rows[0].full_name },
    });

    res.json({
      ok: true,
      userId: id,
      username: check.rows[0].username,
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
    const listRes = await query(
      `SELECT
        u.id, u.customer_id, u.full_name, u.email, u.username, u.phone, u.role, COALESCE(u.department, 'Super Admin') AS department, u.permissions,
        u.status, u.last_login_at, u.created_by, u.created_at,
        c.company_name AS business_name
       FROM system_users u
       LEFT JOIN customers c ON c.id = u.customer_id
       ORDER BY u.created_at DESC`
    );

    res.json({ ok: true, users: listRes.rows });
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
    const { actionType, targetType, search, page = 1, limit = 30 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];

    if (actionType && actionType !== 'all') {
      params.push(actionType);
      conditions.push(`action_type = $${params.length}`);
    }

    if (targetType && targetType !== 'all') {
      params.push(targetType);
      conditions.push(`target_type = $${params.length}`);
    }

    if (search && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      const idx = params.length;
      conditions.push(
        `(LOWER(actor_name) LIKE $${idx} OR LOWER(target_id) LIKE $${idx} OR LOWER(COALESCE(reason, '')) LIKE $${idx})`
      );
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await query(
      `SELECT COUNT(*)::INT AS total FROM superadmin_audit_logs ${whereClause}`,
      params
    );
    const totalCount = countRes.rows[0]?.total || 0;

    const listRes = await query(
      `SELECT * FROM superadmin_audit_logs
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limitNum, offset]
    );

    res.json({
      ok: true,
      logs: listRes.rows,
      pagination: {
        total: totalCount,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(totalCount / limitNum) || 1,
      },
    });
  } catch (err) {
    console.error('[GET /api/superadmin/audit-logs]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});
