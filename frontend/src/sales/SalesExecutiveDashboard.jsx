import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  ShieldCheck,
  Layers,
  FileCheck2,
  CreditCard,
  Wallet,
  Headphones,
  Calendar,
  FolderTree,
  LogOut,
  ExternalLink,
  Plus,
  Shield,
  Sparkles,
  LayoutDashboard,
} from 'lucide-react';
import AllDesksOverviewDashboard from './AllDesksOverviewDashboard';
import {
  INITIAL_CUSTOMERS,
  INITIAL_REGISTERED_CUSTOMERS,
  INITIAL_PENDING_VERIFICATIONS,
  INITIAL_INVOICES,
  INITIAL_QUERIES,
  INITIAL_TASKS,
  INITIAL_GROUPS,
} from './operationalDesksData';
import {
  CustomerRegistrationsDesk,
  PendingVerificationDesk,
  LeadManagementDesk,
  ProfileCompletionDesk,
  PaymentCollectionDesk,
  WalletsBalancesDesk,
  QuerySupportDesk,
  FollowupTasksDesk,
  CustomerGroupsDesk,
} from './OperationalDesksViews';
import crmApi from '../services/crmApi';
import './sales.css';

// Storage keys for real-time sync with http://localhost:5173/#register
const STORAGE_CUSTOMERS = 'growthline_registered_customers';
const STORAGE_VERIFICATIONS = 'growthline_pending_verifications';

const loadStoredCustomers = () => {
  try {
    const raw = localStorage.getItem(STORAGE_CUSTOMERS);
    if (raw) {
      const stored = JSON.parse(raw);
      if (Array.isArray(stored)) return stored;
    }
    return [];
  } catch (err) {
    return [];
  }
};

const loadStoredVerifications = () => {
  try {
    const raw = localStorage.getItem(STORAGE_VERIFICATIONS);
    const stored = raw ? JSON.parse(raw) : [];
    return Array.isArray(stored) ? stored : [];
  } catch (err) {
    return [];
  }
};

