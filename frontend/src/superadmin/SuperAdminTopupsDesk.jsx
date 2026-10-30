import React, { useState, useEffect, useCallback } from 'react';
import {
  CreditCard,
  Search,
  RefreshCw,
  CheckCircle2,
  XCircle,
  PlusCircle,
  X,
  FileCheck2,
  ArrowUpRight,
  ShieldCheck,
  Building2,
  Users,
  Wallet,
  Zap,
  Sparkles,
  ExternalLink,
  Check,
  Copy,
  Clock,
  ArrowRight,
} from 'lucide-react';
import Swal from 'sweetalert2';
import superadminApi from '../services/superadminApi';
import crmApi from '../services/crmApi';

const TOPUP_PRESETS = [
  { amount: 600, label: '₹600', runway: '+2 Days Runtime', subtitle: 'Starter Trial' },
  { amount: 1500, label: '₹1,500', runway: '+5 Days Runtime', subtitle: 'Standard Boost' },
  { amount: 3000, label: '₹3,000', runway: '+10 Days Runtime', subtitle: 'Most Popular' },
  { amount: 4500, label: '₹4,500', runway: '+15 Days Runtime', subtitle: 'Mid-Month Plan' },
  { amount: 9000, label: '₹9,000', runway: '+30 Days Runtime', subtitle: '1 Month Full' },
  { amount: 18000, label: '₹18,000', runway: '+60 Days Runtime', subtitle: '2 Months Scale' },
];

