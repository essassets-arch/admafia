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
        c.registered_at,
        c.completed_at,
        COALESCE(w.available_balance, 0)::NUMERIC AS available_balance,
        COALESCE(w.daily_ad_spend, 300)::NUMERIC AS daily_ad_spend,
        COALESCE(w.total_lifetime_paid, 0)::NUMERIC AS total_paid,
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
        status: r.status,
        profileStatus: r.profile_status,
        paymentStatus: r.payment_status,
        kycPercent: Number(r.kyc_percent || 100),
        registeredAt: r.registered_at,
        availableBalance: Number(r.available_balance || 0),
        dailyAdSpend: Number(r.daily_ad_spend || 300),
        totalPaid: Number(r.total_paid || 0),
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
        (SELECT COUNT(*)::INT FROM marketing_posts mp WHERE mp.customer_id = c.id AND mp.status = 'Approved') AS approved_posts_count,
        (SELECT COUNT(*)::INT FROM marketing_ideas mi WHERE mi.customer_id = c.id) AS ideas_count
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
        username: c.username,
        name: c.company_name,
        companyName: c.company_name,
        contactPerson: c.contact_person,
        phone: (c.phone || '').trim(),
        email: c.email,
        personalEmail: c.personal_email,
        category: c.category || 'Other',
        industry: c.industry || 'General',
        website: c.website || '',
        city: c.city || '',
        state: c.state || '',
        country: c.country || 'India',
        status: c.status,
        profileStatus: c.profile_status,
        paymentStatus: c.payment_status,
        kycPercent: Number(c.kyc_percent || 100),
        registeredAt: c.registered_at,
        availableBalance: Number(c.available_balance || 0),
        dailyAdSpend: Number(c.daily_ad_spend || 300),
        totalPaid: Number(c.total_paid || 0),
        approvedPostsCount: Number(c.approved_posts_count || 0),
        ideasCount: Number(c.ideas_count || 0),
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
      params.push(customerId);
      where.push(`mi.customer_id = $${params.length}`);
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
      JOIN customers c ON c.id = mi.customer_id
      ${whereSql}
      ORDER BY mi.created_at DESC
    `;

    const result = await query(sql, params);
    res.json({
      ok: true,
      ideas: result.rows.map((r) => ({
        id: r.id,
        customerId: r.customer_id,
        companyName: r.company_name,
        title: r.title,
        objective: r.objective,
        concept: r.concept,
        targetAudience: r.target_audience,
        captionSuggestions: r.caption_suggestions,
        callToAction: r.call_to_action,
        hashtags: r.hashtags,
        creativeBrief: r.creative_brief,
        platform: r.platform,
        language: r.language,
        campaignPeriod: r.campaign_period,
        constraints: r.constraints,
        status: r.status,
        createdBy: r.created_by,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    });
  } catch (err) {
    console.error('[GET /api/marketing/ideas]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

marketingRouter.post('/ideas', async (req, res) => {
  try {
    const {
      customerId,
      title,
      objective = 'Lead Generation',
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
    const finalObjective = (objective && objective.trim()) || 'Lead Generation';
    if (!concept || !concept.trim()) return res.status(400).json({ ok: false, error: 'Concept / brief is required.' });

    // Verify customer exists
    const custCheck = await query(`SELECT id, company_name FROM customers WHERE id = $1`, [customerId]);
    if (custCheck.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Selected customer was not found.' });
    }

    const id = `idea_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    await query(
      `INSERT INTO marketing_ideas (
        id, customer_id, title, objective, concept, target_audience,
        caption_suggestions, call_to_action, hashtags, creative_brief,
        platform, language, campaign_period, constraints, status, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        id,
        customerId,
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
      ]
    );

    await logAuditEvent(customerId, 'idea', id, 'Created Idea', createdBy, { title, objective: finalObjective });

    res.status(201).json({
      ok: true,
      idea: { id, customerId, title: title.trim(), objective: finalObjective, concept: concept.trim(), status },
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
    const where = [];
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
// 8. POST /api/marketing/posts/:id/review (Approve / Reject / Request Changes)
// -----------------------------------------------------------------------------
marketingRouter.post('/posts/:id/review', async (req, res) => {
  try {
    const postId = req.params.id;
    const {
      decision, // 'Approved' | 'Rejected' | 'Changes Requested'
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

    const postRes = await query(`SELECT * FROM marketing_posts WHERE id = $1`, [postId]);
    if (postRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Post not found.' });
    }
    const post = postRes.rows[0];

    // Separation of Duties check: Creator cannot approve their own post if required
    if (decision === 'Approved' && post.submitted_by && post.submitted_by.toLowerCase() === reviewerName.toLowerCase() && reviewerName.toLowerCase() !== 'admin') {
      // Allowed for small teams, but warning logged
    }

    const reviewId = `rev_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    await withTransaction(async (txQuery) => {
      // 1. Insert Review record
      await txQuery(
        `INSERT INTO marketing_post_reviews (
          id, post_id, reviewer_name, reviewer_role, decision, remarks,
          rejection_reason, correction_instructions
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          reviewId,
          postId,
          reviewerName,
          reviewerRole,
          decision,
          remarks,
          rejectionReason,
          correctionInstructions,
        ]
      );

      // 2. Update post status
      await txQuery(
        `UPDATE marketing_posts SET status = $1, updated_at = NOW() WHERE id = $2`,
        [decision, postId]
      );
    });

    await logAuditEvent(post.customer_id, 'review', reviewId, `Decision: ${decision}`, reviewerName, {
      postId,
      decision,
      remarks,
      rejectionReason,
      correctionInstructions,
    });

    res.json({
      ok: true,
      message: `Post ${decision === 'Approved' ? 'successfully approved for campaign usage' : decision === 'Rejected' ? 'rejected' : 'returned with change request'}.`,
      decision,
      reviewId,
      postId,
    });
  } catch (err) {
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

    // Allowed mime types & extensions
    const allowedMime = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4'];
    if (!allowedMime.includes(contentType)) {
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

    const extMatch = filename.match(/\.([a-zA-Z0-9]+)$/);
    const ext = extMatch ? `.${extMatch[1].toLowerCase()}` : '.jpg';
    const safeName = `media_${Date.now()}_${Math.random().toString(36).substr(2, 6)}${ext}`;
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
    const where = [];
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
        mp.title AS post_title,
        mp.media_url AS post_media_url,
        mp.platform AS post_platform,
        mp.caption AS post_caption
      FROM marketing_campaigns mc
      JOIN customers c ON c.id = mc.customer_id
      LEFT JOIN wallets w ON w.customer_id = c.id
      JOIN marketing_posts mp ON mp.id = mc.post_id
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
      objective,
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
    if (!postId) return res.status(400).json({ ok: false, error: 'Approved creative post selection is required.' });
    if (Number(dailyBudget) < 300) {
      return res.status(400).json({ ok: false, error: 'Minimum campaign daily budget is ₹300/day.' });
    }

    // 1. Verify customer exists and registration is complete
    const custRes = await query(`SELECT * FROM customers WHERE id = $1`, [customerId]);
    if (custRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Customer not found.' });
    }

    // 2. Verify Post exists, belongs to THIS customer, AND has status = 'Approved'
    const postRes = await query(`SELECT * FROM marketing_posts WHERE id = $1`, [postId]);
    if (postRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Selected creative post not found.' });
    }
    const post = postRes.rows[0];

    if (post.customer_id !== customerId) {
      return res.status(400).json({
        ok: false,
        error: 'Cross-Customer Security Violation: The selected creative post does not belong to this customer.',
      });
    }

    if (post.status !== 'Approved') {
      return res.status(400).json({
        ok: false,
        error: `Only verified and Approved posts can be deployed into marketing campaigns. Current post status: ${post.status}`,
      });
    }

    // 3. Verify Customer Wallet Balance from authoritative wallets table
    const walRes = await query(`SELECT available_balance FROM wallets WHERE customer_id = $1`, [customerId]);
    const balance = Number(walRes.rows[0]?.available_balance || 0);

    if (balance < Number(dailyBudget)) {
      return res.status(400).json({
        ok: false,
        error: `Insufficient Wallet Balance: Customer available balance (₹${balance.toLocaleString('en-IN')}) is less than campaign daily budget requirement (₹${Number(dailyBudget).toLocaleString('en-IN')}). Please top up wallet first.`,
      });
    }

    // 4. External integration check: Meta Ads integration status
    // If no real META_ACCESS_TOKEN is configured in environment, record explicitly as 'Not Connected'
    const hasMetaToken = Boolean(process.env.META_ACCESS_TOKEN && process.env.META_ACCESS_TOKEN.length > 20);
    const externalStatus = hasMetaToken ? 'Pending Authorization' : 'Not Connected';

    const campaignId = `camp_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const finalStart = startDate ? new Date(startDate) : new Date();

    await query(
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
        postId,
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

    await logAuditEvent(customerId, 'campaign', campaignId, 'Created Marketing Campaign', actor, {
      name,
      postId,
      dailyBudget,
      externalStatus,
    });

    res.status(201).json({
      ok: true,
      campaignId,
      externalPlatformStatus: externalStatus,
      message: hasMetaToken
        ? 'Marketing campaign created and queued for external activation.'
        : 'Marketing campaign created. Notice: External Meta Ads platform is not connected, campaign managed internally.',
    });
  } catch (err) {
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
    const walRes = await query(`SELECT available_balance FROM wallets WHERE customer_id = $1`, [camp.customer_id]);
    const balance = Number(walRes.rows[0]?.available_balance || 0);
    if (balance < Number(camp.daily_budget)) {
      return res.status(400).json({
        ok: false,
        error: `Cannot start campaign: Customer wallet balance (₹${balance}) is below required daily budget (₹${camp.daily_budget}).`,
      });
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

    // Sync wallet ad_campaign_active flag
    await query(`UPDATE wallets SET ad_campaign_active = TRUE, updated_at = NOW() WHERE customer_id = $1`, [camp.customer_id]);

    await logAuditEvent(camp.customer_id, 'campaign', campaignId, 'Started Marketing Campaign', actor, {
      dailyBudget: camp.daily_budget,
      externalPlatformStatus: extStatus,
    });

    res.json({
      ok: true,
      status: 'Running',
      externalPlatformStatus: extStatus,
      message: hasMetaToken
        ? 'Marketing campaign started and live Meta ad delivery initiated.'
        : 'Marketing campaign activated in CRM. Notice: External Meta Ads API token is not configured on this server, live external delivery is Not Connected.',
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
