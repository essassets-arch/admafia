import mongoose from 'mongoose';
import {
  Customer,
  Wallet,
  WalletTransaction,
  PaymentRecord,
  TaxInvoice,
  MasterLead,
  Lead,
  LeadAssignment,
  SystemUser,
  MarketingCampaign,
  CountryPricing,
} from '../models/index.js';
import { recordMongoOutboxEvent } from '../services/mongoOutbox.js';

/**
 * MongoDB Data Access & Repository Layer
 * Replaces PostgreSQL SQL queries with native Mongoose operations, aggregations & sessions.
 */

// 1. AUTHENTICATION & CUSTOMER RETRIEVAL
export async function findCustomerByLogin(identifier) {
  const q = String(identifier || '').trim().toLowerCase();
  const cleanPhone = q.replace(/\D/g, '').slice(-10);

  const query = {
    $or: [
      { username: new RegExp(`^${q}$`, 'i') },
      { email: new RegExp(`^${q}$`, 'i') },
      ...(cleanPhone.length === 10 ? [{ phone: cleanPhone }] : [])
    ]
  };

  return await Customer.findOne(query).lean();
}

export async function findSystemUserByLogin(identifier) {
  const q = String(identifier || '').trim().toLowerCase();
  const cleanPhone = q.replace(/\D/g, '').slice(-10);

  const query = {
    $or: [
      { username: new RegExp(`^${q}$`, 'i') },
      { email: new RegExp(`^${q}$`, 'i') },
      ...(cleanPhone.length === 10 ? [{ phone: cleanPhone }] : [])
    ]
  };

  return await SystemUser.findOne(query).lean();
}

// 2. AGGREGATED CUSTOMER WORKSPACE VIEW (Replaces vw_sales_customer_accounts)
export async function getCustomerWorkspaceView(customerId) {
  const pipeline = [
    { $match: { _id: customerId } },
    {
      $lookup: {
        from: 'wallets',
        localField: '_id',
        foreignField: 'customerId',
        as: 'wallet'
      }
    },
    { $unwind: { path: '$wallet', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'leads',
        localField: '_id',
        foreignField: 'customerId',
        as: 'leads'
      }
    },
    {
      $project: {
        id: '$_id',
        username: '$username',
        companyName: '$companyName',
        contactPerson: '$contactPerson',
        phone: '$phone',
        email: '$email',
        personalEmail: '$personalEmail',
        category: '$category',
        industry: '$industry',
        website: '$website',
        city: '$city',
        state: '$state',
        country: '$country',
        countryCode: '$countryCode',
        currency: { $ifNull: ['$wallet.currency', '$currency'] },
        status: '$status',
        profileStatus: '$profileStatus',
        paymentStatus: '$paymentStatus',
        kycPercent: '$kycPercent',
        verified: '$verified',
        registeredAt: '$registeredAt',
        completedAt: '$completedAt',
        balance: { $ifNull: ['$wallet.availableBalance', 0] },
        walletBalance: { $ifNull: ['$wallet.availableBalance', 0] },
        dailyPacing: { $ifNull: ['$wallet.dailyAdSpend', 300] },
        amountPaid: { $ifNull: ['$wallet.totalLifetimePaid', 0] },
        totalAdSpent: { $ifNull: ['$wallet.totalAdSpent', 0] },
        adCampaignActive: { $ifNull: ['$wallet.adCampaignActive', false] },
        activeDays: { $ifNull: ['$wallet.activeDays', []] },
        schedulePreset: { $ifNull: ['$wallet.schedulePreset', 'custom'] },
        lastDeductedAt: '$wallet.lastDeductedAt',
        runwayDays: {
          $floor: {
            $divide: [
              { $ifNull: ['$wallet.availableBalance', 0] },
              { $max: [{ $ifNull: ['$wallet.dailyAdSpend', 300] }, 1] }
            ]
          }
        },
        totalLeadsDispatched: { $size: '$leads' }
      }
    }
  ];

  const results = await Customer.aggregate(pipeline);
  return results[0] || null;
}

// 3. FULL REPLACER FOR Sales Desk 01 Customer Accounts List
export async function listSalesCustomerAccounts(filters = {}) {
  const match = {};
  if (filters.status && filters.status !== 'all') {
    match.status = filters.status;
  }
  if (filters.search) {
    const s = new RegExp(filters.search, 'i');
    match.$or = [
      { companyName: s },
      { contactPerson: s },
      { phone: s },
      { username: s },
      { email: s }
    ];
  }

  const pipeline = [
    { $match: match },
    {
      $lookup: {
        from: 'wallets',
        localField: '_id',
        foreignField: 'customerId',
        as: 'wallet'
      }
    },
    { $unwind: { path: '$wallet', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'leads',
        localField: '_id',
        foreignField: 'customerId',
        as: 'leads'
      }
    },
    {
      $project: {
        id: '$_id',
        username: '$username',
        name: '$companyName',
        companyName: '$companyName',
        contact: '$contactPerson',
        contactPerson: '$contactPerson',
        phone: '$phone',
        email: '$email',
        category: '$category',
        city: '$city',
        state: '$state',
        country: '$country',
        countryCode: '$countryCode',
        currency: { $ifNull: ['$wallet.currency', '$currency'] },
        status: '$status',
        profileStatus: '$profileStatus',
        paymentStatus: '$paymentStatus',
        kycPercent: '$kycPercent',
        verified: '$verified',
        registeredAt: '$registeredAt',
        balance: { $ifNull: ['$wallet.availableBalance', 0] },
        walletBalance: { $ifNull: ['$wallet.availableBalance', 0] },
        dailyPacing: { $ifNull: ['$wallet.dailyAdSpend', 300] },
        amountPaid: { $ifNull: ['$wallet.totalLifetimePaid', 0] },
        totalAdSpent: { $ifNull: ['$wallet.totalAdSpent', 0] },
        adCampaignActive: { $ifNull: ['$wallet.adCampaignActive', false] },
        totalLeadsDispatched: { $size: '$leads' },
        runwayDays: {
          $floor: {
            $divide: [
              { $ifNull: ['$wallet.availableBalance', 0] },
              { $max: [{ $ifNull: ['$wallet.dailyAdSpend', 300] }, 1] }
            ]
          }
        }
      }
    },
    { $sort: { registeredAt: -1 } }
  ];

  return await Customer.aggregate(pipeline);
}

