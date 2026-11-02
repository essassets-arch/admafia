import { initDatabase, query } from './db.js';

async function main() {
  const targetPhone = process.argv[2] || '8200792130';
  const targetClean = targetPhone.replace(/\D/g, '').slice(-10);

  console.log(`🔍 Searching for customer with phone / ID matching: ${targetClean}`);

  await initDatabase();

  const custRes = await query(
    `SELECT c.*, w.available_balance, w.daily_ad_spend, w.ad_campaign_active
     FROM customers c
     LEFT JOIN wallets w ON w.customer_id = c.id
     WHERE c.phone LIKE $1 OR c.id LIKE $1 OR c.username LIKE $1
     LIMIT 5`,
    [`%${targetClean}%`]
  );

  if (custRes.rowCount === 0) {
    console.log(`⚠️ No customer found in local database with phone/ID matching ${targetClean}.`);
    console.log(`If this customer was registered on the live VPS, run this script on the VPS:`);
    console.log(`  node backend/reset-balance.js ${targetClean}`);
    process.exit(0);
  }

  for (const cust of custRes.rows) {
    const oldBalance = Number(cust.available_balance || 0);
    console.log(`\n👤 Customer Found:`);
    console.log(`   ID: ${cust.id}`);
    console.log(`   Name / Contact: ${cust.contact_person || cust.company_name || cust.username}`);
    console.log(`   Phone: ${cust.phone}`);
    console.log(`   Current Wallet Balance: ₹${oldBalance.toLocaleString('en-IN')}`);

    // Update wallet balance to 0
    await query(
      `UPDATE wallets 
       SET available_balance = 0,
           updated_at = NOW()
       WHERE customer_id = $1`,
      [cust.id]
    );

    // Record audit adjustment transaction in wallet_transactions
    const txId = `tx_adj_${Date.now()}`;
    await query(
      `INSERT INTO wallet_transactions 
         (id, customer_id, type, amount, balance_after, description, payment_method, utr, created_at)
       VALUES 
         ($1, $2, 'debit', $3, 0, $4, 'System Adjustment', $5, NOW())`,
      [
        txId,
        cust.id,
        oldBalance,
        `Admin balance adjustment to ₹0 (Previous balance: ₹${oldBalance})`,
        'pay_TvCjRvjJKpHawP',
      ]
    ).catch(() => {});

    console.log(`✅ Balance successfully set to ₹0!`);
    console.log(`   New Wallet Balance: ₹0`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Error resetting balance:', err);
  process.exit(1);
});
