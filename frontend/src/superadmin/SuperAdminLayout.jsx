import React, { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard,
  HelpCircle,
  Wallet,
  Users,
  LogOut,
  ExternalLink,
  Menu,
  X,
  ShieldCheck,
  RefreshCw,
  Clock,
  Sparkles,
  Palette,
  Briefcase,
  Settings,
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
import AdminThemeToggle from '../components/AdminThemeToggle';
import { useAdminTheme } from '../utils/adminTheme';
import './superadmin.css';

const DESK_TO_HUB = {
  dashboard: 'command_center',
  growth_analytics: 'command_center',
  topups: 'finance_hub',
  refunds: 'finance_hub',
  finance: 'finance_hub',
  accounts: 'accounts_hub',
  add_user: 'accounts_hub',
  queries: 'queries',
  country_pricing: 'platform_system',
  database_backups: 'platform_system',
};

const DEFAULT_HUB_SUBTAB = {
  command_center: 'dashboard',
  finance_hub: 'topups',
  accounts_hub: 'accounts',
  queries: 'queries',
  platform_system: 'country_pricing',
};

function normalizeDeskKey(rawKey) {
  if (!rawKey) return 'dashboard';
  const k = String(rawKey).trim().toLowerCase().replace(/-/g, '_');

  if (k === 'command_center') return 'dashboard';
  if (k === 'finance_hub') return 'topups';
  if (k === 'accounts_hub' || k === 'accounts_users' || k === 'audit_logs') return 'accounts';
  if (k === 'platform_system') return 'country_pricing';
  if (k === 'database') return 'database_backups';

  if (Object.prototype.hasOwnProperty.call(DESK_TO_HUB, k)) {
    return k;
  }
  return 'dashboard';
}

function resolveDeskFromUrl() {
  try {
    const p = (window.location.pathname || '').toLowerCase();
    const h = (window.location.hash || '').toLowerCase();
    const combined = `${p} ${h}`;

    if (combined.includes('growth-analytics') || combined.includes('growth_analytics')) return 'growth_analytics';
    if (combined.includes('database-backups') || combined.includes('database_backups') || combined.includes('/database')) return 'database_backups';
    if (combined.includes('country-pricing') || combined.includes('country_pricing')) return 'country_pricing';
    if (combined.includes('platform-system') || combined.includes('platform_system')) return 'country_pricing';
    if (combined.includes('queries')) return 'queries';
    if (combined.includes('refunds')) return 'refunds';
    if (combined.includes('topups')) return 'topups';
    if (combined.includes('finance-hub') || combined.includes('finance_hub')) return 'topups';
    if (combined.includes('finance')) return 'finance';
    if (combined.includes('add-user') || combined.includes('add_user')) return 'add_user';
    if (combined.includes('accounts-hub') || combined.includes('accounts_hub') || combined.includes('accounts')) return 'accounts';
    if (combined.includes('command-center') || combined.includes('command_center') || combined.includes('dashboard')) return 'dashboard';
    return 'dashboard';
  } catch (e) {
    return 'dashboard';
  }
}

export default function SuperAdminLayout({ onSignOut, onBackToWebsite }) {
  const { theme } = useAdminTheme();
  const activeUser = adminAuthApi.getCurrentUser() || {
    fullName: 'Ad Mafia Executive Super Admin',
    role: 'Super Admin',
  };

  const [activeDesk, setActiveDesk] = useState(resolveDeskFromUrl);
  const [lastSubTabByHub, setLastSubTabByHub] = useState(() => {
    const initial = resolveDeskFromUrl();
    const initialHub = DESK_TO_HUB[initial] || 'command_center';
    return {
      ...DEFAULT_HUB_SUBTAB,
      [initialHub]: initial,
    };
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [summary, setSummary] = useState(null);
  const [liveClock, setLiveClock] = useState(() => new Date());
  const [syncing, setSyncing] = useState(false);

  const activeHub = DESK_TO_HUB[activeDesk] || 'command_center';

  // Live IST Clock
  useEffect(() => {
    const timer = setInterval(() => setLiveClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Sync hash/popstate
  useEffect(() => {
    const handleUrlChange = () => {
      const nextDesk = resolveDeskFromUrl();
      const nextHub = DESK_TO_HUB[nextDesk] || 'command_center';
      setActiveDesk(nextDesk);
      setLastSubTabByHub((prev) => ({ ...prev, [nextHub]: nextDesk }));
    };
    window.addEventListener('popstate', handleUrlChange);
    window.addEventListener('hashchange', handleUrlChange);
    return () => {
      window.removeEventListener('popstate', handleUrlChange);
      window.removeEventListener('hashchange', handleUrlChange);
    };
  }, []);

  // Fetch summary badge counts
  const loadSummaryData = useCallback(async () => {
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
    };
  }, []);

  useEffect(() => {
    loadSummaryData();
    const interval = setInterval(loadSummaryData, 30000); // 30s live refresh
    return () => clearInterval(interval);
  }, [activeDesk, loadSummaryData]);

  // Supports both hub keys ('finance_hub') and legacy desk keys ('refunds', 'accounts_users', etc.)
  const navigateToDesk = (keyOrHub) => {
    const raw = String(keyOrHub || '').trim().toLowerCase().replace(/-/g, '_');
    let nextDesk;

    if (Object.prototype.hasOwnProperty.call(DEFAULT_HUB_SUBTAB, raw)) {
      nextDesk = lastSubTabByHub[raw] || DEFAULT_HUB_SUBTAB[raw];
    } else {
      nextDesk = normalizeDeskKey(raw);
    }

    const nextHub = DESK_TO_HUB[nextDesk] || 'command_center';
    setActiveDesk(nextDesk);
    setLastSubTabByHub((prev) => ({ ...prev, [nextHub]: nextDesk }));

    try {
      const newPath = `/superadmin/${nextDesk.replace(/_/g, '-')}`;
      window.history.pushState(null, '', newPath);
    } catch (e) {
      window.location.hash = `#/superadmin/${nextDesk}`;
    }
    setMobileMenuOpen(false);
  };

  const pendingFinanceCount = (summary?.pendingTopups || 0) + (summary?.pendingRefunds || 0);
  const pendingQueriesCount = summary?.pendingQueries || 0;

  // 5 Grouped Hubs under crisp section labels (OVERVIEW, OPERATIONS, SYSTEM)
  const navSections = [
    {
      section: 'OVERVIEW',
      items: [
        {
          id: 'command_center',
          label: 'Command Center',
          icon: LayoutDashboard,
          badge: null,
        },
      ],
    },
    {
      section: 'OPERATIONS',
      items: [
        {
          id: 'finance_hub',
          label: 'Finance, Top-Ups & Refunds',
          icon: Wallet,
          badge: pendingFinanceCount,
          badgeType: (summary?.pendingRefunds || 0) > 0 ? 'danger' : 'info',
        },
        {
          id: 'accounts_hub',
          label: 'Accounts & Team Roster',
          icon: Users,
          badge: null,
        },
        {
          id: 'queries',
          label: 'Support Escalations',
          icon: HelpCircle,
          badge: pendingQueriesCount,
          badgeType: 'warning',
        },
      ],
    },
    {
      section: 'SYSTEM',
      items: [
        {
          id: 'platform_system',
          label: 'Platform & System',
          icon: Settings,
          badge: null,
        },
      ],
    },
  ];

  // Top Segmented Sub-Navigation per Hub
  const hubSubTabs = {
    command_center: [
      { id: 'dashboard', label: 'Executive Overview' },
      { id: 'growth_analytics', label: 'Growth & Churn Funnel' },
    ],
    finance_hub: [
      {
        id: 'topups',
        label: '💳 Account Top-Ups',
        badge: summary?.pendingTopups || 0,
        badgeTone: 'info',
      },
      {
        id: 'refunds',
        label: '↩️ Refunds Queue',
        badge: summary?.pendingRefunds || 0,
        badgeTone: 'danger',
      },
      { id: 'finance', label: '📊 Master Finance & Wallets' },
    ],
    accounts_hub: [
      { id: 'accounts', label: '🏢 Business & Client Accounts' },
      { id: 'add_user', label: '👤 Add User / Staff Roster' },
    ],
    platform_system: [
      { id: 'country_pricing', label: '🌍 Country Pricing & IP' },
      { id: 'database_backups', label: '🗄️ Database & Backups' },
    ],
  };

  const getDeskTitle = () => {
    switch (activeHub) {
      case 'command_center':
        return {
          title: 'Command Center',
          subtitle:
            activeDesk === 'growth_analytics'
              ? 'Conversion funnel, WhatsApp close queue & low-runway alerts'
              : 'Live executive overview & operational telemetry',
        };
      case 'finance_hub':
        return {
          title: 'Finance, Top-Ups & Refunds',
          subtitle:
            activeDesk === 'refunds'
              ? 'Review & approve customer wallet refund requests'
              : activeDesk === 'finance'
              ? 'Master wallet balances, transaction ledger & reconciliation'
              : 'Bank UTR verification & instant wallet credits',
        };
      case 'accounts_hub':
        return {
          title: 'Accounts & Team Roster',
          subtitle:
            activeDesk === 'add_user'
              ? 'Provision enterprise businesses & assign staff roles'
              : 'Business & client account governance with audit trails',
        };
      case 'queries':
        return {
          title: 'Support Escalations',
          subtitle: 'Customer & business support triage & administrative responses',
        };
      case 'platform_system':
        return {
          title: 'Platform & System',
          subtitle:
            activeDesk === 'database_backups'
              ? 'Database explorer, live telemetry & encrypted snapshot vault'
              : 'Global daily budgets, local currencies & geolocation rules',
        };
      default:
        return { title: 'Super Admin Control Center', subtitle: 'Platform Governance' };
    }
  };

  const currentMeta = getDeskTitle();
  const activeSubTabs = hubSubTabs[activeHub] || null;

  return (
    <div className="sa-container adm-theme-scope" data-admin-theme={theme}>
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

        {/* Grouped Navigation Hubs */}
        <nav className="sa-nav-list">
          {navSections.map((group) => (
            <div key={group.section} className="sa-nav-group">
              <div className="sa-nav-section-label">{group.section}</div>
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeHub === item.id;
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
            </div>
          ))}
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
              onClick={() => (window.location.href = '/sales')}
              title="Switch to Sales Operations Desk"
            >
              <Briefcase size={13} color="#3b82f6" />
              <span>Sales Desk</span>
            </button>
            <button
              type="button"
              className="sa-footer-link"
              style={{ fontSize: 11, padding: '7px 8px', justifyContent: 'center' }}
              onClick={onBackToWebsite || (() => (window.location.href = '/?site=1'))}
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
              <Clock size={14} color="var(--adm-text-muted, #64748b)" />
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

            {/* Synchronized White / Dark Theme Switcher */}
            <AdminThemeToggle />

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
            <NotificationBell variant="light" adminThemeAware />

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
          {activeSubTabs && (
            <div className="sa-hub-subnav" role="tablist" aria-label={`${currentMeta.title} Views`}>
              {activeSubTabs.map((tab) => {
                const isTabActive = activeDesk === tab.id;
                const showTabBadge = typeof tab.badge === 'number' && tab.badge > 0;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isTabActive}
                    className={`sa-hub-tab ${isTabActive ? 'active' : ''}`}
                    onClick={() => navigateToDesk(tab.id)}
                  >
                    <span>{tab.label}</span>
                    {showTabBadge && (
                      <span className={`sa-hub-tab-badge ${tab.badgeTone === 'info' ? 'info' : ''}`.trim()}>
                        {tab.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

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
