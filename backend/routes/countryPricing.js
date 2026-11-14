import express from 'express';
import { Customer, Wallet, CountryPricing, CountryPricingAuditLog } from '../models/index.js';
import { withMongoTransaction } from '../repositories/tx.js';
import {
  countryPricingToRow,
  countryPricingAuditToRow,
  sortPricingRows,
  findCountryPricingByIdOrCode,
} from '../repositories/countryPricingRepo.js';
import {
  resolveVisitorCountry,
  getActiveCountryPricingList,
  getPricingForCountryCode,
  invalidateCountryPricingCache,
} from '../services/countryDetection.js';

export const countryPricingRouter = express.Router();

// =============================================================================
// PUBLIC APIS (No Authentication Required)
// =============================================================================

/**
 * GET /api/public/country-detection
 * Identifies visitor country from public IP or Cloudflare header, and returns local pricing
 */
countryPricingRouter.get('/country-detection', async (req, res) => {
  try {
    const detection = await resolveVisitorCountry(req);

    // Cache control: prevent shared proxy/CDN caches from serving one visitor's detected country to another
    res.set({
      'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      'CDN-Cache-Control': 'no-store',
      'Surrogate-Control': 'no-store',
      'Vary': 'CF-IPCountry, CF-Connecting-IP, X-Forwarded-For',
    });

    return res.json({
      ok: true,
      success: true,
      country: getPricingForCountryCode(detection.detectedCode),
      detectedCode: detection.detectedCode,
      isAutoDetected: detection.isAutoDetected,
      isFallback: false,
      pricingUnavailable: !detection.country,
      pricing: detection.country ? getPricingForCountryCode(detection.detectedCode) : null,
      defaultCountry: detection.defaultCountry,
      countries: [],
    });
  } catch (err) {
    console.error('[GET /api/public/country-detection] Error:', err);
    return res.status(500).json({
      ok: false,
      error: 'Failed to detect country pricing',
      country: null,
    });
  }
});

/**
 * GET /api/public/countries
 * Returns all active countries and their pricing configuration for selector dropdowns
 */
countryPricingRouter.get('/countries', async (req, res) => {
  try {
    res.set({ 'Cache-Control': 'private, no-store', 'CDN-Cache-Control': 'no-store', 'Surrogate-Control': 'no-store' });
    return res.json({
      ok: true,
      countries: [],
    });
  } catch (err) {
    console.error('[GET /api/public/countries] Error:', err);
    return res.status(500).json({ ok: false, error: 'Failed to fetch country list' });
  }
});

/**
 * GET /api/public/pricing
 * Returns all active country pricing
 */
countryPricingRouter.get('/pricing', async (req, res) => {
  try {
    res.set({ 'Cache-Control': 'private, no-store', 'CDN-Cache-Control': 'no-store', 'Surrogate-Control': 'no-store' });
    return res.json({
      ok: true,
      pricing: [getPricingForCountryCode('IN'), getPricingForCountryCode('US')],
    });
  } catch (err) {
    console.error('[GET /api/public/pricing] Error:', err);
    return res.status(500).json({ ok: false, error: 'Failed to fetch pricing' });
  }
});

/**
 * GET /api/public/pricing/:countryCode
 * Returns specific country pricing by ISO 3166-1 alpha-2 code
 */
countryPricingRouter.get('/pricing/:countryCode', async (req, res) => {
  try {
    res.set({ 'Cache-Control': 'private, no-store', 'CDN-Cache-Control': 'no-store', 'Surrogate-Control': 'no-store' });
    const { countryCode } = req.params;
    if (!countryCode || countryCode.length > 4) {
      return res.status(400).json({ ok: false, error: 'Invalid country code' });
    }

    const cleanCode = countryCode.trim().toUpperCase();
    const twoRulePricing = getPricingForCountryCode(cleanCode);
    if (twoRulePricing) return res.json({ ok: true, country: twoRulePricing });
    return res.status(400).json({ ok: false, error: 'Invalid country code' });
  } catch (err) {
    console.error('[GET /api/public/pricing/:countryCode] Error:', err);
    return res.status(500).json({ ok: false, error: 'Failed to fetch country pricing' });
  }
});

// =============================================================================
// SUPER ADMIN MANAGEMENT APIS (/api/superadmin/country-pricing)
// =============================================================================

export const superadminCountryPricingRouter = express.Router();

/**
 * GET /api/superadmin/country-pricing
 * List all countries (active and inactive) with live registration statistics
 */
