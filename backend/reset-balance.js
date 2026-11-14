import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { initMongo } from './mongo.js';
import { Customer, Wallet, WalletTransaction } from './models/index.js';
import { withMongoTransaction } from './repositories/tx.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function main() {
  const targetPhone = process.argv[2] || '8200792130';
  const targetClean = targetPhone.replace(/\D/g, '').slice(-10) || targetPhone.trim();

  console.log(`🔍 Searching for customer with phone / ID matching: ${targetClean}`);

  await initMongo();

  const rx = new RegExp(escapeRegex(targetClean), 'i');
  const customers = await Customer.find({
    $or: [{ phone: rx }, { _id: rx }, { username: rx }],
  })
    .limit(5)
    .lean();

  if (customers.length === 0) {
    console.log(`⚠️ No customer found in MongoDB with phone/ID matching ${targetClean}.`);
    console.log(`If this customer was registered on the live VPS, run this script on the VPS:`);
    console.log(`  node backend/reset-balance.js ${targetClean}`);
    await mongoose.disconnect();
    process.exit(0);
  }

  for (const cust of customers) {
    const wallet = await Wallet.findOne({ customerId: cust._id }).lean();
    const oldBalance = Number(wallet?.availableBalance || 0);

    console.log(`\n👤 Customer Found:`);
    console.log(`   ID: ${cust._id}`);
    console.log(`   Name / Contact: ${cust.contactPerson || cust.companyName || cust.username}`);
    console.log(`   Phone: ${cust.phone}`);
    console.log(`   Current Wallet Balance: ₹${oldBalance.toLocaleString('en-IN')}`);

    await withMongoTransaction(async (session) => {
      const now = new Date();
      await Wallet.updateOne(
        { customerId: cust._id },
        {
          $set: {
            availableBalance: 0,
            adCampaignActive: false,
            updatedAt: now,
          },
        },
        { session }
      );

      if (oldBalance > 0) {
        const txId = `tx_adj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        await WalletTransaction.create(
          [
            {
              _id: txId,
              customerId: cust._id,
              walletId: wallet?._id || `wal_${cust._id}`,
              txType: 'Debit',
              amount: oldBalance,
              balanceAfter: 0,
              referenceUtr: `ADJ_${txId}`,
              description: `Admin balance adjustment to ₹0 (Previous balance: ₹${oldBalance})`,
              paymentMethod: 'System Adjustment',
              status: 'Settled ✓',
              currency: wallet?.currency || cust.currency || 'INR',
              createdAt: now,
            },
          ],
          { session }
        );
      }
    });

    console.log(`✅ Balance successfully set to ₹0!`);
    console.log(`   New Wallet Balance: ₹0`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('Error resetting balance:', err);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
