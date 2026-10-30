import React, { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  UploadCloud,
  Search,
  RefreshCw,
  Eye,
  Building,
  RotateCcw,
  CheckCircle2,
  X,
  History,
  Send,
  ExternalLink,
  Layers,
} from 'lucide-react';
import Swal from 'sweetalert2';
import graphicsApi from '../services/graphicsApi';

const CREATIVE_FORMATS = [
  { id: 'Instagram / Facebook Post', label: 'Instagram / Facebook Post' },
  { id: 'Story / Status', label: 'Story / Status' },
  { id: 'Carousel', label: 'Carousel Multi-Card' },
  { id: 'Reel Cover', label: 'Reel Cover' },
  { id: 'Custom Design', label: 'Custom Dimension' },
];

export default function GraphicsRejectedPostsDesk({ onNavigateToDesk }) {
  const [rejectedPosts, setRejectedPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 30, totalPages: 1 });

  // Reupload Modal State
  const [reuploadPost, setReuploadPost] = useState(null);
  const [newMediaUrl, setNewMediaUrl] = useState('');
  const [localPreview, setLocalPreview] = useState('');
  const [newCreativeFormat, setNewCreativeFormat] = useState('Instagram / Facebook Post');
  const [revisionSummary, setRevisionSummary] = useState('');
  const [designerNotes, setDesignerNotes] = useState('');
  const [designerName, setDesignerName] = useState('Senior Graphics Designer');
  const [uploadingFile, setUploadingFile] = useState(false);
  const [submittingReupload, setSubmittingReupload] = useState(false);

  // Full History Modal State
  const [historyPost, setHistoryPost] = useState(null);
  const [historyData, setHistoryData] = useState({ revisions: [], reviews: [] });
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fetchRejected = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      const res = await graphicsApi.getRejectedPosts({
        search,
        page: pagination.page,
        limit: 30,
      });

      if (res && res.ok) {
        setRejectedPosts(res.rejectedPosts || []);
        setPagination(res.pagination || { total: 0, page: 1, limit: 30, totalPages: 1 });
      }
    } catch (err) {
      console.error('[GraphicsRejectedPostsDesk] Error:', err);
      Swal.fire({
        icon: 'error',
        title: 'Failed to load rejected posts',
        text: err.message,
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search, pagination.page]);

  useEffect(() => {
    fetchRejected();
  }, [fetchRejected]);

  // Open Reupload Modal
  const handleOpenReupload = (post) => {
    setReuploadPost(post);
    setNewMediaUrl('');
    setLocalPreview('');
    setNewCreativeFormat(post.creativeFormat || 'Instagram / Facebook Post');
    setRevisionSummary('');
    setDesignerNotes('');
  };

  // File Upload for Reupload
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      Swal.fire({ icon: 'error', title: 'File Too Large', text: 'File exceeds 15MB limit.' });
      return;
    }

    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      Swal.fire({ icon: 'error', title: 'Unsupported Format', text: 'Please upload a PNG, JPG, or WEBP image.' });
      return;
    }

    // Instant local preview
    try {
      const objUrl = URL.createObjectURL(file);
      setLocalPreview(objUrl);
    } catch (err) {}

    setUploadingFile(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64Data = reader.result;
        const uploadRes = await graphicsApi.uploadMedia(base64Data, file.name, file.type);
        if (uploadRes && uploadRes.ok) {
          setNewMediaUrl(uploadRes.url);
          Swal.fire({
            icon: 'success',
            title: 'Corrected Artwork Uploaded',
            timer: 1200,
            showConfirmButton: false,
          });
        }
      } catch (err) {
        Swal.fire({ icon: 'error', title: 'Upload Failed', text: err.message });
      } finally {
        setUploadingFile(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Submit Reupload
  const handleSubmitReupload = async (e) => {
    e.preventDefault();
    if (!reuploadPost || !newMediaUrl) {
      Swal.fire({ icon: 'warning', title: 'Please upload the corrected artwork image first.' });
      return;
    }

    const nextRev = (reuploadPost.revisionNumber || 1) + 1;

    const confirm = await Swal.fire({
      title: `Submit Revision #${nextRev}?`,
      html: `
        <div style="text-align: left; font-size: 0.88rem; color: #334155; line-height: 1.5;">
          <div>Customer: <strong>${reuploadPost.companyName}</strong></div>
          <div>New Creative Version: <strong>Revision #${nextRev}</strong></div>
          <div style="margin-top: 8px; padding: 10px; background: #eef2ff; border-radius: 8px; color: #4338ca;">
            ✓ The corrected creative will return to Marketing's <strong>Verify Posts</strong> queue for review.
            <div style="font-size: 0.78rem; color: #64748b; margin-top: 4px;">Previous rejected version and feedback are preserved in audit history.</div>
          </div>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#6366f1',
      confirmButtonText: 'Yes, Submit Corrected Artwork',
    });

    if (!confirm.isConfirmed) return;

    setSubmittingReupload(true);
    try {
      const res = await graphicsApi.reuploadArtwork(reuploadPost.id, {
        mediaUrl: newMediaUrl,
        creativeFormat: newCreativeFormat,
        designerNotes: designerNotes.trim(),
        revisionSummary: revisionSummary.trim(),
        designerName: designerName.trim() || 'Senior Graphics Designer',
      });

      if (res && res.ok) {
        await Swal.fire({
          icon: 'success',
          title: 'Resubmitted for Review! 🚀',
          text: `Revision #${nextRev} has been submitted to Marketing for verification.`,
          confirmButtonColor: '#4f46e5',
        });
        setReuploadPost(null);
        fetchRejected(true);
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Reupload Failed', text: err.message });
    } finally {
      setSubmittingReupload(false);
    }
  };

  // View Review & Revision History
  const handleViewHistory = async (post) => {
    setHistoryPost(post);
    setLoadingHistory(true);
    try {
      const res = await graphicsApi.getRequestDetail(post.id);
      if (res && res.ok) {
        setHistoryData({
          revisions: res.request.revisions || [],
          reviews: res.request.reviews || [],
        });
      }
    } catch (err) {
      console.error('[GraphicsRejectedPostsDesk] History error:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  return (
    <div>
      {/* 1. Page Header */}
      <div className="graphics-page-header">
        <div>
          <h1>Rejected Posts &amp; Revision Queue</h1>
          <p>
            Creatives returned by Marketing for compliance or quality corrections. Review auditor feedback, upload corrected revisions, and return for re-verification without erasing prior history.
          </p>
        </div>
        <div className="graphics-header-actions">
          <button
            type="button"
            className="graphics-btn-refresh"
            onClick={() => fetchRejected(true)}
            disabled={refreshing}
          >
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
            <span>{refreshing ? 'Syncing...' : 'Live Sync'}</span>
          </button>
        </div>
      </div>

      {/* 2. Search & Controls */}
      <div className="graphics-controls-card">
        <div className="graphics-search-box">
          <Search size={16} className="graphics-search-icon" />
          <input
            type="text"
            className="graphics-search-input"
            placeholder="Search rejected posts by customer, post title, rejection reason..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* 3. Content List */}
      {loading ? (
        <div className="graphics-table-card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#64748b' }}>
            <RefreshCw size={18} className="spin" />
            <span>Loading rejected posts queue...</span>
          </div>
        </div>
      ) : rejectedPosts.length === 0 ? (
        <div className="graphics-table-card" style={{ padding: 48, textAlign: 'center', color: '#64748b' }}>
          <CheckCircle2 size={36} color="#10b981" style={{ marginBottom: 8 }} />
          <h4 style={{ margin: '0 0 4px 0', color: '#0f172a' }}>Zero rejected creatives! 🎉</h4>
          <p style={{ margin: 0, fontSize: '0.84rem' }}>
            All your submitted designs have passed verification or are currently in review.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {rejectedPosts.map((p) => (
            <div key={p.id} className="graphics-table-card" style={{ padding: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '140px minmax(260px, 1fr) minmax(260px, 1fr) 180px', gap: 18, alignItems: 'center' }}>
                {/* Artwork Thumbnail */}
                <div>
                  <div
                    style={{
                      width: 140,
                      height: 140,
                      borderRadius: 10,
                      overflow: 'hidden',
                      background: '#0f172a',
                      position: 'relative',
                      border: '1px solid #fecdd3',
                    }}
                  >
                    {p.mediaUrl ? (
                      <img
                        src={p.mediaUrl}
                        alt={p.title}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: '#94a3b8' }}>
                        No Image
                      </div>
                    )}
                    <span
                      style={{
                        position: 'absolute',
                        top: 6,
                        left: 6,
                        background: '#e11d48',
                        color: '#ffffff',
                        fontSize: '0.66rem',
                        fontWeight: 800,
                        padding: '2px 6px',
                        borderRadius: 4,
                      }}
                    >
                      Rev #{p.revisionNumber}
                    </span>
                  </div>
                </div>

                {/* Customer & Post Info */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <strong style={{ fontSize: '1rem', color: '#0f172a' }}>{p.title}</strong>
                    <span className="gfx-pill gfx-pill-rose">{p.status}</span>
                  </div>
                  <div style={{ fontSize: '0.80rem', color: '#64748b' }}>
                    Customer: <strong style={{ color: '#334155' }}>{p.companyName}</strong> • {p.city || 'India'}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: 2 }}>
                    Platform: <strong>{p.platform}</strong> • Format: <strong>{p.creativeFormat}</strong>
                  </div>

                  <div
                    style={{
                      fontSize: '0.78rem',
                      color: '#475569',
                      marginTop: 8,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      lineHeight: 1.4,
                      background: '#f8fafc',
                      padding: '6px 10px',
                      borderRadius: 6,
                    }}
                  >
                    "{p.caption}"
                  </div>
                </div>

                {/* Mandatory Marketing Rejection Feedback */}
                <div>
                  <div className="graphics-rejection-callout">
                    <strong>⚠️ Marketing Auditor Rejection Reason:</strong>
                    <div style={{ fontWeight: 600, marginTop: 2 }}>
                      {p.rejectionReason}
                    </div>
                    {p.correctionInstructions && p.correctionInstructions !== p.rejectionReason && (
                      <div style={{ marginTop: 6, fontSize: '0.78rem', color: '#881337' }}>
                        <b>Correction Request:</b> {p.correctionInstructions}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 4 }}>
                    Reviewed by <b>{p.reviewerName}</b> on{' '}
                    {new Date(p.rejectedAt).toLocaleString('en-IN', {
                      timeZone: 'Asia/Kolkata',
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true,
                    })}
                  </div>
                </div>

                {/* Reupload & Action Buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch' }}>
                  <button
                    type="button"
                    className="graphics-btn-primary"
                    style={{ justifyContent: 'center', padding: '9px 14px', fontSize: '0.84rem' }}
                    onClick={() => handleOpenReupload(p)}
                  >
                    <RotateCcw size={14} />
                    <span>Reupload Fix</span>
                  </button>

                  <button
                    type="button"
                    className="graphics-btn-secondary"
                    style={{ justifyContent: 'center', padding: '7px 12px', fontSize: '0.78rem' }}
                    onClick={() => handleViewHistory(p)}
                  >
                    <History size={13} />
                    <span>View Audit Trail</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 4. Reupload Artwork Modal */}
      {reuploadPost && (
        <div className="graphics-modal-backdrop" onClick={() => setReuploadPost(null)}>
          <div className="graphics-modal-card" style={{ maxWidth: 660 }} onClick={(e) => e.stopPropagation()}>
            <div className="graphics-modal-header">
              <div>
                <span className="graphics-brand-tag" style={{ color: '#e11d48' }}>
                  Reupload Corrected Artwork (Revision #{(reuploadPost.revisionNumber || 1) + 1})
                </span>
                <h3 style={{ margin: '4px 0 0 0', fontSize: '1.2rem', fontWeight: 800 }}>
                  {reuploadPost.title}
                </h3>
              </div>
              <button
                type="button"
                className="graphics-footer-btn"
                style={{ padding: 6, borderRadius: '50%' }}
                onClick={() => setReuploadPost(null)}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmitReupload}>
              <div className="graphics-modal-body">
                {/* Rejection Feedback Box */}
                <div className="graphics-rejection-callout" style={{ margin: '0 0 16px 0' }}>
                  <strong>Marketing Auditor Rejection Feedback to Address:</strong>
                  <div style={{ fontWeight: 700, marginTop: 4, fontSize: '0.90rem' }}>
                    "{reuploadPost.rejectionReason}"
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#9f1239', marginTop: 4 }}>
                    Auditor: {reuploadPost.reviewerName}
                  </div>
                </div>

                {/* Upload New File */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: '0.80rem', fontWeight: 800, color: '#334155', marginBottom: 6, textTransform: 'uppercase' }}>
                    1. Upload Corrected Artwork Image (PNG, JPG, WEBP) *
                  </label>
                  <div
                    style={{
                      border: '2px dashed #cbd5e1',
                      borderRadius: 10,
                      padding: 20,
                      textAlign: 'center',
                      background: (localPreview || newMediaUrl) ? '#f8fafc' : '#ffffff',
                      position: 'relative',
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
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                        <RefreshCw size={24} className="spin" color="#6366f1" />
                        <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#4f46e5' }}>Uploading corrected file...</span>
                      </div>
                    ) : (localPreview || newMediaUrl) ? (
                      <div>
                        <img
                          src={localPreview || newMediaUrl}
                          alt="Corrected Preview"
                          style={{ maxHeight: 160, maxWidth: '100%', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.15)', objectFit: 'contain' }}
                        />
                        <div style={{ marginTop: 6, fontSize: '0.78rem', color: '#059669', fontWeight: 700 }}>
                          ✓ Corrected File Ready for Resubmission (Click to change)
                        </div>
                      </div>
                    ) : (
                      <div>
                        <UploadCloud size={28} color="#94a3b8" style={{ marginBottom: 6 }} />
                        <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#1e293b' }}>
                          Drag &amp; drop corrected image or click to browse
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 2 }}>
                          PNG, JPG, WEBP up to 15MB
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* What Was Fixed */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: '0.80rem', fontWeight: 800, color: '#334155', marginBottom: 6, textTransform: 'uppercase' }}>
                    2. Revision Correction Notes (How feedback was addressed)
                  </label>
                  <textarea
                    rows={2}
                    className="graphics-search-input"
                    style={{ width: '100%', padding: '8px 12px', resize: 'vertical' }}
                    placeholder="e.g. Adjusted headline hierarchy, increased contrast on logo, corrected typo in offer badge..."
                    value={revisionSummary}
                    onChange={(e) => setRevisionSummary(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="graphics-modal-footer">
                <button
                  type="button"
                  className="graphics-btn-secondary"
                  onClick={() => setReuploadPost(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="graphics-btn-primary"
                  disabled={submittingReupload || uploadingFile || !newMediaUrl}
                >
                  <Send size={14} />
                  <span>
                    {submittingReupload
                      ? 'Resubmitting to Marketing...'
                      : `Submit Revision #${(reuploadPost.revisionNumber || 1) + 1}`}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Complete Audit Trail Modal */}
      {historyPost && (
        <div className="graphics-modal-backdrop" onClick={() => setHistoryPost(null)}>
          <div className="graphics-modal-card" style={{ maxWidth: 680 }} onClick={(e) => e.stopPropagation()}>
            <div className="graphics-modal-header">
              <div>
                <span className="graphics-brand-tag">Artwork Revision &amp; Review History</span>
                <h3 style={{ margin: '4px 0 0 0', fontSize: '1.2rem', fontWeight: 800 }}>
                  {historyPost.title}
                </h3>
              </div>
              <button
                type="button"
                className="graphics-footer-btn"
                style={{ padding: 6, borderRadius: '50%' }}
                onClick={() => setHistoryPost(null)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="graphics-modal-body">
              {loadingHistory ? (
                <div style={{ textAlign: 'center', padding: 24, color: '#64748b' }}>
                  <RefreshCw size={20} className="spin" />
                  <div style={{ marginTop: 8 }}>Loading history...</div>
                </div>
              ) : (
                <div>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '0.92rem', color: '#0f172a' }}>
                    Review Decisions &amp; Auditor Feedback ({historyData.reviews.length})
                  </h4>
                  {historyData.reviews.length === 0 ? (
                    <div style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: 16 }}>No prior reviews logged.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                      {historyData.reviews.map((rev) => (
                        <div
                          key={rev.id}
                          style={{
                            padding: 12,
                            borderRadius: 8,
                            background: rev.decision === 'Approved' ? '#ecfdf5' : '#fff1f2',
                            border: `1px solid ${rev.decision === 'Approved' ? '#a7f3d0' : '#fecdd3'}`,
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <strong style={{ color: rev.decision === 'Approved' ? '#065f46' : '#9f1239' }}>
                              Decision: {rev.decision}
                            </strong>
                            <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                              {new Date(rev.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                            </span>
                          </div>
                          {rev.rejection_reason && (
                            <div style={{ fontSize: '0.82rem', color: '#be123c', fontWeight: 600, marginTop: 4 }}>
                              Rejection Reason: {rev.rejection_reason}
                            </div>
                          )}
                          {rev.remarks && (
                            <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: 2 }}>
                              Remarks: {rev.remarks}
                            </div>
                          )}
                          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 4 }}>
                            Reviewer: <b>{rev.reviewer_name}</b> ({rev.reviewer_role})
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <h4 style={{ margin: '0 0 10px 0', fontSize: '0.92rem', color: '#0f172a' }}>
                    Artwork Version Revisions ({historyData.revisions.length})
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {historyData.revisions.map((ver) => (
                      <div
                        key={ver.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: 10,
                          borderRadius: 8,
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                        }}
                      >
                        <img
                          src={ver.media_url}
                          alt="Revision"
                          style={{ width: 48, height: 48, borderRadius: 6, objectFit: 'cover' }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 800, fontSize: '0.86rem', color: '#0f172a' }}>
                            Revision #{ver.revision_number} • {ver.creative_format}
                          </div>
                          <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                            Uploaded by {ver.uploaded_by} on {new Date(ver.uploaded_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                          </div>
                          {ver.designer_notes && (
                            <div style={{ fontSize: '0.76rem', color: '#475569', marginTop: 2 }}>
                              {ver.designer_notes}
                            </div>
                          )}
                        </div>
                        <a
                          href={ver.media_url}
                          target="_blank"
                          rel="noreferrer"
                          className="graphics-footer-btn"
                          style={{ padding: '4px 8px', fontSize: '0.72rem' }}
                        >
                          <ExternalLink size={12} />
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="graphics-modal-footer">
              <button
                type="button"
                className="graphics-btn-secondary"
                onClick={() => setHistoryPost(null)}
              >
                Close History
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

