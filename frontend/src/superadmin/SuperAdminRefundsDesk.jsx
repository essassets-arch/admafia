import React, { useState, useEffect, useCallback } from 'react';
import {
  RotateCcw,
  Search,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  ExternalLink,
  ShieldAlert,
  PlusCircle,
  X,
  Users,
  IndianRupee,
  Building2,
  Phone,
  Mail,
  Wallet,
  ArrowUpRight,
  TrendingDown,
  FileCheck,
  Receipt,
  Download,
  FileSpreadsheet,
  ArrowRight,
  ShieldCheck,
  CheckCheck
} from 'lucide-react';
import Swal from 'sweetalert2';
import superadminApi from '../services/superadminApi';

export default function SuperAdminRefundsDesk() {
  const [activeTab, setActiveTab] = useState('paid_customers'); // 'paid_customers' | 'refund_queue' | 'reconciliation'

  // Tab 1: Paid Customers State
  const [paidCustomers, setPaidCustomers] = useState([]);
  const [paidSummary, setPaidSummary] = useState({
    totalPaidCustomers: 0,
    totalAmountPaid: 0,
    totalRefundableBalance: 0,
    totalRefundedAmount: 0,
  });
  const [paidLoading, setPaidLoading] = useState(true);
  const [paidSearch, setPaidSearch] = useState('');
  const [paidPagination, setPaidPagination] = useState({ page: 1, total: 0, totalPages: 1 });

  // Tab 2: Refund Requests Queue State
  const [refunds, setRefunds] = useState([]);
  const [refundsLoading, setRefundsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refundSearch, setRefundSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [refundPagination, setRefundPagination] = useState({ page: 1, total: 0, totalPages: 1 });

  // Tab 3: Reconciliation & Audit History State
  const [reconRecords, setReconRecords] = useState([]);
  const [reconSummary, setReconSummary] = useState({});
  const [reconLoading, setReconLoading] = useState(false);
  const [reconSearch, setReconSearch] = useState('');
  const [reconStatusFilter, setReconStatusFilter] = useState('all');
  const [reconPagination, setReconPagination] = useState({ page: 1, total: 0, totalPages: 1 });
  const [selectedReconDetail, setSelectedReconDetail] = useState(null);

  // Rejection Modal State
  const [rejectingRefund, setRejectingRefund] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [submittingReject, setSubmittingReject] = useState(false);

  // Issue Refund Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedCustomerForRefund, setSelectedCustomerForRefund] = useState(null);
  const [createForm, setCreateForm] = useState({
    customerId: '',
    amount: '',
    reason: '',
    supportingInfo: '',
    originalTxRef: '',
  });
  const [submittingCreate, setSubmittingCreate] = useState(false);

  // 1. Fetch Paid Customers
  const fetchPaidCustomers = useCallback(async () => {
    try {
      setPaidLoading(true);
      const res = await superadminApi.getPaidCustomersForRefund({
        search: paidSearch,
        page: paidPagination.page,
        limit: 25,
      });
      if (res && res.ok) {
        setPaidCustomers(res.paidCustomers || []);
        if (res.summary) setPaidSummary(res.summary);
        if (res.pagination) setPaidPagination(res.pagination);
      }
    } catch (err) {
      console.error('Failed to load paid customers:', err);
    } finally {
      setPaidLoading(false);
    }
  }, [paidSearch, paidPagination.page]);

  // 2. Fetch Refund Requests Queue
  const fetchRefunds = useCallback(async () => {
    try {
      setRefundsLoading(true);
      const res = await superadminApi.getRefunds({
        status: statusFilter,
        search: refundSearch,
        page: refundPagination.page,
        limit: 20,
      });
      if (res && res.ok) {
        setRefunds(res.refunds || []);
        if (res.pagination) setRefundPagination(res.pagination);
      }
    } catch (err) {
      console.error('Failed to load refund requests:', err);
    } finally {
      setRefundsLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, refundSearch, refundPagination.page]);

  // 3. Fetch Reconciliation & Audit Ledger
  const fetchReconciliation = useCallback(async () => {
    try {
      setReconLoading(true);
      const res = await superadminApi.getRefundReconciliation({
        search: reconSearch,
        status: reconStatusFilter,
        page: reconPagination.page,
        limit: 25,
      });
      if (res && res.ok) {
        setReconRecords(res.records || []);
        if (res.summary) setReconSummary(res.summary);
        if (res.pagination) setReconPagination(res.pagination);
      }
    } catch (err) {
      console.error('Failed to load refund reconciliation:', err);
    } finally {
      setReconLoading(false);
    }
  }, [reconSearch, reconStatusFilter, reconPagination.page]);

  useEffect(() => {
    fetchPaidCustomers();
  }, [fetchPaidCustomers]);

  useEffect(() => {
    fetchRefunds();
  }, [fetchRefunds]);

  useEffect(() => {
    if (activeTab === 'reconciliation') {
      fetchReconciliation();
    }
  }, [activeTab, fetchReconciliation]);

  const handleRefreshAll = () => {
    setRefreshing(true);
    fetchPaidCustomers();
    fetchRefunds();
    if (activeTab === 'reconciliation') fetchReconciliation();
  };

  // Open Issue Refund Modal for a specific customer
  const handleOpenIssueRefundForCustomer = (cust) => {
    setSelectedCustomerForRefund(cust);
    const eligibleBankRefund = Number(cust.eligible_bank_refundable || cust.available_balance || 0);

    setCreateForm({
      customerId: cust.id,
      amount: eligibleBankRefund > 0 ? String(eligibleBankRefund) : '',
      reason: '',
      supportingInfo: '',
      originalTxRef: cust.last_utr_ref || '',
    });
    setShowCreateModal(true);
  };

  // Handle Customer Selection in Modal
  const handleSelectCustomerInModal = (custId) => {
    const cust = paidCustomers.find((c) => c.id === custId);
    setSelectedCustomerForRefund(cust || null);
    const eligibleBankRefund = cust ? Number(cust.eligible_bank_refundable || cust.available_balance || 0) : 0;

    setCreateForm((prev) => ({
      ...prev,
      customerId: custId,
      amount: eligibleBankRefund > 0 ? String(eligibleBankRefund) : '',
      originalTxRef: cust?.last_utr_ref || '',
    }));
  };

  // Handle Approve Refund (Atomic Transaction with Row-Level Locking)
  const handleApproveRefund = async (refund) => {
    const currentBal = Number(refund.available_balance || 0);
    const refundAmt = Number(refund.amount || 0);

    if (refundAmt > currentBal) {
      Swal.fire({
        icon: 'error',
        title: 'Insufficient Balance',
        text: `Customer wallet available balance (₹${currentBal.toFixed(2)}) is less than requested refund (₹${refundAmt.toFixed(2)}).`,
      });
      return;
    }

    const confirm = await Swal.fire({
      title: 'Approve & Process Refund?',
      html: `
        <div style="text-align: left; font-size: 0.90rem; line-height: 1.6;">
          <div>Business: <strong>${refund.company_name}</strong></div>
          <div>Refund Amount: <strong style="color: #dc2626;">₹${refundAmt.toFixed(2)}</strong></div>
          <div>Current Balance: <strong>₹${currentBal.toFixed(2)}</strong></div>
          <div style="margin-top: 10px; padding: 10px; background: #fff1f2; border-radius: 8px; color: #9f1239; font-size: 0.82rem;">
            ⚠️ <strong>Financial Integrity Safeguard:</strong> This will lock the wallet row, deduct ₹${refundAmt.toFixed(2)} atomically, and generate an official banking reversal record in the transaction ledger.
          </div>
        </div>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#4f46e5',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, Approve & Deduct Wallet',
    });

    if (!confirm.isConfirmed) return;

    try {
      const res = await superadminApi.reviewRefund(refund.id, {
        decision: 'Approved',
        reviewNotes: 'Approved by Super Admin after banking verification',
        adminName: 'Super Admin',
      });

      if (res && res.ok) {
        Swal.fire({
          icon: 'success',
          title: 'Refund Approved! 🚀',
          text: `Refund completed. Banking Provider Ref: ${res.providerRef || 'N/A'}`,
        });
        fetchRefunds();
        fetchPaidCustomers();
        if (activeTab === 'reconciliation') fetchReconciliation();
      } else {
        Swal.fire({ icon: 'error', title: 'Approval Failed', text: res?.error || 'Could not process refund.' });
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Refund Approval Failed', text: err.response?.data?.error || err.message });
    }
  };

  // Submit Rejection
  const handleSubmitReject = async (e) => {
    e.preventDefault();
    if (!rejectionReason.trim() || !rejectingRefund) {
      Swal.fire({ icon: 'warning', title: 'Rejection reason is mandatory.' });
      return;
    }

    setSubmittingReject(true);
    try {
      const res = await superadminApi.reviewRefund(rejectingRefund.id, {
        decision: 'Rejected',
        reason: rejectionReason.trim(),
        adminName: 'Super Admin',
      });

      if (res && res.ok) {
        setRejectingRefund(null);
        setRejectionReason('');
        fetchRefunds();
        fetchPaidCustomers();
        Swal.fire({
          icon: 'info',
          title: 'Refund Rejected',
          text: 'The refund request has been rejected and logged in the audit trail.',
        });
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Rejection Failed', text: err.response?.data?.error || err.message });
    } finally {
      setSubmittingReject(false);
    }
  };

  // Submit Create Refund (with Backend Eligibility Validation)
  const handleCreateRefund = async (e) => {
    e.preventDefault();
    const amt = parseFloat(createForm.amount);
    if (!createForm.customerId.trim()) {
      Swal.fire({ icon: 'warning', title: 'Customer selection is required.' });
      return;
    }
    if (!amt || amt <= 0) {
      Swal.fire({ icon: 'warning', title: 'Enter a valid refund amount.' });
      return;
    }

    const maxEligible = selectedCustomerForRefund
      ? Number(selectedCustomerForRefund.eligible_bank_refundable || selectedCustomerForRefund.available_balance || 0)
      : null;

    if (maxEligible !== null && amt > maxEligible) {
      Swal.fire({
        icon: 'warning',
        title: 'Amount Exceeds Eligible Cap',
        text: `Requested refund (₹${amt.toFixed(2)}) cannot exceed eligible bank-refundable cap (₹${maxEligible.toFixed(2)}).`,
      });
      return;
    }

    if (!createForm.reason.trim()) {
      Swal.fire({ icon: 'warning', title: 'Refund reason is mandatory.' });
      return;
    }

    setSubmittingCreate(true);
    try {
      const res = await superadminApi.createRefund({
        customerId: createForm.customerId,
        amount: amt,
        reason: createForm.reason.trim(),
        supportingInfo: createForm.supportingInfo.trim(),
        originalTxRef: createForm.originalTxRef.trim(),
        adminName: 'Super Admin',
      });

      if (res && res.ok) {
        setShowCreateModal(false);
        setCreateForm({
          customerId: '',
          amount: '',
          reason: '',
          supportingInfo: '',
          originalTxRef: '',
        });
        setSelectedCustomerForRefund(null);
        fetchRefunds();
        fetchPaidCustomers();
        setActiveTab('refund_queue');
        Swal.fire({
          icon: 'success',
          title: 'Refund Request Created',
          text: 'Submitted to review queue. A Super Admin can approve it with atomic ledger verification.',
        });
      } else {
        Swal.fire({ icon: 'error', title: 'Creation Failed', text: res.error || 'Could not register refund.' });
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Creation Failed', text: err.response?.data?.error || err.message });
    } finally {
      setSubmittingCreate(false);
    }
  };

  const pendingRefundsCount = refunds.filter((r) => r.status === 'Pending').length;

  return (
    <div className="sa-desk-content">
      {/* 1. Page Header */}
      <div className="sa-page-header">
        <div>
          <h1>Check Refunds &amp; Reconciliation</h1>
          <p>
            Verify paid customer financial eligibility, process atomic wallet reversals with concurrency protection, and inspect end-to-end audit reconciliation trails.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          {activeTab === 'reconciliation' && (
            <button
              type="button"
              className="sa-btn-primary"
              onClick={() => window.open(superadminApi.getRefundReconciliationExportUrl(), '_blank')}
              title="Export CSV Reconciliation Report"
            >
              <Download size={14} />
              <span>Export CSV</span>
            </button>
          )}

          <button
            type="button"
            className="sa-btn-primary"
            onClick={() => {
              setSelectedCustomerForRefund(null);
              setCreateForm({
                customerId: '',
                amount: '',
                reason: '',
                supportingInfo: '',
                originalTxRef: '',
              });
              setShowCreateModal(true);
            }}
          >
            <PlusCircle size={15} />
            <span>Initiate Refund</span>
          </button>
          <button
            type="button"
            className="sa-btn-secondary"
            onClick={handleRefreshAll}
            disabled={refreshing}
          >
            <RefreshCw size={14} className={refreshing ? 'sa-spin' : ''} />
            <span>{refreshing ? 'Syncing...' : 'Live Refresh'}</span>
          </button>
        </div>
      </div>

      {/* 2. Top Metric Cards */}
      <div className="sa-stats-grid">
        <div
          className="sa-stat-card"
          onClick={() => setActiveTab('paid_customers')}
          style={{ cursor: 'pointer' }}
        >
          <div className="sa-stat-top">
            <span className="sa-stat-title">Verified Paid Customers</span>
            <div className="sa-stat-icon-wrap" style={{ background: '#ecfdf5', color: '#059669' }}>
              <Users size={18} />
            </div>
          </div>
          <div className="sa-stat-val" style={{ color: '#059669' }}>
            {paidSummary.totalPaidCustomers}
          </div>
          <div className="sa-stat-sub">
            <span>Authoritative completed payments</span>
          </div>
        </div>

        <div className="sa-stat-card">
          <div className="sa-stat-top">
            <span className="sa-stat-title">Total Lifetime Deposited</span>
            <div className="sa-stat-icon-wrap" style={{ background: '#eff6ff', color: '#2563eb' }}>
              <ArrowUpRight size={18} />
            </div>
          </div>
          <div className="sa-stat-val" style={{ color: '#2563eb' }}>
            ₹{Number(paidSummary.totalAmountPaid || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="sa-stat-sub">
            <span>Verified cumulative customer deposits</span>
          </div>
        </div>

        <div className="sa-stat-card">
          <div className="sa-stat-top">
            <span className="sa-stat-title">Total Refundable Balance</span>
            <div className="sa-stat-icon-wrap" style={{ background: '#fffbeb', color: '#d97706' }}>
              <Wallet size={18} />
            </div>
          </div>
          <div className="sa-stat-val" style={{ color: '#d97706' }}>
            ₹{Number(paidSummary.totalRefundableBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="sa-stat-sub">
            <span>Active available wallet liabilities</span>
          </div>
        </div>

        <div
          className="sa-stat-card"
          onClick={() => setActiveTab('refund_queue')}
          style={{ cursor: 'pointer' }}
        >
          <div className="sa-stat-top">
            <span className="sa-stat-title">Refund Review Queue</span>
            <div
              className="sa-stat-icon-wrap"
              style={{
                background: pendingRefundsCount > 0 ? '#fff1f2' : '#f1f5f9',
                color: pendingRefundsCount > 0 ? '#e11d48' : '#64748b',
              }}
            >
              <RotateCcw size={18} />
            </div>
          </div>
          <div
            className="sa-stat-val"
            style={{ color: pendingRefundsCount > 0 ? '#e11d48' : '#0f172a' }}
          >
            {pendingRefundsCount}
          </div>
          <div className="sa-stat-sub">
            <span>{pendingRefundsCount > 0 ? 'Pending admin action' : 'Queue clear'}</span>
          </div>
        </div>
      </div>

      {/* 3. Sub-Tab Navigation */}
      <div className="sa-tab-pills">
        <button
          type="button"
          className={`sa-tab-pill ${activeTab === 'paid_customers' ? 'active' : ''}`}
          onClick={() => setActiveTab('paid_customers')}
        >
          <Users size={15} />
          Registered Paid Customers ({paidSummary.totalPaidCustomers})
        </button>
        <button
          type="button"
          className={`sa-tab-pill ${activeTab === 'refund_queue' ? 'active' : ''}`}
          onClick={() => setActiveTab('refund_queue')}
        >
          <RotateCcw size={15} />
          Refund Requests Queue {pendingRefundsCount > 0 && <span className="sa-nav-badge sa-badge-danger">{pendingRefundsCount}</span>}
        </button>
        <button
          type="button"
          className={`sa-tab-pill ${activeTab === 'reconciliation' ? 'active' : ''}`}
          onClick={() => setActiveTab('reconciliation')}
        >
          <FileCheck size={15} />
          Reconciliation &amp; Audit History
        </button>
      </div>

      {/* =====================================================================
          TAB 1: REGISTERED PAID CUSTOMERS & REFUND ELIGIBILITY
          ===================================================================== */}
      {activeTab === 'paid_customers' && (
        <div>
          {/* Controls & Search */}
          <div className="sa-controls-card">
            <div className="sa-search-wrap">
              <Search size={16} />
              <input
                type="text"
                placeholder="Search paid customers by business name, contact person, phone, email, or customer ID..."
                value={paidSearch}
                onChange={(e) => setPaidSearch(e.target.value)}
              />
            </div>
            <div className="sa-filter-group">
              <span className="sa-badge sa-badge-neutral">
                {paidCustomers.length} Accounts Displayed
              </span>
            </div>
          </div>

          {/* Paid Customers Table */}
          <div className="sa-table-card">
            <div className="sa-table-wrap">
              <table className="sa-table">
                <thead>
                  <tr>
                    <th>BUSINESS &amp; CUSTOMER</th>
                    <th>PAYMENT STATUS</th>
                    <th>TOTAL LIFETIME PAID</th>
                    <th>AVAILABLE WALLET</th>
                    <th>BANK-REFUNDABLE CAP</th>
                    <th>LAST VERIFIED DEPOSIT</th>
                    <th style={{ textAlign: 'right' }}>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {paidLoading ? (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                        <RefreshCw size={20} className="sa-spin" style={{ margin: '0 auto 8px', display: 'block' }} />
                        Loading registered paid customers...
                      </td>
                    </tr>
                  ) : paidCustomers.length === 0 ? (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                        No registered paid customers found matching your search.
                      </td>
                    </tr>
                  ) : (
                    paidCustomers.map((cust) => {
                      const availBal = Number(cust.available_balance || 0);
                      const lifetimePaid = Number(cust.total_lifetime_paid || 0);
                      const bankRefundCap = Number(cust.eligible_bank_refundable || 0);
                      const hasRefundableBalance = bankRefundCap > 0;

                      return (
                        <tr key={cust.id}>
                          <td>
                            <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.92rem' }}>
                              {cust.company_name}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>
                              <code>{cust.id}</code> &bull; {cust.contact_person}
                            </div>
                            <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginTop: 2 }}>
                              📞 +91 {cust.phone} {cust.email ? `• ✉️ ${cust.email}` : ''} {cust.city ? `• 📍 ${cust.city}` : ''}
                            </div>
                          </td>

                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                              <span className="sa-badge sa-badge-success">
                                <CheckCircle2 size={11} style={{ display: 'inline', marginRight: 4 }} />
                                Payment Verified ✓
                              </span>
                              {cust.paid_receipts_count > 0 && (
                                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                                  <Receipt size={11} style={{ display: 'inline', marginRight: 3 }} />
                                  {cust.paid_receipts_count} receipts recorded
                                </span>
                              )}
                              <span
                                className={`sa-status-pill ${
                                  cust.status === 'active' ? 'sa-status-resolved' : 'sa-status-closed'
                                }`}
                                style={{ fontSize: '0.68rem', padding: '2px 6px' }}
                              >
                                {cust.status === 'active' ? 'Active' : 'Suspended'}
                              </span>
                            </div>
                          </td>

                          <td>
                            <div style={{ fontWeight: 800, color: '#059669', fontSize: '0.95rem' }}>
                              ₹{lifetimePaid.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 2 }}>
                              Cumulative Deposited
                            </div>
                          </td>

                          <td>
                            <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.90rem' }}>
                              ₹{availBal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 2 }}>
                              Ad Spent: ₹{Number(cust.total_ad_spent || 0).toFixed(0)}
                            </div>
                          </td>

                          <td>
                            <div
                              style={{
                                fontWeight: 800,
                                color: hasRefundableBalance ? '#d97706' : '#94a3b8',
                                fontSize: '0.95rem',
                              }}
                            >
                              ₹{bankRefundCap.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: hasRefundableBalance ? '#059669' : '#94a3b8', marginTop: 2 }}>
                              {hasRefundableBalance ? 'Eligible for Bank Return' : 'Zero Refund Cap'}
                            </div>
                          </td>

                          <td>
                            {cust.last_payment_date ? (
                              <div>
                                <div style={{ fontSize: '0.78rem', color: '#0f172a', fontWeight: 600 }}>
                                  {new Date(cust.last_payment_date).toLocaleDateString('en-IN', {
                                    day: '2-digit',
                                    month: 'short',
                                    year: 'numeric',
                                  })}
                                </div>
                                {cust.last_utr_ref && (
                                  <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 2 }}>
                                    <code>{cust.last_utr_ref}</code>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span style={{ fontSize: '0.76rem', color: '#94a3b8' }}>Verified Initial Credit</span>
                            )}
                          </td>

                          <td style={{ textAlign: 'right' }}>
                            <button
                              type="button"
                              className="sa-btn-primary"
                              style={{
                                fontSize: '0.78rem',
                                padding: '7px 12px',
                                opacity: hasRefundableBalance ? 1 : 0.6,
                              }}
                              disabled={!hasRefundableBalance}
                              title={hasRefundableBalance ? 'Issue refund from bank-eligible balance' : 'Customer has zero bank-refundable balance'}
                              onClick={() => handleOpenIssueRefundForCustomer(cust)}
                            >
                              <RotateCcw size={13} />
                              <span>Issue Refund</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {paidPagination.totalPages > 1 && (
              <div className="sa-pagination">
                <span>
                  Showing page {paidPagination.page} of {paidPagination.totalPages} ({paidPagination.total} paid accounts)
                </span>
                <div className="sa-page-controls">
                  <button
                    type="button"
                    className="sa-page-btn"
                    disabled={paidPagination.page <= 1}
                    onClick={() => setPaidPagination((p) => ({ ...p, page: p.page - 1 }))}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="sa-page-btn"
                    disabled={paidPagination.page >= paidPagination.totalPages}
                    onClick={() => setPaidPagination((p) => ({ ...p, page: p.page + 1 }))}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 2: REFUND REQUESTS QUEUE
          ===================================================================== */}
      {activeTab === 'refund_queue' && (
        <div>
          {/* Controls & Filter */}
          <div className="sa-controls-card">
            <div className="sa-search-wrap">
              <Search size={16} />
              <input
                type="text"
                placeholder="Search refund requests by company name, request ID, original UTR, or reason..."
                value={refundSearch}
                onChange={(e) => setRefundSearch(e.target.value)}
              />
            </div>

            <div className="sa-filter-group">
              <select
                className="sa-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All Refund Statuses</option>
                <option value="Pending">Pending Review</option>
                <option value="Approved">Approved / Completed</option>
                <option value="Rejected">Rejected</option>
              </select>
            </div>
          </div>

          {/* Refunds Table */}
          <div className="sa-table-card">
            <div className="sa-table-wrap">
              <table className="sa-table">
                <thead>
                  <tr>
                    <th>REFUND ID</th>
                    <th>BUSINESS / CUSTOMER</th>
                    <th>REQUESTED REFUND</th>
                    <th>AVAILABLE WALLET</th>
                    <th>ORIGINAL TX / UTR</th>
                    <th>REASON &amp; NOTES</th>
                    <th>STATUS</th>
                    <th style={{ textAlign: 'right' }}>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {refundsLoading ? (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                        <RefreshCw size={20} className="sa-spin" style={{ margin: '0 auto 8px', display: 'block' }} />
                        Loading refund requests queue...
                      </td>
                    </tr>
                  ) : refunds.length === 0 ? (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                        No refund requests found matching the selected filter.
                      </td>
                    </tr>
                  ) : (
                    refunds.map((rf) => {
                      const availBal = Number(rf.available_balance || 0);
                      const amt = Number(rf.amount || 0);
                      const hasSufficientBal = availBal >= amt;

                      return (
                        <tr key={rf.id}>
                          <td>
                            <code style={{ fontSize: '0.80rem' }}>{rf.id}</code>
                            <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 2 }}>
                              {new Date(rf.created_at).toLocaleDateString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </div>
                          </td>

                          <td>
                            <div style={{ fontWeight: 700, color: '#0f172a' }}>{rf.company_name}</div>
                            <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                              {rf.contact_person} &bull; {rf.phone}
                            </div>
                          </td>

                          <td>
                            <div style={{ fontWeight: 800, color: '#e11d48', fontSize: '0.95rem' }}>
                              ₹{amt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          </td>

                          <td>
                            <div style={{ fontWeight: 700, color: hasSufficientBal ? '#059669' : '#e11d48' }}>
                              ₹{availBal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            {!hasSufficientBal && rf.status === 'Pending' && (
                              <div style={{ fontSize: '0.68rem', color: '#e11d48', fontWeight: 700 }}>
                                ⚠️ Insufficient Balance
                              </div>
                            )}
                          </td>

                          <td>
                            {rf.original_tx_ref ? (
                              <code>{rf.original_tx_ref}</code>
                            ) : (
                              <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>None Provided</span>
                            )}
                          </td>

                          <td>
                            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#0f172a' }}>
                              {rf.reason}
                            </div>
                            {rf.supporting_info && (
                              <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: 2 }}>
                                {rf.supporting_info}
                              </div>
                            )}
                            {rf.rejection_reason && (
                              <div style={{ fontSize: '0.74rem', color: '#e11d48', marginTop: 4, background: '#fff1f2', padding: '3px 6px', borderRadius: 4 }}>
                                Rejection: {rf.rejection_reason}
                              </div>
                            )}
                          </td>

                          <td>
                            <span
                              className={`sa-status-pill ${
                                rf.status === 'Approved' || rf.status === 'Completed'
                                  ? 'sa-status-resolved'
                                  : rf.status === 'Rejected'
                                  ? 'sa-status-closed'
                                  : 'sa-status-open'
                              }`}
                            >
                              {rf.status}
                            </span>
                            {rf.reviewed_by && (
                              <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: 3 }}>
                                By: {rf.reviewed_by}
                              </div>
                            )}
                          </td>

                          <td style={{ textAlign: 'right' }}>
                            {rf.status === 'Pending' ? (
                              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                <button
                                  type="button"
                                  className="sa-btn-success"
                                  style={{ padding: '6px 10px', fontSize: '0.76rem' }}
                                  disabled={!hasSufficientBal}
                                  onClick={() => handleApproveRefund(rf)}
                                  title={hasSufficientBal ? 'Approve & Deduct Wallet' : 'Customer has insufficient balance'}
                                >
                                  <CheckCircle2 size={13} />
                                  <span>Approve</span>
                                </button>
                                <button
                                  type="button"
                                  className="sa-btn-danger"
                                  style={{ padding: '6px 10px', fontSize: '0.76rem' }}
                                  onClick={() => {
                                    setRejectingRefund(rf);
                                    setRejectionReason('');
                                  }}
                                >
                                  <XCircle size={13} />
                                  <span>Reject</span>
                                </button>
                              </div>
                            ) : (
                              <span style={{ fontSize: '0.76rem', color: '#64748b' }}>
                                {rf.status === 'Approved' || rf.status === 'Completed' ? '✓ Completed' : 'Closed'}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {refundPagination.totalPages > 1 && (
              <div className="sa-pagination">
                <span>
                  Showing page {refundPagination.page} of {refundPagination.totalPages} ({refundPagination.total} records)
                </span>
                <div className="sa-page-controls">
                  <button
                    type="button"
                    className="sa-page-btn"
                    disabled={refundPagination.page <= 1}
                    onClick={() => setRefundPagination((p) => ({ ...p, page: p.page - 1 }))}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="sa-page-btn"
                    disabled={refundPagination.page >= refundPagination.totalPages}
                    onClick={() => setRefundPagination((p) => ({ ...p, page: p.page + 1 }))}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 3: REFUND RECONCILIATION & AUDIT HISTORY
          (Original Deposit → Verified UTR → Eligible Cap → Refund Request → Provider Ref → Final Amount)
          ===================================================================== */}
      {activeTab === 'reconciliation' && (
        <div>
          {/* Controls & Search */}
          <div className="sa-controls-card">
            <div className="sa-search-wrap">
              <Search size={16} />
              <input
                type="text"
                placeholder="Search reconciliation records by business, UTR reference, refund ID, or banking provider ref..."
                value={reconSearch}
                onChange={(e) => setReconSearch(e.target.value)}
              />
            </div>

            <div className="sa-filter-group">
              <select
                className="sa-select"
                value={reconStatusFilter}
                onChange={(e) => setReconStatusFilter(e.target.value)}
              >
                <option value="all">All Reconciliation Statuses</option>
                <option value="Completed">Completed / Reconciled</option>
                <option value="Pending">Pending Audit Decision</option>
                <option value="Rejected">Rejected Claims</option>
              </select>
            </div>
          </div>

          {/* Reconciliation Table */}
          <div className="sa-table-card">
            <div className="sa-table-wrap">
              <table className="sa-table">
                <thead>
                  <tr>
                    <th>CUSTOMER &amp; BUSINESS</th>
                    <th>ORIGINAL DEPOSIT (UTR)</th>
                    <th>LIFETIME PAID</th>
                    <th>AD SPEND</th>
                    <th>REFUND REQUEST</th>
                    <th>BANK REVERSAL REF</th>
                    <th>RECONCILIATION STATE</th>
                  </tr>
                </thead>
                <tbody>
                  {reconLoading ? (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                        <RefreshCw size={20} className="sa-spin" style={{ margin: '0 auto 8px', display: 'block' }} />
                        Loading authoritative refund reconciliation ledger...
                      </td>
                    </tr>
                  ) : reconRecords.length === 0 ? (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                        No refund reconciliation records found.
                      </td>
                    </tr>
                  ) : (
                    reconRecords.map((r) => {
                      const deposit = r.original_deposit_info || {};
                      const isCompleted = r.refund_status === 'Completed';

                      return (
                        <tr key={r.refund_id}>
                          <td>
                            <div style={{ fontWeight: 700, color: '#0f172a' }}>{r.company_name}</div>
                            <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: 2 }}>
                              <code>{r.customer_id}</code> &bull; {r.contact_person}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                              📞 +91 {r.phone}
                            </div>
                          </td>

                          <td>
                            {r.verified_utr ? (
                              <div>
                                <code>{r.verified_utr}</code>
                                {deposit.receipt_number && (
                                  <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 2 }}>
                                    Receipt: {deposit.receipt_number}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span style={{ color: '#94a3b8', fontSize: '0.76rem' }}>Direct Account Credit</span>
                            )}
                          </td>

                          <td>
                            <div style={{ fontWeight: 800, color: '#059669', fontSize: '0.90rem' }}>
                              ₹{Number(r.total_lifetime_paid || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 2 }}>
                              Avail: ₹{Number(r.available_balance || 0).toFixed(2)}
                            </div>
                          </td>

                          <td>
                            <div style={{ fontWeight: 600, color: '#4f46e5', fontSize: '0.88rem' }}>
                              ₹{Number(r.total_ad_spent || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 2 }}>
                              Delivered Ad Spend
                            </div>
                          </td>

                          <td>
                            <div style={{ fontWeight: 800, color: '#e11d48', fontSize: '0.92rem' }}>
                              ₹{Number(r.requested_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 2 }}>
                              <code>{r.refund_id}</code>
                            </div>
                          </td>

                          <td>
                            {r.provider_ref ? (
                              <div>
                                <span className="sa-badge sa-badge-primary" style={{ fontFamily: 'monospace' }}>
                                  {r.provider_ref}
                                </span>
                                {r.reviewed_by && (
                                  <div style={{ fontSize: '0.70rem', color: '#64748b', marginTop: 2 }}>
                                    By: {r.reviewed_by}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span style={{ color: '#94a3b8', fontSize: '0.76rem' }}>Awaiting Approval</span>
                            )}
                          </td>

                          <td>
                            <span
                              className={`sa-status-pill ${
                                isCompleted
                                  ? 'sa-status-resolved'
                                  : r.refund_status === 'Rejected'
                                  ? 'sa-status-closed'
                                  : 'sa-status-open'
                              }`}
                            >
                              <ShieldCheck size={11} style={{ display: 'inline', marginRight: 4 }} />
                              {r.reconciliation_state}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {reconPagination.totalPages > 1 && (
              <div className="sa-pagination">
                <span>
                  Showing page {reconPagination.page} of {reconPagination.totalPages} ({reconPagination.total} audit records)
                </span>
                <div className="sa-page-controls">
                  <button
                    type="button"
                    className="sa-page-btn"
                    disabled={reconPagination.page <= 1}
                    onClick={() => setReconPagination((p) => ({ ...p, page: p.page - 1 }))}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="sa-page-btn"
                    disabled={reconPagination.page >= reconPagination.totalPages}
                    onClick={() => setReconPagination((p) => ({ ...p, page: p.page + 1 }))}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          4. INITIATE / ISSUE REFUND MODAL
          ===================================================================== */}
      {showCreateModal && (
        <div className="sa-modal-backdrop" onClick={() => setShowCreateModal(false)}>
          <div className="sa-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="sa-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 9,
                    background: '#fef2f2',
                    color: '#e11d48',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <RotateCcw size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>
                    Issue Customer Refund
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.76rem', color: '#64748b' }}>
                    Authoritative bank return with ledger deduction &amp; reconciliation
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="sa-modal-close-btn"
                onClick={() => setShowCreateModal(false)}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateRefund}>
              <div className="sa-modal-body">
                {/* Select Customer */}
                <div className="sa-form-group">
                  <label className="sa-form-label">
                    <Building2 size={13} /> Select Registered Paid Customer *
                  </label>
                  <select
                    required
                    className="sa-select"
                    style={{ width: '100%' }}
                    value={createForm.customerId}
                    onChange={(e) => handleSelectCustomerInModal(e.target.value)}
                  >
                    <option value="">-- Choose a customer who completed payment --</option>
                    {paidCustomers.map((c) => {
                      const bankCap = Number(c.eligible_bank_refundable || c.available_balance || 0);
                      return (
                        <option key={c.id} value={c.id}>
                          {c.company_name} (Bank Cap: ₹{bankCap.toFixed(2)} | Avail: ₹{Number(c.available_balance || 0).toFixed(2)}) &bull; +91 {c.phone}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Selected Customer Balance Card */}
                {selectedCustomerForRefund && (
                  <div
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: 10,
                      padding: '14px 16px',
                      marginBottom: 16,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.90rem' }}>
                          {selectedCustomerForRefund.company_name}
                        </div>
                        <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: 2 }}>
                          Contact: {selectedCustomerForRefund.contact_person} &bull; +91 {selectedCustomerForRefund.phone}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#059669', marginTop: 2 }}>
                          Total Lifetime Paid: ₹{Number(selectedCustomerForRefund.total_lifetime_paid || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.70rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
                          MAX BANK-REFUNDABLE
                        </div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#059669' }}>
                          ₹{Number(selectedCustomerForRefund.eligible_bank_refundable || selectedCustomerForRefund.available_balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </div>
                        <div style={{ fontSize: '0.70rem', color: '#64748b' }}>
                          Wallet Avail: ₹{Number(selectedCustomerForRefund.available_balance || 0).toFixed(2)}
                        </div>
                      </div>
                    </div>

                    {/* Verified Deposits Trace */}
                    {Array.isArray(selectedCustomerForRefund.verified_deposits) && selectedCustomerForRefund.verified_deposits.length > 0 && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                          VERIFIED BANK PAYMENTS ON FILE:
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {selectedCustomerForRefund.verified_deposits.map((dep, idx) => (
                            <span
                              key={idx}
                              className="sa-badge sa-badge-neutral"
                              style={{ cursor: 'pointer', fontSize: 10 }}
                              onClick={() => setCreateForm((f) => ({ ...f, originalTxRef: dep.utr_reference }))}
                              title="Click to select this UTR reference"
                            >
                              <code>{dep.utr_reference}</code> (₹{Number(dep.amount).toFixed(0)})
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Amount */}
                <div className="sa-form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label className="sa-form-label" style={{ margin: 0 }}>
                      <IndianRupee size={13} /> Refund Amount (₹) *
                    </label>
                    {selectedCustomerForRefund && Number(selectedCustomerForRefund.eligible_bank_refundable || selectedCustomerForRefund.available_balance) > 0 && (
                      <button
                        type="button"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#4f46e5',
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          padding: 0,
                        }}
                        onClick={() => {
                          const cap = Number(selectedCustomerForRefund.eligible_bank_refundable || selectedCustomerForRefund.available_balance);
                          setCreateForm((p) => ({ ...p, amount: String(cap) }));
                        }}
                      >
                        Refund Full Eligible Balance (₹{Number(selectedCustomerForRefund.eligible_bank_refundable || selectedCustomerForRefund.available_balance).toFixed(2)})
                      </button>
                    )}
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    placeholder="Enter amount to refund"
                    className="sa-form-input"
                    value={createForm.amount}
                    onChange={(e) => setCreateForm({ ...createForm, amount: e.target.value })}
                  />
                </div>

                {/* Mandatory Reason */}
                <div className="sa-form-group">
                  <label className="sa-form-label">
                    Mandatory Refund Reason *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Client requested surplus budget withdrawal, campaign cancelled, double deposit"
                    className="sa-form-input"
                    value={createForm.reason}
                    onChange={(e) => setCreateForm({ ...createForm, reason: e.target.value })}
                  />
                </div>

                {/* Original Payment / UTR Reference */}
                <div className="sa-form-group">
                  <label className="sa-form-label">
                    Original Payment UTR / Transaction Reference
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. UTR123456789 or BANK_REF_987"
                    className="sa-form-input"
                    value={createForm.originalTxRef}
                    onChange={(e) => setCreateForm({ ...createForm, originalTxRef: e.target.value })}
                  />
                </div>

                {/* Supporting Info */}
                <div className="sa-form-group">
                  <label className="sa-form-label">
                    Supporting Notes &amp; Bank Transfer Details
                  </label>
                  <textarea
                    rows={2}
                    placeholder="IMPS reference, beneficiary bank account confirmation, or ticket reference..."
                    className="sa-form-textarea"
                    value={createForm.supportingInfo}
                    onChange={(e) => setCreateForm({ ...createForm, supportingInfo: e.target.value })}
                  />
                </div>
              </div>

              <div className="sa-modal-footer">
                <button
                  type="button"
                  className="sa-btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingCreate}
                  className="sa-btn-primary"
                >
                  {submittingCreate ? 'Creating Request...' : 'Submit Refund Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          5. REJECTION REASON MODAL
          ===================================================================== */}
      {rejectingRefund && (
        <div className="sa-modal-backdrop" onClick={() => setRejectingRefund(null)}>
          <div className="sa-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="sa-modal-header">
              <div>
                <span className="sa-badge sa-badge-danger">Rejection Required</span>
                <h3 style={{ margin: '4px 0 0 0', fontSize: '1.1rem', fontWeight: 800 }}>
                  Reject Refund Request
                </h3>
              </div>
              <button
                type="button"
                className="sa-modal-close-btn"
                onClick={() => setRejectingRefund(null)}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmitReject}>
              <div className="sa-modal-body">
                <div
                  style={{
                    background: '#fff1f2',
                    border: '1px solid #fecdd3',
                    borderRadius: 8,
                    padding: '12px 14px',
                    marginBottom: 16,
                  }}
                >
                  <div style={{ fontSize: '0.86rem', color: '#9f1239', fontWeight: 700 }}>
                    Target Request: {rejectingRefund.id} ({rejectingRefund.company_name})
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 4 }}>
                    Requested Amount: <strong>₹{Number(rejectingRefund.amount || 0).toFixed(2)}</strong>
                  </div>
                </div>

                <div className="sa-form-group">
                  <label className="sa-form-label">
                    Mandatory Rejection Reason *
                  </label>
                  <textarea
                    rows={4}
                    required
                    className="sa-form-textarea"
                    placeholder="e.g. Original payment already consumed in ad spend, invalid banking details provided, request unauthorized..."
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                  />
                </div>
              </div>

              <div className="sa-modal-footer">
                <button
                  type="button"
                  className="sa-btn-secondary"
                  onClick={() => setRejectingRefund(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReject || !rejectionReason.trim()}
                  className="sa-btn-danger"
                >
                  {submittingReject ? 'Rejecting...' : 'Confirm Rejection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
