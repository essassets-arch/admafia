import React, { useState } from 'react';
import {
  Building2,
  Briefcase,
  Globe,
  Layers,
  User,
  Mail,
  Phone,
  MapPin,
  CheckCircle2,
  ShieldCheck,
  ArrowRight,
  Sparkles,
  Zap,
  Check,
  Shield,
  ChevronDown,
} from 'lucide-react';

export default function WorkspaceSetupPage({
  onSaved,
  onBackToDashboard,
}) {
  // Load existing profile or user session if available
  const getInitialCustomer = () => {
    try {
      const activeRaw = localStorage.getItem('growthline_active_user');
      if (activeRaw) {
        const u = JSON.parse(activeRaw);
        return {
          companyName: u.companyName || u.name || '',
          category: u.category || 'IT & Software',
          website: u.website || u.domain || '',
          industry: u.industry || 'Other',
          contactPerson: u.contactPerson || u.contact || u.username || '',
          email: u.email || '',
          phone: u.phone || '',
          personalEmail: u.personalEmail || '',
          city: u.city || '',
          state: u.state || 'Maharashtra',
          country: u.country || 'India',
        };
      }
    } catch (e) {}
    return {
      companyName: '',
      category: 'IT & Software',
      website: '',
      industry: 'Other',
      contactPerson: '',
      email: '',
      phone: '',
      personalEmail: '',
      city: '',
      state: 'Maharashtra',
      country: 'India',
    };
  };

  const [formData, setFormData] = useState(getInitialCustomer);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCompleteSuccess, setIsCompleteSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.companyName.trim()) {
      setError('Company Name is required.');
      return;
    }
    if (!formData.contactPerson.trim()) {
      setError('Contact Person Name is required.');
      return;
    }
    if (!formData.phone.trim()) {
      setError('Direct Phone / WhatsApp Number is required.');
      return;
    }
    if (!formData.city.trim()) {
      setError('City is required.');
      return;
    }

    setError('');
    setIsSubmitting(true);

    const nowStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + ', Today';

    setTimeout(() => {
      // 1. Update growthline_active_user
      let updatedUser = {
        ...formData,
        name: formData.companyName,
        contact: formData.contactPerson,
        domain: formData.website,
        profile_status: 'complete',
        profileStatus: 'complete',
        payment_status: 'paid',
        paymentStatus: 'paid',
        kycPercent: 100,
        verified: true,
        completedAt: nowStr,
        isSelfRegistered: true,
      };

      try {
        const storedActive = localStorage.getItem('growthline_active_user');
        if (storedActive) {
          const parsed = JSON.parse(storedActive);
          updatedUser = { ...parsed, ...updatedUser };
        }
        localStorage.setItem('growthline_active_user', JSON.stringify(updatedUser));
      } catch (e) {
        console.error('Failed to save active user', e);
      }

      // 2. Sync into growthline_registered_customers for Desk 01 and Desk 04
      try {
        const rawCusts = localStorage.getItem('growthline_registered_customers');
        let parsed = rawCusts ? JSON.parse(rawCusts) : [];
        let matched = false;

        parsed = parsed.map((c) => {
          if (c.phone === updatedUser.phone || c.username === updatedUser.username || c.id === updatedUser.id) {
            matched = true;
            return {
              ...c,
              name: updatedUser.companyName,
              companyName: updatedUser.companyName,
              contact: updatedUser.contactPerson,
              contactPerson: updatedUser.contactPerson,
              phone: updatedUser.phone,
              email: updatedUser.email,
              personalEmail: updatedUser.personalEmail,
              category: updatedUser.category,
              industry: updatedUser.industry,
              website: updatedUser.website,
              city: updatedUser.city,
              state: updatedUser.state,
              country: updatedUser.country,
              profileStatus: 'complete',
              profile_status: 'complete',
              paymentStatus: 'paid',
              payment_status: 'paid',
              balance: c.balance || 600,
              kycPercent: 100,
              verified: true,
              isSelfRegistered: true,
              completedAt: nowStr,
            };
          }
          return c;
        });

        if (!matched) {
          parsed.unshift({
            id: updatedUser.id || 'cust_reg_' + Date.now(),
            username: updatedUser.username || '',
            name: updatedUser.companyName,
            companyName: updatedUser.companyName,
            contact: updatedUser.contactPerson,
            contactPerson: updatedUser.contactPerson,
            phone: updatedUser.phone,
            email: updatedUser.email,
            personalEmail: updatedUser.personalEmail,
            category: updatedUser.category,
            industry: updatedUser.industry,
            website: updatedUser.website,
            city: updatedUser.city,
            state: updatedUser.state,
            country: updatedUser.country,
            profileStatus: 'complete',
            profile_status: 'complete',
            paymentStatus: updatedUser.paymentStatus || 'pending',
            payment_status: updatedUser.payment_status || 'pending',
            amountPaid: updatedUser.amountPaid || 0,
            balance: updatedUser.walletBalance || 0,
            runwayDays: Math.floor((updatedUser.walletBalance || 0) / 300),
            status: 'active',
            kycPercent: 100,
            verified: true,
            isSelfRegistered: true,
            registeredAt: 'Today',
            completedAt: nowStr,
            registeredFrom: 'http://localhost:5173/#register',
          });
        }

        localStorage.setItem('growthline_registered_customers', JSON.stringify(parsed));
        window.dispatchEvent(new CustomEvent('growthline_customer_registered', { detail: updatedUser }));
      } catch (err) {
        console.error('Failed to sync registered customers', err);
      }

      setIsSubmitting(false);
      setIsCompleteSuccess(true);
      if (onSaved) onSaved(updatedUser);
    }, 500);
  };

  const handleSkipToDashboard = () => {
    if (onBackToDashboard) onBackToDashboard();
    else window.location.href = '/app/lead#app/dashboard';
  };

  return (
    <div className="onboard-page-wrapper">
      <div className="onboard-container">

        {/* Success Modal / Card State */}
        {isCompleteSuccess ? (
          <div className="onboard-success-card animate-fade-in">
            <div className="onboard-success-icon-box">
              <CheckCircle2 size={54} color="#059669" strokeWidth={2.4} />
            </div>
            <h2>🎉 Workspace Configured Successfully!</h2>
            <p>
              Your organization <strong>{formData.companyName}</strong> has been configured and synchronized with the CRM lead routing engine and Sales Sub Admin Desk 04.
            </p>

            <div className="onboard-success-summary-box">
              <div className="onboard-summary-col">
                <small>Organization</small>
                <strong>{formData.companyName}</strong>
              </div>
              <div className="onboard-summary-col">
                <small>Administrator</small>
                <strong>{formData.contactPerson}</strong>
              </div>
              <div className="onboard-summary-col">
                <small>WhatsApp Contact</small>
                <strong>+91 {formData.phone}</strong>
              </div>
              <div className="onboard-summary-col">
                <small>Operational City</small>
                <strong>{formData.city}, {formData.state}</strong>
              </div>
            </div>

            <div className="onboard-success-actions">
              <button
                type="button"
                className="onboard-btn-primary"
                onClick={handleSkipToDashboard}
              >
                <span>Launch CRM Lead Dashboard</span>
                <ArrowRight size={18} />
              </button>
            </div>
          </div>
        ) : (
          <div className="onboard-layout-grid">
            
            {/* LEFT COLUMN: Hero & Live Instance Preview */}
            <aside className="onboard-left-sidebar">

              {/* Headline */}
              <h1 className="onboard-hero-title">
                Launch Your <span className="onboard-title-gradient">Agency Growth Engine</span>
              </h1>

              {/* Subtitle */}
              <p className="onboard-hero-desc">
                Set up your dedicated workspace in 60 seconds to streamline qualified inbound leads, monitor multi-channel campaigns, and sync performance analytics.
              </p>

              {/* LIVE INSTANCE PREVIEW CARD */}
              <div className="onboard-preview-card">
                <div className="onboard-preview-top-accent" />
                
                <div className="onboard-preview-header-row">
                  <div className="onboard-live-indicator">
                    <span className="onboard-green-dot" />
                    <span>LIVE INSTANCE PREVIEW</span>
                  </div>
                  <div className="onboard-preview-meta">
                    <span className="onboard-step-sub">Step 1 of 2</span>
                    <span className="onboard-user-tag">@{formData.contactPerson.toLowerCase().replace(/\s+/g, '_') || 'vikram_malhotra'}</span>
                  </div>
                </div>

                <h3 className="onboard-preview-company-name">
                  {formData.companyName || 'Corporate Workspace'}
                </h3>

                <div className="onboard-preview-tags-row">
                  <span className="onboard-meta-tag">
                    <Building2 size={13} />
                    <span>{formData.category || 'IT & Software'}</span>
                  </span>
                  <span className="onboard-meta-tag">
                    <MapPin size={13} />
                    <span>{formData.city || 'Indore'}, {formData.country || 'India'}</span>
                  </span>
                </div>

                <div className="onboard-preview-perks-grid">
                  <div className="onboard-perk-item">
                    <CheckCircle2 size={14} className="text-emerald" />
                    <span>Meta Ads Sync Ready</span>
                  </div>
                  <div className="onboard-perk-item">
                    <CheckCircle2 size={14} className="text-emerald" />
                    <span>Inbound Leads Pipeline</span>
                  </div>
                  <div className="onboard-perk-item">
                    <CheckCircle2 size={14} className="text-emerald" />
                    <span>Live Analytics Portal</span>
                  </div>
                  <div className="onboard-perk-item">
                    <CheckCircle2 size={14} className="text-emerald" />
                    <span>Dedicated Strategist</span>
                  </div>
                </div>
              </div>
            </aside>

            {/* RIGHT COLUMN: The Clean Onboarding Form Card */}
            <main className="onboard-right-card">
              {/* Stepper Tab Bar */}
              <div className="onboard-stepper-header">
                <div className="onboard-step-pill active">
                  <span className="onboard-step-num">1</span>
                  <span>Step 1: Business Profile &amp; Contact</span>
                </div>
                <div className="onboard-step-connector" />
                <div className="onboard-step-pill inactive">
                  <span className="onboard-step-num">2</span>
                  <span>Step 2: Marketing &amp; Growth Budget</span>
                </div>
              </div>

              {/* Card Header */}
              <div className="onboard-card-title-bar">
                <div>
                  <h2 className="onboard-card-heading">Business Profile &amp; Contact Details</h2>
                  <p className="onboard-card-subheading">
                    Please enter your organization details and point of contact to configure your CRM.
                  </p>
                </div>
                <button
                  type="button"
                  className="onboard-skip-link"
                  onClick={handleSkipToDashboard}
                >
                  <span>Skip to Dashboard</span>
                  <ArrowRight size={14} />
                </button>
              </div>

              {error && (
                <div className="onboard-error-box">
                  <span>⚠️ {error}</span>
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleSubmit} className="onboard-form">

                {/* Section 1: Company Information */}
                <div className="onboard-form-section">
                  <div className="onboard-section-title-row">
                    <div className="onboard-section-left">
                      <Building2 size={16} className="text-emerald" />
                      <h4>Company Information</h4>
                    </div>
                    <span className="onboard-section-sub">Organization and brand details</span>
                  </div>

                  <div className="onboard-fields-2col">
                    {/* Company Name* */}
                    <div className="onboard-field-wrap">
                      <label className="onboard-label">
                        <span>Company Name</span>
                        <span className="onboard-star">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        className="onboard-input"
                        placeholder="GreenLeaf Organics"
                        value={formData.companyName}
                        onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                      />
                    </div>

                    {/* Business Category* */}
                    <div className="onboard-field-wrap">
                      <label className="onboard-label">
                        <span>Business Category</span>
                        <span className="onboard-star">*</span>
                      </label>
                      <div className="onboard-select-wrap">
                        <select
                          className="onboard-select"
                          value={formData.category}
                          onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        >
                          <option value="IT & Software">IT &amp; Software</option>
                          <option value="Other">Other</option>
                          <option value="Organic Food & FMCG">Organic Food &amp; FMCG</option>
                          <option value="Manufacturing">Manufacturing</option>
                          <option value="Healthcare & Wellness">Healthcare &amp; Wellness</option>
                          <option value="Real Estate & Infrastructure">Real Estate &amp; Infrastructure</option>
                          <option value="Retail & E-commerce">Retail &amp; E-commerce</option>
                          <option value="Financial & Consulting">Financial &amp; Consulting</option>
                          <option value="Education & Coaching">Education &amp; Coaching</option>
                        </select>
                        <ChevronDown size={16} className="onboard-select-chevron" />
                      </div>
                      <span className="onboard-hint">Determines customer group allocation and targeted lead distribution</span>
                    </div>

                    {/* Company Website */}
                    <div className="onboard-field-wrap">
                      <label className="onboard-label">
                        <span>Company Website</span>
                      </label>
                      <input
                        type="text"
                        className="onboard-input"
                        placeholder="https://example.com"
                        value={formData.website}
                        onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                      />
                      <span className="onboard-hint">Optional — leave blank if currently in development</span>
                    </div>

                    {/* Primary Industry* */}
                    <div className="onboard-field-wrap">
                      <label className="onboard-label">
                        <span>Primary Industry</span>
                        <span className="onboard-star">*</span>
                      </label>
                      <div className="onboard-select-wrap">
                        <input
                          type="text"
                          required
                          className="onboard-input"
                          placeholder="Other"
                          value={formData.industry}
                          onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                        />
                        <ChevronDown size={16} className="onboard-select-chevron" />
                      </div>
                      <span className="onboard-hint">Choose from suggestions or type your custom niche</span>
                    </div>
                  </div>
                </div>

                {/* Section 2: Primary Contact Information */}
                <div className="onboard-form-section">
                  <div className="onboard-section-title-row">
                    <div className="onboard-section-left">
                      <User size={16} className="text-emerald" />
                      <h4>Primary Contact Information</h4>
                    </div>
                    <span className="onboard-section-sub">Workspace administrator</span>
                  </div>

                  <div className="onboard-fields-2col">
                    {/* Contact Person Name* */}
                    <div className="onboard-field-wrap">
                      <label className="onboard-label">
                        <span>Contact Person Name</span>
                        <span className="onboard-star">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        className="onboard-input"
                        placeholder="Manoj Verma"
                        value={formData.contactPerson}
                        onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                      />
                    </div>

                    {/* Business Email* */}
                    <div className="onboard-field-wrap">
                      <label className="onboard-label">
                        <span>Business Email</span>
                        <span className="onboard-star">*</span>
                      </label>
                      <input
                        type="email"
                        required
                        className="onboard-input"
                        placeholder="manoj@greenleaf.example"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      />
                    </div>

                    {/* Direct Phone / WhatsApp Number* */}
                    <div className="onboard-field-wrap">
                      <label className="onboard-label">
                        <span>Direct Phone / WhatsApp Number</span>
                        <span className="onboard-star">*</span>
                      </label>
                      <input
                        type="tel"
                        required
                        className="onboard-input"
                        placeholder="+91 99808 20319"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      />
                      <span className="onboard-hint">10-digit mobile number (e.g. 9820012345)</span>
                    </div>

                    {/* Personal Email */}
                    <div className="onboard-field-wrap">
                      <label className="onboard-label">
                        <span>Personal Email</span>
                      </label>
                      <input
                        type="email"
                        className="onboard-input"
                        placeholder="e.g. rahul.personal@example.com"
                        value={formData.personalEmail}
                        onChange={(e) => setFormData({ ...formData, personalEmail: e.target.value })}
                      />
                      <span className="onboard-hint">Optional backup address</span>
                    </div>
                  </div>
                </div>

                {/* Section 3: Headquarters & Location */}
                <div className="onboard-form-section">
                  <div className="onboard-section-title-row">
                    <div className="onboard-section-left">
                      <MapPin size={16} className="text-emerald" />
                      <h4>Headquarters &amp; Location</h4>
                    </div>
                    <span className="onboard-section-sub">Geographic operational base</span>
                  </div>

                  <div className="onboard-fields-2col">
                    {/* City* */}
                    <div className="onboard-field-wrap">
                      <label className="onboard-label">
                        <span>City</span>
                        <span className="onboard-star">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        className="onboard-input"
                        placeholder="Indore"
                        value={formData.city}
                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      />
                    </div>

                    {/* State / Province */}
                    <div className="onboard-field-wrap">
                      <label className="onboard-label">
                        <span>State / Province</span>
                      </label>
                      <input
                        type="text"
                        className="onboard-input"
                        placeholder="Maharashtra"
                        value={formData.state}
                        onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      />
                    </div>
                  </div>

                  {/* Country - Full Width below City & State */}
                  <div className="onboard-field-wrap" style={{ marginTop: '16px' }}>
                    <label className="onboard-label">
                      <span>Country</span>
                    </label>
                    <input
                      type="text"
                      className="onboard-input"
                      placeholder="India"
                      value={formData.country}
                      onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    />
                  </div>
                </div>

                {/* Submit Action Button */}
                <div className="onboard-submit-wrap">
                  <button
                    type="submit"
                    className="onboard-btn-submit"
                    disabled={isSubmitting}
                  >
                    <span>{isSubmitting ? 'Configuring Workspace Profile...' : 'Proceed to Step 2: Marketing Budget'}</span>
                    <ArrowRight size={18} className="onboard-arrow-icon" />
                  </button>
                </div>

              </form>
            </main>

          </div>
        )}

      </div>
    </div>
  );
}
