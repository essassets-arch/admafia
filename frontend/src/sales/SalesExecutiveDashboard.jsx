import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Layers,
  CreditCard,
  Wallet,
  Headphones,
  LogOut,
  ExternalLink,
  Sparkles,
  LayoutDashboard,
  Clock,
  UserCheck,
  UserPlus,
  AlertCircle,
  Receipt,
  Scale,
  Menu,
  X,
} from 'lucide-react';
import AllDesksOverviewDashboard from './AllDesksOverviewDashboard';
import BalanceLogsDesk from './BalanceLogsDesk';
import CustomerLeadWorkspacePage from './CustomerLeadWorkspacePage';
import SalesRegisterCustomerModal from './SalesRegisterCustomerModal';
import NotificationBell from '../components/NotificationBell';
import AdminThemeToggle from '../components/AdminThemeToggle';
import { useAdminTheme } from '../utils/adminTheme';
import { useIsMobileViewport } from '../utils/useIsMobileViewport';
import {
  INITIAL_INVOICES,
  INITIAL_QUERIES,
  INITIAL_GROUPS,
} from './operationalDesksData';
import {
  CustomerRegistrationsDesk,
  ApprovedMembersDesk,
  LeadManagementDesk,
  PaymentCollectionDesk,
  WalletsBalancesDesk,
  QuerySupportDesk,
  CustomerGroupsDesk,
  FailedTransactionsDesk,
  MasterTransactionLogsDesk,
} from './OperationalDesksViews';
import crmApi from '../services/crmApi';
import adminAuthApi from '../services/adminAuthApi';
import './sales.css';

// Storage keys for real-time sync
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

  const resolvedComp = !isGeneric(c.companyName) ? c.companyName : !isGeneric(c.name) ? c.name : fallback;
  const resolvedContact = !isGeneric(c.contactPerson)
    ? c.contactPerson
    : !isGeneric(c.contact)
      ? c.contact
      : fallback;

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

export const isTestUser = (c) => {
  if (!c) return false;
  const u = String(c.username || '').toLowerCase().replace(/^@/, '').trim();
  const p = String(c.phone || c.customerPhone || c.customer_phone || '').replace(/\D/g, '').slice(-10);
  const e = String(c.email || c.customerEmail || c.customer_email || '').toLowerCase().trim();
  const n = String(c.companyName || c.company_name || c.company || c.name || c.contactPerson || '')
    .toLowerCase()
    .trim();
  const id = String(c.id || c.customerId || c.customer_id || '').toLowerCase().trim();

  if (u === 'abc' || u === 'xxx') return true;
  if (p === '7383198428' || p === '1111111111') return true;
  if (e === 'aviralshukla2612@gmail.com') return true;
  if (n === 'abc' || n === 'xxx') return true;
  if (
    id === 'cust_reg_7383198428' ||
    id === 'cust_reg_1111111111' ||
    id.includes('7383198428') ||
    id.includes('1111111111')
  ) {
    return true;
  }
  return false;
};

const loadStoredCustomers = () => {
  try {
    const raw = localStorage.getItem(STORAGE_CUSTOMERS);
    if (raw) {
      const stored = JSON.parse(raw);
      if (Array.isArray(stored)) {
        const filtered = stored.filter((c) => !isTestUser(c));
        if (filtered.length !== stored.length) {
          try {
            localStorage.setItem(STORAGE_CUSTOMERS, JSON.stringify(filtered));
          } catch (_) {}
        }
        return filtered.map(sanitizeCustomer);
      }
    }
    return [];
  } catch (_) {
    return [];
  }
};

const loadStoredVerifications = () => {
  try {
    const raw = localStorage.getItem(STORAGE_VERIFICATIONS);
    const stored = raw ? JSON.parse(raw) : [];
    if (Array.isArray(stored)) {
      const filtered = stored.filter((v) => !isTestUser(v));
      if (filtered.length !== stored.length) {
        try {
          localStorage.setItem(STORAGE_VERIFICATIONS, JSON.stringify(filtered));
        } catch (_) {}
      }
      return filtered.map(sanitizeVerification);
    }
    return [];
  } catch (_) {
    return [];
  }
};

/**
 * Resolves any hash / pathname into one of the 5 focused Sales Workspaces + active sub-tab:
 *  1. 'overview'      -> #dashboard
 *  2. 'customers'     -> #customers | #approved | #wallets | #verification | #profiles
 *  3. 'leads'         -> #leads | #groups / #lead-distribution | #customer-leads
 *  4. 'transactions'  -> #transactions | #failed-transactions | #payments | #balance-logs
 *  5. 'queries'       -> #queries | #support
 */
