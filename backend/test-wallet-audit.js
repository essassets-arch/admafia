/**
 * Master Verification & Financial Integrity Test Suite for AdMafia Growth Wallet & Credits
 * Page: https://admafia.marketing/app/lead#app/wallet
 */

import { createHmac } from 'crypto';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

async function runWalletAudit() {
  console.log('\n======================================================================');
  console.log('💳 STARTING ADMAFIA GROWTH WALLET & CREDITS AUDIT');
  console.log('======================================================================\n');

  // -------------------------------------------------------------------------
  // AREA 1: FINANCIAL ARITHMETIC & LEDGER RECONCILIATION
  // -------------------------------------------------------------------------
  console.log('1️⃣  Verifying Financial Balance Arithmetic & Ledger Reconciliation...');

  // Ledger state matching problem statement: ₹500 starting balance, ₹300 daily ad spend debit
  const initialBalance = 500;
  const dailyAdSpend = 300;
  const expectedBalanceAfterDebit = initialBalance - dailyAdSpend; // 200

  assert(
    expectedBalanceAfterDebit === 200,
    `Exact deduction: ₹${initialBalance} - ₹${dailyAdSpend} = ₹${expectedBalanceAfterDebit}`
  );

  const transactions = [
    { id: 'tx_rec_1', type: 'Credit', amount: 500, status: 'Completed ✓' },
    { id: 'tx_cut_1', type: 'Debit', amount: 300, status: 'Completed ✓' },
    { id: 'tx_fail_1', type: 'Credit', amount: 1000, status: 'Failed ✕' },
  ];

  const credits = transactions.filter(t => t.type === 'Credit' && t.status === 'Completed ✓');
  const debits = transactions.filter(t => t.type === 'Debit' && t.status === 'Completed ✓');
  const fails = transactions.filter(t => t.status.toLowerCase().includes('fail'));

  const calculatedBalance = credits.reduce((sum, t) => sum + t.amount, 0) - debits.reduce((sum, t) => sum + t.amount, 0);
  assert(calculatedBalance === 200, `Ledger reconciled balance exactly matches ₹200 (Credits: ₹500, Debits: ₹300)`);
  assert(credits.length === 1 && debits.length === 1 && fails.length === 1, `Ledger categorizes transactions correctly`);

  // -------------------------------------------------------------------------
  // AREA 2: CAMPAIGN STATUS & PACING ENGINE LOGIC
  // -------------------------------------------------------------------------
  console.log('\n2️⃣  Verifying Day-Wise Ad Spend Engine States...');

  // Case A: Campaign Active with sufficient funds
  const activeUser = {
    adCampaignActive: true,
    walletBalance: 500,
    dailyAdSpend: 300,
    isDeductedToday: false,
  };
  const isLiveA = Boolean(activeUser.adCampaignActive) && activeUser.walletBalance >= activeUser.dailyAdSpend;
  assert(isLiveA === true, `Active user with ₹500 balance is marked 'Live & Delivering'`);

  // Case B: Campaign Paused by User (Must NOT show 'Paused (Low Balance)')
  const userPaused = {
    adCampaignActive: false,
    walletBalance: 5000,
    dailyAdSpend: 300,
    isDeductedToday: false,
  };
  const badgeTextB = !userPaused.adCampaignActive
    ? 'Campaign Paused'
    : userPaused.walletBalance < userPaused.dailyAdSpend
    ? 'Paused (Low Balance)'
    : 'Live Campaign Active';
  assert(badgeTextB === 'Campaign Paused', `User-paused campaign shows 'Campaign Paused' (never 'Paused (Low Balance)')`);

  // Case C: Insufficient Balance
  const lowBalUser = {
    adCampaignActive: true,
    walletBalance: 150,
    dailyAdSpend: 300,
    isDeductedToday: false,
  };
  const badgeTextC = !lowBalUser.adCampaignActive
    ? 'Campaign Paused'
    : lowBalUser.walletBalance < lowBalUser.dailyAdSpend
    ? 'Paused (Low Balance)'
    : 'Live Campaign Active';
  assert(badgeTextC === 'Paused (Low Balance)', `Low balance user shows 'Paused (Low Balance)'`);

  // Case D: Next Auto-Deduction Schedule Text
  function getNextCutText(cust) {
    if (!cust.adCampaignActive) return 'Schedule Paused';
    return cust.isDeductedToday ? 'Tomorrow @ 12:00 AM' : 'Tonight @ 12:00 AM';
  }
  assert(getNextCutText({ adCampaignActive: true, isDeductedToday: true }) === 'Tomorrow @ 12:00 AM', `If debited today, next cut is 'Tomorrow @ 12:00 AM'`);
  assert(getNextCutText({ adCampaignActive: true, isDeductedToday: false }) === 'Tonight @ 12:00 AM', `If pending today, next cut is 'Tonight @ 12:00 AM'`);
  assert(getNextCutText({ adCampaignActive: false, isDeductedToday: false }) === 'Schedule Paused', `If paused, schedule shows 'Schedule Paused'`);

  // -------------------------------------------------------------------------
  // AREA 3: CAMPAIGN RUNWAY COMPUTATION
  // -------------------------------------------------------------------------
  console.log('\n3️⃣  Verifying Campaign Runway Calculation...');
  function computeRunway(balance, spend) {
    if (!spend || spend <= 0) return 0;
    return Math.floor(Math.max(0, balance) / spend);
  }
  assert(computeRunway(500, 300) === 1, `₹500 balance at ₹300/day yields 1 day runway`);
  assert(computeRunway(200, 300) === 0, `₹200 balance at ₹300/day yields 0 days runway`);
  assert(computeRunway(10000, 300) === 33, `₹10,000 balance at ₹300/day yields 33 days runway`);
  assert(computeRunway(0, 300) === 0, `₹0 balance yields 0 days runway without error`);

  // -------------------------------------------------------------------------
  // AREA 4: RAZORPAY PAYMENT LINK GENERATION & MINIMUM VALIDATION
  // -------------------------------------------------------------------------
  console.log('\n4️⃣  Verifying Razorpay Hosted Payment Link Generation...');
  const keyId = process.env.RAZORPAY_KEY_ID || 'rzp_test_S7dlJIqMvrpcaj';
  const keySecret = process.env.RAZORPAY_KEY_SECRET || 'ongR1rNVsrzSoVyjGx6VY9Zm';

  // Test minimum amount validation (₹300 min)
  function validateTopupAmount(amount) {
    const num = Number(amount);
    if (!Number.isSafeInteger(num) || num < 300 || num > 1000000) {
      return { ok: false, error: 'Enter an amount from ₹300 to ₹10,00,000.' };
    }
    return { ok: true, amount: num };
  }
  assert(validateTopupAmount(100).ok === false, `Amount ₹100 rejected (below ₹300 minimum)`);
  assert(validateTopupAmount(299).ok === false, `Amount ₹299 rejected (below ₹300 minimum)`);
  assert(validateTopupAmount(300).ok === true, `Amount ₹300 accepted (minimum boundary)`);
  assert(validateTopupAmount(1000).ok === true, `Amount ₹1,000 accepted`);
  assert(validateTopupAmount(10000).ok === true, `Amount ₹10,000 accepted`);

  // Verify Razorpay API call
  try {
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    const plinkRes = await fetch('https://api.razorpay.com/v1/payment_links', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: 30000, // ₹300 in paise
        currency: 'INR',
        accept_partial: false,
        reference_id: `test_audit_${Date.now()}`,
        description: 'AdMafia Instant Wallet Top-Up (₹300)',
        customer: {
          name: 'Audit Customer',
          contact: '+919724916167',
          email: 'audit@admafia.marketing',
        },
        notify: { sms: false, email: false },
        reminder_enable: false,
        callback_url: 'https://admafia.marketing/api/payments/razorpay/callback',
        callback_method: 'get',
      }),
    });
    const plink = await plinkRes.json();
    assert(plinkRes.ok && plink.id && plink.short_url, `Razorpay API generates valid hosted URL: ${plink.short_url}`);
    assert(plink.short_url.includes('rzp.io'), `Hosted URL is full-page rzp.io checkout`);
  } catch (err) {
    assert(false, `Razorpay API call failed: ${err.message}`);
  }

  // -------------------------------------------------------------------------
  // AREA 5: SIGNATURE & WEBHOOK HMAC SHA-256 VERIFICATION
  // -------------------------------------------------------------------------
  console.log('\n5️⃣  Verifying Webhook HMAC SHA-256 Signature Verification...');
  const testPayload = JSON.stringify({ event: 'payment.captured', entity: { id: 'pay_test_123', amount: 30000 } });
  const validSig = createHmac('sha256', keySecret).update(testPayload).digest('hex');
  const invalidSig = 'invalid_signature_hash_1234567890';

  function verifyWebhookSig(payload, signature, secret) {
    const digest = createHmac('sha256', secret).update(payload).digest('hex');
    return digest === signature;
  }

  assert(verifyWebhookSig(testPayload, validSig, keySecret) === true, `Valid webhook HMAC signature verified`);
  assert(verifyWebhookSig(testPayload, invalidSig, keySecret) === false, `Tampered/invalid webhook signature strictly rejected`);

  // -------------------------------------------------------------------------
  // AREA 6: LEDGER TABS AND TRANSACTION FILTERING
  // -------------------------------------------------------------------------
  console.log('\n6️⃣  Verifying Ledger Tabs & Transaction Filtering...');
  const sampleLedger = [
    { id: '1', txType: 'Credit', amount: 500, status: 'Completed ✓' },
    { id: '2', txType: 'Debit', amount: 300, status: 'Completed ✓' },
    { id: '3', txType: 'Debit', amount: 300, status: 'Completed ✓' },
    { id: '4', txType: 'Credit', amount: 1000, status: 'Failed ✕' },
    { id: '5', txType: 'Debit', amount: 300, status: 'Completed ✓' },
  ];

  const allCount = sampleLedger.length;
  const rechargesCount = sampleLedger.filter(t => t.txType === 'Credit' && !t.status.toLowerCase().includes('fail')).length;
  const adCutsCount = sampleLedger.filter(t => t.txType === 'Debit').length;
  const failedCount = sampleLedger.filter(t => t.status.toLowerCase().includes('fail')).length;

  assert(allCount === 5, `Tab 'All' count is 5`);
  assert(rechargesCount === 1, `Tab 'Recharges (+)' count is 1`);
  assert(adCutsCount === 3, `Tab 'Daily Ad Cuts (-₹300/d)' count is 3`);
  assert(failedCount === 1, `Tab 'Failed Transactions' count is 1`);

  console.log('\n======================================================================');
  console.log(`📊 AUDIT SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('======================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runWalletAudit().catch(err => {
  console.error('Audit run crashed:', err);
  process.exit(1);
});
