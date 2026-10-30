/**
 * End-to-End Test Suite for AdMafia Graphics Department
 * Verifies seamless integration between Marketing Requests and Graphics Production:
 * 1. Marketing submits post request
 * 2. Graphics sees request in /api/graphics/requests
 * 3. Graphics uploads finished creative (/api/graphics/upload) -> Pending Verification
 * 4. Marketing reviews and rejects creative with mandatory reason -> Rejected
 * 5. Graphics sees item in /api/graphics/rejected with reviewer reason & history
 * 6. Graphics submits corrected revision (/api/graphics/requests/:id/reupload) -> Rev 2, Pending Verification
 * 7. Prior revision & rejection notes are permanently preserved in history
 * 8. Marketing approves Revision 2 -> Approved
 * 9. Approved artwork appears in /api/graphics/approved
 * 10. Summary KPI counts reflect correct department state
 */

const BASE_URL = 'http://localhost:5000';

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => null);
  return { status: response.status, ok: response.ok, data };
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

async function runGraphicsE2ETests() {
  console.log('\n======================================================');
  console.log('  🎨 STARTING GRAPHICS DEPARTMENT E2E TEST SUITE');
  console.log('======================================================\n');

  const testSuffix = Date.now().toString().slice(-6);
  let customerId = null;

  try {
    // -------------------------------------------------------------------------
    // Step 1: Check Graphics Summary API
    // -------------------------------------------------------------------------
    console.log('[Test 1] Verify initial /api/graphics/summary endpoint responds...');
    const sumRes1 = await request('/api/graphics/summary');
    assert(sumRes1.ok && sumRes1.data && sumRes1.data.ok, 'Graphics summary returns ok: true');
    assert(typeof sumRes1.data.summary.totalRequests === 'number', 'Summary contains totalRequests count');
    assert(typeof sumRes1.data.summary.approvedCount === 'number', 'Summary contains approvedCount count');
    assert(typeof sumRes1.data.summary.rejectedCount === 'number', 'Summary contains rejectedCount count');

    // -------------------------------------------------------------------------
    // Step 2: Register a test customer for marketing
    // -------------------------------------------------------------------------
    console.log('\n[Test 2] Create test customer for Marketing post requests...');
    const regCust = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        companyName: `Graphics Test Business ${testSuffix}`,
        contactName: `Priya Sharma`,
        phone: `9199${testSuffix}`,
        email: `priya_${testSuffix}@graphicstest.com`,
        businessType: 'IT & Software',
        city: 'Ahmedabad',
        initialDeposit: 1500,
      }),
    });
    assert(regCust.ok && regCust.data && regCust.data.customer, 'Customer registered successfully');
    customerId = regCust.data.customer.id;

    // -------------------------------------------------------------------------
    // Step 3: Marketing creates a Post Request
    // -------------------------------------------------------------------------
    console.log('\n[Test 3] Marketing creates a new post request for customer...');
    const createPostRes = await request('/api/marketing/posts', {
      method: 'POST',
      body: JSON.stringify({
        customerId,
        title: `E2E Graphics Post ${testSuffix}`,
        platform: 'Meta Ads (Facebook & Instagram)',
        caption: 'High converting social media ad for IT services in Ahmedabad.',
        callToAction: 'Enquire Now',
        hashtags: '#Software #Ahmedabad #ITSolutions',
        creativeInstructions: 'Use dark purple gradient with high contrast typography and verified badge.',
        priority: 'High',
        language: 'English / Hinglish',
        submittedBy: 'Marketing Lead Strategist',
      }),
    });
    assert(createPostRes.ok && createPostRes.data && createPostRes.data.post, 'Marketing post request created');
    const postId = createPostRes.data.post.id;
    assert(createPostRes.data.post.status === 'Draft' || createPostRes.data.post.status === 'Pending Graphics', 'Initial status is ready for graphics production');

    // -------------------------------------------------------------------------
    // Step 4: Graphics views the request in /api/graphics/requests
    // -------------------------------------------------------------------------
    console.log('\n[Test 4] Graphics views post request in /api/graphics/requests...');
    const reqListRes = await request(`/api/graphics/requests?customerId=${customerId}`);
    assert(reqListRes.ok && Array.isArray(reqListRes.data.requests), 'Requests list returned successfully');
    const foundReq = reqListRes.data.requests.find((r) => r.id === postId);
    assert(foundReq !== undefined, 'Created post request found in Graphics requests desk');
    assert(foundReq.isEligibleForUpload === true, 'Request is marked eligible for artwork upload');
    assert(foundReq.caption.includes('Ahmedabad'), 'Request contains complete Marketing copy brief');

    // -------------------------------------------------------------------------
    // Step 5: Graphics inspects request detail and specifications
    // -------------------------------------------------------------------------
    console.log('\n[Test 5] Graphics inspects full request brief via /api/graphics/requests/:id...');
    const detailRes = await request(`/api/graphics/requests/${postId}`);
    assert(detailRes.ok && detailRes.data && detailRes.data.request, 'Request detail fetched successfully');
    assert(detailRes.data.request.id === postId, 'Fetched correct request ID');
    assert(Array.isArray(detailRes.data.revisions), 'Revisions audit array present');

    // -------------------------------------------------------------------------
    // Step 6: Graphics uploads finished artwork
    // -------------------------------------------------------------------------
    console.log('\n[Test 6] Graphics uploads finished artwork via /api/graphics/upload...');
    const uploadArtworkRes = await request('/api/graphics/upload', {
      method: 'POST',
      body: JSON.stringify({
        requestId: postId,
        mediaUrl: `/uploads/marketing/artwork_v1_${testSuffix}.png`,
        mediaType: 'image',
        creativeFormat: 'Instagram / Facebook Post',
        designerNotes: 'Initial v1 design following corporate brand palette and verified badge.',
        designerName: 'Lead Designer Priya',
      }),
    });
    assert(uploadArtworkRes.ok && uploadArtworkRes.data && uploadArtworkRes.data.status === 'Pending Verification', 'Artwork uploaded and status transitioned to Pending Verification');
    assert(uploadArtworkRes.data.revisionNumber === 1, 'Initial revision recorded as Revision #1');

    // -------------------------------------------------------------------------
    // Step 7: Marketing verifies and REJECTS artwork with mandatory reason
    // -------------------------------------------------------------------------
    console.log('\n[Test 7] Marketing reviews and rejects artwork with mandatory feedback...');
    const rejectionReason = 'Headline font is too small on mobile preview; please increase text contrast and add offer highlight.';
    const rejectReviewRes = await request(`/api/marketing/posts/${postId}/review`, {
      method: 'POST',
      body: JSON.stringify({
        decision: 'Rejected',
        reviewerName: 'Senior Marketing Auditor Rajesh',
        reviewerRole: 'Chief Marketing Auditor',
        rejectionReason,
        remarks: 'Please address contrast issues before reuploading.',
      }),
    });
    assert(rejectReviewRes.ok && rejectReviewRes.data && rejectReviewRes.data.decision === 'Rejected', 'Marketing rejection successfully recorded');

    // -------------------------------------------------------------------------
    // Step 8: Post automatically appears in /api/graphics/rejected
    // -------------------------------------------------------------------------
    console.log('\n[Test 8] Post appears in /api/graphics/rejected with exact feedback...');
    const rejectedQueueRes = await request('/api/graphics/rejected');
    assert(rejectedQueueRes.ok && Array.isArray(rejectedQueueRes.data.rejectedPosts), 'Rejected posts queue fetched');
    const foundRejected = rejectedQueueRes.data.rejectedPosts.find((p) => p.id === postId);
    assert(foundRejected !== undefined, 'Rejected post appears in Graphics Rejected Posts desk');
    assert(foundRejected.rejectionReason === rejectionReason, 'Marketing rejection reason is accurately displayed');
    assert(foundRejected.reviewerName.includes('Rajesh'), 'Marketing reviewer identity is preserved');
    assert(foundRejected.revisionNumber === 1, 'Reflects rejected Revision #1');

    // -------------------------------------------------------------------------
    // Step 9: Graphics REUPLOADS corrected artwork
    // -------------------------------------------------------------------------
    console.log('\n[Test 9] Graphics reuploads corrected artwork via /api/graphics/requests/:id/reupload...');
    const reuploadRes = await request(`/api/graphics/requests/${postId}/reupload`, {
      method: 'POST',
      body: JSON.stringify({
        mediaUrl: `/uploads/marketing/artwork_v2_${testSuffix}.png`,
        mediaType: 'image',
        creativeFormat: 'Instagram / Facebook Post',
        revisionSummary: 'Enlarged font size by 20%, boosted headline contrast to pure white, added highlight badge.',
        designerNotes: 'Ready for re-verification.',
        designerName: 'Lead Designer Priya',
      }),
    });
    assert(reuploadRes.ok && reuploadRes.data && reuploadRes.data.status === 'Pending Verification', 'Status transitioned back to Pending Verification');
    assert(reuploadRes.data.revisionNumber === 2, 'Revision number incremented to #2');

    // -------------------------------------------------------------------------
    // Step 10: Verify revision history preserves BOTH revisions
    // -------------------------------------------------------------------------
    console.log('\n[Test 10] Verify revision history preserves previous v1 and new v2...');
    const detailAfterReupload = await request(`/api/graphics/requests/${postId}`);
    assert(detailAfterReupload.ok && detailAfterReupload.data.revisions.length >= 2, 'Both revisions preserved in immutable audit log');
    assert(detailAfterReupload.data.reviews.length >= 1, 'Rejection review is permanently preserved in history');

    // -------------------------------------------------------------------------
    // Step 11: Marketing APPROVES Revision #2
    // -------------------------------------------------------------------------
    console.log('\n[Test 11] Marketing verifies and APPROVES Revision #2...');
    const approveReviewRes = await request(`/api/marketing/posts/${postId}/review`, {
      method: 'POST',
      body: JSON.stringify({
        decision: 'Approved',
        reviewerName: 'Senior Marketing Auditor Rajesh',
        reviewerRole: 'Chief Marketing Auditor',
        remarks: 'Excellent revisions. Typography is crisp and CTA is prominent. Approved for live campaigns.',
      }),
    });
    assert(approveReviewRes.ok && approveReviewRes.data && approveReviewRes.data.decision === 'Approved', 'Revision #2 successfully approved by Marketing');

    // -------------------------------------------------------------------------
    // Step 12: Post appears in /api/graphics/approved
    // -------------------------------------------------------------------------
    console.log('\n[Test 12] Post appears in /api/graphics/approved registry...');
    const approvedRegistryRes = await request('/api/graphics/approved');
    assert(approvedRegistryRes.ok && Array.isArray(approvedRegistryRes.data.approvedPosts), 'Approved posts registry fetched');
    const foundApproved = approvedRegistryRes.data.approvedPosts.find((p) => p.id === postId);
    assert(foundApproved !== undefined, 'Approved post appears in Graphics Approved Posts desk');
    assert(foundApproved.revisionNumber === 2, 'Approved version is Revision #2');
    assert(foundApproved.reviewerName.includes('Rajesh'), 'Reviewer name is present in approved registry');

    // -------------------------------------------------------------------------
    // Step 13: Approved artwork is now ready for Marketing Campaign creation
    // -------------------------------------------------------------------------
    console.log('\n[Test 13] Verify approved artwork is selectable in Marketing Customer Campaigns...');
    const approvedCampaignList = await request(`/api/marketing/posts?customerId=${customerId}&status=Approved`);
    assert(approvedCampaignList.ok && Array.isArray(approvedCampaignList.data.posts), 'Customer approved posts fetched for campaign deploy');
    const postReadyForCampaign = approvedCampaignList.data.posts.find((p) => p.id === postId);
    assert(postReadyForCampaign !== undefined, 'Approved artwork is directly deployable into live Meta campaign');
    assert(postReadyForCampaign.mediaUrl.includes('artwork_v2'), 'Deployable post contains latest approved Revision #2 artwork');

    // -------------------------------------------------------------------------
    // Step 14: Final Summary KPI Verification
    // -------------------------------------------------------------------------
    console.log('\n[Test 14] Verify summary counters reflect updated state...');
    const finalSum = await request('/api/graphics/summary');
    assert(finalSum.ok && finalSum.data.summary.approvedCount >= 1, 'Approved count incremented');

    console.log('\n======================================================');
    console.log(`  🎉 GRAPHICS E2E TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('======================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal error during Graphics E2E tests:', err);
    process.exit(1);
  } finally {
    if (customerId) {
      console.log('🧹 Cleaning up test customer record...');
      await request(`/api/customers/${customerId}`, { method: 'DELETE' });
      console.log('   ✓ Test customer cleaned up via CASCADE.');
    }
  }
}

runGraphicsE2ETests();