function resolveRouteState(rawHashInput, rawPathInput) {
  const defaults = {
    activeTab: 'overview',
    customersSubTab: 'all', // 'all' | 'approved' | 'wallets'
    customersInitialFilter: 'all',
    leadsSubTab: 'client_leads', // 'client_leads' | 'groups' | 'customer_leads'
    txSubTab: 'all', // 'all' | 'failed' | 'payments' | 'balance_logs'
  };

  try {
    const h = String(rawHashInput ?? (typeof window !== 'undefined' ? window.location.hash : '') ?? '').toLowerCase();
    const p = String(rawPathInput ?? (typeof window !== 'undefined' ? window.location.pathname : '') ?? '').toLowerCase();

    // 1. Dedicated per-customer lead workspace drill-down (#customer-leads?customer=...)
    if (h.startsWith('#customer-leads') || h.includes('customer_leads') || p.includes('/customer-leads')) {
      return { ...defaults, activeTab: 'leads', leadsSubTab: 'customer_leads' };
    }

    // 2. CRITICAL: Check 'fail' BEFORE 'transaction' so #failed-transactions routes to Failed Recovery!
    if (h.includes('fail') || p.includes('fail')) {
      return { ...defaults, activeTab: 'transactions', txSubTab: 'failed' };
    }

    // 3. Check 'balance' BEFORE 'log' so #balance-logs routes to Balance Audit!
    if (h.includes('balance') || p.includes('balance')) {
      return { ...defaults, activeTab: 'transactions', txSubTab: 'balance_logs' };
    }

    // 4. Settled receipts / payments ledger
    if (h.includes('payment') || p.includes('payment') || h.includes('receipt') || h.includes('invoice')) {
      return { ...defaults, activeTab: 'transactions', txSubTab: 'payments' };
    }

    // 5. Master Transaction Logs (#transactions)
    if (h.includes('transaction') || p.includes('transaction') || h.includes('log') || p.includes('log')) {
      return { ...defaults, activeTab: 'transactions', txSubTab: 'all' };
    }

    // 6. Check 'group' / 'lead-distribution' BEFORE generic 'lead'
    if (
      h.includes('group') ||
      p.includes('group') ||
      h.includes('lead-distribution') ||
      p.includes('lead-distribution') ||
      h.includes('distribute')
    ) {
      return { ...defaults, activeTab: 'leads', leadsSubTab: 'groups' };
    }

    // 7. 1-to-1 Client Leads (#leads)
    if (h.includes('lead') || p.includes('lead')) {
      return { ...defaults, activeTab: 'leads', leadsSubTab: 'client_leads' };
    }

    // 8. Customers & Wallets sub-views (#wallets, #approved, #verification, #profiles, #customers)
    if (h.includes('wallet') || p.includes('wallet')) {
      return { ...defaults, activeTab: 'customers', customersSubTab: 'wallets' };
    }
    if (h.includes('approved') || h.includes('member') || p.includes('approved')) {
      return { ...defaults, activeTab: 'customers', customersSubTab: 'approved' };
    }
    if (h.includes('verification') || p.includes('verification')) {
      return { ...defaults, activeTab: 'customers', customersSubTab: 'all', customersInitialFilter: 'payment_pending' };
    }
    if (h.includes('profile') || p.includes('profile')) {
      return { ...defaults, activeTab: 'customers', customersSubTab: 'all', customersInitialFilter: 'profile_incomplete' };
    }
    if (h.includes('customer') || h.includes('register') || h.includes('registration') || p.includes('customer')) {
      return { ...defaults, activeTab: 'customers', customersSubTab: 'all', customersInitialFilter: 'all' };
    }

    // 9. Support Tickets (#queries / #support)
    if (h.includes('quer') || h.includes('support') || h.includes('ticket') || p.includes('quer') || p.includes('support')) {
      return { ...defaults, activeTab: 'queries' };
    }

    // 10. Overview (#dashboard / #overview / default)
    return defaults;
  } catch (_) {
    return defaults;
  }
}

