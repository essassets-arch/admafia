import mongoose from 'mongoose';

const MarketingIdeaSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  customerId: { type: String, required: true, index: true },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  targetAudience: { type: String, default: '' },
  concept: { type: String, default: '' },
  category: { type: String, default: 'General' },
  suggestedPlatform: { type: String, default: 'Instagram' },
  status: {
    type: String,
    enum: ['Draft', 'Proposed', 'Approved', 'Rejected', 'Converted', 'Saved', 'Archived'],
    default: 'Proposed',
    index: true
  },
  tags: [{ type: String }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  objective: { type: String, default: '' },
  captionSuggestions: { type: String, default: '' },
  callToAction: { type: String, default: '' },
  hashtags: { type: String, default: '' },
  creativeBrief: { type: String, default: '' },
  platform: { type: String, default: 'Meta Ads (Facebook & Instagram)' },
  language: { type: String, default: 'English / Hinglish' },
  campaignPeriod: { type: String, default: '' },
  constraints: { type: String, default: '' },
  createdBy: { type: String, default: 'Marketing Executive' }
}, {
  collection: 'marketing_ideas',
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' }
});

MarketingIdeaSchema.index({ customerId: 1, status: 1 });

export const MarketingIdea = mongoose.models.MarketingIdea || mongoose.model('MarketingIdea', MarketingIdeaSchema);
export default MarketingIdea;
