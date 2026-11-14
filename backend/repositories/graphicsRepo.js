import { Customer, MarketingIdea, MarketingCampaign } from '../models/index.js';

/**
 * Graphics department helpers (MongoDB). Everything here maps Mongo documents of the
 * `marketing_posts` collection (revisions + reviews are embedded) back to the legacy
 * snake_case / camelCase shapes the Graphics desk UI consumes.
 */

export function escapeRegex(value) {
  return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Escaped, case-insensitive "contains" regex (replacement for ILIKE '%term%'). */
export function containsRegex(term) {
  return new RegExp(escapeRegex(term), 'i');
}

export const PENDING_UPLOAD_STATUSES = ['Draft', 'Pending Graphics', 'In Progress'];
export const REJECTED_STATUSES = ['Rejected', 'Changes Requested'];

/**
 * Aggregation stages deriving `_mediaUrl`: the post-level artwork URL, falling back to the
 * latest embedded revision's artwork (older migrated posts only stored it on the revision).
 */
export function mediaStages() {
  return [
    { $addFields: { _lastRev: { $arrayElemAt: [{ $ifNull: ['$revisions', []] }, -1] } } },
    {
      $addFields: {
        _mediaUrl: {
          $let: {
            vars: {
              own: { $ifNull: ['$mediaUrl', ''] },
              rev: { $ifNull: ['$_lastRev.artworkUrl', ''] },
            },
            in: { $cond: [{ $ne: ['$$own', ''] }, '$$own', '$$rev'] },
          },
        },
      },
    },
  ];
}

/** LEFT JOIN customers (only the columns the desk needs). */
export function customerLookupStages() {
  return [
    {
      $lookup: {
        from: Customer.collection.name,
        localField: 'customerId',
        foreignField: '_id',
        pipeline: [{ $project: { companyName: 1, contactPerson: 1, phone: 1, email: 1, city: 1, category: 1 } }],
        as: '_cust',
      },
    },
    { $addFields: { _cust: { $first: '$_cust' } } },
  ];
}

/** Platform lives in `platform` (new writes) or `targetPlatform` (migrated posts). */
export function platformMatch(platform) {
  return { $or: [{ platform }, { platform: null, targetPlatform: platform }] };
}

export function priorityMatch(priority) {
  if (priority === 'Normal') return { $or: [{ priority: 'Normal' }, { priority: null }] };
  return { priority };
}

export function postEffectiveMediaUrl(post) {
  if (post?.mediaUrl) return post.mediaUrl;
  const revs = Array.isArray(post?.revisions) ? post.revisions : [];
  return revs.length ? (revs[revs.length - 1].artworkUrl || '') : '';
}

function timeOf(r) {
  const t = r?.reviewedAt || r?.createdAt;
  return t ? new Date(t).getTime() : 0;
}

/** Embedded review -> legacy `marketing_post_reviews` row. */
export function reviewToRow(postId, r, idx = 0) {
  const decision = r.decision || r.action || null;
  const notes = r.notes ?? '';
  return {
    id: r.reviewId || `${postId}_review_${idx + 1}`,
    post_id: postId,
    revision_number: Number(r.revisionNumber || 1),
    reviewer_name: r.reviewerName || r.reviewerId || null,
    reviewer_role: r.reviewerRole || 'Marketing Reviewer',
    decision,
    remarks: r.remarks || notes || '',
    rejection_reason: r.rejectionReason || (decision === 'Rejected' ? notes : '') || '',
    correction_instructions: r.correctionInstructions || (decision === 'Changes Requested' ? notes : '') || '',
    created_at: r.reviewedAt || r.createdAt || null,
  };
}

/** Embedded revision -> legacy `marketing_post_revisions` row. */
export function revisionToRow(postId, v) {
  return {
    id: v.revisionId || `${postId}_rev_${Number(v.revisionNumber || 1)}`,
    post_id: postId,
    revision_number: Number(v.revisionNumber || 1),
    media_url: v.artworkUrl || '',
    media_type: v.mediaType || v.mimeType || 'image',
    creative_format: v.creativeFormat || 'Instagram / Facebook Post',
    designer_notes: v.designerNotes || '',
    uploaded_by: v.uploadedBy || v.designerName || 'Graphics Designer',
    uploaded_at: v.uploadedAt || null,
    review_status: v.status || 'Pending Verification',
    reviewer_name: v.reviewerName || null,
    review_remarks: v.reviewRemarks || '',
    rejection_reason: v.rejectionReason || '',
    correction_instructions: v.correctionInstructions || '',
    reviewed_at: v.reviewedAt || null,
  };
}

/** Reviews as legacy rows, newest first (ORDER BY created_at DESC). */
export function reviewRowsDesc(post) {
  const reviews = (Array.isArray(post?.reviews) ? post.reviews : [])
    .map((r, idx) => ({ r, idx }))
    .sort((a, b) => timeOf(a.r) - timeOf(b.r) || a.idx - b.idx)
    .map(({ r }, idx) => reviewToRow(post._id, r, idx));
  return reviews.reverse();
}

/** Revisions as legacy rows, highest revision first (ORDER BY revision_number DESC). */
export function revisionRowsDesc(post) {
  return (Array.isArray(post?.revisions) ? post.revisions : [])
    .map((v, idx) => ({ v, idx }))
    .sort((a, b) => Number(a.v.revisionNumber || 1) - Number(b.v.revisionNumber || 1) || a.idx - b.idx)
    .map(({ v }) => revisionToRow(post._id, v))
    .reverse();
}

/** Most recent review row (optionally restricted to one decision). */
export function latestReviewRow(post, decision = null) {
  const rows = reviewRowsDesc(post);
  return (decision ? rows.find((r) => r.decision === decision) : rows[0]) || null;
}

/** Batch-load ideas by id -> Map(id -> idea lean doc). */
export async function loadIdeasById(ideaIds) {
  const ids = [...new Set(ideaIds.filter(Boolean))];
  if (ids.length === 0) return new Map();
  const ideas = await MarketingIdea.find({ _id: { $in: ids } }).lean();
  return new Map(ideas.map((i) => [String(i._id), i]));
}

/** Batch-load first campaign per post id -> Map(postId -> campaign lean doc). */
export async function loadCampaignsByPostId(postIds) {
  const ids = [...new Set(postIds.filter(Boolean))];
  if (ids.length === 0) return new Map();
  const campaigns = await MarketingCampaign.find({ postId: { $in: ids } }).sort({ createdAt: 1 }).lean();
  const map = new Map();
  for (const c of campaigns) {
    if (!map.has(String(c.postId))) map.set(String(c.postId), c);
  }
  return map;
}
