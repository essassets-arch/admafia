/**
 * ============================================================================
 * GROWTHLINE B2B LEAD GENERATION CRM — FULL DYNAMIC E2E TEST SUITE
 * ============================================================================
 * Verifies:
 *  1. Backend & PostgreSQL Health Check (Zero Static Data Baseline)
 *  2. Multi-Account Registration (Account A & Account B via /api/auth/register)
 *  3. Customer Authentication (/api/auth/login with Phone & Username)
 *  4. Step 1: Business Profile Completion (/api/customers/:id/profile)
 *  5. Step 2: Ad Wallet Top-Up + GST Invoice + Payment Receipt (/api/wallets/topup)
 *  6. Daily Ad Spend Auto-Deduction (/api/wallets/deduct)
 *  7. Sales Desk Lead Dispatch (/api/leads) to Account A & Account B
 *  8. Strict Per-Account Lead & Wallet Isolation Verification (/api/customers/:id)
 *  9. Lead Pipeline Status & Read Update (/api/leads/:id)
 * 10. Global Sales Executive Desk State Sync (/api/state)
 * 11. Clean Teardown & Zero-Static-Data Verification
 * ============================================================================
 */

const API_BASE = process.env.API_URL || 'http://localhost:5000/api';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✅ PASS: ${message}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${message}`);
  }
}

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function runTests() {
  console.log('======================================================================');
  console.log('🚀 RUNNING GROWTHLINE CRM DYNAMIC END-TO-END TEST SUITE');
  console.log(`🔗 Target Backend API: ${API_BASE}`);
  console.log('======================================================================\n');

  const phoneA = '9111122222';
  const phoneB = '9333344444';

  // Ensure any leftover test records are removed before starting
  await api(`/customers/${phoneA}`, { method: 'DELETE' }).catch(() => {});
  await api(`/customers/${phoneB}`, { method: 'DELETE' }).catch(() => {});

  // -------------------------------------------------------------------------
  // TEST 1: Health Check & Zero Static Data Baseline
  // -------------------------------------------------------------------------
  console.log('1️⃣  Checking PostgreSQL Connection & Baseline Counts...');
  const health1 = await api('/health');
  assert(health1.status === 200 && health1.data.ok === true, 'GET /api/health returns 200 OK');
  assert(health1.data.db.connected === true, `PostgreSQL engine connected (${health1.data.db.engine})`);
  const initialCustomers = Number(health1.data.counts.customers_count || 0);
  console.log(`   ℹ️  Initial customers in DB: ${initialCustomers}\n`);

  // -------------------------------------------------------------------------
  // TEST 2: Register Two Separate Customer Accounts (Account A & Account B)
  // -------------------------------------------------------------------------
  console.log('2️⃣  Registering Account A & Account B (/api/auth/register)...');
  const regA = await api('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      username: 'alpha_solar',
      phone: phoneA,
      email: 'contact@alphasolar.in',
      password: 'PasswordA123!',
    }),
  });
  assert(regA.status === 201 && regA.data.ok === true, 'Account A registered with HTTP 201');
  assert(regA.data.customer.phone === phoneA, `Account A phone stored as ${phoneA}`);
  assert(regA.data.customer.balance === 0, 'Account A starts with ₹0 wallet balance');
  assert(regA.data.customer.profileStatus === 'complete', 'Account A registration marked complete (100% KYC)');

  const regB = await api('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      username: 'beta_logistics',
      phone: phoneB,
      email: 'info@betalogistics.in',
      password: 'PasswordB123!',
    }),
  });
  assert(regB.status === 201 && regB.data.ok === true, 'Account B registered with HTTP 201');
  assert(regB.data.customer.phone === phoneB, `Account B phone stored as ${phoneB}\n`);

  // -------------------------------------------------------------------------
  // TEST 3: Customer Login Verification (/api/auth/login)
  // -------------------------------------------------------------------------
  console.log('3️⃣  Verifying Customer Authentication (/api/auth/login)...');
  const loginA = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier: phoneA, password: 'PasswordA123!' }),
  });
  assert(loginA.status === 200 && loginA.data.customer.username === 'alpha_solar', 'Account A login by 10-digit mobile number succeeded');

  const badLogin = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier: phoneA, password: 'WrongPassword!' }),
  });
  assert(badLogin.status === 401, 'Invalid password rejected with HTTP 401\n');

  // -------------------------------------------------------------------------
  // TEST 4: Step 1 Business Profile Completion (/api/customers/:id/profile)
  // -------------------------------------------------------------------------
  console.log('4️⃣  Completing Step 1 Business Profile for Account A & B...');
  const profA = await api(`/customers/${phoneA}/profile`, {
    method: 'PUT',
    body: JSON.stringify({
      companyName: 'Alpha Solar Tech Pvt Ltd',
      category: 'Manufacturing & Industrial',
      industry: 'Solar & Renewable Energy',
      website: 'https://alphasolar.in',
      contactPerson: 'Rajesh Sharma',
      email: 'contact@alphasolar.in',
      city: 'Pune',
      state: 'Maharashtra',
    }),
  });
  assert(profA.status === 200 && profA.data.customer.profileStatus === 'complete', 'Account A profile marked complete');
  assert(profA.data.customer.kycPercent === 100, 'Account A KYC completion updated to 100%');

  const profB = await api(`/customers/${phoneB}/profile`, {
    method: 'PUT',
    body: JSON.stringify({
      companyName: 'Beta Freight Logistics',
      category: 'Logistics & Supply Chain',
      contactPerson: 'Amit Patel',
      city: 'Ahmedabad',
      state: 'Gujarat',
    }),
  });
  assert(profB.status === 200 && profB.data.customer.companyName === 'Beta Freight Logistics', 'Account B profile updated\n');

  // -------------------------------------------------------------------------
  // TEST 5: Step 2 Ad Wallet Top-Up (/api/wallets/topup)
  // -------------------------------------------------------------------------
  console.log('5️⃣  Testing Ad Wallet Top-Up (Min ₹300, GST Invoice & Payment Record)...');
  const lowTopup = await api('/wallets/topup', {
    method: 'POST',
    body: JSON.stringify({ phone: phoneA, amount: 150 }),
  });
  assert(lowTopup.status === 400, 'Top-up below ₹300 rejected with HTTP 400');

  const topupA = await api('/wallets/topup', {
    method: 'POST',
    body: JSON.stringify({
      phone: phoneA,
      amount: 1000,
      paymentMethod: 'Razorpay UPI',
    }),
  });
  assert(topupA.status === 201 && topupA.data.walletBalance === 1000, 'Account A wallet credited with ₹1,000');
  assert(topupA.data.customer.paymentStatus === 'paid', 'Account A paymentStatus updated to paid');
  assert(Boolean(topupA.data.invoice?.invoiceNo), `GST Tax Invoice generated (${topupA.data.invoice?.invoiceNo})`);
  assert(Boolean(topupA.data.paymentRecord?.receiptNo), `Sales Desk Payment Receipt generated (${topupA.data.paymentRecord?.receiptNo})\n`);

  // -------------------------------------------------------------------------
  // TEST 6: Daily Ad Spend Auto-Deduction (/api/wallets/deduct)
  // -------------------------------------------------------------------------
  console.log('6️⃣  Testing Daily Ad Spend Deduction (-₹300/day)...');
  const deductA = await api('/wallets/deduct', {
    method: 'POST',
    body: JSON.stringify({ phone: phoneA, amount: 300 }),
  });
  assert(deductA.status === 200 && deductA.data.walletBalance === 700, 'Account A wallet balance deducted to ₹700');
  assert(deductA.data.transaction.type === 'Debit', 'Debit ledger transaction recorded\n');

  // -------------------------------------------------------------------------
  // TEST 7: Lead Dispatch & Strict Multi-Account Isolation (/api/leads)
  // -------------------------------------------------------------------------
  console.log('7️⃣  Dispatching Buyer Leads to Account A & Account B (/api/leads)...');
  const leadA1 = await api('/leads', {
    method: 'POST',
    body: JSON.stringify({
      company: 'Alpha Solar Tech Pvt Ltd',
      phone: '9876500001',
      city: 'Pune',
      requirement: '50kW Rooftop Solar Plant Installation',
    }),
  });
  const leadA2 = await api('/leads', {
    method: 'POST',
    body: JSON.stringify({
      company: 'Alpha Solar Tech Pvt Ltd',
      phone: '9876500002',
      city: 'Mumbai',
      requirement: '100kW Industrial Solar Panel Order',
    }),
  });
  const leadB1 = await api('/leads', {
    method: 'POST',
    body: JSON.stringify({
      company: 'Beta Freight Logistics',
      phone: '9876500009',
      city: 'Surat',
      requirement: 'Full Truckload Container Transport',
    }),
  });

  assert(leadA1.status === 201 && leadA1.data.lead.displayPhone === '+91 9876500001', 'Lead 1 dispatched to Account A (+91 9876500001)');
  assert(leadA2.status === 201 && leadA2.data.lead.displayPhone === '+91 9876500002', 'Lead 2 dispatched to Account A (+91 9876500002)');
  assert(leadB1.status === 201 && leadB1.data.lead.displayPhone === '+91 9876500009', 'Lead 3 dispatched to Account B (+91 9876500009)\n');

  // -------------------------------------------------------------------------
  // TEST 8: Verify Strict Account Isolation (/api/customers/:identifier)
  // -------------------------------------------------------------------------
  console.log('8️⃣  Verifying Strict Account Isolation Between Account A & Account B...');
  const wsA = await api(`/customers/${phoneA}`);
  const wsB = await api(`/customers/${phoneB}`);

  assert(wsA.data.leads.length === 2, 'Account A workspace sees ONLY its 2 leads (0 leakage from Account B)');
  assert(wsB.data.leads.length === 1, 'Account B workspace sees ONLY its 1 lead (0 leakage from Account A)');
  assert(wsA.data.customer.balance === 700, 'Account A wallet balance is ₹700');
  assert(wsB.data.customer.balance === 0, 'Account B wallet balance is ₹0');
  assert(wsA.data.transactions.length === 2, 'Account A has 2 wallet transactions (1 Credit, 1 Debit)');
  assert(wsB.data.transactions.length === 0, 'Account B has 0 wallet transactions\n');

  // -------------------------------------------------------------------------
  // TEST 9: Lead Status & Read Update (/api/leads/:id)
  // -------------------------------------------------------------------------
  console.log('9️⃣  Updating Lead Pipeline Stage (/api/leads/:id)...');
  const leadIdToUpdate = leadA1.data.lead.id;
  const patchedLead = await api(`/leads/${leadIdToUpdate}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'qualified', read: true, notes: 'Spoke with buyer, site visit scheduled' }),
  });
  assert(patchedLead.status === 200 && patchedLead.data.lead.status === 'qualified', 'Lead status updated to qualified in PostgreSQL');
  assert(patchedLead.data.lead.read === true, 'Lead read flag updated to true\n');

  // -------------------------------------------------------------------------
  // TEST 10: Sales Executive Desk Full State Sync (/api/state)
  // -------------------------------------------------------------------------
  console.log('🔟 Verifying Sales Executive Desk State (/api/state)...');
  const stateRes = await api('/state');
  assert(stateRes.status === 200 && stateRes.data.ok === true, 'GET /api/state returned 200 OK');
  assert(stateRes.data.customers.some((c) => c.phone === phoneA), 'Sales Desk 01 (Customers) includes Account A');
  assert(stateRes.data.customers.some((c) => c.phone === phoneB), 'Sales Desk 01 (Customers) includes Account B');
  assert(stateRes.data.verifications.some((v) => v.phone === phoneA && v.queueType === 'Completed'), 'Sales Desk 02 (Verifications) shows Account A as Completed (Both Step 1 & Step 2 done)');
  assert(stateRes.data.verifications.some((v) => v.phone === phoneB && v.queueType === 'Payment Pending'), 'Sales Desk 02 (Verifications) shows Account B as Payment Pending\n');

  // -------------------------------------------------------------------------
  // TEST 11: Clean Teardown & Zero-Static-Data Verification
  // -------------------------------------------------------------------------
  console.log('🧹 Cleaning Up Test Records & Verifying Clean Database State...');
  const delA = await api(`/customers/${phoneA}`, { method: 'DELETE' });
  const delB = await api(`/customers/${phoneB}`, { method: 'DELETE' });
  assert(delA.status === 200 && delB.status === 200, 'Test accounts A & B cleanly deleted via CASCADE');

  const healthFinal = await api('/health');
  assert(
    Number(healthFinal.data.counts.customers_count) === initialCustomers,
    `Database restored to clean baseline (${healthFinal.data.counts.customers_count} customers, ${healthFinal.data.counts.leads_count} leads)`
  );

  console.log('\n======================================================================');
  console.log(`🎯 TEST SUMMARY: ${passed} Passed | ${failed} Failed`);
  console.log('======================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal Test Error:', err);
  process.exit(1);
});

