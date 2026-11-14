import { Wallet, WalletTransaction } from '../models/index.js';
import { genId } from './tx.js';

/**
 * Marketing area helpers (owned by routes/marketing.js).
 * All money mutations here are atomic conditional $inc updates that must be called
 * inside withMongoTransaction(session) together with their ledger rows.
 */

export function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function ciRegex(str) {
  return new RegExp(escapeRegExp(str), 'i');
}

export function ciExact(str) {
  return new RegExp(`^${escapeRegExp(str)}$`, 'i');
}

export function istDateString(date = new Date()) {
  return new Date(date).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/** Start (00:00 IST) of the current Asia/Kolkata calendar day, as an absolute Date. */
export function istDayStart(now = new Date()) {
  return new Date(`${istDateString(now)}T00:00:00+05:30`);
}

export function isDeductedToday(lastDeductedAt, now = new Date()) {
  return Boolean(lastDeductedAt) && istDateString(lastDeductedAt) === istDateString(now);
}

export class HttpError extends Error {
  constructor(statusCode, message, extra = {}) {
    super(message);
    this.statusCode = statusCode;
    Object.assign(this, extra);
  }
}

/**
 * Atomically deduct today's per-day service amount from a wallet, once per IST day.
 *
 * Replaces the SQL pattern (SELECT ... FOR UPDATE; UPDATE wallets SET available_balance = $computed).
 * The filter guarantees: balance is sufficient AND today's deduction has not been settled yet,
 * so concurrent callers can never double-charge or overdraw.
 *
 * Returns:
 *   { status: 'deducted', wallet }   -> wallet is the post-update document (balanceAfter = wallet.availableBalance)
 *   { status: 'already', wallet }    -> already deducted today (nothing changed)
 *   { status: 'insufficient', wallet } -> balance below `spend` (nothing changed)
 *   { status: 'missing' }            -> wallet does not exist
 */
export async function deductDailySpendAtomic(session, {
  walletId,
  customerId,
  spend,
  description,
  refPrefix = 'SYS-DAILY-MKT',
  marketingCode = '',
  bookedDate = null,
  now = new Date(),
}) {
  const dayStart = istDayStart(now);
  const set = { adCampaignActive: true, lastDeductedAt: now, updatedAt: now };
  if (marketingCode) set.marketingCode = marketingCode;
  const update = { $inc: { availableBalance: -spend, totalAdSpent: spend }, $set: set };
  if (bookedDate) update.$addToSet = { bookedDates: bookedDate };

  const updated = await Wallet.findOneAndUpdate(
    {
      _id: walletId,
      availableBalance: { $gte: spend },
      $or: [{ lastDeductedAt: null }, { lastDeductedAt: { $lt: dayStart } }],
    },
    update,
    { new: true, session }
  );

  if (!updated) {
    const current = await Wallet.findById(walletId).session(session).lean();
    if (!current) return { status: 'missing' };
    if (isDeductedToday(current.lastDeductedAt, now)) return { status: 'already', wallet: current };
    return { status: 'insufficient', wallet: current };
  }

  const refUtr = `${refPrefix}-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(2, 6)}`;
  await WalletTransaction.create(
    [{
      _id: genId('tx_deb'),
      customerId,
      walletId,
      txType: 'Debit',
      amount: spend,
      balanceAfter: updated.availableBalance,
      referenceUtr: refUtr,
      description,
      paymentMethod: 'Daily Auto-Debit',
      status: 'Settled ✓',
      currency: updated.currency || 'INR',
      createdAt: now,
    }],
    { session }
  );

  return { status: 'deducted', wallet: updated.toObject ? updated.toObject() : updated };
}
