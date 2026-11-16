import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  AlertTriangle,
  MessageCircle,
  ShieldAlert,
  RefreshCw,
  Users,
  Zap,
  CheckCircle2,
  Layers,
  Bell,
  Trash2,
} from 'lucide-react';
import Swal from 'sweetalert2';
import superadminApi from '../services/superadminApi';
import { SmartTable } from '../components/SmartTabulator';
import { useAdminTheme } from '../utils/adminTheme';

export default function SuperAdminGrowthAnalyticsDesk() {
  const { isDark } = useAdminTheme({ syncDocument: false });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadAnalytics = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await superadminApi.getGrowthAnalytics();
      if (res && res.ok) {
        setData(res);
      }
    } catch (err) {
      setError(err.message || 'Could not load growth analytics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, []);

  const handlePurgeDemoSignup = async (c) => {
    const label = c.companyName || c.username || c.phone;
    const confirmRes = await Swal.fire({
      icon: 'warning',
      title: 'Purge Unpaid / Demo Signup End-to-End?',
      html: `
        <div style="text-align:left; font-size:13px; line-height:1.65;">
          <div><strong>Account:</strong> ${label}</div>
          <div><strong>Phone:</strong> ${c.phone || 'N/A'}</div>
          <div style="margin-top:10px; padding:9px 12px; border-radius:8px; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); color:#dc2626; font-weight:600;">
            Deletes customer, wallet, leads, verifications, notifications &amp; clears WhatsApp OTP locks so this phone can register fresh immediately.
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Delete End-to-End',
    });
    if (!confirmRes.isConfirmed) return;

    try {
      const res = await superadminApi.deleteAccount(c.id, {
        accountType: 'business',
        reason: 'Demo / Unpaid Signup Purged from Growth Radar by Super Admin',
      });
      if (res && res.ok) {
        await loadAnalytics();
        Swal.fire({
          icon: 'success',
          title: 'Account Purged End-to-End',
          text: res.message,
          timer: 1800,
          showConfirmButton: false,
        });
      }
    } catch (err) {
      Swal.fire('Delete Failed', err.message || 'Could not purge account.', 'error');
    }
  };

  const funnel = data?.funnel || {};
  const hotUnpaid = data?.hotUnpaidVerifiedLeads || [];
  const lowRunway = data?.lowRunwayAtRisk || [];
  const categories = data?.categoryLiquidity || [];
  const starvedClients = data?.starvedPaidClients || [];
  const shield = data?.opsShield || {};
  const otpStats = shield.whatsappOtp || {};
  const sec24h = shield.security24h || {};

  const funnelSteps = [
    { label: 'WhatsApp OTPs Sent', count: funnel.otpChallengesSent || 0, color: '#6366f1' },
    { label: 'Registered Accounts', count: funnel.totalRegistered || 0, color: '#3b82f6' },
    { label: 'WhatsApp Verified', count: funnel.whatsappVerified || 0, color: '#10b981' },
    { label: 'KYC Profile Complete', count: funnel.profileCompleted || 0, color: '#0ea5e9' },
    { label: 'Paid Wallet Activated', count: funnel.paidActivated || 0, color: '#8b5cf6' },
    { label: 'Active Daily Campaigns', count: funnel.activeCampaigns || 0, color: '#f59e0b' },
  ];

  const maxFunnel = Math.max(1, ...funnelSteps.map((s) => s.count));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {error && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '12px',
            background: isDark ? 'rgba(239, 68, 68, 0.14)' : '#fef2f2',
            border: isDark ? '1px solid rgba(239, 68, 68, 0.35)' : '1px solid #fecaca',
            color: isDark ? '#fca5a5' : '#b91c1c',
            fontWeight: 600,
            fontSize: '0.86rem',
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {/* Top Executive Growth & Ops KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
        <div style={{ background: 'var(--adm-bg-card, #ffffff)', border: '1px solid var(--adm-border, #e2e8f0)', borderRadius: '14px', padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--adm-text-muted, #64748b)', textTransform: 'uppercase' }}>
              Signup ➔ Paid Conversion
            </span>
            <TrendingUp size={18} color={isDark ? '#34d399' : '#16a34a'} />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--adm-text-primary, #0f172a)' }}>
            {funnel.signupToPaidConversionPct ?? 0}%
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--adm-text-body, #475569)', marginTop: '4px' }}>
            {funnel.paidActivated || 0} Paid of {funnel.totalRegistered || 0} Registered
          </div>
        </div>

        <div style={{ background: 'var(--adm-bg-card, #ffffff)', border: '1px solid var(--adm-border, #e2e8f0)', borderRadius: '14px', padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--adm-text-muted, #64748b)', textTransform: 'uppercase' }}>
              WhatsApp OTP Delivery
            </span>
            <CheckCircle2 size={18} color="#10b981" />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--adm-text-primary, #0f172a)' }}>
            {otpStats.successRatePct ?? 100}%
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--adm-text-body, #475569)', marginTop: '4px' }}>
            {otpStats.totalDispatched || 0} Sent • Avg {otpStats.avgLatencyMs || 0}ms
          </div>
        </div>

        <div style={{ background: 'var(--adm-bg-card, #ffffff)', border: '1px solid var(--adm-border, #e2e8f0)', borderRadius: '14px', padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--adm-text-muted, #64748b)', textTransform: 'uppercase' }}>
              Churn Risk (≤ 2d Runway)
            </span>
            <AlertTriangle size={18} color="#ef4444" />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: lowRunway.length > 0 ? (isDark ? '#f87171' : '#dc2626') : 'var(--adm-text-primary, #0f172a)' }}>
            {lowRunway.length} Accounts
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--adm-text-body, #475569)', marginTop: '4px' }}>
            Starved Paid Clients (48h): <strong>{starvedClients.length}</strong>
          </div>
        </div>

        <div style={{ background: 'var(--adm-bg-card, #ffffff)', border: '1px solid var(--adm-border, #e2e8f0)', borderRadius: '14px', padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--adm-text-muted, #64748b)', textTransform: 'uppercase' }}>
              24h Security Shield
            </span>
            <ShieldAlert size={18} color={isDark ? '#a78bfa' : '#7c3aed'} />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--adm-text-primary, #0f172a)' }}>
            {(sec24h.rateLimitsBlocked || 0) +
              (sec24h.nosqlSanitized || 0) +
              (sec24h.rbacDenied || 0) +
              (sec24h.corsBlocked || 0) +
              (sec24h.otpLockouts || 0)}{' '}
            Blocked
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--adm-text-body, #475569)', marginTop: '4px' }}>
            FCM Devices: {shield.firebaseFcm?.activeDeviceTokens || 0} • Alerts:{' '}
            {shield.firebaseFcm?.totalNotificationsCreated || 0}
          </div>
        </div>
      </div>

      {/* Onboarding & Revenue Funnel */}
      <div style={{ background: 'var(--adm-bg-card, #ffffff)', border: '1px solid var(--adm-border, #e2e8f0)', borderRadius: '16px', padding: '22px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.06rem', fontWeight: 800, color: 'var(--adm-text-primary, #0f172a)' }}>
              10,000-User Onboarding &amp; Paid Activation Funnel
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--adm-text-muted, #64748b)' }}>
              Live MongoDB <code>$facet</code> conversion pipeline from initial WhatsApp OTP challenge to active daily ad spend.
            </p>
          </div>
          <button
            type="button"
            onClick={loadAnalytics}
            disabled={loading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '9px',
              border: '1px solid var(--adm-border-strong, #cbd5e1)',
              background: 'var(--adm-bg-subtle, #f8fafc)',
              color: 'var(--adm-text-primary, #0f172a)',
              fontWeight: 700,
              fontSize: '0.82rem',
              cursor: 'pointer',
            }}
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {funnelSteps.map((step) => {
            const pct = Math.max(4, Math.round((step.count / maxFunnel) * 100));
            return (
              <div key={step.label} className="sa-funnel-row" style={{ display: 'grid', gridTemplateColumns: '200px 1fr 70px', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--adm-text-body, #334155)' }}>{step.label}</span>
                <div className="sa-funnel-bar" style={{ height: '14px', background: 'var(--adm-bg-muted, #f1f5f9)', borderRadius: '999px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${pct}%`,
                      height: '100%',
                      background: step.color,
                      borderRadius: '999px',
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
                <strong style={{ textAlign: 'right', fontSize: '0.9rem', color: 'var(--adm-text-primary, #0f172a)' }}>{step.count}</strong>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2-Column Action Queues: Hot Unpaid Verified Drop-Offs + Low-Runway Churn Radar */}
      <div className="sa-growth-queues-grid">
        {/* Hot Unpaid Verified Drop-Offs */}
        <div style={{ background: 'var(--adm-bg-card, #ffffff)', border: '1px solid var(--adm-border, #e2e8f0)', borderRadius: '16px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <Users size={18} color={isDark ? '#34d399' : '#16a34a'} />
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--adm-text-primary, #0f172a)' }}>
              Hot Verified Signups Awaiting First Top-Up ({hotUnpaid.length})
            </h3>
          </div>
          <p style={{ margin: '0 0 14px', fontSize: '0.8rem', color: 'var(--adm-text-muted, #64748b)' }}>
            Users who registered &amp; verified WhatsApp OTP but haven&apos;t funded their wallet yet — highest-ROI Sales conversion queue.
          </p>

          <SmartTable
            title="Hot Verified Signups Awaiting First Top-Up"
            exportFilename="sa-hot-unpaid-signups"
            defaultPageSize={10}
          >
            <table className="sa-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ background: 'var(--adm-bg-subtle, #f8fafc)', textAlign: 'left', borderBottom: '1px solid var(--adm-border, #e2e8f0)' }}>
                  <th style={{ padding: '8px 10px' }}>Business / Phone</th>
                  <th style={{ padding: '8px 10px' }}>WhatsApp</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>1-Click Close</th>
                </tr>
              </thead>
              <tbody>
                {hotUnpaid.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ padding: '20px', textAlign: 'center', color: 'var(--adm-text-muted, #64748b)' }}>
                      All registered accounts are funded!
                    </td>
                  </tr>
                ) : (
                  hotUnpaid.map((c) => (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--adm-border-subtle, #f1f5f9)' }}>
                      <td style={{ padding: '9px 10px' }}>
                        <strong style={{ color: 'var(--adm-text-primary, #0f172a)', display: 'block' }}>{c.companyName || c.username}</strong>
                        <span style={{ color: 'var(--adm-text-muted, #64748b)', fontSize: '0.76rem' }}>
                          {c.phone} {c.city ? `• ${c.city}` : ''}
                        </span>
                      </td>
                      <td style={{ padding: '9px 10px' }}>
                        <span
                          style={{
                            padding: '2px 7px',
                            borderRadius: '999px',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            background: c.phoneVerified
                              ? isDark
                                ? 'rgba(16, 185, 129, 0.16)'
                                : '#dcfce7'
                              : isDark
                              ? 'rgba(245, 158, 11, 0.18)'
                              : '#fef3c7',
                            color: c.phoneVerified
                              ? isDark
                                ? '#34d399'
                                : '#15803d'
                              : isDark
                              ? '#fbbf24'
                              : '#92400e',
                          }}
                        >
                          {c.phoneVerified ? 'OTP Verified ✓' : 'Unverified'}
                        </span>
                      </td>
                      <td style={{ padding: '9px 10px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                          <a
                            href={c.whatsappOutreachUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              padding: '5px 10px',
                              borderRadius: '8px',
                              background: '#16a34a',
                              color: '#ffffff',
                              textDecoration: 'none',
                              fontWeight: 700,
                              fontSize: '0.75rem',
                            }}
                          >
                            <MessageCircle size={13} /> WhatsApp
                          </a>
                          <button
                            type="button"
                            onClick={() => handlePurgeDemoSignup(c)}
                            title="Delete unpaid / demo account end-to-end"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: '5px 8px',
                              borderRadius: '8px',
                              border: '1px solid rgba(239, 68, 68, 0.35)',
                              background: isDark ? 'rgba(239, 68, 68, 0.16)' : '#fef2f2',
                              color: isDark ? '#f87171' : '#dc2626',
                              cursor: 'pointer',
                            }}
                          >
                            <Trash2 size={13} />
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

        {/* Low-Runway Churn Radar */}
        <div style={{ background: 'var(--adm-bg-card, #ffffff)', border: '1px solid var(--adm-border, #e2e8f0)', borderRadius: '16px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <Zap size={18} color="#ef4444" />
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--adm-text-primary, #0f172a)' }}>
              Low-Runway Churn Radar — ≤ 2 Days Left ({lowRunway.length})
            </h3>
          </div>
          <p style={{ margin: '0 0 14px', fontSize: '0.8rem', color: 'var(--adm-text-muted, #64748b)' }}>
            Paid clients whose wallet balance will pause ad delivery within 48 hours. Trigger instant recharge reminders.
          </p>

          <SmartTable
            title="Low-Runway Churn Radar"
            exportFilename="sa-low-runway-churn-radar"
            defaultPageSize={10}
          >
            <table className="sa-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ background: 'var(--adm-bg-subtle, #f8fafc)', textAlign: 'left', borderBottom: '1px solid var(--adm-border, #e2e8f0)' }}>
                  <th style={{ padding: '8px 10px' }}>Client</th>
                  <th style={{ padding: '8px 10px' }}>Balance / Runway</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Remind</th>
                </tr>
              </thead>
              <tbody>
                {lowRunway.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ padding: '20px', textAlign: 'center', color: 'var(--adm-text-muted, #64748b)' }}>
                      Zero paid accounts are in the ≤ 2-day churn zone.
                    </td>
                  </tr>
                ) : (
                  lowRunway.map((c) => (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--adm-border-subtle, #f1f5f9)' }}>
                      <td style={{ padding: '9px 10px' }}>
                        <strong style={{ color: 'var(--adm-text-primary, #0f172a)', display: 'block' }}>{c.companyName}</strong>
                        <span style={{ color: 'var(--adm-text-muted, #64748b)', fontSize: '0.76rem' }}>{c.phone}</span>
                      </td>
                      <td style={{ padding: '9px 10px' }}>
                        <strong style={{ color: isDark ? '#f87171' : '#dc2626' }}>₹{c.availableBalance}</strong>{' '}
                        <span style={{ color: 'var(--adm-text-muted, #64748b)', fontSize: '0.75rem' }}>({c.runwayDays}d left)</span>
                      </td>
                      <td style={{ padding: '9px 10px', textAlign: 'right' }}>
                        <a
                          href={c.whatsappRemindUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '5px 10px',
                            borderRadius: '8px',
                            background: '#ea580c',
                            color: '#ffffff',
                            textDecoration: 'none',
                            fontWeight: 700,
                            fontSize: '0.75rem',
                          }}
                        >
                          <Bell size={13} /> Recharge Alert
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

      {/* Category Lead Liquidity Matrix */}
      <div style={{ background: 'var(--adm-bg-card, #ffffff)', border: '1px solid var(--adm-border, #e2e8f0)', borderRadius: '16px', padding: '22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <Layers size={18} color={isDark ? '#60a5fa' : '#2563eb'} />
          <h3 style={{ margin: 0, fontSize: '1.04rem', fontWeight: 800, color: 'var(--adm-text-primary, #0f172a)' }}>
            Category Lead Liquidity &amp; Ad-Ops Supply Matrix (7-Day Window)
          </h3>
        </div>
        <p style={{ margin: '0 0 14px', fontSize: '0.82rem', color: 'var(--adm-text-muted, #64748b)' }}>
          Compares funded active clients per business vertical against leads dispatched in the last 7 days so Marketing knows where to scale Meta ad budgets.
        </p>

        <SmartTable
          title="Category Lead Liquidity Matrix"
          exportFilename="sa-category-liquidity-matrix"
          defaultPageSize={10}
        >
          <table className="sa-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
            <thead>
              <tr style={{ background: 'var(--adm-bg-subtle, #f8fafc)', textAlign: 'left', borderBottom: '1px solid var(--adm-border, #e2e8f0)' }}>
                <th style={{ padding: '10px 12px' }}>Business Category</th>
                <th style={{ padding: '10px 12px' }}>Total Clients</th>
                <th style={{ padding: '10px 12px' }}>Funded Today</th>
                <th style={{ padding: '10px 12px' }}>Leads (7d)</th>
                <th style={{ padding: '10px 12px' }}>Leads / Funded Client</th>
                <th style={{ padding: '10px 12px' }}>Available Wallet Pool</th>
                <th style={{ padding: '10px 12px' }}>Liquidity Health</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => (
                <tr key={cat.category} style={{ borderBottom: '1px solid var(--adm-border-subtle, #f1f5f9)' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--adm-text-primary, #0f172a)' }}>
                    {cat.category || 'Uncategorized'}
                  </td>
                  <td style={{ padding: '10px 12px' }}>{cat.totalClients}</td>
                  <td style={{ padding: '10px 12px', fontWeight: 700 }}>{cat.fundedClients}</td>
                  <td style={{ padding: '10px 12px' }}>{cat.leadsDispatched7d}</td>
                  <td style={{ padding: '10px 12px' }}>{cat.leadsPerFundedClient7d}</td>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                    ₹{Number(cat.totalAvailableWallet || 0).toLocaleString('en-IN')}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span
                      style={{
                        padding: '3px 9px',
                        borderRadius: '999px',
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        background:
                          cat.supplyStatus === 'STARVED'
                            ? isDark
                              ? 'rgba(239, 68, 68, 0.16)'
                              : '#fee2e2'
                            : cat.supplyStatus === 'LOW_SUPPLY'
                            ? isDark
                              ? 'rgba(245, 158, 11, 0.18)'
                              : '#fef3c7'
                            : isDark
                            ? 'rgba(16, 185, 129, 0.16)'
                            : '#dcfce7',
                        color:
                          cat.supplyStatus === 'STARVED'
                            ? isDark
                              ? '#fca5a5'
                              : '#b91c1c'
                            : cat.supplyStatus === 'LOW_SUPPLY'
                            ? isDark
                              ? '#fbbf24'
                              : '#92400e'
                            : isDark
                            ? '#34d399'
                            : '#15803d',
                      }}
                    >
                      {cat.supplyStatus}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </SmartTable>
      </div>

      {/* Live Security Shield Telemetry */}
      <div style={{ background: 'var(--adm-bg-card, #ffffff)', border: '1px solid var(--adm-border, #e2e8f0)', borderRadius: '16px', padding: '22px' }}>
        <h3 style={{ margin: '0 0 12px', fontSize: '1.02rem', fontWeight: 800, color: 'var(--adm-text-primary, #0f172a)' }}>
          24-Hour Adversarial Security Shield Events
        </h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '10px',
            marginBottom: '14px',
          }}
        >
          {[
            ['Rate Limits Blocked', sec24h.rateLimitsBlocked || 0],
            ['OTP Brute-Force Lockouts', sec24h.otpLockouts || 0],
            ['NoSQL Injections Stripped', sec24h.nosqlSanitized || 0],
            ['Unauthorized RBAC Blocked', sec24h.rbacDenied || 0],
            ['CORS Origins Rejected', sec24h.corsBlocked || 0],
            ['Failed Logins', sec24h.authFailures || 0],
          ].map(([label, val]) => (
            <div key={label} style={{ background: 'var(--adm-bg-subtle, #f8fafc)', border: '1px solid var(--adm-border, #e2e8f0)', borderRadius: '10px', padding: '10px 12px' }}>
              <div style={{ fontSize: '0.73rem', color: 'var(--adm-text-muted, #64748b)', fontWeight: 600 }}>{label}</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--adm-text-primary, #0f172a)', marginTop: '2px' }}>{val}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

