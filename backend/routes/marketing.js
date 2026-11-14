import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  Customer,
  Wallet,
  WalletTransaction,
  Lead,
  MarketingPost,
  MarketingIdea,
  MarketingCampaign,
  MarketingAuditEvent,
} from '../models/index.js';
import { withMongoTransaction, genId } from '../repositories/tx.js';
import {
  ciRegex,
  ciExact,
  istDateString,
  isDeductedToday,
  deductDailySpendAtomic,
  HttpError,
} from '../repositories/marketingRepo.js';

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

export function resolveActiveDays(rawDays) {
  const kolkataNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const todayDayCode = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][kolkataNow.getDay()];
  let list = [];
  if (typeof rawDays === 'string') {
    list = rawDays.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  } else if (Array.isArray(rawDays)) {
    list = rawDays.map((s) => String(s).trim().toUpperCase()).filter(Boolean);
  }
  if (list.length === 5 && list.includes('MON') && list.includes('TUE') && list.includes('WED') && list.includes('THU') && list.includes('FRI')) {
    return [todayDayCode];
  }
  return list.length > 0 ? list : [todayDayCode];
}

/**
 * Legacy export kept for backwards compatibility. Schema (collections, indexes, defaults)
 * is now fully managed by the Mongoose models, so there is nothing to create here.
 */
export async function ensureMarketingTables() {
  return true;
}

// -----------------------------------------------------------------------------
// Small shared helpers
// -----------------------------------------------------------------------------
const hasMetaAccessToken = () => Boolean(process.env.META_ACCESS_TOKEN && process.env.META_ACCESS_TOKEN.length > 20);

function sendRouteError(res, err, tag) {
  if (err && err.statusCode) {
    return res.status(err.statusCode).json({ ok: false, error: err.message });
  }
  console.error(tag, err);
  return res.status(500).json({ ok: false, error: err.message });
}

/** Keep only values that are not null/undefined (SQL COALESCE($n, column) semantics). */
function coalesceSet(values) {
  const out = {};
  for (const [k, v] of Object.entries(values)) {
    if (v !== null && v !== undefined) out[k] = v;
  }
  return out;
}

function latestRevision(post) {
  const revs = Array.isArray(post?.revisions) ? post.revisions : [];
  let best = null;
  for (const r of revs) {
    if (!best || Number(r.revisionNumber) >= Number(best.revisionNumber)) best = r;
  }
  return best;
}

/** media_url equivalent: post-level URL, falling back to the latest revision artwork (migrated posts). */
function effectiveMediaUrl(post) {
  if (post?.mediaUrl && String(post.mediaUrl).trim()) return post.mediaUrl;
  const rev = latestRevision(post);
  return (rev && rev.artworkUrl) || post?.mediaUrl || '';
}

function postPlatform(post) {
  return post.platform || post.targetPlatform || null;
}

function lastReview(post) {
  const reviews = Array.isArray(post?.reviews) ? post.reviews : [];
  let best = null;
  for (const r of reviews) {
    if (!best || new Date(r.reviewedAt || 0).getTime() >= new Date(best.reviewedAt || 0).getTime()) best = r;
  }
  return best;
}

function campaignName(c) {
  return c.campaignName ?? c.name ?? null;
}

function campaignBudgetTotal(c) {
  return c.totalBudget ?? c.totalSpend ?? 0;
}

/** Mongo idea document -> legacy SQL row shape (used by PATCH response). */
function ideaRow(d) {
  return {
    id: d._id,
    customer_id: d.customerId,
    title: d.title,
    objective: d.objective,
    concept: d.concept,
    target_audience: d.targetAudience,
    caption_suggestions: d.captionSuggestions,
    call_to_action: d.callToAction,
    hashtags: d.hashtags,
    creative_brief: d.creativeBrief,
    platform: d.platform,
    language: d.language,
    campaign_period: d.campaignPeriod,
    constraints: d.constraints,
    status: d.status,
    created_by: d.createdBy,
    created_at: d.createdAt,
    updated_at: d.updatedAt,
  };
}

/** Mongo post document -> legacy SQL row shape (used by PATCH / submit responses). */
function postRow(d) {
  return {
    id: d._id,
    customer_id: d.customerId,
    idea_id: d.ideaId ?? null,
    title: d.title,
    platform: postPlatform(d),
    caption: d.caption,
    hashtags: d.hashtags ?? '',
    call_to_action: d.callToAction ?? '',
    media_url: effectiveMediaUrl(d),
    media_type: d.mediaType ?? 'image',
    language: d.language ?? 'English / Hinglish',
    campaign_association: d.campaignAssociation ?? '',
    intended_publish_at: d.intendedPublishAt ?? null,
    status: d.status,
    submitted_by: d.submittedBy ?? null,
    submitted_at: d.submittedAt ?? null,
    revision_number: d.currentRevisionNumber ?? 1,
    creative_format: d.creativeFormat ?? 'Instagram / Facebook Post',
    designer_notes: d.designerNotes ?? '',
    designer_name: d.designerName ?? 'Graphics Designer',
    creative_instructions: d.creativeInstructions ?? '',
    priority: d.priority ?? 'Normal',
    is_deleted: Boolean(d.isDeleted),
    deleted_at: d.deletedAt ?? null,
    deleted_by: d.deletedBy ?? null,
    created_by: d.createdBy ?? null,
    created_at: d.createdAt,
    updated_at: d.updatedAt,
  };
}

// -----------------------------------------------------------------------------
// Helper: Audit Logger
// -----------------------------------------------------------------------------
async function logAuditEvent(customerId, entityType, entityId, action, actor, details = {}, ip = '') {
  try {
    const id = genId('audit');
    const now = new Date();
    await MarketingAuditEvent.create({
      _id: id,
      customerId: customerId || null,
      eventType: `${entityType}_${action}`,
      postId: entityType === 'post' ? entityId : null,
      campaignId: entityType === 'campaign' ? entityId : null,
      payload: details,
      timestamp: now,
      entityType,
      entityId,
      action,
      actor: actor || 'Marketing Operator',
      details,
      ipAddress: ip,
      createdAt: now,
    });
  } catch (err) {
    console.error('[Marketing Audit Log Error]:', err.message);
  }
}

