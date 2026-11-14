import { TrendingUp, Zap, Calendar, X, ArrowRight, ShieldCheck, Sparkles, Building2, Briefcase, MapPin, Mail, Phone, Globe, User, CheckCircle2, Layers, Check, Shield } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import { crmApi } from '../services/crmApi';
import { evaluateCustomerProfileCompletion, sanitizeCustomerProfileFields } from '../utils/profileCompletion';

// Reusable SweetAlert2-Style Popup Dialog
export function SweetAlertModal({
  alertState,
  onClose,
}) {
  if (!alertState) return null;

  const {
    type = 'warning', // 'warning' | 'error' | 'success'
    title = 'Notice',
    message = '',
    confirmText = 'OK',
    onConfirm,
    secondaryText,
    onSecondary,
  } = alertState;

  const palette = {
    warning: {
      ringBorder: '#f59e0b',
      ringBg: '#fffbeb',
      halo: 'rgba(245, 158, 11, 0.16)',
      iconColor: '#d97706',
      btnBg: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
      btnShadow: '0 8px 20px -4px rgba(79, 70, 229, 0.45)',
    },
    error: {
      ringBorder: '#ef4444',
      ringBg: '#fef2f2',
      halo: 'rgba(239, 68, 68, 0.15)',
      iconColor: '#dc2626',
      btnBg: 'linear-gradient(135deg, #e11d48 0%, #f43f5e 100%)',
      btnShadow: '0 8px 20px -4px rgba(225, 29, 72, 0.4)',
    },
    success: {
      ringBorder: '#10b981',
      ringBg: '#ecfdf5',
      halo: 'rgba(16, 185, 129, 0.16)',
      iconColor: '#059669',
      btnBg: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
      btnShadow: '0 8px 20px -4px rgba(16, 185, 129, 0.4)',
    },
  }[type] || {
    ringBorder: '#f59e0b',
    ringBg: '#fffbeb',
    halo: 'rgba(245, 158, 11, 0.16)',
    iconColor: '#d97706',
    btnBg: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
    btnShadow: '0 8px 20px -4px rgba(79, 70, 229, 0.45)',
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(6px)',
        zIndex: 1000005,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'modalFadeIn 0.16s ease-out',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '24px',
          width: '100%',
          maxWidth: '410px',
          padding: '32px 28px 26px',
          textAlign: 'center',
          boxShadow: '0 25px 60px -12px rgba(15, 23, 42, 0.4), 0 0 0 1px rgba(226, 232, 240, 0.9)',
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
          color: '#0f172a',
          position: 'relative',
          animation: 'modalScaleIn 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* SweetAlert2 Animated Icon Ring */}
        <div
          style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            border: `4px solid ${palette.ringBorder}`,
            background: palette.ringBg,
            boxShadow: `0 0 0 8px ${palette.halo}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
            color: palette.iconColor,
          }}
        >
          {type === 'success' ? (
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : type === 'error' ? (
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            <span style={{ fontSize: '2.6rem', fontWeight: 900, lineHeight: 1, fontFamily: 'Georgia, serif' }}>!</span>
          )}
        </div>

        {/* Title */}
        <h3
          style={{
            margin: '0 0 10px',
            fontSize: '1.38rem',
            fontWeight: 800,
            color: '#0f172a',
            letterSpacing: '-0.02em',
          }}
        >
          {title}
        </h3>

        {/* Description */}
        <p
          style={{
            margin: '0 0 24px',
            fontSize: '0.94rem',
            color: '#475569',
            lineHeight: 1.55,
            fontWeight: 500,
          }}
        >
          {message}
        </p>

        {/* Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {secondaryText && (
            <button
              type="button"
              onClick={() => {
                if (onSecondary) onSecondary();
                else onClose();
              }}
              style={{
                background: '#f1f5f9',
                border: '1.5px solid #cbd5e1',
                color: '#334155',
                fontWeight: 700,
                fontSize: '0.92rem',
                padding: '11px 22px',
                borderRadius: '12px',
                cursor: 'pointer',
              }}
            >
              {secondaryText}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (onConfirm) onConfirm();
              else onClose();
            }}
            style={{
              background: palette.btnBg,
              border: 'none',
              color: '#ffffff',
              fontWeight: 800,
              fontSize: '0.95rem',
              padding: '11px 28px',
              borderRadius: '12px',
              cursor: 'pointer',
              boxShadow: palette.btnShadow,
              minWidth: '120px',
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

// Modal 1: Ingest Offline Lead Modal
export function AddOfflineLeadModal({ isOpen, onClose, onAddLead }) {
  const [formData, setFormData] = useState({
    name: '',
    company: '',
    phone: '',
    city: 'Ahmedabad, GJ',
    requirement: '',
    budget: '₹2,00,000',
    status: 'Interested',
  });

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onAddLead({
      ...formData,
      id: `lead_${Date.now()}`,
      source: 'Direct Manual Ingestion',
      createdAt: 'Just now',
      isHot: true,
      notes: 'Manually logged by client sales team.',
    });
    onClose();
  };

  return (
    <div className="portal-modal-backdrop" onClick={onClose}>
      <div className="portal-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>➕ + Add New Buyer Lead (Offline Ingestion)</h3>
          <button type="button" className="btn-close-drawer" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group-block">
            <label>Buyer Full Name<span>*</span></label>
            <input
              type="text"
              required
              placeholder="e.g. Anand Patel"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="clean-input"
            />
          </div>
          <div className="form-group-block">
            <label>Company / Firm Name</label>
            <input
              type="text"
              placeholder="e.g. Patel Engineering Works"
              value={formData.company}
              onChange={(e) => setFormData({ ...formData, company: e.target.value })}
              className="clean-input"
            />
          </div>
          <div className="form-group-block">
            <label>Mobile Number<span>*</span></label>
            <input
              type="tel"
              required
              placeholder="e.g. +91 98240 12345"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="clean-input"
            />
          </div>
          <div className="form-group-block">
            <label>City &amp; State</label>
            <input
              type="text"
              value={formData.city}
              onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              className="clean-input"
            />
          </div>
          <div className="form-group-block">
            <label>Requirement &amp; Product Needed<span>*</span></label>
            <textarea
              rows={3}
              required
              placeholder="e.g. Needs ERP billing module for warehouse..."
              value={formData.requirement}
              onChange={(e) => setFormData({ ...formData, requirement: e.target.value })}
              className="clean-input"
            />
          </div>
          <div className="modal-actions-row">
            <button type="submit" className="btn-portal-primary" style={{ flex: 1 }}>
              Save &amp; Ingest Lead
            </button>
            <button type="button" onClick={onClose} className="btn-portal-secondary">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Modal 2: Schedule Callback / Follow-up Task Modal
export function ScheduleFollowUpModal({ isOpen, onClose, onSchedule, leads, defaultLead }) {
  const [formData, setFormData] = useState({
    leadId: defaultLead?.id || leads[0]?.id || '',
    leadName: defaultLead ? `${defaultLead.name} (${defaultLead.company})` : (leads[0]?.name ? `${leads[0].name} (${leads[0].company})` : ''),
    type: 'Follow-up Call',
    date: 'Today',
    time: '5:00 PM',
    notes: defaultLead ? `Follow up with ${defaultLead.name} regarding quotation pricing.` : 'Follow up regarding quotation pricing.',
  });

  React.useEffect(() => {
    if (defaultLead) {
      setFormData({
        leadId: defaultLead.id,
        leadName: `${defaultLead.name} (${defaultLead.company})`,
        type: 'Follow-up Call',
        date: 'Today',
        time: '5:00 PM',
        notes: `Follow up with ${defaultLead.name} regarding quotation pricing.`,
      });
    }
  }, [defaultLead]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const selLead = leads.find((l) => l.id === formData.leadId) || defaultLead;
    onSchedule({
      id: `fup_${Date.now()}`,
      leadId: formData.leadId,
      leadName: formData.leadName || (selLead ? `${selLead.name} (${selLead.company})` : 'Buyer Lead'),
      phone: selLead?.phone || '+91 9825123456',
      type: formData.type,
      scheduledAt: `${formData.date}, ${formData.time}`,
      status: formData.date.toLowerCase().includes('today') ? 'today' : 'upcoming',
      notes: formData.notes,
    });
    onClose();
  };

  return (
    <div className="portal-modal-backdrop" onClick={onClose}>
      <div className="portal-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>📞 + Add Follow-up / Schedule Callback</h3>
          <button type="button" className="btn-close-drawer" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group-block">
            <label>Select Associated Buyer Lead</label>
            <select
              value={formData.leadId}
              onChange={(e) => {
                const l = leads.find((item) => item.id === e.target.value);
                setFormData({ ...formData, leadId: e.target.value, leadName: l ? `${l.name} (${l.company})` : '' });
              }}
              className="clean-input"
            >
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.company})
                </option>
              ))}
            </select>
          </div>

          <div className="form-group-block">
            <label>Task Type</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              className="clean-input"
            >
              <option value="Demo Call">Live Product Demo</option>
              <option value="Quotation Review">Quotation &amp; Scope Review</option>
              <option value="Pricing Negotiation">Commercial Negotiation</option>
              <option value="Contract Signing">Contract Finalization</option>
            </select>
          </div>

          <div className="am-modal-2col-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="form-group-block">
              <label>Day</label>
              <input
                type="text"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="clean-input"
                placeholder="e.g. Today or Tomorrow"
              />
            </div>
            <div className="form-group-block">
              <label>Time</label>
              <input
                type="text"
                value={formData.time}
                onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                className="clean-input"
                placeholder="e.g. 4:30 PM"
              />
            </div>
          </div>

          <div className="form-group-block">
            <label>Objective &amp; Action Notes</label>
            <textarea
              rows={3}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="clean-input"
              placeholder="What needs to be resolved on this call?"
            />
          </div>

          <div className="modal-actions-row">
            <button type="submit" className="btn-portal-primary" style={{ flex: 1 }}>
              Confirm &amp; Add Reminder
            </button>
            <button type="button" onClick={onClose} className="btn-portal-secondary">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Modal 3: Language Selector Modal
export function LanguageSelectorModal({ isOpen, onClose, currentLang, onChangeLang }) {
  if (!isOpen) return null;

  const languages = [
    { code: 'en', label: 'English', native: 'English (Default)' },
    { code: 'hi', label: 'Hindi', native: 'हिंदी' },
    { code: 'gu', label: 'Gujarati', native: 'ગુજરાતી' },
    { code: 'mr', label: 'Marathi', native: 'मराठी' },
    { code: 'ta', label: 'Tamil', native: 'தமிழ்' },
    { code: 'te', label: 'Telugu', native: 'తెలుగు' },
    { code: 'kn', label: 'Kannada', native: 'ಕನ್ನಡ' },
    { code: 'bn', label: 'Bengali', native: 'বাংলা' },
  ];

  return (
    <div className="portal-modal-backdrop" onClick={onClose}>
      <div className="portal-modal-box" style={{ maxWidth: '380px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>🌐 Select Portal Language</h3>
          <button type="button" className="btn-close-drawer" onClick={onClose}>&times;</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '14px' }}>
          {languages.map((l) => (
            <button
              key={l.code}
              type="button"
              className={`lang-select-btn ${currentLang === l.code ? 'active' : ''}`}
              onClick={() => {
                onChangeLang(l.code);
                onClose();
              }}
            >
              <span>{l.native}</span>
              {currentLang === l.code && <span className="lang-check">✓ Active</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Modal 4: Support & Help Desk Modal
export function HelpSupportModal({ isOpen, onClose }) {
  const [ticketSent, setTicketSent] = useState(false);
  const [msg, setMsg] = useState('');

  if (!isOpen) return null;

  return (
    <div className="portal-modal-backdrop" onClick={onClose}>
      <div className="portal-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>🎧 Customer Support Desk</h3>
          <button type="button" className="btn-close-drawer" onClick={onClose}>&times;</button>
        </div>

        <div className="support-direct-grid">
          <div className="support-card-item">
            <span className="sup-icon">📞</span>
            <strong>Direct Support Line</strong>
            <a href="tel:+919724916167">+91 97249 16167</a>
            <small>Mon-Sat &middot; 9:30 AM to 7:00 PM</small>
          </div>
          <div className="support-card-item">
            <span className="sup-icon">✉️</span>
            <strong>Email Desk</strong>
            <a href="mailto:support@admafia.marketing">support@admafia.marketing</a>
            <small>Guaranteed 2-hour response SLA</small>
          </div>
        </div>

        <div style={{ marginTop: '22px' }}>
          <h4>Submit Priority Ticket</h4>
          {!ticketSent ? (
            <form onSubmit={(e) => { e.preventDefault(); setTicketSent(true); }}>
              <textarea
                rows={3}
                required
                placeholder="Explain your inquiry, territory targeting update, or billing question..."
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
                className="clean-input"
                style={{ marginTop: '8px', marginBottom: '14px' }}
              />
              <button type="submit" className="btn-portal-primary" style={{ width: '100%' }}>
                Submit Ticket to Support Desk
              </button>
            </form>
          ) : (
            <div style={{ background: '#ecfdf5', color: '#047857', padding: '16px', borderRadius: '12px', marginTop: '8px', textAlign: 'center' }}>
              ✓ Ticket #AM-9481 created! A support manager will contact your registered phone within 2 hours.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Modal 5: Add Funds / Top-Up Wallet Modal (Pure Wallet Top-Up — No Days Configuration)
export function AddFundsModal({
  isOpen,
  onClose,
  onTopUp,
  onPaymentFailed,
  transactions = [],
  dailyAdSpend = 300,
  walletBalance = 0,
  customer = {},
}) {
  const [budget, setBudget] = useState('600');
  const [selectedPreset, setSelectedPreset] = useState(600);
  const [isProcessing, setIsProcessing] = useState(false);
  const [txSuccess, setTxSuccess] = useState(false);
  const [sweetAlert, setSweetAlert] = useState(null);
  const walletCurrency = String(customer?.currency || 'INR').toUpperCase();
  const isUsdWallet = walletCurrency === 'USD';

  if (!isOpen) return null;

  if (isUsdWallet) return (
    <div className="portal-modal-backdrop" role="presentation">
      <div className="portal-modal-box" role="dialog" aria-modal="true" aria-label="USD wallet funding unavailable">
        <h3>USD wallet payments are unavailable</h3>
        <p>International payment processing is not enabled yet. Your USD wallet and balance remain unchanged.</p>
        <button type="button" className="btn-portal-secondary" onClick={onClose}>Close</button>
      </div>
    </div>
  );

  const durationPresets = [
    { days: 1, amount: 300, label: '1 Day', tag: 'Min' },
    { days: 2, amount: 600, label: '2 Days', tag: null },
    { days: 3, amount: 900, label: '3 Days', tag: null },
    { days: 5, amount: 1500, label: '5 Days', tag: null },
    { days: 7, amount: 2100, label: '7 Days', tag: '1 Wk' },
    { days: 15, amount: 4500, label: '15 Days', tag: null },
    { days: 30, amount: 9000, label: '30 Days', tag: '1 MONTH' },
    { days: 60, amount: 18000, label: '60 Days', tag: '2 MONTHS' },
  ];

  const currentAmount = budget ? parseInt(budget, 10) : 0;
  const pacingRate = dailyAdSpend || 300;
  const calculatedDays = currentAmount > 0 ? Math.max(1, Math.round(currentAmount / pacingRate)) : 0;

  const handleSelectPreset = (p) => {
    setSelectedPreset(p.amount);
    setBudget(String(p.amount));
  };

  const handleCustomChange = (e) => {
    const val = e.target.value.replace(/\D/g, '');
    setBudget(val);
    const num = parseInt(val, 10);
    const matching = durationPresets.find((p) => p.amount === num);
    setSelectedPreset(matching ? matching.amount : null);
  };

  const loadRazorpayScript = () => {
    return new Promise((resolve) => {
      if (window.Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const finalizeTopUp = (amount, paymentRef, verifyData = {}) => {
    if (onTopUp) {
      onTopUp(amount, paymentRef, {
        method: 'Razorpay Secure (UPI/Card)',
        desc: `Growth Wallet Balance Top-Up (₹${Number(amount).toLocaleString('en-IN')} Added)`,
        ...verifyData,
      });
    }
    setIsProcessing(false);
    setTxSuccess(true);
    setTimeout(() => {
      setTxSuccess(false);
      onClose();
    }, 1200);
  };

  const handleTopUpSubmit = async (e) => {
    e.preventDefault();
    if (!currentAmount || currentAmount < 300) {
      setSweetAlert({
        type: 'warning',
        title: 'Minimum Top-Up is ₹300',
        message: 'Please enter a wallet top-up amount of ₹300 or more to continue.',
        confirmText: 'Set ₹300',
        onConfirm: () => {
          setBudget('300');
          setSelectedPreset(300);
          setSweetAlert(null);
        },
        secondaryText: 'Close',
        onSecondary: () => setSweetAlert(null),
      });
      return;
    }

    setIsProcessing(true);

    try {
      const cleanPhone = String(customer?.phone || customer?.username || '').replace(/\D/g, '').slice(-10);

      // 1. Create real Razorpay order on backend
      const orderRes = await crmApi.createRazorpayOrder({
        customerId: customer?.id,
        phone: cleanPhone || customer?.phone,
        username: customer?.username,
        amount: currentAmount,
      });

      if (!orderRes?.ok || !orderRes?.orderId) {
        throw new Error(orderRes?.error || 'Could not start payment. Please retry.');
      }

      // 2. Load Razorpay Standard Checkout SDK
      const scriptReady = await loadRazorpayScript();
      if (!scriptReady || !window.Razorpay) {
        const linkRes = await crmApi.createRazorpayPaymentLink({
          customerId: customer?.id,
          phone: cleanPhone,
          username: customer?.username,
          amount: currentAmount,
        });
        if (linkRes?.paymentUrl) {
          window.location.assign(linkRes.paymentUrl);
          return;
        }
        throw new Error('Razorpay Checkout failed to load.');
      }

      // 3. Open direct Razorpay Checkout popup
      const options = {
        key: orderRes.keyId,
        amount: orderRes.amount,
        currency: orderRes.currency || 'INR',
        name: 'Ad Mafia',
        description: `Growth Wallet Instant Top-Up (₹${currentAmount.toLocaleString('en-IN')})`,
        image: 'https://admafia.marketing/assets/logo.png',
        order_id: orderRes.orderId,
        prefill: {
          name: customer?.contactPerson || customer?.companyName || customer?.name || customer?.username || 'Ad Mafia Customer',
          ...(cleanPhone && cleanPhone.length === 10 ? { contact: cleanPhone } : {}),
          email: customer?.email || `${cleanPhone || 'client'}@admafia.marketing`,
        },
        notes: {
          customer_id: String(customer?.id || ''),
          customer_phone: cleanPhone,
        },
        theme: {
          color: '#4f46e5',
        },
        handler: async function (response) {
          const verifyPayload = {
            orderId: response.razorpay_order_id || orderRes.orderId,
            paymentId: response.razorpay_payment_id,
            signature: response.razorpay_signature,
            customerId: customer?.id,
            phone: cleanPhone,
            username: customer?.username,
            amount: currentAmount,
          };

          const attemptVerify = async (isRetry = false) => {
            try {
              const verifyRes = await crmApi.verifyRazorpayPayment(verifyPayload);
              if (verifyRes?.ok) {
                finalizeTopUp(currentAmount, response.razorpay_payment_id, verifyRes);
                return true;
              }
              throw new Error(verifyRes?.error || 'Payment verification could not be confirmed.');
            } catch (err) {
              if (!isRetry) {
                console.warn('[AddFundsModal] Initial verification attempt failed, retrying in 1.5s...', err.message);
                await new Promise((resolve) => setTimeout(resolve, 1500));
                return attemptVerify(true);
              }
              throw err;
            }
          };

          try {
            await attemptVerify();
          } catch (vErr) {
            console.error('[AddFundsModal Verify Error]', vErr);
            setIsProcessing(false);
            setSweetAlert({
              type: 'warning',
              title: 'Payment Received — Confirming Status',
              message: `Your payment was completed on Razorpay (Ref: ${response.razorpay_payment_id}). Bank confirmation is completing. Click "Check Status" to confirm your wallet balance.`,
              confirmText: '🔄 Check Status Now',
              onConfirm: async () => {
                setSweetAlert(null);
                setIsProcessing(true);
                try {
                  const checkRes = await crmApi.verifyRazorpayPayment(verifyPayload);
                  if (checkRes?.ok) {
                    finalizeTopUp(currentAmount, response.razorpay_payment_id, checkRes);
                  } else {
                    throw new Error(checkRes?.error || 'Verification still pending.');
                  }
                } catch (retryErr) {
                  setIsProcessing(false);
                  setSweetAlert({
                    type: 'info',
                    title: 'Payment Processing with Bank',
                    message: `Payment reference ${response.razorpay_payment_id} is recorded. Your wallet balance will update automatically within 1–2 minutes.`,
                    confirmText: 'OK',
                    onConfirm: () => {
                      setSweetAlert(null);
                      onClose();
                    },
                  });
                }
              },
              secondaryText: 'Close',
              onSecondary: () => {
                setSweetAlert(null);
                onClose();
              },
            });
          }
        },
        modal: {
          ondismiss: function () {
            setIsProcessing(false);
            const dismissRef = `DISMISS-${Date.now().toString().slice(-6)}`;
            if (onPaymentFailed) {
              onPaymentFailed({
                id: `tx_fail_${Date.now()}`,
                ref: dismissRef,
                amount: currentAmount,
                desc: 'Payment checkout dismissed by user',
                status: 'Failed ✕',
                type: 'Credit',
                method: 'Razorpay Secure',
                failureReason: 'Checkout closed by user',
                date: 'Today, Just now',
              });
            }
            try {
              crmApi.recordFailedTransaction({
                customerId: customer?.id,
                phone: customer?.phone,
                username: customer?.username,
                companyName: customer?.companyName || customer?.name,
                amount: currentAmount,
                referenceUtr: dismissRef,
                description: 'Payment checkout dismissed by user',
                failureReason: 'Checkout closed by user',
                paymentMethod: 'Razorpay Secure',
              }).catch(() => {});
            } catch (e) {}
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', function (resp) {
        setIsProcessing(false);
        const failReason = resp.error?.description || resp.error?.reason || 'Payment failed';
        const failRef = resp.error?.metadata?.payment_id || `FAIL-${Date.now().toString().slice(-6)}`;
        if (onPaymentFailed) {
          onPaymentFailed({
            id: `tx_fail_${Date.now()}`,
            ref: failRef,
            amount: currentAmount,
            desc: `Online recharge failed: ${failReason}`,
            status: 'Failed ✕',
            type: 'Credit',
            method: 'Razorpay Secure',
            failureReason: failReason,
            date: 'Today, Just now',
          });
        }
        try {
          crmApi.recordFailedTransaction({
            customerId: customer?.id,
            phone: customer?.phone,
            username: customer?.username,
            companyName: customer?.companyName || customer?.name,
            amount: currentAmount,
            referenceUtr: failRef,
            description: `Online recharge failed: ${failReason}`,
            failureReason: failReason,
            paymentMethod: 'Razorpay Secure',
          }).catch(() => {});
        } catch (e) {}
        setSweetAlert({
          type: 'error',
          title: 'Payment Failed',
          message: failReason,
          confirmText: 'OK',
          onConfirm: () => setSweetAlert(null),
        });
      });

      setIsProcessing(false);
      rzp.open();
    } catch (err) {
      setIsProcessing(false);
      setSweetAlert({
        type: 'error',
        title: 'Could not open checkout',
        message: err.message || 'Payment initiation failed. Please try again.',
        confirmText: 'OK',
        onConfirm: () => setSweetAlert(null),
      });
    }
  };

  return (
    <div className="payment-complete-modal-backdrop" onClick={onClose}>
      <SweetAlertModal alertState={sweetAlert} onClose={() => setSweetAlert(null)} />
      <div
        className="payment-complete-modal-card"
        style={{ maxWidth: '520px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Luminous Gradient Strip */}
        <div className="payment-modal-top-accent" />

        {/* Header */}
        <div className="payment-modal-header-row">
          <div className="payment-modal-header-left">
            <div
              className="payment-modal-orange-icon"
              style={{
                background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                boxShadow: '0 8px 18px -4px rgba(79, 70, 229, 0.4)',
              }}
            >
              <Zap size={24} strokeWidth={2.5} />
            </div>
            <div className="payment-modal-title-stack">
              <div className="payment-modal-steps-tag">
                <span className="step-pill">Instant Wallet Credit</span>
                <span className="step-label" style={{ color: '#059669' }}>● Zero Setup Fee</span>
              </div>
              <h2>Add Funds to Growth Wallet</h2>
              <p>100% of your top-up is credited directly to your Growth Wallet balance</p>
            </div>
          </div>
          <button
            type="button"
            className="payment-modal-close-btn"
            onClick={onClose}
            title="Close modal"
            aria-label="Close modal"
          >
            <X size={16} />
          </button>
        </div>

        {txSuccess ? (
          <div style={{ textAlign: 'center', padding: '28px 16px' }}>
            <div
              style={{
                width: '60px',
                height: '60px',
                borderRadius: '50%',
                background: '#ecfdf5',
                color: '#059669',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 14px',
              }}
            >
              <CheckCircle2 size={34} strokeWidth={2.5} />
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: '0 0 6px' }}>
              ₹{currentAmount.toLocaleString('en-IN')} Added to Growth Wallet!
            </h3>
            <p style={{ color: '#64748b', fontSize: '0.88rem', margin: 0 }}>
              Your new wallet balance is <strong>₹{(Number(walletBalance || 0) + currentAmount).toLocaleString('en-IN')}</strong>.
            </p>
          </div>
        ) : (
          <form onSubmit={handleTopUpSubmit}>
            {/* 1. GROWTH WALLET BUDGET | ÷ ₹300/day → | ESTIMATED ACTIVE DAYS Split Row */}
            <div className="payment-calc-split-row">
              <div className="calc-col-budget">
                <label className="calc-col-label">GROWTH WALLET BUDGET</label>
                <div className="budget-input-wrapper">
                  <span className="currency-symbol">₹</span>
                  <input
                    type="text"
                    className="budget-number-input"
                    value={budget}
                    onChange={handleCustomChange}
                    placeholder="600"
                    autoFocus
                  />
                </div>
              </div>

              <div className="calc-divider-pill-wrap">
                <span className="calc-divider-pill">÷ ₹{pacingRate}/day →</span>
              </div>

              <div className="calc-col-runtime">
                <label className="calc-col-label">ESTIMATED ACTIVE DAYS</label>
                <div className="runtime-display-box">
                  <div className="runtime-cal-badge">
                    <Calendar className="runtime-cal-icon" size={16} />
                  </div>
                  <div className="runtime-text-stack">
                    <strong className="runtime-days-text">{calculatedDays} Days</strong>
                    <span className="runtime-sub-text">Enter budget or select duration below</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Quick Duration Presets Header */}
            <div className="presets-section-heading">
              <span>QUICK DURATION PRESETS:</span>
              <span className="presets-hint-text">Select duration to auto-calculate budget</span>
            </div>

            {/* 3. Duration Presets 4x2 Grid */}
            <div className="duration-presets-unified-grid">
              {durationPresets.map((p) => {
                const isSelected = selectedPreset === p.amount;
                return (
                  <div
                    key={p.days}
                    className={`duration-preset-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleSelectPreset(p)}
                  >
                    <div className="preset-top-line" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span className="preset-day-label" style={{ fontWeight: 700, fontSize: '0.88rem' }}>{p.label}</span>
                      {p.tag ? (
                        <span className="preset-mini-tag" style={{
                          background: '#e0e7ff',
                          color: '#4338ca',
                          fontSize: '0.68rem',
                          fontWeight: 800,
                          padding: '2px 6px',
                          borderRadius: '6px'
                        }}>
                          {p.tag}
                        </span>
                      ) : isSelected ? (
                        <span className="preset-check-dot-inline" style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: '#6366f1',
                          display: 'inline-block'
                        }} />
                      ) : null}
                    </div>
                    <div className="preset-price-val" style={{ fontSize: '1.1rem', fontWeight: 800 }}>
                      ₹{p.amount.toLocaleString('en-IN')}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 4. Pay Now Button (Matching Screenshot) */}
            <button
              type="submit"
              className="btn-payment-modal-pay"
              disabled={isProcessing}
            >
              <span>{isProcessing ? 'Opening Razorpay Secure...' : 'Pay Now →'}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// Modal 6: Set Daily Growth Budget Modal (Day Lock & SweetAlert)
