import React, { useState, useEffect } from 'react';
import {
  UserPlus,
  X,
  Phone,
  Building2,
  Eye,
  EyeOff,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Copy,
  MessageSquare,
  Plus,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
} from 'lucide-react';
import crmApi from '../services/crmApi';
import {
  buildCustomerLeadHref,
  navigateToCustomerLeadPage,
} from './customerLeadNavigation';

const BUSINESS_CATEGORIES = [
  'Real Estate & Infrastructure',
  'IT & Software',
  'Manufacturing',
  'Healthcare & Wellness',
  'Construction & Building Materials',
  'Education & Coaching',
  'Financial & Consulting',
  'Retail & E-commerce',
  'Organic Food & FMCG',
  'Hardware & Computer Accessories',
  'Electrical Products',
  'Digital Marketing',
  'Solar & Renewable',
  'Other',
];

function buildSuggestedUsername(companyOrName, cleanPhone) {
  const base = String(companyOrName || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 14);
  const tail = String(cleanPhone || '').slice(-4);
  if (base && tail.length === 4) return `${base}_${tail}`;
  if (base.length >= 3) return base;
  if (tail.length === 4) return `client_${tail}`;
  return '';
}

function generateFriendlyPassword(cleanPhone = '') {
  const tail = String(cleanPhone || '').slice(-4);
  const digits = tail.length === 4 ? tail : String(Math.floor(1000 + Math.random() * 9000));
  return `AdMafia@${digits}`;
}

