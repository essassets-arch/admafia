import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Users,
  Lightbulb,
  FileCheck2,
  ShieldCheck,
  Rocket,
  LogOut,
  ExternalLink,
  Menu,
  X,
  Sparkles,
} from 'lucide-react';
import MarketingDashboard from './MarketingDashboard';
import MarketingCustomersDesk from './MarketingCustomersDesk';
import BuildIdeasDesk from './BuildIdeasDesk';
import CreatePostIdeasDesk from './CreatePostIdeasDesk';
import VerifyPostsDesk from './VerifyPostsDesk';
import CustomerMarketingControlDesk from './CustomerMarketingControlDesk';
import marketingApi from '../services/marketingApi';
import './marketing.css';

export default function MarketingLayout({ onSignOut, onBackToWebsite }) {
  // Resolve active desk from URL pathname or hash
  const resolveDeskFromUrl = () => {
    try {
      const p = (window.location.pathname || '').toLowerCase();
      const h = (window.location.hash || '').toLowerCase();

      if (p.includes('/marketing/customers') || h.includes('customers')) return 'customers';
      if (p.includes('/marketing/build-ideas') || h.includes('build-ideas') || h.includes('build_ideas')) return 'build_ideas';
      if (p.includes('/marketing/create-post-ideas') || h.includes('create-post') || h.includes('create_posts')) return 'create_posts';
      if (p.includes('/marketing/verify-posts') || h.includes('verify-posts') || h.includes('verify_posts')) return 'verify_posts';
      if (p.includes('/marketing/customer-marketing') || h.includes('customer-marketing') || h.includes('customer_marketing')) return 'customer_marketing';
      return 'overview';
    } catch (e) {
      return 'overview';
    }
  };

  const [activeDesk, setActiveDesk] = useState(resolveDeskFromUrl);
  const [targetCustomerId, setTargetCustomerId] = useState(null);
  const [targetIdeaId, setTargetIdeaId] = useState(null);
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
        const res = await marketingApi.getSummary();
        if (res && res.ok) {
          setSummary(res.summary);
        }
      } catch (err) {
        console.error('[MarketingLayout] Summary error', err);
      }
    }
    loadSummary();
    const interval = setInterval(loadSummary, 30000);
    return () => clearInterval(interval);
  }, [activeDesk]);

  const navigateToDesk = (deskKey, customerId = null, ideaId = null) => {
    setActiveDesk(deskKey);
    setTargetCustomerId(customerId);
    setTargetIdeaId(ideaId);
    setMobileMenuOpen(false);

    let targetPath = '/marketing';
    let targetHash = '#marketing/overview';

    if (deskKey === 'customers') {
      targetPath = '/marketing/customers';
      targetHash = '#marketing/customers';
    } else if (deskKey === 'build_ideas') {
      targetPath = '/marketing/build-ideas';
      targetHash = '#marketing/build-ideas';
    } else if (deskKey === 'create_posts') {
      targetPath = '/marketing/create-post-ideas';
      targetHash = '#marketing/create-post-ideas';
    } else if (deskKey === 'verify_posts') {
      targetPath = '/marketing/verify-posts';
      targetHash = '#marketing/verify-posts';
    } else if (deskKey === 'customer_marketing') {
      targetPath = '/marketing/customer-marketing';
      targetHash = '#marketing/customer-marketing';
    }

    try {
      window.history.pushState({}, '', targetPath);
      window.location.hash = targetHash;
    } catch (e) {}
  };

  const navItems = [
    { id: 'overview', label: 'Department Overview', icon: LayoutDashboard },
    {
      id: 'customers',
      label: 'Customer Registrations',
      icon: Users,
      badge: summary?.completedCustomersCount || null,
    },
    {
      id: 'build_ideas',
      label: 'Build Ideas',
      icon: Lightbulb,
      badge: summary?.totalIdeasCount || null,
    },
    {
      id: 'create_posts',
      label: 'Create Post Ideas',
      icon: FileCheck2,
      badge: summary?.totalPostsCount || null,
    },
    {
      id: 'verify_posts',
      label: 'Verify Posts',
      icon: ShieldCheck,
      badge: summary?.pendingVerificationPosts || null,
      urgent: (summary?.pendingVerificationPosts || 0) > 0,
    },
    {
      id: 'customer_marketing',
      label: 'Marketing Control',
      icon: Rocket,
      badge: summary?.activeCampaignsCount || null,
    },
  ];

  return (
    <div className="marketing-layout-root">
      {/* 1. Desktop & Mobile Sidebar */}
      <aside
        className={`marketing-sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}
        style={mobileMenuOpen ? { display: 'flex', position: 'fixed', zIndex: 100, width: '280px' } : undefined}
      >
        <div className="marketing-sidebar-brand">
          <img src="/AdMafia-Logo.png" alt="AdMafia Marketing" className="marketing-sidebar-logo" />
          <div className="marketing-brand-text">
            <span className="marketing-brand-title">AdMafia CRM</span>
            <span className="marketing-brand-tag">Marketing Ops</span>
          </div>
        </div>

        <nav className="marketing-sidebar-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeDesk === item.id;
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
                {item.badge !== null && item.badge !== undefined && (
                  <span
                    className="marketing-nav-badge"
                    style={item.urgent ? { background: '#f59e0b', color: '#ffffff' } : undefined}
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
            <span>AdMafia Website</span>
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
            <span>Exit Marketing Ops</span>
          </button>
        </div>
      </aside>

      {/* 2. Main Workspace Wrap */}
      <div className="marketing-main-wrap">
        {/* Top Bar */}
        <header className="marketing-top-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <button
              type="button"
              className="mkt-btn-table-action"
              style={{ display: window.innerWidth <= 900 ? 'inline-flex' : 'none' }}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
            <div className="marketing-breadcrumbs">
              <span>Marketing Department</span>
              <span>/</span>
              <strong>
                {navItems.find((n) => n.id === activeDesk)?.label || 'Overview'}
              </strong>
            </div>
          </div>

          <div className="marketing-top-actions">
            <div className="marketing-live-pill">
              <span className="marketing-live-dot" />
              <span>PostgreSQL Live Sync</span>
            </div>
            <div className="marketing-clock-tag">
              {liveClock.toLocaleTimeString('en-IN', {
                timeZone: 'Asia/Kolkata',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: true,
              })} IST
            </div>
          </div>
        </header>

        {/* Dynamic Page Views */}
        <main className="marketing-page-container">
          {activeDesk === 'overview' && (
            <MarketingDashboard onNavigateToDesk={navigateToDesk} />
          )}

          {activeDesk === 'customers' && (
            <MarketingCustomersDesk onNavigateToDesk={navigateToDesk} />
          )}

          {activeDesk === 'build_ideas' && (
            <BuildIdeasDesk
              initialCustomerId={targetCustomerId}
              onNavigateToDesk={navigateToDesk}
            />
          )}

          {activeDesk === 'create_posts' && (
            <CreatePostIdeasDesk
              initialCustomerId={targetCustomerId}
              initialIdeaId={targetIdeaId}
              onNavigateToDesk={navigateToDesk}
            />
          )}

          {activeDesk === 'verify_posts' && (
            <VerifyPostsDesk onNavigateToDesk={navigateToDesk} />
          )}

          {activeDesk === 'customer_marketing' && (
            <CustomerMarketingControlDesk onNavigateToDesk={navigateToDesk} />
          )}
        </main>
      </div>
    </div>
  );
}

