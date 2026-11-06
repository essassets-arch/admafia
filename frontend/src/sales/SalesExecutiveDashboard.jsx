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
  Clock,
  UserCheck,
  AlertCircle,
  Receipt,
  Scale,
  Menu,
  X,
} from 'lucide-react';
import AllDesksOverviewDashboard from './AllDesksOverviewDashboard';
import BalanceLogsDesk from './BalanceLogsDesk';
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
  ApprovedMembersDesk,
  LeadManagementDesk,
  ProfileCompletionDesk,
  PaymentCollectionDesk,
  WalletsBalancesDesk,
  QuerySupportDesk,
  FollowupTasksDesk,
  CustomerGroupsDesk,
  FailedTransactionsDesk,
  MasterTransactionLogsDesk,
} from './OperationalDesksViews';
import crmApi from '../services/crmApi';
import adminAuthApi from '../services/adminAuthApi';
import './sales.css';

// Storage keys for real-time sync with http://localhost:5173/#register
const STORAGE_CUSTOMERS = 'growthline_registered_customers';
const STORAGE_VERIFICATIONS = 'growthline_pending_verifications';

const sanitizeCustomer = (c) => {
  if (!c) return c;
  const isGeneric = (str) =>
    !str ||
    str.trim().toLowerCase() === 'registered business' ||
    str.trim().toLowerCase() === 'corporate workspace' ||
    str.trim().toLowerCase() === 'workspace' ||
    str.trim().toLowerCase() === 'user' ||
    str.trim().toLowerCase() === 'account admin' ||
    str.trim().toLowerCase() === 'client member';

  const cleanU = (c.username || '').replace(/^@/, '').trim();
  const capU = cleanU ? cleanU.charAt(0).toUpperCase() + cleanU.slice(1) : null;
  const cleanPhone = String(c.phone || '').replace(/\D/g, '').slice(-10);
  const fallback = capU || (cleanPhone ? 'Customer ' + cleanPhone.slice(-4) : 'Client Account');

  const resolvedComp = !isGeneric(c.companyName) ? c.companyName : (!isGeneric(c.name) ? c.name : fallback);
  const resolvedContact = !isGeneric(c.contactPerson) ? c.contactPerson : (!isGeneric(c.contact) ? c.contact : fallback);

  return {
    ...c,
    companyName: resolvedComp,
    name: resolvedComp,
    contactPerson: resolvedContact,
    contact: resolvedContact,
    username: cleanU,
  };
};

const sanitizeVerification = (v) => {
  if (!v) return v;
  const isGeneric = (str) =>
    !str ||
    str.trim().toLowerCase() === 'registered business' ||
    str.trim().toLowerCase() === 'corporate workspace';
  const cleanPhone = String(v.phone || '').replace(/\D/g, '').slice(-10);
  const cleanUser = (v.username || '').replace(/^@/, '').trim();
  const capUser = cleanUser ? cleanUser.charAt(0).toUpperCase() + cleanUser.slice(1) : null;
  const fallback = capUser || (cleanPhone ? 'Customer ' + cleanPhone.slice(-4) : 'Client Account');

  const resolvedComp = !isGeneric(v.company) ? v.company : fallback;
  const resolvedContact = !isGeneric(v.contact) ? v.contact : fallback;

  return {
    ...v,
    company: resolvedComp,
    contact: resolvedContact,
  };
};

