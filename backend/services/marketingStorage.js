import { isMongoConnected } from '../mongo.js';
import { MarketingPost } from '../models/MarketingPost.js';
import { MarketingIdea } from '../models/MarketingIdea.js';
import { MarketingAuditEvent, SuperAdminAuditLog } from '../models/TelemetryAudit.js';
import { query } from '../db.js';

/**
 * Marketing Storage Service (Dual-Store & Document Engine)
 * Synchronizes marketing posts, artwork revisions, review decisions, and telemetry into MongoDB.
 */

export async function syncPostToMongo(post) {
  if (!isMongoConnected() || !post || !post.id) return null;

  try {
    const doc = {
      _id: post.id,
      customerId: post.customer_id,
      title: post.title || 'Untitled Post',
      caption: post.caption || '',
      targetPlatform: post.platform || post.target_platform || 'All',
      category: post.category || 'General',
      status: post.status || 'Pending Verification',
      currentRevisionNumber: Number(post.revision_number || 1),
      isDeleted: Boolean(post.is_deleted),
      createdAt: post.created_at ? new Date(post.created_at) : new Date(),
      updatedAt: post.updated_at ? new Date(post.updated_at) : new Date(),
    };

    return await MarketingPost.findByIdAndUpdate(
      post.id,
      { $set: doc },
      { upsert: true, new: true }
    );
  } catch (err) {
    console.warn(`[MarketingStorage] syncPostToMongo error for ${post.id}:`, err.message);
    return null;
  }
}

export async function syncRevisionToMongo(postId, rev) {
  if (!isMongoConnected() || !postId || !rev) return null;

  try {
    const revObj = {
      revisionNumber: Number(rev.revision_number || 1),
      artworkUrl: rev.media_url || rev.artwork_url || '',
      fileSize: Number(rev.file_size || 0),
      mimeType: rev.mime_type || rev.media_type || 'image/png',
      dimensions: rev.dimensions || { width: null, height: null },
      status: rev.status || 'Pending Verification',
      rejectionReason: rev.rejection_reason || null,
      uploadedBy: rev.uploaded_by || rev.designer_name || 'designer',
      uploadedAt: rev.created_at ? new Date(rev.created_at) : new Date(),
    };

    // Upsert or push to revisions array
    const post = await MarketingPost.findById(postId);
    if (!post) return null;

    const existingIdx = post.revisions.findIndex(r => r.revisionNumber === revObj.revisionNumber);
    if (existingIdx >= 0) {
      post.revisions[existingIdx] = revObj;
    } else {
      post.revisions.push(revObj);
    }
    post.currentRevisionNumber = Math.max(post.currentRevisionNumber, revObj.revisionNumber);
    post.updatedAt = new Date();
    return await post.save();
  } catch (err) {
    console.warn(`[MarketingStorage] syncRevisionToMongo error for ${postId}:`, err.message);
    return null;
  }
}

export async function syncReviewToMongo(postId, review) {
  if (!isMongoConnected() || !postId || !review) return null;

  try {
    const revDecision = {
      revisionNumber: Number(review.revision_number || 1),
      action: review.action || review.decision || 'Approved',
      reviewerId: review.reviewer_id || review.reviewer_name || 'auditor',
      notes: review.notes || review.rejection_reason || review.approval_remarks || '',
      reviewedAt: review.created_at ? new Date(review.created_at) : new Date(),
    };

    const post = await MarketingPost.findById(postId);
    if (!post) return null;

    post.reviews.push(revDecision);
    post.status = revDecision.action;
    post.updatedAt = new Date();
    return await post.save();
  } catch (err) {
    console.warn(`[MarketingStorage] syncReviewToMongo error for ${postId}:`, err.message);
    return null;
  }
}

export async function recordTelemetryEvent(event) {
  if (!isMongoConnected() || !event) return null;

  try {
    const id = event.id || `audit_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    return await MarketingAuditEvent.findByIdAndUpdate(
      id,
      {
        $setOnInsert: {
          _id: id,
          customerId: event.customerId || event.customer_id,
          eventType: event.action || event.eventType || 'marketing_event',
          postId: event.postId || event.post_id || null,
          campaignId: event.campaignId || event.campaign_id || null,
          payload: event.details || event.payload || {},
          timestamp: event.timestamp ? new Date(event.timestamp) : new Date(),
        }
      },
      { upsert: true, new: true }
    );
  } catch (err) {
    if (err.code !== 11000) {
      console.warn('[MarketingStorage] recordTelemetryEvent error:', err.message);
    }
    return null;
  }
}

export async function recordSuperAdminAuditLog(log) {
  if (!isMongoConnected() || !log) return null;

  try {
    const id = log.id || `salog_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    return await SuperAdminAuditLog.findByIdAndUpdate(
      id,
      {
        $setOnInsert: {
          _id: id,
          action: log.action,
          adminId: log.adminId || log.admin_id,
          adminEmail: log.adminEmail || log.admin_email || null,
          targetEntity: log.targetEntity || log.target_entity || null,
          targetId: log.targetId || log.target_id || null,
          details: log.details || {},
          ipAddress: log.ipAddress || log.ip_address || null,
          userAgent: log.userAgent || log.user_agent || null,
          timestamp: log.timestamp ? new Date(log.timestamp) : new Date(),
        }
      },
      { upsert: true, new: true }
    );
  } catch (err) {
    if (err.code !== 11000) {
      console.warn('[MarketingStorage] recordSuperAdminAuditLog error:', err.message);
    }
    return null;
  }
}

