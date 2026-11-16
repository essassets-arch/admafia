import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  Rocket,
  LogOut,
  ExternalLink,
  Menu,
  X,
} from 'lucide-react';
import MarketingCustomersDesk from './MarketingCustomersDesk';
import BuildIdeasDesk from './BuildIdeasDesk';
import CreatePostIdeasDesk from './CreatePostIdeasDesk';
import VerifyPostsDesk from './VerifyPostsDesk';
import CustomerMarketingControlDesk from './CustomerMarketingControlDesk';
import marketingApi from '../services/marketingApi';
import adminAuthApi from '../services/adminAuthApi';
import NotificationBell from '../components/NotificationBell';
import { useAdminTheme } from '../utils/adminTheme';
import AdminThemeToggle from '../components/AdminThemeToggle';
import './marketing.css';

const DESK_TO_STUDIO = {
  customer_marketing: 'campaigns_hub',
  customers: 'campaigns_hub',
  verify_posts: 'content_studio',
  create_posts: 'content_studio',
  build_ideas: 'content_studio',
};

const DEFAULT_STUDIO_SUBTAB = {
  campaigns_hub: 'customer_marketing',
  content_studio: 'verify_posts',
};

function normalizeMarketingDeskKey(rawKey) {
  if (!rawKey) return 'customer_marketing';
  const k = String(rawKey).trim().toLowerCase().replace(/-/g, '_');

  if (k === 'campaigns_hub' || k === 'overview') return 'customer_marketing';
  if (k === 'content_studio') return 'verify_posts';
  if (k === 'create_post_ideas' || k === 'create_post') return 'create_posts';

  if (Object.prototype.hasOwnProperty.call(DESK_TO_STUDIO, k)) {
    return k;
  }
  return 'customer_marketing';
}

function resolveDeskFromUrl() {
  try {
    const p = (window.location.pathname || '').toLowerCase();
    const h = (window.location.hash || '').toLowerCase();
    const combined = `${p} ${h}`;

    if (combined.includes('/marketing/customers') || combined.includes('#marketing/customers')) return 'customers';
    if (combined.includes('build-ideas') || combined.includes('build_ideas')) return 'build_ideas';
    if (combined.includes('create-post') || combined.includes('create_posts')) return 'create_posts';
    if (combined.includes('verify-posts') || combined.includes('verify_posts') || combined.includes('content-studio') || combined.includes('content_studio')) {
      return 'verify_posts';
    }
    if (combined.includes('customer-marketing') || combined.includes('customer_marketing') || combined.includes('campaigns-hub') || combined.includes('campaigns_hub')) {
      return 'customer_marketing';
    }
    return 'customer_marketing';
  } catch (e) {
    return 'customer_marketing';
  }
}

