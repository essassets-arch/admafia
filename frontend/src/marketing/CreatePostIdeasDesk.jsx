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
  Palette,
  Clock,
} from 'lucide-react';
import Swal from 'sweetalert2';
import marketingApi from '../services/marketingApi';
import { SmartTable } from '../components/SmartTabulator';

const PLATFORMS = [
  'Meta Ads (Facebook & Instagram)',
  'Instagram',
  'Facebook',
  'Google Ads',
  'LinkedIn Ads',
];

const LANGUAGES = [
  'English / Hinglish',
  'Hindi',
  'English',
  'Gujarati',
  'Marathi',
];

function normalizePlatformValue(raw) {
  if (!raw) return 'Meta Ads (Facebook & Instagram)';
  if (raw === 'Instagram & Facebook (Meta Ads)') return 'Meta Ads (Facebook & Instagram)';
  return PLATFORMS.includes(raw) ? raw : 'Meta Ads (Facebook & Instagram)';
}

function normalizeLanguageValue(raw) {
  if (!raw) return 'English / Hinglish';
  if (raw === 'English Only') return 'English';
  return LANGUAGES.includes(raw) ? raw : 'English / Hinglish';
}

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
  const [creativeFormat, setCreativeFormat] = useState('Instagram / Facebook Post (1:1)');
  const [priority, setPriority] = useState('Normal');
  const [creativeInstructions, setCreativeInstructions] = useState('');
  const [campaignAssociation, setCampaignAssociation] = useState('');
  const [intendedPublishAt, setIntendedPublishAt] = useState('');
  const [previewLightbox, setPreviewLightbox] = useState(null);

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
        if (initialIdeaId) {
          const matched = ideas.find((i) => i.id === initialIdeaId);
          if (matched) {
            setSelectedIdeaId(initialIdeaId);
            setTitle((prev) => prev || matched.title || '');
            setCaption((prev) => prev || matched.captionSuggestions || matched.concept || '');
            setHashtags((prev) => prev || matched.hashtags || '');
            if (matched.callToAction) setCallToAction(matched.callToAction);
            if (matched.platform) setPlatform(normalizePlatformValue(matched.platform));
            if (matched.language) setLanguage(normalizeLanguageValue(matched.language));
          }
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
      if (!caption && (matched.captionSuggestions || matched.concept)) {
        setCaption(matched.captionSuggestions || matched.concept);
      }
      if (!hashtags && matched.hashtags) setHashtags(matched.hashtags);
      if (matched.callToAction) setCallToAction(matched.callToAction);
      if (matched.platform) setPlatform(normalizePlatformValue(matched.platform));
      if (matched.language) setLanguage(normalizeLanguageValue(matched.language));
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
    if (!caption.trim() && !creativeInstructions.trim()) {
      Swal.fire({ icon: 'warning', title: 'Please enter the post caption / copy or designer instructions.' });
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
        caption: caption.trim() || creativeInstructions.trim(),
        hashtags,
        callToAction,
        mediaUrl,
        mediaType,
        creativeFormat,
        priority,
        creativeInstructions,
        language,
        campaignAssociation,
        intendedPublishAt: intendedPublishAt || null,
        status: targetStatus,
        submittedBy: 'Marketing Creative Team',
      });

      if (res && res.ok) {
        await Swal.fire({
          icon: 'success',
          title:
            targetStatus === 'Pending Graphics'
              ? 'Sent to Graphics Studio! 🎨'
              : targetStatus === 'Pending Verification'
                ? 'Submitted for Verification!'
                : 'Draft Saved!',
          text:
            targetStatus === 'Pending Graphics'
              ? 'Graphics team has received your brief and will upload the creative onto this exact request.'
              : res.message || 'Post operation succeeded.',
          confirmButtonColor: '#4f46e5',
        });

        // Clear form
        setTitle('');
        setCaption('');
        setHashtags('');
        setMediaUrl('');
        setCreativeInstructions('');
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 'min(100%, 220px)', flex: 1 }}>
            <label style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--adm-text-body, #475569)' }}>1. ACTIVE CUSTOMER</label>
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 'min(100%, 220px)', flex: 1.5 }}>
            <label style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--adm-text-body, #475569)' }}>
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
      <div className="mkt-split-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(0, 1fr)', gap: '24px' }}>
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

          <div className="mkt-form-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="mkt-form-group">
              <label className="mkt-form-label">Destination Platform</label>
              <select
                className="mkt-form-select"
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
              >
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className="mkt-form-group">
              <label className="mkt-form-label">Language</label>
              <select
                className="mkt-form-select"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                {LANGUAGES.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
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

          <div className="mkt-form-2col" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px' }}>
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
              className="mkt-upload-dropzone"
              style={{
                border: '2px dashed var(--adm-border-strong, #cbd5e1)',
                borderRadius: '12px',
                padding: '20px',
                textAlign: 'center',
                background: 'var(--adm-bg-subtle, #f8fafc)',
                position: 'relative',
              }}
            >
              {uploadingMedia ? (
                <div style={{ color: '#6366f1', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <RefreshCw size={18} className="spin" /> Uploading media creative...
                </div>
              ) : mediaUrl ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <CheckCircle2 size={20} color="#10b981" />
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--adm-text-primary, #0f172a)' }}>
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
                  <Upload size={24} style={{ color: 'var(--adm-text-muted, #94a3b8)', marginBottom: '6px' }} />
                  <div style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--adm-text-primary, #0f172a)', marginBottom: '2px' }}>
                    Upload Creative Media
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--adm-text-muted, #64748b)', marginBottom: '12px' }}>
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

          <div className="mkt-form-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
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

          {/* Closed-Loop Graphics Brief Spec (Format, Priority & Designer Instructions) */}
          <div
            style={{
              background: 'var(--adm-bg-subtle, #f8fafc)',
              border: '1px solid var(--adm-border, #e2e8f0)',
              borderRadius: 12,
              padding: '14px 16px',
              marginTop: 12,
            }}
          >
            <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#6366f1', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Palette size={14} /> Graphics Handoff Brief (When Requesting Artwork from Graphics)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 10 }}>
              <div>
                <label className="mkt-form-label">Creative Format</label>
                <select
                  className="mkt-form-input"
                  value={creativeFormat}
                  onChange={(e) => setCreativeFormat(e.target.value)}
                >
                  <option value="Instagram / Facebook Post (1:1)">1:1 Feed Square (1080×1080)</option>
                  <option value="Portrait Feed (4:5)">4:5 Portrait Feed (1080×1350)</option>
                  <option value="Story / Reel Vertical (9:16)">9:16 Story / Reel (1080×1920)</option>
                  <option value="MP4 Motion / Video Ad">MP4 Motion / Video Ad</option>
                </select>
              </div>
              <div>
                <label className="mkt-form-label">Turnaround Priority</label>
                <select
                  className="mkt-form-input"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                >
                  <option value="Normal">Normal (4h Target)</option>
                  <option value="Urgent">🔥 Urgent — Needed Today (2h Target)</option>
                </select>
              </div>
            </div>
            <div>
              <label className="mkt-form-label">Designer Visual Instructions (Optional)</label>
              <input
                type="text"
                className="mkt-form-input"
                placeholder="e.g. Bold offer badge in yellow, show Surat city tag & luxury building background..."
                value={creativeInstructions}
                onChange={(e) => setCreativeInstructions(e.target.value)}
              />
            </div>
          </div>

          {/* Action Row */}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: '16px' }}>
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
              style={{
                background: 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
                borderColor: '#db2777',
              }}
              onClick={() => handleSaveOrSubmit('Pending Graphics')}
              disabled={submitting}
              title="Send brief to Graphics Studio — Graphics will upload finished image onto this exact request"
            >
              <Palette size={14} />
              <span>{submitting ? 'Sending...' : 'Request Creative from Graphics'}</span>
            </button>
            <button
              type="button"
              className="marketing-btn-primary"
              onClick={() => handleSaveOrSubmit('Pending Verification')}
              disabled={submitting}
            >
              <Send size={14} />
              <span>{submitting ? 'Submitting...' : 'Submit Uploaded Creative'}</span>
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
        </div>
      </div>

      {/* 4. Customer's Existing Posts Queue (Full-Width Tabulator) */}
      <div className="marketing-table-card" style={{ marginTop: '24px' }}>
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--adm-border, #e2e8f0)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>
            Recent Posts for this Customer ({recentPosts.length})
          </h4>
          <span className="mkt-pill mkt-pill-slate">Customer Posts Queue</span>
        </div>

        <SmartTable
          title="Customer Posts Queue"
          defaultPageSize={8}
          exportFilename="customer-posts-queue"
        >
          <table className="marketing-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th>Creative Preview &amp; Title</th>
                <th>Format / Platform</th>
                <th>Requested / Turnaround</th>
                <th>Pipeline &amp; Campaign Usage</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadingPosts ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '28px', color: 'var(--adm-text-muted, #64748b)' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                      <RefreshCw size={16} className="spin" />
                      <span>Loading posts...</span>
                    </div>
                  </td>
                </tr>
              ) : recentPosts.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '28px', color: 'var(--adm-text-muted, #64748b)', fontSize: '0.84rem' }}>
                    No posts or Graphics requests created yet for this customer.
                  </td>
                </tr>
              ) : (
                recentPosts.map((p, idx) => {
                  const rawDate = p.requestedAt || p.createdAt || p.created_at || p.submittedAt || p.updatedAt;
                  const parsedDate = rawDate ? new Date(rawDate) : null;
                  const validDate = parsedDate && !Number.isNaN(parsedDate.getTime());
                  const formatTag = p.creativeFormat || p.creative_format || p.mediaType || p.media_type;
                  const artUrl = p.mediaUrl || p.media_url || '';
                  const waitMins = validDate ? Math.max(0, Math.round((Date.now() - parsedDate.getTime()) / 60000)) : 0;
                  const waitStr = waitMins < 60 ? `${waitMins}m ago` : `${Math.floor(waitMins / 60)}h ${waitMins % 60}m ago`;

                  return (
                    <tr key={p.id || idx}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {artUrl ? (
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewLightbox({
                                  url: artUrl,
                                  title: p.title,
                                  mediaType: p.mediaType,
                                })
                              }
                              style={{
                                width: 48,
                                height: 48,
                                borderRadius: 8,
                                overflow: 'hidden',
                                border: '1.5px solid #6366f1',
                                padding: 0,
                                background: '#0f172a',
                                cursor: 'pointer',
                                flexShrink: 0,
                              }}
                              title="Click to inspect full creative uploaded by Graphics"
                            >
                              {p.mediaType === 'video' || /\.mp4$/i.test(artUrl) ? (
                                <video src={artUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
                              ) : (
                                <img src={artUrl} alt={p.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              )}
                            </button>
                          ) : (
                            <div
                              style={{
                                width: 48,
                                height: 48,
                                borderRadius: 8,
                                border: '1px dashed var(--adm-border-strong, #cbd5e1)',
                                display: 'grid',
                                placeItems: 'center',
                                color: '#94a3b8',
                                flexShrink: 0,
                              }}
                              title="Awaiting Graphics artwork upload"
                            >
                              <Palette size={17} />
                            </div>
                          )}
                          <div>
                            <strong style={{ fontSize: '0.88rem', color: 'var(--adm-text-primary, #0f172a)' }}>
                              {p.title || 'Untitled Post'}
                            </strong>
                            <div className="mkt-cell-sub" style={{ fontSize: '0.73rem' }}>
                              {artUrl
                                ? `✓ Uploaded${p.designerName ? ` by ${p.designerName}` : ''} (Rev #${p.revisionNumber || 1})`
                                : '⏳ Waiting for Graphics upload'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'flex-start' }}>
                          <span className="mkt-pill mkt-pill-indigo" style={{ fontSize: '0.72rem' }}>
                            {p.platform || 'Meta Ads'}
                          </span>
                          {formatTag && (
                            <span style={{ fontSize: '0.73rem', color: 'var(--adm-text-muted, #64748b)' }}>
                              {formatTag} {p.priority === 'Urgent' ? '• 🔥 Urgent' : ''}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        {validDate ? (
                          <div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--adm-text-body, #475569)', fontWeight: 700 }}>
                              {parsedDate.toLocaleDateString('en-IN', {
                                timeZone: 'Asia/Kolkata',
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </div>
                            {!artUrl && (
                              <div style={{ fontSize: '0.71rem', color: waitMins > 240 ? '#ef4444' : '#d97706', fontWeight: 700, marginTop: 2 }}>
                                <Clock size={11} style={{ verticalAlign: 'middle' }} /> {waitStr}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.78rem', color: 'var(--adm-text-muted, #94a3b8)' }}>—</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                          {p.isLiveInCampaign ? (
                            <span
                              style={{
                                background: 'rgba(16, 185, 129, 0.16)',
                                color: '#059669',
                                border: '1px solid rgba(16, 185, 129, 0.38)',
                                padding: '3px 9px',
                                borderRadius: 999,
                                fontSize: '0.72rem',
                                fontWeight: 800,
                              }}
                            >
                              🚀 LIVE IN CAMPAIGN ({p.linkedCampaignName || 'Active'})
                            </span>
                          ) : (
                            <span
                              className={`mkt-pill ${
                                p.status === 'Approved'
                                  ? 'mkt-pill-green'
                                  : p.status === 'Pending Verification'
                                    ? 'mkt-pill-blue'
                                    : p.status === 'Pending Graphics' || p.status === 'In Progress'
                                      ? 'mkt-pill-amber'
                                      : p.status === 'Changes Requested' || p.status === 'Rejected'
                                        ? 'mkt-pill-rose'
                                        : 'mkt-pill-slate'
                              }`}
                            >
                              {p.status === 'Approved'
                                ? '✅ Approved — Ready to Use'
                                : p.status === 'Pending Verification'
                                  ? '⏳ Graphics Uploaded — Verify!'
                                  : p.status === 'Pending Graphics'
                                    ? '🎨 Sent to Graphics'
                                    : p.status || 'Draft'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          {artUrl && (
                            <button
                              type="button"
                              className="mkt-btn-table-action"
                              onClick={() =>
                                setPreviewLightbox({
                                  url: artUrl,
                                  title: p.title,
                                  mediaType: p.mediaType,
                                })
                              }
                            >
                              <Eye size={13} /> Preview
                            </button>
                          )}
                          {p.status === 'Pending Verification' && artUrl && (
                            <button
                              type="button"
                              className="mkt-btn-table-action success"
                              onClick={async () => {
                                try {
                                  await marketingApi.reviewPost(p.id, {
                                    decision: 'Approved',
                                    expectedRevisionNumber: p.revisionNumber || 1,
                                    remarks: 'Approved directly from Creative Studio',
                                  });
                                  Swal.fire({
                                    toast: true,
                                    position: 'top-end',
                                    icon: 'success',
                                    title: 'Creative Approved & Ready for Campaign!',
                                    showConfirmButton: false,
                                    timer: 2000,
                                  });
                                  fetchCustomerScopedData(selectedCustomerId);
                                } catch (err) {
                                  Swal.fire({ icon: 'error', title: 'Review Error', text: err.message });
                                }
                              }}
                              style={{ fontWeight: 800 }}
                            >
                              <CheckCircle2 size={13} /> Approve
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </SmartTable>
      </div>

      {/* Lightbox Modal for Graphics Uploaded Creative */}
      {previewLightbox && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(2, 6, 23, 0.75)',
            zIndex: 9999,
            display: 'grid',
            placeItems: 'center',
            padding: 16,
          }}
          onClick={() => setPreviewLightbox(null)}
        >
          <div
            className="marketing-table-card"
            style={{ maxWidth: 540, width: '100%', padding: 18 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <strong>{previewLightbox.title}</strong>
              <button type="button" className="mkt-btn-table-action" onClick={() => setPreviewLightbox(null)}>
                ✕
              </button>
            </div>
            {previewLightbox.mediaType === 'video' || /\.mp4$/i.test(previewLightbox.url) ? (
              <video src={previewLightbox.url} controls style={{ width: '100%', borderRadius: 10, maxHeight: '72vh' }} />
            ) : (
              <img
                src={previewLightbox.url}
                alt={previewLightbox.title}
                style={{ width: '100%', borderRadius: 10, maxHeight: '72vh', objectFit: 'contain' }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

