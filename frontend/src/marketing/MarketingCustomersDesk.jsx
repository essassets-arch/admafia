import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Wallet,
  Search,
  RefreshCw,
  Eye,
  CreditCard,
  Building,
  Building2,
  CheckCircle2,
  Clock,
  ArrowUpDown,
  Filter,
  AlertCircle,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Phone,
  Mail,
  MapPin,
  Globe,
  Calendar,
  Sparkles,
  Shield,
  ShieldCheck,
  User,
  Layers,
  Tag,
  Copy,
  Check,
  Zap,
  Target,
} from 'lucide-react';
import Swal from 'sweetalert2';
import marketingApi from '../services/marketingApi';

const ALL_WEEK_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

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
  const [copiedField, setCopiedField] = useState(null);

  const copyToClipboard = (text, fieldName) => {
    if (!text) return;
    try {
      navigator.clipboard.writeText(String(text));
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (e) {
      console.warn('Clipboard copy error:', e);
    }
  };

  const formatISTDate = (dateVal) => {
    if (!dateVal) return 'Not Provided';
    try {
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return String(dateVal);
      return d.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch (e) {
      return String(dateVal);
    }
  };

  const handleViewCustomerDetails = async (cust) => {
    setSelectedCustomer(cust);
    try {
      const data = await marketingApi.getCustomerDetail(cust.id);
      if (data && data.ok && data.customer) {
        setSelectedCustomer((prev) => ({ ...(prev || {}), ...data.customer }));
      }
    } catch (err) {
      console.warn('[MarketingCustomersDesk] Error fetching customer details:', err);
    }
  };

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
                customers.map((c) => {
                  const dailySpend = c.dailyAdSpend || 300;
                  const isLowBal = c.availableBalance < dailySpend || c.availableBalance <= 0;
                  return (
                  <tr key={c.id}>
                    <td>
                      <div className="mkt-cell-primary">{c.name}</div>
                      <div className="mkt-cell-sub">ID: {c.customerId || c.id}</div>
                      {isLowBal && (
                        <div style={{ marginTop: '3px' }}>
                          <span
                            className="mkt-pill mkt-pill-rose"
                            style={{ fontSize: '0.66rem', fontWeight: 800, padding: '2px 6px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                          >
                            ⚠️ Low Balance
                          </span>
                        </div>
                      )}
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
                      <div className="mkt-badge-mono" style={{ color: !isLowBal ? '#059669' : '#dc2626' }}>
                        ₹{c.availableBalance.toLocaleString('en-IN')}
                      </div>
                      <div className="mkt-cell-sub">
                        Pacing: ₹{dailySpend}/day
                      </div>
                      {isLowBal && (
                        <div style={{ marginTop: '4px' }}>
                          <span
                            className="mkt-pill mkt-pill-rose"
                            style={{ fontSize: '0.66rem', fontWeight: 800, padding: '2px 6px' }}
                          >
                            {c.availableBalance <= 0 ? '⚠️ Zero Balance' : '⚠️ Balance is Low (Needs Top Up)'}
                          </span>
                        </div>
                      )}
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
                        <div>
                          <span className="mkt-pill mkt-pill-rose">Stopped</span>
                          {isLowBal && (
                            <div style={{ fontSize: '0.68rem', color: '#e11d48', fontWeight: 800, marginTop: '2px' }}>
                              ⚠️ Low Balance Paused
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>
                          <span className="mkt-pill mkt-pill-slate">No Campaign</span>
                          {isLowBal && (
                            <div style={{ fontSize: '0.68rem', color: '#e11d48', fontWeight: 800, marginTop: '2px' }}>
                              ⚠️ Low Balance
                            </div>
                          )}
                        </div>
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
                          onClick={() => handleViewCustomerDetails(c)}
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
                );
              })
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

      {/* 5. Customer Details Modal (Comprehensive 360° Profile & All Intake Fields) */}
      {selectedCustomer && (
        <div className="marketing-modal-backdrop" onClick={() => setSelectedCustomer(null)}>
          <div
            className="marketing-modal-box"
            style={{ maxWidth: '820px', width: '95%', maxHeight: '90vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="marketing-modal-header" style={{ padding: '16px 22px', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div
                  style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.25rem',
                    fontWeight: 800,
                    boxShadow: '0 4px 12px rgba(79, 70, 229, 0.25)',
                    flexShrink: 0,
                  }}
                >
                  {(selectedCustomer.name || selectedCustomer.companyName || 'C').charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>
                      {selectedCustomer.companyName || selectedCustomer.name}
                    </h3>
                    <span className="mkt-pill mkt-pill-green" style={{ fontSize: '0.72rem' }}>
                      ✓ 100% KYC Verified
                    </span>
                    <span
                      className="mkt-pill"
                      style={{
                        fontSize: '0.72rem',
                        background: selectedCustomer.profileStatus === 'complete' ? '#ecfdf5' : '#fef3c7',
                        color: selectedCustomer.profileStatus === 'complete' ? '#059669' : '#b45309',
                        borderColor: selectedCustomer.profileStatus === 'complete' ? '#a7f3d0' : '#fde68a',
                      }}
                    >
                      {selectedCustomer.profileStatus === 'complete' ? 'Profile Complete ✓' : 'Profile Incomplete'}
                    </span>
                    {selectedCustomer.paymentStatus === 'paid' && (
                      <span className="mkt-pill" style={{ background: '#ecfdf5', color: '#059669', borderColor: '#a7f3d0', fontSize: '0.72rem' }}>
                        Paid Customer
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px', fontSize: '0.78rem', color: '#64748b', flexWrap: 'wrap' }}>
                    <span>
                      Handle: <strong style={{ color: '#4f46e5' }}>@{selectedCustomer.username || 'user'}</strong>
                    </span>
                    <span>•</span>
                    <span>
                      Customer ID: <code style={{ fontFamily: 'monospace', color: '#334155' }}>{selectedCustomer.customerId || selectedCustomer.id}</code>
                    </span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(selectedCustomer.customerId || selectedCustomer.id, 'id')}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: copiedField === 'id' ? '#059669' : '#94a3b8', display: 'inline-flex', alignItems: 'center' }}
                      title="Copy Customer ID"
                    >
                      {copiedField === 'id' ? <Check size={13} style={{ color: '#059669' }} /> : <Copy size={13} />}
                    </button>
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="marketing-btn-close"
                onClick={() => setSelectedCustomer(null)}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="marketing-modal-body" style={{ padding: '20px 22px' }}>
              {/* Top Quick Highlights Banner */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                  gap: '12px',
                  marginBottom: '20px',
                  padding: '14px',
                  background: 'linear-gradient(to right, #f8fafc, #f1f5f9)',
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0',
                }}
              >
                <div>
                  <div className="mkt-form-help" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Wallet size={12} /> Available Wallet Balance
                  </div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#059669', fontFamily: 'monospace' }}>
                    ₹{(selectedCustomer.availableBalance || 0).toLocaleString('en-IN')}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>
                    {selectedCustomer.runwayDays || Math.floor((selectedCustomer.availableBalance || 0) / Math.max(selectedCustomer.dailyAdSpend || 300, 1))} Days Runway
                  </div>
                </div>

                <div>
                  <div className="mkt-form-help" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <CreditCard size={12} /> Daily Burn Rate
                  </div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', fontFamily: 'monospace' }}>
                    ₹{selectedCustomer.dailyAdSpend || 300}<span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>/day</span>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>
                    {(selectedCustomer.activeDays || []).length} of 7 Days Active
                  </div>
                </div>

                <div>
                  <div className="mkt-form-help" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Zap size={12} /> Marketing Campaign
                  </div>
                  <div style={{ marginTop: '3px' }}>
                    {selectedCustomer.campaignStatus === 'Running' ? (
                      <span className="mkt-pill mkt-pill-green">
                        <span className="marketing-live-dot" /> Live Active
                      </span>
                    ) : (
                      <span className="mkt-pill mkt-pill-slate">
                        {selectedCustomer.campaignStatus || 'Paused'}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '4px' }}>
                    {selectedCustomer.isDeductedToday ? '✓ Charged Today' : 'Not Charged Today'}
                  </div>
                </div>

                <div>
                  <div className="mkt-form-help" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Target size={12} /> Leads &amp; Creatives
                  </div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#4f46e5' }}>
                    {selectedCustomer.totalLeadsCount || 0} Leads
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>
                    {selectedCustomer.approvedPostsCount || 0} Approved • {selectedCustomer.ideasCount || 0} Ideas
                  </div>
                </div>
              </div>

              {/* Section 1: Business Profile & Intake (Information Filled by Customer) */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '16px',
                  marginBottom: '16px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                  <Building2 size={16} style={{ color: '#4f46e5' }} />
                  <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: '#0f172a' }}>
                    Company &amp; Business Intake Details
                  </h4>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                  <div>
                    <div className="mkt-form-help">Company Legal Name</div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>
                      {selectedCustomer.companyName || selectedCustomer.name}
                    </div>
                  </div>
                  <div>
                    <div className="mkt-form-help">Authorized Owner / Signatory</div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>
                      {selectedCustomer.contactPerson || selectedCustomer.owner || 'N/A'}
                    </div>
                  </div>
                  <div>
                    <div className="mkt-form-help">Business Category</div>
                    <span className="mkt-pill mkt-pill-slate">{selectedCustomer.category || 'IT & Software'}</span>
                  </div>
                  <div>
                    <div className="mkt-form-help">Industry / Target Niche</div>
                    <div style={{ fontWeight: 600, color: '#334155' }}>
                      {selectedCustomer.industry || 'General Business'}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: '14px', paddingTop: '10px', borderTop: '1px dashed #f1f5f9' }}>
                  <div className="mkt-form-help">Website / Landing Page</div>
                  {selectedCustomer.website ? (
                    <a
                      href={selectedCustomer.website.startsWith('http') ? selectedCustomer.website : `https://${selectedCustomer.website}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: '#4f46e5', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '5px', wordBreak: 'break-all' }}
                    >
                      <Globe size={13} />
                      {selectedCustomer.website} <ExternalLink size={12} />
                    </a>
                  ) : (
                    <span style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '0.85rem' }}>
                      Not Provided
                    </span>
                  )}
                </div>
              </div>

              {/* Section 2: Contact Information & Identity */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '16px',
                  marginBottom: '16px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                  <User size={16} style={{ color: '#059669' }} />
                  <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: '#0f172a' }}>
                    Primary Contact &amp; Account Identity
                  </h4>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                  <div>
                    <div className="mkt-form-help">Direct Mobile / WhatsApp</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <a
                        href={`tel:${selectedCustomer.phone}`}
                        style={{ fontWeight: 700, fontFamily: 'monospace', color: '#0f172a', textDecoration: 'none' }}
                      >
                        +91 {selectedCustomer.phone}
                      </a>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(selectedCustomer.phone, 'phone')}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: copiedField === 'phone' ? '#059669' : '#94a3b8' }}
                        title="Copy Phone Number"
                      >
                        {copiedField === 'phone' ? <Check size={13} style={{ color: '#059669' }} /> : <Copy size={13} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="mkt-form-help">Registered Work Email</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {selectedCustomer.email ? (
                        <>
                          <a
                            href={`mailto:${selectedCustomer.email}`}
                            style={{ fontWeight: 600, color: '#4f46e5', textDecoration: 'none', wordBreak: 'break-all' }}
                          >
                            {selectedCustomer.email}
                          </a>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(selectedCustomer.email, 'email')}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: copiedField === 'email' ? '#059669' : '#94a3b8' }}
                            title="Copy Work Email"
                          >
                            {copiedField === 'email' ? <Check size={13} style={{ color: '#059669' }} /> : <Copy size={13} />}
                          </button>
                        </>
                      ) : (
                        <span style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '0.85rem' }}>N/A</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="mkt-form-help">Personal / Alternate Email</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {selectedCustomer.personalEmail ? (
                        <>
                          <a
                            href={`mailto:${selectedCustomer.personalEmail}`}
                            style={{ fontWeight: 600, color: '#4f46e5', textDecoration: 'none', wordBreak: 'break-all' }}
                          >
                            {selectedCustomer.personalEmail}
                          </a>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(selectedCustomer.personalEmail, 'pemail')}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: copiedField === 'pemail' ? '#059669' : '#94a3b8' }}
                            title="Copy Personal Email"
                          >
                            {copiedField === 'pemail' ? <Check size={13} style={{ color: '#059669' }} /> : <Copy size={13} />}
                          </button>
                        </>
                      ) : (
                        <span style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '0.85rem' }}>Not Provided</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="mkt-form-help">Login Username</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 700, color: '#0f172a' }}>
                        @{selectedCustomer.username || 'user'}
                      </span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(selectedCustomer.username, 'username')}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: copiedField === 'username' ? '#059669' : '#94a3b8' }}
                        title="Copy Username"
                      >
                        {copiedField === 'username' ? <Check size={13} style={{ color: '#059669' }} /> : <Copy size={13} />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 3: Headquarters & Location Territory */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '16px',
                  marginBottom: '16px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                  <MapPin size={16} style={{ color: '#d97706' }} />
                  <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: '#0f172a' }}>
                    Headquarters &amp; Operating Territory
                  </h4>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
                  <div>
                    <div className="mkt-form-help">City / Territory</div>
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>
                      {selectedCustomer.city || 'Not Provided'}
                    </div>
                  </div>
                  <div>
                    <div className="mkt-form-help">State / Province</div>
                    <div style={{ fontWeight: 600, color: '#334155' }}>
                      {selectedCustomer.state || 'Maharashtra'}
                    </div>
                  </div>
                  <div>
                    <div className="mkt-form-help">Country</div>
                    <div style={{ fontWeight: 600, color: '#334155' }}>
                      {selectedCustomer.country || 'India'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 4: Marketing Campaign & Weekly Pacing Engine */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '16px',
                  marginBottom: '16px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                  <Calendar size={16} style={{ color: '#2563eb' }} />
                  <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: '#0f172a' }}>
                    Marketing Campaign &amp; Weekly Pacing Control
                  </h4>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                  <div>
                    <div className="mkt-form-help">Active Campaign Name</div>
                    <div style={{ fontWeight: 600, color: '#0f172a' }}>
                      {selectedCustomer.campaignName || 'No Active Campaign'}
                    </div>
                  </div>
                  <div>
                    <div className="mkt-form-help">Pacing Schedule Preset</div>
                    <span className="mkt-pill mkt-pill-slate" style={{ textTransform: 'capitalize' }}>
                      {selectedCustomer.schedulePreset === 'weekdays'
                        ? 'Mon - Fri (5 Days)'
                        : selectedCustomer.schedulePreset === 'all_days'
                        ? 'All 7 Days'
                        : selectedCustomer.schedulePreset === 'weekends'
                        ? 'Sat - Sun (Weekends)'
                        : selectedCustomer.schedulePreset || 'Custom'}
                    </span>
                  </div>
                  <div>
                    <div className="mkt-form-help">Daily Spend Pacing</div>
                    <div style={{ fontWeight: 800, color: '#059669', fontFamily: 'monospace' }}>
                      ₹{selectedCustomer.dailyAdSpend || 300}/day
                    </div>
                  </div>
                  <div>
                    <div className="mkt-form-help">Today&apos;s Deduction Status</div>
                    <div>
                      {selectedCustomer.isDeductedToday ? (
                        <span className="mkt-pill mkt-pill-green">✓ Charged &amp; Settled Today</span>
                      ) : (
                        <span className="mkt-pill mkt-pill-slate">Not Deducted Today</span>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: '14px', paddingTop: '10px', borderTop: '1px dashed #f1f5f9' }}>
                  <div className="mkt-form-help" style={{ marginBottom: '6px' }}>
                    Active Weekly Marketing Days ({(selectedCustomer.activeDays || []).length} of 7 Days Active)
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {ALL_WEEK_DAYS.map((day) => {
                      const isActive = (selectedCustomer.activeDays || []).includes(day);
                      return (
                        <span
                          key={day}
                          style={{
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            background: isActive ? '#ecfdf5' : '#f1f5f9',
                            color: isActive ? '#059669' : '#94a3b8',
                            border: isActive ? '1px solid #a7f3d0' : '1px solid #e2e8f0',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                          }}
                        >
                          {day} {isActive ? '✓' : ''}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Section 5: Registration & Onboarding Audit Trail */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '16px',
                  marginBottom: '16px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                  <ShieldCheck size={16} style={{ color: '#059669' }} />
                  <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: '#0f172a' }}>
                    Registration &amp; KYC Audit Trail
                  </h4>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                  <div>
                    <div className="mkt-form-help">Registration Source</div>
                    <div style={{ fontSize: '0.82rem', fontFamily: 'monospace', color: '#475569', wordBreak: 'break-all' }}>
                      {selectedCustomer.registeredFrom || 'https://admafia.marketing/#register'}
                    </div>
                  </div>
                  <div>
                    <div className="mkt-form-help">Registration Date &amp; Time</div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#0f172a' }}>
                      {formatISTDate(selectedCustomer.registeredAt)}
                    </div>
                  </div>
                  <div>
                    <div className="mkt-form-help">Profile Completion Timestamp</div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#0f172a' }}>
                      {selectedCustomer.completedAt ? formatISTDate(selectedCustomer.completedAt) : '100% KYC Verified'}
                    </div>
                  </div>
                  <div>
                    <div className="mkt-form-help">Total Lifetime Deposits</div>
                    <div style={{ fontWeight: 700, fontFamily: 'monospace', color: '#0f172a' }}>
                      ₹{(selectedCustomer.totalPaid || 0).toLocaleString('en-IN')}
                    </div>
                  </div>
                  <div>
                    <div className="mkt-form-help">Payment Settlement Status</div>
                    <div>
                      {selectedCustomer.paymentStatus === 'paid' ? (
                        <span className="mkt-pill mkt-pill-green">✓ Settled &amp; Verified</span>
                      ) : (
                        <span className="mkt-pill mkt-pill-amber">Pending Payment</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="mkt-form-help">Enrollment Method</div>
                    <span className="mkt-pill mkt-pill-slate">
                      {selectedCustomer.isSelfRegistered !== false ? 'Customer Self-Registered' : 'Admin Onboarded'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Section 6: Deliverables Summary */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '14px 16px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyItems: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '140px' }}>
                    <div className="mkt-form-help">Dispatched Leads</div>
                    <strong style={{ fontSize: '1rem', color: '#0f172a' }}>
                      {selectedCustomer.totalLeadsCount || 0} Leads
                    </strong>
                  </div>
                  <div style={{ flex: 1, minWidth: '140px' }}>
                    <div className="mkt-form-help">Marketing Ideas</div>
                    <strong style={{ fontSize: '1rem', color: '#4f46e5' }}>
                      {selectedCustomer.ideasCount || 0} Ideas
                    </strong>
                  </div>
                  <div style={{ flex: 1, minWidth: '140px' }}>
                    <div className="mkt-form-help">Approved Posts</div>
                    <strong style={{ fontSize: '1rem', color: '#059669' }}>
                      {selectedCustomer.approvedPostsCount || 0} Creatives
                    </strong>
                  </div>
                  <div style={{ flex: 1, minWidth: '140px' }}>
                    <div className="mkt-form-help">In Review / Draft</div>
                    <strong style={{ fontSize: '1rem', color: '#d97706' }}>
                      {(selectedCustomer.pendingPostsCount || 0) + (selectedCustomer.draftPostsCount || 0)} In Pipeline
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="marketing-modal-footer" style={{ padding: '14px 22px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <button
                type="button"
                className="mkt-btn-table-action primary"
                onClick={() => {
                  const cust = selectedCustomer;
                  setSelectedCustomer(null);
                  handleOpenWalletDrawer(cust);
                }}
                style={{ padding: '8px 14px', fontSize: '0.85rem' }}
              >
                <Wallet size={14} />
                <span>View Wallet Ledger</span>
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  className="marketing-btn-primary"
                  onClick={() => {
                    const cust = selectedCustomer;
                    setSelectedCustomer(null);
                    onNavigateToDesk && onNavigateToDesk('build_ideas', cust.id);
                  }}
                >
                  <Sparkles size={14} />
                  <span>+ Build Ideas for this Customer</span>
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

