import React, { useState, useEffect, useMemo } from 'react';
import {
  CreditCard,
  Receipt,
  CheckCircle2,
  AlertCircle,
  Clock,
  RotateCcw,
  Search,
  Filter,
  Download,
  RefreshCw,
  ExternalLink,
  Eye,
  Phone,
  MessageSquare,
  Plus,
  Printer,
  Copy,
  Check,
  X,
  FileSpreadsheet,
  ArrowUpRight,
  ShieldCheck,
  Building2,
  User,
  Wallet,
} from 'lucide-react';
import Swal from 'sweetalert2';
import crmApi from '../services/crmApi';
import { resolveCustomerIdentity, formatIndianDateTime } from './OperationalDesksViews';

const formatINR = (val) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(val || 0);

export default function MasterTransactionLogsDesk({
  customers = [],
  setCustomers,
  allTransactions: initialTx = [],
  onRefresh,
}) {
  const [transactions, setTransactions] = useState(() => {
    if (Array.isArray(initialTx) && initialTx.length > 0) return initialTx;
    try {
      const raw = localStorage.getItem('growthline_all_transactions');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (_) {}
    return [];
  });

  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'verified' | 'failed' | 'pending' | 'refunded'
  const [methodFilter, setMethodFilter] = useState('all'); // 'all' | 'upi' | 'card' | 'debit' | 'bank'
  const [dateFilter, setDateFilter] = useState('all'); // 'all' | 'today' | '7days' | '30days'
  const [selectedTx, setSelectedTx] = useState(null);
  const [activeReceipt, setActiveReceipt] = useState(null);
  const [copyFeedback, setCopyFeedback] = useState(null);

  // Sync prop changes
  useEffect(() => {
    if (Array.isArray(initialTx) && initialTx.length > 0) {
      setTransactions(initialTx);
    }
  }, [initialTx]);

  // Fetch latest transactions from PostgreSQL backend
  const fetchTransactions = async (showToast = false) => {
    setLoading(true);
    try {
      const res = await crmApi.fetchAllTransactions();
      if (res && res.ok && Array.isArray(res.transactions)) {
        setTransactions(res.transactions);
        try {
          localStorage.setItem('growthline_all_transactions', JSON.stringify(res.transactions));
        } catch (_) {}
        if (showToast) {
          Swal.fire({
            icon: 'success',
            title: 'Transactions Synchronized',
            text: `Successfully synced ${res.transactions.length} master transaction logs from PostgreSQL.`,
            timer: 2000,
            showConfirmButton: false,
          });
        }
      }
    } catch (err) {
      console.warn('[MasterTransactionLogsDesk] Failed to load transactions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions(false);
  }, []);

  // Filtered dataset
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = new Date();

    return transactions.filter((tx) => {
      // 1. Status Filter
      if (statusFilter !== 'all') {
        const s = (tx.status || '').toLowerCase();
        if (statusFilter === 'verified' && s !== 'verified' && s !== 'paid' && s !== 'settled') return false;
        if (statusFilter === 'failed' && s !== 'failed') return false;
        if (statusFilter === 'pending' && s !== 'pending') return false;
        if (statusFilter === 'refunded' && s !== 'refunded') return false;
      }

      // 2. Payment Method Filter
      if (methodFilter !== 'all') {
        const m = (tx.paymentMode || tx.method || '').toLowerCase();
        if (methodFilter === 'upi' && !m.includes('upi')) return false;
        if (methodFilter === 'card' && !m.includes('card')) return false;
        if (methodFilter === 'debit' && !m.includes('debit') && !m.includes('daily')) return false;
        if (methodFilter === 'bank' && !m.includes('bank') && !m.includes('transfer') && !m.includes('utr')) return false;
      }

      // 3. Date Filter
      if (dateFilter !== 'all') {
        const txDate = tx.createdAt ? new Date(tx.createdAt) : null;
        if (txDate && !isNaN(txDate.getTime())) {
          const diffMs = now.getTime() - txDate.getTime();
          const diffDays = diffMs / (1000 * 60 * 60 * 24);
          if (dateFilter === 'today' && diffDays > 1) return false;
          if (dateFilter === '7days' && diffDays > 7) return false;
          if (dateFilter === '30days' && diffDays > 30) return false;
        }
      }

      // 4. Search Filter
      if (q) {
        const identity = resolveCustomerIdentity(tx, customers);
        const matchSearch =
          (tx.id || '').toLowerCase().includes(q) ||
          (tx.ref || '').toLowerCase().includes(q) ||
          (tx.receiptNo || tx.receiptNumber || '').toLowerCase().includes(q) ||
          (tx.phone || '').includes(q) ||
          (tx.username || '').toLowerCase().includes(q) ||
          (identity.displayName || '').toLowerCase().includes(q) ||
          (identity.contactPerson || '').toLowerCase().includes(q) ||
          (tx.description || '').toLowerCase().includes(q) ||
          (tx.paymentMode || '').toLowerCase().includes(q);
        if (!matchSearch) return false;
      }

      return true;
    });
  }, [transactions, statusFilter, methodFilter, dateFilter, search, customers]);

  // Overall Statistics Metrics
  const stats = useMemo(() => {
    let totalVolume = 0;
    let verifiedCount = 0;
    let verifiedVolume = 0;
    let failedCount = 0;
    let failedVolume = 0;
    let pendingCount = 0;
    let pendingVolume = 0;
    let refundedCount = 0;
    let refundedVolume = 0;

    for (const t of transactions) {
      const amt = Number(t.amount || 0);
      totalVolume += amt;
      const s = (t.status || '').toLowerCase();
      if (s === 'verified' || s === 'paid' || s === 'settled') {
        verifiedCount++;
        verifiedVolume += amt;
      } else if (s === 'failed') {
        failedCount++;
        failedVolume += amt;
      } else if (s === 'pending') {
        pendingCount++;
        pendingVolume += amt;
      } else if (s === 'refunded') {
        refundedCount++;
        refundedVolume += amt;
      }
    }

    const settledTotal = verifiedCount + failedCount;
    const settlementRate = settledTotal > 0 ? Math.round((verifiedCount / settledTotal) * 100) : 100;

    return {
      totalCount: transactions.length,
      totalVolume,
      verifiedCount,
      verifiedVolume,
      failedCount,
      failedVolume,
      pendingCount,
      pendingVolume,
      refundedCount,
      refundedVolume,
      settlementRate,
    };
  }, [transactions]);

  // Copy to clipboard helper
  const handleCopy = (text, key) => {
    if (!text) return;
    navigator.clipboard?.writeText(text);
    setCopyFeedback(key);
    setTimeout(() => setCopyFeedback(null), 2000);
  };

  // Export Filtered Table as CSV
  const handleExportCSV = () => {
    if (!filtered.length) {
      Swal.fire({ icon: 'info', title: 'No Data', text: 'No transaction logs to export for the current filters.' });
      return;
    }

    const headers = [
      'Transaction ID',
      'Receipt No',
      'Reference / UTR / Order ID',
      'Customer Workspace',
      'Username',
      'Contact Person',
      'Phone Number',
      'Amount (INR)',
      'Status',
      'Transaction Type',
      'Payment Method',
      'Date & Time (IST)',
      'Notes / Reason',
    ];

    const rows = filtered.map((tx) => {
      const identity = resolveCustomerIdentity(tx, customers);
      return [
        tx.id || '',
        tx.receiptNo || tx.receiptNumber || '',
        tx.ref || '',
        `"${(identity.displayName || '').replace(/"/g, '""')}"`,
        `"${(identity.username || '').replace(/"/g, '""')}"`,
        `"${(identity.contactPerson || '').replace(/"/g, '""')}"`,
        `"+91 ${tx.phone || ''}"`,
        tx.amount || 0,
        tx.status || 'verified',
        tx.typeLabel || tx.type || '',
        `"${(tx.paymentMode || '').replace(/"/g, '""')}"`,
        `"${(tx.date || '').replace(/"/g, '""')}"`,
        `"${(tx.description || tx.failureReason || '').replace(/"/g, '""')}"`,
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `admafia-transactions-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // One-click manual recovery / wallet credit helper
  const handleManualCredit = async (tx) => {
    const identity = resolveCustomerIdentity(tx, customers);
    const result = await Swal.fire({
      title: 'Sales-Assisted Top-Up Recovery',
      html: `
        <div style="text-align: left; font-size: 0.90rem; color: #334155;">
          <p>Credit customer advertising wallet directly in PostgreSQL:</p>
          <div style="background: #f8fafc; padding: 10px 14px; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 12px;">
            <div>Customer: <strong>${identity.displayName}</strong> (@${identity.username})</div>
            <div>Phone: <strong>+91 ${tx.phone}</strong></div>
            <div>Failed Amount: <strong style="color: #dc2626;">₹${Number(tx.amount || 0).toLocaleString('en-IN')}</strong></div>
          </div>
          <label style="font-weight: 700; font-size: 0.85rem; display: block; margin-bottom: 4px;">Credit Amount (₹):</label>
          <input id="swal-credit-amount" type="number" class="swal2-input" value="${tx.amount || 1000}" style="margin: 0 0 10px 0; width: 100%; box-sizing: border-box;" />
          <label style="font-weight: 700; font-size: 0.85rem; display: block; margin-bottom: 4px;">Bank Settlement UTR / Ref:</label>
          <input id="swal-credit-utr" type="text" class="swal2-input" placeholder="e.g. UTR${Date.now().toString().slice(-8)}" value="REC-SALES-${Date.now().toString().slice(-6)}" style="margin: 0; width: 100%; box-sizing: border-box;" />
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Confirm & Credit Wallet',
      confirmButtonColor: '#059669',
      cancelButtonText: 'Cancel',
      preConfirm: () => {
        const amt = Number(document.getElementById('swal-credit-amount').value);
        const utr = document.getElementById('swal-credit-utr').value.trim();
        if (!amt || amt <= 0) {
          Swal.showValidationMessage('Please enter a valid credit amount');
          return false;
        }
        if (!utr) {
          Swal.showValidationMessage('Please enter a bank UTR / settlement reference');
          return false;
        }
        return { amt, utr };
      },
    });

    if (result.isConfirmed) {
      const { amt, utr } = result.value;
      try {
        const patchRes = await fetch(`https://admafia.marketing/api/wallets/${tx.phone}/topup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: amt,
            utr,
            method: 'Sales-Assisted Bank Credit',
            notes: `Assisted recovery for failed transaction ${tx.ref || tx.id}`,
          }),
        }).then((r) => r.json());

        if (patchRes.ok) {
          Swal.fire({
            icon: 'success',
            title: 'Wallet Credited Successfully',
            text: `₹${amt.toLocaleString('en-IN')} has been added to ${identity.displayName}'s marketing wallet.`,
            confirmButtonColor: '#059669',
          });
          fetchTransactions(false);
          if (onRefresh) onRefresh();
        } else {
          Swal.fire({ icon: 'error', title: 'Top-up Failed', text: patchRes.error || 'Server error occurred' });
        }
      } catch (err) {
        Swal.fire({ icon: 'error', title: 'Network Error', text: err.message });
      }
    }
  };

  return (
    <div className="desk-page-container">
      {/* 1. Header & Actions */}
      <div className="desk-header">
        <div>
          <div className="desk-breadcrumb">FINANCIAL OPERATIONS &amp; LEDGER / DESK 05-B</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 className="desk-title">Master Transaction Logs</h1>
            <span
              className="desk-badge-count-alert"
              style={{
                background: '#ecfdf5',
                color: '#059669',
                borderColor: '#a7f3d0',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <CheckCircle2 size={13} />
              {stats.verifiedCount} Verified Settlements
            </span>
            {stats.failedCount > 0 && (
              <span
                className="desk-badge-count-alert"
                style={{
                  background: '#fef2f2',
                  color: '#dc2626',
                  borderColor: '#fca5a5',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <AlertCircle size={13} />
                {stats.failedCount} Failed Charges
              </span>
            )}
          </div>
          <p className="desk-subtitle">
            Centralized audit trail across all payment gateways and customer ad accounts: verified settlements, failed attempts, refunds, and daily wallet debits.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="desk-action-btn"
            onClick={() => fetchTransactions(true)}
            disabled={loading}
            title="Reload live transactions from PostgreSQL database"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
          >
            <RefreshCw size={14} className={loading ? 'desk-spin' : ''} />
            <span>{loading ? 'Syncing...' : 'Sync Live'}</span>
          </button>

          <button
            type="button"
            className="desk-action-btn"
            onClick={handleExportCSV}
            title="Download CSV audit ledger of filtered transactions"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700, background: '#f8fafc' }}
          >
            <Download size={14} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* 2. KPI Metrics Quad Grid */}
      <div className="desk-kpi-grid">
        <div className="desk-kpi-card" style={{ borderLeft: '4px solid #4f46e5' }}>
          <div className="desk-kpi-label">TOTAL TRANSACTED VOLUME</div>
          <div className="desk-kpi-val text-indigo">{formatINR(stats.totalVolume)}</div>
          <div className="desk-kpi-sub" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>{stats.totalCount} total transaction logs recorded</span>
          </div>
        </div>

        <div className="desk-kpi-card" style={{ borderLeft: '4px solid #059669' }}>
          <div className="desk-kpi-label">VERIFIED &amp; SETTLED</div>
          <div className="desk-kpi-val text-emerald">{formatINR(stats.verifiedVolume)}</div>
          <div className="desk-kpi-sub" style={{ color: '#059669', fontWeight: 700 }}>
            ✓ {stats.verifiedCount} cleared payments ({stats.settlementRate}% success rate)
          </div>
        </div>

        <div className="desk-kpi-card" style={{ borderLeft: '4px solid #dc2626' }}>
          <div className="desk-kpi-label">FAILED &amp; DECLINED</div>
          <div className="desk-kpi-val text-rose" style={{ color: '#dc2626' }}>
            {formatINR(stats.failedVolume)}
          </div>
          <div className="desk-kpi-sub" style={{ color: '#dc2626', fontWeight: 700 }}>
            ⚠️ {stats.failedCount} transactions declined or aborted
          </div>
        </div>

        <div className="desk-kpi-card" style={{ borderLeft: '4px solid #d97706' }}>
          <div className="desk-kpi-label">PENDING / IN REVIEW</div>
          <div className="desk-kpi-val" style={{ color: '#d97706' }}>
            {formatINR(stats.pendingVolume)}
          </div>
          <div className="desk-kpi-sub" style={{ color: '#d97706', fontWeight: 700 }}>
            ⏳ {stats.pendingCount} checkouts awaiting confirmation
          </div>
        </div>
      </div>

      {/* 3. Filter Tabs, Quick Methods & Search Bar */}
      <div className="desk-controls-row" style={{ flexWrap: 'wrap', gap: 12 }}>
        {/* Status Filter Tabs */}
        <div className="desk-tabs">
          <button
            type="button"
            className={`desk-tab ${statusFilter === 'all' ? 'active' : ''}`}
            onClick={() => setStatusFilter('all')}
          >
            All Logs ({transactions.length})
          </button>
          <button
            type="button"
            className={`desk-tab ${statusFilter === 'verified' ? 'active' : ''}`}
            onClick={() => setStatusFilter('verified')}
            style={{
              color: statusFilter === 'verified' ? '#ffffff' : '#059669',
              background: statusFilter === 'verified' ? '#059669' : 'transparent',
            }}
          >
            ✓ Verified ({stats.verifiedCount})
          </button>
          <button
            type="button"
            className={`desk-tab ${statusFilter === 'failed' ? 'active' : ''}`}
            onClick={() => setStatusFilter('failed')}
            style={{
              color: statusFilter === 'failed' ? '#ffffff' : '#dc2626',
              background: statusFilter === 'failed' ? '#dc2626' : 'transparent',
            }}
          >
            ✗ Failed ({stats.failedCount})
          </button>
          <button
            type="button"
            className={`desk-tab ${statusFilter === 'pending' ? 'active' : ''}`}
            onClick={() => setStatusFilter('pending')}
            style={{
              color: statusFilter === 'pending' ? '#ffffff' : '#d97706',
              background: statusFilter === 'pending' ? '#d97706' : 'transparent',
            }}
          >
            ⏳ Pending ({stats.pendingCount})
          </button>
          {stats.refundedCount > 0 && (
            <button
              type="button"
              className={`desk-tab ${statusFilter === 'refunded' ? 'active' : ''}`}
              onClick={() => setStatusFilter('refunded')}
              style={{
                color: statusFilter === 'refunded' ? '#ffffff' : '#7c3aed',
                background: statusFilter === 'refunded' ? '#7c3aed' : 'transparent',
              }}
            >
              ↺ Refunded ({stats.refundedCount})
            </button>
          )}
        </div>

        {/* Payment Method Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select
            className="desk-form-select"
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value)}
            style={{ padding: '6px 12px', fontSize: '0.82rem', height: 38 }}
          >
            <option value="all">All Payment Methods</option>
            <option value="upi">Razorpay UPI</option>
            <option value="card">Credit / Debit Cards</option>
            <option value="debit">Daily Ad Spend Auto-Debit</option>
            <option value="bank">Direct Bank / UTR Transfer</option>
          </select>

          <select
            className="desk-form-select"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            style={{ padding: '6px 12px', fontSize: '0.82rem', height: 38 }}
          >
            <option value="all">All Dates</option>
            <option value="today">Today Only</option>
            <option value="7days">Last 7 Days</option>
            <option value="30days">Last 30 Days</option>
          </select>
        </div>

        {/* Real-time Search Input */}
        <div className="desk-search-wrap" style={{ flex: 1 }}>
          <Search size={16} className="desk-search-icon" />
          <input
            type="text"
            className="desk-search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by customer, @username, phone, UTR or receipt #..."
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              style={{
                position: 'absolute',
                right: 10,
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

      {/* 4. Master Transaction Logs Table */}
      <div className="desk-table-card">
        <table className="desk-table">
          <thead>
            <tr>
              <th>Receipt / Ref #</th>
              <th>Customer &amp; Account</th>
              <th>Amount</th>
              <th>Status &amp; Verification</th>
              <th>Purpose &amp; Method</th>
              <th>Date &amp; Time (IST)</th>
              <th>Audit Notes</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center', padding: '48px 24px', color: '#64748b' }}>
                  <Receipt size={40} color="#94a3b8" style={{ margin: '0 auto 12px' }} />
                  <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#334155' }}>
                    No Transaction Logs Found
                  </div>
                  <div style={{ fontSize: '0.84rem', marginTop: 4 }}>
                    Try clearing your search query or switching the status filter tab.
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((tx) => {
                const identity = resolveCustomerIdentity(tx, customers);
                const isVerified = tx.status === 'verified' || tx.status === 'paid' || tx.status === 'settled';
                const isFailed = tx.status === 'failed';
                const isPending = tx.status === 'pending';
                const isRefunded = tx.status === 'refunded';

                const cleanPhone = String(tx.phone || '').replace(/\D/g, '').slice(-10);

                return (
                  <tr
                    key={tx.id || tx.ref}
                    style={{
                      background: isFailed ? '#fffcfc' : isPending ? '#fffdf7' : '#ffffff',
                    }}
                  >
                    {/* 1. Receipt / Ref Number */}
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span
                            style={{
                              fontWeight: 800,
                              fontFamily: 'monospace',
                              color: isVerified ? '#065f46' : isFailed ? '#991b1b' : '#92400e',
                              fontSize: '0.86rem',
                              background: isVerified ? '#ecfdf5' : isFailed ? '#fee2e2' : '#fef3c7',
                              padding: '2px 6px',
                              borderRadius: 4,
                            }}
                          >
                            {tx.receiptNo || tx.receiptNumber || 'RCP-2026'}
                          </span>
                        </div>

                        {tx.ref && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                            <span
                              style={{
                                fontSize: '0.72rem',
                                color: '#64748b',
                                fontFamily: 'monospace',
                                wordBreak: 'break-all',
                              }}
                            >
                              {tx.ref}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopy(tx.ref, tx.ref)}
                              title="Copy Reference ID"
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                padding: 0,
                                color: copyFeedback === tx.ref ? '#059669' : '#94a3b8',
                              }}
                            >
                              {copyFeedback === tx.ref ? <Check size={11} /> : <Copy size={11} />}
                            </button>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* 2. Customer & Entity */}
                    <td>
                      <div className="appr-client-cell">
                        <div
                          className="appr-client-avatar"
                          style={{
                            background: isVerified ? '#ecfdf5' : isFailed ? '#fee2e2' : '#f1f5f9',
                            color: isVerified ? '#047857' : isFailed ? '#b91c1c' : '#475569',
                          }}
                        >
                          {identity.initials}
                        </div>
                        <div className="appr-client-info">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.94rem' }}>
                              {identity.displayName}
                            </span>
                            {identity.username && (
                              <span
                                style={{
                                  fontWeight: 800,
                                  color: '#4f46e5',
                                  background: '#eef2ff',
                                  padding: '1px 6px',
                                  borderRadius: 4,
                                  fontSize: '0.74rem',
                                }}
                              >
                                @{identity.username}
                              </span>
                            )}
                          </div>

                          <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: 2 }}>
                            👤 <b>{identity.contactPerson}</b> •{' '}
                            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0f172a' }}>
                              +91 {cleanPhone}
                            </span>
                          </div>

                          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                            <a
                              href={`tel:${cleanPhone}`}
                              className="desk-action-btn"
                              style={{ padding: '1px 6px', fontSize: '0.68rem', textDecoration: 'none' }}
                              title="Direct Phone Call"
                            >
                              <Phone size={10} /> Call
                            </a>
                            <a
                              href={`https://wa.me/91${cleanPhone}?text=Hello%20${encodeURIComponent(identity.contactPerson)},%20AdMafia%20Financial%20Ops%20regarding%20transaction%20${encodeURIComponent(tx.ref || tx.receiptNo || 'reference')}.`}
                              target="_blank"
                              rel="noreferrer"
                              className="desk-action-btn"
                              style={{ padding: '1px 6px', fontSize: '0.68rem', textDecoration: 'none' }}
                              title="Direct WhatsApp"
                            >
                              <MessageSquare size={10} /> WhatsApp
                            </a>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* 3. Amount */}
                    <td>
                      <div>
                        <span
                          style={{
                            fontWeight: 900,
                            fontSize: '1.02rem',
                            color: isVerified ? '#047857' : isFailed ? '#dc2626' : '#0f172a',
                          }}
                        >
                          {formatINR(tx.amount)}
                        </span>
                        {tx.balanceAfter != null && (
                          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 1 }}>
                            Bal After: {formatINR(tx.balanceAfter)}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* 4. Status & Verification */}
                    <td>
                      <div>
                        {isVerified ? (
                          <span
                            className="desk-pill pill-emerald"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              padding: '4px 10px',
                              fontWeight: 800,
                              fontSize: '0.78rem',
                            }}
                          >
                            <CheckCircle2 size={13} />
                            Verified &amp; Settled
                          </span>
                        ) : isFailed ? (
                          <span
                            className="desk-pill pill-rose"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              padding: '4px 10px',
                              fontWeight: 800,
                              fontSize: '0.78rem',
                            }}
                          >
                            <AlertCircle size={13} />
                            Payment Declined
                          </span>
                        ) : isPending ? (
                          <span
                            className="desk-pill pill-amber"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              padding: '4px 10px',
                              fontWeight: 800,
                              fontSize: '0.78rem',
                            }}
                          >
                            <Clock size={13} />
                            Pending Capture
                          </span>
                        ) : (
                          <span
                            className="desk-pill"
                            style={{
                              background: '#f3e8ff',
                              color: '#6b21a8',
                              border: '1px solid #d8b4fe',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              padding: '4px 10px',
                              fontWeight: 800,
                              fontSize: '0.78rem',
                            }}
                          >
                            <RotateCcw size={13} />
                            Refunded
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 5. Purpose & Payment Method */}
                    <td>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '0.84rem', color: '#0f172a' }}>
                          {tx.typeLabel || 'Wallet Top-Up'}
                        </div>
                        <div
                          style={{
                            fontSize: '0.74rem',
                            color: '#475569',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            marginTop: 2,
                          }}
                        >
                          <CreditCard size={12} color="#64748b" />
                          <span>{tx.paymentMode || 'Razorpay Gateway'}</span>
                        </div>
                      </div>
                    </td>

                    {/* 6. Date & Time (IST) */}
                    <td>
                      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e293b' }}>
                        {formatIndianDateTime(tx.date, tx.createdAt || tx.createdAtRaw)}
                      </div>
                    </td>

                    {/* 7. Audit Notes / Failure Reason */}
                    <td>
                      <div
                        style={{
                          fontSize: '0.76rem',
                          color: isFailed ? '#991b1b' : '#64748b',
                          maxWidth: 220,
                          lineHeight: 1.35,
                        }}
                      >
                        {tx.failureReason || tx.description || 'Customer advertising ad wallet recharge'}
                      </div>
                    </td>

                    {/* 8. Actions */}
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {/* 360 Detail Inspector */}
                        <button
                          type="button"
                          className="desk-action-btn"
                          onClick={() => setSelectedTx(tx)}
                          title="View 360° transaction dossier"
                          style={{ padding: '5px 8px' }}
                        >
                          <Eye size={13} />
                        </button>

                        {/* View Official Tax Receipt for verified items */}
                        {isVerified && (
                          <button
                            type="button"
                            className="desk-action-btn"
                            onClick={() => setActiveReceipt(tx)}
                            title="Generate and print official tax receipt"
                            style={{ padding: '5px 8px', color: '#059669' }}
                          >
                            <Printer size={13} />
                          </button>
                        )}

                        {/* Quick Manual Assist for failed items */}
                        {isFailed && (
                          <button
                            type="button"
                            className="sales-btn-primary"
                            onClick={() => handleManualCredit(tx)}
                            title="Sales assisted credit recovery"
                            style={{
                              padding: '3px 8px',
                              fontSize: '0.72rem',
                              background: '#059669',
                              borderColor: '#059669',
                            }}
                          >
                            <Plus size={11} /> Top-Up
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 5. TRANSACTION 360° DOSSIER MODAL */}
      {selectedTx && (() => {
        const identity = resolveCustomerIdentity(selectedTx, customers);
        const isVerified = selectedTx.status === 'verified' || selectedTx.status === 'paid' || selectedTx.status === 'settled';
        const isFailed = selectedTx.status === 'failed';
        const cleanPhone = String(selectedTx.phone || '').replace(/\D/g, '').slice(-10);

        return (
          <div className="sales-modal-overlay" onClick={() => setSelectedTx(null)}>
            <div
              className="sales-modal-card"
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: 640, background: '#ffffff', border: '1px solid #cbd5e1', padding: 26 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e2e8f0', paddingBottom: 16, marginBottom: 18 }}>
                <div>
                  <span
                    className="desk-pill"
                    style={{
                      background: isVerified ? '#ecfdf5' : isFailed ? '#fee2e2' : '#fef3c7',
                      color: isVerified ? '#047857' : isFailed ? '#991b1b' : '#92400e',
                      border: `1px solid ${isVerified ? '#a7f3d0' : isFailed ? '#fca5a5' : '#fde68a'}`,
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      marginBottom: 6,
                    }}
                  >
                    {isVerified ? '✓ 100% VERIFIED & SETTLED' : isFailed ? '✗ FAILED TRANSACTION' : '⏳ PENDING CONFIRMATION'}
                  </span>
                  <h3 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: '#0f172a' }}>
                    {identity.displayName}
                  </h3>
                  <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: 2 }}>
                    Workspace: <code>{selectedTx.customerId || `cust_${cleanPhone}`}</code> • @{identity.username}
                  </div>
                </div>
                <button type="button" className="desk-close-btn" onClick={() => setSelectedTx(null)}>
                  <X size={18} />
                </button>
              </div>

              {/* Amount Highlight Banner */}
              <div
                style={{
                  background: isVerified ? '#f0fdf4' : isFailed ? '#fff5f5' : '#fffbeb',
                  border: `1px solid ${isVerified ? '#bbf7d0' : isFailed ? '#fecaca' : '#fde68a'}`,
                  borderRadius: 12,
                  padding: '16px 20px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 18,
                }}
              >
                <div>
                  <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 800, color: '#64748b' }}>
                    Transaction Amount
                  </div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 900, color: isVerified ? '#047857' : isFailed ? '#dc2626' : '#0f172a' }}>
                    {formatINR(selectedTx.amount)}
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 800, color: '#64748b' }}>
                    Payment Mode
                  </div>
                  <div style={{ fontSize: '0.94rem', fontWeight: 800, color: '#0f172a' }}>
                    {selectedTx.paymentMode || 'Razorpay Gateway'}
                  </div>
                </div>
              </div>

              {/* Detailed Breakdown Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
                <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.70rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>
                    Receipt Number
                  </div>
                  <div style={{ fontWeight: 800, fontSize: '0.90rem', color: '#0f172a', fontFamily: 'monospace', marginTop: 2 }}>
                    {selectedTx.receiptNo || selectedTx.receiptNumber || 'RCP-2026-1001'}
                  </div>
                </div>

                <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.70rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>
                    Reference / UTR / Order ID
                  </div>
                  <div style={{ fontWeight: 800, fontSize: '0.85rem', color: '#0f172a', fontFamily: 'monospace', marginTop: 2, wordBreak: 'break-all' }}>
                    {selectedTx.ref || selectedTx.id}
                  </div>
                </div>

                <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.70rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>
                    Authorized Contact
                  </div>
                  <div style={{ fontWeight: 800, fontSize: '0.90rem', color: '#0f172a', marginTop: 2 }}>
                    {identity.contactPerson}
                  </div>
                  <div style={{ fontSize: '0.80rem', color: '#059669', fontWeight: 700 }}>
                    +91 {cleanPhone}
                  </div>
                </div>

                <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.70rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>
                    Timestamp (IST)
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '0.84rem', color: '#0f172a', marginTop: 2 }}>
                    {formatIndianDateTime(selectedTx.date, selectedTx.createdAt || selectedTx.createdAtRaw)}
                  </div>
                </div>
              </div>

              {/* Notes / Reason Box */}
              <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10, border: '1px solid #e2e8f0', marginBottom: 18 }}>
                <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 800, color: '#64748b', marginBottom: 4 }}>
                  Audit Trail &amp; Transaction Notes
                </div>
                <div style={{ fontSize: '0.88rem', color: isFailed ? '#991b1b' : '#1e293b', fontWeight: 600 }}>
                  {selectedTx.failureReason || selectedTx.description || 'Customer advertising wallet recharge'}
                </div>
              </div>

              {/* Modal Footer Actions */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, borderTop: '1px solid #e2e8f0' }}>
                <button
                  type="button"
                  className="desk-action-btn"
                  onClick={() => handleCopy(JSON.stringify(selectedTx, null, 2), 'json')}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
                >
                  {copyFeedback === 'json' ? <Check size={14} color="#059669" /> : <Copy size={14} />}
                  <span>{copyFeedback === 'json' ? 'JSON Copied' : 'Copy Audit Payload'}</span>
                </button>

                <div style={{ display: 'flex', gap: 8 }}>
                  <a
                    href={`https://wa.me/91${cleanPhone}?text=Hello%20${encodeURIComponent(identity.contactPerson)},%20AdMafia%20Financial%20Ops%20regarding%20transaction%20${encodeURIComponent(selectedTx.ref || selectedTx.receiptNo || 'reference')}%20amount%20Rs.${selectedTx.amount}.`}
                    target="_blank"
                    rel="noreferrer"
                    className="desk-action-btn"
                    style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <MessageSquare size={14} color="#059669" />
                    <span>WhatsApp Client</span>
                  </a>

                  {isVerified && (
                    <button
                      type="button"
                      className="sales-btn-primary"
                      onClick={() => {
                        setActiveReceipt(selectedTx);
                        setSelectedTx(null);
                      }}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <Printer size={14} /> View Receipt
                    </button>
                  )}

                  {isFailed && (
                    <button
                      type="button"
                      className="sales-btn-primary"
                      onClick={() => {
                        handleManualCredit(selectedTx);
                        setSelectedTx(null);
                      }}
                      style={{ background: '#059669', borderColor: '#059669', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <Plus size={14} /> Assist Top-Up
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 6. OFFICIAL TAX RECEIPT MODAL */}
      {activeReceipt && (() => {
        const rcptIdentity = resolveCustomerIdentity(activeReceipt, customers);
        const cleanPhone = String(activeReceipt.phone || '').replace(/\D/g, '').slice(-10);

        return (
          <div className="sales-modal-overlay" onClick={() => setActiveReceipt(null)}>
            <div
              className="sales-modal-card"
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: 600, background: '#ffffff', border: '1px solid #cbd5e1', padding: 28 }}
            >
              {/* Receipt Header */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  borderBottom: '2px solid #0f172a',
                  paddingBottom: 16,
                  marginBottom: 18,
                }}
              >
                <div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0f172a' }}>
                    ADMAFIA MARKETING
                  </div>
                  <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: 2 }}>
                    Official Payment Acknowledgement &amp; Tax Receipt
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                    GSTIN: 24AAACA9928P1Z8 • SAC: 998311 (Digital Advertising)
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 800, fontFamily: 'monospace', fontSize: '0.94rem', color: '#0f172a' }}>
                    {activeReceipt.receiptNo || activeReceipt.receiptNumber || 'RCP-2026-1001'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    Date: {formatIndianDateTime(activeReceipt.date, activeReceipt.createdAt)}
                  </div>
                  <span
                    style={{
                      display: 'inline-block',
                      background: '#ecfdf5',
                      color: '#059669',
                      border: '1px solid #a7f3d0',
                      fontWeight: 800,
                      fontSize: '0.7rem',
                      padding: '2px 8px',
                      borderRadius: 9999,
                      marginTop: 4,
                    }}
                  >
                    PAID &amp; SETTLED
                  </span>
                </div>
              </div>

              {/* Billed To Details */}
              <div
                style={{
                  background: '#f8fafc',
                  padding: 14,
                  borderRadius: 10,
                  marginBottom: 18,
                  border: '1px solid #e2e8f0',
                }}
              >
                <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 800, color: '#64748b', marginBottom: 4 }}>
                  CUSTOMER / BILLED TO:
                </div>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
                  {rcptIdentity.displayName}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: 2 }}>
                  Attention: <b>{rcptIdentity.contactPerson}</b> • Phone: <b>+91 {cleanPhone}</b> • Location: {activeReceipt.city || 'India'}
                </div>
              </div>

              {/* Particulars Table */}
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
                    <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: '0.76rem', fontWeight: 800, color: '#334155' }}>
                      Particulars / Service Description
                    </th>
                    <th style={{ padding: '8px 10px', textAlign: 'center', fontSize: '0.76rem', fontWeight: 800, color: '#334155' }}>
                      SAC
                    </th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: '0.76rem', fontWeight: 800, color: '#334155' }}>
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px 10px', fontSize: '0.84rem' }}>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>
                        {activeReceipt.typeLabel || 'Meta & Google Ads Campaign Service'}
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                        {activeReceipt.description || 'Marketing Wallet Balance & Campaign Deployment'}
                      </div>
                    </td>
                    <td style={{ padding: '12px 10px', textAlign: 'center', fontSize: '0.8rem', fontFamily: 'monospace', color: '#64748b' }}>
                      998311
                    </td>
                    <td style={{ padding: '12px 10px', textAlign: 'right', fontWeight: 800, fontSize: '0.94rem', color: '#0f172a' }}>
                      {formatINR(activeReceipt.amount)}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Total Summary */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '14px 16px',
                  background: '#0f172a',
                  color: '#ffffff',
                  borderRadius: 10,
                  marginBottom: 20,
                }}
              >
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Payment Method &amp; Reference:</div>
                  <div style={{ fontSize: '0.84rem', fontWeight: 700 }}>
                    {activeReceipt.paymentMode} • UTR: {activeReceipt.ref}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>TOTAL SETTLED</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#10b981' }}>
                    {formatINR(activeReceipt.amount)}
                  </div>
                </div>
              </div>

              {/* Modal Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  className="sales-btn-secondary"
                  onClick={() => window.print()}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <Printer size={15} /> Print Receipt
                </button>
                <button
                  type="button"
                  className="sales-btn-primary"
                  onClick={() => setActiveReceipt(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

