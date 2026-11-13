import express from 'express';
import { query, withTransaction } from '../db.js';
import {
  resolveVisitorCountry,
  getActiveCountryPricingList,
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
    const allActive = await getActiveCountryPricingList();

    // Cache control: prevent shared proxy/CDN caches from serving one visitor's detected country to another
    res.set({
      'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      'Vary': 'CF-IPCountry, X-Forwarded-For, Accept-Language',
    });

    return res.json({
      ok: true,
      success: true,
      country: detection.country,
      detectedCode: detection.detectedCode,
      isAutoDetected: detection.isAutoDetected,
      isFallback: Boolean(detection.isFallback),
      defaultCountry: detection.defaultCountry,
      countries: allActive,
    });
  } catch (err) {
    console.error('[GET /api/public/country-detection] Error:', err);
    return res.status(500).json({
      ok: false,
      error: 'Failed to detect country pricing',
      country: {
        country_code: 'IN',
        country_name: 'India',
        currency_code: 'INR',
        currency_symbol: '₹',
        daily_min_budget: 300,
        monthly_budget: 9000,
        min_wallet_topup: 300,
        phone_code: '+91',
        flag_emoji: '🇮🇳',
      },
    });
  }
});

/**
 * GET /api/public/countries
 * Returns all active countries and their pricing configuration for selector dropdowns
 */
