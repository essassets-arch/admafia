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
import { SmartTable } from '../components/SmartTabulator';

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
        setLocalPreview(base64Data);
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
        <div style="text-align: left; font-size: 0.88rem; line-height: 1.5;">
          <div>Customer: <strong>${reuploadPost.companyName}</strong></div>
          <div>New Creative Version: <strong>Revision #${nextRev}</strong></div>
          <div style="margin-top: 8px; padding: 10px; background: rgba(99, 102, 241, 0.12); border: 1px solid rgba(99, 102, 241, 0.28); border-radius: 8px; color: #6366f1;">
            ✓ The corrected creative will return to Marketing's <strong>Verify Posts</strong> queue for review.
            <div style="font-size: 0.78rem; opacity: 0.85; margin-top: 4px;">Previous rejected version and feedback are preserved in audit history.</div>
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
      <div className="graphics-table-card">
        <SmartTable
          title="Rejected & Revision Queue"
          defaultPageSize={10}
          exportFilename="graphics-revisions-queue"
        >
          <table className="graphics-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th>Artwork</th>
                <th>Post &amp; Client</th>
                <th>Rejection Reason &amp; Fix Instructions</th>
                <th>Reviewed By</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ padding: 40, textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--adm-text-muted, #64748b)' }}>
                      <RefreshCw size={18} className="spin" />
                      <span>Loading rejected posts queue...</span>
                    </div>
                  </td>
                </tr>
              ) : rejectedPosts.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 48, textAlign: 'center', color: 'var(--adm-text-muted, #64748b)' }}>
                    <CheckCircle2 size={36} color="#10b981" style={{ marginBottom: 8 }} />
                    <h4 style={{ margin: '0 0 4px 0', color: 'var(--adm-text-primary, #0f172a)' }}>Zero rejected creatives! 🎉</h4>
                    <p style={{ margin: 0, fontSize: '0.84rem' }}>
                      All your submitted designs have passed verification or are currently in review.
                    </p>
                  </td>
                </tr>
              ) : (
                rejectedPosts.map((p) => (
                  <tr key={p.id}>
                    {/* 1. Artwork */}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {p.mediaUrl ? (
                          <a
                            href={p.mediaUrl}
                            target="_blank"
                            rel="noreferrer"
                            title="Click to inspect full-size artwork"
                            style={{
                              width: 48,
                              height: 48,
                              borderRadius: 8,
                              overflow: 'hidden',
                              flexShrink: 0,
                              display: 'block',
                              background: '#0f172a',
                              border: '1px solid rgba(244, 63, 94, 0.4)',
                            }}
                          >
                            <img
                              src={p.mediaUrl}
                              alt={p.title}
                              style={{ width: 48, height: 48, objectFit: 'cover', display: 'block' }}
                            />
                          </a>
                        ) : (
                          <div
                            style={{
                              width: 48,
                              height: 48,
                              borderRadius: 8,
                              background: '#0f172a',
                              color: '#94a3b8',
                              fontSize: '0.66rem',
                              display: 'grid',
                              placeItems: 'center',
                              textAlign: 'center',
                              flexShrink: 0,
                              border: '1px solid var(--adm-border, #e2e8f0)',
                            }}
                          >
                            No Image
                          </div>
                        )}
                        <div>
                          <span className="gfx-pill gfx-pill-rose" style={{ fontSize: '0.66rem' }}>
                            Rev #{p.revisionNumber || 1}
                          </span>
                          <div style={{ fontSize: '0.72rem', color: 'var(--adm-text-muted, #64748b)', marginTop: 3 }}>
                            {p.creativeFormat || 'Standard'}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* 2. Post & Client */}
                    <td>
                      <div style={{ fontWeight: 800, color: 'var(--adm-text-primary, #0f172a)', fontSize: '0.88rem' }}>
                        {p.title}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--adm-text-body, #334155)', fontWeight: 600, marginTop: 2 }}>
                        {p.companyName} • <span style={{ color: 'var(--adm-text-muted, #64748b)', fontWeight: 400 }}>{p.city || 'India'}</span>
                      </div>
                      {p.platform && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--adm-text-muted, #64748b)', marginTop: 2 }}>
                          {p.platform}
                        </div>
                      )}
                    </td>

                    {/* 3. Rejection Reason & Fix Instructions */}
                    <td>
                      <div style={{ fontSize: '0.80rem', color: '#f43f5e', fontWeight: 700 }}>
                        {p.rejectionReason || 'Returned for revision'}
                      </div>
                      {p.correctionInstructions && p.correctionInstructions !== p.rejectionReason && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--adm-text-body, #475569)', marginTop: 3 }}>
                          <strong>Fix:</strong> {p.correctionInstructions}
                        </div>
                      )}
                    </td>

                    {/* 4. Reviewed By */}
                    <td>
                      <div style={{ fontWeight: 700, fontSize: '0.80rem', color: 'var(--adm-text-primary, #0f172a)' }}>
                        {p.reviewerName || 'Marketing Auditor'}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--adm-text-muted, #64748b)', marginTop: 2 }}>
                        {p.rejectedAt
                          ? new Date(p.rejectedAt).toLocaleString('en-IN', {
                              timeZone: 'Asia/Kolkata',
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: true,
                            })
                          : '—'}
                      </div>
                    </td>

                    {/* 5. Status */}
                    <td>
                      <span
                        className={`gfx-pill ${
                          p.status === 'Changes Requested' ? 'gfx-pill-amber' : 'gfx-pill-rose'
                        }`}
                      >
                        {p.status || 'Rejected'}
                      </span>
                    </td>

                    {/* 6. Actions */}
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="graphics-btn-primary"
                          style={{ padding: '6px 10px', fontSize: '0.76rem' }}
                          onClick={() => handleOpenReupload(p)}
                        >
                          <RotateCcw size={13} />
                          <span>Reupload Fix</span>
                        </button>
                        <button
                          type="button"
                          className="graphics-btn-secondary"
                          style={{ padding: '6px 10px', fontSize: '0.76rem' }}
                          onClick={() => handleViewHistory(p)}
                        >
                          <History size={13} />
                          <span>Audit Trail</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </SmartTable>
      </div>

      {/* 4. Reupload Artwork Modal */}
      {reuploadPost && (
        <div className="graphics-modal-backdrop" onClick={() => setReuploadPost(null)}>
          <div className="graphics-modal-card" style={{ maxWidth: 660 }} onClick={(e) => e.stopPropagation()}>
            <div className="graphics-modal-header">
              <div>
                <span className="graphics-brand-tag" style={{ color: '#f43f5e' }}>
                  Reupload Corrected Artwork (Revision #{(reuploadPost.revisionNumber || 1) + 1})
                </span>
                <h3 style={{ margin: '4px 0 0 0', fontSize: '1.2rem', fontWeight: 800 }}>
                  {reuploadPost.title}
                </h3>
              </div>
              <button
                type="button"
                className="graphics-btn-secondary"
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
                  <div style={{ fontSize: '0.74rem', opacity: 0.85, marginTop: 4 }}>
                    Auditor: {reuploadPost.reviewerName}
                  </div>
                </div>

                {/* Upload New File */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: '0.80rem', fontWeight: 800, color: 'var(--adm-text-body, #334155)', marginBottom: 6, textTransform: 'uppercase' }}>
                    1. Upload Corrected Artwork Image (PNG, JPG, WEBP) *
                  </label>
                  <div
                    className={`gfx-upload-dropzone ${(localPreview || newMediaUrl) ? 'has-preview' : ''}`.trim()}
                    style={{
                      border: '2px dashed var(--adm-border-strong, #cbd5e1)',
                      borderRadius: 10,
                      padding: 20,
                      textAlign: 'center',
                      background: (localPreview || newMediaUrl) ? 'var(--adm-bg-subtle, #f8fafc)' : 'var(--adm-bg-card, #ffffff)',
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
                        <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#6366f1' }}>Uploading corrected file...</span>
                      </div>
                    ) : (localPreview || newMediaUrl) ? (
                      <div>
                        <img
                          src={localPreview || newMediaUrl}
                          alt="Corrected Preview"
                          style={{ maxHeight: 160, maxWidth: '100%', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.15)', objectFit: 'contain' }}
                          onError={(e) => {
                            if (localPreview && e.currentTarget.src !== localPreview) {
                              e.currentTarget.src = localPreview;
                            }
                          }}
                        />
                        <div style={{ marginTop: 6, fontSize: '0.78rem', color: '#10b981', fontWeight: 700 }}>
                          ✓ Corrected File Ready for Resubmission (Click to change)
                        </div>
                      </div>
                    ) : (
                      <div>
                        <UploadCloud size={28} color="#94a3b8" style={{ marginBottom: 6 }} />
                        <div style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--adm-text-secondary, #1e293b)' }}>
                          Drag &amp; drop corrected image or click to browse
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--adm-text-muted, #64748b)', marginTop: 2 }}>
                          PNG, JPG, WEBP up to 15MB
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* What Was Fixed */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: '0.80rem', fontWeight: 800, color: 'var(--adm-text-body, #334155)', marginBottom: 6, textTransform: 'uppercase' }}>
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
          <div
            className="graphics-modal-card"
            style={{ maxWidth: 840, width: '100%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="graphics-modal-header">
              <div>
                <span className="graphics-brand-tag">Artwork Revision &amp; Review History</span>
                <h3 style={{ margin: '4px 0 0 0', fontSize: '1.2rem', fontWeight: 800 }}>
                  {historyPost.title}
                </h3>
              </div>
              <button
                type="button"
                className="graphics-btn-secondary"
                style={{ padding: 6, borderRadius: '50%' }}
                onClick={() => setHistoryPost(null)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="graphics-modal-body">
              {loadingHistory ? (
                <div style={{ textAlign: 'center', padding: 24, color: 'var(--adm-text-muted, #64748b)' }}>
                  <RefreshCw size={20} className="spin" />
                  <div style={{ marginTop: 8 }}>Loading history...</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                  <div>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '0.92rem', color: 'var(--adm-text-primary, #0f172a)' }}>
                      Review Decisions &amp; Auditor Feedback ({historyData.reviews.length})
                    </h4>
                    <div className="graphics-table-card">
                      <SmartTable
                        title="Review Decisions & Auditor Feedback"
                        defaultPageSize={6}
                        exportFilename="graphics-review-decisions"
                      >
                        <table className="graphics-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr>
                              <th>Decision</th>
                              <th>Reviewer</th>
                              <th>Rejection Reason &amp; Remarks</th>
                              <th>Timestamp</th>
                            </tr>
                          </thead>
                          <tbody>
                            {historyData.reviews.length === 0 ? (
                              <tr>
                                <td colSpan={4} style={{ textAlign: 'center', padding: 24, color: 'var(--adm-text-muted, #64748b)', fontSize: '0.82rem' }}>
                                  No prior reviews logged.
                                </td>
                              </tr>
                            ) : (
                              historyData.reviews.map((rev, idx) => (
                                <tr key={rev.id || idx}>
                                  <td>
                                    <span
                                      className={`gfx-pill ${
                                        rev.decision === 'Approved'
                                          ? 'gfx-pill-emerald'
                                          : rev.decision === 'Changes Requested'
                                          ? 'gfx-pill-amber'
                                          : 'gfx-pill-rose'
                                      }`}
                                    >
                                      {rev.decision}
                                    </span>
                                  </td>
                                  <td>
                                    <strong style={{ fontSize: '0.82rem', color: 'var(--adm-text-primary, #0f172a)' }}>
                                      {rev.reviewer_name || 'Marketing Auditor'}
                                    </strong>
                                    {rev.reviewer_role && (
                                      <div style={{ fontSize: '0.72rem', color: 'var(--adm-text-muted, #64748b)' }}>
                                        {rev.reviewer_role}
                                      </div>
                                    )}
                                  </td>
                                  <td>
                                    {rev.rejection_reason && (
                                      <div style={{ fontSize: '0.80rem', color: '#f43f5e', fontWeight: 700 }}>
                                        Reason: {rev.rejection_reason}
                                      </div>
                                    )}
                                    {rev.remarks && (
                                      <div style={{ fontSize: '0.78rem', color: 'var(--adm-text-body, #475569)', marginTop: rev.rejection_reason ? 2 : 0 }}>
                                        {rev.remarks}
                                      </div>
                                    )}
                                    {!rev.rejection_reason && !rev.remarks && (
                                      <span style={{ color: 'var(--adm-text-muted, #94a3b8)' }}>—</span>
                                    )}
                                  </td>
                                  <td>
                                    <span style={{ fontSize: '0.74rem', color: 'var(--adm-text-muted, #64748b)' }}>
                                      {rev.created_at
                                        ? new Date(rev.created_at).toLocaleString('en-IN', {
                                            timeZone: 'Asia/Kolkata',
                                            day: '2-digit',
                                            month: 'short',
                                            year: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit',
                                          })
                                        : '—'}
                                    </span>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </SmartTable>
                    </div>
                  </div>

                  <div>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '0.92rem', color: 'var(--adm-text-primary, #0f172a)' }}>
                      Artwork Version Revisions ({historyData.revisions.length})
                    </h4>
                    <div className="graphics-table-card">
                      <SmartTable
                        title="Artwork Version Revisions"
                        defaultPageSize={6}
                        exportFilename="graphics-artwork-revisions"
                      >
                        <table className="graphics-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr>
                              <th>Artwork</th>
                              <th>Revision &amp; Format</th>
                              <th>Designer &amp; Notes</th>
                              <th>Uploaded At</th>
                              <th style={{ textAlign: 'right' }}>Asset</th>
                            </tr>
                          </thead>
                          <tbody>
                            {historyData.revisions.length === 0 ? (
                              <tr>
                                <td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--adm-text-muted, #64748b)', fontSize: '0.82rem' }}>
                                  No artwork revisions recorded.
                                </td>
                              </tr>
                            ) : (
                              historyData.revisions.map((ver, idx) => (
                                <tr key={ver.id || idx}>
                                  <td>
                                    {ver.media_url ? (
                                      <img
                                        src={ver.media_url}
                                        alt={`Revision ${ver.revision_number}`}
                                        style={{ width: 48, height: 48, borderRadius: 6, objectFit: 'cover', display: 'block' }}
                                      />
                                    ) : (
                                      <div
                                        style={{
                                          width: 48,
                                          height: 48,
                                          borderRadius: 6,
                                          background: '#0f172a',
                                          color: '#94a3b8',
                                          fontSize: '0.66rem',
                                          display: 'grid',
                                          placeItems: 'center',
                                        }}
                                      >
                                        No Image
                                      </div>
                                    )}
                                  </td>
                                  <td>
                                    <div style={{ fontWeight: 800, fontSize: '0.84rem', color: 'var(--adm-text-primary, #0f172a)' }}>
                                      Revision #{ver.revision_number}
                                    </div>
                                    <div style={{ fontSize: '0.74rem', color: 'var(--adm-text-muted, #64748b)' }}>
                                      {ver.creative_format || 'Standard'}
                                    </div>
                                  </td>
                                  <td>
                                    <div style={{ fontWeight: 600, fontSize: '0.80rem', color: 'var(--adm-text-secondary, #334155)' }}>
                                      {ver.uploaded_by || 'Graphics Designer'}
                                    </div>
                                    {ver.designer_notes && (
                                      <div style={{ fontSize: '0.76rem', color: 'var(--adm-text-body, #475569)', marginTop: 2 }}>
                                        {ver.designer_notes}
                                      </div>
                                    )}
                                  </td>
                                  <td>
                                    <span style={{ fontSize: '0.74rem', color: 'var(--adm-text-muted, #64748b)' }}>
                                      {ver.uploaded_at
                                        ? new Date(ver.uploaded_at).toLocaleString('en-IN', {
                                            timeZone: 'Asia/Kolkata',
                                            day: '2-digit',
                                            month: 'short',
                                            year: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit',
                                          })
                                        : '—'}
                                    </span>
                                  </td>
                                  <td style={{ textAlign: 'right' }}>
                                    {ver.media_url ? (
                                      <a
                                        href={ver.media_url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="graphics-btn-secondary"
                                        style={{ padding: '4px 8px', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                        title="Open full-resolution asset"
                                      >
                                        <ExternalLink size={12} />
                                        <span>Open</span>
                                      </a>
                                    ) : (
                                      <span style={{ color: 'var(--adm-text-muted, #94a3b8)' }}>—</span>
                                    )}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </SmartTable>
                    </div>
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

