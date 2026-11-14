import React, { useState, useEffect } from 'react';
import {
  Database,
  HardDrive,
  ShieldCheck,
  RefreshCw,
  Download,
  Copy,
  Check,
  Lock,
  Server,
  Cloud,
  Terminal,
  Activity,
} from 'lucide-react';
import superadminApi from '../services/superadminApi';

function formatBytes(bytes) {
  const n = Number(bytes || 0);
  if (n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const idx = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  return `${(n / Math.pow(1024, idx)).toFixed(idx === 0 ? 0 : 2)} ${units[idx]}`;
}

export default function SuperAdminDatabaseDesk() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creatingSnapshot, setCreatingSnapshot] = useState(false);
  const [encryptSnapshot, setEncryptSnapshot] = useState(true);
  const [copiedKey, setCopiedKey] = useState('');
  const [banner, setBanner] = useState(null);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const res = await superadminApi.getDatabaseStatus();
      if (res && res.ok) {
        setData(res);
      }
    } catch (err) {
      setBanner({ type: 'error', text: err.message || 'Could not load database status.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleCopy = (key, text) => {
    try {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(''), 2000);
    } catch (e) {}
  };

  const handleTriggerSnapshot = async () => {
    setCreatingSnapshot(true);
    setBanner(null);
    try {
      const res = await superadminApi.triggerDatabaseSnapshot(encryptSnapshot);
      if (res?.snapshot) {
        setBanner({
          type: 'success',
          text: `Snapshot "${res.snapshot.filename}" (${formatBytes(res.snapshot.sizeBytes)}) created & verified via SHA-256!`,
        });
        await loadStatus();
      }
    } catch (err) {
      setBanner({ type: 'error', text: err.message || 'Snapshot creation failed.' });
    } finally {
      setCreatingSnapshot(false);
    }
  };

  const mongo = data?.mongo || {};
  const replSet = mongo.replicaSet || {};
  const compass = data?.compassGuides || {};
  const snapshots = data?.snapshots || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {banner && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '12px',
            background: banner.type === 'error' ? '#fef2f2' : '#ecfdf5',
            border: `1px solid ${banner.type === 'error' ? '#fecaca' : '#a7f3d0'}`,
            color: banner.type === 'error' ? '#b91c1c' : '#065f46',
            fontWeight: 600,
            fontSize: '0.88rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{banner.text}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 800, color: 'inherit' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Executive KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '14px',
        }}
      >
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              MongoDB 7.0 Engine
            </span>
            <Database size={18} color="#10b981" />
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a' }}>
            {replSet.myStateStr || 'PRIMARY'} ({replSet.set || 'rs0'})
          </div>
          <div style={{ fontSize: '0.78rem', color: '#059669', marginTop: '4px', fontWeight: 600 }}>
            ● {mongo.collectionsCount || 0} Collections • {mongo.objectsCount || 0} Total Docs
          </div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Data + Index Footprint
            </span>
            <HardDrive size={18} color="#3b82f6" />
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a' }}>
            {formatBytes((mongo.dataSizeBytes || 0) + (mongo.indexSizeBytes || 0))}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '4px' }}>
            Data: {formatBytes(mongo.dataSizeBytes)} • Indexes: {formatBytes(mongo.indexSizeBytes)}
          </div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Redis Rate-Limit &amp; Cache
            </span>
            <Server size={18} color="#8b5cf6" />
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a' }}>
            {data?.redis?.connected ? 'REDIS LIVE' : 'MEMORY FALLBACK'}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '4px' }}>
            Outbox Queue Pending: <strong>{data?.outbox?.pendingOrFailedCount ?? 0}</strong>
          </div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              WhatsApp v26 &amp; FCM Push
            </span>
            <Activity size={18} color="#f59e0b" />
          </div>
          <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
            WA: {(data?.integrations?.whatsappCloudApi?.mode || 'sandbox').toUpperCase()}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '4px' }}>
            Live SSE Clients: <strong>{data?.integrations?.firebaseFcm?.activeSseConnections ?? 0}</strong> • FCM:{' '}
            {data?.integrations?.firebaseFcm?.serverConfigured ? 'Active' : 'SSE Mode'}
          </div>
        </div>
      </div>

      {/* MongoDB Compass & Cloud Atlas Connection Center */}
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '22px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.08rem', fontWeight: 800, color: '#0f172a' }}>
              MongoDB Compass &amp; Cloud Atlas Connection Center
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '0.83rem', color: '#64748b' }}>
              Inspect live collections visually in MongoDB Compass without exposing port 27017 to the public internet.
            </p>
          </div>
          <button
            type="button"
            onClick={loadStatus}
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
              color: '#0f172a',
            }}
          >
            <RefreshCw size={14} /> Refresh Telemetry
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: '14px' }}>
          {/* Local Docker Compass */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <Database size={16} color="#16a34a" />
              <strong style={{ fontSize: '0.86rem', color: '#0f172a' }}>1. Local Docker Stack (MongoDB Compass)</strong>
            </div>
            <p style={{ margin: '0 0 10px', fontSize: '0.78rem', color: '#475569' }}>
              Paste directly into MongoDB Compass on your workstation to browse local Docker collections:
            </p>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <code
                style={{
                  flex: 1,
                  background: '#0f172a',
                  color: '#38bdf8',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  fontSize: '0.74rem',
                  overflowX: 'auto',
                  whiteSpace: 'nowrap',
                }}
              >
                {compass.localDockerUri || 'mongodb://127.0.0.1:27018/admafia_crm?directConnection=true'}
              </code>
              <button
                type="button"
                onClick={() =>
                  handleCopy(
                    'local',
                    compass.localDockerUri || 'mongodb://127.0.0.1:27018/admafia_crm?directConnection=true'
                  )
                }
                style={{
                  padding: '8px 10px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                }}
              >
                {copiedKey === 'local' ? <Check size={14} color="#16a34a" /> : <Copy size={14} />}
                {copiedKey === 'local' ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          {/* VPS SSH Tunnel */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <Terminal size={16} color="#2563eb" />
              <strong style={{ fontSize: '0.86rem', color: '#0f172a' }}>2. Live VPS via Encrypted SSH Tunnel</strong>
            </div>
            <p style={{ margin: '0 0 10px', fontSize: '0.78rem', color: '#475569' }}>
              Run tunnel in terminal, then connect Compass to <code>127.0.0.1:27019</code>:
            </p>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <code
                style={{
                  flex: 1,
                  background: '#0f172a',
                  color: '#a7f3d0',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  fontSize: '0.74rem',
                  overflowX: 'auto',
                  whiteSpace: 'nowrap',
                }}
              >
                {compass.vpsSshTunnelCmd || 'ssh -N -L 27019:127.0.0.1:27017 root@admafia.marketing'}
              </code>
              <button
                type="button"
                onClick={() =>
                  handleCopy(
                    'ssh',
                    compass.vpsSshTunnelCmd || 'ssh -N -L 27019:127.0.0.1:27017 root@admafia.marketing'
                  )
                }
                style={{
                  padding: '8px 10px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                }}
              >
                {copiedKey === 'ssh' ? <Check size={14} color="#16a34a" /> : <Copy size={14} />}
                {copiedKey === 'ssh' ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Cloud Migration Recommendation */}
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <Cloud size={16} color="#15803d" />
              <strong style={{ fontSize: '0.86rem', color: '#14532d' }}>3. 10,000+ User Cloud Target</strong>
            </div>
            <p style={{ margin: 0, fontSize: '0.8rem', color: '#166534', lineHeight: 1.5 }}>
              {compass.cloudRecommendation ||
                'MongoDB Atlas M10 Dedicated (Mumbai ap-south-1) — 3-node auto-failover + Point-in-Time Continuous Restore + zero-code MONGO_URI swap.'}
            </p>
          </div>
        </div>
      </div>

      {/* 3-2-1 Point-in-Time Snapshot Engine */}
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '22px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
            marginBottom: '16px',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '1.08rem', fontWeight: 800, color: '#0f172a' }}>
              Point-in-Time Encrypted Snapshot Vault (3-2-1 Backup Strategy)
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '0.83rem', color: '#64748b' }}>
              Uses <code>mongodump --oplog --gzip</code> + AES-256-CBC encryption + SHA-256 integrity verification.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.82rem',
                fontWeight: 700,
                color: '#334155',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={encryptSnapshot}
                onChange={(e) => setEncryptSnapshot(e.target.checked)}
              />
              <Lock size={14} color="#16a34a" /> AES-256 Encrypt
            </label>

            <button
              type="button"
              onClick={handleTriggerSnapshot}
              disabled={creatingSnapshot}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 18px',
                borderRadius: '10px',
                border: 'none',
                background: '#7c3aed',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: '0.86rem',
                cursor: creatingSnapshot ? 'not-allowed' : 'pointer',
                boxShadow: '0 6px 16px rgba(124, 58, 237, 0.25)',
              }}
            >
              <ShieldCheck size={16} />
              <span>{creatingSnapshot ? 'Creating Oplog Snapshot...' : 'Trigger Snapshot Now'}</span>
            </button>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '10px 12px', color: '#475569' }}>Snapshot Archive</th>
                <th style={{ padding: '10px 12px', color: '#475569' }}>Engine</th>
                <th style={{ padding: '10px 12px', color: '#475569' }}>Security</th>
                <th style={{ padding: '10px 12px', color: '#475569' }}>Size</th>
                <th style={{ padding: '10px 12px', color: '#475569' }}>SHA-256 Checksum</th>
                <th style={{ padding: '10px 12px', color: '#475569' }}>Created At</th>
                <th style={{ padding: '10px 12px', color: '#475569', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
                    No snapshots created yet. Click <strong>Trigger Snapshot Now</strong> to capture an instant point-in-time archive.
                  </td>
                </tr>
              ) : (
                snapshots.map((snap) => (
                  <tr key={snap.filename} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0f172a' }}>{snap.filename}</td>
                    <td style={{ padding: '10px 12px', color: '#475569' }}>
                      <code>{snap.engine}</code>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: '999px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          background: snap.encrypted ? '#dcfce7' : '#fef3c7',
                          color: snap.encrypted ? '#15803d' : '#92400e',
                        }}
                      >
                        {snap.encrypted ? 'AES-256 Encrypted' : 'Gzip Plain'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{formatBytes(snap.sizeBytes)}</td>
                    <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: '0.76rem', color: '#64748b' }}>
                      {snap.sha256 ? `${snap.sha256.slice(0, 16)}…` : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#475569' }}>
                      {new Date(snap.createdAt).toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <a
                        href={superadminApi.getSnapshotDownloadUrl(snap.filename)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '5px 10px',
                          borderRadius: '7px',
                          background: '#eff6ff',
                          color: '#1d4ed8',
                          textDecoration: 'none',
                          fontWeight: 700,
                          fontSize: '0.78rem',
                        }}
                      >
                        <Download size={13} /> Download
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Live Collection Inventory */}
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '22px' }}>
        <h3 style={{ margin: '0 0 12px', fontSize: '1.02rem', fontWeight: 800, color: '#0f172a' }}>
          Live MongoDB Collection Inventory ({(mongo.collections || []).length})
        </h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
            gap: '10px',
          }}
        >
          {(mongo.collections || []).map((col) => (
            <div
              key={col.name}
              style={{
                padding: '10px 14px',
                borderRadius: '10px',
                border: '1px solid #e2e8f0',
                background: '#f8fafc',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <code style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155' }}>{col.name}</code>
              <span
                style={{
                  background: '#e0e7ff',
                  color: '#3730a3',
                  padding: '2px 8px',
                  borderRadius: '999px',
                  fontSize: '0.74rem',
                  fontWeight: 800,
                }}
              >
                {col.documents}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

