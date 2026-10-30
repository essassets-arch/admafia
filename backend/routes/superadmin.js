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

// Submit a new refund request
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

    const [custRes, walletRes] = await Promise.all([
      query(`SELECT * FROM customers WHERE id = $1`, [customerId]),
      query(`SELECT * FROM wallets WHERE customer_id = $1`, [customerId]),
    ]);

    if (custRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Customer not found.' });
    }

    const currentBal = Number(walletRes.rows[0]?.available_balance || 0);
    if (refundAmount > currentBal) {
      return res.status(400).json({
        ok: false,
        error: `Requested refund (₹${refundAmount.toFixed(2)}) exceeds current wallet available balance (₹${currentBal.toFixed(2)}).`,
      });
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

// Review refund decision (Approve or Reject with atomic safeguards)
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

    const refundCheck = await query(`SELECT * FROM refund_requests WHERE id = $1`, [id]);
    if (refundCheck.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Refund request not found.' });
    }

    const refund = refundCheck.rows[0];
    if (refund.status === 'Completed' || refund.status === 'Approved') {
      return res.status(409).json({ ok: false, error: 'This refund has already been approved and processed.' });
    }
    if (refund.status === 'Rejected') {
      return res.status(409).json({ ok: false, error: 'This refund has already been rejected.' });
    }

    const refundAmount = Number(refund.amount);

    if (finalDecision === 'Rejected') {
      await query(
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

      await logSuperAdminAudit({
        actorId: adminId,
        actorName: adminName,
        actionType: 'REFUND_REJECTED',
        targetType: 'refund',
        targetId: id,
        reason: reason.trim(),
        details: { customerId: refund.customer_id, amount: refundAmount },
      });

      return res.json({ ok: true, message: 'Refund request rejected with recorded reason.' });
    }

    // Process Approved Refund atomically
    const providerRef = `REF_PAY_${Date.now()}_${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    await withTransaction(async (tx) => {
      // 1. Lock wallet row for update
      const walletRes = await tx(
        `SELECT id, available_balance FROM wallets WHERE customer_id = $1 FOR UPDATE`,
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

      // 2. Deduct from wallet
      await tx(
        `UPDATE wallets
         SET available_balance = $1,
             updated_at = NOW()
         WHERE customer_id = $2`,
        [balanceAfter, refund.customer_id]
      );

      // 3. Record debit in wallet transactions ledger
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

      // 4. Update refund record
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
    });

    await logSuperAdminAudit({
      actorId: adminId,
      actorName: adminName,
      actionType: 'REFUND_APPROVED',
      targetType: 'refund',
      targetId: id,
      reason: reason || 'Approved and credited back to customer banking source',
      details: { customerId: refund.customer_id, amount: refundAmount, providerRef },
    });

    res.json({
      ok: true,
      message: `Refund of ₹${refundAmount.toFixed(2)} approved and deducted atomically from wallet.`,
      providerRef,
    });
  } catch (err) {
    console.error('[PATCH /api/superadmin/refunds/:id/review]', err);
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

      await tx(
        `UPDATE wallets
         SET available_balance = $1,
             total_lifetime_paid = $2,
             updated_at = NOW()
         WHERE customer_id = $3`,
        [newBalance, newLifetime, customerId]
      );

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
    });

    await logSuperAdminAudit({
      actorId: adminId,
      actorName: adminName,
      actionType: 'MANUAL_WALLET_CREDIT',
      targetType: 'wallet',
      targetId: customerId,
      details: { amount: creditAmount, referenceUtr: cleanUtr, description: description.trim() },
    });

    res.json({
      ok: true,
      message: `Manual credit of ₹${creditAmount.toFixed(2)} applied successfully to customer wallet.`,
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
      category = 'IT & Software',
      city = 'Mumbai',
      state = 'Maharashtra',
      password = 'Customer@2026!',
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

    // Check duplicate phone or username
    const phoneCheck = await query(`SELECT id FROM customers WHERE phone = $1`, [cleanPhone]);
    if (phoneCheck.rowCount > 0) {
      return res.status(409).json({ ok: false, error: `A business with phone number ${cleanPhone} is already registered.` });
    }

    const custId = `cust_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const username = `biz_${cleanPhone}`;
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
          username,
          cleanPhone,
          email.trim() || null,
          password.trim(),
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
      details: { companyName: companyName.trim(), contactPerson: contactPerson.trim(), phone: cleanPhone },
    });

    res.status(201).json({
      ok: true,
      customerId: custId,
      username,
      companyName: companyName.trim(),
      message: 'Business account created and activated successfully.',
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
      password = 'User@2026!',
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
        id, customer_id, full_name, email, username, phone, password_hash, role, permissions, status, created_by, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())`,
      [
        userId,
        customerId || null,
        fullName.trim(),
        cleanEmail,
        cleanUsername,
        phone.trim() || null,
        password.trim(),
        role,
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
      details: { fullName: fullName.trim(), email: cleanEmail, username: cleanUsername, role },
    });

    res.status(201).json({
      ok: true,
      userId,
      username: cleanUsername,
      email: cleanEmail,
      role,
      message: 'System user registered successfully.',
    });
  } catch (err) {
    console.error('[POST /api/superadmin/users]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// List all system users
superadminRouter.get('/users', async (req, res) => {
  try {
    const listRes = await query(
      `SELECT id, customer_id, full_name, email, username, phone, role, permissions, status, last_login_at, created_by, created_at
       FROM system_users
       ORDER BY created_at DESC`
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
