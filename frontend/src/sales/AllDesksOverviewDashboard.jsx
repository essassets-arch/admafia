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
  Clock,
  Phone,
  MessageSquare,
  ArrowRight,
  Sparkles,
  RefreshCw,
  Send,
  Eye,
  TrendingUp,
  UserCheck,
} from 'lucide-react';
import { DEFAULT_DESK_LEADS, formatIndianDateTime, resolveCustomerIdentity } from './OperationalDesksViews';
import { SmartTable } from '../components/SmartTabulator';

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
    } catch (e) { }
    return DEFAULT_DESK_LEADS || [];
  });

  const [paymentRecords, setPaymentRecords] = useState(() => {
    try {
      const raw = localStorage.getItem('growthline_payment_records');
      if (raw) return JSON.parse(raw);
    } catch (e) { }
    return [];
  });

  const [liveClock, setLiveClock] = useState(() => new Date());

  // 1-second interval clock for real-time timestamp display
  useEffect(() => {
    const timer = setInterval(() => setLiveClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

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
        } catch (err) { }
      }
    };
    const handlePaymentAdded = (e) => {
      const newPay = e?.detail;
      if (newPay) setPaymentRecords((prev) => [newPay, ...prev.filter((p) => p.id !== newPay.id)]);
    };
    const handlePaymentDeleted = (e) => {
      const delId = e?.detail?.id;
      const delReceipt = e?.detail?.receiptNumber;
      if (delId || delReceipt) {
        setPaymentRecords((prev) => prev.filter((p) => p.id !== delId && p.receiptNumber !== delReceipt));
      }
    };
    const handleCustomerSync = () => {
      try {
        const rawPay = localStorage.getItem('growthline_payment_records');
        if (rawPay) setPaymentRecords(JSON.parse(rawPay));
        const rawLeads = localStorage.getItem('growthline_all_leads');
        if (rawLeads) setLeads(JSON.parse(rawLeads));
      } catch (e) { }
    };
    window.addEventListener('growthline_lead_added', handleLeadAdded);
    window.addEventListener('growthline_payment_recorded', handlePaymentAdded);
    window.addEventListener('growthline_payment_deleted', handlePaymentDeleted);
    window.addEventListener('growthline_customer_registered', handleCustomerSync);
    window.addEventListener('growthline_active_user_changed', handleCustomerSync);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('growthline_lead_added', handleLeadAdded);
      window.removeEventListener('growthline_payment_recorded', handlePaymentAdded);
      window.removeEventListener('growthline_payment_deleted', handlePaymentDeleted);
      window.removeEventListener('growthline_customer_registered', handleCustomerSync);
      window.removeEventListener('growthline_active_user_changed', handleCustomerSync);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  // Metrics Calculations across all 9 Desks
  const totalRegistered = customers.length;
  const totalLeadsCount = leads.length;
  const urgentLeadsCount = leads.filter((l) => l.priority === 'Urgent').length;

  const completedProfiles = customers.filter(
    (c) => c.profileStatus === 'complete' || c.profile_status === 'complete' || (c.kycPercent || 0) >= 90
  ).length;
  const profileCompletionRate = totalRegistered > 0 ? Math.round((completedProfiles / totalRegistered) * 100) : 100;

  const totalCollectedRevenue =
    paymentRecords.length > 0
      ? paymentRecords.filter((r) => r.status === 'paid').reduce((sum, r) => sum + (r.amount || 0), 0)
      : invoices.filter((inv) => inv.status === 'paid').reduce((sum, inv) => sum + (inv.amount || 0), 0);

  const totalWalletReserves = customers.reduce((sum, c) => sum + (c.balance || c.walletBalance || 0), 0);
  const activeFundedCount = customers.filter((c) => (c.balance || 0) > 0).length;

  const openQueries = queries.filter((q) => q.status === 'open' || q.status === 'pending');
  const todayTasks = tasks.filter((t) => t.dueStatus === 'today' && t.status !== 'completed');
  const todayTasksBadge = todayTasks.length;

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
  const approvedMembersCount = approvedMembersList.length;

  // 9 Desks Master Definition for the Clean Navigation Hub
  const DESKS = [
    {
      id: 'customers',
      num: '01',
      title: 'Customer Registrations',
      badge: `${totalRegistered} Enrolled`,
      pillClass: 'pill-indigo',
      metric: `${totalRegistered}`,
      sub: 'Authoritative client database & onboarding profiles',
      action: 'Manage Registrations →',
      icon: Users,
      color: '#4f46e5',
      bg: 'var(--adm-soft-indigo-bg, #eef2ff)',
      target: '#customers',
    },
    {
      id: 'pending_verification',
      num: '02',
      title: 'Verification & Intake',
      badge: 'Auto-Verified ✓',
      pillClass: 'pill-emerald',
      metric: `${verifications.length}`,
      sub: '100% self-serve intake • Zero manual admin approval needed',
      action: 'View Intake Audit →',
      icon: ShieldCheck,
      color: '#059669',
      bg: 'var(--adm-soft-emerald-bg, #ecfdf5)',
      target: '#verification',
    },
    {
      id: 'approved',
      num: '02B',
      title: 'Approved Members',
      badge: '100% KYC & Paid',
      pillClass: 'pill-emerald',
      metric: `${approvedMembersCount} Members`,
      sub: 'Verified accounts with completed payment & profile • Live wallet balance',
      action: 'View Approved Members →',
      icon: UserCheck,
      color: 'var(--adm-soft-emerald-text, #15803d)',
      bg: 'var(--adm-soft-emerald-bg, #f0fdf4)',
      target: '#approved',
    },
    {
      id: 'leads',
      num: '03',
      title: 'Lead Management',
      badge: urgentLeadsCount > 0 ? `${urgentLeadsCount} Urgent SLA` : `${totalLeadsCount} Total`,
      pillClass: urgentLeadsCount > 0 ? 'pill-rose' : 'pill-indigo',
      metric: `${totalLeadsCount}`,
      sub: 'Speed-to-lead queue with direct Call & WhatsApp channels',
      action: 'Dispatch Leads →',
      icon: Layers,
      color: '#0284c7',
      bg: 'var(--adm-soft-sky-bg, #f0f9ff)',
      target: '#leads',
    },
    {
      id: 'profiles',
      num: '04',
      title: 'Profile Completion',
      badge: `${profileCompletionRate}% KYC`,
      pillClass: 'pill-emerald',
      metric: `${profileCompletionRate}%`,
      sub: 'KYC compliance, GST verification & corporate entity details',
      action: 'Complete Profiles →',
      icon: FileCheck2,
      color: '#d97706',
      bg: 'var(--adm-soft-amber-bg, #fffbeb)',
      target: '#profiles',
    },
    {
      id: 'payments',
      num: '05',
      title: 'Payment Collection',
      badge: '100% Reconciled',
      pillClass: 'pill-emerald',
      metric: formatINR(totalCollectedRevenue),
      sub: 'Official GST tax invoices, Razorpay receipts & ledger',
      action: 'View Billing Ledger →',
      icon: CreditCard,
      color: '#16a34a',
      bg: 'var(--adm-soft-emerald-bg, #f0fdf4)',
      target: '#payments',
    },
    {
      id: 'wallets',
      num: '06',
      title: 'Wallets & Balances',
      badge: '₹300/day pacing',
      pillClass: 'pill-indigo',
      metric: formatINR(totalWalletReserves),
      sub: 'Client ad wallet balances, auto-cut tracking & runway health',
      action: 'Manage Wallets →',
      icon: Wallet,
      color: '#4f46e5',
      bg: 'var(--adm-soft-indigo-bg, #eef2ff)',
      target: '#wallets',
    },
    {
      id: 'queries',
      num: '07',
      title: 'Query & Support',
      badge: `${openQueries.length} Open`,
      pillClass: openQueries.length > 0 ? 'pill-amber' : 'pill-emerald',
      metric: `${openQueries.length}`,
      sub: 'Client helpdesk, technical inquiries & WhatsApp routing',
      action: 'Open Support Desk →',
      icon: Headphones,
      color: '#8b5cf6',
      bg: 'var(--adm-soft-purple-bg, #f5f3ff)',
      target: '#queries',
    },
    {
      id: 'groups',
      num: '08',
      title: 'Lead Distribution',
      badge: 'Category Routing',
      pillClass: 'pill-indigo',
      metric: `${groups.length || 6} Categories`,
      sub: 'Instant 1-click lead distribution to matching industry categories',
      action: 'Distribute Leads →',
      icon: FolderTree,
      color: '#0891b2',
      bg: 'var(--adm-soft-cyan-bg, #ecfeff)',
      target: '#groups',
    },
    {
      id: 'tasks',
      num: '09',
      title: 'Tasks & Follow-ups',
      badge: `${todayTasksBadge} Due Today`,
      pillClass: todayTasksBadge > 0 ? 'pill-rose' : 'pill-indigo',
      metric: `${tasks.length}`,
      sub: 'Executive follow-up reminders, lead callbacks & action items',
      action: 'Open Action Tasks →',
      icon: Calendar,
      color: '#e11d48',
      bg: 'var(--adm-soft-rose-bg, #fff1f2)',
      target: '#tasks',
    },
  ];

  return (
    <div className="desk-page-container" style={{ paddingBottom: 60 }}>
      {/* 1. MASTER HEADER / HERO */}
      <div className="desk-header" style={{ marginBottom: 20 }}>
        <div>
          <div className="desk-breadcrumb">
            SUB ADMIN &amp; SUPPORT OPERATIONS / ALL-IN-ONE COMMAND CENTER
          </div>
          <h1 className="desk-title" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span>Operations Executive Dashboard</span>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 800,
                color: '#059669',
                background: 'var(--adm-soft-emerald-bg, #ecfdf5)',
                border: '1px solid var(--adm-soft-emerald-border, #a7f3d0)',
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
            Central real-time monitoring across client intake, automated verification, category lead distribution,
            ad wallet runway, and financial reconciliation.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', maxWidth: '100%' }}>
          {/* Live Indian Standard Time Real-Time Clock Badge */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 8,
              background: 'var(--adm-bg-subtle, #f8fafc)',
              border: '1px solid var(--adm-border-strong, #cbd5e1)',
              padding: '6px 12px',
              borderRadius: 8,
              fontSize: '0.80rem',
              fontWeight: 700,
              color: 'var(--adm-text-primary, #0f172a)',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
              fontVariantNumeric: 'tabular-nums',
              maxWidth: '100%',
              boxSizing: 'border-box',
            }}
          >
            <Clock size={15} color="#4f46e5" />
            <span>
              {liveClock.toLocaleDateString('en-IN', {
                weekday: 'short',
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })}{' '}
              •{' '}
              {liveClock.toLocaleTimeString('en-IN', {
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
                fontSize: '0.66rem',
                fontWeight: 800,
                color: '#059669',
                background: 'var(--adm-soft-emerald-bg, #ecfdf5)',
                border: '1px solid var(--adm-soft-emerald-border, #a7f3d0)',
                padding: '2px 6px',
                borderRadius: 4,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#10b981',
                }}
              />
              REAL-TIME
            </span>
          </div>

          <button
            type="button"
            className="sales-btn-secondary"
            onClick={() => window.location.reload()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.82rem' }}
          >
            <RefreshCw size={14} /> Refresh Data
          </button>
          <button
            type="button"
            className="sales-btn-primary"
            onClick={() => navigateToDesk('groups', '#groups')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: '0.82rem',
              fontWeight: 700,
              background: 'linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)',
            }}
          >
            <Send size={14} strokeWidth={2.5} /> Create &amp; Distribute Lead
          </button>
        </div>
      </div>

      {/* 2. EXECUTIVE KPI RIBBON */}
      <div className="desk-kpi-grid" style={{ marginBottom: 28 }}>
        <div className="desk-kpi-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="desk-kpi-label">TOTAL MANAGED ACCOUNTS</div>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--adm-soft-indigo-bg, #eef2ff)', color: '#4f46e5', display: 'grid', placeItems: 'center' }}>
              <Users size={15} />
            </div>
          </div>
          <div className="desk-kpi-val text-indigo">{totalRegistered}</div>
          <div className="desk-kpi-sub">
            <span style={{ color: '#059669', fontWeight: 700 }}>{profileCompletionRate}% Verified</span> • {activeFundedCount} active ad campaigns
          </div>
        </div>

        <div className="desk-kpi-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="desk-kpi-label">INBOUND LEAD FLOW</div>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--adm-soft-sky-bg, #f0f9ff)', color: '#0284c7', display: 'grid', placeItems: 'center' }}>
              <Layers size={15} />
            </div>
          </div>
          <div className="desk-kpi-val text-emerald">{totalLeadsCount} Leads</div>
          <div className="desk-kpi-sub">
            <span style={{ color: urgentLeadsCount > 0 ? '#dc2626' : '#059669', fontWeight: 700 }}>
              {urgentLeadsCount} Urgent SLA (&lt;5m)
            </span> • Real-time distribution
          </div>
        </div>

        <div className="desk-kpi-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="desk-kpi-label">ACTIVE WALLET RESERVES</div>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--adm-soft-emerald-bg, #f0fdf4)', color: '#16a34a', display: 'grid', placeItems: 'center' }}>
              <Wallet size={15} />
            </div>
          </div>
          <div className="desk-kpi-val text-emerald">{formatINR(totalWalletReserves)}</div>
          <div className="desk-kpi-sub">
            <span style={{ color: '#4f46e5', fontWeight: 700 }}>₹300/day</span> daily auto-cut campaign pacing
          </div>
        </div>

        <div className="desk-kpi-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="desk-kpi-label">GROSS SETTLED REVENUE</div>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--adm-soft-blue-bg, #eff6ff)', color: '#2563eb', display: 'grid', placeItems: 'center' }}>
              <CreditCard size={15} />
            </div>
          </div>
          <div className="desk-kpi-val text-indigo">{formatINR(totalCollectedRevenue)}</div>
          <div className="desk-kpi-sub">
            <span style={{ color: '#059669', fontWeight: 700 }}>{paymentRecords.length || invoices.length} settled receipts</span> • 100% online reconciliation
          </div>
        </div>
      </div>

      {/* 3. AUTHORIZED OPERATIONS DESKS HUB (Sleek High-Density 9-Desk Control Grid) */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <h2 style={{ fontSize: '0.98rem', fontWeight: 800, color: 'var(--adm-text-primary, #0f172a)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>
              Authorized Operations Desks (01 – 09)
            </h2>
            <div style={{ fontSize: '0.78rem', color: 'var(--adm-text-muted, #64748b)', marginTop: 2 }}>
              Click any operational desk card to open its dedicated workbench
            </div>
          </div>
        </div>

        <div className="sales-desks-hub-grid">
          {DESKS.map((d) => {
            const Icon = d.icon;
            return (
              <div
                key={d.id}
                onClick={() => navigateToDesk(d.id, d.target)}
                style={{
                  background: 'var(--adm-bg-card, #ffffff)',
                  border: '1px solid var(--adm-border, #e2e8f0)',
                  borderRadius: 12,
                  padding: '16px 18px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = d.color;
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = `0 6px 16px rgba(0, 0, 0, 0.07)`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--adm-border, #e2e8f0)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.03)';
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 9,
                          background: d.bg,
                          color: d.color,
                          display: 'grid',
                          placeItems: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <Icon size={18} strokeWidth={2.2} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '0.68rem', color: d.color, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          DESK {d.num}
                        </div>
                        <div style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--adm-text-primary, #0f172a)', overflowWrap: 'anywhere' }}>
                          {d.title}
                        </div>
                      </div>
                    </div>
                    <span className={`desk-pill ${d.pillClass}`} style={{ fontSize: '0.72rem' }}>
                      {d.badge}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                    <span style={{ fontSize: '1.45rem', fontWeight: 900, color: 'var(--adm-text-primary, #0f172a)' }}>
                      {d.metric}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--adm-text-muted, #64748b)', marginTop: 4, lineHeight: 1.4 }}>
                    {d.sub}
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 14,
                    paddingTop: 10,
                    borderTop: '1px solid var(--adm-border-subtle, #f1f5f9)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    color: d.color,
                  }}
                >
                  <span>{d.action}</span>
                  <ArrowRight size={14} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. MAIN OPERATIONAL INTELLIGENCE TABLES (100% Full-Width Vertical Stack) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', width: '100%' }}>
        {/* 4.1 Live Inbound Leads (Desk 03) */}
        <div
          style={{
            background: 'var(--adm-bg-card, #ffffff)',
            border: '1px solid var(--adm-border, #e2e8f0)',
            borderRadius: 16,
            padding: 20,
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--adm-soft-sky-bg, #f0f9ff)', color: '#0284c7', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <Layers size={17} />
              </div>
              <div style={{ minWidth: 0 }}>
                <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: 'var(--adm-text-primary, #0f172a)' }}>
                  Live Inbound Leads (Desk 03)
                </h3>
                <div style={{ fontSize: '0.75rem', color: 'var(--adm-text-muted, #64748b)' }}>
                  Direct contact channels with instant Call &amp; WhatsApp actions
                </div>
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

          <div className="desk-table-card">
            <SmartTable title="Live Inbound Leads" defaultPageSize={6} exportFilename="overview-inbound-leads">
              <table className="desk-table">
                <thead>
                  <tr>
                    <th>Buyer Phone</th>
                    <th>Assigned Client</th>
                    <th>Category</th>
                    <th>SLA / Priority</th>
                    <th>Received (IST)</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--adm-text-muted, #64748b)' }}>
                        No inbound leads recorded yet.
                      </td>
                    </tr>
                  ) : (
                    leads.map((l) => {
                      const rawDigits = String(l.phone || l.name || '').replace(/\D/g, '').slice(-10);
                      const cleanPhone = rawDigits.length === 10 ? `+91 ${rawDigits}` : (l.phone || l.name || '—');
                      const assignedClient = l.company || l.assignedCompany || l.customerCompanyName || 'Client Workspace';
                      return (
                        <tr key={l.id}>
                          <td>
                            <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '0.94rem', color: 'var(--adm-text-primary, #0f172a)' }}>
                              {cleanPhone}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--adm-soft-blue-text, #1e3a8a)' }}>
                              🏢 {assignedClient}
                            </span>
                          </td>
                          <td>
                            <span
                              style={{
                                background: 'var(--adm-bg-muted, #f1f5f9)',
                                color: 'var(--adm-text-body, #334155)',
                                padding: '2px 8px',
                                borderRadius: 6,
                                fontSize: '0.75rem',
                                fontWeight: 700,
                              }}
                            >
                              {l.category || 'General Inbound'}
                            </span>
                          </td>
                          <td>
                            {l.priority === 'Urgent' ? (
                              <span className="desk-pill pill-rose" style={{ fontSize: '0.72rem', fontWeight: 800 }}>
                                Urgent SLA
                              </span>
                            ) : (
                              <span className="desk-pill pill-emerald" style={{ fontSize: '0.72rem', fontWeight: 800 }}>
                                New Inbound
                              </span>
                            )}
                          </td>
                          <td>
                            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--adm-text-body, #475569)' }}>
                              {l.createdAt || l.time
                                ? formatIndianDateTime(l.createdAt || l.time, l.createdAtRaw || l.created_at)
                                : '—'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                              <a
                                href={`tel:${rawDigits}`}
                                className="desk-action-btn"
                                style={{
                                  padding: '5px 10px',
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
                                  padding: '5px 10px',
                                  fontSize: '0.75rem',
                                  textDecoration: 'none',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  background: 'var(--adm-soft-emerald-bg, #ecfdf5)',
                                  color: 'var(--adm-soft-emerald-text, #065f46)',
                                  borderColor: 'var(--adm-soft-emerald-border, #a7f3d0)',
                                }}
                              >
                                <MessageSquare size={13} color="#059669" /> WhatsApp
                              </a>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </SmartTable>
          </div>
        </div>

        {/* 4.2 Auto-Verified Customer Accounts */}
        <div
          style={{
            background: 'var(--adm-bg-card, #ffffff)',
            border: '1px solid var(--adm-border, #e2e8f0)',
            borderRadius: 16,
            padding: 20,
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--adm-soft-emerald-bg, #ecfdf5)', color: '#059669', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <ShieldCheck size={17} />
              </div>
              <div style={{ minWidth: 0 }}>
                <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: 'var(--adm-text-primary, #0f172a)' }}>
                  Auto-Verified Customer Accounts
                </h3>
                <div style={{ fontSize: '0.75rem', color: 'var(--adm-text-muted, #64748b)' }}>
                  100% self-serve onboarding &amp; automated KYC intake audit
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigateToDesk('pending_verification', '#verification')}
              className="sales-btn-secondary"
              style={{ fontSize: '0.76rem', padding: '5px 12px' }}
            >
              Intake Audit ({verifications.length}) →
            </button>
          </div>

          <div className="desk-table-card">
            <SmartTable title="Auto-Verified Customer Accounts" defaultPageSize={6} exportFilename="overview-verified-accounts">
              <table className="desk-table">
                <thead>
                  <tr>
                    <th>Company &amp; Workspace</th>
                    <th>Contact &amp; Phone</th>
                    <th>City</th>
                    <th>Verified At</th>
                    <th>Wallet Balance</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--adm-text-muted, #64748b)' }}>
                        No auto-verified customer accounts yet.
                      </td>
                    </tr>
                  ) : (
                    customers.map((c) => {
                      const identity = resolveCustomerIdentity(c, customers);
                      const cleanPhone = String(c.phone || '').replace(/\D/g, '').slice(-10);
                      return (
                        <tr key={c.id}>
                          <td>
                            <div style={{ fontWeight: 800, fontSize: '0.90rem', color: 'var(--adm-text-primary, #0f172a)' }}>
                              {identity.displayName}
                            </div>
                            {identity.username && (
                              <div style={{ marginTop: 2 }}>
                                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#4f46e5', background: 'var(--adm-soft-indigo-bg, #eef2ff)', padding: '1px 6px', borderRadius: 4 }}>
                                  @{identity.username}
                                </span>
                              </div>
                            )}
                          </td>
                          <td>
                            <div style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--adm-text-primary, #0f172a)' }}>
                              {identity.contactPerson}
                            </div>
                            <div style={{ fontSize: '0.80rem', fontFamily: 'monospace', fontWeight: 700, color: '#059669', marginTop: 2 }}>
                              +91 {cleanPhone || c.phone}
                            </div>
                          </td>
                          <td>
                            <span style={{ fontWeight: 600, fontSize: '0.84rem', color: 'var(--adm-text-body, #334155)' }}>
                              {c.city || 'India'}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontSize: '0.82rem', color: 'var(--adm-text-body, #475569)', fontWeight: 600 }}>
                              {formatIndianDateTime(
                                c.completedAt || c.registeredAt,
                                c.completedAt || c.registeredAtRaw || c.registered_at
                              )}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--adm-text-primary, #0f172a)' }}>
                              {formatINR(c.balance || c.walletBalance || 0)}
                            </span>
                          </td>
                          <td>
                            <span className="desk-pill pill-emerald" style={{ fontSize: '0.72rem', fontWeight: 800 }}>
                              ✓ Auto-Verified
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </SmartTable>
          </div>
        </div>

        {/* 4.3 Wallets & Runway Monitor (Desk 06) */}
        <div
          style={{
            background: 'var(--adm-bg-card, #ffffff)',
            border: '1px solid var(--adm-border, #e2e8f0)',
            borderRadius: 16,
            padding: 20,
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--adm-soft-indigo-bg, #eef2ff)', color: '#4f46e5', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <Wallet size={17} />
              </div>
              <div style={{ minWidth: 0 }}>
                <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: 'var(--adm-text-primary, #0f172a)' }}>
                  Wallets &amp; Runway Monitor (Desk 06)
                </h3>
                <div style={{ fontSize: '0.75rem', color: 'var(--adm-text-muted, #64748b)' }}>
                  Daily ₹300 campaign burn rate &amp; active runway health
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => navigateToDesk('balance_logs', '#balance-logs')}
                className="sales-btn-secondary"
                style={{ fontSize: '0.76rem', padding: '5px 12px' }}
              >
                Balance Logs →
              </button>
              <button
                type="button"
                onClick={() => navigateToDesk('wallets', '#wallets')}
                className="sales-btn-secondary"
                style={{ fontSize: '0.76rem', padding: '5px 12px' }}
              >
                Open Wallets ({customers.length}) →
              </button>
            </div>
          </div>

          <div className="desk-table-card">
            <SmartTable title="Wallets & Runway Monitor" defaultPageSize={6} exportFilename="overview-wallets-runway">
              <table className="desk-table">
                <thead>
                  <tr>
                    <th>Company &amp; Workspace</th>
                    <th>City</th>
                    <th>Daily Pacing</th>
                    <th>Wallet Balance</th>
                    <th>Runway Days</th>
                    <th>Health</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--adm-text-muted, #64748b)' }}>
                        No client wallets recorded yet.
                      </td>
                    </tr>
                  ) : (
                    customers.map((c) => {
                      const identity = resolveCustomerIdentity(c, customers);
                      const bal = Number(c.balance || c.walletBalance || 0);
                      const pacing = Number(c.dailyPacing || c.dailyAdSpend || 300);
                      const runway = c.runwayDays ?? Math.floor(bal / Math.max(pacing, 1));
                      const isLowBalance = bal < pacing || bal <= 0 || runway <= 1;
                      return (
                        <tr key={c.id}>
                          <td>
                            <div style={{ fontWeight: 800, fontSize: '0.90rem', color: 'var(--adm-text-primary, #0f172a)' }}>
                              {identity.displayName}
                            </div>
                            {identity.username && (
                              <div style={{ marginTop: 2 }}>
                                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#4f46e5', background: 'var(--adm-soft-indigo-bg, #eef2ff)', padding: '1px 6px', borderRadius: 4 }}>
                                  @{identity.username}
                                </span>
                              </div>
                            )}
                          </td>
                          <td>
                            <span style={{ fontWeight: 600, fontSize: '0.84rem', color: 'var(--adm-text-body, #334155)' }}>
                              {c.city || 'India'}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontWeight: 800, fontSize: '0.86rem', color: '#4f46e5' }}>
                              ₹{pacing}/day
                            </span>
                          </td>
                          <td>
                            <span style={{ fontSize: '0.96rem', fontWeight: 900, color: !isLowBalance ? 'var(--adm-text-primary, #0f172a)' : '#e11d48' }}>
                              {formatINR(bal)}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontWeight: 800, fontSize: '0.86rem', color: !isLowBalance ? '#059669' : '#e11d48' }}>
                              {runway} Days
                            </span>
                          </td>
                          <td>
                            {isLowBalance ? (
                              <span className="desk-pill pill-rose" style={{ fontSize: '0.72rem', fontWeight: 800 }}>
                                ⚠️ Low Balance
                              </span>
                            ) : (
                              <span className="desk-pill pill-emerald" style={{ fontSize: '0.72rem', fontWeight: 800 }}>
                                Healthy
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </SmartTable>
          </div>
        </div>

        {/* 4.4 Payment Collection & Ledger (Desk 05) */}
        <div
          style={{
            background: 'var(--adm-bg-card, #ffffff)',
            border: '1px solid var(--adm-border, #e2e8f0)',
            borderRadius: 16,
            padding: 20,
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--adm-soft-emerald-bg, #f0fdf4)', color: '#16a34a', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <CreditCard size={17} />
              </div>
              <div style={{ minWidth: 0 }}>
                <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: 'var(--adm-text-primary, #0f172a)' }}>
                  Payment Collection &amp; Ledger (Desk 05)
                </h3>
                <div style={{ fontSize: '0.75rem', color: 'var(--adm-text-muted, #64748b)' }}>
                  Official GST tax invoices, Razorpay settlements &amp; reconciled receipts
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigateToDesk('payments', '#payments')}
              className="sales-btn-secondary"
              style={{ fontSize: '0.76rem', padding: '5px 12px' }}
            >
              Billing Ledger →
            </button>
          </div>

          <div className="desk-table-card">
            <SmartTable title="Payment Collection & Ledger" defaultPageSize={6} exportFilename="overview-payment-ledger">
              <table className="desk-table">
                <thead>
                  <tr>
                    <th>Customer / Entity</th>
                    <th>Receipt / UTR Ref</th>
                    <th>Date (IST)</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(paymentRecords.length > 0 ? paymentRecords : invoices).length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--adm-text-muted, #64748b)' }}>
                        No settled payment records yet.
                      </td>
                    </tr>
                  ) : (
                    (paymentRecords.length > 0 ? paymentRecords : invoices).map((item) => (
                      <tr key={item.id || item.receiptNumber || item.invoiceNumber}>
                        <td>
                          <span style={{ fontWeight: 800, fontSize: '0.90rem', color: 'var(--adm-text-primary, #0f172a)' }}>
                            {item.customerName || item.companyName || item.client || 'Client Account'}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.84rem', color: 'var(--adm-text-body, #334155)' }}>
                            {item.receiptNumber || item.receiptNo || item.invoiceNumber || item.utr || 'REC-SETTLED'}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--adm-text-body, #475569)' }}>
                            {formatIndianDateTime(item.date, item.paid_at_raw || item.paid_at)}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontSize: '0.94rem', fontWeight: 900, color: '#059669' }}>
                            {formatINR(item.amount)}
                          </span>
                        </td>
                        <td>
                          <span className="desk-pill pill-emerald" style={{ fontSize: '0.72rem', fontWeight: 800 }}>
                            PAID ✓
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </SmartTable>
          </div>
        </div>
      </div>
    </div>
  );
}
