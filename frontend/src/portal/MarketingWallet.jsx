import React, { useState } from 'react';

export default function MarketingWallet({
  walletBalance = 0,
  transactions = [],
  dailyAdSpend = 300,
  customer = {},
  leadsCount = 0,
  onTopUpWallet,
  onDeductDailyAdSpend,
  onToggleCampaign,
  onOpenSetDailyLimit,
  onViewInvoice,
  invoices = [],
}) {
  const [selectedPreset, setSelectedPreset] = useState(null);
  const [customAmount, setCustomAmount] = useState('300');
  const [activeLedgerTab, setActiveLedgerTab] = useState('all'); // 'all' | 'recharges' | 'deductions' | 'invoices'
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [actionAlert, setActionAlert] = useState(null); // { type: 'success' | 'error', message: string }
  const [daysDeliveredCount, setDaysDeliveredCount] = useState(0);
  const [copiedTxId, setCopiedTxId] = useState(null);

  // Active recharge amount
  const activeAmount = customAmount ? Number(customAmount) || 0 : (selectedPreset || 300);
  const calculatedRuntimeDays = Math.max(1, Math.floor(activeAmount / (dailyAdSpend || 300)));
  const daysRunway = Math.floor(walletBalance / (dailyAdSpend || 300));
  const isCampaignLive = (customer.adCampaignActive ?? true) && walletBalance >= dailyAdSpend;

  // Presets exact specification (Pure wallet amounts — no days configuration)
  const presets = [
    { label: '₹300', amount: 300, tag: 'Min' },
    { label: '₹500', amount: 500, tag: null },
    { label: '₹1,000', amount: 1000, tag: 'Popular' },
    { label: '₹2,000', amount: 2000, tag: null },
    { label: '₹5,000', amount: 5000, tag: null },
    { label: '₹10,000', amount: 10000, tag: 'Best Value' },
  ];

  // Ledger counts
  const creditsList = transactions.filter((t) => t.type === 'Credit');
  const debitsList = transactions.filter((t) => t.type === 'Debit');
  const totalSpent = debitsList.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const totalPaidLifetime = creditsList.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  // Filtered transactions for the selected ledger tab
  let filteredTxList = [];
  if (activeLedgerTab === 'all') {
    filteredTxList = transactions;
  } else if (activeLedgerTab === 'recharges') {
    filteredTxList = creditsList;
  } else if (activeLedgerTab === 'deductions') {
    filteredTxList = debitsList;
  }

  // Handle preset click
  const handleSelectPreset = (amount) => {
    setSelectedPreset(amount);
    setCustomAmount('');
  };

  // Handle custom amount input
  const handleCustomAmountChange = (e) => {
    const val = e.target.value.replace(/[^\d]/g, '');
    setSelectedPreset(null);
    setCustomAmount(val);
  };

  const handleQuickAddAmount = (addVal) => {
    const current = Number(customAmount || selectedPreset || 0);
    const next = current + addVal;
    setSelectedPreset(null);
    setCustomAmount(String(next));
  };

  // Copy Transaction ID to clipboard
  const handleCopyTxId = (id) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(id);
      setCopiedTxId(id);
      setTimeout(() => setCopiedTxId(null), 2000);
    }
  };

  // Trigger Razorpay payment top-up
  const handlePayViaRazorpay = () => {
    if (activeAmount < 300) {
      setActionAlert({ type: 'error', message: 'Minimum wallet recharge amount is ₹300.' });
      setTimeout(() => setActionAlert(null), 3000);
      return;
    }

    setIsProcessingPayment(true);
    setTimeout(() => {
      setIsProcessingPayment(false);
      const generatedUtr = `rzp_test_${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
      if (onTopUpWallet) {
        onTopUpWallet(activeAmount, generatedUtr);
      }
      setActionAlert({
        type: 'success',
        message: `Payment Verified! ₹${activeAmount.toLocaleString('en-IN')} added directly to wallet via Razorpay (Ref: ${generatedUtr}).`,
      });
      setTimeout(() => setActionAlert(null), 4000);
    }, 800);
  };

  // Trigger Deduct Today's ₹300 Ad Spend
  const handleDeductTodaySpend = () => {
    if (onDeductDailyAdSpend) {
      const res = onDeductDailyAdSpend();
      if (res && res.success) {
        setDaysDeliveredCount((prev) => prev + 1);
        setActionAlert({ type: 'success', message: res.message });
      } else {
        setActionAlert({
          type: 'error',
          message: res?.message || `Insufficient balance! Please recharge wallet to deduct today's ₹${dailyAdSpend}.`,
        });
      }
      setTimeout(() => setActionAlert(null), 3500);
    }
  };

  // Print Statement
  const handlePrintStatement = () => {
    window.print();
  };

  // Scroll to recharge section
  const scrollToTopUp = () => {
    const el = document.getElementById('instant-topup-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="portal-wallet-exact-page redesigned-wallet-hub">
      {/* 1. Header Bar with Status & Quick Actions */}
      <div className="wallet-top-breadcrumb-bar">
        <div className="breadcrumb-line">
          <span className="crumb-root">Lead Hub</span>
          <span className="crumb-slash">/</span>
          <span className="crumb-current">Growth Wallet &amp; Credits</span>
        </div>

        <div className="wallet-header-actions-group">
          <button
            type="button"
            onClick={scrollToTopUp}
            className="btn-quick-topup-exact"
            title="Instant wallet recharge via Razorpay"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>+ Quick Top-Up</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveLedgerTab('invoices');
              const el = document.getElementById('wallet-ledger-section');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}
            className="btn-statement-exact"
            title="View GST invoices & statements"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            <span>GST Invoices</span>
          </button>
        </div>
      </div>

      <div className="wallet-title-block">
        <div className="wallet-title-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <line x1="2" y1="10" x2="22" y2="10" />
            </svg>
            <h1>Growth Wallet &amp; Credits</h1>
          </div>
          <span className={`wallet-status-pill-badge ${isCampaignLive ? 'active' : 'paused'}`}>
            <span className="pulse-dot"></span>
            <span>{isCampaignLive ? 'Live Campaign Active' : 'Paused (Low Balance)'}</span>
          </span>
        </div>
        <p className="wallet-desc-lead">
          Manage your advertising wallet balance, instant top-ups, daily campaign run rate, and official GST tax invoices.
        </p>
      </div>

      {/* Action Notification Alert Banner */}
      {actionAlert && (
        <div className={`wallet-action-alert-banner ${actionAlert.type}`}>
          <span className="alert-badge-icon">
            {actionAlert.type === 'success' ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e11d48" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            )}
          </span>
          <span className="alert-badge-text">{actionAlert.message}</span>
          <button type="button" onClick={() => setActionAlert(null)} className="btn-close-alert">✕</button>
        </div>
      )}

      {/* 2. Top 4 Financial KPI Cards Grid */}
      <div className="wallet-kpi-quad-exact-grid">
        {/* Card 1: Available Balance */}
        <div className="wallet-exact-kpi-card balance-card">
          <div className="kpi-card-top-line">
            <span className="kpi-card-label">Available Balance</span>
            <div className="kpi-card-icon-badge balance">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <line x1="2" y1="10" x2="22" y2="10" />
              </svg>
            </div>
          </div>
          <div className="kpi-card-value">₹{walletBalance.toLocaleString('en-IN')}</div>
          <div className="kpi-card-subline">
            <span>Total Paid: ₹{totalPaidLifetime.toLocaleString('en-IN')}</span>
            <span className="kpi-dot-divider">•</span>
            <button
              type="button"
              onClick={scrollToTopUp}
              className="kpi-link-addfunds"
            >
              + Add Funds
            </button>
          </div>
        </div>

        {/* Card 2: Daily Ad Spend */}
        <div className="wallet-exact-kpi-card spend-card">
          <div className="kpi-card-top-line">
            <span className="kpi-card-label">Daily Ad Spend</span>
            <div className="kpi-card-icon-badge spend">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            </div>
          </div>
          <div className="kpi-card-value">
            ₹{dailyAdSpend} <span className="kpi-unit-text">/ day</span>
          </div>
          <div className="kpi-card-subline">
            <span className="territory-chip">
              Target Territory: {[customer.city, customer.state].filter(Boolean).join(', ') || 'India'}
            </span>
          </div>
        </div>

        {/* Card 3: Campaign Runway */}
        <div className="wallet-exact-kpi-card runway-card">
          <div className="kpi-card-top-line">
            <span className="kpi-card-label">Campaign Runway</span>
            <div className="kpi-card-icon-badge runway">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
          </div>
          <div className="kpi-card-value">{daysRunway} Days</div>
          <div className="kpi-card-subline">
            <span>Est. runs uninterrupted for {daysRunway} days</span>
          </div>
        </div>

        {/* Card 4: Total Ad Spent */}
        <div className="wallet-exact-kpi-card total-card">
          <div className="kpi-card-top-line">
            <span className="kpi-card-label">Total Ad Spent</span>
            <div className="kpi-card-icon-badge total">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
            </div>
          </div>
          <div className="kpi-card-value">₹{totalSpent.toLocaleString('en-IN')}</div>
          <div className="kpi-card-subline">
            <span>Acquired {leadsCount} verified buyer leads (₹{leadsCount > 0 ? Math.round(totalSpent / leadsCount) : 0}/lead)</span>
          </div>
        </div>
      </div>

      {/* 3. Low Wallet Balance Warning Banner */}
      {walletBalance < dailyAdSpend && (
        <div className="wallet-low-balance-exact-alert">
          <div className="alert-text-group">
            <div className="alert-warning-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#be123c" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <div>
              <h3>Low Wallet Balance Warning: ₹{walletBalance.toFixed(0)} Remaining</h3>
              <p>Daily ad burn requires ₹{dailyAdSpend}/day. Inbound lead campaign is paused until recharged.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={scrollToTopUp}
            className="btn-recharge-wallet-exact"
          >
            + Recharge Wallet Now
          </button>
        </div>
      )}

      {/* 4. 📅 Day-Wise Ad Spend Engine Master Card */}
      <div className="daywise-adspend-engine-card">
        <div className="engine-card-header">
          <div className="engine-title-strip">
            <h2 className="engine-title-h2">
              <span className="engine-title-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </span>
              <span className="engine-title-text">Day-Wise Ad Spend Engine</span>
            </h2>
            <span className="engine-autocut-badge">₹{dailyAdSpend} / Day Auto-Cut</span>
          </div>
          <p className="engine-card-desc">
            Transparent day-by-day deduction: exactly ₹{dailyAdSpend} deducted daily from your balance to deliver high-priority buyer inbound leads in {customer.city || customer.state || 'India'}.
          </p>
        </div>

        {/* 3 Status HUD Boxes */}
        <div className="engine-three-cards-grid">
          {/* Box 1 */}
          <div className="engine-mini-box">
            <div className="mini-box-label">Today's Ad Delivery Status</div>
            <div className="engine-mini-content">
              <span className={`engine-status-pill ${isCampaignLive ? 'active' : 'paused'}`}>
                {isCampaignLive ? 'Live & Delivering' : 'Paused (Low Balance)'}
              </span>
              <div className="mini-box-subline">Pending Deduction</div>
              <div className="mini-box-caption">Ready to cut ₹{dailyAdSpend} for today's placement</div>
            </div>
          </div>

          {/* Box 2 */}
          <div className="engine-mini-box">
            <div className="mini-box-label">Next Auto-Deduction</div>
            <div className="engine-mini-content">
              <div className="mini-box-big-text">Tonight @ 12:00 AM</div>
              <div className="mini-box-caption text-coral">
                -₹{dailyAdSpend} from wallet (Est. Bal: ₹{Math.max(0, walletBalance - dailyAdSpend).toLocaleString('en-IN')})
              </div>
            </div>
          </div>

          {/* Box 3 */}
          <div className="engine-mini-box">
            <div className="mini-box-label">Total Runtime Deducted</div>
            <div className="engine-mini-content">
              <div className="mini-box-big-text">{daysDeliveredCount} Days Delivered</div>
              <div className="mini-box-caption">₹{(daysDeliveredCount * dailyAdSpend).toLocaleString('en-IN')} total debited from wallet</div>
            </div>
          </div>
        </div>

        {/* Engine Bottom Action Bar */}
        <div className="engine-action-bar-row">
          <button
            type="button"
            onClick={handleDeductTodaySpend}
            className="btn-deduct-spend-exact"
            title="Manually trigger today's daily ad debit"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            <span>Deduct Today's ₹{dailyAdSpend} Ad Spend</span>
          </button>

          <button
            type="button"
            onClick={() => onToggleCampaign && onToggleCampaign()}
            className={`btn-resume-campaign-exact ${customer.adCampaignActive ? 'is-active' : ''}`}
          >
            {customer.adCampaignActive ? '⏸ Pause Campaign' : '▶️ Resume Campaign'}
          </button>

          <span className="engine-realtime-note">
            Real-time balance deduction • Runway automatically updates
          </span>
        </div>
      </div>

      {/* 5. ⚡ Instant Wallet Top-Up Card */}
      <div className="instant-wallet-topup-card" id="instant-topup-section">
        <div className="topup-card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#f97316" stroke="#f97316" strokeWidth="1">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
              Instant Wallet Top-Up
            </h2>
          </div>
          <p className="topup-card-desc">
            Select a budget preset or enter a custom amount. Recharges are credited immediately to keep your ads running #1 in {customer.city || customer.territory || 'Mumbai'}.
          </p>
        </div>

        {/* 2-Column Split Layout */}
        <div className="topup-split-grid-layout">
          {/* Left Column: Presets + Custom Amount */}
          <div className="topup-left-col">
            <div className="topup-section-micro-heading">RECOMMENDED RECHARGE PRESETS:</div>

            <div className="topup-presets-3x2-grid">
              {presets.map((p) => {
                const isSelected = selectedPreset === p.amount;
                return (
                  <div
                    key={p.amount}
                    className={`topup-preset-card-exact ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleSelectPreset(p.amount)}
                  >
                    {p.tag && <span className="preset-pill-tag-exact">{p.tag}</span>}
                    <div className="preset-card-val-exact">{p.label}</div>
                    <div className="preset-card-runtime-exact">Instant Wallet Credit</div>
                  </div>
                );
              })}
            </div>

            <div className="topup-section-micro-heading">OR ENTER CUSTOM AMOUNT (MIN ₹300):</div>
            <div className="custom-amount-input-row-exact">
              <div className="custom-input-box-exact" style={{ width: '100%' }}>
                <span className="currency-prefix-exact">₹</span>
                <input
                  type="text"
                  className="custom-field-exact"
                  placeholder="Enter amount (e.g. 1000)"
                  value={customAmount}
                  onChange={handleCustomAmountChange}
                />
              </div>
            </div>
          </div>

          {/* Right Column: Payment Method + Razorpay Box + Pay Button */}
          <div className="topup-right-col">
            <div className="payment-method-top-line">
              <span className="payment-method-heading">PAYMENT METHOD:</span>
              <div className="razorpay-verified-chip">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.5">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
                <span>RAZORPAY VERIFIED</span>
              </div>
            </div>

            {/* Selected Gateway Card */}
            <div className="razorpay-gateway-box-exact">
              <div className="gateway-box-left">
                <div className="razorpay-icon-black">R</div>
                <div className="gateway-box-text">
                  <div className="gateway-box-title-row">
                    <strong>Razorpay Secure Gateway</strong>
                    <span className="test-mode-badge-green">TEST MODE</span>
                  </div>
                  <div className="gateway-box-sub">
                    Secured 256-Bit Encrypted Gateway
                  </div>
                </div>
              </div>
              <div className="gateway-check-circle">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3.2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
            </div>

            {/* Big Green Pay Button */}
            <button
              type="button"
              className="btn-pay-green-exact"
              onClick={handlePayViaRazorpay}
              disabled={isProcessingPayment}
            >
              {isProcessingPayment ? (
                <>
                  <span className="spinner-rotate-inline">⟳</span>
                  <span>Verifying Payment...</span>
                </>
              ) : (
                <>
                  <span>Pay ₹{activeAmount.toLocaleString('en-IN')} via Razorpay</span>
                  <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>&rarr;</span>
                </>
              )}
            </button>

            {/* Guarantee line */}
            <div className="guarantee-line-exact">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" />
                <path d="M9 12l2 2 4-4" />
              </svg>
              <span>100% added directly to wallet • Zero setup fee</span>
            </div>
          </div>
        </div>
      </div>

      {/* 6. 🧾 Wallet Ledger & Transaction History Panel */}
      <div className="wallet-ledger-history-card" id="wallet-ledger-section">
        <div className="ledger-history-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            <h2>Wallet Ledger &amp; Transaction History</h2>
          </div>
          <p className="ledger-history-desc">
            Complete transparent log of all recharge deposits, daily ad spend deductions, and GST invoices.
          </p>
        </div>

        {/* 4 Filter Tabs */}
        <div className="ledger-tabs-row">
          <button
            type="button"
            className={`ledger-tab-btn ${activeLedgerTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveLedgerTab('all')}
          >
            All ({transactions.length})
          </button>
          <button
            type="button"
            className={`ledger-tab-btn ${activeLedgerTab === 'recharges' ? 'active' : ''}`}
            onClick={() => setActiveLedgerTab('recharges')}
          >
            Recharges (+) ({creditsList.length})
          </button>
          <button
            type="button"
            className={`ledger-tab-btn ${activeLedgerTab === 'deductions' ? 'active' : ''}`}
            onClick={() => setActiveLedgerTab('deductions')}
          >
            Daily Ad Cuts (-₹{dailyAdSpend}/d) ({debitsList.length})
          </button>
          <button
            type="button"
            className={`ledger-tab-btn ${activeLedgerTab === 'invoices' ? 'active' : ''}`}
            onClick={() => setActiveLedgerTab('invoices')}
          >
            Invoices ({invoices.length})
          </button>
        </div>

        {/* Ledger Table */}
        {activeLedgerTab !== 'invoices' ? (
          <div className="wallet-table-responsive-wrapper">
            <table className="wallet-exact-table">
              <thead>
                <tr>
                  <th>Transaction ID</th>
                  <th>Date &amp; Time</th>
                  <th>Description</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Status</th>
                  <th>Receipt</th>
                </tr>
              </thead>
              <tbody>
                {filteredTxList.length > 0 ? (
                  filteredTxList.map((tx) => (
                    <tr key={tx.id}>
                      <td>
                        <div className="tx-code-wrap">
                          <code className="tx-ref-code">{tx.ref || tx.id}</code>
                          <button
                            type="button"
                            className="btn-copy-tx"
                            onClick={() => handleCopyTxId(tx.ref || tx.id)}
                            title="Copy Transaction ID"
                          >
                            {copiedTxId === (tx.ref || tx.id) ? '✓' : '⧉'}
                          </button>
                        </div>
                      </td>
                      <td className="tx-date-cell">{tx.date}</td>
                      <td className="tx-desc-cell">{tx.desc}</td>
                      <td>
                        <span className={`exact-type-pill ${tx.type === 'Credit' ? 'credit' : 'debit'}`}>
                          {tx.type}
                        </span>
                      </td>
                      <td>
                        <strong className={`tx-amount-text ${tx.type === 'Credit' ? 'credit' : 'debit'}`}>
                          {tx.type === 'Credit' ? `+₹${Number(tx.amount).toLocaleString('en-IN')}` : `-₹${Number(tx.amount).toLocaleString('en-IN')}`}
                        </strong>
                      </td>
                      <td className="tx-method-cell">{tx.method || (tx.type === 'Credit' ? 'Razorpay Verified' : 'Auto-Debit')}</td>
                      <td>
                        <span className="tx-status-verified-pill">{tx.status || 'Verified ✓'}</span>
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => {
                            if (invoices.length > 0 && onViewInvoice) {
                              onViewInvoice(invoices[0]);
                            } else {
                              handlePrintStatement();
                            }
                          }}
                          className="btn-receipt-view"
                        >
                          [Invoice / Receipt]
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="empty-ledger-state-cell">
                      <div className="empty-ledger-box">
                        <div className="empty-ledger-icon">
                          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.8">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                          </svg>
                        </div>
                        <div className="empty-ledger-title">No transactions found</div>
                        <div className="empty-ledger-subtitle">Transactions will appear here as soon as wallet recharges or daily ad spend deductions occur.</div>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          /* Invoices Table Tab */
          <div className="wallet-table-responsive-wrapper">
            <table className="wallet-exact-table">
              <thead>
                <tr>
                  <th>Invoice Number</th>
                  <th>Invoice Date</th>
                  <th>Particulars</th>
                  <th>Taxable Base</th>
                  <th>18% GST (SAC: 998311)</th>
                  <th>Total Paid</th>
                  <th>Status</th>
                  <th>Receipt</th>
                </tr>
              </thead>
              <tbody>
                {invoices.length > 0 ? (
                  invoices.map((inv) => (
                    <tr key={inv.invoiceNo}>
                      <td>
                        <div className="tx-code-wrap">
                          <code className="tx-ref-code">{inv.invoiceNo}</code>
                          <button
                            type="button"
                            className="btn-copy-tx"
                            onClick={() => handleCopyTxId(inv.invoiceNo)}
                            title="Copy Invoice Number"
                          >
                            {copiedTxId === inv.invoiceNo ? '✓' : '⧉'}
                          </button>
                        </div>
                      </td>
                      <td className="tx-date-cell">{inv.date}</td>
                      <td className="tx-desc-cell">{inv.particulars}</td>
                      <td>₹{inv.baseAmount.toLocaleString('en-IN')}</td>
                      <td>
                        <small style={{ color: '#64748b' }}>CGST 9% (₹{inv.cgst}) + SGST 9% (₹{inv.sgst})</small>
                      </td>
                      <td>
                        <strong style={{ color: '#0f172a' }}>₹{inv.totalAmount.toLocaleString('en-IN')}</strong>
                      </td>
                      <td>
                        <span className="tx-status-verified-pill">Paid ✓</span>
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => onViewInvoice && onViewInvoice(inv)}
                          className="btn-receipt-view"
                        >
                          [Download PDF]
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="empty-ledger-state-cell">
                      <div className="empty-ledger-box">
                        <div className="empty-ledger-icon">
                          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.8">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                          </svg>
                        </div>
                        <div className="empty-ledger-title">No GST tax invoices issued yet</div>
                        <div className="empty-ledger-subtitle">Tax invoices are generated automatically with full GST input credit breakdown on every wallet top-up.</div>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
