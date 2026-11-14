import { incrWithTtl } from '../services/redisStore.js';
import { SecurityEventLog } from '../models/index.js';

/**
 * Extracts real visitor IP safely when behind Cloudflare / Nginx (`TRUST_PROXY_HEADERS=true`).
 */
export function getClientIp(req) {
  const trustProxy = String(process.env.TRUST_PROXY_HEADERS || 'true').toLowerCase() !== 'false';
  if (trustProxy) {
    const cfIp = req.headers?.['cf-connecting-ip'];
    if (cfIp && typeof cfIp === 'string') return cfIp.split(',')[0].trim();
    const realIp = req.headers?.['x-real-ip'];
    if (realIp && typeof realIp === 'string') return realIp.split(',')[0].trim();
    const xff = req.headers?.['x-forwarded-for'];
    if (xff && typeof xff === 'string') return xff.split(',')[0].trim();
  }
  return String(req.ip || req.socket?.remoteAddress || '127.0.0.1').replace(/^::ffff:/, '');
}

/**
 * Enterprise HTTP Security Headers (Helmet-grade defense-in-depth).
 */
export function securityHeadersMiddleware(req, res, next) {
  res.removeHeader('X-Powered-By');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  const isHttps =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    process.env.NODE_ENV === 'production';
  if (isHttps) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  // Content-Security-Policy compatible with Vite SPA, SSR country bootstrap, Razorpay Checkout & Firebase FCM
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://www.gstatic.com https://apis.google.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https://api.razorpay.com https://lumberjack.razorpay.com https://fcm.googleapis.com https://fcmregistrations.googleapis.com https://firebaseinstallations.googleapis.com https://firebase.googleapis.com https://*.googleapis.com https://www.gstatic.com",
      "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com",
      "object-src 'none'",
      "base-uri 'self'",
    ].join('; ')
  );

  next();
}

/**
 * Strict Origin Allowlist CORS Middleware (blocks arbitrary third-party origin credential theft).
 */
export function strictCorsMiddleware(req, res, next) {
  const rawAllowed =
    process.env.CORS_ALLOWED_ORIGINS ||
    'http://localhost:5173,http://127.0.0.1:5173,http://localhost:5051,http://127.0.0.1:5051,http://localhost:5001,http://127.0.0.1:5001,http://localhost:5050,http://127.0.0.1:5050,https://admafia.marketing,https://www.admafia.marketing';
  const allowedSet = new Set(
    rawAllowed
      .split(',')
      .map((s) => s.trim().replace(/\/$/, ''))
      .filter(Boolean)
  );

  const origin = req.headers.origin ? String(req.headers.origin).trim().replace(/\/$/, '') : '';
  res.setHeader('Vary', 'Origin');

  // Same-origin / server-to-server / curl / webhook requests have no Origin header
  if (!origin) {
    return next();
  }

  if (!allowedSet.has(origin)) {
    SecurityEventLog.create({
      category: 'CORS_BLOCKED',
      ipAddress: getClientIp(req),
      path: req.originalUrl || req.path,
      method: req.method,
      detail: `Blocked unauthorized Origin: ${origin}`,
    }).catch(() => {});
    return res.status(403).json({
      ok: false,
      code: 'CORS_ORIGIN_DENIED',
      error: 'Cross-origin request denied by security policy.',
    });
  }

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Requested-With, x-admin-id, x-admin-role, x-admin-name, x-razorpay-signature'
  );
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  return next();
}

/**
 * Recursive NoSQL Operator & Prototype Pollution Sanitizer (`$gt`, `$ne`, `$where`, `__proto__`).
 */
function sanitizeObjectInPlace(target, stats) {
  if (!target || typeof target !== 'object') return target;
  if (Array.isArray(target)) {
    for (let i = 0; i < target.length; i += 1) {
      if (target[i] && typeof target[i] === 'object') {
        sanitizeObjectInPlace(target[i], stats);
      }
    }
    return target;
  }

  for (const key of Object.keys(target)) {
    if (
      key.startsWith('$') ||
      key === '__proto__' ||
      key === 'constructor' ||
      key === 'prototype'
    ) {
      stats.removedKeys.push(key);
      delete target[key];
      continue;
    }
    const val = target[key];
    if (val && typeof val === 'object') {
      sanitizeObjectInPlace(val, stats);
    }
  }
  return target;
}

