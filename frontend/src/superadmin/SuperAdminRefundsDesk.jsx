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
} from 'lucide-react';
import Swal from 'sweetalert2';
import superadminApi from '../services/superadminApi';

export default function SuperAdminRefundsDesk() {
  const [refunds, setRefunds] = useState([]); ``
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });

  // Rejection Modal
  const [rejectingRefund, setRejectingRefund] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [submittingReject, setSubmittingReject] = useState(false);

  // Create Refund Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    customerId: '',
    amount: '',
    reason: '',
    supportingInfo: '',
    originalTxRef: '',
  });
  const [submittingCreate, setSubmittingCreate] = useState(false);

  const fetchRefunds = useCallback(async () => {
    try {
      setRefreshing(true);
      const res = await superadminApi.getRefunds({
        status: statusFilter,
        search,
        page: pagination.page,
        limit: 20,
      });
      if (res && res.ok) {
        setRefunds(res.refunds || []);
        if (res.pagination) setPagination(res.pagination);
      }
    } catch (err) {
      console.error('Failed to load refunds:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, search, pagination.page]);

  useEffect(() => {
    fetchRefunds();
  }, [fetchRefunds]);

  // Handle Approve Refund (Atomic Transaction)
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
        <div style="text-align: left; font-size: 0.90rem; line-height: 1.5;">
          <div>Business: <strong>${refund.company_name}</strong></div>
          <div>Refund Amount: <strong style="color: #dc2626;">₹${refundAmt.toFixed(2)}</strong></div>
          <div>Current Balance: <strong>₹${currentBal.toFixed(2)}</strong></div>
          <div style="margin-top: 10px; padding: 10px; background: #fff1f2; border-radius: 8px; color: #9f1239; font-size: 0.82rem;">
            ⚠️ This will atomically deduct ₹${refundAmt.toFixed(2)} from the customer's wallet and generate an official refund debit in the transaction ledger.
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
          text: `Refund completed. Provider Ref: ${res.providerRef || 'N/A'}`,
        });
        fetchRefunds();
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Refund Approval Failed', text: err.message });
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
        Swal.fire({
          icon: 'info',
          title: 'Refund Rejected',
          text: 'The refund request has been rejected and logged in the audit trail.',
        });
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Rejection Failed', text: err.message });
    } finally {
      setSubmittingReject(false);
    }
  };

  // Submit Create Refund
  const handleCreateRefund = async (e) => {
    e.preventDefault();
    const amt = parseFloat(createForm.amount);
    if (!createForm.customerId.trim()) {
      Swal.fire({ icon: 'warning', title: 'Customer ID is required.' });
      return;
    }
    if (!amt || amt <= 0) {
      Swal.fire({ icon: 'warning', title: 'Enter a valid refund amount.' });
      return;
    }
    if (!createForm.reason.trim()) {
      Swal.fire({ icon: 'warning', title: 'Refund reason is mandatory.' });
      return;
    }

    setSubmittingCreate(true);
    try {
      const res = await superadminApi.createRefund({
        ...createForm,
        amount: amt,
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
        fetchRefunds();
        Swal.fire({ icon: 'success', title: 'Refund Request Created', text: 'Submitted to review queue.' });
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Creation Failed', text: err.message });
    } finally {
      setSubmittingCreate(false);
    }
  };

  return (
    <div>
      {/* 1. Page Header */}
      <div className="sa-page-header">
        <div>
          <h1>Check Refunds &amp; Reversals</h1>
          <p>
            Verify incoming refund requests, validate original transactions, check current wallet liabilities, and process atomic wallet deductions with full audit compliance.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            className="sa-btn-primary"
            onClick={() => setShowCreateModal(true)}
          >
            <PlusCircle size={15} />
            <span>Initiate Refund</span>
          </button>
          <button
            type="button"
            className="sa-btn-secondary"
            onClick={fetchRefunds}
            disabled={refreshing}
          >
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
            <span>{refreshing ? 'Syncing...' : 'Live Refresh'}</span>
          </button>
        </div>
      </div>

      {/* 2. Controls & Filter */}
      <div className="sa-controls-card">
        <div className="sa-search-box">
          <Search size={16} className="sa-search-icon" />
          <input
            type="text"
            className="sa-search-input"
            placeholder="Search by company name, refund ID, original UTR, or reason..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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
            <option value="Completed">Completed / Approved</option>
            <option value="Rejected">Rejected</option>
          </select>
        </div>
      </div>

      {/* 3. Refunds Table */}
      <div className="sa-table-card">
        <div style={{ overflowX: 'auto' }}>
          <table className="sa-table">
            <thead>
              <tr>
                <th style={{ width: '14%' }}>Refund ID &amp; Date</th>
                <th style={{ width: '22%' }}>Business Account</th>
                <th style={{ width: '12%' }}>Requested Amount</th>
                <th style={{ width: '12%' }}>Wallet Balance</th>
                <th style={{ width: '22%' }}>Reason &amp; Original Ref</th>
                <th style={{ width: '10%' }}>Status</th>
                <th style={{ width: '8%', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
                    <RefreshCw size={20} className="spin" style={{ margin: '0 auto 8px' }} />
                    <div>Loading refund requests...</div>
                  </td>
                </tr>
              ) : refunds.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>
                    <RotateCcw size={32} style={{ marginBottom: 8 }} />
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>No refund requests found</div>
                    <div style={{ fontSize: '0.80rem' }}>No items match the current filter selection.</div>
                  </td>
                </tr>
              ) : (
                refunds.map((rf) => (
                  <tr key={rf.id}>
                    <td>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.80rem', fontWeight: 700, color: '#4f46e5' }}>
                        {rf.id}
                      </span>
                      <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: 2 }}>
                        {new Date(rf.created_at).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </div>
                    </td>

                    <td>
                      <strong style={{ color: '#0f172a' }}>{rf.company_name}</strong>
                      <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                        {rf.contact_person} • 📞 {rf.phone}
                      </div>
                    </td>

                    <td>
                      <div style={{ fontWeight: 800, fontSize: '0.96rem', color: '#e11d48' }}>
                        ₹{Number(rf.amount).toFixed(2)}
                      </div>
                    </td>

                    <td>
                      <div style={{ fontWeight: 700, color: Number(rf.available_balance) >= Number(rf.amount) ? '#059669' : '#dc2626' }}>
                        ₹{Number(rf.available_balance || 0).toFixed(2)}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                        {Number(rf.available_balance) >= Number(rf.amount) ? 'Sufficient' : 'Low Balance'}
                      </div>
                    </td>

                    <td>
                      <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#0f172a' }}>
                        {rf.reason}
                      </div>
                      {rf.original_tx_ref && (
                        <div style={{ fontSize: '0.72rem', color: '#64748b', fontFamily: 'monospace', marginTop: 2 }}>
                          UTR: {rf.original_tx_ref}
                        </div>
                      )}
                      {rf.rejection_reason && (
                        <div style={{ fontSize: '0.72rem', color: '#dc2626', marginTop: 2, fontStyle: 'italic' }}>
                          Rejected: "{rf.rejection_reason}"
                        </div>
                      )}
                    </td>

                    <td>
                      <span
                        className={`sa-pill ${rf.status === 'Completed' || rf.status === 'Approved'
                            ? 'sa-pill-green'
                            : rf.status === 'Pending'
                              ? 'sa-pill-amber'
                              : 'sa-pill-rose'
                          }`}
                      >
                        {rf.status}
                      </span>
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      {rf.status === 'Pending' ? (
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <button
                            type="button"
                            className="sa-btn-success"
                            style={{ padding: '5px 10px', fontSize: '0.74rem' }}
                            onClick={() => handleApproveRefund(rf)}
                            title="Approve Refund & Deduct Balance"
                          >
                            <CheckCircle2 size={13} />
                            <span>Approve</span>
                          </button>
                          <button
                            type="button"
                            className="sa-btn-danger"
                            style={{ padding: '5px 10px', fontSize: '0.74rem' }}
                            onClick={() => {
                              setRejectingRefund(rf);
                              setRejectionReason('');
                            }}
                            title="Reject Refund"
                          >
                            <XCircle size={13} />
                            <span>Reject</span>
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                          {rf.reviewed_by ? `By ${rf.reviewed_by}` : 'Processed'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Mandatory Rejection Reason Modal */}
      {rejectingRefund && (
        <div className="sa-modal-backdrop" onClick={() => setRejectingRefund(null)}>
          <div className="sa-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="sa-modal-header">
              <div>
                <span className="sa-pill sa-pill-rose">Policy Governance</span>
                <h3 style={{ margin: '4px 0 0 0', fontSize: '1.1rem', fontWeight: 800 }}>
                  Reject Refund Request
                </h3>
              </div>
              <button
                type="button"
                className="sa-footer-btn"
                style={{ width: 'auto', padding: 6, borderRadius: '50%' }}
                onClick={() => setRejectingRefund(null)}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmitReject}>
              <div className="sa-modal-body">
                <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
                  <div style={{ fontSize: '0.82rem', color: '#9f1239' }}>
                    Rejecting refund for <strong>{rejectingRefund.company_name}</strong> (Amount: ₹{Number(rejectingRefund.amount).toFixed(2)}).
                  </div>
                </div>

                <div className="sa-form-group">
                  <label className="sa-form-label">Mandatory Rejection Reason *</label>
                  <textarea
                    rows={4}
                    required
                    className="sa-form-textarea"
                    placeholder="Provide specific reason for rejection (e.g. Services already rendered, duplicate submission, non-refundable campaign ad spend)..."
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
                  {submittingReject ? 'Recording...' : 'Confirm Rejection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Create Refund Modal */}
      {showCreateModal && (
        <div className="sa-modal-backdrop" onClick={() => setShowCreateModal(false)}>
          <div className="sa-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="sa-modal-header">
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Initiate Refund Request</h3>
              <button
                type="button"
                className="sa-footer-btn"
                style={{ width: 'auto', padding: 6, borderRadius: '50%' }}
                onClick={() => setShowCreateModal(false)}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateRefund}>
              <div className="sa-modal-body">
                <div className="sa-form-group">
                  <label className="sa-form-label">Customer ID *</label>
                  <input
                    type="text"
                    required
                    className="sa-form-input"
                    placeholder="e.g. cust_1793350779161_..."
                    value={createForm.customerId}
                    onChange={(e) => setCreateForm({ ...createForm, customerId: e.target.value })}
                  />
                </div>

                <div className="sa-form-group">
                  <label className="sa-form-label">Refund Amount (INR) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    className="sa-form-input"
                    placeholder="0.00"
                    value={createForm.amount}
                    onChange={(e) => setCreateForm({ ...createForm, amount: e.target.value })}
                  />
                </div>

                <div className="sa-form-group">
                  <label className="sa-form-label">Original Payment Reference / UTR</label>
                  <input
                    type="text"
                    className="sa-form-input"
                    placeholder="Original payment UTR or Razorpay ID"
                    value={createForm.originalTxRef}
                    onChange={(e) => setCreateForm({ ...createForm, originalTxRef: e.target.value })}
                  />
                </div>

                <div className="sa-form-group">
                  <label className="sa-form-label">Reason for Refund *</label>
                  <textarea
                    rows={3}
                    required
                    className="sa-form-textarea"
                    placeholder="Customer cancellation, disputed charge, service modification..."
                    value={createForm.reason}
                    onChange={(e) => setCreateForm({ ...createForm, reason: e.target.value })}
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
                  {submittingCreate ? 'Initiating...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
