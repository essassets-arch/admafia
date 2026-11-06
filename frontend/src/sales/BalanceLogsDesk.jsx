import React, { useState, useEffect, useMemo } from 'react';
import {
  Scale,
  RefreshCw,
  Search,
  Download,
  Copy,
  Check,
  Building2,
  History,
  X,
} from 'lucide-react';
import Swal from 'sweetalert2';
import crmApi from '../services/crmApi';

const formatScreenshotCurrency = (val) => {
  const num = Math.abs(Number(val || 0));
  return `₹${num.toFixed(2)}`;
};

const formatScreenshotDate = (dateVal) => {
  if (!dateVal) return { dateStr: '-', timeStr: '' };
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return { dateStr: String(dateVal), timeStr: '' };
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const year = d.getFullYear();
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  return {
    dateStr: `${month}/${day}/${year}`,
    timeStr: `${hours}:${minutes}:${seconds} ${ampm}`,
  };
};

export default function BalanceLogsDesk({
  customers = [],
  setCustomers,
  onBalanceLogsCountChange,
}) {
  const [logs, setLogs] = useState([]);
  const [customerLogs, setCustomerLogs] = useState([]);
  const [viewMode, setViewMode] = useState('customers'); // 'customers' (1 row per customer) | 'all' (all ledger activities)
  const [stats, setStats] = useState({
    totalLogs: 0,
    totalAmountAdded: 0,
    totalAmountRemoved: 0,
    totalCredits: 0,
    totalDebits: 0,
  });

  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('all');
  const [selectedCustomerForStatement, setSelectedCustomerForStatement] = useState(null);
  const [addMoneyCust, setAddMoneyCust] = useState(null);
  const [copiedRef, setCopiedRef] = useState(null);

  // Fetch authoritative balance logs directly from PostgreSQL backend
  const fetchLogs = async (showToast = false) => {
    setLoading(true);
    try {
      const params = {};
      if (selectedCustomerId && selectedCustomerId !== 'all') {
        params.customerId = selectedCustomerId;
      }
      const res = await crmApi.getBalanceLogs(params);

      if (res && res.ok) {
        if (Array.isArray(res.logs)) {
          setLogs(res.logs);
        }
        if (Array.isArray(res.customerLogs)) {
          setCustomerLogs(res.customerLogs);
        }
        if (res.stats) {
          setStats(res.stats);
        }
        if (onBalanceLogsCountChange) {
          onBalanceLogsCountChange(res.customerLogs ? res.customerLogs.length : res.logs?.length || 0);
        }
        try {
          if (Array.isArray(res.logs)) localStorage.setItem('growthline_balance_logs', JSON.stringify(res.logs));
          if (Array.isArray(res.customerLogs)) localStorage.setItem('growthline_customer_balance_logs', JSON.stringify(res.customerLogs));
        } catch (_) {}

        if (showToast) {
          Swal.fire({
            icon: 'success',
            title: 'Balance Logs Synchronized',
            text: `Successfully synced ${res.customerLogs?.length || res.logs.length} live customer balance audit records.`,
            timer: 2000,
            showConfirmButton: false,
          });
        }
      }
    } catch (err) {
      console.warn('[BalanceLogsDesk] Error loading logs:', err);
      try {
        const raw = localStorage.getItem('growthline_balance_logs');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) setLogs(parsed);
        }
        const rawCust = localStorage.getItem('growthline_customer_balance_logs');
        if (rawCust) {
          const parsedCust = JSON.parse(rawCust);
          if (Array.isArray(parsedCust) && parsedCust.length > 0) setCustomerLogs(parsedCust);
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

  // Copy Reference to clipboard
  const handleCopyRef = (refText, e) => {
    if (e) e.stopPropagation();
    if (!refText) return;
    navigator.clipboard.writeText(refText).then(() => {
      setCopiedRef(refText);
      setTimeout(() => setCopiedRef(null), 2000);
    });
  };

  // 1 row per customer dataset (Guarantees every customer appears once, no duplicates)
  const deduplicatedCustomerLogs = useMemo(() => {
    const custMap = new Map();

    // 1. Seed from registered customer accounts
    customers.forEach((c) => {
      const cleanPhone = String(c.phone || '').replace(/\D/g, '').slice(-10);
      const name = c.companyName || c.name || c.username || 'Customer';
      custMap.set(c.id, {
        id: `cust_${c.id}`,
        customerId: c.id,
        user: name,
        customerName: name,
        companyName: name,
        contactPerson: c.contactPerson || c.contact || name,
        phone: cleanPhone,
        userInitial: (name || 'U').charAt(0).toUpperCase(),
        previousBalance: 0,
        changedAmount: 0,
        newBalance: Number(c.balance || 0),
        balanceBefore: 0,
        balanceAfter: Number(c.balance || 0),
        txType: 'credit',
        reason: Number(c.balance || 0) > 0 ? `Current Wallet Balance (₹${Number(c.balance || 0)})` : 'Wallet Active (₹0.00)',
        date: c.createdAt || new Date().toISOString(),
      });
    });

    // 2. Overlay with backend customerLogs if available
    customerLogs.forEach((clog) => {
      const key = clog.customerId || customers.find((c) => c.phone && clog.phone && String(c.phone).slice(-10) === String(clog.phone).slice(-10))?.id;
      if (key && custMap.has(key)) {
        custMap.set(key, { ...custMap.get(key), ...clog });
      } else if (key) {
        custMap.set(key, clog);
      }
    });

    // 3. Overlay with each customer's newest log from logs
    const seenInLogs = new Set();
    logs.forEach((log) => {
      const key = log.customerId || customers.find((c) => c.phone && log.phone && String(c.phone).slice(-10) === String(log.phone).slice(-10))?.id;
      if (!key) return;
      if (!seenInLogs.has(key)) {
        seenInLogs.add(key);
        const existing = custMap.get(key);
        custMap.set(key, {
          ...(existing || {}),
          ...log,
          user: existing?.user || log.user,
          phone: existing?.phone || log.phone,
        });
      }
    });

    const list = Array.from(custMap.values());
    list.sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
    return list;
  }, [customerLogs, logs, customers]);

  // Active dataset depending on viewMode
  const displayDataset = viewMode === 'customers' ? deduplicatedCustomerLogs : logs;

  // Filtered dataset
  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase();

    return displayDataset.filter((log) => {
      // Exclude synthetic initial account opening entries requested to be removed
      const rLower = String(log.reason || log.description || '').toLowerCase();
      if (
        rLower.includes('initial account opening') ||
        rLower.includes('prepaid ad account created') ||
        String(log.id || '').startsWith('init_')
      ) {
        return false;
      }

      // 1. Specific customer selector
      if (selectedCustomerId !== 'all') {
        const custMatches =
          log.customerId === selectedCustomerId ||
          (log.phone && customers.find((c) => c.id === selectedCustomerId)?.phone?.includes(log.phone));
        if (!custMatches) return false;
      }

      // 2. Search query
      if (q) {
        const matchUser = (log.user || log.customerName || log.companyName || '').toLowerCase().includes(q);
        const matchPhone = (log.phone || '').includes(q);
        const matchReason = (log.reason || log.description || '').toLowerCase().includes(q);
        const matchRef = (log.ref || '').toLowerCase().includes(q);

        if (!matchUser && !matchPhone && !matchReason && !matchRef) {
          return false;
        }
      }

      return true;
    });
  }, [displayDataset, selectedCustomerId, search, customers]);

  // Total Amount Added & Total Amount Removed (computed from valid real logs)
  const totalAmountAdded = useMemo(() => {
    if (selectedCustomerId !== 'all' || search) {
      return filteredLogs
        .filter((l) => l.txType === 'credit')
        .reduce((sum, l) => sum + Number(l.changedAmount ?? l.amount ?? 0), 0);
    }
    if (stats && stats.totalAmountAdded) {
      return stats.totalAmountAdded;
    }
    return logs
      .filter((l) => l.txType === 'credit')
      .reduce((sum, l) => sum + Number(l.changedAmount ?? l.amount ?? 0), 0);
  }, [filteredLogs, selectedCustomerId, search, stats, logs]);

  const totalAmountRemoved = useMemo(() => {
    if (selectedCustomerId !== 'all' || search) {
      return filteredLogs
        .filter((l) => l.txType === 'debit')
        .reduce((sum, l) => sum + Number(l.changedAmount ?? l.amount ?? 0), 0);
    }
    if (stats && stats.totalAmountRemoved) {
      return stats.totalAmountRemoved;
    }
    return logs
      .filter((l) => l.txType === 'debit')
      .reduce((sum, l) => sum + Number(l.changedAmount ?? l.amount ?? 0), 0);
  }, [filteredLogs, selectedCustomerId, search, stats, logs]);

  // Export CSV
  const handleExportCSV = () => {
    if (filteredLogs.length === 0) {
      Swal.fire({
        icon: 'info',
        title: 'No Data to Export',
        text: 'There are no balance logs matching your active search.',
      });
      return;
    }

    const headers = [
      '#',
      'USER',
      'PREVIOUS BALANCE',
      'CHANGED AMOUNT',
      'NEW BALANCE',
      'REASON',
      'DATE',
    ];

    const rows = filteredLogs.map((l, idx) => [
      idx + 1,
      `"${(l.user || l.companyName || l.customerName || '').replace(/"/g, '""')}"`,
      formatScreenshotCurrency(l.previousBalance ?? l.balanceBefore ?? 0),
      formatScreenshotCurrency(l.changedAmount ?? l.amount ?? 0),
      formatScreenshotCurrency(l.newBalance ?? l.balanceAfter ?? 0),
      `"${(l.reason || l.description || '').replace(/"/g, '""')}"`,
      `"${(l.date || '').replace(/"/g, '""')}"`,
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
      text: `Exported ${filteredLogs.length} balance entries successfully.`,
      timer: 2000,
      showConfirmButton: false,
    });
  };

  // Open customer statement modal
  const openCustomerStatement = (log) => {
    const cust =
      customers.find((c) => c.id === log.customerId || (c.phone && log.phone && c.phone.includes(log.phone))) || {
        id: log.customerId,
        companyName: log.companyName || log.user,
        name: log.customerName || log.user,
        contactPerson: log.contactPerson,
        phone: log.phone,
        email: log.email,
        username: log.username,
        balance: log.currentWalletBalance || log.newBalance,
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
      {/* 1. Header with Controls */}
      <div className="desk-header" style={{ marginBottom: 16 }}>
        <div>
          <div className="desk-breadcrumb">SUB ADMIN &amp; SUPPORT OPERATIONS / BALANCE AUDIT LEDGER</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 className="desk-title">Customer Balance Logs</h1>
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
              {viewMode === 'customers' ? `${deduplicatedCustomerLogs.length} Customer Accounts` : `${logs.length} Total Logs`}
            </span>
          </div>
        </div>

        {/* Action Controls */}
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

      {/* 2. Top Summary Cards (Exact UI from user's screenshot) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
          marginBottom: 20,
        }}
      >
        {/* Card 1: Total Amount Added */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: 12,
            padding: '20px 24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          }}
        >
          <div
            style={{
              color: '#374151',
              fontWeight: 700,
              fontSize: '0.88rem',
              marginBottom: 8,
              letterSpacing: '-0.01em',
            }}
          >
            Total Amount Added
          </div>
          <div
            style={{
              color: '#10b981',
              fontSize: '2rem',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              fontFamily: 'system-ui, -apple-system, sans-serif',
            }}
          >
            {formatScreenshotCurrency(totalAmountAdded)}
          </div>
        </div>

        {/* Card 2: Total Amount Removed */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: 12,
            padding: '20px 24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          }}
        >
          <div
            style={{
              color: '#374151',
              fontWeight: 700,
              fontSize: '0.88rem',
              marginBottom: 8,
              letterSpacing: '-0.01em',
            }}
          >
            Total Amount Removed
          </div>
          <div
            style={{
              color: '#dc2626',
              fontSize: '2rem',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              fontFamily: 'system-ui, -apple-system, sans-serif',
            }}
          >
            {formatScreenshotCurrency(totalAmountRemoved)}
          </div>
        </div>
      </div>

      {/* 3. Search Bar & Customer Selector */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 16,
          background: '#ffffff',
          padding: '10px 16px',
          borderRadius: 10,
          border: '1px solid #e5e7eb',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: '1 1 300px' }}>
          <div className="desk-search-wrap" style={{ width: '100%', maxWidth: 360 }}>
            <Search size={15} className="desk-search-icon" />
            <input
              type="text"
              className="desk-search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search user, reason, or date..."
              style={{ fontSize: '0.84rem' }}
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

          <select
            className="desk-search-input"
            style={{ width: 'auto', minWidth: 200, padding: '6px 12px', fontSize: '0.82rem', cursor: 'pointer' }}
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
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', background: '#f1f5f9', padding: 3, borderRadius: 8 }}>
            <button
              type="button"
              onClick={() => setViewMode('customers')}
              style={{
                border: 'none',
                background: viewMode === 'customers' ? '#ffffff' : 'transparent',
                color: viewMode === 'customers' ? '#0f172a' : '#64748b',
                fontWeight: viewMode === 'customers' ? 800 : 600,
                padding: '5px 12px',
                borderRadius: 6,
                fontSize: '0.78rem',
                cursor: 'pointer',
                boxShadow: viewMode === 'customers' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              👥 1 Customer Per Row ({deduplicatedCustomerLogs.length})
            </button>
            <button
              type="button"
              onClick={() => setViewMode('all')}
              style={{
                border: 'none',
                background: viewMode === 'all' ? '#ffffff' : 'transparent',
                color: viewMode === 'all' ? '#0f172a' : '#64748b',
                fontWeight: viewMode === 'all' ? 800 : 600,
                padding: '5px 12px',
                borderRadius: 6,
                fontSize: '0.78rem',
                cursor: 'pointer',
                boxShadow: viewMode === 'all' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              📜 All Ledger Entries ({logs.length})
            </button>
          </div>

          <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>
            Showing <b>{filteredLogs.length}</b> {viewMode === 'customers' ? 'customer balance accounts' : 'audit records'}
          </div>
        </div>
      </div>

      {/* 4. Exact Table from Screenshot */}
      <div className="desk-table-card" style={{ overflowX: 'auto', background: '#ffffff', borderRadius: 12 }}>
        <table className="desk-table" style={{ width: '100%', minWidth: 960, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#fafafa' }}>
              <th style={{ width: 50, padding: '14px 16px', color: '#64748b', fontSize: '0.74rem', fontWeight: 700, letterSpacing: '0.04em' }}>
                #
              </th>
              <th style={{ width: 220, padding: '14px 16px', color: '#64748b', fontSize: '0.74rem', fontWeight: 700, letterSpacing: '0.04em' }}>
                USER
              </th>
              <th style={{ width: 170, padding: '14px 16px', color: '#64748b', fontSize: '0.74rem', fontWeight: 700, letterSpacing: '0.04em' }}>
                PREVIOUS BALANCE
              </th>
              <th style={{ width: 170, padding: '14px 16px', color: '#64748b', fontSize: '0.74rem', fontWeight: 700, letterSpacing: '0.04em' }}>
                CHANGED AMOUNT
              </th>
              <th style={{ width: 170, padding: '14px 16px', color: '#64748b', fontSize: '0.74rem', fontWeight: 700, letterSpacing: '0.04em' }}>
                NEW BALANCE
              </th>
              <th style={{ minWidth: 140, padding: '14px 16px', color: '#64748b', fontSize: '0.74rem', fontWeight: 700, letterSpacing: '0.04em' }}>
                REASON
              </th>
              <th style={{ width: 160, padding: '14px 16px', color: '#64748b', fontSize: '0.74rem', fontWeight: 700, letterSpacing: '0.04em' }}>
                DATE
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '48px 20px', color: '#64748b' }}>
                  <Scale size={32} color="#94a3b8" style={{ margin: '0 auto 10px auto', display: 'block' }} />
                  <div style={{ fontWeight: 700, fontSize: '0.94rem', color: '#0f172a' }}>
                    No Balance Logs Found
                  </div>
                  <div style={{ fontSize: '0.8rem', marginTop: 4 }}>
                    {search || selectedCustomerId !== 'all'
                      ? 'No records match your active search.'
                      : 'No balance changes on record.'}
                  </div>
                </td>
              </tr>
            ) : (
              filteredLogs.map((log, index) => {
                const dt = formatScreenshotDate(log.createdAt || log.date);
                const userName = log.user || log.customerName || log.companyName || 'User';
                const initial = (log.userInitial || userName.charAt(0) || 'U').toUpperCase();
                const prevBal = log.previousBalance ?? log.balanceBefore ?? 0;
                const chgAmt = log.changedAmount ?? log.amount ?? 0;
                const newBal = log.newBalance ?? log.balanceAfter ?? 0;

                return (
                  <tr
                    key={log.id || index}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      transition: 'background 0.15s ease',
                      cursor: 'pointer',
                    }}
                    onClick={() => openCustomerStatement(log)}
                    title="Click to view full customer statement"
                  >
                    {/* 1. # */}
                    <td style={{ padding: '14px 16px', color: '#64748b', fontWeight: 600, fontSize: '0.86rem' }}>
                      {index + 1}
                    </td>

                    {/* 2. USER (Avatar + Name) */}
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            background: '#0284c7',
                            color: '#ffffff',
                            display: 'grid',
                            placeItems: 'center',
                            fontWeight: 800,
                            fontSize: '0.85rem',
                            flexShrink: 0,
                          }}
                        >
                          {initial}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.9rem' }}>
                            {userName}
                          </div>
                          {log.phone && (
                            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                              +91 {log.phone}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* 3. PREVIOUS BALANCE (Red) */}
                    <td style={{ padding: '14px 16px' }}>
                      <span
                        style={{
                          color: '#dc2626',
                          fontWeight: 700,
                          fontFamily: 'monospace',
                          fontSize: '0.94rem',
                        }}
                      >
                        {formatScreenshotCurrency(prevBal)}
                      </span>
                    </td>

                    {/* 4. CHANGED AMOUNT (Green) */}
                    <td style={{ padding: '14px 16px' }}>
                      <span
                        style={{
                          color: '#10b981',
                          fontWeight: 700,
                          fontFamily: 'monospace',
                          fontSize: '0.94rem',
                        }}
                      >
                        {formatScreenshotCurrency(chgAmt)}
                      </span>
                    </td>

                    {/* 5. NEW BALANCE (Green) */}
                    <td style={{ padding: '14px 16px' }}>
                      <span
                        style={{
                          color: '#10b981',
                          fontWeight: 700,
                          fontFamily: 'monospace',
                          fontSize: '0.94rem',
                        }}
                      >
                        {formatScreenshotCurrency(newBal)}
                      </span>
                    </td>

                    {/* 6. REASON */}
                    <td style={{ padding: '14px 16px', color: '#334155', fontSize: '0.84rem' }}>
                      {log.reason || log.description || 'd'}
                    </td>

                    {/* 7. DATE */}
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontSize: '0.78rem', color: '#0f172a', lineHeight: 1.3 }}>
                        <div style={{ fontWeight: 600 }}>{dt.dateStr}</div>
                        <div style={{ color: '#64748b', fontSize: '0.72rem' }}>{dt.timeStr}</div>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 5. Customer Statement Drawer Modal */}
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
                    👤 {selectedCustomerForStatement.customer.contactPerson || selectedCustomerForStatement.customer.name} • 📞 +91{' '}
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

            {/* Quick KPI Strip */}
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
                <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#10b981', fontFamily: 'monospace' }}>
                  {formatScreenshotCurrency(
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
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#10b981', fontFamily: 'monospace' }}>
                  {formatScreenshotCurrency(
                    selectedCustomerForStatement.logs
                      .filter((l) => l.txType === 'credit')
                      .reduce((s, l) => s + Number(l.changedAmount ?? l.amount ?? 0), 0)
                  )}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700 }}>
                  TOTAL DEBITED (AD BURN)
                </div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#dc2626', fontFamily: 'monospace' }}>
                  {formatScreenshotCurrency(
                    selectedCustomerForStatement.logs
                      .filter((l) => l.txType === 'debit')
                      .reduce((s, l) => s + Number(l.changedAmount ?? l.amount ?? 0), 0)
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
                  <tr style={{ background: '#fafafa' }}>
                    <th>#</th>
                    <th>PREVIOUS BALANCE</th>
                    <th>CHANGED AMOUNT</th>
                    <th>NEW BALANCE</th>
                    <th>REASON</th>
                    <th>DATE</th>
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
                    selectedCustomerForStatement.logs.map((clog, idx) => {
                      const cdt = formatScreenshotDate(clog.createdAt || clog.date);
                      return (
                        <tr key={clog.id || idx}>
                          <td style={{ color: '#64748b' }}>{idx + 1}</td>
                          <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#dc2626' }}>
                            {formatScreenshotCurrency(clog.previousBalance ?? clog.balanceBefore ?? 0)}
                          </td>
                          <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#10b981' }}>
                            {formatScreenshotCurrency(clog.changedAmount ?? clog.amount ?? 0)}
                          </td>
                          <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#10b981' }}>
                            {formatScreenshotCurrency(clog.newBalance ?? clog.balanceAfter ?? 0)}
                          </td>
                          <td style={{ color: '#475569' }}>{clog.reason || clog.description || 'd'}</td>
                          <td>
                            <div>{cdt.dateStr}</div>
                            <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{cdt.timeStr}</div>
                          </td>
                        </tr>
                      );
                    })
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
