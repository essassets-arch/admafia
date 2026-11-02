/**
 * ============================================================================
 * ADMAFIA CRM — BALANCE-BASED LEAD DISTRIBUTION ELIGIBILITY TEST SUITE
 * ============================================================================
 * 
 * Verifies all 14 mandatory eligibility rules and security safeguards:
 * 1. Active customer with balance >= daily spend & active marketing receives lead.
 * 2. Customer with balance < daily spend receives no lead.
 * 3. Customer with ₹0 balance receives no lead.
 * 4. Customer with marketing disabled receives no lead.
 * 5. Customer with inactive/suspended account receives no lead.
 * 6. Customer with incomplete KYC/profile receives no lead.
 * 7. Customer outside group receives no lead.
 * 8. Duplicate master lead distribution prevented.
 * 9. Group eligibility counts match actual preview eligibility.
 * 10. Dynamic revalidation between preview and distribution.
 * 11. Multi-tenant customer isolation preserved.
 * 12. Distribution history accurately reflects actual recipients.
 * 13. Zero wallet deductions during lead distribution.
 * 14. Zero eligible recipients produce truthful no-distribution result (HTTP 400).
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 5000;
const API_BASE = `http://localhost:${PORT}/api`;

let passedCount = 0;
let failedCount = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    passedCount++;
    console.log(`  ✅ PASS: ${testName}`);
    if (details) console.log(`     └─ ${details}`);
  } else {
    failedCount++;
    console.error(`  ❌ FAIL: ${testName}`);
    if (details) console.error(`     └─ Reason: ${details}`);
  }
}

async function api(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

async function isServerRunning() {
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch (e) {
    return false;
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTestSuite() {
  console.log('\n======================================================================');
  console.log('🚀 ADMAFIA: BALANCE-BASED LEAD DISTRIBUTION ELIGIBILITY TEST SUITE');
  console.log(`🔗 Target API: ${API_BASE}`);
  console.log('======================================================================\n');

  let serverProcess = null;
  const running = await isServerRunning();
  if (!running) {
    console.log('⚡ Starting AdMafia backend server...');
    serverProcess = spawn('node', ['server.js'], {
      cwd: __dirname,
      env: { ...process.env, PORT: String(PORT) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    serverProcess.stdout.on('data', (d) => {
      const msg = d.toString().trim();
      if (msg.includes('AdMafia CRM')) console.log(`[Backend Log] ${msg}`);
    });
    serverProcess.stderr.on('data', (d) => {
      const msg = d.toString().trim();
      if (msg.includes('Error') || msg.includes('error')) console.error(`[Backend Err] ${msg}`);
    });

    let attempts = 0;
    while (attempts < 25) {
      await sleep(1000);
      if (await isServerRunning()) {
        console.log('✅ Server online and responding to /api/health.\n');
        break;
      }
      attempts++;
    }
  } else {
    console.log('ℹ️ Existing backend server is already running on port ' + PORT + '.\n');
  }

  const registeredCustomerIds = [];
  let testGroupId = null;
  let otherGroupId = null;

  try {
    // -------------------------------------------------------------------------
    // TEST SETUP: Customer Groups via REST API
    // -------------------------------------------------------------------------
    console.log('📦 Creating isolated Customer Groups via REST API...');
    const stamp = Date.now().toString(36).slice(-5);
    const testCategory = `TestCat_${stamp}`;
    const testGroupName = `Test Group ${stamp}`;
    const otherCategory = `OtherCat_${stamp}`;
    const otherGroupName = `Other Group ${stamp}`;

    const grp1Res = await api('/groups', {
      method: 'POST',
      body: JSON.stringify({
        name: testGroupName,
        category: testCategory,
        icon: '🧪',
        description: 'Test Lead Distribution Group',
      }),
    });
    assert(grp1Res.status === 201 && grp1Res.data.ok, 'Created primary target group via POST /api/groups');
    testGroupId = grp1Res.data.group.id;

    const grp2Res = await api('/groups', {
      method: 'POST',
      body: JSON.stringify({
        name: otherGroupName,
        category: otherCategory,
        icon: '📦',
        description: 'Unrelated other group',
      }),
    });
    assert(grp2Res.status === 201 && grp2Res.data.ok, 'Created secondary other group via POST /api/groups');
    otherGroupId = grp2Res.data.group.id;

    // -------------------------------------------------------------------------
    // TEST SETUP: Register 7 Test Accounts with Distinct Profiles
    // -------------------------------------------------------------------------
    console.log('\n📦 Registering & configuring 7 test accounts...');
    const phonePrefix = '9' + String(Date.now()).slice(-6);

    async function registerAndSetupCustomer(idx, config) {
      const phone = `${phonePrefix}${String(idx).padStart(3, '0')}`;
      const username = `test_user_${stamp}_${idx}`;
      const regRes = await api('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          username,
          phone,
          email: `${username}@example.com`,
          password: 'Password123!',
          companyName: config.name,
          contactPerson: `Contact ${idx}`,
          category: config.cat,
          city: 'Mumbai',
          state: 'Maharashtra',
        }),
      });

      if (!regRes.ok) {
        throw new Error(`Failed to register ${config.name}: ${JSON.stringify(regRes.data)}`);
      }

      const custId = regRes.data.customer.id;
      registeredCustomerIds.push(custId);

      // Top up wallet if specified
      if (config.topup > 0) {
        await api('/wallets/topup', {
          method: 'POST',
          body: JSON.stringify({
            customerId: custId,
            phone,
            amount: config.topup,
            paymentMethod: 'UPI Test',
            utr: `UTR_${Date.now()}_${idx}`,
          }),
        });
      }

      // Configure marketing schedule, daily spend, and account status via PATCH
      await api(`/customers/${custId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          companyName: config.name,
          status: config.status || 'active',
          profileStatus: config.profileStatus || 'complete',
          paymentStatus: config.paymentStatus || 'paid',
          kycPercent: config.kycPercent !== undefined ? config.kycPercent : 100,
          dailyAdSpend: config.dailyAdSpend || 300,
          adCampaignActive: config.campActive !== undefined ? config.campActive : true,
          activeDays: config.activeDays || 'ALL',
        }),
      });

      return { custId, phone, ...config };
    }

    // 1. Fully Eligible Customer
    const c1 = await registerAndSetupCustomer(1, {
      name: 'Eligible Enterprise',
      cat: testCategory,
      topup: 1000,
      dailyAdSpend: 300,
      campActive: true,
      activeDays: 'ALL',
      status: 'active',
      profileStatus: 'complete',
      paymentStatus: 'paid',
      kycPercent: 100,
    });

    // 2. Insufficient Balance Customer (₹150 < ₹300 spend)
    const c2 = await registerAndSetupCustomer(2, {
      name: 'Low Balance Corp',
      cat: testCategory,
      topup: 150,
      dailyAdSpend: 300,
      campActive: true,
      activeDays: 'ALL',
      status: 'active',
      profileStatus: 'complete',
      paymentStatus: 'paid',
      kycPercent: 100,
    });

    // 3. Zero Balance Customer (₹0)
    const c3 = await registerAndSetupCustomer(3, {
      name: 'Zero Balance Ltd',
      cat: testCategory,
      topup: 0,
      dailyAdSpend: 300,
      campActive: true,
      activeDays: 'ALL',
      status: 'active',
      profileStatus: 'complete',
      paymentStatus: 'paid',
      kycPercent: 100,
    });

    // 4. Marketing Disabled Customer
    const c4 = await registerAndSetupCustomer(4, {
      name: 'Marketing Off Inc',
      cat: testCategory,
      topup: 1000,
      dailyAdSpend: 300,
      campActive: false,
      activeDays: 'ALL',
      status: 'active',
      profileStatus: 'complete',
      paymentStatus: 'paid',
      kycPercent: 100,
    });

    // 5. Suspended Account Customer
    const c5 = await registerAndSetupCustomer(5, {
      name: 'Suspended Account LLC',
      cat: testCategory,
      topup: 1000,
      dailyAdSpend: 300,
      campActive: true,
      activeDays: 'ALL',
      status: 'suspended',
      profileStatus: 'complete',
      paymentStatus: 'paid',
      kycPercent: 100,
    });

    // 6. Incomplete KYC Customer
    const c6 = await registerAndSetupCustomer(6, {
      name: 'Incomplete KYC Partner',
      cat: testCategory,
      topup: 1000,
      dailyAdSpend: 300,
      campActive: true,
      activeDays: 'ALL',
      status: 'active',
      profileStatus: 'incomplete',
      paymentStatus: 'pending',
      kycPercent: 40,
    });

    // 7. Other Group / Category Customer
    const c7 = await registerAndSetupCustomer(7, {
      name: 'Other Group Business',
      cat: otherCategory,
      topup: 1000,
      dailyAdSpend: 300,
      campActive: true,
      activeDays: 'ALL',
      status: 'active',
      profileStatus: 'complete',
      paymentStatus: 'paid',
      kycPercent: 100,
    });

    // Assign memberships
    await api(`/groups/${testGroupId}/members`, {
      method: 'POST',
      body: JSON.stringify({ customerIds: [c1.custId, c2.custId, c3.custId, c4.custId, c5.custId, c6.custId] }),
    });
    await api(`/groups/${otherGroupId}/members`, {
      method: 'POST',
      body: JSON.stringify({ customerIds: [c7.custId] }),
    });

    console.log('✅ All 7 accounts successfully created and assigned to groups.\n');

    // -------------------------------------------------------------------------
    // TEST CASE 9: Group Eligibility Counts Match Actual Preview
    // -------------------------------------------------------------------------
    console.log('--- Test 9: Group & Category Eligibility Counts ---');
    const grpListRes = await api('/groups');
    assert(grpListRes.ok && Array.isArray(grpListRes.data.groups), 'GET /api/groups returns 200 with groups list');
    const foundGroup = grpListRes.data.groups.find((g) => g.id === testGroupId);
    assert(Boolean(foundGroup), 'Target test group found in GET /api/groups');
    assert(
      foundGroup?.customerCount === 1,
      'Group customerCount strictly equals 1 (only the eligible customer c1 qualifies)',
      `Actual count: ${foundGroup?.customerCount}`
    );

    const prevRes = await api(`/categories/preview?category=${testCategory}&groupId=${testGroupId}`);
    assert(prevRes.ok, 'GET /api/categories/preview returns 200');
    assert(
      prevRes.data.eligibleCount === 1,
      'Preview eligibleCount is strictly 1',
      `Eligible: ${prevRes.data.eligibleCount}, Excluded: ${prevRes.data.excludedCount}`
    );
    assert(
      prevRes.data.recipients[0]?.customerId === c1.custId,
      'The sole eligible preview recipient is c1 (Eligible Enterprise)'
    );
    assert(
      prevRes.data.excludedCount === 5,
      'Preview correctly identifies and excludes the 5 non-qualifying members'
    );
    assert(
      prevRes.data.skippedBreakdown?.insufficientBalance >= 2,
      'Skipped breakdown reports insufficientBalance accounts (c2 & c3)'
    );

    // -------------------------------------------------------------------------
    // TEST CASE 13 (Part 1): Record Initial Wallet Balances Before Distribution
    // -------------------------------------------------------------------------
    const preBalances = new Map();
    for (const c of [c1, c2, c3, c4, c5, c6, c7]) {
      const getRes = await api(`/customers/${c.custId}`);
      preBalances.set(c.custId, Number(getRes.data?.customer?.balance ?? getRes.data?.customer?.walletBalance ?? 0));
    }

    // -------------------------------------------------------------------------
    // EXECUTE LEAD DISTRIBUTION
    // -------------------------------------------------------------------------
    console.log('\n--- Executing Master Lead Distribution ---');
    const distRes = await api('/leads/distribute', {
      method: 'POST',
      body: JSON.stringify({
        category: testCategory,
        groupId: testGroupId,
        contactNumber: '9876543210',
        title: 'Commercial Bulk Requirement',
        buyerName: 'Verified Enterprise Buyer',
      }),
    });

    assert(distRes.status === 201 && distRes.data.ok === true, 'POST /api/leads/distribute succeeds with HTTP 201');
    assert(distRes.data.recipientsCount === 1, 'Distribution returned recipientsCount === 1');
    const masterLeadId = distRes.data.masterLead?.id;
    assert(Boolean(masterLeadId), 'Master lead ID assigned', masterLeadId);

    // -------------------------------------------------------------------------
    // TEST CASE 1: Eligible Customer Receives Lead
    // -------------------------------------------------------------------------
    console.log('\n--- Test 1: Active Customer with Balance >= Spend Receives Lead ---');
    const c1Leads = await api(`/leads?customerId=${c1.custId}`);
    const c1HasLead = (c1Leads.data?.leads || []).some((l) => l.masterLeadId === masterLeadId || l.master_lead_id === masterLeadId);
    assert(c1HasLead, 'Eligible Customer (c1) received lead in their pipeline inbox');

    // -------------------------------------------------------------------------
    // TEST CASE 2: Insufficient Balance Customer Receives No Lead
    // -------------------------------------------------------------------------
    console.log('\n--- Test 2: Low Balance Customer Receives No Lead ---');
    const c2Leads = await api(`/leads?customerId=${c2.custId}`);
    const c2HasLead = (c2Leads.data?.leads || []).some((l) => l.masterLeadId === masterLeadId || l.master_lead_id === masterLeadId);
    assert(!c2HasLead, 'Customer with ₹150 balance (< ₹300 spend) received NO lead');

    // -------------------------------------------------------------------------
    // TEST CASE 3: Zero Balance Customer Receives No Lead
    // -------------------------------------------------------------------------
    console.log('\n--- Test 3: Zero Balance Customer Receives No Lead ---');
    const c3Leads = await api(`/leads?customerId=${c3.custId}`);
    const c3HasLead = (c3Leads.data?.leads || []).some((l) => l.masterLeadId === masterLeadId || l.master_lead_id === masterLeadId);
    assert(!c3HasLead, 'Customer with ₹0 balance received NO lead');

    // -------------------------------------------------------------------------
    // TEST CASE 4: Marketing Disabled Customer Receives No Lead
    // -------------------------------------------------------------------------
    console.log('\n--- Test 4: Marketing Paused Customer Receives No Lead ---');
    const c4Leads = await api(`/leads?customerId=${c4.custId}`);
    const c4HasLead = (c4Leads.data?.leads || []).some((l) => l.masterLeadId === masterLeadId || l.master_lead_id === masterLeadId);
    assert(!c4HasLead, 'Customer with marketing disabled received NO lead');

    // -------------------------------------------------------------------------
    // TEST CASE 5: Suspended Account Receives No Lead
    // -------------------------------------------------------------------------
    console.log('\n--- Test 5: Suspended Account Receives No Lead ---');
    const c5Leads = await api(`/leads?customerId=${c5.custId}`);
    const c5HasLead = (c5Leads.data?.leads || []).some((l) => l.masterLeadId === masterLeadId || l.master_lead_id === masterLeadId);
    assert(!c5HasLead, 'Customer with suspended account status received NO lead');

    // -------------------------------------------------------------------------
    // TEST CASE 6: Incomplete KYC Receives No Lead
    // -------------------------------------------------------------------------
    console.log('\n--- Test 6: Incomplete KYC Receives No Lead ---');
    const c6Leads = await api(`/leads?customerId=${c6.custId}`);
    const c6HasLead = (c6Leads.data?.leads || []).some((l) => l.masterLeadId === masterLeadId || l.master_lead_id === masterLeadId);
    assert(!c6HasLead, 'Customer with incomplete KYC received NO lead');

    // -------------------------------------------------------------------------
    // TEST CASE 7: Customer Outside Group Receives No Lead
    // -------------------------------------------------------------------------
    console.log('\n--- Test 7: Customer Outside Target Group Receives No Lead ---');
    const c7Leads = await api(`/leads?customerId=${c7.custId}`);
    const c7HasLead = (c7Leads.data?.leads || []).some((l) => l.masterLeadId === masterLeadId || l.master_lead_id === masterLeadId);
    assert(!c7HasLead, 'Customer belonging to another group received NO lead');

    // -------------------------------------------------------------------------
    // TEST CASE 13 (Part 2): Zero Wallet Deductions Verification
    // -------------------------------------------------------------------------
    console.log('\n--- Test 13: Financial Safety — Zero Wallet Deductions ---');
    let anyBalanceChanged = false;
    for (const c of [c1, c2, c3, c4, c5, c6, c7]) {
      const getRes = await api(`/customers/${c.custId}`);
      const postBal = Number(getRes.data?.customer?.balance ?? getRes.data?.customer?.walletBalance ?? 0);
      const preBal = preBalances.get(c.custId);
      if (postBal !== preBal) {
        anyBalanceChanged = true;
        console.error(`  ❌ Balance changed for ${c.name}: ${preBal} -> ${postBal}`);
      }
    }
    assert(!anyBalanceChanged, 'All 7 customer wallet balances are 100% UNCHANGED (zero wallet deductions)');

    // -------------------------------------------------------------------------
    // TEST CASE 8: Duplicate Distribution Prevention
    // -------------------------------------------------------------------------
    console.log('\n--- Test 8: Duplicate Master Lead Distribution Prevention ---');
    const prevDup = await api(`/categories/preview?category=${testCategory}&groupId=${testGroupId}&masterLeadId=${masterLeadId}`);
    assert(
      prevDup.ok && prevDup.data.eligibleCount === 0,
      'Preview with existing masterLeadId identifies c1 as already received, returning 0 eligible',
      `Eligible count: ${prevDup.data?.eligibleCount}`
    );

    // -------------------------------------------------------------------------
    // TEST CASE 10: Dynamic Revalidation Between Preview and Distribution
    // -------------------------------------------------------------------------
    console.log('\n--- Test 10: Dynamic Revalidation (Balance Drop After Preview) ---');
    // Drop c1's balance to ₹50 via PATCH
    await api(`/customers/${c1.custId}`, {
      method: 'PATCH',
      body: JSON.stringify({ balance: 50 }),
    });

    // Attempt second distribution
    const dropDistRes = await api('/leads/distribute', {
      method: 'POST',
      body: JSON.stringify({
        category: testCategory,
        groupId: testGroupId,
        contactNumber: '9876543211',
        title: 'Second Inbound Requirement',
      }),
    });

    // -------------------------------------------------------------------------
    // TEST CASE 14: Zero Eligible Recipients Returns Truthful HTTP 400
    // -------------------------------------------------------------------------
    console.log('\n--- Test 14: Truthful Error Response When 0 Eligible ---');
    assert(
      dropDistRes.status === 400,
      'POST /api/leads/distribute returns HTTP 400 when 0 customers qualify'
    );
    assert(
      dropDistRes.data.error === 'No Eligible Customers',
      'Response error is exactly "No Eligible Customers"',
      `Actual error: ${dropDistRes.data.error}`
    );
    assert(
      dropDistRes.data.message?.includes('No customers in this group currently meet the wallet balance and marketing eligibility requirements'),
      'Response message accurately informs user about wallet balance and campaign status'
    );
    assert(
      dropDistRes.data.eligibleCount === 0,
      'Response eligibleCount is 0'
    );
    assert(
      dropDistRes.data.skippedBreakdown?.insufficientBalance >= 1,
      'Skipped breakdown reports insufficientBalance count'
    );

    // -------------------------------------------------------------------------
    // TEST CASE 11: Multi-Tenant Customer Pipeline Isolation
    // -------------------------------------------------------------------------
    console.log('\n--- Test 11: Multi-Tenant Lead Isolation ---');
    const c1Inbox = await api(`/leads?customerId=${c1.custId}`);
    const c2Inbox = await api(`/leads?customerId=${c2.custId}`);
    assert(
      (c1Inbox.data?.leads || []).every((l) => (l.customerId || l.customer_id) === c1.custId),
      'Customer 1 inbox only contains leads scoped to Customer 1'
    );
    assert(
      (c2Inbox.data?.leads || []).length === 0,
      'Customer 2 inbox contains 0 leads'
    );

    // -------------------------------------------------------------------------
    // TEST CASE 12: Distribution History Accurately Reflects Actual Recipients
    // -------------------------------------------------------------------------
    console.log('\n--- Test 12: Distribution History Truthfulness ---');
    const histRes = await api('/leads/distribution-history');
    assert(histRes.ok && Array.isArray(histRes.data.history), 'GET /api/leads/distribution-history returns 200');
    const loggedEntry = histRes.data.history.find((h) => h.id === masterLeadId);
    assert(Boolean(loggedEntry), 'Distributed master lead appears in distribution history ledger');
    assert(
      loggedEntry?.totalRecipients === 1,
      'History totalRecipients is strictly 1 (reflects only the 1 eligible customer)',
      `totalRecipients: ${loggedEntry?.totalRecipients}`
    );

    // -------------------------------------------------------------------------
    // CLEANUP
    // -------------------------------------------------------------------------
    console.log('\n🧹 Cleaning up test accounts from database...');
    for (const cId of registeredCustomerIds) {
      await api(`/customers/${cId}`, { method: 'DELETE' });
    }
    if (testGroupId) await api(`/groups/${testGroupId}`, { method: 'DELETE' });
    if (otherGroupId) await api(`/groups/${otherGroupId}`, { method: 'DELETE' });
    console.log('✅ Cleanup complete.');

  } catch (err) {
    console.error('💥 Test suite runtime exception:', err);
    failedCount++;
  } finally {
    if (serverProcess) {
      console.log('🛑 Stopping backend server process...');
      serverProcess.kill('SIGTERM');
    }
  }

  console.log('\n======================================================================');
  console.log(`📊 TEST SUITE SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('======================================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTestSuite();
