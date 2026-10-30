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

export default function SuperAdminDashboardDesk({ onNavigateToDesk }) {
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
      iconBg: '#eff6ff',
      iconColor: '#3b82f6',
    },
    {
      id: 'users',
      deskKey: 'accounts_users',
      title: 'Platform Users',
      value: summary.totalUsers,
      sub: 'Admins & staff members',
      icon: Users,
      iconBg: '#f5f3ff',
      iconColor: '#8b5cf6',
    },
    {
      id: 'active',
      deskKey: 'accounts',
      title: 'Active Accounts',
      value: summary.activeAccounts,
      sub: 'Operating with good standing',
      icon: CheckCircle2,
      iconBg: '#ecfdf5',
      iconColor: '#10b981',
    },
    {
      id: 'blocked',
      deskKey: 'accounts',
      title: 'Blocked / Suspended',
      value: summary.blockedAccounts,
      sub: summary.blockedAccounts > 0 ? 'Action required' : 'No compliance holds',
      icon: AlertOctagon,
      iconBg: '#fff1f2',
      iconColor: '#e11d48',
      urgent: summary.blockedAccounts > 0,
    },
    {
      id: 'liability',
      deskKey: 'finance',
      title: 'Wallet Liability',
      value: `₹${Number(summary.totalWalletLiability || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      sub: 'Customer prepaid balances',
      icon: Wallet,
      iconBg: '#fef3c7',
      iconColor: '#d97706',
    },
    {
      id: 'queries',
      deskKey: 'queries',
      title: 'Pending Queries',
      value: summary.pendingQueries,
      sub: 'Awaiting support reply',
      icon: HelpCircle,
      iconBg: '#f0fdf4',
      iconColor: '#16a34a',
      urgent: summary.pendingQueries > 0,
    },
    {
      id: 'topups',
      deskKey: 'topups',
      title: 'Pending Top-Ups',
      value: summary.pendingTopups,
      sub: 'Bank UTRs awaiting review',
      icon: CreditCard,
      iconBg: '#e0f2fe',
      iconColor: '#0284c7',
      urgent: summary.pendingTopups > 0,
    },
    {
      id: 'refunds',
      deskKey: 'refunds',
      title: 'Pending Refunds',
      value: summary.pendingRefunds,
      sub: 'Awaiting refund decision',
      icon: RotateCcw,
      iconBg: '#fdf2f8',
      iconColor: '#db2777',
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
            Centralized enterprise operations for AdMafia. Monitor live wallet liability, audit transactions, review refunds and top-up requests, and enforce account governance.
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
              onClick={() => onNavigateToDesk && onNavigateToDesk(card.deskKey)}
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
                style={{ color: card.urgent ? '#e11d48' : '#0f172a' }}
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
          onClick={() => onNavigateToDesk && onNavigateToDesk('finance')}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 8,
                background: '#eef2ff',
                color: '#4f46e5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <TrendingUp size={20} />
            </div>
            <div>
              <strong style={{ fontSize: '0.92rem', color: '#0f172a' }}>Manage Finance</strong>
              <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                Inspect balances, review transaction ledger & export reports
              </div>
            </div>
            <ArrowRight size={16} color="#94a3b8" style={{ marginLeft: 'auto' }} />
          </div>
        </div>

        <div
          className="sa-table-card"
          style={{ padding: 18, borderLeft: '4px solid #059669', cursor: 'pointer' }}
          onClick={() => onNavigateToDesk && onNavigateToDesk('topups')}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 8,
                background: '#ecfdf5',
                color: '#059669',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CreditCard size={20} />
            </div>
            <div>
              <strong style={{ fontSize: '0.92rem', color: '#0f172a' }}>Process Top-Ups</strong>
              <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                Verify incoming Bank UTRs and approve wallet credits
              </div>
            </div>
            <ArrowRight size={16} color="#94a3b8" style={{ marginLeft: 'auto' }} />
          </div>
        </div>

        <div
          className="sa-table-card"
          style={{ padding: 18, borderLeft: '4px solid #e11d48', cursor: 'pointer' }}
          onClick={() => onNavigateToDesk && onNavigateToDesk('accounts')}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 8,
                background: '#fff1f2',
                color: '#e11d48',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ShieldAlert size={20} />
            </div>
            <div>
              <strong style={{ fontSize: '0.92rem', color: '#0f172a' }}>Block / Activate</strong>
              <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                Manage account governance & enforce compliance holds
              </div>
            </div>
            <ArrowRight size={16} color="#94a3b8" style={{ marginLeft: 'auto' }} />
          </div>
        </div>
      </div>

      {/* 4. Split Grid: Recent Financial Transactions & Recent Audit Actions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.4fr) minmax(280px, 1fr)', gap: 24 }}>
        {/* Recent Transactions */}
        <div className="sa-table-card">
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>Recent Financial Activity</h3>
              <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: 2 }}>
                Live transactions processed through the PostgreSQL ledger
              </div>
            </div>
            <button
              type="button"
              className="sa-btn-secondary"
              style={{ padding: '4px 10px', fontSize: '0.76rem' }}
              onClick={() => onNavigateToDesk && onNavigateToDesk('finance')}
            >
              View All
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
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
                    <td colSpan={5} style={{ textAlign: 'center', padding: 28, color: '#94a3b8' }}>
                      No wallet transactions recorded yet.
                    </td>
                  </tr>
                ) : (
                  recentTransactions.map((tx) => (
                    <tr key={tx.id}>
                      <td>
                        <strong style={{ color: '#0f172a' }}>{tx.company_name}</strong>
                      </td>
                      <td>
                        <span
                          className={`sa-pill ${tx.tx_type === 'Credit' ? 'sa-pill-green' : 'sa-pill-amber'}`}
                        >
                          {tx.tx_type}
                        </span>
                      </td>
                      <td style={{ fontWeight: 700, color: tx.tx_type === 'Credit' ? '#059669' : '#0f172a' }}>
                        {tx.tx_type === 'Credit' ? '+' : '-'}₹{Number(tx.amount).toFixed(2)}
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: '#64748b' }}>
                        {tx.reference_utr}
                      </td>
                      <td style={{ fontSize: '0.76rem', color: '#64748b' }}>
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
          </div>
        </div>

        {/* Recent Admin Audit Logs */}
        <div className="sa-table-card">
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>Admin Governance Audit</h3>
              <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: 2 }}>
                Traceable administrative decisions &amp; actions
              </div>
            </div>
            <button
              type="button"
              className="sa-btn-secondary"
              style={{ padding: '4px 10px', fontSize: '0.76rem' }}
              onClick={() => onNavigateToDesk && onNavigateToDesk('audit_logs')}
            >
              All Logs
            </button>
          </div>

          <div style={{ padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {recentAuditActions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 28, color: '#94a3b8' }}>
                No administrative actions logged yet.
              </div>
            ) : (
              recentAuditActions.map((log) => (
                <div
                  key={log.id}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 3,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="sa-pill sa-pill-indigo" style={{ fontSize: '0.68rem' }}>
                      {log.action_type.replace(/_/g, ' ')}
                    </span>
                    <span style={{ fontSize: '0.70rem', color: '#94a3b8' }}>
                      {new Date(log.created_at).toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true,
                      })}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.80rem', color: '#0f172a', fontWeight: 600, marginTop: 2 }}>
                    By {log.actor_name} on {log.target_type} ({log.target_id})
                  </div>
                  {log.reason && (
                    <div style={{ fontSize: '0.74rem', color: '#64748b', fontStyle: 'italic' }}>
                      "{log.reason}"
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

