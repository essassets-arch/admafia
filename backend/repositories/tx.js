import mongoose from 'mongoose';

/**
 * Run `fn(session)` inside a MongoDB multi-document transaction.
 * - Replaces PostgreSQL `withTransaction(client => ...)`.
 * - On a standalone mongod (no replica set, e.g. a bare local dev DB) transactions are
 *   unsupported, so `fn(null)` runs without a session. Always pass `{ session }` to
 *   Mongoose calls (a null session is fine).
 * - Production runs a single-node replica set (rs0), so real ACID transactions apply there.
 */
export async function withMongoTransaction(fn) {
  const session = await mongoose.startSession();
  try {
    let result;
    try {
      await session.withTransaction(async () => {
        result = await fn(session);
      });
      return result;
    } catch (err) {
      const msg = String(err?.message || '');
      const unsupported =
        err?.code === 20 ||
        /Transaction numbers are only allowed|replica set member or mongos|Transactions are not supported/i.test(msg);
      if (!unsupported) throw err;
      return await fn(null);
    }
  } finally {
    session.endSession();
  }
}

/** Generate prefixed string IDs matching the legacy format, e.g. genId('pay') -> pay_1794..._ab12cd */
export function genId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