/**
 * Migration & Historical Reconciliation ETL
 * Reconciles marketing posts, revisions, reviews, and audit events from PostgreSQL into MongoDB.
 */
export async function migrateHistoricalMarketingData() {
  if (!isMongoConnected()) {
    return { ok: false, message: 'MongoDB not connected' };
  }

  console.log('[ETL] Starting PostgreSQL to MongoDB Marketing Data Sync...');

  try {
    // 1. Fetch posts
    const postsRes = await query('SELECT * FROM marketing_posts ORDER BY created_at ASC');
    let postsSynced = 0;
    let revisionsSynced = 0;
    let reviewsSynced = 0;

    for (const post of postsRes.rows) {
      // Fetch revisions for this post
      const revRes = await query(
        'SELECT * FROM marketing_post_revisions WHERE post_id = $1 ORDER BY revision_number ASC',
        [post.id]
      );
      // Fetch reviews for this post
      const reviewRes = await query(
        'SELECT * FROM marketing_post_reviews WHERE post_id = $1 ORDER BY created_at ASC',
        [post.id]
      );

      const revisions = revRes.rows.map(r => ({
        revisionNumber: Number(r.revision_number || 1),
        artworkUrl: r.media_url || '',
        fileSize: Number(r.file_size || 0),
        mimeType: r.media_type || 'image/png',
        dimensions: { width: r.width || null, height: r.height || null },
        status: r.status || 'Pending Verification',
        rejectionReason: r.rejection_reason || null,
        uploadedBy: r.designer_name || 'designer',
        uploadedAt: r.created_at ? new Date(r.created_at) : new Date(),
      }));

      const reviews = reviewRes.rows.map(rv => ({
        revisionNumber: Number(rv.revision_number || 1),
        action: rv.decision || rv.action || 'Approved',
        reviewerId: rv.reviewer_name || rv.reviewer_id || 'auditor',
        notes: rv.approval_remarks || rv.rejection_reason || rv.notes || '',
        reviewedAt: rv.created_at ? new Date(rv.created_at) : new Date(),
      }));

      await MarketingPost.findByIdAndUpdate(
        post.id,
        {
          $set: {
            _id: post.id,
            customerId: post.customer_id,
            title: post.title || 'Untitled Post',
            caption: post.caption || '',
            targetPlatform: post.platform || 'All',
            category: post.category || 'General',
            status: post.status || 'Pending Verification',
            currentRevisionNumber: Number(post.revision_number || 1),
            revisions,
            reviews,
            isDeleted: Boolean(post.is_deleted),
            createdAt: post.created_at ? new Date(post.created_at) : new Date(),
            updatedAt: post.updated_at ? new Date(post.updated_at) : new Date(),
          }
        },
        { upsert: true }
      );

      postsSynced++;
      revisionsSynced += revisions.length;
      reviewsSynced += reviews.length;
    }

    console.log(`[ETL] Synchronized ${postsSynced} posts, ${revisionsSynced} revisions, ${reviewsSynced} reviews to MongoDB.`);

    // 2. Fetch and sync audit events
    const auditRes = await query('SELECT * FROM marketing_audit_events ORDER BY created_at ASC');
    let auditSynced = 0;
    for (const a of auditRes.rows) {
      let parsedDetails = {};
      try {
        parsedDetails = typeof a.details === 'string' ? JSON.parse(a.details) : (a.details || {});
      } catch (e) {}

      await MarketingAuditEvent.findByIdAndUpdate(
        a.id,
        {
          $set: {
            _id: a.id,
            customerId: a.customer_id,
            eventType: a.action || 'marketing_event',
            postId: a.entity_id || null,
            payload: parsedDetails,
            timestamp: a.created_at ? new Date(a.created_at) : new Date(),
          }
        },
        { upsert: true }
      );
      auditSynced++;
    }

    console.log(`[ETL] Synchronized ${auditSynced} marketing audit events to MongoDB.`);

    return {
      ok: true,
      synced: {
        posts: postsSynced,
        revisions: revisionsSynced,
        reviews: reviewsSynced,
        auditEvents: auditSynced,
      }
    };
  } catch (err) {
    console.error('[ETL Error]:', err);
    return { ok: false, error: err.message };
  }
}
