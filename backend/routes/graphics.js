import express from 'express';
import { MarketingPost, MarketingAuditEvent } from '../models/index.js';
import { withMongoTransaction, genId } from '../repositories/tx.js';
import { recordOutboxEvent } from '../services/outboxWorker.js';
import {
  PENDING_UPLOAD_STATUSES,
  REJECTED_STATUSES,
  containsRegex,
  mediaStages,
  customerLookupStages,
  platformMatch,
  priorityMatch,
  postEffectiveMediaUrl,
  reviewRowsDesc,
  revisionRowsDesc,
  latestReviewRow,
  loadIdeasById,
  loadCampaignsByPostId,
} from '../repositories/graphicsRepo.js';

export const graphicsRouter = express.Router();

// Helper: Audit Logger (MongoDB + Transactional Outbox)
async function logAuditEvent(customerId, entityType, entityId, action, actor, details = {}) {
  try {
    const id = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    await MarketingAuditEvent.create({
      _id: id,
      customerId: customerId || 'unknown',
      eventType: `${entityType}_${action}`,
      postId: entityId,
      campaignId: null,
      payload: {
        ...details,
        entityType,
        entityId,
        actionLabel: action,
        actor: actor || 'Graphics Designer',
      },
      timestamp: new Date(),
    });
    // Reliable Transactional Outbox record
    recordOutboxEvent(null, {
      aggregateType: 'marketing_audit_event',
      aggregateId: id,
      eventType: 'AUDIT_RECORDED',
      payload: {
        id,
        customerId,
        action: `${entityType}_${action}`,
        postId: entityId,
        details,
        timestamp: new Date()
      }
    }).catch(() => {});
  } catch (err) {
    console.error('[Graphics Audit Log Error]:', err.message);
  }
}

function parsePaging(query, defaultLimit = 30) {
  const { page = 1, limit = defaultLimit } = query;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || defaultLimit));
  const offset = (pageNum - 1) * limitNum;
  return { pageNum, limitNum, offset };
}

function searchStage(search) {
  const re = containsRegex(String(search).trim());
  return {
    $match: {
      $or: [
        { title: re },
        { caption: re },
        { '_cust.companyName': re },
        { '_cust.contactPerson': re },
        { '_cust.phone': re },
        { _id: re },
      ],
    },
  };
}

