import React, { useState } from 'react';

export default function CheckoutPage({ onPaymentSuccess, onBackToWebsite, onBackToLogin }) {
  const [selectedPlanType, setSelectedPlanType] = useState('daily'); // 'daily' | 'starter' | 'pro' | 'enterprise'
  const [dailyDays, setDailyDays] = useState(10); // 5, 10, 30 days
  const [paymentMethod, setPaymentMethod] = useState('upi'); // 'upi' | 'card' | 'bank'
  const [utrNumber, setUtrNumber] = useState('UPI' + Math.floor(100000000000 + Math.random() * 900000000000));
  const [cardNumber, setCardNumber] = useState('4532 •••• •••• 8821');
  const [cardExpiry, setCardExpiry] = useState('11/28');
  const [cardCvv, setCardCvv] = useState('432');
  const [cardHolder, setCardHolder] = useState('Vikram Malhotra');
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentDone, setPaymentDone] = useState(false);
  const [paidSummary, setPaidSummary] = useState(null);

  // Calculate pricing
  const calculateTotal = () => {
    let base = 0;
    let title = '';
    if (selectedPlanType === 'daily') {
      base = dailyDays * 300;
      title = `Daily ₹300/Day Ad Spend Plan (${dailyDays} Days)`;
    } else if (selectedPlanType === 'starter') {
      base = 4999;
      title = 'Starter Marketing Tier (Monthly)';
    } else if (selectedPlanType === 'pro') {
      base = 14999;
      title = 'Professional Scale Tier (Monthly)';
    } else if (selectedPlanType === 'enterprise') {
      base = 29999;
      title = 'Diamond Enterprise Tier (Monthly)';
    }
    const gst = Math.round(base * 0.18);
    return { base, gst, total: base + gst, title };
  };

  const pricing = calculateTotal();

  const handlePay = (e) => {
    e.preventDefault();
    setIsProcessing(true);

    setTimeout(() => {
      setIsProcessing(false);
      setPaymentDone(true);
      setPaidSummary({
        plan: pricing.title,
        amount: pricing.total,
        base: pricing.base,
        method: paymentMethod.toUpperCase(),
        utr: utrNumber || `TXN${Date.now()}`,
        timestamp: new Date().toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
      });
    }, 1200);
  };

  const handleContinueToKYC = () => {
    if (onPaymentSuccess) {
      onPaymentSuccess({
        plan: selectedPlanType,
        creditedAmount: pricing.base,
        paymentStatus: 'paid',
        targetTab: 'profile',
      });
    }
  };

  const handleContinueToDashboard = () => {
    if (onPaymentSuccess) {
      onPaymentSuccess({
        plan: selectedPlanType,
        creditedAmount: pricing.base,
        paymentStatus: 'paid',
        targetTab: 'dashboard',
      });
    }
  };

  return (
    <div className="auth-fullscreen-bg" style={{ minHeight: '100vh', padding: '32px 16px' }}>
      <div style={{ maxWidth: '960px', width: '100%', margin: '0 auto' }}>
        
        {/* Onboarding Funnel Progress Stepper */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.04)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '16px',
          padding: '18px 24px',
          marginBottom: '24px',
          backdropFilter: 'blur(12px)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: 0.7 }}>
              <span style={{
                background: '#10b981',
                color: '#fff',
                width: '26px',
                height: '26px',
                borderRadius: '50%',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.8rem',
                fontWeight: 700,
              }}>✓</span>
              <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#e0e7ff' }}>1. Register (/register)</span>
            </div>
            
            <div style={{ color: 'var(--amber)', fontSize: '0.9rem' }}>→</div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                background: '#ffb800',
                color: '#0d0a27',
                width: '26px',
                height: '26px',
                borderRadius: '50%',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.8rem',
                fontWeight: 800,
              }}>2</span>
              <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#ffb800' }}>2. Package &amp; Payment (/onboarding/checkout)</span>
            </div>

            <div style={{ color: '#4b5563', fontSize: '0.9rem' }}>→</div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: 0.55 }}>
              <span style={{
                background: '#374151',
                color: '#9ca3af',
                width: '26px',
                height: '26px',
                borderRadius: '50%',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.8rem',
                fontWeight: 600,
              }}>3</span>
              <span style={{ fontSize: '0.88rem', fontWeight: 500, color: '#9ca3af' }}>3. Business Profile Setup (/app/profile)</span>
            </div>

            <div style={{ color: '#4b5563', fontSize: '0.9rem' }}>→</div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: 0.55 }}>
              <span style={{
                background: '#374151',
                color: '#9ca3af',
                width: '26px',
                height: '26px',
                borderRadius: '50%',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.8rem',
                fontWeight: 600,
              }}>4</span>
              <span style={{ fontSize: '0.88rem', fontWeight: 500, color: '#9ca3af' }}>4. Customer Panel (/app/)</span>
            </div>
          </div>
        </div>

        {/* Success Modal / State */}
        {paymentDone && paidSummary ? (
          <div style={{
            background: 'var(--panel-surface, #161244)',
            border: '1px solid rgba(16, 185, 129, 0.4)',
            borderRadius: '20px',
            padding: '36px',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6), 0 0 40px rgba(16, 185, 129, 0.15)',
            textAlign: 'center',
          }}>
            <div style={{
              width: '68px',
              height: '68px',
              background: 'rgba(16, 185, 129, 0.15)',
              border: '2px solid #10b981',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
              fontSize: '2rem',
              color: '#10b981',
            }}>
              ✓
            </div>
            <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#fff', marginBottom: '8px' }}>
              Commercial Payment Successful!
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '0.95rem', maxWidth: '540px', margin: '0 auto 24px' }}>
              Your account payment status is now updated to <strong style={{ color: '#10b981' }}>payment_status = 'paid'</strong>. 
              ₹{paidSummary.base.toLocaleString('en-IN')} has been credited into your live ad spend wallet.
            </p>

            <div style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '14px',
              padding: '20px',
              maxWidth: '520px',
              margin: '0 auto 28px',
              textAlign: 'left',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', fontSize: '0.88rem' }}>
                <span style={{ color: '#94a3b8' }}>Package Activated:</span>
                <span style={{ color: '#fff', fontWeight: 700 }}>{paidSummary.plan}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', fontSize: '0.88rem' }}>
                <span style={{ color: '#94a3b8' }}>Total Paid (incl. 18% GST):</span>
                <span style={{ color: '#ffb800', fontWeight: 800 }}>₹{paidSummary.amount.toLocaleString('en-IN')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', fontSize: '0.88rem' }}>
                <span style={{ color: '#94a3b8' }}>Wallet Credit Added:</span>
                <span style={{ color: '#10b981', fontWeight: 700 }}>+₹{paidSummary.base.toLocaleString('en-IN')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', fontSize: '0.88rem' }}>
                <span style={{ color: '#94a3b8' }}>Reference ID / UTR:</span>
                <span style={{ color: '#cbd5e1', fontFamily: 'monospace' }}>{paidSummary.utr}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '0.88rem' }}>
                <span style={{ color: '#94a3b8' }}>Payment Status:</span>
                <span style={{ color: '#10b981', fontWeight: 700 }}>Verified &amp; Active</span>
              </div>
            </div>

            {/* Next Step Call to Actions */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn-amber"
                onClick={handleContinueToKYC}
                style={{ padding: '14px 28px', fontSize: '1rem', fontWeight: 700 }}
              >
                Proceed to Step 3: Business Profile Setup (/app/profile) →
              </button>
              <button
                type="button"
                className="btn-portal-outline"
                onClick={handleContinueToDashboard}
                style={{ padding: '14px 24px', fontSize: '0.95rem' }}
              >
                Go Directly to Live Dashboard (/app/dashboard)
              </button>
            </div>
          </div>
        ) : (
          /* Package & Checkout View */
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '24px' }}>
            
            {/* Left Column: Package Options */}
            <div style={{
              background: 'var(--panel-surface, #161244)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '20px',
              padding: '28px',
            }}>
              <div style={{ marginBottom: '20px' }}>
                <span style={{
                  background: 'rgba(255, 184, 0, 0.15)',
                  color: '#ffb800',
                  padding: '4px 10px',
                  borderRadius: '20px',
                  fontSize: '0.78rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}>
                  Step 2: Commercial Selection
                </span>
                <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#fff', marginTop: '10px' }}>
                  Select Ad Spend or Commercial Plan
                </h2>
                <p style={{ color: '#94a3b8', fontSize: '0.88rem', marginTop: '4px' }}>
                  Choose your targeted Meta &amp; Google ad lead generation package. Funds are credited directly to your marketing wallet.
                </p>
              </div>

              {/* Option 1: Daily ₹300/Day Ad Spend Plan (Default / Recommended) */}
              <div
                onClick={() => setSelectedPlanType('daily')}
                style={{
                  border: selectedPlanType === 'daily' ? '2px solid #ffb800' : '1px solid rgba(255, 255, 255, 0.1)',
                  background: selectedPlanType === 'daily' ? 'rgba(255, 184, 0, 0.06)' : 'rgba(255, 255, 255, 0.02)',
                  borderRadius: '16px',
                  padding: '18px',
                  marginBottom: '16px',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        width: '18px',
                        height: '18px',
                        borderRadius: '50%',
                        border: selectedPlanType === 'daily' ? '5px solid #ffb800' : '2px solid #4b5563',
                        background: selectedPlanType === 'daily' ? '#fff' : 'transparent',
                        display: 'inline-block',
                      }} />
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff', margin: 0 }}>
                        Daily ₹300/Day Ad Spend Plan
                      </h3>
                      <span style={{
                        background: '#10b981',
                        color: '#fff',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '10px',
                      }}>
                        MOST POPULAR
                      </span>
                    </div>
                    <p style={{ fontSize: '0.84rem', color: '#94a3b8', marginTop: '6px', marginLeft: '26px' }}>
                      Targeted Facebook &amp; Instagram buyer lead generation. ₹300 deducted daily only for active campaigns.
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffb800' }}>₹300<span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>/day</span></div>
                  </div>
                </div>

                {selectedPlanType === 'daily' && (
                  <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', marginLeft: '26px' }}>
                    <label style={{ fontSize: '0.82rem', color: '#e0e7ff', fontWeight: 600, display: 'block', marginBottom: '8px' }}>
                      Choose Initial Wallet Pre-Fund Duration:
                    </label>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      {[
                        { days: 5, label: '5 Days (₹1,500)' },
                        { days: 10, label: '10 Days (₹3,000)' },
                        { days: 30, label: '30 Days (₹9,000)' },
                      ].map((item) => (
                        <button
                          key={item.days}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDailyDays(item.days);
                          }}
                          style={{
                            background: dailyDays === item.days ? '#ffb800' : 'rgba(255, 255, 255, 0.05)',
                            color: dailyDays === item.days ? '#0d0a27' : '#e0e7ff',
                            border: dailyDays === item.days ? 'none' : '1px solid rgba(255, 255, 255, 0.1)',
                            fontWeight: 700,
                            padding: '8px 14px',
                            borderRadius: '8px',
                            fontSize: '0.82rem',
                            cursor: 'pointer',
                          }}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Option 2: Monthly Starter Plan (₹4,999) */}
              <div
                onClick={() => setSelectedPlanType('starter')}
                style={{
                  border: selectedPlanType === 'starter' ? '2px solid #ffb800' : '1px solid rgba(255, 255, 255, 0.1)',
                  background: selectedPlanType === 'starter' ? 'rgba(255, 184, 0, 0.06)' : 'rgba(255, 255, 255, 0.02)',
                  borderRadius: '16px',
                  padding: '16px',
                  marginBottom: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      border: selectedPlanType === 'starter' ? '5px solid #ffb800' : '2px solid #4b5563',
                      background: selectedPlanType === 'starter' ? '#fff' : 'transparent',
                      display: 'inline-block',
                    }} />
                    <div>
                      <h4 style={{ fontSize: '0.98rem', fontWeight: 700, color: '#fff', margin: 0 }}>Starter Marketing Tier</h4>
                      <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Standard lead allocation, 1 team seat, WhatsApp trigger</div>
                    </div>
                  </div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff' }}>₹4,999<span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>/mo</span></div>
                </div>
              </div>

              {/* Option 3: Professional Plan (₹14,999) */}
              <div
                onClick={() => setSelectedPlanType('pro')}
                style={{
                  border: selectedPlanType === 'pro' ? '2px solid #ffb800' : '1px solid rgba(255, 255, 255, 0.1)',
                  background: selectedPlanType === 'pro' ? 'rgba(255, 184, 0, 0.06)' : 'rgba(255, 255, 255, 0.02)',
                  borderRadius: '16px',
                  padding: '16px',
                  marginBottom: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      border: selectedPlanType === 'pro' ? '5px solid #ffb800' : '2px solid #4b5563',
                      background: selectedPlanType === 'pro' ? '#fff' : 'transparent',
                      display: 'inline-block',
                    }} />
                    <div>
                      <h4 style={{ fontSize: '0.98rem', fontWeight: 700, color: '#fff', margin: 0 }}>Professional Growth Tier</h4>
                      <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>3 team seats, priority AI enrichment, call recordings</div>
                    </div>
                  </div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff' }}>₹14,999<span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>/mo</span></div>
                </div>
              </div>

              {/* Option 4: Diamond Enterprise Plan (₹29,999) */}
              <div
                onClick={() => setSelectedPlanType('enterprise')}
                style={{
                  border: selectedPlanType === 'enterprise' ? '2px solid #ffb800' : '1px solid rgba(255, 255, 255, 0.1)',
                  background: selectedPlanType === 'enterprise' ? 'rgba(255, 184, 0, 0.06)' : 'rgba(255, 255, 255, 0.02)',
                  borderRadius: '16px',
                  padding: '16px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      border: selectedPlanType === 'enterprise' ? '5px solid #ffb800' : '2px solid #4b5563',
                      background: selectedPlanType === 'enterprise' ? '#fff' : 'transparent',
                      display: 'inline-block',
                    }} />
                    <div>
                      <h4 style={{ fontSize: '0.98rem', fontWeight: 700, color: '#fff', margin: 0 }}>Diamond Enterprise Tier</h4>
                      <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Unlimited seats, dedicated account manager, API integrations</div>
                    </div>
                  </div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff' }}>₹29,999<span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>/mo</span></div>
                </div>
              </div>
            </div>

            {/* Right Column: Payment Gateway & Order Summary */}
            <div style={{
              background: 'var(--panel-surface, #161244)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '20px',
              padding: '28px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}>
              <div>
                <h3 style={{ fontSize: '1.18rem', fontWeight: 800, color: '#fff', marginBottom: '16px' }}>
                  Payment Method
                </h3>

                {/* Tabs: UPI, Card, Bank */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '18px' }}>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('upi')}
                    style={{
                      flex: 1,
                      padding: '10px 6px',
                      background: paymentMethod === 'upi' ? '#ffb800' : 'rgba(255, 255, 255, 0.05)',
                      color: paymentMethod === 'upi' ? '#0d0a27' : '#e0e7ff',
                      fontWeight: 700,
                      borderRadius: '8px',
                      border: 'none',
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                    }}
                  >
                    UPI QR
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('card')}
                    style={{
                      flex: 1,
                      padding: '10px 6px',
                      background: paymentMethod === 'card' ? '#ffb800' : 'rgba(255, 255, 255, 0.05)',
                      color: paymentMethod === 'card' ? '#0d0a27' : '#e0e7ff',
                      fontWeight: 700,
                      borderRadius: '8px',
                      border: 'none',
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                    }}
                  >
                    Card
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('bank')}
                    style={{
                      flex: 1,
                      padding: '10px 6px',
                      background: paymentMethod === 'bank' ? '#ffb800' : 'rgba(255, 255, 255, 0.05)',
                      color: paymentMethod === 'bank' ? '#0d0a27' : '#e0e7ff',
                      fontWeight: 700,
                      borderRadius: '8px',
                      border: 'none',
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                    }}
                  >
                    Bank NEFT
                  </button>
                </div>

                {/* Payment Form Fields based on tab */}
                {paymentMethod === 'upi' && (
                  <div style={{ textAlign: 'center', padding: '12px 0' }}>
                    <div style={{
                      background: '#fff',
                      padding: '12px',
                      borderRadius: '12px',
                      display: 'inline-block',
                      marginBottom: '10px',
                    }}>
                      {/* Simulated QR Code SVG */}
                      <svg width="120" height="120" viewBox="0 0 100 100" fill="#000">
                        <rect x="0" y="0" width="30" height="30" fill="#000" />
                        <rect x="5" y="5" width="20" height="20" fill="#fff" />
                        <rect x="10" y="10" width="10" height="10" fill="#000" />
                        
                        <rect x="70" y="0" width="30" height="30" fill="#000" />
                        <rect x="75" y="5" width="20" height="20" fill="#fff" />
                        <rect x="80" y="10" width="10" height="10" fill="#000" />

                        <rect x="0" y="70" width="30" height="30" fill="#000" />
                        <rect x="5" y="75" width="20" height="20" fill="#fff" />
                        <rect x="10" y="80" width="10" height="10" fill="#000" />

                        <rect x="35" y="10" width="10" height="20" fill="#000" />
                        <rect x="50" y="5" width="15" height="10" fill="#000" />
                        <rect x="40" y="40" width="20" height="20" fill="#000" />
                        <rect x="70" y="40" width="15" height="15" fill="#000" />
                        <rect x="40" y="70" width="20" height="15" fill="#000" />
                        <rect x="70" y="75" width="20" height="15" fill="#000" />
                      </svg>
                    </div>
                    <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: '0 0 12px' }}>
                      Scan via Google Pay, PhonePe, Paytm, or BHIM.
                    </p>
                    <div style={{ textAlign: 'left' }}>
                      <label style={{ fontSize: '0.78rem', color: '#cbd5e1', fontWeight: 600 }}>UPI Reference / UTR Number</label>
                      <input
                        type="text"
                        required
                        value={utrNumber}
                        onChange={(e) => setUtrNumber(e.target.value)}
                        placeholder="12-digit UTR (e.g. 329188291044)"
                        className="clean-input"
                        style={{ marginTop: '4px', fontSize: '0.85rem' }}
                      />
                    </div>
                  </div>
                )}

                {paymentMethod === 'card' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div>
                      <label style={{ fontSize: '0.78rem', color: '#cbd5e1', fontWeight: 600 }}>Card Number</label>
                      <input
                        type="text"
                        value={cardNumber}
                        onChange={(e) => setCardNumber(e.target.value)}
                        placeholder="4532 •••• •••• 8821"
                        className="clean-input"
                        style={{ marginTop: '4px', fontSize: '0.85rem' }}
                      />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div>
                        <label style={{ fontSize: '0.78rem', color: '#cbd5e1', fontWeight: 600 }}>Expiry</label>
                        <input
                          type="text"
                          value={cardExpiry}
                          onChange={(e) => setCardExpiry(e.target.value)}
                          placeholder="MM/YY"
                          className="clean-input"
                          style={{ marginTop: '4px', fontSize: '0.85rem' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.78rem', color: '#cbd5e1', fontWeight: 600 }}>CVV</label>
                        <input
                          type="password"
                          maxLength={4}
                          value={cardCvv}
                          onChange={(e) => setCardCvv(e.target.value)}
                          placeholder="•••"
                          className="clean-input"
                          style={{ marginTop: '4px', fontSize: '0.85rem' }}
                        />
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.78rem', color: '#cbd5e1', fontWeight: 600 }}>Cardholder Name</label>
                      <input
                        type="text"
                        value={cardHolder}
                        onChange={(e) => setCardHolder(e.target.value)}
                        placeholder="Name on card"
                        className="clean-input"
                        style={{ marginTop: '4px', fontSize: '0.85rem' }}
                      />
                    </div>
                  </div>
                )}

                {paymentMethod === 'bank' && (
                  <div style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '12px',
                    padding: '12px',
                    fontSize: '0.8rem',
                  }}>
                    <div style={{ color: '#ffb800', fontWeight: 700, marginBottom: '6px' }}>Direct Agency Settlement Account:</div>
                    <div style={{ color: '#94a3b8', lineHeight: '1.5' }}>
                      <div>Beneficiary: <strong>Growthline Media Pvt Ltd</strong></div>
                      <div>Bank: <strong>HDFC Bank Ltd</strong></div>
                      <div>Account: <strong>50200088921456</strong></div>
                      <div>IFSC: <strong>HDFC0001042</strong></div>
                    </div>
                    <div style={{ marginTop: '10px' }}>
                      <label style={{ fontSize: '0.78rem', color: '#cbd5e1', fontWeight: 600 }}>NEFT / RTGS UTR Number</label>
                      <input
                        type="text"
                        required
                        value={utrNumber}
                        onChange={(e) => setUtrNumber(e.target.value)}
                        placeholder="e.g. HDFC2819034821"
                        className="clean-input"
                        style={{ marginTop: '4px', fontSize: '0.85rem' }}
                      />
                    </div>
                  </div>
                )}

                {/* Price Breakdown */}
                <div style={{
                  marginTop: '18px',
                  paddingTop: '14px',
                  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                  fontSize: '0.85rem',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', marginBottom: '6px' }}>
                    <span>Plan Subtotal:</span>
                    <span>₹{pricing.base.toLocaleString('en-IN')}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', marginBottom: '8px' }}>
                    <span>GST (18% Statutory):</span>
                    <span>₹{pricing.gst.toLocaleString('en-IN')}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#fff', fontWeight: 800, fontSize: '1.05rem', paddingTop: '8px', borderTop: '1px dashed rgba(255, 255, 255, 0.15)' }}>
                    <span>Total Payable:</span>
                    <span style={{ color: '#ffb800' }}>₹{pricing.total.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>

              {/* Pay Now Button */}
              <div style={{ marginTop: '20px' }}>
                <button
                  type="button"
                  onClick={handlePay}
                  disabled={isProcessing}
                  className="btn-amber"
                  style={{
                    width: '100%',
                    padding: '14px',
                    fontSize: '1rem',
                    fontWeight: 800,
                    borderRadius: '10px',
                    cursor: isProcessing ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isProcessing ? 'Verifying Transaction Reference...' : `Pay ₹${pricing.total.toLocaleString('en-IN')} & Unlock Leads →`}
                </button>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '14px', fontSize: '0.8rem' }}>
                  <button
                    type="button"
                    onClick={onBackToLogin}
                    style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Already paid? Sign In
                  </button>
                  <button
                    type="button"
                    onClick={onBackToWebsite}
                    style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                  >
                    Back to Website
                  </button>
                </div>
              </div>

            </div>

          </div>
        )}

      </div>
    </div>
  );
}