export default function SalesExecutiveDashboard({ onSignOut, onBackToWebsite }) {
  // Navigation & URL Management: Unified 1-Page Dashboard + 9 Authorized Operational Desks
  // 'overview' | 'customers' | 'pending_verification' | 'leads' | 'profiles' | 'payments' | 'wallets' | 'queries' | 'tasks' | 'groups'
  const getDeskFromUrl = () => {
    try {
      const h = (window.location.hash || '').toLowerCase();
      const p = (window.location.pathname || '').toLowerCase();
      if (h.includes('verification') || p.includes('verification')) return 'pending_verification';
      if (h.includes('lead') || p.includes('lead')) return 'leads';
      if (h.includes('profile') || p.includes('profile')) return 'profiles';
      if (h.includes('payment') || p.includes('payment')) return 'payments';
      if (h.includes('wallet') || p.includes('wallet')) return 'wallets';
      if (h.includes('group') || p.includes('group') || h.includes('admin/support') || p.includes('/admin/support') || h.includes('admin') || p.includes('/admin')) return 'groups';
      if (h.includes('quer') || h.includes('support') || p.includes('quer') || p.includes('support')) return 'queries';
      if (h.includes('customer') || h.includes('registration')) return 'customers';
      if (h.includes('overview') || h.includes('dashboard') || h === '#overview' || h === '#dashboard' || h === '#sales' || h === '' || h === '#') return 'overview';
    } catch (e) {}
    return 'overview';
  };

  const [activeTab, setActiveTab] = useState(getDeskFromUrl);

  const navigateToDesk = (deskKey, targetHash) => {
    setActiveTab(deskKey);
    try {
      if (window.location.hash !== targetHash) {
        window.location.hash = targetHash;
      }
    } catch (e) {}
  };

  // Shared Authoritative State across Desks (synced with #register)
  const [customers, setCustomersState] = useState(loadStoredCustomers);
  const [verifications, setVerificationsState] = useState(loadStoredVerifications);
  const [invoices, setInvoices] = useState(INITIAL_INVOICES);
  const [queries, setQueries] = useState(INITIAL_QUERIES);
  const [tasks, setTasks] = useState(INITIAL_TASKS);
  const [newRegAlert, setNewRegAlert] = useState(null);

  // Wrapper to save customers persistently
  const setCustomers = useCallback((updater) => {
    setCustomersState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      try {
        localStorage.setItem(STORAGE_CUSTOMERS, JSON.stringify(next));
      } catch (e) {
        console.error('Storage error', e);
      }
      return next;
    });
  }, []);

  // Wrapper to save verifications persistently
  const setVerifications = useCallback((updater) => {
    setVerificationsState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      try {
        localStorage.setItem(STORAGE_VERIFICATIONS, JSON.stringify(next));
      } catch (e) {
        console.error('Storage error', e);
      }
      return next;
    });
  }, []);

  // Real-time synchronization when a customer registers at http://localhost:5173/#register or in PostgreSQL
  useEffect(() => {
    crmApi.syncStateFromPostgres().then((state) => {
      if (state) {
        if (Array.isArray(state.customers)) setCustomersState(state.customers);
        if (Array.isArray(state.verifications)) setVerificationsState(state.verifications);
      }
    });

    const handlePostgresSynced = (e) => {
      const state = e?.detail;
      if (state) {
        if (Array.isArray(state.customers)) setCustomersState(state.customers);
        if (Array.isArray(state.verifications)) setVerificationsState(state.verifications);
      }
    };

    const handleNewRegistration = (e) => {
      const newCust = e?.detail;
      setCustomersState(loadStoredCustomers());
      setVerificationsState(loadStoredVerifications());

      if (newCust) {
        setNewRegAlert(`🎉 New Customer Registered: "${newCust.name}" (+91 ${newCust.phone})! Added to Customer Registrations desk.`);
        setTimeout(() => setNewRegAlert(null), 6000);
      }
    };

    const handleStorageChange = (e) => {
      if (e.key === STORAGE_CUSTOMERS || e.key === STORAGE_VERIFICATIONS) {
        setCustomersState(loadStoredCustomers());
        setVerificationsState(loadStoredVerifications());
      }
    };

    const handleActiveUserSync = () => {
      setCustomersState(loadStoredCustomers());
      setVerificationsState(loadStoredVerifications());
    };

    const handleHashOrPopState = () => {
      const desk = getDeskFromUrl();
      setActiveTab(desk);
    };

    window.addEventListener('growthline_postgres_synced', handlePostgresSynced);
    window.addEventListener('growthline_customer_registered', handleNewRegistration);
    window.addEventListener('growthline_active_user_changed', handleActiveUserSync);
    window.addEventListener('growthline_payment_recorded', handleActiveUserSync);
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('hashchange', handleHashOrPopState);
    window.addEventListener('popstate', handleHashOrPopState);

    return () => {
      window.removeEventListener('growthline_postgres_synced', handlePostgresSynced);
      window.removeEventListener('growthline_customer_registered', handleNewRegistration);
      window.removeEventListener('growthline_active_user_changed', handleActiveUserSync);
      window.removeEventListener('growthline_payment_recorded', handleActiveUserSync);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('hashchange', handleHashOrPopState);
      window.removeEventListener('popstate', handleHashOrPopState);
    };
  }, []);

  // Dynamic Badge Calculations
  const pendingVerificationBadge = verifications.length;
  const lowWalletsCount = customers.filter(
    (c) => (c.balance || 0) < 1000 || (c.runwayDays || 0) <= 2
  ).length;
  const walletsBadge = lowWalletsCount;
  const todayTasksCount = tasks.filter(
    (t) => t.dueStatus === 'today' && t.status !== 'completed'
  ).length;
  const todayTasksBadge = todayTasksCount;

  // Cross-Desk Handlers: When payment approved in Desk 2, credit wallet
  const handleVerificationApprove = (approvedItem) => {
    setCustomers((prev) =>
      prev.map((c) => {
        if (c.id === approvedItem.customerId) {
          const newBal = (c.balance || 0) + (approvedItem.amount || 0);
          return {
            ...c,
            status: 'active',
            balance: newBal,
            runwayDays: Math.floor(newBal / 300),
            verified: true,
          };
        }
        return c;
      })
    );
  };

  return (
    <div className="sales-app-root">
      {/* Real-time Registration Notification Toast */}
      {newRegAlert && (
        <div
          style={{
            position: 'fixed',
            top: 16,
            right: 24,
            zIndex: 9999,
            background: '#0f172a',
            color: '#ffffff',
            padding: '12px 20px',
            borderRadius: 12,
            boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontSize: '0.86rem',
            fontWeight: 700,
            border: '1px solid #334155',
            animation: 'modal-pop-in 0.2s ease',
          }}
        >
          <Sparkles size={18} color="#f59e0b" />
          <span>{newRegAlert}</span>
          <button
            type="button"
            onClick={() => setNewRegAlert(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              fontWeight: 800,
              fontSize: '1rem',
              marginLeft: 8,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* 1. STICKY SIDEBAR NAVIGATION WITH 9 OPERATIONAL DESKS */}
      <aside className="sales-sidebar">
        <div className="sales-sidebar-top">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <img
              src="/AdMafia-Logo.png"
              alt="AdMafia Marketing"
              style={{
                height: 42,
                width: 'auto',
                objectFit: 'contain',
                borderRadius: 8,
                background: '#ffffff',
                padding: '3px 6px',
                border: '1px solid #e2e8f0',
              }}
            />
            <div>
              <div
                style={{
                  fontFamily: "'Bricolage Grotesque', system-ui",
                  fontWeight: 800,
                  fontSize: '1.1rem',
                  color: '#0f172a',
                  lineHeight: 1.1,
                }}
              >
                Ad<b>Mafia</b>
              </div>
              <div
                style={{
                  fontSize: '0.66rem',
                  fontWeight: 800,
                  color: '#4f46e5',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Operations &amp; Support Hub
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar Nav Items: The 9 Desks */}
        <nav className="sales-sidebar-menu">
          <div className="sales-nav-group-title">SUB ADMIN &amp; SUPPORT DESKS</div>

          {/* 0. Unified 1-Page Dashboard Overview */}
          <button
            type="button"
            className={`sales-nav-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => navigateToDesk('overview', '#dashboard')}
            style={{
              fontWeight: activeTab === 'overview' ? 800 : 600,
            }}
          >
            <LayoutDashboard size={18} strokeWidth={2.2} />
            <span>Dashboard Overview</span>
            <span
              className="sales-nav-badge"
              style={{
                background: activeTab === 'overview' ? 'rgba(255,255,255,0.25)' : '#eff6ff',
                color: activeTab === 'overview' ? '#ffffff' : '#1d4ed8',
                borderColor: '#bfdbfe',
                fontWeight: 800,
                fontSize: '0.68rem',
              }}
            >
              All 9 Desks
            </span>
          </button>

          <div style={{ height: 1, background: '#f1f5f9', margin: '6px 8px 8px 8px' }} />

          {/* 1. Customer Registrations */}
          <button
            type="button"
            className={`sales-nav-btn ${activeTab === 'customers' ? 'active' : ''}`}
            onClick={() => navigateToDesk('customers', '#customers')}
          >
            <Users size={18} strokeWidth={2.2} />
            <span>Customer Registrations</span>
          </button>

          {/* 2. Verification Audit */}
          <button
            type="button"
            className={`sales-nav-btn ${activeTab === 'pending_verification' ? 'active' : ''}`}
            onClick={() => navigateToDesk('pending_verification', '#verification')}
          >
            <ShieldCheck size={18} strokeWidth={2.2} />
            <span>Verification Audit</span>
            <span
              className="sales-nav-badge"
              style={{
                background: '#ecfdf5',
                color: '#059669',
                borderColor: '#a7f3d0',
                fontWeight: 800,
              }}
            >
              {pendingVerificationBadge}
            </span>
          </button>

          {/* 3. Lead Management */}
          <button
            type="button"
            className={`sales-nav-btn ${activeTab === 'leads' ? 'active' : ''}`}
            onClick={() => navigateToDesk('leads', '#leads')}
          >
            <Layers size={18} strokeWidth={2.2} />
            <span>Lead Management</span>
          </button>

          {/* 4. Profile Completion */}
          <button
            type="button"
            className={`sales-nav-btn ${activeTab === 'profiles' ? 'active' : ''}`}
            onClick={() => navigateToDesk('profiles', '#profiles')}
          >
            <FileCheck2 size={18} strokeWidth={2.2} />
            <span>Profile Completion</span>
          </button>

          {/* 5. Payment Collection */}
          <button
            type="button"
            className={`sales-nav-btn ${activeTab === 'payments' ? 'active' : ''}`}
            onClick={() => navigateToDesk('payments', '#payments')}
          >
            <CreditCard size={18} strokeWidth={2.2} />
            <span>Payment Collection</span>
          </button>

          {/* 6. Wallets & Balances (Badge: 33) */}
          <button
            type="button"
            className={`sales-nav-btn ${activeTab === 'wallets' ? 'active' : ''}`}
            onClick={() => navigateToDesk('wallets', '#wallets')}
          >
            <Wallet size={18} strokeWidth={2.2} />
            <span>Wallets &amp; Balances</span>
            <span
              className="sales-nav-badge"
              style={{
                background: '#eef2ff',
                color: '#4338ca',
                borderColor: '#c7d2fe',
                fontWeight: 800,
              }}
            >
              {walletsBadge}
            </span>
          </button>

          {/* 7. Query & Support */}
          <button
            type="button"
            className={`sales-nav-btn ${activeTab === 'queries' ? 'active' : ''}`}
            onClick={() => navigateToDesk('queries', '#queries')}
          >
            <Headphones size={18} strokeWidth={2.2} />
            <span>Query &amp; Support</span>
          </button>

          {/* 8. Customer Groups */}
          <button
            type="button"
            className={`sales-nav-btn ${activeTab === 'groups' ? 'active' : ''}`}
            onClick={() => navigateToDesk('groups', '#groups')}
          >
            <FolderTree size={18} strokeWidth={2.2} />
            <span>Customer Groups</span>
          </button>
        </nav>

        {/* Sidebar Footer */}
        <div className="sales-sidebar-footer">
          <div className="sales-rep-card">
            <div className="sales-rep-avatar">VS</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="sales-rep-name">Vikram Shah</div>
              <div className="sales-rep-role">Operations Specialist</div>
            </div>
            <button
              type="button"
              className="sales-logout-icon"
              title="Sign Out"
              onClick={onSignOut}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* 2. MAIN OPERATIONS VIEWPORT (100% Full Width) */}
      <main className="sales-main-viewport">
        {/* Top Operational Bar */}
        <header className="sales-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span className="sales-status-badge">
              <span className="sales-pulse-dot" />
              Active Operations Desk
            </span>
            <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
              Platform Ad Engine: <b>₹300/day</b> • <b>{customers.length} Billing Accounts</b>
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              className="sales-btn-secondary"
              onClick={onBackToWebsite}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              Website <ExternalLink size={13} />
            </button>
          </div>
        </header>

        {/* Operational Desks Rendering */}
        <div className="sales-content-scroll">
          {activeTab === 'overview' && (
            <AllDesksOverviewDashboard
              customers={customers}
              setCustomers={setCustomers}
              verifications={verifications}
              setVerifications={setVerifications}
              invoices={invoices}
              setInvoices={setInvoices}
              queries={queries}
              setQueries={setQueries}
              tasks={tasks}
              setTasks={setTasks}
              groups={INITIAL_GROUPS}
              navigateToDesk={navigateToDesk}
            />
          )}

          {activeTab === 'customers' && (
            <CustomerRegistrationsDesk
              customers={customers}
              setCustomers={setCustomers}
            />
          )}

          {activeTab === 'pending_verification' && (
            <PendingVerificationDesk
              verifications={verifications}
              setVerifications={setVerifications}
              onApproveSuccess={handleVerificationApprove}
              customers={customers}
            />
          )}

          {activeTab === 'leads' && <LeadManagementDesk />}

          {activeTab === 'profiles' && (
            <ProfileCompletionDesk
              customers={customers}
              setCustomers={setCustomers}
            />
          )}

          {activeTab === 'payments' && (
            <PaymentCollectionDesk
              invoices={invoices}
              setInvoices={setInvoices}
              customers={customers}
              setCustomers={setCustomers}
              verifications={verifications}
            />
          )}

          {activeTab === 'wallets' && (
            <WalletsBalancesDesk
              customers={customers}
              setCustomers={setCustomers}
            />
          )}

          {activeTab === 'queries' && (
            <QuerySupportDesk
              queries={queries}
              setQueries={setQueries}
            />
          )}

          {activeTab === 'tasks' && (
            <FollowupTasksDesk
              tasks={tasks}
              setTasks={setTasks}
            />
          )}

          {activeTab === 'groups' && (
            <CustomerGroupsDesk
              groups={INITIAL_GROUPS}
              customers={customers}
            />
          )}
        </div>
      </main>
    </div>
  );
}