// -----------------------------------------------------------------------------
// 1. GET /api/graphics/summary (Graphics Department KPI Ribbon)
// -----------------------------------------------------------------------------
graphicsRouter.get('/summary', async (req, res) => {
  try {
    const [row = {}] = await MarketingPost.aggregate([
      { $match: { isDeleted: { $ne: true } } },
      ...mediaStages(),
      {
        $group: {
          _id: null,
          total_requests: { $sum: 1 },
          pending_uploads: {
            $sum: {
              $cond: [{ $or: [{ $in: ['$status', PENDING_UPLOAD_STATUSES] }, { $eq: ['$_mediaUrl', ''] }] }, 1, 0],
            },
          },
          pending_verification: { $sum: { $cond: [{ $eq: ['$status', 'Pending Verification'] }, 1, 0] } },
          approved_count: { $sum: { $cond: [{ $eq: ['$status', 'Approved'] }, 1, 0] } },
          rejected_count: { $sum: { $cond: [{ $in: ['$status', REJECTED_STATUSES] }, 1, 0] } },
        },
      },
    ]);

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
    } = req.query;

    const { pageNum, limitNum, offset } = parsePaging(req.query);

    const pre = { isDeleted: { $ne: true } };
    const andClauses = [];
    const afterMedia = [];

    if (status && status !== 'all') {
      if (status === 'Needs Artwork') {
        afterMedia.push({
          $match: { $or: [{ status: { $in: PENDING_UPLOAD_STATUSES } }, { _mediaUrl: '' }] },
        });
      } else {
        pre.status = String(status);
      }
    }

    if (platform && platform !== 'all') {
      andClauses.push(platformMatch(String(platform)));
    }

    if (priority && priority !== 'all') {
      andClauses.push(priorityMatch(String(priority)));
    }

    if (customerId) {
      pre.customerId = String(customerId);
    }
    if (andClauses.length) pre.$and = andClauses;

    const hasSearch = Boolean(search && String(search).trim());

    const filterStages = [
      { $match: pre },
      ...mediaStages(),
      ...afterMedia,
      ...(hasSearch ? [...customerLookupStages(), searchStage(search)] : []),
    ];

    const countRows = await MarketingPost.aggregate([...filterStages, { $count: 'total' }]);
    const totalCount = Number(countRows[0]?.total || 0);

    const rows = await MarketingPost.aggregate([
      ...filterStages,
      ...(hasSearch ? [] : customerLookupStages()),
      {
        $addFields: {
          _rank: {
            $switch: {
              branches: [
                { case: { $in: ['$status', REJECTED_STATUSES] }, then: 1 },
                { case: { $in: ['$status', ['Draft', 'Pending Graphics']] }, then: 2 },
                { case: { $eq: ['$status', 'In Progress'] }, then: 3 },
                { case: { $eq: ['$status', 'Pending Verification'] }, then: 4 },
              ],
              default: 5,
            },
          },
        },
      },
      { $sort: { _rank: 1, createdAt: -1, _id: 1 } },
      { $skip: offset },
      { $limit: limitNum },
      { $project: { revisions: 0 } },
    ]).allowDiskUse(true);

    const ideas = await loadIdeasById(rows.map((r) => r.ideaId));

    res.json({
      ok: true,
      requests: rows.map((r) => {
        const c = r._cust || {};
        const idea = (r.ideaId && ideas.get(String(r.ideaId))) || null;
        const latest = latestReviewRow(r);
        const mediaUrl = r._mediaUrl || '';
        return {
          id: r._id,
          customerId: r.customerId,
          companyName: c.companyName || 'Direct Customer',
          contactPerson: c.contactPerson || '',
          phone: c.phone || '',
          city: c.city || '',
          customerCategory: c.category || 'General',
          ideaId: r.ideaId ?? null,
          ideaTitle: idea?.title || '',
          ideaConcept: idea?.concept || '',
          ideaTargetAudience: idea?.targetAudience || '',
          title: r.title,
          platform: r.platform ?? r.targetPlatform,
          caption: r.caption,
          hashtags: r.hashtags || '',
          callToAction: r.callToAction || 'Enquire Now',
          mediaUrl,
          mediaType: r.mediaType || 'image',
          creativeFormat: r.creativeFormat || 'Instagram / Facebook Post',
          designerNotes: r.designerNotes || '',
          designerName: r.designerName || 'Graphics Designer',
          creativeInstructions: r.creativeInstructions || '',
          priority: r.priority || 'Normal',
          language: r.language || 'English / Hinglish',
          status: r.status,
          revisionNumber: Number(r.currentRevisionNumber || 1),
          submittedBy: r.submittedBy ?? null,
          submittedAt: r.submittedAt ?? null,
          createdBy: r.createdBy ?? null,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
          latestReview: latest
            ? {
                reviewerName: latest.reviewer_name,
                decision: latest.decision,
                remarks: latest.remarks,
                rejectionReason: latest.rejection_reason,
                correctionInstructions: latest.correction_instructions,
                createdAt: latest.created_at,
              }
            : null,
          isEligibleForUpload: [...PENDING_UPLOAD_STATUSES, ...REJECTED_STATUSES].includes(r.status) || !mediaUrl,
        };
      }),
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

    const [post] = await MarketingPost.aggregate([
      { $match: { _id: String(postId), isDeleted: { $ne: true } } },
      ...customerLookupStages(),
    ]);

    if (!post) {
      return res.status(404).json({ ok: false, error: 'Post request not found.' });
    }

    const c = post._cust || {};
    const ideas = await loadIdeasById([post.ideaId]);
    const idea = (post.ideaId && ideas.get(String(post.ideaId))) || null;

    const revisions = revisionRowsDesc(post);
    const reviews = reviewRowsDesc(post);

    res.json({
      ok: true,
      revisions,
      reviews,
      request: {
        id: post._id,
        customerId: post.customerId,
        companyName: c.companyName,
        contactPerson: c.contactPerson,
        phone: c.phone,
        email: c.email,
        city: c.city,
        customerCategory: c.category,
        ideaId: post.ideaId ?? null,
        ideaTitle: idea?.title,
        ideaConcept: idea?.concept,
        ideaTargetAudience: idea?.targetAudience,
        title: post.title,
        platform: post.platform ?? post.targetPlatform,
        caption: post.caption,
        hashtags: post.hashtags ?? '',
        callToAction: post.callToAction ?? '',
        mediaUrl: postEffectiveMediaUrl(post),
        mediaType: post.mediaType || 'image',
        creativeFormat: post.creativeFormat || 'Instagram / Facebook Post',
        designerNotes: post.designerNotes || '',
        designerName: post.designerName || 'Graphics Designer',
        creativeInstructions: post.creativeInstructions || '',
        priority: post.priority || 'Normal',
        language: post.language ?? 'English / Hinglish',
        status: post.status,
        revisionNumber: Number(post.currentRevisionNumber || 1),
        submittedBy: post.submittedBy ?? null,
        submittedAt: post.submittedAt ?? null,
        createdBy: post.createdBy ?? null,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        revisions,
        reviews,
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

    const post = await MarketingPost.findOne({ _id: String(postId), isDeleted: { $ne: true } }).lean();
    if (!post) {
      return res.status(404).json({ ok: false, error: 'Selected post request not found.' });
    }

    // Cannot upload directly to already approved post that already has verified artwork
    if (post.status === 'Approved' && postEffectiveMediaUrl(post)) {
      return res.status(400).json({
        ok: false,
        error: 'This post is already Approved for live campaigns. Use revision reupload if changes are needed.',
      });
    }

    const currentRev = Number(post.currentRevisionNumber || 1);
    const revId = genId('rev');
    const cleanUrl = mediaUrl.trim();

    await withMongoTransaction(async (session) => {
      const now = new Date();

      // 1 + 2. Create the revision record and update the post with artwork,
      // transitioning it to 'Pending Verification' (single atomic document update)
      const updated = await MarketingPost.updateOne(
        { _id: String(postId), isDeleted: { $ne: true } },
        {
          $set: {
            mediaUrl: cleanUrl,
            mediaType,
            creativeFormat,
            designerNotes,
            designerName,
            status: 'Pending Verification',
            submittedBy: designerName,
            submittedAt: now,
            updatedAt: now,
          },
          $push: {
            revisions: {
              revisionId: revId,
              revisionNumber: currentRev,
              artworkUrl: cleanUrl,
              fileSize: 0,
              mimeType: mediaType,
              mediaType,
              creativeFormat,
              designerNotes,
              designerName,
              status: 'Pending Verification',
              uploadedBy: designerName,
              uploadedAt: now,
            },
          },
        },
        { session }
      );
      if (!updated.matchedCount) {
        const err = new Error('Selected post request not found.');
        err.statusCode = 404;
        throw err;
      }

      // 3. Atomically enqueue into transactional outbox
      await recordOutboxEvent(session, {
        aggregateType: 'artwork_revision',
        aggregateId: String(postId),
        eventType: 'ARTWORK_UPLOADED',
        payload: {
          revision_id: revId,
          revision_number: currentRev,
          media_url: cleanUrl,
          media_type: mediaType,
          designer_name: designerName,
          status: 'Pending Verification',
          created_at: now
        }
      });
    });

    await logAuditEvent(post.customerId, 'graphics_upload', postId, 'Uploaded Creative Artwork', designerName, {
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
      mediaUrl: cleanUrl,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ ok: false, error: err.message });
    }
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

    await withMongoTransaction(async (session) => {
      // 1. Read the post inside the transaction (snapshot isolation + the conditional
      // revision-number write below replace the PostgreSQL row-level FOR UPDATE lock)
      const post = await MarketingPost.findOne({ _id: String(postId), isDeleted: { $ne: true } })
        .session(session)
        .lean();
      if (!post) {
        const err = new Error('Post request not found or archived.');
        err.statusCode = 404;
        throw err;
      }

      const currentRev = Number(post.currentRevisionNumber || 1);
      const nextRev = currentRev + 1;
      const revId = genId('rev');
      const now = new Date();
      const cleanUrl = mediaUrl.trim();
      const fullNotes = revisionSummary
        ? `${designerNotes ? designerNotes + ' | ' : ''}Correction: ${revisionSummary}`
        : designerNotes;

      // 2 + 3. Insert the new immutable revision and move the post to the next revision number,
      // back to 'Pending Verification'. Conditional on the revision number we read, so two
      // concurrent reuploads can never both claim the same revision number.
      const updated = await MarketingPost.updateOne(
        {
          _id: String(postId),
          isDeleted: { $ne: true },
          currentRevisionNumber: post.currentRevisionNumber ?? 1,
        },
        {
          $set: {
            mediaUrl: cleanUrl,
            mediaType,
            creativeFormat,
            designerNotes: fullNotes,
            designerName,
            currentRevisionNumber: nextRev,
            status: 'Pending Verification',
            submittedBy: designerName,
            submittedAt: now,
            updatedAt: now,
          },
          $push: {
            revisions: {
              revisionId: revId,
              revisionNumber: nextRev,
              artworkUrl: cleanUrl,
              fileSize: 0,
              mimeType: mediaType,
              mediaType,
              creativeFormat,
              designerNotes: fullNotes,
              designerName,
              status: 'Pending Verification',
              uploadedBy: designerName,
              uploadedAt: now,
            },
          },
        },
        { session }
      );
      if (!updated.matchedCount) {
        const err = new Error('Post was modified by another request. Please retry.');
        err.statusCode = 409;
        throw err;
      }

      // 4. Atomically enqueue into transactional outbox
      await recordOutboxEvent(session, {
        aggregateType: 'artwork_revision',
        aggregateId: String(postId),
        eventType: 'ARTWORK_UPLOADED',
        payload: {
          revision_id: revId,
          revision_number: nextRev,
          media_url: cleanUrl,
          media_type: mediaType,
          designer_name: designerName,
          status: 'Pending Verification',
          created_at: now
        }
      });

      resultPayload = {
        customerId: post.customerId,
        nextRev,
        mediaUrl: cleanUrl,
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
    const { search = '' } = req.query;
    const { pageNum, limitNum, offset } = parsePaging(req.query);

    const hasSearch = Boolean(search && String(search).trim());

    const filterStages = [
      { $match: { status: 'Approved', isDeleted: { $ne: true } } },
      ...mediaStages(),
      { $match: { _mediaUrl: { $nin: [null, ''] } } },
      ...(hasSearch ? [...customerLookupStages(), searchStage(search)] : []),
    ];

    const countRows = await MarketingPost.aggregate([...filterStages, { $count: 'total' }]);
    const totalCount = Number(countRows[0]?.total || 0);

    const rows = await MarketingPost.aggregate([
      ...filterStages,
      ...(hasSearch ? [] : customerLookupStages()),
      {
        $addFields: {
          _approvedAt: {
            $max: {
              $map: {
                input: {
                  $filter: {
                    input: { $ifNull: ['$reviews', []] },
                    as: 'rv',
                    cond: { $eq: [{ $ifNull: ['$$rv.decision', '$$rv.action'] }, 'Approved'] },
                  },
                },
                as: 'rv',
                in: '$$rv.reviewedAt',
              },
            },
          },
        },
      },
      { $sort: { _approvedAt: -1, updatedAt: -1, _id: 1 } },
      { $skip: offset },
      { $limit: limitNum },
      { $project: { revisions: 0 } },
    ]).allowDiskUse(true);

    const campaigns = await loadCampaignsByPostId(rows.map((r) => r._id));

    res.json({
      ok: true,
      approvedPosts: rows.map((r) => {
        const c = r._cust || {};
        const review = latestReviewRow(r, 'Approved');
        const campaign = campaigns.get(String(r._id));
        return {
          id: r._id,
          customerId: r.customerId,
          companyName: c.companyName,
          customerCategory: c.category,
          city: c.city,
          title: r.title,
          platform: r.platform ?? r.targetPlatform,
          caption: r.caption,
          hashtags: r.hashtags ?? '',
          callToAction: r.callToAction ?? '',
          mediaUrl: r._mediaUrl,
          mediaType: r.mediaType || 'image',
          creativeFormat: r.creativeFormat || 'Instagram / Facebook Post',
          revisionNumber: Number(r.currentRevisionNumber || 1),
          designerName: r.designerName || 'Graphics Designer',
          reviewerName: review?.reviewer_name || 'Marketing Quality Auditor',
          reviewerRole: review?.reviewer_role || 'Senior Marketing Auditor',
          approvalRemarks: review?.remarks || 'Verified and approved for campaigns.',
          approvedAt: review?.created_at || r.updatedAt,
          linkedCampaignName: campaign ? (campaign.campaignName || campaign.name || null) : null,
          linkedCampaignStatus: campaign ? (campaign.status || null) : null,
        };
      }),
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
    const { search = '' } = req.query;
    const { pageNum, limitNum, offset } = parsePaging(req.query);

    const hasSearch = Boolean(search && String(search).trim());

    // Search covers title, caption, company name and post id
    const searchOnly = (term) => {
      const re = containsRegex(String(term).trim());
      return {
        $match: {
          $or: [{ title: re }, { caption: re }, { '_cust.companyName': re }, { _id: re }],
        },
      };
    };

    const filterStages = [
      { $match: { status: { $in: REJECTED_STATUSES }, isDeleted: { $ne: true } } },
      ...(hasSearch ? [...customerLookupStages(), searchOnly(search)] : []),
    ];

    const countRows = await MarketingPost.aggregate([...filterStages, { $count: 'total' }]);
    const totalCount = Number(countRows[0]?.total || 0);

    const rows = await MarketingPost.aggregate([
      ...filterStages,
      ...mediaStages(),
      ...(hasSearch ? [] : customerLookupStages()),
      { $addFields: { _rejectedAt: { $max: { $ifNull: ['$reviews.reviewedAt', []] } } } },
      { $sort: { _rejectedAt: -1, updatedAt: -1, _id: 1 } },
      { $skip: offset },
      { $limit: limitNum },
      { $project: { revisions: 0 } },
    ]).allowDiskUse(true);

    const ideas = await loadIdeasById(rows.map((r) => r.ideaId));

    res.json({
      ok: true,
      rejectedPosts: rows.map((r) => {
        const c = r._cust || {};
        const idea = (r.ideaId && ideas.get(String(r.ideaId))) || null;
        const rv = latestReviewRow(r) || {};
        return {
          id: r._id,
          customerId: r.customerId,
          companyName: c.companyName,
          customerCategory: c.category,
          city: c.city,
          ideaTitle: idea?.title || '',
          title: r.title,
          platform: r.platform ?? r.targetPlatform,
          caption: r.caption,
          hashtags: r.hashtags ?? '',
          callToAction: r.callToAction ?? '',
          mediaUrl: r._mediaUrl,
          mediaType: r.mediaType || 'image',
          creativeFormat: r.creativeFormat || 'Instagram / Facebook Post',
          status: r.status,
          revisionNumber: Number(r.currentRevisionNumber || 1),
          designerName: r.designerName || 'Graphics Designer',
          designerNotes: r.designerNotes || '',
          reviewerName: rv.reviewer_name || 'Marketing Quality Auditor',
          reviewerRole: rv.reviewer_role || 'Senior Marketing Auditor',
          decision: rv.decision || r.status,
          remarks: rv.remarks || '',
          rejectionReason: rv.rejection_reason || rv.correction_instructions || rv.remarks || 'Changes required by marketing auditor.',
          correctionInstructions: rv.correction_instructions || '',
          rejectedAt: rv.created_at || r.updatedAt,
        };
      }),
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
