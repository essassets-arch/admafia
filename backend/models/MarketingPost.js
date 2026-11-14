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
    enum: ['Pending Verification', 'Approved', 'Rejected'],
    default: 'Pending Verification'
  },
  rejectionReason: { type: String, default: null },
  uploadedBy: { type: String, default: 'customer' },
  uploadedAt: { type: Date, default: Date.now }
}, { _id: false });

const ArtworkReviewSchema = new mongoose.Schema({
  revisionNumber: { type: Number, required: true },
  action: { type: String, enum: ['Approved', 'Rejected'], required: true },
  reviewerId: { type: String, required: true },
  notes: { type: String, default: '' },
  reviewedAt: { type: Date, default: Date.now }
}, { _id: false });

const MarketingPostSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // Preserves original post_id (e.g. POST_179464...)
  customerId: { type: String, required: true, index: true }, // Links directly to PostgreSQL customers.id
  title: { type: String, required: true, trim: true },
  caption: { type: String, default: '' },
  targetPlatform: {
    type: String,
    enum: ['Instagram', 'Facebook', 'LinkedIn', 'Twitter', 'All'],
    default: 'All'
  },
  category: { type: String, default: 'General' },
  status: {
    type: String,
    enum: ['Draft', 'Pending Verification', 'Approved', 'Rejected', 'Archived'],
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
  updatedAt: { type: Date, default: Date.now }
}, {
  collection: 'marketing_posts',
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' }
});

// Compound indexes for high-speed multi-tenant queries
MarketingPostSchema.index({ customerId: 1, status: 1 });
MarketingPostSchema.index({ customerId: 1, isDeleted: 1 });

export const MarketingPost = mongoose.models.MarketingPost || mongoose.model('MarketingPost', MarketingPostSchema);
export default MarketingPost;
