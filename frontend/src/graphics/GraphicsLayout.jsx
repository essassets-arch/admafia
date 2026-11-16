import React, { useState, useEffect, useCallback } from 'react';
import {
  Layers,
  CheckCircle2,
  LogOut,
  ExternalLink,
  Menu,
  X,
  Palette,
  Paintbrush,
} from 'lucide-react';
import GraphicsPostRequestsDesk from './GraphicsPostRequestsDesk';
import GraphicsUploadPostDesk from './GraphicsUploadPostDesk';
import GraphicsApprovedPostsDesk from './GraphicsApprovedPostsDesk';
import GraphicsRejectedPostsDesk from './GraphicsRejectedPostsDesk';
import graphicsApi from '../services/graphicsApi';
import adminAuthApi from '../services/adminAuthApi';
import NotificationBell from '../components/NotificationBell';
import { useAdminTheme } from '../utils/adminTheme';
import AdminThemeToggle from '../components/AdminThemeToggle';
import './graphics.css';

const DESK_TO_VIEW = {
  post_requests: 'studio_board',
  rejected_posts: 'studio_board',
  upload_post: 'studio_board',
  approved_posts: 'approved_posts',
};

function resolveDeskFromUrl() {
  try {
    const p = (window.location.pathname || '').toLowerCase();
    const h = (window.location.hash || '').toLowerCase();
    const combined = `${p} ${h}`;

    if (combined.includes('upload-post') || combined.includes('upload_post')) return 'upload_post';
    if (combined.includes('approved-posts') || combined.includes('approved_posts')) return 'approved_posts';
    if (combined.includes('rejected-posts') || combined.includes('rejected_posts')) return 'rejected_posts';
    if (combined.includes('post-requests') || combined.includes('post_requests') || combined.includes('studio-board') || combined.includes('studio_board')) {
      return 'post_requests';
    }
    return 'post_requests';
  } catch (e) {
    return 'post_requests';
  }
}

function resolveRequestIdFromUrl() {
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
}

function normalizeDeskKey(key) {
  if (!key) return 'post_requests';
  const s = String(key).toLowerCase().replace(/[-/]/g, '_');
  if (s.includes('upload')) return 'upload_post';
  if (s.includes('approved')) return 'approved_posts';
  if (s.includes('rejected')) return 'rejected_posts';
  if (s.includes('post') || s.includes('request')) return 'post_requests';
  return 'post_requests';
}

