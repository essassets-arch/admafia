import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Upload,
  Image,
  Send,
  Save,
  CheckCircle2,
  Sparkles,
  Building,
  RefreshCw,
  Eye,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import Swal from 'sweetalert2';
import marketingApi from '../services/marketingApi';

export default function CreatePostIdeasDesk({
  initialCustomerId = null,
  initialIdeaId = null,
  onNavigateToDesk,
}) {
  const [customers, setCustomers] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState(initialCustomerId || '');
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  const [customerIdeas, setCustomerIdeas] = useState([]);
  const [selectedIdeaId, setSelectedIdeaId] = useState(initialIdeaId || '');

  // Form Fields
  const [title, setTitle] = useState('');
  const [platform, setPlatform] = useState('Meta Ads (Facebook & Instagram)');
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [callToAction, setCallToAction] = useState('Enquire Now');
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaType, setMediaType] = useState('image');
  const [language, setLanguage] = useState('English / Hinglish');
  const [campaignAssociation, setCampaignAssociation] = useState('');
  const [intendedPublishAt, setIntendedPublishAt] = useState('');

  // Status & Loaders
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [recentPosts, setRecentPosts] = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(false);

  // 1. Load Eligible Customers
  useEffect(() => {
    async function loadCustomers() {
      try {
        const res = await marketingApi.getCustomers({ limit: 100 });
        if (res && res.ok) {
          setCustomers(res.customers || []);
          if (initialCustomerId) {
            setSelectedCustomerId(initialCustomerId);
          } else if (res.customers.length > 0 && !selectedCustomerId) {
            setSelectedCustomerId(res.customers[0].id);
          }
        }
      } catch (err) {
        console.error('[CreatePostIdeasDesk] Customers load error', err);
      }
    }
    loadCustomers();
  }, [initialCustomerId]);

  // 2. Load Customer Profile, Ideas, and Recent Posts
  const fetchCustomerScopedData = useCallback(async (custId) => {
    if (!custId) return;
    setLoadingPosts(true);
    try {
      const [custData, ideasData, postsData] = await Promise.all([
        marketingApi.getCustomerDetail(custId),
        marketingApi.getIdeas({ customerId: custId }),
        marketingApi.getPosts({ customerId: custId }),
      ]);

      if (custData && custData.ok) {
        setSelectedCustomer(custData.customer);
      }

      if (ideasData && ideasData.ok) {
        const ideas = ideasData.ideas || [];
        setCustomerIdeas(ideas);
        if (initialIdeaId && ideas.some((i) => i.id === initialIdeaId)) {
          setSelectedIdeaId(initialIdeaId);
        } else if (ideas.length > 0 && !selectedIdeaId) {
          // Keep blank or default to first
        }
      }

      if (postsData && postsData.ok) {
        setRecentPosts(postsData.posts || []);
      }
    } catch (err) {
      console.error('[CreatePostIdeasDesk] Data load error', err);
    } finally {
      setLoadingPosts(false);
    }
  }, [initialIdeaId]);

  useEffect(() => {
    if (selectedCustomerId) {
      fetchCustomerScopedData(selectedCustomerId);
    }
  }, [selectedCustomerId, fetchCustomerScopedData]);

  // 3. When an Idea is Selected, populate form fields without overwriting active edits
  const handleSelectIdea = (ideaId) => {
    setSelectedIdeaId(ideaId);
    if (!ideaId) return;

    const matched = customerIdeas.find((i) => i.id === ideaId);
    if (matched) {
      if (!title) setTitle(matched.title || '');
      if (!caption && matched.captionSuggestions) setCaption(matched.captionSuggestions);
      if (!hashtags && matched.hashtags) setHashtags(matched.hashtags);
      if (matched.callToAction) setCallToAction(matched.callToAction);
      if (matched.platform) setPlatform(matched.platform);
      if (matched.language) setLanguage(matched.language);
    }
  };

  // 4. File / Media Upload Handler
  const handleFileUpload = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    // Validate size (max 15MB)
    if (file.size > 15 * 1024 * 1024) {
      Swal.fire({
        icon: 'error',
        title: 'File Too Large',
        text: 'The selected media file exceeds the maximum 15MB limit.',
      });
      return;
    }

    // Validate type
    const validMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4'];
    if (!validMimes.includes(file.type)) {
      Swal.fire({
        icon: 'error',
        title: 'Unsupported Format',
        text: 'Please upload an image (JPG, PNG, WEBP, GIF) or video (MP4).',
      });
      return;
    }

    setUploadingMedia(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = reader.result;
          const uploadRes = await marketingApi.uploadMedia(base64Data, file.name, file.type);
          if (uploadRes && uploadRes.ok) {
            setMediaUrl(uploadRes.url);
            setMediaType(file.type.startsWith('video') ? 'video' : 'image');
            Swal.fire({
              icon: 'success',
              title: 'Media Uploaded',
              text: 'Creative media file stored securely on server.',
              timer: 1200,
              showConfirmButton: false,
            });
          }
        } catch (uploadErr) {
          Swal.fire({
            icon: 'error',
            title: 'Upload Failed',
            text: uploadErr.message || 'Could not upload media.',
          });
        } finally {
          setUploadingMedia(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setUploadingMedia(false);
      Swal.fire({ icon: 'error', title: 'File Error', text: err.message });
    }
  };

  // 5. Submit or Save Post
  const handleSaveOrSubmit = async (targetStatus) => {
    if (!selectedCustomerId) {
      Swal.fire({ icon: 'warning', title: 'Please select a customer first.' });
      return;
    }
    if (!title.trim()) {
      Swal.fire({ icon: 'warning', title: 'Please enter a post title.' });
      return;
    }
    if (!caption.trim()) {
      Swal.fire({ icon: 'warning', title: 'Please enter the post caption / copy.' });
      return;
    }

    if (targetStatus === 'Pending Verification') {
      const confirm = await Swal.fire({
        title: 'Submit Post for Verification?',
        text: 'This post will enter the Verification Audit Queue for quality and compliance review.',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#4f46e5',
        confirmButtonText: 'Yes, Submit for Review',
      });
      if (!confirm.isConfirmed) return;
    }

    setSubmitting(true);
    try {
      const res = await marketingApi.createPost({
        customerId: selectedCustomerId,
        ideaId: selectedIdeaId || null,
        title,
        platform,
        caption,
        hashtags,
        callToAction,
        mediaUrl,
        mediaType,
        language,
        campaignAssociation,
        intendedPublishAt: intendedPublishAt || null,
        status: targetStatus,
        submittedBy: 'Marketing Creative Team',
      });

      if (res && res.ok) {
        await Swal.fire({
          icon: 'success',
          title: targetStatus === 'Pending Verification' ? 'Submitted for Verification!' : 'Draft Saved!',
          text: res.message || 'Post operation succeeded.',
          confirmButtonColor: '#4f46e5',
        });

        // Clear form
        setTitle('');
        setCaption('');
        setHashtags('');
        setMediaUrl('');
        setSelectedIdeaId('');

        // Refresh recent posts
        fetchCustomerScopedData(selectedCustomerId);

        if (targetStatus === 'Pending Verification' && onNavigateToDesk) {
          onNavigateToDesk('verify_posts');
        }
      }
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'Operation Failed',
        text: err.message || 'Could not save post.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="marketing-create-posts-page">
      {/* 1. Header */}
      <div className="marketing-page-header">
        <div className="marketing-header-title-col">
          <h1>Create Marketing Posts</h1>
          <p>
            Connect saved strategic ideas into verified social creative posts ready for audience deployment.
          </p>
        </div>
      </div>

      {/* 2. Customer & Idea Selector Controls */}
      <div className="marketing-controls-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', flex: 1 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '240px', flex: 1 }}>
            <label style={{ fontSize: '0.78rem', fontWeight: 800, color: '#475569' }}>1. ACTIVE CUSTOMER</label>
            <select
              className="marketing-select"
              value={selectedCustomerId}
              onChange={(e) => {
                setSelectedCustomerId(e.target.value);
                setSelectedIdeaId('');
              }}
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.category} (Bal: ₹{c.availableBalance})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '280px', flex: 1.5 }}>
            <label style={{ fontSize: '0.78rem', fontWeight: 800, color: '#475569' }}>
              2. LINK TO SAVED BUILD IDEA (CUSTOMER-SCOPED)
            </label>
            <select
              className="marketing-select"
              value={selectedIdeaId}
              onChange={(e) => handleSelectIdea(e.target.value)}
            >
              <option value="">-- No Direct Idea Link (Standalone Post) --</option>
              {customerIdeas.map((idea) => (
                <option key={idea.id} value={idea.id}>
                  [{idea.objective}] {idea.title} ({idea.status})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 3. Main Content Split: Form vs Live Simulator Preview */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(0, 1fr)', gap: '24px' }}>
        {/* Left Column: Post Creation Form */}
        <div className="marketing-table-card" style={{ padding: '24px' }}>
          <h3 style={{ margin: '0 0 18px 0', fontSize: '1.15rem', fontWeight: 800 }}>
            Post Details &amp; Creative Copy
          </h3>

          <div className="mkt-form-group">
            <label className="mkt-form-label">
              Post Title <span className="req">*</span>
            </label>
            <input
              type="text"
              className="mkt-form-input"
              placeholder="e.g. Inbound Enquiry Banner: IT & Software Solutions"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="mkt-form-group">
              <label className="mkt-form-label">Destination Platform</label>
              <select
                className="mkt-form-select"
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
              >
                <option value="Meta Ads (Facebook & Instagram)">Meta Ads (Facebook &amp; Instagram)</option>
                <option value="Google Ads">Google Ads</option>
                <option value="LinkedIn Ads">LinkedIn Ads</option>
              </select>
            </div>
            <div className="mkt-form-group">
              <label className="mkt-form-label">Language</label>
              <select
                className="mkt-form-select"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                <option value="English / Hinglish">English / Hinglish</option>
                <option value="English Only">English Only</option>
                <option value="Hindi">Hindi</option>
              </select>
            </div>
          </div>

          <div className="mkt-form-group">
            <label className="mkt-form-label">
              Caption / Advertising Content <span className="req">*</span>
            </label>
            <textarea
              className="mkt-form-textarea"
              rows={5}
              placeholder="Write the primary promotional text, bullet points and customer value proposition..."
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px' }}>
            <div className="mkt-form-group">
              <label className="mkt-form-label">Hashtags</label>
              <input
                type="text"
                className="mkt-form-input"
                placeholder="#Brand #LeadGen #Industry #Location"
                value={hashtags}
                onChange={(e) => setHashtags(e.target.value)}
              />
            </div>
            <div className="mkt-form-group">
              <label className="mkt-form-label">Call to Action (CTA)</label>
              <input
                type="text"
                className="mkt-form-input"
                placeholder="e.g. Enquire Now, Call Now"
                value={callToAction}
                onChange={(e) => setCallToAction(e.target.value)}
              />
            </div>
          </div>

          {/* Media Creative Attachment */}
          <div className="mkt-form-group">
            <label className="mkt-form-label">Media Creative Attachment (Image / Video)</label>
            <div
              style={{
                border: '2px dashed #cbd5e1',
                borderRadius: '12px',
                padding: '20px',
                textAlign: 'center',
                background: '#f8fafc',
                position: 'relative',
              }}
            >
              {uploadingMedia ? (
                <div style={{ color: '#4f46e5', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <RefreshCw size={18} className="spin" /> Uploading media creative...
                </div>
              ) : mediaUrl ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <CheckCircle2 size={20} color="#10b981" />
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0f172a' }}>
                      Creative attached ({mediaType})
                    </span>
                  </div>
                  <button
                    type="button"
                    className="mkt-btn-table-action danger"
                    onClick={() => setMediaUrl('')}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div>
                  <Upload size={24} style={{ color: '#94a3b8', marginBottom: '6px' }} />
                  <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#0f172a', marginBottom: '2px' }}>
                    Upload Creative Media
                  </div>
                  <div style={{ fontSize: '0.76rem', color: '#64748b', marginBottom: '12px' }}>
                    JPG, PNG, WEBP, GIF or MP4 (Max 15MB)
                  </div>
                  <label
                    style={{
                      display: 'inline-block',
                      padding: '7px 16px',
                      background: '#4f46e5',
                      color: '#ffffff',
                      borderRadius: '8px',
                      fontWeight: 700,
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                    }}
                  >
                    Select File from Device
                    <input
                      type="file"
                      accept="image/*,video/mp4"
                      onChange={handleFileUpload}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="mkt-form-group">
              <label className="mkt-form-label">Campaign Association (Optional)</label>
              <input
                type="text"
                className="mkt-form-input"
                placeholder="e.g. Q4 Meta Inbound Ads"
                value={campaignAssociation}
                onChange={(e) => setCampaignAssociation(e.target.value)}
              />
            </div>
            <div className="mkt-form-group">
              <label className="mkt-form-label">Intended Publish Schedule</label>
              <input
                type="datetime-local"
                className="mkt-form-input"
                value={intendedPublishAt}
                onChange={(e) => setIntendedPublishAt(e.target.value)}
              />
            </div>
          </div>

          {/* Action Row */}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px' }}>
            <button
              type="button"
              className="mkt-btn-table-action"
              onClick={() => handleSaveOrSubmit('Draft')}
              disabled={submitting}
            >
              <Save size={14} />
              <span>Save Draft</span>
            </button>
            <button
              type="button"
              className="marketing-btn-primary"
              onClick={() => handleSaveOrSubmit('Pending Verification')}
              disabled={submitting}
            >
              <Send size={14} />
              <span>{submitting ? 'Submitting...' : 'Submit for Verification'}</span>
            </button>
          </div>
        </div>

        {/* Right Column: Live Feed Simulator Preview */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="marketing-table-card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h4 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 800 }}>
                Live Feed Ad Simulator
              </h4>
              <span className="mkt-pill mkt-pill-slate">Interactive Preview</span>
            </div>

            {/* Simulated Instagram / Facebook Feed Card */}
            <div className="mkt-feed-preview-card">
              <div className="mkt-feed-header">
                <div className="mkt-feed-profile">
                  <div className="mkt-feed-avatar">
                    {selectedCustomer?.name ? selectedCustomer.name.charAt(0).toUpperCase() : 'A'}
                  </div>
                  <div>
                    <div className="mkt-feed-author-name">
                      {selectedCustomer?.name || 'Customer Business'}
                    </div>
                    <div className="mkt-feed-sponsored">Sponsored • Paid Meta Ad</div>
                  </div>
                </div>
                <span style={{ color: '#94a3b8', fontSize: '1rem', cursor: 'pointer' }}>•••</span>
              </div>

              {/* Media Container */}
              <div className="mkt-feed-media-wrap">
                {mediaUrl ? (
                  mediaType === 'video' ? (
                    <video src={mediaUrl} controls className="mkt-feed-media-img" />
                  ) : (
                    <img src={mediaUrl} alt="Ad Creative Preview" className="mkt-feed-media-img" />
                  )
                ) : (
                  <div style={{ textAlign: 'center', color: '#94a3b8', padding: '20px' }}>
                    <Image size={40} style={{ opacity: 0.5, marginBottom: '6px' }} />
                    <div style={{ fontSize: '0.84rem' }}>Creative Preview Placeholder</div>
                    <div style={{ fontSize: '0.74rem' }}>Upload media to preview live ad rendering</div>
                  </div>
                )}
              </div>

              {/* Caption & Body */}
              <div className="mkt-feed-body">
                <div className="mkt-feed-caption">
                  {caption || 'Your promotional ad copy and bullet points will appear here in the live customer feed...'}
                </div>
                {hashtags && <div className="mkt-feed-hashtags">{hashtags}</div>}

                <div className="mkt-feed-cta-bar">
                  <div className="mkt-feed-cta-text">{selectedCustomer?.category || 'Commercial Services'}</div>
                  <button type="button" className="mkt-feed-cta-btn">
                    {callToAction || 'Enquire Now'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Customer's Existing Posts Queue */}
          <div className="marketing-table-card" style={{ padding: '20px', flex: 1 }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '0.96rem', fontWeight: 800 }}>
              Recent Posts for this Customer ({recentPosts.length})
            </h4>

            {loadingPosts ? (
              <div style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>
                <RefreshCw size={16} className="spin" /> Loading posts...
              </div>
            ) : recentPosts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px', color: '#64748b', fontSize: '0.84rem' }}>
                No posts created yet for this customer.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto' }}>
                {recentPosts.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: '0.84rem', color: '#0f172a' }}>{p.title}</strong>
                      <div className="mkt-cell-sub">ID: {p.id}</div>
                    </div>
                    <span
                      className={`mkt-pill ${
                        p.status === 'Approved'
                          ? 'mkt-pill-green'
                          : p.status === 'Pending Verification'
                          ? 'mkt-pill-blue'
                          : p.status === 'Changes Requested'
                          ? 'mkt-pill-amber'
                          : p.status === 'Rejected'
                          ? 'mkt-pill-rose'
                          : 'mkt-pill-slate'
                      }`}
                    >
                      {p.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