// 4. ATOMIC WALLET TOP-UP (ACID Session with Outbox)
export async function creditWalletAtomic({ customerId, amount, referenceUtr, paymentMethod = 'Razorpay', description = 'Wallet Recharge' }) {
  // Try using session transaction if supported
  let session = null;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
  } catch (sessErr) {
    session = null; // Fallback to direct atomic operations if standalone replica set not yet initiated
  }

  try {
    // Check idempotency on UTR
    const existingTx = await WalletTransaction.findOne({ referenceUtr }).session(session);
    if (existingTx) {
      if (session) await session.abortTransaction();
      return { ok: true, alreadyCredited: true, transaction: existingTx };
    }

    const wallet = await Wallet.findOneAndUpdate(
      { customerId },
      {
        $inc: { availableBalance: amount, totalLifetimePaid: amount },
        $set: { updatedAt: new Date() }
      },
      { new: true, upsert: true, session }
    );

    // Update customer payment status
    await Customer.findByIdAndUpdate(
      customerId,
      { $set: { paymentStatus: 'paid', updatedAt: new Date() } },
      { session }
    );

    // Create ledger transaction
    const txId = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const tx = new WalletTransaction({
      _id: txId,
      customerId,
      walletId: wallet._id,
      txType: 'Credit',
      amount,
      balanceAfter: wallet.availableBalance,
      referenceUtr,
      description,
      paymentMethod,
      currency: wallet.currency || 'INR',
      status: 'Verified ✓',
      createdAt: new Date()
    });
    await tx.save({ session });

    // Record in Transactional Outbox
    await recordMongoOutboxEvent(session, {
      aggregateType: 'wallet',
      aggregateId: wallet._id,
      eventType: 'WALLET_CREDITED',
      payload: { customerId, amount, balanceAfter: wallet.availableBalance, referenceUtr }
    });

    if (session) await session.commitTransaction();
    return { ok: true, wallet, transaction: tx };
  } catch (err) {
    if (session) await session.abortTransaction();
    throw err;
  } finally {
    if (session) session.endSession();
  }
}

// 5. ATOMIC DAILY AD SPEND DEDUCTION
export async function deductWalletAtomic({ customerId, amount, description = 'Daily Service Deduction' }) {
  let session = null;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
  } catch (e) {
    session = null;
  }

  try {
    const wallet = await Wallet.findOne({ customerId }).session(session);
    if (!wallet || wallet.availableBalance < amount) {
      if (session) await session.abortTransaction();
      return { ok: false, error: 'Insufficient balance' };
    }

    const updatedWallet = await Wallet.findOneAndUpdate(
      { customerId, availableBalance: { $gte: amount } },
      {
        $inc: { availableBalance: -amount, totalAdSpent: amount },
        $set: { lastDeductedAt: new Date(), updatedAt: new Date() }
      },
      { new: true, session }
    );

    if (!updatedWallet) {
      if (session) await session.abortTransaction();
      return { ok: false, error: 'Insufficient balance during atomic deduction' };
    }

    const txId = `tx_deb_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const tx = new WalletTransaction({
      _id: txId,
      customerId,
      walletId: wallet._id,
      txType: 'Debit',
      amount,
      balanceAfter: updatedWallet.availableBalance,
      referenceUtr: `DEDUCT-${Date.now()}`,
      description,
      paymentMethod: 'Auto Debit (Campaign)',
      currency: wallet.currency || 'INR',
      status: 'Verified ✓',
      createdAt: new Date()
    });
    await tx.save({ session });

    await recordMongoOutboxEvent(session, {
      aggregateType: 'wallet',
      aggregateId: wallet._id,
      eventType: 'WALLET_DEBITED',
      payload: { customerId, amount, balanceAfter: updatedWallet.availableBalance }
    });

    if (session) await session.commitTransaction();
    return { ok: true, wallet: updatedWallet, transaction: tx };
  } catch (err) {
    if (session) await session.abortTransaction();
    throw err;
  } finally {
    if (session) session.endSession();
  }
}

// 6. OPERATIONAL SYSTEM HEALTH COUNTS
export async function getMongoSystemCounts() {
  const [customersCount, leadsCount, walletsCount, paymentsCount, masterLeadsCount] = await Promise.all([
    Customer.countDocuments(),
    Lead.countDocuments(),
    Wallet.countDocuments(),
    PaymentRecord.countDocuments(),
    MasterLead.countDocuments()
  ]);

  return {
    customers_count: customersCount,
    leads_count: leadsCount,
    wallets_count: walletsCount,
    payments_count: paymentsCount,
    master_leads_count: masterLeadsCount
  };
}
