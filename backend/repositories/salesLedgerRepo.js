import { randomBytes } from 'crypto';
import {
  Customer,
  CustomerGroup,
  SystemUser,
  Wallet,
  WalletTransaction,
  PaymentRecord,
  TaxInvoice,
  RefundRequest,
  TopupRequest,
  DeletedFailedTransaction,
  Lead,
  LeadAssignment,
  SalesTask,
  SupportQuery,
  PendingVerification,
  MarketingPost,
  MarketingIdea,
  MarketingCampaign,
  MarketingAuditEvent,
} from '../models/index.js';
import { withMongoTransaction, genId } from './tx.js';
import { recordOutboxEvent } from '../services/outboxWorker.js';
import { evaluateCustomerProfileCompletion } from '../utils/profileCompletion.js';
import {
  getCustomerViewRows,
  makeCustomerMatcher,
  paymentToRow,
  walletTxToRow,
  deletedFailedTxToRow,
  last10Digits,
} from './salesViewRepo.js';

/**
 * Mongo data access for the Sales Desk ledger endpoints (wallet top-up, transaction logs,
 * balance logs, failed transactions, customer profile/update/delete).
 * Read helpers return the legacy snake_case "row" shape the server.js mappers consume.
 */

const num = (v, d = 0) => (v === undefined || v === null || Number.isNaN(Number(v)) ? d : Number(v));
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// ---------------------------------------------------------------------------
// Failed-transaction filter (legacy SQL: status/tx_type/description/payment_method/utr patterns)
// Every pattern is a fixed literal; no user input is interpolated.
// ---------------------------------------------------------------------------
export const SALES_FAILED_TX_FILTER = {
  $or: [
    { status: /fail|declin|cancel|dismiss|reject/i },
    { txType: /fail/i },
    { description: /fail|declin|dismiss|cancel|reject/i },
    { paymentMethod: /fail/i },
    { referenceUtr: /^DISMISS-/ },
    { referenceUtr: /^FAIL-/ },
  ],
};
export const DISMISSED_TX_FILTER = { referenceUtr: /^DISMISS-/ };

const PAID_STATUS_RE = /^(paid|settled|verified)$/i;
const CREDIT_OK_STATUS_RE = /^(verified|settled|verified ✓|settled ✓|paid)$/i;