export function mongoSanitizeMiddleware(req, _res, next) {
  const stats = { removedKeys: [] };
  if (req.body && typeof req.body === 'object') sanitizeObjectInPlace(req.body, stats);
  if (req.query && typeof req.query === 'object') sanitizeObjectInPlace(req.query, stats);
  if (req.params && typeof req.params === 'object') sanitizeObjectInPlace(req.params, stats);

  if (stats.removedKeys.length > 0) {
    SecurityEventLog.create({
      category: 'NOSQL_SANITIZED',
      ipAddress: getClientIp(req),
      path: req.originalUrl || req.path,
      method: req.method,
      detail: `Stripped injected keys: ${stats.removedKeys.slice(0, 8).join(', ')}`,
    }).catch(() => {});
  }
  next();
}

/**
 * Distributed Redis-backed (with automatic memory fallback) Rate Limiter.
 */
export function createRateLimiter({ name, maxRequests, windowSeconds, keyFn }) {
  return async (req, res, next) => {
    // Allow internal local load testing override ONLY when NODE_ENV=test and header matches
    if (process.env.NODE_ENV === 'test' && req.headers['x-bypass-ratelimit-test'] === '1') {
      return next();
    }
    const ip = getClientIp(req);
    const subject = keyFn ? keyFn(req, ip) : ip;
    const key = `rl:${name}:${subject}`;

    try {
      const { count } = await incrWithTtl(key, windowSeconds);
      const remaining = Math.max(0, maxRequests - count);
      res.setHeader('X-RateLimit-Limit', String(maxRequests));
      res.setHeader('X-RateLimit-Remaining', String(remaining));

      if (count > maxRequests) {
        res.setHeader('Retry-After', String(windowSeconds));
        SecurityEventLog.create({
          category: 'RATE_LIMIT',
          ipAddress: ip,
          path: req.originalUrl || req.path,
          method: req.method,
          detail: `Limiter [${name}] tripped (${count}/${maxRequests} per ${windowSeconds}s)`,
        }).catch(() => {});
        return res.status(429).json({
          ok: false,
          code: 'RATE_LIMIT_EXCEEDED',
          error: `Too many requests. Please retry after ${windowSeconds} seconds.`,
          retryAfterSeconds: windowSeconds,
        });
      }
    } catch {
      // Fail open only if rate limiter backend throws unexpectedly
    }

    return next();
  };
}

/**
 * Validates binary magic bytes of uploaded Base64 media to block disguised HTML/SVG XSS or scripts.
 */
export function validateMediaUploadMagicBytes(rawBase64) {
  if (!rawBase64 || typeof rawBase64 !== 'string') {
    return { valid: false, error: 'Empty media upload payload.' };
  }
  const cleaned = rawBase64.replace(/^data:[^;]+;base64,/, '').trim();
  const buf = Buffer.from(cleaned.slice(0, 64), 'base64');
  if (buf.length < 4) {
    return { valid: false, error: 'Uploaded file is too small or corrupted.' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { valid: true, detectedExt: 'png', detectedMime: 'image/png' };
  }
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { valid: true, detectedExt: 'jpg', detectedMime: 'image/jpeg' };
  }
  // GIF: 47 49 46 38 ("GIF8")
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) {
    return { valid: true, detectedExt: 'gif', detectedMime: 'image/gif' };
  }
  // WebP: "RIFF" .... "WEBP"
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { valid: true, detectedExt: 'webp', detectedMime: 'image/webp' };
  }
  // PDF: 25 50 44 46 ("%PDF")
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) {
    return { valid: true, detectedExt: 'pdf', detectedMime: 'application/pdf' };
  }
  // MP4: .... "ftyp" at offset 4
  if (buf.length >= 8 && buf.subarray(4, 8).toString('ascii') === 'ftyp') {
    return { valid: true, detectedExt: 'mp4', detectedMime: 'video/mp4' };
  }

  return {
    valid: false,
    error: 'Unsupported or unsafe file binary signature. Only PNG, JPEG, WebP, GIF, MP4, or PDF files are allowed.',
  };
}