const loadStoredCustomers = () => {
  try {
    const raw = localStorage.getItem(STORAGE_CUSTOMERS);
    if (raw) {
      const stored = JSON.parse(raw);
      if (Array.isArray(stored)) return stored.map(sanitizeCustomer);
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
    return Array.isArray(stored) ? stored.map(sanitizeVerification) : [];
  } catch (err) {
    return [];
  }
};

export default function SalesExecutiveDashboard({ onSignOut, onBackToWebsite }) {
  const activeUser = adminAuthApi.getCurrentUser() || {
    fullName: 'Principal Sales & Accounts Executive',
    role: 'Sales Executive',
  };
  // Navigation & URL Management: Unified 1-Page Dashboard + 9 Authorized Operational Desks
  // 'overview' | 'customers' | 'pending_verification' | 'leads' | 'profiles' | 'payments' | 'wallets' | 'queries' | 'tasks' | 'groups'
  const getDeskFromUrl = () => {
    try {
      const h = (window.location.hash || '').toLowerCase();
      const p = (window.location.pathname || '').toLowerCase();
      if (h.includes('balance') || p.includes('balance')) return 'balance_logs';
      if (h.includes('transaction') || p.includes('transaction') || h.includes('log') || p.includes('log')) return 'transactions';
      if (h.includes('approved') || h.includes('member')) return 'approved';
      if (h.includes('verification') || p.includes('verification')) return 'pending_verification';
      if (h.includes('lead') || p.includes('lead')) return 'leads';
      if (h.includes('profile') || p.includes('profile')) return 'profiles';
      if (h.includes('payment') || p.includes('payment')) return 'payments';
      if (h.includes('fail') || p.includes('fail')) return 'failed_transactions';
      if (h.includes('wallet') || p.includes('wallet')) return 'wallets';
      if (h.includes('group') || p.includes('group') || h.includes('admin/support') || p.includes('/admin/support') || h.includes('admin') || p.includes('/admin')) return 'groups';
      if (h.includes('quer') || h.includes('support') || p.includes('quer') || p.includes('support')) return 'queries';
      if (h.includes('customer') || h.includes('registration')) return 'customers';
      if (h.includes('overview') || h.includes('dashboard') || h === '#overview' || h === '#dashboard' || h === '#sales' || h === '' || h === '#') return 'overview';
    } catch (e) {}
    return 'overview';
  };

  const [activeTab, setActiveTab] = useState(getDeskFromUrl);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [failedTxCount, setFailedTxCount] = useState(0);
  const [balanceLogsCount, setBalanceLogsCount] = useState(() => {
    try {
      const raw = localStorage.getItem('growthline_balance_logs');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.length;
      }
    } catch (_) {}
    return 0;
  });

  const updateBalanceLogsCount = React.useCallback(async () => {
    try {
      const res = await crmApi.getBalanceLogs();
      if (res && res.ok && Array.isArray(res.logs)) {
        setBalanceLogsCount(res.logs.length);
        try {
          localStorage.setItem('growthline_balance_logs', JSON.stringify(res.logs));
        } catch (_) {}
      }
    } catch (_) {}
  }, []);

  const updateFailedCount = React.useCallback(async () => {
    try {
      const res = await crmApi.getFailedTransactions();
      if (res && res.ok && Array.isArray(res.failedTransactions)) {
        setFailedTxCount(res.failedTransactions.length);
        try {
          localStorage.setItem('growthline_failed_transactions', JSON.stringify(res.failedTransactions));
        } catch (e) {}
        return;
      }
    } catch (e) {}

    try {
      const raw = localStorage.getItem('growthline_failed_transactions');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setFailedTxCount(parsed.length);
        }
      }
    } catch (e) {}
  }, []);

  useEffect(() => {
    updateFailedCount();
    updateBalanceLogsCount();
  }, [updateFailedCount, updateBalanceLogsCount, activeTab]);

  const navigateToDesk = (deskKey, targetHash) => {
    setActiveTab(deskKey);
    setIsMobileDrawerOpen(false);
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
  const [allTransactions, setAllTransactions] = useState(() => {
    try {
      const raw = localStorage.getItem('growthline_all_transactions');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.filter((t) => !String(t.id).startsWith('tx_reg_') && !String(t.ref).startsWith('PAY-REG-'));
        }
      }
    } catch (e) {}
    return [];
  });
  const [queries, setQueries] = useState(() => {
    try {
      const raw = localStorage.getItem('growthline_support_queries');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return INITIAL_QUERIES;
  });
  const [tasks, setTasks] = useState(INITIAL_TASKS);
  const [newRegAlert, setNewRegAlert] = useState(null);
  const [liveNow, setLiveNow] = useState(() => new Date());

  // Real-time 1-second clock updater
  useEffect(() => {
    const timer = setInterval(() => setLiveNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Wrapper to save customers persistently
  const setCustomers = useCallback((updater) => {
    setCustomersState((prev) => {
      const rawNext = typeof updater === 'function' ? updater(prev) : updater;
      const next = Array.isArray(rawNext) ? rawNext.map(sanitizeCustomer) : rawNext;
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
        if (Array.isArray(state.customers)) {
          const sanitized = state.customers.map(sanitizeCustomer);
          setCustomersState(sanitized);
          try { localStorage.setItem(STORAGE_CUSTOMERS, JSON.stringify(sanitized)); } catch (_) {}
        }
        if (Array.isArray(state.verifications)) {
          const sanitizedV = state.verifications.map(sanitizeVerification);
          setVerificationsState(sanitizedV);
          try { localStorage.setItem(STORAGE_VERIFICATIONS, JSON.stringify(sanitizedV)); } catch (_) {}
        }
        if (Array.isArray(state.payments)) setInvoices(state.payments);
        if (Array.isArray(state.queries)) setQueries(state.queries);
        if (Array.isArray(state.failedTransactions)) setFailedTxCount(state.failedTransactions.length);
        if (Array.isArray(state.allTransactions)) {
          const clean = state.allTransactions.filter((t) => !String(t.id).startsWith('tx_reg_') && !String(t.ref).startsWith('PAY-REG-'));
          setAllTransactions(clean);
          try { localStorage.setItem('growthline_all_transactions', JSON.stringify(clean)); } catch (_) {}
        }
      }
    });

    const handlePostgresSynced = (e) => {
      const state = e?.detail;
      if (state) {
        if (Array.isArray(state.customers)) setCustomersState(state.customers);
        if (Array.isArray(state.verifications)) setVerificationsState(state.verifications);
        if (Array.isArray(state.payments)) setInvoices(state.payments);
        if (Array.isArray(state.queries)) setQueries(state.queries);
        if (Array.isArray(state.failedTransactions)) setFailedTxCount(state.failedTransactions.length);
        if (Array.isArray(state.allTransactions)) {
          const clean = state.allTransactions.filter((t) => !String(t.id).startsWith('tx_reg_') && !String(t.ref).startsWith('PAY-REG-'));
          setAllTransactions(clean);
        }
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
      setIsMobileDrawerOpen(false);
    };

    window.addEventListener('growthline_postgres_synced', handlePostgresSynced);
    window.addEventListener('growthline_failed_tx_updated', updateFailedCount);
    window.addEventListener('growthline_customer_registered', handleNewRegistration);
    window.addEventListener('growthline_active_user_changed', handleActiveUserSync);
    window.addEventListener('growthline_payment_recorded', handleActiveUserSync);
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('hashchange', handleHashOrPopState);
    window.addEventListener('popstate', handleHashOrPopState);

    return () => {
      window.removeEventListener('growthline_postgres_synced', handlePostgresSynced);
      window.removeEventListener('growthline_failed_tx_updated', updateFailedCount);
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
  const approvedMembersList = customers.filter((c) => {
    const isPaymentDone =
      c.paymentStatus === 'paid' ||
      c.payment_status === 'paid' ||
      Number(c.amountPaid || 0) > 0 ||
      Number(c.balance || c.walletBalance || 0) > 0;
    const isProfileDone =
      c.profileStatus === 'complete' ||
      c.profile_status === 'complete' ||
      Number(c.kycPercent || c.kyc_percent || 0) >= 100;
    return (isPaymentDone && isProfileDone) || c.verified === true;
  });
  const approvedMembersBadge = approvedMembersList.length;
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

      {/* MOBILE RESPONSIVE TOP BAR (Visible on mobile/tablet viewports) */}
      <header className="sales-mobile-top-bar">
        <button
          type="button"
          className="sales-btn-hamburger"
          onClick={() => setIsMobileDrawerOpen(true)}
          aria-label="Open Navigation Menu"
        >
          <Menu size={22} />
        </button>
        <div className="sales-mobile-brand">
          <img
            src="/AdMafia-Logo.png"
            alt="AdMafia"
            style={{
              height: 32,
              width: 'auto',
              objectFit: 'contain',
              borderRadius: 6,
              background: '#ffffff',
              padding: '2px 4px',
              border: '1px solid #e2e8f0',
            }}
          />
          <div className="sales-mobile-brand-text">
            <span>Ad<b>Mafia</b></span>
            <span className="sales-ops-mini-badge">OPS</span>
          </div>
        </div>
        <div className="sales-mobile-active-desk">
          <span className="desk-pill pill-indigo" style={{ fontSize: '0.70rem', fontWeight: 800, textTransform: 'uppercase' }}>
            {activeTab.replace('_', ' ')}
          </span>
        </div>
      </header>

      {/* Mobile Drawer Backdrop */}
      {isMobileDrawerOpen && (
        <div
          className="sales-mobile-backdrop"
          onClick={() => setIsMobileDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* 1. STICKY SIDEBAR NAVIGATION WITH 9 OPERATIONAL DESKS */}
      <aside className={`sales-sidebar ${isMobileDrawerOpen ? 'mobile-open' : ''}`}>
        <div className="sales-sidebar-top">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
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

            {/* Mobile Drawer Close Button */}
            <button
              type="button"
              className="sales-mobile-drawer-close"
              onClick={() => setIsMobileDrawerOpen(false)}
              aria-label="Close Navigation Menu"
            >
              <X size={20} />
            </button>
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
            <LayoutDashboard size={18} strokeWidth={2.2} style={{ flexShrink: 0 }} />
            <span>Dashboard Overview</span>
            <span
              className="sales-nav-badge"
              style={{
                background: activeTab === 'overview' ? 'rgba(255,255,255,0.22)' : '#eff6ff',
                color: activeTab === 'overview' ? '#ffffff' : '#1d4ed8',
                borderColor: activeTab === 'overview' ? 'rgba(255,255,255,0.3)' : '#bfdbfe',
                borderWidth: 1,
                borderStyle: 'solid',
                fontWeight: 800,
                fontSize: '0.68rem',
                padding: '2px 8px',
                width: 'auto',
                minWidth: 'unset',
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
            <Users size={18} strokeWidth={2.2} style={{ flexShrink: 0 }} />
            <span>Customer Registrations</span>
          </button>

          {/* 2. Verification Audit */}
          <button
            type="button"
            className={`sales-nav-btn ${activeTab === 'pending_verification' ? 'active' : ''}`}
            onClick={() => navigateToDesk('pending_verification', '#verification')}
          >
            <ShieldCheck size={18} strokeWidth={2.2} style={{ flexShrink: 0 }} />
            <span>Verification Audit</span>
            <span
              className="sales-nav-badge"
              style={{
                background: activeTab === 'pending_verification' ? 'rgba(255,255,255,0.22)' : '#ecfdf5',
                color: activeTab === 'pending_verification' ? '#ffffff' : '#059669',
                borderColor: activeTab === 'pending_verification' ? 'rgba(255,255,255,0.3)' : '#a7f3d0',
                borderWidth: 1,
                borderStyle: 'solid',
                fontWeight: 800,
              }}
            >
              {pendingVerificationBadge}
            </span>
          </button>

          {/* 2B. Approved Members (Payment & Profile KYC Complete) */}
          <button
            type="button"
            className={`sales-nav-btn ${activeTab === 'approved' ? 'active' : ''}`}
            onClick={() => navigateToDesk('approved', '#approved')}
          >
            <UserCheck size={18} strokeWidth={2.2} style={{ flexShrink: 0 }} />
            <span>Approved Members</span>
            <span
              className="sales-nav-badge"
              style={{
                background: activeTab === 'approved' ? 'rgba(255,255,255,0.22)' : '#f0fdf4',
                color: activeTab === 'approved' ? '#ffffff' : '#15803d',
                borderColor: activeTab === 'approved' ? 'rgba(255,255,255,0.3)' : '#bbf7d0',
                borderWidth: 1,
                borderStyle: 'solid',
                fontWeight: 800,
              }}
            >
              {approvedMembersBadge}
            </span>
          </button>

          {/* 3. Lead Management */}
          <button
            type="button"
            className={`sales-nav-btn ${activeTab === 'leads' ? 'active' : ''}`}
            onClick={() => navigateToDesk('leads', '#leads')}
          >
            <Layers size={18} strokeWidth={2.2} style={{ flexShrink: 0 }} />
            <span>Lead Management</span>
          </button>

          {/* 4. Profile Completion */}
          <button
            type="button"
            className={`sales-nav-btn ${activeTab === 'profiles' ? 'active' : ''}`}
            onClick={() => navigateToDesk('profiles', '#profiles')}
          >
            <FileCheck2 size={18} strokeWidth={2.2} style={{ flexShrink: 0 }} />
            <span>Profile Completion</span>
          </button>

          {/* 5. Payment Collection */}
          <button
            type="button"
            className={`sales-nav-btn ${activeTab === 'payments' ? 'active' : ''}`}
            onClick={() => navigateToDesk('payments', '#payments')}
          >
            <CreditCard size={18} strokeWidth={2.2} style={{ flexShrink: 0 }} />
            <span>Payment Collection</span>
          </button>

          {/* 6. Wallets & Balances (Badge: 33) */}
          <button
            type="button"
            className={`sales-nav-btn ${activeTab === 'wallets' ? 'active' : ''}`}
            onClick={() => navigateToDesk('wallets', '#wallets')}
          >
            <Wallet size={18} strokeWidth={2.2} style={{ flexShrink: 0 }} />
            <span>Wallets &amp; Balances</span>
            <span
              className="sales-nav-badge"
              style={{
                background: activeTab === 'wallets' ? 'rgba(255,255,255,0.22)' : '#eef2ff',
                color: activeTab === 'wallets' ? '#ffffff' : '#4338ca',
                borderColor: activeTab === 'wallets' ? 'rgba(255,255,255,0.3)' : '#c7d2fe',
                borderWidth: 1,
                borderStyle: 'solid',
                fontWeight: 800,
              }}
            >
              {walletsBadge}
            </span>
          </button>

          {/* Customer Balance Audit Logs */}
          <button
            type="button"
            className={`sales-nav-btn ${activeTab === 'balance_logs' ? 'active' : ''}`}
            onClick={() => navigateToDesk('balance_logs', '#balance-logs')}
            style={{
              fontWeight: activeTab === 'balance_logs' ? 800 : 600,
            }}
          >
            <Scale size={18} strokeWidth={2.2} style={{ flexShrink: 0 }} />
            <span>Balance Logs</span>
            <span
              className="sales-nav-badge"
              style={{
                background: activeTab === 'balance_logs' ? 'rgba(255,255,255,0.22)' : '#ecfdf5',
                color: activeTab === 'balance_logs' ? '#ffffff' : '#047857',
                borderColor: activeTab === 'balance_logs' ? 'rgba(255,255,255,0.3)' : '#a7f3d0',
                borderWidth: 1,
                borderStyle: 'solid',
                fontWeight: 800,
              }}
            >
              {balanceLogsCount || 'Live'}
            </span>
          </button>

          {/* Failed Transactions Recovery Desk */}
          <button
            type="button"
            className={`sales-nav-btn ${activeTab === 'failed_transactions' ? 'active' : ''}`}
            onClick={() => navigateToDesk('failed_transactions', '#failed-transactions')}
          >
            <AlertCircle size={18} strokeWidth={2.2} color={activeTab === 'failed_transactions' ? '#ffffff' : '#ef4444'} style={{ flexShrink: 0 }} />
            <span>Failed Transactions</span>
            <span
              className="sales-nav-badge"
              style={{
                background: activeTab === 'failed_transactions' ? 'rgba(255,255,255,0.25)' : '#fee2e2',
                color: activeTab === 'failed_transactions' ? '#ffffff' : '#b91c1c',
                borderColor: activeTab === 'failed_transactions' ? 'rgba(255,255,255,0.3)' : '#fca5a5',
                borderWidth: 1,
                borderStyle: 'solid',
                fontWeight: 800,
              }}
            >
              {failedTxCount}
            </span>
          </button>

          {/* Master Transaction Logs Desk (All Verified, Failed, Pending Ledger) */}
          <button
            type="button"
            className={`sales-nav-btn ${activeTab === 'transactions' ? 'active' : ''}`}
            onClick={() => navigateToDesk('transactions', '#transactions')}
            style={{
              fontWeight: activeTab === 'transactions' ? 800 : 600,
            }}
          >
            <Receipt size={18} strokeWidth={2.2} style={{ flexShrink: 0 }} />
            <span>Transaction Logs</span>
            <span
              className="sales-nav-badge"
              style={{
                background: activeTab === 'transactions' ? 'rgba(255,255,255,0.22)' : '#ecfdf5',
                color: activeTab === 'transactions' ? '#ffffff' : '#047857',
                borderColor: activeTab === 'transactions' ? 'rgba(255,255,255,0.3)' : '#a7f3d0',
                borderWidth: 1,
                borderStyle: 'solid',
                fontWeight: 800,
              }}
            >
              {allTransactions.length || (invoices.length + failedTxCount)}
            </span>
          </button>

          {/* 7. Query & Support */}
          <button
            type="button"
            className={`sales-nav-btn ${activeTab === 'queries' ? 'active' : ''}`}
            onClick={() => navigateToDesk('queries', '#queries')}
          >
            <Headphones size={18} strokeWidth={2.2} style={{ flexShrink: 0 }} />
            <span>Query &amp; Support</span>
            {queries.filter((q) => q.status === 'open').length > 0 && (
              <span
                className="sales-nav-badge"
                style={{
                  background: activeTab === 'queries' ? 'rgba(255,255,255,0.22)' : '#fee2e2',
                  color: activeTab === 'queries' ? '#ffffff' : '#b91c1c',
                }}
              >
                {queries.filter((q) => q.status === 'open').length}
              </span>
            )}
          </button>

          {/* 8. Lead Distribution */}
          <button
            type="button"
            className={`sales-nav-btn ${activeTab === 'groups' ? 'active' : ''}`}
            onClick={() => navigateToDesk('groups', '#groups')}
          >
            <FolderTree size={18} strokeWidth={2.2} style={{ flexShrink: 0 }} />
            <span>Lead Distribution</span>
          </button>
        </nav>

        {/* Sidebar Footer */}
        <div className="sales-sidebar-footer">
          <div className="sales-rep-card">
            <div className="sales-rep-avatar">{(activeUser.fullName || 'SE').slice(0, 2).toUpperCase()}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="sales-rep-name">{activeUser.fullName || 'Sales Executive'}</div>
              <div className="sales-rep-role">{activeUser.role || 'Sales Operations'}</div>
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

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Live Real-Time Date & Time Clock */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '0.82rem',
                fontWeight: 700,
                color: '#0f172a',
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              <Clock size={15} color="#4f46e5" />
              <span>
                {liveNow.toLocaleDateString('en-IN', {
                  weekday: 'short',
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}{' '}
                •{' '}
                {liveNow.toLocaleTimeString('en-IN', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: true,
                })}
              </span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: '0.68rem',
                  fontWeight: 800,
                  color: '#059669',
                  background: '#ecfdf5',
                  border: '1px solid #a7f3d0',
                  padding: '2px 6px',
                  borderRadius: 4,
                  marginLeft: 4,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#10b981',
                    boxShadow: '0 0 0 2px rgba(16, 185, 129, 0.25)',
                  }}
                />
                LIVE
              </span>
            </div>

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

          {activeTab === 'approved' && (
            <ApprovedMembersDesk
              customers={customers}
              setCustomers={setCustomers}
              navigateToDesk={navigateToDesk}
            />
          )}

          {activeTab === 'leads' && <LeadManagementDesk customers={customers} />}

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

          {activeTab === 'balance_logs' && (
            <BalanceLogsDesk
              customers={customers}
              setCustomers={setCustomers}
              onBalanceLogsCountChange={setBalanceLogsCount}
            />
          )}

          {activeTab === 'failed_transactions' && (
            <FailedTransactionsDesk
              customers={customers}
              setCustomers={setCustomers}
              allTransactions={allTransactions}
              onRefresh={() => {
                crmApi.getFailedTransactions().then((res) => {
                  if (res && res.ok && Array.isArray(res.failedTransactions)) {
                    setFailedTxCount(res.failedTransactions.length);
                  }
                });
                crmApi.syncStateFromPostgres();
              }}
            />
          )}

          {activeTab === 'transactions' && (
            <MasterTransactionLogsDesk
              customers={customers}
              setCustomers={setCustomers}
              allTransactions={allTransactions}
              invoices={invoices}
              onRefresh={() => {
                crmApi.fetchAllTransactions().then((res) => {
                  if (res && res.ok && Array.isArray(res.transactions)) {
                    const clean = res.transactions.filter((t) => !String(t.id).startsWith('tx_reg_') && !String(t.ref).startsWith('PAY-REG-'));
                    setAllTransactions(clean);
                    try { localStorage.setItem('growthline_all_transactions', JSON.stringify(clean)); } catch (_) {}
                  }
                });
                crmApi.syncStateFromPostgres();
              }}
            />
          )}

          {activeTab === 'queries' && (
            <QuerySupportDesk
              customers={customers}
              setCustomers={setCustomers}
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
