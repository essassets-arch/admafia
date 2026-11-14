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
    cleanIp.startsWith('fe80:') ||
    cleanIp.startsWith('::ffff:127.') ||
    cleanIp === '0.0.0.0' ||
    cleanIp === '::'
  ) {
    return true;
  }
  return false;
}

function ipToLong(ip) {
  const parts = String(ip).trim().split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function parseCidr(cidr) {
  const [ip, bitsStr] = cidr.split('/');
  const bits = parseInt(bitsStr, 10);
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  const subnet = (ipToLong(ip) & mask) >>> 0;
  return { mask, subnet };
}

const CLOUDFLARE_IPV4_CIDRS = [
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
].map(parseCidr);

const CLOUDFLARE_IPV6_PREFIXES = [
  '2400:cb00:',
  '2606:4700:',
  '2803:f800:',
  '2405:b500:',
  '2405:8100:',
  '2a06:98c0:',
  '2c0f:f248:',
];

export function isCloudflareIp(ip) {
  if (!ip) return false;
  const clean = normalizeIp(ip);
  const configured = String(process.env.CLOUDFLARE_TRUSTED_PROXY_IPS || '').split(',').map((v) => v.trim()).filter(Boolean);
  if (configured.includes(clean)) return true;

  const num = ipToLong(clean);
  if (num !== null) {
    return CLOUDFLARE_IPV4_CIDRS.some((c) => ((num & c.mask) >>> 0) === c.subnet);
  }
  const lower = clean.toLowerCase();
  return CLOUDFLARE_IPV6_PREFIXES.some((p) => lower.startsWith(p));
}

function normalizeIp(value) { return String(value || '').trim().replace(/^::ffff:/, ''); }

function isValidPublicIp(value) {
  const ip = normalizeIp(value);
  return ip.length < 46 && !/[\s,]/.test(ip) && !isPrivateOrLocalIp(ip) && /^[0-9a-f:.]+$/i.test(ip);
}

function isTrustedProxy(ip) {
  const clean = normalizeIp(ip);
  if (isPrivateOrLocalIp(clean)) return true;
  const configured = String(process.env.TRUSTED_PROXY_IPS || '').split(',').map((v) => v.trim()).filter(Boolean);
  if (configured.includes(clean)) return true;
  if (isCloudflareIp(clean)) return true;
  return process.env.TRUST_PROXY_HEADERS === 'true';
}

/**
 * Extract public client IP address from request headers & socket.
 * Strict security: Only trusts CF-Connecting-IP if upstream peer is verified Cloudflare.
 */
export function extractClientIp(req) {
  if (!req) return '127.0.0.1';
  const socketIp = req.socket?.remoteAddress || req.connection?.remoteAddress;
  const peer = normalizeIp(socketIp);

  if (isTrustedProxy(peer)) {
    const xRealIp = normalizeIp(req.headers['x-real-ip']);
    const upstreamPeer = isValidPublicIp(xRealIp) ? xRealIp : peer;
    if (isCloudflareIp(upstreamPeer)) {
      const cfIp = normalizeIp(req.headers['cf-connecting-ip'] || req.headers['true-client-ip']);
      if (isValidPublicIp(cfIp)) return cfIp;
    }
    if (isValidPublicIp(xRealIp)) return xRealIp;

    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',').map((v) => normalizeIp(v)).filter(isValidPublicIp);
    if (forwarded.length > 0) return forwarded[forwarded.length - 1];
  }

  if (isCloudflareIp(peer)) {
    const cfIp = normalizeIp(req.headers['cf-connecting-ip'] || req.headers['true-client-ip']);
    if (isValidPublicIp(cfIp)) return cfIp;
  }

  return peer || '127.0.0.1';
}

function getTrustedCloudflareCountry(req) {
  const socketIp = req?.socket?.remoteAddress || req?.connection?.remoteAddress;
  const peer = normalizeIp(socketIp);
  const xRealIp = normalizeIp(req?.headers?.['x-real-ip']);
  const upstreamPeer = isTrustedProxy(peer) && isValidPublicIp(xRealIp) ? xRealIp : peer;

  // STRICT: Only trust CF-IPCountry if the upstream connection is verified from Cloudflare
  if (!isCloudflareIp(upstreamPeer)) return null;

  const value = String(req?.headers?.['cf-ipcountry'] || '').toUpperCase();
  return /^[A-Z]{2}$/.test(value) && !['XX', 'T1'].includes(value) ? value : null;
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
    return [];
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

  const cfCountry = getTrustedCloudflareCountry(req);
  if (cfCountry) return cfCountry;

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

  return null;
}

/** Build one of the two supported public pricing records from an ISO country code. */
export function getPricingForCountryCode(countryCode) {
  if (!/^[A-Z]{2}$/.test(String(countryCode || '').toUpperCase())) return null;
  const code = String(countryCode).toUpperCase();
  const isIndia = code === 'IN';
  return {
    id: isIndia ? 'ip_price_in' : 'ip_price_global',
    country_code: code,
    country_name: isIndia ? 'India' : 'International',
    currency_code: isIndia ? 'INR' : 'USD',
    currency_symbol: isIndia ? String.fromCodePoint(0x20b9) : '$',
    currency_position: 'before',
    decimal_precision: 0,
    daily_min_budget: isIndia ? 300 : 10,
    monthly_budget: isIndia ? 9000 : 300,
    min_wallet_topup: isIndia ? 300 : 10,
    tax_name: isIndia ? 'GST' : 'Tax',
    tax_rate: isIndia ? 18 : 0,
    payment_gateway: isIndia ? 'razorpay' : 'international',
    phone_code: isIndia ? '+91' : '',
    flag_emoji: '',
    is_active: true,
    is_default: isIndia,
    is_auto_detected: true,
    is_manual_override: false,
  };
}

/**
 * Full detection handler: returns active country pricing for visitor
 */
export async function resolveVisitorCountry(req) {
  const detectedCode = detectCountryCode(req);
  const pricing = getPricingForCountryCode(detectedCode);
  if (pricing) {
    return {
      success: true,
      country: pricing,
      isAutoDetected: true,
      detectedCode,
      defaultCountry: null,
    };
  }

  // Do not misidentify unsupported countries or visitors whose IP cannot be resolved.
  return {
    success: false,
    country: null,
    isAutoDetected: false,
    isFallback: false,
    detectedCode,
    defaultCountry: null,
  };
}

