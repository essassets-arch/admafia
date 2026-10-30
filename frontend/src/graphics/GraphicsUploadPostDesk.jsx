import React, { useState, useEffect } from 'react';
import {
  UploadCloud,
  FileText,
  Image,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Eye,
  RefreshCw,
  Layers,
  Send,
  Building,
} from 'lucide-react';
import Swal from 'sweetalert2';
import graphicsApi from '../services/graphicsApi';

const CREATIVE_FORMATS = [
  { id: 'Instagram / Facebook Post', label: 'Instagram / Facebook Post', ratio: '1:1 Square (1080x1080)' },
  { id: 'Story / Status', label: 'Story / Status', ratio: '9:16 Vertical (1080x1920)' },
  { id: 'Carousel', label: 'Carousel Multi-Card', ratio: '1:1 Multi-Slide' },
  { id: 'Reel Cover', label: 'Reel Cover', ratio: '9:16 (1080x1920)' },
  { id: 'Custom Design', label: 'Custom Dimension', ratio: 'Custom' },
];

export default function GraphicsUploadPostDesk({ initialRequestId = null, onNavigateToDesk }) {
  const [requests, setRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [selectedRequestId, setSelectedRequestId] = useState(initialRequestId || '');
  const [selectedRequest, setSelectedRequest] = useState(null);

  // Form Fields
  const [creativeFormat, setCreativeFormat] = useState('Instagram / Facebook Post');
  const [designerNotes, setDesignerNotes] = useState('');
  const [designerName, setDesignerName] = useState('Senior Graphics Designer');
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

          if (initialRequestId) {
            setSelectedRequestId(initialRequestId);
            const match = list.find((r) => String(r.id).trim() === String(initialRequestId).trim());
            if (match) {
              setSelectedRequest(match);
              if (match.creativeFormat) setCreativeFormat(match.creativeFormat);
            }
          } else if (list.length > 0 && !selectedRequestId) {
            // Pick first pending request if available
            const firstPending = list.find((r) => r.isEligibleForUpload) || list[0];
            setSelectedRequestId(firstPending.id);
            setSelectedRequest(firstPending);
            if (firstPending.creativeFormat) setCreativeFormat(firstPending.creativeFormat);
          }
        }
      } catch (err) {
        console.error('[GraphicsUploadPostDesk] Requests load error:', err);
      } finally {
        setLoadingRequests(false);
      }
    }
    loadRequests();
  }, [initialRequestId]);

  // 1b. React to dynamic initialRequestId updates
  useEffect(() => {
    if (initialRequestId && requests.length > 0) {
      setSelectedRequestId(initialRequestId);
      const match = requests.find((r) => String(r.id).trim() === String(initialRequestId).trim());
      if (match) {
        setSelectedRequest(match);
        if (match.creativeFormat) setCreativeFormat(match.creativeFormat);
      }
    }
  }, [initialRequestId, requests]);

  // 2. Handle request selection change
  const handleSelectRequest = (id) => {
    setSelectedRequestId(id);
    const found = requests.find((r) => String(r.id).trim() === String(id).trim());
    setSelectedRequest(found || null);
    if (found?.creativeFormat) {
      setCreativeFormat(found.creativeFormat);
    }
  };

  // 3. File Selection & Upload
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate size (max 15MB)
    if (file.size > 15 * 1024 * 1024) {
      Swal.fire({
        icon: 'error',
        title: 'File Too Large',
        text: 'The selected artwork exceeds the 15MB file size limit.',
      });
      return;
    }

    // Validate MIME
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.type)) {
      Swal.fire({
        icon: 'error',
        title: 'Unsupported File Format',
        text: 'Please upload a PNG, JPG, or WEBP image format.',
      });
      return;
    }

    // Instant local preview
    try {
      const objUrl = URL.createObjectURL(file);
      setLocalPreview(objUrl);
    } catch (e) {}

    setUploadingFile(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64Data = reader.result;
        const uploadRes = await graphicsApi.uploadMedia(base64Data, file.name, file.type);
        if (uploadRes && uploadRes.ok) {
          setMediaUrl(uploadRes.url);
          setMediaType('image');
          Swal.fire({
            icon: 'success',
            title: 'Artwork Uploaded!',
            text: 'Image saved securely to server repository.',
            timer: 1400,
            showConfirmButton: false,
          });
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

  // 4. Submit Creative to Marketing for Verification
  const handleSubmitArtwork = async (e) => {
    e.preventDefault();

    if (!selectedRequestId) {
      Swal.fire({ icon: 'warning', title: 'Please select a Marketing Post Request.' });
      return;
    }

    if (!mediaUrl || !mediaUrl.trim()) {
      Swal.fire({ icon: 'warning', title: 'Please upload the finished artwork image first.' });
      return;
    }

    const confirm = await Swal.fire({
      title: 'Submit Artwork to Marketing?',
      html: `
        <div style="text-align: left; font-size: 0.88rem; color: #334155; line-height: 1.5;">
          <div>Customer: <strong>${selectedRequest?.companyName || 'Client'}</strong></div>
          <div>Post Title: <strong>${selectedRequest?.title}</strong></div>
          <div>Format: <strong>${creativeFormat}</strong></div>
          <div style="margin-top: 8px; padding: 10px; background: #eef2ff; border-radius: 8px; color: #4338ca;">
            ✓ Artwork will enter Marketing's <strong>Verify Posts</strong> queue for compliance review.
          </div>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#6366f1',
      confirmButtonText: 'Yes, Submit for Verification',
    });

    if (!confirm.isConfirmed) return;

    setSubmitting(true);
    try {
      const res = await graphicsApi.uploadArtwork({
        postId: selectedRequestId,
        mediaUrl: mediaUrl.trim(),
        mediaType,
        creativeFormat,
        designerNotes: designerNotes.trim(),
        designerName: designerName.trim() || 'Senior Graphics Designer',
      });

      if (res && res.ok) {
        await Swal.fire({
          icon: 'success',
          title: 'Submitted for Verification! 🚀',
          text: 'Artwork is now pending quality and compliance approval in Marketing.',
          confirmButtonColor: '#4f46e5',
        });

        // Reset media or navigate to requests
        if (onNavigateToDesk) {
          onNavigateToDesk('post-requests');
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

  return (
    <div>
      {/* 1. Page Header */}
      <div className="graphics-page-header">
        <div>
          <h1>Upload Finished Artwork</h1>
          <p>
            Select a live Marketing request, upload high-resolution finished creatives, specify format and designer specifications, and submit directly for Marketing verification.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.4fr) minmax(280px, 1fr)', gap: 20 }}>
        {/* Left Column: Real Upload Form */}
        <div className="graphics-table-card" style={{ padding: 24 }}>
          <form onSubmit={handleSubmitArtwork}>
            {/* Step 1: Select Marketing Post Request */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 800, color: '#334155', marginBottom: 6, textTransform: 'uppercase' }}>
                1. Select Marketing Post Request *
              </label>
              {loadingRequests ? (
                <div style={{ fontSize: '0.84rem', color: '#64748b' }}>Loading active marketing requests...</div>
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

            {/* Step 2: File Upload Area */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 800, color: '#334155', marginBottom: 6, textTransform: 'uppercase' }}>
                2. Upload Finished Artwork (PNG, JPG, WEBP) *
              </label>
              <div
                style={{
                  border: '2px dashed #cbd5e1',
                  borderRadius: 12,
                  padding: 24,
                  textAlign: 'center',
                  background: (localPreview || mediaUrl) ? '#f8fafc' : '#ffffff',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'border-color 0.15s',
                }}
              >
                <input
                  type="file"
                  accept="image/png, image/jpeg, image/webp"
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
                    <span style={{ fontSize: '0.86rem', fontWeight: 700, color: '#4f46e5' }}>Uploading artwork to repository...</span>
                  </div>
                ) : (localPreview || mediaUrl) ? (
                  <div>
                    <img
                      src={localPreview || mediaUrl}
                      alt="Artwork Preview"
                      style={{ maxHeight: 180, maxWidth: '100%', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.1)', objectFit: 'contain' }}
                    />
                    <div style={{ marginTop: 8, fontSize: '0.78rem', color: '#059669', fontWeight: 700 }}>
                      ✓ Artwork Uploaded Successfully (Click or drag to replace)
                    </div>
                  </div>
                ) : (
                  <div>
                    <UploadCloud size={32} color="#94a3b8" style={{ marginBottom: 8 }} />
                    <div style={{ fontWeight: 800, fontSize: '0.92rem', color: '#1e293b' }}>
                      Drag &amp; drop artwork or click to browse
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: 4 }}>
                      PNG, JPG, or WEBP up to 15MB • Minimum recommended: 1080x1080
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Step 3: Designer Notes & Specifications */}
            <div style={{ marginBottom: 22 }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 800, color: '#334155', marginBottom: 6, textTransform: 'uppercase' }}>
                3. Designer Notes &amp; Specifications
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
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>Marketing Creative Brief</h3>
            </div>

            {selectedRequest ? (
              <div>
                <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 14 }}>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#0f172a' }}>
                    {selectedRequest.companyName}
                  </div>
                  <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: 2 }}>
                    {selectedRequest.customerCategory} • ID: {selectedRequest.id}
                  </div>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>
                    Post Title
                  </span>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0f172a', marginTop: 2 }}>
                    {selectedRequest.title}
                  </div>
                </div>

                {selectedRequest.ideaTitle && (
                  <div style={{ marginBottom: 12 }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>
                      Concept / Idea Reference
                    </span>
                    <div style={{ fontSize: '0.84rem', fontWeight: 600, color: '#4f46e5', marginTop: 2 }}>
                      💡 {selectedRequest.ideaTitle}
                    </div>
                  </div>
                )}

                <div style={{ marginBottom: 12 }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>
                    Post Caption &amp; Ad Copy
                  </span>
                  <div
                    style={{
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: 8,
                      padding: 10,
                      fontSize: '0.82rem',
                      color: '#334155',
                      lineHeight: 1.4,
                      whiteSpace: 'pre-wrap',
                      maxHeight: 160,
                      overflowY: 'auto',
                      marginTop: 4,
                    }}
                  >
                    {selectedRequest.caption}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 12 }}>
                  <div style={{ background: '#f8fafc', padding: 8, borderRadius: 6 }}>
                    <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 700 }}>Platform</span>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0f172a' }}>{selectedRequest.platform}</div>
                  </div>
                  <div style={{ background: '#f8fafc', padding: 8, borderRadius: 6 }}>
                    <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 700 }}>CTA</span>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0f172a' }}>{selectedRequest.callToAction}</div>
                  </div>
                </div>

                {selectedRequest.hashtags && (
                  <div style={{ fontSize: '0.74rem', color: '#0ea5e9', fontWeight: 600 }}>
                    {selectedRequest.hashtags}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '36px 12px', color: '#64748b' }}>
                <Layers size={32} color="#cbd5e1" style={{ marginBottom: 8 }} />
                <div style={{ fontSize: '0.86rem' }}>Select a request from the dropdown to load its marketing brief.</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

