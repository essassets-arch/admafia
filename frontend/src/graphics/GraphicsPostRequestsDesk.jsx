import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  UploadCloud,
  Search,
  RefreshCw,
  Eye,
  Building,
  Calendar,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  X,
  ExternalLink,
  Layers,
  ChevronRight,
} from 'lucide-react';
import Swal from 'sweetalert2';
import graphicsApi from '../services/graphicsApi';

export default function GraphicsPostRequestsDesk({ onNavigateToDesk }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 30, totalPages: 1 });

  // Detail Modal
  const [selectedRequest, setSelectedRequest] = useState(null);

  const fetchRequests = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      const res = await graphicsApi.getRequests({
        status: statusFilter,
        search,
        platform: platformFilter,
        priority: priorityFilter,
        page: pagination.page,
        limit: 30,
      });

      if (res && res.ok) {
        setRequests(res.requests || []);
        setPagination(res.pagination || { total: 0, page: 1, limit: 30, totalPages: 1 });
      }
    } catch (err) {
      console.error('[GraphicsPostRequestsDesk] Error:', err);
      Swal.fire({
        icon: 'error',
        title: 'Failed to load post requests',
        text: err.message,
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, search, platformFilter, priorityFilter, pagination.page]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleOpenUploadForRequest = (req) => {
    if (onNavigateToDesk) {
      onNavigateToDesk('upload_post', req?.id || req);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Approved':
        return <span className="gfx-pill gfx-pill-emerald">✓ Approved</span>;
      case 'Pending Verification':
        return <span className="gfx-pill gfx-pill-indigo">⏳ Awaiting Verification</span>;
      case 'Rejected':
        return <span className="gfx-pill gfx-pill-rose">⚠️ Rejected (Needs Fix)</span>;
      case 'Changes Requested':
        return <span className="gfx-pill gfx-pill-amber">⚠️ Changes Requested</span>;
      case 'In Progress':
        return <span className="gfx-pill gfx-pill-indigo">🎨 In Progress</span>;
      case 'Pending Graphics':
      case 'Draft':
      default:
        return <span className="gfx-pill gfx-pill-slate">📋 Pending Artwork</span>;
    }
  };

  return (
    <div>
      {/* 1. Page Header */}
      <div className="graphics-page-header">
        <div>
          <h1>Post Design Requests</h1>
          <p>
            Review all marketing creative requests submitted for production. Inspect briefs, copy, creative instructions, and upload finished artwork.
          </p>
        </div>
        <div className="graphics-header-actions">
          <button
            type="button"
            className="graphics-btn-refresh"
            onClick={() => fetchRequests(true)}
            disabled={refreshing}
          >
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
            <span>{refreshing ? 'Syncing...' : 'Live Sync'}</span>
          </button>
        </div>
      </div>

      {/* 2. Controls Bar */}
      <div className="graphics-controls-card">
        <div className="graphics-search-box">
          <Search size={16} className="graphics-search-icon" />
          <input
            type="text"
            className="graphics-search-input"
            placeholder="Search by customer, post title, caption, ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="graphics-filter-group">
          <select
            className="graphics-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Request Statuses</option>
            <option value="Needs Artwork">Needs Artwork (Pending Upload)</option>
            <option value="Pending Verification">Pending Marketing Verification</option>
            <option value="Changes Requested">Changes Requested</option>
            <option value="Rejected">Rejected</option>
            <option value="Approved">Approved</option>
          </select>

          <select
            className="graphics-select"
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
          >
            <option value="all">All Platforms</option>
            <option value="Meta Ads (Facebook & Instagram)">Meta Ads (FB &amp; IG)</option>
            <option value="Instagram">Instagram Only</option>
            <option value="Facebook">Facebook Only</option>
          </select>
        </div>
      </div>

      {/* 3. Requests Table */}
      <div className="graphics-table-card">
        <div style={{ overflowX: 'auto' }}>
          <table className="graphics-table">
            <thead>
              <tr>
                <th style={{ width: '22%' }}>Customer &amp; Idea</th>
                <th style={{ width: '28%' }}>Post Title &amp; Copy</th>
                <th style={{ width: '15%' }}>Platform &amp; Format</th>
                <th style={{ width: '15%' }}>Design Status</th>
                <th style={{ width: '20%', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '40px' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#64748b' }}>
                      <RefreshCw size={18} className="spin" />
                      <span>Loading design requests from Marketing...</span>
                    </div>
                  </td>
                </tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '48px 20px', color: '#64748b' }}>
                    <Layers size={36} style={{ color: '#cbd5e1', marginBottom: 8 }} />
                    <h4 style={{ margin: '0 0 4px 0', color: '#0f172a' }}>No post requests found</h4>
                    <p style={{ margin: 0, fontSize: '0.84rem' }}>
                      No design requests match your selected filters.
                    </p>
                  </td>
                </tr>
              ) : (
                requests.map((r) => (
                  <tr key={r.id}>
                    {/* Customer & Idea */}
                    <td>
                      <div style={{ fontWeight: 800, color: '#0f172a' }}>{r.companyName}</div>
                      <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: 2 }}>
                        {r.customerCategory} • ID: {r.id}
                      </div>
                      {r.ideaTitle && (
                        <div style={{ fontSize: '0.74rem', color: '#4f46e5', fontWeight: 600, marginTop: 4 }}>
                          💡 {r.ideaTitle}
                        </div>
                      )}
                    </td>

                    {/* Post Title & Copy */}
                    <td>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>{r.title}</div>
                      <div
                        style={{
                          fontSize: '0.78rem',
                          color: '#475569',
                          marginTop: 4,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          lineHeight: 1.4,
                        }}
                      >
                        {r.caption}
                      </div>
                      {r.hashtags && (
                        <div style={{ fontSize: '0.72rem', color: '#0ea5e9', marginTop: 3 }}>
                          {r.hashtags}
                        </div>
                      )}
                    </td>

                    {/* Platform & Format */}
                    <td>
                      <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#0f172a' }}>
                        {r.platform}
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: 2 }}>
                        {r.creativeFormat || 'Feed Creative'}
                      </div>
                      {r.mediaUrl && (
                        <div style={{ marginTop: 4 }}>
                          <span className="gfx-pill gfx-pill-slate" style={{ fontSize: '0.66rem' }}>
                            Rev #{r.revisionNumber} Artwork
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Status */}
                    <td>
                      <div>{getStatusBadge(r.status)}</div>
                      {r.latestReview && r.status === 'Rejected' && (
                        <div style={{ fontSize: '0.72rem', color: '#e11d48', fontWeight: 700, marginTop: 4 }}>
                          ⚠️ {r.latestReview.rejectionReason}
                        </div>
                      )}
                      {r.latestReview && r.status === 'Changes Requested' && (
                        <div style={{ fontSize: '0.72rem', color: '#d97706', fontWeight: 700, marginTop: 4 }}>
                          ⚠️ {r.latestReview.correctionInstructions}
                        </div>
                      )}
                    </td>

                    {/* Actions */}
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        <button
                          type="button"
                          className="graphics-btn-secondary"
                          style={{ padding: '5px 10px', fontSize: '0.78rem' }}
                          onClick={() => setSelectedRequest(r)}
                          title="View Complete Marketing Brief"
                        >
                          <Eye size={13} />
                          <span>Brief</span>
                        </button>

                        {r.isEligibleForUpload && (
                          <a
                            href={`/graphics/upload-post?requestId=${encodeURIComponent(r.id)}`}
                            className="graphics-btn-primary"
                            style={{ padding: '6px 14px', fontSize: '0.78rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                            onClick={(e) => {
                              if (onNavigateToDesk) {
                                e.preventDefault();
                                handleOpenUploadForRequest(r);
                              }
                            }}
                            title="Upload Creative Artwork"
                          >
                            <UploadCloud size={13} />
                            <span>Upload</span>
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Complete Marketing Brief Modal */}
      {selectedRequest && (
        <div className="graphics-modal-backdrop" onClick={() => setSelectedRequest(null)}>
          <div className="graphics-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="graphics-modal-header">
              <div>
                <span className="graphics-brand-tag">Marketing Design Brief</span>
                <h3 style={{ margin: '4px 0 0 0', fontSize: '1.2rem', fontWeight: 800 }}>
                  {selectedRequest.title}
                </h3>
              </div>
              <button
                type="button"
                className="graphics-footer-btn"
                style={{ padding: 6, borderRadius: '50%' }}
                onClick={() => setSelectedRequest(null)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="graphics-modal-body">
              {/* Customer Box */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 10,
                  padding: '12px 14px',
                  marginBottom: 16,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <strong style={{ color: '#0f172a' }}>{selectedRequest.companyName}</strong>
                  <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>
                    Contact: {selectedRequest.contactPerson} • {selectedRequest.phone} • {selectedRequest.city}
                  </div>
                </div>
                <div>{getStatusBadge(selectedRequest.status)}</div>
              </div>

              {/* Idea Concept */}
              {selectedRequest.ideaTitle && (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: '0.74rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>
                    Strategic Concept / Idea Reference
                  </label>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#4f46e5', marginTop: 2 }}>
                    💡 {selectedRequest.ideaTitle}
                  </div>
                  {selectedRequest.ideaConcept && (
                    <div style={{ fontSize: '0.82rem', color: '#475569', marginTop: 4, background: '#eef2ff', padding: 10, borderRadius: 8 }}>
                      {selectedRequest.ideaConcept}
                    </div>
                  )}
                </div>
              )}

              {/* Copy & Caption */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: '0.74rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>
                  Post Caption &amp; Content Copy
                </label>
                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    padding: 12,
                    fontSize: '0.86rem',
                    color: '#0f172a',
                    whiteSpace: 'pre-wrap',
                    lineHeight: 1.5,
                    marginTop: 4,
                  }}
                >
                  {selectedRequest.caption}
                </div>
              </div>

              {/* Specs Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 14 }}>
                <div style={{ background: '#f8fafc', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: '0.70rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
                    Target Platform
                  </span>
                  <div style={{ fontWeight: 700, fontSize: '0.86rem', color: '#0f172a', marginTop: 2 }}>
                    {selectedRequest.platform}
                  </div>
                </div>

                <div style={{ background: '#f8fafc', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: '0.70rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
                    Call To Action
                  </span>
                  <div style={{ fontWeight: 700, fontSize: '0.86rem', color: '#0f172a', marginTop: 2 }}>
                    {selectedRequest.callToAction}
                  </div>
                </div>
              </div>

              {/* Artwork Preview if already exists */}
              {selectedRequest.mediaUrl && (
                <div style={{ marginTop: 14 }}>
                  <label style={{ fontSize: '0.74rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>
                    Current Uploaded Artwork (Revision #{selectedRequest.revisionNumber})
                  </label>
                  <div style={{ marginTop: 6, borderRadius: 8, overflow: 'hidden', border: '1px solid #e2e8f0', maxHeight: 260, display: 'flex', justifyContent: 'center', background: '#0f172a' }}>
                    <img
                      src={selectedRequest.mediaUrl}
                      alt={selectedRequest.title}
                      style={{ maxHeight: 260, width: 'auto', objectFit: 'contain' }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="graphics-modal-footer">
              <button
                type="button"
                className="graphics-btn-secondary"
                onClick={() => setSelectedRequest(null)}
              >
                Close
              </button>

              {selectedRequest.isEligibleForUpload && (
                <button
                  type="button"
                  className="graphics-btn-primary"
                  onClick={() => {
                    const req = selectedRequest;
                    setSelectedRequest(null);
                    handleOpenUploadForRequest(req);
                  }}
                >
                  <UploadCloud size={14} />
                  <span>Upload Artwork for this Request</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

