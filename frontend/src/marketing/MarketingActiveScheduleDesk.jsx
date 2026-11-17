import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  RefreshCw,
  Play,
  Square,
  Palette,
  AlertTriangle,
  CheckCircle2,
  Search,
  Image as ImageIcon,
  Check,
} from 'lucide-react';
import Swal from 'sweetalert2';
import marketingApi from '../services/marketingApi';
import { SmartTable } from '../components/SmartTabulator';

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

export default function MarketingActiveScheduleDesk({ onNavigateToDesk }) {
  const [selectedDate, setSelectedDate] = useState(() =>
    new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  );
  const [scheduleData, setScheduleData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'live' | 'off' | 'needs_creative'

  // Per-row inline Actual Ad Spend state (Marketing ONLY sees Ad Spend — 50% default preset!)
  const [spendEdits, setSpendEdits] = useState({});
  const [savingSpendId, setSavingSpendId] = useState(null);
  const [togglingCampId, setTogglingCampId] = useState(null);
  const [previewMedia, setPreviewMedia] = useState(null);

  const loadSchedule = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      try {
        const res = await marketingApi.getActiveDeliverySchedule({ date: selectedDate });
        if (res && res.ok) {
          setScheduleData(res);
          const initialInputs = {};
          (res.clients || []).forEach((c) => {
            initialInputs[c.id] = String(c.actualAdSpend ?? Math.round((c.dailyBudget || 300) * 0.5));
          });
          setSpendEdits(initialInputs);
        }
      } catch (err) {
        console.error('[MarketingActiveScheduleDesk] Load error:', err);
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

  const handleSaveAdSpend = async (client, useDefaultPreset = false) => {
    const rawVal = useDefaultPreset
      ? client.presetAdSpend ?? Math.round((client.dailyBudget || 300) * 0.5)
      : Number(spendEdits[client.id] ?? 0);

    if (!Number.isFinite(rawVal) || rawVal < 0) {
      Swal.fire({ icon: 'warning', title: 'Enter a valid ad spend amount.' });
      return;
    }

    setSavingSpendId(client.id);
    try {
      const res = await marketingApi.saveDailyAdSpend({
        customerId: client.id,
        dateIso: selectedDate,
        actualSpend: rawVal,
        useDefaultPreset: false, // Explicitly confirmed by Marketing
      });
      if (res && res.ok) {
        setSpendEdits((prev) => ({ ...prev, [client.id]: String(res.actualSpend) }));
        setScheduleData((prev) => {
          if (!prev) return prev;
          const nextClients = (prev.clients || []).map((item) =>
            item.id === client.id
              ? { ...item, actualAdSpend: res.actualSpend, isSpendPreset: false }
              : item
          );
          const nextTotalSpend = nextClients.reduce(
            (sum, item) => sum + Number(item.actualAdSpend || 0),
            0
          );
          return {
            ...prev,
            summary: { ...prev.summary, totalActualAdSpendOnDate: nextTotalSpend },
            clients: nextClients,
          };
        });
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: `Saved ₹${res.actualSpend} ad spend for ${client.companyName}`,
          showConfirmButton: false,
          timer: 1800,
        });
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Could not save ad spend', text: err.message });
    } finally {
      setSavingSpendId(null);
    }
  };

  const handleQuickStartOrStop = async (client) => {
    setTogglingCampId(client.id);
    try {
      if (client.isCampaignLive && client.campaignId) {
        await marketingApi.stopCampaign(client.campaignId, 'Marketing Ops', 'Paused from Daily Schedule');
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'info',
          title: `Paused campaign for ${client.companyName}`,
          showConfirmButton: false,
          timer: 1800,
        });
      } else {
        await marketingApi.startCustomerMarketing(client.id, client.marketingCode || '');
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: `Campaign LIVE for ${client.companyName}!`,
          showConfirmButton: false,
          timer: 2000,
        });
      }
      await loadSchedule(true);
    } catch (err) {
      Swal.fire({
        icon: 'warning',
        title: 'Campaign Action Notice',
        text: err.message,
      });
    } finally {
      setTogglingCampId(null);
    }
  };

  const summary = scheduleData?.summary || {
    scheduledClientsCount: 0,
    totalScheduledBudget: 0,
    campaignsRunningCount: 0,
    campaignsDelayedCount: 0,
    totalActualAdSpendOnDate: 0,
    totalLeadsDeliveredOnDate: 0,
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
      (c.city || '').toLowerCase().includes(q);
    if (!matchSearch) return false;
    if (statusFilter === 'live') return c.isCampaignLive;
    if (statusFilter === 'off') return !c.isCampaignLive;
    if (statusFilter === 'needs_creative') return (c.approvedPostsCount || 0) === 0;
    return true;
  });

  return (
    <div>
      {/* 1. Header */}
      <div className="marketing-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0 }}>Daily Active Schedule &amp; Campaign Radar</h1>
            <span className="mkt-badge mkt-badge-indigo">{summary.dayLabel || selectedDate}</span>
            {summary.isToday && <span className="mkt-badge mkt-badge-emerald">● LIVE TODAY</span>}
          </div>
          <p style={{ margin: '6px 0 0', color: 'var(--adm-text-muted, #64748b)', fontSize: '0.86rem' }}>
            Clients scheduled to receive leads on {summary.dayLabel || selectedDate}. Verify live campaign status, inspect active Graphics creative, and log daily ad spend (pre-filled at 50% default).
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
              padding: '6px 12px',
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
            />
          </div>

          <button
            type="button"
            className="mkt-btn-secondary"
            onClick={() => loadSchedule(true)}
            disabled={refreshing}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
            <span>{refreshing ? 'Syncing...' : 'Live Sync'}</span>
          </button>
        </div>
      </div>

      {/* 2. 7-Day Forecast Selector Strip */}
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
                  border: isSelected ? '2px solid #4f46e5' : '1px solid var(--adm-border, #e2e8f0)',
                  background: isSelected
                    ? 'var(--adm-soft-indigo-bg, #eef2ff)'
                    : 'var(--adm-bg-card, #ffffff)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      color: day.isToday ? '#059669' : isSelected ? '#4f46e5' : 'var(--adm-text-muted, #64748b)',
                    }}
                  >
                    {badgeTag}
                  </span>
                  <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--adm-text-muted, #64748b)' }}>
                    {day.shortDate}
                  </span>
                </div>
                <div style={{ fontSize: '1.12rem', fontWeight: 900, color: 'var(--adm-text-primary, #0f172a)', marginTop: 5 }}>
                  {day.scheduledClientsCount} {day.scheduledClientsCount === 1 ? 'Client' : 'Clients'}
                </div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#059669', marginTop: 2 }}>
                  Client Pacing: {formatINR(day.totalScheduledBudget)}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* 3. KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 12,
          marginBottom: 18,
        }}
      >
        <div className="mkt-card" style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--adm-text-muted, #64748b)', textTransform: 'uppercase' }}>
            Scheduled Active Clients
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 900, color: 'var(--adm-text-primary, #0f172a)', marginTop: 4 }}>
            {summary.scheduledClientsCount}
          </div>
          <div style={{ fontSize: '0.76rem', color: 'var(--adm-text-muted, #64748b)', marginTop: 2 }}>
            Total Client Pacing: <strong>{formatINR(summary.totalScheduledBudget)}</strong>
          </div>
        </div>

        <div className="mkt-card" style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--adm-text-muted, #64748b)', textTransform: 'uppercase' }}>
            Campaigns Running vs OFF
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 900, color: summary.campaignsDelayedCount > 0 ? '#ef4444' : '#10b981', marginTop: 4 }}>
            {summary.campaignsRunningCount} Live / {summary.campaignsDelayedCount} OFF
          </div>
          <div style={{ fontSize: '0.76rem', color: 'var(--adm-text-muted, #64748b)', marginTop: 2 }}>
            {summary.campaignsDelayedCount > 0 ? '🚨 Start delayed campaigns immediately' : '✓ All scheduled campaigns active'}
          </div>
        </div>

        <div className="mkt-card" style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--adm-text-muted, #64748b)', textTransform: 'uppercase' }}>
            Total Ad Spend ({summary.isToday ? 'Today' : selectedDate})
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 900, color: '#6366f1', marginTop: 4 }}>
            {formatINR(summary.totalActualAdSpendOnDate)}
          </div>
          <div style={{ fontSize: '0.76rem', color: 'var(--adm-text-muted, #64748b)', marginTop: 2 }}>
            Auto-preset at 50% until updated per client
          </div>
        </div>

        <div className="mkt-card" style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--adm-text-muted, #64748b)', textTransform: 'uppercase' }}>
            Missing Approved Creatives
          </div>
          <div
            style={{
              fontSize: '1.65rem',
              fontWeight: 900,
              color: rawClients.filter((c) => (c.approvedPostsCount || 0) === 0).length > 0 ? '#f59e0b' : '#10b981',
              marginTop: 4,
            }}
          >
            {rawClients.filter((c) => (c.approvedPostsCount || 0) === 0).length}
          </div>
          <div style={{ fontSize: '0.76rem', color: 'var(--adm-text-muted, #64748b)', marginTop: 2 }}>
            Request from Graphics in 1 click below
          </div>
        </div>
      </div>

      {/* 4. Filter Pills & Search */}
      <div
        className="mkt-card"
        style={{
          padding: '12px 16px',
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: `All Scheduled (${rawClients.length})` },
            { id: 'live', label: `🟢 Running (${rawClients.filter((c) => c.isCampaignLive).length})` },
            { id: 'off', label: `🔴 Campaign OFF (${rawClients.filter((c) => !c.isCampaignLive).length})` },
            {
              id: 'needs_creative',
              label: `🎨 Needs Creative (${rawClients.filter((c) => (c.approvedPostsCount || 0) === 0).length})`,
            },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={statusFilter === tab.id ? 'mkt-btn-primary' : 'mkt-btn-secondary'}
              style={{ padding: '6px 12px', fontSize: '0.78rem', fontWeight: 800 }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ position: 'relative', minWidth: 240 }}>
          <Search
            size={15}
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}
          />
          <input
            type="text"
            className="mkt-input"
            style={{ paddingLeft: 32, height: 36 }}
            placeholder="Search client, category, city..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* 5. Schedule Execution Table */}
      <div className="mkt-card" style={{ padding: 0, overflow: 'hidden' }}>
        <SmartTable
          title={`Marketing Active Schedule (${selectedDate})`}
          exportFilename={`marketing-schedule-${selectedDate}`}
          defaultPageSize={15}
        >
          <table className="mkt-table">
            <thead>
              <tr>
                <th>Client &amp; Territory</th>
                <th>Client Pacing &amp; Wallet</th>
                <th>Creative Going to Use</th>
                <th>Campaign Status</th>
                <th>Actual Ad Spend (50% Preset)</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--adm-text-muted, #64748b)' }}>
                    <RefreshCw size={20} className="spin" style={{ marginBottom: 8 }} />
                    <div>Syncing scheduled campaigns...</div>
                  </td>
                </tr>
              ) : filteredClients.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 42, color: 'var(--adm-text-muted, #64748b)' }}>
                    <div style={{ fontWeight: 800, color: 'var(--adm-text-primary, #0f172a)' }}>
                      No scheduled clients for {summary.dayLabel || selectedDate} matching this filter
                    </div>
                  </td>
                </tr>
              ) : (
                filteredClients.map((c) => (
                  <tr key={c.id}>
                    {/* 1. Client */}
                    <td>
                      <div style={{ fontWeight: 800, color: 'var(--adm-text-primary, #0f172a)' }}>{c.companyName}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--adm-text-muted, #64748b)', marginTop: 2 }}>
                        {c.category || 'General'} • {[c.city, c.state].filter(Boolean).join(', ') || 'India'}
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#059669', fontFamily: 'monospace', fontWeight: 700, marginTop: 2 }}>
                        +91 {c.phone} • Leads Sent: <strong>{c.leadsDeliveredOnDate}</strong>
                      </div>
                    </td>

                    {/* 2. Pacing & Wallet */}
                    <td>
                      <div style={{ fontWeight: 900, fontSize: '0.98rem', color: 'var(--adm-text-primary, #0f172a)' }}>
                        {formatINR(c.dailyBudget, c.currency)}/day
                      </div>
                      <div style={{ fontSize: '0.73rem', color: 'var(--adm-text-muted, #64748b)', marginTop: 3 }}>
                        Wallet: <strong>{formatINR(c.walletBalance, c.currency)}</strong>{' '}
                        {c.isBookedOnDate ? '• Paid ✓' : '• Funded'}
                      </div>
                    </td>

                    {/* 3. Creative Going to Use */}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
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
                              width: 46,
                              height: 46,
                              borderRadius: 8,
                              overflow: 'hidden',
                              border: '1.5px solid #6366f1',
                              padding: 0,
                              background: '#0f172a',
                              cursor: 'pointer',
                              flexShrink: 0,
                            }}
                            title="Preview creative"
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
                              width: 46,
                              height: 46,
                              borderRadius: 8,
                              border: '1px dashed var(--adm-border-strong, #cbd5e1)',
                              display: 'grid',
                              placeItems: 'center',
                              color: '#94a3b8',
                              flexShrink: 0,
                            }}
                          >
                            <ImageIcon size={17} />
                          </div>
                        )}
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: '0.79rem',
                              fontWeight: 700,
                              color: 'var(--adm-text-primary, #0f172a)',
                              maxWidth: 165,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {c.activeCreativeTitle || 'No Creative Yet'}
                          </div>
                          <div style={{ fontSize: '0.71rem', color: 'var(--adm-text-muted, #64748b)', marginTop: 2 }}>
                            {c.approvedPostsCount > 0 ? (
                              <span style={{ color: '#059669', fontWeight: 800 }}>
                                {c.isCampaignLive ? '🚀 Live in Campaign' : `✓ ${c.approvedPostsCount} Approved`}
                              </span>
                            ) : c.pendingReviewCount > 0 ? (
                              <span style={{ color: '#6366f1', fontWeight: 800 }}>
                                ⏳ {c.pendingReviewCount} Uploaded — Verify!
                              </span>
                            ) : c.pendingGraphicsCount > 0 ? (
                              <span style={{ color: '#d97706', fontWeight: 800 }}>
                                🎨 {c.pendingGraphicsCount} With Graphics
                              </span>
                            ) : (
                              <span style={{ color: '#ef4444', fontWeight: 800 }}>⚠️ 0 Creatives</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* 4. Campaign Status */}
                    <td>
                      {c.isCampaignLive ? (
                        <div>
                          <span className="mkt-badge mkt-badge-emerald">
                            <CheckCircle2 size={12} /> RUNNING {c.marketingCode ? `(${c.marketingCode})` : ''}
                          </span>
                        </div>
                      ) : (
                        <div>
                          <span className="mkt-badge mkt-badge-rose">
                            <AlertTriangle size={12} /> {c.campaignStatus === 'Not Created' ? 'NOT STARTED' : c.campaignStatus.toUpperCase()}
                          </span>
                        </div>
                      )}
                    </td>

                    {/* 5. Actual Ad Spend Input (50% Preset Default) */}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ position: 'relative', width: 96 }}>
                          <span
                            style={{
                              position: 'absolute',
                              left: 8,
                              top: '50%',
                              transform: 'translateY(-50%)',
                              fontSize: '0.78rem',
                              fontWeight: 800,
                              color: 'var(--adm-text-muted, #64748b)',
                            }}
                          >
                            ₹
                          </span>
                          <input
                            type="number"
                            min="0"
                            step="10"
                            className="mkt-input"
                            style={{ paddingLeft: 22, paddingRight: 6, height: 32, fontSize: '0.82rem', fontWeight: 800 }}
                            value={spendEdits[c.id] ?? ''}
                            onChange={(e) =>
                              setSpendEdits((prev) => ({ ...prev, [c.id]: e.target.value }))
                            }
                          />
                        </div>
                        <button
                          type="button"
                          className="mkt-btn-table-action"
                          disabled={savingSpendId === c.id}
                          onClick={() => handleSaveAdSpend(c, false)}
                          title="Save actual ad spend for this client on this date"
                          style={{
                            height: 32,
                            padding: '0 10px',
                            fontWeight: 800,
                            background: c.isSpendPreset ? 'rgba(99, 102, 241, 0.14)' : 'rgba(16, 185, 129, 0.16)',
                            color: c.isSpendPreset ? '#6366f1' : '#059669',
                            border: '1px solid currentColor',
                            borderRadius: 8,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <Check size={13} />
                          <span>{savingSpendId === c.id ? '...' : c.isSpendPreset ? 'Confirm' : 'Saved'}</span>
                        </button>
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--adm-text-muted, #64748b)', marginTop: 3 }}>
                        {c.isSpendPreset ? `50% Default Preset (₹${c.presetAdSpend})` : `Confirmed${c.spendUpdatedBy ? ` by ${c.spendUpdatedBy}` : ''}`}
                      </div>
                    </td>

                    {/* 6. Actions */}
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          disabled={togglingCampId === c.id}
                          onClick={() => handleQuickStartOrStop(c)}
                          className={c.isCampaignLive ? 'mkt-btn-secondary' : 'mkt-btn-primary'}
                          style={{
                            padding: '6px 11px',
                            fontSize: '0.76rem',
                            fontWeight: 800,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                          }}
                        >
                          {c.isCampaignLive ? <Square size={12} /> : <Play size={12} />}
                          <span>{c.isCampaignLive ? 'Pause' : 'Start Campaign'}</span>
                        </button>

                        <button
                          type="button"
                          className="mkt-btn-secondary"
                          onClick={() => onNavigateToDesk && onNavigateToDesk('create_posts', c.id)}
                          style={{
                            padding: '6px 10px',
                            fontSize: '0.76rem',
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                          }}
                          title="Request Creative from Graphics for this client"
                        >
                          <Palette size={13} />
                          <span>Request Creative</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </SmartTable>
      </div>

      {/* Creative Preview Modal */}
      {previewMedia && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(2, 6, 23, 0.72)',
            zIndex: 9999,
            display: 'grid',
            placeItems: 'center',
            padding: 16,
          }}
          onClick={() => setPreviewMedia(null)}
        >
          <div
            className="mkt-card"
            style={{ maxWidth: 520, width: '100%', padding: 18 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <strong>{previewMedia.title}</strong>
              <button type="button" className="mkt-btn-secondary" onClick={() => setPreviewMedia(null)}>
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
