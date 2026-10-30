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

  const [activeDesk, setActiveDesk] = useState(resolveDeskFromUrl);
  const [selectedRequestId, setSelectedRequestId] = useState(null);
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

  const navigateToDesk = (deskKey, requestId = null) => {
    setActiveDesk(deskKey);
    if (requestId) setSelectedRequestId(requestId);
    setMobileMenuOpen(false);

    let targetPath = '/graphics/post-requests';
    let targetHash = '#graphics/post-requests';

    if (deskKey === 'upload_post') {
      targetPath = '/graphics/upload-post';
      targetHash = '#graphics/upload-post';
    } else if (deskKey === 'approved_posts') {
      targetPath = '/graphics/approved-posts';
      targetHash = '#graphics/approved-posts';
    } else if (deskKey === 'rejected_posts') {
      targetPath = '/graphics/rejected-posts';
      targetHash = '#graphics/rejected-posts';
    } else if (deskKey === 'post_requests') {
      targetPath = '/graphics/post-requests';
      targetHash = '#graphics/post-requests';
    }

    try {
      window.history.pushState({}, '', targetPath);
      window.location.hash = targetHash;
    } catch (e) {}
  };

  const navItems = [
    {
      id: 'post_requests',
      label: 'Post Requests',
      sublabel: 'View all submitted briefs',
      icon: Inbox,
      badge: summary?.pendingUploads || null,
    },
    {
      id: 'upload_post',
      label: 'Upload Post',
      sublabel: 'Upload finished artwork',
      icon: UploadCloud,
      badge: null,
    },
    {
      id: 'approved_posts',
      label: 'Approved Posts',
      sublabel: 'Campaign-ready creatives',
      icon: CheckCircle2,
      badge: summary?.approvedCount || null,
      color: '#10b981',
    },
    {
      id: 'rejected_posts',
      label: 'Rejected Posts',
      sublabel: 'Revision & feedback queue',
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
        style={mobileMenuOpen ? { display: 'flex', position: 'fixed', zIndex: 100, width: '280px' } : undefined}
      >
        <div className="graphics-sidebar-brand">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #ec4899, #8b5cf6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              boxShadow: '0 4px 12px rgba(236,72,153,0.3)',
            }}>
              <Palette size={20} />
            </div>
            <div className="graphics-brand-text">
              <span className="graphics-brand-title">AdMafia Creative</span>
              <span className="graphics-brand-tag">Graphics Department</span>
            </div>
          </div>
        </div>

        {/* Live IST clock */}
        <div style={{
          padding: '10px 14px',
          margin: '0 16px 12px 16px',
          background: 'rgba(255,255,255,0.04)',
          borderRadius: 8,
          border: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.74rem',
          color: '#94a3b8',
        }}>
          <span>India Standard Time</span>
          <strong style={{ color: '#f1f5f9', fontFamily: 'monospace' }}>
            {liveClock.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
          </strong>
        </div>

        <nav className="graphics-sidebar-nav">
          <div style={{
            fontSize: '0.7rem',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: '#64748b',
            padding: '8px 16px 4px 16px',
            fontWeight: 700,
          }}>
            Creative Desks
          </div>

          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeDesk === item.id;
            return (
              <button
                type="button"
                key={item.id}
                className={`graphics-nav-item ${isActive ? 'active' : ''}`}
                onClick={() => navigateToDesk(item.id)}
              >
                <div className="graphics-nav-label">
                  <Icon size={18} />
                  <div>
                    <div>{item.label}</div>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 400 }}>{item.sublabel}</div>
                  </div>
                </div>
                {item.badge !== null && item.badge !== undefined && (
                  <span
                    className="graphics-nav-badge"
                    style={
                      item.urgent
                        ? { background: '#ef4444', color: '#ffffff', fontWeight: 800 }
                        : item.color
                        ? { background: 'rgba(16,185,129,0.2)', color: '#34d399' }
                        : undefined
                    }
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="graphics-sidebar-footer">
          {/* Quick link to Marketing Department */}
          <a
            href="/marketing"
            className="graphics-btn-footer"
            style={{ textDecoration: 'none', background: 'rgba(99, 102, 241, 0.12)', color: '#a5b4fc', border: '1px solid rgba(99, 102, 241, 0.25)' }}
          >
            <Sparkles size={15} />
            <span>Marketing Dept</span>
            <ArrowRight size={13} style={{ marginLeft: 'auto' }} />
          </a>

          <button
            type="button"
            className="graphics-btn-footer"
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
            className="graphics-btn-footer"
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

      {/* 2. Main Content Area */}
      <div className="graphics-main-area">
        {/* Top Header */}
        <header className="graphics-top-header">
          <button
            type="button"
            className="graphics-mobile-menu-btn"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          <div className="graphics-top-title">
            <span style={{ color: '#94a3b8' }}>Graphics Department /</span>{' '}
            <strong style={{ color: '#0f172a' }}>
              {activeDesk === 'post_requests' && 'Post Requests'}
              {activeDesk === 'upload_post' && 'Upload Finished Artwork'}
              {activeDesk === 'approved_posts' && 'Approved Posts Registry'}
              {activeDesk === 'rejected_posts' && 'Rejected Posts & Reupload Queue'}
            </strong>
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Logged in as <strong style={{ color: '#0f172a' }}>Senior Graphics Designer</strong>
            </span>
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

