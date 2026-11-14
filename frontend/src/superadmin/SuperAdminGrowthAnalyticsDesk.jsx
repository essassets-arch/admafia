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
} from 'lucide-react';
import superadminApi from '../services/superadminApi';

export default function SuperAdminGrowthAnalyticsDesk() {
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
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#b91c1c',
            fontWeight: 600,
            fontSize: '0.86rem',
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {/* Top Executive Growth & Ops KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Signup ➔ Paid Conversion
            </span>
            <TrendingUp size={18} color="#16a34a" />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>
            {funnel.signupToPaidConversionPct ?? 0}%
          </div>
          <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: '4px' }}>
            {funnel.paidActivated || 0} Paid of {funnel.totalRegistered || 0} Registered
          </div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              WhatsApp OTP Delivery
            </span>
            <CheckCircle2 size={18} color="#10b981" />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>
            {otpStats.successRatePct ?? 100}%
          </div>
          <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: '4px' }}>
            {otpStats.totalDispatched || 0} Sent • Avg {otpStats.avgLatencyMs || 0}ms
          </div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Churn Risk (≤ 2d Runway)
            </span>
            <AlertTriangle size={18} color="#ef4444" />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: lowRunway.length > 0 ? '#dc2626' : '#0f172a' }}>
            {lowRunway.length} Accounts
          </div>
          <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: '4px' }}>
            Starved Paid Clients (48h): <strong>{starvedClients.length}</strong>
          </div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              24h Security Shield
            </span>
            <ShieldAlert size={18} color="#7c3aed" />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>
            {(sec24h.rateLimitsBlocked || 0) +
              (sec24h.nosqlSanitized || 0) +
              (sec24h.rbacDenied || 0) +
              (sec24h.corsBlocked || 0) +
              (sec24h.otpLockouts || 0)}{' '}
            Blocked
          </div>
          <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: '4px' }}>
            FCM Devices: {shield.firebaseFcm?.activeDeviceTokens || 0} • Alerts:{' '}
            {shield.firebaseFcm?.totalNotificationsCreated || 0}
          </div>
        </div>
      </div>

      {/* Onboarding & Revenue Funnel */}
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '22px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.06rem', fontWeight: 800, color: '#0f172a' }}>
              10,000-User Onboarding &amp; Paid Activation Funnel
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#64748b' }}>
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
              border: '1px solid #cbd5e1',
              background: '#f8fafc',
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
                <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#334155' }}>{step.label}</span>
                <div className="sa-funnel-bar" style={{ height: '14px', background: '#f1f5f9', borderRadius: '999px', overflow: 'hidden' }}>
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
                <strong style={{ textAlign: 'right', fontSize: '0.9rem', color: '#0f172a' }}>{step.count}</strong>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2-Column Action Queues: Hot Unpaid Verified Drop-Offs + Low-Runway Churn Radar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '18px' }}>
        {/* Hot Unpaid Verified Drop-Offs */}
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <Users size={18} color="#16a34a" />
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
              Hot Verified Signups Awaiting First Top-Up ({hotUnpaid.length})
            </h3>
          </div>
          <p style={{ margin: '0 0 14px', fontSize: '0.8rem', color: '#64748b' }}>
            Users who registered &amp; verified WhatsApp OTP but haven&apos;t funded their wallet yet — highest-ROI Sales conversion queue.
          </p>

          <div style={{ overflowX: 'auto', maxHeight: '320px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '8px 10px' }}>Business / Phone</th>
                  <th style={{ padding: '8px 10px' }}>WhatsApp</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>1-Click Close</th>
                </tr>
              </thead>
              <tbody>
                {hotUnpaid.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>
                      All registered accounts are funded!
                    </td>
                  </tr>
                ) : (
                  hotUnpaid.map((c) => (
                    <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '9px 10px' }}>
                        <strong style={{ color: '#0f172a', display: 'block' }}>{c.companyName || c.username}</strong>
                        <span style={{ color: '#64748b', fontSize: '0.76rem' }}>
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
                            background: c.phoneVerified ? '#dcfce7' : '#fef3c7',
                            color: c.phoneVerified ? '#15803d' : '#92400e',
                          }}
                        >
                          {c.phoneVerified ? 'OTP Verified ✓' : 'Unverified'}
                        </span>
                      </td>
                      <td style={{ padding: '9px 10px', textAlign: 'right' }}>
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
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Low-Runway Churn Radar */}
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <Zap size={18} color="#ef4444" />
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
              Low-Runway Churn Radar — ≤ 2 Days Left ({lowRunway.length})
            </h3>
          </div>
          <p style={{ margin: '0 0 14px', fontSize: '0.8rem', color: '#64748b' }}>
            Paid clients whose wallet balance will pause ad delivery within 48 hours. Trigger instant recharge reminders.
          </p>

          <div style={{ overflowX: 'auto', maxHeight: '320px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '8px 10px' }}>Client</th>
                  <th style={{ padding: '8px 10px' }}>Balance / Runway</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Remind</th>
                </tr>
              </thead>
              <tbody>
                {lowRunway.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>
                      Zero paid accounts are in the ≤ 2-day churn zone.
                    </td>
                  </tr>
                ) : (
                  lowRunway.map((c) => (
                    <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '9px 10px' }}>
                        <strong style={{ color: '#0f172a', display: 'block' }}>{c.companyName}</strong>
                        <span style={{ color: '#64748b', fontSize: '0.76rem' }}>{c.phone}</span>
                      </td>
                      <td style={{ padding: '9px 10px' }}>
                        <strong style={{ color: '#dc2626' }}>₹{c.availableBalance}</strong>{' '}
                        <span style={{ color: '#64748b', fontSize: '0.75rem' }}>({c.runwayDays}d left)</span>
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
          </div>
        </div>
      </div>

      {/* Category Lead Liquidity Matrix */}
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <Layers size={18} color="#2563eb" />
          <h3 style={{ margin: 0, fontSize: '1.04rem', fontWeight: 800, color: '#0f172a' }}>
            Category Lead Liquidity &amp; Ad-Ops Supply Matrix (7-Day Window)
          </h3>
        </div>
        <p style={{ margin: '0 0 14px', fontSize: '0.82rem', color: '#64748b' }}>
          Compares funded active clients per business vertical against leads dispatched in the last 7 days so Marketing knows where to scale Meta ad budgets.
        </p>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
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
                <tr key={cat.category} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0f172a' }}>
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
                            ? '#fee2e2'
                            : cat.supplyStatus === 'LOW_SUPPLY'
                            ? '#fef3c7'
                            : '#dcfce7',
                        color:
                          cat.supplyStatus === 'STARVED'
                            ? '#b91c1c'
                            : cat.supplyStatus === 'LOW_SUPPLY'
                            ? '#92400e'
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
        </div>
      </div>

      {/* Live Security Shield Telemetry */}
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '22px' }}>
        <h3 style={{ margin: '0 0 12px', fontSize: '1.02rem', fontWeight: 800, color: '#0f172a' }}>
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
            <div key={label} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 12px' }}>
              <div style={{ fontSize: '0.73rem', color: '#64748b', fontWeight: 600 }}>{label}</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>{val}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