export function SetDailyLimitModal({
  isOpen,
  onClose,
  currentLimit = 300,
  onUpdateLimit,
  walletBalance = 0,
  onOpenTopUp,
  onDeductDailyAdSpend,
  customer = {},
  onUpdateCustomer,
}) {
  const savedCurrency = String(customer?.currency || 'INR').toUpperCase();
  const currencySymbol = savedCurrency === 'USD' ? '$' : '₹';
  const minDailySpend = savedCurrency === 'USD' ? 10 : 300;
  const [amount, setAmount] = useState(currentLimit || minDailySpend);
  const [selectedDays, setSelectedDays] = useState(
    Array.isArray(customer?.activeDays) && customer.activeDays.length > 0
      ? customer.activeDays
      : ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
  );

  const todayIdx = new Date().getDay(); // 0: SUN, 1: MON, ..., 6: SAT
  const dayDefinitions = [
    { code: 'MON', label: 'Monday', short: 'Mon', isToday: todayIdx === 1 },
    { code: 'TUE', label: 'Tuesday', short: 'Tue', isToday: todayIdx === 2 },
    { code: 'WED', label: 'Wednesday', short: 'Wed', isToday: todayIdx === 3 },
    { code: 'THU', label: 'Thursday', short: 'Thu', isToday: todayIdx === 4 },
    { code: 'FRI', label: 'Friday', short: 'Fri', isToday: todayIdx === 5 },
    { code: 'SAT', label: 'Saturday', short: 'Sat', isToday: todayIdx === 6 },
    { code: 'SUN', label: 'Sunday', short: 'Sun', isToday: todayIdx === 0 },
  ];
  const todayItem = dayDefinitions.find((d) => d.isToday) || dayDefinitions[5];

  const isTodayAlreadyBooked = Boolean(
    customer?.isDeductedToday ||
    (customer?.adCampaignActive && (
      (Array.isArray(customer?.bookedDays) && customer.bookedDays.includes(todayItem.code)) ||
      (Array.isArray(customer?.lockedDays) && customer.lockedDays.includes(todayItem.code))
    ))
  );

  React.useEffect(() => {
    if (isOpen) {
      setAmount(currentLimit || minDailySpend);
      const initialDays = Array.isArray(customer?.activeDays) && customer.activeDays.length > 0
        ? customer.activeDays
        : ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
      // Ensure today is selected so today's budget can be locked and run
      if (!initialDays.includes(todayItem.code)) {
        setSelectedDays([...initialDays, todayItem.code]);
      } else {
        setSelectedDays(initialDays);
      }
    }
  }, [isOpen, currentLimit, customer?.activeDays, todayItem.code, minDailySpend]);

  if (!isOpen) return null;

  const currentAmountNum = Number(amount) || 0;
  const isExceeding = currentAmountNum > (walletBalance || 0);

  const presets = [
    { label: `${currencySymbol}${minDailySpend} (Min)`, value: minDailySpend },
    { label: `${currencySymbol}${minDailySpend * 2}`, value: minDailySpend * 2 },
    { label: `${currencySymbol}${minDailySpend * 5}`, value: minDailySpend * 5 },
    { label: `${currencySymbol}${minDailySpend * 10}`, value: minDailySpend * 10 },
  ];

  const toggleDaySelection = (dayCode) => {
    if (dayCode === todayItem.code && isTodayAlreadyBooked) {
      Swal.fire({
        icon: 'info',
        title: `🎯 ${todayItem.label} is Already Booked!`,
        html: `Lead delivery is actively running for <strong>${todayItem.label}</strong>.<br/><br/>Once started, this day cannot be de-selected.`,
        confirmButtonColor: '#059669',
      });
      return;
    }

    if (selectedDays.includes(dayCode)) {
      setSelectedDays(selectedDays.filter((d) => d !== dayCode));
    } else {
      setSelectedDays([...selectedDays, dayCode]);
    }
  };

  const handleProceed = (e) => {
    if (e) e.preventDefault();
    const finalAmount = Number(amount);

    if (!finalAmount || finalAmount < minDailySpend) {
      Swal.fire({
        icon: 'warning',
        title: `Minimum Daily Budget is ${currencySymbol}${minDailySpend}`,
        text: `Minimum daily growth budget is ${currencySymbol}${minDailySpend} / day. Please enter ${currencySymbol}${minDailySpend} or higher to activate lead delivery.`,
        confirmButtonText: `Set ${currencySymbol}${minDailySpend} (Min)`,
        confirmButtonColor: '#4f46e5',
      }).then((res) => {
        if (res.isConfirmed) setAmount(minDailySpend);
      });
      return;
    }

    if (finalAmount > (walletBalance || 0)) {
      Swal.fire({
        icon: 'error',
        title: 'Insufficient Growth Wallet Balance',
        html: `Your selected daily pacing of <strong>${currencySymbol}${finalAmount.toLocaleString('en-US')}</strong> exceeds your available Growth Wallet balance of <strong>${currencySymbol}${Number(walletBalance || 0).toLocaleString('en-US')}</strong>.<br/><br/>Please top up your Growth Wallet to activate this daily budget.`,
        showCancelButton: true,
        confirmButtonText: '+ Top Up Wallet',
        confirmButtonColor: '#059669',
        cancelButtonText: 'Cancel',
      }).then((res) => {
        if (res.isConfirmed && onOpenTopUp) onOpenTopUp();
      });
      return;
    }

    // Ensure today is part of the final active days
    const finalActiveDays = selectedDays.includes(todayItem.code)
      ? selectedDays
      : [...selectedDays, todayItem.code];

    const isAlreadyActive = Boolean(customer?.adCampaignActive);

    // 1. Only deduct daily pacing if schedule is already running and today was not yet debited
    if (isAlreadyActive && onDeductDailyAdSpend && !customer?.isDeductedToday) {
      onDeductDailyAdSpend(finalAmount);
    }

    // 2. Update limit & schedule in parent
    if (onUpdateLimit) {
      onUpdateLimit(finalAmount, finalActiveDays);
    }
    if (onUpdateCustomer) {
      onUpdateCustomer({
        dailyAdSpend: finalAmount,
        activeDays: finalActiveDays,
        ...(isAlreadyActive ? { adCampaignActive: true } : {}),
      });
    }

    // 3. Close modal
    onClose();

    if (isAlreadyActive) {
      // 4. Calculate post-deduction values for SweetAlert2
      const remainingWallet = Math.max(0, (walletBalance || 0) - (customer?.isDeductedToday ? 0 : finalAmount));
      const calculatedRunway = Math.floor(remainingWallet / Math.max(finalAmount, 1));

      // 5. Fire rich, prominent SweetAlert2 Confirmation Dialog for active schedules
      Swal.fire({
        icon: 'success',
        title: `🎯 Daily Budget Updated: ${currencySymbol}${finalAmount.toLocaleString(savedCurrency === 'INR' ? 'en-IN' : 'en-US')}/day`,
        html: `
          <div style="text-align: left; background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 14px; padding: 16px; margin: 12px 0; font-family: inherit;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px; gap: 8px; flex-wrap: wrap;">
              <span style="color:#64748b; font-size:0.85rem; font-weight: 600;">Daily Growth Budget:</span>
              <strong style="color:#4f46e5; font-size:1.1rem; font-weight:800;">${currencySymbol}${finalAmount.toLocaleString(savedCurrency === 'INR' ? 'en-IN' : 'en-US')} / active day</strong>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px; gap: 8px; flex-wrap: wrap;">
              <span style="color:#64748b; font-size:0.85rem; font-weight: 600;">Lead Delivery:</span>
              <span style="background:#ecfdf5; color:#059669; font-weight:800; font-size:0.82rem; padding: 3px 10px; border-radius:9999px;">
                ● Running (Active)
              </span>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px; gap: 8px; flex-wrap: wrap;">
              <span style="color:#64748b; font-size:0.85rem; font-weight: 600;">Remaining Growth Wallet:</span>
              <strong style="color:#059669; font-size:1.1rem; font-weight:800;">${currencySymbol}${remainingWallet.toLocaleString(savedCurrency === 'INR' ? 'en-IN' : 'en-US')} (${calculatedRunway}d runway)</strong>
            </div>
          </div>
        `,
        confirmButtonText: 'Done & View Dashboard',
        confirmButtonColor: '#059669',
        buttonsStyling: true,
      });
    } else {
      // Delivery schedule is currently paused/off: save settings without deduction
      Swal.fire({
        icon: 'success',
        title: `Daily Budget Set: ${currencySymbol}${finalAmount.toLocaleString(savedCurrency === 'INR' ? 'en-IN' : 'en-US')}/day`,
        html: `Your daily growth pacing has been saved as <strong>${currencySymbol}${finalAmount.toLocaleString(savedCurrency === 'INR' ? 'en-IN' : 'en-US')}/day</strong>.<br/><br/>Your lead delivery schedule is currently <strong>Paused (Off)</strong>. Click <strong>Start</strong> on your dashboard whenever you are ready to activate delivery and deduct today's pacing.`,
        confirmButtonText: 'Understood',
        confirmButtonColor: '#4f46e5',
      });
    }
  };

  return (
    <div
      className="portal-modal-backdrop"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 999999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        className="portal-modal-box am-daily-limit-modal"
        style={{
          background: '#ffffff',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '520px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          padding: '26px 28px',
          position: 'relative',
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
          color: '#0f172a',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="am-daily-limit-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', gap: '10px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
              Set Daily Growth Budget
            </h2>
            <p style={{ margin: '3px 0 0', fontSize: '0.82rem', color: '#64748b' }}>
              Schedule active days &amp; lock daily buyer lead delivery
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: '#f1f5f9',
              border: 'none',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#64748b',
              fontSize: '1.1rem',
              fontWeight: 700,
            }}
          >
            ✕
          </button>
        </div>

        {/* Balance & Minimum Budget Box */}
        <div
          className="am-daily-limit-balance-box"
          style={{
            border: '1.5px solid #e2e8f0',
            borderRadius: '14px',
            padding: '12px 18px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#ffffff',
            marginBottom: '16px',
            gap: '10px',
          }}
        >
          <div>
            <div style={{ fontSize: '0.70rem', fontWeight: 800, color: '#64748b', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '2px' }}>
              CURRENT WALLET BALANCE
            </div>
            <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>
              {currencySymbol}{Number(walletBalance || 0).toLocaleString('en-US')}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.70rem', fontWeight: 800, color: '#64748b', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '2px' }}>
              MINIMUM BUDGET
            </div>
            <div style={{ fontSize: '1.20rem', fontWeight: 800, color: '#4338ca', lineHeight: 1.1 }}>
              {currencySymbol}{minDailySpend} / day
            </div>
          </div>
        </div>

        {/* Enter Daily Growth Budget Label */}
        <div style={{ marginBottom: '8px', fontWeight: 700, fontSize: '0.92rem', color: '#1e293b' }}>
          Enter Daily Growth Budget ({savedCurrency}):
        </div>

        {/* Amount Input with Currency Symbol */}
        <div
          style={{
            border: '2px solid #6366f1',
            borderRadius: '12px',
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            background: '#ffffff',
            boxShadow: '0 0 0 3px rgba(99, 102, 241, 0.12)',
            marginBottom: '12px',
          }}
        >
          <span style={{ fontSize: '1.25rem', fontWeight: 700, color: '#64748b', marginRight: '10px' }}>
            {currencySymbol}
          </span>
          <input
            type="number"
            min={minDailySpend}
            step={savedCurrency === 'USD' ? '5' : '50'}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="budget-number-input"
            style={{
              border: 'none',
              outline: 'none',
              width: '100%',
              fontSize: '1.35rem',
              fontWeight: 800,
              color: '#0f172a',
              background: 'transparent',
              margin: 0,
              padding: 0,
              height: 'auto',
            }}
          />
        </div>

        {/* 4 Presets */}
        <div className="am-daily-limit-presets-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '16px' }}>
          {presets.map((p) => {
            const isSelected = currentAmountNum === p.value;
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => setAmount(p.value)}
                style={{
                  border: isSelected ? '1.5px solid #4f46e5' : '1px solid #cbd5e1',
                  background: isSelected ? '#eff6ff' : '#ffffff',
                  color: isSelected ? '#4338ca' : '#1e293b',
                  fontWeight: 700,
                  fontSize: '0.90rem',
                  padding: '9px 4px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 0.15s ease',
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Day Selection Grid with Today Badged & Lock Indicator */}
        <div style={{ marginBottom: '16px' }}>
          <div className="am-daily-limit-days-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
            <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#1e293b' }}>
              Select Delivery Days ({selectedDays.length} of 7 Active):
            </span>
            <span style={{ fontSize: '0.74rem', color: '#b45309', fontWeight: 700, background: '#fef3c7', padding: '2px 8px', borderRadius: '9999px' }}>
              🔒 Today ({todayItem.short}) will be locked
            </span>
          </div>

          <div className="am-daily-limit-days-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px' }}>
            {dayDefinitions.map((d) => {
              const isDayActive = selectedDays.includes(d.code);
              return (
                <button
                  key={d.code}
                  type="button"
                  onClick={() => toggleDaySelection(d.code)}
                  style={{
                    border: d.isToday
                      ? '2px solid #2563eb'
                      : isDayActive
                      ? '1.5px solid #10b981'
                      : '1px solid #cbd5e1',
                    background: isDayActive ? (d.isToday ? '#eff6ff' : '#f0fdf4') : '#f8fafc',
                    color: isDayActive ? (d.isToday ? '#1d4ed8' : '#047857') : '#94a3b8',
                    borderRadius: '8px',
                    padding: '8px 2px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    cursor: 'pointer',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    position: 'relative',
                    transition: 'all 0.15s ease',
                  }}
                  title={d.isToday ? 'Today (Locked upon activation)' : `${d.label} - click to toggle`}
                >
                  {d.isToday && (
                    <span
                      style={{
                        position: 'absolute',
                        top: '-7px',
                        background: '#2563eb',
                        color: '#ffffff',
                        fontSize: '0.58rem',
                        fontWeight: 800,
                        padding: '1px 4px',
                        borderRadius: '9999px',
                      }}
                    >
                      Today
                    </span>
                  )}
                  <span>{d.code}</span>
                  <span style={{ fontSize: '0.68rem', marginTop: '2px', fontWeight: 800 }}>
                    {d.isToday ? '🔒' : isDayActive ? '✓' : '—'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Notice Info Box */}
        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '12px 14px',
            display: 'flex',
            gap: '10px',
            alignItems: 'flex-start',
            marginBottom: '14px',
          }}
        >
          <span style={{ fontSize: '1.15rem', lineHeight: 1.2 }}>💡</span>
          <p style={{ margin: 0, fontSize: '0.82rem', color: '#475569', lineHeight: 1.45, fontWeight: 500 }}>
            Amount will be deducted from your total balance immediately for today. Today&apos;s delivery schedule will be <strong>locked as completed</strong>. Verified lead delivery &amp; pacing run automatically.
          </p>
        </div>

        {/* Exceeds Balance Box */}
        {isExceeding && (
          <div
            className="am-daily-limit-exceeds-box"
            style={{
              background: '#fff1f2',
              border: '1px solid #fecdd3',
              borderRadius: '12px',
              padding: '10px 14px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '8px',
              marginBottom: '14px',
            }}
          >
            <span style={{ color: '#e11d48', fontWeight: 700, fontSize: '0.85rem' }}>
              Amount exceeds wallet balance ({currencySymbol}{Number(walletBalance || 0).toLocaleString('en-US')}).
            </span>
            <button
              type="button"
              onClick={() => {
                if (onOpenTopUp) onOpenTopUp();
              }}
              style={{
                background: '#059669',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                boxShadow: '0 2px 4px rgba(5, 150, 105, 0.2)',
              }}
            >
              + Top Up
            </button>
          </div>
        )}

        {/* Actions Row */}
        <div
          className="am-daily-limit-actions"
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            marginTop: '16px',
            alignItems: 'center',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              color: '#334155',
              fontWeight: 700,
              fontSize: '0.90rem',
              padding: '10px 20px',
              borderRadius: '10px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleProceed}
            style={{
              background: '#059669',
              color: '#ffffff',
              border: 'none',
              fontWeight: 700,
              fontSize: '0.92rem',
              padding: '10px 22px',
              borderRadius: '10px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              boxShadow: '0 4px 6px -1px rgba(5, 150, 105, 0.3)',
            }}
          >
            <span>🎯 Set Daily Budget &amp; Confirm Booking →</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// Modal 7: GST Tax Invoice Viewer & PDF Generator
export function GstTaxInvoiceModal({ isOpen, onClose, invoice, customer }) {
  if (!isOpen || !invoice) return null;

  const invCurrency = String(invoice.currency || customer?.currency || 'INR').toUpperCase();
  const invSymbol = invoice.currencySymbol || (invCurrency === 'USD' ? '$' : '₹');

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="portal-modal-backdrop" onClick={onClose}>
      <div className="portal-modal-box" style={{ maxWidth: '640px', background: '#ffffff', color: '#111827' }} onClick={(e) => e.stopPropagation()}>
        <div className="am-invoice-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e5e7eb', paddingBottom: '14px', marginBottom: '18px', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            <img
              src="/AdMafia-Logo.png"
              alt="Ad Mafia Marketing"
              style={{ height: '46px', width: 'auto', objectFit: 'contain', flexShrink: 0 }}
            />
            <div style={{ minWidth: 0 }}>
              <span style={{ background: '#10b981', color: '#fff', fontSize: '0.72rem', fontWeight: 800, padding: '2px 8px', borderRadius: '4px', display: 'inline-block' }}>
                OFFICIAL GST TAX INVOICE
              </span>
              <h3 style={{ margin: '4px 0 0', color: '#111827', fontSize: '1.25rem', wordBreak: 'break-word' }}>Invoice #{invoice.invoiceNo}</h3>
            </div>
          </div>
          <button type="button" className="btn-close-drawer" onClick={onClose} style={{ color: '#374151', flexShrink: 0 }}>&times;</button>
        </div>

        {/* Invoice Header Details */}
        <div className="am-invoice-parties-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', fontSize: '0.85rem', marginBottom: '18px', lineHeight: '1.5' }}>
          <div>
            <strong style={{ color: '#171347' }}>Issued By:</strong>
            <div>Ad Mafia Marketing</div>
            <div>CIN: U74999MH2022PTC384910</div>
            <div>GSTIN: 27AABCE1234F1Z5</div>
            <div>Commercial Operations Desk, India</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <strong style={{ color: '#171347' }}>Billed To:</strong>
            <div><strong>{customer?.companyName || customer?.name || 'Registered Customer'}</strong></div>
            <div>Contact: {customer?.contactPerson || customer?.username || '—'}</div>
            <div>Phone: {customer?.phone || '—'}</div>
            <div>Date: {invoice.date}</div>
          </div>
        </div>

        {/* Invoice Line Items Table */}
        <div className="am-invoice-table-wrap" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', marginBottom: '16px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                <th style={{ padding: '8px' }}>Particulars / Services</th>
                <th style={{ padding: '8px' }}>SAC</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Taxable Amt</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '10px 8px' }}>{invoice.particulars}</td>
                <td style={{ padding: '10px 8px' }}>{invoice.sacCode}</td>
                <td style={{ padding: '10px 8px', textAlign: 'right' }}>{invSymbol}{Number(invoice.baseAmount || 0).toLocaleString(invCurrency === 'INR' ? 'en-IN' : 'en-US')}</td>
              </tr>
              {invCurrency === 'INR' ? (
                <>
                  <tr style={{ borderBottom: '1px solid #f1f5f9', color: '#64748b' }}>
                    <td colSpan={2} style={{ padding: '6px 8px', textAlign: 'right' }}>CGST (9.0%):</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{invSymbol}{Number(invoice.cgst || 0).toLocaleString('en-IN')}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #f1f5f9', color: '#64748b' }}>
                    <td colSpan={2} style={{ padding: '6px 8px', textAlign: 'right' }}>SGST (9.0%):</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{invSymbol}{Number(invoice.sgst || 0).toLocaleString('en-IN')}</td>
                  </tr>
                </>
              ) : null}
              <tr style={{ fontWeight: 800, background: '#f8fafc', fontSize: '0.95rem' }}>
                <td colSpan={2} style={{ padding: '10px 8px', textAlign: 'right', color: '#171347' }}>Total Invoice Amount:</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', color: '#047857' }}>{invSymbol}{Number(invoice.totalAmount || 0).toLocaleString(invCurrency === 'INR' ? 'en-IN' : 'en-US')}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="am-invoice-settled-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px', background: '#f0fdf4', padding: '10px 14px', borderRadius: '8px', marginBottom: '18px', fontSize: '0.8rem', color: '#166534' }}>
          <span>✓ Payment Settled via {invoice.paymentMode}</span>
          <span>Digitally Signed</span>
        </div>

        <div className="am-invoice-actions-row" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button type="button" onClick={handlePrint} className="btn-portal-primary" style={{ flex: 1 }}>
            🖨️ Print / Download PDF
          </button>
          <button type="button" onClick={onClose} className="btn-portal-secondary">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// Modal 8: Reschedule Callback Modal
export function RescheduleCallbackModal({ isOpen, onClose, followUp, onSaveReschedule }) {
  const [newDate, setNewDate] = useState('Tomorrow');
  const [newTime, setNewTime] = useState('4:00 PM');
  const [newChannel, setNewChannel] = useState(followUp?.channel || 'Phone');
  const [newNotes, setNewNotes] = useState(followUp?.notes || '');

  React.useEffect(() => {
    if (followUp) {
      setNewNotes(followUp.notes || '');
      setNewChannel(followUp.channel || 'Phone');
    }
  }, [followUp]);

  if (!isOpen || !followUp) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSaveReschedule(followUp.id, {
      scheduledAt: `${newDate}, ${newTime}`,
      channel: newChannel,
      notes: newNotes,
      status: newDate.toLowerCase().includes('today') ? 'today' : 'upcoming',
    });
    onClose();
  };

  return (
    <div className="portal-modal-backdrop" onClick={onClose}>
      <div className="portal-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>🗓️ Reschedule Callback Task</h3>
          <button type="button" className="btn-close-drawer" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group-block">
            <label>Buyer Contact</label>
            <div style={{ fontWeight: 700, color: '#171347' }}>{followUp.leadName} ({followUp.phone})</div>
          </div>

          <div className="am-modal-2col-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="form-group-block">
              <label>New Day<span>*</span></label>
              <input
                type="text"
                required
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="clean-input"
                placeholder="e.g. Tomorrow or 30 Oct"
              />
            </div>
            <div className="form-group-block">
              <label>New Time<span>*</span></label>
              <input
                type="text"
                required
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
                className="clean-input"
                placeholder="e.g. 3:30 PM"
              />
            </div>
          </div>

          <div className="form-group-block">
            <label>Communication Channel</label>
            <select
              value={newChannel}
              onChange={(e) => setNewChannel(e.target.value)}
              className="clean-input"
            >
              <option value="Phone">📞 Phone Call</option>
              <option value="WhatsApp">💬 WhatsApp Call/Chat</option>
              <option value="Email">✉️ Email Update</option>
              <option value="In-Person">🏢 In-Person Meeting</option>
            </select>
          </div>

          <div className="form-group-block">
            <label>Updated Reschedule Reason &amp; Notes</label>
            <textarea
              rows={3}
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              className="clean-input"
              placeholder="e.g. Client in meeting, asked to call tomorrow after 4 PM with revised quote."
            />
          </div>

          <div className="modal-actions-row">
            <button type="submit" className="btn-portal-primary" style={{ flex: 1 }}>
              Save Rescheduled Callback
            </button>
            <button type="button" onClick={onClose} className="btn-portal-secondary">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Modal 9: Configure & Launch Web Domain Modal
export function ConfigureDomainModal({ isOpen, onClose, customer, onUpdateDomain }) {
  const [domainName, setDomainName] = useState(customer?.domain || customer?.website || '');
  const [testingDns, setTestingDns] = useState(false);
  const [dnsSuccess, setDnsSuccess] = useState(true);

  if (!isOpen) return null;

  const handleTestDns = () => {
    setTestingDns(true);
    setTimeout(() => {
      setTestingDns(false);
      setDnsSuccess(true);
    }, 900);
  };

  const handleSaveDomain = (e) => {
    e.preventDefault();
    if (onUpdateDomain) {
      onUpdateDomain(domainName);
    }
    onClose();
  };

  return (
    <div className="portal-modal-backdrop" onClick={onClose}>
      <div className="portal-modal-box" style={{ maxWidth: '540px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>🌐 Configure &amp; Launch Web Domain</h3>
          <button type="button" className="btn-close-drawer" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSaveDomain}>
          <div className="form-group-block">
            <label>Registered Company Domain Name<span>*</span></label>
            <input
              type="text"
              required
              value={domainName}
              onChange={(e) => setDomainName(e.target.value)}
              className="clean-input"
              placeholder="e.g. www.yourcompany.com"
            />
          </div>

          <div style={{ display: 'flex', gap: '8px', margin: '10px 0 16px', flexWrap: 'wrap' }}>
            <span style={{ background: 'rgba(255, 184, 0, 0.15)', color: '#ffb800', border: '1px solid rgba(255, 184, 0, 0.3)', padding: '3px 10px', borderRadius: '12px', fontSize: '0.78rem', fontWeight: 700 }}>
              ✦ Free with Tier 1
            </span>
            <span style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '3px 10px', borderRadius: '12px', fontSize: '0.78rem', fontWeight: 700 }}>
              🔒 SSL Secured (TLS 1.3)
            </span>
            <span style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.3)', padding: '3px 10px', borderRadius: '12px', fontSize: '0.78rem', fontWeight: 700 }}>
              ⚡ Cloudflare Edge
            </span>
          </div>

          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px', marginBottom: '16px', overflowX: 'auto' }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
              Authoritative DNS Record Settings
            </div>
            <table style={{ width: '100%', fontSize: '0.76rem', borderCollapse: 'collapse', color: '#475569' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                  <th style={{ padding: '4px 6px' }}>Type</th>
                  <th style={{ padding: '4px 6px' }}>Host</th>
                  <th style={{ padding: '4px 6px' }}>Target / Value</th>
                  <th style={{ padding: '4px 6px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                  <td style={{ padding: '6px' }}><strong>A</strong></td>
                  <td style={{ padding: '6px' }}>@</td>
                  <td style={{ padding: '6px' }}><code>76.76.21.21</code></td>
                  <td style={{ padding: '6px', color: '#10b981' }}>✓ Propagated</td>
                </tr>
                <tr>
                  <td style={{ padding: '6px' }}><strong>CNAME</strong></td>
                  <td style={{ padding: '6px' }}>www</td>
                  <td style={{ padding: '6px' }}><code>cname.admafia.marketing</code></td>
                  <td style={{ padding: '6px', color: '#10b981' }}>✓ Active</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
            <button
              type="button"
              onClick={handleTestDns}
              className="btn-portal-secondary"
              style={{ fontSize: '0.8rem', padding: '8px 14px' }}
            >
              {testingDns ? 'Checking DNS...' : '🔄 Test DNS Propagation'}
            </button>
            {dnsSuccess && (
              <span style={{ fontSize: '0.78rem', color: '#10b981', fontWeight: 600 }}>
                ✓ DNS Records Valid &amp; SSL Live
              </span>
            )}
          </div>

          <div className="modal-actions-row">
            <button type="submit" className="btn-portal-primary" style={{ flex: 1 }}>
              Save &amp; Bind Custom Domain
            </button>
            <button type="button" onClick={onClose} className="btn-portal-secondary">
              Close
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Modal 10: Complete Setup Now / Registration Onboarding Wizard
export function CompleteRegistrationModal({ isOpen, onClose, customer, onComplete }) {
  const cleanCust = sanitizeCustomerProfileFields(customer || {});
  const [step, setStep] = useState(1);
  const [stepError, setStepError] = useState('');
  const [formData, setFormData] = useState({
    companyName: customer?.companyName || customer?.name || '',
    category: cleanCust.category || '',
    contactPerson: customer?.contactPerson || customer?.contact || customer?.username || '',
    email: customer?.email || '',
    phone: customer?.phone || '',
    city: cleanCust.city || '',
    state: cleanCust.state || '',
    country: customer?.country || 'India',
  });

  if (!isOpen) return null;

  const handleNext = () => {
    setStepError('');
    if (step === 1 && !formData.companyName.trim()) {
      setStepError('Company Name is required.');
      return;
    }
    if (step === 2 && !formData.category.trim()) {
      setStepError('Please select your Business Category.');
      return;
    }
    if (step === 3) {
      if (!formData.contactPerson.trim()) {
        setStepError('Contact Person Name is required.');
        return;
      }
      const emailTrimmed = formData.email.trim();
      if (!emailTrimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailTrimmed)) {
        setStepError('Please enter a valid Business Email address.');
        return;
      }
    }
    if (step < 4) {
      setStep(step + 1);
    } else {
      if (!formData.city.trim()) {
        setStepError('Operating City is required.');
        return;
      }
      if (!formData.state.trim()) {
        setStepError('State / Province is required.');
        return;
      }
      const nextPayload = {
        companyName: formData.companyName.trim(),
        category: formData.category.trim(),
        contactPerson: formData.contactPerson.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        city: formData.city.trim(),
        state: formData.state.trim(),
        country: formData.country.trim() || 'India',
      };
      const evalRes = evaluateCustomerProfileCompletion({ ...customer, ...nextPayload });
      if (onComplete) {
        onComplete({
          ...nextPayload,
          kycPercent: evalRes.kycPercent,
          profileStatus: evalRes.profileStatus,
          profile_status: evalRes.profileStatus,
        });
      }
      onClose();
    }
  };

  return (
    <div className="portal-modal-backdrop" onClick={onClose}>
      <div className="portal-modal-box" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span style={{ fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#ffb800', fontWeight: 800 }}>
              Onboarding Step {step} of 4
            </span>
            <h3 style={{ margin: '4px 0 0' }}>Complete Setup &amp; Business Profile</h3>
          </div>
          <button type="button" className="btn-close-drawer" onClick={onClose}>&times;</button>
        </div>

        {/* 4 Step Progress Bar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', margin: '14px 0 20px' }}>
          {['1. Company', '2. Category', '3. Contact', '4. Location'].map((lbl, idx) => (
            <div
              key={lbl}
              style={{
                height: '4px',
                borderRadius: '4px',
                background: step >= idx + 1 ? '#ffb800' : 'rgba(148, 163, 184, 0.25)',
              }}
            ></div>
          ))}
        </div>

        {stepError && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '10px 12px', borderRadius: '10px', fontSize: '0.82rem', fontWeight: 600, marginBottom: '14px' }}>
            ⚠️ {stepError}
          </div>
        )}

        {step === 1 && (
          <div>
            <h4 style={{ color: '#0f172a', margin: '0 0 10px' }}>Step 1: Company Identity</h4>
            <div className="form-group-block">
              <label>Company Name<span>*</span></label>
              <input
                type="text"
                required
                value={formData.companyName}
                onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                className="clean-input"
              />
            </div>
            <p style={{ color: '#64748b', fontSize: '0.8rem', marginTop: '8px' }}>
              This organization name will appear across your CRM workspace and invoices.
            </p>
          </div>
        )}

        {step === 2 && (
          <div>
            <h4 style={{ color: '#0f172a', margin: '0 0 10px' }}>Step 2: Primary Business Category</h4>
            <div className="form-group-block">
              <label>Select Category<span>*</span></label>
              <select
                required
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="clean-select"
              >
                <option value="">— Select Your Business Category —</option>
                <option value="IT & Software">💻 IT &amp; Software</option>
                <option value="Hardware & Computer Accessories">🖥️ Hardware &amp; Computer Accessories</option>
                <option value="Construction & Building Materials">🏗️ Construction &amp; Building Materials</option>
                <option value="Manufacturing">🏭 Manufacturing</option>
                <option value="Digital Marketing">📈 Digital Marketing</option>
                <option value="Electrical Products">⚡ Electrical Products</option>
                <option value="Healthcare">🏥 Healthcare</option>
                <option value="Other Business">📦 Other Business</option>
              </select>
            </div>
            <p style={{ color: '#64748b', fontSize: '0.8rem', marginTop: '8px' }}>
              Your buyer enquiries are routed according to your registered business category.
            </p>
          </div>
        )}

        {step === 3 && (
          <div>
            <h4 style={{ color: '#0f172a', margin: '0 0 10px' }}>Step 3: Primary Contact Details</h4>
            <div className="form-group-block">
              <label>Contact Person Name<span>*</span></label>
              <input
                type="text"
                required
                value={formData.contactPerson}
                onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                className="clean-input"
              />
            </div>
            <div className="form-group-block">
              <label>Business Email<span>*</span></label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="clean-input"
              />
            </div>
          </div>
        )}

        {step === 4 && (
          <div>
            <h4 style={{ color: '#0f172a', margin: '0 0 10px' }}>Step 4: Headquarters &amp; Location</h4>
            <div className="form-group-block">
              <label>City<span>*</span></label>
              <input
                type="text"
                required
                placeholder="e.g. Ahmedabad, Bengaluru, Delhi"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="clean-input"
              />
            </div>
            <div className="form-group-block">
              <label>State / Province<span>*</span></label>
              <input
                type="text"
                required
                placeholder="e.g. Gujarat, Karnataka, Delhi"
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                className="clean-input"
              />
            </div>
            <div className="form-group-block">
              <label>Country</label>
              <input
                type="text"
                value={formData.country}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                className="clean-input"
              />
            </div>
            <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '10px', padding: '12px', marginTop: '12px' }}>
              <strong style={{ color: '#059669', fontSize: '0.84rem' }}>✓ Ready to Activate Workspace</strong>
              <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#475569' }}>
                Clicking &ldquo;Activate Workspace&rdquo; verifies your business profile and enables territory-matched buyer lead delivery.
              </p>
            </div>
          </div>
        )}

        <div className="modal-actions-row" style={{ marginTop: '20px' }}>
          {step > 1 && (
            <button
              type="button"
              onClick={() => { setStepError(''); setStep(step - 1); }}
              className="btn-portal-secondary"
            >
              &larr; Back
            </button>
          )}
          <button
            type="button"
            onClick={handleNext}
            className="btn-portal-primary"
            style={{ flex: 1 }}
          >
            {step === 4 ? 'Activate Workspace & Unlock Verified Status ✓' : 'Next Step →'}
          </button>
        </div>
      </div>
    </div>
  );
}




// Modal 11: Marketing & Growth Budget Payment (Step 1 of 2) with Razorpay Integration (Pure Wallet Top-Up — No Days Configuration)
export function MarketingGrowthPaymentModal({
  isOpen,
  onClose,
  onPay,
  onPaymentFailed,
  customer = {},
  dailyAdSpend = 300,
}) {
  const [budget, setBudget] = useState('600');
  const [selectedPreset, setSelectedPreset] = useState(600);
  const [isProcessing, setIsProcessing] = useState(false);
  const [sweetAlert, setSweetAlert] = useState(null);
  const walletCurrency = String(customer?.currency || 'INR').toUpperCase();

  if (!isOpen) return null;

  if (walletCurrency === 'USD') return (
    <div className="portal-modal-backdrop" role="presentation">
      <div className="portal-modal-box" role="dialog" aria-modal="true" aria-label="USD wallet funding unavailable">
        <h3>USD wallet payments are unavailable</h3>
        <p>International payment processing is not enabled yet. Your USD wallet and balance remain unchanged.</p>
        <button type="button" className="btn-portal-secondary" onClick={onClose}>Close</button>
      </div>
    </div>
  );

  const durationPresets = [
    { days: 1, amount: 300, label: '1 Day', tag: 'Min' },
    { days: 2, amount: 600, label: '2 Days', tag: null },
    { days: 3, amount: 900, label: '3 Days', tag: null },
    { days: 5, amount: 1500, label: '5 Days', tag: null },
    { days: 7, amount: 2100, label: '7 Days', tag: '1 Wk' },
    { days: 15, amount: 4500, label: '15 Days', tag: null },
    { days: 30, amount: 9000, label: '30 Days', tag: '1 MONTH' },
    { days: 60, amount: 18000, label: '60 Days', tag: '2 MONTHS' },
  ];

  const currentAmount = budget ? parseInt(budget, 10) : 0;
  const pacingRate = dailyAdSpend || 300;
  const calculatedDays = currentAmount > 0 ? Math.max(1, Math.round(currentAmount / pacingRate)) : 0;

  const handleSelectPreset = (p) => {
    setSelectedPreset(p.amount);
    setBudget(String(p.amount));
  };

  const handleCustomChange = (e) => {
    const val = e.target.value.replace(/\D/g, '');
    setBudget(val);
    const num = parseInt(val, 10);
    const matching = durationPresets.find((p) => p.amount === num);
    setSelectedPreset(matching ? matching.amount : null);
  };

  const loadRazorpayScript = () => {
    return new Promise((resolve) => {
      if (window.Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handlePaySubmit = async (e) => {
    e.preventDefault();
    if (!currentAmount || currentAmount < 300) {
      setSweetAlert({
        type: 'warning',
        title: 'Minimum Top-Up is ₹300',
        message: 'Minimum wallet top-up amount is ₹300. Please enter ₹300 or higher to continue.',
        confirmText: 'Set ₹300',
        onConfirm: () => {
          setBudget('300');
          setSelectedPreset(300);
          setSweetAlert(null);
        },
        secondaryText: 'OK',
        onSecondary: () => setSweetAlert(null),
      });
      return;
    }

    setIsProcessing(true);

    try {
      const cleanPhone = String(customer?.phone || customer?.username || '').replace(/\D/g, '').slice(-10);

      // 1. Create real Razorpay order on backend
      const orderRes = await crmApi.createRazorpayOrder({
        customerId: customer?.id,
        phone: cleanPhone || customer?.phone,
        username: customer?.username,
        amount: currentAmount,
      });

      if (!orderRes?.ok || !orderRes?.orderId) {
        throw new Error(orderRes?.error || 'Could not start payment. Please retry.');
      }

      // 2. Load Razorpay Standard Checkout SDK
      const scriptReady = await loadRazorpayScript();
      if (!scriptReady || !window.Razorpay) {
        const linkRes = await crmApi.createRazorpayPaymentLink({
          customerId: customer?.id,
          phone: cleanPhone,
          username: customer?.username,
          amount: currentAmount,
        });
        if (linkRes?.paymentUrl) {
          window.location.assign(linkRes.paymentUrl);
          return;
        }
        throw new Error('Razorpay Checkout failed to load.');
      }

      // 3. Open direct Razorpay Checkout popup
      const options = {
        key: orderRes.keyId,
        amount: orderRes.amount,
        currency: orderRes.currency || 'INR',
        name: 'Ad Mafia',
        description: `Growth Wallet Instant Top-Up (₹${currentAmount.toLocaleString('en-IN')})`,
        image: 'https://admafia.marketing/assets/logo.png',
        order_id: orderRes.orderId,
        prefill: {
          name: customer?.contactPerson || customer?.companyName || customer?.name || customer?.username || 'Ad Mafia Customer',
          ...(cleanPhone && cleanPhone.length === 10 ? { contact: cleanPhone } : {}),
          email: customer?.email || `${cleanPhone || 'client'}@admafia.marketing`,
        },
        notes: {
          customer_id: String(customer?.id || ''),
          customer_phone: cleanPhone,
        },
        theme: {
          color: '#4f46e5',
        },
        handler: async function (response) {
          const verifyPayload = {
            orderId: response.razorpay_order_id || orderRes.orderId,
            paymentId: response.razorpay_payment_id,
            signature: response.razorpay_signature,
            customerId: customer?.id,
            phone: cleanPhone,
            username: customer?.username,
            amount: currentAmount,
          };

          const attemptVerify = async (isRetry = false) => {
            try {
              const verifyRes = await crmApi.verifyRazorpayPayment(verifyPayload);
              if (verifyRes?.ok) {
                setIsProcessing(false);
                if (onPay) {
                  onPay(currentAmount, response.razorpay_payment_id, verifyRes);
                }
                return true;
              }
              throw new Error(verifyRes?.error || 'Payment verification could not be confirmed.');
            } catch (err) {
              if (!isRetry) {
                console.warn('[GrowthWalletModal] Initial verification attempt failed, retrying in 1.5s...', err.message);
                await new Promise((resolve) => setTimeout(resolve, 1500));
                return attemptVerify(true);
              }
              throw err;
            }
          };

          try {
            await attemptVerify();
          } catch (vErr) {
            console.error('[GrowthWalletModal Verify Error]', vErr);
            setIsProcessing(false);
            setSweetAlert({
              type: 'warning',
              title: 'Payment Received — Confirming Status',
              message: `Your payment was completed on Razorpay (Ref: ${response.razorpay_payment_id}). Bank confirmation is completing. Click "Check Status" to confirm your wallet balance.`,
              confirmText: '🔄 Check Status Now',
              onConfirm: async () => {
                setSweetAlert(null);
                setIsProcessing(true);
                try {
                  const checkRes = await crmApi.verifyRazorpayPayment(verifyPayload);
                  if (checkRes?.ok) {
                    setIsProcessing(false);
                    if (onPay) onPay(currentAmount, response.razorpay_payment_id, checkRes);
                  } else {
                    throw new Error(checkRes?.error || 'Verification still pending.');
                  }
                } catch (retryErr) {
                  setIsProcessing(false);
                  setSweetAlert({
                    type: 'info',
                    title: 'Payment Processing with Bank',
                    message: `Payment reference ${response.razorpay_payment_id} is recorded. Your wallet balance will update automatically within 1–2 minutes.`,
                    confirmText: 'OK',
                    onConfirm: () => {
                      setSweetAlert(null);
                      onClose();
                    },
                  });
                }
              },
              secondaryText: 'Close',
              onSecondary: () => {
                setSweetAlert(null);
                onClose();
              },
            });
          }
        },
        modal: {
          ondismiss: function () {
            setIsProcessing(false);
            const dismissRef = `DISMISS-${Date.now().toString().slice(-6)}`;
            if (onPaymentFailed) {
              onPaymentFailed({
                id: `tx_fail_${Date.now()}`,
                ref: dismissRef,
                amount: currentAmount,
                desc: 'Payment checkout dismissed by user',
                status: 'Failed ✕',
                type: 'Credit',
                method: 'Razorpay Secure',
                failureReason: 'Checkout closed by user',
                date: 'Today, Just now',
              });
            }
            try {
              crmApi.recordFailedTransaction({
                customerId: customer?.id,
                phone: customer?.phone,
                username: customer?.username,
                companyName: customer?.companyName || customer?.name,
                amount: currentAmount,
                referenceUtr: dismissRef,
                description: 'Payment checkout dismissed by user',
                failureReason: 'Checkout closed by user',
                paymentMethod: 'Razorpay Secure',
              }).catch(() => {});
            } catch (e) {}
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', function (resp) {
        setIsProcessing(false);
        const failReason = resp.error?.description || resp.error?.reason || 'Payment failed';
        const failRef = resp.error?.metadata?.payment_id || `FAIL-${Date.now().toString().slice(-6)}`;
        if (onPaymentFailed) {
          onPaymentFailed({
            id: `tx_fail_${Date.now()}`,
            ref: failRef,
            amount: currentAmount,
            desc: `Online recharge failed: ${failReason}`,
            status: 'Failed ✕',
            type: 'Credit',
            method: 'Razorpay Secure',
            failureReason: failReason,
            date: 'Today, Just now',
          });
        }
        try {
          crmApi.recordFailedTransaction({
            customerId: customer?.id,
            phone: customer?.phone,
            username: customer?.username,
            companyName: customer?.companyName || customer?.name,
            amount: currentAmount,
            referenceUtr: failRef,
            description: `Online recharge failed: ${failReason}`,
            failureReason: failReason,
            paymentMethod: 'Razorpay Secure',
          }).catch(() => {});
        } catch (e) {}
        setSweetAlert({
          type: 'error',
          title: 'Payment Failed',
          message: failReason,
          confirmText: 'OK',
          onConfirm: () => setSweetAlert(null),
        });
      });

      setIsProcessing(false);
      rzp.open();
    } catch (err) {
      setIsProcessing(false);
      setSweetAlert({
        type: 'error',
        title: 'Could not open checkout',
        message: err.message || 'Payment initiation failed. Please try again.',
        confirmText: 'OK',
        onConfirm: () => setSweetAlert(null),
      });
    }
  };

  return (
    <div className="payment-complete-modal-backdrop" onClick={onClose}>
      <SweetAlertModal alertState={sweetAlert} onClose={() => setSweetAlert(null)} />
      <div
        className="payment-complete-modal-card"
        style={{ maxWidth: '520px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Luminous Gradient Strip */}
        <div className="payment-modal-top-accent" />

        {/* Header */}
        <div className="payment-modal-header-row">
          <div className="payment-modal-header-left">
            <div className="payment-modal-orange-icon">
              <TrendingUp size={24} strokeWidth={2.6} />
            </div>
            <div className="payment-modal-title-stack">
              <div className="payment-modal-steps-tag">
                <span className="step-pill">Step 1 of 2</span>
                <span className="step-label">Add Wallet Balance</span>
              </div>
              <h2>Growth Wallet Top-Up</h2>
              <p>100% directly added to your Growth Wallet for verified buyer lead delivery</p>
            </div>
          </div>
          <button
            type="button"
            className="payment-modal-close-btn"
            onClick={onClose}
            title="Close modal"
            aria-label="Close modal"
          >
            <X size={16} />
          </button>
        </div>

        {/* Set Amount Input & Quick Presets */}
        <form onSubmit={handlePaySubmit}>
          {/* 1. GROWTH WALLET BUDGET | ÷ ₹300/day → | ESTIMATED ACTIVE DAYS Split Row */}
          <div className="payment-calc-split-row">
            <div className="calc-col-budget">
              <label className="calc-col-label">GROWTH WALLET BUDGET</label>
              <div className="budget-input-wrapper">
                <span className="currency-symbol">₹</span>
                <input
                  type="text"
                  className="budget-number-input"
                  value={budget}
                  onChange={handleCustomChange}
                  placeholder="600"
                  autoFocus
                />
              </div>
            </div>

            <div className="calc-divider-pill-wrap">
              <span className="calc-divider-pill">÷ ₹{pacingRate}/day →</span>
            </div>

            <div className="calc-col-runtime">
              <label className="calc-col-label">ESTIMATED ACTIVE DAYS</label>
              <div className="runtime-display-box">
                <div className="runtime-cal-badge">
                  <Calendar className="runtime-cal-icon" size={16} />
                </div>
                <div className="runtime-text-stack">
                  <strong className="runtime-days-text">{calculatedDays} Days</strong>
                  <span className="runtime-sub-text">Enter budget or select duration below</span>
                </div>
              </div>
            </div>
          </div>

          {/* 2. Quick Duration Presets Header */}
          <div className="presets-section-heading">
            <span>QUICK DURATION PRESETS:</span>
            <span className="presets-hint-text">Select duration to auto-calculate budget</span>
          </div>

          {/* 3. Duration Presets 4x2 Grid */}
          <div className="duration-presets-unified-grid">
            {durationPresets.map((p) => {
              const isSelected = selectedPreset === p.amount;
              return (
                <div
                  key={p.days}
                  className={`duration-preset-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleSelectPreset(p)}
                >
                  <div className="preset-top-line" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span className="preset-day-label" style={{ fontWeight: 700, fontSize: '0.88rem' }}>{p.label}</span>
                    {p.tag ? (
                      <span className="preset-mini-tag" style={{
                        background: '#e0e7ff',
                        color: '#4338ca',
                        fontSize: '0.68rem',
                        fontWeight: 800,
                        padding: '2px 6px',
                        borderRadius: '6px'
                      }}>
                        {p.tag}
                      </span>
                    ) : isSelected ? (
                      <span className="preset-check-dot-inline" style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: '#6366f1',
                        display: 'inline-block'
                      }} />
                    ) : null}
                  </div>
                  <div className="preset-price-val" style={{ fontSize: '1.1rem', fontWeight: 800 }}>
                    ₹{p.amount.toLocaleString('en-IN')}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 4. Pay Now Button (Matching Screenshot) */}
          <button
            type="submit"
            className="btn-payment-modal-pay"
            disabled={isProcessing}
          >
            <span>{isProcessing ? 'Opening Razorpay Secure...' : 'Pay Now →'}</span>
          </button>
        </form>
      </div>
    </div>
  );
}


// Modal 12: Business Profile & Contact Details Registration
export function BusinessProfileModal({
  isOpen,
  onClose,
  onSave,
  customer = {},
}) {
  const initClean = sanitizeCustomerProfileFields(customer || {});
  const [formData, setFormData] = useState({
    companyName: customer.companyName || customer.name || '',
    category: initClean.category || '',
    website: customer.website || customer.domain || '',
    industry: initClean.industry || '',
    contactPerson: customer.contactPerson || customer.contact || customer.username || '',
    email: customer.email || '',
    phone: customer.phone || '',
    personalEmail: customer.personalEmail || '',
    city: initClean.city || '',
    state: initClean.state || '',
    country: customer.country || 'India',
  });

  useEffect(() => {
    if (isOpen) {
      const clean = sanitizeCustomerProfileFields(customer || {});
      setFormData({
        companyName: customer.companyName || customer.name || '',
        category: clean.category || '',
        website: customer.website || customer.domain || '',
        industry: clean.industry || '',
        contactPerson: customer.contactPerson || customer.contact || customer.username || '',
        email: customer.email || '',
        phone: customer.phone || '',
        personalEmail: customer.personalEmail || '',
        city: clean.city || '',
        state: clean.state || '',
        country: customer.country || 'India',
      });
    }
  }, [isOpen, customer]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const profEval = evaluateCustomerProfileCompletion({ ...customer, ...formData });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.companyName.trim()) {
      setError('Company Name is required.');
      return;
    }
    if (!formData.category.trim()) {
      setError('Business Category is required.');
      return;
    }
    if (!formData.contactPerson.trim()) {
      setError('Contact Person Name is required.');
      return;
    }
    const emailClean = formData.email.trim();
    if (!emailClean || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailClean)) {
      setError('A valid Business Email address is required.');
      return;
    }
    if (!formData.phone.trim()) {
      setError('Direct Phone / WhatsApp Number is required.');
      return;
    }
    if (!formData.city.trim()) {
      setError('Operating City is required.');
      return;
    }
    if (!formData.state.trim()) {
      setError('State / Province is required.');
      return;
    }

    setError('');
    setIsSubmitting(true);

    const submitEval = evaluateCustomerProfileCompletion({ ...customer, ...formData });
    setTimeout(() => {
      setIsSubmitting(false);
      onSave({
        ...formData,
        kycPercent: submitEval.kycPercent,
        profileStatus: submitEval.profileStatus,
        profile_status: submitEval.profileStatus,
      });
    }, 400);
  };

  return (
    <div className="portal-modal-backdrop" onClick={onClose}>
      <div className="business-profile-modal-card business-profile-modal-large" onClick={(e) => e.stopPropagation()}>
        {/* Top Accent Strip */}
        <div className="biz-modal-top-accent" />

        {/* Modal Header */}
        <div className="biz-modal-header">
          <div className="biz-header-left">
            <div className="biz-header-icon-box">
              <Building2 size={26} strokeWidth={2.4} />
            </div>
            <div>
              <div className="biz-modal-badge-row">
                <span className="biz-step-pill">Step 2 of 2</span>
                <span className="biz-verified-status">Workspace Configuration</span>
                <span className="biz-kyc-live-pill">
                  <span className="biz-pulsing-dot" /> Profile Completion: {profEval.kycPercent}%
                </span>
              </div>
              <h2 className="biz-modal-main-title">Business Profile &amp; Information Submission</h2>
              <p className="biz-modal-subtitle">
                Payment verified ✓ Please complete all required organization and contact details below, then click submit to launch your CRM dashboard.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="biz-modal-close-btn"
            onClick={onClose}
            title="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        

        {error && (
          <div className="biz-error-banner">
            <span>⚠️ {error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="biz-modal-form">
          {/* Section 1: Company Information */}
          <div className="biz-form-section-card">
            <div className="biz-section-title-wrap">
              <div className="biz-section-number-icon num-green"><Building2 size={18} /></div>
              <div className="biz-section-title-text">
                <h3>Company Information</h3>
                <small>Organization and brand details</small>
              </div>
            </div>

            <div className="biz-grid-2col">
              {/* Company Name* */}
              <div className="biz-field-group">
                <label>
                  <span>Company Name</span>
                  <span className="req-star">*</span>
                </label>
                <div className="biz-input-box">
                  <Building2 size={17} className="biz-input-icon" />
                  <input
                    type="text"
                    required
                    placeholder="Enter your company name"
                    value={formData.companyName}
                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                  />
                </div>
              </div>

              {/* Business Category* */}
              <div className="biz-field-group">
                <label>
                  <span>Business Category</span>
                  <span className="req-star">*</span>
                </label>
                <div className="biz-input-box">
                  <Layers size={17} className="biz-input-icon" />
                  <select
                    required
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  >
                    <option value="">— Select Your Business Category —</option>
                    <option value="IT & Software">IT &amp; Software</option>
                    <option value="Organic Food & FMCG">Organic Food &amp; FMCG</option>
                    <option value="Manufacturing">Manufacturing</option>
                    <option value="Healthcare & Wellness">Healthcare &amp; Wellness</option>
                    <option value="Real Estate & Infrastructure">Real Estate &amp; Infrastructure</option>
                    <option value="Retail & E-commerce">Retail &amp; E-commerce</option>
                    <option value="Financial & Consulting">Financial &amp; Consulting</option>
                    <option value="Education & Coaching">Education &amp; Coaching</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <span className="biz-field-helper">Determines customer group allocation and targeted lead distribution</span>
              </div>

              {/* Company Website */}
              <div className="biz-field-group">
                <label>
                  <span>Company Website</span>
                </label>
                <div className="biz-input-box">
                  <Globe size={17} className="biz-input-icon" />
                  <input
                    type="text"
                    placeholder="e.g. www.yourcompany.com"
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                  />
                </div>
                <span className="biz-field-helper">Optional — leave blank if currently in development</span>
              </div>

              {/* Primary Industry* */}
              <div className="biz-field-group">
                <label>
                  <span>Primary Industry</span>
                  <span className="req-star">*</span>
                </label>
                <div className="biz-input-box">
                  <Briefcase size={17} className="biz-input-icon" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. Software Services / Consulting"
                    value={formData.industry}
                    onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                  />
                </div>
                <span className="biz-field-helper">Choose from suggestions or type your custom niche</span>
              </div>
            </div>
          </div>

          {/* Section 2: Primary Contact Information */}
          <div className="biz-form-section-card">
            <div className="biz-section-title-wrap">
              <div className="biz-section-number-icon num-indigo"><User size={18} /></div>
              <div className="biz-section-title-text">
                <h3>Primary Contact Information</h3>
                <small>Workspace administrator</small>
              </div>
            </div>

            <div className="biz-grid-2col">
              {/* Contact Person Name* */}
              <div className="biz-field-group">
                <label>
                  <span>Contact Person Name</span>
                  <span className="req-star">*</span>
                </label>
                <div className="biz-input-box">
                  <User size={17} className="biz-input-icon" />
                  <input
                    type="text"
                    required
                    placeholder="Enter administrator full name"
                    value={formData.contactPerson}
                    onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                  />
                </div>
              </div>

              {/* Business Email* */}
              <div className="biz-field-group">
                <label>
                  <span>Business Email</span>
                  <span className="req-star">*</span>
                </label>
                <div className="biz-input-box">
                  <Mail size={17} className="biz-input-icon" />
                  <input
                    type="email"
                    required
                    placeholder="Enter business email address"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
              </div>

              {/* Direct Phone / WhatsApp Number* */}
              <div className="biz-field-group">
                <label>
                  <span>Direct Phone / WhatsApp Number</span>
                  <span className="req-star">*</span>
                </label>
                <div className="biz-input-box">
                  <Phone size={17} className="biz-input-icon" />
                  <input
                    type="tel"
                    required
                    placeholder="Enter 10-digit mobile number"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
                <span className="biz-field-helper">10-digit mobile number (e.g. 9820012345)</span>
              </div>

              {/* Personal Email */}
              <div className="biz-field-group">
                <label>
                  <span>Personal Email</span>
                </label>
                <div className="biz-input-box">
                  <Mail size={17} className="biz-input-icon" />
                  <input
                    type="email"
                    placeholder="rahul.personal@example.com"
                    value={formData.personalEmail}
                    onChange={(e) => setFormData({ ...formData, personalEmail: e.target.value })}
                  />
                </div>
                <span className="biz-field-helper">Optional backup address</span>
              </div>
            </div>
          </div>

          {/* Section 3: Headquarters & Location */}
          <div className="biz-form-section-card">
            <div className="biz-section-title-wrap">
              <div className="biz-section-number-icon num-violet"><MapPin size={18} /></div>
              <div className="biz-section-title-text">
                <h3>Headquarters &amp; Location</h3>
                <small>Geographic operational base</small>
              </div>
            </div>

            <div className="biz-grid-3col">
              {/* City* */}
              <div className="biz-field-group">
                <label>
                  <span>City</span>
                  <span className="req-star">*</span>
                </label>
                <div className="biz-input-box">
                  <MapPin size={17} className="biz-input-icon" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ahmedabad, Bengaluru, Delhi"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  />
                </div>
              </div>

              {/* State / Province* */}
              <div className="biz-field-group">
                <label>
                  <span>State / Province</span>
                  <span className="req-star">*</span>
                </label>
                <div className="biz-input-box">
                  <MapPin size={17} className="biz-input-icon" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. Gujarat, Karnataka, Delhi"
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  />
                </div>
              </div>

              {/* Country */}
              <div className="biz-field-group">
                <label>
                  <span>Country</span>
                </label>
                <div className="biz-input-box">
                  <Globe size={17} className="biz-input-icon" />
                  <input
                    type="text"
                    placeholder="India"
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Modal Action Buttons Bar */}
          <div className="biz-modal-actions-bar">
            <div className="biz-actions-reassurance">
              <ShieldCheck size={18} color="#059669" />
              <span>
                Instant sync with <strong>Sub Admin Desk 04</strong> &bull; Profile Completion Verified upon save
              </span>
            </div>
            <div className="biz-actions-btn-group">
              <button
                type="button"
                className="btn-biz-cancel"
                onClick={onClose}
              >
                Close
              </button>
              <button
                type="submit"
                className="btn-biz-complete-submit"
                disabled={isSubmitting}
              >
                <span>{isSubmitting ? 'Submitting All Information...' : 'Submit All Information & Open Dashboard'}</span>
                <ArrowRight size={18} className="biz-submit-arrow" />
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
