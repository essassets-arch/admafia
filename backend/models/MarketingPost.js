import mongoose from 'mongoose';

const ArtworkRevisionSchema = new mongoose.Schema({
  revisionNumber: { type: Number, required: true },
  artworkUrl: { type: String, required: true },
  fileSize: { type: Number, default: 0 },
  mimeType: { type: String, default: 'image/png' },
  dimensions: {
    width: { type: Number, default: null },
    height: { type: Number, default: null }
  },
  status: {
    type: String,
    enum: ['Pending Verification', 'Approved', 'Rejected', 'Changes Requested'],
    default: 'Pending Verification'
  },
  rejectionReason: { type: String, default: null },
  uploadedBy: { type: String, default: 'customer' },
  uploadedAt: { type: Date, default: Date.now },
  revisionId: { type: String, default: null },
  mediaType: { type: String, default: 'image' },
  creativeFormat: { type: String, default: 'Instagram / Facebook Post' },
  designerNotes: { type: String, default: '' },
  designerName: { type: String, default: '' },
  reviewerName: { type: String, default: null },
  reviewRemarks: { type: String, default: '' },
  correctionInstructions: { type: String, default: '' },
  reviewedAt: { type: Date, default: null }
}, { _id: false });

const ArtworkReviewSchema = new mongoose.Schema({
  revisionNumber: { type: Number, required: true },
  action: { type: String, enum: ['Approved', 'Rejected', 'Changes Requested'], required: true },
  reviewerId: { type: String, required: true },
  notes: { type: String, default: '' },
  reviewedAt: { type: Date, default: Date.now },
  reviewId: { type: String, default: null },
  decision: { type: String, default: null },
  reviewerName: { type: String, default: null },
  reviewerRole: { type: String, default: 'Marketing Reviewer' },
  remarks: { type: String, default: '' },
  rejectionReason: { type: String, default: '' },
  correctionInstructions: { type: String, default: '' }
}, { _id: false });

const MarketingPostSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // Preserves original post_id (e.g. POST_179464...)
  customerId: { type: String, required: true, index: true }, // Links directly to PostgreSQL customers.id
  title: { type: String, required: true, trim: true },
  caption: { type: String, default: '' },
  targetPlatform: {
    type: String,
    default: 'Meta Ads (Facebook & Instagram)'
  },
  category: { type: String, default: 'General' },
  status: {
    type: String,
    default: 'Pending Verification',
    index: true
  },
  currentRevisionNumber: { type: Number, default: 1 },
  revisions: [ArtworkRevisionSchema],
  reviews: [ArtworkReviewSchema],
  tags: [{ type: String }],
  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  ideaId: { type: String, default: null },
  platform: { type: String, default: null },
  hashtags: { type: String, default: '' },
  callToAction: { type: String, default: '' },
  mediaUrl: { type: String, default: '' },
  mediaType: { type: String, default: 'image' },
  language: { type: String, default: 'English / Hinglish' },
  campaignAssociation: { type: String, default: '' },
  intendedPublishAt: { type: Date, default: null },
  submittedBy: { type: String, default: null },
  submittedAt: { type: Date, default: null },
  creativeFormat: { type: String, default: 'Instagram / Facebook Post' },
  designerNotes: { type: String, default: '' },
  designerName: { type: String, default: 'Graphics Designer' },
  creativeInstructions: { type: String, default: '' },
  priority: { type: String, default: 'Normal' },
  deletedBy: { type: String, default: null },
  createdBy: { type: String, default: 'Marketing Content Team' }
}, {
  collection: 'marketing_posts',
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' }
});

// Compound indexes for high-speed multi-tenant queries
MarketingPostSchema.index({ customerId: 1, status: 1 });
MarketingPostSchema.index({ customerId: 1, isDeleted: 1 });

export const MarketingPost = mongoose.models.MarketingPost || mongoose.model('MarketingPost', MarketingPostSchema);
export default MarketingPost;
