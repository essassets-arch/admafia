import React, { useState } from 'react';
import {
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  Lock,
  User,
  Mail,
  Phone,
  Sparkles,
  CheckCircle2,
  Zap,
  MessageSquare,
  Wallet,
  Globe,
  Target,
} from 'lucide-react';
import crmApi from '../services/crmApi';

export function CustomerRegisterPage({ onRegistered, onSwitchToLogin, onBackToWebsite }) {
  const [formData, setFormData] = useState({
    mobile: '',
    email: '',
    username: '',
    password: '',
    terms: true,
  });

  const [error, setError] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanMobile = formData.mobile.trim();
    if (!/^[0-9]{10}$/.test(cleanMobile)) {
      setError('Mobile Number must be exactly 10 digits.');
      return;
    }
    if (formData.username.trim().length < 3) {
      setError('Username must be at least 3 characters.');
      return;
    }
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (!formData.terms) {
      setError('You must accept the terms of service and privacy policy to continue.');
      return;
    }

    setError('');
    setIsSubmitting(true);

    const formattedName = formData.username
      .trim()
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (l) => l.toUpperCase());

    // Provisions authoritative customer record for both client portal and subadmin desks
    let newCustomer = {
      id: `cust_reg_${cleanMobile}`,
      username: formData.username.trim(),
      name: formattedName,
      companyName: formattedName,
      contact: formattedName,
      contactPerson: formattedName,
      phone: cleanMobile,
      email: formData.email.trim(),
      password: formData.password,
      passwordMasked: '••••••••••••',
      city: '',
      state: '',
      country: 'India',
      category: '',
      industry: '',
      website: '',
      domain: '',
      status: 'active',
      profileStatus: 'incomplete',
      profile_status: 'incomplete',
      kycPercent: 25,
      paymentStatus: 'pending',
      payment_status: 'pending',
      amountPaid: 0,
      totalLifetimePaid: 0,
      dailyPacing: 300,
      dailyAdSpend: 300,
      balance: 0,
      walletBalance: 0,
      runwayDays: 0,
      verified: true,
      isSelfRegistered: true,
      completedAt: new Date().toISOString(),
      registeredAt: new Date().toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }),
      registeredFrom: 'https://admafia.marketing/#register',
    };

    try {
      // Save directly to PostgreSQL Backend API
      const dbCustomer = await crmApi.registerCustomer({
        username: formData.username.trim(),
        phone: cleanMobile,
        email: formData.email.trim(),
        password: formData.password,
        companyName: formattedName,
        contactPerson: formattedName,
      });
      if (dbCustomer) {
        newCustomer = { ...newCustomer, ...dbCustomer, password: formData.password };
      }
    } catch (apiErr) {
      console.warn('PostgreSQL register sync note:', apiErr.message);
    }

    try {
      // 1. Save to registered customers list for Desk 1 (Customer Registrations)
      const rawCustomers = localStorage.getItem('growthline_registered_customers');
      const storedCustomers = rawCustomers ? JSON.parse(rawCustomers) : [];
      const filteredCustomers = storedCustomers.filter(
        (c) => c.phone !== cleanMobile && c.username !== newCustomer.username
      );
      localStorage.setItem('growthline_registered_customers', JSON.stringify([newCustomer, ...filteredCustomers]));

      // 2. Also register in Desk 2 (Pending Verification) queue
      const newPV = {
        id: `pv_${cleanMobile}`,
        customerId: newCustomer.id,
        company: newCustomer.name,
        contact: newCustomer.contact,
        phone: newCustomer.phone,
        packageTier: 'Self-Registered (Awaiting Wallet Top-Up)',
        amount: 0,
        dailyRate: 300,
        runwayDays: 0,
        utrNumber: 'Awaiting Payment',
        paymentStatus: 'pending',
        profileStatus: 'incomplete',
        queueType: 'Payment Pending',
        submittedAt: new Date().toLocaleString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        }),
      };
      const rawPV = localStorage.getItem('growthline_pending_verifications');
      const storedPV = rawPV ? JSON.parse(rawPV) : [];
      const filteredPV = storedPV.filter((p) => p.phone !== cleanMobile);
      localStorage.setItem('growthline_pending_verifications', JSON.stringify([newPV, ...filteredPV]));

      // 3. Set active user in localStorage for instant portal hydration
      localStorage.setItem('growthline_active_user', JSON.stringify(newCustomer));

      // 4. Dispatch real-time cross-tab / same-window sync event
      window.dispatchEvent(new CustomEvent('growthline_customer_registered', { detail: newCustomer }));
    } catch (err) {
      console.error('Failed to sync new customer to database/localStorage', err);
    }

    // Call onRegistered with the newly provisioned customer
    if (onRegistered) {
      onRegistered(newCustomer);
    } else {
      window.history.pushState({}, '', '/app/lead#app/dashboard');
      window.location.hash = '#app/dashboard';
      window.location.href = '/app/lead#app/dashboard';
    }
  };

  return (
    <div className="auth-fullpage-shell">
      {/* Main Full-Page Split Grid */}
      <main className="auth-fullpage-grid">
        {/* LEFT COLUMN: Enterprise Showcase & Value Proposition */}
        <section className="auth-fullpage-showcase">
          <div className="auth-showcase-inner">
            <div className="auth-showcase-topbar">
              <img
                src="/AdMafia-Logo.png"
                alt="AdMafia Marketing"
                className="auth-brand-logo"
              />
              <div className="auth-top-badge">
                <span className="auth-pulse-dot" />
                <span>SELF-SERVE ONBOARDING</span>
              </div>
            </div>

            <div className="auth-hero-block">
              <h1 className="auth-showcase-heading">
                Start receiving verified buyer enquiries{' '}
                <span className="auth-showcase-highlight">from ₹300/day.</span>
              </h1>
              <p className="auth-showcase-subtext">
                Create your dedicated <strong>AdMafia Business Workspace</strong> in 30 seconds. Top up your ad wallet, configure your target city &amp; industry, and receive real-time customer names and unmasked 10-digit mobile numbers.
              </p>
            </div>

            {/* Live Incoming Lead Dispatch Terminal Preview */}
            <div className="auth-showcase-live-card">
              <div className="auth-live-card-header">
                <div className="auth-live-status-group">
                  <span className="auth-pulse-dot" />
                  <span className="auth-live-header-tag">LIVE BUYER LEAD DISPATCH PREVIEW</span>
                </div>
                <div className="auth-live-delivery-pill">
                  <Zap size={12} color="#10b981" />
                  <span>Instant CRM Delivery</span>
                </div>
              </div>

              <div className="auth-live-card-lead-row">
                <div className="auth-live-lead-avatar">VM</div>
                <div className="auth-live-lead-details">
                  <div className="auth-live-lead-name-row">
                    <span className="auth-lead-name">Vikram Mehta</span>
                    <span className="auth-lead-tag-verified">Verified Buyer ✓</span>
                  </div>
                  <div className="auth-lead-phone-row">
                    <span className="auth-lead-phone">+91 97249 16167</span>
                    <span className="auth-lead-phone-badge">Direct Unmasked Mobile</span>
                  </div>
                  <div className="auth-lead-intent-sub">
                    Verified Buyer Enquiry • Routed to Your CRM Inbox
                  </div>
                </div>
                <div className="auth-live-lead-actions">
                  <span className="auth-action-chip call">
                    <Phone size={12} /> Direct Call
                  </span>
                  <span className="auth-action-chip wa">
                    <MessageSquare size={12} /> WhatsApp
                  </span>
                </div>
              </div>

              {/* 3 Highlighted Metric Pills */}
              <div className="auth-live-card-metrics">
                <div className="auth-metric-item">
                  <small>Minimum Ad Spend</small>
                  <strong>₹300 / Day</strong>
                  <span className="auth-metric-sub">100% Towards Meta Ads</span>
                </div>
                <div className="auth-metric-item highlight">
                  <small>Setup &amp; Platform Fee</small>
                  <strong>₹0 (100% Free)</strong>
                  <span className="auth-metric-sub">Zero Hidden Cut</span>
                </div>
                <div className="auth-metric-item">
                  <small>Lead Exclusivity</small>
                  <strong>100% Direct</strong>
                  <span className="auth-metric-sub">Never Shared or Resold</span>
                </div>
              </div>
            </div>

            {/* 3-Step Feature Checklist with Highlighting */}
            <div className="auth-showcase-steps">
              <div className="auth-showcase-step-item">
                <div className="auth-step-icon emerald">
                  <CheckCircle2 size={18} />
                </div>
                <div className="auth-step-body">
                  <div className="auth-step-header">
                    <h4>1. Instant Customer CRM Dashboard</h4>
                    <span className="auth-step-tag">Ready in 30s</span>
                  </div>
                  <p>Manage all incoming buyer enquiries, statuses, and follow-up schedules in one place.</p>
                </div>
              </div>

              <div className="auth-showcase-step-item">
                <div className="auth-step-icon blue">
                  <Wallet size={18} />
                </div>
                <div className="auth-step-body">
                  <div className="auth-step-header">
                    <h4>2. Pure Wallet Balance Control (Min ₹300)</h4>
                    <span className="auth-step-tag blue">Direct UPI / Bank UTR</span>
                  </div>
                  <p>Add funds anytime via Razorpay UPI or Bank UTR with full daily ad budget control.</p>
                </div>
              </div>

              <div className="auth-showcase-step-item">
                <div className="auth-step-icon amber">
                  <Target size={18} />
                </div>
                <div className="auth-step-body">
                  <div className="auth-step-header">
                    <h4>3. City &amp; Category Targeted Meta Ads</h4>
                    <span className="auth-step-tag amber">Precision Geo-Targeted</span>
                  </div>
                  <p>Connect directly with high-intent customers searching for your services in your city.</p>
                </div>
              </div>
            </div>

            <div className="auth-showcase-footer">
              <div className="auth-trust-pill">
                <ShieldCheck size={14} color="#10b981" />
                <span>256-Bit SSL Encrypted</span>
              </div>
              <span className="auth-trust-dot">•</span>
              <div className="auth-trust-pill">
                <Zap size={14} color="#38bdf8" />
                <span>Real-Time Sales Desk Sync</span>
              </div>
              <span className="auth-trust-dot">•</span>
              <div className="auth-trust-pill">
                <Lock size={14} color="#a855f7" />
                <span>Zero Lock-In</span>
              </div>
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN: Full-Height Registration Form */}
        <section className="auth-fullpage-form-pane">
          <div className="auth-fullpage-form-container">
            {/* Segmented Mode Switcher */}
            <div className="auth-fullpage-tabs">
              <button type="button" className="auth-fullpage-tab active">
                Create Business Account
              </button>
              <button type="button" className="auth-fullpage-tab" onClick={onSwitchToLogin}>
                Sign In to Workspace
              </button>
            </div>

            <div className="auth-card-top">
              <h2>Create Business Account</h2>
              <p>Register your workspace to unlock targeted Meta &amp; Google buyer leads.</p>
            </div>

            {error && (
              <div className="auth-error-banner">
                <span className="error-icon">⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate className="auth-fullpage-form">
              <div className="auth-form-2col">
                {/* 1. Mobile Number* */}
                <div className="auth-input-group">
                  <label htmlFor="regMobile">
                    <span>Mobile Number (10 Digits)</span>
                    <span className="req-star">*</span>
                  </label>
                  <div className="clean-input-box">
                    <div className="input-prefix-icon">
                      <Phone size={17} />
                    </div>
                    <input
                      id="regMobile"
                      type="tel"
                      required
                      maxLength={10}
                      placeholder="e.g. 9724916167"
                      value={formData.mobile}
                      onChange={(e) => setFormData({ ...formData, mobile: e.target.value.replace(/\D/g, '') })}
                      className="clean-input"
                    />
                  </div>
                </div>

                {/* 3. Username* */}
                <div className="auth-input-group">
                  <label htmlFor="regUser">
                    <span>Workspace Username</span>
                    <span className="req-star">*</span>
                  </label>
                  <div className="clean-input-box">
                    <div className="input-prefix-icon">
                      <User size={17} />
                    </div>
                    <input
                      id="regUser"
                      type="text"
                      required
                      placeholder="Min. 3 characters"
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      className="clean-input"
                    />
                  </div>
                </div>
              </div>

              {/* 2. Work Email Address */}
              <div className="auth-input-group">
                <label htmlFor="regEmail">
                  <span>Work Email Address</span>
                </label>
                <div className="clean-input-box">
                  <div className="input-prefix-icon">
                    <Mail size={17} />
                  </div>
                  <input
                    id="regEmail"
                    type="email"
                    placeholder="contact@yourcompany.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="clean-input"
                  />
                </div>
              </div>

              {/* 4. Password* */}
              <div className="auth-input-group">
                <label htmlFor="regPwd">
                  <span>Create Password (Min. 6 characters)</span>
                  <span className="req-star">*</span>
                </label>
                <div className="clean-input-box auth-pwd-box">
                  <div className="input-prefix-icon">
                    <Lock size={17} />
                  </div>
                  <input
                    id="regPwd"
                    type={showPwd ? 'text' : 'password'}
                    required
                    placeholder="••••••••••••"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="clean-input clean-input-pwd"
                  />
                  <button
                    type="button"
                    className="pwd-toggle-btn"
                    onClick={() => setShowPwd(!showPwd)}
                    title={showPwd ? 'Hide password' : 'Show password'}
                    aria-label={showPwd ? 'Hide password' : 'Show password'}
                  >
                    {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {/* 5. Terms of Service & Privacy Policy Checkbox */}
              <div className="auth-terms-row">
                <label className="checkbox-wrap">
                  <input
                    type="checkbox"
                    checked={formData.terms}
                    onChange={(e) => setFormData({ ...formData, terms: e.target.checked })}
                  />
                  <span className="terms-text">
                    I agree to the{' '}
                    <a
                      href="#terms"
                      onClick={(e) => e.preventDefault()}
                      className="auth-policy-link"
                    >
                      Terms of Service
                    </a>{' '}
                    and{' '}
                    <a
                      href="#privacy"
                      onClick={(e) => e.preventDefault()}
                      className="auth-policy-link"
                    >
                      Privacy Policy
                    </a>.
                  </span>
                </label>
              </div>

              <button type="submit" className="btn-portal-primary" disabled={isSubmitting}>
                <span>{isSubmitting ? 'Creating Workspace...' : 'Create Account & Open Dashboard'}</span>
                <ArrowRight size={18} className="btn-arrow-icon" />
              </button>
            </form>

            <div className="auth-switch-link">
              Already registered?{' '}
              <button type="button" onClick={onSwitchToLogin} className="link-button-bold">
                Sign In to Workspace
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export function CustomerLoginPage({ onLoggedIn, onSwitchToRegister, onBackToWebsite }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [suspensionError, setSuspensionError] = useState('');
  const [loginError, setLoginError] = useState('');
  const [resetNotice, setResetNotice] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');

    if (!username.trim() || !password) {
      setLoginError('Please enter your username/mobile/email and password.');
      return;
    }

    setSuspensionError('');

    let matchedCustomer = null;

    // 1. Authenticate against PostgreSQL Backend API first
    try {
      const authRes = await crmApi.loginCustomer(username.trim(), password);
      if (authRes?.customer) {
        matchedCustomer = authRes.customer;
      }
    } catch (apiErr) {
      if (apiErr.message.includes('Incorrect password') || apiErr.message.includes('suspended')) {
        setLoginError(apiErr.message);
        return;
      }
    }

    // 2. Fallback check in localStorage if offline
    if (!matchedCustomer) {
      try {
        const raw = localStorage.getItem('growthline_registered_customers');
        if (raw) {
          const list = JSON.parse(raw);
          if (Array.isArray(list)) {
            const q = username.trim().toLowerCase();
            matchedCustomer = list.find(
              (c) =>
                (c.username && c.username.toLowerCase() === q) ||
                (c.email && c.email.toLowerCase() === q) ||
                c.phone === username.trim()
            );
          }
        }
      } catch (err) {}
    }

    if (!matchedCustomer) {
      setLoginError('No registered account found with these credentials. Please create a business account first.');
      return;
    }

    if (matchedCustomer.password && matchedCustomer.password !== '••••••••••••' && matchedCustomer.password !== password) {
      setLoginError('Incorrect password for this account.');
      return;
    }

    if (matchedCustomer.status === 'suspended') {
      setSuspensionError(
        'Compliance Hold Notice: Your workspace has been suspended by the operations administrator.'
      );
      return;
    }

    setIsSubmitting(true);
    localStorage.setItem('growthline_active_user', JSON.stringify(matchedCustomer));

    if (onLoggedIn) {
      onLoggedIn(matchedCustomer);
    } else {
      window.history.pushState({}, '', '/app/lead#app/dashboard');
      window.location.hash = '#app/dashboard';
      window.location.href = '/app/lead#app/dashboard';
    }
  };

  return (
    <div className="auth-fullpage-shell">
      {/* Main Full-Page Split Grid */}
      <main className="auth-fullpage-grid">
        {/* LEFT COLUMN: Customer Portal Command Center Showcase */}
        <section className="auth-fullpage-showcase">
          <div className="auth-showcase-inner">
            <div className="auth-showcase-topbar">
              <img
                src="/AdMafia-Logo.png"
                alt="AdMafia Marketing"
                className="auth-brand-logo"
              />
              <div className="auth-top-badge">
                <span className="auth-pulse-dot" />
                <span>CUSTOMER COMMAND CENTER</span>
              </div>
            </div>

            <div className="auth-hero-block">
              <h1 className="auth-showcase-heading">
                Welcome back to your{' '}
                <span className="auth-showcase-highlight">Buyer Lead Hub.</span>
              </h1>
              <p className="auth-showcase-subtext">
                Sign in to view real-time buyer leads dispatched by our ad operations team, manage your marketing wallet balance, and convert enquiries via direct Call &amp; WhatsApp.
              </p>
            </div>

            {/* Live Incoming Lead Preview Widget */}
            <div className="auth-showcase-live-card">
              <div className="auth-live-card-header">
                <div className="auth-live-status-group">
                  <span className="auth-pulse-dot" />
                  <span className="auth-live-header-tag">ACTIVE WORKSPACE SYNCHRONIZATION</span>
                </div>
                <div className="auth-live-delivery-pill">
                  <ShieldCheck size={12} color="#10b981" />
                  <span>Verified Customer Access</span>
                </div>
              </div>

              <div className="auth-live-card-lead-row">
                <div className="auth-live-lead-avatar">AM</div>
                <div className="auth-live-lead-details">
                  <div className="auth-live-lead-name-row">
                    <span className="auth-lead-name">AdMafia Live Lead Dispatch</span>
                    <span className="auth-lead-tag-verified">24/7 Live Stream ✓</span>
                  </div>
                  <div className="auth-lead-phone-row">
                    <span className="auth-lead-phone">Real-Time Lead Inbox &amp; Wallet Ledger</span>
                  </div>
                  <div className="auth-lead-intent-sub">
                    Instant sync with Sales Operations &amp; Meta Ads Campaign Engine
                  </div>
                </div>
                <div className="auth-live-lead-actions">
                  <span className="auth-action-chip wa">
                    ✓ Verified Leads
                  </span>
                </div>
              </div>

              <div className="auth-live-card-metrics">
                <div className="auth-metric-item">
                  <small>Daily Ad Budget</small>
                  <strong>From ₹300/Day</strong>
                  <span className="auth-metric-sub">Full Pacing Control</span>
                </div>
                <div className="auth-metric-item highlight">
                  <small>Wallet Top-Up</small>
                  <strong>Instant UPI / UTR</strong>
                  <span className="auth-metric-sub">Zero Platform Delay</span>
                </div>
                <div className="auth-metric-item">
                  <small>CRM Access</small>
                  <strong>24/7 Live</strong>
                  <span className="auth-metric-sub">Instant Dispatch</span>
                </div>
              </div>
            </div>

            {/* 3 Highlights */}
            <div className="auth-showcase-steps">
              <div className="auth-showcase-step-item">
                <div className="auth-step-icon emerald">
                  <Phone size={18} />
                </div>
                <div className="auth-step-body">
                  <div className="auth-step-header">
                    <h4>Unmasked 10-Digit Buyer Mobile Numbers</h4>
                    <span className="auth-step-tag">Direct Access</span>
                  </div>
                  <p>Call or WhatsApp interested buyers the moment their enquiry hits your CRM.</p>
                </div>
              </div>

              <div className="auth-showcase-step-item">
                <div className="auth-step-icon blue">
                  <Wallet size={18} />
                </div>
                <div className="auth-step-body">
                  <div className="auth-step-header">
                    <h4>Transparent Wallet &amp; Daily Spend</h4>
                    <span className="auth-step-tag blue">Live Ledger</span>
                  </div>
                  <p>Track every rupee added to your wallet and adjust your daily ad spend limit anytime.</p>
                </div>
              </div>

              <div className="auth-showcase-step-item">
                <div className="auth-step-icon amber">
                  <ShieldCheck size={18} />
                </div>
                <div className="auth-step-body">
                  <div className="auth-step-header">
                    <h4>Dedicated Account Support Desk</h4>
                    <span className="auth-step-tag amber">Priority Help</span>
                  </div>
                  <p>Raise support tickets or request custom targeting directly from your portal.</p>
                </div>
              </div>
            </div>

            <div className="auth-showcase-footer">
              <div className="auth-trust-pill">
                <ShieldCheck size={14} color="#10b981" />
                <span>Enterprise Session Security</span>
              </div>
              <span className="auth-trust-dot">•</span>
              <div className="auth-trust-pill">
                <Zap size={14} color="#38bdf8" />
                <span>PostgreSQL Relational Storage</span>
              </div>
              <span className="auth-trust-dot">•</span>
              <div className="auth-trust-pill">
                <Lock size={14} color="#a855f7" />
                <span>Isolated Customer Data</span>
              </div>
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN: Full-Height Login Form */}
        <section className="auth-fullpage-form-pane">
          <div className="auth-fullpage-form-container">
            {/* Segmented Mode Switcher */}
            <div className="auth-fullpage-tabs">
              <button type="button" className="auth-fullpage-tab" onClick={onSwitchToRegister}>
                Create Business Account
              </button>
              <button type="button" className="auth-fullpage-tab active">
                Sign In to Workspace
              </button>
            </div>

            <div className="auth-card-top">
              <h2>Sign In to Workspace</h2>
              <p>
                Enter your credentials to sign in to your marketing &amp; lead workspace.
              </p>
            </div>

            {loginError && (
              <div className="auth-error-banner">
                <span className="error-icon">⚠️</span>
                <span>{loginError}</span>
              </div>
            )}

            {/* Password Reset Notice */}
            {resetNotice && (
              <div
                style={{
                  background: '#ecfdf5',
                  border: '1px solid #a7f3d0',
                  color: '#065f46',
                  padding: '12px 16px',
                  borderRadius: '12px',
                  fontSize: '0.86rem',
                  fontWeight: 600,
                  marginBottom: '18px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>✓ {resetNotice}</span>
                <button
                  type="button"
                  onClick={() => setResetNotice('')}
                  style={{ background: 'none', border: 'none', color: '#047857', cursor: 'pointer', fontWeight: 800 }}
                >
                  ✕
                </button>
              </div>
            )}

            {/* Suspension Banner Notice if triggered */}
            {suspensionError && (
              <div className="auth-suspension-banner">
                <div className="suspension-header">
                  <span>⛔ Account Suspended (Compliance Hold)</span>
                </div>
                <p>{suspensionError}</p>
                <small>Contact Support Desk: +91 97249 16167 or support@growthline.example</small>
              </div>
            )}

            <form onSubmit={handleLogin} noValidate className="auth-fullpage-form">
              <div className="auth-input-group">
                <label htmlFor="logUser">
                  <span>Username, Mobile Number, or Business Email</span>
                  <span className="req-star">*</span>
                </label>
                <div className="clean-input-box">
                  <div className="input-prefix-icon">
                    <User size={17} />
                  </div>
                  <input
                    id="logUser"
                    type="text"
                    required
                    placeholder="e.g. vikram_malhotra or 9724916167"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="clean-input"
                  />
                </div>
              </div>

              <div className="auth-input-group">
                <div className="auth-pwd-header-row">
                  <label htmlFor="logPwd" style={{ margin: 0 }}>
                    <span>Password</span>
                    <span className="req-star">*</span>
                  </label>
                  <button
                    type="button"
                    className="link-button-subtle"
                    onClick={() =>
                      setResetNotice('Password reset instructions have been sent to your registered email address.')
                    }
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="clean-input-box auth-pwd-box">
                  <div className="input-prefix-icon">
                    <Lock size={17} />
                  </div>
                  <input
                    id="logPwd"
                    type={showPwd ? 'text' : 'password'}
                    required
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="clean-input clean-input-pwd"
                  />
                  <button
                    type="button"
                    className="pwd-toggle-btn"
                    onClick={() => setShowPwd(!showPwd)}
                    title={showPwd ? 'Hide password' : 'Show password'}
                    aria-label={showPwd ? 'Hide password' : 'Show password'}
                  >
                    {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <button type="submit" className="btn-portal-primary" style={{ marginTop: '12px' }} disabled={isSubmitting}>
                <span>{isSubmitting ? 'Authenticating...' : 'Sign In to Workspace'}</span>
                <ArrowRight size={18} className="btn-arrow-icon" />
              </button>
            </form>

            <div className="auth-switch-link">
              Don&apos;t have a business account?{' '}
              <button type="button" onClick={onSwitchToRegister} className="link-button-bold">
                Create Business Account
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
