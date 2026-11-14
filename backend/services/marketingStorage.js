import { isMongoConnected } from '../mongo.js';
import { MarketingPost } from '../models/MarketingPost.js';
import { MarketingIdea } from '../models/MarketingIdea.js';
import { MarketingAuditEvent, SuperAdminAuditLog } from '../models/TelemetryAudit.js';

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

    const optional = {
      ideaId: post.idea_id,
      platform: post.platform || post.target_platform,
      hashtags: post.hashtags,
      callToAction: post.call_to_action,
      mediaUrl: post.media_url,
      mediaType: post.media_type,
      language: post.language,
      campaignAssociation: post.campaign_association,
      intendedPublishAt: post.intended_publish_at ? new Date(post.intended_publish_at) : undefined,
      submittedBy: post.submitted_by,
      submittedAt: post.submitted_at ? new Date(post.submitted_at) : undefined,
      creativeFormat: post.creative_format,
      designerNotes: post.designer_notes,
      designerName: post.designer_name,
      creativeInstructions: post.creative_instructions,
      priority: post.priority,
      deletedBy: post.deleted_by,
      createdBy: post.created_by,
    };
    for (const [key, value] of Object.entries(optional)) {
      if (value !== undefined && value !== null) doc[key] = value;
    }

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
      mediaType: rev.media_type || 'image',
      creativeFormat: rev.creative_format || undefined,
      designerNotes: rev.designer_notes || undefined,
      designerName: rev.designer_name || undefined,
      revisionId: rev.revision_id || undefined,
    };
    for (const key of Object.keys(revObj)) {
      if (revObj[key] === undefined) delete revObj[key];
    }

    // Upsert or push to revisions array
    const post = await MarketingPost.findById(postId);
    if (!post) return null;

    const existingIdx = post.revisions.findIndex(r => r.revisionNumber === revObj.revisionNumber);
    if (existingIdx >= 0) {
      // Merge: never discard richer data (designer notes, review outcome...) already stored
      const existing = typeof post.revisions[existingIdx].toObject === 'function'
        ? post.revisions[existingIdx].toObject()
        : post.revisions[existingIdx];
      const merged = { ...existing, ...revObj };
      if (existing.status && existing.status !== 'Pending Verification') {
        merged.status = existing.status;
        merged.rejectionReason = existing.rejectionReason;
      }
      post.revisions[existingIdx] = merged;
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
 * Historical reconciliation ETL (legacy).
 * MongoDB is now the only datastore: posts, revisions, reviews and audit events are written to
 * MongoDB directly, so there is no PostgreSQL source left to reconcile from. Kept as a harmless
 * no-op so existing callers (server.js startup) keep working. One-off historical imports are
 * handled by scripts/migrate-pg-to-mongo.js.
 */
export async function migrateHistoricalMarketingData() {
  if (!isMongoConnected()) {
    return { ok: false, message: 'MongoDB not connected' };
  }

  return {
    ok: true,
    skipped: true,
    synced: {
      posts: 0,
      revisions: 0,
      reviews: 0,
      auditEvents: 0,
    }
  };
}