superadminCountryPricingRouter.get('/', async (req, res) => {
  try {
    const [pricingDocs, statRows] = await Promise.all([
      CountryPricing.find({}).lean(),
      Customer.aggregate([
        {
          $lookup: {
            from: Wallet.collection.name,
            localField: '_id',
            foreignField: 'customerId',
            as: 'w',
          },
        },
        { $addFields: { w: { $first: '$w' } } },
        {
          $group: {
            _id: '$countryCode',
            customer_count: { $sum: 1 },
            active_campaigns: { $sum: { $cond: [{ $eq: ['$w.adCampaignActive', true] }, 1, 0] } },
            total_paid: { $sum: { $ifNull: ['$w.totalLifetimePaid', 0] } },
          },
        },
      ]),
    ]);

    const statsByCode = new Map(statRows.map((s) => [s._id, s]));

    const countries = sortPricingRows(
      pricingDocs.map((d) => {
        const stats = statsByCode.get(d.countryCode) || {};
        return {
          ...countryPricingToRow(d),
          registered_customers: Number(stats.customer_count || 0),
          active_campaigns: Number(stats.active_campaigns || 0),
          total_revenue: Number(stats.total_paid || 0),
        };
      })
    );

    return res.json({
      ok: true,
      countries,
    });
  } catch (err) {
    console.error('[GET /api/superadmin/country-pricing] Error:', err);
    return res.status(500).json({ ok: false, error: 'Failed to fetch country pricing list' });
  }
});

/**
 * POST /api/superadmin/country-pricing
 * Create a new supported country pricing configuration
 */
superadminCountryPricingRouter.post('/', async (req, res) => {
  try {
    const {
      country_code,
      country_name,
      currency_code,
      currency_symbol,
      currency_position = 'before',
      decimal_precision = 2,
      daily_min_budget,
      min_wallet_topup,
      tax_name = 'Tax',
      tax_rate = 0,
      payment_gateway = 'international',
      phone_code = '',
      flag_emoji = '🌐',
      is_active = true,
      is_default = false,
      admin_name = 'Super Admin',
      reason = 'New country pricing added',
    } = req.body || {};

    if (!country_code || country_code.trim().length !== 2) {
      return res.status(400).json({ ok: false, error: 'Valid 2-letter ISO country code required (e.g. US, AE)' });
    }
    if (!country_name || country_name.trim().length < 2) {
      return res.status(400).json({ ok: false, error: 'Country name is required' });
    }
    if (!currency_code || !currency_symbol) {
      return res.status(400).json({ ok: false, error: 'Currency code and symbol are required' });
    }

    const cleanCode = country_code.trim().toUpperCase();
    if (cleanCode !== 'IN' && cleanCode !== 'ZZ') {
      return res.status(400).json({ ok: false, error: 'Only India (INR) and all other countries (USD) pricing rules are supported.' });
    }
    if (String(currency_code || '').toUpperCase() !== (cleanCode === 'IN' ? 'INR' : 'USD') || Number(daily_min_budget) !== (cleanCode === 'IN' ? 300 : 10)) {
      return res.status(400).json({ ok: false, error: 'Currency and daily price are fixed for the selected global pricing rule.' });
    }
    const cleanDaily = Math.max(1, Number(daily_min_budget) || 10);
    const cleanMonthly = cleanDaily * 30;
    const cleanTopup = Math.max(1, Number(min_wallet_topup) || cleanDaily);

    const fields = {
      countryName: country_name.trim(),
      currencyCode: currency_code.trim().toUpperCase(),
      currencySymbol: currency_symbol.trim(),
      currencyPosition: currency_position === 'after' ? 'after' : 'before',
      decimalPrecision: Number(decimal_precision) || 2,
      dailyMinBudget: cleanDaily,
      monthlyBudget: cleanMonthly,
      minWalletTopup: cleanTopup,
      taxName: tax_name.trim(),
      taxRate: Number(tax_rate) || 0,
      paymentGateway: payment_gateway.trim(),
      phoneCode: phone_code.trim(),
      flagEmoji: flag_emoji.trim(),
      isActive: Boolean(is_active),
      isDefault: Boolean(is_default),
    };

    // Insert country pricing & record audit log atomically
    await withMongoTransaction(async (session) => {
      // If setting this as default, unset other defaults
      if (is_default) {
        await CountryPricing.updateMany({ isDefault: true }, { $set: { isDefault: false } }, { session });
      }

      const now = new Date();
      const upsert = () => CountryPricing.findOneAndUpdate(
        { countryCode: cleanCode },
        {
          $set: { ...fields, updatedAt: now },
          $setOnInsert: { _id: cleanCode, effectiveDate: now, createdAt: now },
        },
        { upsert: true, new: true, session, lean: true }
      );

      let createdDoc;
      try {
        createdDoc = await upsert();
      } catch (err) {
        // Concurrent upsert race on the unique countryCode index -> the document exists now, retry as update
        if (err?.code !== 11000) throw err;
        createdDoc = await upsert();
      }
      const created = JSON.parse(JSON.stringify(countryPricingToRow(createdDoc)));

      // Audit Log
      await CountryPricingAuditLog.create([{
        _id: `audit_${Date.now()}_${cleanCode}`,
        countryCode: cleanCode,
        countryName: country_name.trim(),
        oldPricing: null,
        newPricing: created,
        changedBy: admin_name,
        changeReason: reason,
        effectiveDate: now,
        createdAt: now,
      }], { session });
    });

    invalidateCountryPricingCache();

    return res.json({
      ok: true,
      message: `Country pricing for ${country_name} (${cleanCode}) saved successfully.`,
    });
  } catch (err) {
    console.error('[POST /api/superadmin/country-pricing] Error:', err);
    return res.status(500).json({ ok: false, error: err.message || 'Failed to save country pricing' });
  }
});

