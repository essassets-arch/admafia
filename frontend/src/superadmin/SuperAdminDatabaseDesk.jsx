import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  ExternalLink,
  Search,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  FileJson,
  Zap,
  X,
} from 'lucide-react';
import superadminApi from '../services/superadminApi';
import { getActiveAuthToken } from '../services/crmApi';
import { SmartTable, TabulatorDataGrid } from '../components/SmartTabulator';
import { useAdminTheme } from '../utils/adminTheme';

const isViteDev =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
  window.location.port === '5173';

const DB_API_BASE = (
  import.meta.env?.VITE_API_URL ||
  import.meta.env?.VITE_API_BASE_URL ||
  (isViteDev ? 'http://localhost:5000/api' : '/api')
).replace(/\/$/, '');

function formatBytes(bytes) {
  const n = Number(bytes || 0);
  if (n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const idx = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  return `${(n / Math.pow(1024, idx)).toFixed(idx === 0 ? 0 : 2)} ${units[idx]}`;
}

function summarizeDocTitle(doc) {
  if (!doc || typeof doc !== 'object') return 'Document';
  return (
    doc.companyName ||
    doc.company_name ||
    doc.fullName ||
    doc.full_name ||
    doc.name ||
    doc.title ||
    doc.email ||
    doc.username ||
    doc.phone ||
    doc.country_name ||
    doc.action_type ||
    doc.tx_type ||
    doc.type ||
    doc.status ||
    'Document Record'
  );
}

export default function SuperAdminDatabaseDesk() {
  const { isDark } = useAdminTheme({ syncDocument: false });
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creatingSnapshot, setCreatingSnapshot] = useState(false);
  const [encryptSnapshot, setEncryptSnapshot] = useState(true);
  const [copiedKey, setCopiedKey] = useState('');
  const [banner, setBanner] = useState(null);

  // Live Collection & Document Explorer state
  const [selectedCollection, setSelectedCollection] = useState('');
  const [docSearchInput, setDocSearchInput] = useState('');
  const [docSearchQuery, setDocSearchQuery] = useState('');
  const [docPage, setDocPage] = useState(1);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsError, setDocsError] = useState('');
  const [docsPayload, setDocsPayload] = useState({
    documents: [],
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 1,
  });
  const [expandedDocs, setExpandedDocs] = useState({});
  const [explorerView, setExplorerView] = useState('tabulator'); // 'tabulator' | 'json'
  const explorerRef = useRef(null);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const res = await superadminApi.getDatabaseStatus();
      if (res && res.ok) {
        setStatus(res);
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

  // Debounce instant search input for smooth live filtering
  useEffect(() => {
    const timer = setTimeout(() => {
      setDocSearchQuery(docSearchInput.trim());
      setDocPage(1);
    }, 220);
    return () => clearTimeout(timer);
  }, [docSearchInput]);

  const fetchCollectionDocuments = useCallback(async (colName, page = 1, search = '') => {
    if (!colName) return;
    setDocsLoading(true);
    setDocsError('');
    try {
      const token = getActiveAuthToken();
      const url = `${DB_API_BASE}/superadmin/database/collections/${encodeURIComponent(
        colName
      )}/documents?page=${page}&limit=20&search=${encodeURIComponent(search)}`;

      const res = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload.ok === false) {
        throw new Error(payload.error || payload.message || `HTTP ${res.status} while loading documents`);
      }

      const docs = payload.documents || payload.items || payload.docs || payload.rows || [];
      const total = Number(
        payload.total ?? payload.totalCount ?? payload.pagination?.total ?? docs.length
      );
      const limit = Number(payload.limit ?? payload.pagination?.limit ?? 20) || 20;
      const totalPages = Math.max(
        1,
        Number(payload.totalPages ?? payload.pages ?? payload.pagination?.totalPages ?? Math.ceil(total / limit))
      );

      setDocsPayload({
        documents: docs,
        total,
        page: Number(payload.page ?? page) || 1,
        limit,
        totalPages,
      });

      // Auto-expand first document on fresh load for immediate readability
      if (docs.length > 0) {
        const firstId = String(docs[0]._id || docs[0].id || '0');
        setExpandedDocs((prev) => (Object.keys(prev).length > 0 ? prev : { [firstId]: true }));
      }
    } catch (err) {
      setDocsError(err.message || 'Failed to inspect collection documents.');
    } finally {
      setDocsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedCollection) {
      fetchCollectionDocuments(selectedCollection, docPage, docSearchQuery);
    }
  }, [selectedCollection, docPage, docSearchQuery, fetchCollectionDocuments]);

  const handleInspectCollection = (colName) => {
    if (colName !== selectedCollection) {
      setSelectedCollection(colName);
      setDocSearchInput('');
      setDocSearchQuery('');
      setDocPage(1);
      setExpandedDocs({});
    } else {
      fetchCollectionDocuments(colName, docPage, docSearchQuery);
    }
    setTimeout(() => {
      explorerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 80);
  };

  const toggleDocExpand = (docKey) => {
    setExpandedDocs((prev) => ({ ...prev, [docKey]: !prev[docKey] }));
  };

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

  const mongo = status?.mongo || {};
  const replSet = mongo.replicaSet || {};
  const compass = status?.compassGuides || {};
  const snapshots = status?.snapshots || [];
  const collections = mongo.collections || [];
  const explorerDocs = docsPayload.documents || [];
  const webConsoleHref = status?.webConsoleUrl || compass?.webConsoleUrl || '/db-console/';

  // Dynamically derive Tabulator columns & flattened rows from explorerDocs
  const { explorerColumns, explorerGridData } = useMemo(() => {
    if (!Array.isArray(explorerDocs) || explorerDocs.length === 0) {
      return { explorerColumns: [], explorerGridData: [] };
    }

    const priorityKeys = [
      '_id',
      'id',
      'companyName',
      'company_name',
      'fullName',
      'full_name',
      'name',
      'phone',
      'email',
      'status',
      'role',
      'available_balance',
      'balance',
      'amount',
      'tx_type',
      'createdAt',
      'created_at',
    ];

    const keySet = new Set();
    explorerDocs.forEach((doc) => {
      if (doc && typeof doc === 'object') {
        Object.keys(doc).forEach((k) => keySet.add(k));
      }
    });

    const allKeys = Array.from(keySet);
    allKeys.sort((a, b) => {
      const idxA = priorityKeys.indexOf(a);
      const idxB = priorityKeys.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return 0;
    });

    const cols = allKeys.map((rawKey, idx) => ({
      title: rawKey,
      field: `f_${idx}`,
      minWidth: rawKey === '_id' || rawKey === 'id' ? 185 : 145,
      hozAlign: 'left',
    }));

    const rows = explorerDocs.map((doc) => {
      const flatRow = {};
      allKeys.forEach((rawKey, idx) => {
        const val = doc ? doc[rawKey] : undefined;
        if (val === null || val === undefined) {
          flatRow[`f_${idx}`] = '';
        } else if (typeof val === 'object') {
          try {
            flatRow[`f_${idx}`] = JSON.stringify(val);
          } catch {
            flatRow[`f_${idx}`] = String(val);
          }
        } else {
          flatRow[`f_${idx}`] = String(val);
        }
      });
      return flatRow;
    });

    return { explorerColumns: cols, explorerGridData: rows };
  }, [explorerDocs]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Action Strip with Direct Live MongoDB Web Console Link */}
      <div
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
          border: '1px solid rgba(99, 102, 241, 0.28)',
          borderRadius: '16px',
          padding: '20px 22px',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '14px',
          boxShadow: '0 8px 24px rgba(15, 23, 42, 0.14)',
        }}
      >
        <div style={{ minWidth: 0, flex: '1 1 260px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 10px',
              borderRadius: '999px',
              background: 'rgba(16, 185, 129, 0.18)',
              border: '1px solid rgba(16, 185, 129, 0.35)',
              color: '#34d399',
              fontSize: '0.72rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              marginBottom: '8px',
            }}
          >
            <Database size={12} /> Ad Mafia Authoritative MongoDB Console
          </div>
          <h2 style={{ margin: 0, fontSize: '1.22rem', fontWeight: 800, color: '#ffffff' }}>
            Live Database Explorer, Web Console &amp; Encrypted Snapshot Vault
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.83rem', color: '#cbd5e1', lineHeight: 1.45 }}>
            Browse live MongoDB collections and JSON documents inline below, or launch the full Mongo Express Web Console in a new tab.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <a
            href={webConsoleHref}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '11px 18px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: '#ffffff',
              textDecoration: 'none',
              fontWeight: 800,
              fontSize: '0.88rem',
              boxShadow: '0 6px 18px rgba(16, 185, 129, 0.32)',
              whiteSpace: 'nowrap',
            }}
          >
            <Database size={16} />
            <span>Open Live MongoDB Web Console ↗</span>
            <ExternalLink size={14} />
          </a>

          <button
            type="button"
            onClick={loadStatus}
            disabled={loading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 14px',
              borderRadius: '10px',
              border: '1px solid rgba(255, 255, 255, 0.22)',
              background: 'rgba(255, 255, 255, 0.08)',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '0.82rem',
              cursor: 'pointer',
            }}
          >
            <RefreshCw size={14} className={loading ? 'sa-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {banner && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '12px',
            background:
              banner.type === 'error'
                ? isDark
                  ? 'rgba(239, 68, 68, 0.14)'
                  : '#fef2f2'
                : isDark
                ? 'rgba(16, 185, 129, 0.14)'
                : '#ecfdf5',
            border: `1px solid ${
              banner.type === 'error'
                ? isDark
                  ? 'rgba(239, 68, 68, 0.35)'
                  : '#fecaca'
                : isDark
                ? 'rgba(16, 185, 129, 0.35)'
                : '#a7f3d0'
            }`,
            color:
              banner.type === 'error'
                ? isDark
                  ? '#fca5a5'
                  : '#b91c1c'
                : isDark
                ? '#6ee7b7'
                : '#065f46',
            fontWeight: 600,
            fontSize: '0.88rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '10px',
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
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
          gap: '14px',
        }}
      >
        <div style={{ background: 'var(--adm-bg-card, #ffffff)', border: '1px solid var(--adm-border, #e2e8f0)', borderRadius: '14px', padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--adm-text-muted, #64748b)', textTransform: 'uppercase' }}>
              MongoDB 7.0 Engine
            </span>
            <Database size={18} color="#10b981" />
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--adm-text-primary, #0f172a)' }}>
            {replSet.myStateStr || 'PRIMARY'} ({replSet.set || 'rs0'})
          </div>
          <div style={{ fontSize: '0.78rem', color: isDark ? '#34d399' : '#059669', marginTop: '4px', fontWeight: 600 }}>
            ● {mongo.collectionsCount || collections.length || 0} Collections • {mongo.objectsCount || 0} Total Docs
          </div>
        </div>

        <div style={{ background: 'var(--adm-bg-card, #ffffff)', border: '1px solid var(--adm-border, #e2e8f0)', borderRadius: '14px', padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--adm-text-muted, #64748b)', textTransform: 'uppercase' }}>
              Data + Index Footprint
            </span>
            <HardDrive size={18} color="#3b82f6" />
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--adm-text-primary, #0f172a)' }}>
            {formatBytes((mongo.dataSizeBytes || 0) + (mongo.indexSizeBytes || 0))}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--adm-text-muted, #64748b)', marginTop: '4px' }}>
            Data: {formatBytes(mongo.dataSizeBytes)} • Indexes: {formatBytes(mongo.indexSizeBytes)}
          </div>
        </div>

        <div style={{ background: 'var(--adm-bg-card, #ffffff)', border: '1px solid var(--adm-border, #e2e8f0)', borderRadius: '14px', padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--adm-text-muted, #64748b)', textTransform: 'uppercase' }}>
              Redis Rate-Limit &amp; Cache
            </span>
            <Server size={18} color="#8b5cf6" />
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--adm-text-primary, #0f172a)' }}>
            {status?.redis?.connected ? 'REDIS LIVE' : 'MEMORY FALLBACK'}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--adm-text-muted, #64748b)', marginTop: '4px' }}>
            Outbox Queue Pending: <strong>{status?.outbox?.pendingOrFailedCount ?? 0}</strong>
          </div>
        </div>

        <div style={{ background: 'var(--adm-bg-card, #ffffff)', border: '1px solid var(--adm-border, #e2e8f0)', borderRadius: '14px', padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--adm-text-muted, #64748b)', textTransform: 'uppercase' }}>
              WhatsApp v26 &amp; FCM Push
            </span>
            <Activity size={18} color="#f59e0b" />
          </div>
          <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--adm-text-primary, #0f172a)' }}>
            WA: {(status?.integrations?.whatsappCloudApi?.mode || 'sandbox').toUpperCase()}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--adm-text-muted, #64748b)', marginTop: '4px' }}>
            Live SSE Clients: <strong>{status?.integrations?.firebaseFcm?.activeSseConnections ?? 0}</strong> • FCM:{' '}
            {status?.integrations?.firebaseFcm?.serverConfigured ? 'Active' : 'SSE Mode'}
          </div>
        </div>
      </div>

      {/* Live Collections Table (Clickable Rows -> Inline Document Explorer) */}
      <div style={{ background: 'var(--adm-bg-card, #ffffff)', border: '1px solid var(--adm-border, #e2e8f0)', borderRadius: '16px', overflow: 'hidden' }}>
        <div
          style={{
            padding: '18px 22px',
            borderBottom: '1px solid var(--adm-border, #e2e8f0)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '1.06rem', fontWeight: 800, color: 'var(--adm-text-primary, #0f172a)' }}>
              Live Collections ({collections.length})
            </h3>
            <p style={{ margin: '3px 0 0', fontSize: '0.82rem', color: 'var(--adm-text-muted, #64748b)' }}>
              Click any collection row to inspect live MongoDB documents, search fields, and view formatted JSON records.
            </p>
          </div>
          {selectedCollection && (
            <span
              style={{
                padding: '5px 12px',
                borderRadius: '999px',
                background: isDark ? 'rgba(99, 102, 241, 0.18)' : '#eef2ff',
                border: isDark ? '1px solid rgba(129, 140, 248, 0.35)' : '1px solid #c7d2fe',
                color: isDark ? '#a5b4fc' : '#4338ca',
                fontSize: '0.78rem',
                fontWeight: 700,
              }}
            >
              Inspecting: <code>{selectedCollection}</code>
            </span>
          )}
        </div>

        <SmartTable
          title="Live MongoDB Collections"
          exportFilename="mongodb-live-collections"
          defaultPageSize={15}
        >
          <table className="sa-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: 'var(--adm-bg-subtle, #f8fafc)', textAlign: 'left', borderBottom: '1px solid var(--adm-border, #e2e8f0)' }}>
                <th style={{ padding: '11px 16px', color: 'var(--adm-text-muted, #475569)', fontSize: '0.74rem', textTransform: 'uppercase' }}>
                  Collection Name
                </th>
                <th style={{ padding: '11px 16px', color: 'var(--adm-text-muted, #475569)', fontSize: '0.74rem', textTransform: 'uppercase' }}>
                  Live Documents
                </th>
                <th style={{ padding: '11px 16px', color: 'var(--adm-text-muted, #475569)', fontSize: '0.74rem', textTransform: 'uppercase', textAlign: 'right' }}>
                  Explorer Action
                </th>
              </tr>
            </thead>
            <tbody>
              {collections.length === 0 ? (
                <tr>
                  <td colSpan={3} style={{ padding: '24px', textAlign: 'center', color: 'var(--adm-text-muted, #64748b)' }}>
                    {loading ? 'Loading live MongoDB collections...' : 'No collections reported.'}
                  </td>
                </tr>
              ) : (
                collections.map((col) => {
                  const isSelected = selectedCollection === col.name;
                  return (
                    <tr
                      key={col.name}
                      onClick={() => handleInspectCollection(col.name)}
                      style={{
                        borderBottom: '1px solid var(--adm-border-subtle, #f1f5f9)',
                        background: isSelected
                          ? isDark
                            ? 'rgba(79, 70, 229, 0.18)'
                            : '#eef2ff'
                          : 'var(--adm-bg-card, #ffffff)',
                        cursor: 'pointer',
                        transition: 'background 0.14s ease',
                      }}
                    >
                      <td style={{ padding: '12px 16px' }}>
                        <div
                          onClick={() => handleInspectCollection(col.name)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                        >
                          <Database size={15} color={isSelected ? (isDark ? '#818cf8' : '#4f46e5') : '#64748b'} />
                          <code
                            style={{
                              fontSize: '0.83rem',
                              fontWeight: 700,
                              color: isSelected
                                ? isDark
                                  ? '#c7d2fe'
                                  : '#3730a3'
                                : 'var(--adm-text-primary, #0f172a)',
                              background: isSelected
                                ? isDark
                                  ? 'rgba(99, 102, 241, 0.25)'
                                  : '#e0e7ff'
                                : 'var(--adm-bg-muted, #f1f5f9)',
                              padding: '2px 8px',
                              borderRadius: '6px',
                            }}
                          >
                            {col.name}
                          </code>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            background: isSelected
                              ? '#4f46e5'
                              : isDark
                              ? 'rgba(99, 102, 241, 0.18)'
                              : '#e0e7ff',
                            color: isSelected
                              ? '#ffffff'
                              : isDark
                              ? '#a5b4fc'
                              : '#3730a3',
                            padding: '3px 10px',
                            borderRadius: '999px',
                            fontSize: '0.75rem',
                            fontWeight: 800,
                          }}
                        >
                          {Number(col.documents || 0).toLocaleString('en-IN')} docs
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleInspectCollection(col.name);
                          }}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '6px 12px',
                            borderRadius: '8px',
                            border: isSelected ? '1px solid #4f46e5' : '1px solid var(--adm-border-strong, #cbd5e1)',
                            background: isSelected ? '#4f46e5' : 'var(--adm-bg-subtle, #f8fafc)',
                            color: isSelected ? '#ffffff' : 'var(--adm-text-body, #334155)',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <span>Inspect Documents →</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </SmartTable>
      </div>

      {/* Inline Live Collection & Document Explorer Panel */}
      {selectedCollection && (
        <div
          ref={explorerRef}
          style={{
            background: 'var(--adm-bg-card, #ffffff)',
            border: '2px solid #6366f1',
            borderRadius: '16px',
            overflow: 'hidden',
            boxShadow: isDark ? '0 10px 28px rgba(0, 0, 0, 0.4)' : '0 10px 28px rgba(79, 70, 229, 0.1)',
          }}
        >
          {/* Explorer Header */}
          <div
            style={{
              padding: '16px 20px',
              background: 'var(--adm-bg-subtle, #f8fafc)',
              borderBottom: '1px solid var(--adm-border, #e2e8f0)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <FileJson size={20} color={isDark ? '#818cf8' : '#4f46e5'} />
              <div>
                <h3 style={{ margin: 0, fontSize: '1.04rem', fontWeight: 800, color: 'var(--adm-text-primary, #0f172a)' }}>
                  Live Collection &amp; Document Explorer:{' '}
                  <code style={{ color: isDark ? '#818cf8' : '#4f46e5' }}>{selectedCollection}</code>
                </h3>
                <div style={{ fontSize: '0.76rem', color: 'var(--adm-text-muted, #64748b)', marginTop: '2px' }}>
                  {docsPayload.total.toLocaleString('en-IN')} matching documents • Page {docsPayload.page} of{' '}
                  {docsPayload.totalPages} (20 per page)
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {/* View Toggle: Tabulator Spreadsheet vs Expandable JSON Cards */}
              <div
                role="group"
                aria-label="Document Explorer View Mode"
                style={{
                  display: 'inline-flex',
                  background: 'var(--adm-bg-muted, #e2e8f0)',
                  padding: '3px',
                  borderRadius: '9px',
                  gap: '2px',
                }}
              >
                <button
                  type="button"
                  onClick={() => setExplorerView('tabulator')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '5px 11px',
                    borderRadius: '7px',
                    border: 'none',
                    background: explorerView === 'tabulator' ? '#4f46e5' : 'transparent',
                    color: explorerView === 'tabulator' ? '#ffffff' : 'var(--adm-text-body, #334155)',
                    fontSize: '0.76rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  <Zap size={12} />
                  <span>Tabulator Table</span>
                </button>
                <button
                  type="button"
                  onClick={() => setExplorerView('json')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '5px 11px',
                    borderRadius: '7px',
                    border: 'none',
                    background: explorerView === 'json' ? '#4f46e5' : 'transparent',
                    color: explorerView === 'json' ? '#ffffff' : 'var(--adm-text-body, #334155)',
                    fontSize: '0.76rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  <FileJson size={12} />
                  <span>&#123; &#125; JSON Cards</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => fetchCollectionDocuments(selectedCollection, docPage, docSearchQuery)}
                disabled={docsLoading}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--adm-border-strong, #cbd5e1)',
                  background: 'var(--adm-bg-card, #ffffff)',
                  color: 'var(--adm-text-body, #334155)',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <RefreshCw size={13} className={docsLoading ? 'sa-spin' : ''} />
                <span>Reload</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedCollection('')}
                title="Close Explorer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '34px',
                  height: '34px',
                  borderRadius: '8px',
                  border: '1px solid var(--adm-border-strong, #cbd5e1)',
                  background: 'var(--adm-bg-card, #ffffff)',
                  color: 'var(--adm-text-muted, #475569)',
                  cursor: 'pointer',
                }}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Search & Pagination Toolbar */}
          <div
            style={{
              padding: '14px 20px',
              borderBottom: '1px solid var(--adm-border, #e2e8f0)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
              background: 'var(--adm-bg-card, #ffffff)',
            }}
          >
            <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: '480px' }}>
              <Search
                size={15}
                color="#94a3b8"
                style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
              />
              <input
                type="text"
                value={docSearchInput}
                onChange={(e) => setDocSearchInput(e.target.value)}
                placeholder={`Instant search in ${selectedCollection} (_id, name, phone, email, status...)`}
                style={{
                  width: '100%',
                  padding: '9px 32px 9px 36px',
                  borderRadius: '9px',
                  border: '1px solid var(--adm-border-strong, #cbd5e1)',
                  fontSize: '0.85rem',
                  background: 'var(--adm-bg-input, #f8fafc)',
                  color: 'var(--adm-text-primary, #0f172a)',
                  outline: 'none',
                }}
              />
              {docSearchInput && (
                <button
                  type="button"
                  onClick={() => setDocSearchInput('')}
                  aria-label="Clear search"
                  style={{
                    position: 'absolute',
                    right: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--adm-text-muted, #64748b)',
                    cursor: 'pointer',
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                disabled={docsLoading || docPage <= 1}
                onClick={() => setDocPage((p) => Math.max(1, p - 1))}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '7px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--adm-border-strong, #cbd5e1)',
                  background: docPage <= 1 ? 'var(--adm-bg-subtle, #f8fafc)' : 'var(--adm-bg-card, #ffffff)',
                  color: docPage <= 1 ? 'var(--adm-text-muted, #94a3b8)' : 'var(--adm-text-primary, #0f172a)',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  cursor: docPage <= 1 ? 'not-allowed' : 'pointer',
                }}
              >
                <ChevronLeft size={14} /> Prev
              </button>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--adm-text-body, #334155)' }}>
                Page {docsPayload.page} / {docsPayload.totalPages}
              </span>
              <button
                type="button"
                disabled={docsLoading || docPage >= docsPayload.totalPages}
                onClick={() => setDocPage((p) => Math.min(docsPayload.totalPages, p + 1))}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '7px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--adm-border-strong, #cbd5e1)',
                  background: docPage >= docsPayload.totalPages ? 'var(--adm-bg-subtle, #f8fafc)' : 'var(--adm-bg-card, #ffffff)',
                  color: docPage >= docsPayload.totalPages ? 'var(--adm-text-muted, #94a3b8)' : 'var(--adm-text-primary, #0f172a)',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  cursor: docPage >= docsPayload.totalPages ? 'not-allowed' : 'pointer',
                }}
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>

          {/* Document Cards Body */}
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {docsError ? (
              <div
                style={{
                  padding: '14px 16px',
                  borderRadius: '10px',
                  background: isDark ? 'rgba(239, 68, 68, 0.14)' : '#fef2f2',
                  border: isDark ? '1px solid rgba(239, 68, 68, 0.35)' : '1px solid #fecaca',
                  color: isDark ? '#fca5a5' : '#b91c1c',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                }}
              >
                ⚠️ {docsError}
              </div>
            ) : docsLoading ? (
              <div style={{ padding: '32px', textAlign: 'center', color: 'var(--adm-text-muted, #64748b)', fontSize: '0.88rem' }}>
                <RefreshCw size={18} className="sa-spin" style={{ marginBottom: '6px' }} />
                <div>Fetching live documents from <code>{selectedCollection}</code>...</div>
              </div>
            ) : explorerDocs.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: 'var(--adm-text-muted, #64748b)', fontSize: '0.88rem' }}>
                No documents found in <code>{selectedCollection}</code>
                {docSearchQuery ? ` matching "${docSearchQuery}"` : ''}.
              </div>
            ) : explorerView === 'tabulator' ? (
              <TabulatorDataGrid
                columns={explorerColumns}
                data={explorerGridData}
                pageSize={20}
                exportFilename={`mongo-${selectedCollection}`}
              />
            ) : (
              explorerDocs.map((doc, idx) => {
                const rawId = doc._id ?? doc.id ?? idx;
                const docId = typeof rawId === 'object' ? JSON.stringify(rawId) : String(rawId);
                const isExpanded = Boolean(expandedDocs[docId]);
                const summaryTitle = summarizeDocTitle(doc);
                const ts = doc.updatedAt || doc.updated_at || doc.createdAt || doc.created_at;
                const copyKeyId = `doc-${docId}`;
                const formattedJson = JSON.stringify(doc, null, 2);
                const fieldCount = Object.keys(doc || {}).length;

                return (
                  <div
                    key={docId}
                    style={{
                      border: isExpanded ? '1.5px solid #818cf8' : '1px solid var(--adm-border, #e2e8f0)',
                      borderRadius: '12px',
                      background: 'var(--adm-bg-card, #ffffff)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      onClick={() => toggleDocExpand(docId)}
                      style={{
                        padding: '12px 14px',
                        background: isExpanded
                          ? isDark
                            ? 'rgba(99, 102, 241, 0.16)'
                            : '#eef2ff'
                          : 'var(--adm-bg-subtle, #f8fafc)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '10px',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flexWrap: 'wrap' }}>
                        {isExpanded ? (
                          <ChevronDown size={16} color={isDark ? '#818cf8' : '#4f46e5'} />
                        ) : (
                          <ChevronRight size={16} color="#64748b" />
                        )}
                        <strong style={{ fontSize: '0.88rem', color: 'var(--adm-text-primary, #0f172a)' }}>{summaryTitle}</strong>
                        <code
                          style={{
                            fontSize: '0.74rem',
                            background: 'var(--adm-bg-muted, #e2e8f0)',
                            color: 'var(--adm-text-body, #334155)',
                            padding: '2px 7px',
                            borderRadius: '5px',
                            wordBreak: 'break-all',
                          }}
                        >
                          _id: {docId}
                        </code>
                        <span style={{ fontSize: '0.73rem', color: 'var(--adm-text-muted, #64748b)', fontWeight: 600 }}>
                          {fieldCount} fields
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        {ts && (
                          <span style={{ fontSize: '0.73rem', color: 'var(--adm-text-muted, #64748b)' }}>
                            {new Date(ts).toLocaleString('en-IN')}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopy(copyKeyId, formattedJson);
                          }}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 9px',
                            borderRadius: '6px',
                            border: '1px solid var(--adm-border-strong, #cbd5e1)',
                            background: 'var(--adm-bg-card, #ffffff)',
                            color: 'var(--adm-text-body, #334155)',
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          {copiedKey === copyKeyId ? <Check size={12} color="#16a34a" /> : <Copy size={12} />}
                          <span>{copiedKey === copyKeyId ? 'Copied' : 'Copy JSON'}</span>
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <pre
                        style={{
                          margin: 0,
                          padding: '14px 16px',
                          background: '#090e1a',
                          color: '#e2e8f0',
                          borderTop: '1px solid rgba(148, 163, 184, 0.16)',
                          fontSize: '0.78rem',
                          lineHeight: 1.5,
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                          overflowX: 'auto',
                          maxHeight: '420px',
                          overflowY: 'auto',
                        }}
                      >
                        {formattedJson}
                      </pre>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* MongoDB Compass & Cloud Atlas Connection Center */}
      <div style={{ background: 'var(--adm-bg-card, #ffffff)', border: '1px solid var(--adm-border, #e2e8f0)', borderRadius: '16px', padding: '22px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.08rem', fontWeight: 800, color: 'var(--adm-text-primary, #0f172a)' }}>
              MongoDB Compass &amp; Cloud Atlas Connection Center
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '0.83rem', color: 'var(--adm-text-muted, #64748b)' }}>
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
              border: '1px solid var(--adm-border-strong, #cbd5e1)',
              background: 'var(--adm-bg-subtle, #f8fafc)',
              fontWeight: 700,
              fontSize: '0.82rem',
              cursor: 'pointer',
              color: 'var(--adm-text-primary, #0f172a)',
            }}
          >
            <RefreshCw size={14} /> Refresh Telemetry
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '14px' }}>
          {/* Local Docker Compass */}
          <div style={{ background: 'var(--adm-bg-subtle, #f8fafc)', border: '1px solid var(--adm-border, #e2e8f0)', borderRadius: '12px', padding: '14px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <Database size={16} color={isDark ? '#34d399' : '#16a34a'} />
              <strong style={{ fontSize: '0.86rem', color: 'var(--adm-text-primary, #0f172a)' }}>1. Local Docker Stack (MongoDB Compass)</strong>
            </div>
            <p style={{ margin: '0 0 10px', fontSize: '0.78rem', color: 'var(--adm-text-body, #475569)' }}>
              Paste directly into MongoDB Compass on your workstation to browse local Docker collections:
            </p>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              <code
                style={{
                  flex: '1 1 180px',
                  minWidth: 0,
                  background: '#090e1a',
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
                  border: '1px solid var(--adm-border-strong, #cbd5e1)',
                  background: 'var(--adm-bg-card, #ffffff)',
                  color: 'var(--adm-text-primary, #0f172a)',
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
          <div style={{ background: 'var(--adm-bg-subtle, #f8fafc)', border: '1px solid var(--adm-border, #e2e8f0)', borderRadius: '12px', padding: '14px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <Terminal size={16} color={isDark ? '#60a5fa' : '#2563eb'} />
              <strong style={{ fontSize: '0.86rem', color: 'var(--adm-text-primary, #0f172a)' }}>2. Live VPS via Encrypted SSH Tunnel</strong>
            </div>
            <p style={{ margin: '0 0 10px', fontSize: '0.78rem', color: 'var(--adm-text-body, #475569)' }}>
              Run tunnel in terminal, then connect Compass to <code>127.0.0.1:27019</code>:
            </p>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              <code
                style={{
                  flex: '1 1 180px',
                  minWidth: 0,
                  background: '#090e1a',
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
                  border: '1px solid var(--adm-border-strong, #cbd5e1)',
                  background: 'var(--adm-bg-card, #ffffff)',
                  color: 'var(--adm-text-primary, #0f172a)',
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
          <div
            style={{
              background: isDark ? 'rgba(16, 185, 129, 0.1)' : '#f0fdf4',
              border: isDark ? '1px solid rgba(16, 185, 129, 0.28)' : '1px solid #bbf7d0',
              borderRadius: '12px',
              padding: '14px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <Cloud size={16} color={isDark ? '#34d399' : '#15803d'} />
              <strong style={{ fontSize: '0.86rem', color: isDark ? '#6ee7b7' : '#14532d' }}>3. 10,000+ User Cloud Target</strong>
            </div>
            <p style={{ margin: 0, fontSize: '0.8rem', color: isDark ? '#a7f3d0' : '#166534', lineHeight: 1.5 }}>
              {compass.cloudRecommendation ||
                'MongoDB Atlas M10 Dedicated (Mumbai ap-south-1) — 3-node auto-failover + Point-in-Time Continuous Restore + zero-code MONGO_URI swap.'}
            </p>
          </div>
        </div>
      </div>

      {/* 3-2-1 Point-in-Time Snapshot Engine */}
      <div style={{ background: 'var(--adm-bg-card, #ffffff)', border: '1px solid var(--adm-border, #e2e8f0)', borderRadius: '16px', padding: '22px' }}>
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
            <h3 style={{ margin: 0, fontSize: '1.08rem', fontWeight: 800, color: 'var(--adm-text-primary, #0f172a)' }}>
              Point-in-Time Encrypted Snapshot Vault (3-2-1 Backup Strategy)
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '0.83rem', color: 'var(--adm-text-muted, #64748b)' }}>
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
                color: 'var(--adm-text-body, #334155)',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={encryptSnapshot}
                onChange={(e) => setEncryptSnapshot(e.target.checked)}
              />
              <Lock size={14} color={isDark ? '#34d399' : '#16a34a'} /> AES-256 Encrypt
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

        <SmartTable
          title="Encrypted Database Snapshots"
          exportFilename="mongodb-snapshots"
          defaultPageSize={10}
        >
          <table className="sa-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
            <thead>
              <tr style={{ background: 'var(--adm-bg-subtle, #f8fafc)', textAlign: 'left', borderBottom: '1px solid var(--adm-border, #e2e8f0)' }}>
                <th style={{ padding: '10px 12px', color: 'var(--adm-text-muted, #475569)' }}>Snapshot Archive</th>
                <th style={{ padding: '10px 12px', color: 'var(--adm-text-muted, #475569)' }}>Engine</th>
                <th style={{ padding: '10px 12px', color: 'var(--adm-text-muted, #475569)' }}>Security</th>
                <th style={{ padding: '10px 12px', color: 'var(--adm-text-muted, #475569)' }}>Size</th>
                <th style={{ padding: '10px 12px', color: 'var(--adm-text-muted, #475569)' }}>SHA-256 Checksum</th>
                <th style={{ padding: '10px 12px', color: 'var(--adm-text-muted, #475569)' }}>Created At</th>
                <th style={{ padding: '10px 12px', color: 'var(--adm-text-muted, #475569)', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: 'var(--adm-text-muted, #64748b)' }}>
                    No snapshots created yet. Click <strong>Trigger Snapshot Now</strong> to capture an instant point-in-time archive.
                  </td>
                </tr>
              ) : (
                snapshots.map((snap) => (
                  <tr key={snap.filename} style={{ borderBottom: '1px solid var(--adm-border-subtle, #f1f5f9)' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--adm-text-primary, #0f172a)' }}>{snap.filename}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--adm-text-body, #475569)' }}>
                      <code>{snap.engine}</code>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: '999px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          background: snap.encrypted
                            ? isDark
                              ? 'rgba(16, 185, 129, 0.16)'
                              : '#dcfce7'
                            : isDark
                            ? 'rgba(245, 158, 11, 0.18)'
                            : '#fef3c7',
                          color: snap.encrypted
                            ? isDark
                              ? '#34d399'
                              : '#15803d'
                            : isDark
                            ? '#fbbf24'
                            : '#92400e',
                        }}
                      >
                        {snap.encrypted ? 'AES-256 Encrypted' : 'Gzip Plain'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{formatBytes(snap.sizeBytes)}</td>
                    <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: '0.76rem', color: 'var(--adm-text-muted, #64748b)' }}>
                      {snap.sha256 ? `${snap.sha256.slice(0, 16)}…` : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--adm-text-body, #475569)' }}>
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
                          background: isDark ? 'rgba(59, 130, 246, 0.16)' : '#eff6ff',
                          border: isDark ? '1px solid rgba(96, 165, 250, 0.3)' : '1px solid #bfdbfe',
                          color: isDark ? '#93c5fd' : '#1d4ed8',
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
        </SmartTable>
      </div>
    </div>
  );
}
