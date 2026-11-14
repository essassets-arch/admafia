import { initMongo, isMongoConnected } from '../mongo.js';
import {
  Customer,
  Wallet,
  WalletTransaction,
  PaymentRecord,
  PendingVerification,
  Lead,
  TopupRequest,
  SuperAdminAuditLog,
} from '../models/index.js';
import { deleteCustomerCascade } from '../repositories/salesLedgerRepo.js';
import { ciExact } from '../repositories/salesViewRepo.js';

const TARGET_USERS = [
  { username: 'abc', phone: '7383198428', email: 'aviralshukla2612@gmail.com', name: 'Abc' },
  { username: 'xxx', phone: '1111111111', email: '', name: 'Xxx' },
];

export async function purgeSpecifiedTestUsers() {
  if (!isMongoConnected()) {
    await initMongo();
  }
  console.log('[Purge Script] Scanning MongoDB for test users (@abc, @xxx)...');

  for (const target of TARGET_USERS) {
    const cleanPhone = String(target.phone || '').replace(/\D/g, '').slice(-10);
    const or = [
      { username: ciExact(target.username) },
      { companyName: ciExact(target.name) },
    ];
    if (cleanPhone) {
      or.push({ phone: cleanPhone }, { _id: `cust_reg_${cleanPhone}` });
    }
    if (target.email) {
      or.push({ email: ciExact(target.email) });
    }

    const found = await Customer.find({ $or: or }).lean().catch((err) => {
      console.warn(`[Purge Script] Lookup error for ${target.username}:`, err.message);
      return [];
    });

    if (!found.length) {
      console.log(`[Purge Script] User @${target.username} (${cleanPhone}) already absent from database.`);
      continue;
    }

    for (const cust of found) {
      const custId = cust._id;
      const custPhone = cust.phone;
      console.log(`[Purge Script] Permanently deleting customer record: @${cust.username} (ID: ${custId}, Phone: ${custPhone})`);

      await deleteCustomerCascade(custId, custPhone);

      await SuperAdminAuditLog.create({
        _id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        actorId: 'system_purge',
        actorName: 'System Purge Script',
        actorRole: 'Super Admin',
        actionType: 'CUSTOMER_DELETED',
        targetType: 'customer',
        targetId: custId,
        reason: 'Purged test user account',
        details: cust,
        createdAt: new Date(),
      }).catch(() => {});

      console.log(`[Purge Script] Successfully purged @${cust.username} and all cascaded data.`);
    }
  }

  // Clean up any orphan records by phone or customer id across collections
  const orphanPhones = ['7383198428', '1111111111'];
  const orphanCustIds = ['cust_reg_7383198428', 'cust_reg_1111111111'];

  await Promise.all([
    PaymentRecord.deleteMany({ phone: { $in: orphanPhones } }).catch(() => {}),
    PendingVerification.deleteMany({ phone: { $in: orphanPhones } }).catch(() => {}),
    Lead.deleteMany({ customerPhone: { $in: orphanPhones } }).catch(() => {}),
    WalletTransaction.deleteMany({ customerId: { $in: orphanCustIds } }).catch(() => {}),
    Wallet.deleteMany({ customerId: { $in: orphanCustIds } }).catch(() => {}),
    TopupRequest.deleteMany({ customerId: { $in: orphanCustIds } }).catch(() => {}),
    Customer.deleteMany({
      $or: [
        { phone: { $in: orphanPhones } },
        { username: { $in: [/^abc$/i, /^xxx$/i] } },
      ],
    }).catch(() => {}),
  ]);

  console.log('[Purge Script] Purge complete.');
}

// Execute directly if run as main
if (process.argv[1]?.endsWith('purge-test-users.js')) {
  purgeSpecifiedTestUsers()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Purge Script] Failed:', err);
      process.exit(1);
    });
}
