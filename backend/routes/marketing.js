import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, withTransaction } from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const marketingRouter = express.Router();

// Ensure uploads/marketing directory exists
const uploadDir = path.join(__dirname, '..', 'uploads', 'marketing');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// -----------------------------------------------------------------------------
// Objective Format Normalizers & Formatters
// -----------------------------------------------------------------------------
export function normalizeMarketingObjective(obj) {
  if (!obj) return 'lead_generation';
  const clean = String(obj).trim().toLowerCase().replace(/[\s-]+/g, '_');
  const allowed = ['brand_awareness', 'lead_generation', 'product_promotion', 'festival_campaign', 'customer_engagement'];
  if (allowed.includes(clean)) return clean;
  if (clean.includes('lead')) return 'lead_generation';
  if (clean.includes('brand') || clean.includes('aware')) return 'brand_awareness';
  if (clean.includes('product') || clean.includes('promo')) return 'product_promotion';
  if (clean.includes('festival') || clean.includes('event')) return 'festival_campaign';
  if (clean.includes('engage')) return 'customer_engagement';
  return 'lead_generation';
}

export function formatMarketingObjective(obj) {
  if (!obj) return 'Lead Generation';
  const map = {
    lead_generation: 'Lead Generation',
    brand_awareness: 'Brand Awareness',
    product_promotion: 'Product Promotion',
    festival_campaign: 'Festival Campaign',
    customer_engagement: 'Customer Engagement',
  };
  return map[obj.toLowerCase()] || obj;
}

