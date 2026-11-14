import { createHmac, timingSafeEqual } from 'crypto';
import { SecurityEventLog } from '../models/index.js';

const COOKIE_NAME = 'admafia_session';
const DEFAULT_STAFF_TTL_SEC = 12 * 60 * 60; // 12 hours
const DEFAULT_CUSTOMER_TTL_SEC = 7 * 24 * 60 * 60; // 7 days

function getJwtSecret() {
  return (
    process.env.JWT_SECRET ||
    'admafia_default_dev_jwt_secret_change_in_prod_2026'
  ).trim();
}

function base64UrlEncode(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input), 'utf8');
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str) {
  const normalized = String(str || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, 'base64').toString('utf8');
}

/**
 * Signs a compact HS256 JWT token without external dependencies.
 */
export function signAuthToken(claims, ttlSeconds = DEFAULT_CUSTOMER_TTL_SEC) {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    ...claims,
    iat: nowSec,
    exp: nowSec + ttlSeconds,
  };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const sig = createHmac('sha256', getJwtSecret()).update(signingInput).digest();
  return `${signingInput}.${base64UrlEncode(sig)}`;
}

/**
 * Verifies an HS256 JWT token in constant time and checks expiration.
 */
export function verifyAuthToken(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') return null;
  const parts = rawToken.trim().split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, encodedSig] = parts;
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const expectedSig = base64UrlEncode(
    createHmac('sha256', getJwtSecret()).update(signingInput).digest()
  );

  const a = Buffer.from(encodedSig, 'utf8');
  const b = Buffer.from(expectedSig, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return null;
  }

  try {
    const header = JSON.parse(base64UrlDecode(encodedHeader));
    if (header.alg !== 'HS256') return null;
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    const nowSec = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp <= nowSec) return null;
    return payload;
  } catch {
    return null;
  }
}

export function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader || typeof cookieHeader !== 'string') return out;
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    if (k) {
      try {
        out[k] = decodeURIComponent(v);
      } catch {
        out[k] = v;
      }
    }
  }
  return out;
}