export default function MarketingLayout({ onSignOut, onBackToWebsite }) {
  const { theme } = useAdminTheme();
  const activeUser = adminAuthApi.getCurrentUser() || {
    fullName: 'Senior Marketing Director',
    role: 'Marketing Manager',
  };

  const [activeDesk, setActiveDesk] = useState(resolveDeskFromUrl);
  const [lastSubTabByStudio, setLastSubTabByStudio] = useState(() => {
    const initial = resolveDeskFromUrl();
    const initialStudio = DESK_TO_STUDIO[initial] || 'campaigns_hub';
    return {
      ...DEFAULT_STUDIO_SUBTAB,
      [initialStudio]: initial,
    };
  });
  const [targetCustomerId, setTargetCustomerId] = useState(null);
  const [targetIdeaId, setTargetIdeaId] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [summary, setSummary] = useState(null);
  const [liveClock, setLiveClock] = useState(() => new Date());

  const activeStudio = DESK_TO_STUDIO[activeDesk] || 'campaigns_hub';

  // Real-time IST Clock
  useEffect(() => {
    const timer = setInterval(() => setLiveClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Sync hash/popstate
  useEffect(() => {
    const handleUrlChange = () => {
      const nextDesk = resolveDeskFromUrl();
      const nextStudio = DESK_TO_STUDIO[nextDesk] || 'campaigns_hub';
      setActiveDesk(nextDesk);
      setLastSubTabByStudio((prev) => ({ ...prev, [nextStudio]: nextDesk }));
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
      const res = await marketingApi.getSummary();
      if (res && res.ok) {
        setSummary(res.summary);
      }
    } catch (err) {
      console.error('[MarketingLayout] Summary error', err);
    }
  }, []);

  useEffect(() => {
    loadSummary();
    const interval = setInterval(loadSummary, 30000);
    return () => clearInterval(interval);
  }, [activeDesk, loadSummary]);

  const navigateToDesk = (deskOrStudioKey, customerId = null, ideaId = null) => {
    const raw = String(deskOrStudioKey || '').trim().toLowerCase().replace(/-/g, '_');
    let nextDesk;

    if (Object.prototype.hasOwnProperty.call(DEFAULT_STUDIO_SUBTAB, raw)) {
      nextDesk = lastSubTabByStudio[raw] || DEFAULT_STUDIO_SUBTAB[raw];
    } else {
      nextDesk = normalizeMarketingDeskKey(raw);
    }

    const nextStudio = DESK_TO_STUDIO[nextDesk] || 'campaigns_hub';
    setActiveDesk(nextDesk);
    setLastSubTabByStudio((prev) => ({ ...prev, [nextStudio]: nextDesk }));
    setTargetCustomerId(customerId);
    setTargetIdeaId(ideaId);
    setMobileMenuOpen(false);

    let targetPath = '/marketing/customer-marketing';
    let targetHash = '#marketing/customer-marketing';

    if (nextDesk === 'customers') {
      targetPath = '/marketing/customers';
      targetHash = '#marketing/customers';
    } else if (nextDesk === 'build_ideas') {
      targetPath = '/marketing/build-ideas';
      targetHash = '#marketing/build-ideas';
    } else if (nextDesk === 'create_posts') {
      targetPath = '/marketing/create-post-ideas';
      targetHash = '#marketing/create-post-ideas';
    } else if (nextDesk === 'verify_posts') {
      targetPath = '/marketing/verify-posts';
      targetHash = '#marketing/verify-posts';
    }

    try {
      window.history.pushState({}, '', targetPath);
    } catch (e) {
      try {
        window.location.hash = targetHash;
      } catch (err) {}
    }
  };

  const navItems = [
    {
      id: 'campaigns_hub',
      label: 'Customers & Pacing Control',
      icon: Rocket,
      badge: summary?.activeCampaignsCount || null,
    },
    {
      id: 'content_studio',
      label: 'Content & Verification Studio',
      icon: ShieldCheck,
      badge: summary?.pendingVerificationPosts || null,
      urgent: (summary?.pendingVerificationPosts || 0) > 0,
    },
  ];

  const studioSubTabs = {
    campaigns_hub: [
      { id: 'customer_marketing', label: '🎯 Pacing & Campaign Control' },
      { id: 'customers', label: '🏢 Verified Client Directory' },
    ],
    content_studio: [
      {
        id: 'verify_posts',
        label: '✅ Verify Posts Queue',
        badge: summary?.pendingVerificationPosts || 0,
      },
      { id: 'create_posts', label: '🎨 Create & Assign Post' },
      { id: 'build_ideas', label: '💡 Idea Bank' },
    ],
  };

  const activeSubTabs = studioSubTabs[activeStudio] || [];
  const activeNavLabel = navItems.find((n) => n.id === activeStudio)?.label || 'Customers & Pacing Control';

  return (
    <div className="marketing-layout-root adm-theme-scope" data-admin-theme={theme}>
      {/* 1. Desktop & Mobile Sidebar */}
      <aside className={`marketing-sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <div className="marketing-sidebar-brand">
          <img src="/AdMafia-Logo.png" alt="Ad Mafia Marketing" className="marketing-sidebar-logo" />
          <div className="marketing-brand-text">
            <span className="marketing-brand-title">Ad Mafia CRM</span>
            <span className="marketing-brand-tag">Marketing Ops</span>
          </div>
          <button
            type="button"
            className="mkt-drawer-close-btn"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close Menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="marketing-sidebar-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeStudio === item.id;
            return (
              <button
                type="button"
                key={item.id}
                className={`marketing-nav-item ${isActive ? 'active' : ''}`}
                onClick={() => navigateToDesk(item.id)}
              >
                <div className="marketing-nav-label">
                  <Icon size={18} />
                  <span>{item.label}</span>
                </div>
                {item.badge !== null && item.badge !== undefined && item.badge > 0 && (
                  <span
                    className={`marketing-nav-badge ${item.urgent ? 'urgent' : ''}`.trim()}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="marketing-sidebar-footer">
          <button
            type="button"
            className="marketing-btn-logout"
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
            className="marketing-btn-logout"
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
          className="mkt-drawer-backdrop"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* 2. Main Workspace Wrap */}
      <div className="marketing-main-wrap">
        {/* Top Bar */}
        <header className="marketing-top-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            <button
              type="button"
              className="mkt-btn-table-action mkt-mobile-menu-btn"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle Menu"
            >
              {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
            <div className="marketing-breadcrumbs">
              <span>Marketing Department</span>
              <span>/</span>
              <strong>{activeNavLabel}</strong>
            </div>
          </div>

          <div className="marketing-top-actions">
            <AdminThemeToggle />
            <NotificationBell variant="light" adminThemeAware />
            <button
              type="button"
              className="mkt-topbar-logout-btn"
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
              <span className="mkt-topbar-logout-label">Logout</span>
            </button>
            <div className="marketing-clock-tag">
              {liveClock.toLocaleTimeString('en-IN', {
                timeZone: 'Asia/Kolkata',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: true,
              })} IST
            </div>
            <div
              className="mkt-user-pill"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'var(--adm-bg-subtle, #f8fafc)',
                border: '1px solid var(--adm-border, #e2e8f0)',
                padding: '5px 12px',
                borderRadius: 8,
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ec4899', flexShrink: 0 }} />
              <div style={{ textAlign: 'left', lineHeight: 1.2, minWidth: 0 }}>
                <div className="mkt-user-name" style={{ fontSize: 12, fontWeight: 700, color: 'var(--adm-text-primary, #0f172a)' }}>{activeUser.fullName}</div>
                <div className="mkt-user-role" style={{ fontSize: 10, fontWeight: 600, color: 'var(--adm-text-muted, #475569)' }}>{activeUser.role}</div>
              </div>
            </div>
          </div>
        </header>

        {/* Dynamic Page Views */}
        <main className="marketing-page-container">
          {activeSubTabs.length > 0 && (
            <div className="mkt-studio-subnav" role="tablist" aria-label={`${activeNavLabel} Views`}>
              {activeSubTabs.map((tab) => {
                const isTabActive = activeDesk === tab.id;
                const showTabBadge = typeof tab.badge === 'number' && tab.badge > 0;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isTabActive}
                    className={`mkt-studio-tab ${isTabActive ? 'active' : ''}`}
                    onClick={() => navigateToDesk(tab.id)}
                  >
                    <span>{tab.label}</span>
                    {showTabBadge && (
                      <span className="mkt-studio-tab-badge">{tab.badge}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {activeDesk === 'customer_marketing' && (
            <CustomerMarketingControlDesk onNavigateToDesk={navigateToDesk} />
          )}

          {activeDesk === 'customers' && (
            <MarketingCustomersDesk onNavigateToDesk={navigateToDesk} />
          )}

          {activeDesk === 'verify_posts' && (
            <VerifyPostsDesk onNavigateToDesk={navigateToDesk} />
          )}

          {activeDesk === 'create_posts' && (
            <CreatePostIdeasDesk
              initialCustomerId={targetCustomerId}
              initialIdeaId={targetIdeaId}
              onNavigateToDesk={navigateToDesk}
            />
          )}

          {activeDesk === 'build_ideas' && (
            <BuildIdeasDesk
              initialCustomerId={targetCustomerId}
              onNavigateToDesk={navigateToDesk}
            />
          )}
        </main>
      </div>
    </div>
  );
}
