import React, { useState, useEffect, useCallback } from 'react';
import {
  Wallet,
  TrendingUp,
  Download,
  Search,
  Filter,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  FileSpreadsheet,
  Building2,
  Calendar,
  X,
  CreditCard,
} from 'lucide-react';
import superadminApi from '../services/superadminApi';

export default function SuperAdminFinanceDesk() {
  const [activeTab, setActiveTab] = useState('ledger'); // 'ledger' or 'accounts'
  const [summary, setSummary] = useState({
    totalWalletLiability: 0,
    totalLifetimePaid: 0,
    totalCampaignSpent: 0,
    totalCredited: 0,
    totalDebited: 0,
    totalTxCount: 0,
  });

  // Global Ledger State
  const [transactions, setTransactions] = useState([]);
  const [txLoading, setTxLoading] = useState(true);
  const [txSearch, setTxSearch] = useState('');
  const [txTypeFilter, setTxTypeFilter] = useState('all');
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });

  // Accounts Overview State
  const [accounts, setAccounts] = useState([]);
  const [accLoading, setAccLoading] = useState(false);
  const [accSearch, setAccSearch] = useState('');

  // Isolated Customer Ledger Modal
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerLedger, setCustomerLedger] = useState([]);
  const [loadingCustomerLedger, setLoadingCustomerLedger] = useState(false);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await superadminApi.getFinanceSummary();
      if (res && res.ok) {
        setSummary(res.summary || {});
      }
    } catch (err) {
      console.error('Failed to load finance summary:', err);
    }
  }, []);

  const fetchTransactions = useCallback(async () => {
    try {
      setTxLoading(true);
      const res = await superadminApi.getTransactions({
        txType: txTypeFilter,
        search: txSearch,
        page: pagination.page,
        limit: 25,
      });
      if (res && res.ok) {
        setTransactions(res.transactions || []);
        if (res.pagination) setPagination(res.pagination);
      }
    } catch (err) {
      console.error('Failed to load transactions:', err);
    } finally {
      setTxLoading(false);
    }
  }, [txTypeFilter, txSearch, pagination.page]);

  const fetchAccounts = useCallback(async () => {
    try {
      setAccLoading(true);
      const res = await superadminApi.getFinanceAccounts({
        search: accSearch,
        page: 1,
        limit: 50,
      });
      if (res && res.ok) {
        setAccounts(res.accounts || []);
      }
    } catch (err) {
      console.error('Failed to load financial accounts:', err);
    } finally {
      setAccLoading(false);
    }
  }, [accSearch]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    if (activeTab === 'ledger') {
      fetchTransactions();
    } else {
      fetchAccounts();
    }
  }, [activeTab, fetchTransactions, fetchAccounts]);

  // Open Isolated Customer Ledger Modal
  const handleOpenCustomerLedger = async (customer) => {
    setSelectedCustomer(customer);
    setLoadingCustomerLedger(true);
    try {
      const res = await superadminApi.getAccountLedger(customer.id);
      if (res && res.ok) {
        setCustomerLedger(res.transactions || []);
      }
    } catch (err) {
      console.error('Failed to load customer ledger:', err);
    } finally {
      setLoadingCustomerLedger(false);
    }
  };

  const handleExportCSV = () => {
    window.open(superadminApi.getExportUrl(), '_blank');
  };

  return (
    <div>
      {/* 1. Page Header */}
      <div className="sa-page-header">
        <div>
          <h1>Manage Finance &amp; Ledger</h1>
          <p>
            Authoritative financial control for AdMafia. Inspect account-wise balances, trace every credit and debit in the PostgreSQL transaction ledger, and export financial audit reports.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            className="sa-btn-primary"
            onClick={handleExportCSV}
            title="Export CSV Transaction Ledger"
          >
            <Download size={14} />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            className="sa-btn-secondary"
            onClick={() => {
              fetchSummary();
              if (activeTab === 'ledger') fetchTransactions();
              else fetchAccounts();
            }}
          >
            <RefreshCw size={14} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* 2. Financial Metrics Cards */}
      <div className="sa-stats-grid">
        <div className="sa-stat-card">
          <div className="sa-stat-top">
            <span className="sa-stat-title">Total Wallet Liability</span>
            <div className="sa-stat-icon-wrap" style={{ background: '#fef3c7', color: '#d97706' }}>
              <Wallet size={18} />
            </div>
          </div>
          <div className="sa-stat-val" style={{ color: '#d97706' }}>
            ₹{Number(summary.totalWalletLiability || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="sa-stat-sub">Authoritative available balances</div>
        </div>

        <div className="sa-stat-card">
          <div className="sa-stat-top">
            <span className="sa-stat-title">Total Lifetime Deposited</span>
            <div className="sa-stat-icon-wrap" style={{ background: '#ecfdf5', color: '#059669' }}>
              <ArrowUpRight size={18} />
            </div>
          </div>
          <div className="sa-stat-val" style={{ color: '#059669' }}>
            ₹{Number(summary.totalLifetimePaid || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="sa-stat-sub">Cumulative customer payments</div>
        </div>

        <div className="sa-stat-card">
          <div className="sa-stat-top">
            <span className="sa-stat-title">Campaign Ad Spend</span>
            <div className="sa-stat-icon-wrap" style={{ background: '#eef2ff', color: '#4f46e5' }}>
              <TrendingUp size={18} />
            </div>
          </div>
          <div className="sa-stat-val" style={{ color: '#4f46e5' }}>
            ₹{Number(summary.totalCampaignSpent || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="sa-stat-sub">Total ad budget delivered</div>
        </div>

        <div className="sa-stat-card">
          <div className="sa-stat-top">
            <span className="sa-stat-title">Total Transactions</span>
            <div className="sa-stat-icon-wrap" style={{ background: '#f1f5f9', color: '#475569' }}>
              <FileSpreadsheet size={18} />
            </div>
          </div>
          <div className="sa-stat-val">
            {summary.totalTxCount}
          </div>
          <div className="sa-stat-sub">
            Credits: ₹{Number(summary.totalCredited || 0).toFixed(0)} • Debits: ₹{Number(summary.totalDebited || 0).toFixed(0)}
          </div>
        </div>
      </div>

      {/* 3. Tab Navigation */}
      <div className="sa-tabs-bar">
        <button
          type="button"
          className={`sa-tab-btn ${activeTab === 'ledger' ? 'active' : ''}`}
          onClick={() => setActiveTab('ledger')}
        >
          Transaction Ledger
        </button>
        <button
          type="button"
          className={`sa-tab-btn ${activeTab === 'accounts' ? 'active' : ''}`}
          onClick={() => setActiveTab('accounts')}
        >
          Account Wallets &amp; Balances
        </button>
      </div>

      {/* 4A. TAB 1: Global Transaction Ledger */}
      {activeTab === 'ledger' && (
        <div>
          <div className="sa-controls-card">
            <div className="sa-search-box">
              <Search size={16} className="sa-search-icon" />
              <input
                type="text"
                className="sa-search-input"
                placeholder="Search by company name, UTR reference, description..."
                value={txSearch}
                onChange={(e) => setTxSearch(e.target.value)}
              />
            </div>

            <div className="sa-filter-group">
              <select
                className="sa-select"
                value={txTypeFilter}
                onChange={(e) => setTxTypeFilter(e.target.value)}
              >
                <option value="all">All Transaction Types</option>
                <option value="Credit">Credits Only (+)</option>
                <option value="Debit">Debits Only (-)</option>
              </select>
            </div>
          </div>

          <div className="sa-table-card">
            <div style={{ overflowX: 'auto' }}>
              <table className="sa-table">
                <thead>
                  <tr>
                    <th>Tx ID &amp; Date</th>
                    <th>Business Account</th>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Balance After</th>
                    <th>Reference UTR</th>
                    <th>Payment Mode &amp; Description</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {txLoading ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
                        <RefreshCw size={20} className="spin" style={{ margin: '0 auto 8px' }} />
                        <div>Loading ledger transactions...</div>
                      </td>
                    </tr>
                  ) : transactions.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>
                        No transactions found in this view.
                      </td>
                    </tr>
                  ) : (
                    transactions.map((tx) => (
                      <tr key={tx.id}>
                        <td>
                          <span style={{ fontFamily: 'monospace', fontSize: '0.80rem', fontWeight: 700, color: '#4f46e5' }}>
                            {tx.id}
                          </span>
                          <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: 2 }}>
                            {new Date(tx.created_at).toLocaleString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: true,
                            })}
                          </div>
                        </td>

                        <td>
                          <strong style={{ color: '#0f172a' }}>{tx.company_name}</strong>
                          <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                            ID: <span style={{ fontFamily: 'monospace' }}>{tx.customer_id}</span>
                          </div>
                        </td>

                        <td>
                          <span
                            className={`sa-pill ${
                              tx.tx_type === 'Credit' ? 'sa-pill-green' : 'sa-pill-amber'
                            }`}
                          >
                            {tx.tx_type === 'Credit' ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                            {tx.tx_type}
                          </span>
                        </td>

                        <td style={{ fontWeight: 800, fontSize: '0.92rem', color: tx.tx_type === 'Credit' ? '#059669' : '#0f172a' }}>
                          {tx.tx_type === 'Credit' ? '+' : '-'}₹{Number(tx.amount).toFixed(2)}
                        </td>

                        <td style={{ fontWeight: 700, color: '#334155' }}>
                          ₹{Number(tx.balance_after).toFixed(2)}
                        </td>

                        <td>
                          <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', background: '#f1f5f9', padding: '3px 6px', borderRadius: 4 }}>
                            {tx.reference_utr}
                          </span>
                        </td>

                        <td style={{ maxWidth: 220 }}>
                          <div style={{ fontSize: '0.80rem', fontWeight: 600, color: '#0f172a' }}>
                            {tx.payment_method}
                          </div>
                          <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {tx.description}
                          </div>
                        </td>

                        <td>
                          <span className="sa-pill sa-pill-green" style={{ fontSize: '0.68rem' }}>
                            {tx.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 4B. TAB 2: Accounts & Balances */}
      {activeTab === 'accounts' && (
        <div>
          <div className="sa-controls-card">
            <div className="sa-search-box">
              <Search size={16} className="sa-search-icon" />
              <input
                type="text"
                className="sa-search-input"
                placeholder="Search business name, phone, customer ID..."
                value={accSearch}
                onChange={(e) => setAccSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="sa-table-card">
            <div style={{ overflowX: 'auto' }}>
              <table className="sa-table">
                <thead>
                  <tr>
                    <th>Business</th>
                    <th>Contact &amp; Location</th>
                    <th>Wallet Balance</th>
                    <th>Total Lifetime Paid</th>
                    <th>Total Ad Spent</th>
                    <th>Daily Spend Pacing</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {accLoading ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
                        <RefreshCw size={20} className="spin" style={{ margin: '0 auto 8px' }} />
                        <div>Loading accounts...</div>
                      </td>
                    </tr>
                  ) : accounts.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>
                        No business accounts found.
                      </td>
                    </tr>
                  ) : (
                    accounts.map((acc) => (
                      <tr key={acc.id}>
                        <td>
                          <strong style={{ color: '#0f172a' }}>{acc.company_name}</strong>
                          <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                            ID: <span style={{ fontFamily: 'monospace' }}>{acc.id}</span>
                          </div>
                        </td>

                        <td>
                          <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>{acc.contact_person}</div>
                          <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                            📞 {acc.phone} • {acc.city || 'India'}
                          </div>
                        </td>

                        <td>
                          <div style={{ fontSize: '1rem', fontWeight: 800, color: Number(acc.available_balance) > 0 ? '#059669' : '#dc2626' }}>
                            ₹{Number(acc.available_balance || 0).toFixed(2)}
                          </div>
                        </td>

                        <td style={{ fontWeight: 700, color: '#334155' }}>
                          ₹{Number(acc.total_lifetime_paid || 0).toFixed(2)}
                        </td>

                        <td style={{ fontWeight: 700, color: '#4f46e5' }}>
                          ₹{Number(acc.total_ad_spent || 0).toFixed(2)}
                        </td>

                        <td>
                          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a' }}>
                            ₹{Number(acc.daily_ad_spend || 300).toFixed(2)}/day
                          </div>
                          <span
                            className={`sa-pill ${
                              acc.ad_campaign_active ? 'sa-pill-green' : 'sa-pill-slate'
                            }`}
                            style={{ fontSize: '0.66rem', marginTop: 3 }}
                          >
                            {acc.ad_campaign_active ? 'Campaign Pacing Active' : 'Campaign Paused'}
                          </span>
                        </td>

                        <td>
                          <span
                            className={`sa-pill ${
                              acc.status === 'active' ? 'sa-pill-green' : 'sa-pill-rose'
                            }`}
                          >
                            {acc.status}
                          </span>
                        </td>

                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className="sa-btn-secondary"
                            style={{ padding: '5px 12px', fontSize: '0.78rem' }}
                            onClick={() => handleOpenCustomerLedger(acc)}
                          >
                            <FileSpreadsheet size={13} />
                            <span>Ledger</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 5. Isolated Customer Ledger Modal */}
      {selectedCustomer && (
        <div className="sa-modal-backdrop" onClick={() => setSelectedCustomer(null)}>
          <div className="sa-modal-card" style={{ maxWidth: 840 }} onClick={(e) => e.stopPropagation()}>
            <div className="sa-modal-header">
              <div>
                <span className="sa-pill sa-pill-indigo">Customer Wallet Ledger</span>
                <h3 style={{ margin: '4px 0 2px 0', fontSize: '1.15rem', fontWeight: 800 }}>
                  {selectedCustomer.company_name}
                </h3>
                <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                  Contact: {selectedCustomer.contact_person} • {selectedCustomer.phone} • ID: {selectedCustomer.id}
                </div>
              </div>
              <button
                type="button"
                className="sa-footer-btn"
                style={{ width: 'auto', padding: 6, borderRadius: '50%' }}
                onClick={() => setSelectedCustomer(null)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="sa-modal-body">
              {loadingCustomerLedger ? (
                <div style={{ textAlign: 'center', padding: 36, color: '#64748b' }}>
                  <RefreshCw size={20} className="spin" style={{ margin: '0 auto 8px' }} />
                  <div>Loading account ledger...</div>
                </div>
              ) : customerLedger.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 36, color: '#94a3b8' }}>
                  No transaction history recorded for this customer yet.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="sa-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Amount</th>
                        <th>Balance After</th>
                        <th>UTR Ref</th>
                        <th>Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customerLedger.map((tx) => (
                        <tr key={tx.id}>
                          <td style={{ fontSize: '0.76rem', color: '#64748b', whiteSpace: 'nowrap' }}>
                            {new Date(tx.created_at).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </td>
                          <td>
                            <span
                              className={`sa-pill ${
                                tx.tx_type === 'Credit' ? 'sa-pill-green' : 'sa-pill-amber'
                              }`}
                            >
                              {tx.tx_type}
                            </span>
                          </td>
                          <td style={{ fontWeight: 800, color: tx.tx_type === 'Credit' ? '#059669' : '#0f172a' }}>
                            {tx.tx_type === 'Credit' ? '+' : '-'}₹{Number(tx.amount).toFixed(2)}
                          </td>
                          <td style={{ fontWeight: 700 }}>
                            ₹{Number(tx.balance_after).toFixed(2)}
                          </td>
                          <td style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>
                            {tx.reference_utr}
                          </td>
                          <td style={{ fontSize: '0.78rem', color: '#334155' }}>
                            {tx.description}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="sa-modal-footer">
              <button
                type="button"
                className="sa-btn-secondary"
                onClick={() => setSelectedCustomer(null)}
              >
                Close Ledger
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