export function setAuthCookie(res, token, ttlSeconds = DEFAULT_CUSTOMER_TTL_SEC) {
  const isProd = process.env.NODE_ENV === 'production';
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${ttlSeconds}`,
  ];
  if (isProd) {
    parts.push('Secure');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearAuthCookie(res) {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
}

export function issueCustomerSession(res, customer) {
  const token = signAuthToken(
    {
      sub: String(customer.id || customer._id),
      actorType: 'customer',
      customerId: String(customer.id || customer._id),
      phone: String(customer.phone || '').replace(/\D/g, '').slice(-10),
      username: String(customer.username || '').trim().toLowerCase(),
      role: 'Customer',
      department: 'Customer Portal',
    },
    DEFAULT_CUSTOMER_TTL_SEC
  );
  setAuthCookie(res, token, DEFAULT_CUSTOMER_TTL_SEC);
  return token;
}

export function issueStaffSession(res, staffUser) {
  const token = signAuthToken(
    {
      sub: String(staffUser.id || staffUser._id),
      actorType: 'staff',
      role: String(staffUser.role || 'Staff'),
      department: String(staffUser.department || 'Super Admin'),
      username: String(staffUser.username || '').trim().toLowerCase(),
      email: String(staffUser.email || '').trim().toLowerCase(),
      customerId: staffUser.customerId || staffUser.customer_id || null,
    },
    DEFAULT_STAFF_TTL_SEC
  );
  setAuthCookie(res, token, DEFAULT_STAFF_TTL_SEC);
  return token;
}

export function extractTokenFromRequest(req) {
  const authHeader = String(req.headers?.authorization || '');
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return bearer;
  }
  const cookies = parseCookies(req.headers?.cookie);
  if (cookies[COOKIE_NAME]) return cookies[COOKIE_NAME];
  // SSE EventSource cannot set custom Authorization headers cross-port if cookies aren't sent
  if (req.query?.token && typeof req.query.token === 'string') {
    return req.query.token.trim();
  }
  return null;
}

export function attachOptionalAuth(req, _res, next) {
  const raw = extractTokenFromRequest(req);
  req.auth = raw ? verifyAuthToken(raw) : null;
  next();
}

export function requireAuth(req, res, next) {
  if (!req.auth) {
    const raw = extractTokenFromRequest(req);
    req.auth = raw ? verifyAuthToken(raw) : null;
  }
  if (!req.auth) {
    return res.status(401).json({
      ok: false,
      code: 'AUTH_REQUIRED',
      error: 'Authentication required. Please sign in to continue.',
    });
  }
  return next();
}

function isSuperAdminAuth(auth) {
  if (!auth || auth.actorType !== 'staff') return false;
  const dept = String(auth.department || '').toLowerCase();
  const role = String(auth.role || '').toLowerCase();
  return (
    dept === 'super admin' ||
    dept === 'superadmin' ||
    role.includes('super admin') ||
    role === 'operations manager' ||
    role === 'finance auditor'
  );
}

export function requireStaff(allowedDepartments = []) {
  const normalizedAllowed = allowedDepartments.map((d) => d.toLowerCase());
  return (req, res, next) => {
    if (!req.auth) {
      const raw = extractTokenFromRequest(req);
      req.auth = raw ? verifyAuthToken(raw) : null;
    }
    if (!req.auth) {
      return res.status(401).json({
        ok: false,
        code: 'STAFF_AUTH_REQUIRED',
        error: 'Department staff authentication is required.',
      });
    }
    if (req.auth.actorType !== 'staff') {
      SecurityEventLog.create({
        category: 'RBAC_DENIED',
        ipAddress: req.ip || '',
        path: req.originalUrl || req.path,
        method: req.method,
        actorId: req.auth.sub,
        detail: `Customer actor attempted staff route (${req.originalUrl})`,
      }).catch(() => {});
      return res.status(403).json({
        ok: false,
        code: 'FORBIDDEN',
        error: 'Access denied: department staff privileges required.',
      });
    }

    if (isSuperAdminAuth(req.auth) || normalizedAllowed.length === 0) {
      return next();
    }

    const actorDept = String(req.auth.department || '').toLowerCase();
    const actorRole = String(req.auth.role || '').toLowerCase();
    const matches = normalizedAllowed.some(
      (target) => actorDept.includes(target) || actorRole.includes(target)
    );
    if (!matches) {
      SecurityEventLog.create({
        category: 'RBAC_DENIED',
        ipAddress: req.ip || '',
        path: req.originalUrl || req.path,
        method: req.method,
        actorId: req.auth.sub,
        detail: `Staff (${actorDept}/${actorRole}) denied route requiring [${normalizedAllowed.join(', ')}]`,
      }).catch(() => {});
      return res.status(403).json({
        ok: false,
        code: 'FORBIDDEN_DEPARTMENT',
        error: 'Access denied for your department role.',
      });
    }

    return next();
  };
}

export const requireSuperAdmin = requireStaff(['super admin']);

/**
 * Enforces strict tenant isolation: allows verified staff OR the exact owning customer.
 * Blocks horizontal IDOR (Customer A reading/modifying Customer B's workspace, leads, or wallet).
 */
export function requireCustomerSelfOrStaff(extractTargetFn) {
  return (req, res, next) => {
    if (!req.auth) {
      const raw = extractTokenFromRequest(req);
      req.auth = raw ? verifyAuthToken(raw) : null;
    }
    if (!req.auth) {
      return res.status(401).json({
        ok: false,
        code: 'AUTH_REQUIRED',
        error: 'Authentication required to access workspace data.',
      });
    }
    if (req.auth.actorType === 'staff') {
      return next();
    }

    const rawTarget = String(extractTargetFn(req) || '').trim();
    if (!rawTarget) {
      return res.status(400).json({ ok: false, error: 'Missing customer identifier.' });
    }

    const normTargetLower = rawTarget.toLowerCase().replace(/^@/, '');
    const normTargetDigits = rawTarget.replace(/\D/g, '').slice(-10);
    const normTargetIdCore = rawTarget.replace(/^(cust_reg_|cust_|wal_)/i, '');

    const selfId = String(req.auth.customerId || req.auth.sub || '').trim();
    const selfIdCore = selfId.replace(/^(cust_reg_|cust_|wal_)/i, '');
    const selfPhone = String(req.auth.phone || '').replace(/\D/g, '').slice(-10);
    const selfUsername = String(req.auth.username || '').trim().toLowerCase().replace(/^@/, '');

    const isOwner =
      (selfId && rawTarget === selfId) ||
      (selfIdCore && normTargetIdCore && selfIdCore === normTargetIdCore) ||
      (selfPhone && normTargetDigits && normTargetDigits.length === 10 && selfPhone === normTargetDigits) ||
      (selfUsername && normTargetLower === selfUsername);

    if (!isOwner) {
      SecurityEventLog.create({
        category: 'RBAC_DENIED',
        ipAddress: req.ip || '',
        path: req.originalUrl || req.path,
        method: req.method,
        actorId: req.auth.sub,
        detail: `Blocked IDOR attempt by ${selfId} targeting ${rawTarget}`,
      }).catch(() => {});
      return res.status(403).json({
        ok: false,
        code: 'TENANT_ISOLATION_VIOLATION',
        error: 'Access denied: you can only access your own business workspace.',
      });
    }

    return next();
  };
}