countryPricingRouter.get('/countries', async (req, res) => {
  try {
    const countries = await getActiveCountryPricingList();
    return res.json({
      ok: true,
      countries,
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
    const countries = await getActiveCountryPricingList();
    return res.json({
      ok: true,
      pricing: countries,
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
    const { countryCode } = req.params;
    if (!countryCode || countryCode.length > 4) {
      return res.status(400).json({ ok: false, error: 'Invalid country code' });
    }

    const cleanCode = countryCode.trim().toUpperCase();
    const countries = await getActiveCountryPricingList();
    const matched = countries.find((c) => c.country_code.toUpperCase() === cleanCode);

    if (matched) {
      return res.json({ ok: true, country: matched });
    }

    // If not found in active list, check database for inactive or fallback
    const dbRes = await query(
      `SELECT * FROM country_pricing WHERE UPPER(country_code) = $1 LIMIT 1`,
      [cleanCode]
    );

    if (dbRes.rows.length > 0) {
      const r = dbRes.rows[0];
      return res.json({
        ok: true,
        country: {
          ...r,
          daily_min_budget: Number(r.daily_min_budget),
          monthly_budget: Number(r.monthly_budget),
          min_wallet_topup: Number(r.min_wallet_topup),
          tax_rate: Number(r.tax_rate),
        },
      });
    }

    // Fallback to default country
    const defaultCountry = countries.find((c) => c.is_default) || countries[0];
    return res.json({
      ok: true,
      country: defaultCountry,
      isFallback: true,
      requestedCode: cleanCode,
    });
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
    const countriesRes = await query(
      `SELECT
        cp.*,
        COALESCE(stats.customer_count, 0) AS registered_customers,
        COALESCE(stats.active_campaigns, 0) AS active_campaigns,
        COALESCE(stats.total_paid, 0) AS total_revenue
      FROM country_pricing cp
      LEFT JOIN (
        SELECT
          c.country_code,
          COUNT(c.id) AS customer_count,
          SUM(CASE WHEN w.ad_campaign_active = TRUE THEN 1 ELSE 0 END) AS active_campaigns,
          SUM(COALESCE(w.total_lifetime_paid, 0)) AS total_paid
        FROM customers c
        LEFT JOIN wallets w ON w.customer_id = c.id
        GROUP BY c.country_code
      ) stats ON stats.country_code = cp.country_code
      ORDER BY cp.is_default DESC, cp.country_name ASC`
    );

    const countries = countriesRes.rows.map((r) => ({
      ...r,
      daily_min_budget: Number(r.daily_min_budget),
      monthly_budget: Number(r.monthly_budget),
      min_wallet_topup: Number(r.min_wallet_topup),
      tax_rate: Number(r.tax_rate),
      registered_customers: Number(r.registered_customers),
      active_campaigns: Number(r.active_campaigns),
      total_revenue: Number(r.total_revenue),
    }));

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
    const cleanDaily = Math.max(1, Number(daily_min_budget) || 10);
    const cleanMonthly = cleanDaily * 30;
    const cleanTopup = Math.max(1, Number(min_wallet_topup) || cleanDaily);
    const newId = `cp_${cleanCode.toLowerCase()}`;

    // Insert country pricing & record audit log atomically
    await withTransaction(async (client) => {
      // If setting this as default, unset other defaults
      if (is_default) {
        await client.query(`UPDATE country_pricing SET is_default = FALSE WHERE is_default = TRUE`);
      }

      const insertRes = await client.query(
        `INSERT INTO country_pricing (
          id, country_code, country_name, currency_code, currency_symbol,
          currency_position, decimal_precision, daily_min_budget, monthly_budget,
          min_wallet_topup, tax_name, tax_rate, payment_gateway, phone_code,
          flag_emoji, is_active, is_default, effective_date, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, CURRENT_DATE, NOW()
        )
        ON CONFLICT (country_code) DO UPDATE SET
          country_name = EXCLUDED.country_name,
          currency_code = EXCLUDED.currency_code,
          currency_symbol = EXCLUDED.currency_symbol,
          currency_position = EXCLUDED.currency_position,
          decimal_precision = EXCLUDED.decimal_precision,
          daily_min_budget = EXCLUDED.daily_min_budget,
          monthly_budget = EXCLUDED.monthly_budget,
          min_wallet_topup = EXCLUDED.min_wallet_topup,
          tax_name = EXCLUDED.tax_name,
          tax_rate = EXCLUDED.tax_rate,
          payment_gateway = EXCLUDED.payment_gateway,
          phone_code = EXCLUDED.phone_code,
          flag_emoji = EXCLUDED.flag_emoji,
          is_active = EXCLUDED.is_active,
          is_default = EXCLUDED.is_default,
          updated_at = NOW()
        RETURNING *`,
        [
          newId,
          cleanCode,
          country_name.trim(),
          currency_code.trim().toUpperCase(),
          currency_symbol.trim(),
          currency_position === 'after' ? 'after' : 'before',
          Number(decimal_precision) || 2,
          cleanDaily,
          cleanMonthly,
          cleanTopup,
          tax_name.trim(),
          Number(tax_rate) || 0,
          payment_gateway.trim(),
          phone_code.trim(),
          flag_emoji.trim(),
          Boolean(is_active),
          Boolean(is_default),
        ]
      );

      const created = insertRes.rows[0];

      // Audit Log
      await client.query(
        `INSERT INTO country_pricing_audit_logs (
          id, country_code, country_name, old_pricing, new_pricing,
          changed_by, change_reason, effective_date
        ) VALUES ($1, $2, $3, NULL, $4, $5, $6, CURRENT_DATE)`,
        [
          `audit_${Date.now()}_${cleanCode}`,
          cleanCode,
          country_name.trim(),
          JSON.stringify(created),
          admin_name,
          reason,
        ]
      );
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

    const existingRes = await query(
      `SELECT * FROM country_pricing WHERE id = $1 OR UPPER(country_code) = UPPER($1) LIMIT 1`,
      [idOrCode]
    );

    if (existingRes.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Country pricing record not found' });
    }

    const oldRecord = existingRes.rows[0];
    const cleanDaily = daily_min_budget !== undefined ? Math.max(1, Number(daily_min_budget)) : Number(oldRecord.daily_min_budget);
    const cleanMonthly = cleanDaily * 30;
    const cleanTopup = min_wallet_topup !== undefined ? Math.max(1, Number(min_wallet_topup)) : Number(oldRecord.min_wallet_topup);

    await withTransaction(async (client) => {
      if (is_default) {
        await client.query(`UPDATE country_pricing SET is_default = FALSE WHERE is_default = TRUE`);
      }

      const updateRes = await client.query(
        `UPDATE country_pricing SET
          country_name = COALESCE($1, country_name),
          currency_code = COALESCE($2, currency_code),
          currency_symbol = COALESCE($3, currency_symbol),
          currency_position = COALESCE($4, currency_position),
          decimal_precision = COALESCE($5, decimal_precision),
          daily_min_budget = $6,
          monthly_budget = $7,
          min_wallet_topup = $8,
          tax_name = COALESCE($9, tax_name),
          tax_rate = COALESCE($10, tax_rate),
          payment_gateway = COALESCE($11, payment_gateway),
          phone_code = COALESCE($12, phone_code),
          flag_emoji = COALESCE($13, flag_emoji),
          is_active = COALESCE($14, is_active),
          is_default = COALESCE($15, is_default),
          updated_at = NOW()
        WHERE id = $16 OR UPPER(country_code) = UPPER($16)
        RETURNING *`,
        [
          country_name ? country_name.trim() : null,
          currency_code ? currency_code.trim().toUpperCase() : null,
          currency_symbol ? currency_symbol.trim() : null,
          currency_position,
          decimal_precision !== undefined ? Number(decimal_precision) : null,
          cleanDaily,
          cleanMonthly,
          cleanTopup,
          tax_name ? tax_name.trim() : null,
          tax_rate !== undefined ? Number(tax_rate) : null,
          payment_gateway ? payment_gateway.trim() : null,
          phone_code ? phone_code.trim() : null,
          flag_emoji ? flag_emoji.trim() : null,
          is_active !== undefined ? Boolean(is_active) : null,
          is_default !== undefined ? Boolean(is_default) : null,
          idOrCode,
        ]
      );

      const updated = updateRes.rows[0];

      // Audit Log
      await client.query(
        `INSERT INTO country_pricing_audit_logs (
          id, country_code, country_name, old_pricing, new_pricing,
          changed_by, change_reason, effective_date
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_DATE)`,
        [
          `audit_${Date.now()}_${updated.country_code}`,
          updated.country_code,
          updated.country_name,
          JSON.stringify(oldRecord),
          JSON.stringify(updated),
          admin_name,
          reason,
        ]
      );
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
    const logsRes = await query(
      `SELECT * FROM country_pricing_audit_logs ORDER BY created_at DESC LIMIT 100`
    );
    return res.json({
      ok: true,
      logs: logsRes.rows || [],
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
    const statsRes = await query(
      `SELECT
        COALESCE(c.country_code, 'IN') AS country_code,
        COALESCE(c.country, 'India') AS country_name,
        COALESCE(w.currency, c.currency, 'INR') AS currency,
        COUNT(c.id) AS total_customers,
        SUM(CASE WHEN c.status = 'active' THEN 1 ELSE 0 END) AS active_customers,
        SUM(CASE WHEN w.ad_campaign_active = TRUE THEN 1 ELSE 0 END) AS active_campaigns,
        SUM(COALESCE(w.available_balance, 0)) AS total_wallet_balance,
        SUM(COALESCE(w.total_ad_spent, 0)) AS total_ad_spent,
        SUM(COALESCE(w.total_lifetime_paid, 0)) AS total_revenue
      FROM customers c
      LEFT JOIN wallets w ON w.customer_id = c.id
      GROUP BY c.country_code, c.country, COALESCE(w.currency, c.currency, 'INR')
      ORDER BY total_customers DESC`
    );

    return res.json({
      ok: true,
      analytics: statsRes.rows.map((r) => ({
        ...r,
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
