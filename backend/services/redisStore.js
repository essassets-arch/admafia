import net from 'net';
import tls from 'tls';

/**
 * Lightweight, dependency-free Redis RESP2 client with automatic in-memory TTL fallback.
 * Powers distributed rate-limiting, WhatsApp OTP cooldowns, and session revocation across
 * multiple horizontal Node.js / Cloud Run / Kubernetes containers without breaking local dev.
 */

const memoryStore = new Map();

function purgeExpiredMemoryKeys() {
  const now = Date.now();
  for (const [k, entry] of memoryStore.entries()) {
    if (entry.expiresAt && entry.expiresAt <= now) {
      memoryStore.delete(k);
    }
  }
}
setInterval(purgeExpiredMemoryKeys, 30_000).unref?.();

function parseRedisUrl(rawUrl) {
  if (!rawUrl) return null;
  try {
    const u = new URL(rawUrl);
    return {
      isTls: u.protocol === 'rediss:',
      host: u.hostname || '127.0.0.1',
      port: Number(u.port || 6379),
      username: u.username ? decodeURIComponent(u.username) : '',
      password: u.password ? decodeURIComponent(u.password) : '',
      db: u.pathname && u.pathname.length > 1 ? Number(u.pathname.slice(1)) || 0 : 0,
    };
  } catch {
    return null;
  }
}

function encodeRespCommand(args) {
  let out = `*${args.length}\r\n`;
  for (const arg of args) {
    const str = String(arg ?? '');
    const byteLen = Buffer.byteLength(str, 'utf8');
    out += `$${byteLen}\r\n${str}\r\n`;
  }
  return out;
}

function parseRespReply(buf, offset = 0) {
  if (offset >= buf.length) return null;
  const prefix = String.fromCharCode(buf[offset]);
  const lineEnd = buf.indexOf('\r\n', offset);
  if (lineEnd === -1) return null;
  const header = buf.subarray(offset + 1, lineEnd).toString('utf8');

  if (prefix === '+') {
    return { value: header, nextOffset: lineEnd + 2 };
  }
  if (prefix === '-') {
    return { error: new Error(header), nextOffset: lineEnd + 2 };
  }
  if (prefix === ':') {
    return { value: Number(header), nextOffset: lineEnd + 2 };
  }
  if (prefix === '$') {
    const len = Number(header);
    if (len === -1) return { value: null, nextOffset: lineEnd + 2 };
    const bodyStart = lineEnd + 2;
    const bodyEnd = bodyStart + len;
    if (buf.length < bodyEnd + 2) return null;
    return {
      value: buf.subarray(bodyStart, bodyEnd).toString('utf8'),
      nextOffset: bodyEnd + 2,
    };
  }
  if (prefix === '*') {
    const count = Number(header);
    if (count === -1) return { value: null, nextOffset: lineEnd + 2 };
    const items = [];
    let cursor = lineEnd + 2;
    for (let i = 0; i < count; i += 1) {
      const sub = parseRespReply(buf, cursor);
      if (!sub) return null;
      if (sub.error) return { error: sub.error, nextOffset: sub.nextOffset };
      items.push(sub.value);
      cursor = sub.nextOffset;
    }
    return { value: items, nextOffset: cursor };
  }
  return { error: new Error(`Unexpected RESP prefix: ${prefix}`), nextOffset: buf.length };
}

class RedisConnection {
  constructor(url) {
    this.cfg = parseRedisUrl(url);
    this.socket = null;
    this.connected = false;
    this.connecting = null;
    this.buffer = Buffer.alloc(0);
    this.queue = [];
    this.lastError = null;
    this.lastRetryAt = 0;
  }

  async ensureConnected() {
    if (!this.cfg) return false;
    if (this.connected && this.socket && !this.socket.destroyed) return true;
    if (this.connecting) return this.connecting;
    if (Date.now() - this.lastRetryAt < 3000) return false;

    this.lastRetryAt = Date.now();
    this.connecting = new Promise((resolve) => {
      const connectOpts = { host: this.cfg.host, port: this.cfg.port };
      const sock = this.cfg.isTls ? tls.connect(connectOpts) : net.createConnection(connectOpts);
      let settled = false;

      const finish = (ok) => {
        if (!settled) {
          settled = true;
          this.connecting = null;
          resolve(ok);
        }
      };

      sock.setTimeout(2500);
      sock.on('timeout', () => {
        this.lastError = 'Redis socket timeout';
        sock.destroy();
        finish(false);
      });

      sock.on('error', (err) => {
        this.lastError = err.message;
        this.connected = false;
        while (this.queue.length > 0) {
          this.queue.shift().reject(err);
        }
        finish(false);
      });

      sock.on('close', () => {
        this.connected = false;
        while (this.queue.length > 0) {
          this.queue.shift().reject(new Error('Redis connection closed'));
        }
        finish(false);
      });

      sock.on('data', (chunk) => {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        while (this.queue.length > 0) {
          const parsed = parseRespReply(this.buffer, 0);
          if (!parsed) break;
          this.buffer = this.buffer.subarray(parsed.nextOffset);
          const pending = this.queue.shift();
          if (parsed.error) pending.reject(parsed.error);
          else pending.resolve(parsed.value);
        }
      });

      sock.once(this.cfg.isTls ? 'secureConnect' : 'connect', async () => {
        sock.setTimeout(0);
        this.socket = sock;
        try {
          if (this.cfg.password) {
            const authArgs = this.cfg.username
              ? ['AUTH', this.cfg.username, this.cfg.password]
              : ['AUTH', this.cfg.password];
            await this.sendRaw(authArgs);
          }
          if (this.cfg.db > 0) {
            await this.sendRaw(['SELECT', String(this.cfg.db)]);
          }
          this.connected = true;
          this.lastError = null;
          finish(true);
        } catch (authErr) {
          this.lastError = authErr.message;
          this.connected = false;
          sock.destroy();
          finish(false);
        }
      });
    });

    return this.connecting;
  }