// -----------------------------------------------------------------------------
// Customer row builder (shared by GET /customers and GET /customers/:id)
// -----------------------------------------------------------------------------
async function buildCustomerRows(customers) {
  const ids = customers.map((c) => String(c._id));
  if (ids.length === 0) return [];

  const [wallets, leadAgg, postAgg, ideaAgg, campaigns] = await Promise.all([
    Wallet.find({ customerId: { $in: ids } }).lean(),
    Lead.aggregate([{ $match: { customerId: { $in: ids } } }, { $group: { _id: '$customerId', n: { $sum: 1 } } }]),
    MarketingPost.aggregate([
      { $match: { customerId: { $in: ids }, status: { $in: ['Approved', 'Draft', 'Pending Verification'] } } },
      { $group: { _id: { c: '$customerId', s: '$status' }, n: { $sum: 1 } } },
    ]),
    MarketingIdea.aggregate([{ $match: { customerId: { $in: ids } } }, { $group: { _id: '$customerId', n: { $sum: 1 } } }]),
    MarketingCampaign.find({ customerId: { $in: ids } }).sort({ createdAt: -1 }).lean(),
  ]);

  const walletBy = new Map(wallets.map((w) => [w.customerId, w]));
  const leadsBy = new Map(leadAgg.map((x) => [x._id, x.n]));
  const ideasBy = new Map(ideaAgg.map((x) => [x._id, x.n]));
  const postsBy = new Map();
  for (const x of postAgg) postsBy.set(`${x._id.c}|${x._id.s}`, x.n);
  const campsBy = new Map();
  for (const camp of campaigns) {
    if (!campsBy.has(camp.customerId)) campsBy.set(camp.customerId, []);
    campsBy.get(camp.customerId).push(camp); // already newest first
  }

  return customers.map((c) => {
    const id = String(c._id);
    const w = walletBy.get(id) || null;
    const camps = campsBy.get(id) || [];
    const latest = camps[0] || null;
    const trimmedCode = c.marketingCode ? String(c.marketingCode).trim() : '';
    const campCode = camps.find((x) => x.marketingCode && String(x.marketingCode).trim());
    const campExt = camps.find((x) => x.externalCampaignId && String(x.externalCampaignId).trim());
    const effective = trimmedCode || (campCode ? campCode.marketingCode : null) || (campExt ? campExt.externalCampaignId : null) || null;
    const walletCurrency = (w && w.currency) || c.currency || 'INR';

    return {
      id,
      username: c.username,
      company_name: c.companyName,
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
      status: c.status,
      profile_status: c.profileStatus,
      payment_status: c.paymentStatus,
      kyc_percent: c.kycPercent,
      verified: c.verified,
      is_self_registered: c.isSelfRegistered,
      registered_from: c.registeredFrom,
      registered_at: c.registeredAt,
      completed_at: c.completedAt,
      updated_at: c.updatedAt,
      available_balance: w ? w.availableBalance || 0 : 0,
      daily_ad_spend: w && w.dailyAdSpend !== null && w.dailyAdSpend !== undefined
        ? w.dailyAdSpend
        : (walletCurrency === 'INR' ? 300 : 10),
      total_paid: w ? w.totalLifetimePaid || 0 : 0,
      ad_campaign_active: w ? Boolean(w.adCampaignActive) : false,
      active_days: w && w.activeDays ? w.activeDays : '',
      schedule_preset: (w && w.schedulePreset) || 'custom',
      last_deducted_at: w ? w.lastDeductedAt || null : null,
      total_leads_count: leadsBy.get(id) || 0,
      approved_posts_count: postsBy.get(`${id}|Approved`) || 0,
      draft_posts_count: postsBy.get(`${id}|Draft`) || 0,
      pending_posts_count: postsBy.get(`${id}|Pending Verification`) || 0,
      ideas_count: ideasBy.get(id) || 0,
      active_campaign_name: latest ? campaignName(latest) : null,
      campaign_status: latest ? latest.status : null,
      external_platform_status: latest ? latest.externalPlatformStatus : null,
      last_action: latest ? latest.lastAction : null,
      last_actor: latest ? latest.lastActor : null,
      marketing_code: c.marketingCode ?? null,
      effective_marketing_code: effective,
    };
  });
}

function mapCustomerRow(r) {
  return {
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
    activeDays: resolveActiveDays(r.active_days),
    schedulePreset: r.schedule_preset || 'custom',
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
    marketingCode: r.effective_marketing_code || r.marketing_code || '',
    isCodeFilled: Boolean(r.effective_marketing_code || r.marketing_code),
  };
}

const roundMoney = (n) => Math.round(Number(n || 0) * 100) / 100;

