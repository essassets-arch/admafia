import {
  Customer,
  Wallet,
  WalletTransaction,
  PaymentRecord,
} from '../models/index.js';
import { genId } from './tx.js';
import { recordMongoOutboxEvent } from '../services/mongoOutbox.js';

/**
 * Super Admin data-access helpers (MongoDB / Mongoose).
 * Owned by routes/superadmin.js. Shared money primitives (wallet credit + ledger rows, refund debit)
 * live here so every balance mutation is an atomic conditional $inc executed inside the caller's
 * withMongoTransaction session.
 */

// -----------------------------------------------------------------------------
// Generic helpers
// -----------------------------------------------------------------------------
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function escapeRegex(value) {
  return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Case-insensitive "contains" RegExp (user input is always escaped). */
export function ciContains(value) {
  return new RegExp(escapeRegex(String(value).trim()), 'i');
}

/** Case-insensitive exact-match RegExp. */
export function ciExact(value) {
  return new RegExp(`^${escapeRegex(String(value).trim())}$`, 'i');
}

/** Array of case-insensitive exact RegExps usable with $in / $nin (handles 'Pending' vs 'pending' data). */
export function ciAny(...values) {
  return values.map((v) => ciExact(v));
}

export const round2 = (n) => Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
export const num = (n) => Number(n || 0);

/** Status values that mean "a verified/paid payment_record" (legacy 'paid' + Mongo 'Verified ✓'). */
export const PAID_RECORD_STATUS = [/^paid$/i, /^verified/i];

export function parsePaging(query, defaultLimit) {
  const page = query.page ?? 1;
  const limit = query.limit ?? defaultLimit;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || defaultLimit));
  return { pageNum, limitNum, offset: (pageNum - 1) * limitNum };
}

export function buildPagination(total, pageNum, limitNum) {
  return {
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum) || 1,
  };
}

function isDuplicateKey(err) {
  return err && (err.code === 11000 || /E11000/.test(String(err.message || '')));
}
export { isDuplicateKey };

/**
 * Compensation runner for the standalone-mongod fallback of withMongoTransaction (session === null).
 * With a real transaction nothing is needed (abort rolls everything back). Without one, every
 * completed step registers an undo callback that is replayed in reverse order on failure.
 */
export async function withCompensation(session, fn) {
  const undo = [];
  try {
    return await fn((undoFn) => undo.push(undoFn));
  } catch (err) {
    if (!session) {
      for (const undoFn of undo.reverse()) {
        try {
          await undoFn();
        } catch (undoErr) {
          console.error('[superadminRepo] compensation failed:', undoErr.message);
        }
      }
    }
    throw err;
  }
}

// -----------------------------------------------------------------------------
// Money primitives
// -----------------------------------------------------------------------------

/**
 * Atomically credit a customer wallet (conditional $inc) and write the ledger rows
 * (wallet_transactions + payment_records) in the caller's session.
 *
 * Idempotency: wallet_transactions.referenceUtr has a unique index. A duplicate throws HttpError(409, 'DUPLICATE_UTR').
 *
 * @returns {{ wallet, previousBalance, newBalance, transaction }}
 */