export default function SuperAdminTopupsDesk() {
  const [activeTab, setActiveTab] = useState('customers'); // 'customers' | 'requests' | 'history'

  // Top-Up Requests Queue
  const [topups, setTopups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });

  // Registered Customers List
  const [customers, setCustomers] = useState([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');

  // Rejection Modal
  const [rejectingTopup, setRejectingTopup] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [submittingReject, setSubmittingReject] = useState(false);

  // Manual Credit Modal
  const [showManualModal, setShowManualModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [manualForm, setManualForm] = useState({
    customerId: '',
    amount: '',
    referenceUtr: '',
    paymentMethod: 'Bank NEFT / RTGS Transfer',
    description: 'Super Admin Authorized Deposit',
  });
  const [submittingManual, setSubmittingManual] = useState(false);

  // Fetch Top-Up Requests Queue
  const fetchTopups = useCallback(async () => {
    try {
      setRefreshing(true);
      const res = await superadminApi.getTopups({
        status: statusFilter,
        search,
        page: pagination.page,
        limit: 25,
      });
      if (res && res.ok) {
        setTopups(res.topups || []);
        if (res.pagination) setPagination(res.pagination);
      }
    } catch (err) {
      console.error('Failed to load topups:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, search, pagination.page]);

  // Fetch All Registered Businesses
  const fetchCustomers = useCallback(async () => {
    try {
      setCustomersLoading(true);
      const res = await superadminApi.getAccounts({
        type: 'business',
        status: 'all',
        limit: 100,
      });
      if (res && res.ok) {
        setCustomers(res.accounts || []);
      }
    } catch (err) {
      console.error('Failed to load customers for top-up desk:', err);
    } finally {
      setCustomersLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTopups();
    fetchCustomers();
  }, [fetchTopups, fetchCustomers]);

  // Launch Customer Dashboard helper
  const handleLaunchDashboard = async (target) => {
    try {
      const custId = target.customer_id || target.customerId || target.id || target.phone;
      if (!custId) {
        window.open('/portal', '_blank');
        return;
      }
      const res = await crmApi.getCustomerWorkspace(custId).catch(() => null);
      if (res?.customer) {
        localStorage.setItem('growthline_active_user', JSON.stringify(res.customer));
        window.open('/app/lead#app/dashboard', '_blank');
        Swal.fire({
          icon: 'success',
          title: 'Customer Dashboard Launched 🚀',
          html: `Logged into workspace for <strong>${res.customer.companyName || res.customer.name}</strong>.`,
          timer: 1600,
          showConfirmButton: false,
        });
      } else {
        window.open('/portal', '_blank');
      }
    } catch (err) {
      window.open('/portal', '_blank');
    }
  };

  // Open Top-Up Modal for specific customer
  const handleOpenTopupForCustomer = (cust) => {
    const defaultUtr = `TOP_${Date.now().toString().slice(-6)}_${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
    setSelectedCustomer(cust);
    setManualForm({
      customerId: cust.id,
      amount: '3000',
      referenceUtr: defaultUtr,
      paymentMethod: 'Bank NEFT / RTGS Transfer',
      description: `Authorized wallet top-up for ${cust.company_name || 'Customer'}`,
    });
    setShowManualModal(true);
  };

  // Open Top-Up Modal generic
  const handleOpenGenericTopup = () => {
    const defaultUtr = `TOP_${Date.now().toString().slice(-6)}_${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
    const firstCust = customers[0] || null;
    setSelectedCustomer(firstCust);
    setManualForm({
      customerId: firstCust?.id || '',
      amount: '3000',
      referenceUtr: defaultUtr,
      paymentMethod: 'Bank NEFT / RTGS Transfer',
      description: firstCust ? `Authorized wallet top-up for ${firstCust.company_name}` : 'Super Admin Authorized Deposit',
    });
    setShowManualModal(true);
  };

  // On customer selector change inside modal
  const handleSelectCustomerChange = (custId) => {
    const match = customers.find((c) => c.id === custId) || null;
    setSelectedCustomer(match);
    setManualForm((prev) => ({
      ...prev,
      customerId: custId,
      description: match ? `Authorized wallet top-up for ${match.company_name}` : prev.description,
    }));
  };

  // Handle Approve Top-up
  const handleApproveTopup = async (topup) => {
    const confirm = await Swal.fire({
      title: 'Approve & Credit Top-Up?',
      html: `
        <div style="text-align: left; font-size: 0.90rem; line-height: 1.7;">
          <div>Business: <strong>${topup.company_name}</strong></div>
          <div>Credit Amount: <strong style="color: #059669; font-size: 1.05rem;">₹${Number(topup.amount).toLocaleString('en-IN')}</strong></div>
          <div>Bank UTR: <code style="font-family: monospace; background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">${topup.reference_utr}</code></div>
          <div style="margin-top: 10px; padding: 10px; background: #ecfdf5; border-radius: 8px; color: #065f46; font-size: 0.82rem;">
            ✓ Confirm that the funds have been received in the corporate banking account before crediting the wallet.
          </div>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#059669',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, Verify & Credit Wallet',
    });

    if (!confirm.isConfirmed) return;

    try {
      const res = await superadminApi.approveTopup(topup.id, {
        adminName: 'Super Admin',
      });
      if (res && res.ok) {
        await Swal.fire({
          icon: 'success',
          title: 'Wallet Credited! 🚀',
          html: `
            <div style="text-align: left; font-size: 0.90rem; line-height: 1.7;">
              <p>₹<strong>${Number(topup.amount).toLocaleString('en-IN')}</strong> has been added to <strong>${topup.company_name}</strong>'s wallet in PostgreSQL.</p>
              <div style="margin-top: 10px; padding: 10px; background: #eff6ff; border-radius: 8px; color: #1e40af; font-size: 0.82rem;">
                ✓ The customer account dashboard shows this balance and verified transaction receipt immediately.
              </div>
            </div>
          `,
          confirmButtonColor: '#2563eb',
        });
        fetchTopups();
        fetchCustomers();
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Top-Up Approval Failed', text: err.message });
    }
  };

  // Submit Rejection
  const handleSubmitReject = async (e) => {
    e.preventDefault();
    if (!rejectionReason.trim() || !rejectingTopup) {
      Swal.fire({ icon: 'warning', title: 'Rejection reason is mandatory.' });
      return;
    }

    setSubmittingReject(true);
    try {
      const res = await superadminApi.rejectTopup(rejectingTopup.id, {
        reason: rejectionReason.trim(),
        adminName: 'Super Admin',
      });
      if (res && res.ok) {
        setRejectingTopup(null);
        setRejectionReason('');
        fetchTopups();
        Swal.fire({
          icon: 'info',
          title: 'Top-Up Request Rejected',
          text: 'Request marked as rejected with recorded reason in PostgreSQL.',
        });
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Rejection Failed', text: err.message });
    } finally {
      setSubmittingReject(false);
    }
  };

  // Submit Manual Credit
  const handleManualCredit = async (e) => {
    e.preventDefault();
    const amt = parseFloat(manualForm.amount);
    if (!manualForm.customerId.trim()) {
      Swal.fire({ icon: 'warning', title: 'Please select a customer account.' });
      return;
    }
    if (!amt || amt <= 0) {
      Swal.fire({ icon: 'warning', title: 'Credit amount must be greater than zero.' });
      return;
    }
    if (!manualForm.referenceUtr.trim()) {
      Swal.fire({ icon: 'warning', title: 'Transaction UTR reference number is required.' });
      return;
    }

    const targetCustomer = selectedCustomer || customers.find((c) => c.id === manualForm.customerId);
    const targetName = targetCustomer ? targetCustomer.company_name : manualForm.customerId;

    const confirm = await Swal.fire({
      title: 'Confirm Wallet Top-Up?',
      html: `
        <div style="text-align: left; font-size: 0.90rem; line-height: 1.7;">
          <div>Customer: <strong>${targetName}</strong></div>
          <div>Credit Amount: <strong style="color: #059669; font-size: 1.1rem;">₹${amt.toLocaleString('en-IN')}</strong></div>
          <div>Bank Reference UTR: <code style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">${manualForm.referenceUtr}</code></div>
          <div>Payment Method: <strong>${manualForm.paymentMethod}</strong></div>
          <div style="margin-top: 10px; padding: 10px; background: #ecfdf5; border-radius: 8px; color: #065f46; font-size: 0.82rem;">
            ✓ Funds will be added directly into PostgreSQL wallet and will immediately show on the customer's dashboard.
          </div>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#059669',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, Credit Wallet Now',
    });

    if (!confirm.isConfirmed) return;

    setSubmittingManual(true);
    try {
      const res = await superadminApi.manualCredit({
        customerId: manualForm.customerId,
        amount: amt,
        referenceUtr: manualForm.referenceUtr.trim(),
        paymentMethod: manualForm.paymentMethod,
        description: manualForm.description.trim(),
        adminName: 'Super Admin',
      });

      if (res && res.ok) {
        setShowManualModal(false);
        const credTarget = targetCustomer;

        await Swal.fire({
          icon: 'success',
          title: 'Top-Up Done! 🚀',
          html: `
            <div style="text-align: left; font-size: 0.90rem; line-height: 1.7;">
              <p>₹<strong>${amt.toLocaleString('en-IN')}</strong> has been credited to <strong>${targetName}</strong>'s marketing wallet.</p>
              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin: 12px 0;">
                <div>Previous Balance: ₹${Number(res.previousBalance || 0).toLocaleString('en-IN')}</div>
                <div>New Live Balance: <strong style="color: #059669; font-size: 1.05rem;">₹${Number(res.newBalance || 0).toLocaleString('en-IN')}</strong></div>
                <div>UTR Reference: <code>${res.referenceUtr || manualForm.referenceUtr}</code></div>
              </div>
              <div style="padding: 10px; background: #eff6ff; border-radius: 8px; color: #1e40af; font-size: 0.82rem;">
                ✓ Updated in PostgreSQL authoritative ledger. Customer dashboard reflects this credit immediately.
              </div>
            </div>
          `,
          showCancelButton: true,
          confirmButtonText: '🚀 Open Customer Account (Dashboard)',
          cancelButtonText: 'Done',
          confirmButtonColor: '#2563eb',
        }).then((result) => {
          if (result.isConfirmed && credTarget) {
            handleLaunchDashboard(credTarget);
          }
        });

        // Reset manual form
        setManualForm({
          customerId: '',
          amount: '',
          referenceUtr: '',
          paymentMethod: 'Bank NEFT / RTGS Transfer',
          description: 'Super Admin Authorized Deposit',
        });
        setSelectedCustomer(null);

        fetchTopups();
        fetchCustomers();
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Top-Up Failed', text: err.message });
    } finally {
      setSubmittingManual(false);
    }
  };

  // Filter registered customers
  const filteredCustomers = customers.filter((c) => {
    if (!customerSearch.trim()) return true;
    const q = customerSearch.toLowerCase();
    return (
      (c.company_name && c.company_name.toLowerCase().includes(q)) ||
      (c.contact_person && c.contact_person.toLowerCase().includes(q)) ||
      (c.phone && c.phone.includes(q)) ||
      (c.email && c.email.toLowerCase().includes(q)) ||
      (c.id && c.id.toLowerCase().includes(q))
    );
  });

  return (
    <div className="sa-desk-content">
      {/* 1. Header */}
      <div className="sa-page-header">
        <div>
          <h1>Account Top-Up &amp; Wallet Crediting</h1>
          <p>
            Select any registered customer business to execute verified wallet top-ups, review incoming customer payment requests, and guarantee instant balance reflection in customer accounts.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            className="sa-btn-primary"
            onClick={handleOpenGenericTopup}
          >
            <PlusCircle size={15} />
            <span>Select Customer &amp; Top-Up</span>
          </button>
          <button
            type="button"
            className="sa-btn-secondary"
            onClick={() => {
              fetchTopups();
              fetchCustomers();
            }}
            disabled={refreshing || customersLoading}
          >
            <RefreshCw size={14} className={refreshing || customersLoading ? 'spin' : ''} />
            <span>{refreshing || customersLoading ? 'Syncing...' : 'Live Refresh'}</span>
          </button>
        </div>
      </div>

      {/* 2. Primary Sub-Tabs */}
      <div className="sa-tab-pills" style={{ marginBottom: 20 }}>
        <button
          type="button"
          className={`sa-tab-pill ${activeTab === 'customers' ? 'active' : ''}`}
          onClick={() => setActiveTab('customers')}
        >
          <Building2 size={15} />
          Registered Customers &amp; Instant Top-Up ({customers.length})
        </button>
        <button
          type="button"
          className={`sa-tab-pill ${activeTab === 'requests' ? 'active' : ''}`}
          onClick={() => setActiveTab('requests')}
        >
          <Clock size={15} />
          Incoming Top-Up Requests ({topups.filter((t) => t.status === 'Pending').length} Pending)
        </button>
        <button
          type="button"
          className={`sa-tab-pill ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          <FileCheck2 size={15} />
          Top-Up History &amp; Verified Ledger
        </button>
      </div>

      {/* TAB 1: REGISTERED CUSTOMERS & INSTANT TOP-UP */}
      {activeTab === 'customers' && (
        <div>
          {/* Controls & Search */}
          <div className="sa-controls-card">
            <div className="sa-search-box" style={{ flex: 1 }}>
              <Search size={16} className="sa-search-icon" />
              <input
                type="text"
                className="sa-search-input"
                placeholder="Search registered business by company name, contact person, mobile number..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="sa-badge sa-badge-neutral">{filteredCustomers.length} Businesses</span>
            </div>
          </div>

          {/* Customers Table */}
          <div className="sa-table-card">
            <div style={{ overflowX: 'auto' }}>
              <table className="sa-table">
                <thead>
                  <tr>
                    <th>BUSINESS / CUSTOMER</th>
                    <th>CONTACT DETAILS</th>
                    <th>AVAILABLE WALLET</th>
                    <th>AD RUNWAY</th>
                    <th>LIFETIME PAID</th>
                    <th>CAMPAIGN STATUS</th>
                    <th style={{ textAlign: 'right' }}>TOP-UP ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {customersLoading ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
                        <RefreshCw size={20} className="spin" style={{ margin: '0 auto 8px' }} />
                        <div>Loading registered businesses from PostgreSQL...</div>
                      </td>
                    </tr>
                  ) : filteredCustomers.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>
                        No registered businesses match your search.
                      </td>
                    </tr>
                  ) : (
                    filteredCustomers.map((c) => {
                      const bal = Number(c.available_balance || 0);
                      const dailyRate = Number(c.daily_ad_spend || 300);
                      const runwayDays = dailyRate > 0 ? Math.floor(bal / dailyRate) : 0;

                      return (
                        <tr key={c.id}>
                          <td>
                            <strong style={{ color: '#0f172a', fontSize: '0.92rem' }}>
                              {c.company_name}
                            </strong>
                            <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>
                              Contact: {c.contact_person}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontFamily: 'monospace' }}>
                              ID: {c.id}
                            </div>
                          </td>

                          <td>
                            <div style={{ fontWeight: 600, color: '#334155' }}>
                              📱 +91 {c.phone}
                            </div>
                            {c.email && (
                              <div style={{ fontSize: '0.76rem', color: '#64748b' }}>
                                {c.email}
                              </div>
                            )}
                            <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                              {c.city || 'India'}
                            </div>
                          </td>

                          <td>
                            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: bal > 0 ? '#059669' : '#dc2626' }}>
                              ₹{bal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </div>
                            <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                              Pacing: ₹{dailyRate}/day
                            </span>
                          </td>

                          <td>
                            <span
                              className={`sa-pill ${
                                runwayDays > 5
                                  ? 'sa-pill-green'
                                  : runwayDays > 0
                                  ? 'sa-pill-indigo'
                                  : 'sa-pill-rose'
                              }`}
                            >
                              {runwayDays} Days Runway
                            </span>
                          </td>

                          <td>
                            <strong style={{ color: '#1e293b' }}>
                              ₹{Number(c.total_lifetime_paid || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </strong>
                          </td>

                          <td>
                            <span
                              className={`sa-status-pill ${
                                c.ad_campaign_active ? 'sa-status-resolved' : 'sa-status-closed'
                              }`}
                            >
                              {c.ad_campaign_active ? 'Campaign Live' : 'Pacing Paused'}
                            </span>
                          </td>

                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: 6 }}>
                              <button
                                type="button"
                                className="sa-btn-primary"
                                style={{ padding: '6px 12px', fontSize: '0.80rem' }}
                                onClick={() => handleOpenTopupForCustomer(c)}
                                title="Top-Up Customer Wallet"
                              >
                                <Zap size={13} />
                                <span>⚡ Top-Up</span>
                              </button>

                              <button
                                type="button"
                                className="sa-action-btn sa-btn-outline"
                                style={{ padding: '6px 10px', fontSize: '0.80rem' }}
                                onClick={() => handleLaunchDashboard(c)}
                                title="Open Customer Account Dashboard"
                              >
                                <ExternalLink size={13} />
                                <span>Account</span>
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
          </div>
        </div>
      )}

      {/* TAB 2 & 3: INCOMING REQUESTS & VERIFIED HISTORY */}
      {(activeTab === 'requests' || activeTab === 'history') && (
        <div>
          {/* Controls & Filters */}
          <div className="sa-controls-card">
            <div className="sa-search-box">
              <Search size={16} className="sa-search-icon" />
              <input
                type="text"
                className="sa-search-input"
                placeholder="Search by company name, UTR reference, top-up ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="sa-filter-group">
              <select
                className="sa-select"
                value={activeTab === 'history' ? 'Approved' : statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                {activeTab === 'history' ? (
                  <>
                    <option value="Approved">Approved &amp; Credited</option>
                    <option value="all">All Historical Records</option>
                  </>
                ) : (
                  <>
                    <option value="all">All Top-Up Statuses</option>
                    <option value="Pending">Pending Review</option>
                    <option value="Approved">Approved &amp; Credited</option>
                    <option value="Rejected">Rejected</option>
                  </>
                )}
              </select>
            </div>
          </div>

          {/* Top-ups Table */}
          <div className="sa-table-card">
            <div style={{ overflowX: 'auto' }}>
              <table className="sa-table">
                <thead>
                  <tr>
                    <th style={{ width: '14%' }}>Request ID &amp; Date</th>
                    <th style={{ width: '22%' }}>Business Account</th>
                    <th style={{ width: '13%' }}>Amount</th>
                    <th style={{ width: '20%' }}>Payment UTR / Method</th>
                    <th style={{ width: '13%' }}>Status</th>
                    <th style={{ width: '18%', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
                        <RefreshCw size={20} className="spin" style={{ margin: '0 auto 8px' }} />
                        <div>Loading top-up ledger...</div>
                      </td>
                    </tr>
                  ) : topups.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>
                        <FileCheck2 size={36} style={{ margin: '0 auto 10px', color: '#cbd5e1' }} />
                        <div>No top-up records found.</div>
                      </td>
                    </tr>
                  ) : (
                    topups
                      .filter((t) => (activeTab === 'requests' ? t.status === 'Pending' || statusFilter !== 'all' : true))
                      .map((t) => (
                        <tr key={t.id}>
                          <td>
                            <code style={{ fontSize: '0.80rem', color: '#4f46e5', fontWeight: 700 }}>
                              {t.id}
                            </code>
                            <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: 2 }}>
                              {new Date(t.created_at).toLocaleString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </div>
                          </td>

                          <td>
                            <strong style={{ color: '#0f172a' }}>{t.company_name}</strong>
                            <div style={{ fontSize: '0.76rem', color: '#64748b' }}>
                              Contact: {t.contact_person}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                              📱 +91 {t.phone}
                            </div>
                          </td>

                          <td>
                            <strong style={{ fontSize: '1.05rem', color: '#059669' }}>
                              ₹{Number(t.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </strong>
                          </td>

                          <td>
                            <div style={{ fontWeight: 600, fontFamily: 'monospace', color: '#1e293b' }}>
                              {t.reference_utr}
                            </div>
                            <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: 2 }}>
                              {t.payment_method}
                            </div>
                          </td>

                          <td>
                            <span
                              className={`sa-pill ${
                                t.status === 'Approved'
                                  ? 'sa-pill-green'
                                  : t.status === 'Pending'
                                  ? 'sa-pill-indigo'
                                  : 'sa-pill-rose'
                              }`}
                            >
                              {t.status === 'Approved' ? '✓ Credited' : t.status}
                            </span>
                          </td>

                          <td style={{ textAlign: 'right' }}>
                            {t.status === 'Pending' ? (
                              <div style={{ display: 'inline-flex', gap: 6 }}>
                                <button
                                  type="button"
                                  className="sa-btn-success"
                                  style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                                  onClick={() => handleApproveTopup(t)}
                                  title="Approve and credit wallet"
                                >
                                  <CheckCircle2 size={13} />
                                  <span>Approve</span>
                                </button>
                                <button
                                  type="button"
                                  className="sa-btn-danger"
                                  style={{ padding: '6px 10px', fontSize: '0.78rem' }}
                                  onClick={() => setRejectingTopup(t)}
                                  title="Reject request"
                                >
                                  <XCircle size={13} />
                                  <span>Reject</span>
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                                <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                                  By {t.processed_by || 'Admin'}
                                </span>
                                <button
                                  type="button"
                                  className="sa-action-btn sa-btn-outline"
                                  style={{ padding: '4px 8px', fontSize: 11 }}
                                  onClick={() => handleLaunchDashboard(t)}
                                  title="Open Customer Account"
                                >
                                  <ExternalLink size={12} />
                                  <span>Account</span>
                                </button>
                              </div>
                            )}
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

      {/* REJECTION MODAL */}
      {rejectingTopup && (
        <div className="sa-modal-backdrop" onClick={() => setRejectingTopup(null)}>
          <div className="sa-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="sa-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <XCircle size={18} color="#dc2626" />
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>Reject Top-Up Request</h3>
              </div>
              <button
                type="button"
                className="sa-btn-icon"
                onClick={() => setRejectingTopup(null)}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmitReject}>
              <div className="sa-modal-body">
                <p style={{ margin: '0 0 12px 0', fontSize: '0.84rem', color: '#475569' }}>
                  Provide a mandatory administrative reason for rejecting the top-up request for <strong>{rejectingTopup.company_name}</strong> (₹{Number(rejectingTopup.amount).toLocaleString('en-IN')}).
                </p>

                <div className="sa-form-group">
                  <label className="sa-form-label">Mandatory Rejection Reason *</label>
                  <textarea
                    rows={3}
                    required
                    className="sa-form-textarea"
                    placeholder="e.g. UTR reference not reflected in bank account statement..."
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                  />
                </div>
              </div>

              <div className="sa-modal-footer">
                <button
                  type="button"
                  className="sa-btn-secondary"
                  onClick={() => setRejectingTopup(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReject}
                  className="sa-btn-danger"
                >
                  {submittingReject ? 'Rejecting...' : 'Confirm Rejection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ENHANCED TOP-UP MODAL (SELECT CUSTOMER & TOP-UP) */}
      {showManualModal && (
        <div className="sa-modal-backdrop" onClick={() => setShowManualModal(false)}>
          <div className="sa-modal-card" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="sa-modal-header" style={{ background: '#ecfdf5', borderBottom: '1px solid #a7f3d0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Zap size={18} color="#059669" />
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#065f46' }}>
                  Select Customer &amp; Top-Up Ad Wallet
                </h3>
              </div>
              <button
                type="button"
                className="sa-btn-icon"
                onClick={() => setShowManualModal(false)}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleManualCredit}>
              <div className="sa-modal-body" style={{ padding: 22 }}>
                {/* 1. Customer Selector Dropdown */}
                <div className="sa-form-group" style={{ marginBottom: 14 }}>
                  <label className="sa-form-label" style={{ fontWeight: 800, color: '#0f172a' }}>
                    <Building2 size={14} color="#059669" /> 1. Select Target Customer Account *
                  </label>
                  <select
                    className="sa-select"
                    style={{ width: '100%', padding: '10px 12px', fontSize: '0.90rem', fontWeight: 600 }}
                    value={manualForm.customerId}
                    onChange={(e) => handleSelectCustomerChange(e.target.value)}
                    required
                  >
                    <option value="">-- Choose Registered Business to Credit --</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.company_name} (+91 {c.phone}) — Bal: ₹{Number(c.available_balance || 0).toLocaleString('en-IN')}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Selected Customer Dynamic Summary Card */}
                {selectedCustomer && (
                  <div
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: 10,
                      padding: '12px 16px',
                      marginBottom: 16,
                      fontSize: '0.84rem',
                      lineHeight: 1.6,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#64748b' }}>Account:</span>
                      <strong style={{ color: '#0f172a' }}>{selectedCustomer.company_name}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#64748b' }}>Contact &amp; Mobile:</span>
                      <span>{selectedCustomer.contact_person} (+91 {selectedCustomer.phone})</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, paddingTop: 4, borderTop: '1px dashed #cbd5e1' }}>
                      <span style={{ color: '#64748b' }}>Current Available Balance:</span>
                      <strong style={{ color: '#059669', fontSize: '0.96rem' }}>
                        ₹{Number(selectedCustomer.available_balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </strong>
                    </div>
                    {manualForm.amount && parseFloat(manualForm.amount) > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, color: '#2563eb', fontWeight: 700 }}>
                        <span>New Balance After Top-Up:</span>
                        <span>
                          ₹{(Number(selectedCustomer.available_balance || 0) + parseFloat(manualForm.amount)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          {' '}(+{Math.floor(parseFloat(manualForm.amount) / 300)} Days Runway)
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* 2. Top-Up Amount Presets */}
                <div style={{ marginBottom: 16 }}>
                  <label className="sa-form-label" style={{ fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>
                    <Wallet size={14} color="#059669" /> 2. Top-Up Amount Presets (₹300/day pacing)
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                    {TOPUP_PRESETS.map((p) => {
                      const isSelected = String(manualForm.amount) === String(p.amount);
                      return (
                        <button
                          key={p.amount}
                          type="button"
                          style={{
                            padding: '10px 8px',
                            borderRadius: 8,
                            border: isSelected ? '2px solid #059669' : '1px solid #cbd5e1',
                            background: isSelected ? '#ecfdf5' : '#ffffff',
                            color: isSelected ? '#065f46' : '#1e293b',
                            cursor: 'pointer',
                            textAlign: 'center',
                            transition: 'all 0.15s ease',
                          }}
                          onClick={() => setManualForm({ ...manualForm, amount: String(p.amount) })}
                        >
                          <div style={{ fontWeight: 800, fontSize: '0.94rem' }}>{p.label}</div>
                          <div style={{ fontSize: '0.70rem', color: isSelected ? '#059669' : '#64748b' }}>{p.runway}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Custom Amount Input */}
                <div className="sa-form-group" style={{ marginBottom: 14 }}>
                  <label className="sa-form-label">Or Custom Amount (INR) *</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontWeight: 700, color: '#64748b' }}>
                      ₹
                    </span>
                    <input
                      type="number"
                      step="100"
                      min="1"
                      required
                      className="sa-form-input"
                      style={{ paddingLeft: 28, fontSize: '1rem', fontWeight: 700 }}
                      placeholder="e.g. 5000"
                      value={manualForm.amount}
                      onChange={(e) => setManualForm({ ...manualForm, amount: e.target.value })}
                    />
                  </div>
                </div>

                {/* Bank Reference UTR with Quick Generator */}
                <div className="sa-form-group" style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label className="sa-form-label" style={{ margin: 0 }}>
                      Bank Transaction Reference / UTR Number *
                    </label>
                    <button
                      type="button"
                      style={{ background: 'transparent', border: 'none', color: '#059669', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer' }}
                      onClick={() => setManualForm({ ...manualForm, referenceUtr: `TOP_${Date.now().toString().slice(-6)}_${Math.random().toString(36).substr(2, 4).toUpperCase()}` })}
                    >
                      <Sparkles size={12} style={{ display: 'inline', marginRight: 2 }} /> Auto-Generate
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    className="sa-form-input"
                    placeholder="e.g. UTR982184029144 or IMPS reference"
                    value={manualForm.referenceUtr}
                    onChange={(e) => setManualForm({ ...manualForm, referenceUtr: e.target.value })}
                  />
                </div>

                {/* Payment Method */}
                <div className="sa-form-group" style={{ marginBottom: 14 }}>
                  <label className="sa-form-label">Payment Mode</label>
                  <select
                    className="sa-select"
                    style={{ width: '100%' }}
                    value={manualForm.paymentMethod}
                    onChange={(e) => setManualForm({ ...manualForm, paymentMethod: e.target.value })}
                  >
                    <option value="Bank NEFT / RTGS Transfer">Bank NEFT / RTGS Transfer</option>
                    <option value="Instant UPI / GPay Transfer">Instant UPI / GPay Transfer</option>
                    <option value="Corporate IMPS / Direct Deposit">Corporate IMPS / Direct Deposit</option>
                    <option value="Razorpay Corporate Gateway">Razorpay Corporate Gateway</option>
                    <option value="Admin Promotional Goodwill Credit">Admin Promotional Goodwill Credit</option>
                  </select>
                </div>

                {/* Internal Description */}
                <div className="sa-form-group" style={{ marginBottom: 4 }}>
                  <label className="sa-form-label">Internal Description / Notes</label>
                  <input
                    type="text"
                    className="sa-form-input"
                    placeholder="e.g. Verified bank transfer credited for Meta Ads campaign"
                    value={manualForm.description}
                    onChange={(e) => setManualForm({ ...manualForm, description: e.target.value })}
                  />
                </div>
              </div>

              <div className="sa-modal-footer">
                <button
                  type="button"
                  className="sa-btn-secondary"
                  onClick={() => setShowManualModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingManual}
                  className="sa-btn-success"
                  style={{ minWidth: 200 }}
                >
                  <Zap size={14} />
                  <span>{submittingManual ? 'Crediting Wallet...' : 'Confirm Top-Up & Credit Wallet'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
