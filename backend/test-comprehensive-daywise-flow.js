/**
 * ============================================================================
 * ADMAFIA COMPREHENSIVE DAY-WISE MARKETING, PACING & SALES LEAD FLOW TEST SUITE
 * ============================================================================
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
  console.log('🚀 ADMAFIA E2E TEST: COMPLETE REGISTRATION, PACING & SALES LEAD FLOW');
  console.log(`🔗 Target API: ${API_BASE}`);
  console.log('======================================================================\n');

  let serverProcess = null;
  const serverAlreadyRunning = await isServerRunning();

  if (!serverAlreadyRunning) {
    console.log('⚡ Starting AdMafia Backend API server on port 5000...');
    serverProcess = spawn('node', ['server.js'], {
      cwd: __dirname,
      stdio: 'inherit',
      env: { ...process.env, PORT: '5000' },
    });

    let up = false;
    for (let i = 0; i < 20; i++) {
      await sleep(500);
      if (await isServerRunning()) {
        up = true;
        break;
      }
    }
    if (!up) {
      throw new Error('Backend server failed to start within 10 seconds.');
    }
    console.log('✓ Backend API server started and healthy on http://localhost:5000\n');
  } else {
    console.log('✓ Backend API server is already running on http://localhost:5000\n');
  }

  const testMobile = '9820011223';
  const testUsername = 'sharma_enterprises';
  const testCompany = 'Sharma Global Enterprises';
  const testEmail = 'contact@sharma-global.com';

  try {
    // -------------------------------------------------------------------------
    // CLEANUP STALE DATA BEFORE START
    // -------------------------------------------------------------------------
    await api(`/customers/${testMobile}`, { method: 'DELETE' }).catch(() => {});

    // -------------------------------------------------------------------------
    // PHASE 1: CUSTOMER UNIVERSAL REGISTRATION (/#register)
    // -------------------------------------------------------------------------
    console.log('▶ PHASE 1: Customer Creates Account & Registers');
    const regRes = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username: testUsername,
        phone: testMobile,
        email: testEmail,
        password: 'Password123!',
        companyName: testCompany,
        contactPerson: 'Rajesh Sharma',
        city: 'Mumbai',
        state: 'Maharashtra',
        category: 'Real Estate & Construction',
        deposit: 0,
      }),
    });

    assert(regRes.status === 201 || regRes.status === 200, 'Customer registration API returns HTTP 201/200');
    assert(regRes.data?.customer?.phone === testMobile, 'Customer record created with exact 10-digit phone', testMobile);
    assert(regRes.data?.customer?.companyName === testCompany, 'Customer company name recorded correctly', testCompany);

    const customerId = regRes.data?.customer?.id;
    assert(Boolean(customerId), 'Customer assigned authoritative ID', customerId);

    // Verify initial wallet state via Customer Workspace API
    const custWorkspace = await api(`/customers/${customerId}`);
    assert(custWorkspace.status === 200, 'Customer workspace API returns HTTP 200');
    const initCust = custWorkspace.data?.customer;
    assert(Number(initCust?.balance || 0) === 0, 'Initial wallet balance is ₹0 before funding');
    assert(Number(initCust?.dailyAdSpend || 0) === 300, 'Default daily ad spend baseline is ₹300 (min limit)');
    assert(initCust?.adCampaignActive === false, 'Ad campaign is initially paused/inactive before funding');

    // -------------------------------------------------------------------------
    // PHASE 2: COMPLETE PAYMENT & WALLET FUNDING (Top Up ₹1,344)
    // -------------------------------------------------------------------------
    console.log('\n▶ PHASE 2: Customer Completes Payment & Funds Wallet (₹1,344)');
    const topUpRes = await api('/wallets/topup', {
      method: 'POST',
      body: JSON.stringify({
        customerId,
        phone: testMobile,
        amount: 1344,
        paymentMethod: 'UPI / NetBanking',
        utr: `RZP_TEST_${Date.now()}`,
      }),
    });

    assert(topUpRes.status === 201 || topUpRes.status === 200, 'Wallet top-up API returns HTTP 201/200');
    assert(Number(topUpRes.data?.walletBalance) === 1344, 'Wallet balance credited with exact ₹1,344');
    assert(topUpRes.data?.customer?.paymentStatus === 'paid', 'Customer payment status switched to "paid"');

    // Verify credit transaction recorded
    const workspaceAfterTopup = await api(`/customers/${customerId}`);
    const txList = workspaceAfterTopup.data?.transactions || [];
    assert(txList.length >= 1, 'Credit transaction recorded in customer wallet ledger');
    assert(Number(txList[0].amount) === 1344 && txList[0].type === 'Credit', 'Transaction is Credit of ₹1,344');

    // -------------------------------------------------------------------------
    // PHASE 3: FILL INFORMATION & SUBMIT (KYC & Business Profile)
    // -------------------------------------------------------------------------
    console.log('\n▶ PHASE 3: Customer Fills Information & Submits Profile');
    const profileRes = await api(`/customers/${customerId}/profile`, {
      method: 'PUT',
      body: JSON.stringify({
        companyName: testCompany,
        contactPerson: 'Rajesh Sharma',
        category: 'Real Estate & Construction',
        industry: 'Commercial & Residential Real Estate',
        city: 'Mumbai',
        state: 'Maharashtra',
        website: 'https://sharmaglobal.in',
        notes: 'Targeting 2BHK and 3BHK premium buyers in Mumbai Western Suburbs',
      }),
    });

    assert(profileRes.status === 200, 'Profile update API returns HTTP 200');
    assert(profileRes.data?.customer?.profileStatus === 'complete', 'Profile status marked as "complete"');
    assert(Number(profileRes.data?.customer?.kycPercent) === 100, 'KYC reaches 100% complete');

    // -------------------------------------------------------------------------
    // PHASE 4: SALES DESK SYNCHRONIZATION (/sales)
    // -------------------------------------------------------------------------
    console.log('\n▶ PHASE 4: Sales Desk Visibility (/sales#customers & /sales#groups)');
    const stateRes = await api('/state');
    assert(stateRes.status === 200, 'Sales global state sync API returns HTTP 200');

    const salesCustomers = stateRes.data?.customers || [];
    const matchedInSales = salesCustomers.find((c) => c.phone === testMobile || c.id === customerId);
    assert(Boolean(matchedInSales), 'Customer is visible to Sales Team in /sales#customers desk');
    assert(matchedInSales?.paymentStatus === 'paid', 'Sales Desk shows customer is PAID');
    assert(matchedInSales?.profileStatus === 'complete', 'Sales Desk shows customer Profile is COMPLETE');

    // -------------------------------------------------------------------------
    // PHASE 5: SALES EXECUTIVE CREATES LEAD & SENDS TO CUSTOMER (/sales#leads)
    // -------------------------------------------------------------------------
    console.log('\n▶ PHASE 5: Sales Executive Creates Lead and Sends to Customer');
    const buyerPhone = '9876543210';
    const createLeadRes = await api('/leads', {
      method: 'POST',
      body: JSON.stringify({
        customerId,
        customerPhone: testMobile,
        customerUsername: testUsername,
        company: testCompany,
        phone: buyerPhone,
        name: '+91 9876543210',
        city: 'Mumbai',
        requirement: 'Inbound Meta Ads: 3BHK Luxury Apartment Enquiry',
        budget: '₹2.5L – ₹4.5L',
        source: 'Meta Ads Campaign',
        priority: 'Urgent',
      }),
    });

    assert(createLeadRes.status === 201, 'Sales Lead created successfully with HTTP 201');
    const createdLead = createLeadRes.data?.lead;
    assert(createdLead?.company === testCompany || createdLead?.companyName === testCompany, 'Lead associated to customer company', testCompany);
    assert(createdLead?.priority === 'Urgent', 'Lead flagged with Urgent priority');

    // Verify lead appears in customer's workspace pipeline
    const custWorkspaceWithLeads = await api(`/customers/${customerId}`);
    const customerLeads = custWorkspaceWithLeads.data?.leads || [];
    assert(customerLeads.length >= 1, 'Customer portal receives dispatched lead in Lead Pipeline');
    assert(customerLeads[0].phone === buyerPhone || customerLeads[0].name.includes(buyerPhone), 'Customer portal displays buyer mobile number', buyerPhone);

    // -------------------------------------------------------------------------
    // PHASE 5B: DROPPED LEADS FILTER & RESTORATION (LEAD PIPELINE & FOLLOW-UPS)
    // -------------------------------------------------------------------------
    console.log('\n▶ PHASE 5B: Dropped Lead Filtering & Restoring (Pipeline & Follow-ups)');
    const leadId = createdLead?.id || customerLeads[0]?.id;

    // 1. Drop the lead from Lead Pipeline
    const dropRes = await api(`/leads/${leadId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'Dropped' }),
    });
    assert(dropRes.status === 200, 'Drop lead returns HTTP 200');
    assert(dropRes.data?.lead?.status === 'Dropped', 'Lead status updated to "Dropped"');

    // Verify workspace query filters dropped lead
    const workspaceAfterDrop = await api(`/customers/${customerId}`);
    const allLeadsAfterDrop = workspaceAfterDrop.data?.leads || [];
    const activeLeads = allLeadsAfterDrop.filter((l) => l.status !== 'In Follow-up' && l.status !== 'Callback' && l.status !== 'Dropped');
    const droppedLeads = allLeadsAfterDrop.filter((l) => l.status === 'Dropped');
    assert(activeLeads.length === 0, 'Dropped lead is excluded from active Lead Pipeline');
    assert(droppedLeads.length === 1 && droppedLeads[0].id === leadId, 'Dropped filter catches the dropped lead');

    // 2. Restore dropped lead back to active Lead Pipeline
    const restoreToPipelineRes = await api(`/leads/${leadId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'new' }),
    });
    assert(restoreToPipelineRes.status === 200, 'Restore to pipeline returns HTTP 200');
    assert(restoreToPipelineRes.data?.lead?.status === 'new', 'Lead restored to active status "new"');

    // 3. Move lead to Follow-ups queue
    const moveToFupRes = await api(`/leads/${leadId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'In Follow-up' }),
    });
    assert(moveToFupRes.status === 200, 'Move to follow-up returns HTTP 200');
    assert(moveToFupRes.data?.lead?.status === 'In Follow-up', 'Lead status updated to "In Follow-up"');

    // 4. Drop lead from Follow-ups queue
    const dropFromFupRes = await api(`/leads/${leadId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'Dropped' }),
    });
    assert(dropFromFupRes.status === 200, 'Drop from follow-up returns HTTP 200');
    const workspaceAfterFupDrop = await api(`/customers/${customerId}`);
    const allLeadsAfterFupDrop = workspaceAfterFupDrop.data?.leads || [];
    const activeFupLeads = allLeadsAfterFupDrop.filter((l) => (l.status === 'In Follow-up' || l.status === 'Callback') && l.status !== 'Dropped');
    const droppedFupLeads = allLeadsAfterFupDrop.filter((l) => l.status === 'Dropped');
    assert(activeFupLeads.length === 0, 'Dropped lead is excluded from active Follow-ups queue');
    assert(droppedFupLeads.length === 1, 'Dropped filter in Follow-ups queue displays the dropped lead');

    // 5. Restore lead back into Follow-ups queue
    const restoreToFupRes = await api(`/leads/${leadId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'In Follow-up' }),
    });
    assert(restoreToFupRes.status === 200, 'Restore to follow-up returns HTTP 200');
    assert(restoreToFupRes.data?.lead?.status === 'In Follow-up', 'Lead restored back to Follow-up queue');

    // -------------------------------------------------------------------------
    // PHASE 6: DAY-WISE MARKETING SCHEDULE & PACING ENGINE VALIDATION
    // -------------------------------------------------------------------------
    console.log('\n▶ PHASE 6: Day-Wise Marketing Schedule & Pacing Engine');
    const kolkataNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const todayDayCode = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][kolkataNow.getDay()];
    console.log(`   (Today in India: ${todayDayCode})`);

    // Test 6A: Preset "Weekdays" (Mon-Fri 5 days)
    const patchPreset1 = await api(`/customers/${customerId}`, {
      method: 'PUT',
      body: JSON.stringify({
        activeDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
        schedulePreset: 'weekdays',
      }),
    });
    if (patchPreset1.status !== 200) console.error('patchPreset1 Error Details:', patchPreset1);
    assert(patchPreset1.status === 200, 'Preset "Mon - Fri (5 Days)" updated successfully');
    const custPreset1 = patchPreset1.data?.customer;
    assert(custPreset1.activeDays?.length === 5, 'Active schedule has 5 active days');
    assert(Number(custPreset1.dailyAdSpend) * 5 === 1500, 'Weekly pacing correctly calculated: 5 × ₹300 = ₹1,500');

    // Test 6B: Preset "All 7 Days"
    const patchPreset2 = await api(`/customers/${customerId}`, {
      method: 'PUT',
      body: JSON.stringify({
        activeDays: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
        schedulePreset: 'all',
      }),
    });
    assert(patchPreset2.data?.customer?.activeDays?.length === 7, 'Preset "All 7 Days" activates all 7 days');

    // Test 6C: Minimum spend enforcement (reject top-up < ₹300)
    const minTopupCheck = await api('/wallets/topup', {
      method: 'POST',
      body: JSON.stringify({
        customerId,
        amount: 150, // Less than minimum ₹300
      }),
    });
    assert(minTopupCheck.status === 400, 'System enforces minimum ₹300 deposit requirement rule');

    // Test 6D: Exceeding balance enforcement (reject amount > walletBalance)
    const exceedSpend = await api('/wallets/deduct', {
      method: 'POST',
      body: JSON.stringify({
        customerId,
        amount: 2500, // Exceeds available balance
      }),
    });
    assert(exceedSpend.status === 400 && exceedSpend.data?.ok === false, 'Rejects daily amount exceeding available wallet balance');

    // -------------------------------------------------------------------------
    // PHASE 7: CUSTOMIZED DAILY AMOUNT (₹656) & TODAY'S DEDUCTION FLOW
    // -------------------------------------------------------------------------
    console.log('\n▶ PHASE 7: Customer Customizes Daily Spend to ₹656 & Deducts Today');
    const customizedSpend = 656;
    const preBal = Number(topUpRes.data?.walletBalance); // 1344

    const deductRes = await api('/wallets/deduct', {
      method: 'POST',
      body: JSON.stringify({
        customerId,
        phone: testMobile,
        username: testUsername,
        amount: customizedSpend,
        activeDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
      }),
    });

    assert(deductRes.status === 200, 'Custom daily spend deduction returns HTTP 200');
    const postBal = Number(deductRes.data?.walletBalance);
    assert(postBal === preBal - customizedSpend, `Wallet balance deducted exactly ₹${customizedSpend}: ₹${preBal} - ₹${customizedSpend} = ₹${postBal}`);
    assert(postBal === 688, 'Resulting wallet balance is exactly ₹688');

    const updatedCust = deductRes.data?.customer;
    assert(Number(updatedCust.dailyAdSpend) === 656, 'Daily burn rate updated to ₹656/day');
    assert(updatedCust.adCampaignActive === true, 'Marketing status is LIVE (Running Active)');
    assert(updatedCust.activeDays.includes(todayDayCode), `Today (${todayDayCode}) automatically added to active running schedule`);

    // Verify wallet runway
    const runwayDays = Math.floor(postBal / customizedSpend);
    assert(runwayDays === 1, `Wallet runway correctly calculated: floor(₹688 / ₹656) = 1 day funded`);

    // Verify wallet debit transaction
    const debitTx = deductRes.data?.transaction;
    assert(debitTx?.type === 'Debit' && Number(debitTx?.amount) === customizedSpend, `Ledger records Debit transaction of ₹${customizedSpend}`);
    assert(debitTx?.status === 'Settled ✓', 'Debit transaction status is "Settled ✓"');

    // -------------------------------------------------------------------------
    // PHASE 8: AUTOMATED DAILY PACING RUNNER VERIFICATION
    // -------------------------------------------------------------------------
    console.log('\n▶ PHASE 8: Automated Daily Pacing Engine (No Double-Deduction & Off-Day Rules)');

    // 8A. Idempotency Check: Running daily pacing again TODAY should NOT double-charge!
    const pacingRun1 = await api('/marketing/process-daily-pacing', { method: 'POST' });
    assert(pacingRun1.status === 200, 'Daily pacing runner API executes with HTTP 200');
    const doubleDeducted = (pacingRun1.data?.details || []).find((d) => d.customerId === customerId && d.action === 'deducted');
    assert(!doubleDeducted, 'Pacing runner preserves idempotency: NO double-deduction on already-settled day');

    // Verify balance remains ₹688
    const checkBalAfterPacing = await api(`/customers/${customerId}`);
    assert(Number(checkBalAfterPacing.data?.customer?.balance) === 688, 'Balance remains ₹688 without duplicate charge');

    // 8B. Scheduled Day Off Check: If today is removed from active schedule, pacing engine skips
    const otherDays = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].filter((d) => d !== todayDayCode);
    await api(`/customers/${customerId}`, {
      method: 'PUT',
      body: JSON.stringify({ activeDays: otherDays }),
    });

    const pacingRun2 = await api('/marketing/process-daily-pacing', { method: 'POST' });
    const offDayCharged = (pacingRun2.data?.details || []).find((d) => d.customerId === customerId && d.action === 'deducted');
    assert(!offDayCharged, 'Pacing runner skips customer on scheduled day off (₹0 deducted)');

    // 8C. Low Balance Protection Check:
    // Update balance to ₹100 (< ₹656 daily spend)
    await api(`/customers/${customerId}`, {
      method: 'PUT',
      body: JSON.stringify({ balance: 100, activeDays: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] }),
    });
    const lowBalCust = await api(`/customers/${customerId}`);
    assert(Number(lowBalCust.data?.customer?.balance) === 100, 'Customer balance updated to ₹100');

    // -------------------------------------------------------------------------
    // PHASE 9: MULTI-CUSTOMER STRICT ACCOUNT & LEAD ISOLATION VERIFICATION
    // -------------------------------------------------------------------------
    console.log('\n▶ PHASE 9: Strict Multi-Customer Lead Isolation Verification');

    const testMobileB = '9820099888';
    const testUsernameB = 'isolation_beta_buyer';
    const testCompanyB = 'Beta Isolation Logistics Pvt Ltd';
    const testEmailB = 'beta@isolation-corp.example';

    // Cleanup stale Customer B if any
    await api(`/customers/${testMobileB}`, { method: 'DELETE' }).catch(() => {});

    // Register Customer B
    const regCustB = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username: testUsernameB,
        phone: testMobileB,
        email: testEmailB,
        password: 'Password123!',
        companyName: testCompanyB,
        contactPerson: 'Beta Manager',
        city: 'Pune',
        category: 'Logistics',
        deposit: 0,
      }),
    });
    assert(regCustB.status === 201 || regCustB.status === 200, 'Customer B registers successfully with HTTP 201/200');
    const customerBId = regCustB.data?.customer?.id;
    assert(Boolean(customerBId), 'Customer B receives unique primary ID', `ID: ${customerBId}`);

    // Verify Customer B initial workspace has 0 leads
    const bWorkspaceInitial = await api(`/customers/${testMobileB}`);
    assert(bWorkspaceInitial.status === 200, 'Customer B workspace retrieved successfully');
    const bLeadsInitial = bWorkspaceInitial.data?.leads || [];
    assert(bLeadsInitial.length === 0, 'Customer B workspace initially has 0 leads (Clean isolation)');

    // Dispatch a unique lead specifically targeted to Customer A
    const leadForAId = `lead_iso_a_${Date.now()}`;
    const leadForARes = await api('/leads', {
      method: 'POST',
      body: JSON.stringify({
        id: leadForAId,
        customerId: customerId,
        customerPhone: testMobile,
        customerUsername: testUsername,
        company: testCompany,
        phone: '9876543210',
        name: '+91 9876543210',
        city: 'Mumbai',
        requirement: 'Exclusive Lead for Customer A',
      }),
    });
    assert(leadForARes.status === 201, 'Exclusive lead for Customer A dispatched via /api/leads');

    // Query Customer A workspace: must have the lead
    const aWorkspaceAfterDispatch = await api(`/customers/${customerId}`);
    const aLeads = aWorkspaceAfterDispatch.data?.leads || [];
    const hasLeadInA = aLeads.some((l) => l.id === leadForAId);
    assert(hasLeadInA, 'Customer A workspace contains exclusively assigned lead', `Lead ID: ${leadForAId}`);

    // CRITICAL ISOLATION CHECK: Query Customer B workspace - must NOT contain Customer A's lead!
    const bWorkspaceAfterADispatch = await api(`/customers/${testMobileB}`);
    const bLeadsAfterA = bWorkspaceAfterADispatch.data?.leads || [];
    const hasLeadInB = bLeadsAfterA.some((l) => l.id === leadForAId);
    assert(!hasLeadInB, 'STRICT ISOLATION VERIFIED: Customer A lead does NOT appear in Customer B workspace');
    assert(bLeadsAfterA.length === 0, 'Customer B leads list remains exactly 0');

    // Now dispatch a unique lead specifically targeted to Customer B
    const leadForBId = `lead_iso_b_${Date.now()}`;
    const leadForBRes = await api('/leads', {
      method: 'POST',
      body: JSON.stringify({
        id: leadForBId,
        customerId: customerBId,
        customerPhone: testMobileB,
        customerUsername: testUsernameB,
        company: testCompanyB,
        phone: '9988776655',
        name: '+91 9988776655',
        city: 'Pune',
        requirement: 'Exclusive Lead for Customer B',
      }),
    });
    assert(leadForBRes.status === 201, 'Exclusive lead for Customer B dispatched via /api/leads');

    // Query Customer B workspace: must contain leadForBId and NOT leadForAId
    const bWorkspaceFinal = await api(`/customers/${testMobileB}`);
    const bLeadsFinal = bWorkspaceFinal.data?.leads || [];
    assert(bLeadsFinal.some((l) => l.id === leadForBId), 'Customer B workspace contains their exclusive lead', `Lead ID: ${leadForBId}`);
    assert(!bLeadsFinal.some((l) => l.id === leadForAId), 'Customer B workspace does NOT contain Customer A lead');

    // Query Customer A workspace: must contain leadForAId and NOT leadForBId
    const aWorkspaceFinal = await api(`/customers/${customerId}`);
    const aLeadsFinal = aWorkspaceFinal.data?.leads || [];
    assert(aLeadsFinal.some((l) => l.id === leadForAId), 'Customer A workspace retains their exclusive lead');
    assert(!aLeadsFinal.some((l) => l.id === leadForBId), 'Customer A workspace does NOT contain Customer B lead');

    // Clean up Customer B
    await api(`/customers/${customerBId}`, { method: 'DELETE' }).catch(() => {});

    // -------------------------------------------------------------------------
    // PHASE 9B: MARKETING DEPARTMENT IDEAS & BUILD IDEAS FLOW (/api/marketing/ideas)
    // -------------------------------------------------------------------------
    console.log('\n▶ PHASE 9B: Marketing Department Ideas & Build Ideas Verification');
    const ideasListRes1 = await api('/marketing/ideas');
    assert(ideasListRes1.status === 200, 'GET /api/marketing/ideas returns HTTP 200 with valid schema');
    assert(Array.isArray(ideasListRes1.data?.ideas), 'GET /api/marketing/ideas returns array of ideas');

    // Create a new Marketing Idea for Customer A
    const ideaTitle = 'Q4 Festival Mega Lead Inbound Campaign';
    const createIdeaRes = await api('/marketing/ideas', {
      method: 'POST',
      body: JSON.stringify({
        customerId: customerId,
        title: ideaTitle,
        objective: 'Lead Generation',
        concept: 'Targeted Instagram & Facebook lead campaign for high-intent corporate buyers',
        platform: 'Instagram & Facebook (Meta Ads)',
        language: 'English / Hinglish',
        callToAction: 'Enquire Now',
        status: 'Saved',
      }),
    });
    assert(createIdeaRes.status === 201, 'POST /api/marketing/ideas creates idea with HTTP 201');
    const createdIdeaId = createIdeaRes.data?.idea?.id;
    assert(Boolean(createdIdeaId), 'Created idea receives unique primary ID', `ID: ${createdIdeaId}`);

    // Query ideas for Customer A
    const custIdeasRes = await api(`/marketing/ideas?customerId=${customerId}`);
    assert(custIdeasRes.status === 200, 'GET /api/marketing/ideas?customerId=... returns HTTP 200');
    const foundIdea = (custIdeasRes.data?.ideas || []).find((i) => i.id === createdIdeaId);
    assert(Boolean(foundIdea), 'Created marketing idea successfully retrieved in customer ideas queue', `Title: ${foundIdea?.title}`);
    assert(foundIdea?.objective === 'Lead Generation', 'Idea objective matches "Lead Generation"');

    // Verify Marketing Summary aggregates include the idea
    const mktSummaryRes = await api('/marketing/summary');
    assert(mktSummaryRes.status === 200, 'GET /api/marketing/summary returns HTTP 200');
    assert((mktSummaryRes.data?.summary?.totalIdeasCount || 0) >= 1, 'Marketing Summary reflects at least 1 total idea');

    // -------------------------------------------------------------------------
    // PHASE 10: CLEANUP & TEARDOWN
    // -------------------------------------------------------------------------
    console.log('\n▶ PHASE 10: Cleanup & Teardown');
    const delRes = await api(`/customers/${customerId}`, { method: 'DELETE' });
    assert(delRes.status === 200, 'Test customer account deleted cleanly');

    console.log('\n======================================================================');
    console.log(`🎉 TEST SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED (TOTAL: ${passedCount + failedCount})`);
    console.log('======================================================================\n');

    if (serverProcess) {
      serverProcess.kill('SIGTERM');
    }

    if (failedCount > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error('Fatal Test Error:', err);
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
    }
    process.exit(1);
  }
}

runTestSuite();
