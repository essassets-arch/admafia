import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  Check,
  X,
  RotateCcw,
  History,
  Eye,
  Search,
  RefreshCw,
  Building,
  Image,
  Clock,
  AlertCircle,
  FileCheck2,
} from 'lucide-react';
import Swal from 'sweetalert2';
import marketingApi from '../services/marketingApi';

export default function VerifyPostsDesk({ onNavigateToDesk }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('Pending Verification');
  const [search, setSearch] = useState('');

  // History & Detail Modal
  const [historyPost, setHistoryPost] = useState(null);
  const [historyData, setHistoryData] = useState({ reviews: [], auditEvents: [] });
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fetchPosts = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      const res = await marketingApi.getPosts({
        status: statusFilter,
        search,
      });
      if (res && res.ok) {
        setPosts(res.posts || []);
      }
    } catch (err) {
      console.error('[VerifyPostsDesk] Error:', err);
      Swal.fire({
        icon: 'error',
        title: 'Failed to load posts queue',
        text: err.message || 'Could not fetch posts for verification.',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  // Action A: Approve Post
  const handleApprove = async (post) => {
    const { value: remarks, isConfirmed } = await Swal.fire({
      title: 'Approve Post for Marketing?',
      html: `
        <div style="text-align: left; font-size: 0.9rem; color: #334155; margin-bottom: 12px;">
          <div>Customer: <strong>${post.companyName}</strong></div>
          <div>Post Title: <strong>${post.title}</strong></div>
          <div style="margin-top: 8px;">Approving this creative will unlock it for deployment in live advertising campaigns.</div>
        </div>
      `,
      input: 'text',
      inputPlaceholder: 'Approval remarks / compliance notes (optional)...',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#10b981',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, Approve Post ✓',
    });

    if (!isConfirmed) return;

    try {
      const res = await marketingApi.reviewPost(post.id, {
        decision: 'Approved',
        reviewerName: 'Marketing Quality Auditor',
        reviewerRole: 'Senior Marketing Auditor',
        remarks: remarks || 'Post verified and compliant with advertising guidelines.',
      });

      if (res && res.ok) {
        await Swal.fire({
          icon: 'success',
          title: 'Post Approved!',
          text: `"${post.title}" is now approved and available for campaign activation.`,
          timer: 1600,
          showConfirmButton: false,
        });
        fetchPosts(true);
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Approval Failed', text: err.message });
    }
  };

  // Action B: Reject Post
  const handleReject = async (post) => {
    const { value: reason, isConfirmed } = await Swal.fire({
      title: 'Reject Marketing Post',
      html: `
        <div style="text-align: left; font-size: 0.88rem; color: #475569; margin-bottom: 8px;">
          Provide the specific non-compliance or rejection reason:
        </div>
      `,
      input: 'textarea',
      inputPlaceholder: 'Reason for rejection (mandatory)...',
      inputValidator: (value) => {
        if (!value || !value.trim()) {
          return 'Rejection reason is strictly required!';
        }
      },
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#e11d48',
      confirmButtonText: 'Confirm Rejection',
    });

    if (!isConfirmed || !reason) return;

    try {
      const res = await marketingApi.reviewPost(post.id, {
        decision: 'Rejected',
        reviewerName: 'Marketing Quality Auditor',
        rejectionReason: reason.trim(),
        remarks: `Rejected: ${reason.trim()}`,
      });

      if (res && res.ok) {
        await Swal.fire({
          icon: 'info',
          title: 'Post Rejected',
          text: 'The post status has been marked as Rejected with mandatory reason logged.',
          confirmButtonColor: '#4f46e5',
        });
        fetchPosts(true);
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Action Failed', text: err.message });
    }
  };

  // Action C: Request Changes
  const handleRequestChanges = async (post) => {
    const { value: instructions, isConfirmed } = await Swal.fire({
      title: 'Request Changes from Creator',
      html: `
        <div style="text-align: left; font-size: 0.88rem; color: #475569; margin-bottom: 8px;">
          Provide clear correction instructions for the creator to address:
        </div>
      `,
      input: 'textarea',
      inputPlaceholder: 'e.g. Please update the headline hierarchy and ensure city name is bolded...',
      inputValidator: (value) => {
        if (!value || !value.trim()) {
          return 'Correction instructions are strictly required!';
        }
      },
      icon: 'info',
      showCancelButton: true,
      confirmButtonColor: '#d97706',
      confirmButtonText: 'Return for Changes',
    });

    if (!isConfirmed || !instructions) return;

    try {
      const res = await marketingApi.reviewPost(post.id, {
        decision: 'Changes Requested',
        reviewerName: 'Marketing Quality Auditor',
        correctionInstructions: instructions.trim(),
        remarks: `Changes Requested: ${instructions.trim()}`,
      });

      if (res && res.ok) {
        await Swal.fire({
          icon: 'success',
          title: 'Returned for Changes',
          text: 'The creator has been notified with your correction instructions.',
          confirmButtonColor: '#4f46e5',
        });
        fetchPosts(true);
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Action Failed', text: err.message });
    }
  };

  // Action D: View History
  const handleViewHistory = async (post) => {
    setHistoryPost(post);
    setLoadingHistory(true);
    try {
      const res = await marketingApi.getPostHistory(post.id);
      if (res && res.ok) {
        setHistoryData({
          reviews: res.reviews || [],
          auditEvents: res.auditEvents || [],
        });
      }
    } catch (err) {
      console.error('[VerifyPostsDesk] History load failed', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  return (
    <div className="marketing-verify-posts-page">
      {/* 1. Header */}
      <div className="marketing-page-header">
        <div className="marketing-header-title-col">
          <h1>Verify Marketing Posts Queue</h1>
          <p>
            Audit and verification review pipeline for marketing creatives prior to campaign deployment.
          </p>
        </div>
        <div className="marketing-header-actions">
          <button
            type="button"
            className="marketing-btn-refresh"
            onClick={() => fetchPosts(true)}
            disabled={refreshing}
          >
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
            <span>{refreshing ? 'Refreshing...' : 'Live Refresh'}</span>
          </button>
        </div>
      </div>

      {/* 2. Filter Tabs & Search Bar */}
      <div className="marketing-controls-card">
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {[
            { id: 'Pending Verification', label: 'Pending Review' },
            { id: 'Approved', label: 'Approved ✓' },
            { id: 'Changes Requested', label: 'Changes Requested' },
            { id: 'Rejected', label: 'Rejected' },
            { id: 'all', label: 'All Posts' },
          ].map((tab) => (
            <button
              type="button"
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className="mkt-btn-table-action"
              style={{
                background: statusFilter === tab.id ? '#4f46e5' : '#ffffff',
                color: statusFilter === tab.id ? '#ffffff' : '#334155',
                borderColor: statusFilter === tab.id ? '#4f46e5' : '#cbd5e1',
                fontWeight: 700,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="marketing-search-box" style={{ maxWidth: '320px' }}>
          <Search size={16} className="marketing-search-icon" />
          <input
            type="text"
            className="marketing-search-input"
            placeholder="Search by post, customer, ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* 3. Review Queue List */}
      <div className="marketing-table-card">
        <div className="marketing-table-responsive">
          <table className="marketing-table">
            <thead>
              <tr>
                <th>Creative Preview</th>
                <th>Post Information</th>
                <th>Customer / Business</th>
                <th>Platform &amp; Rev</th>
                <th>Status</th>
                <th>Submitter &amp; Time</th>
                <th>Verification Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '40px' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: '#64748b' }}>
                      <RefreshCw size={18} className="spin" />
                      <span>Loading review queue...</span>
                    </div>
                  </td>
                </tr>
              ) : posts.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '50px 20px', color: '#64748b' }}>
                    <FileCheck2 size={36} style={{ color: '#cbd5e1', marginBottom: '8px' }} />
                    <h4 style={{ margin: '0 0 6px 0', color: '#0f172a' }}>No posts in this queue</h4>
                    <p style={{ fontSize: '0.84rem', margin: 0 }}>
                      All items in "{statusFilter}" have been processed or no matching records found.
                    </p>
                  </td>
                </tr>
              ) : (
                posts.map((post) => (
                  <tr key={post.id}>
                    {/* Media Thumbnail */}
                    <td style={{ width: '80px' }}>
                      <div
                        style={{
                          width: '68px',
                          height: '68px',
                          borderRadius: '8px',
                          background: '#0f172a',
                          overflow: 'hidden',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {post.mediaUrl ? (
                          <img
                            src={post.mediaUrl}
                            alt={post.title}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          <Image size={24} style={{ color: '#64748b' }} />
                        )}
                      </div>
                    </td>

                    {/* Post Info */}
                    <td style={{ maxWidth: '280px' }}>
                      <div className="mkt-cell-primary">{post.title}</div>
                      <div className="mkt-cell-sub" style={{ fontSize: '0.78rem' }}>
                        ID: <span style={{ fontFamily: 'monospace' }}>{post.id}</span>
                      </div>
                      <p
                        style={{
                          margin: '4px 0 0 0',
                          fontSize: '0.8rem',
                          color: '#475569',
                          lineHeight: 1.35,
                          maxHeight: '38px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {post.caption}
                      </p>
                    </td>

                    {/* Customer */}
                    <td>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>{post.companyName}</div>
                      <div className="mkt-cell-sub">
                        <span className="mkt-pill mkt-pill-slate">{post.customerCategory}</span>
                      </div>
                      <div className="mkt-cell-sub">{post.customerCity || 'India'}</div>
                    </td>

                    {/* Platform & Rev */}
                    <td>
                      <div style={{ fontSize: '0.84rem', fontWeight: 600 }}>{post.platform}</div>
                      <div className="mkt-cell-sub">Revision: v{post.revisionNumber}</div>
                      {post.callToAction && (
                        <div className="mkt-cell-sub">CTA: <strong>{post.callToAction}</strong></div>
                      )}
                    </td>

                    {/* Status */}
                    <td>
                      <span
                        className={`mkt-pill ${
                          post.status === 'Approved'
                            ? 'mkt-pill-green'
                            : post.status === 'Pending Verification'
                            ? 'mkt-pill-blue'
                            : post.status === 'Changes Requested'
                            ? 'mkt-pill-amber'
                            : post.status === 'Rejected'
                            ? 'mkt-pill-rose'
                            : 'mkt-pill-slate'
                        }`}
                      >
                        {post.status}
                      </span>
                    </td>

                    {/* Submitter & Time */}
                    <td>
                      <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>{post.submittedBy || 'Creator'}</div>
                      <div className="mkt-cell-sub" style={{ whiteSpace: 'nowrap' }}>
                        {post.submittedAt
                          ? new Date(post.submittedAt).toLocaleString('en-IN', {
                              timeZone: 'Asia/Kolkata',
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: true,
                            })
                          : 'Draft'}
                      </div>
                    </td>

                    {/* Actions */}
                    <td>
                      <div className="mkt-actions-flex" style={{ flexWrap: 'wrap' }}>
                        {post.status === 'Pending Verification' && (
                          <>
                            <button
                              type="button"
                              className="mkt-btn-table-action success"
                              onClick={() => handleApprove(post)}
                              title="Approve Post for Campaigns"
                            >
                              <Check size={13} />
                              <span>Approve</span>
                            </button>
                            <button
                              type="button"
                              className="mkt-btn-table-action"
                              style={{ borderColor: '#fde68a', color: '#d97706', background: '#fffbeb' }}
                              onClick={() => handleRequestChanges(post)}
                              title="Request Changes"
                            >
                              <RotateCcw size={13} />
                              <span>Changes</span>
                            </button>
                            <button
                              type="button"
                              className="mkt-btn-table-action danger"
                              onClick={() => handleReject(post)}
                              title="Reject Post"
                            >
                              <X size={13} />
                              <span>Reject</span>
                            </button>
                          </>
                        )}

                        <button
                          type="button"
                          className="mkt-btn-table-action"
                          onClick={() => handleViewHistory(post)}
                          title="View Revision & Decision History"
                        >
                          <History size={13} />
                          <span>History</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. History Modal */}
      {historyPost && (
        <div className="marketing-modal-backdrop" onClick={() => setHistoryPost(null)}>
          <div className="marketing-modal-box" style={{ maxWidth: '680px' }} onClick={(e) => e.stopPropagation()}>
            <div className="marketing-modal-header">
              <div>
                <h3 style={{ margin: 0 }}>Review &amp; Revision Audit Trail</h3>
                <div className="mkt-cell-sub">
                  Post: <strong>{historyPost.title}</strong> (ID: {historyPost.id})
                </div>
              </div>
              <button
                type="button"
                className="marketing-btn-close"
                onClick={() => setHistoryPost(null)}
              >
                ✕
              </button>
            </div>
            <div className="marketing-modal-body">
              {loadingHistory ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                  <RefreshCw size={18} className="spin" /> Loading audit history...
                </div>
              ) : historyData.reviews.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                  No prior reviews recorded for this post yet.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {historyData.reviews.map((rev) => (
                    <div
                      key={rev.id}
                      style={{
                        padding: '14px',
                        borderRadius: '10px',
                        border: '1.5px solid #e2e8f0',
                        background: '#f8fafc',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span
                          className={`mkt-pill ${
                            rev.decision === 'Approved'
                              ? 'mkt-pill-green'
                              : rev.decision === 'Changes Requested'
                              ? 'mkt-pill-amber'
                              : 'mkt-pill-rose'
                          }`}
                        >
                          {rev.decision}
                        </span>
                        <span style={{ fontSize: '0.76rem', color: '#64748b' }}>
                          {new Date(rev.created_at).toLocaleString('en-IN', {
                            timeZone: 'Asia/Kolkata',
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true,
                          })}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.84rem', fontWeight: 600, color: '#0f172a', marginBottom: '4px' }}>
                        Auditor: {rev.reviewer_name} ({rev.reviewer_role})
                      </div>
                      {rev.remarks && (
                        <div style={{ fontSize: '0.84rem', color: '#475569', marginBottom: '4px' }}>
                          Remarks: {rev.remarks}
                        </div>
                      )}
                      {rev.rejection_reason && (
                        <div style={{ fontSize: '0.84rem', color: '#dc2626', fontWeight: 600 }}>
                          Reason: {rev.rejection_reason}
                        </div>
                      )}
                      {rev.correction_instructions && (
                        <div style={{ fontSize: '0.84rem', color: '#b45309', fontWeight: 600 }}>
                          Instructions: {rev.correction_instructions}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="marketing-modal-footer">
              <button
                type="button"
                className="marketing-btn-primary"
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

