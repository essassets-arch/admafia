import React, { useState, useEffect } from 'react';
import {
  UploadCloud,
  FileText,
  RefreshCw,
  Layers,
  Send,
} from 'lucide-react';
import Swal from 'sweetalert2';
import graphicsApi from '../services/graphicsApi';
import adminAuthApi from '../services/adminAuthApi';

const CREATIVE_FORMATS = [
  '1080x1080 Square',
  '1080x1350 Portrait',
  '1080x1920 Story/Reel',
  '1200x628 Landscape',
];

function normalizeCreativeFormat(raw) {
  if (!raw) return '1080x1080 Square';
  if (CREATIVE_FORMATS.includes(raw)) return raw;
  const s = String(raw).toLowerCase();
  if (s.includes('1350') || s.includes('portrait')) return '1080x1350 Portrait';
  if (s.includes('1920') || s.includes('story') || s.includes('reel')) return '1080x1920 Story/Reel';
  if (s.includes('1200') || s.includes('landscape')) return '1200x628 Landscape';
  return '1080x1080 Square';
}

export default function GraphicsUploadPostDesk({
  initialRequestId = null,
  initialRequest = null,
  onNavigateToDesk,
  onSummaryRefresh,
}) {
  const currentUser = adminAuthApi.getCurrentUser();
  const defaultDesignerName =
    currentUser?.name || currentUser?.fullName || 'Graphics Studio';

  const [requests, setRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [selectedRequestId, setSelectedRequestId] = useState(
    initialRequest?.id || initialRequestId || ''
  );
  const [selectedRequest, setSelectedRequest] = useState(initialRequest || null);

  // Form Fields
  const [creativeFormat, setCreativeFormat] = useState(() =>
    normalizeCreativeFormat(initialRequest?.creativeFormat)
  );
  const [designerNotes, setDesignerNotes] = useState('');
  const [designerName, setDesignerName] = useState(defaultDesignerName);
  const [mediaUrl, setMediaUrl] = useState('');
  const [localPreview, setLocalPreview] = useState('');
  const [mediaType, setMediaType] = useState('image');
  const [uploadingFile, setUploadingFile] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 1. Fetch eligible requests from backend
  useEffect(() => {
    async function loadRequests() {
      setLoadingRequests(true);
      try {
        const res = await graphicsApi.getRequests({ limit: 100 });
        if (res && res.ok) {
          const list = res.requests || [];
          setRequests(list);

          const targetId = initialRequest?.id || initialRequestId;
          if (targetId) {
            setSelectedRequestId(targetId);
            const match = list.find((r) => String(r.id).trim() === String(targetId).trim());
            if (match) {
              setSelectedRequest(match);
              setCreativeFormat(normalizeCreativeFormat(match.creativeFormat));
            }
          } else if (list.length > 0 && !selectedRequestId) {
            const firstPending = list.find((r) => r.isEligibleForUpload) || list[0];
            setSelectedRequestId(firstPending.id);
            setSelectedRequest(firstPending);
            setCreativeFormat(normalizeCreativeFormat(firstPending.creativeFormat));
          }
        }
      } catch (err) {
        console.error('[GraphicsUploadPostDesk] Requests load error:', err);
      } finally {
        setLoadingRequests(false);
      }
    }
    loadRequests();
  }, [initialRequestId, initialRequest]);

  // 1b. React to dynamic initialRequest / initialRequestId updates
  useEffect(() => {
    const targetId = initialRequest?.id || initialRequestId;
    if (initialRequest) {
      setSelectedRequest(initialRequest);
      setSelectedRequestId(initialRequest.id);
      setCreativeFormat(normalizeCreativeFormat(initialRequest.creativeFormat));
    }
    if (targetId && requests.length > 0) {
      setSelectedRequestId(targetId);
      const match = requests.find((r) => String(r.id).trim() === String(targetId).trim());
      if (match) {
        setSelectedRequest(match);
        setCreativeFormat(normalizeCreativeFormat(match.creativeFormat));
      }
    }
  }, [initialRequestId, initialRequest, requests]);

  // 2. Handle request selection change
  const handleSelectRequest = (id) => {
    setSelectedRequestId(id);
    const found = requests.find((r) => String(r.id).trim() === String(id).trim());
    setSelectedRequest(found || null);
    if (found) {
      setCreativeFormat(normalizeCreativeFormat(found.creativeFormat));
    }
  };

  // 3. File Selection & Silent Instant Upload (no intermediate modal popup)
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      Swal.fire({
        icon: 'error',
        title: 'File Too Large',
        text: 'The selected creative exceeds the 15MB file size limit.',
      });
      return;
    }

    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4'];
    if (!allowed.includes(file.type)) {
      Swal.fire({
        icon: 'error',
        title: 'Unsupported File Format',
        text: 'Please upload a PNG, JPG, WEBP image or MP4 video.',
      });
      return;
    }

    const isVideo = file.type.startsWith('video/');
    setMediaType(isVideo ? 'video' : 'image');

    try {
      const objUrl = URL.createObjectURL(file);
      setLocalPreview(objUrl);
    } catch (err) {}

    setUploadingFile(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64Data = reader.result;
        setLocalPreview(base64Data);
        const uploadRes = await graphicsApi.uploadMedia(base64Data, file.name, file.type);
        if (uploadRes && uploadRes.ok) {
          setMediaUrl(uploadRes.url);
          setMediaType(isVideo ? 'video' : 'image');
        }
      } catch (err) {
        Swal.fire({
          icon: 'error',
          title: 'Upload Failed',
          text: err.message || 'Could not upload artwork to server.',
        });
      } finally {
        setUploadingFile(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // 4. Submit Creative to Marketing for Verification (1 single clean confirmation toast)
  const handleSubmitArtwork = async (e) => {
    e.preventDefault();

    if (!selectedRequestId) {
      Swal.fire({ icon: 'warning', title: 'Please select a Marketing Post Request.' });
      return;
    }

    if (!mediaUrl || !mediaUrl.trim()) {
      Swal.fire({ icon: 'warning', title: 'Please upload the finished creative first.' });
      return;
    }

    setSubmitting(true);
    try {
      const res = await graphicsApi.uploadArtwork({
        postId: selectedRequestId,
        mediaUrl: mediaUrl.trim(),
        mediaType,
        creativeFormat,
        designerNotes: designerNotes.trim(),
        designerName: designerName.trim() || defaultDesignerName,
      });

      if (res && res.ok) {
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: 'Artwork submitted to Marketing for verification',
          showConfirmButton: false,
          timer: 2600,
          timerProgressBar: true,
        });

        setMediaUrl('');
        setLocalPreview('');
        setDesignerNotes('');
        if (onSummaryRefresh) onSummaryRefresh();
        if (onNavigateToDesk) {
          onNavigateToDesk('post_requests');
        }
      }
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'Submission Failed',
        text: err.message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const previewSrc = localPreview || mediaUrl;
  const isVideoPreview =
    mediaType === 'video' ||
    (previewSrc && (previewSrc.startsWith('data:video/') || /\.mp4(\?|$)/i.test(previewSrc)));

  return (
    <div>
      {/* 1. Page Header */}
      <div className="graphics-page-header">
        <div>
          <h1>Upload Finished Artwork</h1>
          <p>
            Select a live Marketing request, upload high-resolution finished creatives or MP4 video reels, specify format, and submit directly for Marketing verification.
          </p>
        </div>
      </div>

      <div className="gfx-upload-split" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: 20 }}>
        {/* Left Column: Real Upload Form */}
        <div className="graphics-table-card" style={{ padding: 24 }}>
          <form onSubmit={handleSubmitArtwork}>
            {/* Step 1: Select Marketing Post Request */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 800, color: 'var(--adm-text-body, #334155)', marginBottom: 6, textTransform: 'uppercase' }}>
                1. Select Marketing Post Request *
              </label>
              {loadingRequests ? (
                <div style={{ fontSize: '0.84rem', color: 'var(--adm-text-muted, #64748b)' }}>Loading active marketing requests...</div>
              ) : (
                <select
                  className="graphics-select"
                  style={{ width: '100%', padding: '10px 12px', fontSize: '0.9rem', fontWeight: 600 }}
                  value={selectedRequestId}
                  onChange={(e) => handleSelectRequest(e.target.value)}
                  required
                >
                  <option value="">-- Select a Post Request from Marketing --</option>
                  {requests.map((r) => (
                    <option key={r.id} value={r.id}>
                      [{r.companyName}] {r.title} — ({r.status})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Step 2: Creative Format & Studio Designer */}
            <div className="gfx-specs-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 800, color: 'var(--adm-text-body, #334155)', marginBottom: 6, textTransform: 'uppercase' }}>
                  2. Creative Format *
                </label>
                <select
                  className="graphics-select"
                  style={{ width: '100%', padding: '10px 12px', fontSize: '0.88rem', fontWeight: 600 }}
                  value={creativeFormat}
                  onChange={(e) => setCreativeFormat(e.target.value)}
                >
                  {CREATIVE_FORMATS.map((fmt) => (
                    <option key={fmt} value={fmt}>
                      {fmt}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 800, color: 'var(--adm-text-body, #334155)', marginBottom: 6, textTransform: 'uppercase' }}>
                  Studio Designer
                </label>
                <input
                  type="text"
                  className="graphics-search-input"
                  style={{ width: '100%', padding: '10px 12px', fontSize: '0.88rem', fontWeight: 600 }}
                  value={designerName}
                  onChange={(e) => setDesignerName(e.target.value)}
                  placeholder="Graphics Studio"
                />
              </div>
            </div>

            {/* Step 3: File Upload Area */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 800, color: 'var(--adm-text-body, #334155)', marginBottom: 6, textTransform: 'uppercase' }}>
                3. Upload Finished Creative (PNG, JPG, WEBP, MP4) *
              </label>
              <div
                className={`gfx-upload-dropzone ${previewSrc ? 'has-preview' : ''}`.trim()}
                style={{
                  border: '2px dashed var(--adm-border-strong, #cbd5e1)',
                  borderRadius: 12,
                  padding: 24,
                  textAlign: 'center',
                  background: previewSrc ? 'var(--adm-bg-subtle, #f8fafc)' : 'var(--adm-bg-card, #ffffff)',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'border-color 0.15s',
                }}
              >
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,video/mp4"
                  onChange={handleFileChange}
                  disabled={uploadingFile}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    opacity: 0,
                    cursor: 'pointer',
                    width: '100%',
                    height: '100%',
                  }}
                />

                {uploadingFile ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <RefreshCw size={28} className="spin" color="#6366f1" />
                    <span style={{ fontSize: '0.86rem', fontWeight: 700, color: '#6366f1' }}>Uploading creative to repository...</span>
                  </div>
                ) : previewSrc ? (
                  <div>
                    {isVideoPreview ? (
                      <video
                        src={previewSrc}
                        controls
                        muted
                        playsInline
                        style={{ maxHeight: 180, maxWidth: '100%', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
                      />
                    ) : (
                      <img
                        src={previewSrc}
                        alt="Artwork Preview"
                        style={{ maxHeight: 180, maxWidth: '100%', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.1)', objectFit: 'contain' }}
                        onError={(e) => {
                          if (localPreview && e.currentTarget.src !== localPreview) {
                            e.currentTarget.src = localPreview;
                          }
                        }}
                      />
                    )}
                    <div style={{ marginTop: 8, fontSize: '0.78rem', color: '#10b981', fontWeight: 700 }}>
                      ✓ Creative Ready for Submission (Click or drag to replace)
                    </div>
                  </div>
                ) : (
                  <div>
                    <UploadCloud size={32} color="#94a3b8" style={{ marginBottom: 8 }} />
                    <div style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--adm-text-secondary, #1e293b)' }}>
                      Drag &amp; drop artwork or video, or click to browse
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--adm-text-muted, #64748b)', marginTop: 4 }}>
                      PNG, JPG, WEBP, or MP4 up to 15MB • Selected format: {creativeFormat}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Step 4: Designer Notes & Specifications */}
            <div style={{ marginBottom: 22 }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 800, color: 'var(--adm-text-body, #334155)', marginBottom: 6, textTransform: 'uppercase' }}>
                4. Designer Notes &amp; Specifications
              </label>
              <textarea
                rows={3}
                className="graphics-search-input"
                style={{ width: '100%', padding: '10px 12px', resize: 'vertical' }}
                placeholder="Notes on color palette, branding assets used, font hierarchy, or layout considerations..."
                value={designerNotes}
                onChange={(e) => setDesignerNotes(e.target.value)}
              />
            </div>

            {/* Action Bar */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="submit"
                className="graphics-btn-primary"
                disabled={submitting || uploadingFile || !mediaUrl}
                style={{ padding: '10px 20px', fontSize: '0.92rem' }}
              >
                <Send size={15} />
                <span>{submitting ? 'Submitting to Marketing...' : 'Submit to Marketing for Verification'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Right Column: Selected Marketing Brief Preview */}
        <div>
          <div className="graphics-table-card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <FileText size={18} color="#6366f1" />
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--adm-text-primary, #0f172a)' }}>Marketing Creative Brief</h3>
            </div>

            {selectedRequest ? (
              <div>
                <div className="gfx-spec-panel" style={{ background: 'var(--adm-bg-subtle, #f8fafc)', padding: 12, borderRadius: 8, border: '1px solid var(--adm-border, #e2e8f0)', marginBottom: 14 }}>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--adm-text-primary, #0f172a)' }}>
                    {selectedRequest.companyName}
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--adm-text-muted, #64748b)', marginTop: 2 }}>
                    {selectedRequest.customerCategory} • ID: {selectedRequest.id}
                  </div>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--adm-text-muted, #64748b)', textTransform: 'uppercase' }}>
                    Post Title
                  </span>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--adm-text-primary, #0f172a)', marginTop: 2 }}>
                    {selectedRequest.title}
                  </div>
                </div>

                {selectedRequest.ideaTitle && (
                  <div style={{ marginBottom: 12 }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--adm-text-muted, #64748b)', textTransform: 'uppercase' }}>
                      Concept / Idea Reference
                    </span>
                    <div style={{ fontSize: '0.84rem', fontWeight: 600, color: '#6366f1', marginTop: 2 }}>
                      💡 {selectedRequest.ideaTitle}
                    </div>
                  </div>
                )}

                <div style={{ marginBottom: 12 }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--adm-text-muted, #64748b)', textTransform: 'uppercase' }}>
                    Post Caption &amp; Ad Copy
                  </span>
                  <div
                    style={{
                      background: 'var(--adm-bg-subtle, #ffffff)',
                      border: '1px solid var(--adm-border, #e2e8f0)',
                      borderRadius: 8,
                      padding: 10,
                      fontSize: '0.82rem',
                      color: 'var(--adm-text-body, #334155)',
                      lineHeight: 1.4,
                      whiteSpace: 'pre-wrap',
                      marginTop: 4,
                    }}
                  >
                    {selectedRequest.caption}
                  </div>
                </div>

                <div className="gfx-specs-2col" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 12 }}>
                  <div className="gfx-spec-panel" style={{ background: 'var(--adm-bg-subtle, #f8fafc)', border: '1px solid var(--adm-border, #e2e8f0)', padding: 8, borderRadius: 6 }}>
                    <span style={{ fontSize: '0.68rem', color: 'var(--adm-text-muted, #64748b)', fontWeight: 700 }}>Platform</span>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--adm-text-primary, #0f172a)' }}>{selectedRequest.platform}</div>
                  </div>
                  <div className="gfx-spec-panel" style={{ background: 'var(--adm-bg-subtle, #f8fafc)', border: '1px solid var(--adm-border, #e2e8f0)', padding: 8, borderRadius: 6 }}>
                    <span style={{ fontSize: '0.68rem', color: 'var(--adm-text-muted, #64748b)', fontWeight: 700 }}>CTA</span>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--adm-text-primary, #0f172a)' }}>{selectedRequest.callToAction}</div>
                  </div>
                </div>

                {selectedRequest.hashtags && (
                  <div style={{ fontSize: '0.74rem', color: '#0ea5e9', fontWeight: 600 }}>
                    {selectedRequest.hashtags}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '36px 12px', color: 'var(--adm-text-muted, #64748b)' }}>
                <Layers size={32} style={{ color: 'var(--adm-border-strong, #cbd5e1)', marginBottom: 8 }} />
                <div style={{ fontSize: '0.86rem' }}>Select a request from the dropdown to load its marketing brief.</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