export default function SalesExecutiveDashboard({ onSignOut, onBackToWebsite }) {
  const { theme } = useAdminTheme();
  const isMobileViewport = useIsMobileViewport(960);
  const activeUser = adminAuthApi.getCurrentUser() || {
    fullName: 'Principal Sales & Accounts Executive',
    role: 'Sales Executive',
  };

  const getDeskFromUrl = () => resolveRouteState().activeTab;

  const initialRoute = resolveRouteState();
  const [activeTab, setActiveTab] = useState(initialRoute.activeTab);
  const [customersSubTab, setCustomersSubTab] = useState(initialRoute.customersSubTab);
  const [customersInitialFilter, setCustomersInitialFilter] = useState(initialRoute.customersInitialFilter);
  const [leadsSubTab, setLeadsSubTab] = useState(initialRoute.leadsSubTab);
  const [txSubTab, setTxSubTab] = useState(initialRoute.txSubTab);

  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [isRegisterUserOpen, setIsRegisterUserOpen] = useState(false);
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

  const applyResolvedRoute = useCallback((resolved) => {
    setActiveTab(resolved.activeTab);
    if (resolved.activeTab === 'customers') {
      setCustomersSubTab(resolved.customersSubTab);
      setCustomersInitialFilter(resolved.customersInitialFilter || 'all');
    } else if (resolved.activeTab === 'leads') {
      setLeadsSubTab(resolved.leadsSubTab);
    } else if (resolved.activeTab === 'transactions') {
      setTxSubTab(resolved.txSubTab);
    }
  }, []);

  const updateBalanceLogsCount = useCallback(async () => {
    try {
      const res = await crmApi.getBalanceLogs();
      if (res && res.ok) {
        const count = res.customerLogs ? res.customerLogs.length : Array.isArray(res.logs) ? res.logs.length : 0;
        setBalanceLogsCount(count);
        try {
          if (Array.isArray(res.logs)) localStorage.setItem('growthline_balance_logs', JSON.stringify(res.logs));
          if (Array.isArray(res.customerLogs)) {
            localStorage.setItem('growthline_customer_balance_logs', JSON.stringify(res.customerLogs));
          }
        } catch (_) {}
      }
    } catch (_) {}
  }, []);

  const updateFailedCount = useCallback(async () => {
    try {
      const res = await crmApi.getFailedTransactions();
      if (res && res.ok && Array.isArray(res.failedTransactions)) {
        setFailedTxCount(res.failedTransactions.length);
        try {
          localStorage.setItem('growthline_failed_transactions', JSON.stringify(res.failedTransactions));
        } catch (_) {}
        return;
      }
    } catch (_) {}

    try {
      const raw = localStorage.getItem('growthline_failed_transactions');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setFailedTxCount(parsed.length);
        }
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    updateFailedCount();
    updateBalanceLogsCount();
  }, [updateFailedCount, updateBalanceLogsCount, activeTab]);

  const navigateToDesk = useCallback(
    (deskKey, targetHash) => {
      const hashToApply = targetHash || `#${deskKey || 'dashboard'}`;
      const resolved = resolveRouteState(hashToApply, '');
      applyResolvedRoute(resolved);
      setIsMobileDrawerOpen(false);
      try {
        if (window.location.hash !== hashToApply) {
          window.location.hash = hashToApply;
        }
      } catch (_) {}
    },
    [applyResolvedRoute]
  );

  // Shared Authoritative State across Workspaces
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
    } catch (_) {}
    return [];
  });
  const [queries, setQueries] = useState(() => {
    try {
      const raw = localStorage.getItem('growthline_support_queries');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (_) {}
    return INITIAL_QUERIES;
  });
  const [newRegAlert, setNewRegAlert] = useState(null);
  const [liveNow, setLiveNow] = useState(() => new Date());

  // Single authoritative 1-second clock updater in topbar
  useEffect(() => {
    const timer = setInterval(() => setLiveNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const setCustomers = useCallback((updater) => {
    setCustomersState((prev) => {
      const rawNext = typeof updater === 'function' ? updater(prev) : updater;
      const next = Array.isArray(rawNext)
        ? rawNext.filter((c) => !isTestUser(c)).map(sanitizeCustomer)
        : rawNext;
      try {
        localStorage.setItem(STORAGE_CUSTOMERS, JSON.stringify(next));
      } catch (e) {
        console.error('Storage error', e);
      }
      return next;
    });
  }, []);

  const setVerifications = useCallback((updater) => {
    setVerificationsState((prev) => {
      const rawNext = typeof updater === 'function' ? updater(prev) : updater;
      const next = Array.isArray(rawNext)
        ? rawNext.filter((v) => !isTestUser(v)).map(sanitizeVerification)
        : rawNext;
      try {
        localStorage.setItem(STORAGE_VERIFICATIONS, JSON.stringify(next));
      } catch (e) {
        console.error('Storage error', e);
      }
      return next;
    });
  }, []);

  // Real-time backend synchronization
  useEffect(() => {
    crmApi.syncStateFromPostgres().then((state) => {
      if (state) {
        if (Array.isArray(state.customers)) {
          const sanitized = state.customers.filter((c) => !isTestUser(c)).map(sanitizeCustomer);
          setCustomersState(sanitized);
          try {
            localStorage.setItem(STORAGE_CUSTOMERS, JSON.stringify(sanitized));
          } catch (_) {}
        }
        if (Array.isArray(state.verifications)) {
          const sanitizedV = state.verifications.filter((v) => !isTestUser(v)).map(sanitizeVerification);
          setVerificationsState(sanitizedV);
          try {
            localStorage.setItem(STORAGE_VERIFICATIONS, JSON.stringify(sanitizedV));
          } catch (_) {}
        }
        if (Array.isArray(state.payments)) setInvoices(state.payments);
        if (Array.isArray(state.queries)) setQueries(state.queries);
        if (Array.isArray(state.failedTransactions)) setFailedTxCount(state.failedTransactions.length);
        if (Array.isArray(state.allTransactions)) {
          const clean = state.allTransactions.filter(
            (t) => !String(t.id).startsWith('tx_reg_') && !String(t.ref).startsWith('PAY-REG-')
          );
          setAllTransactions(clean);
          try {
            localStorage.setItem('growthline_all_transactions', JSON.stringify(clean));
          } catch (_) {}
        }
      }
    });

    const handlePostgresSynced = (e) => {
      const state = e?.detail;
      if (state) {
        if (Array.isArray(state.customers)) setCustomersState(state.customers.filter((c) => !isTestUser(c)));
        if (Array.isArray(state.verifications)) setVerificationsState(state.verifications.filter((v) => !isTestUser(v)));
        if (Array.isArray(state.payments)) setInvoices(state.payments);
        if (Array.isArray(state.queries)) setQueries(state.queries);
        if (Array.isArray(state.failedTransactions)) setFailedTxCount(state.failedTransactions.length);
        if (Array.isArray(state.allTransactions)) {
          const clean = state.allTransactions.filter(
            (t) => !String(t.id).startsWith('tx_reg_') && !String(t.ref).startsWith('PAY-REG-')
          );
          setAllTransactions(clean);
        }
      }
    };

    const handleNewRegistration = (e) => {
      const newCust = e?.detail;
      setCustomersState(loadStoredCustomers());
      setVerificationsState(loadStoredVerifications());

      if (newCust) {
        setNewRegAlert(
          `🎉 New Customer Registered: "${newCust.name}" (+91 ${newCust.phone})! Added to Customers & Wallets.`
        );
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
      const resolved = resolveRouteState();
      applyResolvedRoute(resolved);
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
  }, [applyResolvedRoute, updateFailedCount]);

  // Dynamic Badge Calculations
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
  const openTicketsCount = queries.filter((q) => q.status === 'open').length;

  return (
    <div className="sales-app-root sales-app-shell adm-theme-scope" data-admin-theme={theme} data-desk={getDeskFromUrl()}>
      {/* Real-time Registration Notification Toast */}
      {newRegAlert && (
        <div
          style={{
            position: 'fixed',
            top: 16,
            right: 16,
            maxWidth: 'calc(100vw - 32px)',
            zIndex: 9999,
            background: '#0f172a',
            color: '#ffffff',
            padding: '12px 16px',
            borderRadius: 12,
            boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: '0.84rem',
            fontWeight: 700,
            border: '1px solid #334155',
            animation: 'modal-pop-in 0.2s ease',
            boxSizing: 'border-box',
          }}
        >
          <Sparkles size={18} color="#f59e0b" style={{ flexShrink: 0 }} />
          <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{newRegAlert}</span>
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
              marginLeft: 'auto',
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* MOBILE RESPONSIVE TOP BAR (Visible on <= 960px viewports) */}
      <header className="sales-mobile-top-bar sales-mobile-header">
        <div className="sales-mobile-top-left">
          <button
            type="button"
            className="sales-btn-hamburger sales-mobile-menu-btn"
            onClick={() => setIsMobileDrawerOpen(true)}
            aria-label="Open Navigation Menu"
          >
            <Menu size={20} />
          </button>
          <div className="sales-mobile-brand">
            <img
              src="/AdMafia-Logo.png"
              alt="Ad Mafia"
              style={{
                height: 30,
                width: 'auto',
                objectFit: 'contain',
                borderRadius: 7,
                background: '#ffffff',
                padding: '3px 5px',
                border: '1px solid var(--adm-border, #e2e8f0)',
                flexShrink: 0,
              }}
            />
            <div className="sales-mobile-brand-text sales-mobile-brand-title">
              <span>
                Ad <b>Mafia</b>
              </span>
              <span className="sales-ops-mini-badge">OPS</span>
            </div>
          </div>
        </div>

        <div className="sales-mobile-top-actions sales-mobile-header-actions">
          <button
            type="button"
            className="sales-btn-primary"
            onClick={() => setIsRegisterUserOpen(true)}
            title="Register Client Account (₹0 Top-Up)"
            style={{
              padding: '6px 10px',
              fontSize: '0.75rem',
              fontWeight: 800,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              whiteSpace: 'nowrap',
            }}
          >
            <UserPlus size={14} /> + Add User
          </button>
          <AdminThemeToggle compact />
          {isMobileViewport && <NotificationBell variant="light" adminThemeAware />}
          <button
            type="button"
            className="sales-mobile-logout-btn"
            onClick={onSignOut}
            title="Sign Out of Sales Desk"
            aria-label="Sign Out"
          >
            <LogOut size={16} />
            <span className="sales-mobile-logout-label">Logout</span>
          </button>
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

      {/* 1. STICKY SIDEBAR NAVIGATION: 5 FOCUSED SALES WORKSPACES */}
      <aside className={`sales-sidebar ${isMobileDrawerOpen ? 'mobile-open' : ''}`}>
        <div className="sales-sidebar-top">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  background: '#ffffff',
                  padding: 4,
                  borderRadius: 9,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.28)',
                  flexShrink: 0,
                }}
              >
                <img
                  src="/AdMafia-Logo.png"
                  alt="Ad Mafia"
                  style={{
                    height: 34,
                    width: 'auto',
                    objectFit: 'contain',
                    display: 'block',
                  }}
                />
              </div>
              <div>
                <div
                  className="sales-logo-title"
                  style={{
                    fontFamily: "'Bricolage Grotesque', system-ui",
                    fontWeight: 800,
                    fontSize: '1.1rem',
                    color: '#ffffff',
                    lineHeight: 1.1,
                  }}
                >
                  Ad <b>Mafia</b>
                </div>
                <div
                  style={{
                    fontSize: '0.66rem',
                    fontWeight: 800,
                    color: '#818cf8',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  Sales &amp; Support Hub
                </div>
              </div>
            </div>

            <button
              type="button"
              className="sales-mobile-drawer-close sales-drawer-close-btn"
              onClick={() => setIsMobileDrawerOpen(false)}
              aria-label="Close Navigation Menu"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <nav className="sales-sidebar-menu">
          <div className="sales-nav-group-title">SALES WORKSPACES</div>

          {/* 1. Overview */}
          <button
            type="button"
            className={`sales-nav-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => navigateToDesk('overview', '#dashboard')}
          >
            <LayoutDashboard size={18} strokeWidth={2.2} style={{ flexShrink: 0 }} />
            <span>Overview</span>
          </button>

          {/* 2. Customers & Wallets */}
          <button
            type="button"
            className={`sales-nav-btn ${activeTab === 'customers' ? 'active' : ''}`}
            onClick={() => navigateToDesk('customers', '#customers')}
          >
            <Users size={18} strokeWidth={2.2} style={{ flexShrink: 0 }} />
            <span>Customers &amp; Wallets</span>
            {customers.length > 0 && (
              <span
                className="sales-nav-badge"
                style={{
                  background: activeTab === 'customers' ? 'rgba(255,255,255,0.22)' : 'rgba(99, 102, 241, 0.2)',
                  color: activeTab === 'customers' ? '#ffffff' : '#c7d2fe',
                  borderColor: activeTab === 'customers' ? 'rgba(255,255,255,0.34)' : 'rgba(129, 140, 248, 0.35)',
                  borderWidth: 1,
                  borderStyle: 'solid',
                  fontWeight: 800,
                }}
              >
                {customers.length}
              </span>
            )}
          </button>

          {/* 3. Leads & Distribution */}
          <button
            type="button"
            className={`sales-nav-btn ${activeTab === 'leads' ? 'active' : ''}`}
            onClick={() => navigateToDesk('leads', '#leads')}
          >
            <Layers size={18} strokeWidth={2.2} style={{ flexShrink: 0 }} />
            <span>Leads &amp; Distribution</span>
          </button>

          {/* 4. Transactions & Recovery (Red alert badge when failedTxCount > 0) */}
          <button
            type="button"
            className={`sales-nav-btn ${activeTab === 'transactions' ? 'active' : ''}`}
            onClick={() => navigateToDesk('transactions', '#transactions')}
          >
            <Receipt size={18} strokeWidth={2.2} style={{ flexShrink: 0 }} />
            <span>Transactions &amp; Recovery</span>
            {failedTxCount > 0 && (
              <span
                className="sales-nav-badge"
                title={`${failedTxCount} Failed / Unpaid Recovery Alert(s)`}
                style={{
                  background: activeTab === 'transactions' ? 'rgba(255,255,255,0.25)' : 'rgba(244, 63, 94, 0.24)',
                  color: activeTab === 'transactions' ? '#ffffff' : '#fda4af',
                  borderColor: activeTab === 'transactions' ? 'rgba(255,255,255,0.38)' : 'rgba(251, 113, 133, 0.45)',
                  borderWidth: 1,
                  borderStyle: 'solid',
                  fontWeight: 800,
                }}
              >
                {failedTxCount}
              </span>
            )}
          </button>

          {/* 5. Support Tickets */}
          <button
            type="button"
            className={`sales-nav-btn ${activeTab === 'queries' ? 'active' : ''}`}
            onClick={() => navigateToDesk('queries', '#queries')}
          >
            <Headphones size={18} strokeWidth={2.2} style={{ flexShrink: 0 }} />
            <span>Support Tickets</span>
            {openTicketsCount > 0 && (
              <span
                className="sales-nav-badge"
                style={{
                  background: activeTab === 'queries' ? 'rgba(255,255,255,0.22)' : 'rgba(244, 63, 94, 0.22)',
                  color: activeTab === 'queries' ? '#ffffff' : '#fda4af',
                  borderColor: activeTab === 'queries' ? 'rgba(255,255,255,0.34)' : 'rgba(251, 113, 133, 0.38)',
                  borderWidth: 1,
                  borderStyle: 'solid',
                  fontWeight: 800,
                }}
              >
                {openTicketsCount}
              </span>
            )}
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
              aria-label="Sign Out"
              onClick={onSignOut}
            >
              <LogOut size={16} />
            </button>
          </div>
          <div className="sales-sidebar-footer-actions">
            <button
              type="button"
              className="sales-drawer-website-btn"
              onClick={onBackToWebsite}
            >
              <ExternalLink size={15} />
              <span>Back to Website</span>
            </button>
            <button
              type="button"
              className="sales-drawer-signout-btn"
              onClick={onSignOut}
            >
              <LogOut size={16} />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* 2. MAIN OPERATIONS VIEWPORT */}
      <main className="sales-main-viewport">
        {/* Top Operational Bar */}
        <header className="sales-topbar">
          <div
            className="sales-topbar-meta-left"
            style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flexWrap: 'nowrap' }}
          >
            <span className="sales-status-badge" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
              <span className="sales-pulse-dot" />
              Active Operations Desk
            </span>
            <span
              className="sales-topbar-engine-meta"
              style={{
                fontSize: '0.8rem',
                color: 'var(--adm-text-muted, #64748b)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              Ad Mafia Engine: <b>₹300/day</b> • <b>{customers.length} Billing Accounts</b>
            </span>
          </div>

          <div
            className="sales-topbar-meta-right"
            style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0, flexWrap: 'nowrap' }}
          >
            <button
              type="button"
              className="sales-btn-primary"
              onClick={() => setIsRegisterUserOpen(true)}
              title="Directly register a client account from Sales (₹0 Top-Up Required)"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 13px',
                fontSize: '0.79rem',
                fontWeight: 800,
                whiteSpace: 'nowrap',
                boxShadow: '0 4px 12px rgba(79, 70, 229, 0.25)',
              }}
            >
              <UserPlus size={14} /> + Add User / Register
            </button>

            {/* Single Authoritative Live Date & Time Clock */}
            <div
              className="sales-topbar-clock"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                background: 'var(--adm-bg-card, #ffffff)',
                border: '1px solid var(--adm-border-strong, #cbd5e1)',
                padding: '5px 11px',
                borderRadius: '8px',
                fontSize: '0.79rem',
                fontWeight: 700,
                color: 'var(--adm-text-primary, #0f172a)',
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
              }}
            >
              <Clock size={14} color="#6366f1" style={{ flexShrink: 0 }} />
              <span style={{ whiteSpace: 'nowrap' }}>
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
                className="sales-clock-live-pill"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: '0.66rem',
                  fontWeight: 800,
                  color: 'var(--adm-soft-emerald-text, #059669)',
                  background: 'var(--adm-soft-emerald-bg, #ecfdf5)',
                  border: '1px solid var(--adm-soft-emerald-border, #a7f3d0)',
                  padding: '2px 6px',
                  borderRadius: 4,
                  marginLeft: 2,
                  whiteSpace: 'nowrap',
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

            <AdminThemeToggle />

            {!isMobileViewport && <NotificationBell variant="light" adminThemeAware />}

            <button
              type="button"
              className="sales-btn-secondary"
              onClick={onBackToWebsite}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
            >
              Website <ExternalLink size={13} />
            </button>
          </div>
        </header>

        {/* Consolidated 5 Workspaces Rendering */}
        <div className="sales-content-scroll">
          {/* WORKSPACE 1: OVERVIEW */}
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
              navigateToDesk={navigateToDesk}
              onRefresh={() => {
                updateFailedCount();
                updateBalanceLogsCount();
              }}
            />
          )}

          {/* WORKSPACE 2: CUSTOMERS & WALLETS */}
          {activeTab === 'customers' && (
            <>
              <div className="sales-workspace-subnav-wrap">
                <div className="sales-workspace-subnav" role="tablist" aria-label="Customers and Wallets Views">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={customersSubTab === 'all'}
                    className={`sales-workspace-subtab ${customersSubTab === 'all' ? 'active' : ''}`}
                    onClick={() => navigateToDesk('customers', '#customers')}
                  >
                    <Users size={15} />
                    <span>All Customers</span>
                    <span className="sales-workspace-subtab-badge">{customers.length}</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={customersSubTab === 'approved'}
                    className={`sales-workspace-subtab subtab-emerald ${customersSubTab === 'approved' ? 'active' : ''}`}
                    onClick={() => navigateToDesk('customers', '#approved')}
                  >
                    <UserCheck size={15} />
                    <span>Active &amp; Approved</span>
                    <span className="sales-workspace-subtab-badge">{approvedMembersBadge}</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={customersSubTab === 'wallets'}
                    className={`sales-workspace-subtab ${customersSubTab === 'wallets' ? 'active' : ''}`}
                    onClick={() => navigateToDesk('customers', '#wallets')}
                  >
                    <Wallet size={15} />
                    <span>Wallets &amp; Top-Up</span>
                    <span className={`sales-workspace-subtab-badge ${lowWalletsCount > 0 ? 'badge-alert' : ''}`}>
                      {lowWalletsCount > 0 ? `${lowWalletsCount} Low` : customers.length}
                    </span>
                  </button>
                </div>
              </div>

              {customersSubTab === 'all' && (
                <CustomerRegistrationsDesk
                  customers={customers}
                  setCustomers={setCustomers}
                  initialSubView={customersInitialFilter}
                />
              )}
              {customersSubTab === 'approved' && (
                <ApprovedMembersDesk
                  customers={customers}
                  setCustomers={setCustomers}
                  navigateToDesk={navigateToDesk}
                />
              )}
              {customersSubTab === 'wallets' && (
                <WalletsBalancesDesk
                  customers={customers}
                  setCustomers={setCustomers}
                />
              )}
            </>
          )}

          {/* WORKSPACE 3: LEADS & DISTRIBUTION */}
          {activeTab === 'leads' && (
            <>
              {leadsSubTab === 'customer_leads' ? (
                <CustomerLeadWorkspacePage
                  customers={customers}
                  navigateToDesk={navigateToDesk}
                />
              ) : (
                <>
                  <div className="sales-workspace-subnav-wrap">
                    <div className="sales-workspace-subnav" role="tablist" aria-label="Leads and Distribution Views">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={leadsSubTab === 'client_leads'}
                        className={`sales-workspace-subtab subtab-emerald ${leadsSubTab === 'client_leads' ? 'active' : ''}`}
                        onClick={() => navigateToDesk('leads', '#leads')}
                      >
                        <span>📲 Client Leads (1-to-1)</span>
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={leadsSubTab === 'groups'}
                        className={`sales-workspace-subtab ${leadsSubTab === 'groups' ? 'active' : ''}`}
                        onClick={() => navigateToDesk('leads', '#groups')}
                      >
                        <span>📡 Category Broadcasts (Groups)</span>
                      </button>
                    </div>
                  </div>

                  {leadsSubTab === 'client_leads' ? (
                    <LeadManagementDesk customers={customers} />
                  ) : (
                    <CustomerGroupsDesk
                      groups={INITIAL_GROUPS}
                      customers={customers}
                    />
                  )}
                </>
              )}
            </>
          )}

          {/* WORKSPACE 4: TRANSACTIONS & RECOVERY */}
          {activeTab === 'transactions' && (
            <>
              <div className="sales-workspace-subnav-wrap">
                <div className="sales-workspace-subnav" role="tablist" aria-label="Transactions and Recovery Views">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={txSubTab === 'all'}
                    className={`sales-workspace-subtab ${txSubTab === 'all' ? 'active' : ''}`}
                    onClick={() => navigateToDesk('transactions', '#transactions')}
                  >
                    <Receipt size={15} />
                    <span>All Ledger</span>
                    <span className="sales-workspace-subtab-badge">
                      {allTransactions.length || invoices.length + failedTxCount}
                    </span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={txSubTab === 'failed'}
                    className={`sales-workspace-subtab subtab-danger ${txSubTab === 'failed' ? 'active' : ''}`}
                    onClick={() => navigateToDesk('transactions', '#failed-transactions')}
                  >
                    <AlertCircle size={15} />
                    <span>Failed &amp; Unpaid Recovery</span>
                    <span className={`sales-workspace-subtab-badge ${failedTxCount > 0 ? 'badge-alert' : ''}`}>
                      {failedTxCount}
                    </span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={txSubTab === 'payments'}
                    className={`sales-workspace-subtab subtab-emerald ${txSubTab === 'payments' ? 'active' : ''}`}
                    onClick={() => navigateToDesk('transactions', '#payments')}
                  >
                    <CreditCard size={15} />
                    <span>Settled Receipts</span>
                    <span className="sales-workspace-subtab-badge">{invoices.length}</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={txSubTab === 'balance_logs'}
                    className={`sales-workspace-subtab ${txSubTab === 'balance_logs' ? 'active' : ''}`}
                    onClick={() => navigateToDesk('transactions', '#balance-logs')}
                  >
                    <Scale size={15} />
                    <span>Balance Audit</span>
                    <span className="sales-workspace-subtab-badge">{balanceLogsCount || 'Live'}</span>
                  </button>
                </div>
              </div>

              {txSubTab === 'all' && (
                <MasterTransactionLogsDesk
                  customers={customers}
                  setCustomers={setCustomers}
                  allTransactions={allTransactions}
                  invoices={invoices}
                  onRefresh={() => {
                    crmApi.fetchAllTransactions().then((res) => {
                      if (res && res.ok && Array.isArray(res.transactions)) {
                        const clean = res.transactions.filter(
                          (t) => !String(t.id).startsWith('tx_reg_') && !String(t.ref).startsWith('PAY-REG-')
                        );
                        setAllTransactions(clean);
                        try {
                          localStorage.setItem('growthline_all_transactions', JSON.stringify(clean));
                        } catch (_) {}
                      }
                    });
                    crmApi.syncStateFromPostgres();
                  }}
                />
              )}

              {txSubTab === 'failed' && (
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

              {txSubTab === 'payments' && (
                <PaymentCollectionDesk
                  invoices={invoices}
                  setInvoices={setInvoices}
                  customers={customers}
                  setCustomers={setCustomers}
                  verifications={verifications}
                />
              )}

              {txSubTab === 'balance_logs' && (
                <BalanceLogsDesk
                  customers={customers}
                  setCustomers={setCustomers}
                  onBalanceLogsCountChange={setBalanceLogsCount}
                />
              )}
            </>
          )}

          {/* WORKSPACE 5: SUPPORT TICKETS */}
          {activeTab === 'queries' && (
            <QuerySupportDesk
              customers={customers}
              setCustomers={setCustomers}
              queries={queries}
              setQueries={setQueries}
            />
          )}
        </div>
      </main>

      {/* Global Sales Direct Client Registration Modal (₹0 Top-Up Required) */}
      <SalesRegisterCustomerModal
        isOpen={isRegisterUserOpen}
        onClose={() => setIsRegisterUserOpen(false)}
        onCustomerCreated={(newCust) => {
          setCustomers((prev) => [
            newCust,
            ...prev.filter((c) => c.id !== newCust.id && c.phone !== newCust.phone),
          ]);
        }}
      />
    </div>
  );
}
