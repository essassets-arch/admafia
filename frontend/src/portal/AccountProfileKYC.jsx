import React, { useState, useEffect } from 'react';
import {
  Building2,
  Briefcase,
  MapPin,
  Mail,
  Phone,
  Globe,
  User,
  ShieldCheck,
  CheckCircle2,
  ExternalLink,
  Edit3,
  Wallet,
  Clock,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import crmApi from '../services/crmApi';
import {
  evaluateCustomerProfileCompletion,
  sanitizeCustomerProfileFields,
} from '../utils/profileCompletion';

export default function AccountProfileKYC({
  customer,
  onUpdateCustomer,
  onOpenCompleteRegistration,
}) {
  const getProfileInitial = () => {
    let u = {};
    try {
      const raw = localStorage.getItem('growthline_active_user');
      if (raw) u = JSON.parse(raw);
    } catch (e) {}

    const c = customer || {};
    const merged = { ...u, ...c };
    const clean = sanitizeCustomerProfileFields(merged);

    return {
      companyName: c.companyName || c.name || u.companyName || u.name || '',
      category: clean.category,
      websiteUrl: c.website || c.domain || u.website || u.domain || '',
      industry: clean.industry,
      contactPerson: c.contactPerson || c.contact || u.contactPerson || u.contact || c.username || u.username || '',
      email: c.email || u.email || '',
      phone: c.phone || u.phone || '',
      personalEmail: c.personalEmail || u.personalEmail || '',
      city: clean.city,
      state: clean.state,
      country: c.country || u.country || 'India',
      profile_status: c.profileStatus || c.profile_status || u.profileStatus || u.profile_status || 'incomplete',
    };
  };

  const [profileData, setProfileData] = useState(getProfileInitial);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Sync real-time when customer prop changes
  useEffect(() => {
    if (customer) {
      const clean = sanitizeCustomerProfileFields(customer);
      setProfileData((prev) => ({
        companyName: customer.companyName || customer.name || prev.companyName || '',
        category: clean.category || prev.category || '',
        websiteUrl: customer.website || customer.domain || prev.websiteUrl || '',
        industry: clean.industry || prev.industry || '',
        contactPerson: customer.contactPerson || customer.contact || customer.username || prev.contactPerson || '',
        email: customer.email || prev.email || '',
        phone: customer.phone || prev.phone || '',
        personalEmail: customer.personalEmail || prev.personalEmail || '',
        city: clean.city || prev.city || '',
        state: clean.state || prev.state || '',
        country: customer.country || prev.country || 'India',
        profile_status: customer.profileStatus || customer.profile_status || prev.profile_status || 'incomplete',
      }));
    }
  }, [customer]);

  // Direct fetch from PostgreSQL on component mount to guarantee latest saved data is filled
  useEffect(() => {
    const idOrPhone = customer?.id || customer?.phone;
    if (idOrPhone) {
      crmApi
        .getCustomerWorkspace(idOrPhone)
        .then((res) => {
          if (res?.customer) {
            const c = res.customer;
            const clean = sanitizeCustomerProfileFields(c);
            setProfileData((prev) => ({
              companyName: c.companyName || c.name || prev.companyName || '',
              category: clean.category || prev.category || '',
              websiteUrl: c.website || c.domain || prev.websiteUrl || '',
              industry: clean.industry || prev.industry || '',
              contactPerson: c.contactPerson || c.contact || c.username || prev.contactPerson || '',
              email: c.email || prev.email || '',
              phone: c.phone || prev.phone || '',
              personalEmail: c.personalEmail || prev.personalEmail || '',
              city: clean.city || prev.city || '',
              state: clean.state || prev.state || '',
              country: c.country || prev.country || 'India',
              profile_status: c.profileStatus || c.profile_status || prev.profile_status || 'incomplete',
            }));
          }
        })
        .catch(() => {});
    }
  }, [customer?.id, customer?.phone]);

  useEffect(() => {
    const handleActiveUserChange = (e) => {
      if (e?.detail) {
        const u = e.detail;
        const clean = sanitizeCustomerProfileFields(u);
        setProfileData((prev) => ({
          ...prev,
          companyName: u.companyName || u.name || prev.companyName || '',
          category: clean.category || prev.category || '',
          websiteUrl: u.website || u.domain || prev.websiteUrl || '',
          industry: clean.industry || prev.industry || '',
          contactPerson: u.contactPerson || u.contact || u.username || prev.contactPerson || '',
          email: u.email || prev.email || '',
          phone: u.phone || prev.phone || '',
          personalEmail: u.personalEmail || prev.personalEmail || '',
          city: clean.city || prev.city || '',
          state: clean.state || prev.state || '',
          country: u.country || prev.country || 'India',
          profile_status: u.profileStatus || u.profile_status || prev.profile_status || 'incomplete',
        }));
      }
    };
    window.addEventListener('growthline_active_user_changed', handleActiveUserChange);
    window.addEventListener('growthline_customer_registered', handleActiveUserChange);
    return () => {
      window.removeEventListener('growthline_active_user_changed', handleActiveUserChange);
      window.removeEventListener('growthline_customer_registered', handleActiveUserChange);
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaveError('');
    setSavedSuccess(false);

    const compName = (profileData.companyName || '').trim();
    const contactName = (profileData.contactPerson || '').trim();
    const rawDigits = String(profileData.phone || '').replace(/\D/g, '');
    const isIndia = (profileData.country || 'India').trim().toLowerCase() === 'india';
    const rawPhone = isIndia ? rawDigits.slice(-10) : rawDigits;
    const opCity = (profileData.city || '').trim();
    const opState = (profileData.state || '').trim();
    const opEmail = (profileData.email || '').trim();
    const chosenCategory = (profileData.category || '').trim();

    if (!compName) {
      setSaveError('Company Name is required.');
      return;
    }
    if (!chosenCategory) {
      setSaveError('Please select your Business Category.');
      return;
    }
    if (!contactName) {
      setSaveError('Contact Person Name is required.');
      return;
    }
    if (isIndia ? rawPhone.length !== 10 : rawPhone.length < 7) {
      setSaveError(isIndia ? 'Please enter a valid 10-digit mobile number.' : 'Please enter a valid mobile number.');
      return;
    }
    if (!opEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(opEmail)) {
      setSaveError('Please enter a valid Business Email address.');
      return;
    }
    if (!opCity) {
      setSaveError('Operating City is required.');
      return;
    }
    if (!opState) {
      setSaveError('State / Province is required.');
      return;
    }

    setIsSaving(true);

    const nowStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + ', Today';

    const draftPayload = {
      ...customer,
      companyName: compName,
      name: compName,
      domain: (profileData.websiteUrl || '').trim(),
      website: (profileData.websiteUrl || '').trim(),
      category: chosenCategory,
      industry: (profileData.industry || '').trim() || chosenCategory,
      contactPerson: contactName,
      contact: contactName,
      email: opEmail,
      phone: rawPhone,
      personalEmail: (profileData.personalEmail || '').trim(),
      city: opCity,
      state: opState,
      country: (profileData.country || 'India').trim(),
      profile_status: 'complete',
      profileStatus: 'complete',
      verified: true,
      completedAt: nowStr,
      address: {
        ...(customer?.address || {}),
        city: opCity,
        state: opState,
        country: (profileData.country || 'India').trim(),
      },
    };
    const submitEval = evaluateCustomerProfileCompletion(draftPayload);
    const updatedPayload = {
      ...draftPayload,
      profile_status: submitEval.profileStatus,
      profileStatus: submitEval.profileStatus,
      kycPercent: submitEval.kycPercent,
    };

    // 1. Direct PostgreSQL Backend Persistence
    try {
      const targetId = customer?.id || customer?.phone || rawPhone;
      if (targetId) {
        const apiCust = await crmApi.updateCustomerProfile(targetId, updatedPayload);
        if (apiCust && typeof apiCust === 'object') {
          Object.assign(updatedPayload, apiCust);
        }
        await crmApi.syncStateFromPostgres().catch(() => {});
      }
    } catch (err) {
      console.warn('PostgreSQL direct profile update note:', err.message);
    }

    // 2. Instant Local Storage & All Desks Synchronization
    try {
      localStorage.setItem('growthline_active_user', JSON.stringify(updatedPayload));

      // Sync with Desk 1 (Customer Registrations) & Desk 4 (Profile Completion)
      const rawCusts = localStorage.getItem('growthline_registered_customers');
      if (rawCusts) {
        const parsed = JSON.parse(rawCusts);
        if (Array.isArray(parsed)) {
          const synced = parsed.map((c) => {
            if (c.phone === rawPhone || c.phone === customer?.phone || c.username === updatedPayload.username || c.id === updatedPayload.id) {
              return {
                ...c,
                ...updatedPayload,
                name: compName,
                companyName: compName,
                contactPerson: contactName,
                contact: contactName,
                email: updatedPayload.email,
                personalEmail: updatedPayload.personalEmail,
                category: updatedPayload.category,
                industry: updatedPayload.industry,
                website: updatedPayload.website,
                city: opCity,
                state: updatedPayload.state,
                country: updatedPayload.country,
                profileStatus: 'complete',
                profile_status: 'complete',
                kycPercent: 100,
                verified: true,
                completedAt: nowStr,
              };
            }
            return c;
          });
          localStorage.setItem('growthline_registered_customers', JSON.stringify(synced));
        }
      }

      // Sync with Desk 2 (Pending Verification)
      const rawPV = localStorage.getItem('growthline_pending_verifications');
      if (rawPV) {
        const parsedPV = JSON.parse(rawPV);
        if (Array.isArray(parsedPV)) {
          const syncedPV = parsedPV.map((pv) => {
            if (pv.customerId === updatedPayload.id || pv.phone === rawPhone || pv.phone === customer?.phone) {
              return {
                ...pv,
                company: compName,
                contact: contactName,
                phone: rawPhone,
                profileStatus: 'complete',
                queueType: pv.paymentStatus === 'verified' || pv.paymentStatus === 'paid' ? 'Completed' : 'Payment Pending',
              };
            }
            return pv;
          });
          localStorage.setItem('growthline_pending_verifications', JSON.stringify(syncedPV));
        }
      }

      // Sync with Desk 5 (Payment Records)
      const rawPay = localStorage.getItem('growthline_payment_records');
      if (rawPay) {
        const parsedPay = JSON.parse(rawPay);
        if (Array.isArray(parsedPay)) {
          const syncedPay = parsedPay.map((pr) => {
            if (pr.customerId === updatedPayload.id || pr.phone === rawPhone || pr.phone === customer?.phone) {
              return {
                ...pr,
                company: compName,
                contact: contactName,
                phone: rawPhone,
                city: opCity,
              };
            }
            return pr;
          });
          localStorage.setItem('growthline_payment_records', JSON.stringify(syncedPay));
        }
      }

      window.dispatchEvent(new CustomEvent('growthline_active_user_changed', { detail: updatedPayload }));
      window.dispatchEvent(new CustomEvent('growthline_customer_registered', { detail: updatedPayload }));
    } catch (err) {
      console.error('Failed to sync profile update to localStorage', err);
    }

    if (onUpdateCustomer) {
      onUpdateCustomer(updatedPayload);
    }

    setIsSaving(false);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 5000);
  };

  const profEval = evaluateCustomerProfileCompletion({ ...customer, ...profileData, website: profileData.websiteUrl });
  const isProfileComplete = profEval.isComplete;
  const effectiveWallet = Number(customer?.walletBalance ?? customer?.balance ?? 0);
  const effectivePacing = Number(customer?.dailyAdSpend || 300);
  const isLeadEligible = effectiveWallet >= effectivePacing && isProfileComplete;
  const missingKeySet = new Set(profEval.missingKeys || []);
  const missingFieldStyle = {
    borderColor: '#f59e0b',
    backgroundColor: '#fffbeb',
    boxShadow: '0 0 0 2px rgba(245, 158, 11, 0.14)',
  };

  const handleScrollToEdit = () => {
    const el = document.getElementById('profile-edit-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="portal-profile-view">
      {/* 1. Header Card */}
      <div className="profile-header-card">
        <div>
          <h2>Account &amp; Business Profile</h2>
          <p className="profile-sub">
            Verified organization details, authorized administrator contacts, geographic territory, and lead distribution eligibility.
          </p>
        </div>
        <button
          type="button"
          onClick={handleScrollToEdit}
          className="btn-jump-edit"
          title="Scroll down to edit profile form"
        >
          <Edit3 size={15} />
          <span>✏️ Edit Profile</span>
        </button>
      </div>

      {/* Incomplete Profile Alert Strip */}
      {!isProfileComplete && (
        <div
          style={{
            background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
            border: '1.5px solid #f59e0b',
            borderRadius: '14px',
            padding: '14px 18px',
            marginBottom: '18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', flex: '1 1 260px' }}>
            <AlertCircle size={20} color="#d97706" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <div style={{ fontWeight: 800, color: '#92400e', fontSize: '0.92rem' }}>
                Profile {profEval.kycPercent}% Complete — {profEval.missingFields.length} required {profEval.missingFields.length === 1 ? 'field' : 'fields'} remaining
              </div>
              <div style={{ fontSize: '0.82rem', color: '#b45309', marginTop: '3px' }}>
                Missing: <strong>{profEval.missingFields.join(', ')}</strong>. Complete the highlighted fields below and save to reach 100%.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleScrollToEdit}
            style={{
              background: '#d97706',
              color: '#ffffff',
              border: 'none',
              borderRadius: '10px',
              padding: '9px 16px',
              fontSize: '0.84rem',
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Complete Missing Fields ↓
          </button>
        </div>
      )}

      {/* 2. Comprehensive Profile Overview Dashboard — Displays ALL customer-filled data cleanly */}
      <div className="profile-overview-dashboard">
        <div className="profile-overview-top">
          <div className="profile-overview-title-block">
            <span style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', fontWeight: 800 }}>
              Business Profile Record
            </span>
            <h3>{profileData.companyName || customer?.companyName || customer?.name || 'Registered Organization'}</h3>
            <div className="profile-badges-strip">
              {isProfileComplete ? (
                <span className="badge-kyc-verified">
                  <ShieldCheck size={14} /> ✓ Verified KYC (100%)
                </span>
              ) : (
                <span className="badge-kyc-pending">
                  <Clock size={14} /> ⏳ Profile {profEval.kycPercent}% Complete
                </span>
              )}
              {profileData.category ? (
                <span className="badge-category-pill">
                  🏷️ {profileData.category}
                </span>
              ) : (
                <span className="badge-kyc-pending" style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fcd34d' }}>
                  ⚠️ Category Not Selected
                </span>
              )}
              {(profileData.city || profileData.state) && (
                <span style={{ fontSize: '0.8rem', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '4px 10px', borderRadius: '999px', fontWeight: 700 }}>
                  📍 {[profileData.city, profileData.state].filter(Boolean).join(', ')}
                </span>
              )}
              <span className="badge-wallet-info">
                💰 Growth Wallet: ₹{effectiveWallet.toLocaleString('en-IN')}
              </span>
              {isLeadEligible ? (
                <span style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', padding: '4px 10px', borderRadius: '999px', fontSize: '0.8rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <Sparkles size={13} /> Active for Lead Distribution
                </span>
              ) : (
                <span style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', padding: '4px 10px', borderRadius: '999px', fontSize: '0.8rem', fontWeight: 700 }}>
                  ⚠️ {!isProfileComplete ? `Profile Incomplete (${profEval.kycPercent}%)` : 'Low Balance (Min ₹' + effectivePacing + ')'}
                </span>
              )}
            </div>
          </div>

          <div style={{ minWidth: '220px' }}>
            <div className="progress-bar-container">
              <div className="progress-bar-label">
                <span>Profile Readiness</span>
                <strong>{profEval.kycPercent}%</strong>
              </div>
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{
                    width: `${profEval.kycPercent}%`,
                    background: isProfileComplete ? '#10b981' : '#f59e0b',
                  }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        {/* 4 Multi-Card Structured Panels */}
        <div className="profile-overview-cards-grid">
          {/* Panel 1: Company & Organization */}
          <div className="profile-info-card-box">
            <div className="profile-info-card-header">
              <div className="profile-info-card-icon">
                <Building2 size={18} />
              </div>
              <h4>Company Information</h4>
            </div>
            <div className="profile-key-values">
              <div className="profile-kv-row">
                <span className="profile-kv-label">Company Name:</span>
                <span className="profile-kv-val">{profileData.companyName || customer?.companyName || customer?.name || '—'}</span>
              </div>
              <div className="profile-kv-row">
                <span className="profile-kv-label">Business Category:</span>
                <span className="profile-kv-val" style={!profileData.category ? { color: '#d97706', fontWeight: 700 } : undefined}>
                  {profileData.category || '⚠️ Required — Select below'}
                </span>
              </div>
              <div className="profile-kv-row">
                <span className="profile-kv-label">Primary Industry:</span>
                <span className="profile-kv-val">{profileData.industry || 'Not specified'}</span>
              </div>
              <div className="profile-kv-row">
                <span className="profile-kv-label">Website / Domain:</span>
                <span className="profile-kv-val">
                  {profileData.websiteUrl || customer?.website || customer?.domain ? (
                    <a
                      href={(profileData.websiteUrl || customer?.website || customer?.domain).startsWith('http') ? (profileData.websiteUrl || customer?.website || customer?.domain) : `https://${profileData.websiteUrl || customer?.website || customer?.domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                      {profileData.websiteUrl || customer?.website || customer?.domain} <ExternalLink size={12} />
                    </a>
                  ) : (
                    <span style={{ color: '#94a3b8', fontStyle: 'italic', fontWeight: 500 }}>Not provided</span>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Panel 2: Authorized Administrator & Contacts */}
          <div className="profile-info-card-box">
            <div className="profile-info-card-header">
              <div className="profile-info-card-icon" style={{ color: '#059669' }}>
                <User size={18} />
              </div>
              <h4>Primary Administrator Contact</h4>
            </div>
            <div className="profile-key-values">
              <div className="profile-kv-row">
                <span className="profile-kv-label">Contact Person:</span>
                <span className="profile-kv-val">{profileData.contactPerson || customer?.contactPerson || customer?.contact || '—'}</span>
              </div>
              <div className="profile-kv-row">
                <span className="profile-kv-label">Mobile / WhatsApp:</span>
                <span className="profile-kv-val" style={{ color: '#059669' }}>
                  {profileData.phone ? `+91 ${profileData.phone}` : (customer?.phone ? `+91 ${customer.phone}` : '—')}
                </span>
              </div>
              <div className="profile-kv-row">
                <span className="profile-kv-label">Official Email:</span>
                <span className="profile-kv-val" style={missingKeySet.has('email') ? { color: '#d97706', fontWeight: 700 } : undefined}>
                  {profileData.email || customer?.email || '⚠️ Required'}
                </span>
              </div>
              <div className="profile-kv-row">
                <span className="profile-kv-label">Personal Email:</span>
                <span className="profile-kv-val">
                  {profileData.personalEmail || customer?.personalEmail || (
                    <span style={{ color: '#94a3b8', fontStyle: 'italic', fontWeight: 500 }}>Not provided</span>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Panel 3: Headquarters & Geographic Base */}
          <div className="profile-info-card-box">
            <div className="profile-info-card-header">
              <div className="profile-info-card-icon" style={{ color: '#d97706' }}>
                <MapPin size={18} />
              </div>
              <h4>Operational Headquarters</h4>
            </div>
            <div className="profile-key-values">
              <div className="profile-kv-row">
                <span className="profile-kv-label">Operating City:</span>
                <span className="profile-kv-val" style={missingKeySet.has('city') ? { color: '#d97706', fontWeight: 700 } : undefined}>
                  {profileData.city || '⚠️ Required'}
                </span>
              </div>
              <div className="profile-kv-row">
                <span className="profile-kv-label">State / Province:</span>
                <span className="profile-kv-val" style={missingKeySet.has('state') ? { color: '#d97706', fontWeight: 700 } : undefined}>
                  {profileData.state || '⚠️ Required'}
                </span>
              </div>
              <div className="profile-kv-row">
                <span className="profile-kv-label">Operating Country:</span>
                <span className="profile-kv-val">{profileData.country || customer?.country || 'India'}</span>
              </div>
              <div className="profile-kv-row">
                <span className="profile-kv-label">Delivery Scope:</span>
                <span className="profile-kv-val" style={{ color: '#4f46e5' }}>Territory &amp; Category Lead Matching</span>
              </div>
            </div>
          </div>

          {/* Panel 4: Account & Lead Distribution Ledger */}
          <div className="profile-info-card-box">
            <div className="profile-info-card-header">
              <div className="profile-info-card-icon" style={{ color: '#7c3aed' }}>
                <ShieldCheck size={18} />
              </div>
              <h4>Account &amp; Distribution Ledger</h4>
            </div>
            <div className="profile-key-values">
              <div className="profile-kv-row">
                <span className="profile-kv-label">Customer UID:</span>
                <span className="profile-kv-val" style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>
                  {customer?.id || `cust_${profileData.phone || '9876543210'}`}
                </span>
              </div>
              <div className="profile-kv-row">
                <span className="profile-kv-label">Username:</span>
                <span className="profile-kv-val" style={{ color: '#4338ca' }}>
                  @{customer?.username || (profileData.contactPerson || 'customer').toLowerCase().replace(/\s+/g, '')}
                </span>
              </div>
              <div className="profile-kv-row">
                <span className="profile-kv-label">Daily Growth Pacing:</span>
                <span className="profile-kv-val">₹{effectivePacing.toLocaleString('en-IN')} / day</span>
              </div>
              <div className="profile-kv-row">
                <span className="profile-kv-label">Growth Wallet:</span>
                <span className="profile-kv-val" style={{ color: effectiveWallet >= effectivePacing ? '#059669' : '#dc2626' }}>
                  ₹{effectiveWallet.toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {saveError && (
        <div style={{
          background: '#fef2f2',
          border: '1px solid #fecaca',
          color: '#b91c1c',
          padding: '12px 18px',
          borderRadius: '12px',
          marginBottom: '18px',
          fontWeight: 600,
          fontSize: '0.92rem',
        }}>
          ⚠️ {saveError}
        </div>
      )}

      {savedSuccess && (
        <div className="profile-success-alert">
          ✓ Business profile successfully updated and synchronized with MongoDB &amp; sales lead distribution engine!
        </div>
      )}

      {/* 3. Profile Form Sections: Full 3 sections for editing details */}
      <form id="profile-edit-section" onSubmit={handleSubmit} className="profile-form-layout">
        
        {/* Section 1: Company Information */}
        <div className="profile-form-section">
          <div className="section-title-wrap">
            <span className="sec-number">1</span>
            <div>
              <h3>🏢 Company Information</h3>
              <small>Organization and business identity</small>
            </div>
          </div>

          <div className="form-fields-grid-2">
            <div className="form-group-block">
              <label>
                Company Name<span>*</span>
                {missingKeySet.has('companyName') && <small style={{ color: '#d97706', marginLeft: 6, fontWeight: 700 }}>• Required</small>}
              </label>
              <input
                type="text"
                required
                value={profileData.companyName}
                onChange={(e) => setProfileData({ ...profileData, companyName: e.target.value })}
                className="clean-input"
                style={missingKeySet.has('companyName') ? missingFieldStyle : undefined}
                placeholder="e.g. Acme Technologies Pvt Ltd"
              />
            </div>

            <div className="form-group-block">
              <label>
                Business Category<span>*</span>
                {missingKeySet.has('category') && <small style={{ color: '#d97706', marginLeft: 6, fontWeight: 700 }}>• Select Category</small>}
              </label>
              <select
                required
                value={profileData.category}
                onChange={(e) => setProfileData({ ...profileData, category: e.target.value })}
                className="clean-select"
                style={missingKeySet.has('category') ? missingFieldStyle : undefined}
              >
                <option value="">— Select Your Business Category —</option>
                <option value="IT & Software">IT &amp; Software</option>
                <option value="Organic Food & FMCG">Organic Food &amp; FMCG</option>
                <option value="Hardware & Computer Accessories">Hardware &amp; Computer Accessories</option>
                <option value="Construction & Building Materials">Construction &amp; Building Materials</option>
                <option value="Manufacturing">Manufacturing</option>
                <option value="Digital Marketing">Digital Marketing</option>
                <option value="Electrical Products">Electrical Products</option>
                <option value="Healthcare & Wellness">Healthcare &amp; Wellness</option>
                <option value="Real Estate & Infrastructure">Real Estate &amp; Infrastructure</option>
                <option value="Retail & E-commerce">Retail &amp; E-commerce</option>
                <option value="Financial & Consulting">Financial &amp; Consulting</option>
                <option value="Education & Coaching">Education &amp; Coaching</option>
                <option value="Other">Other</option>
              </select>
              <small style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '4px', display: 'block' }}>
                Determines customer group allocation and targeted lead distribution
              </small>
            </div>

            <div className="form-group-block">
              <label>Company Website</label>
              <input
                type="text"
                value={profileData.websiteUrl}
                onChange={(e) => setProfileData({ ...profileData, websiteUrl: e.target.value })}
                className="clean-input"
                placeholder="e.g. https://yourcompany.com"
              />
              <small style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '4px', display: 'block' }}>
                Optional — leave blank if currently in development
              </small>
            </div>

            <div className="form-group-block">
              <label>Primary Industry<span>*</span></label>
              <input
                type="text"
                required
                value={profileData.industry}
                onChange={(e) => setProfileData({ ...profileData, industry: e.target.value })}
                className="clean-input"
                placeholder="e.g. Cloud Solutions, Retail Supply, Construction, etc."
              />
              <small style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '4px', display: 'block' }}>
                Specify your exact industry niche
              </small>
            </div>
          </div>
        </div>

        {/* Section 2: Primary Contact Information */}
        <div className="profile-form-section">
          <div className="section-title-wrap">
            <span className="sec-number">2</span>
            <div>
              <h3>👤 Primary Contact Information</h3>
              <small>Authorized administrator &amp; communication channel</small>
            </div>
          </div>

          <div className="form-fields-grid-2">
            <div className="form-group-block">
              <label>
                Contact Person Name<span>*</span>
                {missingKeySet.has('contactPerson') && <small style={{ color: '#d97706', marginLeft: 6, fontWeight: 700 }}>• Required</small>}
              </label>
              <input
                type="text"
                required
                value={profileData.contactPerson}
                onChange={(e) => setProfileData({ ...profileData, contactPerson: e.target.value })}
                className="clean-input"
                style={missingKeySet.has('contactPerson') ? missingFieldStyle : undefined}
                placeholder="e.g. Rajesh Sharma"
              />
            </div>

            <div className="form-group-block">
              <label>
                Business Email<span>*</span>
                {missingKeySet.has('email') && <small style={{ color: '#d97706', marginLeft: 6, fontWeight: 700 }}>• Required</small>}
              </label>
              <input
                type="email"
                required
                value={profileData.email}
                onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                className="clean-input"
                style={missingKeySet.has('email') ? missingFieldStyle : undefined}
                placeholder="e.g. contact@yourcompany.com"
              />
            </div>

            <div className="form-group-block">
              <label>
                Direct Phone / WhatsApp Number<span>*</span>
                {missingKeySet.has('phone') && <small style={{ color: '#d97706', marginLeft: 6, fontWeight: 700 }}>• Required</small>}
              </label>
              <input
                type="tel"
                required
                maxLength={15}
                value={profileData.phone}
                onChange={(e) => setProfileData({ ...profileData, phone: e.target.value.replace(/\D/g, '') })}
                className="clean-input"
                style={missingKeySet.has('phone') ? missingFieldStyle : undefined}
                placeholder="Enter 10-digit mobile number"
              />
              <small style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '4px', display: 'block' }}>
                10-digit mobile number for immediate lead dispatch &amp; WhatsApp alerts
              </small>
            </div>

            <div className="form-group-block">
              <label>Personal Email (Optional Backup)</label>
              <input
                type="email"
                value={profileData.personalEmail}
                onChange={(e) => setProfileData({ ...profileData, personalEmail: e.target.value })}
                className="clean-input"
                placeholder="e.g. rajesh.backup@gmail.com"
              />
              <small style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '4px', display: 'block' }}>
                Optional secondary emergency address
              </small>
            </div>
          </div>
        </div>

        {/* Section 3: Headquarters & Location */}
        <div className="profile-form-section">
          <div className="section-title-wrap">
            <span className="sec-number">3</span>
            <div>
              <h3>📍 Headquarters &amp; Location</h3>
              <small>Geographic operational base</small>
            </div>
          </div>

          <div className="form-fields-grid-2">
            <div className="form-group-block">
              <label>
                Operating City<span>*</span>
                {missingKeySet.has('city') && <small style={{ color: '#d97706', marginLeft: 6, fontWeight: 700 }}>• Required</small>}
              </label>
              <input
                type="text"
                required
                value={profileData.city}
                onChange={(e) => setProfileData({ ...profileData, city: e.target.value })}
                className="clean-input"
                style={missingKeySet.has('city') ? missingFieldStyle : undefined}
                placeholder="e.g. Ahmedabad, Bengaluru, Delhi"
              />
            </div>

            <div className="form-group-block">
              <label>
                State / Province<span>*</span>
                {missingKeySet.has('state') && <small style={{ color: '#d97706', marginLeft: 6, fontWeight: 700 }}>• Required</small>}
              </label>
              <input
                type="text"
                required
                value={profileData.state}
                onChange={(e) => setProfileData({ ...profileData, state: e.target.value })}
                className="clean-input"
                style={missingKeySet.has('state') ? missingFieldStyle : undefined}
                placeholder="e.g. Gujarat, Karnataka, Delhi"
              />
            </div>

            <div className="form-group-block form-group-full" style={{ gridColumn: '1 / -1' }}>
              <label>Country</label>
              <input
                type="text"
                value={profileData.country}
                onChange={(e) => setProfileData({ ...profileData, country: e.target.value })}
                className="clean-input"
                placeholder="India"
              />
            </div>
          </div>
        </div>

        {/* Form Actions */}
        <div className="profile-submit-footer">
          <button
            type="submit"
            className="btn-portal-primary"
            disabled={isSaving}
            style={{ padding: '14px 34px', fontSize: '1rem', fontWeight: 700 }}
          >
            {isSaving ? 'Saving Changes to Database...' : '💾 Save Profile Details'}
          </button>
        </div>
      </form>
    </div>
  );
}
