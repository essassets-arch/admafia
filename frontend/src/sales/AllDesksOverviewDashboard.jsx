import React, { useState, useEffect } from 'react';
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
  CheckCircle2,
  AlertTriangle,
  Clock,
  Phone,
  MessageSquare,
  ArrowRight,
  ExternalLink,
  Sparkles,
  Shield,
  Activity,
  Plus,
  Check,
  DollarSign,
  TrendingUp,
  AlertCircle,
  Eye,
  RefreshCw,
} from 'lucide-react';
import { DEFAULT_DESK_LEADS } from './OperationalDesksViews';

const formatINR = (val) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(val || 0);

export default function AllDesksOverviewDashboard({
  customers = [],
  setCustomers,
  verifications = [],
  setVerifications,
  onApproveVerification,
  invoices = [],
  setInvoices,
  queries = [],
  setQueries,
  tasks = [],
  setTasks,
  groups = [],
  navigateToDesk,
}) {
  // Real-time leads state
  const [leads, setLeads] = useState(() => {
    try {
      const raw = localStorage.getItem('growthline_all_leads');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return DEFAULT_DESK_LEADS || [];
  });

  useEffect(() => {
    const handleLeadAdded = (e) => {
      const newLead = e?.detail;
      if (newLead) setLeads((prev) => [newLead, ...prev.filter((l) => l.id !== newLead.id)]);
    };
    const handleStorage = (e) => {
      if (e.key === 'growthline_all_leads' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) setLeads(parsed);
        } catch (err) {}
      }
    };
    const handlePaymentAdded = (e) => {
      const newPay = e?.detail;
      if (newPay) setPaymentRecords((prev) => [newPay, ...prev.filter((p) => p.id !== newPay.id)]);
    };
    const handleCustomerSync = () => {
      try {
        const rawPay = localStorage.getItem('growthline_payment_records');
        if (rawPay) setPaymentRecords(JSON.parse(rawPay));
        const rawLeads = localStorage.getItem('growthline_all_leads');
        if (rawLeads) setLeads(JSON.parse(rawLeads));
      } catch (e) {}
    };
    window.addEventListener('growthline_lead_added', handleLeadAdded);
    window.addEventListener('growthline_payment_recorded', handlePaymentAdded);
    window.addEventListener('growthline_customer_registered', handleCustomerSync);
    window.addEventListener('growthline_active_user_changed', handleCustomerSync);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('growthline_lead_added', handleLeadAdded);
      window.removeEventListener('growthline_payment_recorded', handlePaymentAdded);
      window.removeEventListener('growthline_customer_registered', handleCustomerSync);
      window.removeEventListener('growthline_active_user_changed', handleCustomerSync);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const [paymentRecords, setPaymentRecords] = useState(() => {
    try {
      const raw = localStorage.getItem('growthline_payment_records');
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return [];
  });

  // Quick Inline Actions
  const handleQuickApproveVerification = (item) => {
    if (onApproveVerification) {
      onApproveVerification(item);
    }
    setVerifications((prev) => prev.filter((v) => v.id !== item.id));
  };

  const handleToggleTask = (taskId) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: t.status === 'completed' ? 'pending' : 'completed' } : t))
    );
  };

  // Metrics Calculations across all 9 Desks
  const totalRegistered = customers.length;
  const pendingVerificationsCount = verifications.length; // e.g. 8
  const totalLeadsCount = leads.length;
  const urgentLeadsCount = leads.filter((l) => l.priority === 'Urgent').length;

  const completedProfiles = customers.filter(
    (c) => c.profileStatus === 'complete' || c.profile_status === 'complete' || (c.kycPercent || 0) >= 90
  ).length;
  const profileCompletionRate = totalRegistered > 0 ? Math.round((completedProfiles / totalRegistered) * 100) : 0;

  const totalCollectedRevenue = paymentRecords.length > 0
    ? paymentRecords.filter((r) => r.status === 'paid').reduce((sum, r) => sum + (r.amount || 0), 0)
    : invoices.filter((inv) => inv.status === 'paid').reduce((sum, inv) => sum + (inv.amount || 0), 0);

  const totalWalletReserves = customers.reduce((sum, c) => sum + (c.balance || c.walletBalance || 0), 0);
  const lowBalanceCustomers = customers.filter(
    (c) => (c.balance || 0) < 1000 || (c.runwayDays || 0) <= 2
  );
  const walletsAlertBadge = lowBalanceCustomers.length;

  const openQueries = queries.filter((q) => q.status === 'open' || q.status === 'pending');
  const todayTasks = tasks.filter((t) => t.dueStatus === 'today' && t.status !== 'completed');
  const todayTasksBadge = todayTasks.length;

  return (
    <div className="desk-page-container" style={{ paddingBottom: 60 }}>
      {/* 1. MASTER HEADER / HERO */}
      <div className="desk-header" style={{ marginBottom: 20 }}>
        <div>
          <div className="desk-breadcrumb">
            SUB ADMIN &amp; SUPPORT OPERATIONS / ALL-IN-ONE COMMAND CENTER
          </div>
          <h1 className="desk-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>Operations Desk Overview</span>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 800,
                color: '#059669',
                background: '#ecfdf5',
                border: '1px solid #a7f3d0',
                padding: '4px 10px',
                borderRadius: 9999,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <span className="sales-pulse-dot" style={{ width: 7, height: 7 }} /> Live 9 Desks Unified
            </span>
          </h1>
          <p className="desk-subtitle">
            Central dashboard monitoring all 9 operational desks in real time — customer intake, verification queue,
            lead distribution, balances, and executive follow-ups.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="sales-btn-secondary"
            onClick={() => window.location.reload()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.82rem' }}
          >
            <RefreshCw size={14} /> Refresh Data
          </button>
          <a
            href="#register"
            className="sales-btn-primary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: '0.82rem',
              fontWeight: 700,
              background: 'linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)',
            }}
          >
            <Plus size={15} strokeWidth={2.5} /> Register New Client
          </a>
        </div>
      </div>

      {/* 2. THE 9 OPERATIONAL DESKS SUMMARY GRID */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>
            The 9 Authorized Operations Desks
          </h2>
          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
            Click any desk card to jump directly to its dedicated operational workbench
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 14,
          }}
        >
          {/* Card 1: Customer Registrations */}
          <div
            onClick={() => navigateToDesk('customers', '#customers')}
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              padding: '16px 18px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#4f46e5';
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(79, 70, 229, 0.12)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#e2e8f0';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: '#eef2ff',
                      color: '#4f46e5',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    <Users size={18} strokeWidth={2.2} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>
                      DESK 01
                    </div>
                    <div style={{ fontSize: '0.94rem', fontWeight: 800, color: '#0f172a' }}>
                      Customer Registrations
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: '1.6rem', fontWeight: 900, color: '#0f172a' }}>{totalRegistered}</span>
                <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Accounts enrolled</span>
              </div>
              <div style={{ fontSize: '0.78rem', color: '#059669', marginTop: 4, fontWeight: 600 }}>
                ✓ Synced with #register intake
              </div>
            </div>
            <div
              style={{
                marginTop: 14,
                paddingTop: 10,
                borderTop: '1px solid #f1f5f9',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.78rem',
                fontWeight: 700,
                color: '#4f46e5',
              }}
            >
              <span>Manage Registrations</span>
              <ArrowRight size={14} />
            </div>
          </div>

          {/* Card 2: Pending Verification */}
          <div
            onClick={() => navigateToDesk('pending_verification', '#verification')}
            style={{
              background: '#ffffff',
              border: '1px solid #fecaca',
              borderRadius: 12,
              padding: '16px 18px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#dc2626';
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(220, 38, 38, 0.12)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#fecaca';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: '#fef2f2',
                      color: '#dc2626',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    <ShieldCheck size={18} strokeWidth={2.2} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: '#dc2626', fontWeight: 800, textTransform: 'uppercase' }}>
                      DESK 02
                    </div>
                    <div style={{ fontSize: '0.94rem', fontWeight: 800, color: '#0f172a' }}>
                      Pending Verification
                    </div>
                  </div>
                </div>
                <span
                  style={{
                    background: '#fef2f2',
                    color: '#dc2626',
                    border: '1px solid #fecaca',
                    fontSize: '0.78rem',
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: 9999,
                  }}
                >
                  {pendingVerificationsCount} Pending
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: '1.6rem', fontWeight: 900, color: '#dc2626' }}>
                  {pendingVerificationsCount}
                </span>
                <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Needs sub-admin approval</span>
              </div>
              <div style={{ fontSize: '0.78rem', color: '#b91c1c', marginTop: 4, fontWeight: 600 }}>
                ⚡ Action required to unlock wallet
              </div>
            </div>
            <div
              style={{
                marginTop: 14,
                paddingTop: 10,
                borderTop: '1px solid #f1f5f9',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.78rem',
                fontWeight: 700,
                color: '#dc2626',
              }}
            >
              <span>Review Verifications</span>
              <ArrowRight size={14} />
            </div>
          </div>

          {/* Card 3: Lead Management */}
          <div
            onClick={() => navigateToDesk('leads', '#leads')}
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              padding: '16px 18px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#059669';
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(5, 150, 105, 0.12)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#e2e8f0';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: '#ecfdf5',
                      color: '#059669',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    <Layers size={18} strokeWidth={2.2} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>
                      DESK 03
                    </div>
                    <div style={{ fontSize: '0.94rem', fontWeight: 800, color: '#0f172a' }}>
                      Lead Management
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: '1.6rem', fontWeight: 900, color: '#0f172a' }}>{totalLeadsCount}</span>
                <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Total inbound leads</span>
              </div>
              <div style={{ fontSize: '0.78rem', color: '#059669', marginTop: 4, fontWeight: 600 }}>
                ⚡ {urgentLeadsCount} Urgent SLA (&lt;5 min response)
              </div>
            </div>
            <div
              style={{
                marginTop: 14,
                paddingTop: 10,
                borderTop: '1px solid #f1f5f9',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.78rem',
                fontWeight: 700,
                color: '#059669',
              }}
            >
              <span>Manage Inbound Leads</span>
              <ArrowRight size={14} />
            </div>
          </div>

          {/* Card 4: Profile Completion */}
          <div
            onClick={() => navigateToDesk('profiles', '#profiles')}
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              padding: '16px 18px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#d97706';
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(217, 119, 6, 0.12)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#e2e8f0';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: '#fffbeb',
                      color: '#d97706',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    <FileCheck2 size={18} strokeWidth={2.2} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>
                      DESK 04
                    </div>
                    <div style={{ fontSize: '0.94rem', fontWeight: 800, color: '#0f172a' }}>
                      Profile Completion
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: '1.6rem', fontWeight: 900, color: '#0f172a' }}>
                  {profileCompletionRate}%
                </span>
                <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Platform KYC Rate</span>
              </div>
              <div style={{ fontSize: '0.78rem', color: '#b45309', marginTop: 4, fontWeight: 600 }}>
                📋 {totalRegistered - completedProfiles} accounts need GST / KYC
              </div>
            </div>
            <div
              style={{
                marginTop: 14,
                paddingTop: 10,
                borderTop: '1px solid #f1f5f9',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.78rem',
                fontWeight: 700,
                color: '#d97706',
              }}
            >
              <span>Complete Client Profiles</span>
              <ArrowRight size={14} />
            </div>
          </div>

          {/* Card 5: Payment Collection */}
          <div
            onClick={() => navigateToDesk('payments', '#payments')}
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              padding: '16px 18px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#2563eb';
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(37, 99, 235, 0.12)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#e2e8f0';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: '#eff6ff',
                      color: '#2563eb',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    <CreditCard size={18} strokeWidth={2.2} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>
                      DESK 05
                    </div>
                    <div style={{ fontSize: '0.94rem', fontWeight: 800, color: '#0f172a' }}>
                      Payment Collection
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: '1.45rem', fontWeight: 900, color: '#0f172a' }}>
                  {formatINR(totalCollectedRevenue)}
                </span>
              </div>
              <div style={{ fontSize: '0.78rem', color: '#2563eb', marginTop: 4, fontWeight: 600 }}>
                💳 {paymentRecords.filter((r) => r.status === 'paid').length} Payments Settled
              </div>
            </div>
            <div
              style={{
                marginTop: 14,
                paddingTop: 10,
                borderTop: '1px solid #f1f5f9',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.78rem',
                fontWeight: 700,
                color: '#2563eb',
              }}
            >
              <span>View Invoices &amp; Billing</span>
              <ArrowRight size={14} />
            </div>
          </div>

          {/* Card 6: Wallets & Balances */}
          <div
            onClick={() => navigateToDesk('wallets', '#wallets')}
            style={{
              background: '#ffffff',
              border: '1px solid #c7d2fe',
              borderRadius: 12,
              padding: '16px 18px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#4338ca';
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(67, 56, 202, 0.12)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#c7d2fe';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: '#eef2ff',
                      color: '#4338ca',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    <Wallet size={18} strokeWidth={2.2} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: '#4338ca', fontWeight: 800, textTransform: 'uppercase' }}>
                      DESK 06
                    </div>
                    <div style={{ fontSize: '0.94rem', fontWeight: 800, color: '#0f172a' }}>
                      Wallets &amp; Balances
                    </div>
                  </div>
                </div>
                <span
                  style={{
                    background: '#eef2ff',
                    color: '#4338ca',
                    border: '1px solid #c7d2fe',
                    fontSize: '0.78rem',
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: 9999,
                  }}
                >
                  {walletsAlertBadge} Low Alert
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: '1.45rem', fontWeight: 900, color: '#0f172a' }}>
                  {formatINR(totalWalletReserves)}
                </span>
              </div>
              <div style={{ fontSize: '0.78rem', color: '#4338ca', marginTop: 4, fontWeight: 600 }}>
                📊 ₹300/day daily burn pacing active
              </div>
            </div>
            <div
              style={{
                marginTop: 14,
                paddingTop: 10,
                borderTop: '1px solid #f1f5f9',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.78rem',
                fontWeight: 700,
                color: '#4338ca',
              }}
            >
              <span>Manage Client Wallets</span>
              <ArrowRight size={14} />
            </div>
          </div>

          {/* Card 7: Query & Support */}
          <div
            onClick={() => navigateToDesk('queries', '#queries')}
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              padding: '16px 18px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#0891b2';
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(8, 145, 178, 0.12)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#e2e8f0';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: '#ecfeff',
                      color: '#0891b2',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    <Headphones size={18} strokeWidth={2.2} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>
                      DESK 07
                    </div>
                    <div style={{ fontSize: '0.94rem', fontWeight: 800, color: '#0f172a' }}>
                      Query &amp; Support
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: '1.6rem', fontWeight: 900, color: '#0f172a' }}>
                  {openQueries.length}
                </span>
                <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Active tickets</span>
              </div>
              <div style={{ fontSize: '0.78rem', color: '#0891b2', marginTop: 4, fontWeight: 600 }}>
                ⏱️ SLA avg response: 18 mins
              </div>
            </div>
            <div
              style={{
                marginTop: 14,
                paddingTop: 10,
                borderTop: '1px solid #f1f5f9',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.78rem',
                fontWeight: 700,
                color: '#0891b2',
              }}
            >
              <span>Open Support Desk</span>
              <ArrowRight size={14} />
            </div>
          </div>

          {/* Card 8: Follow-up & Tasks */}
          <div
            onClick={() => navigateToDesk('tasks', '#tasks')}
            style={{
              background: '#ffffff',
              border: '1px solid #a7f3d0',
              borderRadius: 12,
              padding: '16px 18px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#059669';
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(5, 150, 105, 0.12)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#a7f3d0';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: '#ecfdf5',
                      color: '#059669',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    <Calendar size={18} strokeWidth={2.2} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: '#059669', fontWeight: 800, textTransform: 'uppercase' }}>
                      DESK 08
                    </div>
                    <div style={{ fontSize: '0.94rem', fontWeight: 800, color: '#0f172a' }}>
                      Follow-up &amp; Tasks
                    </div>
                  </div>
                </div>
                <span
                  style={{
                    background: '#ecfdf5',
                    color: '#059669',
                    border: '1px solid #a7f3d0',
                    fontSize: '0.78rem',
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: 9999,
                  }}
                >
                  {todayTasksBadge} Due Today
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: '1.6rem', fontWeight: 900, color: '#0f172a' }}>
                  {todayTasks.length}
                </span>
                <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Scheduled for today</span>
              </div>
              <div style={{ fontSize: '0.78rem', color: '#059669', marginTop: 4, fontWeight: 600 }}>
                📅 Complete daily calls &amp; WhatsApps
              </div>
            </div>
            <div
              style={{
                marginTop: 14,
                paddingTop: 10,
                borderTop: '1px solid #f1f5f9',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.78rem',
                fontWeight: 700,
                color: '#059669',
              }}
            >
              <span>View Tasks Pipeline</span>
              <ArrowRight size={14} />
            </div>
          </div>

          {/* Card 9: Customer Groups */}
          <div
            onClick={() => navigateToDesk('groups', '#groups')}
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              padding: '16px 18px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#db2777';
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(219, 39, 119, 0.12)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#e2e8f0';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: '#fdf2f8',
                      color: '#db2777',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    <FolderTree size={18} strokeWidth={2.2} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>
                      DESK 09
                    </div>
                    <div style={{ fontSize: '0.94rem', fontWeight: 800, color: '#0f172a' }}>
                      Customer Groups
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: '1.6rem', fontWeight: 900, color: '#0f172a' }}>
                  {groups.length || 4}
                </span>
                <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Active tiers</span>
              </div>
              <div style={{ fontSize: '0.78rem', color: '#db2777', marginTop: 4, fontWeight: 600 }}>
                👥 VIP Retainers, High-Growth &amp; Trials
              </div>
            </div>
            <div
              style={{
                marginTop: 14,
                paddingTop: 10,
                borderTop: '1px solid #f1f5f9',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.78rem',
                fontWeight: 700,
                color: '#db2777',
              }}
            >
              <span>Manage Segment Groups</span>
              <ArrowRight size={14} />
            </div>
          </div>
        </div>
      </div>

      {/* 3. IN-DEPTH OPERATIONAL SECTION: ROW 1 (Desk 1 Registrations & Desk 2 Verifications) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))',
          gap: 20,
          marginBottom: 24,
        }}
      >
        {/* Left: Desk 1 Recent Customer Registrations */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 14,
            padding: 20,
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: '#eef2ff',
                  color: '#4f46e5',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <Users size={16} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}>
                  Customer Registrations (Desk 01)
                </h3>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Recently registered client ad accounts
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigateToDesk('customers', '#customers')}
              className="sales-btn-secondary"
              style={{ fontSize: '0.76rem', padding: '5px 12px' }}
            >
              View All ({totalRegistered}) →
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 420, overflowY: 'auto' }}>
            {customers.length === 0 ? (
              <div style={{ padding: '24px 14px', textAlign: 'center', color: '#64748b', fontSize: '0.84rem' }}>
                No customer accounts registered yet. Register at <a href="#register" style={{ color: '#4f46e5', fontWeight: 700 }}>#register</a>.
              </div>
            ) : (
              customers.map((c) => (
                <div
                  key={c.id}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 10,
                    background: '#f8fafc',
                    border: '1px solid #f1f5f9',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#0f172a' }}>
                      @{c.username || 'user'} • {c.companyName || c.name}
                    </div>
                    <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: 2 }}>
                      👤 {c.contactPerson || c.contact || c.username} • 📞 +91 {c.phone} • ✉️ {c.email || 'No email'} • 📍 {c.city || 'India'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#059669' }}>
                      {formatINR(c.balance || c.walletBalance || 0)}
                    </div>
                    <span
                      style={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 9999,
                        background: c.profileStatus === 'complete' ? '#ecfdf5' : '#fffbeb',
                        color: c.profileStatus === 'complete' ? '#059669' : '#d97706',
                        border: `1px solid ${c.profileStatus === 'complete' ? '#a7f3d0' : '#fde68a'}`,
                        display: 'inline-block',
                        marginTop: 2,
                      }}
                    >
                      {c.profileStatus === 'complete' ? 'Active Verified' : 'Setup Pending'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: Desk 2 Pending Verification Priority Queue */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #fecaca',
            borderRadius: 14,
            padding: 20,
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: '#fef2f2',
                  color: '#dc2626',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <ShieldCheck size={16} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}>
                    Pending Verification Queue (Desk 02)
                  </h3>
                  <span
                    style={{
                      background: '#fef2f2',
                      color: '#dc2626',
                      border: '1px solid #fecaca',
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      padding: '1px 7px',
                      borderRadius: 9999,
                    }}
                  >
                    {pendingVerificationsCount}
                  </span>
                </div>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Bank transfer &amp; KYC payments awaiting clearance
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigateToDesk('pending_verification', '#verification')}
              className="sales-btn-secondary"
              style={{ fontSize: '0.76rem', padding: '5px 12px', color: '#dc2626', borderColor: '#fecaca' }}
            >
              Open Queue ({pendingVerificationsCount}) →
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 420, overflowY: 'auto' }}>
            {verifications.map((v) => (
              <div
                key={v.id}
                style={{
                  padding: '12px 14px',
                  borderRadius: 10,
                  background: '#fffbfb',
                  border: '1px solid #fecaca',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 800, fontSize: '0.88rem', color: '#0f172a' }}>
                      {v.company || v.name}
                    </span>
                    <span
                      style={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        color: '#dc2626',
                        background: '#fef2f2',
                        padding: '1px 6px',
                        borderRadius: 4,
                      }}
                    >
                      {v.packageTier || 'Transfer'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: 2 }}>
                    👤 {v.contact} • +91 {v.phone} • UTR: <span style={{ fontFamily: 'monospace' }}>{v.utr || 'VERIFY-BANK'}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <span style={{ fontWeight: 900, color: '#0f172a', fontSize: '0.94rem' }}>
                    {formatINR(v.amount)}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleQuickApproveVerification(v)}
                    className="sales-btn-primary"
                    style={{
                      padding: '5px 10px',
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      background: '#059669',
                      borderColor: '#059669',
                    }}
                    title="Clear payment and credit client wallet immediately"
                  >
                    ✓ Approve
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 4. IN-DEPTH OPERATIONAL SECTION: ROW 2 (Desk 3 Leads & Desk 4 Profiles) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))',
          gap: 20,
          marginBottom: 24,
        }}
      >
        {/* Left: Desk 3 Lead Management Feed */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 14,
            padding: 20,
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: '#ecfdf5',
                  color: '#059669',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <Layers size={16} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}>
                  Live Inbound Leads (Desk 03)
                </h3>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Real-time enquiries with direct contact channels
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigateToDesk('leads', '#leads')}
              className="sales-btn-secondary"
              style={{ fontSize: '0.76rem', padding: '5px 12px' }}
            >
              All Leads ({totalLeadsCount}) →
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {leads.slice(0, 4).map((l) => {
              const rawDigits = (l.phone || l.name || '').replace(/\D/g, '').slice(-10);
              const cleanPhone = rawDigits.length === 10 ? `+91 ${rawDigits}` : l.name;
              return (
                <div
                  key={l.id}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 10,
                    background: '#f8fafc',
                    border: '1px solid #f1f5f9',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '0.96rem', color: '#0f172a' }}>
                        {cleanPhone}
                      </span>
                      {l.priority === 'Urgent' && (
                        <span
                          style={{
                            background: '#fef2f2',
                            color: '#dc2626',
                            border: '1px solid #fecaca',
                            fontSize: '0.66rem',
                            fontWeight: 800,
                            padding: '1px 6px',
                            borderRadius: 4,
                          }}
                        >
                          Urgent SLA
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.76rem', color: '#1e40af', marginTop: 2, fontWeight: 600 }}>
                      🏢 {l.company || 'Client Workspace'}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <a
                      href={`tel:${rawDigits}`}
                      className="desk-action-btn"
                      style={{
                        padding: '6px 10px',
                        fontSize: '0.75rem',
                        textDecoration: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <Phone size={13} /> Call
                    </a>
                    <a
                      href={`https://wa.me/91${rawDigits}`}
                      target="_blank"
                      rel="noreferrer"
                      className="desk-action-btn"
                      style={{
                        padding: '6px 10px',
                        fontSize: '0.75rem',
                        textDecoration: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <MessageSquare size={13} /> WhatsApp
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Desk 4 Profile Completion Radar */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 14,
            padding: 20,
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: '#fffbeb',
                  color: '#d97706',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <FileCheck2 size={16} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}>
                  Profile Completion Health (Desk 04)
                </h3>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  KYC compliance, GST details &amp; setup status
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigateToDesk('profiles', '#profiles')}
              className="sales-btn-secondary"
              style={{ fontSize: '0.76rem', padding: '5px 12px' }}
            >
              Open Desk →
            </button>
          </div>

          {/* Progress bar */}
          <div style={{ marginBottom: 16, padding: '12px 14px', background: '#f8fafc', borderRadius: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: 6 }}>
              <span style={{ fontWeight: 700, color: '#334155' }}>Platform Profile Health</span>
              <span style={{ fontWeight: 900, color: '#d97706' }}>{profileCompletionRate}% Complete</span>
            </div>
            <div style={{ height: 8, background: '#e2e8f0', borderRadius: 9999, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${profileCompletionRate}%`,
                  background: 'linear-gradient(90deg, #d97706 0%, #10b981 100%)',
                  borderRadius: 9999,
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 360, overflowY: 'auto' }}>
            {customers.map((c) => {
              const isComp = c.profileStatus === 'complete' || (c.kycPercent || 0) >= 90;
              return (
                <div
                  key={c.id}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 8,
                    background: '#ffffff',
                    border: '1px solid #f1f5f9',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.86rem', color: '#0f172a' }}>
                      @{c.username || 'user'} • {c.companyName || c.name}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                      Category: {c.category || c.industry || 'General Business'} • +91 {c.phone}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      padding: '3px 9px',
                      borderRadius: 9999,
                      background: isComp ? '#ecfdf5' : '#fffbeb',
                      color: isComp ? '#059669' : '#d97706',
                      border: `1px solid ${isComp ? '#a7f3d0' : '#fde68a'}`,
                    }}
                  >
                    {isComp ? '100% KYC' : 'Setup Pending'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 5. IN-DEPTH OPERATIONAL SECTION: ROW 3 (Desk 5 Payments & Desk 6 Wallets) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))',
          gap: 20,
          marginBottom: 24,
        }}
      >
        {/* Left: Desk 5 Payment Collection */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 14,
            padding: 20,
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: '#eff6ff',
                  color: '#2563eb',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <CreditCard size={16} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}>
                  Payment Collection &amp; Ledger (Desk 05)
                </h3>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Client subscription and ad budget collections
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigateToDesk('payments', '#payments')}
              className="sales-btn-secondary"
              style={{ fontSize: '0.76rem', padding: '5px 12px' }}
            >
              Ledger ({paymentRecords.length}) →
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 360, overflowY: 'auto' }}>
            {paymentRecords.map((inv) => (
              <div
                key={inv.id}
                style={{
                  padding: '11px 14px',
                  borderRadius: 10,
                  background: '#f8fafc',
                  border: '1px solid #f1f5f9',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.86rem', color: '#0f172a' }}>
                    {inv.company || inv.customerName}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: 2 }}>
                    Ref: <span style={{ fontFamily: 'monospace' }}>{inv.receiptNumber || inv.invoiceNumber || inv.id}</span> • {inv.date || 'Recent'}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 900, fontSize: '0.94rem', color: '#0f172a' }}>
                    {formatINR(inv.amount)}
                  </div>
                  <span
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: 9999,
                      background: inv.status === 'paid' ? '#ecfdf5' : '#fffbeb',
                      color: inv.status === 'paid' ? '#059669' : '#d97706',
                      border: `1px solid ${inv.status === 'paid' ? '#a7f3d0' : '#fde68a'}`,
                      display: 'inline-block',
                      marginTop: 2,
                    }}
                  >
                    {inv.status ? inv.status.toUpperCase() : 'PAID'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Desk 6 Wallets & Balances Alerts */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #c7d2fe',
            borderRadius: 14,
            padding: 20,
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: '#eef2ff',
                  color: '#4338ca',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <Wallet size={16} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}>
                    Wallets &amp; Balances Runway (Desk 06)
                  </h3>
                  <span
                    style={{
                      background: '#eef2ff',
                      color: '#4338ca',
                      border: '1px solid #c7d2fe',
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      padding: '1px 7px',
                      borderRadius: 9999,
                    }}
                  >
                    {walletsAlertBadge} Low Alert
                  </span>
                </div>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Accounts with low balance (&lt; ₹1,000 or &lt; 3 runway days)
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigateToDesk('wallets', '#wallets')}
              className="sales-btn-secondary"
              style={{ fontSize: '0.76rem', padding: '5px 12px' }}
            >
              Open Wallets ({customers.length}) →
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 360, overflowY: 'auto' }}>
            {customers.map((c) => {
              const bal = c.balance || c.walletBalance || 0;
              const runway = c.runwayDays !== undefined ? c.runwayDays : Math.floor(bal / 300);
              const isCritical = bal < 600 || runway <= 2;
              return (
                <div
                  key={c.id}
                  style={{
                    padding: '11px 14px',
                    borderRadius: 10,
                    background: isCritical ? '#fffbfb' : '#f8fafc',
                    border: `1px solid ${isCritical ? '#fecaca' : '#f1f5f9'}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#0f172a' }}>
                      {c.companyName || c.name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>
                      Burn Rate: ₹300/day • Runway: <b style={{ color: isCritical ? '#dc2626' : '#059669' }}>{runway} Days left</b>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 900, fontSize: '0.98rem', color: isCritical ? '#dc2626' : '#0f172a' }}>
                      {formatINR(bal)}
                    </div>
                    <a
                      href={`https://wa.me/91${c.phone}?text=Hello%20${encodeURIComponent(c.contactPerson || c.name)},%20your%20AdMafia%20marketing%20wallet%20has%20${runway}%20days%20remaining.%20Please%20recharge%20to%20prevent%20campaign%20pause.`}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        color: '#4338ca',
                        textDecoration: 'none',
                        display: 'inline-block',
                        marginTop: 2,
                      }}
                    >
                      Top-up Reminder →
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 6. IN-DEPTH OPERATIONAL SECTION: ROW 4 (Desk 7 Queries, Desk 8 Tasks, Desk 9 Groups) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 20,
        }}
      >
        {/* Left: Desk 7 Query & Support */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 14,
            padding: 20,
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  background: '#ecfeff',
                  color: '#0891b2',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <Headphones size={15} />
              </div>
              <h3 style={{ margin: 0, fontSize: '0.94rem', fontWeight: 800, color: '#0f172a' }}>
                Query &amp; Support (Desk 07)
              </h3>
            </div>
            <button
              type="button"
              onClick={() => navigateToDesk('queries', '#queries')}
              className="sales-btn-secondary"
              style={{ fontSize: '0.74rem', padding: '4px 10px' }}
            >
              Open →
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {queries.slice(0, 3).map((q) => (
              <div
                key={q.id}
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: '#f8fafc',
                  border: '1px solid #f1f5f9',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 800, fontSize: '0.82rem', color: '#0f172a' }}>
                    {q.customerName || q.company}
                  </span>
                  <span
                    style={{
                      fontSize: '0.66rem',
                      fontWeight: 800,
                      padding: '1px 6px',
                      borderRadius: 4,
                      background: q.priority === 'urgent' ? '#fef2f2' : '#ecfeff',
                      color: q.priority === 'urgent' ? '#dc2626' : '#0891b2',
                    }}
                  >
                    {q.priority ? q.priority.toUpperCase() : 'NORMAL'}
                  </span>
                </div>
                <div style={{ fontSize: '0.76rem', color: '#475569', marginTop: 3 }}>
                  {q.subject || q.title || 'Client inquiry regarding ad campaign pacing.'}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Middle: Desk 8 Follow-up & Tasks */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #a7f3d0',
            borderRadius: 14,
            padding: 20,
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  background: '#ecfdf5',
                  color: '#059669',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <Calendar size={15} />
              </div>
              <h3 style={{ margin: 0, fontSize: '0.94rem', fontWeight: 800, color: '#0f172a' }}>
                Tasks Today (Desk 08)
              </h3>
            </div>
            <button
              type="button"
              onClick={() => navigateToDesk('tasks', '#tasks')}
              className="sales-btn-secondary"
              style={{ fontSize: '0.74rem', padding: '4px 10px', color: '#059669' }}
            >
              Tasks ({tasks.length}) →
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tasks.slice(0, 3).map((t) => {
              const isDone = t.status === 'completed';
              return (
                <div
                  key={t.id}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: isDone ? '#f1f5f9' : '#f8fafc',
                    border: '1px solid #f1f5f9',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isDone}
                    onChange={() => handleToggleTask(t.id)}
                    style={{ cursor: 'pointer', width: 16, height: 16 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: '0.82rem',
                        color: isDone ? '#94a3b8' : '#0f172a',
                        textDecoration: isDone ? 'line-through' : 'none',
                      }}
                    >
                      {t.title || t.task}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                      👤 {t.customerName || t.assignedTo || 'Ad Client'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Desk 9 Customer Groups */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 14,
            padding: 20,
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  background: '#fdf2f8',
                  color: '#db2777',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <FolderTree size={15} />
              </div>
              <h3 style={{ margin: 0, fontSize: '0.94rem', fontWeight: 800, color: '#0f172a' }}>
                Customer Groups (Desk 09)
              </h3>
            </div>
            <button
              type="button"
              onClick={() => navigateToDesk('groups', '#groups')}
              className="sales-btn-secondary"
              style={{ fontSize: '0.74rem', padding: '4px 10px', color: '#db2777' }}
            >
              Groups →
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(groups.length > 0
              ? groups
              : [
                  { id: 'g1', name: 'VIP Enterprise Retainers', count: 12, color: '#4f46e5' },
                  { id: 'g2', name: 'High-Spend E-Commerce', count: 18, color: '#059669' },
                  { id: 'g3', name: 'New Client Onboarding', count: 8, color: '#d97706' },
                ]
            )
              .slice(0, 3)
              .map((grp) => (
                <div
                  key={grp.id}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: '#fdf2f8',
                    border: '1px solid #fce7f3',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: '0.82rem', color: '#831843' }}>
                    {grp.name}
                  </span>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: 9999,
                      background: '#ffffff',
                      color: '#db2777',
                      border: '1px solid #fbcfe8',
                    }}
                  >
                    {grp.count || 0} Clients
                  </span>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

