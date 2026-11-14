import {
  SystemUser,
  CountryPricing,
  WalletTransaction,
  PaymentRecord,
} from '../models/index.js';
import { hashPassword, isPasswordHashed } from '../utils/passwordCrypto.js';

/**
 * MongoDB startup bootstrap (replaces the data-seeding / cleanup half of PostgreSQL initDatabase()).
 * Schema/index management is done by the Mongoose models; this only seeds baseline documents
 * and performs the legacy one-off test-data cleanup.
 */

const DEFAULT_SYSTEM_USERS = [
  { _id: 'user_superadmin_01', fullName: 'AdMafia Executive Super Admin', email: 'admin@admafia.marketing', username: 'superadmin', phone: '9999999999', password: 'SuperAdmin@2026!', role: 'Super Admin', department: 'Super Admin', permissions: ['all'] },
  { _id: 'user_marketing_01', fullName: 'Senior Marketing Campaign Director', email: 'marketing@admafia.marketing', username: 'marketing', phone: '9888888888', password: 'Marketing@2026!', role: 'Marketing Manager', department: 'Marketing', permissions: ['marketing:all', 'campaigns:manage', 'ideas:create', 'posts:verify'] },
  { _id: 'user_graphics_01', fullName: 'Lead Creative & Graphics Designer', email: 'graphics@admafia.marketing', username: 'graphics', phone: '9777777777', password: 'Graphics@2026!', role: 'Senior Graphics Designer', department: 'Graphics', permissions: ['graphics:all', 'artworks:upload', 'requests:manage'] },
  { _id: 'user_sales_01', fullName: 'Principal Sales & Accounts Executive', email: 'sales@admafia.marketing', username: 'sales', phone: '9666666666', password: 'Sales@2026!', role: 'Sales Executive', department: 'Sales', permissions: ['sales:all', 'leads:call', 'deals:manage', 'groups:edit'] },
];

const BASELINE_COUNTRY_PRICING = [
  { _id: 'IN', countryCode: 'IN', countryName: 'India', currencyCode: 'INR', currencySymbol: '₹', currencyPosition: 'before', decimalPrecision: 0, dailyMinBudget: 300, monthlyBudget: 9000, minWalletTopup: 300, taxName: 'GST', taxRate: 18, paymentGateway: 'razorpay', phoneCode: '+91', flagEmoji: '', isActive: true, isDefault: true },
  { _id: 'ZZ', countryCode: 'ZZ', countryName: 'All Other Countries', currencyCode: 'USD', currencySymbol: '$', currencyPosition: 'before', decimalPrecision: 2, dailyMinBudget: 10, monthlyBudget: 300, minWalletTopup: 10, taxName: 'Tax', taxRate: 0, paymentGateway: 'disabled', phoneCode: '', flagEmoji: '', isActive: true, isDefault: false },
];

/** Seeds default department admin accounts and the two authoritative country-pricing rules (idempotent). */
export async function seedBaselineData() {
  const now = new Date();
  const result = { systemUsers: 0, countryPricing: 0, warnings: [] };

  for (const u of DEFAULT_SYSTEM_USERS) {
    try {
      const existing = await SystemUser.findOne({ username: u.username }).select('_id passwordHash').lean();
      const hashedDefault = await hashPassword(u.password);
      if (!existing) {
        await SystemUser.create({
          _id: u._id,
          customerId: null,
          fullName: u.fullName,
          email: u.email,
          username: u.username,
          phone: u.phone,
          passwordHash: hashedDefault,
          role: u.role,
          department: u.department,
          status: 'active',
          permissions: u.permissions,
          lastLoginAt: null,
          createdAt: now,
          updatedAt: now,
        });
      } else {
        const updateSet = { role: u.role, department: u.department, status: 'active', updatedAt: now };
        // Upgrade any legacy plaintext password automatically without overwriting custom scrypt passwords
        if (!isPasswordHashed(existing.passwordHash)) {
          updateSet.passwordHash = await hashPassword(existing.passwordHash || u.password);
        }
        await SystemUser.updateOne(
          { _id: existing._id },
          { $set: updateSet },
          { timestamps: false }
        );
      }
      result.systemUsers += 1;
    } catch (err) {
      result.warnings.push(`system user ${u.username}: ${err.message}`);
    }
  }

  for (const cp of BASELINE_COUNTRY_PRICING) {
    try {
      const { _id, ...fields } = cp;
      await CountryPricing.updateOne(
        { countryCode: cp.countryCode },
        { $set: { ...fields, updatedAt: now }, $setOnInsert: { _id, createdAt: now } },
        { upsert: true, timestamps: false }
      );
      result.countryPricing += 1;
    } catch (err) {
      result.warnings.push(`country pricing ${cp.countryCode}: ${err.message}`);
    }
  }
  try {
    await CountryPricing.updateMany(
      { countryCode: { $nin: ['IN', 'ZZ'] }, isActive: { $ne: false } },
      { $set: { isActive: false, updatedAt: now } },
      { timestamps: false }
    );
  } catch (err) {
    result.warnings.push(`country pricing deactivate: ${err.message}`);
  }

  return result;
}

/** Legacy startup cleanup of known dismissed/test ledger rows (was raw SQL DELETEs in server.js). */
export async function purgeLegacyTestLedgerRows() {
  const testUtrs = ['aaggg', 'aa', 'pay_TvCjRvjJKpHawP', 'pay_TvCfjhW56ixevu'];
  const testReceipts = ['REC_1793882500916_D467', 'REC_1793881526162_E051', 'RCP-2026-5814', 'RCP-2026-9969'];
  const testPayIds = ['pay_1793882500916_18d1ec', 'pay_1793881526162_89c397', 'pay_1793600155814', 'pay_1793600029969'];
  const testTxIds = ['tx_sales_1793882500877_e9eea9', 'tx_sales_1793881526137_245853', 'tx_1793600155807', 'tx_1793600029957', 'tx_deb_1793600430780_cz2cl5'];
  const dismissedTxIds = ['tx_fail_1793614599726_c2mx', 'tx_fail_1793614589017_m0gm', 'tx_fail_1793626722094_be89'];

  const dismissed = await WalletTransaction.deleteMany({
    $or: [{ referenceUtr: /^DISMISS-/ }, { _id: { $in: dismissedTxIds } }],
  });

  await PaymentRecord.deleteMany({
    $or: [
      { receiptNumber: { $in: testReceipts } },
      { referenceUtr: { $in: testUtrs } },
      { _id: { $in: testPayIds } },
    ],
  }).catch(() => {});

  await WalletTransaction.deleteMany({
    $or: [{ referenceUtr: { $in: testUtrs } }, { _id: { $in: testTxIds } }],
  }).catch(() => {});

  return { dismissedPurged: dismissed?.deletedCount || 0 };
}
