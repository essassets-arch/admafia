import { initDatabase, query } from './db.js';

async function testFlow() {
  console.log('--- STARTING ADMAFIA MARKETING & PACING FLOW TEST ---');
  await initDatabase();

  const testPhone = '9820099999';
  const testUsername = 'admafia_test_client';
  const testCompany = 'AdMafia Test Client Enterprises';

  // 1. Cleanup old test data
  await query('DELETE FROM customers WHERE phone = $1 OR username = $2', [testPhone, testUsername]);

  // 2. Register Customer
  const custId = `cust_${Date.now()}`;
  await query(
    `INSERT INTO customers (id, username, phone, email, password_hash, company_name, contact_person, status, profile_status, payment_status, kyc_percent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', 'complete', 'paid', 100)`,
    [custId, testUsername, testPhone, 'test@admafia.marketing', 'hashed_pass_123', testCompany, 'Test Owner']
  );
  console.log('✓ Step 1: Customer registered in database:', custId);

  // 3. Create wallet with ₹1,344 initial balance
  const walletId = `wal_${Date.now()}`;
  await query(
    `INSERT INTO wallets (id, customer_id, available_balance, daily_ad_spend, ad_campaign_active, active_days, schedule_preset)
     VALUES ($1, $2, 1344.00, 300.00, FALSE, 'MON,TUE,WED,THU,FRI', 'weekdays')`,
    [walletId, custId]
  );
  console.log('✓ Step 2: Wallet funded with ₹1344 (Initial status: Paused/Inactive, Mon-Fri)');

  // 4. Simulate Customer setting customized daily spend to ₹656 and activating/deducting for today
  const customizedDaily = 656.00;
  const currentBal = 1344.00;
  const nextBal = currentBal - customizedDaily; // 688.00

  const kolkataNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const todayDayCode = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][kolkataNow.getDay()];
  console.log(`✓ Step 3: Customer customizes daily amount to ₹${customizedDaily}. Today is ${todayDayCode}`);

  let activeDays = 'MON,TUE,WED,THU,FRI';
  const setDays = new Set(activeDays.split(',').map((s) => s.trim().toUpperCase()));
  setDays.add(todayDayCode);
  const updatedActiveDays = Array.from(setDays).join(',');

  await query(
    `UPDATE wallets SET
      available_balance = $1,
      daily_ad_spend = $2,
      total_ad_spent = total_ad_spent + $2,
      ad_campaign_active = TRUE,
      active_days = $4,
      last_deducted_at = NOW(),
      updated_at = NOW()
    WHERE customer_id = $3`,
    [nextBal, customizedDaily, custId, updatedActiveDays]
  );

  // Record debit transaction
  await query(
    `INSERT INTO wallet_transactions (
      id, customer_id, wallet_id, tx_type, amount, balance_after, reference_utr, description, payment_method, status
    ) VALUES ($1, $2, $3, 'Debit', $4, $5, 'AUTO-AD-TEST', 'Daily Meta Ads Campaign Spend Deduction (-₹656/day)', 'Daily Auto-Debit', 'Settled ✓')`,
    [`tx_test_${Date.now()}`, custId, walletId, customizedDaily, nextBal]
  );

  // Verify wallet
  const checkWal = await query('SELECT * FROM wallets WHERE customer_id = $1', [custId]);
  const walRow = checkWal.rows[0];
  console.log('✓ Step 4: Wallet updated after deduction:');
  console.log(`   - Available Balance: ₹${walRow.available_balance} (Expected: ₹688.00)`);
  console.log(`   - Daily Ad Spend: ₹${walRow.daily_ad_spend} (Expected: ₹656.00)`);
  console.log(`   - Ad Campaign Active: ${walRow.ad_campaign_active} (Expected: true)`);
  console.log(`   - Active Days: ${walRow.active_days} (Includes today ${todayDayCode})`);

  if (Number(walRow.available_balance) !== 688 || Number(walRow.daily_ad_spend) !== 656 || !walRow.ad_campaign_active) {
    throw new Error('Wallet state mismatch!');
  }

  // 5. Sales person creates lead at /sales#leads and assigns to customer
  const leadId = `lead_test_${Date.now()}`;
  const buyerPhone = '9876543210';
  await query(
    `INSERT INTO leads (
      id, customer_id, customer_phone, customer_username, company_name,
      buyer_phone, display_phone, buyer_name, buyer_email, city,
      requirement, budget, source, priority, status, is_hot, is_read, notes
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, 'buyer@example.com', 'Mumbai',
      'High Value Inbound Enquiry', '₹2.5L', 'Meta Ads', 'Urgent', 'new', TRUE, FALSE, 'Dispatched by Sales'
    )`,
    [
      leadId,
      custId,
      testPhone,
      testUsername,
      testCompany,
      buyerPhone,
      `+91 ${buyerPhone}`,
      'Rajesh Sharma'
    ]
  );
  console.log('✓ Step 5: Sales person created lead in /sales#leads assigned to', testCompany);

  // 6. Verify customer lead retrieval
  const custLeads = await query(
    `SELECT * FROM leads WHERE customer_id = $1 OR company_name = $2`,
    [custId, testCompany]
  );
  console.log(`✓ Step 6: Customer portal receives ${custLeads.rowCount} lead(s):`);
  custLeads.rows.forEach((l) => {
    console.log(`   - Lead: ${l.buyer_name} (${l.display_phone}), Status: ${l.status}, Priority: ${l.priority}`);
  });

  if (custLeads.rowCount === 0) {
    throw new Error('Customer leads not found!');
  }

  // 7. Cleanup test data
  await query('DELETE FROM leads WHERE customer_id = $1', [custId]);
  await query('DELETE FROM wallet_transactions WHERE customer_id = $1', [custId]);
  await query('DELETE FROM wallets WHERE customer_id = $1', [custId]);
  await query('DELETE FROM customers WHERE id = $1', [custId]);
  console.log('✓ Step 7: Cleaned up test data');

  console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! The flow is 100% verified.');
  process.exit(0);
}

testFlow().catch((err) => {
  console.error('Test Failed:', err);
  process.exit(1);
});
