/**
 * ============================================================================
 * ADMAFIA MARKETING DEPARTMENT — DYNAMIC END-TO-END AUTOMATED TEST SUITE
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
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function runMarketingTests() {
  console.log('======================================================================');
  console.log('🚀 RUNNING ADMAFIA MARKETING DEPARTMENT END-TO-END TEST SUITE');
  console.log(`🔗 Target API: ${API_BASE}`);
  console.log('======================================================================\n');

  let custA_id = null;
  let custB_id = null;
  let ideaA_id = null;
  let postA_id = null;
  let postB_id = null;
  let campA_id = null;

  try {
    // -------------------------------------------------------------------------
    // 1️⃣ Setup Test Customers: Customer Alpha & Customer Beta
    // -------------------------------------------------------------------------
    console.log('1️⃣  Creating Completed Eligible Customers Alpha & Beta...');
    const regA = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        companyName: 'Alpha Tech Systems',
        contactName: 'Anil Kumar',
        phone: '9888811111',
        email: 'anil@alphatech.com',
        businessType: 'IT & Software',
        city: 'Pune',
        initialDeposit: 1500, // Meets min deposit requirement
      }),
    });
    if (regA.status !== 201) console.error('regA failed:', regA);
    assert(regA.status === 201, 'Customer Alpha registered successfully');
    custA_id = regA.data.customer?.id;

    const regB = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        companyName: 'Beta Real Estate Group',
        contactName: 'Bhavesh Shah',
        phone: '9888822222',
        email: 'bhavesh@betarealty.com',
        businessType: 'Real Estate & Infrastructure',
        city: 'Mumbai',
        initialDeposit: 0,
      }),
    });
    assert(regB.status === 201, 'Customer Beta registered successfully');
    custB_id = regB.data.customer?.id;

    // -------------------------------------------------------------------------
    // 2️⃣ Verify Completed Registration Eligibility & Summary
    // -------------------------------------------------------------------------
    console.log('\n2️⃣  Verifying Completed Registration Eligibility (/api/marketing/summary)...');
    const sumRes = await api('/marketing/summary');
    assert(sumRes.status === 200, 'GET /api/marketing/summary returned 200 OK');
    assert(sumRes.data.summary.completedCustomersCount >= 2, 'Summary counts both completed test accounts');
    assert(Number(sumRes.data.summary.totalWalletBalance) >= 1500, 'Summary reflects live authoritative wallet balance');

    // -------------------------------------------------------------------------
    // 3️⃣ Verify Customer Listing, Filtering & Wallet Balance Retrieval
    // -------------------------------------------------------------------------
    console.log('\n3️⃣  Verifying Customer Listing & Filters (/api/marketing/customers)...');
    const custList = await api('/marketing/customers?q=Alpha');
    assert(custList.status === 200, 'Search by customer name returned 200');
    assert(custList.data.customers.length === 1, 'Search strictly isolated Customer Alpha');
    assert(custList.data.customers[0].availableBalance === 1500, 'Customer Alpha wallet balance is exactly ₹1,500');

    // -------------------------------------------------------------------------
    // 4️⃣ Verify Wallet Transactions Ledger
    // -------------------------------------------------------------------------
    console.log('\n4️⃣  Verifying Authoritative Wallet Ledger (/api/marketing/customers/:id/wallet-transactions)...');
    const walTx = await api(`/marketing/customers/${custA_id}/wallet-transactions`);
    assert(walTx.status === 200, 'Customer Alpha ledger returned 200');
    assert(walTx.data.transactions.length >= 1, 'Initial deposit recorded in wallet ledger');
    assert(walTx.data.availableBalance === 1500, 'Ledger available balance matches wallet record');

    // -------------------------------------------------------------------------
    // 5️⃣ Build Ideas: Save and Retrieve Customer-Specific Ideas
    // -------------------------------------------------------------------------
    console.log('\n5️⃣  Building & Saving Strategic Marketing Ideas (/api/marketing/ideas)...');
    const createIdea = await api('/marketing/ideas', {
      method: 'POST',
      body: JSON.stringify({
        customerId: custA_id,
        title: 'IT Cloud Transformation Inbound Campaign',
        objective: 'lead_generation',
        concept: 'High-intent lead generation for cloud migration services in Pune.',
        targetAudience: 'CTOs and IT Directors in Pune & Mumbai',
        captionSuggestions: 'Accelerate your cloud modernization with Alpha Tech.',
        callToAction: 'Book Free Assessment',
        hashtags: '#CloudMigration #PuneIT #AlphaTech',
        status: 'Saved',
      }),
    });
    assert(createIdea.status === 201, 'Marketing Idea created with HTTP 201');
    ideaA_id = createIdea.data.idea.id;

    // Verify Customer Isolation for Ideas
    const listIdeasB = await api(`/marketing/ideas?customerId=${custB_id}`);
    assert(listIdeasB.data.ideas.length === 0, 'Customer Beta has 0 ideas (Strict Customer Isolation)');

    // -------------------------------------------------------------------------
    // 6️⃣ Preventing Cross-Customer Idea / Post Associations
    // -------------------------------------------------------------------------
    console.log('\n6️⃣  Security Test: Preventing Cross-Customer Idea/Post Association...');
    const illegalPost = await api('/marketing/posts', {
      method: 'POST',
      body: JSON.stringify({
        customerId: custB_id, // Beta customer
        ideaId: ideaA_id,     // Alpha idea!
        title: 'Hacked Association Attempt',
        caption: 'Attempting to attach Customer A idea to Customer B',
      }),
    });
    assert(illegalPost.status === 400, 'Cross-Customer post association strictly rejected with HTTP 400');
    assert(illegalPost.data.error.includes('Cross-Customer Security Violation'), 'Clear security error returned');

    // -------------------------------------------------------------------------
    // 7️⃣ Draft Creation & Submission to Verification Review Queue
    // -------------------------------------------------------------------------
    console.log('\n7️⃣  Creating Creative Post & Submitting for Verification...');
    const createPostA = await api('/marketing/posts', {
      method: 'POST',
      body: JSON.stringify({
        customerId: custA_id,
        ideaId: ideaA_id,
        title: 'Cloud Modernization Creative Banner v1',
        platform: 'Meta Ads (Facebook & Instagram)',
        caption: 'Struggling with legacy infrastructure? Partner with Alpha Tech Systems.',
        callToAction: 'Enquire Now',
        status: 'Draft',
        submittedBy: 'Marketing Creative Team',
      }),
    });
    assert(createPostA.status === 201, 'Post created as Draft with HTTP 201');
    postA_id = createPostA.data.postId;

    // Submit Draft to Review Queue
    const submitPostA = await api(`/marketing/posts/${postA_id}/submit`, {
      method: 'POST',
      body: JSON.stringify({ submitter: 'Marketing Creative Team' }),
    });
    assert(submitPostA.status === 200, 'Draft submitted to review queue');
    assert(submitPostA.data.post.status === 'Pending Verification', 'Post status updated to Pending Verification');

    // -------------------------------------------------------------------------
    // 8️⃣ Verification Review Queue: Rejection Validation & Approval Flow
    // -------------------------------------------------------------------------
    console.log('\n8️⃣  Testing Review Queue Actions: Rejection Validation & Approval...');
    
    // Attempt rejection without mandatory reason
    const failReject = await api(`/marketing/posts/${postA_id}/review`, {
      method: 'POST',
      body: JSON.stringify({
        decision: 'Rejected',
        rejectionReason: '', // Empty!
      }),
    });
    assert(failReject.status === 400, 'Rejection without reason rejected with HTTP 400');

    // Approve the Post
    const approveRes = await api(`/marketing/posts/${postA_id}/review`, {
      method: 'POST',
      body: JSON.stringify({
        decision: 'Approved',
        reviewerName: 'Quality Auditor',
        remarks: 'Meets Meta Ad quality and compliance guidelines.',
      }),
    });
    assert(approveRes.status === 200, 'Post successfully Approved');
    assert(approveRes.data.decision === 'Approved', 'Review decision stored as Approved');

    // Verify Review History & Audit
    const histRes = await api(`/marketing/posts/${postA_id}/history`);
    assert(histRes.status === 200, 'Audit history retrieved');
    assert(histRes.data.reviews.length >= 1, 'Review decision preserved in history');

    // -------------------------------------------------------------------------
    // 9️⃣ Customer Marketing Control: Campaign Creation & Approval Gate
    // -------------------------------------------------------------------------
    console.log('\n9️⃣  Testing Campaign Creation (Approved Posts Only)...');

    // Create an unapproved post for Customer B to test refusal
    const unapprovedPostB = await api('/marketing/posts', {
      method: 'POST',
      body: JSON.stringify({
        customerId: custB_id,
        title: 'Draft Post Beta',
        caption: 'This post is not approved.',
        status: 'Draft',
      }),
    });
    postB_id = unapprovedPostB.data.postId;

    // Attempt to create campaign with unapproved post
    const failCamp = await api('/marketing/campaigns', {
      method: 'POST',
      body: JSON.stringify({
        customerId: custB_id,
        name: 'Beta Unauthorized Campaign',
        postId: postB_id,
        dailyBudget: 300,
      }),
    });
    assert(failCamp.status === 400, 'Campaign with unapproved post rejected with HTTP 400');

    // Attempt to create campaign with budget exceeding wallet balance
    const walletFailCamp = await api('/marketing/campaigns', {
      method: 'POST',
      body: JSON.stringify({
        customerId: custA_id,
        name: 'Exorbitant Budget Campaign',
        postId: postA_id,
        dailyBudget: 10000, // Exceeds ₹1,500 balance!
      }),
    });
    assert(walletFailCamp.status === 400, 'Campaign exceeding wallet balance rejected with HTTP 400');

    // Valid Campaign Creation for Customer Alpha
    const validCamp = await api('/marketing/campaigns', {
      method: 'POST',
      body: JSON.stringify({
        customerId: custA_id,
        name: 'Alpha Cloud Migration Q4 Campaign',
        objective: 'Lead Generation',
        postId: postA_id,
        platform: 'Meta Ads (Facebook & Instagram)',
        dailyBudget: 500, // Valid (<= ₹1,500)
        actor: 'Campaign Manager',
      }),
    });
    assert(validCamp.status === 201, 'Valid Campaign created with HTTP 201');
    campA_id = validCamp.data.campaignId;
    assert(validCamp.data.externalPlatformStatus === 'Not Connected', 'External status correctly tracks Not Connected');

    // -------------------------------------------------------------------------
    // 🔟 Start & Stop Marketing Controls
    // -------------------------------------------------------------------------
    console.log('\n🔟 Testing Start & Stop Marketing Controls...');
    const startRes = await api(`/marketing/campaigns/${campA_id}/start`, {
      method: 'POST',
      body: JSON.stringify({ actor: 'Operations Manager' }),
    });
    assert(startRes.status === 200, 'Campaign started successfully');
    assert(startRes.data.status === 'Running', 'Campaign status updated to Running');

    const stopRes = await api(`/marketing/campaigns/${campA_id}/stop`, {
      method: 'POST',
      body: JSON.stringify({ actor: 'Operations Manager', reason: 'Pacing Goal Achieved' }),
    });
    assert(stopRes.status === 200, 'Campaign stopped successfully');
    assert(stopRes.data.status === 'Stopped', 'Campaign status updated to Stopped');

    // -------------------------------------------------------------------------
    // 1️⃣1️⃣ Media Upload & MIME/Size Validation
    // -------------------------------------------------------------------------
    console.log('\n1️⃣1️⃣ Testing Secure Media Upload...');
    const testBase64 = Buffer.from('FakeImageDataForTestingAdMafiaMarketing').toString('base64');
    const uploadRes = await api('/marketing/media/upload', {
      method: 'POST',
      body: JSON.stringify({
        filename: 'banner_test.png',
        base64Data: `data:image/png;base64,${testBase64}`,
        contentType: 'image/png',
      }),
    });
    assert(uploadRes.status === 200, 'Media upload succeeded with 200 OK');
    assert(uploadRes.data.url.startsWith('/uploads/marketing/'), 'Returns safe public static URL');

    // Test invalid format
    const badUpload = await api('/marketing/media/upload', {
      method: 'POST',
      body: JSON.stringify({
        filename: 'malicious.exe',
        base64Data: `data:application/octet-stream;base64,${testBase64}`,
        contentType: 'application/octet-stream',
      }),
    });
    assert(badUpload.status === 400, 'Unsupported media MIME type cleanly rejected');

  } finally {
    // -------------------------------------------------------------------------
    // 🧹 Clean Up Test Records
    // -------------------------------------------------------------------------
    console.log('\n🧹 Cleaning Up Test Customer Records...');
    if (custA_id) await api(`/customers/${custA_id}`, { method: 'DELETE' });
    if (custB_id) await api(`/customers/${custB_id}`, { method: 'DELETE' });
    console.log('   ✓ Test accounts cleaned up cleanly via CASCADE.');
  }

  console.log('\n======================================================================');
  console.log(`🎯 MARKETING TEST SUMMARY: ${passed} Passed | ${failed} Failed`);
  console.log('======================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runMarketingTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
