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
} from 'lucide-react';
import Swal from 'sweetalert2';
import superadminApi from '../services/superadminApi';

export default function SuperAdminTopupsDesk() {
  const [topups, setTopups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });

  // Rejection Modal
  const [rejectingTopup, setRejectingTopup] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [submittingReject, setSubmittingReject] = useState(false);

  // Manual Credit Modal
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualForm, setManualForm] = useState({
    customerId: '',
    amount: '',
    referenceUtr: '',
    paymentMethod: 'Bank NEFT / RTGS Transfer',
    description: 'Super Admin Authorized Deposit',
  });
  const [submittingManual, setSubmittingManual] = useState(false);

  const fetchTopups = useCallback(async () => {
    try {
      setRefreshing(true);
      const res = await superadminApi.getTopups({
        status: statusFilter,
        search,
        page: pagination.page,
        limit: 20,
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

  useEffect(() => {
    fetchTopups();
  }, [fetchTopups]);

  // Handle Approve Top-up
  const handleApproveTopup = async (topup) => {
    const confirm = await Swal.fire({
      title: 'Approve & Credit Top-Up?',
      html: `
        <div style="text-align: left; font-size: 0.90rem;">
          <div>Business: <strong>${topup.company_name}</strong></div>
          <div>Credit Amount: <strong style="color: #059669;">₹${Number(topup.amount).toFixed(2)}</strong></div>
          <div>Bank UTR: <strong style="font-family: monospace;">${topup.reference_utr}</strong></div>
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
        Swal.fire({
          icon: 'success',
          title: 'Wallet Credited! 🚀',
          text: `₹${Number(topup.amount).toFixed(2)} has been added to ${topup.company_name}'s wallet.`,
        });
        fetchTopups();
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
          text: 'Request marked as rejected with recorded reason.',
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
      Swal.fire({ icon: 'warning', title: 'Customer ID is required.' });
      return;
    }
    if (!amt || amt <= 0) {
      Swal.fire({ icon: 'warning', title: 'Valid credit amount is required.' });
      return;
    }
    if (!manualForm.referenceUtr.trim()) {
      Swal.fire({ icon: 'warning', title: 'Transaction UTR is required.' });
      return;
    }

    setSubmittingManual(true);
    try {
      const res = await superadminApi.manualCredit({
        ...manualForm,
        amount: amt,
        adminName: 'Super Admin',
      });
      if (res && res.ok) {
        setShowManualModal(false);
        setManualForm({
          customerId: '',
          amount: '',
          referenceUtr: '',
          paymentMethod: 'Bank NEFT / RTGS Transfer',
          description: 'Super Admin Authorized Deposit',
        });
        fetchTopups();
        Swal.fire({
          icon: 'success',
          title: 'Manual Credit Applied!',
          text: `Wallet credited with ₹${amt.toFixed(2)}.`,
        });
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Credit Failed', text: err.message });
    } finally {
      setSubmittingManual(false);
    }
  };

  return (
    <div className="sa-desk-content">
      {/* 1. Header */}
      <div className="sa-page-header">
        <div>
          <h1>Account Top-Up &amp; Verification</h1>
          <p>
            Verify incoming customer top-up payments, cross-reference bank UTR numbers, credit marketing wallets atomically, and execute authorized manual deposits.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            className="sa-btn-primary"
            onClick={() => setShowManualModal(true)}
          >
            <PlusCircle size={15} />
            <span>Manual Wallet Credit</span>
          </button>
          <button
            type="button"
            className="sa-btn-secondary"
            onClick={fetchTopups}
            disabled={refreshing}
          >
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
            <span>{refreshing ? 'Syncing...' : 'Live Refresh'}</span>
          </button>
        </div>
      </div>

      {/* 2. Controls & Filters */}
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
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Top-Up Statuses</option>
            <option value="Pending">Pending Review</option>
            <option value="Approved">Approved &amp; Credited</option>
            <option value="Rejected">Rejected</option>
          </select>
        </div>
      </div>

      {/* 3. Top-ups Table */}
      <div className="sa-table-card">
        <div style={{ overflowX: 'auto' }}>
          <table className="sa-table">
            <thead>
              <tr>
                <th style={{ width: '14%' }}>Request ID &amp; Date</th>
                <th style={{ width: '22%' }}>Business Account</th>
                <th style={{ width: '14%' }}>Top-Up Amount</th>
                <th style={{ width: '18%' }}>UTR Reference</th>
                <th style={{ width: '14%' }}>Payment Mode</th>
                <th style={{ width: '10%' }}>Status</th>
                <th style={{ width: '8%', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
                    <RefreshCw size={20} className="spin" style={{ margin: '0 auto 8px' }} />
                    <div>Loading top-up requests...</div>
                  </td>
                </tr>
              ) : topups.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>
                    <CreditCard size={32} style={{ marginBottom: 8 }} />
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>No top-up requests found</div>
                    <div style={{ fontSize: '0.80rem' }}>No requests match the current filter selection.</div>
                  </td>
                </tr>
              ) : (
                topups.map((tp) => (
                  <tr key={tp.id}>
                    <td>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.80rem', fontWeight: 700, color: '#4f46e5' }}>
                        {tp.id}
                      </span>
                      <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: 2 }}>
                        {new Date(tp.created_at).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </div>
                    </td>

                    <td>
                      <strong style={{ color: '#0f172a' }}>{tp.company_name}</strong>
                      <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                        {tp.contact_person} • 📞 {tp.phone}
                      </div>
                      <div style={{ fontSize: '0.70rem', color: '#059669', marginTop: 2 }}>
                        Current Wallet: ₹{Number(tp.available_balance || 0).toFixed(2)}
                      </div>
                    </td>

                    <td>
                      <div style={{ fontWeight: 800, fontSize: '1rem', color: '#059669' }}>
                        +₹{Number(tp.amount).toFixed(2)}
                      </div>
                    </td>

                    <td>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.82rem', background: '#f1f5f9', padding: '3px 8px', borderRadius: 4, fontWeight: 700 }}>
                        {tp.reference_utr}
                      </span>
                      {tp.payment_evidence_url && (
                        <div style={{ marginTop: 4 }}>
                          <a
                            href={tp.payment_evidence_url}
                            target="_blank"
                            rel="noreferrer"
                            style={{ fontSize: '0.72rem', color: '#4f46e5', textDecoration: 'underline' }}
                          >
                            View Evidence Receipt
                          </a>
                        </div>
                      )}
                    </td>

                    <td>
                      <div style={{ fontSize: '0.80rem', color: '#334155', fontWeight: 600 }}>
                        {tp.payment_method}
                      </div>
                      {tp.notes && (
                        <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 2 }}>
                          {tp.notes}
                        </div>
                      )}
                      {tp.rejection_reason && (
                        <div style={{ fontSize: '0.72rem', color: '#dc2626', marginTop: 2, fontStyle: 'italic' }}>
                          Reason: "{tp.rejection_reason}"
                        </div>
                      )}
                    </td>

                    <td>
                      <span
                        className={`sa-pill ${
                          tp.status === 'Approved'
                            ? 'sa-pill-green'
                            : tp.status === 'Pending'
                            ? 'sa-pill-amber'
                            : 'sa-pill-rose'
                        }`}
                      >
                        {tp.status}
                      </span>
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      {tp.status === 'Pending' ? (
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <button
                            type="button"
                            className="sa-btn-success"
                            style={{ padding: '5px 10px', fontSize: '0.74rem' }}
                            onClick={() => handleApproveTopup(tp)}
                            title="Verify Bank UTR & Credit Wallet"
                          >
                            <CheckCircle2 size={13} />
                            <span>Credit</span>
                          </button>
                          <button
                            type="button"
                            className="sa-btn-danger"
                            style={{ padding: '5px 10px', fontSize: '0.74rem' }}
                            onClick={() => {
                              setRejectingTopup(tp);
                              setRejectionReason('');
                            }}
                            title="Reject Request"
                          >
                            <XCircle size={13} />
                            <span>Reject</span>
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                          {tp.processed_by ? `By ${tp.processed_by}` : 'Processed'}
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

      {/* 4. Rejection Reason Modal */}
      {rejectingTopup && (
        <div className="sa-modal-backdrop" onClick={() => setRejectingTopup(null)}>
          <div className="sa-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="sa-modal-header">
              <div>
                <span className="sa-pill sa-pill-rose">Top-Up Verification</span>
                <h3 style={{ margin: '4px 0 0 0', fontSize: '1.1rem', fontWeight: 800 }}>
                  Reject Top-Up Request
                </h3>
              </div>
              <button
                type="button"
                className="sa-footer-btn"
                style={{ width: 'auto', padding: 6, borderRadius: '50%' }}
                onClick={() => setRejectingTopup(null)}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmitReject}>
              <div className="sa-modal-body">
                <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
                  <div style={{ fontSize: '0.82rem', color: '#9f1239' }}>
                    Rejecting top-up of <strong>₹{Number(rejectingTopup.amount).toFixed(2)}</strong> (UTR: {rejectingTopup.reference_utr}) for <strong>{rejectingTopup.company_name}</strong>.
                  </div>
                </div>

                <div className="sa-form-group">
                  <label className="sa-form-label">Mandatory Rejection Reason *</label>
                  <textarea
                    rows={4}
                    required
                    className="sa-form-textarea"
                    placeholder="e.g. Bank UTR reference not reflected in statement, duplicate submission, incorrect payment mode..."
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

      {/* 5. Manual Wallet Credit Modal */}
      {showManualModal && (
        <div className="sa-modal-backdrop" onClick={() => setShowManualModal(false)}>
          <div className="sa-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="sa-modal-header">
              <div>
                <span className="sa-pill sa-pill-indigo">Authorized Financial Action</span>
                <h3 style={{ margin: '4px 0 0 0', fontSize: '1.1rem', fontWeight: 800 }}>
                  Manual Wallet Deposit
                </h3>
              </div>
              <button
                type="button"
                className="sa-footer-btn"
                style={{ width: 'auto', padding: 6, borderRadius: '50%' }}
                onClick={() => setShowManualModal(false)}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleManualCredit}>
              <div className="sa-modal-body">
                <div className="sa-form-group">
                  <label className="sa-form-label">Target Customer ID *</label>
                  <input
                    type="text"
                    required
                    className="sa-form-input"
                    placeholder="e.g. cust_1793350779161_..."
                    value={manualForm.customerId}
                    onChange={(e) => setManualForm({ ...manualForm, customerId: e.target.value })}
                  />
                </div>

                <div className="sa-form-group">
                  <label className="sa-form-label">Deposit Amount (INR) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    className="sa-form-input"
                    placeholder="0.00"
                    value={manualForm.amount}
                    onChange={(e) => setManualForm({ ...manualForm, amount: e.target.value })}
                  />
                </div>

                <div className="sa-form-group">
                  <label className="sa-form-label">Payment UTR / Bank Reference *</label>
                  <input
                    type="text"
                    required
                    className="sa-form-input"
                    placeholder="NEFT/IMPS/UPI Bank UTR Number"
                    value={manualForm.referenceUtr}
                    onChange={(e) => setManualForm({ ...manualForm, referenceUtr: e.target.value })}
                  />
                </div>

                <div className="sa-form-group">
                  <label className="sa-form-label">Payment Method</label>
                  <select
                    className="sa-select"
                    style={{ width: '100%' }}
                    value={manualForm.paymentMethod}
                    onChange={(e) => setManualForm({ ...manualForm, paymentMethod: e.target.value })}
                  >
                    <option value="Bank NEFT / RTGS Transfer">Bank NEFT / RTGS Transfer</option>
                    <option value="Corporate IMPS / Direct Deposit">Corporate IMPS / Direct Deposit</option>
                    <option value="Razorpay Corporate Gateway">Razorpay Corporate Gateway</option>
                    <option value="Promotional Goodwill Credit">Promotional Goodwill Credit</option>
                  </select>
                </div>

                <div className="sa-form-group">
                  <label className="sa-form-label">Description / Internal Reference</label>
                  <input
                    type="text"
                    className="sa-form-input"
                    placeholder="e.g. Advance ad budget payment credited by finance"
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
                >
                  {submittingManual ? 'Crediting...' : 'Credit Customer Wallet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