export default function GraphicsLayout({ onSignOut, onBackToWebsite }) {
  const { theme } = useAdminTheme();
  const activeUser = adminAuthApi.getCurrentUser() || {
    fullName: 'Lead Creative & Graphics Designer',
    role: 'Senior Graphics Designer',
  };

  const [activeDesk, setActiveDesk] = useState(resolveDeskFromUrl);
  const [lastBoardTab, setLastBoardTab] = useState(() => {
    const initial = resolveDeskFromUrl();
    return DESK_TO_VIEW[initial] === 'studio_board' ? initial : 'post_requests';
  });
  const [selectedRequestId, setSelectedRequestId] = useState(resolveRequestIdFromUrl);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [summary, setSummary] = useState(null);
  const [liveClock, setLiveClock] = useState(() => new Date());

  const activeView = DESK_TO_VIEW[activeDesk] || 'studio_board';

  // Single 1-second IST Clock (topbar only)
  useEffect(() => {
    const timer = setInterval(() => setLiveClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Sync hash/popstate
  useEffect(() => {
    const handleUrlChange = () => {
      const nextDesk = resolveDeskFromUrl();
      setActiveDesk(nextDesk);
      if (DESK_TO_VIEW[nextDesk] === 'studio_board') {
        setLastBoardTab(nextDesk);
      }
      const reqId = resolveRequestIdFromUrl();
      setSelectedRequestId(reqId || null);
      if (!reqId) setSelectedRequest(null);
    };
    window.addEventListener('popstate', handleUrlChange);
    window.addEventListener('hashchange', handleUrlChange);
    return () => {
      window.removeEventListener('popstate', handleUrlChange);
      window.removeEventListener('hashchange', handleUrlChange);
    };
  }, []);

  // Fetch summary badge counts
  const loadSummary = useCallback(async () => {
    try {
      const res = await graphicsApi.getSummary();
      if (res && res.ok) {
        setSummary(res.summary);
      }
    } catch (err) {
      console.error('[GraphicsLayout] Summary error', err);
    }
  }, []);

  useEffect(() => {
    loadSummary();
    const interval = setInterval(loadSummary, 30000);
    return () => clearInterval(interval);
  }, [activeDesk, loadSummary]);

  const navigateToDesk = (deskKey, requestData = null) => {
    const raw = String(deskKey || '').trim().toLowerCase().replace(/[-/]/g, '_');
    const normalizedKey =
      raw === 'studio_board' ? (lastBoardTab || 'post_requests') : normalizeDeskKey(raw);

    setActiveDesk(normalizedKey);
    if (DESK_TO_VIEW[normalizedKey] === 'studio_board') {
      setLastBoardTab(normalizedKey);
    }

    let reqId = null;
    if (typeof requestData === 'object' && requestData !== null) {
      reqId = requestData.initialRequestId || requestData.id || requestData.requestId || null;
      if (requestData.id) {
        setSelectedRequest(requestData);
      }
    } else if (requestData) {
      reqId = requestData;
      setSelectedRequest((prev) => (prev && String(prev.id) === String(requestData) ? prev : null));
    }

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
    }

    try {
      if (window.location.hash && window.location.hash.toLowerCase().includes('graphics')) {
        window.location.hash = targetHash;
      } else {
        window.history.pushState({ desk: normalizedKey, requestId: reqId }, '', targetPath);
      }
    } catch (e) {}
  };

  const studioBoardBadge = (summary?.pendingUploads || 0) + (summary?.rejectedCount || 0);

  const navItems = [
    {
      id: 'studio_board',
      label: 'Creative Studio Board',
      path: '/graphics/post-requests',
      icon: Layers,
      badge: studioBoardBadge > 0 ? studioBoardBadge : null,
      urgent: (summary?.rejectedCount || 0) > 0,
    },
    {
      id: 'approved_posts',
      label: 'Approved Portfolio',
      path: '/graphics/approved-posts',
      icon: CheckCircle2,
      badge: summary?.approvedCount > 0 ? summary.approvedCount : null,
      color: '#10b981',
    },
  ];

  const studioBoardTabs = [
    {
      id: 'post_requests',
      label: '📥 Post Requests',
      badge: summary?.pendingUploads || 0,
      urgent: false,
    },
    {
      id: 'rejected_posts',
      label: '🔄 Revisions & Rejected',
      badge: summary?.rejectedCount || 0,
      urgent: true,
    },
    {
      id: 'upload_post',
      label: '⬆️ Direct Upload',
      badge: 0,
      urgent: false,
    },
  ];

  return (
    <div className="graphics-layout-root adm-theme-scope" data-admin-theme={theme}>
      {/* 1. Sidebar */}
      <aside
        className={`graphics-sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}
      >
        <div className="graphics-sidebar-brand">
          <div className="graphics-brand-icon-box">
            <Palette size={20} />
          </div>
          <div className="graphics-brand-text">
            <span className="graphics-brand-title">Ad Mafia Creative</span>
            <span className="graphics-brand-tag">Graphics Department</span>
          </div>
          <button
            type="button"
            className="gfx-drawer-close-btn"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close Menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="graphics-sidebar-nav">
          <div className="graphics-nav-category-header">
            Creative Studios
          </div>

          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
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
                    className={`graphics-nav-badge ${item.urgent ? 'urgent' : ''} ${item.color ? 'emerald' : ''}`.trim()}
                  >
                    {item.badge}
                  </span>
                )}
              </a>
            );
          })}
        </nav>

        <div className="graphics-sidebar-footer">
          <button
            type="button"
            className="graphics-footer-btn"
            onClick={() => {
              if (onBackToWebsite) onBackToWebsite();
              else window.location.href = '/';
            }}
          >
            <ExternalLink size={15} />
            <span>Ad Mafia Website</span>
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
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {mobileMenuOpen && (
        <div
          className="gfx-drawer-backdrop"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* 2. Main Workspace Wrap */}
      <div className="graphics-main-wrap">
        {/* Top Header */}
        <header className="graphics-top-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
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
                {activeView === 'approved_posts' ? 'Approved Portfolio' : 'Creative Studio Board'}
              </strong>
            </div>
          </div>

          <div className="graphics-top-actions">
            <AdminThemeToggle />
            <NotificationBell variant="light" adminThemeAware />
            <button
              type="button"
              className="gfx-topbar-logout-btn"
              onClick={() => {
                if (onSignOut) onSignOut();
                else {
                  window.location.hash = '';
                  window.location.href = '/';
                }
              }}
              title="Sign Out"
              aria-label="Sign Out"
            >
              <LogOut size={16} />
              <span className="gfx-topbar-logout-label">Logout</span>
            </button>

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
                <span className="graphics-user-title">{activeUser.fullName || activeUser.name || 'Creative Designer'}</span>
                <span className="graphics-user-dept">{activeUser.role || 'Senior Graphics Designer'}</span>
              </div>
            </div>
          </div>
        </header>

        {/* Content Body */}
        <main className="graphics-content-body">
          {activeView === 'studio_board' && (
            <div className="gfx-studio-subnav" role="tablist" aria-label="Creative Studio Board Views">
              {studioBoardTabs.map((tab) => {
                const isTabActive = activeDesk === tab.id;
                const showTabBadge = typeof tab.badge === 'number' && tab.badge > 0;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isTabActive}
                    className={`gfx-studio-tab ${isTabActive ? 'active' : ''}`}
                    onClick={() => navigateToDesk(tab.id)}
                  >
                    <span>{tab.label}</span>
                    {showTabBadge && (
                      <span className={`gfx-studio-tab-badge ${tab.urgent ? 'urgent' : ''}`.trim()}>
                        {tab.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {activeDesk === 'post_requests' && (
            <GraphicsPostRequestsDesk
              onNavigateToDesk={(deskKey, reqData) => navigateToDesk(deskKey, reqData)}
            />
          )}

          {activeDesk === 'upload_post' && (
            <GraphicsUploadPostDesk
              initialRequestId={selectedRequestId}
              initialRequest={selectedRequest}
              onNavigateToDesk={(deskKey) => navigateToDesk(deskKey)}
              onSummaryRefresh={loadSummary}
            />
          )}

          {activeDesk === 'approved_posts' && (
            <GraphicsApprovedPostsDesk
              onNavigateToDesk={(deskKey, reqData) => navigateToDesk(deskKey, reqData)}
            />
          )}

          {activeDesk === 'rejected_posts' && (
            <GraphicsRejectedPostsDesk
              onNavigateToDesk={(deskKey, reqData) => navigateToDesk(deskKey, reqData)}
              onSummaryRefresh={loadSummary}
            />
          )}
        </main>
      </div>
    </div>
  );
}
