import React, { useState, useEffect, useMemo } from 'react';
import {
  Scale,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  ArrowRight,
  RefreshCw,
  Search,
  Filter,
  Download,
  Copy,
  Check,
  ExternalLink,
  Phone,
  MessageSquare,
  Plus,
  Clock,
  ShieldCheck,
  Building2,
  User,
  History,
  FileSpreadsheet,
  X,
  TrendingUp,
  Receipt,
  CheckCircle2,
} from 'lucide-react';
import Swal from 'sweetalert2';
import crmApi from '../services/crmApi';
import SalesAddMoneyModal from './SalesAddMoneyModal';

const formatINR = (val) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(val || 0);

const formatRelativeTime = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffSec = Math.floor((now - d) / 1000);
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 172800) return 'Yesterday';
  return `${Math.floor(diffSec / 86400)}d ago`;
};

export default function BalanceLogsDesk({
  customers = [],
  setCustomers,
  onBalanceLogsCountChange,
}) {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({
    totalLogs: 0,
    totalCirculatingBalance: 0,
    totalCredits: 0,
    totalDebits: 0,
    totalCreditCount: 0,
    totalDebitCount: 0,
    activeWalletsCount: 0,
  });

  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'credit' | 'debit' | 'high_value'
  const [selectedCustomerId, setSelectedCustomerId] = useState('all');
  const [selectedCustomerForStatement, setSelectedCustomerForStatement] = useState(null);
  const [addMoneyCust, setAddMoneyCust] = useState(null);
  const [copiedRef, setCopiedRef] = useState(null);

  // Fetch authoritative balance logs directly from PostgreSQL backend
  const fetchLogs = async (showToast = false) => {
    setLoading(true);
    try {
      const res = await crmApi.getBalanceLogs({
        customerId: selectedCustomerId !== 'all' ? selectedCustomerId : undefined,
      });

      if (res && res.ok && Array.isArray(res.logs)) {
        setLogs(res.logs);
        if (res.stats) {
          setStats(res.stats);
        }
        if (onBalanceLogsCountChange) {
          onBalanceLogsCountChange(res.logs.length);
        }
        try {
          localStorage.setItem('growthline_balance_logs', JSON.stringify(res.logs));
        } catch (_) {}

        if (showToast) {
          Swal.fire({
            icon: 'success',
            title: 'Balance Logs Synchronized',
            text: `Successfully synced ${res.logs.length} live balance audit records from database.`,
            timer: 2000,
            showConfirmButton: false,
          });
        }
      }
    } catch (err) {
      console.warn('[BalanceLogsDesk] Error loading logs:', err);
      // Fallback from localStorage
      try {
        const raw = localStorage.getItem('growthline_balance_logs');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setLogs(parsed);
        }
      } catch (_) {}
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(false);

    const handleSync = () => fetchLogs(false);
    window.addEventListener('growthline_wallet_transactions_updated', handleSync);
    window.addEventListener('growthline_payment_recorded', handleSync);
    window.addEventListener('growthline_postgres_synced', handleSync);

    return () => {
      window.removeEventListener('growthline_wallet_transactions_updated', handleSync);
      window.removeEventListener('growthline_payment_recorded', handleSync);
      window.removeEventListener('growthline_postgres_synced', handleSync);
    };
  }, [selectedCustomerId]);

  // Copy Reference UTR to clipboard
  const handleCopyRef = (refText, e) => {
    if (e) e.stopPropagation();
    if (!refText) return;
    navigator.clipboard.writeText(refText).then(() => {
      setCopiedRef(refText);
      setTimeout(() => setCopiedRef(null), 2000);
    });
  };

  // Filtered dataset
  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase();

    return logs.filter((log) => {
      // 1. Tab filter
      if (activeTab === 'credit' && log.txType !== 'credit') return false;
      if (activeTab === 'debit' && log.txType !== 'debit') return false;
      if (activeTab === 'high_value' && Number(log.amount || 0) < 1000) return false;

      // 2. Specific customer selector
      if (selectedCustomerId !== 'all') {
        const custMatches =
          log.customerId === selectedCustomerId ||
          (log.phone && customers.find((c) => c.id === selectedCustomerId)?.phone?.includes(log.phone));
        if (!custMatches) return false;
      }

      // 3. Search query
      if (q) {
        const matchComp = (log.companyName || '').toLowerCase().includes(q);
        const matchCust = (log.customerName || '').toLowerCase().includes(q);
        const matchContact = (log.contactPerson || '').toLowerCase().includes(q);
        const matchPhone = (log.phone || '').includes(q);
        const matchUser = (log.username || '').toLowerCase().includes(q);
        const matchRef = (log.ref || '').toLowerCase().includes(q);
        const matchDesc = (log.description || '').toLowerCase().includes(q);
        const matchMethod = (log.paymentMethod || '').toLowerCase().includes(q);
        const matchId = (log.id || '').toLowerCase().includes(q);

        if (
          !matchComp &&
          !matchCust &&
          !matchContact &&
          !matchPhone &&
          !matchUser &&
          !matchRef &&
          !matchDesc &&
          !matchMethod &&
          !matchId
        ) {
          return false;
        }
      }

      return true;
    });
  }, [logs, activeTab, selectedCustomerId, search, customers]);

  // Computed metrics
  const totalCirculating = useMemo(() => {
    if (stats.totalCirculatingBalance) return stats.totalCirculatingBalance;
    return customers.reduce((sum, c) => sum + Math.max(0, Number(c.balance || c.walletBalance || 0)), 0);
  }, [stats.totalCirculatingBalance, customers]);

  const totalCredits = useMemo(() => {
    return logs.filter((l) => l.txType === 'credit').reduce((sum, l) => sum + Number(l.amount || 0), 0);
  }, [logs]);

  const totalDebits = useMemo(() => {
    return logs.filter((l) => l.txType === 'debit').reduce((sum, l) => sum + Number(l.amount || 0), 0);
  }, [logs]);

  const creditsCount = useMemo(() => logs.filter((l) => l.txType === 'credit').length, [logs]);
  const debitsCount = useMemo(() => logs.filter((l) => l.txType === 'debit').length, [logs]);
  const highValueCount = useMemo(() => logs.filter((l) => Number(l.amount || 0) >= 1000).length, [logs]);

  // Export full balance logs to clean CSV
  const handleExportCSV = () => {
    if (filteredLogs.length === 0) {
      Swal.fire({
        icon: 'info',
        title: 'No Data to Export',
        text: 'There are no balance logs matching your active filters.',
      });
      return;
    }

    const headers = [
      'Date & Time',
      'Transaction ID',
      'Reference / UTR',
      'Company Name',
      'Contact Person',
      'Phone Number',
      'Username',
      'Customer Previous Balance (INR)',
      'Change Type',
      'Transaction Amount (INR)',
      'Customer New Balance (INR)',
      'Current Wallet Balance (INR)',
      'Description / Purpose',
      'Payment Method',
      'Status',
    ];

    const rows = filteredLogs.map((l) => [
      `"${l.date || ''}"`,
      `"${l.id || ''}"`,
      `"${l.ref || ''}"`,
      `"${(l.companyName || '').replace(/"/g, '""')}"`,
      `"${(l.contactPerson || '').replace(/"/g, '""')}"`,
      `"${l.phone || ''}"`,
      `"${l.username || ''}"`,
      l.balanceBefore != null ? l.balanceBefore : 0,
      `"${l.txType === 'credit' ? 'Credit (+)' : 'Debit (-)'}"`,
      l.amount || 0,
      l.balanceAfter != null ? l.balanceAfter : 0,
      l.currentWalletBalance != null ? l.currentWalletBalance : 0,
      `"${(l.description || '').replace(/"/g, '""')}"`,
      `"${(l.paymentMethod || '').replace(/"/g, '""')}"`,
      `"${l.status || 'Settled ✓'}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `admafia_customer_balance_logs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    Swal.fire({
      icon: 'success',
      title: 'CSV Exported',
      text: `Exported ${filteredLogs.length} balance audit entries successfully.`,
      timer: 2000,
      showConfirmButton: false,
    });
  };

  // Open customer statement modal
  const openCustomerStatement = (log) => {
    const cust =
      customers.find((c) => c.id === log.customerId || (c.phone && log.phone && c.phone.includes(log.phone))) || {
        id: log.customerId,
        companyName: log.companyName,
        name: log.customerName,
        contactPerson: log.contactPerson,
        phone: log.phone,
        email: log.email,
        username: log.username,
        balance: log.currentWalletBalance || log.balanceAfter,
      };

    const customerLogs = logs.filter(
      (l) => l.customerId === log.customerId || (l.phone && log.phone && l.phone === log.phone)
    );

    setSelectedCustomerForStatement({
      customer: cust,
      logs: customerLogs,
    });
  };

  return (
    <div className="desk-page-container">
      {/* 1. Header */}
      <div className="desk-header">
        <div>
          <div className="desk-breadcrumb">SUB ADMIN &amp; SUPPORT OPERATIONS / BALANCE AUDIT LEDGER</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 className="desk-title">Customer Balance Audit Logs</h1>
            <span
              style={{
                background: '#ecfdf5',
                color: '#047857',
                border: '1px solid #a7f3d0',
                fontWeight: 800,
                fontSize: '0.78rem',
                padding: '3px 10px',
                borderRadius: 9999,
              }}
            >
              {logs.length} Live Balance Changes
            </span>
            <span
              style={{
                background: '#eff6ff',
                color: '#1d4ed8',
                border: '1px solid #bfdbfe',
                fontWeight: 800,
                fontSize: '0.78rem',
                padding: '3px 10px',
                borderRadius: 9999,
              }}
            >
              Circulating: {formatINR(totalCirculating)}
            </span>
          </div>
          <p className="desk-subtitle">
            Immutable double-entry balance ledger showing each customer&apos;s <b>Previous Balance</b>, <b>Transaction Amount</b>, and <b>Updated Balance</b> with verified UTR provenance.
          </p>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="sales-btn-secondary"
            onClick={handleExportCSV}
            style={{
              padding: '6px 12px',
              fontSize: '0.8rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
            title="Download CSV Spreadsheet"
          >
            <Download size={14} /> Export CSV
          </button>

          <button
            type="button"
            className="sales-btn-secondary"
            onClick={() => fetchLogs(true)}
            disabled={loading}
            style={{
              padding: '6px 12px',
              fontSize: '0.8rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              cursor: loading ? 'wait' : 'pointer',
            }}
            title="Synchronize balance logs from database"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Syncing...' : '↻ Sync Live'}
          </button>
        </div>
      </div>

      {/* 2. KPI Metric Quad Grid */}
      <div className="desk-kpi-grid">
        {/* Card 1: Circulating Balance */}
        <div className="desk-kpi-card" style={{ borderLeft: '4px solid #10b981' }}>
          <div className="desk-kpi-label">TOTAL CIRCULATING WALLET BALANCE</div>
          <div className="desk-kpi-val text-emerald">{formatINR(totalCirculating)}</div>
          <div className="desk-kpi-sub">
            Active customer ad funds across {customers.length} registered accounts
          </div>
        </div>

        {/* Card 2: Total Credits */}
        <div className="desk-kpi-card" style={{ borderLeft: '4px solid #4f46e5' }}>
          <div className="desk-kpi-label">TOTAL CREDITS &amp; TOP-UPS</div>
          <div className="desk-kpi-val text-indigo" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <ArrowUpRight size={22} color="#4f46e5" strokeWidth={2.5} />
            {formatINR(totalCredits)}
          </div>
          <div className="desk-kpi-sub">
            {creditsCount} Verified Razorpay &amp; Sales Top-Up events
          </div>
        </div>

        {/* Card 3: Total Debits */}
        <div className="desk-kpi-card" style={{ borderLeft: '4px solid #e11d48' }}>
          <div className="desk-kpi-label">TOTAL DEBITS &amp; AD BURNS</div>
          <div className="desk-kpi-val text-rose" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <ArrowDownRight size={22} color="#e11d48" strokeWidth={2.5} />
            {formatINR(totalDebits)}
          </div>
          <div className="desk-kpi-sub">
            {debitsCount} Daily ad pacing burns deducted
          </div>
        </div>

        {/* Card 4: Audited Entries */}
        <div className="desk-kpi-card" style={{ borderLeft: '4px solid #0284c7' }}>
          <div className="desk-kpi-label">TOTAL BALANCE AUDIT LOGS</div>
          <div className="desk-kpi-val" style={{ color: '#0284c7' }}>
            {logs.length} Recorded
          </div>
          <div className="desk-kpi-sub">
            100% verified double-entry database audit ledger
          </div>
        </div>
      </div>

      {/* 3. Filter Bar & Search */}
      <div className="desk-filter-bar" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        {/* Tabs */}
        <div className="desk-tabs">
          <button
            type="button"
            className={`desk-tab ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            All Balance Logs ({logs.length})
          </button>
          <button
            type="button"
            className={`desk-tab ${activeTab === 'credit' ? 'active' : ''}`}
            onClick={() => setActiveTab('credit')}
          >
            Top-Ups &amp; Credits (+) ({creditsCount})
          </button>
          <button
            type="button"
            className={`desk-tab ${activeTab === 'debit' ? 'active' : ''}`}
            onClick={() => setActiveTab('debit')}
          >
            Daily Ad Debits (-) ({debitsCount})
          </button>
          <button
            type="button"
            className={`desk-tab ${activeTab === 'high_value' ? 'active' : ''}`}
            onClick={() => setActiveTab('high_value')}
          >
            High Volume (≥₹1,000) ({highValueCount})
          </button>
        </div>

        {/* Search & Customer Dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: '1 1 auto', justifyContent: 'flex-end' }}>
          {/* Customer Dropdown Filter */}
          <select
            className="desk-search-input"
            style={{ width: 'auto', minWidth: 200, padding: '6px 10px', fontSize: '0.8rem', cursor: 'pointer' }}
            value={selectedCustomerId}
            onChange={(e) => setSelectedCustomerId(e.target.value)}
          >
            <option value="all">All Customers ({customers.length})</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.companyName || c.name} ({c.phone || c.username})
              </option>
            ))}
          </select>

          {/* Search Input */}
          <div className="desk-search-wrap" style={{ minWidth: 260 }}>
            <Search size={15} className="desk-search-icon" />
            <input
              type="text"
              className="desk-search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customer, phone, UTR or description..."
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#94a3b8',
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 4. Master Balance Logs Table */}
      <div className="desk-table-card" style={{ overflowX: 'auto' }}>
        <table className="desk-table" style={{ width: '100%', minWidth: 1080 }}>
          <thead>
            <tr>
              <th style={{ width: 140 }}>Date &amp; Time</th>
              <th style={{ width: 220 }}>Customer Account</th>
              <th style={{ width: 130 }}>Previous Balance</th>
              <th style={{ width: 140 }}>Amount Change</th>
              <th style={{ width: 140 }}>New Balance</th>
              <th style={{ width: 180 }}>Reference / UTR</th>
              <th>Description &amp; Method</th>
              <th style={{ width: 130, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '48px 20px', color: '#64748b' }}>
                  <Scale size={36} color="#94a3b8" style={{ margin: '0 auto 12px auto', display: 'block' }} />
                  <div style={{ fontWeight: 700, fontSize: '0.98rem', color: '#0f172a' }}>
                    No Balance Logs Found
                  </div>
                  <div style={{ fontSize: '0.82rem', marginTop: 4 }}>
                    {search || activeTab !== 'all' || selectedCustomerId !== 'all'
                      ? 'No balance audit entries match your current search and filters.'
                      : 'No wallet balance transactions recorded yet.'}
                  </div>
                  {(search || activeTab !== 'all' || selectedCustomerId !== 'all') && (
                    <button
                      type="button"
                      className="sales-btn-secondary"
                      onClick={() => {
                        setSearch('');
                        setActiveTab('all');
                        setSelectedCustomerId('all');
                      }}
                      style={{ marginTop: 12, padding: '4px 12px', fontSize: '0.78rem' }}
                    >
                      Clear Filters
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              filteredLogs.map((log) => {
                const isDebit = log.txType === 'debit';
                const balBefore = log.balanceBefore != null ? Number(log.balanceBefore) : 0;
                const balAfter = log.balanceAfter != null ? Number(log.balanceAfter) : 0;
                const amt = Number(log.amount || 0);
                const isCopied = copiedRef === log.ref;

                return (
                  <tr key={log.id}>
                    {/* 1. Date & Time */}
                    <td>
                      <div>
                        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a' }}>
                          {log.date}
                        </div>
                        <div
                          style={{
                            fontSize: '0.71rem',
                            color: '#64748b',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                            marginTop: 2,
                          }}
                        >
                          <Clock size={11} /> {formatRelativeTime(log.createdAt)}
                        </div>
                      </div>
                    </td>

                    {/* 2. Customer & Company */}
                    <td>
                      <div>
                        <div
                          style={{
                            fontWeight: 800,
                            color: '#0f172a',
                            fontSize: '0.88rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
                          <Building2 size={13} color="#64748b" />
                          <span>{log.companyName || log.customerName}</span>
                        </div>
                        <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: 2 }}>
                          👤 {log.contactPerson} • 📞 +91 {log.phone}
                        </div>
                        {log.username && (
                          <div
                            style={{
                              fontSize: '0.69rem',
                              fontFamily: 'monospace',
                              color: '#4f46e5',
                              marginTop: 1,
                            }}
                          >
                            @{log.username}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* 3. Previous Balance (Old Balance Before Change) */}
                    <td>
                      <div
                        style={{
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          padding: '6px 10px',
                          borderRadius: 8,
                          display: 'inline-block',
                        }}
                      >
                        <div style={{ fontSize: '0.67rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
                          Old Balance
                        </div>
                        <div style={{ fontSize: '0.92rem', fontWeight: 800, fontFamily: 'monospace', color: '#334155' }}>
                          {formatINR(balBefore)}
                        </div>
                      </div>
                    </td>

                    {/* 4. Amount Change */}
                    <td>
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '6px 10px',
                          borderRadius: 8,
                          background: isDebit ? '#fff1f2' : '#ecfdf5',
                          border: `1px solid ${isDebit ? '#fecdd3' : '#a7f3d0'}`,
                        }}
                      >
                        {isDebit ? (
                          <ArrowDownRight size={16} color="#e11d48" strokeWidth={2.5} />
                        ) : (
                          <ArrowUpRight size={16} color="#059669" strokeWidth={2.5} />
                        )}
                        <div>
                          <div
                            style={{
                              fontSize: '0.92rem',
                              fontWeight: 900,
                              fontFamily: 'monospace',
                              color: isDebit ? '#e11d48' : '#059669',
                            }}
                          >
                            {isDebit ? '-' : '+'} {formatINR(amt)}
                          </div>
                          <div style={{ fontSize: '0.67rem', fontWeight: 700, color: isDebit ? '#9f1239' : '#065f46' }}>
                            {isDebit ? 'Daily Burn Debit' : 'Wallet Top-Up'}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* 5. New Balance (Balance After Change) */}
                    <td>
                      <div
                        style={{
                          background: balAfter > 0 ? '#f0fdf4' : '#fffbeb',
                          border: `1px solid ${balAfter > 0 ? '#bbf7d0' : '#fde68a'}`,
                          padding: '6px 10px',
                          borderRadius: 8,
                          display: 'inline-block',
                        }}
                      >
                        <div
                          style={{
                            fontSize: '0.67rem',
                            color: balAfter > 0 ? '#15803d' : '#b45309',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                          }}
                        >
                          New Balance
                        </div>
                        <div
                          style={{
                            fontSize: '0.94rem',
                            fontWeight: 900,
                            fontFamily: 'monospace',
                            color: balAfter > 0 ? '#15803d' : '#b45309',
                          }}
                        >
                          {formatINR(balAfter)}
                        </div>
                      </div>

                      {/* Visual progression indicator */}
                      <div
                        style={{
                          fontSize: '0.68rem',
                          fontFamily: 'monospace',
                          color: '#64748b',
                          marginTop: 3,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <span>{formatINR(balBefore)}</span>
                        <ArrowRight size={10} />
                        <span style={{ fontWeight: 800, color: balAfter > 0 ? '#15803d' : '#e11d48' }}>
                          {formatINR(balAfter)}
                        </span>
                      </div>
                    </td>

                    {/* 6. Reference / UTR */}
                    <td>
                      <div
                        onClick={(e) => handleCopyRef(log.ref, e)}
                        title="Click to copy Reference / UTR"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          fontSize: '0.74rem',
                          fontFamily: 'monospace',
                          color: '#1e293b',
                          background: '#f8fafc',
                          padding: '3px 8px',
                          borderRadius: 5,
                          border: '1px solid #cbd5e1',
                          cursor: 'pointer',
                        }}
                      >
                        <span>{log.ref}</span>
                        {isCopied ? <Check size={12} color="#059669" /> : <Copy size={12} color="#64748b" />}
                      </div>
                      {isCopied && (
                        <div style={{ fontSize: '0.66rem', color: '#059669', fontWeight: 700, marginTop: 1 }}>
                          Copied!
                        </div>
                      )}
                    </td>

                    {/* 7. Description & Method */}
                    <td>
                      <div style={{ fontSize: '0.8rem', color: '#334155', fontWeight: 600 }}>
                        {log.description}
                      </div>
                      <div
                        style={{
                          fontSize: '0.7rem',
                          color: '#64748b',
                          display: 'inline-block',
                          marginTop: 2,
                          background: '#f1f5f9',
                          padding: '1px 6px',
                          borderRadius: 4,
                        }}
                      >
                        {log.paymentMethod}
                      </div>
                    </td>

                    {/* 8. Actions */}
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <button
                          type="button"
                          className="sales-btn-secondary"
                          style={{
                            padding: '4px 8px',
                            fontSize: '0.74rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                          onClick={() => openCustomerStatement(log)}
                          title="View customer complete balance history"
                        >
                          <History size={12} /> Statement
                        </button>

                        <button
                          type="button"
                          className="sales-btn-primary"
                          style={{
                            padding: '4px 8px',
                            fontSize: '0.74rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                          onClick={() => {
                            const cust = customers.find(
                              (c) => c.id === log.customerId || (c.phone && log.phone && c.phone.includes(log.phone))
                            ) || {
                              id: log.customerId,
                              companyName: log.companyName,
                              name: log.customerName,
                              phone: log.phone,
                            };
                            setAddMoneyCust(cust);
                          }}
                          title="Top up this customer's wallet"
                        >
                          <Plus size={12} /> Top Up
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 5. Customer Statement Drawer / Modal */}
      {selectedCustomerForStatement && (
        <div
          className="sales-modal-overlay"
          onClick={() => setSelectedCustomerForStatement(null)}
          style={{ zIndex: 1200 }}
        >
          <div
            className="sales-modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 840, width: '95%' }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                    display: 'grid',
                    placeItems: 'center',
                    color: '#fff',
                  }}
                >
                  <History size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>
                    {selectedCustomerForStatement.customer.companyName ||
                      selectedCustomerForStatement.customer.name ||
                      'Customer Balance Statement'}
                  </h3>
                  <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>
                    👤 {selectedCustomerForStatement.customer.contactPerson} • 📞 +91{' '}
                    {selectedCustomerForStatement.customer.phone} • Account ID:{' '}
                    <code>{selectedCustomerForStatement.customer.id}</code>
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="desk-close-btn"
                onClick={() => setSelectedCustomerForStatement(null)}
              >
                <X size={18} />
              </button>
            </div>

            {/* Quick KPI Strip for this customer */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 10,
                marginBottom: 18,
                background: '#f8fafc',
                padding: 14,
                borderRadius: 10,
                border: '1px solid #e2e8f0',
              }}
            >
              <div>
                <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700 }}>
                  CURRENT WALLET BALANCE
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#059669', fontFamily: 'monospace' }}>
                  {formatINR(
                    selectedCustomerForStatement.customer.balance ??
                      selectedCustomerForStatement.customer.walletBalance ??
                      0
                  )}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700 }}>
                  TOTAL CREDITED (TOP-UPS)
                </div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#4f46e5', fontFamily: 'monospace' }}>
                  {formatINR(
                    selectedCustomerForStatement.logs
                      .filter((l) => l.txType === 'credit')
                      .reduce((s, l) => s + Number(l.amount || 0), 0)
                  )}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700 }}>
                  TOTAL DEBITED (AD BURN)
                </div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#e11d48', fontFamily: 'monospace' }}>
                  {formatINR(
                    selectedCustomerForStatement.logs
                      .filter((l) => l.txType === 'debit')
                      .reduce((s, l) => s + Number(l.amount || 0), 0)
                  )}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700 }}>
                  AUDITED ENTRIES
                </div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>
                  {selectedCustomerForStatement.logs.length} Transactions
                </div>
              </div>
            </div>

            {/* Customer Statement Table */}
            <div style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
              <table className="desk-table" style={{ width: '100%', fontSize: '0.78rem' }}>
                <thead>
                  <tr>
                    <th>Date &amp; Time</th>
                    <th>Previous Balance</th>
                    <th>Amount Change</th>
                    <th>New Balance</th>
                    <th>Reference UTR</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedCustomerForStatement.logs.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: 24, color: '#64748b' }}>
                        No balance transactions on record for this customer.
                      </td>
                    </tr>
                  ) : (
                    selectedCustomerForStatement.logs.map((clog) => (
                      <tr key={clog.id}>
                        <td style={{ fontWeight: 600 }}>{clog.date}</td>
                        <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#475569' }}>
                          {formatINR(clog.balanceBefore)}
                        </td>
                        <td>
                          <span
                            style={{
                              fontFamily: 'monospace',
                              fontWeight: 800,
                              color: clog.txType === 'debit' ? '#e11d48' : '#059669',
                            }}
                          >
                            {clog.txType === 'debit' ? '-' : '+'} {formatINR(clog.amount)}
                          </span>
                        </td>
                        <td
                          style={{
                            fontFamily: 'monospace',
                            fontWeight: 900,
                            color: clog.balanceAfter > 0 ? '#15803d' : '#b45309',
                          }}
                        >
                          {formatINR(clog.balanceAfter)}
                        </td>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.72rem' }}>{clog.ref}</td>
                        <td style={{ color: '#475569' }}>{clog.description}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Modal Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
              <button
                type="button"
                className="sales-btn-secondary"
                onClick={() => setSelectedCustomerForStatement(null)}
              >
                Close Statement
              </button>
              <button
                type="button"
                className="sales-btn-primary"
                onClick={() => {
                  setAddMoneyCust(selectedCustomerForStatement.customer);
                  setSelectedCustomerForStatement(null);
                }}
              >
                <Plus size={14} /> Add Money to Wallet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Add Money Modal */}
      {addMoneyCust && (
        <SalesAddMoneyModal
          customer={addMoneyCust}
          onClose={() => setAddMoneyCust(null)}
          onSuccess={() => {
            fetchLogs(true);
            setAddMoneyCust(null);
          }}
        />
      )}
    </div>
  );
}