export async function creditWalletLedger({
  session,
  registerUndo = () => {},
  customerId,
  amount,
  referenceUtr,
  paymentMethod,
  description,
  txIdPrefix = 'tx_topup',
  createWalletIfMissing = false,
  newWalletId = null,
  markCustomerPaid = false,
  receiptCustomer = null, // customer doc -> a payment_records receipt is written (SQL INSERT..SELECT FROM customers)
}) {
  const now = new Date();
  const opts = { new: true, session };

  const update = {
    $inc: { availableBalance: amount, totalLifetimePaid: amount },
    $set: { updatedAt: now },
  };
  let wallet;
  if (createWalletIfMissing) {
    update.$setOnInsert = {
      _id: newWalletId,
      currency: 'INR',
      dailyAdSpend: 300,
      totalAdSpent: 0,
      adCampaignActive: false,
      createdAt: now,
    };
    wallet = await Wallet.findOneAndUpdate({ customerId }, update, { ...opts, upsert: true });
  } else {
    wallet = await Wallet.findOneAndUpdate({ customerId }, update, opts);
    if (!wallet) throw new Error('Wallet not found for customer.');
  }
  registerUndo(() =>
    Wallet.updateOne({ customerId }, { $inc: { availableBalance: -amount, totalLifetimePaid: -amount } })
  );

  const newBalance = round2(wallet.availableBalance);
  const previousBalance = round2(wallet.availableBalance - amount);

  if (markCustomerPaid) {
    await Customer.updateOne({ _id: customerId }, { $set: { paymentStatus: 'paid', updatedAt: now } }, { session });
  }

  const txId = genId(txIdPrefix);
  let transaction;
  try {
    [transaction] = await WalletTransaction.create(
      [
        {
          _id: txId,
          customerId,
          walletId: wallet._id,
          txType: 'Credit',
          amount,
          balanceAfter: newBalance,
          referenceUtr,
          description,
          paymentMethod,
          status: 'Verified ✓',
          createdAt: now,
        },
      ],
      { session }
    );
  } catch (err) {
    if (isDuplicateKey(err)) throw new HttpError(409, 'DUPLICATE_UTR');
    throw err;
  }
  registerUndo(() => WalletTransaction.deleteOne({ _id: txId }));

  if (receiptCustomer) {
    const payId = genId('pay');
    await PaymentRecord.create(
      [
        {
          _id: payId,
          customerId,
          walletId: wallet._id,
          receiptNumber: `REC_${Date.now()}_${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
          companyName: receiptCustomer.companyName,
          contactPerson: receiptCustomer.contactPerson,
          phone: receiptCustomer.phone,
          txType: 'topup',
          amount,
          gstAmount: 0,
          totalAmount: amount,
          paymentMethod,
          referenceUtr,
          status: 'paid',
          createdAt: now,
        },
      ],
      { session }
    );
    registerUndo(() => PaymentRecord.deleteOne({ _id: payId }));
  }

  await recordMongoOutboxEvent(session, {
    aggregateType: 'wallet',
    aggregateId: wallet._id,
    eventType: 'WALLET_CREDITED',
    payload: { customerId, amount, balanceAfter: newBalance, referenceUtr },
  });

  return { wallet, previousBalance, newBalance, transaction };
}

/**
 * Atomically debit a customer wallet for an approved refund (conditional $inc: balance must be >= amount)
 * and write the immutable Debit ledger row in the caller's session.
 */
export async function debitWalletForRefund({
  session,
  registerUndo = () => {},
  customerId,
  amount,
  referenceUtr,
  description,
}) {
  const now = new Date();
  const wallet = await Wallet.findOneAndUpdate(
    { customerId, availableBalance: { $gte: amount } },
    { $inc: { availableBalance: -amount }, $set: { updatedAt: now } },
    { new: true, session }
  );

  if (!wallet) {
    const existing = await Wallet.findOne({ customerId }).session(session).lean();
    if (!existing) throw new Error('Customer wallet not found for refund processing.');
    throw new Error(
      `Insufficient wallet balance (₹${num(existing.availableBalance).toFixed(2)}) for refund of ₹${amount.toFixed(2)}.`
    );
  }
  registerUndo(() => Wallet.updateOne({ customerId }, { $inc: { availableBalance: amount } }));

  const balanceAfter = round2(wallet.availableBalance);
  const txId = genId('tx_refund');
  try {
    await WalletTransaction.create(
      [
        {
          _id: txId,
          customerId,
          walletId: wallet._id,
          txType: 'Debit',
          amount,
          balanceAfter,
          referenceUtr,
          description,
          paymentMethod: 'Official Bank / Gateway Refund',
          status: 'Completed ✓',
          createdAt: now,
        },
      ],
      { session }
    );
  } catch (err) {
    if (isDuplicateKey(err)) throw new HttpError(409, 'DUPLICATE_UTR');
    throw err;
  }
  registerUndo(() => WalletTransaction.deleteOne({ _id: txId }));

  await recordMongoOutboxEvent(session, {
    aggregateType: 'wallet',
    aggregateId: wallet._id,
    eventType: 'WALLET_DEBITED',
    payload: { customerId, amount, balanceAfter, referenceUtr },
  });

  return { wallet, balanceAfter };
}
