import React, { useState, useEffect, useCallback } from 'react';
import {
  Building2,
  Users,
  CheckCircle2,
  AlertOctagon,
  HelpCircle,
  RotateCcw,
  CreditCard,
  Wallet,
  RefreshCw,
  ArrowRight,
  TrendingUp,
  Clock,
  ShieldAlert,
} from 'lucide-react';
import superadminApi from '../services/superadminApi';
import { SmartTable } from '../components/SmartTabulator';
import { useAdminTheme } from '../utils/adminTheme';

export default function SuperAdminDashboardDesk({ onNavigateToDesk, onNavigate }) {
  const { isDark } = useAdminTheme({ syncDocument: false });
  const nav = onNavigateToDesk || onNavigate;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState({
    summary: {
      totalBusinesses: 0,
      totalUsers: 0,
      activeAccounts: 0,
      blockedAccounts: 0,
      pendingQueries: 0,
      pendingRefunds: 0,
      pendingTopups: 0,
      totalWalletLiability: 0,
    },
    recentTransactions: [],
    recentAuditActions: [],
  });

  const loadDashboard = useCallback(async () => {
    try {
      const res = await superadminApi.getDashboardSummary();
      if (res && res.ok) {
        setData({
          summary: res.summary || {},
          recentTransactions: res.recentTransactions || [],
          recentAuditActions: res.recentAuditActions || [],
        });
      }
    } catch (err) {
      console.error('[SuperAdminDashboardDesk] Summary load failed:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
    const timer = setInterval(loadDashboard, 30000);
    return () => clearInterval(timer);
  }, [loadDashboard]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadDashboard();
  };

  const { summary, recentTransactions, recentAuditActions } = data;

  const statCards = [
    {
      id: 'businesses',
      deskKey: 'accounts',
      title: 'Total Businesses',
      value: summary.totalBusinesses,
      sub: `${summary.activeAccounts} currently active`,
      icon: Building2,
      iconBg: isDark ? 'rgba(59, 130, 246, 0.16)' : '#eff6ff',
      iconColor: isDark ? '#60a5fa' : '#3b82f6',
    },
    {
      id: 'users',
      deskKey: 'accounts',
      title: 'Platform Users',
      value: summary.totalUsers,
      sub: 'Admins & staff members',
      icon: Users,
      iconBg: isDark ? 'rgba(139, 92, 246, 0.16)' : '#f5f3ff',
      iconColor: isDark ? '#a78bfa' : '#8b5cf6',
    },
    {
      id: 'active',
      deskKey: 'accounts',
      title: 'Active Accounts',
      value: summary.activeAccounts,
      sub: 'Operating with good standing',
      icon: CheckCircle2,
      iconBg: isDark ? 'rgba(16, 185, 129, 0.16)' : '#ecfdf5',
      iconColor: isDark ? '#34d399' : '#10b981',
    },
    {
      id: 'blocked',
      deskKey: 'accounts',
      title: 'Blocked / Suspended',
      value: summary.blockedAccounts,
      sub: summary.blockedAccounts > 0 ? 'Action required' : 'No compliance holds',
      icon: AlertOctagon,
      iconBg: isDark ? 'rgba(244, 63, 94, 0.16)' : '#fff1f2',
      iconColor: isDark ? '#fb7185' : '#e11d48',
      urgent: summary.blockedAccounts > 0,
    },
    {
      id: 'liability',
      deskKey: 'finance',
      title: 'Wallet Liability',
      value: `₹${Number(summary.totalWalletLiability || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      sub: 'Customer prepaid balances',
      icon: Wallet,
      iconBg: isDark ? 'rgba(245, 158, 11, 0.16)' : '#fef3c7',
      iconColor: isDark ? '#fbbf24' : '#d97706',
    },
    {
      id: 'queries',
      deskKey: 'queries',
      title: 'Pending Queries',
      value: summary.pendingQueries,
      sub: 'Awaiting support reply',
      icon: HelpCircle,
      iconBg: isDark ? 'rgba(34, 197, 94, 0.16)' : '#f0fdf4',
      iconColor: isDark ? '#4ade80' : '#16a34a',
      urgent: summary.pendingQueries > 0,
    },
    {
      id: 'topups',
      deskKey: 'topups',
      title: 'Pending Top-Ups',
      value: summary.pendingTopups,
      sub: 'Bank UTRs awaiting review',
      icon: CreditCard,
      iconBg: isDark ? 'rgba(14, 165, 233, 0.16)' : '#e0f2fe',
      iconColor: isDark ? '#38bdf8' : '#0284c7',
      urgent: summary.pendingTopups > 0,
    },
    {
      id: 'refunds',
      deskKey: 'refunds',
      title: 'Pending Refunds',
      value: summary.pendingRefunds,
      sub: 'Awaiting refund decision',
      icon: RotateCcw,
      iconBg: isDark ? 'rgba(236, 72, 153, 0.16)' : '#fdf2f8',
      iconColor: isDark ? '#f472b6' : '#db2777',
      urgent: summary.pendingRefunds > 0,
    },
  ];

  return (
    <div className="sa-desk-content">
      {/* 1. Header with live refresh */}
      <div className="sa-page-header">
        <div>
          <h1>Super Admin Command Center</h1>
          <p>
            Centralized enterprise operations for Ad Mafia. Monitor live wallet liability, audit transactions, review refunds and top-up requests, and enforce account governance.
          </p>
        </div>

        <button
          type="button"
          className="sa-btn-secondary"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw size={14} className={refreshing ? 'sa-spin' : ''} />
          <span>{refreshing ? 'Syncing...' : 'Live Refresh'}</span>
        </button>
      </div>

      {/* 2. Live Stats Grid */}
      <div className="sa-stats-grid">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.id}
              className="sa-stat-card"
              onClick={() => nav && nav(card.deskKey)}
            >
              <div className="sa-stat-top">
                <span className="sa-stat-title">{card.title}</span>
                <div
                  className="sa-stat-icon-wrap"
                  style={{ background: card.iconBg, color: card.iconColor }}
                >
                  <Icon size={18} />
                </div>
              </div>
              <div
                className="sa-stat-val"
                style={{ color: card.urgent ? (isDark ? '#fb7185' : '#e11d48') : 'var(--adm-text-primary, #0f172a)' }}
              >
                {loading ? '...' : card.value}
              </div>
              <div className="sa-stat-sub">
                <span>{card.sub}</span>
                <ArrowRight size={12} style={{ marginLeft: 'auto' }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* 3. Operational Shortcuts */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
          marginBottom: 28,
        }}
      >
        <div
          className="sa-table-card"
          style={{ padding: 18, borderLeft: '4px solid #4f46e5', cursor: 'pointer' }}
          onClick={() => nav && nav('finance')}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 8,
                background: isDark ? 'rgba(99, 102, 241, 0.18)' : '#eef2ff',
                color: isDark ? '#818cf8' : '#4f46e5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <TrendingUp size={20} />
            </div>
            <div>
              <strong style={{ fontSize: '0.92rem', color: 'var(--adm-text-primary, #0f172a)' }}>Manage Finance</strong>
              <div style={{ fontSize: '0.78rem', color: 'var(--adm-text-muted, #64748b)' }}>
                Inspect balances, review transaction ledger &amp; export reports
              </div>
            </div>
            <ArrowRight size={16} color="var(--adm-text-muted, #94a3b8)" style={{ marginLeft: 'auto' }} />
          </div>
        </div>

        <div
          className="sa-table-card"
          style={{ padding: 18, borderLeft: '4px solid #059669', cursor: 'pointer' }}
          onClick={() => nav && nav('topups')}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 8,
                background: isDark ? 'rgba(16, 185, 129, 0.16)' : '#ecfdf5',
                color: isDark ? '#34d399' : '#059669',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CreditCard size={20} />
            </div>
            <div>
              <strong style={{ fontSize: '0.92rem', color: 'var(--adm-text-primary, #0f172a)' }}>Process Top-Ups</strong>
              <div style={{ fontSize: '0.78rem', color: 'var(--adm-text-muted, #64748b)' }}>
                Verify incoming Bank UTRs and approve wallet credits
              </div>
            </div>
            <ArrowRight size={16} color="var(--adm-text-muted, #94a3b8)" style={{ marginLeft: 'auto' }} />
          </div>
        </div>

        <div
          className="sa-table-card"
          style={{ padding: 18, borderLeft: '4px solid #e11d48', cursor: 'pointer' }}
          onClick={() => nav && nav('accounts')}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 8,
                background: isDark ? 'rgba(244, 63, 94, 0.16)' : '#fff1f2',
                color: isDark ? '#fb7185' : '#e11d48',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ShieldAlert size={20} />
            </div>
            <div>
              <strong style={{ fontSize: '0.92rem', color: 'var(--adm-text-primary, #0f172a)' }}>Block / Activate</strong>
              <div style={{ fontSize: '0.78rem', color: 'var(--adm-text-muted, #64748b)' }}>
                Manage account governance &amp; enforce compliance holds
              </div>
            </div>
            <ArrowRight size={16} color="var(--adm-text-muted, #94a3b8)" style={{ marginLeft: 'auto' }} />
          </div>
        </div>
      </div>

      {/* 4. Full-Width Stacked Tables: Recent Financial Transactions & Admin Governance Audit */}
      <div className="sa-split-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 24 }}>
        {/* Recent Transactions */}
        <div className="sa-table-card">
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--adm-border, #e2e8f0)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--adm-text-primary, #0f172a)' }}>Recent Financial Activity</h3>
              <div style={{ fontSize: '0.76rem', color: 'var(--adm-text-muted, #64748b)', marginTop: 2 }}>
                Live transactions processed through the MongoDB ledger
              </div>
            </div>
            <button
              type="button"
              className="sa-btn-secondary"
              style={{ padding: '4px 10px', fontSize: '0.76rem' }}
              onClick={() => nav && nav('finance')}
            >
              View All
            </button>
          </div>

          <SmartTable
            title="Recent Financial Activity"
            exportFilename="sa-recent-transactions"
            defaultPageSize={10}
          >
            <table className="sa-table">
              <thead>
                <tr>
                  <th>Business</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>UTR Ref</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {recentTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: 28, color: 'var(--adm-text-muted, #94a3b8)' }}>
                      No wallet transactions recorded yet.
                    </td>
                  </tr>
                ) : (
                  recentTransactions.map((tx) => (
                    <tr key={tx.id}>
                      <td>
                        <strong style={{ color: 'var(--adm-text-primary, #0f172a)' }}>{tx.company_name}</strong>
                      </td>
                      <td>
                        <span
                          className={`sa-pill ${tx.tx_type === 'Credit' ? 'sa-pill-green' : 'sa-pill-amber'}`}
                        >
                          {tx.tx_type}
                        </span>
                      </td>
                      <td style={{ fontWeight: 700, color: tx.tx_type === 'Credit' ? (isDark ? '#34d399' : '#059669') : 'var(--adm-text-primary, #0f172a)' }}>
                        {tx.tx_type === 'Credit' ? '+' : '-'}₹{Number(tx.amount).toFixed(2)}
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--adm-text-muted, #64748b)' }}>
                        {tx.reference_utr}
                      </td>
                      <td style={{ fontSize: '0.76rem', color: 'var(--adm-text-muted, #64748b)' }}>
                        {new Date(tx.created_at).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                        })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </SmartTable>
        </div>

        {/* Recent Admin Audit Logs */}
        <div className="sa-table-card">
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--adm-border, #e2e8f0)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--adm-text-primary, #0f172a)' }}>Admin Governance Audit</h3>
              <div style={{ fontSize: '0.76rem', color: 'var(--adm-text-muted, #64748b)', marginTop: 2 }}>
                Traceable administrative decisions &amp; actions
              </div>
            </div>
            <button
              type="button"
              className="sa-btn-secondary"
              style={{ padding: '4px 10px', fontSize: '0.76rem' }}
              onClick={() => nav && nav('accounts')}
            >
              All Logs
            </button>
          </div>

          <SmartTable
            title="Admin Governance Audit"
            defaultPageSize={8}
            exportFilename="admin-governance-audit"
          >
            <table className="sa-table">
              <thead>
                <tr>
                  <th>Action Type</th>
                  <th>Actor</th>
                  <th>Target</th>
                  <th>Reason / Summary</th>
                  <th>Timestamp (IST)</th>
                </tr>
              </thead>
              <tbody>
                {recentAuditActions.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: 28, color: 'var(--adm-text-muted, #94a3b8)' }}>
                      No administrative actions logged yet.
                    </td>
                  </tr>
                ) : (
                  recentAuditActions.map((log, idx) => (
                    <tr key={log.id || idx}>
                      <td>
                        <span className="sa-pill sa-pill-indigo" style={{ fontSize: '0.68rem' }}>
                          {(log.action_type || 'ADMIN_ACTION').replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td>
                        <strong style={{ color: 'var(--adm-text-primary, #0f172a)', fontSize: '0.82rem' }}>
                          {log.actor_name || 'Super Admin'}
                        </strong>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.80rem', fontWeight: 600, color: 'var(--adm-text-body, #334155)' }}>
                          {log.target_type || 'Entity'}
                        </div>
                        {log.target_id && (
                          <div style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: 'var(--adm-text-muted, #64748b)' }}>
                            {log.target_id}
                          </div>
                        )}
                      </td>
                      <td style={{ fontSize: '0.80rem', color: 'var(--adm-text-body, #475569)' }}>
                        {log.reason || '—'}
                      </td>
                      <td style={{ fontSize: '0.76rem', color: 'var(--adm-text-muted, #64748b)' }}>
                        {log.created_at
                          ? new Date(log.created_at).toLocaleString('en-IN', {
                              timeZone: 'Asia/Kolkata',
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: true,
                            })
                          : '—'}
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
  );
}

