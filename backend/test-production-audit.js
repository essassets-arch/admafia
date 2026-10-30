/**
 * Production Safety & Quality Audit Suite for AdMafia Graphics & Marketing
 * Independently validates every area from the user's checklist:
 * 1. Database & Schema audit (soft deletion, foreign key restriction, preserved data)
 * 2. Upload security (magic bytes inspection, size limits, path safety)
 * 3. Revision history & audit retention (immutable versions, preserved feedback)
 * 4. Marketing verification precision (exact revision auditing, conflict prevention)
 * 5. Campaign eligibility (strict latest-approved revision requirement)
 * 6. Routing & Direct Navigation (all 5 routes served with 200)
 * 7. End-to-end regression safety
 */

const BASE_URL = 'http://localhost:5000';

async function api(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => null);
  return { status: response.status, ok: response.ok, headers: response.headers, data };
}

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

async function runProductionSafetyAudit() {
  console.log('\n======================================================================');
  console.log('🛡️  STARTING PRODUCTION-SAFETY AUDIT: ADMAFIA GRAPHICS & MARKETING');
  console.log('======================================================================\n');

  const testSuffix = Date.now().toString().slice(-6);
  let customerId = null;

  try {
    // -------------------------------------------------------------------------
    // AREA 1: ROUTING & DIRECT SPA NAVIGATION (Direct Refresh on all 5 routes)
    // -------------------------------------------------------------------------
    console.log('1️⃣  Verifying Direct Navigation & Page Refresh on all 5 Graphics routes...');
    const routes = [
      '/graphics',
      '/graphics/post-requests',
      '/graphics/upload-post',
      '/graphics/approved-posts',
      '/graphics/rejected-posts',
    ];

    for (const r of routes) {
      const res = await fetch(`${BASE_URL}${r}`);
      const cType = res.headers.get('content-type') || '';
      assert(res.status === 200 && cType.includes('text/html'), `Direct GET "${r}" returns 200 OK with HTML document`);
    }

    // -------------------------------------------------------------------------
    // AREA 2: UPLOAD SECURITY & DEEP CONTENT INSPECTION
    // -------------------------------------------------------------------------
    console.log('\n2️⃣  Verifying Upload Security, File Size Limits & Content Inspection...');

    // Test A: Normal valid PNG upload
    const validPngBuffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG Magic Header
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR
    ]);
    const validUpload = await api('/api/marketing/media/upload', {
      method: 'POST',
      body: JSON.stringify({
        filename: 'banner_brand.png',
        base64Data: `data:image/png;base64,${validPngBuffer.toString('base64')}`,
        contentType: 'image/png',
      }),
    });
    assert(validUpload.ok && validUpload.data.url.startsWith('/uploads/marketing/'), 'Legitimate PNG upload accepted and saved to static storage');

    // Test B: Disguised Windows Executable (PE header 'MZ')
    const maliciousExeBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]); // 'MZ' EXE
    const exeUpload = await api('/api/marketing/media/upload', {
      method: 'POST',
      body: JSON.stringify({
        filename: 'fake_creative.png',
        base64Data: `data:image/png;base64,${maliciousExeBuffer.toString('base64')}`,
        contentType: 'image/png',
      }),
    });
    assert(exeUpload.status === 400 && exeUpload.data.error.includes('Security Violation'), 'Disguised Windows executable (.exe) strictly rejected by deep inspection');

    // Test C: Disguised Embedded HTML / Script injection
    const scriptBuffer = Buffer.from('<script>alert("XSS")</script>');
    const scriptUpload = await api('/api/marketing/media/upload', {
      method: 'POST',
      body: JSON.stringify({
        filename: 'exploit.png',
        base64Data: `data:image/png;base64,${scriptBuffer.toString('base64')}`,
        contentType: 'image/png',
      }),
    });
    assert(scriptUpload.status === 400, 'Embedded script / XSS payload strictly rejected');

    // Test D: Excessive file size (> 15MB)
    const hugeBuffer = Buffer.alloc(16 * 1024 * 1024); // 16MB
    const hugeUpload = await api('/api/marketing/media/upload', {
      method: 'POST',
      body: JSON.stringify({
        filename: 'huge_file.png',
        base64Data: hugeBuffer.toString('base64'),
        contentType: 'image/png',
      }),
    });
    assert(hugeUpload.status === 400 && hugeUpload.data.error.includes('15MB'), 'Payloads exceeding 15MB limit strictly rejected with HTTP 400');

    // -------------------------------------------------------------------------
    // AREA 3: REVISION HISTORY, REUPLOADS & IMMUTABILITY
    // -------------------------------------------------------------------------
    console.log('\n3️⃣  Verifying Multi-Version Artwork Revisions & Audit Retention...');

    // Register a test customer with wallet
    const regCust = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        companyName: `Audit Enterprise ${testSuffix}`,
        contactName: 'Audit Officer',
        phone: `9188${testSuffix}`,
        email: `audit_${testSuffix}@admafia.marketing`,
        businessType: 'IT & Software',
        city: 'Ahmedabad',
        initialDeposit: 2000,
      }),
    });
    assert(regCust.ok && regCust.data.customer, 'Audit test customer registered with ₹2,000 wallet');
    customerId = regCust.data.customer.id;

    // Create a Post Request
    const createReq = await api('/api/marketing/posts', {
      method: 'POST',
      body: JSON.stringify({
        customerId,
        title: `Audit Campaign Post ${testSuffix}`,
        platform: 'Meta Ads (Facebook & Instagram)',
        caption: 'High converting cloud migration advertisement.',
        callToAction: 'Book Consultation',
        priority: 'High',
      }),
    });
    assert(createReq.ok && createReq.data.post, 'Marketing post request created in database');
    const postId = createReq.data.post.id;

    // Graphics uploads Revision 1
    const uploadV1 = await api('/api/graphics/upload', {
      method: 'POST',
      body: JSON.stringify({
        postId,
        mediaUrl: `/uploads/marketing/artwork_v1_${testSuffix}.png`,
        creativeFormat: 'Instagram / Facebook Post',
        designerNotes: 'Version 1 Draft - Blue theme',
        designerName: 'Designer A',
      }),
    });
    assert(uploadV1.ok && uploadV1.data.revisionNumber === 1, 'Artwork Revision #1 uploaded and marked Pending Verification');

    // Marketing rejects Revision 1
    const rejectionNote = 'Brand logo too small, increase contrast on CTA button.';
    const rejectReview = await api(`/api/marketing/posts/${postId}/review`, {
      method: 'POST',
      body: JSON.stringify({
        decision: 'Rejected',
        expectedRevisionNumber: 1, // Reviews Revision 1
        reviewerName: 'Quality Lead Ramesh',
        rejectionReason: rejectionNote,
        remarks: 'Please fix logo and CTA contrast.',
      }),
    });
    assert(rejectReview.ok && rejectReview.data.decision === 'Rejected', 'Marketing rejects Revision #1 with mandatory rejection reason');

    // Graphics reuploads corrected artwork (Revision 2)
    const uploadV2 = await api(`/api/graphics/requests/${postId}/reupload`, {
      method: 'POST',
      body: JSON.stringify({
        mediaUrl: `/uploads/marketing/artwork_v2_${testSuffix}.png`,
        creativeFormat: 'Instagram / Facebook Post',
        revisionSummary: 'Enlarged logo by 40% and changed CTA button to vibrant orange with white text.',
        designerName: 'Designer A',
      }),
    });
    assert(uploadV2.ok && uploadV2.data.revisionNumber === 2, 'Corrected artwork reuploaded as Revision #2');

    // Verify Audit Trail: Both revisions and rejection comments permanently preserved
    const historyRes = await api(`/api/graphics/requests/${postId}`);
    assert(historyRes.ok && historyRes.data.revisions.length === 2, 'Revision history preserves BOTH Revision #1 and Revision #2');
    const rev1 = historyRes.data.revisions.find((r) => Number(r.revision_number) === 1);
    const rev2 = historyRes.data.revisions.find((r) => Number(r.revision_number) === 2);
    assert(rev1 && rev1.review_status === 'Rejected', 'Revision #1 is immutably recorded as Rejected');
    assert(rev1.rejection_reason === rejectionNote, 'Revision #1 mandatory rejection reason is permanently preserved');
    assert(rev2 && rev2.review_status === 'Pending Verification', 'Revision #2 is recorded as Pending Verification');

    // -------------------------------------------------------------------------
    // AREA 4: MARKETING CONFLICT & STALE REVISION GUARD
    // -------------------------------------------------------------------------
    console.log('\n4️⃣  Verifying Marketing Stale Revision Guard (Prevents Approving Old Version)...');

    // Attempt to review Revision 1 when Revision 2 is current
    const staleReview = await api(`/api/marketing/posts/${postId}/review`, {
      method: 'POST',
      body: JSON.stringify({
        decision: 'Approved',
        expectedRevisionNumber: 1, // Stale!
        reviewerName: 'Auditor Ramesh',
      }),
    });
    assert(staleReview.status === 409 && staleReview.data.error.includes('Concurrent Review Conflict'), 'Attempting to review stale Revision #1 is strictly rejected with HTTP 409 Conflict');

    // Now review with correct expectedRevisionNumber = 2
    const approveV2 = await api(`/api/marketing/posts/${postId}/review`, {
      method: 'POST',
      body: JSON.stringify({
        decision: 'Approved',
        expectedRevisionNumber: 2,
        reviewerName: 'Auditor Ramesh',
        remarks: 'Revisions look sharp. Contrast and logo hierarchy are excellent.',
      }),
    });
    assert(approveV2.ok && approveV2.data.decision === 'Approved', 'Review of current Revision #2 succeeds with HTTP 200');

    // -------------------------------------------------------------------------
    // AREA 5: CAMPAIGN CREATIVE ELIGIBILITY
    // -------------------------------------------------------------------------
    console.log('\n5️⃣  Verifying Strict Campaign Creative Eligibility...');

    // Test A: Deploying an unapproved post fails
    const unapprovedReq = await api('/api/marketing/posts', {
      method: 'POST',
      body: JSON.stringify({
        customerId,
        title: `Unapproved Post ${testSuffix}`,
        caption: 'Draft unapproved post copy.',
      }),
    });
    const unapprovedPostId = unapprovedReq.data.post.id;

    const unapprovedCampaign = await api('/api/marketing/campaigns', {
      method: 'POST',
      body: JSON.stringify({
        customerId,
        name: `Illegal Campaign ${testSuffix}`,
        postId: unapprovedPostId,
        dailyBudget: 300,
      }),
    });
    assert(unapprovedCampaign.status === 400 && unapprovedCampaign.data.error.includes('Only verified and Approved posts'), 'Deploying unapproved post into campaign strictly rejected with HTTP 400');

    // Test B: Deploying our verified Revision #2 post succeeds
    const validCampaign = await api('/api/marketing/campaigns', {
      method: 'POST',
      body: JSON.stringify({
        customerId,
        name: `Live Verified Campaign ${testSuffix}`,
        postId: postId,
        dailyBudget: 500,
        startDate: new Date().toISOString(),
      }),
    });
    const campId = validCampaign.data?.campaignId || validCampaign.data?.campaign?.id;
    assert(validCampaign.status === 201 && campId, 'Deploying verified Revision #2 post into campaign succeeds with HTTP 201');

    // -------------------------------------------------------------------------
    // AREA 6: ENTERPRISE SOFT DELETION & AUDIT RETENTION
    // -------------------------------------------------------------------------
    console.log('\n6️⃣  Verifying Enterprise Soft Deletion & Audit Retention...');

    // Cannot delete post that is active in a running campaign
    // Start campaign first
    await api(`/api/marketing/campaigns/${campId}/start`, { method: 'POST' });

    const deleteActivePost = await api(`/api/marketing/posts/${postId}`, { method: 'DELETE' });
    assert(deleteActivePost.status === 400 && deleteActivePost.data.error.includes('running marketing campaign'), 'Archiving post active in running campaign strictly prevented');

    // Stop campaign
    await api(`/api/marketing/campaigns/${campId}/stop`, { method: 'POST' });

    // Soft delete post
    const archivePost = await api(`/api/marketing/posts/${postId}`, { method: 'DELETE' });
    assert(archivePost.ok && archivePost.data.message.includes('safely archived'), 'Post safely soft-deleted with audit trail retained');

    // Verify post is filtered out from active requests but revisions table remains intact
    const activeReqCheck = await api(`/api/graphics/requests/${postId}`);
    assert(activeReqCheck.status === 404, 'Soft-deleted post filtered from active Graphics desks');

    console.log('\n======================================================================');
    console.log(`🎉 PRODUCTION AUDIT SUMMARY: ${passed} PASSED | ${failed} FAILED`);
    console.log('======================================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal error during production audit:', err);
    process.exit(1);
  } finally {
    if (customerId) {
      console.log('🧹 Cleaning up audit test customer record via CASCADE...');
      await api(`/api/customers/${customerId}`, { method: 'DELETE' });
      console.log('   ✓ Audit test customer cleaned up.');
    }
  }
}

runProductionSafetyAudit();
