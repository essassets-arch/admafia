import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  HelpCircle,
  IndianRupee,
  RotateCcw,
  Wallet,
  ShieldAlert,
  UserPlus,
  LogOut,
  ExternalLink,
  Menu,
  X,
  ShieldCheck,
  RefreshCw,
  Bell,
  CheckCircle2,
  Clock,
  Sparkles,
  Palette,
  Briefcase,
  Globe,
  TrendingUp,
  Database,
} from 'lucide-react';

import SuperAdminDashboardDesk from './SuperAdminDashboardDesk';
import SuperAdminGrowthAnalyticsDesk from './SuperAdminGrowthAnalyticsDesk';
import SuperAdminDatabaseDesk from './SuperAdminDatabaseDesk';
import SuperAdminQueriesDesk from './SuperAdminQueriesDesk';
import SuperAdminFinanceDesk from './SuperAdminFinanceDesk';
import SuperAdminRefundsDesk from './SuperAdminRefundsDesk';
import SuperAdminTopupsDesk from './SuperAdminTopupsDesk';
import SuperAdminAccountsDesk from './SuperAdminAccountsDesk';
import SuperAdminAddUserDesk from './SuperAdminAddUserDesk';
import SuperAdminCountryPricingDesk from './SuperAdminCountryPricingDesk';

import superadminApi from '../services/superadminApi';
import adminAuthApi from '../services/adminAuthApi';
import NotificationBell from '../components/NotificationBell';
import './superadmin.css';

