import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Wallet,
  Search,
  RefreshCw,
  Eye,
  CreditCard,
  Building,
  CheckCircle2,
  Clock,
  ArrowUpDown,
  Filter,
  AlertCircle,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import Swal from 'sweetalert2';
import marketingApi from '../services/marketingApi';

export default function MarketingCustomersDesk({ onNavigateToDesk }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [summary, setSummary] = useState({ completedRegistrations: 0, totalAvailableBalance: 0 });
  const [lastRefresh, setLastRefresh] = useState(null);

  // Filters & Search
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const [campaignStatus, setCampaignStatus] = useState('all');
  const [walletMin, setWalletMin] = useState('');
  const [walletMax, setWalletMax] = useState('');
  const [sortBy, setSortBy] = useState('registered_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 15, totalPages: 1 });

  // Detail Modal & Wallet Drawer State
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [walletDrawerCustomer, setWalletDrawerCustomer] = useState(null);
  const [walletTransactions, setWalletTransactions] = useState([]);
  const [loadingWalletTx, setLoadingWalletTx] = useState(false);

  const fetchCustomers = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      const data = await marketingApi.getCustomers({
        q: search,
        category,
        status,
        campaignStatus,
        walletMin,
        walletMax,
        sortBy,
        sortOrder,
        page,
        limit: 15,
      });

      if (data && data.ok) {
        setCustomers(data.customers || []);
        setPagination(data.pagination || { total: 0, page: 1, limit: 15, totalPages: 1 });
        setSummary(data.aggregates || { completedRegistrations: 0, totalAvailableBalance: 0 });
        setLastRefresh(new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }));
      }
    } catch (err) {
      console.error('[MarketingCustomersDesk] Error:', err);
      Swal.fire({
        icon: 'error',
        title: 'Failed to load customers',
        text: err.message || 'Could not connect to marketing backend service.',
        confirmButtonColor: '#4f46e5',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search, category, status, campaignStatus, walletMin, walletMax, sortBy, sortOrder, page]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  // Open Wallet Drawer
  const handleOpenWalletDrawer = async (cust) => {
    setWalletDrawerCustomer(cust);
    setLoadingWalletTx(true);
    try {
      const data = await marketingApi.getCustomerWalletTransactions(cust.id);
      if (data && data.ok) {
        setWalletTransactions(data.transactions || []);
      }
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'Wallet Ledger Error',
        text: err.message || 'Could not load ledger transactions for this customer.',
      });
    } finally {
      setLoadingWalletTx(false);
    }
  };

  const handleResetFilters = () => {
    setSearch('');
    setCategory('all');
    setStatus('all');
    setCampaignStatus('all');
    setWalletMin('');
    setWalletMax('');
    setSortBy('registered_at');
    setSortOrder('desc');
    setPage(1);
  };

  return (
    <div className="marketing-customers-page">
      {/* 1. Header Bar */}
      <div className="marketing-page-header">
        <div className="marketing-header-title-col">
          <h1>Customer Registration &amp; Wallet Desk</h1>
          <p>
            Authoritative registry of verified customers with live marketing balances and active campaign status.
          </p>
        </div>
        <div className="marketing-header-actions">
          <button
            type="button"
            className="marketing-btn-refresh"
            onClick={() => fetchCustomers(true)}
            disabled={refreshing}
            title="Refresh from PostgreSQL Database"
          >
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
            <span>{refreshing ? 'Syncing...' : 'Live Refresh'}</span>
          </button>
          {lastRefresh && (
            <span className="marketing-clock-tag" title="Last successful sync time">
              IST: {lastRefresh}
            </span>
          )}
        </div>
      </div>

      {/* 2. Top Summary KPI Cards */}
      <div className="marketing-stats-grid">
        <div className="marketing-stat-card">
          <div className="marketing-stat-icon-wrap" style={{ background: '#eef2ff', color: '#4f46e5' }}>
            <Users size={24} />
          </div>
          <div className="marketing-stat-info">
            <span className="marketing-stat-label">Eligible Registrations</span>
            <span className="marketing-stat-value">{summary.completedRegistrations}</span>
            <span className="marketing-stat-sub">100% Verified Profiles</span>
          </div>
        </div>

        <div className="marketing-stat-card">
          <div className="marketing-stat-icon-wrap" style={{ background: '#ecfdf5', color: '#059669' }}>
            <Wallet size={24} />
          </div>
          <div className="marketing-stat-info">
            <span className="marketing-stat-label">Total Available Balance</span>
            <span className="marketing-stat-value">
              ₹{Number(summary.totalAvailableBalance).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </span>
            <span className="marketing-stat-sub">Authoritative Ad Ledger</span>
          </div>
        </div>

        <div className="marketing-stat-card">
          <div className="marketing-stat-icon-wrap" style={{ background: '#fffbeb', color: '#d97706' }}>
            <CheckCircle2 size={24} />
          </div>
          <div className="marketing-stat-info">
            <span className="marketing-stat-label">Active Deployments</span>
            <span className="marketing-stat-value">
              {customers.filter((c) => c.campaignStatus === 'Running').length}
            </span>
            <span className="marketing-stat-sub">Campaigns Pacing Today</span>
          </div>
        </div>
      </div>

      {/* 3. Search & Filter Controls */}
      <div className="marketing-controls-card">
        <div className="marketing-search-box">
          <Search size={16} className="marketing-search-icon" />
          <input
            type="text"
            className="marketing-search-input"
            placeholder="Search by customer, owner, phone, city..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <div className="marketing-filter-group">
          <select
            className="marketing-select"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">All Categories</option>
            <option value="IT & Software">IT &amp; Software</option>
            <option value="Real Estate & Infrastructure">Real Estate</option>
            <option value="Healthcare & Wellness">Healthcare</option>
            <option value="Manufacturing">Manufacturing</option>
            <option value="Retail & E-commerce">Retail</option>
            <option value="Other">Other</option>
          </select>

          <select
            className="marketing-select"
            value={campaignStatus}
            onChange={(e) => {
              setCampaignStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">All Campaign Statuses</option>
            <option value="Running">Running Only</option>
            <option value="Draft">Draft Only</option>
            <option value="Stopped">Stopped</option>
            <option value="None">No Campaign</option>
          </select>

          <select
            className="marketing-select"
            value={`${sortBy}:${sortOrder}`}
            onChange={(e) => {
              const [col, ord] = e.target.value.split(':');
              setSortBy(col);
              setSortOrder(ord);
              setPage(1);
            }}
          >
            <option value="registered_at:desc">Newest Registered</option>
            <option value="registered_at:asc">Oldest Registered</option>
            <option value="balance:desc">Highest Balance (₹)</option>
            <option value="balance:asc">Lowest Balance (₹)</option>
            <option value="name:asc">Name (A-Z)</option>
          </select>

          <button
            type="button"
            className="mkt-btn-table-action"
            onClick={handleResetFilters}
            title="Reset Filters"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* 4. Customer Table */}
      <div className="marketing-table-card">
        <div className="marketing-table-responsive">
          <table className="marketing-table">
            <thead>
              <tr>
                <th>Customer / Business Name</th>
                <th>Owner &amp; Contact</th>
                <th>Category &amp; City</th>
                <th>Available Balance</th>
                <th>Campaign Status</th>
                <th>Approved Posts</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '40px' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: '#64748b' }}>
                      <RefreshCw size={18} className="spin" />
                      <span>Loading customers from database...</span>
                    </div>
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '50px 20px', color: '#64748b' }}>
                    <div style={{ maxWidth: '320px', margin: '0 auto' }}>
                      <Building size={36} style={{ color: '#cbd5e1', marginBottom: '12px' }} />
                      <h4 style={{ margin: '0 0 6px 0', color: '#0f172a' }}>No completed customers found</h4>
                      <p style={{ fontSize: '0.84rem', margin: 0 }}>
                        No records match the current filters. Adjust your search or clear filters to view all verified registrations.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                customers.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="mkt-cell-primary">{c.name}</div>
                      <div className="mkt-cell-sub">ID: {c.customerId || c.id}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{c.owner || c.contactPerson || 'Business Owner'}</div>
                      <div className="mkt-cell-sub">
                        <a href={`tel:${c.phone}`} style={{ color: '#4f46e5', textDecoration: 'none' }}>
                          +91 {c.phone}
                        </a>
                      </div>
                    </td>
                    <td>
                      <div>
                        <span className="mkt-pill mkt-pill-slate">{c.category}</span>
                      </div>
                      <div className="mkt-cell-sub">{c.city || 'India'}</div>
                    </td>
                    <td>
                      <div className="mkt-badge-mono" style={{ color: c.availableBalance > 0 ? '#059669' : '#dc2626' }}>
                        ₹{c.availableBalance.toLocaleString('en-IN')}
                      </div>
                      <div className="mkt-cell-sub">
                        Pacing: ₹{c.dailyAdSpend}/day
                      </div>
                    </td>
                    <td>
                      {c.campaignStatus === 'Running' ? (
                        <span className="mkt-pill mkt-pill-green">
                          <span className="marketing-live-dot" />
                          Running
                        </span>
                      ) : c.campaignStatus === 'Draft' ? (
                        <span className="mkt-pill mkt-pill-amber">Draft Configured</span>
                      ) : c.campaignStatus === 'Stopped' ? (
                        <span className="mkt-pill mkt-pill-rose">Stopped</span>
                      ) : (
                        <span className="mkt-pill mkt-pill-slate">No Campaign</span>
                      )}
                    </td>
                    <td>
                      <span
                        className="mkt-pill"
                        style={{
                          background: c.approvedPostsCount > 0 ? '#eff6ff' : '#f8fafc',
                          color: c.approvedPostsCount > 0 ? '#2563eb' : '#94a3b8',
                          borderColor: c.approvedPostsCount > 0 ? '#bfdbfe' : '#e2e8f0',
                        }}
                      >
                        {c.approvedPostsCount} Approved
                      </span>
                    </td>
                    <td>
                      <div className="mkt-actions-flex">
                        <button
                          type="button"
                          className="mkt-btn-table-action"
                          onClick={() => setSelectedCustomer(c)}
                          title="View Business Profile & Details"
                        >
                          <Eye size={13} />
                          <span>Details</span>
                        </button>
                        <button
                          type="button"
                          className="mkt-btn-table-action primary"
                          onClick={() => handleOpenWalletDrawer(c)}
                          title="View Wallet Ledger Transactions"
                        >
                          <Wallet size={13} />
                          <span>Ledger</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="marketing-pagination">
          <div>
            Showing <strong>{customers.length}</strong> of <strong>{pagination.total}</strong> customers
          </div>
          <div className="marketing-page-btn-group">
            <button
              type="button"
              className="marketing-page-btn"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft size={14} style={{ verticalAlign: 'middle' }} /> Prev
            </button>
            <span style={{ padding: '0 8px', fontWeight: 600 }}>
              Page {pagination.page} / {Math.max(1, pagination.totalPages)}
            </span>
            <button
              type="button"
              className="marketing-page-btn"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next <ChevronRight size={14} style={{ verticalAlign: 'middle' }} />
            </button>
          </div>
        </div>
      </div>

      {/* 5. Customer Details Modal */}
      {selectedCustomer && (
        <div className="marketing-modal-backdrop" onClick={() => setSelectedCustomer(null)}>
          <div className="marketing-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="marketing-modal-header">
              <h3>Customer Profile: {selectedCustomer.name}</h3>
              <button
                type="button"
                className="marketing-btn-close"
                onClick={() => setSelectedCustomer(null)}
              >
                ✕
              </button>
            </div>
            <div className="marketing-modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                <div>
                  <div className="mkt-form-help">Company Name</div>
                  <div style={{ fontWeight: 700, fontSize: '1rem' }}>{selectedCustomer.name}</div>
                </div>
                <div>
                  <div className="mkt-form-help">Authorized Owner</div>
                  <div style={{ fontWeight: 700, fontSize: '1rem' }}>{selectedCustomer.owner || 'N/A'}</div>
                </div>
                <div>
                  <div className="mkt-form-help">Mobile Phone</div>
                  <div style={{ fontWeight: 700, fontFamily: 'monospace' }}>+91 {selectedCustomer.phone}</div>
                </div>
                <div>
                  <div className="mkt-form-help">Work Email</div>
                  <div style={{ fontWeight: 600 }}>{selectedCustomer.email || 'N/A'}</div>
                </div>
                <div>
                  <div className="mkt-form-help">Business Category</div>
                  <span className="mkt-pill mkt-pill-slate">{selectedCustomer.category}</span>
                </div>
                <div>
                  <div className="mkt-form-help">City / Territory</div>
                  <div style={{ fontWeight: 600 }}>{selectedCustomer.city || 'India'}</div>
                </div>
                <div>
                  <div className="mkt-form-help">Available Wallet Balance</div>
                  <div style={{ fontWeight: 800, color: '#059669', fontSize: '1.2rem', fontFamily: 'monospace' }}>
                    ₹{selectedCustomer.availableBalance.toLocaleString('en-IN')}
                  </div>
                </div>
                <div>
                  <div className="mkt-form-help">Registration Status</div>
                  <span className="mkt-pill mkt-pill-green">100% KYC Verified ✓</span>
                </div>
              </div>

              {selectedCustomer.website && (
                <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
                  <div className="mkt-form-help">Website / Landing Page</div>
                  <a
                    href={selectedCustomer.website.startsWith('http') ? selectedCustomer.website : `https://${selectedCustomer.website}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: '#4f46e5', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    {selectedCustomer.website} <ExternalLink size={13} />
                  </a>
                </div>
              )}
            </div>
            <div className="marketing-modal-footer">
              <button
                type="button"
                className="marketing-btn-primary"
                onClick={() => {
                  const cust = selectedCustomer;
                  setSelectedCustomer(null);
                  onNavigateToDesk && onNavigateToDesk('build_ideas', cust.id);
                }}
              >
                + Build Ideas for this Customer
              </button>
              <button
                type="button"
                className="mkt-btn-table-action"
                onClick={() => setSelectedCustomer(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Wallet Ledger Transactions Drawer */}
      {walletDrawerCustomer && (
        <div className="marketing-modal-backdrop" onClick={() => setWalletDrawerCustomer(null)}>
          <div className="marketing-modal-box" style={{ maxWidth: '780px' }} onClick={(e) => e.stopPropagation()}>
            <div className="marketing-modal-header">
              <div>
                <h3 style={{ margin: 0 }}>Wallet Transactions Ledger</h3>
                <div className="mkt-cell-sub">
                  Customer: <strong>{walletDrawerCustomer.name}</strong> (+91 {walletDrawerCustomer.phone})
                </div>
              </div>
              <button
                type="button"
                className="marketing-btn-close"
                onClick={() => setWalletDrawerCustomer(null)}
              >
                ✕
              </button>
            </div>
            <div className="marketing-modal-body" style={{ padding: '16px 24px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  marginBottom: '16px',
                }}
              >
                <div>
                  <div className="mkt-form-help">Current Available Ad Balance</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#059669', fontFamily: 'monospace' }}>
                    ₹{walletDrawerCustomer.availableBalance.toLocaleString('en-IN')}
                  </div>
                </div>
                <div>
                  <div className="mkt-form-help">Daily Budget Pacing</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>
                    ₹{walletDrawerCustomer.dailyAdSpend}/day
                  </div>
                </div>
              </div>

              <h4 style={{ margin: '14px 0 10px 0', fontSize: '0.95rem' }}>Authoritative Transaction History</h4>
              {loadingWalletTx ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                  <RefreshCw size={18} className="spin" /> Loading ledger records...
                </div>
              ) : walletTransactions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                  No transaction history recorded yet for this customer.
                </div>
              ) : (
                <div style={{ maxHeight: '340px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                  <table className="marketing-table" style={{ fontSize: '0.84rem' }}>
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Amount</th>
                        <th>Balance After</th>
                        <th>UTR / Reference</th>
                        <th>Description</th>
                        <th>Date &amp; Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {walletTransactions.map((tx) => (
                        <tr key={tx.id}>
                          <td>
                            <span className={`mkt-pill ${tx.type === 'Credit' ? 'mkt-pill-green' : 'mkt-pill-amber'}`}>
                              {tx.type}
                            </span>
                          </td>
                          <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>
                            {tx.type === 'Credit' ? '+' : '-'}₹{tx.amount.toLocaleString('en-IN')}
                          </td>
                          <td style={{ fontFamily: 'monospace' }}>
                            ₹{tx.balanceAfter.toLocaleString('en-IN')}
                          </td>
                          <td style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{tx.utr}</td>
                          <td>{tx.description}</td>
                          <td style={{ whiteSpace: 'nowrap', fontSize: '0.78rem' }}>
                            {new Date(tx.createdAt).toLocaleString('en-IN', {
                              timeZone: 'Asia/Kolkata',
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: true,
                            })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="marketing-modal-footer">
              <button
                type="button"
                className="marketing-btn-primary"
                onClick={() => setWalletDrawerCustomer(null)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