/**
 * PUT /api/superadmin/country-pricing/:idOrCode
 * Update existing country pricing record
 */
superadminCountryPricingRouter.put('/:idOrCode', async (req, res) => {
  try {
    const { idOrCode } = req.params;
    const {
      country_name,
      currency_code,
      currency_symbol,
      currency_position = 'before',
      decimal_precision = 2,
      daily_min_budget,
      min_wallet_topup,
      tax_name,
      tax_rate,
      payment_gateway,
      phone_code,
      flag_emoji,
      is_active,
      is_default,
      admin_name = 'Super Admin',
      reason = 'Pricing rates updated',
    } = req.body || {};

    const existingDoc = await findCountryPricingByIdOrCode(idOrCode);

    if (!existingDoc) {
      return res.status(404).json({ ok: false, error: 'Country pricing record not found' });
    }

    const oldRecord = countryPricingToRow(existingDoc);
    if (!['IN', 'ZZ'].includes(String(oldRecord.country_code).toUpperCase())) {
      return res.status(409).json({ ok: false, error: 'Historical country pricing records are read-only.' });
    }
    const expectedCurrency = oldRecord.country_code === 'IN' ? 'INR' : 'USD';
    if (currency_code && String(currency_code).toUpperCase() !== expectedCurrency) {
      return res.status(400).json({ ok: false, error: `Pricing rule currency is fixed to ${expectedCurrency}.` });
    }
    const expectedDaily = oldRecord.country_code === 'IN' ? 300 : 10;
    if (daily_min_budget !== undefined && Number(daily_min_budget) !== expectedDaily) {
      return res.status(400).json({ ok: false, error: `Daily price is fixed to ${expectedCurrency === 'INR' ? '₹300' : '$10'}.` });
    }
    const cleanDaily = daily_min_budget !== undefined ? Math.max(1, Number(daily_min_budget)) : Number(oldRecord.daily_min_budget);
    const cleanMonthly = cleanDaily * 30;
    const cleanTopup = min_wallet_topup !== undefined ? Math.max(1, Number(min_wallet_topup)) : Number(oldRecord.min_wallet_topup);

    // COALESCE semantics: only provided (non-null) values overwrite the stored value
    const set = {
      dailyMinBudget: cleanDaily,
      monthlyBudget: cleanMonthly,
      minWalletTopup: cleanTopup,
      updatedAt: new Date(),
    };
    const coalesce = (key, value) => { if (value !== null && value !== undefined) set[key] = value; };
    coalesce('countryName', country_name ? country_name.trim() : null);
    coalesce('currencyCode', currency_code ? currency_code.trim().toUpperCase() : null);
    coalesce('currencySymbol', currency_symbol ? currency_symbol.trim() : null);
    coalesce('currencyPosition', currency_position);
    coalesce('decimalPrecision', decimal_precision !== undefined ? Number(decimal_precision) : null);
    coalesce('taxName', tax_name ? tax_name.trim() : null);
    coalesce('taxRate', tax_rate !== undefined ? Number(tax_rate) : null);
    coalesce('paymentGateway', payment_gateway ? payment_gateway.trim() : null);
    coalesce('phoneCode', phone_code ? phone_code.trim() : null);
    coalesce('flagEmoji', flag_emoji ? flag_emoji.trim() : null);
    coalesce('isActive', is_active !== undefined ? Boolean(is_active) : null);
    coalesce('isDefault', is_default !== undefined ? Boolean(is_default) : null);

    await withMongoTransaction(async (session) => {
      if (is_default) {
        await CountryPricing.updateMany({ isDefault: true }, { $set: { isDefault: false } }, { session });
      }

      const updatedDoc = await CountryPricing.findOneAndUpdate(
        { _id: existingDoc._id },
        { $set: set },
        { new: true, session, lean: true }
      );
      if (!updatedDoc) {
        throw new Error('Country pricing record not found');
      }
      const updated = JSON.parse(JSON.stringify(countryPricingToRow(updatedDoc)));

      // Audit Log
      await CountryPricingAuditLog.create([{
        _id: `audit_${Date.now()}_${updated.country_code}`,
        countryCode: updated.country_code,
        countryName: updated.country_name,
        oldPricing: JSON.parse(JSON.stringify(oldRecord)),
        newPricing: updated,
        changedBy: admin_name,
        changeReason: reason,
        effectiveDate: new Date(),
        createdAt: new Date(),
      }], { session });
    });

    invalidateCountryPricingCache();

    return res.json({
      ok: true,
      message: `Updated pricing for ${oldRecord.country_name} (${oldRecord.country_code}).`,
    });
  } catch (err) {
    console.error('[PUT /api/superadmin/country-pricing/:idOrCode] Error:', err);
    return res.status(500).json({ ok: false, error: err.message || 'Failed to update country pricing' });
  }
});

