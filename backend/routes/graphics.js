import express from 'express';
import { query, withTransaction } from '../db.js';

export const graphicsRouter = express.Router();

// Helper: Audit Logger
async function logAuditEvent(customerId, entityType, entityId, action, actor, details = {}) {
  try {
    const id = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    await query(
      `INSERT INTO marketing_audit_events (id, customer_id, entity_type, entity_id, action, actor, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, customerId || null, entityType, entityId, action, actor || 'Graphics Designer', JSON.stringify(details)]
    );
  } catch (err) {
    console.error('[Graphics Audit Log Error]:', err.message);
  }
}

// -----------------------------------------------------------------------------
// 1. GET /api/graphics/summary (Graphics Department KPI Ribbon)
// -----------------------------------------------------------------------------
graphicsRouter.get('/summary', async (req, res) => {
  try {
    const countsRes = await query(`
      SELECT
        COUNT(*)::INT AS total_requests,
        COUNT(*) FILTER (WHERE status IN ('Draft', 'Pending Graphics', 'In Progress') OR media_url IS NULL OR media_url = '')::INT AS pending_uploads,
        COUNT(*) FILTER (WHERE status = 'Pending Verification')::INT AS pending_verification,
        COUNT(*) FILTER (WHERE status = 'Approved')::INT AS approved_count,
        COUNT(*) FILTER (WHERE status IN ('Rejected', 'Changes Requested'))::INT AS rejected_count
      FROM marketing_posts
      WHERE is_deleted = FALSE
    `);

    const row = countsRes.rows[0] || {};
    res.json({
      ok: true,
      summary: {
        totalRequests: Number(row.total_requests || 0),
        pendingUploads: Number(row.pending_uploads || 0),
        pendingVerification: Number(row.pending_verification || 0),
        approvedCount: Number(row.approved_count || 0),
        rejectedCount: Number(row.rejected_count || 0),
        lastRefresh: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[GET /api/graphics/summary]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 2. GET /api/graphics/requests (Post Requests Submitted by Marketing)
// -----------------------------------------------------------------------------
graphicsRouter.get('/requests', async (req, res) => {
  try {
    const {
      status = 'all',
      search = '',
      platform = 'all',
      customerId = '',
      priority = 'all',
      page = 1,
      limit = 30,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 30));
    const offset = (pageNum - 1) * limitNum;

    const whereClauses = ['mp.is_deleted = FALSE'];
    const params = [];

    if (status && status !== 'all') {
      if (status === 'Needs Artwork') {
        whereClauses.push(`(mp.status IN ('Draft', 'Pending Graphics', 'In Progress') OR mp.media_url IS NULL OR mp.media_url = '')`);
      } else {
        params.push(status);
        whereClauses.push(`mp.status = $${params.length}`);
      }
    }

    if (platform && platform !== 'all') {
      params.push(platform);
      whereClauses.push(`mp.platform = $${params.length}`);
    }

    if (priority && priority !== 'all') {
      params.push(priority);
      whereClauses.push(`mp.priority = $${params.length}`);
    }

    if (customerId) {
      params.push(customerId);
      whereClauses.push(`mp.customer_id = $${params.length}`);
    }

    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      const pIdx = params.length;
      whereClauses.push(`(
        mp.title ILIKE $${pIdx} OR
        mp.caption ILIKE $${pIdx} OR
        c.company_name ILIKE $${pIdx} OR
        c.contact_person ILIKE $${pIdx} OR
        c.phone ILIKE $${pIdx} OR
        mp.id ILIKE $${pIdx}
      )`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countRes = await query(`
      SELECT COUNT(*)::INT AS total
      FROM marketing_posts mp
      LEFT JOIN customers c ON c.id = mp.customer_id
      ${whereSql}
    `, params);
    const totalCount = Number(countRes.rows[0]?.total || 0);

    const dataSql = `
      SELECT
        mp.id,
        mp.customer_id,
        c.company_name,
        c.contact_person,
        c.phone,
        c.city,
        c.category AS customer_category,
        mp.idea_id,
        mi.title AS idea_title,
        mi.concept AS idea_concept,
        mi.target_audience AS idea_target_audience,
        mp.title,
        mp.platform,
        mp.caption,
        mp.hashtags,
        mp.call_to_action,
        mp.media_url,
        mp.media_type,
        mp.creative_format,
        mp.designer_notes,
        mp.designer_name,
        mp.creative_instructions,
        mp.priority,
        mp.language,
        mp.status,
        mp.revision_number,
        mp.submitted_by,
        mp.submitted_at,
        mp.created_by,
        mp.created_at,
        mp.updated_at,
        (
          SELECT json_build_object(
            'reviewerName', r.reviewer_name,
            'decision', r.decision,
            'remarks', r.remarks,
            'rejectionReason', r.rejection_reason,
            'correctionInstructions', r.correction_instructions,
            'createdAt', r.created_at
          )
          FROM marketing_post_reviews r
          WHERE r.post_id = mp.id
          ORDER BY r.created_at DESC
          LIMIT 1
        ) AS latest_review
      FROM marketing_posts mp
      LEFT JOIN customers c ON c.id = mp.customer_id
      LEFT JOIN marketing_ideas mi ON mi.id = mp.idea_id
      ${whereSql}
      ORDER BY 
        CASE 
          WHEN mp.status IN ('Rejected', 'Changes Requested') THEN 1
          WHEN mp.status IN ('Draft', 'Pending Graphics') THEN 2
          WHEN mp.status = 'In Progress' THEN 3
          WHEN mp.status = 'Pending Verification' THEN 4
          ELSE 5
        END,
        mp.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const dataRes = await query(dataSql, [...params, limitNum, offset]);

    res.json({
      ok: true,
      requests: dataRes.rows.map((r) => ({
        id: r.id,
        customerId: r.customer_id,
        companyName: r.company_name || 'Direct Customer',
        contactPerson: r.contact_person || '',
        phone: r.phone || '',
        city: r.city || '',
        customerCategory: r.customer_category || 'General',
        ideaId: r.idea_id,
        ideaTitle: r.idea_title || '',
        ideaConcept: r.idea_concept || '',
        ideaTargetAudience: r.idea_target_audience || '',
        title: r.title,
        platform: r.platform,
        caption: r.caption,
        hashtags: r.hashtags || '',
        callToAction: r.call_to_action || 'Enquire Now',
        mediaUrl: r.media_url || '',
        mediaType: r.media_type || 'image',
        creativeFormat: r.creative_format || 'Instagram / Facebook Post',
        designerNotes: r.designer_notes || '',
        designerName: r.designer_name || 'Graphics Designer',
        creativeInstructions: r.creative_instructions || '',
        priority: r.priority || 'Normal',
        language: r.language || 'English / Hinglish',
        status: r.status,
        revisionNumber: Number(r.revision_number || 1),
        submittedBy: r.submitted_by,
        submittedAt: r.submitted_at,
        createdBy: r.created_by,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        latestReview: r.latest_review || null,
        isEligibleForUpload: ['Draft', 'Pending Graphics', 'In Progress', 'Rejected', 'Changes Requested'].includes(r.status) || !r.media_url,
      })),
      pagination: {
        total: totalCount,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(totalCount / limitNum) || 1,
      },
    });
  } catch (err) {
    console.error('[GET /api/graphics/requests]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 3. GET /api/graphics/requests/:id (Complete Brief & Revision History)
// -----------------------------------------------------------------------------
graphicsRouter.get('/requests/:id', async (req, res) => {
  try {
    const postId = req.params.id;

    const postRes = await query(`
      SELECT
        mp.*,
        c.company_name,
        c.contact_person,
        c.phone,
        c.email,
        c.city,
        c.category AS customer_category,
        mi.title AS idea_title,
        mi.concept AS idea_concept,
        mi.target_audience AS idea_target_audience
      FROM marketing_posts mp
      LEFT JOIN customers c ON c.id = mp.customer_id
      LEFT JOIN marketing_ideas mi ON mi.id = mp.idea_id
      WHERE mp.id = $1 AND mp.is_deleted = FALSE
    `, [postId]);

    if (postRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Post request not found.' });
    }

    const post = postRes.rows[0];

    const [revRes, reviewRes] = await Promise.all([
      query(`SELECT * FROM marketing_post_revisions WHERE post_id = $1 ORDER BY revision_number DESC`, [postId]),
      query(`SELECT * FROM marketing_post_reviews WHERE post_id = $1 ORDER BY created_at DESC`, [postId]),
    ]);

    res.json({
      ok: true,
      revisions: revRes.rows,
      reviews: reviewRes.rows,
      request: {
        id: post.id,
        customerId: post.customer_id,
        companyName: post.company_name,
        contactPerson: post.contact_person,
        phone: post.phone,
        email: post.email,
        city: post.city,
        customerCategory: post.customer_category,
        ideaId: post.idea_id,
        ideaTitle: post.idea_title,
        ideaConcept: post.idea_concept,
        ideaTargetAudience: post.idea_target_audience,
        title: post.title,
        platform: post.platform,
        caption: post.caption,
        hashtags: post.hashtags,
        callToAction: post.call_to_action,
        mediaUrl: post.media_url,
        mediaType: post.media_type,
        creativeFormat: post.creative_format || 'Instagram / Facebook Post',
        designerNotes: post.designer_notes || '',
        designerName: post.designer_name || 'Graphics Designer',
        creativeInstructions: post.creative_instructions || '',
        priority: post.priority || 'Normal',
        language: post.language,
        status: post.status,
        revisionNumber: Number(post.revision_number || 1),
        submittedBy: post.submitted_by,
        submittedAt: post.submitted_at,
        createdBy: post.created_by,
        createdAt: post.created_at,
        updatedAt: post.updated_at,
        revisions: revRes.rows,
        reviews: reviewRes.rows,
      },
    });
  } catch (err) {
    console.error('[GET /api/graphics/requests/:id]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 4. POST /api/graphics/upload (Upload Finished Artwork & Submit for Verification)
// -----------------------------------------------------------------------------
graphicsRouter.post('/upload', async (req, res) => {
  try {
    const {
      postId: directPostId,
      requestId,
      mediaUrl,
      mediaType = 'image',
      creativeFormat = 'Instagram / Facebook Post',
      designerNotes = '',
      designerName = 'Graphics Designer',
    } = req.body || {};

    const postId = directPostId || requestId;

    if (!postId) return res.status(400).json({ ok: false, error: 'Post request ID is required.' });
    if (!mediaUrl || !mediaUrl.trim()) {
      return res.status(400).json({ ok: false, error: 'Artwork media URL is required.' });
    }

    const postRes = await query(`SELECT * FROM marketing_posts WHERE id = $1 AND is_deleted = FALSE`, [postId]);
    if (postRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Selected post request not found.' });
    }
    const post = postRes.rows[0];

    // Cannot upload directly to already approved post without starting revision
    if (post.status === 'Approved') {
      return res.status(400).json({
        ok: false,
        error: 'This post is already Approved for live campaigns. Use revision reupload if changes are needed.',
      });
    }

    const currentRev = Number(post.revision_number || 1);
    const revId = `rev_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    await withTransaction(async (txQuery) => {
      // 1. Create or update revision record
      await txQuery(`
        INSERT INTO marketing_post_revisions (
          id, post_id, revision_number, media_url, media_type, creative_format,
          designer_notes, uploaded_by, uploaded_at, review_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), 'Pending Verification')
      `, [revId, postId, currentRev, mediaUrl.trim(), mediaType, creativeFormat, designerNotes, designerName]);

      // 2. Update post record with artwork and transition to 'Pending Verification'
      await txQuery(`
        UPDATE marketing_posts SET
          media_url = $1,
          media_type = $2,
          creative_format = $3,
          designer_notes = $4,
          designer_name = $5,
          status = 'Pending Verification',
          submitted_by = $5,
          submitted_at = NOW(),
          updated_at = NOW()
        WHERE id = $6
      `, [mediaUrl.trim(), mediaType, creativeFormat, designerNotes, designerName, postId]);
    });

    await logAuditEvent(post.customer_id, 'graphics_upload', postId, 'Uploaded Creative Artwork', designerName, {
      postId,
      revisionNumber: currentRev,
      mediaUrl,
      creativeFormat,
      designerNotes,
    });

    res.json({
      ok: true,
      message: 'Artwork submitted successfully to Marketing for verification!',
      postId,
      revisionNumber: currentRev,
      status: 'Pending Verification',
      mediaUrl: mediaUrl.trim(),
    });
  } catch (err) {
    console.error('[POST /api/graphics/upload]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 5. POST /api/graphics/requests/:id/reupload (Reupload Corrected Artwork)
// -----------------------------------------------------------------------------
graphicsRouter.post('/requests/:id/reupload', async (req, res) => {
  try {
    const postId = req.params.id;
    const {
      mediaUrl,
      mediaType = 'image',
      creativeFormat = 'Instagram / Facebook Post',
      designerNotes = '',
      revisionSummary = '',
      designerName = 'Graphics Designer',
    } = req.body || {};

    if (!mediaUrl || !mediaUrl.trim()) {
      return res.status(400).json({ ok: false, error: 'Corrected artwork image is required.' });
    }

    let resultPayload;

    await withTransaction(async (txQuery) => {
      // 1. Atomic row-level lock on the post record in PostgreSQL
      const postRes = await txQuery(
        `SELECT * FROM marketing_posts WHERE id = $1 AND is_deleted = FALSE FOR UPDATE`,
        [postId]
      );
      if (postRes.rowCount === 0) {
        const err = new Error('Post request not found or archived.');
        err.statusCode = 404;
        throw err;
      }
      const post = postRes.rows[0];

      const nextRev = Number(post.revision_number || 1) + 1;
      const revId = `rev_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const fullNotes = revisionSummary
        ? `${designerNotes ? designerNotes + ' | ' : ''}Correction: ${revisionSummary}`
        : designerNotes;

      // 2. Insert new immutable revision record
      await txQuery(`
        INSERT INTO marketing_post_revisions (
          id, post_id, revision_number, media_url, media_type, creative_format,
          designer_notes, uploaded_by, uploaded_at, review_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), 'Pending Verification')
      `, [revId, postId, nextRev, mediaUrl.trim(), mediaType, creativeFormat, fullNotes, designerName]);

      // 3. Update post record to next revision number and transition back to 'Pending Verification'
      await txQuery(`
        UPDATE marketing_posts SET
          media_url = $1,
          media_type = $2,
          creative_format = $3,
          designer_notes = $4,
          designer_name = $5,
          revision_number = $6,
          status = 'Pending Verification',
          submitted_by = $5,
          submitted_at = NOW(),
          updated_at = NOW()
        WHERE id = $7
      `, [mediaUrl.trim(), mediaType, creativeFormat, fullNotes, designerName, nextRev, postId]);

      resultPayload = {
        customerId: post.customer_id,
        nextRev,
        mediaUrl: mediaUrl.trim(),
        revisionSummary,
      };
    });

    await logAuditEvent(resultPayload.customerId, 'graphics_reupload', postId, `Reuploaded Corrected Artwork (Rev #${resultPayload.nextRev})`, designerName, {
      postId,
      newRevision: resultPayload.nextRev,
      mediaUrl,
      revisionSummary,
    });

    res.json({
      ok: true,
      message: `Corrected creative (Revision #${resultPayload.nextRev}) resubmitted to Marketing for verification!`,
      postId,
      revisionNumber: resultPayload.nextRev,
      status: 'Pending Verification',
      mediaUrl: resultPayload.mediaUrl,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ ok: false, error: err.message });
    }
    console.error('[POST /api/graphics/requests/:id/reupload]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 6. GET /api/graphics/approved (Approved Artwork Registry)
// -----------------------------------------------------------------------------
graphicsRouter.get('/approved', async (req, res) => {
  try {
    const { search = '', page = 1, limit = 30 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 30));
    const offset = (pageNum - 1) * limitNum;

    const whereClauses = [`mp.status = 'Approved'`, `mp.media_url IS NOT NULL`, `mp.media_url != ''`, `mp.is_deleted = FALSE`];
    const params = [];

    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      const pIdx = params.length;
      whereClauses.push(`(
        mp.title ILIKE $${pIdx} OR
        mp.caption ILIKE $${pIdx} OR
        c.company_name ILIKE $${pIdx} OR
        mp.id ILIKE $${pIdx}
      )`);
    }

    const whereSql = `WHERE ${whereClauses.join(' AND ')}`;

    const countRes = await query(`
      SELECT COUNT(*)::INT AS total
      FROM marketing_posts mp
      LEFT JOIN customers c ON c.id = mp.customer_id
      ${whereSql}
    `, params);
    const totalCount = Number(countRes.rows[0]?.total || 0);

    const dataSql = `
      SELECT
        mp.id,
        mp.customer_id,
        c.company_name,
        c.category AS customer_category,
        c.city,
        mp.title,
        mp.platform,
        mp.caption,
        mp.hashtags,
        mp.call_to_action,
        mp.media_url,
        mp.media_type,
        mp.creative_format,
        mp.revision_number,
        mp.designer_name,
        mp.submitted_at,
        mp.created_at,
        mp.updated_at,
        r.reviewer_name,
        r.reviewer_role,
        r.remarks AS approval_remarks,
        r.created_at AS approved_at,
        (SELECT mc.name FROM marketing_campaigns mc WHERE mc.post_id = mp.id LIMIT 1) AS linked_campaign_name,
        (SELECT mc.status FROM marketing_campaigns mc WHERE mc.post_id = mp.id LIMIT 1) AS linked_campaign_status
      FROM marketing_posts mp
      LEFT JOIN customers c ON c.id = mp.customer_id
      LEFT JOIN LATERAL (
        SELECT * FROM marketing_post_reviews mpr
        WHERE mpr.post_id = mp.id AND mpr.decision = 'Approved'
        ORDER BY mpr.created_at DESC
        LIMIT 1
      ) r ON TRUE
      ${whereSql}
      ORDER BY r.created_at DESC NULLS LAST, mp.updated_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const dataRes = await query(dataSql, [...params, limitNum, offset]);

    res.json({
      ok: true,
      approvedPosts: dataRes.rows.map((r) => ({
        id: r.id,
        customerId: r.customer_id,
        companyName: r.company_name,
        customerCategory: r.customer_category,
        city: r.city,
        title: r.title,
        platform: r.platform,
        caption: r.caption,
        hashtags: r.hashtags,
        callToAction: r.call_to_action,
        mediaUrl: r.media_url,
        mediaType: r.media_type,
        creativeFormat: r.creative_format,
        revisionNumber: Number(r.revision_number || 1),
        designerName: r.designer_name || 'Graphics Designer',
        reviewerName: r.reviewer_name || 'Marketing Quality Auditor',
        reviewerRole: r.reviewer_role || 'Senior Marketing Auditor',
        approvalRemarks: r.approval_remarks || 'Verified and approved for campaigns.',
        approvedAt: r.approved_at || r.updated_at,
        linkedCampaignName: r.linked_campaign_name || null,
        linkedCampaignStatus: r.linked_campaign_status || null,
      })),
      pagination: {
        total: totalCount,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(totalCount / limitNum) || 1,
      },
    });
  } catch (err) {
    console.error('[GET /api/graphics/approved]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 7. GET /api/graphics/rejected (Rejected Artwork & Reupload Queue)
// -----------------------------------------------------------------------------
graphicsRouter.get('/rejected', async (req, res) => {
  try {
    const { search = '', page = 1, limit = 30 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 30));
    const offset = (pageNum - 1) * limitNum;

    const whereClauses = [`mp.status IN ('Rejected', 'Changes Requested')`, `mp.is_deleted = FALSE`];
    const params = [];

    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      const pIdx = params.length;
      whereClauses.push(`(
        mp.title ILIKE $${pIdx} OR
        mp.caption ILIKE $${pIdx} OR
        c.company_name ILIKE $${pIdx} OR
        mp.id ILIKE $${pIdx}
      )`);
    }

    const whereSql = `WHERE ${whereClauses.join(' AND ')}`;

    const countRes = await query(`
      SELECT COUNT(*)::INT AS total
      FROM marketing_posts mp
      LEFT JOIN customers c ON c.id = mp.customer_id
      ${whereSql}
    `, params);
    const totalCount = Number(countRes.rows[0]?.total || 0);

    const dataSql = `
      SELECT
        mp.id,
        mp.customer_id,
        c.company_name,
        c.category AS customer_category,
        c.city,
        mp.idea_id,
        mi.title AS idea_title,
        mp.title,
        mp.platform,
        mp.caption,
        mp.hashtags,
        mp.call_to_action,
        mp.media_url,
        mp.media_type,
        mp.creative_format,
        mp.status,
        mp.revision_number,
        mp.designer_name,
        mp.designer_notes,
        mp.submitted_at,
        mp.created_at,
        mp.updated_at,
        r.reviewer_name,
        r.reviewer_role,
        r.decision,
        r.remarks,
        r.rejection_reason,
        r.correction_instructions,
        r.created_at AS rejected_at
      FROM marketing_posts mp
      LEFT JOIN customers c ON c.id = mp.customer_id
      LEFT JOIN marketing_ideas mi ON mi.id = mp.idea_id
      LEFT JOIN LATERAL (
        SELECT * FROM marketing_post_reviews mpr
        WHERE mpr.post_id = mp.id
        ORDER BY mpr.created_at DESC
        LIMIT 1
      ) r ON TRUE
      ${whereSql}
      ORDER BY r.created_at DESC NULLS LAST, mp.updated_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const dataRes = await query(dataSql, [...params, limitNum, offset]);

    res.json({
      ok: true,
      rejectedPosts: dataRes.rows.map((r) => ({
        id: r.id,
        customerId: r.customer_id,
        companyName: r.company_name,
        customerCategory: r.customer_category,
        city: r.city,
        ideaTitle: r.idea_title || '',
        title: r.title,
        platform: r.platform,
        caption: r.caption,
        hashtags: r.hashtags,
        callToAction: r.call_to_action,
        mediaUrl: r.media_url,
        mediaType: r.media_type,
        creativeFormat: r.creative_format || 'Instagram / Facebook Post',
        status: r.status,
        revisionNumber: Number(r.revision_number || 1),
        designerName: r.designer_name || 'Graphics Designer',
        designerNotes: r.designer_notes || '',
        reviewerName: r.reviewer_name || 'Marketing Quality Auditor',
        reviewerRole: r.reviewer_role || 'Senior Marketing Auditor',
        decision: r.decision || r.status,
        remarks: r.remarks || '',
        rejectionReason: r.rejection_reason || r.correction_instructions || r.remarks || 'Changes required by marketing auditor.',
        correctionInstructions: r.correction_instructions || '',
        rejectedAt: r.rejected_at || r.updated_at,
      })),
      pagination: {
        total: totalCount,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(totalCount / limitNum) || 1,
      },
    });
  } catch (err) {
    console.error('[GET /api/graphics/rejected]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});