  sendRaw(args) {
    return new Promise((resolve, reject) => {
      if (!this.socket || this.socket.destroyed) {
        return reject(new Error('Redis socket unavailable'));
      }
      const timer = setTimeout(() => {
        const idx = this.queue.indexOf(entry);
        if (idx !== -1) this.queue.splice(idx, 1);
        reject(new Error('Redis command timeout'));
      }, 2500);
      const entry = {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      };
      this.queue.push(entry);
      this.socket.write(encodeRespCommand(args));
    });
  }

  async command(args) {
    const ok = await this.ensureConnected();
    if (!ok) throw new Error(this.lastError || 'Redis not connected');
    return this.sendRaw(args);
  }
}

let singleton = null;
function getClient() {
  const url = (process.env.REDIS_URL || '').trim();
  if (!url) return null;
  if (!singleton || singleton.url !== url) {
    singleton = { url, conn: new RedisConnection(url) };
  }
  return singleton.conn;
}

export async function incrWithTtl(key, ttlSec) {
  const client = getClient();
  if (client) {
    try {
      const count = await client.command(['INCR', key]);
      if (count === 1) {
        await client.command(['EXPIRE', key, String(Math.max(1, Math.ceil(ttlSec)))]);
      } else {
        const currentTtl = await client.command(['TTL', key]);
        if (currentTtl === -1) {
          await client.command(['EXPIRE', key, String(Math.max(1, Math.ceil(ttlSec)))]);
        }
      }
      return { count: Number(count), backend: 'redis' };
    } catch {
      // Fall back cleanly to memoryStore if Redis transiently drops
    }
  }

  const now = Date.now();
  const existing = memoryStore.get(key);
  if (!existing || (existing.expiresAt && existing.expiresAt <= now)) {
    const next = { value: 1, expiresAt: now + Math.max(1, ttlSec) * 1000 };
    memoryStore.set(key, next);
    return { count: 1, backend: 'memory' };
  }
  existing.value = Number(existing.value || 0) + 1;
  return { count: existing.value, backend: 'memory' };
}

export async function setKeyEx(key, value, ttlSec) {
  const strVal = String(value);
  const client = getClient();
  if (client) {
    try {
      await client.command(['SETEX', key, String(Math.max(1, Math.ceil(ttlSec))), strVal]);
      return true;
    } catch {
      // Fallback
    }
  }
  memoryStore.set(key, { value: strVal, expiresAt: Date.now() + Math.max(1, ttlSec) * 1000 });
  return true;
}

export async function getKey(key) {
  const client = getClient();
  if (client) {
    try {
      return await client.command(['GET', key]);
    } catch {
      // Fallback
    }
  }
  const entry = memoryStore.get(key);
  if (!entry) return null;
  if (entry.expiresAt && entry.expiresAt <= Date.now()) {
    memoryStore.delete(key);
    return null;
  }
  return entry.value;
}

export async function delKey(key) {
  const client = getClient();
  if (client) {
    try {
      await client.command(['DEL', key]);
    } catch {
      // Fallback
    }
  }
  memoryStore.delete(key);
}

export async function getRedisHealth() {
  const url = (process.env.REDIS_URL || '').trim();
  if (!url) {
    return { configured: false, connected: false, mode: 'memory-fallback' };
  }
  const client = getClient();
  try {
    const pong = await client.command(['PING']);
    return {
      configured: true,
      connected: pong === 'PONG',
      mode: 'redis',
      host: client.cfg?.host,
      port: client.cfg?.port,
      lastError: null,
    };
  } catch (err) {
    return {
      configured: true,
      connected: false,
      mode: 'memory-fallback',
      host: client?.cfg?.host,
      port: client?.cfg?.port,
      lastError: err.message,
    };
  }
}

