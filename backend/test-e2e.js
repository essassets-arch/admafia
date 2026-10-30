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
  // Clean up any stale test accounts from previous runs
  for (const p of ['9111122222', '9333344444', '9600011111', '9600022222', '9600033333', '9600044444', '9600055555', '9700099999']) {
    await api(`/customers/${p}`, { method: 'DELETE' });
  }
  await api('/groups/grp_test_it', { method: 'DELETE' });
  await api('/groups/grp_test_hw', { method: 'DELETE' });

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
  // TEST 11: Customer Groups & Category-Based Lead Distribution (Master Prompt)
  // -------------------------------------------------------------------------
  console.log('1️⃣1️⃣ Testing Customer Groups & Category-Based Lead Distribution System...');

  // Ensure clean test baseline
  for (const p of ['9600011111', '9600022222', '9600033333', '9600044444', '9600055555', '9700099999']) {
    await api(`/customers/${p}`, { method: 'DELETE' });
  }
  await api('/groups/grp_test_it', { method: 'DELETE' });
  await api('/groups/grp_test_hw', { method: 'DELETE' });

  // Step A: Create Target IT Group & Separate Hardware Group
  const itGroupRes = await api('/groups', {
    method: 'POST',
    body: JSON.stringify({
      id: 'grp_test_it',
      name: 'Enterprise IT & Software Solutions',
      category: 'IT & Software',
      icon: '💻',
      description: 'Corporate software developers and cloud architects.',
      status: 'active',
    }),
  });
  assert(itGroupRes.status === 201 && itGroupRes.data.ok === true, 'Created Customer Group "Enterprise IT & Software Solutions"');

  const hwGroupRes = await api('/groups', {
    method: 'POST',
    body: JSON.stringify({
      id: 'grp_test_hw',
      name: 'Hardware & Networking Equipment',
      category: 'Hardware',
      icon: '🖥️',
      description: 'Hardware distributors and server suppliers.',
      status: 'active',
    }),
  });
  assert(hwGroupRes.status === 201 && hwGroupRes.data.ok === true, 'Created separate Hardware Customer Group');

  // Step B: Register 5 IT Customers and 1 Hardware Customer
  const itPhones = ['9600011111', '9600022222', '9600033333', '9600044444', '9600055555'];
  const hwPhone = '9700099999';
  const itCustIds = [];

  for (let i = 0; i < itPhones.length; i++) {
    const reg = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username: `it_cust_${i + 1}`,
        phone: itPhones[i],
        email: `it${i + 1}@itsoftware.in`,
        companyName: `IT Solutions Corp 0${i + 1}`,
        contactPerson: `Engineer ${i + 1}`,
        password: 'Password123!',
      }),
    });
    itCustIds.push(reg.data.customer.id);
  }
  assert(itCustIds.length === 5, '5 separate IT customer accounts registered in database');

  const hwReg = await api('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      username: 'hw_vendor_01',
      phone: hwPhone,
      email: 'vendor@hardwaretech.in',
      companyName: 'Apex Hardware Supplies Ltd',
      contactPerson: 'Karan Sharma',
      category: 'Hardware',
      password: 'Password123!',
    }),
  });
  const hwCustId = hwReg.data.customer.id;
  assert(Boolean(hwCustId), '1 Hardware customer account registered in database');

  // Step C: Batch Assign 5 IT Customers to IT Group, and Hardware Customer to HW Group
  const assignItRes = await api('/groups/grp_test_it/members', {
    method: 'POST',
    body: JSON.stringify({ customerIds: itCustIds }),
  });
  assert(assignItRes.status === 200 && assignItRes.data.assignedCount === 5, 'Assigned all 5 IT customers to IT Group in one action');

  const assignHwRes = await api('/groups/grp_test_hw/members', {
    method: 'POST',
    body: JSON.stringify({ customerIds: [hwCustId] }),
  });
  assert(assignHwRes.status === 200 && assignHwRes.data.assignedCount === 1, 'Assigned Hardware customer to Hardware Group');

  // Step D: Prevent Duplicate Group Memberships on Retry
  const retryAssign = await api('/groups/grp_test_it/members', {
    method: 'POST',
    body: JSON.stringify({ customerIds: itCustIds }),
  });
  assert(retryAssign.data.assignedCount === 0, 'Duplicate group membership safely prevented (idempotent ON CONFLICT)');

  // Step E: Preview Distribution Recipients for IT Group
  const previewRes = await api('/groups/grp_test_it/preview-recipients');
  assert(previewRes.status === 200 && previewRes.data.eligibleCount === 5, 'Preview confirmed exactly 5 eligible IT recipients in database');

  // Step F: CORE ACTION — Distribute 1 Master Lead by Category ('IT & Software')
  const distRes = await api('/leads/distribute', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Cloud Infrastructure & Kubernetes Modernization Project',
      description: 'Client requires enterprise AWS/Azure migration and containerization.',
      category: 'IT & Software',
      requirement: 'Full-stack cloud migration for 40 microservices, 24/7 SLA monitoring.',
      budget: '₹4.5L – ₹8.0L',
      location: 'Mumbai, Maharashtra',
      priority: 'Urgent',
      source: 'Category Lead Distribution',
      buyerName: 'Vikram Joshi (CTO)',
      buyerPhone: '9820012345',
      buyerEmail: 'v.joshi@techbuyer.com',
      city: 'Mumbai',
    }),
  });

  assert(distRes.status === 201 && distRes.data.ok === true, 'Master lead distribution API returned HTTP 201');
  assert(distRes.data.recipientsCount === 5 || distRes.data.recipientCount === 5, 'Category distribution: One master lead created -> exactly 5 IT customer assignments generated');
  assert(distRes.data.assignments.length === 5, 'Backend returned 5 assignment confirmation records');
  const masterLeadId = distRes.data.masterLead.id;

  // Step F2: Acceptance Criterion 3 — Retry the same distribution request -> no duplicate assignments
  const retryDistRes = await api('/leads/distribute', {
    method: 'POST',
    body: JSON.stringify({
      id: masterLeadId, // Same master lead ID retry
      title: 'Cloud Infrastructure & Kubernetes Modernization Project',
      description: 'Client requires enterprise AWS/Azure migration and containerization.',
      category: 'IT & Software',
      requirement: 'Full-stack cloud migration for 40 microservices, 24/7 SLA monitoring.',
      buyerName: 'Vikram Joshi (CTO)',
      buyerPhone: '9820012345',
    }),
  });
  assert(retryDistRes.status === 201, 'Retry distribution returned HTTP 201 (idempotent)');
  const it1Check = await api(`/leads?customerId=${itCustIds[0]}`);
  assert(it1Check.data.leads.length === 1, 'Retry safely prevented duplicate assignments (exactly 1 lead retained per customer)');

  // Step F3: Acceptance Criterion 2 — Distribute to Hardware Category -> Only Hardware recipient
  const hwDistRes = await api('/leads/distribute', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Server Rack & Switch Supplies Requirement',
      description: 'Procurement of 10x 42U Server Racks and Cat6 Cables',
      category: 'Hardware',
      requirement: 'Industrial networking racks and patch cables with 3-year warranty.',
      buyerName: 'Amit Shah',
      buyerPhone: '9876599999',
    }),
  });
  assert(hwDistRes.status === 201 && hwDistRes.data.recipientsCount === 1, 'Hardware Category distribution: exactly 1 Hardware customer assigned');
  const it1HwCheck = await api(`/leads?customerId=${itCustIds[0]}`);
  assert(it1HwCheck.data.leads.length === 1, 'IT customer received 0 Hardware leads (Strict Category Isolation)');

  // Step F4: Acceptance Criterion 4 — Category with 0 customers returns clear error
  const emptyCatRes = await api('/leads/distribute', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Non-existent Category Lead',
      requirement: 'Sample enquiry',
      category: 'NonExistentCategoryXYZ',
      buyerName: 'Test Buyer',
      buyerPhone: '9876543210',
    }),
  });
  assert(emptyCatRes.status === 400 && emptyCatRes.data.ok === false, 'Distribution to category with 0 customers cleanly rejected with HTTP 400');
  assert(emptyCatRes.data.error.includes('No active eligible customers found'), 'Clear error message returned explaining 0 eligible customers');

  // Step G: Acceptance Criterion 5 — Log in as each recipient and verify assigned lead is accessible
  for (let i = 0; i < itCustIds.length; i++) {
    const loginRes = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: itPhones[i], password: 'Password123!' }),
    });
    assert(loginRes.status === 200, `Customer IT-${i + 1} (${itPhones[i]}) successfully authenticated via login`);

    const custWorkspace = await api(`/customers/${itPhones[i]}`);
    assert(custWorkspace.status === 200, `Customer IT-${i + 1} workspace fetched`);
    assert(
      custWorkspace.data.leads.some((l) => l.masterLeadId === masterLeadId),
      `Customer IT-${i + 1} can view the assigned master lead in their CRM workspace`
    );
  }

  // Step I: Independent Recipient Responses
  const it1Lead = (await api(`/leads?customerId=${itCustIds[0]}`)).data.leads[0];
  const patchIt1 = await api(`/leads/${it1Lead.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      status: 'Interested',
      notes: 'Available to deploy DevOps engineers immediately',
    }),
  });
  assert(patchIt1.status === 200 && patchIt1.data.lead.status === 'Interested', 'Customer IT-01 responded: Marked status as "Interested"');

  const it2Lead = (await api(`/leads?customerId=${itCustIds[1]}`)).data.leads[0];
  await api(`/leads/${it2Lead.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      status: 'In Follow-up',
      notes: 'Follow-up call scheduled tomorrow at 11 AM',
    }),
  });

  // Step J: Verify Inspection & Distribution Tracking
  const distDetail = await api(`/leads/distribution-history/${masterLeadId}`);
  assert(distDetail.status === 200 && distDetail.data.ok === true, 'GET /api/leads/distribution-history/:id succeeded');
  assert(distDetail.data.recipients.length === 5, 'Inspector shows all 5 recipient customers');
  const rec1 = distDetail.data.recipients.find((r) => r.customerId === itCustIds[0]);
  const rec2 = distDetail.data.recipients.find((r) => r.customerId === itCustIds[1]);
  const rec3 = distDetail.data.recipients.find((r) => r.customerId === itCustIds[2]);

  assert(rec1 && rec1.responseInterest === 'Interested', 'Recipient 1 response stored independently as "Interested"');
  assert(rec2 && rec2.responseInterest === 'In Follow-up', 'Recipient 2 response stored independently as "In Follow-up"');
  assert(rec3 && rec3.responseInterest === 'Pending', 'Recipient 3 response remains untouched as "Pending" (Strict Isolation)\n');

  // Step K: Clean up Test Groups & Customers
  for (const p of itPhones) {
    await api(`/customers/${p}`, { method: 'DELETE' });
  }
  await api(`/customers/${hwPhone}`, { method: 'DELETE' });
  await api('/groups/grp_test_it', { method: 'DELETE' });
  await api('/groups/grp_test_hw', { method: 'DELETE' });
  console.log('   ✓ Test customer groups & accounts cleaned up successfully.\n');

  // -------------------------------------------------------------------------
  // TEST 12: Clean Teardown & Zero-Static-Data Verification
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

