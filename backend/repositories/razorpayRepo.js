import { randomBytes } from 'crypto';
import {
  Customer,
  Wallet,
  WalletTransaction,
  PaymentRecord,
  TaxInvoice,
  PendingVerification,
  RefundRequest,
  MarketingCampaign,
} from '../models/index.js';
import { withMongoTransaction, genId } from './tx.js';
import { recordMongoOutboxEvent } from '../services/mongoOutbox.js';
import { ciExact, escapeRegex } from './salesViewRepo.js';

/**
 * Razorpay / wallet-credit / wallet-deduct data access (server.js slice C).
 * Replaces the raw SQL in the Razorpay section, creditCustomerWallet,
 * /api/wallets/failed-transaction and /api/wallets/deduct.
 *
 * Money rules:
 *  - every balance mutation is a single atomic $inc / conditional update inside withMongoTransaction,
 *    together with its ledger rows (wallet_transactions, payment_records, tax_invoices, outbox event);
 *  - UTR (referenceUtr) idempotency is enforced by the unique index on wallet_transactions.referenceUtr
 *    plus an in-transaction "already Verified" check (replaces pg_advisory_xact_lock + FOR UPDATE).
 */

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** Coerce untrusted request values to plain strings (objects such as {"$ne":null} become ''). */
export function scalar(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

export class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function istDateString(date = new Date()) {
  return new Date(date).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function istDayStart(now = new Date()) {
  return new Date(`${istDateString(now)}T00:00:00+05:30`);
}

function isDeductedToday(lastDeductedAt, now = new Date()) {
  return Boolean(lastDeductedAt) && istDateString(lastDeductedAt) === istDateString(now);
}

const currencySymbolOf = (cur) =>
  cur === 'USD' ? '$' : cur === 'AED' ? 'AED ' : cur === 'GBP' ? '£' : cur === 'SAR' ? 'SAR ' : '₹';

/** Mongo filter replacing `RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 10) = $1` (digits only, safe to embed). */
export function phoneDigitsFilter(cleanPhone) {
  const digits = String(cleanPhone || '').replace(/\D/g, '');
  if (!digits) return null;
  const body = digits.split('').join('\\D*');
  const rx = digits.length >= 10 ? new RegExp(`${body}\\D*$`) : new RegExp(`^\\D*${body}\\D*$`);
  return { $or: [{ phone: digits }, { phone: rx }] };
}

/**
 * Replaces `WHERE id = $1 OR phone = $2 OR LOWER(username) = LOWER($3) LIMIT 1`.
 * Matches are tried in priority order (id, phone, username) so the result is deterministic.
 */
export async function findCustomerFlexible({ id, phone, username } = {}, { session = null } = {}) {
  const cid = scalar(id);
  const ph = scalar(phone);
  const un = scalar(username);
  if (cid) {
    const byId = await Customer.findById(cid).session(session).lean();
    if (byId) return byId;
  }
  if (ph) {
    const byPhone = await Customer.findOne({ phone: ph }).session(session).lean();
    if (byPhone) return byPhone;
  }
  if (un) {
    const byUser = await Customer.findOne({ username: ciExact(un) }).session(session).lean();
    if (byUser) return byUser;
  }
  return null;
}

/** `COALESCE(w.currency, c.currency, 'INR')` for a customer id; null when the customer does not exist. */
export async function getBillingCurrency(customerId, { session = null } = {}) {
  const cid = scalar(customerId);
  if (!cid) return null;
  const cust = await Customer.findById(cid, { currency: 1 }).session(session).lean();
  if (!cust) return null;
  const wallet = await Wallet.findOne({ customerId: cid }, { currency: 1 }).session(session).lean();
  return String(wallet?.currency || cust.currency || 'INR').toUpperCase();
}

/** Customer id / wallet id lookups used by the webhook. */
export async function findCustomerByEmailExact(email) {
  const e = scalar(email);
  if (!e) return null;
  return Customer.findOne({ email: e }, { phone: 1 }).lean();
}

export async function findCustomerByEmailCi(email) {
  const e = scalar(email).trim();
  if (!e) return null;
  return Customer.findOne({ email: ciExact(e) }, { _id: 1 }).lean();
}

export async function findCustomerByPhoneDigits(cleanPhone) {
  const filter = phoneDigitsFilter(cleanPhone);
  if (!filter) return null;
  return Customer.findOne(filter, { _id: 1 }).lean();
}

/** Replaces `SELECT customer_id FROM payment_records WHERE order_id = $1 OR utr_reference = $1`. */
export async function findPaymentCustomerByOrder(orderId) {
  const oid = scalar(orderId);
  if (!oid) return null;
  return PaymentRecord.findOne({ $or: [{ gatewayOrderId: oid }, { referenceUtr: oid }] }, { customerId: 1 }).lean();
}

// ---------------------------------------------------------------------------
// Declined / failed ledger rows
// ---------------------------------------------------------------------------
const SETTLED_STATUS = /verified|settled|refunded/i;

/**
 * Upsert a "declined" ledger row keyed on referenceUtr
 * (replaces INSERT ... ON CONFLICT (reference_utr) DO UPDATE SET status = 'Payment Declined', description = ...).
 *
 * Hardening vs. the SQL: an already Verified / Settled / Refunded row is never downgraded to "declined"
 * (the old statement would flip a real credit's status, which then defeated the credit idempotency check).
 */
export async function upsertDeclinedTransaction({
  customerId,
  walletId,
  amount,
  balanceAfter,
  referenceUtr,
  description,
  paymentMethod,
}) {
  const now = new Date();
  for (let attempt = 0; ; attempt++) {
    try {
      await WalletTransaction.updateOne(
        { referenceUtr, status: { $not: SETTLED_STATUS } },
        {
          $set: { status: 'Payment Declined ✕', description },
          $setOnInsert: {
            _id: genId('tx_fail'),
            customerId,
            walletId,
            txType: 'Credit',
            amount,
            balanceAfter,
            paymentMethod,
            currency: 'INR',
            createdAt: now,
          },
        },
        { upsert: true }
      );
      break;
    } catch (err) {
      if (err?.code === 11000 && /referenceUtr/.test(err.message || '')) {
        // Row exists and is not eligible for overwrite (settled), or a concurrent upsert won the race.
        if (attempt < 1) continue;
        break;
      }
      throw err;
    }
  }
  return WalletTransaction.findOne({ referenceUtr }).lean();
}

/** Callback "payment cancelled / failed" row (INSERT ... ON CONFLICT (reference_utr) DO NOTHING). */
export async function insertCallbackFailureRow({ customerId, referenceUtr, description }) {
  await WalletTransaction.updateOne(
    { referenceUtr },
    {
      $setOnInsert: {
        _id: genId('tx_fail'),
        customerId,
        walletId: '',
        txType: 'Credit',
        amount: 0,
        balanceAfter: 0,
        description,
        paymentMethod: 'Razorpay Secure (Failed)',
        status: 'Failed ✕',
        currency: 'INR',
        createdAt: new Date(),
      },
    },
    { upsert: true }
  );
}

/** POST /api/wallets/failed-transaction */
export async function recordFailedTransaction(body = {}) {
  const customerId = scalar(body.customerId);
  const cleanPhone = scalar(body.phone || body.customerId).replace(/\D/g, '').slice(-10);
  const username = scalar(body.username);

  // id OR phone (digits-normalised) OR username (case-insensitive)
  let cust = null;
  if (customerId) cust = await Customer.findById(customerId).lean();
  if (!cust) {
    const pf = phoneDigitsFilter(cleanPhone || '9999999999');
    if (pf) cust = await Customer.findOne({ phone: { $nin: [null, ''] }, ...pf }).lean();
  }
  if (!cust && username) cust = await Customer.findOne({ username: ciExact(username) }).lean();

  if (!cust) {
    const newCustId = customerId || (cleanPhone ? `cust_${cleanPhone}` : `cust_${Date.now()}`);
    const newUsername = username || (cleanPhone ? `user_${cleanPhone}` : `client_${Date.now().toString().slice(-4)}`);
    const newComp = scalar(body.companyName) || scalar(body.company) || 'Client Account';
    const now = new Date();
    cust = await Customer.findOneAndUpdate(
      { _id: newCustId },
      {
        $set: { phone: cleanPhone || '9999999999', updatedAt: now },
        $setOnInsert: {
          username: newUsername,
          companyName: newComp,
          contactPerson: newUsername,
          passwordHash: 'Client@AutoInit2026',
          registeredAt: now,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
  }

  let wallet = await Wallet.findOne({ customerId: cust._id }, { _id: 1, availableBalance: 1 }).lean();
  let walletId = wallet?._id;
  let currentBal = Number(wallet?.availableBalance || 0);
  if (!walletId) {
    const now = new Date();
    for (let attempt = 0; ; attempt++) {
      try {
        wallet = await Wallet.findOneAndUpdate(
          { customerId: cust._id },
          { $setOnInsert: { _id: `wal_${cust._id}`, availableBalance: 0, createdAt: now, updatedAt: now } },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        ).lean();
        break;
      } catch (err) {
        if (err?.code === 11000 && attempt < 2) continue;
        throw err;
      }
    }
    walletId = wallet?._id || `wal_${cust._id}`;
    currentBal = Number(wallet?.availableBalance || 0);
  }

  const cleanAmount = Number(body.amount || 0);
  const utr = (scalar(body.referenceUtr) || `FAIL-${Date.now().toString().slice(-6)}`).trim();
  const reasonText = scalar(body.failureReason) || 'Payment declined by bank or cancelled';
  const txDesc = scalar(body.description) || `Wallet recharge attempt failed: ${reasonText}`;
  const meth = scalar(body.paymentMethod) || 'Razorpay Gateway';

  return upsertDeclinedTransaction({
    customerId: cust._id,
    walletId,
    amount: cleanAmount > 0 ? cleanAmount : 300,
    balanceAfter: currentBal,
    referenceUtr: utr,
    description: txDesc,
    paymentMethod: meth,
  });
}

// ---------------------------------------------------------------------------
// Authoritative atomic, UTR-idempotent wallet credit
// ---------------------------------------------------------------------------
async function creditOnce({ customerId, cleanPhone, username, cleanAmount, utr, paymentMethod, description, currency }) {
  return withMongoTransaction(async (session) => {
    const now = new Date();

    // 1. Resolve customer
    let cust = await findCustomerFlexible({ id: customerId, phone: cleanPhone, username }, { session });

    if (!cust) {
      const fallbackId = customerId || `cust_${cleanPhone || Date.now()}`;
      const lockedCredentialHash = `$2b$12$${randomBytes(32).toString('hex')}!LOCKED`;
      cust = await Customer.findOneAndUpdate(
        { _id: fallbackId },
        {
          $set: { phone: cleanPhone || '9999999999', paymentStatus: 'paid', updatedAt: now },
          $setOnInsert: {
            username: username || cleanPhone || fallbackId,
            contactPerson: `Client ${cleanPhone || fallbackId}`,
            companyName: `Business ${cleanPhone || fallbackId}`,
            email: `${cleanPhone || fallbackId}@client.admafia.marketing`,
            passwordHash: lockedCredentialHash,
            status: 'active',
            currency: currency || 'INR',
            registeredAt: now,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true, session }
      ).lean();
    }

    if (!cust) {
      throw new Error(`Customer account not found for wallet credit (ID: ${customerId || 'N/A'}, Phone: ${cleanPhone || 'N/A'}).`);
    }

    const existingWallet = await Wallet.findOne({ customerId: cust._id }, { currency: 1, availableBalance: 1 })
      .session(session)
      .lean();
    const custCurrency = String(existingWallet?.currency || cust.currency || currency || 'INR').toUpperCase();
    const currencySymbol = currencySymbolOf(custCurrency);

    if (custCurrency === 'INR' && cleanAmount < 300) {
      throw new Error('Minimum wallet top-up amount is ₹300.');
    } else if (custCurrency !== 'INR' && cleanAmount < 10) {
      throw new Error(`Minimum wallet top-up amount is ${currencySymbol}10.`);
    }

    // 2. UTR idempotency
    const existingTx = await WalletTransaction.findOne({ referenceUtr: utr }).session(session).lean();
    if (existingTx && String(existingTx.status).includes('Verified')) {
      return {
        alreadyCredited: true,
        customerId: cust._id,
        walletBalance: Number(existingWallet?.availableBalance || 0),
        transaction: existingTx,
      };
    }

    // 3. Atomic wallet upsert ($inc)
    const defaultDailyMin = custCurrency === 'INR' ? 300 : 10;
    const wallet = await Wallet.findOneAndUpdate(
      { customerId: cust._id },
      {
        $inc: { availableBalance: cleanAmount, totalLifetimePaid: cleanAmount },
        $set: { updatedAt: now },
        $setOnInsert: {
          _id: genId('wal'),
          currency: custCurrency,
          dailyAdSpend: defaultDailyMin,
          totalAdSpent: 0,
          adCampaignActive: false,
          createdAt: now,
        },
      },
      { new: true, upsert: true, session }
    ).lean();
    const newBalance = round2(wallet.availableBalance);
    const walletId = wallet._id;

    // 4. Customer payment status
    await Customer.updateOne({ _id: cust._id }, { $set: { paymentStatus: 'paid', updatedAt: now } }, { session });

    // 5. Ledger transaction ('Verified ✓') - insert or upgrade a previous failed attempt with the same reference
    const txDesc = description || `Growth Wallet Balance Top-Up (${currencySymbol}${cleanAmount.toLocaleString()} Added)`;
    let txDoc;
    if (existingTx) {
      txDoc = await WalletTransaction.findOneAndUpdate(
        { _id: existingTx._id },
        {
          $set: {
            customerId: cust._id,
            walletId,
            txType: 'Credit',
            amount: cleanAmount,
            balanceAfter: newBalance,
            status: 'Verified ✓',
            description: txDesc,
            paymentMethod,
            currency: custCurrency,
          },
        },
        { new: true, session }
      ).lean();
    } else {
      const [created] = await WalletTransaction.create(
        [
          {
            _id: genId('tx'),
            customerId: cust._id,
            walletId,
            txType: 'Credit',
            amount: cleanAmount,
            balanceAfter: newBalance,
            referenceUtr: utr,
            description: txDesc,
            paymentMethod,
            status: 'Verified ✓',
            currency: custCurrency,
            createdAt: now,
          },
        ],
        { session }
      );
      txDoc = created.toObject();
    }

    // 6. Payment record for Sales Desk (/sales#payments)
    const payId = `pay_${Date.now()}_${randomBytes(3).toString('hex')}`;
    const receiptNo = `RCP-${new Date().getFullYear()}-${Date.now()}-${randomBytes(3).toString('hex').toUpperCase()}`;
    const [payDoc] = await PaymentRecord.create(
      [
        {
          _id: payId,
          customerId: cust._id,
          walletId,
          receiptNumber: receiptNo,
          companyName: cust.companyName || '',
          contactPerson: cust.contactPerson || '',
          phone: cust.phone || '',
          city: cust.city || cust.country || 'India',
          txType: 'topup',
          amount: cleanAmount,
          gstAmount: 0,
          totalAmount: cleanAmount,
          paymentMethod,
          gatewayPaymentId: utr,
          referenceUtr: utr,
          status: 'paid',
          notes: `Wallet Top-Up (+${currencySymbol}${cleanAmount.toLocaleString()})`,
          currency: custCurrency,
          createdAt: now,
        },
      ],
      { session }
    );

    // 7. Tax invoice with SAC code breakdown
    const invId = `inv_${Date.now()}_${randomBytes(3).toString('hex')}`;
    const invoiceNo = `INV-${new Date().getFullYear()}-${Date.now()}-${randomBytes(3).toString('hex').toUpperCase()}`;
    const taxRate = custCurrency === 'INR' ? 1.18 : 1.0;
    const baseAmt = Math.round(cleanAmount / taxRate);
    const totalTax = cleanAmount - baseAmt;
    const cgstAmt = Math.round(totalTax / 2);
    const sgstAmt = totalTax - cgstAmt;
    const [invDoc] = await TaxInvoice.create(
      [
        {
          _id: invId,
          customerId: cust._id,
          paymentRecordId: payId,
          invoiceNumber: invoiceNo,
          particulars: 'Lead Generation & Growth Wallet Credit',
          sacCode: '998311',
          baseAmount: baseAmt,
          cgstAmount: cgstAmt,
          sgstAmount: sgstAmt,
          totalAmount: cleanAmount,
          paymentMode: `${paymentMethod} (Ref: ${utr})`,
          status: 'Paid',
          currency: custCurrency,
          invoiceDate: now,
          createdAt: now,
        },
      ],
      { session }
    );

    // 8. Pending verifications (Sales Desk 02)
    await PendingVerification.updateMany(
      { customerId: cust._id },
      [
        {
          $set: {
            amount: cleanAmount,
            utrNumber: utr,
            paymentStatus: 'paid',
            queueType: { $cond: [{ $eq: ['$profileStatus', 'complete'] }, 'Completed', 'Profile Only Incomplete'] },
            verifiedAt: now,
          },
        },
      ],
      { session, updatePipeline: true }
    );

    // 9. Transactional outbox (same transaction)
    await recordMongoOutboxEvent(session, {
      aggregateType: 'wallet',
      aggregateId: walletId,
      eventType: 'WALLET_CREDITED',
      payload: { customerId: cust._id, amount: cleanAmount, balanceAfter: newBalance, referenceUtr: utr },
    });

    return {
      alreadyCredited: false,
      customerId: cust._id,
      walletBalance: newBalance,
      transaction: txDoc,
      paymentRecord: payDoc.toObject(),
      invoice: invDoc.toObject(),
    };
  });
}

/**
 * Credit a wallet exactly once per referenceUtr.
 * Returns plain Mongo documents; the caller maps them to the API response shape.
 */
export async function creditWalletByUtr({
  customerId,
  phone,
  username,
  amount,
  referenceUtr,
  paymentMethod = 'Razorpay Secure (UPI/Card)',
  description,
  currency,
}) {
  const parsed = Number(amount || 0);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('Valid wallet top-up amount is required.');
  }
  const cleanAmount = round2(parsed);
  if (cleanAmount <= 0) throw new Error('Valid wallet top-up amount is required.');

  const cid = scalar(customerId);
  const cleanPhone = scalar(phone || customerId).replace(/\D/g, '').slice(-10);
  const utr = (scalar(referenceUtr) || `rzp_${Date.now()}`).trim();

  const args = {
    customerId: cid,
    cleanPhone,
    username: scalar(username),
    cleanAmount,
    utr,
    paymentMethod: scalar(paymentMethod) || 'Razorpay Secure (UPI/Card)',
    description: scalar(description) || undefined,
    currency: scalar(currency) || undefined,
  };

  // Concurrent first credits / duplicate deliveries race on unique indexes (wallets.customerId, wallet_transactions.referenceUtr).
  // A retry then sees the committed row: either an existing wallet ($inc path) or an already Verified UTR (idempotent return).
  for (let attempt = 0; ; attempt++) {
    try {
      return await creditOnce(args);
    } catch (err) {
      if (err?.code === 11000 && attempt < 3 && /customerId|referenceUtr|_id/.test(`${err.message || ''} ${JSON.stringify(err.keyPattern || {})}`)) {
        continue;
      }
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Refund webhook (refund.processed / refund.created)
// ---------------------------------------------------------------------------
export async function processRazorpayRefund({ refund, payment, refundId, paymentId, refundAmt }) {
  const rid = scalar(refundId);
  const pid = scalar(paymentId);
  const result = await withMongoTransaction(async (session) => {
    const now = new Date();

    if (await WalletTransaction.exists({ referenceUtr: rid }).session(session)) {
      return { status: 'already' };
    }

    const origTx = pid
      ? await WalletTransaction.findOne({ referenceUtr: pid }, { customerId: 1, walletId: 1 }).session(session).lean()
      : null;
    let targetCustId = origTx?.customerId || scalar(payment?.notes?.customer_id) || null;
    const targetWalletId = origTx?.walletId;

    if (!targetCustId && payment?.contact) {
      const cleanP = String(payment.contact).replace(/\D/g, '').slice(-10);
      if (cleanP) {
        const c = await Customer.findOne({ phone: cleanP }, { _id: 1 }).session(session).lean();
        targetCustId = c?._id || null;
      }
    }
    if (!targetCustId) return { status: 'no_customer' };

    // GREATEST(0, balance - refund) as one atomic pipeline update (no read-modify-write)
    const wallet = await Wallet.findOneAndUpdate(
      { customerId: targetCustId },
      [
        {
          $set: {
            availableBalance: { $max: [0, { $subtract: ['$availableBalance', refundAmt] }] },
            totalLifetimePaid: { $max: [0, { $subtract: ['$totalLifetimePaid', refundAmt] }] },
            updatedAt: now,
          },
        },
      ],
      { new: true, session }
    ).lean();
    const updatedBal = Number(wallet?.availableBalance || 0);
    const walId = wallet?._id || targetWalletId || '';

    // ON CONFLICT (reference_utr) DO NOTHING
    await WalletTransaction.updateOne(
      { referenceUtr: rid },
      {
        $setOnInsert: {
          _id: genId('tx_rfnd'),
          customerId: targetCustId,
          walletId: walId,
          txType: 'Debit',
          amount: refundAmt,
          balanceAfter: round2(updatedBal),
          description: `Online refund processed via Razorpay (Ref: ${pid})`,
          paymentMethod: 'Razorpay Online Refund',
          status: 'Refunded ✓',
          currency: wallet?.currency || 'INR',
          createdAt: now,
        },
      },
      { upsert: true, session }
    );

    await RefundRequest.create(
      [
        {
          _id: genId('rfnd_req'),
          customerId: targetCustId,
          walletId: walId,
          originalTxRef: pid,
          amount: refundAmt,
          reason: `Razorpay automated webhook refund (${refund?.notes?.reason || 'Customer requested / Bank reversal'})`,
          status: 'Completed',
          providerRef: rid,
          reviewedBy: 'Razorpay Webhook (Automated)',
          reviewedAt: now,
        },
      ],
      { session }
    );

    if (pid) {
      await PaymentRecord.updateMany(
        { referenceUtr: pid },
        [
          {
            $set: {
              status: 'refunded',
              notes: { $concat: [{ $ifNull: ['$notes', ''] }, ' • Refunded via Razorpay (', { $literal: rid }, ')'] },
            },
          },
        ],
        { session, updatePipeline: true }
      );

      const rx = new RegExp(escapeRegex(pid), 'i');
      await TaxInvoice.updateMany(
        { $or: [{ particulars: rx }, { paymentMode: rx }] },
        { $set: { status: 'Refunded' } },
        { session }
      );
    }

    await recordMongoOutboxEvent(session, {
      aggregateType: 'wallet',
      aggregateId: walId || targetCustId,
      eventType: 'WALLET_DEBITED',
      payload: { customerId: targetCustId, amount: refundAmt, balanceAfter: round2(updatedBal), referenceUtr: rid },
    });

    return { status: 'refunded', customerId: targetCustId };
  });
  return result;
}

// ---------------------------------------------------------------------------
// POST /api/wallets/deduct
// ---------------------------------------------------------------------------
export async function deductWalletForDay({ cust, amount, activeDays, force, manual }) {
  const outcome = await withMongoTransaction(async (session) => {
    const now = new Date();
    let wallet = await Wallet.findOne({ customerId: cust._id }).session(session).lean();
    if (!wallet) {
      throw new Error('Wallet not found');
    }
    const walletCurrency = String(wallet.currency || 'INR').toUpperCase();
    const currencySymbol = walletCurrency === 'USD' ? '$' : '₹';
    const minimumDailySpend = walletCurrency === 'INR' ? 300 : walletCurrency === 'USD' ? 10 : null;
    if (minimumDailySpend === null || String(cust.currency || walletCurrency).toUpperCase() !== walletCurrency) {
      throw new HttpError(409, 'Unsupported or mismatched customer and wallet currency.');
    }
    const requestedSpend =
      amount === undefined || amount === null || amount === ''
        ? Number(wallet.dailyAdSpend || minimumDailySpend)
        : Number(amount);
    if (!Number.isFinite(requestedSpend) || requestedSpend < minimumDailySpend) {
      throw new HttpError(400, `Daily spend minimum is ${walletCurrency === 'INR' ? '₹300' : '$10'}.`);
    }
    const spendAmt = requestedSpend;

    const kolkataNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const todayDayCode = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][kolkataNow.getDay()];
    const kolkataTodayStr = istDateString(now);

    const existingDays = (Array.isArray(wallet.activeDays) ? wallet.activeDays : String(wallet.activeDays || '').split(','))
      .map((d) => String(d).trim())
      .filter(Boolean);
    const baseDays = Array.isArray(activeDays) && activeDays.length > 0 ? activeDays : existingDays.length ? existingDays : [todayDayCode];
    const daySet = new Set(baseDays.map((d) => String(d).trim().toUpperCase()).filter(Boolean));
    daySet.add(todayDayCode);
    const finalDays = Array.from(daySet);
    const skipDailyGuard = Boolean(force || manual);

    // Idempotent "already booked today" branch: refresh settings only, never touch the balance
    const settleIdempotent = async (w) => {
      await Wallet.updateOne(
        { _id: w._id },
        {
          $set: { dailyAdSpend: spendAmt, adCampaignActive: true, activeDays: finalDays, updatedAt: now },
          $addToSet: { bookedDates: kolkataTodayStr },
        },
        { session }
      );
      const bal = Number(w.availableBalance || 0);
      return {
        alreadyDeducted: true,
        balance: bal,
        walletBalance: bal,
        deducted: 0,
        dailyAdSpend: spendAmt,
        activeDays: finalDays,
        isDeductedToday: true,
        lastDeductedAt: w.lastDeductedAt,
        message: "Today's daily delivery budget is already booked and running. No duplicate deduction made.",
      };
    };

    if (isDeductedToday(wallet.lastDeductedAt, now) && !skipDailyGuard) {
      return { result: await settleIdempotent(wallet) };
    }

    const insufficient = (w) =>
      new HttpError(
        400,
        `Insufficient wallet balance (${currencySymbol}${Number(w.availableBalance || 0)}) for ${currencySymbol}${spendAmt} daily delivery budget.`
      );

    if (Number(wallet.availableBalance || 0) < spendAmt) throw insufficient(wallet);

    // Atomic conditional deduction: sufficient balance AND (unless forced) not yet settled for today's IST day
    const filter = { _id: wallet._id, availableBalance: { $gte: spendAmt } };
    if (!skipDailyGuard) {
      filter.$or = [{ lastDeductedAt: null }, { lastDeductedAt: { $lt: istDayStart(now) } }];
    }
    const updated = await Wallet.findOneAndUpdate(
      filter,
      {
        $inc: { availableBalance: -spendAmt, totalAdSpent: spendAmt },
        $set: {
          dailyAdSpend: spendAmt,
          adCampaignActive: true,
          activeDays: finalDays,
          lastDeductedAt: now,
          updatedAt: now,
        },
        $addToSet: { bookedDates: kolkataTodayStr },
      },
      { new: true, session }
    ).lean();

    if (!updated) {
      wallet = await Wallet.findById(wallet._id).session(session).lean();
      if (!wallet) throw new Error('Wallet not found');
      if (isDeductedToday(wallet.lastDeductedAt, now) && !skipDailyGuard) {
        return { result: await settleIdempotent(wallet) };
      }
      throw insufficient(wallet);
    }

    const nextBal = round2(updated.availableBalance);
    const [txDoc] = await WalletTransaction.create(
      [
        {
          _id: genId('tx_deb'),
          customerId: cust._id,
          walletId: wallet._id,
          txType: 'Debit',
          amount: spendAmt,
          balanceAfter: nextBal,
          referenceUtr: `AUTO-AD-${Date.now()}-${randomBytes(2).toString('hex')}`,
          description: `Daily Lead Delivery Service Pacing (-${currencySymbol}${spendAmt}/day)`,
          paymentMethod: 'Daily Auto-Debit',
          status: 'Settled ✓',
          currency: walletCurrency,
          createdAt: now,
        },
      ],
      { session }
    );

    await recordMongoOutboxEvent(session, {
      aggregateType: 'wallet',
      aggregateId: wallet._id,
      eventType: 'WALLET_DEBITED',
      payload: { customerId: cust._id, amount: spendAmt, balanceAfter: nextBal },
    });

    return {
      result: {
        alreadyDeducted: false,
        balance: nextBal,
        walletBalance: nextBal,
        deducted: spendAmt,
        dailyAdSpend: spendAmt,
        activeDays: finalDays,
        isDeductedToday: true,
      },
      txDoc: txDoc.toObject(),
      spendAmt,
    };
  });

  // Activate or update marketing campaigns if existing (non-critical; the old SQL swallowed errors too)
  if (outcome.txDoc) {
    try {
      const now = new Date();
      await MarketingCampaign.updateMany(
        { customerId: cust._id },
        {
          $set: {
            status: 'Running',
            externalPlatformStatus: 'Active',
            dailyBudget: outcome.spendAmt,
            lastAction: 'Campaign Live: Daily Spend Deducted',
            lastActor: 'Customer Self-Service Portal',
            lastActionAt: now,
            updatedAt: now,
          },
        }
      );
    } catch (err) {
      console.warn('[wallets/deduct] campaign activation skipped:', err.message);
    }
  }
  return outcome;
}
