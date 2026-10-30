import React, { useState, useEffect } from 'react';
import {
  Users,
  Lightbulb,
  FileCheck2,
  ShieldCheck,
  Rocket,
  Wallet,
  ArrowRight,
  TrendingUp,
  RefreshCw,
  Building,
  CheckCircle2,
  Clock,
  Sparkles,
} from 'lucide-react';
import marketingApi from '../services/marketingApi';

export default function MarketingDashboard({ onNavigateToDesk }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSummary() {
      setLoading(true);
      try {
        const res = await marketingApi.getSummary();
        if (res && res.ok) {
          setSummary(res.summary);
        }
      } catch (err) {
        console.error('[MarketingDashboard] Load error', err);
      } finally {
        setLoading(false);
      }
    }
    loadSummary();
  }, []);

  const desks = [
    {
      id: 'customers',
      title: 'Customer Registration & Wallet',
      desc: 'Verify completed customer registrations, ad wallet balances, and transaction history.',
      icon: Users,
      count: summary?.completedCustomersCount || 0,
      badge: 'Completed Profiles',
      color: '#4f46e5',
      bg: '#eef2ff',
    },
    {
      id: 'build_ideas',
      title: 'Build Ideas',
      desc: 'Structure marketing concepts, target audience parameters, and creative briefs.',
      icon: Lightbulb,
      count: summary?.totalIdeasCount || 0,
      badge: 'Strategic Ideas',
      color: '#0ea5e9',
      bg: '#f0f9ff',
    },
    {
      id: 'create_posts',
      title: 'Create Post Ideas',
      desc: 'Compose creative social posts linked to saved ideas with media attachments.',
      icon: FileCheck2,
      count: summary?.totalPostsCount || 0,
      badge: 'Total Creatives',
      color: '#8b5cf6',
      bg: '#f5f3ff',
    },
    {
      id: 'verify_posts',
      title: 'Verify Posts Queue',
      desc: 'Compliance and quality review pipeline: Approve, Reject, or Request Changes.',
      icon: ShieldCheck,
      count: summary?.pendingVerificationPosts || 0,
      badge: 'Pending Audit',
      color: '#d97706',
      bg: '#fffbeb',
      urgent: (summary?.pendingVerificationPosts || 0) > 0,
    },
    {
      id: 'customer_marketing',
      title: 'Customer Marketing Control',
      desc: 'Deploy and manage active campaigns with live pacing and external platform status.',
      icon: Rocket,
      count: summary?.activeCampaignsCount || 0,
      badge: 'Active Campaigns',
      color: '#10b981',
      bg: '#ecfdf5',
    },
  ];

  return (
    <div className="marketing-overview-page">
      {/* 1. Welcome Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
          borderRadius: '20px',
          padding: '32px 36px',
          color: '#ffffff',
          marginBottom: '28px',
          boxShadow: '0 10px 30px rgba(15, 23, 42, 0.12)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '20px',
        }}
      >
        <div style={{ maxWidth: '620px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '999px',
              background: 'rgba(255, 255, 255, 0.1)',
              fontSize: '0.74rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '10px',
            }}
          >
            <Sparkles size={12} /> AdMafia Marketing Operations
          </div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, margin: '0 0 10px 0', letterSpacing: '-0.03em' }}>
            Customer-Driven Advertising Operations
          </h1>
          <p style={{ margin: 0, fontSize: '0.94rem', color: '#cbd5e1', lineHeight: 1.55 }}>
            Complete marketing pipeline managing customer ideas, verified creative assets, ad wallet pacing, and live Meta campaign controls.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '14px',
              padding: '16px 20px',
              textAlign: 'center',
              minWidth: '150px',
            }}
          >
            <div style={{ fontSize: '0.74rem', textTransform: 'uppercase', fontWeight: 700, color: '#94a3b8' }}>
              Total Ad Balance
            </div>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#34d399', fontFamily: 'monospace', marginTop: '4px' }}>
              ₹{Number(summary?.totalWalletBalance || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </div>
          </div>
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '14px',
              padding: '16px 20px',
              textAlign: 'center',
              minWidth: '130px',
            }}
          >
            <div style={{ fontSize: '0.74rem', textTransform: 'uppercase', fontWeight: 700, color: '#94a3b8' }}>
              Approved Posts
            </div>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#60a5fa', fontFamily: 'monospace', marginTop: '4px' }}>
              {summary?.approvedPostsCount || 0}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Operations Desks Cards */}
      <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: '0 0 16px 0', color: '#0f172a' }}>
        Marketing Operational Desks
      </h3>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
        {desks.map((d) => {
          const Icon = d.icon;
          return (
            <div
              key={d.id}
              className="marketing-stat-card"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                padding: '24px',
                cursor: 'pointer',
                border: d.urgent ? '1.5px solid #f59e0b' : '1px solid #e2e8f0',
              }}
              onClick={() => onNavigateToDesk && onNavigateToDesk(d.id)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '12px',
                    background: d.bg,
                    color: d.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon size={24} />
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', fontFamily: 'monospace' }}>
                    {d.count}
                  </div>
                  <span style={{ fontSize: '0.74rem', fontWeight: 700, color: d.color }}>{d.badge}</span>
                </div>
              </div>

              <h4 style={{ margin: '0 0 6px 0', fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
                {d.title}
              </h4>
              <p style={{ margin: '0 0 20px 0', fontSize: '0.84rem', color: '#64748b', lineHeight: 1.5, flex: 1 }}>
                {d.desc}
              </p>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderTop: '1px solid #f1f5f9',
                  paddingTop: '14px',
                  color: d.color,
                  fontWeight: 700,
                  fontSize: '0.84rem',
                }}
              >
                <span>Open Desk</span>
                <ArrowRight size={15} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