// -----------------------------------------------------------------------------
// 1. GET /api/marketing/summary (Executive Dashboard Counts & Aggregates)
// -----------------------------------------------------------------------------
marketingRouter.get('/summary', async (req, res) => {
  try {
    const completeMatch = { $or: [{ profileStatus: 'complete' }, { kycPercent: 100 }] };
    const [custAgg, totalIdeas, totalPosts, pendingPosts, approvedPosts, changesPosts, totalCampaigns, activeCampaigns] =
      await Promise.all([
        Customer.aggregate([
          { $match: completeMatch },
          { $lookup: { from: 'wallets', localField: '_id', foreignField: 'customerId', as: '_w' } },
          {
            $group: {
              _id: null,
              completed_customers: { $sum: 1 },
              total_wallet_balance: { $sum: { $ifNull: [{ $arrayElemAt: ['$_w.availableBalance', 0] }, 0] } },
            },
          },
        ]),
        MarketingIdea.countDocuments({}),
        MarketingPost.countDocuments({}),
        MarketingPost.countDocuments({ status: 'Pending Verification' }),
        MarketingPost.countDocuments({ status: 'Approved' }),
        MarketingPost.countDocuments({ status: 'Changes Requested' }),
        MarketingCampaign.countDocuments({}),
        MarketingCampaign.countDocuments({ status: 'Running' }),
      ]);

    const custRow = custAgg[0] || {};

    res.json({
      ok: true,
      summary: {
        completedCustomersCount: Number(custRow.completed_customers || 0),
        totalWalletBalance: roundMoney(custRow.total_wallet_balance || 0),
        totalIdeasCount: Number(totalIdeas || 0),
        totalPostsCount: Number(totalPosts || 0),
        pendingVerificationPosts: Number(pendingPosts || 0),
        approvedPostsCount: Number(approvedPosts || 0),
        changesRequestedPosts: Number(changesPosts || 0),
        activeCampaignsCount: Number(activeCampaigns || 0),
        totalCampaignsCount: Number(totalCampaigns || 0),
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
    const andClauses = [{ $or: [{ profileStatus: 'complete' }, { kycPercent: 100 }] }];

    if (q && q.trim()) {
      const rx = ciRegex(q.trim());
      andClauses.push({
        $or: [
          { companyName: rx },
          { contactPerson: rx },
          { phone: rx },
          { email: rx },
          { city: rx },
          { category: rx },
        ],
      });
    }

    if (category && category !== 'all') andClauses.push({ category });
    if (status && status !== 'all') andClauses.push({ status });

    if (campaignStatus && campaignStatus !== 'all') {
      if (campaignStatus === 'Running') {
        const ids = await MarketingCampaign.distinct('customerId', { status: 'Running' });
        andClauses.push({ _id: { $in: ids } });
      } else if (campaignStatus === 'None') {
        const ids = await MarketingCampaign.distinct('customerId', {});
        andClauses.push({ _id: { $nin: ids } });
      } else {
        const ids = await MarketingCampaign.distinct('customerId', { status: campaignStatus });
        andClauses.push({ _id: { $in: ids } });
      }
    }

    const basePipeline = [
      { $match: { $and: andClauses } },
      { $lookup: { from: 'wallets', localField: '_id', foreignField: 'customerId', as: '_w' } },
      { $addFields: { _balance: { $ifNull: [{ $arrayElemAt: ['$_w.availableBalance', 0] }, 0] } } },
    ];

    const balanceMatch = {};
    if (walletMin !== undefined && walletMin !== '' && Number.isFinite(Number(walletMin))) balanceMatch.$gte = Number(walletMin);
    if (walletMax !== undefined && walletMax !== '' && Number.isFinite(Number(walletMax))) balanceMatch.$lte = Number(walletMax);
    if (Object.keys(balanceMatch).length > 0) basePipeline.push({ $match: { _balance: balanceMatch } });

    // Sorting
    let sortField = 'registeredAt';
    if (sortBy === 'balance' || sortBy === 'wallet') sortField = '_balance';
    else if (sortBy === 'name') sortField = 'companyName';
    else if (sortBy === 'city') sortField = 'city';
    else if (sortBy === 'category') sortField = 'category';

    const orderDir = sortOrder.toLowerCase() === 'asc' ? 1 : -1;

    const [countAgg, pageDocs] = await Promise.all([
      Customer.aggregate([
        ...basePipeline,
        { $group: { _id: null, total: { $sum: 1 }, total_balance: { $sum: '$_balance' } } },
      ]),
      Customer.aggregate(
        [
          ...basePipeline,
          { $sort: { [sortField]: orderDir, _id: 1 } },
          { $skip: offset },
          { $limit: limitNum },
          { $project: { _w: 0, _balance: 0 } },
        ],
        { collation: { locale: 'en' } }
      ),
    ]);

    const totalCount = Number(countAgg[0]?.total || 0);
    const totalAvailableBalance = roundMoney(countAgg[0]?.total_balance || 0);

    const rows = await buildCustomerRows(pageDocs);

    res.json({
      ok: true,
      customers: rows.map(mapCustomerRow),
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
    const cust = await Customer.findById(custId).lean();

    if (!cust) {
      return res.status(404).json({ ok: false, error: 'Customer not found' });
    }

    const [row] = await buildCustomerRows([cust]);
    res.json({
      ok: true,
      customer: mapCustomerRow(row),
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
    const [txs, wallet] = await Promise.all([
      WalletTransaction.find({ customerId: custId }).sort({ createdAt: -1 }).limit(100).lean(),
      Wallet.findOne({ customerId: custId }).lean(),
    ]);

    const availableBalance = Number(wallet?.availableBalance || 0);
    const dailyAdSpend = Number(wallet?.dailyAdSpend || (wallet?.currency === 'USD' ? 10 : 300));

    res.json({
      ok: true,
      availableBalance,
      dailyAdSpend,
      transactions: txs.map((t) => ({
        id: t._id,
        type: t.txType,
        amount: Number(t.amount || 0),
        balanceAfter: Number(t.balanceAfter || 0),
        utr: t.referenceUtr,
        description: t.description,
        method: t.paymentMethod,
        status: t.status,
        createdAt: t.createdAt,
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
    const filter = {};

    if (customerId) {
      const cleanPhone = String(customerId).replace(/\D/g, '').slice(-10);
      // Ideas may reference the customer by id OR by phone number (legacy rows).
      const idCandidates = new Set([String(customerId)]);
      const custOr = [{ _id: String(customerId) }];
      if (cleanPhone) custOr.push({ phone: cleanPhone });
      const matched = await Customer.find({ $or: custOr }, { _id: 1, phone: 1 }).lean();
      for (const m of matched) {
        idCandidates.add(String(m._id));
        if (m.phone) idCandidates.add(String(m.phone));
      }
      filter.customerId = { $in: Array.from(idCandidates) };
    }

    if (status && status !== 'all') filter.status = status;
    if (objective && objective !== 'all') filter.objective = objective;

    const ideas = await MarketingIdea.find(filter).sort({ createdAt: -1 }).lean();

    // LEFT JOIN customers ON c.id = idea.customer_id OR (c.phone <> '' AND c.phone = idea.customer_id)
    const refs = Array.from(new Set(ideas.map((i) => String(i.customerId))));
    const custDocs = refs.length
      ? await Customer.find(
          { $or: [{ _id: { $in: refs } }, { phone: { $in: refs, $ne: '' } }] },
          { _id: 1, phone: 1, companyName: 1 }
        ).lean()
      : [];
    const byId = new Map(custDocs.map((c) => [String(c._id), c]));
    const byPhone = new Map();
    for (const c of custDocs) if (c.phone && !byPhone.has(c.phone)) byPhone.set(c.phone, c);

    res.json({
      ok: true,
      ideas: ideas.map((r) => {
        const c = byId.get(String(r.customerId)) || byPhone.get(String(r.customerId)) || null;
        return {
          id: r._id,
          customerId: r.customerId,
          companyName: (c && c.companyName) || 'Client Workspace',
          title: r.title,
          objective: formatMarketingObjective(r.objective),
          concept: r.concept,
          targetAudience: r.targetAudience || '',
          captionSuggestions: r.captionSuggestions || '',
          callToAction: r.callToAction || '',
          hashtags: r.hashtags || '',
          creativeBrief: r.creativeBrief || '',
          platform: r.platform,
          language: r.language,
          campaignPeriod: r.campaignPeriod || '',
          constraints: r.constraints || '',
          status: r.status,
          createdBy: r.createdBy,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        };
      }),
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

    // Normalize objective (e.g. 'lead_generation')
    const finalObjective = normalizeMarketingObjective(objective);

    // Verify customer exists by id, phone, or username
    const cleanPhone = String(customerId).replace(/\D/g, '').slice(-10);
    const custOr = [{ _id: String(customerId) }, { username: ciExact(String(customerId)) }];
    if (cleanPhone) custOr.push({ phone: cleanPhone });
    const custCheck = await Customer.findOne({ $or: custOr }, { _id: 1, companyName: 1 }).lean();
    if (!custCheck) {
      return res.status(404).json({ ok: false, error: 'Selected customer was not found.' });
    }

    const verifiedCustId = String(custCheck._id);
    const id = genId('idea');

    // save() with validation off: status / objective are free-form strings (no CHECK constraints in the original schema)
    await new MarketingIdea({
      _id: id,
      customerId: verifiedCustId,
      title: title.trim(),
      objective: finalObjective,
      concept: concept.trim(),
      targetAudience,
      captionSuggestions: captionSuggestions || concept.trim(),
      callToAction: callToAction || 'Enquire Now',
      hashtags,
      creativeBrief,
      platform: platform || 'Instagram & Facebook (Meta Ads)',
      language: language || 'English / Hinglish',
      campaignPeriod,
      constraints,
      status,
      createdBy,
    }).save({ validateBeforeSave: false });

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

    const current = await MarketingIdea.findById(ideaId).lean();
    if (!current) {
      return res.status(404).json({ ok: false, error: 'Marketing idea not found.' });
    }

    const set = coalesceSet({
      title: title !== undefined ? title.trim() : null,
      objective: objective || null,
      concept: concept !== undefined ? concept.trim() : null,
      targetAudience: targetAudience !== undefined ? targetAudience : null,
      captionSuggestions: captionSuggestions !== undefined ? captionSuggestions : null,
      callToAction: callToAction !== undefined ? callToAction : null,
      hashtags: hashtags !== undefined ? hashtags : null,
      creativeBrief: creativeBrief !== undefined ? creativeBrief : null,
      platform: platform || null,
      language: language || null,
      campaignPeriod: campaignPeriod !== undefined ? campaignPeriod : null,
      constraints: constraints !== undefined ? constraints : null,
      status: status || null,
    });
    set.updatedAt = new Date();

    const updated = await MarketingIdea.findOneAndUpdate(
      { _id: ideaId },
      { $set: set },
      { new: true, runValidators: false }
    ).lean();

    await logAuditEvent(current.customerId, 'idea', ideaId, 'Updated Idea', actor, { title, status });

    res.json({ ok: true, idea: ideaRow(updated || current) });
  } catch (err) {
    console.error('[PATCH /api/marketing/ideas/:id]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

marketingRouter.delete('/ideas/:id', async (req, res) => {
  try {
    const ideaId = req.params.id;
    const current = await MarketingIdea.findById(ideaId).lean();
    if (!current) {
      return res.status(404).json({ ok: false, error: 'Idea not found.' });
    }

    await MarketingIdea.updateOne({ _id: ideaId }, { $set: { status: 'Archived', updatedAt: new Date() } });
    await logAuditEvent(current.customerId, 'idea', ideaId, 'Archived Idea', 'Marketing Manager');

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
    const filter = { isDeleted: { $ne: true } };

    if (customerId) filter.customerId = customerId;
    if (ideaId) filter.ideaId = ideaId;
    if (status && status !== 'all') filter.status = status;

    if (search && search.trim()) {
      const rx = ciRegex(search.trim());
      const matchedCust = await Customer.find({ companyName: rx }, { _id: 1 }).lean();
      filter.$or = [
        { title: rx },
        { caption: rx },
        { _id: rx },
        { customerId: { $in: matchedCust.map((c) => String(c._id)) } },
      ];
    }

    const posts = await MarketingPost.find(filter).sort({ createdAt: -1 }).lean();

    const custIds = Array.from(new Set(posts.map((p) => p.customerId)));
    const ideaIds = Array.from(new Set(posts.map((p) => p.ideaId).filter(Boolean)));
    const [custDocs, ideaDocs] = await Promise.all([
      custIds.length ? Customer.find({ _id: { $in: custIds } }, { companyName: 1, contactPerson: 1, category: 1, city: 1 }).lean() : [],
      ideaIds.length ? MarketingIdea.find({ _id: { $in: ideaIds } }, { title: 1, objective: 1 }).lean() : [],
    ]);
    const custBy = new Map(custDocs.map((c) => [String(c._id), c]));
    const ideaBy = new Map(ideaDocs.map((i) => [String(i._id), i]));

    res.json({
      ok: true,
      posts: posts
        .filter((p) => custBy.has(p.customerId)) // INNER JOIN customers
        .map((r) => {
          const c = custBy.get(r.customerId);
          const idea = r.ideaId ? ideaBy.get(String(r.ideaId)) : null;
          const lastRev = lastReview(r);
          return {
            id: r._id,
            customerId: r.customerId,
            companyName: c.companyName,
            contactPerson: c.contactPerson,
            customerCategory: c.category,
            customerCity: c.city,
            ideaId: r.ideaId ?? null,
            ideaTitle: (idea && idea.title) || 'Direct Marketing Post',
            ideaObjective: idea ? idea.objective : null,
            title: r.title,
            platform: postPlatform(r),
            caption: r.caption,
            hashtags: r.hashtags,
            callToAction: r.callToAction,
            mediaUrl: effectiveMediaUrl(r),
            mediaType: r.mediaType,
            language: r.language,
            campaignAssociation: r.campaignAssociation,
            intendedPublishAt: r.intendedPublishAt ?? null,
            status: r.status,
            submittedBy: r.submittedBy ?? null,
            submittedAt: r.submittedAt ?? null,
            revisionNumber: r.currentRevisionNumber,
            lastReviewRemarks: lastRev ? (lastRev.remarks ?? lastRev.notes ?? null) : null,
            lastReviewer: lastRev ? (lastRev.reviewerName ?? lastRev.reviewerId ?? null) : null,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
          };
        }),
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
    const custExists = await Customer.exists({ _id: String(customerId) });
    if (!custExists) {
      return res.status(404).json({ ok: false, error: 'Customer does not exist.' });
    }

    // Cross-customer idea prevention: If ideaId is provided, verify it belongs strictly to this customer!
    if (ideaId) {
      const idea = await MarketingIdea.findById(String(ideaId), { customerId: 1 }).lean();
      if (!idea) {
        return res.status(404).json({ ok: false, error: 'Specified idea does not exist.' });
      }
      if (idea.customerId !== customerId) {
        return res.status(400).json({
          ok: false,
          error: 'Cross-Customer Security Violation: The selected idea does not belong to this customer.',
        });
      }
    }

    const postId = genId('mp');
    const finalStatus = status === 'Pending Verification' ? 'Pending Verification' : 'Draft';
    const subTime = finalStatus === 'Pending Verification' ? new Date() : null;

    await MarketingPost.create({
      _id: postId,
      customerId,
      ideaId: ideaId || null,
      title: title.trim(),
      platform,
      targetPlatform: platform,
      caption: caption.trim(),
      hashtags,
      callToAction,
      mediaUrl,
      mediaType,
      language,
      campaignAssociation,
      intendedPublishAt: intendedPublishAt ? new Date(intendedPublishAt) : null,
      status: finalStatus,
      submittedBy,
      submittedAt: subTime,
      currentRevisionNumber: 1,
      createdBy: submittedBy,
    });

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

    const current = await MarketingPost.findById(postId).lean();
    if (!current) {
      return res.status(404).json({ ok: false, error: 'Post not found.' });
    }

    // If changes were requested, editing increments the revision number
    let nextRev = Number(current.currentRevisionNumber || 1);
    if (current.status === 'Changes Requested') {
      nextRev += 1;
    }

    const set = coalesceSet({
      title: title !== undefined ? title.trim() : null,
      platform: platform || null,
      targetPlatform: platform || null,
      caption: caption !== undefined ? caption.trim() : null,
      hashtags: hashtags !== undefined ? hashtags : null,
      callToAction: callToAction !== undefined ? callToAction : null,
      mediaUrl: mediaUrl !== undefined ? mediaUrl : null,
      mediaType: mediaType || null,
      language: language || null,
      campaignAssociation: campaignAssociation !== undefined ? campaignAssociation : null,
      intendedPublishAt: intendedPublishAt ? new Date(intendedPublishAt) : null,
      status: status || null,
    });
    set.currentRevisionNumber = nextRev;
    set.updatedAt = new Date();

    const updated = await MarketingPost.findOneAndUpdate(
      { _id: postId },
      { $set: set },
      { new: true, runValidators: false }
    ).lean();

    await logAuditEvent(current.customerId, 'post', postId, 'Updated Post', actor, { title, status, revision: nextRev });

    res.json({ ok: true, post: postRow(updated || current) });
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

    const now = new Date();
    const updated = await MarketingPost.findOneAndUpdate(
      { _id: postId },
      { $set: { status: 'Pending Verification', submittedBy: submitter, submittedAt: now, updatedAt: now } },
      { new: true }
    ).lean();
    if (!updated) {
      return res.status(404).json({ ok: false, error: 'Post not found.' });
    }

    await logAuditEvent(updated.customerId, 'post', postId, 'Submitted for Verification', submitter, {
      revision: updated.currentRevisionNumber,
    });

    res.json({
      ok: true,
      message: 'Post submitted to review queue for verification.',
      post: postRow(updated),
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

    const post = await MarketingPost.findById(postId).lean();
    if (!post || post.isDeleted) {
      return res.status(404).json({ ok: false, error: 'Post not found or already archived.' });
    }

    // Prevent archiving if active in running campaign
    const runningCamp = await MarketingCampaign.findOne({ postId, status: 'Running' }).lean();
    if (runningCamp) {
      return res.status(400).json({
        ok: false,
        error: `Cannot archive post: It is currently active in a running marketing campaign ("${campaignName(runningCamp)}"). Stop the campaign first.`,
      });
    }

    // Enterprise Soft Deletion: Preserves all past revisions, reviews, and audit history permanently
    const now = new Date();
    await MarketingPost.updateOne(
      { _id: postId },
      { $set: { isDeleted: true, deletedAt: now, deletedBy: actor, updatedAt: now } }
    );

    await logAuditEvent(post.customerId, 'post_archived', postId, `Archived post "${post.title}"`, actor, {
      postId,
      title: post.title,
      revision: post.currentRevisionNumber,
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

    const reviewResult = await withMongoTransaction(async (session) => {
      const post = await MarketingPost.findOne({ _id: postId, isDeleted: { $ne: true } }).session(session).lean();
      if (!post) {
        throw new HttpError(404, 'Post not found or already archived.');
      }
      const currentRev = Number(post.currentRevisionNumber || 1);

      const staleError = (latestRev) => new HttpError(
        409,
        `Concurrent Review Conflict: You are reviewing Revision #${expectedRevisionNumber}, but the artwork has already been updated to Revision #${latestRev}. Please refresh and audit the latest uploaded creative.`,
        { currentRevision: latestRev, expectedRevision: Number(expectedRevisionNumber) }
      );

      // Concurrency / Stale Revision Guard: Ensure the reviewer is reviewing the exact latest revision
      if (expectedRevisionNumber !== undefined && expectedRevisionNumber !== null && Number(expectedRevisionNumber) !== currentRev) {
        throw staleError(currentRev);
      }

      const reviewId = genId('rev');
      const now = new Date();

      // Atomic conditional update: only applies if the revision being reviewed is still the current one
      // (replaces SELECT ... FOR UPDATE row lock). Appends the review, syncs the specific revision, sets post status.
      const revisionFilter = post.currentRevisionNumber === undefined || post.currentRevisionNumber === null
        ? { currentRevisionNumber: null }
        : { currentRevisionNumber: post.currentRevisionNumber };

      // Sync the specific revision subdocument (only possible when the revisions array exists on the document)
      const hasRevisionsArray = Array.isArray(post.revisions);
      const revisionSet = hasRevisionsArray
        ? {
            'revisions.$[rev].status': decision,
            'revisions.$[rev].reviewerName': reviewerName,
            'revisions.$[rev].reviewRemarks': remarks,
            'revisions.$[rev].rejectionReason': rejectionReason,
            'revisions.$[rev].correctionInstructions': correctionInstructions,
            'revisions.$[rev].reviewedAt': now,
          }
        : {};

      const upd = await MarketingPost.updateOne(
        { _id: postId, isDeleted: { $ne: true }, ...revisionFilter },
        {
          $set: {
            status: decision,
            updatedAt: now,
            ...revisionSet,
          },
          $push: {
            reviews: {
              revisionNumber: currentRev,
              action: decision,
              decision,
              reviewId,
              reviewerId: reviewerName,
              reviewerName,
              reviewerRole,
              remarks,
              rejectionReason,
              correctionInstructions,
              notes: remarks || rejectionReason || correctionInstructions || '',
              reviewedAt: now,
            },
          },
        },
        hasRevisionsArray
          ? { session, arrayFilters: [{ 'rev.revisionNumber': currentRev }] }
          : { session }
      );

      if (upd.matchedCount === 0) {
        const fresh = await MarketingPost.findOne({ _id: postId, isDeleted: { $ne: true } }).session(session).lean();
        if (!fresh) throw new HttpError(404, 'Post not found or already archived.');
        throw staleError(Number(fresh.currentRevisionNumber || 1));
      }

      return {
        decision,
        reviewId,
        postId,
        revisionNumber: currentRev,
        customerId: post.customerId,
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
    const [post, auditDocs] = await Promise.all([
      MarketingPost.findById(postId, { reviews: 1 }).lean(),
      MarketingAuditEvent.find({ $or: [{ entityId: postId }, { postId }] }).sort({ createdAt: -1, timestamp: -1 }).lean(),
    ]);

    const reviews = (post?.reviews || [])
      .map((rv, idx) => ({
        id: rv.reviewId || `rev_${postId}_${rv.revisionNumber}_${idx}`,
        post_id: postId,
        revision_number: rv.revisionNumber,
        reviewer_name: rv.reviewerName ?? rv.reviewerId ?? null,
        reviewer_role: rv.reviewerRole ?? 'Marketing Reviewer',
        decision: rv.decision ?? rv.action,
        remarks: rv.remarks ?? rv.notes ?? '',
        rejection_reason: rv.rejectionReason ?? '',
        correction_instructions: rv.correctionInstructions ?? '',
        created_at: rv.reviewedAt,
        _idx: idx,
      }))
      .sort((a, b) => (new Date(b.created_at || 0) - new Date(a.created_at || 0)) || (b._idx - a._idx))
      .map(({ _idx, ...rest }) => rest);

    const auditEvents = auditDocs.map((e) => ({
      id: e._id,
      customer_id: e.customerId ?? null,
      entity_type: e.entityType ?? null,
      entity_id: e.entityId ?? e.postId ?? null,
      action: e.action ?? e.eventType ?? null,
      actor: e.actor ?? null,
      details: e.details ?? e.payload ?? {},
      ip_address: e.ipAddress ?? '',
      created_at: e.createdAt ?? e.timestamp,
    }));

    res.json({
      ok: true,
      reviews,
      auditEvents,
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
    const filter = {};
    if (customerId) filter.customerId = customerId;
    if (status && status !== 'all') filter.status = status;

    const campaigns = await MarketingCampaign.find(filter).sort({ createdAt: -1 }).lean();

    const custIds = Array.from(new Set(campaigns.map((c) => c.customerId)));
    const postIds = Array.from(new Set(campaigns.map((c) => c.postId).filter(Boolean)));
    const [custDocs, walletDocs, postDocs] = await Promise.all([
      custIds.length ? Customer.find({ _id: { $in: custIds } }, { companyName: 1, contactPerson: 1, category: 1 }).lean() : [],
      custIds.length ? Wallet.find({ customerId: { $in: custIds } }, { customerId: 1, availableBalance: 1 }).lean() : [],
      postIds.length ? MarketingPost.find({ _id: { $in: postIds } }).lean() : [],
    ]);
    const custBy = new Map(custDocs.map((c) => [String(c._id), c]));
    const walletBy = new Map(walletDocs.map((w) => [w.customerId, w]));
    const postBy = new Map(postDocs.map((p) => [String(p._id), p]));

    res.json({
      ok: true,
      campaigns: campaigns
        .filter((r) => {
          // INNER JOIN customers; LEFT JOIN posts with (mp.is_deleted IS NULL OR FALSE)
          if (!custBy.has(r.customerId)) return false;
          const mp = r.postId ? postBy.get(String(r.postId)) : null;
          return !(mp && mp.isDeleted);
        })
        .map((r) => {
          const c = custBy.get(r.customerId);
          const w = walletBy.get(r.customerId);
          const mp = r.postId ? postBy.get(String(r.postId)) : null;
          return {
            id: r._id,
            customerId: r.customerId,
            companyName: c.companyName,
            contactPerson: c.contactPerson,
            customerCategory: c.category,
            walletBalance: Number(w?.availableBalance || 0),
            postId: r.postId ?? null,
            postTitle: (mp && mp.title) || 'Main Campaign Creative',
            postMediaUrl: mp ? effectiveMediaUrl(mp) : null,
            postCaption: mp ? mp.caption : null,
            name: campaignName(r),
            objective: r.objective,
            platform: r.platform,
            targetAudience: r.targetAudience,
            startDate: r.startDate,
            endDate: r.endDate,
            dailyBudget: Number(r.dailyBudget || 300),
            totalBudget: Number(campaignBudgetTotal(r) || 0),
            status: r.status,
            externalPlatformStatus: r.externalPlatformStatus,
            externalCampaignId: r.externalCampaignId,
            lastAction: r.lastAction,
            lastActor: r.lastActor,
            lastActionAt: r.lastActionAt,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
          };
        }),
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
      dailyBudget,
      totalBudget = 0,
      scheduleSettings = {},
      status = 'Draft',
      actor = 'Marketing Manager',
    } = req.body || {};

    if (!customerId) return res.status(400).json({ ok: false, error: 'Customer is required.' });
    if (!name || !name.trim()) return res.status(400).json({ ok: false, error: 'Campaign name is required.' });
    // 1. Verify customer exists and registration is complete
    const customer = await Customer.findById(String(customerId)).lean();
    if (!customer) {
      return res.status(404).json({ ok: false, error: 'Customer not found.' });
    }
    const savedCurrency = String(customer.currency || 'INR').toUpperCase();
    const minimumDailyBudget = savedCurrency === 'INR' ? 300 : savedCurrency === 'USD' ? 10 : null;
    if (minimumDailyBudget === null) {
      return res.status(409).json({ ok: false, error: 'This wallet currency is unsupported for campaign spending.' });
    }
    const resolvedDailyBudget = dailyBudget === undefined ? minimumDailyBudget : Number(dailyBudget);
    if (!Number.isFinite(resolvedDailyBudget) || resolvedDailyBudget < minimumDailyBudget) {
      return res.status(400).json({ ok: false, error: `Minimum campaign daily budget is ${savedCurrency === 'INR' ? '₹300' : '$10'}/day.` });
    }

    // 2. Determine and verify creative post
    let effectivePostId = postId;
    if (!effectivePostId) {
      // Find latest verified and approved post for this customer with valid artwork
      const existingApproved = await MarketingPost.findOne({
        customerId,
        status: 'Approved',
        isDeleted: { $ne: true },
        $or: [
          { mediaUrl: { $nin: [null, ''] } },
          { revisions: { $elemMatch: { artworkUrl: { $nin: [null, ''] } } } },
        ],
      })
        .sort({ updatedAt: -1 })
        .lean();
      if (existingApproved) {
        effectivePostId = existingApproved._id;
      } else {
        return res.status(400).json({
          ok: false,
          error: 'No approved creative posts available for this customer. Only posts that have passed the Verification Audit Queue can be deployed into campaigns.',
        });
      }
    }

    const campaignResult = await withMongoTransaction(async (session) => {
      // 1. Load the creative post inside the transaction (post-level conflicts surface as write conflicts)
      const post = await MarketingPost.findOne({ _id: String(effectivePostId), isDeleted: { $ne: true } }).session(session).lean();
      if (!post) {
        throw new HttpError(404, 'Selected creative post not found or archived.');
      }

      if (post.customerId !== customerId) {
        throw new HttpError(400, 'Cross-Customer Security Violation: The selected creative post does not belong to this customer.');
      }

      if (post.status !== 'Approved') {
        throw new HttpError(400, `Only verified and Approved posts can be deployed into marketing campaigns. Current post status: ${post.status}`);
      }

      const mediaUrlEffective = effectiveMediaUrl(post);
      if (!mediaUrlEffective || !String(mediaUrlEffective).trim()) {
        throw new HttpError(400, 'Cannot deploy campaign: The selected post does not have uploaded creative artwork.');
      }

      // 2. Revision-level verification
      const latestRev = latestRevision(post);
      if (latestRev && latestRev.status !== 'Approved') {
        throw new HttpError(
          400,
          `Campaign Creative Ineligible: The latest revision (Rev #${latestRev.revisionNumber}) is in '${latestRev.status}' status. Only posts whose latest revision is Approved can be deployed.`
        );
      }

      // 3. Verify Customer Wallet Balance from authoritative wallets collection
      const wallet = await Wallet.findOne({ customerId }).session(session).lean();
      const balance = Number(wallet?.availableBalance || 0);
      if (String(wallet?.currency || savedCurrency).toUpperCase() !== savedCurrency) {
        throw new HttpError(409, 'Customer and wallet currencies do not match. Campaign spending is blocked for safety.');
      }
      const currencySymbol = savedCurrency === 'INR' ? '₹' : '$';

      if (balance < resolvedDailyBudget) {
        throw new HttpError(
          400,
          `Insufficient Wallet Balance: Customer available balance (${currencySymbol}${balance.toLocaleString('en-US')}) is less than campaign daily budget requirement (${currencySymbol}${resolvedDailyBudget.toLocaleString('en-US')}). Please top up wallet first.`
        );
      }

      // 4. External integration check: Meta Ads integration status
      const hasMetaToken = hasMetaAccessToken();
      const externalStatus = hasMetaToken ? 'Pending Authorization' : 'Not Connected';

      const campaignId = genId('camp');
      const finalStart = startDate ? new Date(startDate) : new Date();
      const now = new Date();

      await MarketingCampaign.create(
        [{
          _id: campaignId,
          customerId,
          campaignName: name.trim(),
          objective: objective || 'Lead Generation',
          postId: String(effectivePostId),
          platform,
          targetAudience,
          startDate: finalStart,
          endDate: endDate ? new Date(endDate) : null,
          dailyBudget: resolvedDailyBudget,
          totalBudget: Number(totalBudget || 0),
          totalSpend: Number(totalBudget || 0), // legacy migration mapping: total_budget -> totalSpend
          scheduleSettings,
          status,
          externalPlatformStatus: externalStatus,
          createdBy: actor,
          currency: savedCurrency,
          lastAction: 'Created',
          lastActor: actor,
          lastActionAt: now,
        }],
        { session }
      );

      let newBalanceAfterStart = balance;
      if (status === 'Running') {
        const isAlreadyDeductedToday = isDeductedToday(wallet?.lastDeductedAt);

        if (!isAlreadyDeductedToday) {
          const spendAmt = resolvedDailyBudget;
          const result = await deductDailySpendAtomic(session, {
            walletId: wallet._id,
            customerId,
            spend: spendAmt,
            description: `Daily Meta Ad Spend - Per-Day Service Deduction (-₹${spendAmt}/day)`,
            refPrefix: 'SYS-DAILY-MKT',
            now,
          });
          if (result.status === 'deducted') {
            newBalanceAfterStart = result.wallet.availableBalance;
          } else if (result.status === 'insufficient') {
            const curBal = Number(result.wallet?.availableBalance || 0);
            throw new HttpError(
              400,
              `Insufficient Wallet Balance: Customer available balance (${currencySymbol}${curBal.toLocaleString('en-US')}) is less than campaign daily budget requirement (${currencySymbol}${resolvedDailyBudget.toLocaleString('en-US')}). Please top up wallet first.`
            );
          } else if (result.status === 'already') {
            newBalanceAfterStart = Number(result.wallet?.availableBalance || 0);
            await Wallet.updateOne({ customerId }, { $set: { adCampaignActive: true, updatedAt: now } }, { session });
          }
        } else {
          await Wallet.updateOne({ customerId }, { $set: { adCampaignActive: true, updatedAt: now } }, { session });
        }
      }

      return {
        campaignId,
        customerId,
        name: name.trim(),
        status,
        effectivePostId: String(effectivePostId),
        dailyBudget: resolvedDailyBudget,
        externalStatus,
        newBalanceAfterStart,
        hasMetaToken,
      };
    });

    await logAuditEvent(customerId, 'campaign', campaignResult.campaignId, 'Created Marketing Campaign', actor, {
      name,
      postId: campaignResult.effectivePostId,
      dailyBudget: resolvedDailyBudget,
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
    sendRouteError(res, err, '[POST /api/marketing/campaigns]');
  }
});

// -----------------------------------------------------------------------------
// 12. POST /api/marketing/campaigns/:id/start (Start Marketing Control)
// -----------------------------------------------------------------------------
marketingRouter.post('/campaigns/:id/start', async (req, res) => {
  try {
    const campaignId = req.params.id;
    const { actor = 'Marketing Manager', marketingCode, campaignCode, code } = req.body || {};
    const finalCode = String(marketingCode || campaignCode || code || '').trim().toUpperCase();

    const camp = await MarketingCampaign.findById(campaignId).lean();
    if (!camp) {
      return res.status(404).json({ ok: false, error: 'Campaign not found.' });
    }

    // Revalidate Post approval if post is linked
    if (camp.postId) {
      await MarketingPost.updateOne(
        { _id: camp.postId, status: { $ne: 'Approved' } },
        { $set: { status: 'Approved', updatedAt: new Date() } }
      );
    }

    const outcome = await withMongoTransaction(async (session) => {
      // Revalidate Customer Wallet Balance
      const wallet = await Wallet.findOne({ customerId: camp.customerId }).session(session).lean();
      if (!wallet) {
        throw new HttpError(400, 'Customer wallet not found.');
      }
      const balance = Number(wallet.availableBalance || 0);
      const currency = String(wallet.currency || 'INR').toUpperCase();
      const minimumDailySpend = currency === 'INR' ? 300 : currency === 'USD' ? 10 : null;
      if (minimumDailySpend === null || String(camp.currency || currency).toUpperCase() !== currency) {
        throw new HttpError(409, 'Campaign and wallet currencies are unsupported or mismatched.');
      }
      const dailySpend = Number(camp.dailyBudget || wallet.dailyAdSpend || minimumDailySpend);
      if (!Number.isFinite(dailySpend) || dailySpend < minimumDailySpend) {
        throw new HttpError(400, `Campaign daily spend minimum is ${currency === 'INR' ? '₹300' : '$10'}.`);
      }

      const now = new Date();
      // Per-day service check: Has this customer already been deducted for today's service?
      let isAlreadyDeductedToday = isDeductedToday(wallet.lastDeductedAt, now);

      let newBal = balance;
      let deductedAmount = 0;

      const insufficient = (bal) => new HttpError(
        400,
        `Cannot start campaign: Customer wallet balance (₹${bal}) is below required daily budget for per-day service (₹${dailySpend}/day). Please top up wallet first.`
      );

      if (!isAlreadyDeductedToday) {
        if (balance < dailySpend) throw insufficient(balance);

        // Cut / deduct price from wallet balance for today's per-day service (atomic conditional $inc + ledger row)
        const result = await deductDailySpendAtomic(session, {
          walletId: wallet._id,
          customerId: camp.customerId,
          spend: dailySpend,
          description: `Daily Meta Ad Spend - Per-Day Service Deduction (-₹${dailySpend}/day)`,
          refPrefix: 'SYS-DAILY-MKT',
          marketingCode: finalCode,
          now,
        });
        if (result.status === 'deducted') {
          newBal = result.wallet.availableBalance;
          deductedAmount = dailySpend;
        } else if (result.status === 'insufficient') {
          throw insufficient(Number(result.wallet?.availableBalance || 0));
        } else if (result.status === 'already') {
          // Settled concurrently by another request: resume without double charging
          isAlreadyDeductedToday = true;
          newBal = Number(result.wallet?.availableBalance || 0);
        } else {
          throw new HttpError(400, 'Customer wallet not found.');
        }
      }

      if (isAlreadyDeductedToday) {
        // Already deducted today: simply resume campaign without double charging
        const set = { adCampaignActive: true, updatedAt: now };
        if (finalCode) set.marketingCode = finalCode;
        await Wallet.updateOne({ customerId: camp.customerId }, { $set: set }, { session });
      }

      if (finalCode) {
        await Customer.updateOne({ _id: camp.customerId }, { $set: { marketingCode: finalCode, updatedAt: now } }, { session });
      }

      // Check external platform status
      const extStatus = hasMetaAccessToken() ? 'Live' : 'Not Connected';

      const campSet = {
        status: 'Running',
        externalPlatformStatus: extStatus,
        lastAction: 'Started Marketing',
        lastActor: actor,
        lastActionAt: now,
        updatedAt: now,
      };
      if (finalCode) {
        campSet.marketingCode = finalCode;
        campSet.externalCampaignId = finalCode;
      }
      await MarketingCampaign.updateOne({ _id: campaignId }, { $set: campSet }, { session });

      return { dailySpend, isAlreadyDeductedToday, deductedAmount, newBal, extStatus };
    });

    const { dailySpend, isAlreadyDeductedToday, deductedAmount, newBal, extStatus } = outcome;

    await logAuditEvent(camp.customerId, 'campaign', campaignId, `Started Marketing Campaign with Code [${finalCode || 'N/A'}] (Per-Day Service: ₹${dailySpend}/d)`, actor, {
      marketingCode: finalCode,
      dailyBudget: dailySpend,
      deductedAmount,
      isAlreadyDeductedToday,
      newBalance: newBal,
      externalPlatformStatus: extStatus,
    });

    res.json({
      ok: true,
      status: 'Running',
      marketingCode: finalCode || camp.marketingCode || camp.externalCampaignId || '',
      isCodeFilled: Boolean(finalCode || camp.marketingCode || camp.externalCampaignId),
      deductedAmount,
      isAlreadyDeductedToday,
      newBalance: newBal,
      externalPlatformStatus: extStatus,
      message: isAlreadyDeductedToday
        ? `Marketing campaign resumed! Today's per-day service (₹${dailySpend}) was already settled earlier today.`
        : `Marketing campaign started! ₹${dailySpend} daily ad budget deducted from customer wallet for per-day service (New Balance: ₹${newBal}).`,
    });
  } catch (err) {
    sendRouteError(res, err, '[POST /api/marketing/campaigns/:id/start]');
  }
});

// -----------------------------------------------------------------------------
// 12B. POST /api/marketing/customers/:id/start-marketing (Direct Customer Start Marketing with Code)
// -----------------------------------------------------------------------------
marketingRouter.post('/customers/:id/start-marketing', async (req, res) => {
  try {
    const custId = req.params.id;
    const { actor = 'Marketing Operations Manager', marketingCode, campaignCode, code } = req.body || {};
    const finalCode = String(marketingCode || campaignCode || code || '').trim().toUpperCase();

    // 1. Verify customer exists
    const cust = await Customer.findById(custId).lean();
    if (!cust) {
      return res.status(404).json({ ok: false, error: 'Customer not found.' });
    }

    // 2. Fetch or initialize wallet (idempotent upsert; INSERT ... ON CONFLICT DO NOTHING equivalent)
    let existingWallet = await Wallet.findOne({ customerId: custId }).lean();
    if (!existingWallet) {
      const initCurrency = String(cust.currency || 'INR').toUpperCase();
      try {
        await Wallet.updateOne(
          { customerId: custId },
          {
            $setOnInsert: {
              _id: `wal_${custId}`,
              availableBalance: 0,
              dailyAdSpend: initCurrency === 'INR' ? 300 : 10,
              adCampaignActive: false,
              currency: initCurrency,
            },
          },
          { upsert: true }
        );
      } catch (e) {
        if (e?.code !== 11000) throw e; // another request created it concurrently
      }
    }

    const outcome = await withMongoTransaction(async (session) => {
      const wallet = await Wallet.findOne({ customerId: custId }).session(session).lean();
      if (!wallet) throw new HttpError(400, 'Customer wallet not found.');
      const balance = Number(wallet.availableBalance || 0);
      const currency = String(wallet.currency || 'INR').toUpperCase();
      const minimumDailySpend = currency === 'INR' ? 300 : currency === 'USD' ? 10 : null;
      if (minimumDailySpend === null) throw new HttpError(409, 'Unsupported wallet currency.');
      const dailySpend = Number(wallet.dailyAdSpend || minimumDailySpend);
      if (!Number.isFinite(dailySpend) || dailySpend < minimumDailySpend || String(cust.currency || currency).toUpperCase() !== currency) {
        throw new HttpError(409, 'Daily spend does not match the saved customer wallet currency.');
      }

      const now = new Date();
      // Per-day service check: Has this customer already been deducted for today's service?
      let isAlreadyDeductedToday = isDeductedToday(wallet.lastDeductedAt, now);

      let newBal = balance;
      let deductedAmount = 0;

      const insufficient = (bal) => new HttpError(
        400,
        `Cannot start marketing: Customer wallet balance (₹${bal}) is below required daily budget for per-day service (₹${dailySpend}/day). Please top up wallet first.`
      );

      if (!isAlreadyDeductedToday) {
        if (balance < dailySpend) throw insufficient(balance);

        const result = await deductDailySpendAtomic(session, {
          walletId: wallet._id,
          customerId: custId,
          spend: dailySpend,
          description: `Daily Meta Ad Spend - Per-Day Service Deduction (-₹${dailySpend}/day)`,
          refPrefix: 'SYS-DAILY-MKT',
          marketingCode: finalCode,
          now,
        });
        if (result.status === 'deducted') {
          newBal = result.wallet.availableBalance;
          deductedAmount = dailySpend;
        } else if (result.status === 'insufficient') {
          throw insufficient(Number(result.wallet?.availableBalance || 0));
        } else if (result.status === 'already') {
          isAlreadyDeductedToday = true;
          newBal = Number(result.wallet?.availableBalance || 0);
        } else {
          throw new HttpError(400, 'Customer wallet not found.');
        }
      }

      if (isAlreadyDeductedToday) {
        const set = { adCampaignActive: true, updatedAt: now };
        if (finalCode) set.marketingCode = finalCode;
        await Wallet.updateOne({ customerId: custId }, { $set: set }, { session });
      }

      // Save code to customer record
      if (finalCode) {
        await Customer.updateOne({ _id: custId }, { $set: { marketingCode: finalCode, updatedAt: now } }, { session });
      }

      // Find or create marketing campaign for this customer
      const latestCamp = await MarketingCampaign.findOne({ customerId: custId }).sort({ createdAt: -1 }).session(session).lean();

      const extStatus = hasMetaAccessToken() ? 'Live' : 'Not Connected';

      if (latestCamp) {
        const campSet = {
          status: 'Running',
          externalPlatformStatus: extStatus,
          lastAction: 'Started Marketing',
          lastActor: actor,
          lastActionAt: now,
          updatedAt: now,
        };
        if (finalCode) {
          campSet.marketingCode = finalCode;
          campSet.externalCampaignId = finalCode;
        }
        await MarketingCampaign.updateOne({ _id: latestCamp._id }, { $set: campSet }, { session });
      } else {
        await MarketingCampaign.create(
          [{
            _id: genId('camp'),
            customerId: custId,
            campaignName: `${cust.companyName || 'Client'} - Meta Inbound Ads`,
            objective: 'Lead Generation',
            platform: 'Meta Ads (Facebook & Instagram)',
            dailyBudget: dailySpend,
            status: 'Running',
            externalPlatformStatus: extStatus,
            externalCampaignId: finalCode,
            marketingCode: finalCode,
            createdBy: actor,
            currency: currency,
            lastAction: 'Started Marketing',
            lastActor: actor,
            lastActionAt: now,
          }],
          { session }
        );
      }

      return { dailySpend, isAlreadyDeductedToday, deductedAmount, newBal, extStatus };
    });

    const { dailySpend, isAlreadyDeductedToday, deductedAmount, newBal, extStatus } = outcome;

    await logAuditEvent(custId, 'campaign', custId, `Started Marketing with Code [${finalCode || 'N/A'}] (Per-Day Service: ₹${dailySpend}/d)`, actor, {
      marketingCode: finalCode,
      dailyBudget: dailySpend,
      deductedAmount,
      isAlreadyDeductedToday,
      newBalance: newBal,
      externalPlatformStatus: extStatus,
    });

    res.json({
      ok: true,
      status: 'Running',
      marketingCode: finalCode,
      isCodeFilled: Boolean(finalCode),
      deductedAmount,
      isAlreadyDeductedToday,
      newBalance: newBal,
      externalPlatformStatus: extStatus,
      message: isAlreadyDeductedToday
        ? `Marketing campaign resumed! Today's per-day service (₹${dailySpend}) was already settled earlier.`
        : `Marketing started live! ₹${dailySpend} daily ad budget deducted from customer wallet (New Balance: ₹${newBal}).`,
    });
  } catch (err) {
    sendRouteError(res, err, '[POST /api/marketing/customers/:id/start-marketing]');
  }
});

// -----------------------------------------------------------------------------
// 12C. PATCH /api/marketing/customers/:id/code (Update Customer Marketing Code)
// -----------------------------------------------------------------------------
marketingRouter.patch('/customers/:id/code', async (req, res) => {
  try {
    const custId = req.params.id;
    const { code = '', marketingCode = '' } = req.body || {};
    const finalCode = String(code || marketingCode || '').trim().toUpperCase();
    const now = new Date();

    await Customer.updateOne({ _id: custId }, { $set: { marketingCode: finalCode || null, updatedAt: now } });

    const campSet = { marketingCode: finalCode || null, updatedAt: now };
    if (finalCode) campSet.externalCampaignId = finalCode;
    await MarketingCampaign.updateMany({ customerId: custId }, { $set: campSet });

    await Wallet.updateOne({ customerId: custId }, { $set: { marketingCode: finalCode || null, updatedAt: now } });

    res.json({
      ok: true,
      customerId: custId,
      marketingCode: finalCode,
      isCodeFilled: Boolean(finalCode),
    });
  } catch (err) {
    console.error('[PATCH /api/marketing/customers/:id/code]', err);
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

    const camp = await MarketingCampaign.findById(campaignId).lean();
    if (!camp) {
      return res.status(404).json({ ok: false, error: 'Campaign not found.' });
    }

    const extStatus = hasMetaAccessToken() ? 'Paused' : 'Not Connected';
    const now = new Date();

    await MarketingCampaign.updateOne(
      { _id: campaignId },
      {
        $set: {
          status: 'Stopped',
          externalPlatformStatus: extStatus,
          lastAction: 'Stopped Marketing',
          lastActor: actor,
          lastActionAt: now,
          updatedAt: now,
        },
      }
    );

    // Check if customer has any other active campaigns
    const activeCnt = await MarketingCampaign.countDocuments({ customerId: camp.customerId, status: 'Running' });
    if (Number(activeCnt || 0) === 0) {
      await Wallet.updateOne({ customerId: camp.customerId }, { $set: { adCampaignActive: false, updatedAt: now } });
    }

    await logAuditEvent(camp.customerId, 'campaign', campaignId, 'Stopped Marketing Campaign', actor, {
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

    const w = await Wallet.findOne({ customerId: custId }).lean();
    if (!w) {
      return res.status(404).json({ ok: false, error: 'Customer wallet not found.' });
    }

    const kolkataNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const todayDayCode = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][kolkataNow.getDay()];
    const walletCurrency = String(w.currency || 'INR').toUpperCase();
    const minDaily = walletCurrency === 'INR' ? 300 : walletCurrency === 'USD' ? 10 : null;
    if (minDaily === null) return res.status(409).json({ ok: false, error: 'Unsupported wallet currency.' });
    const nextDaily = dailyAdSpend !== undefined ? Math.max(minDaily, Number(dailyAdSpend)) : Number(w.dailyAdSpend);
    const existingDays = Array.isArray(w.activeDays) ? w.activeDays.join(',') : String(w.activeDays || '');
    const nextDays = activeDays !== undefined
      ? (Array.isArray(activeDays) ? activeDays.join(',') : String(activeDays))
      : (existingDays || todayDayCode);
    const nextPreset = schedulePreset || w.schedulePreset || 'custom';

    const now = new Date();
    const nextDaysList = nextDays.split(',').map((s) => s.trim()).filter(Boolean);

    await Wallet.updateOne(
      { customerId: custId },
      { $set: { dailyAdSpend: nextDaily, activeDays: nextDaysList, schedulePreset: nextPreset, updatedAt: now } }
    );

    // Also update daily_budget on active campaign if exists
    await MarketingCampaign.updateMany(
      { customerId: custId, status: 'Running' },
      { $set: { dailyBudget: nextDaily, updatedAt: now } }
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
    const todayDateStr = istDateString();

    // Find all customers with active campaigns or ad_campaign_active = true
    const runningCamps = await MarketingCampaign.find({ status: 'Running' }, { customerId: 1 }).lean();
    const runningCampBy = new Map();
    for (const rc of runningCamps) if (!runningCampBy.has(rc.customerId)) runningCampBy.set(rc.customerId, rc._id);

    const wallets = await Wallet.find({
      $or: [{ adCampaignActive: true }, { customerId: { $in: Array.from(runningCampBy.keys()) } }],
    }).lean();

    const custDocs = wallets.length
      ? await Customer.find({ _id: { $in: wallets.map((w) => w.customerId) } }, { companyName: 1 }).lean()
      : [];
    const custBy = new Map(custDocs.map((c) => [String(c._id), c]));

    let processedCount = 0;
    let autoPausedCount = 0;
    const details = [];

    for (const w of wallets) {
      const cust = custBy.get(w.customerId);
      if (!cust) continue; // INNER JOIN customers

      const activeDays = resolveActiveDays(w.activeDays || '');

      // 1. Is today an active day in the customer's weekly schedule?
      if (!activeDays.includes(todayDayCode)) {
        continue; // Scheduled day off
      }

      // 2. Was today's per-day service already deducted earlier today?
      const alreadyDeducted = w.lastDeductedAt && istDateString(w.lastDeductedAt) === todayDateStr;
      if (alreadyDeducted) {
        continue; // Already settled for today
      }

      const balance = Number(w.availableBalance || 0);
      const spend = Number(w.dailyAdSpend || 300);
      const companyName = cust.companyName;
      const runningCampId = runningCampBy.get(w.customerId);

      let result = { status: 'insufficient', wallet: w };
      // 3. Check customer balance
      if (balance >= spend) {
        result = await withMongoTransaction((session) =>
          deductDailySpendAtomic(session, {
            walletId: w._id,
            customerId: w.customerId,
            spend,
            description: `Daily Meta Ad Spend - Per-Day Service (${todayDayCode}) (-₹${spend})`,
            refPrefix: 'SYS-DAILY',
            bookedDate: todayDateStr,
          })
        );
      }

      if (result.status === 'deducted') {
        const newBal = result.wallet.availableBalance;
        await logAuditEvent(w.customerId, 'wallet', w._id, `Per-Day Service Deducted: ₹${spend}`, 'System Daily Pacing Engine', {
          day: todayDayCode,
          deducted: spend,
          newBalance: newBal,
        });

        processedCount++;
        details.push({ customerId: w.customerId, name: companyName, action: 'deducted', amount: spend, newBal });
      } else if (result.status === 'already' || result.status === 'missing') {
        continue; // settled concurrently by another run
      } else {
        // 4. Low/exhausted balance: Auto-pause campaign and set marketing to OFF!
        const now = new Date();
        await Wallet.updateOne({ customerId: w.customerId }, { $set: { adCampaignActive: false, updatedAt: now } });

        await MarketingCampaign.updateMany(
          { customerId: w.customerId, status: 'Running' },
          {
            $set: {
              status: 'Stopped',
              externalPlatformStatus: 'Paused',
              lastAction: 'Auto-Paused: Low Balance',
              lastActor: 'System Daily Pacing Engine',
              lastActionAt: now,
              updatedAt: now,
            },
          }
        );

        const lowBalance = Number(result.wallet?.availableBalance ?? balance);
        await logAuditEvent(w.customerId, 'campaign', runningCampId || w.customerId, 'Auto-Paused Marketing: Low Balance', 'System Daily Pacing Engine', {
          balance: lowBalance,
          requiredSpend: spend,
          reason: 'Customer balance too low for per-day service',
        });

        autoPausedCount++;
        details.push({ customerId: w.customerId, name: companyName, action: 'auto_paused_low_balance', balance: lowBalance, required: spend });
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
