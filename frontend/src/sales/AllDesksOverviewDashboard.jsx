import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  ShieldCheck,
  Layers,
  CreditCard,
  Wallet,
  Phone,
  MessageSquare,
  RefreshCw,
  Send,
  FileText,
} from 'lucide-react';
import crmApi from '../services/crmApi';
import { DEFAULT_DESK_LEADS, formatIndianDateTime, resolveCustomerIdentity } from './OperationalDesksViews';
import { SmartTable } from '../components/SmartTabulator';
import SalesCustomerRemarkModal, {
  SalesRemarkInlineBadge,
  getCustomerFollowUpState,
} from './SalesCustomerRemarkModal';

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
  navigateToDesk,
  onRefresh,
}) {
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

  const [paymentRecords, setPaymentRecords] = useState(() => {
    try {
      const raw = localStorage.getItem('growthline_payment_records');
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return [];
  });

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [remarkCust, setRemarkCust] = useState(null);

  const handleOverviewRemarkUpdated = (updatedCust) => {
    if (!updatedCust) return;
    if (typeof setCustomers === 'function') {
      setCustomers((prev) =>
        prev.map((item) =>
          item.id === updatedCust.id || item.phone === updatedCust.phone ? { ...item, ...updatedCust } : item
        )
      );
    }
    setRemarkCust((prev) =>
      prev && (prev.id === updatedCust.id || prev.phone === updatedCust.phone)
        ? { ...prev, ...updatedCust }
        : prev
    );
  };

  const handleRefreshData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const fresh = await crmApi.syncStateFromPostgres();
      if (fresh) {
        if (Array.isArray(fresh.customers) && typeof setCustomers === 'function') {
          setCustomers(fresh.customers);
        }
        if (Array.isArray(fresh.verifications) && typeof setVerifications === 'function') {
          setVerifications(fresh.verifications);
        }
        if (Array.isArray(fresh.payments)) {
          setPaymentRecords(fresh.payments);
          if (typeof setInvoices === 'function') setInvoices(fresh.payments);
        }
        if (Array.isArray(fresh.leads)) {
          setLeads(fresh.leads);
        }
        if (Array.isArray(fresh.queries) && typeof setQueries === 'function') {
          setQueries(fresh.queries);
        }
      }
      if (typeof onRefresh === 'function') {
        await onRefresh();
      }
    } catch (_) {
    } finally {
      setIsRefreshing(false);
    }
  }, [onRefresh, setCustomers, setInvoices, setQueries, setVerifications]);

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
      } catch (e) {}
    };
    window.addEventListener('growthline_lead_added', handleLeadAdded);
    window.addEventListener('growthline_payment_recorded', handlePaymentAdded);
    window.addEventListener('growthline_payment_deleted', handlePaymentDeleted);
    window.addEventListener('growthline_customer_registered', handleCustomerSync);
    window.addEventListener('growthline_active_user_changed', handleCustomerSync);
    window.addEventListener('growthline_postgres_synced', handleCustomerSync);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('growthline_lead_added', handleLeadAdded);
      window.removeEventListener('growthline_payment_recorded', handlePaymentAdded);
      window.removeEventListener('growthline_payment_deleted', handlePaymentDeleted);
      window.removeEventListener('growthline_customer_registered', handleCustomerSync);
      window.removeEventListener('growthline_active_user_changed', handleCustomerSync);
      window.removeEventListener('growthline_postgres_synced', handleCustomerSync);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  // Metrics Calculations
  const totalRegistered = customers.length;
  const totalLeadsCount = leads.length;
  const unreadLeadsCount = leads.filter((l) => !Boolean(l.read || l.is_read || l.status === 'read')).length;

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
  const openQueriesCount = queries.filter((q) => q.status === 'open' || q.status === 'pending').length;

  return (
    <div className="desk-page-container" style={{ paddingBottom: 60 }}>
      {/* 1. MASTER HEADER / HERO */}
      <div className="desk-header" style={{ marginBottom: 20 }}>
        <div>
          <div className="desk-breadcrumb">
            AD MAFIA SALES OPERATIONS / EXECUTIVE OVERVIEW
          </div>
          <h1 className="desk-title" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span>Sales Operations Overview</span>
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
              <span className="sales-pulse-dot" style={{ width: 7, height: 7 }} /> Live Operations Feed
            </span>
          </h1>
          <p className="desk-subtitle">
            Real-time operational command across client registrations, verified +91 buyer lead delivery,
            ad wallet runway pacing, and settled revenue.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', maxWidth: '100%' }}>
          <button
            type="button"
            className="sales-btn-secondary"
            onClick={handleRefreshData}
            disabled={isRefreshing}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.82rem' }}
          >
            <RefreshCw size={14} className={isRefreshing ? 'spin' : ''} />{' '}
            {isRefreshing ? 'Syncing...' : 'Refresh Data'}
          </button>
          <button
            type="button"
            className="sales-btn-primary"
            onClick={() => navigateToDesk('leads', '#groups')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: '0.82rem',
              fontWeight: 700,
              background: 'linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)',
            }}
          >
            <Send size={14} strokeWidth={2.5} /> Broadcast Category Lead
          </button>
        </div>
      </div>

      {/* 2. EXECUTIVE KPI RIBBON */}
      <div className="desk-kpi-grid" style={{ marginBottom: 26 }}>
        <div className="desk-kpi-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="desk-kpi-label">TOTAL MANAGED ACCOUNTS</div>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--adm-soft-indigo-bg, #eef2ff)', color: '#4f46e5', display: 'grid', placeItems: 'center' }}>
              <Users size={15} />
            </div>
          </div>
          <div className="desk-kpi-val text-indigo">{totalRegistered}</div>
          <div className="desk-kpi-sub">
            <span style={{ color: '#059669', fontWeight: 700 }}>{profileCompletionRate}% Verified</span> • {activeFundedCount} funded campaigns
          </div>
        </div>

        <div className="desk-kpi-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="desk-kpi-label">VERIFIED BUYER LEADS</div>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--adm-soft-sky-bg, #f0f9ff)', color: '#0284c7', display: 'grid', placeItems: 'center' }}>
              <Layers size={15} />
            </div>
          </div>
          <div className="desk-kpi-val text-emerald">{totalLeadsCount} Leads</div>
          <div className="desk-kpi-sub">
            <span style={{ color: unreadLeadsCount > 0 ? '#d97706' : '#059669', fontWeight: 700 }}>
              {unreadLeadsCount} Unread by Client
            </span>{' '}
            • +91 direct mobile delivery
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
            <span style={{ color: '#059669', fontWeight: 700 }}>{paymentRecords.length || invoices.length} settled receipts</span>
            {openQueriesCount > 0 ? ` • ${openQueriesCount} open tickets` : ' • 100% reconciled'}
          </div>
        </div>
      </div>

      {/* 3. MAIN OPERATIONAL INTELLIGENCE TABLES (100% Full-Width Vertical Stack) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', width: '100%' }}>
        {/* 3.1 Live Inbound Leads */}
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
                  Live Buyer Mobile Leads
                </h3>
                <div style={{ fontSize: '0.75rem', color: 'var(--adm-text-muted, #64748b)' }}>
                  Verified +91 buyer mobile numbers with instant Call &amp; WhatsApp actions
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigateToDesk('leads', '#leads')}
              className="sales-btn-secondary"
              style={{ fontSize: '0.76rem', padding: '5px 12px' }}
            >
              Open Leads &amp; Distribution ({totalLeadsCount}) →
            </button>
          </div>

          <div className="desk-table-card">
            <SmartTable title="Live Buyer Mobile Leads" defaultPageSize={6} exportFilename="overview-inbound-leads">
              <table className="desk-table">
                <thead>
                  <tr>
                    <th>Buyer Mobile (+91)</th>
                    <th>Assigned Client</th>
                    <th>Category</th>
                    <th>Read Status</th>
                    <th>Assigned (IST)</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--adm-text-muted, #64748b)' }}>
                        No buyer mobile leads dispatched yet.
                      </td>
                    </tr>
                  ) : (
                    leads.map((l) => {
                      const rawDigits = String(l.phone || l.name || '').replace(/\D/g, '').slice(-10);
                      const cleanPhone = rawDigits.length === 10 ? `+91 ${rawDigits}` : l.phone || l.name || '—';
                      const assignedClient = l.company || l.assignedCompany || l.customerCompanyName || 'Client Workspace';
                      const isRead = Boolean(l.read || l.is_read || l.status === 'read');
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
                              {l.category || 'General'}
                            </span>
                          </td>
                          <td>
                            {isRead ? (
                              <span className="desk-pill pill-emerald" style={{ fontSize: '0.72rem', fontWeight: 800 }}>
                                ✓ Read
                              </span>
                            ) : (
                              <span className="desk-pill pill-amber" style={{ fontSize: '0.72rem', fontWeight: 800 }}>
                                ⏳ Unread
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
                                href={`tel:+91${rawDigits}`}
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

        {/* 3.2 Auto-Verified Customer Accounts */}
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
                  Self-serve WhatsApp OTP onboarding &amp; verified business accounts
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigateToDesk('customers', '#customers')}
              className="sales-btn-secondary"
              style={{ fontSize: '0.76rem', padding: '5px 12px' }}
            >
              All Customers ({customers.length}) →
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
                    <th>Status / Follow-Up</th>
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
                            <SalesRemarkInlineBadge customer={c} onOpen={setRemarkCust} />
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
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span className="desk-pill pill-emerald" style={{ fontSize: '0.72rem', fontWeight: 800 }}>
                                ✓ Auto-Verified
                              </span>
                              <button
                                type="button"
                                className="desk-action-btn"
                                onClick={() => setRemarkCust(c)}
                                style={{ padding: '3px 8px', fontSize: '0.73rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                title="Add follow-up remark or call reminder"
                              >
                                <FileText size={12} /> Remark
                                {getCustomerFollowUpState(c).count > 0 ? ` (${getCustomerFollowUpState(c).count})` : ''}
                              </button>
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

        {/* 3.3 Wallets & Runway Monitor */}
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
                  Wallets &amp; Runway Monitor
                </h3>
                <div style={{ fontSize: '0.75rem', color: 'var(--adm-text-muted, #64748b)' }}>
                  Daily ₹300 campaign burn rate &amp; active runway health
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => navigateToDesk('transactions', '#balance-logs')}
                className="sales-btn-secondary"
                style={{ fontSize: '0.76rem', padding: '5px 12px' }}
              >
                Balance Audit →
              </button>
              <button
                type="button"
                onClick={() => navigateToDesk('customers', '#wallets')}
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

        {/* 3.4 Payment Collection & Ledger */}
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
                  Settled Receipts &amp; Billing Ledger
                </h3>
                <div style={{ fontSize: '0.75rem', color: 'var(--adm-text-muted, #64748b)' }}>
                  Official GST tax invoices, Razorpay settlements &amp; reconciled receipts
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigateToDesk('transactions', '#payments')}
              className="sales-btn-secondary"
              style={{ fontSize: '0.76rem', padding: '5px 12px' }}
            >
              Settled Receipts →
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

      <SalesCustomerRemarkModal
        customer={remarkCust}
        onClose={() => setRemarkCust(null)}
        onCustomerUpdated={handleOverviewRemarkUpdated}
      />
    </div>
  );
}
