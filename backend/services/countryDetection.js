import geoip from 'geoip-lite';
import { query } from '../db.js';

// In-memory cache for country pricing master
let cachedPricing = null;
let cachedPricingExpiresAt = 0;
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

/**
 * Invalidate pricing cache when Super Admin updates rates
 */
export function invalidateCountryPricingCache() {
  cachedPricing = null;
  cachedPricingExpiresAt = 0;
}

/**
 * Helper: Determine if an IP address is a private/local/bogon IP
 */
export function isPrivateOrLocalIp(ip) {
  if (!ip) return true;
  const cleanIp = String(ip).trim().replace(/^::ffff:/, '');
  if (
    cleanIp === '127.0.0.1' ||
    cleanIp === '::1' ||
    cleanIp === 'localhost' ||
    cleanIp.startsWith('10.') ||
    cleanIp.startsWith('192.168.') ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(cleanIp) ||
    cleanIp.startsWith('fc00:') ||
    cleanIp.startsWith('fe80:')
  ) {
    return true;
  }
  return false;
}

/**
 * Extract public client IP address from request headers & socket
 */
export function extractClientIp(req) {
  if (!req) return '127.0.0.1';

  // 1. Cloudflare True-Client-IP or CF-Connecting-IP
  const cfIp = req.headers['cf-connecting-ip'] || req.headers['true-client-ip'];
  if (cfIp && !isPrivateOrLocalIp(cfIp)) {
    return String(cfIp).trim();
  }

  // 2. X-Forwarded-For (rightmost public IP). The leftmost value is client
  // controlled unless every upstream proxy is explicitly trusted.
  const xForwardedFor = req.headers['x-forwarded-for'];
  if (xForwardedFor) {
    const ips = String(xForwardedFor).split(',').map((s) => s.trim());
    for (const rawIp of ips.reverse()) {
      if (rawIp && !isPrivateOrLocalIp(rawIp)) return rawIp;
    }
  }

  // 3. X-Real-IP
  const xRealIp = req.headers['x-real-ip'];
  if (xRealIp && !isPrivateOrLocalIp(xRealIp)) {
    return String(xRealIp).trim();
  }

  // 4. Remote address from socket
  const socketIp = req.socket?.remoteAddress || req.connection?.remoteAddress;
  if (socketIp) {
    const cleanSocketIp = String(socketIp).replace(/^::ffff:/, '').trim();
    return cleanSocketIp;
  }

  return '127.0.0.1';
}

/**
 * Fetch all active country pricing configurations from PostgreSQL
 */
export async function getActiveCountryPricingList() {
  const now = Date.now();
  if (cachedPricing && now < cachedPricingExpiresAt) {
    return cachedPricing;
  }

  try {
    const res = await query(
      `SELECT
        id,
        country_code,
        country_name,
        currency_code,
        currency_symbol,
        currency_position,
        decimal_precision,
        daily_min_budget::NUMERIC AS daily_min_budget,
        monthly_budget::NUMERIC AS monthly_budget,
        min_wallet_topup::NUMERIC AS min_wallet_topup,
        tax_name,
        tax_rate::NUMERIC AS tax_rate,
        payment_gateway,
        phone_code,
        flag_emoji,
        is_active,
        is_default,
        effective_date
      FROM country_pricing
      WHERE is_active = TRUE
      ORDER BY is_default DESC, country_name ASC`
    );

    const countries = (res.rows || []).map((r) => ({
      ...r,
      daily_min_budget: Number(r.daily_min_budget),
      monthly_budget: Number(r.monthly_budget),
      min_wallet_topup: Number(r.min_wallet_topup),
      tax_rate: Number(r.tax_rate),
    }));

    cachedPricing = countries;
    cachedPricingExpiresAt = now + CACHE_TTL_MS;
    return countries;
  } catch (err) {
    console.error('[CountryDetection] Error querying country_pricing:', err.message);
    if (cachedPricing) return cachedPricing;
    // Hardcoded fallback safety net if database query encounters an unexpected network stall
    return [
      {
        id: 'cp_in',
        country_code: 'IN',
        country_name: 'India',
        currency_code: 'INR',
        currency_symbol: '₹',
        currency_position: 'before',
        decimal_precision: 0,
        daily_min_budget: 300,
        monthly_budget: 9000,
        min_wallet_topup: 300,
        tax_name: 'GST',
        tax_rate: 18,
        payment_gateway: 'razorpay',
        phone_code: '+91',
        flag_emoji: '🇮🇳',
        is_active: true,
        is_default: true,
      },
    ];
  }
}

/**
 * Detect country code from HTTP request using Cloudflare header, geoip-lite, or simulation param
 */
export function detectCountryCode(req) {
  // Test simulation is available only outside production.
  if (process.env.NODE_ENV !== 'production') {
    const simCountry = req?.query?.simulatedCountry || req?.headers['x-simulated-country'];
    if (simCountry && /^[a-zA-Z]{2}$/.test(simCountry)) return simCountry.toUpperCase();

    const simIp = req?.query?.simulatedIp || req?.headers['x-simulated-ip'];
    if (simIp) {
      const geo = geoip.lookup(simIp);
      if (geo?.country) return geo.country.toUpperCase();
    }
  }

  // 1. Cloudflare IP Geolocation Header (trusted proxy header)
  const cfCountry = req?.headers?.['cf-ipcountry'];
  if (cfCountry && /^[a-zA-Z]{2}$/.test(cfCountry)) {
    const code = cfCountry.toUpperCase();
    if (code !== 'XX' && code !== 'T1') {
      return code;
    }
  }

  // 2. Public IP resolution via geoip-lite database
  const clientIp = extractClientIp(req);
  if (clientIp && !isPrivateOrLocalIp(clientIp)) {
    try {
      const geo = geoip.lookup(clientIp);
      if (geo?.country && /^[a-zA-Z]{2}$/.test(geo.country)) {
        return geo.country.toUpperCase();
      }
    } catch (e) {
      console.warn('[CountryDetection] GeoIP lookup error for IP:', clientIp, e.message);
    }
  }

  // Default to India if private IP or unresolvable
  return 'IN';
}

/**
 * Full detection handler: returns active country pricing for visitor
 */
export async function resolveVisitorCountry(req) {
  const detectedCode = detectCountryCode(req);
  const countries = await getActiveCountryPricingList();

  const defaultCountry = countries.find((c) => c.is_default) || countries[0];
  const matchedCountry = countries.find((c) => c.country_code.toUpperCase() === detectedCode.toUpperCase());

  if (matchedCountry) {
    return {
      success: true,
      country: matchedCountry,
      isAutoDetected: true,
      detectedCode,
      defaultCountry,
    };
  }

  // If detected country has no approved custom pricing, return default country (with fallback notice)
  return {
    success: true,
    country: defaultCountry,
    isAutoDetected: false,
    isFallback: true,
    detectedCode,
    defaultCountry,
  };
}

