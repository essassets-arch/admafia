import React, { useState, useEffect, useCallback } from 'react';
import {
  Wallet,
  TrendingUp,
  RefreshCw,
  Calendar,
  Search,
  AlertTriangle,
  CheckCircle2,
  Check,
  Clock,
  Sliders,
  ExternalLink,
} from 'lucide-react';
import Swal from 'sweetalert2';
import superadminApi from '../services/superadminApi';
import { SmartTable } from '../components/SmartTabulator';
import ChatbotAmmApiModal from '../components/ChatbotAmmApiModal';

const formatINR = (val, currency = 'INR') => {
  if (val === null || val === undefined || Number.isNaN(Number(val))) return '—';
  const num = Number(val);
  if (String(currency).toUpperCase() === 'USD') {
    return `$${num.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(num);
};

function getIstOffsetIso(offsetDays = 0) {
  const nowStr = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
  const d = new Date(nowStr);
  d.setDate(d.getDate() + offsetDays);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function SuperAdminUnitFinanceDesk() {
  const todayIso = getIstOffsetIso(0);
  const [viewMode, setViewMode] = useState('finance'); // 'finance' | 'bottlenecks'
  const [periodPreset, setPeriodPreset] = useState('today'); // 'today' | 'yesterday' | '7d' | 'month' | 'custom'
  const [fromDate, setFromDate] = useState(todayIso);
  const [toDate, setToDate] = useState(todayIso);

  const [financeData, setFinanceData] = useState(null);
  const [slaData, setSlaData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [userFilter, setUserFilter] = useState('all'); // 'all' | 'active' | 'liability'

  const [spendInputs, setSpendInputs] = useState({});
  const [savingRowId, setSavingRowId] = useState(null);
  const [globalRatioPct, setGlobalRatioPct] = useState(50);
  const [savingRatio, setSavingRatio] = useState(false);
  const [isChatbotModalOpen, setIsChatbotModalOpen] = useState(false);
  const [rollingOverKey, setRollingOverKey] = useState('');

  const applyPresetRange = (preset) => {
    setPeriodPreset(preset);
    const t = getIstOffsetIso(0);
    if (preset === 'today') {
      setFromDate(t);
      setToDate(t);
    } else if (preset === 'yesterday') {
      const y = getIstOffsetIso(-1);
      setFromDate(y);
      setToDate(y);
    } else if (preset === '7d') {
      setFromDate(getIstOffsetIso(-6));
      setToDate(t);
    } else if (preset === 'month') {
      setFromDate(`${t.slice(0, 7)}-01`);
      setToDate(t);
    }
  };

  const fetchAll = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      try {
        const [finRes, slaRes] = await Promise.all([
          superadminApi.getUnitFinance({ from: fromDate, to: toDate }),
          superadminApi.getSlaBottlenecks(),
        ]);
        if (finRes && finRes.ok) {
          setFinanceData(finRes);
          const inputs = {};
          (finRes.users || []).forEach((u) => {
            inputs[u.id] = String(u.actualAdSpend ?? 0);
          });
          setSpendInputs(inputs);
        }
        if (slaRes && slaRes.ok) {
          setSlaData(slaRes);
        }
      } catch (err) {
        console.error('[SuperAdminUnitFinanceDesk] Load error:', err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [fromDate, toDate]
  );

  useEffect(() => {
    fetchAll(false);
  }, [fetchAll]);

  const isSingleDay = fromDate === toDate;
  const summary = financeData?.summary || {
    liveTotalWalletLiability: 0,
    closingWalletLiabilityOnDate: 0,
    scheduledDeliveryObligationOnToDate: 0,
    grossDepositsInRange: 0,
    depositsBaseExclGst: 0,
    depositsGstComponent: 0,
    clientBilledRevenueInRange: 0,
    actualPlatformSpendInRange: 0,
    netGrossProfit: 0,
    netGrossMarginPct: 0,
    totalLeadsInRange: 0,
    avgOurRealCpl: null,
    avgClientPricePerLead: null,
  };

  const handleSaveSingleDaySpend = async (userRow) => {
    if (!isSingleDay) return;
    const val = Number(spendInputs[userRow.id] ?? 0);
    if (!Number.isFinite(val) || val < 0) {
      Swal.fire({ icon: 'warning', title: 'Please enter a valid spend amount (>= 0).' });
      return;
    }
    setSavingRowId(userRow.id);
    try {
      await superadminApi.saveDailyAdSpend({
        customerId: userRow.id,
        dateIso: toDate,
        actualSpend: val,
        useDefaultPreset: false,
      });
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: `Updated ${userRow.companyName} spend to ₹${val}`,
        showConfirmButton: false,
        timer: 1800,
      });
      await fetchAll(true);
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Failed to update spend', text: err.message });
    } finally {
      setSavingRowId(null);
    }
  };

  const handleApplyGlobalPresetRatio = async () => {
    const pct = Number(globalRatioPct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 200) {
      Swal.fire({ icon: 'warning', title: 'Enter a valid ratio between 0% and 200%.' });
      return;
    }
    setSavingRatio(true);
    try {
      await superadminApi.updateDefaultSpendRatio({
        defaultSpendRatioPct: pct,
        applyToAll: true,
      });
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: `Default ad spend preset set to ${pct}% for all accounts`,
        showConfirmButton: false,
        timer: 2000,
      });
      await fetchAll(true);
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Could not update preset ratio', text: err.message });
    } finally {
      setSavingRatio(false);
    }
  };

  const handleRolloverDay = async (item) => {
    const confirm = await Swal.fire({
      icon: 'warning',
      title: `Rollover ₹${item.paidAmount || 300} to ${item.companyName}?`,
      html: `Client <strong>${item.companyName} (${item.marketingCode || ''})</strong> paid for <strong>${item.dateIso}</strong>, with <strong>0 leads &amp; 0 confirmed ad spend</strong>.<br/><br/>This credits <strong>₹${item.paidAmount || 300}</strong> back to their Growth Wallet so they can schedule another day.`,
      showCancelButton: true,
      confirmButtonText: `Credit ₹${item.paidAmount || 300} Rollover`,
      confirmButtonColor: '#059669',
    });
    if (!confirm.isConfirmed) return;
    const key = `${item.customerId}_${item.dateIso}`;
    setRollingOverKey(key);
    try {
      const res = await superadminApi.rolloverUnfulfilledDay({
        customerId: item.customerId,
        dateIso: item.dateIso,
      });
      if (res && res.ok) {
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: res.message || 'Paid slot rolled over to client wallet!',
          showConfirmButton: false,
          timer: 2600,
        });
        await fetchAll(true);
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Rollover Failed', text: err.message });
    } finally {
      setRollingOverKey('');
    }
  };

  const usersList = (financeData?.users || []).filter((u) => {
    const q = search.trim().toLowerCase();
    const matchSearch =
      !q ||
      (u.marketingCode || '').toLowerCase().includes(q) ||
      (u.companyName || '').toLowerCase().includes(q) ||
      (u.contactPerson || '').toLowerCase().includes(q) ||
      (u.username || '').toLowerCase().includes(q) ||
      (u.phone || '').includes(q) ||
      (u.category || '').toLowerCase().includes(q);
    if (!matchSearch) return false;
    if (userFilter === 'active') {
      return u.projectedOrSettledRevenue > 0 || u.isScheduledOnToDate || u.leadsDelivered > 0;
    }
    if (userFilter === 'overspent') {
      return Boolean(u.isOverSpentLoss);
    }
    if (userFilter === 'liability') {
      return u.closingWalletLiabilityOnDate > 0;
    }
    return true;
  });

  const slaSummary = slaData?.summary || {
    totalBottlenecks: 0,
    criticalCount: 0,
    byDepartment: { Sales: 0, Marketing: 0, Graphics: 0 },
    avgGraphicsTurnaroundLabel: '—',
    avgMarketingReviewLabel: '—',
  };
  const bottlenecks = slaData?.bottlenecks || [];

  return (
    <div className="sa-desk-content">
      {/* 1. Header & Confidential Notice + Mode Switcher */}
      <div className="sa-page-header" style={{ flexWrap: 'wrap', gap: 14 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1>Unit Economics, Daily Liability &amp; Delay Radar</h1>
            <span
              style={{
                background: 'rgba(16, 185, 129, 0.14)',
                color: '#10b981',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                padding: '3px 10px',
                borderRadius: 999,
                fontSize: '0.72rem',
                fontWeight: 800,
              }}
            >
              🔒 Strictly Confidential (Super Admin Only — Hidden from Clients)
            </span>
          </div>
          <p>
            Track exact per-user Client Billed Revenue vs Our Actual Ad Spend (defaulted at {globalRatioPct}% preset), Net Profit Margin, End-of-Day Wallet Liability, and cross-department SLA delays.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <a
            href={superadminApi.getPlaybookPdfUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="sa-btn-secondary"
            style={{ textDecoration: 'none', fontWeight: 800, borderColor: '#059669', color: '#059669' }}
            title="Download Confidential Master Operations & Anti-Confusion Playbook PDF"
          >
            📄 Master SOP PDF
          </a>
          <button
            type="button"
            onClick={() => setIsChatbotModalOpen(true)}
            className="sa-btn-secondary"
            style={{ fontWeight: 800, borderColor: '#6366f1', color: '#4f46e5' }}
          >
            🤖 Chatbot #AMM API
          </button>
          <button
            type="button"
            onClick={() => setViewMode('finance')}
            className={viewMode === 'finance' ? 'sa-btn-primary' : 'sa-btn-secondary'}
            style={{ fontWeight: 800 }}
          >
            💹 Unit Economics &amp; Liability
          </button>
          <button
            type="button"
            onClick={() => setViewMode('bottlenecks')}
            className={viewMode === 'bottlenecks' ? 'sa-btn-primary' : 'sa-btn-secondary'}
            style={{ fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <span>🚨 Delay &amp; SLA Radar</span>
            {slaSummary.totalBottlenecks > 0 && (
              <span
                style={{
                  background: slaSummary.criticalCount > 0 ? '#ef4444' : '#f59e0b',
                  color: '#ffffff',
                  borderRadius: 999,
                  padding: '1px 7px',
                  fontSize: '0.7rem',
                  fontWeight: 900,
                }}
              >
                {slaSummary.totalBottlenecks}
              </span>
            )}
          </button>
          <button
            type="button"
            className="sa-btn-secondary"
            onClick={() => fetchAll(true)}
            disabled={refreshing}
          >
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
            <span>{refreshing ? 'Syncing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {viewMode === 'finance' ? (
        <>
          {/* 2. Date Period Bar + Global 50% Preset Ratio Control */}
          <div
            className="sa-card"
            style={{
              padding: '14px 18px',
              marginBottom: 18,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 14,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {[
                { id: 'today', label: 'Today' },
                { id: 'yesterday', label: 'Yesterday' },
                { id: '7d', label: 'Last 7 Days' },
                { id: 'month', label: 'This Month' },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPresetRange(p.id)}
                  className={periodPreset === p.id ? 'sa-btn-primary' : 'sa-btn-secondary'}
                  style={{ padding: '6px 12px', fontSize: '0.78rem', fontWeight: 800 }}
                >
                  {p.label}
                </button>
              ))}

              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'var(--adm-bg-subtle, #f8fafc)',
                  border: '1px solid var(--adm-border, #e2e8f0)',
                  borderRadius: 8,
                  padding: '4px 10px',
                }}
              >
                <Calendar size={14} color="#6366f1" />
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => {
                    setPeriodPreset('custom');
                    setFromDate(e.target.value);
                  }}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--adm-text-primary, #0f172a)',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                  }}
                />
                <span style={{ color: '#94a3b8' }}>→</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => {
                    setPeriodPreset('custom');
                    setToDate(e.target.value);
                  }}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--adm-text-primary, #0f172a)',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                  }}
                />
              </div>
            </div>

            {/* Default 50% Preset Adjuster */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: 'var(--adm-bg-subtle, #f8fafc)',
                border: '1px solid var(--adm-border, #e2e8f0)',
                borderRadius: 10,
                padding: '6px 12px',
              }}
            >
              <Sliders size={14} color="#6366f1" />
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--adm-text-body, #334155)' }}>
                Default Ad Spend Preset:
              </span>
              <input
                type="number"
                min="0"
                max="200"
                value={globalRatioPct}
                onChange={(e) => setGlobalRatioPct(e.target.value)}
                style={{
                  width: 56,
                  padding: '3px 6px',
                  borderRadius: 6,
                  border: '1px solid var(--adm-border-strong, #cbd5e1)',
                  background: 'var(--adm-bg-card, #ffffff)',
                  color: 'var(--adm-text-primary, #0f172a)',
                  fontWeight: 800,
                  fontSize: '0.82rem',
                  textAlign: 'center',
                }}
              />
              <span style={{ fontSize: '0.8rem', fontWeight: 800 }}>%</span>
              <button
                type="button"
                className="sa-btn-secondary"
                disabled={savingRatio}
                onClick={handleApplyGlobalPresetRatio}
                style={{ padding: '4px 10px', fontSize: '0.75rem', fontWeight: 800 }}
              >
                {savingRatio ? 'Saving...' : 'Set Default'}
              </button>
            </div>
          </div>

          {/* 3. 6 Master Financial KPI Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 14,
              marginBottom: 20,
            }}
          >
            <div className="sa-card" style={{ padding: '16px 18px', borderLeft: '4px solid #f59e0b' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--adm-text-muted, #64748b)', textTransform: 'uppercase' }}>
                Wallet Liability ({toDate === todayIso ? 'Live EOD' : toDate})
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#f59e0b', marginTop: 5 }}>
                {formatINR(summary.closingWalletLiabilityOnDate)}
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--adm-text-muted, #64748b)', marginTop: 4 }}>
                Scheduled Obligation ({toDate}): <strong>{formatINR(summary.scheduledDeliveryObligationOnToDate)}</strong>
              </div>
            </div>

            <div className="sa-card" style={{ padding: '16px 18px', borderLeft: '4px solid #0ea5e9' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--adm-text-muted, #64748b)', textTransform: 'uppercase' }}>
                Gross Deposits Collected
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#0ea5e9', marginTop: 5 }}>
                {formatINR(summary.grossDepositsInRange)}
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--adm-text-muted, #64748b)', marginTop: 4 }}>
                Base: {formatINR(summary.depositsBaseExclGst)} • 18% GST: {formatINR(summary.depositsGstComponent)}
              </div>
            </div>

            <div className="sa-card" style={{ padding: '16px 18px', borderLeft: '4px solid #6366f1' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--adm-text-muted, #64748b)', textTransform: 'uppercase' }}>
                Client Billed (Wallet Cuts)
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#6366f1', marginTop: 5 }}>
                {formatINR(summary.clientBilledRevenueInRange)}
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--adm-text-muted, #64748b)', marginTop: 4 }}>
                Earned service revenue in selected period
              </div>
            </div>

            <div className="sa-card" style={{ padding: '16px 18px', borderLeft: '4px solid #ec4899' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--adm-text-muted, #64748b)', textTransform: 'uppercase' }}>
                Our Actual Ad Spend
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#ec4899', marginTop: 5 }}>
                {formatINR(summary.actualPlatformSpendInRange)}
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--adm-text-muted, #64748b)', marginTop: 4 }}>
                {summary.confirmedSpendRowsCount || 0} confirmed • {summary.presetSpendRowsCount || 0} at {globalRatioPct}% preset
              </div>
            </div>

            <div className="sa-card" style={{ padding: '16px 18px', borderLeft: '4px solid #10b981' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--adm-text-muted, #64748b)', textTransform: 'uppercase' }}>
                True Net Profit &amp; Margin
              </div>
              <div
                style={{
                  fontSize: '1.6rem',
                  fontWeight: 900,
                  color: summary.netGrossProfit >= 0 ? '#10b981' : '#ef4444',
                  marginTop: 5,
                }}
              >
                {summary.netGrossProfit >= 0 ? '+' : ''}
                {formatINR(summary.netGrossProfit)}
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--adm-text-muted, #64748b)', marginTop: 4 }}>
                Net Margin: <strong>{summary.netGrossMarginPct}%</strong> (Billed − Our Spend)
              </div>
            </div>

            <div className="sa-card" style={{ padding: '16px 18px', borderLeft: '4px solid #8b5cf6' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--adm-text-muted, #64748b)', textTransform: 'uppercase' }}>
                Unit Lead Economics (CPL)
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--adm-text-primary, #0f172a)', marginTop: 5 }}>
                {summary.totalLeadsInRange} Leads
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--adm-text-muted, #64748b)', marginTop: 4 }}>
                Our Real CPL: <strong>{formatINR(summary.avgOurRealCpl)}</strong> • Client/Lead: {formatINR(summary.avgClientPricePerLead)}
              </div>
            </div>

            <div
              className="sa-card"
              style={{
                padding: '16px 18px',
                borderLeft: `4px solid ${(summary.overSpentLossUsersCount || 0) > 0 ? '#ef4444' : '#10b981'}`,
              }}
            >
              <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--adm-text-muted, #64748b)', textTransform: 'uppercase' }}>
                Over-Spend / Loss Alert
              </div>
              <div
                style={{
                  fontSize: '1.6rem',
                  fontWeight: 900,
                  color: (summary.overSpentLossUsersCount || 0) > 0 ? '#ef4444' : '#10b981',
                  marginTop: 5,
                }}
              >
                {(summary.overSpentLossUsersCount || 0) > 0
                  ? `-${formatINR(summary.totalOverSpendLossAmount || 0)}`
                  : '₹0 Over-Spend'}
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--adm-text-muted, #64748b)', marginTop: 4 }}>
                {(summary.overSpentLossUsersCount || 0) > 0
                  ? `🔴 ${summary.overSpentLossUsersCount} client(s) spent > billed`
                  : '✓ Zero negative-margin accounts'}
              </div>
            </div>
          </div>

          {/* Unfulfilled Paid Days Safeguard Banner */}
          {(financeData?.unfulfilledPaidDays || []).length > 0 && (
            <div
              className="sa-card"
              style={{
                padding: '14px 18px',
                marginBottom: 16,
                border: '1.5px solid #f59e0b',
                background: 'rgba(245, 158, 11, 0.08)',
              }}
            >
              <div style={{ fontWeight: 900, fontSize: '0.86rem', color: '#d97706', marginBottom: 8 }}>
                ⚠️ Unfulfilled Paid Delivery Slots ({financeData.unfulfilledPaidDays.length}): Client paid for this date, but 0 leads &amp; 0 confirmed ad spend were recorded
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {financeData.unfulfilledPaidDays.slice(0, 6).map((item) => {
                  const key = `${item.customerId}_${item.dateIso}`;
                  return (
                    <div
                      key={key}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 10,
                        flexWrap: 'wrap',
                        padding: '7px 10px',
                        borderRadius: 8,
                        background: 'var(--adm-bg-card, #ffffff)',
                        border: '1px solid var(--adm-border, #e2e8f0)',
                      }}
                    >
                      <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>
                        <span style={{ fontFamily: 'monospace', color: '#4f46e5', fontWeight: 900, marginRight: 6 }}>
                          {item.marketingCode || '#AMM'}
                        </span>
                        <strong>{item.companyName}</strong> — Paid <strong>{formatINR(item.paidAmount)}</strong> on{' '}
                        <code>{item.dateIso}</code> (Campaign: {item.campaignStatus})
                      </div>
                      <button
                        type="button"
                        disabled={rollingOverKey === key}
                        onClick={() => handleRolloverDay(item)}
                        className="sa-btn-secondary"
                        style={{
                          padding: '4px 10px',
                          fontSize: '0.74rem',
                          fontWeight: 800,
                          borderColor: '#059669',
                          color: '#059669',
                        }}
                      >
                        {rollingOverKey === key ? 'Rolling over...' : `🔄 Rollover ₹${item.paidAmount} to Wallet`}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 4. Filter Tabs & Search */}
          <div
            className="sa-card"
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
                { id: 'all', label: `All Clients (${(financeData?.users || []).length})` },
                {
                  id: 'active',
                  label: `Active / Billed in Period (${(financeData?.users || []).filter((u) => u.projectedOrSettledRevenue > 0 || u.isScheduledOnToDate).length})`,
                },
                {
                  id: 'overspent',
                  label: `🔴 Over-Spent / Loss (${(financeData?.users || []).filter((u) => u.isOverSpentLoss).length})`,
                },
                {
                  id: 'liability',
                  label: `With Wallet Liability (${(financeData?.users || []).filter((u) => u.closingWalletLiabilityOnDate > 0).length})`,
                },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setUserFilter(t.id)}
                  className={userFilter === t.id ? 'sa-btn-primary' : 'sa-btn-secondary'}
                  style={{ padding: '6px 12px', fontSize: '0.78rem', fontWeight: 800 }}
                >
                  {t.label}
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
                className="sa-input"
                style={{ paddingLeft: 32, height: 36 }}
                placeholder="Search client, phone, category..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {/* 5. Per-User Complete Financial Breakdown Table */}
          <div className="sa-card" style={{ padding: 0, overflow: 'hidden' }}>
            <SmartTable
              title={`Per-User Unit Economics & Liability (${fromDate} to ${toDate})`}
              exportFilename={`admafia-unit-finance-${fromDate}-to-${toDate}`}
              defaultPageSize={15}
            >
              <table className="sa-table">
                <thead>
                  <tr>
                    <th>Client &amp; Territory</th>
                    <th>Deposits (In)</th>
                    <th>Wallet Liability ({toDate})</th>
                    <th>Client Billed</th>
                    <th>Our Actual Ad Spend</th>
                    <th>Net Profit &amp; Margin</th>
                    <th>Leads &amp; Real CPL</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: 40 }}>
                        Loading unit-economics ledger...
                      </td>
                    </tr>
                  ) : usersList.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: 40 }}>
                        No client accounts match your filter.
                      </td>
                    </tr>
                  ) : (
                    usersList.map((u) => (
                      <tr
                        key={u.id}
                        style={
                          u.isOverSpentLoss
                            ? { background: 'rgba(239, 68, 68, 0.06)' }
                            : undefined
                        }
                      >
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            {u.marketingCode && (
                              <span
                                style={{
                                  background: '#4f46e5',
                                  color: '#fff',
                                  fontFamily: 'monospace',
                                  fontSize: '0.69rem',
                                  fontWeight: 900,
                                  padding: '1px 6px',
                                  borderRadius: 5,
                                }}
                              >
                                {u.marketingCode}
                              </span>
                            )}
                            <span style={{ fontWeight: 800, color: 'var(--adm-text-primary, #0f172a)' }}>
                              {u.companyName}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.74rem', color: 'var(--adm-text-muted, #64748b)', marginTop: 2 }}>
                            {u.category || 'General'} • {u.city || 'India'} • +91 {u.phone}
                          </div>
                          {u.isScheduledOnToDate && (
                            <span
                              style={{
                                display: 'inline-block',
                                marginTop: 4,
                                fontSize: '0.66rem',
                                fontWeight: 800,
                                background: 'rgba(16, 185, 129, 0.14)',
                                color: '#10b981',
                                padding: '1px 7px',
                                borderRadius: 999,
                              }}
                            >
                              ● Scheduled on {toDate} ({formatINR(u.dailyBudget, u.currency)}/d)
                            </span>
                          )}
                        </td>

                        <td>
                          <div style={{ fontWeight: 800, color: '#0ea5e9' }}>
                            {formatINR(u.depositsInRange, u.currency)}
                          </div>
                          <div style={{ fontSize: '0.71rem', color: 'var(--adm-text-muted, #64748b)', marginTop: 2 }}>
                            Lifetime: {formatINR(u.lifetimeDeposited, u.currency)}
                          </div>
                        </td>

                        <td>
                          <div
                            style={{
                              fontWeight: 900,
                              fontSize: '0.96rem',
                              color: u.closingWalletLiabilityOnDate > 0 ? '#f59e0b' : 'var(--adm-text-muted, #64748b)',
                            }}
                          >
                            {formatINR(u.closingWalletLiabilityOnDate, u.currency)}
                          </div>
                          <div style={{ fontSize: '0.71rem', color: 'var(--adm-text-muted, #64748b)', marginTop: 2 }}>
                            Unearned balance owed
                          </div>
                        </td>

                        <td>
                          <div style={{ fontWeight: 800, color: '#6366f1' }}>
                            {formatINR(u.projectedOrSettledRevenue, u.currency)}
                          </div>
                          <div style={{ fontSize: '0.71rem', color: 'var(--adm-text-muted, #64748b)', marginTop: 2 }}>
                            {u.clientBilledInRange > 0
                              ? `${u.activeDaysCountInRange}d settled`
                              : u.projectedOrSettledRevenue > 0
                                ? 'Scheduled today'
                                : '0 active days'}
                          </div>
                        </td>

                        <td>
                          {isSingleDay ? (
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <input
                                  type="number"
                                  min="0"
                                  step="10"
                                  value={spendInputs[u.id] ?? ''}
                                  onChange={(e) =>
                                    setSpendInputs((prev) => ({ ...prev, [u.id]: e.target.value }))
                                  }
                                  style={{
                                    width: 82,
                                    height: 30,
                                    padding: '0 8px',
                                    borderRadius: 7,
                                    border: '1px solid var(--adm-border-strong, #cbd5e1)',
                                    background: 'var(--adm-bg-subtle, #f8fafc)',
                                    color: 'var(--adm-text-primary, #0f172a)',
                                    fontWeight: 800,
                                    fontSize: '0.82rem',
                                  }}
                                />
                                <button
                                  type="button"
                                  disabled={savingRowId === u.id}
                                  onClick={() => handleSaveSingleDaySpend(u)}
                                  className="sa-btn-secondary"
                                  style={{ height: 30, padding: '0 8px', fontSize: '0.74rem', fontWeight: 800 }}
                                  title="Save exact actual ad spend for this date"
                                >
                                  <Check size={12} /> {savingRowId === u.id ? '...' : 'Save'}
                                </button>
                              </div>
                              <div style={{ fontSize: '0.68rem', color: 'var(--adm-text-muted, #64748b)', marginTop: 3 }}>
                                {u.spendSource === 'confirmed'
                                  ? '✓ Confirmed Spend'
                                  : u.spendSource === 'preset_50'
                                    ? `${u.defaultSpendRatioPct}% Default Preset`
                                    : 'Inactive'}
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div style={{ fontWeight: 800, color: '#ec4899' }}>
                                {formatINR(u.actualAdSpend, u.currency)}
                              </div>
                              <div style={{ fontSize: '0.69rem', color: 'var(--adm-text-muted, #64748b)', marginTop: 2 }}>
                                {u.spendSource === 'confirmed'
                                  ? '✓ Confirmed'
                                  : u.spendSource === 'mixed'
                                    ? 'Confirmed + Preset'
                                    : u.spendSource === 'preset_50'
                                      ? `${u.defaultSpendRatioPct}% Preset`
                                      : '—'}
                              </div>
                            </div>
                          )}
                        </td>

                        <td>
                          <div
                            style={{
                              fontWeight: 900,
                              fontSize: '0.95rem',
                              color:
                                u.netProfit > 0
                                  ? '#10b981'
                                  : u.netProfit < 0
                                    ? '#ef4444'
                                    : 'var(--adm-text-muted, #64748b)',
                            }}
                          >
                            {u.netProfit > 0 ? '+' : ''}
                            {formatINR(u.netProfit, u.currency)}
                          </div>
                          {u.isOverSpentLoss ? (
                            <span
                              style={{
                                display: 'inline-block',
                                marginTop: 3,
                                background: 'rgba(239, 68, 68, 0.16)',
                                color: '#ef4444',
                                border: '1px solid rgba(239, 68, 68, 0.4)',
                                padding: '1px 6px',
                                borderRadius: 6,
                                fontSize: '0.67rem',
                                fontWeight: 900,
                              }}
                            >
                              🔴 OVER-SPENT ({u.marginPct}%)
                            </span>
                          ) : u.isOverTargetThinMargin ? (
                            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#d97706', marginTop: 2 }}>
                              ⚠️ Above {u.defaultSpendRatioPct}% Target ({u.marginPct}%)
                            </div>
                          ) : u.projectedOrSettledRevenue > 0 ? (
                            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: u.marginPct >= 0 ? '#10b981' : '#ef4444', marginTop: 2 }}>
                              {u.marginPct}% Margin
                            </div>
                          ) : null}
                        </td>

                        <td>
                          <div style={{ fontWeight: 800, color: 'var(--adm-text-primary, #0f172a)' }}>
                            {u.leadsDelivered} Leads
                          </div>
                          <div style={{ fontSize: '0.71rem', color: 'var(--adm-text-muted, #64748b)', marginTop: 2 }}>
                            Our CPL: <strong>{formatINR(u.realCpl, u.currency)}</strong>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </SmartTable>
          </div>
        </>
      ) : (
        /* ================= 6-STAGE CROSS-DEPARTMENT SLA & DELAY RADAR ================= */
        <div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 14,
              marginBottom: 18,
            }}
          >
            <div className="sa-card" style={{ padding: '16px 18px', borderLeft: '4px solid #ef4444' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--adm-text-muted, #64748b)', textTransform: 'uppercase' }}>
                Critical Delays Now
              </div>
              <div style={{ fontSize: '1.65rem', fontWeight: 900, color: '#ef4444', marginTop: 4 }}>
                {slaSummary.criticalCount}
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--adm-text-muted, #64748b)', marginTop: 3 }}>
                Total Active Bottlenecks: {slaSummary.totalBottlenecks}
              </div>
            </div>

            <div className="sa-card" style={{ padding: '16px 18px', borderLeft: '4px solid #3b82f6' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--adm-text-muted, #64748b)', textTransform: 'uppercase' }}>
                Sales / Lead Delays
              </div>
              <div style={{ fontSize: '1.65rem', fontWeight: 900, color: '#3b82f6', marginTop: 4 }}>
                {slaSummary.byDepartment?.Sales || 0}
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--adm-text-muted, #64748b)', marginTop: 3 }}>
                Onboarding (&gt;24h) or 0 Leads Today
              </div>
            </div>

            <div className="sa-card" style={{ padding: '16px 18px', borderLeft: '4px solid #a855f7' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--adm-text-muted, #64748b)', textTransform: 'uppercase' }}>
                Marketing Delays
              </div>
              <div style={{ fontSize: '1.65rem', fontWeight: 900, color: '#a855f7', marginTop: 4 }}>
                {slaSummary.byDepartment?.Marketing || 0}
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--adm-text-muted, #64748b)', marginTop: 3 }}>
                Avg Review Speed: <strong>{slaSummary.avgMarketingReviewLabel}</strong>
              </div>
            </div>

            <div className="sa-card" style={{ padding: '16px 18px', borderLeft: '4px solid #ec4899' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--adm-text-muted, #64748b)', textTransform: 'uppercase' }}>
                Graphics Delays
              </div>
              <div style={{ fontSize: '1.65rem', fontWeight: 900, color: '#ec4899', marginTop: 4 }}>
                {slaSummary.byDepartment?.Graphics || 0}
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--adm-text-muted, #64748b)', marginTop: 3 }}>
                Avg Design Speed: <strong>{slaSummary.avgGraphicsTurnaroundLabel}</strong>
              </div>
            </div>
          </div>

          <div className="sa-card" style={{ padding: 0, overflow: 'hidden' }}>
            <SmartTable
              title="End-to-End 6-Stage Delay & Bottleneck Radar"
              exportFilename={`admafia-sla-bottlenecks-${todayIso}`}
              defaultPageSize={15}
            >
              <table className="sa-table">
                <thead>
                  <tr>
                    <th>Stage</th>
                    <th>Responsible Department</th>
                    <th>Client Account</th>
                    <th>Delay / Bottleneck Reason</th>
                    <th>Waiting Duration</th>
                    <th style={{ textAlign: 'right' }}>Open Desk</th>
                  </tr>
                </thead>
                <tbody>
                  {bottlenecks.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: 44 }}>
                        <CheckCircle2 size={34} color="#10b981" style={{ marginBottom: 8 }} />
                        <div style={{ fontWeight: 800, color: 'var(--adm-text-primary, #0f172a)' }}>
                          Zero SLA Delays Across All Departments!
                        </div>
                        <div style={{ fontSize: '0.82rem', color: 'var(--adm-text-muted, #64748b)', marginTop: 4 }}>
                          Sales, Marketing, and Graphics are all within target turnaround thresholds.
                        </div>
                      </td>
                    </tr>
                  ) : (
                    bottlenecks.map((b) => (
                      <tr key={b.id}>
                        <td>
                          <span style={{ fontWeight: 800, fontSize: '0.82rem', color: 'var(--adm-text-primary, #0f172a)' }}>
                            {b.stageName}
                          </span>
                        </td>
                        <td>
                          <span
                            style={{
                              padding: '3px 9px',
                              borderRadius: 999,
                              fontSize: '0.74rem',
                              fontWeight: 800,
                              background:
                                b.department === 'Graphics'
                                  ? 'rgba(236, 72, 153, 0.14)'
                                  : b.department === 'Marketing'
                                    ? 'rgba(168, 85, 247, 0.14)'
                                    : 'rgba(59, 130, 246, 0.14)',
                              color:
                                b.department === 'Graphics'
                                  ? '#ec4899'
                                  : b.department === 'Marketing'
                                    ? '#a855f7'
                                    : '#3b82f6',
                            }}
                          >
                            {b.department}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 800, color: 'var(--adm-text-primary, #0f172a)' }}>
                            {b.companyName}
                          </div>
                          {b.phone && (
                            <div style={{ fontSize: '0.74rem', color: '#10b981', fontFamily: 'monospace' }}>
                              +91 {b.phone}
                            </div>
                          )}
                        </td>
                        <td>
                          <span
                            style={{
                              color: b.severity === 'critical' ? '#ef4444' : '#f59e0b',
                              fontWeight: 700,
                              fontSize: '0.84rem',
                            }}
                          >
                            {b.severity === 'critical' ? '🚨 ' : '⚠️ '}
                            {b.issue}
                          </span>
                        </td>
                        <td>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 800, color: 'var(--adm-text-primary, #0f172a)' }}>
                            <Clock size={13} color="#ef4444" /> {b.waitFormatted}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <a
                            href={b.actionHref}
                            className="sa-btn-secondary"
                            style={{
                              textDecoration: 'none',
                              padding: '5px 10px',
                              fontSize: '0.76rem',
                              fontWeight: 800,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                            }}
                          >
                            <span>Inspect</span>
                            <ExternalLink size={12} />
                          </a>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </SmartTable>
          </div>
        </div>
      )}
      <ChatbotAmmApiModal
        isOpen={isChatbotModalOpen}
        onClose={() => setIsChatbotModalOpen(false)}
        fetchWebhookInfo={() => superadminApi.getChatbotWebhookInfo()}
        testLeadFn={(payload) => superadminApi.testChatbotLead(payload)}
        rotateKeyFn={() => superadminApi.rotateChatbotWebhookSecret()}
        onLeadDispatched={() => fetchAll(true)}
      />
    </div>
  );
}
