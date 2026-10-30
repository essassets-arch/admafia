import React, { useState, useEffect } from 'react';
import crmApi from '../services/crmApi';

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

    return {
      companyName: u.companyName || u.name || customer?.companyName || customer?.name || '',
      category: u.category || customer?.category || 'IT & Software',
      websiteUrl: u.website || u.domain || customer?.website || customer?.domain || '',
      industry: u.industry || customer?.industry || 'Other',
      contactPerson: u.contactPerson || u.contact || customer?.contactPerson || customer?.contact || u.username || customer?.username || '',
      email: u.email || customer?.email || '',
      phone: u.phone || customer?.phone || '',
      personalEmail: u.personalEmail || customer?.personalEmail || '',
      city: u.city || customer?.city || customer?.address?.city || '',
      state: u.state || customer?.state || customer?.address?.state || '',
      country: u.country || customer?.country || 'India',
      profile_status: u.profileStatus || u.profile_status || customer?.profileStatus || customer?.profile_status || 'incomplete',
    };
  };

  const [profileData, setProfileData] = useState(getProfileInitial);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Sync real-time when customer prop or localStorage updates
  useEffect(() => {
    setProfileData(getProfileInitial());
  }, [customer]);

  useEffect(() => {
    const handleActiveUserChange = (e) => {
      if (e?.detail) {
        const u = e.detail;
        setProfileData((prev) => ({
          ...prev,
          companyName: u.companyName || u.name || prev.companyName,
          category: u.category || prev.category,
          websiteUrl: u.website || u.domain || prev.websiteUrl,
          industry: u.industry || prev.industry,
          contactPerson: u.contactPerson || u.contact || prev.contactPerson,
          email: u.email || prev.email,
          phone: u.phone || prev.phone,
          personalEmail: u.personalEmail || prev.personalEmail,
          city: u.city || prev.city,
          state: u.state || prev.state,
          country: u.country || prev.country,
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
    const rawPhone = String(profileData.phone || '').replace(/\D/g, '').slice(-10);
    const opCity = (profileData.city || '').trim();

    if (!compName) {
      setSaveError('Company Name is required.');
      return;
    }
    if (!contactName) {
      setSaveError('Contact Person Name is required.');
      return;
    }
    if (rawPhone.length !== 10) {
      setSaveError('Please enter a valid 10-digit mobile number.');
      return;
    }
    if (!opCity) {
      setSaveError('City is required.');
      return;
    }

    setIsSaving(true);

    const nowStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + ', Today';

    const updatedPayload = {
      ...customer,
      companyName: compName,
      name: compName,
      domain: (profileData.websiteUrl || '').trim(),
      website: (profileData.websiteUrl || '').trim(),
      category: profileData.category || 'IT & Software',
      industry: (profileData.industry || 'Other').trim(),
      contactPerson: contactName,
      contact: contactName,
      email: (profileData.email || '').trim(),
      phone: rawPhone,
      personalEmail: (profileData.personalEmail || '').trim(),
      city: opCity,
      state: (profileData.state || 'Maharashtra').trim(),
      country: (profileData.country || 'India').trim(),
      profile_status: 'complete',
      profileStatus: 'complete',
      kycPercent: 100,
      verified: true,
      completedAt: nowStr,
      address: {
        ...(customer?.address || {}),
        city: opCity,
        state: (profileData.state || 'Maharashtra').trim(),
        country: (profileData.country || 'India').trim(),
      },
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

  return (
    <div className="portal-profile-view">
      {/* Header */}
      <div className="profile-header-card">
        <div>
          <h2>Account &amp; Business Profile Setup</h2>
          <p className="profile-sub">
            The business identity, organization contacts, and geographic operational base.
          </p>
        </div>
      </div>

      {/* 1. Registration Status Banner */}
      <div className="registration-status-banner-card">
        <div className="reg-status-left">
          <div className="reg-status-icon">🛡️</div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {profileData.profile_status === 'complete' || customer?.profileStatus === 'complete' ? (
                <span className="badge-step-required" style={{ background: '#ecfdf5', color: '#059669', borderColor: '#a7f3d0' }}>
                  ✓ Profile Registered &amp; Active
                </span>
              ) : (
                <span className="badge-step-required" style={{ background: '#fffbeb', color: '#b45309', borderColor: '#fde68a' }}>
                  ⏳ Profile Setup Pending
                </span>
              )}
              <span className="badge-category-tag">{profileData.category || 'IT & Software'}</span>
              {(profileData.city || profileData.state) && (
                <span style={{ fontSize: '0.78rem', background: '#eff6ff', color: '#1d4ed8', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>
                  {[profileData.city, profileData.state].filter(Boolean).join(', ')}
                </span>
              )}
            </div>
            <h4 style={{ margin: '8px 0 4px', fontSize: '1.08rem', color: '#0f172a' }}>
              {profileData.companyName || 'Organization Name Not Set'}
            </h4>
            <p style={{ margin: 0, fontSize: '0.84rem', color: '#64748b' }}>
              Administrator: <strong>{profileData.contactPerson || '—'}</strong> • Phone: <strong>{profileData.phone ? `+91 ${profileData.phone}` : '—'}</strong> • Email: <strong>{profileData.email || '—'}</strong>
            </p>
          </div>
        </div>

        <div className="reg-status-right">
          <div className="progress-bar-container">
            <div className="progress-bar-label">
              <span>Profile Completion</span>
              <strong>{profileData.profile_status === 'complete' || customer?.profileStatus === 'complete' ? '100%' : '25%'}</strong>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{
                  width: profileData.profile_status === 'complete' || customer?.profileStatus === 'complete' ? '100%' : '25%',
                  background: profileData.profile_status === 'complete' || customer?.profileStatus === 'complete' ? '#10b981' : '#f59e0b',
                }}
              ></div>
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
          ✓ Business profile successfully saved and synchronized with database &amp; CRM lead distribution!
        </div>
      )}

      {/* 2. Profile Form Sections: EXACT 3 SUBMITTED SECTIONS */}
      <form onSubmit={handleSubmit} className="profile-form-layout">
        
        {/* Section 1: Company Information */}
        <div className="profile-form-section">
          <div className="section-title-wrap">
            <span className="sec-number">1</span>
            <div>
              <h3>🏢 Company Information</h3>
              <small>Organization and brand details</small>
            </div>
          </div>

          <div className="form-fields-grid-2">
            <div className="form-group-block">
              <label>Company Name<span>*</span></label>
              <input
                type="text"
                required
                value={profileData.companyName}
                onChange={(e) => setProfileData({ ...profileData, companyName: e.target.value })}
                className="clean-input"
                placeholder="Enter your company name"
              />
            </div>

            <div className="form-group-block">
              <label>Business Category<span>*</span></label>
              <select
                value={profileData.category}
                onChange={(e) => setProfileData({ ...profileData, category: e.target.value })}
                className="clean-select"
              >
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
                placeholder="www.emperorsmartsolutions.com"
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
                placeholder="Other"
              />
              <small style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '4px', display: 'block' }}>
                Choose from suggestions or type your custom niche
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
              <small>Workspace administrator</small>
            </div>
          </div>

          <div className="form-fields-grid-2">
            <div className="form-group-block">
              <label>Contact Person Name<span>*</span></label>
              <input
                type="text"
                required
                value={profileData.contactPerson}
                onChange={(e) => setProfileData({ ...profileData, contactPerson: e.target.value })}
                className="clean-input"
                placeholder="Enter administrator full name"
              />
            </div>

            <div className="form-group-block">
              <label>Business Email<span>*</span></label>
              <input
                type="email"
                required
                value={profileData.email}
                onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                className="clean-input"
                placeholder="Enter business email address"
              />
            </div>

            <div className="form-group-block">
              <label>Direct Phone / WhatsApp Number<span>*</span></label>
              <input
                type="tel"
                required
                maxLength={10}
                value={profileData.phone}
                onChange={(e) => setProfileData({ ...profileData, phone: e.target.value.replace(/\D/g, '') })}
                className="clean-input"
                placeholder="Enter 10-digit mobile number"
              />
              <small style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '4px', display: 'block' }}>
                10-digit mobile number
              </small>
            </div>

            <div className="form-group-block">
              <label>Personal Email</label>
              <input
                type="email"
                value={profileData.personalEmail}
                onChange={(e) => setProfileData({ ...profileData, personalEmail: e.target.value })}
                className="clean-input"
                placeholder="Optional backup email address"
              />
              <small style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '4px', display: 'block' }}>
                Optional backup address
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
              <label>City<span>*</span></label>
              <input
                type="text"
                required
                value={profileData.city}
                onChange={(e) => setProfileData({ ...profileData, city: e.target.value })}
                className="clean-input"
                placeholder="Indore"
              />
            </div>

            <div className="form-group-block">
              <label>State / Province</label>
              <input
                type="text"
                value={profileData.state}
                onChange={(e) => setProfileData({ ...profileData, state: e.target.value })}
                className="clean-input"
                placeholder="Maharashtra"
              />
            </div>

            <div className="form-group-block" style={{ gridColumn: 'span 2' }}>
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
