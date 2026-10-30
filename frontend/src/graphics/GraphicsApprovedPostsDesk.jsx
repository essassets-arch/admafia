import React, { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2,
  Search,
  RefreshCw,
  Eye,
  Building,
  Image,
  Calendar,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  X,
  Layers,
  LayoutGrid,
  List,
} from 'lucide-react';
import Swal from 'sweetalert2';
import graphicsApi from '../services/graphicsApi';

export default function GraphicsApprovedPostsDesk({ onNavigateToDesk }) {
  const [approvedPosts, setApprovedPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table'
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 30, totalPages: 1 });

  // Fullscreen Preview Modal
  const [previewPost, setPreviewPost] = useState(null);

  const fetchApproved = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      const res = await graphicsApi.getApprovedPosts({
        search,
        page: pagination.page,
        limit: 30,
      });

      if (res && res.ok) {
        setApprovedPosts(res.approvedPosts || []);
        setPagination(res.pagination || { total: 0, page: 1, limit: 30, totalPages: 1 });
      }
    } catch (err) {
      console.error('[GraphicsApprovedPostsDesk] Error:', err);
      Swal.fire({
        icon: 'error',
        title: 'Failed to load approved posts',
        text: err.message,
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search, pagination.page]);

  useEffect(() => {
    fetchApproved();
  }, [fetchApproved]);

  return (
    <div>
      {/* 1. Page Header */}
      <div className="graphics-page-header">
        <div>
          <h1>Approved Creatives Registry</h1>
          <p>
            Portfolio of artwork verified and approved by Marketing quality auditors. Approved creative versions are immediately available for deployment into live Meta Ads campaigns.
          </p>
        </div>
        <div className="graphics-header-actions">
          <div style={{ display: 'flex', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 2 }}>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              style={{
                border: 'none',
                background: viewMode === 'grid' ? '#eef2ff' : 'transparent',
                color: viewMode === 'grid' ? '#4f46e5' : '#64748b',
                padding: '6px 10px',
                borderRadius: 6,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontWeight: 700,
                fontSize: '0.78rem',
              }}
            >
              <LayoutGrid size={13} />
              <span>Cards</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              style={{
                border: 'none',
                background: viewMode === 'table' ? '#eef2ff' : 'transparent',
                color: viewMode === 'table' ? '#4f46e5' : '#64748b',
                padding: '6px 10px',
                borderRadius: 6,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontWeight: 700,
                fontSize: '0.78rem',
              }}
            >
              <List size={13} />
              <span>Table</span>
            </button>
          </div>

          <button
            type="button"
            className="graphics-btn-refresh"
            onClick={() => fetchApproved(true)}
            disabled={refreshing}
          >
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
            <span>{refreshing ? 'Syncing...' : 'Live Sync'}</span>
          </button>
        </div>
      </div>

      {/* 2. Controls & Search */}
      <div className="graphics-controls-card">
        <div className="graphics-search-box">
          <Search size={16} className="graphics-search-icon" />
          <input
            type="text"
            className="graphics-search-input"
            placeholder="Search approved artwork by title, customer, caption..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* 3. Empty & Loading States */}
      {loading ? (
        <div className="graphics-table-card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#64748b' }}>
            <RefreshCw size={18} className="spin" />
            <span>Loading approved artwork portfolio...</span>
          </div>
        </div>
      ) : approvedPosts.length === 0 ? (
        <div className="graphics-table-card" style={{ padding: 48, textAlign: 'center', color: '#64748b' }}>
          <CheckCircle2 size={36} color="#cbd5e1" style={{ marginBottom: 8 }} />
          <h4 style={{ margin: '0 0 4px 0', color: '#0f172a' }}>No approved artwork yet</h4>
          <p style={{ margin: 0, fontSize: '0.84rem' }}>
            When Marketing approves your submitted artwork in the verification queue, it will appear here.
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        /* Visual Card Grid */
        <div className="graphics-art-grid">
          {approvedPosts.map((p) => (
            <div key={p.id} className="graphics-art-card">
              <div
                className="graphics-art-preview-wrap"
                style={{ cursor: 'pointer' }}
                onClick={() => setPreviewPost(p)}
                title="Click to zoom creative"
              >
                <img
                  src={p.mediaUrl}
                  alt={p.title}
                  className="graphics-art-img"
                />
                <div className="graphics-art-badge-overlay">
                  <span className="gfx-pill gfx-pill-emerald">
                    <CheckCircle2 size={11} /> Approved (Rev #{p.revisionNumber})
                  </span>
                </div>
                <div className="graphics-art-format-tag">
                  {p.creativeFormat}
                </div>
              </div>

              <div className="graphics-art-body">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div>
                    <strong style={{ fontSize: '0.94rem', color: '#0f172a' }}>{p.title}</strong>
                    <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: 2 }}>
                      {p.companyName} • {p.city || 'India'}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="graphics-footer-btn"
                    style={{ padding: '4px 8px', fontSize: '0.72rem' }}
                    onClick={() => setPreviewPost(p)}
                    title="Inspect Artwork"
                  >
                    <Eye size={12} />
                  </button>
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
                  }}
                >
                  {p.caption}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Table View */
        <div className="graphics-table-card">
          <table className="graphics-table">
            <thead>
              <tr>
                <th style={{ width: '12%' }}>Artwork</th>
                <th style={{ width: '22%' }}>Customer &amp; Post</th>
                <th style={{ width: '28%' }}>Caption &amp; Copy</th>
                <th style={{ width: '18%' }}>Auditor Decision</th>
                <th style={{ width: '20%', textAlign: 'right' }}>Campaign Readiness</th>
              </tr>
            </thead>
            <tbody>
              {approvedPosts.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div
                      style={{
                        width: 58,
                        height: 58,
                        borderRadius: 8,
                        overflow: 'hidden',
                        cursor: 'pointer',
                        background: '#0f172a',
                        border: '1px solid #e2e8f0',
                      }}
                      onClick={() => setPreviewPost(p)}
                    >
                      <img
                        src={p.mediaUrl}
                        alt={p.title}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    </div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 800, color: '#0f172a' }}>{p.title}</div>
                    <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: 2 }}>
                      {p.companyName}
                    </div>
                    <div style={{ marginTop: 4 }}>
                      <span className="gfx-pill gfx-pill-slate" style={{ fontSize: '0.66rem' }}>
                        Rev #{p.revisionNumber} • {p.creativeFormat}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div
                      style={{
                        fontSize: '0.78rem',
                        color: '#475569',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        lineHeight: 1.4,
                      }}
                    >
                      {p.caption}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <ShieldCheck size={14} color="#059669" />
                      <strong style={{ fontSize: '0.80rem', color: '#065f46' }}>{p.reviewerName}</strong>
                    </div>
                    <div style={{ fontSize: '0.70rem', color: '#64748b', marginTop: 2 }}>
                      {new Date(p.approvedAt).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </div>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <span className="gfx-pill gfx-pill-emerald">
                      Ready for Ad Campaigns
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 4. Fullscreen Zoom Modal */}
      {previewPost && (
        <div className="graphics-modal-backdrop" onClick={() => setPreviewPost(null)}>
          <div className="graphics-modal-card" style={{ maxWidth: 780 }} onClick={(e) => e.stopPropagation()}>
            <div className="graphics-modal-header">
              <div>
                <span className="graphics-brand-tag">Approved Artwork Preview (Rev #{previewPost.revisionNumber})</span>
                <h3 style={{ margin: '4px 0 0 0', fontSize: '1.2rem', fontWeight: 800 }}>
                  {previewPost.title}
                </h3>
              </div>
              <button
                type="button"
                className="graphics-footer-btn"
                style={{ padding: 6, borderRadius: '50%' }}
                onClick={() => setPreviewPost(null)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="graphics-modal-body" style={{ textAlign: 'center', background: '#0f172a', padding: 24 }}>
              <img
                src={previewPost.mediaUrl}
                alt={previewPost.title}
                style={{ maxHeight: 440, maxWidth: '100%', objectFit: 'contain', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}
              />
            </div>

            <div style={{ padding: '16px 22px', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong style={{ color: '#0f172a' }}>{previewPost.companyName}</strong>
                  <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                    Verified by {previewPost.reviewerName} ({previewPost.reviewerRole})
                  </div>
                </div>
                <a
                  href={previewPost.mediaUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="graphics-btn-secondary"
                  style={{ fontSize: '0.78rem' }}
                >
                  <ExternalLink size={12} />
                  <span>Open Full-Res Asset</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

