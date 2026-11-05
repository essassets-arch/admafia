import React, { useState } from 'react';
import { X, CreditCard } from 'lucide-react';
import Swal from 'sweetalert2';
import crmApi from '../services/crmApi';
import adminAuthApi from '../services/adminAuthApi';

const formatINR = (val) => {
  const n = Number(val);
  if (!Number.isFinite(n)) return '₹0';
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
};

export default function SalesAddMoneyModal({ customer, onClose, onSuccess }) {
  const currentUser = adminAuthApi.getCurrentUser();
  const defaultSalesName = currentUser?.fullName || currentUser?.username || 'Sales Executive';

  const [amount, setAmount] = useState('1500');
  const [paymentMethod, setPaymentMethod] = useState('Instant UPI / GPay Transfer');
  const [referenceUtr, setReferenceUtr] = useState('');
  const [salesPersonName, setSalesPersonName] = useState(defaultSalesName);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!customer) return null;

  const currentBal = Number(customer.balance ?? customer.walletBalance ?? 0);
  const displayName = customer.companyName || customer.name || customer.contactPerson || customer.contact || `@${customer.username || 'user'}`;
  const displayPhone = customer.phone || 'N/A';

  const PRESETS = [
    { amt: 600, label: '₹600', runway: '+2 Days Runtime' },
    { amt: 1500, label: '₹1,500', runway: '+5 Days Runtime' },
    { amt: 3000, label: '₹3,000', runway: '+10 Days Runtime' },
    { amt: 6000, label: '₹6,000', runway: '+20 Days Runtime' },
  ];

  const handleGenerateOfflineRef = () => {
    const cleanMode = paymentMethod.toLowerCase().includes('cash')
      ? 'CASH'
      : paymentMethod.toLowerCase().includes('cheque')
      ? 'CHQ'
      : 'DIR';
    const rand = Math.random().toString(36).substr(2, 6).toUpperCase();
    setReferenceUtr(`${cleanMode}-${Date.now().toString().slice(-6)}-${rand}`);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    const numAmt = parseFloat(amount);
    if (!numAmt || numAmt < 300) {
      setErrorMsg('Minimum wallet credit amount is ₹300.');
      return;
    }
    if (!referenceUtr.trim()) {
      setErrorMsg('Transaction reference UTR or Offline receipt ID is mandatory.');
      return;
    }

    const confirm = await Swal.fire({
      title: 'Confirm Client Wallet Credit?',
      html: `
        <div style="text-align: left; font-size: 0.90rem; line-height: 1.7; color: #334155;">
          <div>Customer: <strong style="color: #0f172a;">${displayName}</strong> (+91 ${displayPhone})</div>
          <div>Credit Amount: <strong style="color: #059669; font-size: 1.15rem;">₹${numAmt.toLocaleString('en-IN')}</strong></div>
          <div>Payment Mode: <strong>${paymentMethod}</strong></div>
          <div>Reference UTR: <code style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-weight: 700;">${referenceUtr.trim()}</code></div>
          <div>Sales Executive: <strong>${salesPersonName.trim()}</strong></div>
          <div style="margin-top: 10px; padding: 10px; background: #ecfdf5; border-radius: 8px; color: #065f46; font-size: 0.82rem;">
            ✓ Funds will immediately reflect in client's ad workspace and will be recorded in the Super Admin ledger under your name.
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

    setSubmitting(true);
    try {
      const res = await crmApi.salesTopUpWallet({
        customerId: customer.id,
        phone: customer.phone,
        amount: numAmt,
        referenceUtr: referenceUtr.trim(),
        paymentMethod,
        salesPersonName: salesPersonName.trim(),
        salesPersonId: currentUser?.id || 'sales',
        notes: notes.trim(),
      });

      if (res && res.ok) {
        await Swal.fire({
          icon: 'success',
          title: 'Wallet Credited Successfully! 🚀',
          html: `
            <div style="text-align: left; font-size: 0.90rem; line-height: 1.7;">
              <p>₹<strong>${numAmt.toLocaleString('en-IN')}</strong> added to <strong>${displayName}</strong>'s wallet.</p>
              <div>New Live Balance: <strong style="color: #059669; font-size: 1.1rem;">₹${Number(res.newBalance || (currentBal + numAmt)).toLocaleString('en-IN')}</strong></div>
              <div style="margin-top: 8px; font-size: 0.80rem; color: #64748b;">
                Logged in Super Admin audit ledger as credited by <strong>${salesPersonName}</strong>.
              </div>
            </div>
          `,
          confirmButtonColor: '#059669',
        });

        if (onSuccess) {
          onSuccess(res.customer || {
            ...customer,
            balance: res.newBalance,
            walletBalance: res.newBalance,
            paymentStatus: 'paid',
            payment_status: 'paid',
            runwayDays: Math.floor((res.newBalance || 0) / (customer.dailyPacing || 300)),
          });
        }
        onClose();
      } else {
        throw new Error(res?.error || 'Failed to credit wallet');
      }
    } catch (err) {
      console.error('[SalesAddMoneyModal]', err);
      setErrorMsg(err.message || 'Failed to top up wallet');
      Swal.fire({
        icon: 'error',
        title: 'Top-Up Failed',
        text: err.message || 'An error occurred while crediting the client wallet.',
        confirmButtonColor: '#4f46e5',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="sales-modal-overlay" onClick={onClose}>
      <div className="sales-modal-card" style={{ maxWidth: 540, width: '95%' }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e2e8f0', paddingBottom: 12, marginBottom: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span className="desk-pill pill-emerald" style={{ fontSize: '0.70rem', fontWeight: 800 }}>
                💳 Sales Assisted Top-Up
              </span>
              <span className="desk-pill" style={{ background: '#f1f5f9', color: '#475569', fontSize: '0.70rem', fontWeight: 700 }}>
                Instant Activation
              </span>
            </div>
            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
              Add Money to Client Wallet
            </h3>
            <div style={{ fontSize: '0.80rem', color: '#64748b', marginTop: 3 }}>
              Client: <strong style={{ color: '#0f172a' }}>{displayName}</strong> • +91 {displayPhone}
            </div>
          </div>
          <button type="button" className="desk-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Current Balance Banner */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Current Balance</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 900, color: currentBal > 0 ? '#059669' : '#e11d48' }}>
              {formatINR(currentBal)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Runway</div>
            <div style={{ fontSize: '0.90rem', fontWeight: 800, color: currentBal > 0 ? '#059669' : '#e11d48' }}>
              {Math.floor(currentBal / (customer.dailyPacing || 300))} Days
            </div>
          </div>
        </div>

        {errorMsg && (
          <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', color: '#be123c', padding: '10px 14px', borderRadius: 8, fontSize: '0.82rem', marginBottom: 14 }}>
            ⚠️ {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Amount Presets */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: 6 }}>
              Select Top-Up Amount (Min. ₹300) <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 8 }}>
              {PRESETS.map((p) => {
                const isSelected = String(amount) === String(p.amt);
                return (
                  <button
                    key={p.amt}
                    type="button"
                    onClick={() => setAmount(String(p.amt))}
                    style={{
                      border: isSelected ? '2px solid #059669' : '1px solid #cbd5e1',
                      background: isSelected ? '#ecfdf5' : '#ffffff',
                      color: isSelected ? '#065f46' : '#1e293b',
                      borderRadius: 8,
                      padding: '8px 4px',
                      cursor: 'pointer',
                      textAlign: 'center',
                      fontWeight: 800,
                      fontSize: '0.86rem',
                    }}
                  >
                    <div>{p.label}</div>
                    <div style={{ fontSize: '0.66rem', color: isSelected ? '#047857' : '#64748b', fontWeight: 600 }}>{p.runway}</div>
                  </button>
                );
              })}
            </div>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: 9, color: '#64748b', fontWeight: 700 }}>₹</span>
              <input
                type="number"
                min="300"
                step="1"
                placeholder="Or enter custom amount (e.g. 1500)"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                style={{ width: '100%', padding: '9px 12px 9px 28px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: '0.90rem', fontWeight: 700 }}
                required
              />
            </div>
          </div>

          {/* Payment Method */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: 6 }}>
              Payment Mode Received <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: '0.86rem' }}
            >
              <option value="Instant UPI / GPay Transfer">Instant UPI (Google Pay / PhonePe / Paytm)</option>
              <option value="Corporate IMPS / Direct Deposit">Bank IMPS / NEFT Transfer</option>
              <option value="Direct Cash / Offline Deposit">Direct Cash Deposit</option>
              <option value="Cheque Deposit">Cheque Deposit</option>
              <option value="Payment Gateway Offline Manual">Payment Gateway Link Settled</option>
            </select>
          </div>

          {/* Reference UTR */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155' }}>
                Bank Reference UTR / Transaction ID <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <button
                type="button"
                onClick={handleGenerateOfflineRef}
                style={{ background: 'none', border: 'none', color: '#4f46e5', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}
              >
                Auto-Generate Offline Ref
              </button>
            </div>
            <input
              type="text"
              placeholder="e.g. 431920849102 or CASH-REC-01"
              value={referenceUtr}
              onChange={(e) => setReferenceUtr(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: '0.86rem', fontFamily: 'monospace', fontWeight: 700 }}
              required
            />
          </div>

          {/* Sales Person Identity */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: 6 }}>
              Credited By (Sales Executive Identity)
            </label>
            <input
              type="text"
              value={salesPersonName}
              onChange={(e) => setSalesPersonName(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: '0.86rem', background: '#f8fafc' }}
              required
            />
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: 6 }}>
              Remarks / Internal Notes (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Client confirmed on WhatsApp; 5 days Meta Ads"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: '0.86rem' }}
            />
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button
              type="button"
              className="desk-action-btn"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="desk-action-btn"
              style={{ background: '#059669', color: '#ffffff', borderColor: '#047857', fontWeight: 800, padding: '8px 16px' }}
              disabled={submitting}
            >
              {submitting ? 'Crediting Wallet...' : `Confirm & Add ₹${Number(amount || 0).toLocaleString('en-IN')}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

