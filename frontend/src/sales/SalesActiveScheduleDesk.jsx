import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  RefreshCw,
  Phone,
  MessageSquare,
  Plus,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Rocket,
  Image as ImageIcon,
  Search,
  Users,
  Wallet,
  Layers,
} from 'lucide-react';
import crmApi from '../services/crmApi';
import { SmartTable } from '../components/SmartTabulator';
import SalesCustomerRemarkModal, {
  SalesRemarkInlineBadge,
  getCustomerFollowUpState,
} from './SalesCustomerRemarkModal';
import {
  buildCustomerLeadHref,
  navigateToCustomerLeadPage,
} from './customerLeadNavigation';

const formatINR = (val, currency = 'INR') => {
  const num = Number(val || 0);
  if (String(currency).toUpperCase() === 'USD') {
    return `$${num.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(num);
};

export default function SalesActiveScheduleDesk({ customers = [], setCustomers }) {
  const [selectedDate, setSelectedDate] = useState(() =>
    new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  );
  const [scheduleData, setScheduleData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'campaign_live' | 'campaign_off' | 'zero_leads'
  const [remarkCust, setRemarkCust] = useState(null);
  const [previewMedia, setPreviewMedia] = useState(null);
  const [releasingCustId, setReleasingCustId] = useState('');

  const loadSchedule = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      try {
        const res = await crmApi.getActiveDeliverySchedule({ date: selectedDate });
        if (res && res.ok) {
          setScheduleData(res);
        }
      } catch (err) {
        console.error('[SalesActiveScheduleDesk] Load error:', err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selectedDate]
  );

  useEffect(() => {
    loadSchedule(false);
    const timer = setInterval(() => loadSchedule(true), 30000);
    return () => clearInterval(timer);
  }, [loadSchedule]);

  const summary = scheduleData?.summary || {
    scheduledClientsCount: 0,
    totalScheduledBudget: 0,
    totalBookedSettledBudget: 0,
    campaignsRunningCount: 0,
    campaignsDelayedCount: 0,
    totalLeadsDeliveredOnDate: 0,
    zeroLeadActiveClientsCount: 0,
  };
  const forecast7d = scheduleData?.forecast7d || [];
  const rawClients = scheduleData?.clients || [];

  const filteredClients = rawClients.filter((c) => {
    const q = search.trim().toLowerCase();
    const matchSearch =
      !q ||
      (c.companyName || '').toLowerCase().includes(q) ||
      (c.contactPerson || '').toLowerCase().includes(q) ||
      (c.username || '').toLowerCase().includes(q) ||
      (c.phone || '').includes(q) ||
      (c.category || '').toLowerCase().includes(q) ||
      (c.city || '').toLowerCase().includes(q) ||
      (c.latestSalesRemark || '').toLowerCase().includes(q);
    if (!matchSearch) return false;
    if (statusFilter === 'campaign_live') return c.isCampaignLive;
    if (statusFilter === 'spillover') return Boolean(c.isSpilloverUnpaidToday);
    if (statusFilter === 'held_leads') return Number(c.heldLeadsCount || 0) > 0;
    if (statusFilter === 'campaign_off') return !c.isCampaignLive && c.isScheduledOnDate;
    if (statusFilter === 'zero_leads') return (c.leadsDeliveredOnDate || 0) === 0 && c.isScheduledOnDate;
    return true;
  });

  const handleReleaseAllForClient = async (client) => {
    setReleasingCustId(client.id);
    try {
      await crmApi.releaseHeldLeads({ customerId: client.id });
      await loadSchedule(true);
    } catch (err) {
      console.error('[SalesActiveScheduleDesk] Release error:', err);
    } finally {
      setReleasingCustId('');
    }
  };

  const handleRemarkUpdated = (updatedCust) => {
    if (!updatedCust) return;
    setScheduleData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        clients: (prev.clients || []).map((item) =>
          item.id === updatedCust.id || item.phone === updatedCust.phone
            ? {
                ...item,
                salesRemarks: updatedCust.salesRemarks,
                latestSalesRemark: updatedCust.latestSalesRemark,
                latestSalesRemarkAt: updatedCust.latestSalesRemarkAt,
                latestSalesRemarkBy: updatedCust.latestSalesRemarkBy,
                nextFollowUpAt: updatedCust.nextFollowUpAt,
                followUpStatus: updatedCust.followUpStatus,
              }
            : item
        ),
      };
    });
    if (typeof setCustomers === 'function') {
      setCustomers((prev) =>
        prev.map((c) =>
          c.id === updatedCust.id || c.phone === updatedCust.phone ? { ...c, ...updatedCust } : c
        )
      );
    }
    setRemarkCust((prev) =>
      prev && (prev.id === updatedCust.id || prev.phone === updatedCust.phone)
        ? { ...prev, ...updatedCust }
        : prev
    );
  };

  return (
    <div className="desk-page-container">
      {/* 1. Desk Header */}
      <div className="desk-header">
        <div>
          <div className="desk-breadcrumb">SALES &amp; LEAD FULFILLMENT / DAILY SCHEDULE RADAR</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 className="desk-title">Active Leads Delivery Schedule</h1>
            <span className="desk-pill pill-indigo" style={{ fontWeight: 800 }}>
              {summary.dayLabel || selectedDate}
            </span>
            {summary.isToday && (
              <span className="desk-pill pill-emerald" style={{ fontWeight: 800 }}>
                ● LIVE TODAY (IST)
              </span>
            )}
          </div>
          <p className="desk-subtitle">
            Real-time list of clients who scheduled buyer leads for Today, Tomorrow, Day After, or upcoming dates — with total daily budget, live Marketing campaign status, and leads dispatched.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'var(--adm-bg-card, #ffffff)',
              border: '1px solid var(--adm-border-strong, #cbd5e1)',
              borderRadius: 10,
              padding: '5px 10px',
            }}
          >
            <Calendar size={14} color="#6366f1" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
              style={{
                border: 'none',
                background: 'transparent',
                color: 'var(--adm-text-primary, #0f172a)',
                fontWeight: 700,
                fontSize: '0.82rem',
                outline: 'none',
                cursor: 'pointer',
              }}
              title="Inspect schedule for any date"
            />
          </div>

          <button
            type="button"
            className="sales-btn-secondary"
            onClick={() => loadSchedule(true)}
            disabled={refreshing}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
            <span>{refreshing ? 'Syncing...' : 'Live Sync'}</span>
          </button>
        </div>
      </div>

      {/* 2. Interactive 7-Day Forecast Selector Strip (Today, Tomorrow, Day After, +4 Days) */}
      {forecast7d.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))',
            gap: 10,
            marginBottom: 18,
          }}
        >
          {forecast7d.map((day) => {
            const isSelected = day.dateIso === selectedDate;
            const badgeTag = day.isToday
              ? 'TODAY'
              : day.isTomorrow
                ? 'TOMORROW'
                : day.isDayAfter
                  ? 'DAY AFTER'
                  : day.dayCode;
            return (
              <button
                key={day.dateIso}
                type="button"
                onClick={() => setSelectedDate(day.dateIso)}
                style={{
                  textAlign: 'left',
                  padding: '12px 14px',
                  borderRadius: 12,
                  cursor: 'pointer',
                  transition: 'all 0.16s ease',
                  border: isSelected
                    ? '2px solid #4f46e5'
                    : '1px solid var(--adm-border, #e2e8f0)',
                  background: isSelected
                    ? 'var(--adm-soft-indigo-bg, #eef2ff)'
                    : 'var(--adm-bg-card, #ffffff)',
                  boxShadow: isSelected ? '0 6px 16px rgba(79, 70, 229, 0.16)' : 'none',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
                  <span
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      letterSpacing: '0.04em',
                      color: day.isToday ? '#059669' : isSelected ? '#4f46e5' : 'var(--adm-text-muted, #64748b)',
                    }}
                  >
                    {badgeTag}
                  </span>
                  <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--adm-text-muted, #64748b)' }}>
                    {day.shortDate}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: '1.12rem',
                    fontWeight: 900,
                    color: 'var(--adm-text-primary, #0f172a)',
                    marginTop: 5,
                  }}
                >
                  {day.scheduledClientsCount} {day.scheduledClientsCount === 1 ? 'Client' : 'Clients'}
                </div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#059669', marginTop: 2 }}>
                  Budget: {formatINR(day.totalScheduledBudget)}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* 3. Critical Bottleneck Alert Strip (if campaigns OFF today or 0 leads) */}
      {summary.isToday && (summary.campaignsDelayedCount > 0 || summary.zeroLeadActiveClientsCount > 0) && (
        <div
          style={{
            background: 'var(--adm-soft-amber-bg, #fffbeb)',
            border: '1.5px solid var(--adm-soft-amber-border, #fcd34d)',
            borderRadius: 12,
            padding: '12px 16px',
            marginBottom: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <AlertTriangle size={19} color="#d97706" style={{ flexShrink: 0 }} />
            <div style={{ fontSize: '0.84rem', color: 'var(--adm-soft-amber-text, #92400e)', fontWeight: 700 }}>
              <strong>Live Fulfillment Check:</strong>{' '}
              {summary.campaignsDelayedCount > 0 && (
                <span>
                  {summary.campaignsDelayedCount} scheduled client{summary.campaignsDelayedCount > 1 ? 's have' : ' has'} Marketing Campaign OFF.{' '}
                </span>
              )}
              {summary.zeroLeadActiveClientsCount > 0 && (
                <span>
                  {summary.zeroLeadActiveClientsCount} active client{summary.zeroLeadActiveClientsCount > 1 ? 's are' : ' is'} still awaiting today&apos;s first buyer lead.
                </span>
              )}
            </div>
          </div>
          {summary.zeroLeadActiveClientsCount > 0 && (
            <button
              type="button"
              className="desk-action-btn"
              onClick={() => setStatusFilter('zero_leads')}
              style={{
                background: '#d97706',
                borderColor: '#b45309',
                color: '#ffffff',
                fontWeight: 800,
              }}
            >
              Show 0-Lead Clients ({summary.zeroLeadActiveClientsCount})
            </button>
          )}
        </div>
      )}

      {/* 4. KPI Quad Grid */}
      <div className="desk-kpi-grid">
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">ACTIVE SCHEDULED CLIENTS</div>
          <div className="desk-kpi-val text-indigo">{summary.scheduledClientsCount}</div>
          <div className="desk-kpi-sub">Requesting leads on {summary.dayLabel || selectedDate}</div>
        </div>

        <div className="desk-kpi-card">
          <div className="desk-kpi-label">TOTAL CLIENT DAILY BUDGET</div>
          <div className="desk-kpi-val text-emerald">{formatINR(summary.totalScheduledBudget)}</div>
          <div className="desk-kpi-sub">
            {formatINR(summary.totalBookedSettledBudget)} settled •{' '}
            {formatINR(Math.max(0, summary.totalScheduledBudget - summary.totalBookedSettledBudget))} funded
          </div>
        </div>

        <div className="desk-kpi-card">
          <div className="desk-kpi-label">MARKETING CAMPAIGNS</div>
          <div className="desk-kpi-val" style={{ color: summary.campaignsDelayedCount > 0 ? '#d97706' : '#059669' }}>
            {summary.campaignsRunningCount} Live{' '}
            <span style={{ fontSize: '0.95rem', color: 'var(--adm-text-muted, #64748b)' }}>
              / {summary.scheduledClientsCount}
            </span>
          </div>
          <div className="desk-kpi-sub">
            {summary.campaignsDelayedCount > 0
              ? `⚠️ ${summary.campaignsDelayedCount} scheduled client(s) campaign OFF`
              : '✓ All scheduled campaigns running'}
          </div>
        </div>

        <div className="desk-kpi-card">
          <div className="desk-kpi-label">LEADS DELIVERED ({summary.isToday ? 'TODAY' : 'DATE'})</div>
          <div className="desk-kpi-val text-indigo">{summary.totalLeadsDeliveredOnDate}</div>
          <div className="desk-kpi-sub">
            {summary.zeroLeadActiveClientsCount > 0
              ? `${summary.zeroLeadActiveClientsCount} client(s) at 0 leads`
              : 'All scheduled clients served'}
          </div>
        </div>
      </div>

      {/* 5. Filter & Search Bar */}
      <div className="desk-filter-bar">
        <div className="desk-tabs">
          <button
            type="button"
            className={`desk-tab ${statusFilter === 'all' ? 'active' : ''}`}
            onClick={() => setStatusFilter('all')}
          >
            All Active ({rawClients.length})
          </button>
          <button
            type="button"
            className={`desk-tab ${statusFilter === 'campaign_live' ? 'active' : ''}`}
            onClick={() => setStatusFilter('campaign_live')}
          >
            🟢 In-House Live ({rawClients.filter((c) => c.isCampaignLive).length})
          </button>
          <button
            type="button"
            className={`desk-tab ${statusFilter === 'spillover' ? 'active' : ''}`}
            onClick={() => setStatusFilter('spillover')}
          >
            🟡 24h Spillover / Unpaid ({rawClients.filter((c) => c.isSpilloverUnpaidToday).length})
          </button>
          <button
            type="button"
            className={`desk-tab ${statusFilter === 'held_leads' ? 'active' : ''}`}
            onClick={() => setStatusFilter('held_leads')}
          >
            📦 Held in Line-Up ({rawClients.filter((c) => Number(c.heldLeadsCount || 0) > 0).length})
          </button>
          <button
            type="button"
            className={`desk-tab ${statusFilter === 'campaign_off' ? 'active' : ''}`}
            onClick={() => setStatusFilter('campaign_off')}
          >
            🔴 Paid Today — Campaign OFF ({rawClients.filter((c) => !c.isCampaignLive && c.isScheduledOnDate).length})
          </button>
          <button
            type="button"
            className={`desk-tab ${statusFilter === 'zero_leads' ? 'active' : ''}`}
            onClick={() => setStatusFilter('zero_leads')}
          >
            ⚡ 0 Leads Sent ({rawClients.filter((c) => (c.leadsDeliveredOnDate || 0) === 0 && c.isScheduledOnDate).length})
          </button>
        </div>

        <div className="desk-search-wrap">
          <Search size={16} className="desk-search-icon" />
          <input
            type="text"
            className="desk-search-input"
            placeholder="Search client, phone, category, city..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* 6. Active Schedule SmartTable */}
      <div className="desk-table-card">
        <SmartTable
          title={`Active Leads Schedule (${selectedDate})`}
          exportFilename={`sales-active-schedule-${selectedDate}`}
          defaultPageSize={15}
        >
          <table className="desk-table">
            <thead>
              <tr>
                <th>Client &amp; Territory</th>
                <th>Scheduled Budget &amp; Wallet</th>
                <th>Marketing Campaign &amp; Creative</th>
                <th>Leads Delivered</th>
                <th>Pipeline / Delay Check</th>
                <th style={{ textAlign: 'right' }}>Direct Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '42px', color: 'var(--adm-text-muted, #64748b)' }}>
                    <RefreshCw size={22} className="spin" style={{ marginBottom: 8 }} />
                    <div>Loading scheduled active clients...</div>
                  </td>
                </tr>
              ) : filteredClients.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '42px', color: 'var(--adm-text-muted, #64748b)' }}>
                    <Calendar size={34} style={{ opacity: 0.45, marginBottom: 8 }} />
                    <div style={{ fontWeight: 800, color: 'var(--adm-text-primary, #0f172a)' }}>
                      No clients scheduled for {summary.dayLabel || selectedDate} matching this filter
                    </div>
                    <div style={{ fontSize: '0.82rem', marginTop: 4 }}>
                      Select another date tab above (Today / Tomorrow / Day After) to inspect upcoming schedules.
                    </div>
                  </td>
                </tr>
              ) : (
                filteredClients.map((c) => (
                  <tr key={c.id}>
                    {/* 1. Client & Territory */}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {c.marketingCode && (
                          <span
                            style={{
                              fontSize: '0.7rem',
                              fontWeight: 900,
                              fontFamily: 'monospace',
                              color: '#ffffff',
                              background: '#4f46e5',
                              padding: '1px 6px',
                              borderRadius: 5,
                            }}
                          >
                            {c.marketingCode}
                          </span>
                        )}
                        <strong style={{ fontSize: '0.94rem', color: 'var(--adm-text-primary, #0f172a)' }}>
                          {c.companyName}
                        </strong>
                        {c.username && (
                          <span
                            style={{
                              fontSize: '0.73rem',
                              fontWeight: 800,
                              color: '#4f46e5',
                              background: 'var(--adm-soft-indigo-bg, #eef2ff)',
                              padding: '1px 6px',
                              borderRadius: 5,
                            }}
                          >
                            @{c.username}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.76rem', color: 'var(--adm-text-muted, #64748b)', marginTop: 3 }}>
                        {c.category || 'Category Pending'} • {[c.city, c.state].filter(Boolean).join(', ') || 'India'}
                      </div>
                      <div style={{ fontSize: '0.79rem', fontFamily: 'monospace', fontWeight: 800, color: '#059669', marginTop: 2 }}>
                        +91 {c.phone}
                      </div>
                      <SalesRemarkInlineBadge customer={c} onOpen={setRemarkCust} />
                    </td>

                    {/* 2. Scheduled Budget & Wallet */}
                    <td>
                      <div style={{ fontSize: '1.02rem', fontWeight: 900, color: 'var(--adm-text-primary, #0f172a)' }}>
                        {formatINR(c.dailyBudget, c.currency)} <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--adm-text-muted, #64748b)' }}>/ day</span>
                      </div>
                      <div style={{ marginTop: 4, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {c.isBookedOnDate ? (
                          <span className="desk-pill pill-emerald" style={{ fontSize: '0.68rem', fontWeight: 800 }}>
                            ✓ Paid &amp; Settled
                          </span>
                        ) : c.isScheduledOnDate ? (
                          <span className="desk-pill pill-indigo" style={{ fontSize: '0.68rem', fontWeight: 800 }}>
                            ● Wallet Funded
                          </span>
                        ) : (
                          <span className="desk-pill pill-rose" style={{ fontSize: '0.68rem', fontWeight: 800 }}>
                            🔴 User Side OFF (Unpaid Today)
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.73rem', color: 'var(--adm-text-muted, #64748b)', marginTop: 3 }}>
                        Wallet Left: <strong>{formatINR(c.walletBalance, c.currency)}</strong> ({c.runwayDays}d extra)
                      </div>
                    </td>

                    {/* 3. Marketing Campaign & Creative */}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {c.activeCreativeUrl ? (
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewMedia({
                                url: c.activeCreativeUrl,
                                title: c.activeCreativeTitle || c.companyName,
                                mediaType: c.activeCreativeMediaType,
                              })
                            }
                            style={{
                              width: 42,
                              height: 42,
                              borderRadius: 8,
                              overflow: 'hidden',
                              border: '1.5px solid var(--adm-border-strong, #cbd5e1)',
                              padding: 0,
                              background: '#0f172a',
                              cursor: 'pointer',
                              flexShrink: 0,
                            }}
                            title="Click to preview active campaign creative"
                          >
                            {c.activeCreativeMediaType === 'video' || /\.mp4$/i.test(c.activeCreativeUrl) ? (
                              <video src={c.activeCreativeUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
                            ) : (
                              <img
                                src={c.activeCreativeUrl}
                                alt={c.activeCreativeTitle || 'Creative'}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              />
                            )}
                          </button>
                        ) : (
                          <div
                            style={{
                              width: 42,
                              height: 42,
                              borderRadius: 8,
                              border: '1px dashed var(--adm-border-strong, #cbd5e1)',
                              display: 'grid',
                              placeItems: 'center',
                              color: 'var(--adm-text-muted, #94a3b8)',
                              flexShrink: 0,
                            }}
                            title="No creative uploaded yet"
                          >
                            <ImageIcon size={16} />
                          </div>
                        )}

                        <div style={{ minWidth: 0 }}>
                          {c.isCampaignLive ? (
                            <span
                              className={`desk-pill ${c.isSpilloverUnpaidToday ? 'pill-amber' : 'pill-emerald'}`}
                              style={{ fontWeight: 800, fontSize: '0.72rem' }}
                            >
                              {c.isSpilloverUnpaidToday ? '🟡 24h Spillover LIVE' : '🟢 Campaign LIVE'}{' '}
                              {c.campaignRunningLabel ? `(${c.campaignRunningLabel})` : ''}
                            </span>
                          ) : (
                            <span className="desk-pill pill-rose" style={{ fontWeight: 800, fontSize: '0.72rem' }}>
                              🔴 {c.campaignStatus === 'Not Created' ? 'No Campaign Started' : `Campaign ${c.campaignStatus}`}
                            </span>
                          )}
                          <div style={{ fontSize: '0.72rem', color: 'var(--adm-text-muted, #64748b)', marginTop: 3 }}>
                            Creative: <strong>{c.approvedPostsCount} Approved</strong>
                            {c.pendingGraphicsCount > 0 ? ` • ${c.pendingGraphicsCount} w/ Graphics` : ''}
                            {c.pendingReviewCount > 0 ? ` • ${c.pendingReviewCount} in Review` : ''}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* 4. Leads Delivered & Held in Line-Up */}
                    <td>
                      <div
                        style={{
                          fontSize: '1.05rem',
                          fontWeight: 900,
                          color: c.leadsDeliveredOnDate > 0 ? '#059669' : '#d97706',
                        }}
                      >
                        {c.leadsDeliveredOnDate} {c.leadsDeliveredOnDate === 1 ? 'Lead' : 'Leads'}
                      </div>
                      {Number(c.heldLeadsCount || 0) > 0 && (
                        <div style={{ marginTop: 3 }}>
                          <span
                            className="desk-pill pill-amber"
                            style={{ fontSize: '0.68rem', fontWeight: 900, background: '#fef3c7', color: '#92400e', border: '1px solid #f59e0b' }}
                          >
                            📦 {c.heldLeadsCount} Held in Line-Up
                          </span>
                        </div>
                      )}
                      <div style={{ fontSize: '0.73rem', color: 'var(--adm-text-muted, #64748b)', marginTop: 2 }}>
                        Lifetime Total: <strong>{c.totalLeadsLifetime}</strong>
                      </div>
                    </td>

                    {/* 5. Pipeline / Delay Check */}
                    <td>
                      {c.delayAlerts && c.delayAlerts.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {c.delayAlerts.map((al, i) => (
                            <span
                              key={i}
                              className={`desk-pill ${al.severity === 'critical' ? 'pill-rose' : 'pill-amber'}`}
                              style={{ fontSize: '0.68rem', fontWeight: 800, width: 'fit-content' }}
                            >
                              {al.severity === 'critical' ? '🚨' : '⚠️'} {al.label}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="desk-pill pill-emerald" style={{ fontSize: '0.72rem', fontWeight: 800 }}>
                          <CheckCircle2 size={12} /> On Track ✓
                        </span>
                      )}
                    </td>

                    {/* 6. Direct Actions */}
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {Number(c.heldLeadsCount || 0) > 0 && (
                          <button
                            type="button"
                            disabled={releasingCustId === c.id}
                            onClick={() => handleReleaseAllForClient(c)}
                            className="desk-action-btn"
                            style={{
                              background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                              borderColor: '#4f46e5',
                              color: '#ffffff',
                              fontWeight: 800,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              cursor: 'pointer',
                            }}
                            title="Manually release held Line-Up leads to client inbox"
                          >
                            <Rocket size={12} /> {releasingCustId === c.id ? '...' : `Release (${c.heldLeadsCount})`}
                          </button>
                        )}
                        <a
                          href={buildCustomerLeadHref(c, 'add', 'active-schedule')}
                          onClick={(e) => navigateToCustomerLeadPage(c, 'add', 'active-schedule', e)}
                          className="desk-action-btn"
                          style={{
                            textDecoration: 'none',
                            background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                            borderColor: '#059669',
                            color: '#ffffff',
                            fontWeight: 800,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <Plus size={13} strokeWidth={2.5} /> Add Lead
                        </a>

                        <button
                          type="button"
                          className="desk-action-btn"
                          onClick={() => setRemarkCust(c)}
                          style={{ fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          <FileText size={13} /> Remark
                          {getCustomerFollowUpState(c).count > 0 ? ` (${getCustomerFollowUpState(c).count})` : ''}
                        </button>

                        {c.phone && (
                          <a
                            href={`tel:+91${c.phone}`}
                            className="desk-action-btn"
                            style={{ textDecoration: 'none', padding: '5px 8px' }}
                            title={`Call +91 ${c.phone}`}
                          >
                            <Phone size={13} color="#059669" />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </SmartTable>
      </div>

      {/* Remark Modal */}
      <SalesCustomerRemarkModal
        customer={remarkCust}
        onClose={() => setRemarkCust(null)}
        onCustomerUpdated={handleRemarkUpdated}
      />

      {/* Creative Image Lightbox */}
      {previewMedia && (
        <div className="sales-modal-overlay" onClick={() => setPreviewMedia(null)}>
          <div
            className="sales-modal-card"
            style={{ maxWidth: 520, padding: 18 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <strong style={{ color: 'var(--adm-text-primary, #0f172a)' }}>{previewMedia.title}</strong>
              <button type="button" className="desk-close-btn" onClick={() => setPreviewMedia(null)}>
                ✕
              </button>
            </div>
            {previewMedia.mediaType === 'video' || /\.mp4$/i.test(previewMedia.url) ? (
              <video src={previewMedia.url} controls style={{ width: '100%', borderRadius: 10, maxHeight: '70vh' }} />
            ) : (
              <img
                src={previewMedia.url}
                alt={previewMedia.title}
                style={{ width: '100%', borderRadius: 10, maxHeight: '70vh', objectFit: 'contain' }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