export default function SuperAdminLayout({ onSignOut, onBackToWebsite }) {
  const activeUser = adminAuthApi.getCurrentUser() || {
    fullName: 'Ad Mafia Executive Super Admin',
    role: 'Super Admin',
  };
  // Resolve active desk from URL pathname or hash
  const resolveDeskFromUrl = () => {
    try {
      const p = (window.location.pathname || '').toLowerCase();
      const h = (window.location.hash || '').toLowerCase();

      if (p.includes('/superadmin/growth-analytics') || h.includes('growth-analytics') || h.includes('growth_analytics')) return 'growth_analytics';
      if (p.includes('/superadmin/database-backups') || p.includes('/superadmin/database') || h.includes('database')) return 'database_backups';
      if (p.includes('/superadmin/queries') || h.includes('superadmin/queries') || h.includes('queries')) return 'queries';
      if (p.includes('/superadmin/finance') || h.includes('superadmin/finance') || h.includes('finance')) return 'finance';
      if (p.includes('/superadmin/refunds') || h.includes('superadmin/refunds') || h.includes('refunds')) return 'refunds';
      if (p.includes('/superadmin/topups') || h.includes('superadmin/topups') || h.includes('topups')) return 'topups';
      if (p.includes('/superadmin/accounts') || h.includes('superadmin/accounts') || h.includes('accounts')) return 'accounts';
      if (p.includes('/superadmin/country-pricing') || h.includes('country-pricing')) return 'country_pricing';
      if (p.includes('/superadmin/add-user') || p.includes('/superadmin/add_user') || h.includes('add-user') || h.includes('add_user')) return 'add_user';
      if (p.includes('/superadmin/dashboard') || h.includes('superadmin/dashboard') || h.includes('dashboard')) return 'dashboard';
      return 'dashboard';
    } catch (e) {
      return 'dashboard';
    }
  };

  const [activeDesk, setActiveDesk] = useState(resolveDeskFromUrl);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [summary, setSummary] = useState(null);
  const [liveClock, setLiveClock] = useState(() => new Date());
  const [syncing, setSyncing] = useState(false);

  // Live IST Clock
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
  const loadSummaryData = async () => {
    setSyncing(true);
    try {
      const res = await superadminApi.getDashboardSummary();
      if (res && res.ok) {
        setSummary(res.summary);
      }
    } catch (err) {
      console.error('[SuperAdminLayout] Summary load error:', err);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    loadSummaryData();
    const interval = setInterval(loadSummaryData, 30000); // 30s live refresh
    return () => clearInterval(interval);
  }, [activeDesk]);

  const navigateToDesk = (deskKey) => {
    setActiveDesk(deskKey);
    try {
      const newPath = `/superadmin/${deskKey.replace('_', '-')}`;
      window.history.pushState(null, '', newPath);
    } catch (e) {
      window.location.hash = `#/superadmin/${deskKey}`;
    }
    setMobileMenuOpen(false);
  };

  // Nav Items config
  const navItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      badge: null,
    },
    {
      id: 'growth_analytics',
      label: 'Growth & Churn Radar',
      icon: TrendingUp,
      badge: null,
    },
    {
      id: 'database_backups',
      label: 'DB Compass & Backups',
      icon: Database,
      badge: null,
    },
    {
      id: 'queries',
      label: 'Check Queries',
      icon: HelpCircle,
      badge: summary?.pendingQueries || 0,
      badgeType: 'warning',
    },
    {
      id: 'finance',
      label: 'Manage Finance',
      icon: IndianRupee,
      badge: null,
    },
    {
      id: 'refunds',
      label: 'Check Refunds',
      icon: RotateCcw,
      badge: summary?.pendingRefunds || 0,
      badgeType: 'danger',
    },
    {
      id: 'topups',
      label: 'Account Top-Up',
      icon: Wallet,
      badge: summary?.pendingTopups || 0,
      badgeType: 'info',
    },
    {
      id: 'accounts',
      label: 'Account Block / Activate',
      icon: ShieldAlert,
      badge: null,
    },
    {
      id: 'country_pricing',
      label: 'Country Pricing & IP',
      icon: Globe,
      badge: null,
    },
    {
      id: 'add_user',
      label: 'Add User / Business',
      icon: UserPlus,
      badge: null,
    },
  ];

  const getDeskTitle = () => {
    switch (activeDesk) {
      case 'dashboard':
        return { title: 'Super Admin Dashboard', subtitle: 'Live command center and operational metrics' };
      case 'growth_analytics':
        return { title: '10k-Scale Growth, Conversion Funnel & Churn Radar', subtitle: 'Onboarding drop-off funnel, WhatsApp close queue, low-runway alerts & security shield' };
      case 'database_backups':
        return { title: 'MongoDB Replica Set, Compass & Snapshot Vault', subtitle: 'Live DB telemetry, Compass SSH/local URIs, and AES-256 encrypted oplog backups' };
      case 'queries':
        return { title: 'Customer & Business Queries', subtitle: 'Support desk triage and administrative responses' };
      case 'finance':
        return { title: 'Financial Management & Ledger', subtitle: 'Authoritative account balances, transactions & reconciliation' };
      case 'refunds':
        return { title: 'Refund Requests Queue', subtitle: 'Review and approve customer wallet refund requests' };
      case 'topups':
        return { title: 'Account Top-Up & Deposits', subtitle: 'Bank UTR payment verification and wallet credits' };
      case 'accounts':
        return { title: 'Account Governance (Block / Activate)', subtitle: 'Business and system user status management with audit trails' };
      case 'country_pricing':
        return { title: 'Country Pricing & IP Geolocation Master', subtitle: 'Manage international daily budgets, local currencies, taxes and live IP detection' };
      case 'add_user':
        return { title: 'Add User / Business', subtitle: 'Provision enterprise businesses and assign staff roles' };
      default:
        return { title: 'Super Admin Control Center', subtitle: 'Platform Governance' };
    }
  };

  const currentMeta = getDeskTitle();

  return (
    <div className="sa-container">
      {/* SIDEBAR NAVIGATION */}
      <aside className={`sa-sidebar ${mobileMenuOpen ? 'open' : ''}`}>
        {/* Brand Header */}
        <div className="sa-sidebar-header">
          <div className="sa-brand-logo-wrap">
            <div className="sa-brand-badge">
              <ShieldCheck size={20} color="#ffffff" />
            </div>
            <div>
              <div className="sa-brand-title">Ad Mafia HQ</div>
              <div className="sa-brand-sub">Super Admin Control Center</div>
            </div>
          </div>
          <button
            type="button"
            className="sa-mobile-close-btn"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close Menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Live System Indicator */}
        <div className="sa-system-pill">
          <span className="sa-pulse-dot" />
          <span>MongoDB Authoritative</span>
        </div>

        {/* Main Navigation Desks */}
        <nav className="sa-nav-list">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeDesk === item.id;
            const hasBadge = typeof item.badge === 'number' && item.badge > 0;

            return (
              <button
                key={item.id}
                type="button"
                className={`sa-nav-item ${isActive ? 'active' : ''}`}
                onClick={() => navigateToDesk(item.id)}
              >
                <div className="sa-nav-item-left">
                  <Icon size={18} className="sa-nav-icon" />
                  <span className="sa-nav-label">{item.label}</span>
                </div>
                {hasBadge && (
                  <span className={`sa-nav-badge sa-badge-${item.badgeType}`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="sa-sidebar-footer">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 4 }}>
            <button
              type="button"
              className="sa-footer-link"
              style={{ fontSize: 11, padding: '7px 8px', justifyContent: 'center' }}
              onClick={() => (window.location.href = '/marketing')}
              title="Switch to Marketing Operations"
            >
              <Sparkles size={13} color="#a855f7" />
              <span>Marketing</span>
            </button>
            <button
              type="button"
              className="sa-footer-link"
              style={{ fontSize: 11, padding: '7px 8px', justifyContent: 'center' }}
              onClick={() => (window.location.href = '/graphics')}
              title="Switch to Graphics Creative Desk"
            >
              <Palette size={13} color="#ec4899" />
              <span>Graphics</span>
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <button
              type="button"
              className="sa-footer-link"
              style={{ fontSize: 11, padding: '7px 8px', justifyContent: 'center' }}
              onClick={() => (window.location.href = '/app/lead')}
              title="Open Customer Leads Portal"
            >
              <Briefcase size={13} color="#3b82f6" />
              <span>Leads CRM</span>
            </button>
            <button
              type="button"
              className="sa-footer-link"
              style={{ fontSize: 11, padding: '7px 8px', justifyContent: 'center' }}
              onClick={onBackToWebsite || (() => (window.location.href = '/'))}
              title="Ad Mafia Main Website"
            >
              <ExternalLink size={13} color="#10b981" />
              <span>Website</span>
            </button>
          </div>

          <button
            type="button"
            className="sa-footer-link sa-link-danger"
            style={{ marginTop: 4, justifyContent: 'center' }}
            onClick={onSignOut || (() => (window.location.href = '/login'))}
          >
            <LogOut size={14} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* MOBILE BACKDROP */}
      {mobileMenuOpen && (
        <div
          className="sa-mobile-backdrop"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* MAIN WRAPPER */}
      <div className="sa-main-wrap">
        {/* TOPBAR */}
        <header className="sa-topbar">
          <div className="sa-topbar-left">
            <button
              type="button"
              className="sa-hamburger-btn"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open Navigation"
            >
              <Menu size={20} />
            </button>

            <div className="sa-topbar-title-block">
              <h1>{currentMeta.title}</h1>
              <p className="sa-topbar-breadcrumb">
                Ad Mafia Super Admin &bull; <span>{currentMeta.subtitle}</span>
              </p>
            </div>
          </div>

          <div className="sa-topbar-right">
            {/* Live IST Clock */}
            <div className="sa-clock-pill">
              <Clock size={14} color="#64748b" />
              <span>
                {liveClock.toLocaleTimeString('en-IN', {
                  timeZone: 'Asia/Kolkata',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}{' '}
                IST
              </span>
            </div>

            {/* Live Refresh Button */}
            <button
              type="button"
              className="sa-icon-btn"
              onClick={loadSummaryData}
              title="Refresh Control Center Data"
            >
              <RefreshCw size={16} className={syncing ? 'sa-spin' : ''} />
            </button>

            {/* Real-Time FCM & SSE Notification Bell */}
            <NotificationBell variant="light" />

            {/* Super Admin User Profile Pill */}
            <div className="sa-admin-pill" title={`Logged in as ${activeUser.fullName || 'Super Admin'} (${activeUser.email || activeUser.username || ''})`}>
              <div className="sa-admin-avatar">
                {(activeUser.fullName || 'SA').slice(0, 2).toUpperCase()}
              </div>
              <div className="sa-admin-info">
                <div className="sa-admin-name">{activeUser.fullName || 'Super Admin'}</div>
                <div className="sa-admin-role">{activeUser.role || 'Platform Governor'}</div>
              </div>
            </div>
          </div>
        </header>

        {/* ACTIVE DESK VIEWPORT */}
        <main className="sa-content-area">
          {activeDesk === 'dashboard' && (
            <SuperAdminDashboardDesk onNavigate={navigateToDesk} onNavigateToDesk={navigateToDesk} />
          )}

          {activeDesk === 'growth_analytics' && (
            <SuperAdminGrowthAnalyticsDesk />
          )}

          {activeDesk === 'database_backups' && (
            <SuperAdminDatabaseDesk />
          )}

          {activeDesk === 'queries' && (
            <SuperAdminQueriesDesk />
          )}

          {activeDesk === 'finance' && (
            <SuperAdminFinanceDesk />
          )}

          {activeDesk === 'refunds' && (
            <SuperAdminRefundsDesk />
          )}

          {activeDesk === 'topups' && (
            <SuperAdminTopupsDesk />
          )}

          {activeDesk === 'accounts' && (
            <SuperAdminAccountsDesk />
          )}

          {activeDesk === 'country_pricing' && (
            <SuperAdminCountryPricingDesk />
          )}

          {activeDesk === 'add_user' && (
            <SuperAdminAddUserDesk />
          )}
        </main>
      </div>
    </div>
  );
}