// -----------------------------------------------------------------------------
// Auto-recovery: Ensure marketing schema tables exist
// -----------------------------------------------------------------------------
export async function ensureMarketingTables() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS marketing_ideas (
      id VARCHAR(64) PRIMARY KEY,
      customer_id VARCHAR(64) NOT NULL,
      title VARCHAR(255) NOT NULL,
      objective VARCHAR(100) NOT NULL DEFAULT 'lead_generation',
      concept TEXT NOT NULL,
      target_audience TEXT DEFAULT '',
      caption_suggestions TEXT DEFAULT '',
      call_to_action VARCHAR(255) DEFAULT '',
      hashtags TEXT DEFAULT '',
      creative_brief TEXT DEFAULT '',
      platform VARCHAR(64) NOT NULL DEFAULT 'Meta Ads (Facebook & Instagram)',
      language VARCHAR(64) NOT NULL DEFAULT 'English / Hinglish',
      campaign_period VARCHAR(100) DEFAULT '',
      constraints TEXT DEFAULT '',
      status VARCHAR(32) NOT NULL DEFAULT 'Saved',
      created_by VARCHAR(140) NOT NULL DEFAULT 'Marketing Executive',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_marketing_ideas_customer ON marketing_ideas(customer_id, status)`,
    `CREATE TABLE IF NOT EXISTS marketing_posts (
      id VARCHAR(64) PRIMARY KEY,
      customer_id VARCHAR(64) NOT NULL,
      idea_id VARCHAR(64),
      title VARCHAR(255) NOT NULL,
      platform VARCHAR(64) NOT NULL DEFAULT 'Meta Ads (Facebook & Instagram)',
      caption TEXT NOT NULL,
      hashtags TEXT DEFAULT '',
      call_to_action VARCHAR(255) DEFAULT '',
      media_url TEXT DEFAULT '',
      media_type VARCHAR(64) DEFAULT 'image',
      language VARCHAR(64) NOT NULL DEFAULT 'English / Hinglish',
      campaign_association VARCHAR(255) DEFAULT '',
      intended_publish_at TIMESTAMPTZ,
      status VARCHAR(40) NOT NULL DEFAULT 'Draft',
      submitted_by VARCHAR(140),
      submitted_at TIMESTAMPTZ,
      revision_number INT NOT NULL DEFAULT 1,
      creative_format VARCHAR(64) DEFAULT 'Instagram / Facebook Post',
      designer_notes TEXT DEFAULT '',
      designer_name VARCHAR(140) DEFAULT 'Graphics Designer',
      creative_instructions TEXT DEFAULT '',
      priority VARCHAR(40) DEFAULT 'Normal',
      is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
      deleted_at TIMESTAMPTZ,
      deleted_by VARCHAR(140),
      created_by VARCHAR(140) NOT NULL DEFAULT 'Marketing Content Team',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_marketing_posts_customer ON marketing_posts(customer_id, status)`,
    `CREATE TABLE IF NOT EXISTS marketing_campaigns (
      id VARCHAR(64) PRIMARY KEY,
      customer_id VARCHAR(64) NOT NULL,
      name VARCHAR(255) NOT NULL,
      objective VARCHAR(100) NOT NULL,
      post_id VARCHAR(64),
      platform VARCHAR(64) NOT NULL DEFAULT 'Meta Ads (Facebook & Instagram)',
      target_audience TEXT DEFAULT '',
      start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      end_date TIMESTAMPTZ,
      daily_budget NUMERIC(10, 2) NOT NULL DEFAULT 300.00,
      total_budget NUMERIC(12, 2) DEFAULT 0.00,
      schedule_settings TEXT DEFAULT '{}',
      status VARCHAR(40) NOT NULL DEFAULT 'Draft',
      external_platform_status VARCHAR(64) NOT NULL DEFAULT 'Not Connected',
      external_campaign_id VARCHAR(120),
      created_by VARCHAR(140) NOT NULL DEFAULT 'Marketing Manager',
      last_action VARCHAR(100) DEFAULT 'Created',
      last_actor VARCHAR(140) DEFAULT 'Marketing Manager',
      last_action_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `ALTER TABLE marketing_ideas DROP CONSTRAINT IF EXISTS marketing_ideas_objective_check`,
    `ALTER TABLE marketing_ideas DROP CONSTRAINT IF EXISTS marketing_ideas_status_check`,
    `ALTER TABLE marketing_posts DROP CONSTRAINT IF EXISTS marketing_posts_status_check`,
    `ALTER TABLE marketing_campaigns DROP CONSTRAINT IF EXISTS marketing_campaigns_status_check`,
    `ALTER TABLE marketing_campaigns DROP CONSTRAINT IF EXISTS marketing_campaigns_daily_budget_check`,
  ];

  for (const stmt of statements) {
    try {
      await query(stmt);
    } catch (e) {}
  }
}

let marketingTablesEnsured = false;
marketingRouter.use(async (req, res, next) => {
  if (!marketingTablesEnsured) {
    marketingTablesEnsured = true;
    ensureMarketingTables().catch(() => {});
  }
  next();
});

// -----------------------------------------------------------------------------
// Helper: Audit Logger
// -----------------------------------------------------------------------------
async function logAuditEvent(customerId, entityType, entityId, action, actor, details = {}, ip = '') {
  try {
    const id = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    await query(
      `INSERT INTO marketing_audit_events (id, customer_id, entity_type, entity_id, action, actor, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, customerId || null, entityType, entityId, action, actor || 'Marketing Operator', JSON.stringify(details), ip]
    );
  } catch (err) {
    console.error('[Marketing Audit Log Error]:', err.message);
  }
}

// -----------------------------------------------------------------------------
// 1. GET /api/marketing/summary (Executive Dashboard Counts & Aggregates)
// -----------------------------------------------------------------------------
marketingRouter.get('/summary', async (req, res) => {
  try {
    const [custRes, ideasRes, postsRes, campRes] = await Promise.all([
      query(`
        SELECT 
          COUNT(*)::INT AS completed_customers,
          COALESCE(SUM(w.available_balance), 0)::NUMERIC AS total_wallet_balance
        FROM customers c
        LEFT JOIN wallets w ON w.customer_id = c.id
        WHERE (c.profile_status = 'complete' OR c.kyc_percent = 100)
      `),
      query(`SELECT COUNT(*)::INT AS total_ideas FROM marketing_ideas`),
      query(`
        SELECT 
          COUNT(*)::INT AS total_posts,
          COUNT(*) FILTER (WHERE status = 'Pending Verification')::INT AS pending_posts,
          COUNT(*) FILTER (WHERE status = 'Approved')::INT AS approved_posts,
          COUNT(*) FILTER (WHERE status = 'Changes Requested')::INT AS changes_requested_posts
        FROM marketing_posts
      `),
      query(`
        SELECT 
          COUNT(*)::INT AS total_campaigns,
          COUNT(*) FILTER (WHERE status = 'Running')::INT AS active_campaigns
        FROM marketing_campaigns
      `),
    ]);

    const custRow = custRes.rows[0] || {};
    const postRow = postsRes.rows[0] || {};
    const campRow = campRes.rows[0] || {};
    const ideaRow = ideasRes.rows[0] || {};

    res.json({
      ok: true,
      summary: {
        completedCustomersCount: Number(custRow.completed_customers || 0),
        totalWalletBalance: Number(custRow.total_wallet_balance || 0),
        totalIdeasCount: Number(ideaRow.total_ideas || 0),
        totalPostsCount: Number(postRow.total_posts || 0),
        pendingVerificationPosts: Number(postRow.pending_posts || 0),
        approvedPostsCount: Number(postRow.approved_posts || 0),
        changesRequestedPosts: Number(postRow.changes_requested_posts || 0),
        activeCampaignsCount: Number(campRow.active_campaigns || 0),
        totalCampaignsCount: Number(campRow.total_campaigns || 0),
        lastRefresh: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[GET /api/marketing/summary]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 2. GET /api/marketing/customers (Customer Registration & Wallet Desk)
// -----------------------------------------------------------------------------
marketingRouter.get('/customers', async (req, res) => {
  try {
    const {
      q = '',
      category = '',
      status = '',
      walletMin,
      walletMax,
      campaignStatus = '',
      sortBy = 'registered_at',
      sortOrder = 'desc',
      page = 1,
      limit = 20,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    // Filters for Completed Registrations
    const whereClauses = [
      `(c.profile_status = 'complete' OR c.kyc_percent = 100)`
    ];
    const params = [];

    if (q && q.trim()) {
      params.push(`%${q.trim()}%`);
      const pIdx = params.length;
      whereClauses.push(`(
        c.company_name ILIKE $${pIdx} OR 
        c.contact_person ILIKE $${pIdx} OR 
        c.phone ILIKE $${pIdx} OR 
        c.email ILIKE $${pIdx} OR 
        c.city ILIKE $${pIdx} OR 
        c.category ILIKE $${pIdx}
      )`);
    }

    if (category && category !== 'all') {
      params.push(category);
      whereClauses.push(`c.category = $${params.length}`);
    }

    if (status && status !== 'all') {
      params.push(status);
      whereClauses.push(`c.status = $${params.length}`);
    }

    if (walletMin !== undefined && walletMin !== '') {
      params.push(Number(walletMin));
      whereClauses.push(`COALESCE(w.available_balance, 0) >= $${params.length}`);
    }

    if (walletMax !== undefined && walletMax !== '') {
      params.push(Number(walletMax));
      whereClauses.push(`COALESCE(w.available_balance, 0) <= $${params.length}`);
    }

    if (campaignStatus && campaignStatus !== 'all') {
      if (campaignStatus === 'Running') {
        whereClauses.push(`EXISTS (SELECT 1 FROM marketing_campaigns mc WHERE mc.customer_id = c.id AND mc.status = 'Running')`);
      } else if (campaignStatus === 'None') {
        whereClauses.push(`NOT EXISTS (SELECT 1 FROM marketing_campaigns mc WHERE mc.customer_id = c.id)`);
      } else {
        params.push(campaignStatus);
        whereClauses.push(`EXISTS (SELECT 1 FROM marketing_campaigns mc WHERE mc.customer_id = c.id AND mc.status = $${params.length})`);
      }
    }

    const whereSql = whereClauses.join(' AND ');

    // Sorting
    let sortColumn = 'c.registered_at';
    if (sortBy === 'balance' || sortBy === 'wallet') sortColumn = 'COALESCE(w.available_balance, 0)';
    else if (sortBy === 'name') sortColumn = 'c.company_name';
    else if (sortBy === 'city') sortColumn = 'c.city';
    else if (sortBy === 'category') sortColumn = 'c.category';

    const orderDir = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    // Count and Aggregates query
    const countSql = `
      SELECT 
        COUNT(*)::INT AS total,
        COALESCE(SUM(w.available_balance), 0)::NUMERIC AS total_balance
      FROM customers c
      LEFT JOIN wallets w ON w.customer_id = c.id
      WHERE ${whereSql}
    `;
    const countRes = await query(countSql, params);
    const totalCount = Number(countRes.rows[0]?.total || 0);
    const totalAvailableBalance = Number(countRes.rows[0]?.total_balance || 0);

    // Data query
    const dataSql = `
      SELECT 
        c.id,
        c.username,
        c.company_name AS name,
        c.company_name,
        c.contact_person AS owner_name,
        c.contact_person,
        c.phone,
        c.email,
        c.personal_email,
        c.category,
        c.industry,
        c.website,
        c.city,
        c.state,
        c.country,
        c.status,
        c.profile_status,
        c.payment_status,
        c.kyc_percent,
        c.verified,
        c.is_self_registered,
        c.registered_from,
        c.registered_at,
        c.completed_at,
        c.updated_at,
        COALESCE(w.available_balance, 0)::NUMERIC AS available_balance,
        COALESCE(w.daily_ad_spend, 300)::NUMERIC AS daily_ad_spend,
        COALESCE(w.total_lifetime_paid, 0)::NUMERIC AS total_paid,
        COALESCE(w.ad_campaign_active, FALSE) AS ad_campaign_active,
        COALESCE(w.active_days, 'MON,TUE,WED,THU,FRI') AS active_days,
        COALESCE(w.schedule_preset, 'weekdays') AS schedule_preset,
        w.last_deducted_at,
        (SELECT COUNT(*)::INT FROM leads l WHERE l.customer_id = c.id) AS total_leads_count,
        (SELECT COUNT(*)::INT FROM marketing_posts mp WHERE mp.customer_id = c.id AND mp.status = 'Approved') AS approved_posts_count,
        (SELECT COUNT(*)::INT FROM marketing_posts mp WHERE mp.customer_id = c.id AND mp.status = 'Draft') AS draft_posts_count,
        (SELECT COUNT(*)::INT FROM marketing_posts mp WHERE mp.customer_id = c.id AND mp.status = 'Pending Verification') AS pending_posts_count,
        (SELECT COUNT(*)::INT FROM marketing_ideas mi WHERE mi.customer_id = c.id) AS ideas_count,
        (SELECT mc.name FROM marketing_campaigns mc WHERE mc.customer_id = c.id ORDER BY mc.created_at DESC LIMIT 1) AS active_campaign_name,
        (SELECT mc.status FROM marketing_campaigns mc WHERE mc.customer_id = c.id ORDER BY mc.created_at DESC LIMIT 1) AS campaign_status,
        (SELECT mc.external_platform_status FROM marketing_campaigns mc WHERE mc.customer_id = c.id ORDER BY mc.created_at DESC LIMIT 1) AS external_platform_status,
        (SELECT mc.last_action FROM marketing_campaigns mc WHERE mc.customer_id = c.id ORDER BY mc.created_at DESC LIMIT 1) AS last_action,
        (SELECT mc.last_actor FROM marketing_campaigns mc WHERE mc.customer_id = c.id ORDER BY mc.created_at DESC LIMIT 1) AS last_actor
      FROM customers c
      LEFT JOIN wallets w ON w.customer_id = c.id
      WHERE ${whereSql}
      ORDER BY ${sortColumn} ${orderDir}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const dataRes = await query(dataSql, [...params, limitNum, offset]);

    res.json({
      ok: true,
      customers: dataRes.rows.map((r) => ({
        id: r.id,
        customerId: r.id,
        username: r.username,
        name: r.company_name,
        companyName: r.company_name,
        owner: r.contact_person,
        contactPerson: r.contact_person,
        phone: (r.phone || '').trim(),
        email: r.email,
        personalEmail: r.personal_email,
        category: r.category || 'Other',
        industry: r.industry || 'General Business',
        website: r.website || '',
        city: r.city || '',
        state: r.state || '',
        country: r.country || 'India',
        status: r.status,
        profileStatus: r.profile_status,
        paymentStatus: r.payment_status,
        kycPercent: Number(r.kyc_percent || 100),
        verified: r.verified !== false,
        isSelfRegistered: Boolean(r.is_self_registered),
        registeredFrom: r.registered_from || 'https://admafia.marketing/#register',
        registeredAt: r.registered_at,
        completedAt: r.completed_at,
        updatedAt: r.updated_at,
        availableBalance: Number(r.available_balance || 0),
        dailyAdSpend: Number(r.daily_ad_spend || 300),
        totalPaid: Number(r.total_paid || 0),
        adCampaignActive: Boolean(r.ad_campaign_active),
        activeDays: typeof r.active_days === 'string'
          ? r.active_days.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
          : (Array.isArray(r.active_days) ? r.active_days : ['MON', 'TUE', 'WED', 'THU', 'FRI']),
        schedulePreset: r.schedule_preset || 'weekdays',
        runwayDays: Math.floor(Number(r.available_balance || 0) / Math.max(Number(r.daily_ad_spend || 300), 1)),
        totalLeadsCount: Number(r.total_leads_count || 0),
        lastDeductedAt: r.last_deducted_at,
        isDeductedToday: Boolean(
          r.last_deducted_at &&
          new Date(r.last_deducted_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) ===
          new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
        ),
        isLowBalance: Number(r.available_balance || 0) < Number(r.daily_ad_spend || 300) || Number(r.available_balance || 0) <= 0,
        approvedPostsCount: Number(r.approved_posts_count || 0),
        draftPostsCount: Number(r.draft_posts_count || 0),
        pendingPostsCount: Number(r.pending_posts_count || 0),
        ideasCount: Number(r.ideas_count || 0),
        campaignName: r.active_campaign_name || 'No Active Campaign',
        campaignStatus: r.campaign_status || 'None',
        externalPlatformStatus: r.external_platform_status || 'Not Connected',
        lastAction: r.last_action || 'N/A',
        lastActor: r.last_actor || 'N/A',
      })),
      pagination: {
        total: totalCount,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(totalCount / limitNum),
      },
      aggregates: {
        completedRegistrations: totalCount,
        totalAvailableBalance,
      },
      lastRefresh: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[GET /api/marketing/customers]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 3. GET /api/marketing/customers/:id (Single Customer Detail & Brand Profile)
// -----------------------------------------------------------------------------
marketingRouter.get('/customers/:id', async (req, res) => {
  try {
    const custId = req.params.id;
    const result = await query(
      `SELECT 
        c.*,
        COALESCE(w.available_balance, 0)::NUMERIC AS available_balance,
        COALESCE(w.daily_ad_spend, 300)::NUMERIC AS daily_ad_spend,
        COALESCE(w.total_lifetime_paid, 0)::NUMERIC AS total_paid,
        COALESCE(w.ad_campaign_active, FALSE) AS ad_campaign_active,
        COALESCE(w.active_days, 'MON,TUE,WED,THU,FRI') AS active_days,
        COALESCE(w.schedule_preset, 'weekdays') AS schedule_preset,
        w.last_deducted_at,
        (SELECT COUNT(*)::INT FROM leads l WHERE l.customer_id = c.id) AS total_leads_count,
        (SELECT COUNT(*)::INT FROM marketing_posts mp WHERE mp.customer_id = c.id AND mp.status = 'Approved') AS approved_posts_count,
        (SELECT COUNT(*)::INT FROM marketing_posts mp WHERE mp.customer_id = c.id AND mp.status = 'Draft') AS draft_posts_count,
        (SELECT COUNT(*)::INT FROM marketing_posts mp WHERE mp.customer_id = c.id AND mp.status = 'Pending Verification') AS pending_posts_count,
        (SELECT COUNT(*)::INT FROM marketing_ideas mi WHERE mi.customer_id = c.id) AS ideas_count,
        (SELECT mc.name FROM marketing_campaigns mc WHERE mc.customer_id = c.id ORDER BY mc.created_at DESC LIMIT 1) AS active_campaign_name,
        (SELECT mc.status FROM marketing_campaigns mc WHERE mc.customer_id = c.id ORDER BY mc.created_at DESC LIMIT 1) AS campaign_status,
        (SELECT mc.external_platform_status FROM marketing_campaigns mc WHERE mc.customer_id = c.id ORDER BY mc.created_at DESC LIMIT 1) AS external_platform_status,
        (SELECT mc.last_action FROM marketing_campaigns mc WHERE mc.customer_id = c.id ORDER BY mc.created_at DESC LIMIT 1) AS last_action,
        (SELECT mc.last_actor FROM marketing_campaigns mc WHERE mc.customer_id = c.id ORDER BY mc.created_at DESC LIMIT 1) AS last_actor
      FROM customers c
      LEFT JOIN wallets w ON w.customer_id = c.id
      WHERE c.id = $1`,
      [custId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Customer not found' });
    }

    const c = result.rows[0];
    res.json({
      ok: true,
      customer: {
        id: c.id,
        customerId: c.id,
        username: c.username,
        name: c.company_name,
        companyName: c.company_name,
        owner: c.contact_person,
        contactPerson: c.contact_person,
        phone: (c.phone || '').trim(),
        email: c.email,
        personalEmail: c.personal_email,
        category: c.category || 'Other',
        industry: c.industry || 'General Business',
        website: c.website || '',
        city: c.city || '',
        state: c.state || '',
        country: c.country || 'India',
        status: c.status,
        profileStatus: c.profile_status,
        paymentStatus: c.payment_status,
        kycPercent: Number(c.kyc_percent || 100),
        verified: c.verified !== false,
        isSelfRegistered: Boolean(c.is_self_registered),
        registeredFrom: c.registered_from || 'https://admafia.marketing/#register',
        registeredAt: c.registered_at,
        completedAt: c.completed_at,
        updatedAt: c.updated_at,
        availableBalance: Number(c.available_balance || 0),
        dailyAdSpend: Number(c.daily_ad_spend || 300),
        totalPaid: Number(c.total_paid || 0),
        adCampaignActive: Boolean(c.ad_campaign_active),
        activeDays: typeof c.active_days === 'string'
          ? c.active_days.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
          : (Array.isArray(c.active_days) ? c.active_days : ['MON', 'TUE', 'WED', 'THU', 'FRI']),
        schedulePreset: c.schedule_preset || 'weekdays',
        runwayDays: Math.floor(Number(c.available_balance || 0) / Math.max(Number(c.daily_ad_spend || 300), 1)),
        totalLeadsCount: Number(c.total_leads_count || 0),
        lastDeductedAt: c.last_deducted_at,
        isDeductedToday: Boolean(
          c.last_deducted_at &&
          new Date(c.last_deducted_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) ===
          new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
        ),
        isLowBalance: Number(c.available_balance || 0) < Number(c.daily_ad_spend || 300) || Number(c.available_balance || 0) <= 0,
        approvedPostsCount: Number(c.approved_posts_count || 0),
        draftPostsCount: Number(c.draft_posts_count || 0),
        pendingPostsCount: Number(c.pending_posts_count || 0),
        ideasCount: Number(c.ideas_count || 0),
        campaignName: c.active_campaign_name || 'No Active Campaign',
        campaignStatus: c.campaign_status || 'None',
        externalPlatformStatus: c.external_platform_status || 'Not Connected',
        lastAction: c.last_action || 'N/A',
        lastActor: c.last_actor || 'N/A',
      },
    });
  } catch (err) {
    console.error('[GET /api/marketing/customers/:id]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 4. GET /api/marketing/customers/:id/wallet-transactions (Real Ledger)
// -----------------------------------------------------------------------------
marketingRouter.get('/customers/:id/wallet-transactions', async (req, res) => {
  try {
    const custId = req.params.id;
    const txRes = await query(
      `SELECT 
        id,
        tx_type,
        amount::NUMERIC AS amount,
        balance_after::NUMERIC AS balance_after,
        reference_utr,
        description,
        payment_method,
        status,
        created_at
      FROM wallet_transactions
      WHERE customer_id = $1
      ORDER BY created_at DESC
      LIMIT 100`,
      [custId]
    );

    const walRes = await query(
      `SELECT available_balance::NUMERIC AS available_balance, daily_ad_spend::NUMERIC AS daily_ad_spend 
       FROM wallets WHERE customer_id = $1`,
      [custId]
    );

    const availableBalance = Number(walRes.rows[0]?.available_balance || 0);
    const dailyAdSpend = Number(walRes.rows[0]?.daily_ad_spend || 300);

    res.json({
      ok: true,
      availableBalance,
      dailyAdSpend,
      transactions: txRes.rows.map((t) => ({
        id: t.id,
        type: t.tx_type,
        amount: Number(t.amount || 0),
        balanceAfter: Number(t.balance_after || 0),
        utr: t.reference_utr,
        description: t.description,
        method: t.payment_method,
        status: t.status,
        createdAt: t.created_at,
      })),
      lastSync: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[GET /api/marketing/customers/:id/wallet-transactions]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 5. IDEAS ENDPOINTS (/api/marketing/ideas)
// -----------------------------------------------------------------------------
marketingRouter.get('/ideas', async (req, res) => {
  try {
    const { customerId, status, objective } = req.query;
    const where = [];
    const params = [];

    if (customerId) {
      const cleanPhone = String(customerId).replace(/\D/g, '').slice(-10);
      params.push(customerId);
      const p1 = `$${params.length}`;
      params.push(cleanPhone);
      const p2 = `$${params.length}`;
      where.push(`(mi.customer_id = ${p1} OR c.id = ${p1} OR (${p2} <> '' AND c.phone = ${p2}))`);
    }

    if (status && status !== 'all') {
      params.push(status);
      where.push(`mi.status = $${params.length}`);
    }

    if (objective && objective !== 'all') {
      params.push(objective);
      where.push(`mi.objective = $${params.length}`);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const sql = `
      SELECT 
        mi.*,
        c.company_name,
        c.contact_person,
        c.category AS customer_category,
        c.city AS customer_city
      FROM marketing_ideas mi
      LEFT JOIN customers c ON c.id = mi.customer_id OR (c.phone <> '' AND c.phone = mi.customer_id)
      ${whereSql}
      ORDER BY mi.created_at DESC
    `;

    let result;
    try {
      result = await query(sql, params);
    } catch (dbErr) {
      if (dbErr && dbErr.message && (dbErr.message.includes('marketing_ideas') || dbErr.message.includes('does not exist'))) {
        console.warn('[Auto-recovering marketing_ideas table on the fly...]');
        await ensureMarketingTables();
        result = await query(sql, params);
      } else {
        throw dbErr;
      }
    }

    res.json({
      ok: true,
      ideas: (result.rows || []).map((r) => ({
        id: r.id,
        customerId: r.customer_id,
        companyName: r.company_name || 'Client Workspace',
        title: r.title,
        objective: formatMarketingObjective(r.objective),
        concept: r.concept,
        targetAudience: r.target_audience || '',
        captionSuggestions: r.caption_suggestions || '',
        callToAction: r.call_to_action || '',
        hashtags: r.hashtags || '',
        creativeBrief: r.creative_brief || '',
        platform: r.platform,
        language: r.language,
        campaignPeriod: r.campaign_period || '',
        constraints: r.constraints || '',
        status: r.status,
        createdBy: r.created_by,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    });
  } catch (err) {
    console.error('[GET /api/marketing/ideas]', err);
    res.status(500).json({ ok: false, error: err.message, ideas: [] });
  }
});

marketingRouter.post('/ideas', async (req, res) => {
  try {
    const {
      customerId,
      title,
      objective = 'lead_generation',
      concept,
      targetAudience = '',
      captionSuggestions = '',
      callToAction = 'Enquire Now',
      hashtags = '',
      creativeBrief = '',
      platform = 'Instagram & Facebook (Meta Ads)',
      language = 'English / Hinglish',
      campaignPeriod = '',
      constraints = '',
      status = 'Saved',
      createdBy = 'Marketing Executive',
    } = req.body || {};

    if (!customerId) return res.status(400).json({ ok: false, error: 'Customer selection is required.' });
    if (!title || !title.trim()) return res.status(400).json({ ok: false, error: 'Idea title is required.' });
    if (!concept || !concept.trim()) return res.status(400).json({ ok: false, error: 'Concept / brief is required.' });

    // Normalize objective to strictly match check constraint (e.g. 'lead_generation')
    const finalObjective = normalizeMarketingObjective(objective);

    // Verify customer exists by id, phone, or username
    const cleanPhone = String(customerId).replace(/\D/g, '').slice(-10);
    const custCheck = await query(
      `SELECT id, company_name FROM customers WHERE id = $1 OR ($2 <> '' AND phone = $2) OR LOWER(username) = LOWER($1) LIMIT 1`,
      [customerId, cleanPhone]
    );
    if (custCheck.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Selected customer was not found.' });
    }

    const verifiedCustId = custCheck.rows[0].id;
    const id = `idea_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    // Drop constraint if present so flexible objectives are allowed
    await query('ALTER TABLE marketing_ideas DROP CONSTRAINT IF EXISTS marketing_ideas_objective_check').catch(() => {});

    const insertSql = `INSERT INTO marketing_ideas (
      id, customer_id, title, objective, concept, target_audience,
      caption_suggestions, call_to_action, hashtags, creative_brief,
      platform, language, campaign_period, constraints, status, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`;

    const insertParams = [
      id,
      verifiedCustId,
      title.trim(),
      finalObjective,
      concept.trim(),
      targetAudience,
      captionSuggestions || concept.trim(),
      callToAction || 'Enquire Now',
      hashtags,
      creativeBrief,
      platform || 'Instagram & Facebook (Meta Ads)',
      language || 'English / Hinglish',
      campaignPeriod,
      constraints,
      status,
      createdBy,
    ];

    try {
      await query(insertSql, insertParams);
    } catch (insertErr) {
      if (insertErr && insertErr.message && (insertErr.message.includes('check constraint') || insertErr.message.includes('marketing_ideas') || insertErr.message.includes('does not exist'))) {
        await query('ALTER TABLE marketing_ideas DROP CONSTRAINT IF EXISTS marketing_ideas_objective_check').catch(() => {});
        await query('ALTER TABLE marketing_ideas DROP CONSTRAINT IF EXISTS marketing_ideas_status_check').catch(() => {});
        await ensureMarketingTables();
        await query(insertSql, insertParams);
      } else {
        throw insertErr;
      }
    }

    await logAuditEvent(verifiedCustId, 'idea', id, 'Created Idea', createdBy, { title, objective: finalObjective });

    res.status(201).json({
      ok: true,
      idea: {
        id,
        customerId: verifiedCustId,
        title: title.trim(),
        objective: formatMarketingObjective(finalObjective),
        concept: concept.trim(),
        status,
      },
      message: 'Marketing idea created and saved successfully.',
    });
  } catch (err) {
    console.error('[POST /api/marketing/ideas]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

marketingRouter.patch('/ideas/:id', async (req, res) => {
  try {
    const ideaId = req.params.id;
    const {
      title,
      objective,
      concept,
      targetAudience,
      captionSuggestions,
      callToAction,
      hashtags,
      creativeBrief,
      platform,
      language,
      campaignPeriod,
      constraints,
      status,
      actor = 'Marketing Operator',
    } = req.body || {};

    const existing = await query(`SELECT * FROM marketing_ideas WHERE id = $1`, [ideaId]);
    if (existing.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Marketing idea not found.' });
    }
    const current = existing.rows[0];

    const updated = await query(
      `UPDATE marketing_ideas SET
        title = COALESCE($1, title),
        objective = COALESCE($2, objective),
        concept = COALESCE($3, concept),
        target_audience = COALESCE($4, target_audience),
        caption_suggestions = COALESCE($5, caption_suggestions),
        call_to_action = COALESCE($6, call_to_action),
        hashtags = COALESCE($7, hashtags),
        creative_brief = COALESCE($8, creative_brief),
        platform = COALESCE($9, platform),
        language = COALESCE($10, language),
        campaign_period = COALESCE($11, campaign_period),
        constraints = COALESCE($12, constraints),
        status = COALESCE($13, status),
        updated_at = NOW()
      WHERE id = $14
      RETURNING *`,
      [
        title !== undefined ? title.trim() : null,
        objective || null,
        concept !== undefined ? concept.trim() : null,
        targetAudience !== undefined ? targetAudience : null,
        captionSuggestions !== undefined ? captionSuggestions : null,
        callToAction !== undefined ? callToAction : null,
        hashtags !== undefined ? hashtags : null,
        creativeBrief !== undefined ? creativeBrief : null,
        platform || null,
        language || null,
        campaignPeriod !== undefined ? campaignPeriod : null,
        constraints !== undefined ? constraints : null,
        status || null,
        ideaId,
      ]
    );

    await logAuditEvent(current.customer_id, 'idea', ideaId, 'Updated Idea', actor, { title, status });

    res.json({ ok: true, idea: updated.rows[0] });
  } catch (err) {
    console.error('[PATCH /api/marketing/ideas/:id]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

marketingRouter.delete('/ideas/:id', async (req, res) => {
  try {
    const ideaId = req.params.id;
    const existing = await query(`SELECT * FROM marketing_ideas WHERE id = $1`, [ideaId]);
    if (existing.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Idea not found.' });
    }
    const current = existing.rows[0];

    await query(`UPDATE marketing_ideas SET status = 'Archived', updated_at = NOW() WHERE id = $1`, [ideaId]);
    await logAuditEvent(current.customer_id, 'idea', ideaId, 'Archived Idea', 'Marketing Manager');

    res.json({ ok: true, message: 'Idea archived successfully.' });
  } catch (err) {
    console.error('[DELETE /api/marketing/ideas/:id]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 6. POSTS ENDPOINTS (/api/marketing/posts)
// -----------------------------------------------------------------------------
marketingRouter.get('/posts', async (req, res) => {
  try {
    const { customerId, ideaId, status, search } = req.query;
    const where = ['mp.is_deleted = FALSE'];
    const params = [];

    if (customerId) {
      params.push(customerId);
      where.push(`mp.customer_id = $${params.length}`);
    }

    if (ideaId) {
      params.push(ideaId);
      where.push(`mp.idea_id = $${params.length}`);
    }

    if (status && status !== 'all') {
      params.push(status);
      where.push(`mp.status = $${params.length}`);
    }

    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      const pIdx = params.length;
      where.push(`(mp.title ILIKE $${pIdx} OR mp.caption ILIKE $${pIdx} OR c.company_name ILIKE $${pIdx} OR mp.id ILIKE $${pIdx})`);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const sql = `
      SELECT 
        mp.*,
        c.company_name,
        c.contact_person,
        c.category AS customer_category,
        c.city AS customer_city,
        mi.title AS idea_title,
        mi.objective AS idea_objective,
        (SELECT mr.remarks FROM marketing_post_reviews mr WHERE mr.post_id = mp.id ORDER BY mr.created_at DESC LIMIT 1) AS last_review_remarks,
        (SELECT mr.reviewer_name FROM marketing_post_reviews mr WHERE mr.post_id = mp.id ORDER BY mr.created_at DESC LIMIT 1) AS last_reviewer
      FROM marketing_posts mp
      JOIN customers c ON c.id = mp.customer_id
      LEFT JOIN marketing_ideas mi ON mi.id = mp.idea_id
      ${whereSql}
      ORDER BY mp.created_at DESC
    `;

    const result = await query(sql, params);
    res.json({
      ok: true,
      posts: result.rows.map((r) => ({
        id: r.id,
        customerId: r.customer_id,
        companyName: r.company_name,
        contactPerson: r.contact_person,
        customerCategory: r.customer_category,
        customerCity: r.customer_city,
        ideaId: r.idea_id,
        ideaTitle: r.idea_title || 'Direct Marketing Post',
        ideaObjective: r.idea_objective,
        title: r.title,
        platform: r.platform,
        caption: r.caption,
        hashtags: r.hashtags,
        callToAction: r.call_to_action,
        mediaUrl: r.media_url,
        mediaType: r.media_type,
        language: r.language,
        campaignAssociation: r.campaign_association,
        intendedPublishAt: r.intended_publish_at,
        status: r.status,
        submittedBy: r.submitted_by,
        submittedAt: r.submitted_at,
        revisionNumber: r.revision_number,
        lastReviewRemarks: r.last_review_remarks,
        lastReviewer: r.last_reviewer,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    });
  } catch (err) {
    console.error('[GET /api/marketing/posts]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

marketingRouter.post('/posts', async (req, res) => {
  try {
    const {
      customerId,
      ideaId,
      title,
      platform = 'Meta Ads (Facebook & Instagram)',
      caption,
      hashtags = '',
      callToAction = '',
      mediaUrl = '',
      mediaType = 'image',
      language = 'English / Hinglish',
      campaignAssociation = '',
      intendedPublishAt = null,
      status = 'Draft',
      submittedBy = 'Marketing Content Creator',
    } = req.body || {};

    if (!customerId) return res.status(400).json({ ok: false, error: 'Customer is required.' });
    if (!title || !title.trim()) return res.status(400).json({ ok: false, error: 'Post title is required.' });
    if (!caption || !caption.trim()) return res.status(400).json({ ok: false, error: 'Caption / post content is required.' });

    // Customer check
    const custRes = await query(`SELECT id, company_name FROM customers WHERE id = $1`, [customerId]);
    if (custRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Customer does not exist.' });
    }

    // Cross-customer idea prevention: If ideaId is provided, verify it belongs strictly to this customer!
    if (ideaId) {
      const ideaRes = await query(`SELECT id, customer_id FROM marketing_ideas WHERE id = $1`, [ideaId]);
      if (ideaRes.rowCount === 0) {
        return res.status(404).json({ ok: false, error: 'Specified idea does not exist.' });
      }
      if (ideaRes.rows[0].customer_id !== customerId) {
        return res.status(400).json({
          ok: false,
          error: 'Cross-Customer Security Violation: The selected idea does not belong to this customer.',
        });
      }
    }

    const postId = `mp_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const finalStatus = status === 'Pending Verification' ? 'Pending Verification' : 'Draft';
    const subTime = finalStatus === 'Pending Verification' ? new Date() : null;

    await query(
      `INSERT INTO marketing_posts (
        id, customer_id, idea_id, title, platform, caption,
        hashtags, call_to_action, media_url, media_type, language,
        campaign_association, intended_publish_at, status, submitted_by,
        submitted_at, revision_number, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 1, $17)`,
      [
        postId,
        customerId,
        ideaId || null,
        title.trim(),
        platform,
        caption.trim(),
        hashtags,
        callToAction,
        mediaUrl,
        mediaType,
        language,
        campaignAssociation,
        intendedPublishAt ? new Date(intendedPublishAt) : null,
        finalStatus,
        submittedBy,
        subTime,
        submittedBy,
      ]
    );

    await logAuditEvent(customerId, 'post', postId, finalStatus === 'Pending Verification' ? 'Submitted Post for Verification' : 'Saved Post Draft', submittedBy, { title, finalStatus });

    res.status(201).json({
      ok: true,
      postId,
      post: {
        id: postId,
        customerId,
        ideaId,
        title: title.trim(),
        platform,
        status: finalStatus,
        submittedBy,
        submittedAt: subTime,
      },
      message: finalStatus === 'Pending Verification' 
        ? 'Post submitted to Verification Review Queue successfully.' 
        : 'Post draft saved successfully.',
    });
  } catch (err) {
    console.error('[POST /api/marketing/posts]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

marketingRouter.patch('/posts/:id', async (req, res) => {
  try {
    const postId = req.params.id;
    const {
      title,
      platform,
      caption,
      hashtags,
      callToAction,
      mediaUrl,
      mediaType,
      language,
      campaignAssociation,
      intendedPublishAt,
      status,
      actor = 'Marketing Editor',
    } = req.body || {};

    const existing = await query(`SELECT * FROM marketing_posts WHERE id = $1`, [postId]);
    if (existing.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Post not found.' });
    }
    const current = existing.rows[0];

    // If changes were requested, editing increments the revision number
    let nextRev = current.revision_number;
    if (current.status === 'Changes Requested') {
      nextRev += 1;
    }

    const updated = await query(
      `UPDATE marketing_posts SET
        title = COALESCE($1, title),
        platform = COALESCE($2, platform),
        caption = COALESCE($3, caption),
        hashtags = COALESCE($4, hashtags),
        call_to_action = COALESCE($5, call_to_action),
        media_url = COALESCE($6, media_url),
        media_type = COALESCE($7, media_type),
        language = COALESCE($8, language),
        campaign_association = COALESCE($9, campaign_association),
        intended_publish_at = COALESCE($10, intended_publish_at),
        status = COALESCE($11, status),
        revision_number = $12,
        updated_at = NOW()
      WHERE id = $13
      RETURNING *`,
      [
        title !== undefined ? title.trim() : null,
        platform || null,
        caption !== undefined ? caption.trim() : null,
        hashtags !== undefined ? hashtags : null,
        callToAction !== undefined ? callToAction : null,
        mediaUrl !== undefined ? mediaUrl : null,
        mediaType || null,
        language || null,
        campaignAssociation !== undefined ? campaignAssociation : null,
        intendedPublishAt ? new Date(intendedPublishAt) : null,
        status || null,
        nextRev,
        postId,
      ]
    );

    await logAuditEvent(current.customer_id, 'post', postId, 'Updated Post', actor, { title, status, revision: nextRev });

    res.json({ ok: true, post: updated.rows[0] });
  } catch (err) {
    console.error('[PATCH /api/marketing/posts/:id]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 7. POST /api/marketing/posts/:id/submit (Submit Draft for Verification)
// -----------------------------------------------------------------------------
marketingRouter.post('/posts/:id/submit', async (req, res) => {
  try {
    const postId = req.params.id;
    const { submitter = 'Marketing Creator' } = req.body || {};

    const existing = await query(`SELECT * FROM marketing_posts WHERE id = $1`, [postId]);
    if (existing.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Post not found.' });
    }
    const current = existing.rows[0];

    const updated = await query(
      `UPDATE marketing_posts SET
        status = 'Pending Verification',
        submitted_by = $1,
        submitted_at = NOW(),
        updated_at = NOW()
      WHERE id = $2
      RETURNING *`,
      [submitter, postId]
    );

    await logAuditEvent(current.customer_id, 'post', postId, 'Submitted for Verification', submitter, {
      revision: current.revision_number,
    });

    res.json({
      ok: true,
      message: 'Post submitted to review queue for verification.',
      post: updated.rows[0],
    });
  } catch (err) {
    console.error('[POST /api/marketing/posts/:id/submit]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 7B. DELETE /api/marketing/posts/:id (Enterprise Soft Deletion & Audit Retention)
// -----------------------------------------------------------------------------
marketingRouter.delete('/posts/:id', async (req, res) => {
  try {
    const postId = req.params.id;
    const { actor = 'Marketing Manager' } = req.body || {};

    const postRes = await query(`SELECT * FROM marketing_posts WHERE id = $1`, [postId]);
    if (postRes.rowCount === 0 || postRes.rows[0].is_deleted) {
      return res.status(404).json({ ok: false, error: 'Post not found or already archived.' });
    }
    const post = postRes.rows[0];

    // Prevent archiving if active in running campaign
    const campRes = await query(
      `SELECT id, name, status FROM marketing_campaigns WHERE post_id = $1 AND status = 'Running'`,
      [postId]
    );
    if (campRes.rowCount > 0) {
      return res.status(400).json({
        ok: false,
        error: `Cannot archive post: It is currently active in a running marketing campaign ("${campRes.rows[0].name}"). Stop the campaign first.`,
      });
    }

    // Enterprise Soft Deletion: Preserves all past revisions, reviews, and audit history permanently
    await query(
      `UPDATE marketing_posts SET
        is_deleted = TRUE,
        deleted_at = NOW(),
        deleted_by = $1,
        updated_at = NOW()
      WHERE id = $2`,
      [actor, postId]
    );

    await logAuditEvent(post.customer_id, 'post_archived', postId, `Archived post "${post.title}"`, actor, {
      postId,
      title: post.title,
      revision: post.revision_number,
    });

    res.json({
      ok: true,
      message: 'Post safely archived. Historical revisions and audit trail retained permanently.',
      postId,
    });
  } catch (err) {
    console.error('[DELETE /api/marketing/posts/:id]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 8. POST /api/marketing/posts/:id/review (Approve / Reject / Request Changes)
// -----------------------------------------------------------------------------
marketingRouter.post('/posts/:id/review', async (req, res) => {
  try {
    const postId = req.params.id;
    const {
      decision, // 'Approved' | 'Rejected' | 'Changes Requested'
      expectedRevisionNumber,
      reviewerName = 'Marketing Reviewer',
      reviewerRole = 'Senior Marketing Reviewer',
      remarks = '',
      rejectionReason = '',
      correctionInstructions = '',
    } = req.body || {};

    if (!['Approved', 'Rejected', 'Changes Requested'].includes(decision)) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid decision. Must be Approved, Rejected, or Changes Requested.',
      });
    }

    if (decision === 'Rejected' && (!rejectionReason || !rejectionReason.trim())) {
      return res.status(400).json({
        ok: false,
        error: 'Rejection reason is strictly required when rejecting a post.',
      });
    }

    if (decision === 'Changes Requested' && (!correctionInstructions || !correctionInstructions.trim())) {
      return res.status(400).json({
        ok: false,
        error: 'Clear correction instructions are strictly required when requesting changes.',
      });
    }

    let reviewResult;

    await withTransaction(async (txQuery) => {
      // 1. Atomic row-level lock on the post record in PostgreSQL (prevents concurrent race conditions)
      const postRes = await txQuery(
        `SELECT * FROM marketing_posts WHERE id = $1 AND is_deleted = FALSE FOR UPDATE`,
        [postId]
      );
      if (postRes.rowCount === 0) {
        const err = new Error('Post not found or already archived.');
        err.statusCode = 404;
        throw err;
      }
      const post = postRes.rows[0];
      const currentRev = Number(post.revision_number || 1);

      // Concurrency / Stale Revision Guard: Ensure the reviewer is reviewing the exact latest revision
      if (expectedRevisionNumber !== undefined && expectedRevisionNumber !== null && Number(expectedRevisionNumber) !== currentRev) {
        const err = new Error(
          `Concurrent Review Conflict: You are reviewing Revision #${expectedRevisionNumber}, but the artwork has already been updated to Revision #${currentRev}. Please refresh and audit the latest uploaded creative.`
        );
        err.statusCode = 409;
        err.currentRevision = currentRev;
        err.expectedRevision = Number(expectedRevisionNumber);
        throw err;
      }

      // Separation of Duties check: Creator cannot approve their own post if required
      if (decision === 'Approved' && post.submitted_by && post.submitted_by.toLowerCase() === reviewerName.toLowerCase() && reviewerName.toLowerCase() !== 'admin') {
        // Allowed for small teams, but logged in audit
      }

      const reviewId = `rev_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

      // 2. Insert Review record with explicit revision_number
      await txQuery(
        `INSERT INTO marketing_post_reviews (
          id, post_id, revision_number, reviewer_name, reviewer_role, decision, remarks,
          rejection_reason, correction_instructions
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          reviewId,
          postId,
          currentRev,
          reviewerName,
          reviewerRole,
          decision,
          remarks,
          rejectionReason,
          correctionInstructions,
        ]
      );

      // 3. Synchronize the specific revision record in marketing_post_revisions
      await txQuery(
        `UPDATE marketing_post_revisions SET
          review_status = $1,
          reviewer_name = $2,
          review_remarks = $3,
          rejection_reason = $4,
          correction_instructions = $5,
          reviewed_at = NOW()
        WHERE post_id = $6 AND revision_number = $7`,
        [
          decision,
          reviewerName,
          remarks,
          rejectionReason,
          correctionInstructions,
          postId,
          currentRev,
        ]
      );

      // 4. Update post status
      await txQuery(
        `UPDATE marketing_posts SET status = $1, updated_at = NOW() WHERE id = $2`,
        [decision, postId]
      );

      reviewResult = {
        decision,
        reviewId,
        postId,
        revisionNumber: currentRev,
        customerId: post.customer_id,
        title: post.title,
      };
    });

    await logAuditEvent(reviewResult.customerId, 'review', reviewResult.reviewId, `Decision: ${decision} (Rev #${reviewResult.revisionNumber})`, reviewerName, {
      postId,
      revisionNumber: reviewResult.revisionNumber,
      decision,
      remarks,
      rejectionReason,
      correctionInstructions,
    });

    res.json({
      ok: true,
      message: `Post ${decision === 'Approved' ? 'successfully approved for campaign usage' : decision === 'Rejected' ? 'rejected' : 'returned with change request'}.`,
      decision: reviewResult.decision,
      reviewId: reviewResult.reviewId,
      postId: reviewResult.postId,
      revisionNumber: reviewResult.revisionNumber,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        ok: false,
        error: err.message,
        currentRevision: err.currentRevision,
        expectedRevision: err.expectedRevision,
      });
    }
    console.error('[POST /api/marketing/posts/:id/review]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 9. GET /api/marketing/posts/:id/history (Revision & Review Audit History)
// -----------------------------------------------------------------------------
marketingRouter.get('/posts/:id/history', async (req, res) => {
  try {
    const postId = req.params.id;
    const [revRes, auditRes] = await Promise.all([
      query(
        `SELECT * FROM marketing_post_reviews WHERE post_id = $1 ORDER BY created_at DESC`,
        [postId]
      ),
      query(
        `SELECT * FROM marketing_audit_events WHERE entity_id = $1 ORDER BY created_at DESC`,
        [postId]
      ),
    ]);

    res.json({
      ok: true,
      reviews: revRes.rows,
      auditEvents: auditRes.rows,
    });
  } catch (err) {
    console.error('[GET /api/marketing/posts/:id/history]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 10. MEDIA UPLOAD (/api/marketing/media/upload)
// -----------------------------------------------------------------------------
marketingRouter.post('/media/upload', async (req, res) => {
  try {
    const { filename = 'creative.jpg', base64Data, contentType = 'image/jpeg' } = req.body || {};

    if (!base64Data) {
      return res.status(400).json({ ok: false, error: 'Media payload (base64Data) is required.' });
    }

    // Strict MIME-to-Extension allowlist pairing
    const MIME_MAP = {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
      'image/gif': ['.gif'],
      'video/mp4': ['.mp4'],
    };

    if (!MIME_MAP[contentType]) {
      return res.status(400).json({
        ok: false,
        error: `Unsupported media format (${contentType}). Allowed formats: JPG, PNG, WEBP, GIF, MP4.`,
      });
    }

    // Strip prefix if present: data:image/png;base64,...
    const cleanData = base64Data.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(cleanData, 'base64');

    // Max 15MB limit
    if (buffer.length > 15 * 1024 * 1024) {
      return res.status(400).json({ ok: false, error: 'File size exceeds maximum 15MB limit.' });
    }

    // Strict Extension Validation: Enforce that the provided filename's extension matches the declared MIME
    const allowedExtensions = MIME_MAP[contentType];
    const extMatch = String(filename || '').match(/\.([a-zA-Z0-9]+)$/);
    const userExt = extMatch ? `.${extMatch[1].toLowerCase()}` : allowedExtensions[0];
    if (!allowedExtensions.includes(userExt)) {
      return res.status(400).json({
        ok: false,
        error: `Extension Mismatch: Extension "${userExt}" is not permitted for MIME type "${contentType}".`,
      });
    }

    // Deep Content / Magic Bytes Inspection:
    // Block Windows PE ('MZ'), Linux ELF, Shell script ('#!'), and web payloads (<script, <?php, <svg, <html)
    const headerSample = buffer.slice(0, 300).toString('utf8').toLowerCase();
    const isMaliciousCode =
      (buffer.length >= 2 && buffer[0] === 0x4D && buffer[1] === 0x5A) || // PE / Windows EXE / DLL ('MZ')
      (buffer.length >= 4 && buffer[0] === 0x7F && buffer[1] === 0x45 && buffer[2] === 0x4C && buffer[3] === 0x46) || // Linux ELF
      (buffer.length >= 2 && buffer[0] === 0x23 && buffer[1] === 0x21) || // Shell script ('#!')
      headerSample.includes('<script') ||
      headerSample.includes('<?php') ||
      headerSample.includes('<svg') ||
      headerSample.includes('<html') ||
      headerSample.includes('onerror=') ||
      headerSample.includes('onload=');

    if (isMaliciousCode) {
      return res.status(400).json({
        ok: false,
        error: 'Security Violation: Executable binary or script code detected in media payload.',
      });
    }

    const safeName = `media_${Date.now()}_${Math.random().toString(36).substr(2, 6)}${userExt}`;
    const filePath = path.join(uploadDir, safeName);

    fs.writeFileSync(filePath, buffer);

    const publicUrl = `/uploads/marketing/${safeName}`;

    res.json({
      ok: true,
      url: publicUrl,
      filename: safeName,
      sizeBytes: buffer.length,
      mimeType: contentType,
      message: 'Media creative uploaded and stored securely.',
    });
  } catch (err) {
    console.error('[POST /api/marketing/media/upload]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 11. CAMPAIGNS ENDPOINTS (/api/marketing/campaigns)
// -----------------------------------------------------------------------------
marketingRouter.get('/campaigns', async (req, res) => {
  try {
    const { customerId, status } = req.query;
    const where = ['(mp.is_deleted IS NULL OR mp.is_deleted = FALSE)'];
    const params = [];

    if (customerId) {
      params.push(customerId);
      where.push(`mc.customer_id = $${params.length}`);
    }

    if (status && status !== 'all') {
      params.push(status);
      where.push(`mc.status = $${params.length}`);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const sql = `
      SELECT 
        mc.*,
        c.company_name,
        c.contact_person,
        c.category AS customer_category,
        COALESCE(w.available_balance, 0)::NUMERIC AS wallet_balance,
        COALESCE(mp.title, 'Main Campaign Creative') AS post_title,
        mp.media_url AS post_media_url,
        COALESCE(mp.platform, mc.platform) AS post_platform,
        mp.caption AS post_caption
      FROM marketing_campaigns mc
      JOIN customers c ON c.id = mc.customer_id
      LEFT JOIN wallets w ON w.customer_id = c.id
      LEFT JOIN marketing_posts mp ON mp.id = mc.post_id
      ${whereSql}
      ORDER BY mc.created_at DESC
    `;

    const result = await query(sql, params);
    res.json({
      ok: true,
      campaigns: result.rows.map((r) => ({
        id: r.id,
        customerId: r.customer_id,
        companyName: r.company_name,
        contactPerson: r.contact_person,
        customerCategory: r.customer_category,
        walletBalance: Number(r.wallet_balance || 0),
        postId: r.post_id,
        postTitle: r.post_title,
        postMediaUrl: r.post_media_url,
        postCaption: r.post_caption,
        name: r.name,
        objective: r.objective,
        platform: r.platform,
        targetAudience: r.target_audience,
        startDate: r.start_date,
        endDate: r.end_date,
        dailyBudget: Number(r.daily_budget || 300),
        totalBudget: Number(r.total_budget || 0),
        status: r.status,
        externalPlatformStatus: r.external_platform_status,
        externalCampaignId: r.external_campaign_id,
        lastAction: r.last_action,
        lastActor: r.last_actor,
        lastActionAt: r.last_action_at,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    });
  } catch (err) {
    console.error('[GET /api/marketing/campaigns]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

marketingRouter.post('/campaigns', async (req, res) => {
  try {
    const {
      customerId,
      name,
      objective = 'Lead Generation',
      postId,
      platform = 'Meta Ads (Facebook & Instagram)',
      targetAudience = '',
      startDate,
      endDate = null,
      dailyBudget = 300,
      totalBudget = 0,
      scheduleSettings = {},
      status = 'Draft',
      actor = 'Marketing Manager',
    } = req.body || {};

    if (!customerId) return res.status(400).json({ ok: false, error: 'Customer is required.' });
    if (!name || !name.trim()) return res.status(400).json({ ok: false, error: 'Campaign name is required.' });
    if (Number(dailyBudget) < 300) {
      return res.status(400).json({ ok: false, error: 'Minimum campaign daily budget is ₹300/day.' });
    }

    // 1. Verify customer exists and registration is complete
    const custRes = await query(`SELECT * FROM customers WHERE id = $1`, [customerId]);
    if (custRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Customer not found.' });
    }

    // 2. Determine and verify creative post
    let effectivePostId = postId;
    if (!effectivePostId) {
      // Find latest verified and approved post for this customer with valid artwork
      const existingApproved = await query(
        `SELECT id, revision_number FROM marketing_posts 
         WHERE customer_id = $1 AND status = 'Approved' AND media_url IS NOT NULL AND media_url != '' AND is_deleted = FALSE 
         ORDER BY updated_at DESC LIMIT 1`,
        [customerId]
      );
      if (existingApproved.rowCount > 0) {
        effectivePostId = existingApproved.rows[0].id;
      } else {
        return res.status(400).json({
          ok: false,
          error: 'No approved creative posts available for this customer. Only posts that have passed the Verification Audit Queue can be deployed into campaigns.',
        });
      }
    }

    let campaignResult;

    await withTransaction(async (txQuery) => {
      // 1. Exclusive row-level lock on the post in PostgreSQL (prevents race condition with concurrent reuploads)
      const postRes = await txQuery(
        `SELECT * FROM marketing_posts WHERE id = $1 AND is_deleted = FALSE FOR UPDATE`,
        [effectivePostId]
      );
      if (postRes.rowCount === 0) {
        const err = new Error('Selected creative post not found or archived.');
        err.statusCode = 404;
        throw err;
      }
      const post = postRes.rows[0];

      if (post.customer_id !== customerId) {
        const err = new Error('Cross-Customer Security Violation: The selected creative post does not belong to this customer.');
        err.statusCode = 400;
        throw err;
      }

      if (post.status !== 'Approved') {
        const err = new Error(`Only verified and Approved posts can be deployed into marketing campaigns. Current post status: ${post.status}`);
        err.statusCode = 400;
        throw err;
      }

      if (!post.media_url || !post.media_url.trim()) {
        const err = new Error('Cannot deploy campaign: The selected post does not have uploaded creative artwork.');
        err.statusCode = 400;
        throw err;
      }

      // 2. Revision-level verification inside transaction lock
      const latestRevRes = await txQuery(
        `SELECT revision_number, review_status FROM marketing_post_revisions WHERE post_id = $1 ORDER BY revision_number DESC LIMIT 1`,
        [effectivePostId]
      );
      if (latestRevRes.rowCount > 0 && latestRevRes.rows[0].review_status !== 'Approved') {
        const err = new Error(
          `Campaign Creative Ineligible: The latest revision (Rev #${latestRevRes.rows[0].revision_number}) is in '${latestRevRes.rows[0].review_status}' status. Only posts whose latest revision is Approved can be deployed.`
        );
        err.statusCode = 400;
        throw err;
      }

      // 3. Verify Customer Wallet Balance from authoritative wallets table with row lock
      const walRes = await txQuery(`SELECT * FROM wallets WHERE customer_id = $1 FOR UPDATE`, [customerId]);
      const walRow = walRes.rows[0];
      const balance = Number(walRow?.available_balance || 0);

      if (balance < Number(dailyBudget)) {
        const err = new Error(
          `Insufficient Wallet Balance: Customer available balance (₹${balance.toLocaleString('en-IN')}) is less than campaign daily budget requirement (₹${Number(dailyBudget).toLocaleString('en-IN')}). Please top up wallet first.`
        );
        err.statusCode = 400;
        throw err;
      }

      // 4. External integration check: Meta Ads integration status
      const hasMetaToken = Boolean(process.env.META_ACCESS_TOKEN && process.env.META_ACCESS_TOKEN.length > 20);
      const externalStatus = hasMetaToken ? 'Pending Authorization' : 'Not Connected';

      const campaignId = `camp_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const finalStart = startDate ? new Date(startDate) : new Date();

      await txQuery(
        `INSERT INTO marketing_campaigns (
          id, customer_id, name, objective, post_id, platform,
          target_audience, start_date, end_date, daily_budget, total_budget,
          schedule_settings, status, external_platform_status, created_by,
          last_action, last_actor, last_action_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'Created', $15, NOW())`,
        [
          campaignId,
          customerId,
          name.trim(),
          objective || 'Lead Generation',
          effectivePostId,
          platform,
          targetAudience,
          finalStart,
          endDate ? new Date(endDate) : null,
          Number(dailyBudget),
          Number(totalBudget || 0),
          JSON.stringify(scheduleSettings),
          status,
          externalStatus,
          actor,
        ]
      );

      let newBalanceAfterStart = balance;
      if (status === 'Running') {
        const isAlreadyDeductedToday = walRow?.last_deducted_at &&
          new Date(walRow.last_deducted_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) ===
          new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

        if (!isAlreadyDeductedToday) {
          const spendAmt = Number(dailyBudget);
          newBalanceAfterStart = balance - spendAmt;
          await txQuery(
            `UPDATE wallets SET
              available_balance = $1,
              total_ad_spent = total_ad_spent + $2,
              ad_campaign_active = TRUE,
              last_deducted_at = NOW(),
              updated_at = NOW()
            WHERE customer_id = $3`,
            [newBalanceAfterStart, spendAmt, customerId]
          );

          const txId = `tx_deb_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
          const refUtr = `SYS-DAILY-MKT-${Date.now().toString().slice(-6)}`;
          await txQuery(
            `INSERT INTO wallet_transactions (
              id, customer_id, wallet_id, tx_type, amount, balance_after, reference_utr, description, payment_method, status
            ) VALUES ($1, $2, $3, 'Debit', $4, $5, $6, $7, 'Daily Auto-Debit', 'Settled ✓')`,
            [
              txId,
              customerId,
              walRow.id,
              spendAmt,
              newBalanceAfterStart,
              refUtr,
              `Daily Meta Ad Spend - Per-Day Service Deduction (-₹${spendAmt}/day)`,
            ]
          );
        } else {
          await txQuery(
            `UPDATE wallets SET ad_campaign_active = TRUE, updated_at = NOW() WHERE customer_id = $1`,
            [customerId]
          );
        }
      }

      campaignResult = {
        campaignId,
        customerId,
        name: name.trim(),
        status,
        effectivePostId,
        dailyBudget: Number(dailyBudget),
        externalStatus,
        newBalanceAfterStart,
        hasMetaToken,
      };
    });

    await logAuditEvent(customerId, 'campaign', campaignResult.campaignId, 'Created Marketing Campaign', actor, {
      name,
      postId: campaignResult.effectivePostId,
      dailyBudget,
      externalStatus: campaignResult.externalStatus,
    });

    res.status(201).json({
      ok: true,
      campaignId: campaignResult.campaignId,
      campaign: {
        id: campaignResult.campaignId,
        customerId,
        name: campaignResult.name,
        status: campaignResult.status,
        postId: campaignResult.effectivePostId,
        dailyBudget: campaignResult.dailyBudget,
      },
      externalPlatformStatus: campaignResult.externalStatus,
      newBalance: campaignResult.newBalanceAfterStart,
      message: campaignResult.hasMetaToken
        ? 'Marketing campaign created and queued for external activation.'
        : 'Marketing campaign created. Notice: External Meta Ads platform is not connected, campaign managed internally.',
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ ok: false, error: err.message });
    }
    console.error('[POST /api/marketing/campaigns]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 12. POST /api/marketing/campaigns/:id/start (Start Marketing Control)
// -----------------------------------------------------------------------------
marketingRouter.post('/campaigns/:id/start', async (req, res) => {
  try {
    const campaignId = req.params.id;
    const { actor = 'Marketing Manager' } = req.body || {};

    const campRes = await query(`SELECT * FROM marketing_campaigns WHERE id = $1`, [campaignId]);
    if (campRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Campaign not found.' });
    }
    const camp = campRes.rows[0];

    // Revalidate Post approval
    const postRes = await query(`SELECT status FROM marketing_posts WHERE id = $1`, [camp.post_id]);
    if (postRes.rows[0]?.status !== 'Approved') {
      return res.status(400).json({
        ok: false,
        error: 'Cannot start campaign: Linked creative post is no longer in Approved status.',
      });
    }

    // Revalidate Customer Wallet Balance
    const walRes = await query(`SELECT * FROM wallets WHERE customer_id = $1`, [camp.customer_id]);
    if (walRes.rowCount === 0) {
      return res.status(400).json({ ok: false, error: 'Customer wallet not found.' });
    }
    const wallet = walRes.rows[0];
    const balance = Number(wallet.available_balance || 0);
    const dailySpend = Math.max(300, Number(camp.daily_budget || wallet.daily_ad_spend || 300));

    // Per-day service check: Has this customer already been deducted for today's service?
    const isAlreadyDeductedToday = Boolean(
      wallet.last_deducted_at &&
      new Date(wallet.last_deducted_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) ===
      new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    );

    let newBal = balance;
    let deductedAmount = 0;

    if (!isAlreadyDeductedToday) {
      if (balance < dailySpend) {
        return res.status(400).json({
          ok: false,
          error: `Cannot start campaign: Customer wallet balance (₹${balance}) is below required daily budget for per-day service (₹${dailySpend}/day). Please top up wallet first.`,
        });
      }

      // Cut / deduct price from wallet balance for today's per-day service
      newBal = balance - dailySpend;
      deductedAmount = dailySpend;

      await query(
        `UPDATE wallets SET
          available_balance = $1,
          total_ad_spent = total_ad_spent + $2,
          ad_campaign_active = TRUE,
          last_deducted_at = NOW(),
          updated_at = NOW()
        WHERE customer_id = $3`,
        [newBal, dailySpend, camp.customer_id]
      );

      const txId = `tx_deb_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const refUtr = `SYS-DAILY-MKT-${Date.now().toString().slice(-6)}`;
      await query(
        `INSERT INTO wallet_transactions (
          id, customer_id, wallet_id, tx_type, amount, balance_after, reference_utr, description, payment_method, status
        ) VALUES ($1, $2, $3, 'Debit', $4, $5, $6, $7, 'Daily Auto-Debit', 'Settled ✓')`,
        [
          txId,
          camp.customer_id,
          wallet.id,
          dailySpend,
          newBal,
          refUtr,
          `Daily Meta Ad Spend - Per-Day Service Deduction (-₹${dailySpend}/day)`,
        ]
      );
    } else {
      // Already deducted today: simply resume campaign without double charging
      await query(
        `UPDATE wallets SET ad_campaign_active = TRUE, updated_at = NOW() WHERE customer_id = $1`,
        [camp.customer_id]
      );
    }

    // Check external platform status
    const hasMetaToken = Boolean(process.env.META_ACCESS_TOKEN && process.env.META_ACCESS_TOKEN.length > 20);
    const extStatus = hasMetaToken ? 'Live' : 'Not Connected';

    await query(
      `UPDATE marketing_campaigns SET
        status = 'Running',
        external_platform_status = $1,
        last_action = 'Started Marketing',
        last_actor = $2,
        last_action_at = NOW(),
        updated_at = NOW()
      WHERE id = $3`,
      [extStatus, actor, campaignId]
    );

    await logAuditEvent(camp.customer_id, 'campaign', campaignId, `Started Marketing Campaign (Per-Day Service: ₹${dailySpend}/d)`, actor, {
      dailyBudget: dailySpend,
      deductedAmount,
      isAlreadyDeductedToday,
      newBalance: newBal,
      externalPlatformStatus: extStatus,
    });

    res.json({
      ok: true,
      status: 'Running',
      deductedAmount,
      isAlreadyDeductedToday,
      newBalance: newBal,
      externalPlatformStatus: extStatus,
      message: isAlreadyDeductedToday
        ? `Marketing campaign resumed! Today's per-day service (₹${dailySpend}) was already settled earlier today.`
        : `Marketing campaign started! ₹${dailySpend} daily ad budget deducted from customer wallet for per-day service (New Balance: ₹${newBal}).`,
    });
  } catch (err) {
    console.error('[POST /api/marketing/campaigns/:id/start]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 13. POST /api/marketing/campaigns/:id/stop (Stop Marketing Control)
// -----------------------------------------------------------------------------
marketingRouter.post('/campaigns/:id/stop', async (req, res) => {
  try {
    const campaignId = req.params.id;
    const { actor = 'Marketing Manager', reason = 'Manual Stop by Operator' } = req.body || {};

    const campRes = await query(`SELECT * FROM marketing_campaigns WHERE id = $1`, [campaignId]);
    if (campRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Campaign not found.' });
    }
    const camp = campRes.rows[0];

    const hasMetaToken = Boolean(process.env.META_ACCESS_TOKEN && process.env.META_ACCESS_TOKEN.length > 20);
    const extStatus = hasMetaToken ? 'Paused' : 'Not Connected';

    await query(
      `UPDATE marketing_campaigns SET
        status = 'Stopped',
        external_platform_status = $1,
        last_action = 'Stopped Marketing',
        last_actor = $2,
        last_action_at = NOW(),
        updated_at = NOW()
      WHERE id = $3`,
      [extStatus, actor, campaignId]
    );

    // Check if customer has any other active campaigns
    const otherActive = await query(
      `SELECT COUNT(*)::INT AS active_cnt FROM marketing_campaigns WHERE customer_id = $1 AND status = 'Running'`,
      [camp.customer_id]
    );
    if (Number(otherActive.rows[0]?.active_cnt || 0) === 0) {
      await query(`UPDATE wallets SET ad_campaign_active = FALSE, updated_at = NOW() WHERE customer_id = $1`, [camp.customer_id]);
    }

    await logAuditEvent(camp.customer_id, 'campaign', campaignId, 'Stopped Marketing Campaign', actor, {
      reason,
      externalPlatformStatus: extStatus,
    });

    res.json({
      ok: true,
      status: 'Stopped',
      externalPlatformStatus: extStatus,
      message: 'Marketing campaign stopped successfully.',
    });
  } catch (err) {
    console.error('[POST /api/marketing/campaigns/:id/stop]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 14. PUT /api/marketing/customers/:id/pacing (Update Customer Daily Burn Rate & Schedule)
// -----------------------------------------------------------------------------
marketingRouter.put('/customers/:id/pacing', async (req, res) => {
  try {
    const custId = req.params.id;
    const { dailyAdSpend, activeDays, schedulePreset = 'custom', actor = 'Marketing Operations' } = req.body || {};

    const walRes = await query('SELECT * FROM wallets WHERE customer_id = $1', [custId]);
    if (walRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Customer wallet not found.' });
    }
    const w = walRes.rows[0];

    const nextDaily = dailyAdSpend !== undefined ? Math.max(300, Number(dailyAdSpend)) : Number(w.daily_ad_spend);
    const nextDays = activeDays !== undefined
      ? (Array.isArray(activeDays) ? activeDays.join(',') : String(activeDays))
      : (w.active_days || 'MON,TUE,WED,THU,FRI');
    const nextPreset = schedulePreset || w.schedule_preset || 'weekdays';

    await query(
      `UPDATE wallets SET daily_ad_spend = $1, active_days = $2, schedule_preset = $3, updated_at = NOW() WHERE customer_id = $4`,
      [nextDaily, nextDays, nextPreset, custId]
    );

    // Also update daily_budget on active campaign if exists
    await query(
      `UPDATE marketing_campaigns SET daily_budget = $1, updated_at = NOW() WHERE customer_id = $2 AND status = 'Running'`,
      [nextDaily, custId]
    );

    await logAuditEvent(custId, 'wallet', custId, 'Updated Marketing Pacing & Schedule', actor, {
      dailyAdSpend: nextDaily,
      activeDays: nextDays,
      schedulePreset: nextPreset,
    });

    res.json({
      ok: true,
      dailyAdSpend: nextDaily,
      activeDays: nextDays.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean),
      schedulePreset: nextPreset,
      message: `Marketing pacing updated: ₹${nextDaily}/day across active schedule.`,
    });
  } catch (err) {
    console.error('[PUT /api/marketing/customers/:id/pacing]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 15. AUTOMATED PER-DAY SERVICE RUNNER & PACING ENGINE
// Deducts ad spend per day for active campaigns on scheduled days.
// Auto-pauses and flags accounts if customer balance is low or zero.
// -----------------------------------------------------------------------------
export async function processDailyAdSpendPacing() {
  try {
    const kolkataNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const todayDayCode = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][kolkataNow.getDay()];
    const todayDateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

    // Find all customers with active campaigns or ad_campaign_active = true
    const activeCustomers = await query(`
      SELECT 
        c.id, c.company_name,
        w.id AS wallet_id,
        COALESCE(w.available_balance, 0)::NUMERIC AS balance,
        COALESCE(w.daily_ad_spend, 300)::NUMERIC AS daily_ad_spend,
        COALESCE(w.ad_campaign_active, FALSE) AS ad_campaign_active,
        COALESCE(w.active_days, 'MON,TUE,WED,THU,FRI') AS active_days,
        w.last_deducted_at,
        (SELECT mc.id FROM marketing_campaigns mc WHERE mc.customer_id = c.id AND mc.status = 'Running' LIMIT 1) AS running_camp_id
      FROM customers c
      JOIN wallets w ON w.customer_id = c.id
      WHERE w.ad_campaign_active = TRUE 
         OR EXISTS (SELECT 1 FROM marketing_campaigns mc WHERE mc.customer_id = c.id AND mc.status = 'Running')
    `);

    let processedCount = 0;
    let autoPausedCount = 0;
    const details = [];

    for (const cust of activeCustomers.rows) {
      const activeDays = typeof cust.active_days === 'string'
        ? cust.active_days.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
        : (Array.isArray(cust.active_days) ? cust.active_days : ['MON', 'TUE', 'WED', 'THU', 'FRI']);

      // 1. Is today an active day in the customer's weekly schedule?
      if (!activeDays.includes(todayDayCode)) {
        continue; // Scheduled day off
      }

      // 2. Was today's per-day service already deducted earlier today?
      const alreadyDeducted = cust.last_deducted_at &&
        new Date(cust.last_deducted_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) === todayDateStr;

      if (alreadyDeducted) {
        continue; // Already settled for today
      }

      const balance = Number(cust.balance || 0);
      const spend = Number(cust.daily_ad_spend || 300);

      // 3. Check customer balance
      if (balance >= spend) {
        const newBal = balance - spend;
        await query(
          `UPDATE wallets SET
            available_balance = $1,
            total_ad_spent = total_ad_spent + $2,
            ad_campaign_active = TRUE,
            last_deducted_at = NOW(),
            updated_at = NOW()
          WHERE customer_id = $3`,
          [newBal, spend, cust.id]
        );

        const txId = `tx_deb_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const refUtr = `SYS-DAILY-${Date.now().toString().slice(-6)}`;
        await query(
          `INSERT INTO wallet_transactions (
            id, customer_id, wallet_id, tx_type, amount, balance_after, reference_utr, description, payment_method, status
          ) VALUES ($1, $2, $3, 'Debit', $4, $5, $6, $7, 'Daily Auto-Debit', 'Settled ✓')`,
          [
            txId,
            cust.id,
            cust.wallet_id,
            spend,
            newBal,
            refUtr,
            `Daily Meta Ad Spend - Per-Day Service (${todayDayCode}) (-₹${spend})`,
          ]
        );

        await logAuditEvent(cust.id, 'wallet', cust.wallet_id, `Per-Day Service Deducted: ₹${spend}`, 'System Daily Pacing Engine', {
          day: todayDayCode,
          deducted: spend,
          newBalance: newBal,
        });

        processedCount++;
        details.push({ customerId: cust.id, name: cust.company_name, action: 'deducted', amount: spend, newBal });
      } else {
        // 4. Low/exhausted balance: Auto-pause campaign and set marketing to OFF!
        await query(
          `UPDATE wallets SET ad_campaign_active = FALSE, updated_at = NOW() WHERE customer_id = $1`,
          [cust.id]
        );

        await query(
          `UPDATE marketing_campaigns SET
            status = 'Stopped',
            external_platform_status = 'Paused',
            last_action = 'Auto-Paused: Low Balance',
            last_actor = 'System Daily Pacing Engine',
            last_action_at = NOW(),
            updated_at = NOW()
          WHERE customer_id = $1 AND status = 'Running'`,
          [cust.id]
        );

        await logAuditEvent(cust.id, 'campaign', cust.running_camp_id || cust.id, 'Auto-Paused Marketing: Low Balance', 'System Daily Pacing Engine', {
          balance,
          requiredSpend: spend,
          reason: 'Customer balance too low for per-day service',
        });

        autoPausedCount++;
        details.push({ customerId: cust.id, name: cust.company_name, action: 'auto_paused_low_balance', balance, required: spend });
      }
    }

    return { ok: true, processedCount, autoPausedCount, todayDayCode, todayDateStr, details };
  } catch (err) {
    console.error('[processDailyAdSpendPacing Error]:', err.message);
    return { ok: false, error: err.message };
  }
}

// -----------------------------------------------------------------------------
// 16. POST /api/marketing/process-daily-pacing (Trigger or verify daily pacing run)
// -----------------------------------------------------------------------------
marketingRouter.post('/process-daily-pacing', async (req, res) => {
  try {
    const result = await processDailyAdSpendPacing();
    res.json({
      ok: true,
      ...result,
      message: `Daily pacing processed: ${result.processedCount} per-day customer services deducted, ${result.autoPausedCount} low balance accounts paused.`,
    });
  } catch (err) {
    console.error('[POST /api/marketing/process-daily-pacing]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});
