import React, { useState, useEffect } from 'react';
import {
  Inbox,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  LogOut,
  ExternalLink,
  Menu,
  X,
  Palette,
  Sparkles,
  ArrowRight,
  Paintbrush,
} from 'lucide-react';
import GraphicsPostRequestsDesk from './GraphicsPostRequestsDesk';
import GraphicsUploadPostDesk from './GraphicsUploadPostDesk';
import GraphicsApprovedPostsDesk from './GraphicsApprovedPostsDesk';
import GraphicsRejectedPostsDesk from './GraphicsRejectedPostsDesk';
import graphicsApi from '../services/graphicsApi';
import './graphics.css';

export default function GraphicsLayout({ onSignOut, onBackToWebsite }) {
  // Resolve active desk from URL pathname or hash
  const resolveDeskFromUrl = () => {
    try {
      const p = (window.location.pathname || '').toLowerCase();
      const h = (window.location.hash || '').toLowerCase();

      if (p.includes('/graphics/upload-post') || h.includes('upload-post') || h.includes('upload_post')) return 'upload_post';
      if (p.includes('/graphics/approved-posts') || h.includes('approved-posts') || h.includes('approved_posts')) return 'approved_posts';
      if (p.includes('/graphics/rejected-posts') || h.includes('rejected-posts') || h.includes('rejected_posts')) return 'rejected_posts';
      if (p.includes('/graphics/post-requests') || h.includes('post-requests') || h.includes('post_requests')) return 'post_requests';
      return 'post_requests';
    } catch (e) {
      return 'post_requests';
    }
  };

  const resolveRequestIdFromUrl = () => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const fromSearch = searchParams.get('requestId') || searchParams.get('id');
      if (fromSearch) return fromSearch;

      const hashParts = (window.location.hash || '').split('?');
      if (hashParts.length > 1) {
        const hashParams = new URLSearchParams(hashParts[1]);
        return hashParams.get('requestId') || hashParams.get('id');
      }
      return null;
    } catch (e) {
      return null;
    }
  };

  const normalizeDeskKey = (key) => {
    if (!key) return 'post_requests';
    const s = String(key).toLowerCase().replace(/[-/]/g, '_');
    if (s.includes('upload')) return 'upload_post';
    if (s.includes('approved')) return 'approved_posts';
    if (s.includes('rejected')) return 'rejected_posts';
    if (s.includes('post') || s.includes('request')) return 'post_requests';
    return 'post_requests';
  };

  const [activeDesk, setActiveDesk] = useState(resolveDeskFromUrl);
  const [selectedRequestId, setSelectedRequestId] = useState(resolveRequestIdFromUrl);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [summary, setSummary] = useState(null);
  const [liveClock, setLiveClock] = useState(() => new Date());

  // Real-time IST Clock
  useEffect(() => {
    const timer = setInterval(() => setLiveClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Sync hash/popstate
  useEffect(() => {
    const handleUrlChange = () => {
      setActiveDesk(resolveDeskFromUrl());
      const reqId = resolveRequestIdFromUrl();
      setSelectedRequestId(reqId || null);
    };
    window.addEventListener('popstate', handleUrlChange);
    window.addEventListener('hashchange', handleUrlChange);
    return () => {
      window.removeEventListener('popstate', handleUrlChange);
      window.removeEventListener('hashchange', handleUrlChange);
    };
  }, []);

  // Fetch summary badge counts
  useEffect(() => {
    async function loadSummary() {
      try {
        const res = await graphicsApi.getSummary();
        if (res && res.ok) {
          setSummary(res.summary);
        }
      } catch (err) {
        console.error('[GraphicsLayout] Summary error', err);
      }
    }
    loadSummary();
    const interval = setInterval(loadSummary, 30000);
    return () => clearInterval(interval);
  }, [activeDesk]);

  const navigateToDesk = (deskKey, requestData = null) => {
    const normalizedKey = normalizeDeskKey(deskKey);
    setActiveDesk(normalizedKey);

    const reqId = typeof requestData === 'object' && requestData !== null
      ? (requestData.initialRequestId || requestData.id || requestData.requestId || null)
      : (requestData || null);

    if (reqId) {
      setSelectedRequestId(reqId);
    }

    setMobileMenuOpen(false);

    let targetPath = '/graphics/post-requests';
    let targetHash = '#graphics/post-requests';

    if (normalizedKey === 'upload_post') {
      targetPath = reqId ? `/graphics/upload-post?requestId=${encodeURIComponent(reqId)}` : '/graphics/upload-post';
      targetHash = reqId ? `#graphics/upload-post?requestId=${encodeURIComponent(reqId)}` : '#graphics/upload-post';
    } else if (normalizedKey === 'approved_posts') {
      targetPath = '/graphics/approved-posts';
      targetHash = '#graphics/approved-posts';
    } else if (normalizedKey === 'rejected_posts') {
      targetPath = '/graphics/rejected-posts';
      targetHash = '#graphics/rejected-posts';
    } else {
      targetPath = '/graphics/post-requests';
      targetHash = '#graphics/post-requests';
    }

    try {
      if (window.location.hash && window.location.hash.toLowerCase().includes('graphics')) {
        window.location.hash = targetHash;
      } else {
        window.history.pushState({ desk: normalizedKey, requestId: reqId }, '', targetPath);
      }
    } catch (e) {}
  };

  const navItems = [
    {
      id: 'post_requests',
      label: 'Post Requests',
      path: '/graphics/post-requests',
      icon: Inbox,
      badge: summary?.pendingUploads || null,
    },
    {
      id: 'upload_post',
      label: 'Upload Post',
      path: '/graphics/upload-post',
      icon: UploadCloud,
      badge: null,
    },
    {
      id: 'approved_posts',
      label: 'Approved Posts',
      path: '/graphics/approved-posts',
      icon: CheckCircle2,
      badge: summary?.approvedCount || null,
      color: '#10b981',
    },
    {
      id: 'rejected_posts',
      label: 'Rejected Posts',
      path: '/graphics/rejected-posts',
      icon: AlertTriangle,
      badge: summary?.rejectedCount || null,
      urgent: (summary?.rejectedCount || 0) > 0,
    },
  ];

  return (
    <div className="graphics-layout-root">
      {/* 1. Sidebar */}
      <aside
        className={`graphics-sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}
      >
        <div className="graphics-sidebar-brand">
          <div className="graphics-brand-icon-box">
            <Palette size={20} />
          </div>
          <div className="graphics-brand-text">
            <span className="graphics-brand-title">AdMafia Creative</span>
            <span className="graphics-brand-tag">Graphics Department</span>
          </div>
        </div>

        {/* Live IST clock */}
        <div className="graphics-sidebar-clock-card">
          <span>India Standard Time</span>
          <strong>
            {liveClock.toLocaleTimeString('en-IN', {
              timeZone: 'Asia/Kolkata',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: true,
            })}
          </strong>
        </div>

        <nav className="graphics-sidebar-nav">
          <div className="graphics-nav-category-header">
            Creative Desks
          </div>

          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeDesk === item.id;
            return (
              <a
                key={item.id}
                href={item.path}
                className={`graphics-nav-item ${isActive ? 'active' : ''}`}
                onClick={(e) => {
                  e.preventDefault();
                  navigateToDesk(item.id);
                }}
              >
                <div className="graphics-nav-label-box">
                  <Icon size={18} className="graphics-nav-icon" />
                  <span className="graphics-nav-title">{item.label}</span>
                </div>
                {item.badge !== null && item.badge !== undefined && (
                  <span
                    className={`graphics-nav-badge ${item.urgent ? 'urgent' : ''} ${item.color ? 'emerald' : ''}`}
                  >
                    {item.badge}
                  </span>
                )}
              </a>
            );
          })}
        </nav>

        <div className="graphics-sidebar-footer">
          {/* Quick link to Marketing Department */}
          <a
            href="/marketing"
            className="graphics-footer-btn-highlight"
          >
            <Sparkles size={15} />
            <span>Marketing Dept</span>
            <ArrowRight size={13} style={{ marginLeft: 'auto' }} />
          </a>

          <button
            type="button"
            className="graphics-footer-btn"
            onClick={() => {
              if (onBackToWebsite) onBackToWebsite();
              else window.location.href = '/';
            }}
          >
            <ExternalLink size={15} />
            <span>AdMafia Website</span>
          </button>

          <button
            type="button"
            className="graphics-footer-btn logout"
            onClick={() => {
              if (onSignOut) onSignOut();
              else {
                window.location.hash = '';
                window.location.href = '/';
              }
            }}
          >
            <LogOut size={15} />
            <span>Exit Graphics</span>
          </button>
        </div>
      </aside>

      {/* 2. Main Workspace Wrap */}
      <div className="graphics-main-wrap">
        {/* Top Header */}
        <header className="graphics-top-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <button
              type="button"
              className="gfx-mobile-toggle-btn"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              title="Toggle Navigation Menu"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>

            <div className="graphics-breadcrumbs">
              <span className="graphics-bc-dept">Graphics Department</span>
              <span className="graphics-bc-sep">/</span>
              <strong className="graphics-bc-current">
                {activeDesk === 'post_requests' && 'Post Requests'}
                {activeDesk === 'upload_post' && 'Upload Finished Artwork'}
                {activeDesk === 'approved_posts' && 'Approved Posts Registry'}
                {activeDesk === 'rejected_posts' && 'Rejected Posts & Reupload Queue'}
              </strong>
            </div>
          </div>

          <div className="graphics-top-actions">
            <div className="graphics-live-pill">
              <span className="graphics-live-dot" />
              <span>PostgreSQL Live Sync</span>
            </div>

            <div className="graphics-clock-tag">
              {liveClock.toLocaleTimeString('en-IN', {
                timeZone: 'Asia/Kolkata',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: true,
              })} IST
            </div>

            <div className="graphics-user-profile">
              <div className="graphics-user-avatar">
                <Paintbrush size={16} />
              </div>
              <div className="graphics-user-meta">
                <span className="graphics-user-title">Senior Graphics Designer</span>
                <span className="graphics-user-dept">AdMafia Creative Production</span>
              </div>
            </div>
          </div>
        </header>

        {/* Content Body */}
        <main className="graphics-content-body">
          {activeDesk === 'post_requests' && (
            <GraphicsPostRequestsDesk
              onNavigateToDesk={(deskKey, reqId) => navigateToDesk(deskKey, reqId)}
            />
          )}

          {activeDesk === 'upload_post' && (
            <GraphicsUploadPostDesk
              initialRequestId={selectedRequestId}
              onNavigateToDesk={(deskKey) => navigateToDesk(deskKey)}
            />
          )}

          {activeDesk === 'approved_posts' && (
            <GraphicsApprovedPostsDesk
              onNavigateToDesk={(deskKey, reqId) => navigateToDesk(deskKey, reqId)}
            />
          )}

          {activeDesk === 'rejected_posts' && (
            <GraphicsRejectedPostsDesk
              onNavigateToDesk={(deskKey, reqId) => navigateToDesk(deskKey, reqId)}
            />
          )}
        </main>
      </div>
    </div>
  );
}