/**
 * GET /api/superadmin/country-pricing/audit-logs
 * Returns audit trail of past pricing modifications
 */
superadminCountryPricingRouter.get('/audit-logs', async (req, res) => {
  try {
    const logDocs = await CountryPricingAuditLog.find({}).sort({ createdAt: -1 }).limit(100).lean();
    return res.json({
      ok: true,
      logs: logDocs.map(countryPricingAuditToRow),
    });
  } catch (err) {
    console.error('[GET /api/superadmin/country-pricing/audit-logs] Error:', err);
    return res.status(500).json({ ok: false, error: 'Failed to fetch audit logs' });
  }
});

/**
 * GET /api/superadmin/country-pricing/analytics
 * Returns country-wise breakdown of customers, active campaigns, and advertising spend
 */
superadminCountryPricingRouter.get('/analytics', async (req, res) => {
  try {
    const statRows = await Customer.aggregate([
      {
        $lookup: {
          from: Wallet.collection.name,
          localField: '_id',
          foreignField: 'customerId',
          as: 'w',
        },
      },
      { $addFields: { w: { $first: '$w' } } },
      {
        $group: {
          _id: {
            country_code: '$countryCode',
            country: '$country',
            currency: { $ifNull: ['$w.currency', '$currency', 'INR'] },
          },
          total_customers: { $sum: 1 },
          active_customers: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
          active_campaigns: { $sum: { $cond: [{ $eq: ['$w.adCampaignActive', true] }, 1, 0] } },
          total_wallet_balance: { $sum: { $ifNull: ['$w.availableBalance', 0] } },
          total_ad_spent: { $sum: { $ifNull: ['$w.totalAdSpent', 0] } },
          total_revenue: { $sum: { $ifNull: ['$w.totalLifetimePaid', 0] } },
        },
      },
      { $sort: { total_customers: -1 } },
    ]);

    return res.json({
      ok: true,
      analytics: statRows.map((r) => ({
        country_code: r._id?.country_code ?? 'IN',
        country_name: r._id?.country ?? 'India',
        currency: r._id?.currency ?? 'INR',
        total_customers: Number(r.total_customers),
        active_customers: Number(r.active_customers),
        active_campaigns: Number(r.active_campaigns),
        total_wallet_balance: Number(r.total_wallet_balance),
        total_ad_spent: Number(r.total_ad_spent),
        total_revenue: Number(r.total_revenue),
      })),
    });
  } catch (err) {
    console.error('[GET /api/superadmin/country-pricing/analytics] Error:', err);
    return res.status(500).json({ ok: false, error: 'Failed to fetch analytics' });
  }
});