/** Scalar-only coercion so request bodies can never inject Mongo operators into a filter. */
export function asScalarString(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

// ---------------------------------------------------------------------------
// GET /api/sales/transactions
// ---------------------------------------------------------------------------
function paymentJoinRow(p, cust) {
  return {
    ...paymentToRow(p, cust),
    cust_phone: cust?.phone,
    cust_email: cust?.email,
    cust_city: cust?.city,
    cust_state: cust?.state,
    cust_category: cust?.category,
  };
}

function indexPayments(payments) {
  const byUtr = new Map();
  const byReceipt = new Map();
  const byId = new Map();
  for (const p of payments) {
    if (p.referenceUtr && !byUtr.has(p.referenceUtr)) byUtr.set(p.referenceUtr, p);
    if (p.receiptNumber && !byReceipt.has(p.receiptNumber)) byReceipt.set(p.receiptNumber, p);
    byId.set(p._id, p);
  }
  return (t) => byUtr.get(t.referenceUtr) || byReceipt.get(t.referenceUtr) || byId.get(t._id) || null;
}

export async function loadTransactionRows() {
  const [txs, payments, customerRows, customers] = await Promise.all([
    WalletTransaction.find({}).sort({ createdAt: -1 }).lean(),
    PaymentRecord.find({}).sort({ createdAt: -1 }).lean(),
    getCustomerViewRows({}),
    Customer.find({}).select('_id username companyName contactPerson phone email city state category').lean(),
  ]);
  const match = makeCustomerMatcher(customers);
  const findPayment = indexPayments(payments);

  const wtRows = txs.map((t) => {
    const c = match(t.customerId, null);
    const pr = findPayment(t);
    return {
      ...walletTxToRow(t),
      username: c?.username,
      company_name: c?.companyName,
      contact_person: c?.contactPerson,
      phone: c?.phone,
      email: c?.email,
      city: c?.city,
      state: c?.state,
      category: c?.category,
      receipt_number: pr?.receiptNumber,
      payment_paid_at: pr?.createdAt,
      pr_payment_mode: pr?.paymentMethod,
    };
  });
  const prRows = payments.map((p) => paymentJoinRow(p, match(p.customerId, p.phone)));
  return { wtRows, prRows, customerRows };
}

// ---------------------------------------------------------------------------
// GET /api/sales/balance-logs
// ---------------------------------------------------------------------------
export async function loadBalanceLogRows() {
  const [txs, payments, customerRows, customers, wallets] = await Promise.all([
    WalletTransaction.find({ status: { $type: 'string', $not: /fail|declin|cancel|dismiss|reject/i } }).sort({ createdAt: -1 }).lean(),
    PaymentRecord.find({ status: PAID_STATUS_RE }).sort({ createdAt: -1 }).lean(),
    getCustomerViewRows({}),
    Customer.find({}).select('_id username companyName contactPerson phone email city state category').lean(),
    Wallet.find({}).lean(),
  ]);
  const match = makeCustomerMatcher(customers);
  const walletByCust = new Map(wallets.map((w) => [w.customerId, w]));

  const wtRows = txs.map((t) => {
    const c = match(t.customerId, null);
    const w = walletByCust.get(t.customerId) || (c ? walletByCust.get(c._id) : undefined);
    return {
      ...walletTxToRow(t),
      username: c?.username,
      company_name: c?.companyName,
      contact_person: c?.contactPerson,
      phone: c?.phone,
      email: c?.email,
      city: c?.city,
      state: c?.state,
      category: c?.category,
      current_wallet_balance: w ? w.availableBalance : null,
      daily_ad_spend: w ? w.dailyAdSpend : null,
      total_lifetime_paid: w ? w.totalLifetimePaid : null,
    };
  });
  const prRows = payments.map((p) => paymentJoinRow(p, match(p.customerId, p.phone)));
  const walletRows = wallets.map((w) => ({
    id: w._id,
    customer_id: w.customerId,
    available_balance: w.availableBalance,
  }));
  return { wtRows, prRows, customerRows, walletRows };
}

// ---------------------------------------------------------------------------
// GET /api/sales/failed-transactions
// ---------------------------------------------------------------------------
export async function loadFailedTransactionData() {
  const [deleted, failedTxs, customers, wallets, creditCustIds, paidPayments] = await Promise.all([
    DeletedFailedTransaction.find({}).sort({ deletedAt: -1 }).lean().catch(() => []),
    WalletTransaction.find(SALES_FAILED_TX_FILTER).sort({ createdAt: -1 }).lean(),
    Customer.find({}).sort({ registeredAt: -1 }).lean(),
    Wallet.find({}).select('customerId availableBalance dailyAdSpend').lean(),
    WalletTransaction.distinct('customerId', { txType: 'Credit', status: CREDIT_OK_STATUS_RE }),
    PaymentRecord.find({ status: PAID_STATUS_RE }).select('customerId phone').lean(),
  ]);

  const deletedRows = deleted.map(deletedFailedTxToRow);

  const match = makeCustomerMatcher(customers);
  const failedRows = failedTxs.map((t) => {
    const c = match(t.customerId, null);
    return {
      id: t._id,
      customer_id: t.customerId,
      amount: t.amount,
      reference_utr: t.referenceUtr,
      description: t.description,
      payment_method: t.paymentMethod,
      status: t.status,
      created_at: t.createdAt,
      matched_cust_id: c?._id,
      username: c?.username,
      company_name: c?.companyName,
      contact_person: c?.contactPerson,
      phone: c?.phone,
      email: c?.email,
      city: c?.city,
      state: c?.state,
      country: c?.country,
      category: c?.category,
    };
  });

  // Registered customers whose onboarding checkout never completed
  const walletByCust = new Map(wallets.map((w) => [w.customerId, w]));
  const paidCustIds = new Set(paidPayments.map((p) => p.customerId));
  const paidPhones = new Set(paidPayments.map((p) => p.phone).filter(Boolean));
  const creditIds = new Set(creditCustIds);
  const UNPAID = new Set(['pending', 'failed', 'declined', 'unpaid', 'awaiting']);

  const unpaidRows = [];
  for (const c of customers) {
    const w = walletByCust.get(c._id);
    const balance = num(w?.availableBalance, 0);
    const payStatus = String(c.paymentStatus || 'pending').toLowerCase();
    if (!(UNPAID.has(payStatus) || balance === 0)) continue;
    const phone10 = last10Digits(c.phone);
    if (paidCustIds.has(c._id) || (phone10 && paidPhones.has(phone10))) continue;
    if (creditIds.has(c._id) || (c.phone && creditIds.has(c.phone))) continue;
    unpaidRows.push({
      id: c._id,
      username: c.username,
      company_name: c.companyName,
      contact_person: c.contactPerson,
      phone: c.phone,
      email: c.email,
      city: c.city,
      state: c.state,
      country: c.country,
      category: c.category,
      registered_at: c.registeredAt,
      payment_status: c.paymentStatus,
      balance,
      daily_pacing: num(w?.dailyAdSpend, 300),
    });
  }
  return { deletedRows, failedRows, unpaidRows };
}

// ---------------------------------------------------------------------------
// Failed transactions: archive + delete
// ---------------------------------------------------------------------------
async function customersForTxs(txs) {
  const ids = new Set();
  const phones = new Set();
  for (const t of txs) {
    if (!t.customerId) continue;
    ids.add(t.customerId);
    phones.add(t.customerId);
    const l10 = last10Digits(t.customerId);
    if (l10) phones.add(l10);
  }
  if (ids.size === 0) return [];
  return Customer.find({ $or: [{ _id: { $in: [...ids] } }, { phone: { $in: [...phones] } }] }).lean();
}

/** Copy failed wallet transactions (and/or a client-provided snapshot) into deleted_failed_transactions. Non-fatal. */
export async function archiveFailedTransactions({ filter = null, txSnapshot = null, deletedBy = 'Sales Admin' } = {}) {
  try {
    if (txSnapshot && typeof txSnapshot === 'object') {
      const s = txSnapshot;
      const cleanPhone = String(s.phone || s.customerId || '').replace(/\D/g, '').slice(-10);
      const properContact = String(s.contactPerson || s.contact || '').trim() || (cleanPhone ? `Customer ${cleanPhone.slice(-4)}` : 'Client Admin');
      const properCompany = String(s.companyName || s.customerName || s.company || '').trim() || properContact;
      const delId = `del_${s.id || s.ref || Date.now()}_${Math.floor(100 + Math.random() * 900)}`;
      const now = new Date();
      await DeletedFailedTransaction.updateOne(
        { _id: delId },
        {
          $setOnInsert: {
            originalId: s.id || s.ref,
            customerId: s.customerId || null,
            customerName: properCompany,
            companyName: properCompany,
            contactPerson: properContact,
            phone: cleanPhone,
            email: s.email || '',
            city: s.city || '',
            state: s.state || '',
            category: s.category || '',
            amount: Number(s.amount || 0),
            referenceUtr: String(s.ref || s.id || ''),
            description: s.desc || 'Failed wallet recharge',
            paymentMethod: s.method || 'Razorpay Secure',
            failureReason: s.failureReason || s.desc || 'Bank transaction declined',
            originalCreatedAt: now,
            deletedAt: now,
            deletedBy,
          },
        },
        { upsert: true }
      );
    }

    if (filter) {
      const recs = await WalletTransaction.find(filter).lean();
      const customers = await customersForTxs(recs);
      const match = makeCustomerMatcher(customers);
      for (const r of recs) {
        const c = match(r.customerId, null);
        const delId = `del_${r._id || Date.now()}_${Math.floor(100 + Math.random() * 900)}`;
        const cleanPhone = String(c?.phone || r.customerId || '').replace(/\D/g, '').slice(-10);
        const properContact = String(c?.contactPerson || '').trim() || (cleanPhone ? `Customer ${cleanPhone.slice(-4)}` : 'Client Admin');
        const properCompany = String(c?.companyName || '').trim() || properContact;
        await DeletedFailedTransaction.updateOne(
          { _id: delId },
          {
            $setOnInsert: {
              originalId: r._id,
              customerId: r.customerId,
              customerName: properCompany,
              companyName: properCompany,
              contactPerson: properContact,
              phone: cleanPhone,
              email: c?.email || '',
              city: c?.city || '',
              state: c?.state || '',
              category: c?.category || '',
              amount: Number(r.amount || 0),
              referenceUtr: r.referenceUtr,
              description: r.description || '',
              paymentMethod: r.paymentMethod || 'Razorpay Secure',
              failureReason: r.description || 'Payment declined by bank',
              originalCreatedAt: r.createdAt || new Date(),
              deletedAt: new Date(),
              deletedBy,
            },
          },
          { upsert: true }
        );
      }
    }
  } catch (err) {
    console.warn('[archiveFailedTransactions non-fatal]', err.message);
  }
}

/** Delete wallet transactions matching a Mongo filter; returns the deleted count (legacy `rowCount`). */
export async function deleteWalletTransactions(filter) {
  const r = await WalletTransaction.deleteMany(filter);
  return r.deletedCount || 0;
}

export const txIdOrUtrFilter = (rawId) => ({ $or: [{ _id: rawId }, { referenceUtr: rawId }] });
export const txIdsOrUtrsFilter = (ids) => ({ $or: [{ _id: { $in: ids } }, { referenceUtr: { $in: ids } }] });
export const deletedHistoryFilter = (rawId) => ({ $or: [{ _id: rawId }, { originalId: rawId }, { referenceUtr: rawId }] });

export async function listDeletedFailedTransactionRows() {
  const docs = await DeletedFailedTransaction.find({}).sort({ deletedAt: -1 }).lean();
  return docs.map(deletedFailedTxToRow);
}

/** Restore a deleted failed transaction back to the active ledger. Returns true if something was restored. */
export async function restoreDeletedFailedTransaction(id) {
  return withMongoTransaction(async (session) => {
    const row = await DeletedFailedTransaction.findOne(deletedHistoryFilter(id)).session(session || null).lean();
    if (!row) return false;
    const targetCustId = row.customerId || row.phone || 'cust_restored';
    const utr = row.referenceUtr || `RESTORE-${Date.now()}`;
    const amount = Number(row.amount || 0);
    await WalletTransaction.updateOne(
      { referenceUtr: utr },
      {
        $set: { status: 'Payment Declined ✕' },
        $setOnInsert: {
          _id: row.originalId || `wt_res_${Date.now()}`,
          customerId: targetCustId,
          txType: 'Credit',
          amount,
          balanceAfter: 0,
          description: row.description || 'Restored failed payment attempt',
          paymentMethod: row.paymentMethod || 'Razorpay Secure (Failed)',
          currency: 'INR',
          createdAt: row.originalCreatedAt || new Date(),
        },
      },
      { upsert: true, session }
    );
    await DeletedFailedTransaction.deleteOne({ _id: row._id }, { session });
    return true;
  });
}

// ---------------------------------------------------------------------------
// POST /api/sales/wallet/topup
// ---------------------------------------------------------------------------
export function findTopupCustomerFilter(customerId, cleanPhone) {
  const or = [{ _id: String(customerId || '') }];
  if (cleanPhone) or.push({ phone: cleanPhone });
  const last10 = cleanPhone.replace(/\D/g, '').slice(-10);
  if (last10 && last10 !== cleanPhone) or.push({ phone: last10 });
  return { $or: or };
}

export class DuplicateUtrError extends Error {
  constructor(utr) {
    super(`Duplicate Reference: Payment UTR "${utr}" has already been credited in the ledger.`);
    this.code = 'DUPLICATE_UTR';
    this.utr = utr;
  }
}

export async function utrAlreadyCredited(utr) {
  return Boolean(await WalletTransaction.exists({ referenceUtr: utr }));
}

/**
 * Atomically credit a wallet from the Sales Desk and write all ledger rows in one transaction:
 * wallet ($inc upsert), customer/pending_verification status, wallet_transactions, topup_requests, payment_records.
 */
export async function creditSalesTopup({
  customer,
  creditAmount,
  cleanUtr,
  paymentMethod,
  salesPersonName,
  notes,
}) {
  const targetCustId = customer._id;
  const custCurrency = customer.currency || 'INR';
  const isUsd = custCurrency === 'USD';
  const defaultDailySpend = isUsd ? 10 : 300;
  const salesLabel = salesPersonName ? `${salesPersonName} (Sales Team)` : 'Sales Desk';
  const cleanNotes = typeof notes === 'string' ? notes : notes ? String(notes) : '';
  const txDesc = `Growth Wallet Top-Up by Sales (${salesLabel})${cleanNotes ? ` - ${cleanNotes.trim()}` : ''}`;
  const cleanMethod = `Sales Deposit (${paymentMethod})`;

  const runOnce = () =>
    withMongoTransaction(async (session) => {
      const now = new Date();
      const wallet = await Wallet.findOneAndUpdate(
        { customerId: targetCustId },
        {
          $inc: { availableBalance: creditAmount, totalLifetimePaid: creditAmount },
          $set: { updatedAt: now },
          $setOnInsert: {
            _id: genId('wal'),
            currency: custCurrency,
            dailyAdSpend: defaultDailySpend,
            totalAdSpent: 0,
            adCampaignActive: false,
            createdAt: now,
          },
        },
        { new: true, upsert: true, session }
      );

      const newBalance = round2(wallet.availableBalance);
      const oldBalance = round2(newBalance - creditAmount);

      await Customer.updateOne({ _id: targetCustId }, { $set: { paymentStatus: 'paid', updatedAt: now } }, { session });
      await PendingVerification.updateMany(
        { customerId: targetCustId },
        { $set: { paymentStatus: 'paid', queueType: 'Completed', verifiedAt: now } },
        { session }
      );

      const txId = `tx_sales_${Date.now()}_${randomBytes(3).toString('hex')}`;
      try {
        await new WalletTransaction({
          _id: txId,
          customerId: targetCustId,
          walletId: wallet._id,
          txType: 'Credit',
          amount: creditAmount,
          balanceAfter: newBalance,
          referenceUtr: cleanUtr,
          description: txDesc,
          paymentMethod: cleanMethod,
          status: 'Verified ✓',
          currency: custCurrency,
          createdAt: now,
        }).save({ session });
      } catch (err) {
        if (err?.code === 11000 && (err.keyPattern?.referenceUtr || /referenceUtr/.test(err.message || ''))) {
          throw new DuplicateUtrError(cleanUtr);
        }
        throw err;
      }

      // Super Admin top-ups queue / verified history (idempotent on referenceUtr, like ON CONFLICT DO NOTHING)
      await TopupRequest.updateOne(
        { referenceUtr: cleanUtr },
        {
          $setOnInsert: {
            _id: `tp_sales_${Date.now()}_${randomBytes(3).toString('hex')}`,
            customerId: targetCustId,
            walletId: wallet._id,
            amount: creditAmount,
            paymentMethod: cleanMethod,
            notes: cleanNotes ? `Sales Top-Up: ${cleanNotes.trim()}` : `Manual Top-Up credited via Sales Desk by ${salesLabel}`,
            status: 'Approved',
            processedBy: salesLabel,
            processedAt: now,
            createdAt: now,
          },
        },
        { upsert: true, session }
      );

      const receiptNo = `REC_${Date.now()}_${randomBytes(2).toString('hex').toUpperCase()}`;
      await new PaymentRecord({
        _id: `pay_${Date.now()}_${randomBytes(3).toString('hex')}`,
        customerId: targetCustId,
        walletId: wallet._id,
        receiptNumber: receiptNo,
        companyName: customer.companyName || '',
        contactPerson: customer.contactPerson || '',
        phone: customer.phone || '',
        txType: 'topup',
        amount: creditAmount,
        gstAmount: 0,
        totalAmount: creditAmount,
        paymentMethod: cleanMethod,
        referenceUtr: cleanUtr,
        status: 'paid',
        currency: custCurrency,
        createdAt: now,
      }).save({ session });

      await recordOutboxEvent(session, {
        aggregateType: 'wallet',
        aggregateId: wallet._id,
        eventType: 'WALLET_CREDITED',
        payload: {
          customerId: targetCustId,
          companyName: customer.companyName || '',
          amount: creditAmount,
          balanceAfter: newBalance,
          currency: custCurrency,
          referenceUtr: cleanUtr,
        },
      });

      return { walletId: wallet._id, newBalance, oldBalance, receiptNo };
    });

  // A concurrent first top-up for the same customer can race on the unique wallets.customerId index.
  for (let attempt = 0; ; attempt++) {
    try {
      return await runOnce();
    } catch (err) {
      const walletRace = err?.code === 11000 && (err.keyPattern?.customerId || /customerId/.test(err.message || '')) && !err.keyPattern?.referenceUtr;
      if (walletRace && attempt < 2) continue;
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Customer profile / update / delete
// ---------------------------------------------------------------------------
export async function findCustomerByIdOrPhone(rawId, cleanPhone, { lean = true } = {}) {
  const or = [{ _id: String(rawId) }];
  if (cleanPhone) or.push({ phone: cleanPhone });
  const q = Customer.findOne({ $or: or });
  return lean ? q.lean() : q;
}

export async function applyCustomerProfile(custId, cust, { orgName, category, industry, website, personName, email, personalEmail, city, state, country }) {
  const now = new Date();
  const evalProf = evaluateCustomerProfileCompletion({
    phone: cust.phone,
    contactPerson: personName,
    companyName: orgName,
    email,
    category,
    industry,
    city,
    state,
    registeredAt: cust.registeredAt,
    completedAt: new Date(now.getTime() + 10_000),
  });
  await Customer.updateOne(
    { _id: custId },
    {
      $set: {
        companyName: orgName,
        category: evalProf.sanitized.category,
        industry: evalProf.sanitized.industry,
        website,
        contactPerson: personName,
        email,
        personalEmail,
        city: evalProf.sanitized.city,
        state: evalProf.sanitized.state,
        country,
        profileStatus: evalProf.profileStatus,
        kycPercent: evalProf.kycPercent,
        verified: evalProf.isComplete,
        completedAt: evalProf.isComplete ? (cust.completedAt || now) : null,
        updatedAt: now,
      },
    },
    { runValidators: true }
  );
  await PendingVerification.updateMany({ customerId: custId }, [
    {
      $set: {
        companyName: orgName,
        contactPerson: personName,
        profileStatus: evalProf.profileStatus,
        queueType: {
          $cond: [
            { $eq: [evalProf.profileStatus, 'complete'] },
            { $cond: [{ $in: ['$paymentStatus', ['paid', 'verified']] }, 'Completed', 'Payment Pending'] },
            { $cond: [{ $in: ['$paymentStatus', ['paid', 'verified']] }, 'Profile Only Incomplete', 'Profile Incomplete'] },
          ],
        },
      },
    },
  ], { updatePipeline: true });
}

export async function applyCustomerRecordUpdate(
  custId,
  {
    company,
    contactPerson,
    email,
    personalEmail,
    category,
    industry,
    city,
    state,
    country,
    website,
    status,
    profile,
    payment,
    kyc,
    verified,
    completedAt,
    password,
  }
) {
  const now = new Date();
  const $set = {
    companyName: company,
    website,
    status,
    profileStatus: profile,
    paymentStatus: payment,
    kycPercent: kyc,
    verified,
    passwordHash: password,
    updatedAt: now,
  };
  if (contactPerson !== undefined) $set.contactPerson = contactPerson;
  if (email !== undefined) $set.email = email;
  if (personalEmail !== undefined) $set.personalEmail = personalEmail;
  if (category !== undefined) $set.category = category;
  if (industry !== undefined) $set.industry = industry;
  if (city !== undefined) $set.city = city;
  if (state !== undefined) $set.state = state;
  if (country !== undefined) $set.country = country;
  if (completedAt !== undefined) $set.completedAt = completedAt;

  await Customer.updateOne(
    { _id: custId },
    { $set },
    { runValidators: true }
  );
  if (profile !== undefined) {
    await PendingVerification.updateMany(
      { customerId: custId },
      [
        {
          $set: {
            ...(company ? { companyName: company } : {}),
            ...(contactPerson ? { contactPerson } : {}),
            profileStatus: profile,
            queueType: {
              $cond: [
                { $eq: [profile, 'complete'] },
                { $cond: [{ $in: ['$paymentStatus', ['paid', 'verified']] }, 'Completed', 'Payment Pending'] },
                { $cond: [{ $in: ['$paymentStatus', ['paid', 'verified']] }, 'Profile Only Incomplete', 'Profile Incomplete'] },
              ],
            },
          },
        },
      ],
      { updatePipeline: true }
    ).catch(() => {});
  }
}

/** Wallet settings update (daily spend, campaign flag, schedule, explicit admin balance override). */
export async function applyWalletSettings(customerId, { dailyAdSpend, adCampaignActive, activeDays, schedulePreset, balance }) {
  const $set = { dailyAdSpend, adCampaignActive, activeDays, schedulePreset, updatedAt: new Date() };
  // Only an explicit admin balance override touches availableBalance; otherwise we never write it
  // back, so a concurrent top-up/deduction can never be clobbered by a stale read.
  if (balance !== undefined) $set.availableBalance = balance;
  await Wallet.updateOne({ customerId }, { $set }, { runValidators: true });
}

const cascadeCustomerData = async (customerId, session) => {
  const opts = { session };
  await MarketingAuditEvent.deleteMany({ customerId }, opts);
  await MarketingCampaign.deleteMany({ customerId }, opts);
  await MarketingPost.deleteMany({ customerId }, opts);
  await MarketingIdea.deleteMany({ customerId }, opts);
  await PendingVerification.deleteMany({ customerId }, opts);
  await WalletTransaction.deleteMany({ customerId }, opts);
  await PaymentRecord.deleteMany({ customerId }, opts);
  await TaxInvoice.deleteMany({ customerId }, opts);
  await LeadAssignment.deleteMany({ customerId }, opts);
  await Lead.deleteMany({ customerId }, opts); // lead follow-ups are embedded
  await SupportQuery.deleteMany({ customerId }, opts); // support messages are embedded
  await SalesTask.deleteMany({ customerId }, opts);
  await RefundRequest.deleteMany({ customerId }, opts);
  await TopupRequest.deleteMany({ customerId }, opts);
  await CustomerGroup.updateMany({ members: customerId }, { $pull: { members: customerId } }, opts);
  await SystemUser.updateMany({ customerId }, { $set: { customerId: null } }, opts); // ON DELETE SET NULL
  await Wallet.deleteMany({ customerId }, opts);
};

/** Delete a customer and everything that cascaded from it in the SQL schema. */
export async function deleteCustomerCascade(custId, custPhone) {
  await withMongoTransaction(async (session) => {
    await cascadeCustomerData(custId, session);
    if (custPhone) {
      const altId = `cust_reg_${custPhone}`;
      if (altId !== custId) {
        await cascadeCustomerData(altId, session);
        await Customer.deleteOne({ _id: altId }, { session });
      }
    }
    await Customer.deleteOne({ _id: custId }, { session });
  });
}