export default function SalesRegisterCustomerModal({
  isOpen,
  onClose,
  onCustomerCreated,
}) {
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const [usernameManuallyEdited, setUsernameManuallyEdited] = useState(false);
  const [password, setPassword] = useState('AdMafia@2026');
  const [passwordManuallyEdited, setPasswordManuallyEdited] = useState(false);
  const [showPassword, setShowPassword] = useState(true);

  const [showOptional, setShowOptional] = useState(false);
  const [contactPerson, setContactPerson] = useState('');
  const [category, setCategory] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('');
  const [email, setEmail] = useState('');
  const [initialRemark, setInitialRemark] = useState('');

  const [usernameStatus, setUsernameStatus] = useState({ state: 'idle', message: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [createdResult, setCreatedResult] = useState(null); // { customer, plainPassword }
  const [copiedCreds, setCopiedCreds] = useState(false);

  const cleanPhone = String(phone || '').replace(/\D/g, '').slice(-10);
  const isPhoneValid = /^[6-9]\d{9}$/.test(cleanPhone);

  const resetForm = () => {
    setCompanyName('');
    setPhone('');
    setUsername('');
    setUsernameManuallyEdited(false);
    setPassword('AdMafia@2026');
    setPasswordManuallyEdited(false);
    setShowPassword(true);
    setShowOptional(false);
    setContactPerson('');
    setCategory('');
    setCity('');
    setStateName('');
    setEmail('');
    setInitialRemark('');
    setUsernameStatus({ state: 'idle', message: '' });
    setSubmitting(false);
    setError('');
    setCreatedResult(null);
    setCopiedCreds(false);
  };

  useEffect(() => {
    if (!isOpen) {
      resetForm();
    }
  }, [isOpen]);

  // Auto-suggest username & friendly password from companyName + phone unless manually edited
  useEffect(() => {
    if (!usernameManuallyEdited) {
      const suggested = buildSuggestedUsername(companyName || contactPerson, cleanPhone);
      setUsername(suggested);
    }
    if (!passwordManuallyEdited && cleanPhone.length === 10) {
      setPassword(`AdMafia@${cleanPhone.slice(-4)}`);
    }
  }, [companyName, contactPerson, cleanPhone, usernameManuallyEdited, passwordManuallyEdited]);

  // Live debounced username availability check
  useEffect(() => {
    const trimmed = String(username || '').trim().replace(/^@/, '');
    if (!isOpen || createdResult || trimmed.length < 3) {
      setUsernameStatus({ state: 'idle', message: '' });
      return undefined;
    }
    let cancelled = false;
    setUsernameStatus({ state: 'checking', message: 'Checking...' });
    const timer = setTimeout(async () => {
      try {
        const res = await crmApi.checkUsernameAvailability(trimmed);
        if (cancelled) return;
        if (res?.available) {
          setUsernameStatus({ state: 'available', message: `@${trimmed} is available` });
        } else {
          setUsernameStatus({
            state: 'taken',
            message: res?.error || `@${trimmed} is already taken`,
          });
        }
      } catch (_) {
        if (!cancelled) setUsernameStatus({ state: 'idle', message: '' });
      }
    }, 320);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [username, isOpen, createdResult]);

  if (!isOpen) return null;

  const handlePhoneInput = (rawVal) => {
    setError('');
    const digitsOnly = String(rawVal || '').replace(/\D/g, '');
    const normalized =
      digitsOnly.length === 12 && digitsOnly.startsWith('91')
        ? digitsOnly.slice(2)
        : digitsOnly.slice(0, 10);
    setPhone(normalized);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const cleanComp = String(companyName || '').trim();
    if (!cleanComp) {
      setError('Please enter the Client or Business Name.');
      return;
    }
    if (!isPhoneValid) {
      setError('Please enter a valid 10-digit Indian mobile number (starting with 6, 7, 8, or 9).');
      return;
    }
    const cleanPwd = String(password || '').trim();
    if (cleanPwd.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    if (usernameStatus.state === 'taken') {
      setError('That username is already taken. Change it or clear the box to auto-generate.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await crmApi.salesRegisterCustomer({
        companyName: cleanComp,
        contactPerson: String(contactPerson || '').trim() || cleanComp,
        phone: cleanPhone,
        username: String(username || '').trim().replace(/^@/, ''),
        password: cleanPwd,
        category: String(category || '').trim(),
        city: String(city || '').trim(),
        state: String(stateName || '').trim(),
        email: String(email || '').trim(),
        initialRemark: String(initialRemark || '').trim(),
      });

      const newCust = res?.customer;
      if (newCust) {
        try {
          const raw = localStorage.getItem('growthline_registered_customers');
          const list = raw ? JSON.parse(raw) : [];
          const updatedList = [
            newCust,
            ...(Array.isArray(list)
              ? list.filter((c) => c.id !== newCust.id && c.phone !== newCust.phone)
              : []),
          ];
          localStorage.setItem('growthline_registered_customers', JSON.stringify(updatedList));
          window.dispatchEvent(new CustomEvent('growthline_customer_registered', { detail: newCust }));
        } catch (_) {}

        if (typeof onCustomerCreated === 'function') {
          onCustomerCreated(newCust);
        }
        setCreatedResult({
          customer: newCust,
          plainPassword: cleanPwd,
        });
      }
    } catch (err) {
      setError(err?.message || 'Could not register client account. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const loginUrl =
    typeof window !== 'undefined' && window.location?.origin
      ? `${window.location.origin}/login`
      : 'https://admafia.marketing/login';

  const buildCredentialsText = () => {
    if (!createdResult?.customer) return '';
    const c = createdResult.customer;
    return [
      `Welcome to Ad Mafia, ${c.companyName || c.contactPerson || 'Partner'}!`,
      `Your client workspace is ready (No initial top-up required):`,
      ``,
      `🔗 Login Link: ${loginUrl}`,
      `📱 Mobile / Login ID: ${c.phone} (or @${c.username})`,
      `🔑 Password: ${createdResult.plainPassword}`,
      ``,
      `Sign in anytime to view buyer leads & manage your workspace.`,
    ].join('\n');
  };

  const handleCopyCredentials = async () => {
    try {
      await navigator.clipboard.writeText(buildCredentialsText());
      setCopiedCreds(true);
      setTimeout(() => setCopiedCreds(false), 2500);
    } catch (_) {}
  };

  return (
    <div
      className="sales-modal-overlay"
      style={{ zIndex: 10050 }}
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <div
        className="sales-modal-card"
        style={{
          maxWidth: 580,
          width: '96%',
          maxHeight: '92vh',
          overflowY: 'auto',
          padding: '22px 24px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 12,
            borderBottom: '1px solid var(--adm-border, #e2e8f0)',
            paddingBottom: 14,
            marginBottom: 16,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
              <span
                className="sales-dept-badge"
                style={{
                  background: 'var(--adm-soft-indigo-bg, #eef2ff)',
                  color: 'var(--adm-soft-indigo-text, #4338ca)',
                  fontWeight: 800,
                }}
              >
                ⚡ Sales Direct Onboarding
              </span>
              <span
                style={{
                  background: 'var(--adm-soft-emerald-bg, #ecfdf5)',
                  color: 'var(--adm-soft-emerald-text, #047857)',
                  border: '1px solid var(--adm-soft-emerald-border, #a7f3d0)',
                  padding: '2px 9px',
                  borderRadius: 999,
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <ShieldCheck size={12} /> ₹0 Top-Up Required
              </span>
            </div>
            <h3
              style={{
                margin: 0,
                fontSize: '1.22rem',
                fontWeight: 800,
                color: 'var(--adm-text-primary, #0f172a)',
              }}
            >
              {createdResult ? 'Client Account Ready!' : 'Add User / Register Client Account'}
            </h3>
            <p
              style={{
                margin: '4px 0 0',
                fontSize: '0.8rem',
                color: 'var(--adm-text-muted, #64748b)',
              }}
            >
              {createdResult
                ? 'Share the login details below directly with the client on WhatsApp.'
                : 'Create an active workspace on behalf of a busy client instantly — no initial payment or OTP wait needed.'}
            </p>
          </div>
          <button
            type="button"
            className="desk-close-btn"
            onClick={onClose}
            disabled={submitting}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {createdResult ? (
          /* ================= POST-CREATION CREDENTIAL HAND-OFF ================= */
          <div>
            <div
              style={{
                background: 'var(--adm-soft-emerald-bg, #ecfdf5)',
                border: '1.5px solid var(--adm-soft-emerald-border, #a7f3d0)',
                borderRadius: 12,
                padding: '14px 16px',
                marginBottom: 16,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <CheckCircle2 size={26} color="#059669" style={{ flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 800,
                    fontSize: '0.95rem',
                    color: 'var(--adm-soft-emerald-text, #065f46)',
                  }}
                >
                  {createdResult.customer.companyName} (@{createdResult.customer.username}) is Live!
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--adm-text-body, #334155)', marginTop: 2 }}>
                  Wallet Balance: <strong>₹0</strong> (No top-up required • Client can sign in immediately)
                </div>
              </div>
            </div>

            <div
              style={{
                background: 'var(--adm-bg-subtle, #f8fafc)',
                border: '1px solid var(--adm-border, #e2e8f0)',
                borderRadius: 12,
                padding: '14px 16px',
                marginBottom: 16,
                display: 'grid',
                gap: 10,
                fontSize: '0.85rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--adm-text-muted, #64748b)', fontWeight: 700 }}>Portal Login URL:</span>
                <a
                  href={loginUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: '#4f46e5', fontWeight: 800, textDecoration: 'none' }}
                >
                  {loginUrl} ↗
                </a>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--adm-text-muted, #64748b)', fontWeight: 700 }}>Mobile Number (Login ID):</span>
                <strong style={{ color: 'var(--adm-text-primary, #0f172a)', fontFamily: 'monospace', fontSize: '0.92rem' }}>
                  +91 {createdResult.customer.phone}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--adm-text-muted, #64748b)', fontWeight: 700 }}>Username:</span>
                <strong style={{ color: '#4f46e5', fontFamily: 'monospace', fontSize: '0.92rem' }}>
                  @{createdResult.customer.username}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--adm-text-muted, #64748b)', fontWeight: 700 }}>Password:</span>
                <code
                  style={{
                    background: 'var(--adm-bg-card, #ffffff)',
                    border: '1px solid var(--adm-border-strong, #cbd5e1)',
                    padding: '2px 8px',
                    borderRadius: 6,
                    fontWeight: 800,
                    color: 'var(--adm-text-primary, #0f172a)',
                  }}
                >
                  {createdResult.plainPassword}
                </code>
              </div>
            </div>

            {/* Primary Hand-Off Actions */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 16 }}>
              <a
                href={`https://wa.me/91${createdResult.customer.phone}?text=${encodeURIComponent(buildCredentialsText())}`}
                target="_blank"
                rel="noreferrer"
                className="sales-btn-primary"
                style={{
                  background: '#25D366',
                  borderColor: '#16a34a',
                  color: '#ffffff',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  fontWeight: 800,
                  padding: '11px 16px',
                  borderRadius: 10,
                }}
              >
                <MessageSquare size={16} /> Send Login on WhatsApp
              </a>

              <button
                type="button"
                className="sales-btn-secondary"
                onClick={handleCopyCredentials}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                  fontWeight: 800,
                  padding: '11px 16px',
                  borderRadius: 10,
                }}
              >
                <Copy size={15} /> {copiedCreds ? '✓ Copied Login Details!' : 'Copy Login Details'}
              </button>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 10,
                flexWrap: 'wrap',
                paddingTop: 14,
                borderTop: '1px solid var(--adm-border, #e2e8f0)',
              }}
            >
              <a
                href={buildCustomerLeadHref(createdResult.customer, 'add', 'customers')}
                onClick={(e) => {
                  onClose();
                  navigateToCustomerLeadPage(createdResult.customer, 'add', 'customers', e);
                }}
                className="desk-action-btn"
                style={{
                  textDecoration: 'none',
                  background: 'var(--adm-soft-indigo-bg, #eef2ff)',
                  borderColor: 'var(--adm-soft-indigo-border, #c7d2fe)',
                  color: 'var(--adm-soft-indigo-text, #4338ca)',
                  fontWeight: 800,
                  padding: '7px 12px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <Plus size={14} /> Assign Leads to @{createdResult.customer.username}
              </a>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="sales-btn-secondary"
                  onClick={resetForm}
                  style={{ fontWeight: 700 }}
                >
                  + Register Another
                </button>
                <button type="button" className="sales-btn-primary" onClick={onClose}>
                  Done
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* ================= FAST REGISTRATION FORM ================= */
          <form onSubmit={handleSubmit}>
            {error && (
              <div
                role="alert"
                style={{
                  background: 'var(--adm-soft-rose-bg, #fff1f2)',
                  border: '1px solid var(--adm-soft-rose-border, #fecdd3)',
                  color: 'var(--adm-soft-rose-text, #be123c)',
                  padding: '10px 12px',
                  borderRadius: 10,
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  marginBottom: 14,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
              {/* 1. Client / Business Name */}
              <div>
                <label className="desk-form-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Building2 size={13} /> Client / Business Name <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  className="desk-form-input"
                  placeholder="e.g. Apex Realty or Rajesh Sharma"
                  value={companyName}
                  onChange={(e) => {
                    setError('');
                    setCompanyName(e.target.value);
                  }}
                />
              </div>

              {/* 2. Mobile Number + Username */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 12 }}>
                <div>
                  <label className="desk-form-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Phone size={13} /> 10-Digit Mobile / WhatsApp <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <span
                      style={{
                        position: 'absolute',
                        left: 11,
                        fontSize: '0.84rem',
                        fontWeight: 800,
                        color: 'var(--adm-text-muted, #64748b)',
                        pointerEvents: 'none',
                      }}
                    >
                      +91
                    </span>
                    <input
                      type="tel"
                      inputMode="numeric"
                      required
                      className="desk-form-input"
                      style={{ paddingLeft: 42 }}
                      placeholder="9876543210"
                      value={phone}
                      onChange={(e) => handlePhoneInput(e.target.value)}
                    />
                  </div>
                  <div style={{ fontSize: '0.71rem', marginTop: 3, color: isPhoneValid ? '#059669' : 'var(--adm-text-muted, #64748b)', fontWeight: isPhoneValid ? 700 : 500 }}>
                    {isPhoneValid ? '✓ Valid 10-digit mobile' : `${cleanPhone.length}/10 digits`}
                  </div>
                </div>

                <div>
                  <label className="desk-form-label">
                    Login Username <span style={{ fontWeight: 500, color: 'var(--adm-text-muted, #64748b)' }}>(Auto-filled)</span>
                  </label>
                  <input
                    type="text"
                    className="desk-form-input"
                    placeholder="Auto-generated if left blank"
                    value={username}
                    onChange={(e) => {
                      setUsernameManuallyEdited(true);
                      setUsername(e.target.value.replace(/^@/, '').replace(/\s+/g, '_'));
                    }}
                  />
                  {usernameStatus.message && (
                    <div
                      style={{
                        fontSize: '0.71rem',
                        marginTop: 3,
                        fontWeight: 700,
                        color:
                          usernameStatus.state === 'available'
                            ? '#059669'
                            : usernameStatus.state === 'taken'
                              ? '#dc2626'
                              : 'var(--adm-text-muted, #64748b)',
                      }}
                    >
                      {usernameStatus.state === 'available' ? '✓ ' : usernameStatus.state === 'taken' ? '✕ ' : ''}
                      {usernameStatus.message}
                    </div>
                  )}
                </div>
              </div>

              {/* 3. Account Password */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <label className="desk-form-label" style={{ margin: 0 }}>
                    Client Login Password <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setPasswordManuallyEdited(true);
                      setPassword(generateFriendlyPassword(cleanPhone));
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#4f46e5',
                      fontSize: '0.74rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: 0,
                    }}
                  >
                    <RefreshCw size={11} /> Generate Password
                  </button>
                </div>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    className="desk-form-input"
                    style={{ paddingRight: 40, fontFamily: 'monospace', fontWeight: 700 }}
                    placeholder="Minimum 6 characters"
                    value={password}
                    onChange={(e) => {
                      setPasswordManuallyEdited(true);
                      setPassword(e.target.value);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    style={{
                      position: 'absolute',
                      right: 10,
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--adm-text-muted, #64748b)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      padding: 2,
                    }}
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* 4. Optional Business Profile & Remark Accordion */}
              <div
                style={{
                  border: '1px solid var(--adm-border, #e2e8f0)',
                  borderRadius: 10,
                  background: 'var(--adm-bg-subtle, #f8fafc)',
                  overflow: 'hidden',
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowOptional((p) => !p)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    background: 'transparent',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    color: 'var(--adm-text-primary, #0f172a)',
                    fontSize: '0.8rem',
                    fontWeight: 800,
                  }}
                >
                  <span>Optional Profile Details &amp; Call Remark (Category, City, Email)</span>
                  {showOptional ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>

                {showOptional && (
                  <div
                    style={{
                      padding: '12px 14px 14px',
                      borderTop: '1px solid var(--adm-border, #e2e8f0)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 10 }}>
                      <div>
                        <label className="desk-form-label">Contact Person Name</label>
                        <input
                          type="text"
                          className="desk-form-input"
                          placeholder="Defaults to Client Name"
                          value={contactPerson}
                          onChange={(e) => setContactPerson(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="desk-form-label">Business Category</label>
                        <select
                          className="desk-form-input"
                          value={category}
                          onChange={(e) => setCategory(e.target.value)}
                        >
                          <option value="">Select later (Optional)</option>
                          {BUSINESS_CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 10 }}>
                      <div>
                        <label className="desk-form-label">Operating City</label>
                        <input
                          type="text"
                          className="desk-form-input"
                          placeholder="e.g. Surat, Mumbai"
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="desk-form-label">State</label>
                        <input
                          type="text"
                          className="desk-form-input"
                          placeholder="e.g. Gujarat"
                          value={stateName}
                          onChange={(e) => setStateName(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="desk-form-label">Work Email</label>
                        <input
                          type="email"
                          className="desk-form-input"
                          placeholder="Optional"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="desk-form-label">Initial Sales Remark (Staff-Only)</label>
                      <input
                        type="text"
                        className="desk-form-input"
                        placeholder="e.g. Client was busy in meeting — registered account, will top up evening"
                        value={initialRemark}
                        onChange={(e) => setInitialRemark(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer Submit */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 10,
                flexWrap: 'wrap',
                marginTop: 18,
                paddingTop: 14,
                borderTop: '1px solid var(--adm-border, #e2e8f0)',
              }}
            >
              <span style={{ fontSize: '0.75rem', color: 'var(--adm-text-muted, #64748b)', fontWeight: 600 }}>
                Starts with <strong>₹0</strong> balance • Client can top up anytime
              </span>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="sales-btn-secondary"
                  onClick={onClose}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="sales-btn-primary"
                  disabled={submitting}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    fontWeight: 800,
                    padding: '9px 18px',
                  }}
                >
                  <UserPlus size={15} />
                  <span>{submitting ? 'Creating Account...' : 'Create Client Account (₹0)'}</span>
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
