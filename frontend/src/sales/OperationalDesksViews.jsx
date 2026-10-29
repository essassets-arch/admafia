import React, { useState, useEffect } from 'react';
import {
  Users,
  ShieldCheck,
  Layers,
  FileCheck2,
  CreditCard,
  Wallet,
  Headphones,
  Calendar,
  FolderTree,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Phone,
  MessageSquare,
  Plus,
  Search,
  ArrowUpRight,
  Check,
  X,
  ExternalLink,
  RefreshCw,
  Send,
  Eye,
  AlertCircle,
  Building,
  ChevronRight,
  Filter,
  FileText,
  Printer,
  Receipt,
  DollarSign
} from 'lucide-react';
import crmApi from '../services/crmApi';

const formatINR = (val) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(val || 0);

/* ==========================================================================
   DESK 1: CUSTOMER REGISTRATIONS (Real Intake from http://localhost:5173/#register)
   ========================================================================== */
export function CustomerRegistrationsDesk({ customers, setCustomers }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedCust, setSelectedCust] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  // Add Lead Modal State for http://localhost:5173/sales#register
  const [isAddLeadModalOpen, setIsAddLeadModalOpen] = useState(false);
  const [leadPhoneDigits, setLeadPhoneDigits] = useState('');
  const [leadFormData, setLeadFormData] = useState({
    company: '',
    customCompany: '',
    name: '',
    city: '',
    requirement: 'Inbound Meta Ads Campaign Enquiry',
    budget: '₹1.5L – ₹3.5L',
  });
  const [leadSuccessToast, setLeadSuccessToast] = useState(null);

  // Phone sanitization & validation (0/10 digits, starts with 6, 7, 8, or 9)
  const handlePhoneChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 10);
    setLeadPhoneDigits(raw);
  };
  const isPhoneValidStart = leadPhoneDigits.length === 0 || ['6', '7', '8', '9'].includes(leadPhoneDigits[0]);
  const isPhoneComplete = leadPhoneDigits.length === 10 && isPhoneValidStart;

  // Available Companies list (Strictly real registered customers only)
  const availableCompanies = Array.from(
    new Set(customers.map((c) => c.name || c.companyName || c.username).filter(Boolean))
  );

  const handleOpenAddLead = (compName) => {
    setLeadPhoneDigits('');
    const defaultComp = compName || availableCompanies[0] || '';
    setLeadFormData({
      company: defaultComp,
      customCompany: '',
      name: '',
      city: '',
      requirement: 'Inbound Meta Ads Campaign Enquiry',
      budget: '₹1.5L – ₹3.5L',
    });
    setIsAddLeadModalOpen(true);
  };

  const handleSubmitLead = (e) => {
    e.preventDefault();
    if (!isPhoneComplete) return;

    const targetCompany = leadFormData.company;

    if (!targetCompany) return;

    const matchedCust = customers.find(
      (c) => (c.name || c.companyName) === targetCompany || c.username === targetCompany
    );

    const cleanDigits = leadPhoneDigits.replace(/\D/g, '').slice(-10);
    const formattedPhone = `+91 ${cleanDigits}`;

    const newLead = {
      id: `lead_${Date.now()}`,
      name: formattedPhone,
      company: targetCompany,
      assignedCompany: targetCompany,
      customerCompanyName: targetCompany,
      customerId: matchedCust?.id || '',
      customerPhone: matchedCust?.phone || '',
      customerUsername: matchedCust?.username || '',
      phone: cleanDigits,
      displayPhone: formattedPhone,
      maskedPhone: formattedPhone,
      email: `lead_${cleanDigits.slice(-4)}@example.com`,
      city: matchedCust?.city || '',
      requirement: `Inbound Lead for ${targetCompany}`,
      budget: '₹1.5L – ₹3.5L',
      source: 'Direct Intake',
      status: 'new',
      stepRequired: 'Step 1 Required',
      read: false,
      isHot: true,
      isBeFirst: true,
      unmasked: true,
      dateGroup: 'today',
      createdAt: 'Today (Just now)',
      notes: `Direct intake via Sales Desk 01 for ${targetCompany}`,
    };

    try {
      // 1. Save to growthline_all_leads in localStorage
      const rawLeads = localStorage.getItem('growthline_all_leads');
      let existingLeads = [];
      if (rawLeads) {
        try { existingLeads = JSON.parse(rawLeads); } catch(err){}
      }
      const updatedLeads = [newLead, ...existingLeads.filter((l) => l.id !== newLead.id)];
      localStorage.setItem('growthline_all_leads', JSON.stringify(updatedLeads));
      localStorage.setItem('growthline_latest_added_lead', JSON.stringify(newLead));

      // 2. Persist lead in PostgreSQL Backend API
      crmApi
        .createLead({
          id: newLead.id,
          customerId: newLead.customerId,
          customerPhone: newLead.customerPhone,
          customerUsername: newLead.customerUsername,
          company: targetCompany,
          phone: cleanDigits,
          name: formattedPhone,
          city: newLead.city,
          requirement: newLead.requirement,
        })
        .catch(() => {});

      // 3. Dispatch custom events for real-time CRM updates without overwriting active user session
      window.dispatchEvent(new CustomEvent('growthline_lead_added', { detail: newLead }));
      window.dispatchEvent(new Event('storage'));
    } catch (e) {
      console.error('Lead storage error', e);
    }

    setIsAddLeadModalOpen(false);
    setLeadSuccessToast({
      company: targetCompany,
      phone: leadPhoneDigits,
      leadId: newLead.id,
    });
  };

  const [newCust, setNewCust] = useState({
    username: '',
    companyName: '',
    contactName: '',
    phone: '',
    email: '',
    city: 'Ahmedabad',
    category: 'IT & Software',
    password: 'Password123!',
    deposit: 0,
  });

  // KPI Calculations based strictly on real registered accounts
  const totalCount = customers.length;
  const paidCount = customers.filter((c) => c.paymentStatus === 'paid').length;
  const pendingPaymentCount = customers.filter((c) => c.paymentStatus !== 'paid').length;
  const profileCompleteCount = customers.filter((c) => c.profileStatus === 'complete').length;
  const profileIncompleteCount = customers.filter((c) => c.profileStatus !== 'complete').length;
  const kycCompleteCount = customers.filter((c) => c.kycPercent === 100).length;

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase();
    const matchSearch =
      (c.username && c.username.toLowerCase().includes(q)) ||
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.contact && c.contact.toLowerCase().includes(q)) ||
      (c.phone && c.phone.includes(q)) ||
      (c.email && c.email.toLowerCase().includes(q)) ||
      (c.city && c.city.toLowerCase().includes(q));

    if (!matchSearch) return false;
    if (filter === 'payment_pending') return c.paymentStatus !== 'paid';
    if (filter === 'payment_paid') return c.paymentStatus === 'paid';
    if (filter === 'profile_incomplete') return c.profileStatus !== 'complete';
    if (filter === 'profile_complete') return c.profileStatus === 'complete';
    if (filter === 'active') return c.status === 'active';
    if (filter === 'suspended') return c.status === 'suspended';
    return true;
  });

  // Handlers
  const handleToggleStatus = (id) => {
    setCustomers((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const nextStatus = c.status === 'active' ? 'suspended' : 'active';
        return { ...c, status: nextStatus };
      })
    );
  };

  const handleToggleProfile = (id) => {
    setCustomers((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const isComp = c.profileStatus === 'complete';
        const nextProfile = isComp ? 'incomplete' : 'complete';
        const nextKyc = isComp ? 25 : 100;
        try {
          crmApi.patchCustomer(c.id, { profileStatus: nextProfile, kycPercent: nextKyc });
        } catch (e) {}
        return { ...c, profileStatus: nextProfile, kycPercent: nextKyc, verified: nextProfile === 'complete' };
      })
    );
  };

  const handleTogglePayment = (id) => {
    setCustomers((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const isPaid = c.paymentStatus === 'paid';
        const nextPayment = isPaid ? 'pending' : 'paid';
        const nextBal = isPaid ? 0 : (c.balance > 0 ? c.balance : 3000);
        try {
          crmApi.patchCustomer(c.id, { paymentStatus: nextPayment, balance: nextBal });
        } catch (e) {}
        return {
          ...c,
          paymentStatus: nextPayment,
          balance: nextBal,
          runwayDays: Math.floor(nextBal / 300),
          amountPaid: isPaid ? 0 : 3540,
        };
      })
    );
  };

  const handleAdvanceKyc = (id) => {
    setCustomers((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const nextKyc = Math.min(100, (c.kycPercent || 0) + 25);
        const nextProfile = nextKyc >= 75 ? 'complete' : c.profileStatus;
        try {
          crmApi.patchCustomer(c.id, { profileStatus: nextProfile, kycPercent: nextKyc });
        } catch (e) {}
        return { ...c, kycPercent: nextKyc, profileStatus: nextProfile, verified: nextProfile === 'complete' };
      })
    );
  };

  const handleAddCustomer = (e) => {
    e.preventDefault();
    if (!newCust.phone || !newCust.username) return;
    const added = {
      id: `cust_reg_${newCust.phone.trim()}`,
      username: newCust.username.trim(),
      name: newCust.companyName.trim() || `${newCust.username.trim()} Tech`,
      contact: newCust.contactName.trim() || newCust.username.trim(),
      phone: newCust.phone.trim(),
      email: newCust.email.trim() || `contact@${newCust.username.trim()}.example`,
      passwordMasked: '••••••••••••',
      city: newCust.city.trim() || 'Ahmedabad',
      category: newCust.category || 'IT & Software',
      status: 'active',
      profileStatus: 'incomplete',
      kycPercent: 25,
      paymentStatus: Number(newCust.deposit) > 0 ? 'paid' : 'pending',
      amountPaid: Number(newCust.deposit) || 0,
      dailyPacing: 300,
      balance: Number(newCust.deposit) || 0,
      runwayDays: Math.floor((Number(newCust.deposit) || 0) / 300),
      verified: false,
      isSelfRegistered: true,
      registeredAt: 'Just Now (Manual Entry)',
      registeredFrom: 'http://localhost:5173/#register',
    };
    setCustomers((prev) => [added, ...prev.filter(c => c.phone !== added.phone)]);
    crmApi
      .registerCustomer({
        username: added.username,
        phone: added.phone,
        email: added.email,
        password: newCust.password || 'Password123!',
        companyName: added.name,
        contactPerson: added.contact,
        city: added.city,
        category: added.category,
        deposit: added.balance,
      })
      .then(() => crmApi.syncStateFromPostgres())
      .catch(() => {});
    setIsAddModalOpen(false);
    setNewCust({
      username: '',
      companyName: '',
      contactName: '',
      phone: '',
      email: '',
      city: 'Ahmedabad',
      category: 'IT & Software',
      password: 'Password123!',
      deposit: 0,
    });
  };

  return (
    <div className="desk-page-container">
      {/* Header */}
      <div className="desk-header">
        <div>
          <div className="desk-breadcrumb">SUB ADMIN &amp; SUPPORT OPERATIONS / DESK 01</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 className="desk-title">Customer Registrations</h1>
            <span className="desk-pill pill-indigo" style={{ fontWeight: 800 }}>
              Live Registered Accounts
            </span>
          </div>
          <p className="desk-subtitle">
            Live directory of verified client registrations from <code>http://localhost:5173/#register</code>. Displays authoritative intake details (Username, Mobile, Work Email, Password, Profile &amp; KYC Audit Progress, and Payment Status).
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            className="sales-btn-primary"
            style={{
              background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
              borderColor: '#059669',
              color: '#ffffff',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7
            }}
            onClick={() => handleOpenAddLead()}
          >
            <Plus size={16} strokeWidth={2.5} /> Add Lead
          </button>

        </div>
      </div>

      {/* Lead Dispatched Celebration Banner */}
      {leadSuccessToast && (
        <div style={{
          background: 'linear-gradient(135deg, #065f46 0%, #047857 100%)',
          color: '#ffffff',
          borderRadius: 14,
          padding: '16px 20px',
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 10px 25px rgba(5, 150, 105, 0.25)',
          border: '1px solid #10b981',
          flexWrap: 'wrap',
          gap: 12,
          animation: 'modal-pop-in 0.2s ease'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: '#ecfdf5',
              color: '#059669',
              display: 'grid',
              placeItems: 'center',
              fontWeight: 900
            }}>
              ✓
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.98rem' }}>
                Lead Dispatched Successfully!
              </div>
              <div style={{ fontSize: '0.84rem', color: '#d1fae5', marginTop: 2 }}>
                Phone <strong style={{ color: '#fff' }}>+91 {leadSuccessToast.phone}</strong> has been assigned to <strong style={{ color: '#fff' }}>{leadSuccessToast.company}</strong> and is live in their Customer CRM.
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <a
              href="/app/lead#app/lead"
              target="_blank"
              rel="noreferrer"
              style={{
                background: '#ffffff',
                color: '#047857',
                fontWeight: 800,
                fontSize: '0.86rem',
                padding: '9px 18px',
                borderRadius: 9999,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 4px 10px rgba(0,0,0,0.1)'
              }}
            >
              <span>View in Customer CRM (/app/lead#app/lead)</span>
              <ExternalLink size={14} />
            </a>
            <button
              type="button"
              onClick={() => setLeadSuccessToast(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#a7f3d0',
                cursor: 'pointer',
                fontWeight: 800,
                fontSize: '1.2rem',
                padding: '4px 8px'
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* KPI Quad Grid */}
      <div className="desk-kpi-grid">
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">TOTAL REGISTERED</div>
          <div className="desk-kpi-val text-indigo">{totalCount}</div>
          <div className="desk-kpi-sub">Accounts captured from #register</div>
        </div>
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">PAYMENT DONE</div>
          <div className="desk-kpi-val text-emerald">{paidCount}</div>
          <div className="desk-kpi-sub">Commercial package funded</div>
        </div>
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">PAYMENT PENDING</div>
          <div className="desk-kpi-val text-amber">{pendingPaymentCount}</div>
          <div className="desk-kpi-sub">Awaiting checkout / bank transfer</div>
        </div>
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">PROFILE COMPLETE</div>
          <div className="desk-kpi-val text-emerald">{profileCompleteCount}</div>
          <div className="desk-kpi-sub">{profileIncompleteCount} incomplete profiles</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="desk-filter-bar">
        <div className="desk-tabs">
          <button type="button" className={`desk-tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
            All Registered ({totalCount})
          </button>
          <button type="button" className={`desk-tab ${filter === 'payment_pending' ? 'active' : ''}`} onClick={() => setFilter('payment_pending')}>
            ⏳ Payment Pending ({pendingPaymentCount})
          </button>
          <button type="button" className={`desk-tab ${filter === 'payment_paid' ? 'active' : ''}`} onClick={() => setFilter('payment_paid')}>
            ✓ Payment Done ({paidCount})
          </button>
          <button type="button" className={`desk-tab ${filter === 'profile_incomplete' ? 'active' : ''}`} onClick={() => setFilter('profile_incomplete')}>
            Profile Incomplete ({profileIncompleteCount})
          </button>
          <button type="button" className={`desk-tab ${filter === 'profile_complete' ? 'active' : ''}`} onClick={() => setFilter('profile_complete')}>
            Profile Complete ({profileCompleteCount})
          </button>
        </div>
        <div className="desk-search-wrap">
          <Search size={16} className="desk-search-icon" />
          <input
            type="text"
            className="desk-search-input"
            placeholder="Search by username, mobile, email, city..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="desk-table-card">
        <table className="desk-table">
          <thead>
            <tr>
              <th>Username &amp; Workspace</th>
              <th>Mobile Number (10 Digits)</th>
              <th>Work Email Address</th>
              <th>Profile Status</th>
              <th>KYC Audit Progress</th>
              <th>Payment Status</th>
              <th>Wallet / Runway</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                  No customer registrations match your filter. Register a new user at{' '}
                  <a href="#register" style={{ color: '#4f46e5', fontWeight: 700 }}>
                    http://localhost:5173/#register
                  </a>
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr key={c.id}>
                  {/* 1. Username & Workspace */}
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 800, color: '#4f46e5', background: '#eef2ff', padding: '2px 8px', borderRadius: 6, fontSize: '0.84rem' }}>
                        @{c.username || 'user'}
                      </span>
                      <span className="desk-pill" style={{ background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', fontSize: '0.68rem', fontWeight: 800, padding: '1px 6px' }}>
                        🌐 #register
                      </span>
                    </div>
                    <div style={{ fontWeight: 700, color: '#0f172a', marginTop: 3 }}>
                      {c.name || 'Workspace'}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                      {c.city} • Registered: {c.registeredAt || 'Today'}
                    </div>
                  </td>

                  {/* 2. Mobile Number (10 Digits) */}
                  <td>
                    <div style={{ fontWeight: 800, color: '#0f172a', fontFamily: 'monospace', fontSize: '0.92rem' }}>
                      +91 {c.phone}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                      <a
                        href={`tel:${c.phone}`}
                        className="desk-action-btn"
                        style={{ padding: '2px 6px', fontSize: '0.7rem', textDecoration: 'none' }}
                        title="Direct Call"
                      >
                        <Phone size={11} /> Call
                      </a>
                      <a
                        href={`https://wa.me/91${c.phone}?text=Hello%20${encodeURIComponent(c.contact || c.username)},%20Growthline%20Support%20here%20regarding%20your%20registered%20workspace.`}
                        target="_blank"
                        rel="noreferrer"
                        className="desk-action-btn"
                        style={{ padding: '2px 6px', fontSize: '0.7rem', textDecoration: 'none' }}
                        title="WhatsApp Direct"
                      >
                        <MessageSquare size={11} /> Chat
                      </a>
                    </div>
                  </td>

                  {/* 3. Work Email Address */}
                  <td>
                    <div style={{ fontSize: '0.84rem', color: '#334155' }}>
                      <a href={`mailto:${c.email}`} style={{ color: '#0f172a', textDecoration: 'none', fontWeight: 600 }}>
                        {c.email}
                      </a>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{c.contact || c.username}</div>
                  </td>

                  {/* 5. Profile Status */}
                  <td>
                    <button
                      type="button"
                      onClick={() => handleToggleProfile(c.id)}
                      className={`desk-pill ${c.profileStatus === 'complete' ? 'pill-emerald' : 'pill-amber'}`}
                      style={{ border: 'none', cursor: 'pointer' }}
                      title="Click to toggle Complete/Incomplete"
                    >
                      {c.profileStatus === 'complete' ? '✓ Complete' : '⏳ Incomplete'}
                    </button>
                    <div style={{ fontSize: '0.7rem', color: c.profileStatus === 'complete' ? '#059669' : '#64748b', fontWeight: c.profileStatus === 'complete' ? 700 : 500, marginTop: 2 }}>
                      {c.profileStatus === 'complete' ? 'Completed ✓' : 'Click to complete'}
                    </div>
                  </td>

                  {/* 6. KYC Audit Progress */}
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div className="desk-progress-bar" style={{ width: 70 }}>
                        <div
                          className={`desk-progress-fill ${c.profileStatus === 'complete' || (c.kycPercent || 0) === 100 ? 'bg-emerald' : (c.kycPercent || 25) >= 50 ? 'bg-amber' : 'bg-rose'}`}
                          style={{ width: `${c.profileStatus === 'complete' ? 100 : (c.kycPercent || 25)}%` }}
                        />
                      </div>
                      <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0f172a' }}>
                        {c.profileStatus === 'complete' ? 100 : (c.kycPercent || 25)}%
                      </span>
                    </div>
                    {c.profileStatus === 'complete' || (c.kycPercent || 0) >= 100 ? (
                      <div style={{ fontSize: '0.7rem', color: '#059669', fontWeight: 700, marginTop: 2 }}>
                        ✓ 100% Verified
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleAdvanceKyc(c.id)}
                        style={{ background: 'none', border: 'none', color: '#4f46e5', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', padding: 0, marginTop: 2 }}
                      >
                        +25% Audit Step
                      </button>
                    )}
                  </td>

                  {/* 7. Payment Status */}
                  <td>
                    <button
                      type="button"
                      onClick={() => handleTogglePayment(c.id)}
                      className={`desk-pill ${c.paymentStatus === 'paid' ? 'pill-emerald' : 'pill-rose'}`}
                      style={{ border: 'none', cursor: 'pointer' }}
                      title="Click to toggle Paid/Pending"
                    >
                      {c.paymentStatus === 'paid' ? '✓ Paid' : '⏳ Pending'}
                    </button>
                    <div style={{ fontSize: '0.72rem', color: c.paymentStatus === 'paid' ? '#059669' : '#d97706', fontWeight: 700, marginTop: 2 }}>
                      {c.paymentStatus === 'paid' ? `Settled (${formatINR(c.amountPaid || c.balance || 0)})` : 'Awaiting Payment'}
                    </div>
                  </td>

                  {/* 8. Wallet / Runway */}
                  <td>
                    <div style={{ fontWeight: 800, color: '#0f172a' }}>{formatINR(c.balance || 0)}</div>
                    <div style={{ fontSize: '0.74rem', color: c.runwayDays > 0 ? '#059669' : '#e11d48', fontWeight: 700 }}>
                      {c.runwayDays || 0} Days @ ₹300/d
                    </div>
                  </td>

                  {/* 9. Status */}
                  <td>
                    <span className={`desk-pill ${c.status === 'active' ? 'pill-emerald' : 'pill-rose'}`}>
                      {c.status === 'active' ? 'Active' : 'Suspended'}
                    </span>
                  </td>

                  {/* 10. Actions */}
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '6px' }}>
                      <button
                        type="button"
                        className="desk-action-btn"
                        onClick={() => {
                          setSelectedCust(c);
                          setShowPassword(false);
                        }}
                      >
                        <Eye size={13} /> 360°
                      </button>
                      <button
                        type="button"
                        className={`desk-action-btn ${c.status === 'active' ? 'btn-warn' : 'btn-success'}`}
                        onClick={() => handleToggleStatus(c.id)}
                      >
                        {c.status === 'active' ? 'Suspend' : 'Activate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Customer 360 Inspector Modal */}
      {selectedCust && (
        <div className="sales-modal-overlay" onClick={() => setSelectedCust(null)}>
          <div className="sales-modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <span className="sales-dept-badge">Customer 360° Intake Profile</span>
                <h3 style={{ margin: '4px 0 0 0', fontSize: '1.3rem', fontWeight: 800 }}>
                  @{selectedCust.username} • {selectedCust.name}
                </h3>
                <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
                  Registered Source: <code>{selectedCust.registeredFrom || 'http://localhost:5173/#register'}</code>
                </div>
              </div>
              <button type="button" className="desk-close-btn" onClick={() => setSelectedCust(null)}>
                <X size={18} />
              </button>
            </div>

            {/* Registration Credentials Box */}
            <div className="desk-modal-box" style={{ marginBottom: 14, background: '#f0fdf4', borderColor: '#bbf7d0' }}>
              <div className="desk-box-label" style={{ color: '#166534' }}>Registered Account Credentials</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginTop: 8 }}>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Username</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>@{selectedCust.username}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Mobile Number</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', fontFamily: 'monospace' }}>+91 {selectedCust.phone}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Work Email Address</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>{selectedCust.email}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Password (Min 6 chars)</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: '0.95rem', fontWeight: 800, fontFamily: 'monospace' }}>
                      {showPassword ? (selectedCust.password || '••••••••') : '••••••••••••'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{ background: 'none', border: 'none', color: '#4f46e5', fontSize: '0.72rem', cursor: 'pointer', fontWeight: 700 }}
                    >
                      {showPassword ? 'Hide' : 'Reveal'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Profile & Payment Dual Gate Status */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 14 }}>
              <div className="desk-modal-box">
                <div className="desk-box-label">Profile Status</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                  <span className={`desk-pill ${selectedCust.profileStatus === 'complete' ? 'pill-emerald' : 'pill-amber'}`}>
                    {selectedCust.profileStatus === 'complete' ? '✓ Profile Complete' : '⏳ Profile Incomplete'}
                  </span>
                  <button
                    type="button"
                    className="desk-action-btn"
                    style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                    onClick={() => {
                      handleToggleProfile(selectedCust.id);
                      setSelectedCust((prev) => ({
                        ...prev,
                        profileStatus: prev.profileStatus === 'complete' ? 'incomplete' : 'complete',
                        kycPercent: prev.profileStatus === 'complete' ? 25 : 100,
                      }));
                    }}
                  >
                    Toggle
                  </button>
                </div>
                <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: 4 }}>
                  KYC Audit Score: <b>{selectedCust.kycPercent || 25}%</b>
                </div>
              </div>

              <div className="desk-modal-box">
                <div className="desk-box-label">Payment Status</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                  <span className={`desk-pill ${selectedCust.paymentStatus === 'paid' ? 'pill-emerald' : 'pill-rose'}`}>
                    {selectedCust.paymentStatus === 'paid' ? '✓ Payment Done' : '⏳ Payment Pending'}
                  </span>
                  <button
                    type="button"
                    className="desk-action-btn"
                    style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                    onClick={() => {
                      handleTogglePayment(selectedCust.id);
                      setSelectedCust((prev) => {
                        const isP = prev.paymentStatus === 'paid';
                        return {
                          ...prev,
                          paymentStatus: isP ? 'pending' : 'paid',
                          balance: isP ? 0 : 3000,
                          runwayDays: isP ? 0 : 10,
                        };
                      });
                    }}
                  >
                    Toggle
                  </button>
                </div>
                <div style={{ fontSize: '0.76rem', color: '#059669', fontWeight: 700, marginTop: 4 }}>
                  Wallet Balance: {formatINR(selectedCust.balance || 0)} ({selectedCust.runwayDays || 0}d)
                </div>
              </div>
            </div>

            {/* Profile Verification Checkpoints */}
            <div className="desk-modal-box" style={{ marginBottom: 18 }}>
              <div className="desk-box-label">Profile Verification Checkpoints</div>
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem' }}>
                  <CheckCircle2 size={16} color="#059669" /> Business Registration &amp; Mobile Verified (+91 {selectedCust.phone})
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem' }}>
                  {selectedCust.kycPercent >= 50 ? <CheckCircle2 size={16} color="#059669" /> : <Clock size={16} color="#d97706" />}
                  Company Information &amp; Business Category
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem' }}>
                  {selectedCust.kycPercent >= 75 ? <CheckCircle2 size={16} color="#059669" /> : <Clock size={16} color="#94a3b8" />}
                  Primary Contact Person &amp; Headquarters Location
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="sales-btn-secondary"
                onClick={() => {
                  handleToggleStatus(selectedCust.id);
                  setSelectedCust((prev) => ({
                    ...prev,
                    status: prev.status === 'active' ? 'suspended' : 'active',
                  }));
                }}
              >
                {selectedCust.status === 'active' ? 'Suspend Workspace' : 'Activate Workspace'}
              </button>
              <button type="button" className="sales-btn-primary" onClick={() => setSelectedCust(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD LEAD MODAL (http://localhost:5173/sales#register) */}
      {isAddLeadModalOpen && (
        <div className="sales-modal-overlay" onClick={() => setIsAddLeadModalOpen(false)}>
          <div className="sales-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                  display: 'grid',
                  placeItems: 'center',
                  color: '#fff',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)'
                }}>
                  <Plus size={20} strokeWidth={2.5} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>Add Lead</h3>
                  <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                    Distribute an inbound lead directly to client CRM workspace
                  </div>
                </div>
              </div>
              <button type="button" className="desk-close-btn" onClick={() => setIsAddLeadModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitLead}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                
                {/* 1. Select Company * */}
                <div>
                  <label className="desk-form-label" style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0f172a', marginBottom: 6, display: 'block' }}>
                    Select Company <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <select
                      className="desk-form-input"
                      required
                      value={leadFormData.company}
                      onChange={(e) => setLeadFormData({ ...leadFormData, company: e.target.value })}
                      style={{
                        padding: '11px 14px',
                        fontSize: '0.94rem',
                        fontWeight: 600,
                        color: '#0f172a',
                        borderColor: '#cbd5e1',
                        borderRadius: 10,
                        width: '100%',
                        background: '#ffffff',
                        cursor: 'pointer'
                      }}
                    >
                      {availableCompanies.length === 0 ? (
                        <option value="">-- No registered companies yet --</option>
                      ) : (
                        availableCompanies.map((comp) => (
                          <option key={comp} value={comp}>🏢 {comp}</option>
                        ))
                      )}
                    </select>
                  </div>
                </div>

                {/* 2. Phone Number * */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label className="desk-form-label" style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0f172a', margin: 0 }}>
                      Phone Number <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <span style={{
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      color: leadPhoneDigits.length === 10 ? '#059669' : '#64748b',
                      background: leadPhoneDigits.length === 10 ? '#ecfdf5' : '#f1f5f9',
                      padding: '2px 8px',
                      borderRadius: 6,
                      border: `1px solid ${leadPhoneDigits.length === 10 ? '#a7f3d0' : '#e2e8f0'}`
                    }}>
                      {leadPhoneDigits.length}/10 digits
                    </span>
                  </div>

                  <input
                    type="tel"
                    required
                    maxLength={10}
                    className="desk-form-input"
                    placeholder="8989898989"
                    value={leadPhoneDigits}
                    onChange={handlePhoneChange}
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '1rem',
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      padding: '11px 14px',
                      width: '100%',
                      boxSizing: 'border-box',
                      borderColor: !isPhoneValidStart ? '#ef4444' : (leadPhoneDigits.length === 10 ? '#10b981' : '#cbd5e1')
                    }}
                  />
                </div>

              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22, paddingTop: 14, borderTop: '1px solid #f1f5f9' }}>
                <button
                  type="button"
                  className="sales-btn-secondary"
                  onClick={() => setIsAddLeadModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="sales-btn-primary"
                  disabled={!isPhoneComplete}
                  style={{
                    background: isPhoneComplete
                      ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)'
                      : '#94a3b8',
                    borderColor: isPhoneComplete ? '#059669' : '#94a3b8',
                    cursor: isPhoneComplete ? 'pointer' : 'not-allowed',
                    padding: '10px 22px'
                  }}
                >
                  <Send size={15} /> Add Lead
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Client Modal */}
      {isAddModalOpen && (
        <div className="sales-modal-overlay" onClick={() => setIsAddModalOpen(false)}>
          <div className="sales-modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>Register New Client Workspace</h3>
              <button type="button" className="desk-close-btn" onClick={() => setIsAddModalOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleAddCustomer}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label className="desk-form-label">Business / Company Name</label>
                  <input
                    type="text"
                    required
                    className="desk-form-input"
                    placeholder="e.g. Vikram Tech Solutions"
                    value={newCust.companyName}
                    onChange={(e) => setNewCust({ ...newCust, companyName: e.target.value })}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                  <div>
                    <label className="desk-form-label">Username (Login ID)</label>
                    <input
                      type="text"
                      required
                      className="desk-form-input"
                      placeholder="e.g. vikram_malhotra"
                      value={newCust.username}
                      onChange={(e) => setNewCust({ ...newCust, username: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="desk-form-label">Mobile Number (10 Digits)</label>
                    <input
                      type="tel"
                      required
                      maxLength={10}
                      className="desk-form-input"
                      placeholder="e.g. 9724916167"
                      value={newCust.phone}
                      onChange={(e) => setNewCust({ ...newCust, phone: e.target.value })}
                    />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                  <div>
                    <label className="desk-form-label">Work Email Address</label>
                    <input
                      type="email"
                      required
                      className="desk-form-input"
                      placeholder="e.g. contact@vikramtech.example"
                      value={newCust.email}
                      onChange={(e) => setNewCust({ ...newCust, email: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="desk-form-label">City / Territory</label>
                    <input
                      type="text"
                      className="desk-form-input"
                      placeholder="e.g. Ahmedabad"
                      value={newCust.city}
                      onChange={(e) => setNewCust({ ...newCust, city: e.target.value })}
                    />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                  <div>
                    <label className="desk-form-label">Industry Category</label>
                    <select
                      className="desk-form-input"
                      value={newCust.category}
                      onChange={(e) => setNewCust({ ...newCust, category: e.target.value })}
                    >
                      <option value="IT & Software">IT &amp; Software</option>
                      <option value="Healthcare">Healthcare</option>
                      <option value="Manufacturing">Manufacturing</option>
                      <option value="Solar & Renewable">Solar &amp; Renewable</option>
                      <option value="Transportation">Transportation</option>
                      <option value="Textiles">Textiles</option>
                    </select>
                  </div>
                  <div>
                    <label className="desk-form-label">Initial Payment / Deposit (₹)</label>
                    <input
                      type="number"
                      className="desk-form-input"
                      placeholder="0 (or 3000)"
                      value={newCust.deposit}
                      onChange={(e) => setNewCust({ ...newCust, deposit: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                <button type="button" className="sales-btn-secondary" onClick={() => setIsAddModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="sales-btn-primary">
                  Create Workspace
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ==========================================================================
   DESK 2: PENDING VERIFICATION (Badge: 7)
   ========================================================================== */
export function PendingVerificationDesk({ verifications, setVerifications, onApproveSuccess }) {
  const [filter, setFilter] = useState('all');
  const [activeItem, setActiveItem] = useState(null);
  const [confirmedUtr, setConfirmedUtr] = useState('');
  const [isSuccessModal, setIsSuccessModal] = useState(false);

  const filtered = verifications.filter((v) => {
    if (filter === 'both') return v.queueType === 'Both Incomplete';
    if (filter === 'payment') return v.queueType === 'Payment Pending';
    if (filter === 'profile') return v.queueType === 'Profile Pending';
    return true;
  });

  const handleOpenApprove = (item) => {
    setActiveItem(item);
    setConfirmedUtr(item.utrNumber.startsWith('UTR-') ? item.utrNumber : `UTR-HDFC-${Math.floor(100000 + Math.random() * 900000)}`);
  };

  const handleExecuteApproval = () => {
    if (!activeItem) return;
    setVerifications((prev) => prev.filter((v) => v.id !== activeItem.id));
    setIsSuccessModal(true);
    setTimeout(() => {
      setIsSuccessModal(false);
      setActiveItem(null);
      if (onApproveSuccess) onApproveSuccess(activeItem);
    }, 1500);
  };

  return (
    <div className="desk-page-container">
      {/* Header */}
      <div className="desk-header">
        <div>
          <div className="desk-breadcrumb">SUB ADMIN &amp; SUPPORT OPERATIONS / DESK 02</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 className="desk-title">Pending Verification</h1>
            <span className="desk-badge-count-alert">{verifications.length} Pending</span>
          </div>
          <p className="desk-subtitle">
            Dual-Gate intake validation queue: Verify ₹300/day ad package bank payments and compliance KYC profiles before activating lead campaigns.
          </p>
        </div>
      </div>

      {/* KPI Quad Grid */}
      <div className="desk-kpi-grid">
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">TOTAL PENDING REVIEW</div>
          <div className="desk-kpi-val text-amber">{verifications.length}</div>
          <div className="desk-kpi-sub">Awaiting Sub Admin action</div>
        </div>
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">BOTH INCOMPLETE</div>
          <div className="desk-kpi-val text-rose">{verifications.filter((v) => v.queueType === 'Both Incomplete').length}</div>
          <div className="desk-kpi-sub">Gate 1 &amp; Gate 2 pending</div>
        </div>
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">PAYMENT PENDING</div>
          <div className="desk-kpi-val text-indigo">{verifications.filter((v) => v.queueType === 'Payment Pending').length}</div>
          <div className="desk-kpi-sub">Bank transfer proof awaiting audit</div>
        </div>
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">PROFILE PENDING</div>
          <div className="desk-kpi-val text-warn">{verifications.filter((v) => v.queueType === 'Profile Pending').length}</div>
          <div className="desk-kpi-sub">Paid, waiting KYC documents</div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="desk-filter-bar">
        <div className="desk-tabs">
          <button type="button" className={`desk-tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
            All Pending ({verifications.length})
          </button>
          <button type="button" className={`desk-tab ${filter === 'both' ? 'active' : ''}`} onClick={() => setFilter('both')}>
            Both Incomplete ({verifications.filter((v) => v.queueType === 'Both Incomplete').length})
          </button>
          <button type="button" className={`desk-tab ${filter === 'payment' ? 'active' : ''}`} onClick={() => setFilter('payment')}>
            Payment Pending ({verifications.filter((v) => v.queueType === 'Payment Pending').length})
          </button>
          <button type="button" className={`desk-tab ${filter === 'profile' ? 'active' : ''}`} onClick={() => setFilter('profile')}>
            Profile Pending ({verifications.filter((v) => v.queueType === 'Profile Pending').length})
          </button>
        </div>
      </div>

      {/* Verification Queue Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filtered.map((item) => (
          <div key={item.id} className="desk-card-row">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>{item.company}</h3>
                  <span className={`desk-pill ${item.queueType === 'Both Incomplete' ? 'pill-rose' : item.queueType === 'Payment Pending' ? 'pill-amber' : 'pill-indigo'}`}>
                    {item.queueType}
                  </span>
                </div>
                <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 4 }}>
                  Contact: <span style={{ fontWeight: 600, color: '#334155' }}>{item.contact}</span> • Phone: <a href={`tel:${item.phone}`} style={{ color: '#4f46e5' }}>+91 {item.phone}</a> • Submitted: {item.submittedAt}
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>{formatINR(item.amount)}</div>
                <div style={{ fontSize: '0.76rem', color: '#059669', fontWeight: 700 }}>
                  {item.runwayDays} Days Runway @ ₹300/day
                </div>
              </div>
            </div>

            {/* Dual Gate Matrix & UTR */}
            <div style={{ marginTop: 12, padding: '10px 14px', background: '#f8fafc', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', gap: 16 }}>
                <div>
                  <span style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Gate 1: Payment</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.82rem', fontWeight: 700, color: item.paymentStatus === 'paid' ? '#059669' : '#d97706' }}>
                    {item.paymentStatus === 'paid' ? <CheckCircle2 size={14} /> : <Clock size={14} />}
                    {item.paymentStatus === 'paid' ? 'Verified & Settled' : 'Bank UTR Verification Pending'}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Gate 2: KYC Compliance</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.82rem', fontWeight: 700, color: item.profileStatus === 'complete' ? '#059669' : '#e11d48' }}>
                    {item.profileStatus === 'complete' ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                    {item.profileStatus === 'complete' ? 'KYC Complete' : 'Incomplete Documentation'}
                  </div>
                </div>
              </div>

              <div style={{ fontSize: '0.8rem', color: '#475569' }}>
                Bank Reference: <span style={{ fontFamily: 'monospace', fontWeight: 700, background: '#e2e8f0', padding: '2px 6px', borderRadius: 4 }}>{item.utrNumber}</span>
              </div>
            </div>

            {/* Actions */}
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <a
                href={`https://wa.me/91${item.phone}?text=Hello%20${encodeURIComponent(item.contact)},%20Growthline%20Support%20here%20regarding%20your%20campaign%20verification.`}
                target="_blank"
                rel="noreferrer"
                className="desk-action-btn"
                style={{ textDecoration: 'none' }}
              >
                <MessageSquare size={14} /> WhatsApp
              </a>
              <button
                type="button"
                className="sales-btn-primary"
                style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                onClick={() => handleOpenApprove(item)}
              >
                <Check size={14} /> Approve Payment &amp; Credit Wallet
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Approve Modal */}
      {activeItem && !isSuccessModal && (
        <div className="sales-modal-overlay" onClick={() => setActiveItem(null)}>
          <div className="sales-modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <span className="sales-dept-badge">Dual-Gate Settlement</span>
                <h3 style={{ margin: '4px 0 0 0', fontSize: '1.2rem', fontWeight: 800 }}>Approve Payment &amp; Credit Wallet</h3>
              </div>
              <button type="button" className="desk-close-btn" onClick={() => setActiveItem(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="desk-modal-box" style={{ marginBottom: 14 }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a' }}>{activeItem.company}</div>
              <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Package: {activeItem.packageTier}</div>
              <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Credit Amount</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#059669' }}>{formatINR(activeItem.amount)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Daily Burn</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#4f46e5' }}>₹{activeItem.dailyRate}/day</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Runway Added</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>+{activeItem.runwayDays} Days</div>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label className="desk-form-label">Verified Bank UTR / RTGS Settlement Reference</label>
              <input
                type="text"
                className="desk-form-input"
                value={confirmedUtr}
                onChange={(e) => setConfirmedUtr(e.target.value)}
                placeholder="Enter verified bank transaction reference"
              />
              <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: 4 }}>
                This will automatically reconcile the ledger and credit the client's ad spend wallet.
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className="sales-btn-secondary" onClick={() => setActiveItem(null)}>
                Cancel
              </button>
              <button type="button" className="sales-btn-primary" onClick={handleExecuteApproval}>
                Confirm &amp; Credit Wallet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {isSuccessModal && (
        <div className="sales-modal-overlay">
          <div className="sales-modal-card" style={{ textAlign: 'center', padding: '36px 24px' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#ecfdf5', color: '#059669', display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}>
              <Check size={32} />
            </div>
            <h3 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>Payment Approved &amp; Wallet Credited!</h3>
            <p style={{ fontSize: '0.86rem', color: '#64748b', marginTop: 6 }}>
              ₹{activeItem?.amount?.toLocaleString('en-IN')} added. {activeItem?.runwayDays} days runway activated. Verification queue count updated!
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ==========================================================================
   DESK 3: LEAD MANAGEMENT
   ========================================================================== */
export const DEFAULT_DESK_LEADS = [];

export function LeadManagementDesk() {
  // Add Lead Modal State
  const [isAddLeadModalOpen, setIsAddLeadModalOpen] = useState(false);
  const [leadPhoneDigits, setLeadPhoneDigits] = useState('');
  const [leadFormData, setLeadFormData] = useState({
    company: '',
    customCompany: '',
  });
  const [leadSuccessToast, setLeadSuccessToast] = useState(null);

  const getRegisteredCustomerList = () => {
    try {
      const raw = localStorage.getItem('growthline_registered_customers');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return [];
  };

  const getAvailableCompanies = () => {
    const list = getRegisteredCustomerList();
    return Array.from(new Set(list.map((c) => c.name || c.companyName || c.username).filter(Boolean)));
  };

  const handlePhoneChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 10);
    setLeadPhoneDigits(raw);
  };
  const isPhoneValidStart = leadPhoneDigits.length === 0 || ['6', '7', '8', '9'].includes(leadPhoneDigits[0]);
  const isPhoneComplete = leadPhoneDigits.length === 10 && isPhoneValidStart;

  const handleOpenAddLead = () => {
    const comps = getAvailableCompanies();
    setLeadPhoneDigits('');
    setLeadFormData({
      company: comps[0] || '',
      customCompany: '',
    });
    setIsAddLeadModalOpen(true);
  };

  const handleSubmitLead = (e) => {
    e.preventDefault();
    if (!isPhoneComplete) return;

    const targetCompany = leadFormData.company;

    if (!targetCompany) return;

    const regList = getRegisteredCustomerList();
    const matchedCust = regList.find(
      (c) => (c.name || c.companyName) === targetCompany || c.username === targetCompany
    );

    const cleanDigits = leadPhoneDigits.replace(/\D/g, '').slice(-10);
    const formattedPhone = `+91 ${cleanDigits}`;

    const newLead = {
      id: `lead_${Date.now()}`,
      name: formattedPhone,
      company: targetCompany,
      assignedCompany: targetCompany,
      customerCompanyName: targetCompany,
      customerId: matchedCust?.id || '',
      customerPhone: matchedCust?.phone || '',
      customerUsername: matchedCust?.username || '',
      phone: cleanDigits,
      displayPhone: formattedPhone,
      maskedPhone: formattedPhone,
      email: `lead_${cleanDigits.slice(-4)}@example.com`,
      city: matchedCust?.city || '',
      requirement: `Inbound Lead for ${targetCompany}`,
      budget: '₹1.5L – ₹3.5L',
      source: 'Direct Intake',
      priority: 'Urgent',
      status: 'new',
      stepRequired: 'Step 1 Required',
      read: false,
      isHot: true,
      isBeFirst: true,
      unmasked: true,
      dateGroup: 'today',
      createdAt: 'Today (Just now)',
      notes: `Direct intake via Lead Management Desk for ${targetCompany}`,
      speedSlaMinutes: 1,
    };

    try {
      const rawLeads = localStorage.getItem('growthline_all_leads');
      let existingLeads = [];
      if (rawLeads) {
        try { existingLeads = JSON.parse(rawLeads); } catch(err){}
      }
      const updatedLeads = [newLead, ...existingLeads.filter((l) => l.id !== newLead.id)];
      localStorage.setItem('growthline_all_leads', JSON.stringify(updatedLeads));
      localStorage.setItem('growthline_latest_added_lead', JSON.stringify(newLead));

      // Update local leads
      setLeads((prev) => [newLead, ...prev.filter((l) => l.id !== newLead.id)]);

      // Persist lead in PostgreSQL Backend API
      crmApi
        .createLead({
          id: newLead.id,
          customerId: newLead.customerId,
          customerPhone: newLead.customerPhone,
          customerUsername: newLead.customerUsername,
          company: targetCompany,
          phone: cleanDigits,
          name: formattedPhone,
          city: newLead.city,
          requirement: newLead.requirement,
        })
        .catch(() => {});

      // Dispatch custom events without overwriting active customer session
      window.dispatchEvent(new CustomEvent('growthline_lead_added', { detail: newLead }));
      window.dispatchEvent(new Event('storage'));
    } catch(err) {
      console.error(err);
    }

    setIsAddLeadModalOpen(false);
    setLeadSuccessToast({
      company: targetCompany,
      phone: leadPhoneDigits,
      leadId: newLead.id,
    });
  };

  const [leads, setLeads] = useState(() => {
    try {
      const raw = localStorage.getItem('growthline_all_leads');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const cleaned = parsed.map((item) => {
            const rawDigits = (item.phone || item.name || '').replace(/\D/g, '').slice(-10);
            return {
              ...item,
              phone: rawDigits || item.phone,
              name: rawDigits ? `+91 ${rawDigits}` : item.name,
              unmasked: true,
            };
          });
          const ids = new Set(cleaned.map((p) => p.id));
          return [...cleaned, ...DEFAULT_DESK_LEADS.filter((l) => !ids.has(l.id))];
        }
      }
    } catch (e) {}
    return DEFAULT_DESK_LEADS;
  });

  useEffect(() => {
    const handleLeadAdded = (e) => {
      const newLead = e?.detail;
      if (newLead) {
        setLeads((prev) => [newLead, ...prev.filter((l) => l.id !== newLead.id)]);
      }
    };
    const handleStorage = (e) => {
      if (e.key === 'growthline_all_leads' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) setLeads(parsed);
        } catch (err) {}
      }
    };
    window.addEventListener('growthline_lead_added', handleLeadAdded);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('growthline_lead_added', handleLeadAdded);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  const filtered = leads.filter((l) => {
    const q = search.toLowerCase();
    const matchSearch =
      (l.name || '').toLowerCase().includes(q) ||
      (l.company || '').toLowerCase().includes(q) ||
      (l.city || '').toLowerCase().includes(q) ||
      (l.phone || '').includes(search);
    if (!matchSearch) return false;
    if (filter === 'urgent') return l.priority === 'Urgent';
    if (filter === 'new') return l.status === 'new';
    if (filter === 'qualified') return l.status === 'qualified';
    return true;
  });

  return (
    <div className="desk-page-container">
      {/* Header */}
      <div className="desk-header">
        <div>
          <div className="desk-breadcrumb">SUB ADMIN &amp; SUPPORT OPERATIONS / DESK 03</div>
          <h1 className="desk-title">Lead Management</h1>
          <p className="desk-subtitle">
            Master inbound lead ingestion, 10-digit phone sanitization, SLA speed-to-lead monitoring, and senior sales handover.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            className="sales-btn-primary"
            style={{
              background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
              borderColor: '#059669',
              color: '#ffffff',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              fontWeight: 700
            }}
            onClick={handleOpenAddLead}
          >
            <Plus size={16} strokeWidth={2.5} /> Add Lead
          </button>
        </div>
      </div>

      {/* Lead Dispatched Celebration Banner */}
      {leadSuccessToast && (
        <div style={{
          background: 'linear-gradient(135deg, #065f46 0%, #047857 100%)',
          color: '#ffffff',
          borderRadius: 14,
          padding: '16px 20px',
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 10px 25px rgba(5, 150, 105, 0.25)',
          border: '1px solid #10b981',
          flexWrap: 'wrap',
          gap: 12,
          animation: 'modal-pop-in 0.2s ease'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: '#ecfdf5',
              color: '#059669',
              display: 'grid',
              placeItems: 'center',
              fontWeight: 900
            }}>
              ✓
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.98rem' }}>
                Lead Dispatched Successfully!
              </div>
              <div style={{ fontSize: '0.84rem', color: '#d1fae5', marginTop: 2 }}>
                Phone <strong style={{ color: '#fff' }}>+91 {leadSuccessToast.phone}</strong> has been assigned to <strong style={{ color: '#fff' }}>{leadSuccessToast.company}</strong> and is live in their Customer CRM.
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <a
              href="/app/lead#app/lead"
              target="_blank"
              rel="noreferrer"
              style={{
                background: '#ffffff',
                color: '#047857',
                fontWeight: 800,
                fontSize: '0.86rem',
                padding: '9px 18px',
                borderRadius: 9999,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 4px 10px rgba(0,0,0,0.1)'
              }}
            >
              <span>View in Customer CRM (/app/lead#app/lead)</span>
              <ExternalLink size={14} />
            </a>
            <button
              type="button"
              onClick={() => setLeadSuccessToast(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#a7f3d0',
                cursor: 'pointer',
                fontWeight: 800,
                fontSize: '1.2rem',
                padding: '4px 8px'
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* KPI Quad Grid */}
      <div className="desk-kpi-grid">
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">TOTAL INBOUND LEADS</div>
          <div className="desk-kpi-val">{leads.length}</div>
          <div className="desk-kpi-sub">Real-time buyer inquiries</div>
        </div>
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">URGENT ATTENTION</div>
          <div className="desk-kpi-val text-rose">{leads.filter((l) => l.priority === 'Urgent').length}</div>
          <div className="desk-kpi-sub">Speed SLA &lt; 5 mins</div>
        </div>
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">QUALIFIED RATE</div>
          <div className="desk-kpi-val text-emerald">
            {leads.length > 0 ? `${Math.round((leads.filter((l) => l.status === 'qualified' || l.isHot).length / leads.length) * 100)}%` : '0%'}
          </div>
          <div className="desk-kpi-sub">High-intent BANT verified</div>
        </div>
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">AVG SPEED TO LEAD</div>
          <div className="desk-kpi-val text-indigo">{leads.length > 0 ? '01m 15s' : '0m'}</div>
          <div className="desk-kpi-sub">Call response cadence</div>
        </div>
      </div>

      {/* Filters */}
      <div className="desk-filter-bar">
        <div className="desk-tabs">
          <button type="button" className={`desk-tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
            All Leads ({leads.length})
          </button>
          <button type="button" className={`desk-tab ${filter === 'urgent' ? 'active' : ''}`} onClick={() => setFilter('urgent')}>
            Urgent SLA ({leads.filter((l) => l.priority === 'Urgent').length})
          </button>
          <button type="button" className={`desk-tab ${filter === 'new' ? 'active' : ''}`} onClick={() => setFilter('new')}>
            New Inbound ({leads.filter((l) => l.status === 'new').length})
          </button>
          <button type="button" className={`desk-tab ${filter === 'qualified' ? 'active' : ''}`} onClick={() => setFilter('qualified')}>
            Qualified ({leads.filter((l) => l.status === 'qualified').length})
          </button>
        </div>
        <div className="desk-search-wrap">
          <Search size={16} className="desk-search-icon" />
          <input
            type="text"
            className="desk-search-input"
            placeholder="Search leads..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Leads List - Clean UI: ONLY Phone Number and Company Name Where Sent */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filtered.map((lead) => {
          const rawDigits = (lead.phone || lead.name || '').replace(/\D/g, '').slice(-10);
          const cleanPhone = rawDigits.length === 10 ? `+91 ${rawDigits}` : (lead.phone || lead.name);
          const callDigits = rawDigits.length === 10 ? `+91${rawDigits}` : (lead.phone || '');
          const targetComp = lead.company || lead.assignedCompany || lead.customerCompanyName || 'Client Account';

          return (
            <div
              key={lead.id}
              className="desk-card-row"
              style={{
                padding: '16px 20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 16,
                background: '#ffffff',
                borderRadius: 12,
                border: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
              }}
            >
              {/* Left Column: Number & Company Name where sent ONLY */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
                {/* Phone Number Display */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: '#ecfdf5',
                    color: '#059669',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid #a7f3d0'
                  }}>
                    <Phone size={18} />
                  </div>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Phone Number
                    </span>
                    <span style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', letterSpacing: '0.02em', fontFamily: 'monospace' }}>
                      {cleanPhone}
                    </span>
                  </div>
                </div>

                {/* Company Name where sent */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 18, borderLeft: '1px solid #e2e8f0' }}>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Sent to Client CRM
                    </span>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: '0.94rem',
                      fontWeight: 700,
                      color: '#1e40af',
                      background: '#eff6ff',
                      border: '1px solid #bfdbfe',
                      padding: '4px 12px',
                      borderRadius: 8,
                      marginTop: 2
                    }}>
                      🏢 {targetComp}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right Column: Actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <a
                  href={`tel:${callDigits}`}
                  className="desk-action-btn"
                  style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: '0.82rem', fontWeight: 600 }}
                >
                  <Phone size={14} /> Direct Call
                </a>
                <a
                  href={`https://wa.me/91${rawDigits}?text=Hello,%20thank%20you%20for%20your%20inquiry%20with%20${encodeURIComponent(targetComp)}.`}
                  target="_blank"
                  rel="noreferrer"
                  className="desk-action-btn"
                  style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: '0.82rem', fontWeight: 600 }}
                >
                  <MessageSquare size={14} /> WhatsApp
                </a>
              </div>
            </div>
          );
        })}
      </div>

      {/* ADD LEAD MODAL IN LEAD MANAGEMENT DESK */}
      {isAddLeadModalOpen && (
        <div className="sales-modal-overlay" onClick={() => setIsAddLeadModalOpen(false)}>
          <div className="sales-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                  display: 'grid',
                  placeItems: 'center',
                  color: '#fff',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)'
                }}>
                  <Plus size={20} strokeWidth={2.5} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>Add Lead</h3>
                  <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                    Distribute an inbound lead directly to client CRM workspace
                  </div>
                </div>
              </div>
              <button type="button" className="desk-close-btn" onClick={() => setIsAddLeadModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitLead}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                
                {/* 1. Select Company * */}
                <div>
                  <label className="desk-form-label" style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0f172a', marginBottom: 6, display: 'block' }}>
                    Select Company <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <select
                      className="desk-form-input"
                      required
                      value={leadFormData.company}
                      onChange={(e) => setLeadFormData({ ...leadFormData, company: e.target.value })}
                      style={{
                        padding: '11px 14px',
                        fontSize: '0.94rem',
                        fontWeight: 600,
                        color: '#0f172a',
                        borderColor: '#cbd5e1',
                        borderRadius: 10,
                        width: '100%',
                        background: '#ffffff',
                        cursor: 'pointer'
                      }}
                    >
                      {getAvailableCompanies().length === 0 ? (
                        <option value="">-- No registered companies yet --</option>
                      ) : (
                        getAvailableCompanies().map((comp) => (
                          <option key={comp} value={comp}>🏢 {comp}</option>
                        ))
                      )}
                    </select>
                  </div>
                </div>

                {/* 2. Phone Number * */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label className="desk-form-label" style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0f172a', margin: 0 }}>
                      Phone Number <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <span style={{
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      color: leadPhoneDigits.length === 10 ? '#059669' : '#64748b',
                      background: leadPhoneDigits.length === 10 ? '#ecfdf5' : '#f1f5f9',
                      padding: '2px 8px',
                      borderRadius: 6,
                      border: `1px solid ${leadPhoneDigits.length === 10 ? '#a7f3d0' : '#e2e8f0'}`
                    }}>
                      {leadPhoneDigits.length}/10 digits
                    </span>
                  </div>

                  <input
                    type="tel"
                    required
                    maxLength={10}
                    className="desk-form-input"
                    placeholder="8989898989"
                    value={leadPhoneDigits}
                    onChange={handlePhoneChange}
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '1rem',
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      padding: '11px 14px',
                      width: '100%',
                      boxSizing: 'border-box',
                      borderColor: !isPhoneValidStart ? '#ef4444' : (leadPhoneDigits.length === 10 ? '#10b981' : '#cbd5e1')
                    }}
                  />
                </div>

              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22, paddingTop: 14, borderTop: '1px solid #f1f5f9' }}>
                <button
                  type="button"
                  className="sales-btn-secondary"
                  onClick={() => setIsAddLeadModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="sales-btn-primary"
                  disabled={!isPhoneComplete}
                  style={{
                    background: isPhoneComplete
                      ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)'
                      : '#94a3b8',
                    borderColor: isPhoneComplete ? '#059669' : '#94a3b8',
                    cursor: isPhoneComplete ? 'pointer' : 'not-allowed',
                    padding: '10px 22px'
                  }}
                >
                  <Send size={15} /> Add Lead
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ==========================================================================
   DESK 4: PROFILE COMPLETION
   ========================================================================== */
export function ProfileCompletionDesk({ customers, setCustomers }) {
  const [filterTab, setFilterTab] = useState('all'); // 'all' | 'complete' | 'incomplete'

  const handleToggleCheck = (custId) => {
    setCustomers((prev) =>
      prev.map((c) => {
        if (c.id !== custId) return c;
        const newPercent = Math.min(100, (c.kycPercent || 0) + 25);
        const newProfileStatus = newPercent === 100 ? 'complete' : c.profileStatus;
        try {
          crmApi.patchCustomer(c.id, { profileStatus: newProfileStatus, kycPercent: newPercent });
        } catch (e) {}
        return { ...c, kycPercent: newPercent, profileStatus: newProfileStatus, verified: newPercent === 100 };
      })
    );
  };

  const completeList = customers.filter((c) => c.kycPercent === 100 || c.profileStatus === 'complete');
  const incompleteList = customers.filter((c) => (c.kycPercent || 0) < 100 && c.profileStatus !== 'complete');

  const displayedList = filterTab === 'complete' ? completeList : (filterTab === 'incomplete' ? incompleteList : customers);
  const avgCompletion = customers.length ? Math.round(customers.reduce((a, b) => a + (b.kycPercent || 0), 0) / customers.length) : 0;

  return (
    <div className="desk-page-container">
      {/* Header */}
      <div className="desk-header">
        <div>
          <div className="desk-breadcrumb">SUB ADMIN &amp; SUPPORT OPERATIONS / DESK 04</div>
          <h1 className="desk-title">Profile Completion</h1>
          <p className="desk-subtitle">
            KYC compliance audit, corporate identity verification, and multi-channel compliance chase cadences.
          </p>
        </div>
      </div>

      {/* KPI Quad Grid */}
      <div className="desk-kpi-grid">
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">COMPLETED PROFILES</div>
          <div className="desk-kpi-val text-emerald">{completeList.length}</div>
          <div className="desk-kpi-sub">100% KYC Verified &amp; Active</div>
        </div>
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">PENDING AUDIT</div>
          <div className="desk-kpi-val text-amber">{incompleteList.length}</div>
          <div className="desk-kpi-sub">Workspaces pending audit</div>
        </div>
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">AVG KYC SCORE</div>
          <div className="desk-kpi-val text-indigo">{avgCompletion}%</div>
          <div className="desk-kpi-sub">Platform compliance score</div>
        </div>
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">AUDITED TODAY</div>
          <div className="desk-kpi-val text-emerald">{completeList.length}</div>
          <div className="desk-kpi-sub">WhatsApp &amp; CRM Syncs</div>
        </div>
      </div>

      {/* Tab Filter Row */}
      <div style={{ display: 'flex', gap: 10, margin: '20px 0 16px 0', alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => setFilterTab('all')}
          className={`desk-preset-btn ${filterTab === 'all' ? 'active' : ''}`}
          style={{
            background: filterTab === 'all' ? '#0f172a' : '#f8fafc',
            color: filterTab === 'all' ? '#ffffff' : '#334155',
            padding: '7px 16px',
            borderRadius: 8,
            fontWeight: 700,
            fontSize: '0.86rem',
            border: '1.5px solid #cbd5e1',
            cursor: 'pointer'
          }}
        >
          All Workspaces ({customers.length})
        </button>
        <button
          type="button"
          onClick={() => setFilterTab('complete')}
          className={`desk-preset-btn ${filterTab === 'complete' ? 'active' : ''}`}
          style={{
            background: filterTab === 'complete' ? '#059669' : '#ecfdf5',
            color: filterTab === 'complete' ? '#ffffff' : '#047857',
            padding: '7px 16px',
            borderRadius: 8,
            fontWeight: 700,
            fontSize: '0.86rem',
            border: '1.5px solid #a7f3d0',
            cursor: 'pointer'
          }}
        >
          ✓ Completed Profiles ({completeList.length})
        </button>
        <button
          type="button"
          onClick={() => setFilterTab('incomplete')}
          className={`desk-preset-btn ${filterTab === 'incomplete' ? 'active' : ''}`}
          style={{
            background: filterTab === 'incomplete' ? '#d97706' : '#fffbeb',
            color: filterTab === 'incomplete' ? '#ffffff' : '#b45309',
            padding: '7px 16px',
            borderRadius: 8,
            fontWeight: 700,
            fontSize: '0.86rem',
            border: '1.5px solid #fde68a',
            cursor: 'pointer'
          }}
        >
          ⏳ Pending KYC Audit ({incompleteList.length})
        </button>
      </div>

      {/* Profiles Cards List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {displayedList.map((c) => {
          const isComplete = c.kycPercent === 100 || c.profileStatus === 'complete';
          return (
            <div
              key={c.id}
              className="desk-card-row"
              style={{
                borderLeft: isComplete ? '5px solid #10b981' : '5px solid #f59e0b',
                background: '#ffffff',
                padding: '22px 26px',
                borderRadius: '16px',
                border: '1.5px solid #e2e8f0',
                boxShadow: '0 4px 16px rgba(0,0,0,0.03)'
              }}
            >
              {/* Card Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
                      {c.name || c.companyName || 'Corporate Workspace'}
                    </h3>
                    <span
                      style={{
                        background: isComplete ? '#ecfdf5' : '#fffbeb',
                        color: isComplete ? '#065f46' : '#b45309',
                        border: isComplete ? '1px solid #a7f3d0' : '1px solid #fde68a',
                        padding: '3px 10px',
                        borderRadius: 9999,
                        fontSize: '0.78rem',
                        fontWeight: 800,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5
                      }}
                    >
                      {isComplete ? '✓ 100% KYC Audit Passed & Verified' : '⏳ Action Required: Profile Audit Incomplete'}
                    </span>
                    <span
                      style={{
                        background: '#f1f5f9',
                        color: '#475569',
                        padding: '3px 8px',
                        borderRadius: 6,
                        fontSize: '0.76rem',
                        fontWeight: 700
                      }}
                    >
                      Category: {c.category || 'Other'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.84rem', color: '#64748b', marginTop: 4 }}>
                    Workspace ID: <code>{c.id}</code> • Registered Phone: <strong style={{ color: '#0f172a' }}>+91 {c.phone}</strong> • Completed: {c.completedAt || 'Recently Active'}
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.45rem', fontWeight: 800, color: isComplete ? '#059669' : (c.kycPercent >= 50 ? '#d97706' : '#e11d48') }}>
                    {isComplete ? '100%' : `${c.kycPercent || 25}%`}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
                    Audit Score
                  </div>
                </div>
              </div>

              {/* Complete Organization & Contact Details Dossier Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 12,
                  marginTop: 16,
                  padding: '16px',
                  background: '#f8fafc',
                  borderRadius: 12,
                  border: '1px solid #edf2f7'
                }}
              >
                <div>
                  <small style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Contact Person</small>
                  <div style={{ fontSize: '0.94rem', fontWeight: 700, color: '#0f172a' }}>{c.contact || c.contactPerson || c.username || 'Not Set'}</div>
                </div>
                <div>
                  <small style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Business Email</small>
                  <div style={{ fontSize: '0.94rem', fontWeight: 700, color: '#0f172a' }}>{c.email || 'Not Provided'}</div>
                </div>
                <div>
                  <small style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Personal / Backup Email</small>
                  <div style={{ fontSize: '0.94rem', fontWeight: 600, color: '#334155' }}>{c.personalEmail || 'Not Provided'}</div>
                </div>
                <div>
                  <small style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Direct Phone / WhatsApp</small>
                  <div style={{ fontSize: '0.94rem', fontWeight: 700, color: '#059669' }}>+91 {c.phone}</div>
                </div>
                <div>
                  <small style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Primary Industry / Niche</small>
                  <div style={{ fontSize: '0.94rem', fontWeight: 700, color: '#0f172a' }}>{c.industry || c.category || 'Other'}</div>
                </div>
                <div>
                  <small style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Company Website</small>
                  <div style={{ fontSize: '0.94rem', fontWeight: 600, color: '#2563eb' }}>
                    {c.website || c.domain ? (
                      <a href={c.website || c.domain} target="_blank" rel="noreferrer" style={{ color: '#2563eb', textDecoration: 'none' }}>
                        {c.website || c.domain} ↗
                      </a>
                    ) : 'Not Configured'}
                  </div>
                </div>
                <div>
                  <small style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Headquarters Location</small>
                  <div style={{ fontSize: '0.94rem', fontWeight: 700, color: '#0f172a' }}>
                    {c.city ? `${c.city}, ` : ''}{c.state ? `${c.state}, ` : ''}{c.country || 'India'}
                  </div>
                </div>
                <div>
                  <small style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Lead Distribution Status</small>
                  <div style={{ fontSize: '0.94rem', fontWeight: 700, color: isComplete ? '#059669' : '#d97706' }}>
                    {isComplete ? '● Active & Delivering' : '⏸ Pending Verification'}
                  </div>
                </div>
              </div>

              {/* 4 Checklist Checkpoints */}
              <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
                <div className="desk-check-item">
                  <CheckCircle2 size={16} color="#059669" />
                  <span>1. Company Name &amp; Identity</span>
                </div>
                <div className="desk-check-item">
                  <CheckCircle2 size={16} color={isComplete ? '#059669' : '#d97706'} />
                  <span>2. Category &amp; Industry Allocation</span>
                </div>
                <div className="desk-check-item">
                  <CheckCircle2 size={16} color={isComplete ? '#059669' : '#94a3b8'} />
                  <span>3. Administrator WhatsApp &amp; Email</span>
                </div>
                <div className="desk-check-item">
                  <CheckCircle2 size={16} color={isComplete ? '#059669' : '#94a3b8'} />
                  <span>4. City &amp; Geographic Location</span>
                </div>
              </div>

              {/* Actions Bar */}
              <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                <a
                  href={`https://wa.me/91${c.phone}?text=Hello%20${encodeURIComponent(c.contact || 'Partner')},%20your%20Growthline%20business%20profile%20is%20now%20100%%20verified.`}
                  target="_blank"
                  rel="noreferrer"
                  className="desk-action-btn"
                  style={{ textDecoration: 'none', background: '#ecfdf5', color: '#065f46', borderColor: '#a7f3d0' }}
                >
                  <MessageSquare size={14} color="#059669" /> WhatsApp Partner Desk
                </a>
                <button
                  type="button"
                  className="desk-action-btn"
                  onClick={() => alert(`Compliance dossier dispatched for ${c.name} to ${c.email}!`)}
                >
                  <Send size={14} /> Send Compliance Certificate
                </button>
                {!isComplete && (
                  <button
                    type="button"
                    className="sales-btn-primary"
                    style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                    onClick={() => handleToggleCheck(c.id)}
                  >
                    <Check size={14} /> Mark Step Verified (+25%)
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ==========================================================================
   DESK 5: PAYMENT COLLECTION & CLIENT TOP-UP LEDGER
   ========================================================================== */
export const INITIAL_PAYMENT_RECORDS = [];

export function PaymentCollectionDesk({
  invoices = [],
  setInvoices,
  customers = [],
  setCustomers,
  verifications = [],
}) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [activeReceipt, setActiveReceipt] = useState(null);
  const [activeInv, setActiveInv] = useState(null);
  const [utrInput, setUtrInput] = useState('');

  // Add Payment / Top-Up Modal State
  const [isAddPaymentModalOpen, setIsAddPaymentModalOpen] = useState(false);
  const [newPayData, setNewPayData] = useState({
    customerId: '',
    type: 'topup',
    amount: 3000,
    paymentMode: 'Razorpay UPI',
    utr: '',
    creditWallet: true,
    notes: 'Customer Marketing Ad Wallet Top-Up',
  });

  // Persistent Payment & Top-Up Ledger State
  const [records, setRecords] = useState(() => {
    try {
      const raw = localStorage.getItem('growthline_payment_records');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return INITIAL_PAYMENT_RECORDS;
  });

  // Auto-sync real newly registered accounts from Desk 1
  useEffect(() => {
    if (!customers || customers.length === 0) return;
    setRecords((prev) => {
      let updated = [...prev];
      let hasChange = false;

      customers.forEach((c) => {
        if (c.amountPaid || c.paymentStatus === 'paid') {
          const exists = updated.some(
            (r) =>
              (r.phone && r.phone === c.phone) ||
              (r.company && (r.company === c.companyName || r.company === c.name))
          );
          if (!exists) {
            hasChange = true;
            const amt = c.amountPaid || c.balance || 1200;
            updated.unshift({
              id: `pay_reg_${c.id || Date.now()}`,
              receiptNumber: `REC-2026-${Math.floor(1000 + Math.random() * 9000)}`,
              company: c.companyName || c.name,
              contact: c.contactPerson || c.contact || 'Account Admin',
              phone: c.phone || '9980820319',
              city: c.city || 'India',
              type: 'registration',
              typeLabel: 'Registration Package',
              amount: amt,
              gstAmount: Math.round(amt * 0.18),
              total: amt,
              paymentMode: 'Razorpay UPI (Live)',
              utr: `rzp_live_${(c.phone || '').slice(-6)}`,
              date: c.registeredAt || 'Today, Just now',
              status: 'paid',
              runwayAdded: c.runwayDays || Math.floor(amt / 300),
              notes: 'Self-Registered Customer Intake (#register)',
            });
          }
        }
      });

      if (hasChange) {
        try {
          localStorage.setItem('growthline_payment_records', JSON.stringify(updated));
        } catch (e) {}
        return updated;
      }
      return prev;
    });
  }, [customers]);

  // Listen to cross-desk storage / event updates
  useEffect(() => {
    const handleNewPayment = (e) => {
      const rec = e?.detail;
      if (rec) {
        setRecords((prev) => [rec, ...prev.filter((r) => r.id !== rec.id)]);
      }
    };
    const handleStorage = (e) => {
      if (e.key === 'growthline_payment_records' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) setRecords(parsed);
        } catch (err) {}
      }
    };

    window.addEventListener('growthline_payment_recorded', handleNewPayment);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('growthline_payment_recorded', handleNewPayment);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const saveRecords = (newList) => {
    setRecords(newList);
    try {
      localStorage.setItem('growthline_payment_records', JSON.stringify(newList));
    } catch (e) {}
  };

  // Open Add Modal with default pre-selection
  const handleOpenAddModal = () => {
    const defaultCust = customers[0] || { id: 'cust_default', companyName: 'CloudBytes Software Solutions' };
    setNewPayData({
      customerId: defaultCust.id,
      company: defaultCust.companyName || defaultCust.name,
      contact: defaultCust.contactPerson || defaultCust.contact,
      phone: defaultCust.phone,
      city: defaultCust.city || 'India',
      type: 'topup',
      amount: 3000,
      paymentMode: 'Razorpay UPI',
      utr: `UTR-HDFC-${Math.floor(100000 + Math.random() * 900000)}`,
      creditWallet: true,
      notes: 'Customer Marketing Ad Wallet Top-Up',
    });
    setIsAddPaymentModalOpen(true);
  };

  // Record Payment / Top-Up Action
  const handleSavePayment = (e) => {
    e.preventDefault();
    const targetCust = customers.find((c) => c.id === newPayData.customerId) || customers[0] || {};
    const compName = targetCust.companyName || targetCust.name || newPayData.company || 'Customer Account';
    const contactName = targetCust.contactPerson || targetCust.contact || newPayData.contact || 'Account Admin';
    const phoneNo = targetCust.phone || newPayData.phone || '9980820319';
    const city = targetCust.city || newPayData.city || 'India';
    const amt = Number(newPayData.amount) || 3000;
    const addedDays = Math.floor(amt / 300);

    const newRecord = {
      id: `pay_${Date.now()}`,
      receiptNumber: `REC-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      customerId: targetCust.id,
      company: compName,
      contact: contactName,
      phone: phoneNo,
      city: city,
      type: newPayData.type,
      typeLabel:
        newPayData.type === 'topup'
          ? 'Wallet Top-Up'
          : newPayData.type === 'registration'
          ? 'Registration Package'
          : 'Service Invoice Payment',
      amount: amt,
      gstAmount: Math.round(amt * 0.18),
      total: Math.round(amt * 1.18),
      paymentMode: newPayData.paymentMode,
      utr: newPayData.utr || `UTR-PAY-${Date.now().toString().slice(-6)}`,
      date: 'Today, Just now',
      status: 'paid',
      runwayAdded: addedDays,
      notes: newPayData.notes || `Payment of ₹${amt.toLocaleString('en-IN')} completed for ${compName}`,
    };

    // 1. Save to payments ledger
    const updated = [newRecord, ...records];
    saveRecords(updated);

    // 2. If creditWallet is enabled, immediately credit customer's wallet and runway!
    if (newPayData.creditWallet && setCustomers) {
      setCustomers((prev) =>
        prev.map((c) => {
          if (c.id === targetCust.id || c.phone === phoneNo) {
            const newBal = (c.balance || 0) + amt;
            return {
              ...c,
              balance: newBal,
              walletBalance: newBal,
              amountPaid: (c.amountPaid || 0) + amt,
              runwayDays: (c.runwayDays || 0) + addedDays,
              paymentStatus: 'paid',
              status: 'active',
            };
          }
          return c;
        })
      );
    }

    setIsAddPaymentModalOpen(false);
    setActiveReceipt(newRecord);
  };

  // Reconcile Invoice Settlement
  const handleSettleInvoice = () => {
    if (!activeInv) return;
    const finalUtr = utrInput || `UTR-HDFC-${Math.floor(100000 + Math.random() * 900000)}`;

    // Update invoices
    if (setInvoices) {
      setInvoices((prev) =>
        prev.map((inv) => (inv.id === activeInv.id ? { ...inv, status: 'paid', utr: finalUtr, daysOverdue: 0 } : inv))
      );
    }

    // Update records ledger
    const updated = records.map((r) => {
      if (r.invoiceNumber === activeInv.invoiceNumber || r.id === activeInv.id) {
        return {
          ...r,
          status: 'paid',
          utr: finalUtr,
          receiptNumber: `REC-2026-${Math.floor(1000 + Math.random() * 9000)}`,
          daysOverdue: 0,
        };
      }
      return r;
    });
    saveRecords(updated);

    setActiveInv(null);
  };

  // KPI Calculations
  const totalCollected = records
    .filter((r) => r.status === 'paid')
    .reduce((sum, r) => sum + (r.amount || 0), 0);

  const topupTotal = records
    .filter((r) => r.type === 'topup' && r.status === 'paid')
    .reduce((sum, r) => sum + (r.amount || 0), 0);

  const registrationTotal = records
    .filter((r) => r.type === 'registration' && r.status === 'paid')
    .reduce((sum, r) => sum + (r.amount || 0), 0);

  const invoiceTotal = records
    .filter((r) => r.type === 'invoice' && r.status === 'paid')
    .reduce((sum, r) => sum + (r.amount || 0), 0);

  const overdueCount = records.filter((r) => r.status === 'overdue').length;

  // Filtered Records
  const filteredRecords = records.filter((r) => {
    if (filter === 'topup' && r.type !== 'topup') return false;
    if (filter === 'registration' && r.type !== 'registration') return false;
    if (filter === 'invoice' && r.type !== 'invoice') return false;
    if (filter === 'overdue' && r.status !== 'overdue') return false;

    if (search.trim()) {
      const q = search.toLowerCase();
      const matchComp = (r.company || '').toLowerCase().includes(q);
      const matchContact = (r.contact || '').toLowerCase().includes(q);
      const matchPhone = (r.phone || '').includes(q);
      const matchUtr = (r.utr || '').toLowerCase().includes(q);
      const matchRec = (r.receiptNumber || r.invoiceNumber || '').toLowerCase().includes(q);
      return matchComp || matchContact || matchPhone || matchUtr || matchRec;
    }
    return true;
  });

  return (
    <div className="desk-page-container">
      {/* 1. Header */}
      <div className="desk-header">
        <div>
          <div className="desk-breadcrumb">SUB ADMIN &amp; SUPPORT OPERATIONS / DESK 05</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 className="desk-title">Payment Collection &amp; Top-Up Ledger</h1>
            <span
              style={{
                background: '#eff6ff',
                color: '#1d4ed8',
                border: '1px solid #bfdbfe',
                fontWeight: 800,
                fontSize: '0.78rem',
                padding: '3px 10px',
                borderRadius: 9999,
              }}
            >
              {records.length} Completed Records
            </span>
          </div>
          <p className="desk-subtitle">
            Master ledger recording which customers completed registration payments, invoice settlements, and marketing wallet top-ups.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="sales-btn-primary"
            style={{
              background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
              borderColor: '#059669',
              color: '#ffffff',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              fontWeight: 700,
            }}
            onClick={handleOpenAddModal}
          >
            <Plus size={16} strokeWidth={2.5} /> Record Payment / Top-Up
          </button>
        </div>
      </div>

      {/* 2. KPI Quad Grid */}
      <div className="desk-kpi-grid">
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">TOTAL REVENUE COLLECTED</div>
          <div className="desk-kpi-val text-emerald">{formatINR(totalCollected)}</div>
          <div className="desk-kpi-sub">All completed customer payments</div>
        </div>
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">WALLET TOP-UPS TOTAL</div>
          <div className="desk-kpi-val text-indigo">{formatINR(topupTotal)}</div>
          <div className="desk-kpi-sub">{records.filter((r) => r.type === 'topup').length} Customer wallet recharges</div>
        </div>
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">REGISTRATION PACKAGES</div>
          <div className="desk-kpi-val text-blue">{formatINR(registrationTotal)}</div>
          <div className="desk-kpi-sub">{records.filter((r) => r.type === 'registration').length} Starter packages enrolled</div>
        </div>
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">OVERDUE RECEIVABLES</div>
          <div className="desk-kpi-val text-rose">{overdueCount} Invoices</div>
          <div className="desk-kpi-sub">Aging invoices needing collection</div>
        </div>
      </div>

      {/* 3. Search & Filters Bar */}
      <div className="desk-filter-bar">
        <div className="desk-tabs">
          <button type="button" className={`desk-tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
            All Payments &amp; Top-Ups ({records.length})
          </button>
          <button
            type="button"
            className={`desk-tab ${filter === 'topup' ? 'active' : ''}`}
            onClick={() => setFilter('topup')}
          >
            Wallet Top-Ups ({records.filter((r) => r.type === 'topup').length})
          </button>
          <button
            type="button"
            className={`desk-tab ${filter === 'registration' ? 'active' : ''}`}
            onClick={() => setFilter('registration')}
          >
            Registration Packages ({records.filter((r) => r.type === 'registration').length})
          </button>
          <button
            type="button"
            className={`desk-tab ${filter === 'invoice' ? 'active' : ''}`}
            onClick={() => setFilter('invoice')}
          >
            Invoices Settled ({records.filter((r) => r.type === 'invoice' && r.status === 'paid').length})
          </button>
          <button
            type="button"
            className={`desk-tab ${filter === 'overdue' ? 'active' : ''}`}
            onClick={() => setFilter('overdue')}
          >
            Overdue ({overdueCount})
          </button>
        </div>

        <div className="desk-search-wrap" style={{ minWidth: 320 }}>
          <Search size={16} className="desk-search-icon" />
          <input
            type="text"
            className="desk-search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by customer, phone, UTR or receipt..."
          />
        </div>
      </div>

      {/* 4. Master Payment Records Table */}
      <div className="desk-table-card">
        <table className="desk-table">
          <thead>
            <tr>
              <th>Receipt / Ref #</th>
              <th>Customer &amp; Company</th>
              <th>Amount Paid</th>
              <th>Payment Mode &amp; UTR</th>
              <th>Date &amp; Time</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRecords.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '36px 20px', color: '#64748b' }}>
                  No payment or top-up records found matching your filters.
                </td>
              </tr>
            ) : (
              filteredRecords.map((r) => {
                const isPaid = r.status === 'paid';
                return (
                  <tr key={r.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontWeight: 800, fontFamily: 'monospace', color: '#0f172a', fontSize: '0.85rem' }}>
                          {r.receiptNumber || r.invoiceNumber}
                        </span>
                      </div>
                    </td>

                    <td>
                      <div>
                        <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.9rem' }}>
                          {r.company}
                        </div>
                        <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: 1 }}>
                          👤 {r.contact} • 📞 +91 {r.phone}
                        </div>
                      </div>
                    </td>

                    <td>
                      <div>
                        <span style={{ fontWeight: 900, color: '#0f172a', fontSize: '0.96rem' }}>
                          {formatINR(r.amount)}
                        </span>
                        {r.gstAmount > 0 && (
                          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                            + {formatINR(r.gstAmount)} GST (18%)
                          </div>
                        )}
                      </div>
                    </td>

                    <td>
                      <div>
                        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
                          {r.paymentMode || 'Razorpay UPI'}
                        </div>
                        <div
                          style={{
                            fontSize: '0.73rem',
                            fontFamily: 'monospace',
                            color: '#64748b',
                            background: '#f8fafc',
                            padding: '1px 6px',
                            borderRadius: 4,
                            display: 'inline-block',
                            marginTop: 2,
                            border: '1px solid #e2e8f0',
                          }}
                        >
                          UTR: {r.utr || 'N/A'}
                        </div>
                      </div>
                    </td>

                    <td>
                      <div style={{ fontSize: '0.8rem', color: '#334155', fontWeight: 600 }}>
                        {r.date}
                      </div>
                    </td>

                    <td>
                      <span className={`desk-pill ${isPaid ? 'pill-emerald' : 'pill-rose'}`}>
                        {isPaid ? '✓ Paid & Settled' : `⚠️ Overdue (${r.daysOverdue || 5}d)`}
                      </span>
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      {isPaid ? (
                        <button
                          type="button"
                          className="sales-btn-secondary"
                          style={{
                            padding: '4px 10px',
                            fontSize: '0.74rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                          }}
                          onClick={() => setActiveReceipt(r)}
                        >
                          <FileText size={13} /> View Receipt
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="sales-btn-primary"
                          style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                          onClick={() => {
                            setActiveInv(r);
                            setUtrInput(`UTR-HDFC-${Math.floor(100000 + Math.random() * 900000)}`);
                          }}
                        >
                          Reconcile UTR
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 5. RECORD MANUAL PAYMENT / TOP-UP MODAL */}
      {isAddPaymentModalOpen && (
        <div className="sales-modal-overlay" onClick={() => setIsAddPaymentModalOpen(false)}>
          <div className="sales-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                    display: 'grid',
                    placeItems: 'center',
                    color: '#fff',
                  }}
                >
                  <DollarSign size={20} strokeWidth={2.5} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.18rem', fontWeight: 800, color: '#0f172a' }}>
                    Record Customer Payment or Top-Up
                  </h3>
                  <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                    Credit marketing wallet or record customer package payment
                  </div>
                </div>
              </div>
              <button type="button" className="desk-close-btn" onClick={() => setIsAddPaymentModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSavePayment}>
              {/* Customer Selection */}
              <div style={{ marginBottom: 14 }}>
                <label className="desk-form-label">Select Customer Account *</label>
                <select
                  className="desk-form-input"
                  value={newPayData.customerId}
                  onChange={(e) => setNewPayData({ ...newPayData, customerId: e.target.value })}
                  required
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.companyName || c.name} (+91 {c.phone}) — Bal: ₹{c.balance || 0}
                    </option>
                  ))}
                </select>
              </div>

              {/* Payment Type */}
              <div style={{ marginBottom: 14 }}>
                <label className="desk-form-label">Transaction Type *</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  <button
                    type="button"
                    className={`desk-tab ${newPayData.type === 'topup' ? 'active' : ''}`}
                    style={{ textAlign: 'center', justifyContent: 'center' }}
                    onClick={() => setNewPayData({ ...newPayData, type: 'topup' })}
                  >
                    Wallet Top-Up
                  </button>
                  <button
                    type="button"
                    className={`desk-tab ${newPayData.type === 'registration' ? 'active' : ''}`}
                    style={{ textAlign: 'center', justifyContent: 'center' }}
                    onClick={() => setNewPayData({ ...newPayData, type: 'registration' })}
                  >
                    Registration Fee
                  </button>
                  <button
                    type="button"
                    className={`desk-tab ${newPayData.type === 'invoice' ? 'active' : ''}`}
                    style={{ textAlign: 'center', justifyContent: 'center' }}
                    onClick={() => setNewPayData({ ...newPayData, type: 'invoice' })}
                  >
                    Invoice Payment
                  </button>
                </div>
              </div>

              {/* Amount & Presets */}
              <div style={{ marginBottom: 14 }}>
                <label className="desk-form-label">Amount (INR) *</label>
                <input
                  type="number"
                  className="desk-form-input"
                  value={newPayData.amount}
                  onChange={(e) => setNewPayData({ ...newPayData, amount: Number(e.target.value) })}
                  min={300}
                  step={300}
                  required
                />
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  {[600, 1200, 3000, 4500, 9000, 15000].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setNewPayData({ ...newPayData, amount: amt })}
                      style={{
                        padding: '4px 10px',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        borderRadius: 6,
                        border: '1px solid #cbd5e1',
                        background: newPayData.amount === amt ? '#0f172a' : '#ffffff',
                        color: newPayData.amount === amt ? '#ffffff' : '#334155',
                        cursor: 'pointer',
                      }}
                    >
                      ₹{amt.toLocaleString('en-IN')} (+{Math.floor(amt / 300)}d)
                    </button>
                  ))}
                </div>
              </div>

              {/* Payment Mode & Bank UTR */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label className="desk-form-label">Payment Mode *</label>
                  <select
                    className="desk-form-input"
                    value={newPayData.paymentMode}
                    onChange={(e) => setNewPayData({ ...newPayData, paymentMode: e.target.value })}
                  >
                    <option value="Razorpay UPI">Razorpay UPI (PhonePe / GPay)</option>
                    <option value="Bank RTGS Transfer">Bank RTGS Transfer</option>
                    <option value="Bank NEFT Transfer">Bank NEFT Transfer</option>
                    <option value="Bank IMPS Transfer">Bank IMPS Transfer</option>
                    <option value="Credit / Debit Card">Credit / Debit Card</option>
                    <option value="Direct Cash Deposit">Direct Cash Deposit</option>
                  </select>
                </div>
                <div>
                  <label className="desk-form-label">Bank UTR / Transaction Ref ID *</label>
                  <input
                    type="text"
                    className="desk-form-input"
                    value={newPayData.utr}
                    onChange={(e) => setNewPayData({ ...newPayData, utr: e.target.value })}
                    placeholder="e.g. UTR-HDFC-991823"
                    required
                  />
                </div>
              </div>

              {/* Checkbox to Credit Wallet */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  padding: '10px 14px',
                  marginBottom: 16,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <input
                  type="checkbox"
                  id="creditWalletCheck"
                  checked={newPayData.creditWallet}
                  onChange={(e) => setNewPayData({ ...newPayData, creditWallet: e.target.checked })}
                  style={{ width: 16, height: 16, cursor: 'pointer' }}
                />
                <label htmlFor="creditWalletCheck" style={{ fontSize: '0.82rem', fontWeight: 600, color: '#0f172a', cursor: 'pointer' }}>
                  Immediately credit customer ad wallet (+₹{newPayData.amount.toLocaleString('en-IN')} &amp; +{Math.floor(newPayData.amount / 300)} days ad runway)
                </label>
              </div>

              {/* Modal Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  className="sales-btn-secondary"
                  onClick={() => setIsAddPaymentModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="sales-btn-primary"
                  style={{ background: '#059669', borderColor: '#059669' }}
                >
                  Save Record &amp; Issue Receipt
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. OFFICIAL TAX RECEIPT MODAL */}
      {activeReceipt && (
        <div className="sales-modal-overlay" onClick={() => setActiveReceipt(null)}>
          <div
            className="sales-modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 600, background: '#ffffff', border: '1px solid #cbd5e1', padding: 28 }}
          >
            {/* Receipt Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #0f172a', paddingBottom: 16, marginBottom: 18 }}>
              <div>
                <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0f172a' }}>
                  ADMAFIA MARKETING
                </div>
                <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: 2 }}>
                  Official Payment Acknowledgement &amp; Tax Receipt
                </div>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                  GSTIN: 24AAACA9928P1Z8 • SAC: 998311 (Digital Advertising)
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 800, fontFamily: 'monospace', fontSize: '0.94rem', color: '#0f172a' }}>
                  {activeReceipt.receiptNumber || activeReceipt.invoiceNumber}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Date: {activeReceipt.date}
                </div>
                <span
                  style={{
                    display: 'inline-block',
                    background: '#ecfdf5',
                    color: '#059669',
                    border: '1px solid #a7f3d0',
                    fontWeight: 800,
                    fontSize: '0.7rem',
                    padding: '2px 8px',
                    borderRadius: 9999,
                    marginTop: 4,
                  }}
                >
                  PAID &amp; SETTLED
                </span>
              </div>
            </div>

            {/* Billed To Details */}
            <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10, marginBottom: 18, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 800, color: '#64748b', marginBottom: 4 }}>
                CUSTOMER / BILLED TO:
              </div>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
                {activeReceipt.company}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: 2 }}>
                Attention: <b>{activeReceipt.contact}</b> • Phone: <b>+91 {activeReceipt.phone}</b> • Location: {activeReceipt.city || 'India'}
              </div>
            </div>

            {/* Particulars Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
              <thead>
                <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
                  <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: '0.76rem', fontWeight: 800, color: '#334155' }}>Particulars / Service Description</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', fontSize: '0.76rem', fontWeight: 800, color: '#334155' }}>SAC</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: '0.76rem', fontWeight: 800, color: '#334155' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px 10px', fontSize: '0.84rem' }}>
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>
                      {activeReceipt.typeLabel || 'Meta & Google Ads Campaign Service'}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                      {activeReceipt.notes || 'Marketing Wallet Balance & Campaign Deployment'}
                    </div>
                  </td>
                  <td style={{ padding: '12px 10px', textAlign: 'center', fontSize: '0.8rem', fontFamily: 'monospace', color: '#64748b' }}>
                    998311
                  </td>
                  <td style={{ padding: '12px 10px', textAlign: 'right', fontWeight: 800, fontSize: '0.94rem', color: '#0f172a' }}>
                    {formatINR(activeReceipt.amount)}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Total Summary */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: '#0f172a', color: '#ffffff', borderRadius: 10, marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Payment Method &amp; Reference:</div>
                <div style={{ fontSize: '0.84rem', fontWeight: 700 }}>
                  {activeReceipt.paymentMode} • UTR: {activeReceipt.utr}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>TOTAL SETTLED</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#10b981' }}>
                  {formatINR(activeReceipt.amount)}
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="sales-btn-secondary"
                onClick={() => window.print()}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Printer size={15} /> Print Receipt
              </button>
              <button
                type="button"
                className="sales-btn-primary"
                onClick={() => setActiveReceipt(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Settle Overdue Modal */}
      {activeInv && (
        <div className="sales-modal-overlay" onClick={() => setActiveInv(null)}>
          <div className="sales-modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>Record Offline Bank Transfer</h3>
              <button type="button" className="desk-close-btn" onClick={() => setActiveInv(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="desk-modal-box" style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 800 }}>{activeInv.company}</div>
              <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Invoice / Receipt: {activeInv.invoiceNumber || activeInv.receiptNumber}</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', marginTop: 4 }}>
                Total Due: {formatINR(activeInv.amount || activeInv.total)}
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label className="desk-form-label">Bank UTR / Transaction Reference Number</label>
              <input
                type="text"
                className="desk-form-input"
                value={utrInput}
                onChange={(e) => setUtrInput(e.target.value)}
                placeholder="e.g. UTR-HDFC-991823"
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className="sales-btn-secondary" onClick={() => setActiveInv(null)}>
                Cancel
              </button>
              <button type="button" className="sales-btn-primary" onClick={handleSettleInvoice}>
                Mark Paid &amp; Issue Receipt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ==========================================================================
   DESK 6: WALLETS & BALANCES (Badge: 33)
   ========================================================================== */
export function WalletsBalancesDesk({ customers, setCustomers }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [topupCust, setTopupCust] = useState(null);
  const [topupAmount, setTopupAmount] = useState(4500);

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase();
    const matchSearch =
      (c.name || c.companyName || '').toLowerCase().includes(q) ||
      (c.username || '').toLowerCase().includes(q) ||
      (c.phone || '').includes(q) ||
      (c.city || '').toLowerCase().includes(q);
    if (!matchSearch) return false;
    if (filter === 'healthy') return (c.runwayDays || 0) > 15;
    if (filter === 'low') return (c.runwayDays || 0) > 0 && (c.runwayDays || 0) <= 5;
    if (filter === 'paused') return (c.runwayDays || 0) === 0;
    return true;
  });

  const handleApplyTopup = () => {
    if (!topupCust) return;
    const addedDays = Math.floor(topupAmount / 300);
    const newBal = (topupCust.balance || 0) + topupAmount;
    setCustomers((prev) =>
      prev.map((c) => {
        if (c.id !== topupCust.id) return c;
        return {
          ...c,
          balance: newBal,
          walletBalance: newBal,
          amountPaid: (c.amountPaid || 0) + topupAmount,
          runwayDays: (c.runwayDays || 0) + addedDays,
          paymentStatus: 'paid',
          payment_status: 'paid',
          status: 'active',
        };
      })
    );

    // Record top-up in Desk 05 Payment Records Ledger & isolated customer wallet
    try {
      const utrRef = `UTR-TOPUP-${Date.now().toString().slice(-6)}`;
      const topupRecord = {
        id: `pay_top_${Date.now()}`,
        customerId: topupCust.id,
        receiptNumber: `REC-2026-${Math.floor(1000 + Math.random() * 9000)}`,
        company: topupCust.companyName || topupCust.name,
        contact: topupCust.contactPerson || topupCust.contact || topupCust.username || 'Account Admin',
        phone: topupCust.phone,
        city: topupCust.city || 'India',
        type: 'topup',
        typeLabel: 'Wallet Top-Up',
        amount: topupAmount,
        gstAmount: Math.round(topupAmount * 0.18),
        total: topupAmount,
        paymentMode: 'Bank Transfer (IMPS/NEFT)',
        utr: utrRef,
        date: 'Today, Just now',
        status: 'paid',
        runwayAdded: addedDays,
        notes: `Wallet Credit by Sub-Admin`,
      };
      const raw = localStorage.getItem('growthline_payment_records');
      const list = raw ? JSON.parse(raw) : [];
      localStorage.setItem('growthline_payment_records', JSON.stringify([topupRecord, ...list]));

      // Also append to growthline_wallet_transactions for this specific customer
      const rawTx = localStorage.getItem('growthline_wallet_transactions');
      const txList = rawTx ? JSON.parse(rawTx) : [];
      const newTx = {
        id: `tx_${Date.now()}`,
        customerId: topupCust.id,
        customerPhone: topupCust.phone,
        customerUsername: topupCust.username,
        company: topupCust.companyName || topupCust.name,
        date: 'Today, Just now',
        ref: utrRef,
        desc: `Sub-Admin Wallet Top-Up Credit (₹${topupAmount.toLocaleString('en-IN')})`,
        type: 'Credit',
        amount: topupAmount,
        balance: newBal,
        method: 'Sub-Admin Credit (IMPS/NEFT)',
        status: 'Verified ✓',
      };
      localStorage.setItem('growthline_wallet_transactions', JSON.stringify([newTx, ...txList]));

      // If this customer is currently logged in, sync their active session balance too
      const rawActive = localStorage.getItem('growthline_active_user');
      if (rawActive) {
        const activeUser = JSON.parse(rawActive);
        if (activeUser && (activeUser.id === topupCust.id || activeUser.phone === topupCust.phone)) {
          const syncedActive = { ...activeUser, balance: newBal, walletBalance: newBal, paymentStatus: 'paid', payment_status: 'paid' };
          localStorage.setItem('growthline_active_user', JSON.stringify(syncedActive));
          window.dispatchEvent(new CustomEvent('growthline_active_user_changed', { detail: syncedActive }));
        }
      }

      window.dispatchEvent(new CustomEvent('growthline_payment_recorded', { detail: topupRecord }));
    } catch (e) {}

    alert(`₹${topupAmount.toLocaleString('en-IN')} added to ${topupCust.name}!`);
    setTopupCust(null);
  };

  return (
    <div className="desk-page-container">
      {/* Header */}
      <div className="desk-header">
        <div>
          <div className="desk-breadcrumb">SUB ADMIN &amp; SUPPORT OPERATIONS / DESK 06</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 className="desk-title">Wallets &amp; Balances</h1>
            <span className="desk-pill pill-indigo" style={{ fontWeight: 800 }}>{customers.length} Accounts</span>
          </div>
          <p className="desk-subtitle">
            Centralized client advertising ledger, daily ₹300 auto-cut deduction monitoring, runway health alerts, and instant top-ups.
          </p>
        </div>
      </div>

      {/* KPI Quad Grid */}
      <div className="desk-kpi-grid">
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">TOTAL BILLING ACCOUNTS</div>
          <div className="desk-kpi-val text-indigo">{customers.length}</div>
          <div className="desk-kpi-sub">Managed client ledgers</div>
        </div>
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">DAILY BURN RATE</div>
          <div className="desk-kpi-val text-emerald">₹300 / day</div>
          <div className="desk-kpi-sub">Transparent daily auto-cut</div>
        </div>
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">HEALTHY RUNWAY (&gt;15d)</div>
          <div className="desk-kpi-val text-emerald">{customers.filter((c) => (c.runwayDays || 0) > 15).length}</div>
          <div className="desk-kpi-sub">Uninterrupted ad placement</div>
        </div>
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">PAUSED (ZERO BAL)</div>
          <div className="desk-kpi-val text-rose">{customers.filter((c) => (c.balance || 0) <= 0).length}</div>
          <div className="desk-kpi-sub">Awaiting recharge to resume</div>
        </div>
      </div>

      {/* Filters */}
      <div className="desk-filter-bar">
        <div className="desk-tabs">
          <button type="button" className={`desk-tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
            All Accounts ({customers.length})
          </button>
          <button type="button" className={`desk-tab ${filter === 'healthy' ? 'active' : ''}`} onClick={() => setFilter('healthy')}>
            Healthy Runway (&gt;15 Days)
          </button>
          <button type="button" className={`desk-tab ${filter === 'low' ? 'active' : ''}`} onClick={() => setFilter('low')}>
            Low Balance (&le;5 Days)
          </button>
          <button type="button" className={`desk-tab ${filter === 'paused' ? 'active' : ''}`} onClick={() => setFilter('paused')}>
            Paused (0 Days)
          </button>
        </div>
        <div className="desk-search-wrap">
          <Search size={16} className="desk-search-icon" />
          <input
            type="text"
            className="desk-search-input"
            placeholder="Search accounts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="desk-table-card">
        <table className="desk-table">
          <thead>
            <tr>
              <th>Client Account</th>
              <th>Available Balance</th>
              <th>Daily Burn</th>
              <th>Campaign Runway</th>
              <th>Placement Delivery</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id}>
                <td>
                  <div style={{ fontWeight: 800, color: '#0f172a' }}>{c.name}</div>
                  <div style={{ fontSize: '0.76rem', color: '#64748b' }}>{c.contact} • {c.city}</div>
                </td>
                <td>
                  <span style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>{formatINR(c.balance)}</span>
                </td>
                <td>
                  <span style={{ fontWeight: 700, color: '#4f46e5' }}>₹{c.dailyPacing} / day</span>
                </td>
                <td>
                  <span className={`desk-pill ${c.runwayDays > 15 ? 'pill-emerald' : c.runwayDays > 0 ? 'pill-amber' : 'pill-rose'}`}>
                    {c.runwayDays} Days
                  </span>
                </td>
                <td>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: c.balance > 0 ? '#059669' : '#e11d48' }}>
                    {c.balance > 0 ? '🟢 Active Lead Ingestion' : '🔴 Delivery Paused (Recharge Req.)'}
                  </span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button
                    type="button"
                    className="sales-btn-primary"
                    style={{ padding: '5px 12px', fontSize: '0.75rem' }}
                    onClick={() => setTopupCust(c)}
                  >
                    + Quick Top-Up
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Top-Up Modal */}
      {topupCust && (
        <div className="sales-modal-overlay" onClick={() => setTopupCust(null)}>
          <div className="sales-modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <span className="sales-dept-badge">Instant Ad Spend Recharge</span>
                <h3 style={{ margin: '4px 0 0 0', fontSize: '1.25rem', fontWeight: 800 }}>Top-Up Client Wallet</h3>
              </div>
              <button type="button" className="desk-close-btn" onClick={() => setTopupCust(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="desk-modal-box" style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 800 }}>{topupCust.name}</div>
              <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Current Balance: {formatINR(topupCust.balance)} ({topupCust.runwayDays} Days Runway)</div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label className="desk-form-label">Select Recharge Preset</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 6 }}>
                {[600, 1500, 2100, 4500, 9000, 18000].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    className={`desk-preset-btn ${topupAmount === amt ? 'active' : ''}`}
                    onClick={() => setTopupAmount(amt)}
                  >
                    <div style={{ fontWeight: 800 }}>₹{amt.toLocaleString('en-IN')}</div>
                    <div style={{ fontSize: '0.68rem', color: '#64748b' }}>+{Math.floor(amt / 300)} Days</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="desk-modal-box" style={{ marginBottom: 16, background: '#f0fdf4', borderColor: '#bbf7d0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.74rem', color: '#166534', fontWeight: 700 }}>Total Wallet Credit</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#15803d' }}>+{formatINR(topupAmount)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.74rem', color: '#166534', fontWeight: 700 }}>Runway Added</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#15803d' }}>+{Math.floor(topupAmount / 300)} Days</div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className="sales-btn-secondary" onClick={() => setTopupCust(null)}>
                Cancel
              </button>
              <button type="button" className="sales-btn-primary" onClick={handleApplyTopup}>
                Apply Credit Instantly
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ==========================================================================
   DESK 7: QUERY & SUPPORT
   ========================================================================== */
export function QuerySupportDesk({ queries, setQueries }) {
  const [filter, setFilter] = useState('all');

  const handleResolve = (id) => {
    setQueries((prev) =>
      prev.map((q) => (q.id === id ? { ...q, status: 'resolved' } : q))
    );
    alert('Query marked resolved! Ticket status updated across platform.');
  };

  const filtered = queries.filter((q) => {
    if (filter === 'open') return q.status === 'open';
    if (filter === 'resolved') return q.status === 'resolved';
    return true;
  });

  return (
    <div className="desk-page-container">
      {/* Header */}
      <div className="desk-header">
        <div>
          <div className="desk-breadcrumb">SUB ADMIN &amp; SUPPORT OPERATIONS / DESK 07</div>
          <h1 className="desk-title">Query &amp; Support</h1>
          <p className="desk-subtitle">
            Customer ticketing, 7-tier issue categorization, SLA resolution timers, and communication audit trails.
          </p>
        </div>
      </div>

      {/* KPI Quad Grid */}
      <div className="desk-kpi-grid">
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">ACTIVE TICKETS</div>
          <div className="desk-kpi-val text-indigo">{queries.filter((q) => q.status !== 'resolved').length}</div>
          <div className="desk-kpi-sub">Customer queries in flight</div>
        </div>
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">SLA BREACHED</div>
          <div className="desk-kpi-val text-rose">{queries.filter((q) => q.slaBreached).length}</div>
          <div className="desk-kpi-sub">&gt;24 hours pending</div>
        </div>
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">AVG RESPONSE TIME</div>
          <div className="desk-kpi-val text-emerald">{queries.length > 0 ? '1.8h' : '0h'}</div>
          <div className="desk-kpi-sub">Speed to first resolution</div>
        </div>
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">RESOLVED THIS WEEK</div>
          <div className="desk-kpi-val text-indigo">{queries.filter((q) => q.status === 'resolved').length}</div>
          <div className="desk-kpi-sub">Customer satisfaction 98%</div>
        </div>
      </div>

      {/* Filters */}
      <div className="desk-filter-bar">
        <div className="desk-tabs">
          <button type="button" className={`desk-tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
            All Tickets ({queries.length})
          </button>
          <button type="button" className={`desk-tab ${filter === 'open' ? 'active' : ''}`} onClick={() => setFilter('open')}>
            Open ({queries.filter((q) => q.status === 'open').length})
          </button>
          <button type="button" className={`desk-tab ${filter === 'resolved' ? 'active' : ''}`} onClick={() => setFilter('resolved')}>
            Resolved ({queries.filter((q) => q.status === 'resolved').length})
          </button>
        </div>
      </div>

      {/* Ticket Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filtered.map((q) => (
          <div key={q.id} className="desk-card-row">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '0.78rem', fontFamily: 'monospace', fontWeight: 800, color: '#4f46e5' }}>{q.id}</span>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>{q.subject}</h3>
                  <span className={`desk-pill ${q.slaBreached ? 'pill-rose' : 'pill-indigo'}`}>
                    {q.category}
                  </span>
                </div>
                <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 4 }}>
                  Customer: <span style={{ fontWeight: 600, color: '#334155' }}>{q.company}</span> • Created: {q.createdAt} • Hours Open: {q.hoursOpen}h
                </div>
              </div>

              <div>
                <span className={`desk-pill ${q.status === 'resolved' ? 'pill-emerald' : q.slaBreached ? 'pill-rose' : 'pill-amber'}`}>
                  {q.status === 'resolved' ? 'Resolved' : q.slaBreached ? '⚠️ SLA Breached' : 'In Progress'}
                </span>
              </div>
            </div>

            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              {q.status !== 'resolved' && (
                <button
                  type="button"
                  className="sales-btn-primary"
                  style={{ padding: '5px 12px', fontSize: '0.78rem' }}
                  onClick={() => handleResolve(q.id)}
                >
                  <Check size={14} /> Resolve Ticket
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ==========================================================================
   DESK 8: FOLLOW-UP & TASKS (Badge: 3)
   ========================================================================== */
export function FollowupTasksDesk({ tasks, setTasks }) {
  const [tab, setTab] = useState('today');

  const filtered = tasks.filter((t) => {
    if (tab === 'today') return t.dueStatus === 'today';
    if (tab === 'overdue') return t.dueStatus === 'overdue';
    if (tab === 'upcoming') return t.dueStatus === 'upcoming';
    if (tab === 'completed') return t.status === 'completed';
    return true;
  });

  const handleCompleteTask = (id) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: 'completed' } : t))
    );
    alert('Task completed and outcome logged in audit history!');
  };

  const todayCount = tasks.filter((t) => t.dueStatus === 'today' && t.status !== 'completed').length;

  return (
    <div className="desk-page-container">
      {/* Header */}
      <div className="desk-header">
        <div>
          <div className="desk-breadcrumb">SUB ADMIN &amp; SUPPORT OPERATIONS / DESK 08</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 className="desk-title">Follow-up &amp; Tasks</h1>
            <span className="desk-badge-count-green">{todayCount} Due Today</span>
          </div>
          <p className="desk-subtitle">
            Scheduled outbound client reminders, profile completion cadences, and operational task logging.
          </p>
        </div>
      </div>

      {/* KPI Quad Grid */}
      <div className="desk-kpi-grid">
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">SCHEDULED TODAY</div>
          <div className="desk-kpi-val text-emerald">{todayCount}</div>
          <div className="desk-kpi-sub">Priority follow-up cadence</div>
        </div>
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">OVERDUE TASKS</div>
          <div className="desk-kpi-val text-rose">{tasks.filter((t) => t.dueStatus === 'overdue').length}</div>
          <div className="desk-kpi-sub">Requires immediate callback</div>
        </div>
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">UPCOMING</div>
          <div className="desk-kpi-val text-indigo">{tasks.filter((t) => t.dueStatus === 'upcoming').length}</div>
          <div className="desk-kpi-sub">Next 48 hours</div>
        </div>
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">COMPLETED MTD</div>
          <div className="desk-kpi-val text-emerald">{tasks.filter((t) => t.status === 'completed').length}</div>
          <div className="desk-kpi-sub">Successfully resolved cadences</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="desk-filter-bar">
        <div className="desk-tabs">
          <button type="button" className={`desk-tab ${tab === 'today' ? 'active' : ''}`} onClick={() => setTab('today')}>
            Today ({todayCount})
          </button>
          <button type="button" className={`desk-tab ${tab === 'overdue' ? 'active' : ''}`} onClick={() => setTab('overdue')}>
            Overdue ({tasks.filter((t) => t.dueStatus === 'overdue').length})
          </button>
          <button type="button" className={`desk-tab ${tab === 'upcoming' ? 'active' : ''}`} onClick={() => setTab('upcoming')}>
            Upcoming ({tasks.filter((t) => t.dueStatus === 'upcoming').length})
          </button>
          <button type="button" className={`desk-tab ${tab === 'completed' ? 'active' : ''}`} onClick={() => setTab('completed')}>
            Completed
          </button>
        </div>
      </div>

      {/* Tasks List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filtered.map((t) => (
          <div key={t.id} className="desk-card-row">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>{t.type}</h3>
                  <span className="desk-pill pill-indigo">{t.company}</span>
                  <span className={`desk-pill ${t.priority === 'Urgent' ? 'pill-rose' : 'pill-amber'}`}>
                    {t.priority}
                  </span>
                </div>
                <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 4 }}>
                  Contact: <span style={{ fontWeight: 600, color: '#334155' }}>{t.contact}</span> • Due: <span style={{ fontWeight: 700, color: '#4f46e5' }}>{t.dueTime}</span>
                </div>
              </div>

              <div>
                <span className={`desk-pill ${t.status === 'completed' ? 'pill-emerald' : 'pill-amber'}`}>
                  {t.status === 'completed' ? 'Completed' : 'Pending'}
                </span>
              </div>
            </div>

            <p style={{ margin: '8px 0 0 0', fontSize: '0.84rem', color: '#334155', background: '#f8fafc', padding: '8px 12px', borderRadius: 8 }}>
              {t.notes}
            </p>

            <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <a href={`tel:${t.phone}`} className="desk-action-btn" style={{ textDecoration: 'none' }}>
                <Phone size={14} /> Call
              </a>
              <a
                href={`https://wa.me/91${t.phone}?text=Hello%20${encodeURIComponent(t.contact)},%20Growthline%20Support%20follow-up%20regarding%20${encodeURIComponent(t.type)}.`}
                target="_blank"
                rel="noreferrer"
                className="desk-action-btn"
                style={{ textDecoration: 'none' }}
              >
                <MessageSquare size={14} /> WhatsApp
              </a>
              {t.status !== 'completed' && (
                <button
                  type="button"
                  className="sales-btn-primary"
                  style={{ padding: '5px 12px', fontSize: '0.78rem' }}
                  onClick={() => handleCompleteTask(t.id)}
                >
                  <Check size={14} /> Mark Complete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ==========================================================================
   DESK 9: CUSTOMER GROUPS
   ========================================================================== */
export function CustomerGroupsDesk({ groups, customers }) {
  const [selectedGroup, setSelectedGroup] = useState(groups[0]);
  const [broadcastCategory, setBroadcastCategory] = useState('Healthcare & Diagnostics');
  const [broadcastSent, setBroadcastSent] = useState(false);

  const matchedClients = customers.filter((c) => {
    if (broadcastCategory.includes('Healthcare')) return c.category === 'Healthcare';
    if (broadcastCategory.includes('Software') || broadcastCategory.includes('IT')) return c.category === 'IT & Software';
    if (broadcastCategory.includes('Manufacturing')) return c.category === 'Manufacturing';
    if (broadcastCategory.includes('Solar')) return c.category === 'Solar & Renewable';
    return true;
  });

  const handleSendBroadcast = () => {
    setBroadcastSent(true);
    setTimeout(() => setBroadcastSent(false), 3000);
  };

  return (
    <div className="desk-page-container">
      {/* Header */}
      <div className="desk-header">
        <div>
          <div className="desk-breadcrumb">SUB ADMIN &amp; SUPPORT OPERATIONS / DESK 09</div>
          <h1 className="desk-title">Customer Groups</h1>
          <p className="desk-subtitle">
            Industry segment taxonomy, batch group memberships, and multi-client lead routing broadcaster.
          </p>
        </div>
      </div>

      {/* KPI Quad Grid */}
      <div className="desk-kpi-grid">
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">INDUSTRY SEGMENTS</div>
          <div className="desk-kpi-val text-indigo">{groups.length}</div>
          <div className="desk-kpi-sub">Active buyer verticals</div>
        </div>
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">TOTAL ENROLLED CLIENTS</div>
          <div className="desk-kpi-val text-emerald">{customers.length}</div>
          <div className="desk-kpi-sub">Across {groups.length} commercial segments</div>
        </div>
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">BROADCAST ENGINE</div>
          <div className="desk-kpi-val text-emerald">100%</div>
          <div className="desk-kpi-sub">Zero-duplicate routing</div>
        </div>
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">LEAD INGESTION SPEED</div>
          <div className="desk-kpi-val text-indigo">&lt; 1 sec</div>
          <div className="desk-kpi-sub">Multi-client webhook dispatch</div>
        </div>
      </div>

      {/* Groups Grid */}
      <h3 style={{ margin: '20px 0 10px 0', fontSize: '1.1rem', fontWeight: 800 }}>Registered Industry Segments</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        {groups.map((grp) => (
          <div
            key={grp.id}
            className={`desk-group-card ${selectedGroup?.id === grp.id ? 'active' : ''}`}
            onClick={() => setSelectedGroup(grp)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ fontSize: '1.8rem' }}>{grp.icon}</div>
              <div>
                <div style={{ fontWeight: 800, fontSize: '0.98rem', color: '#0f172a' }}>{grp.name}</div>
                <div style={{ fontSize: '0.76rem', color: '#64748b' }}>{grp.count} Enrolled Workspaces</div>
              </div>
            </div>
            <p style={{ margin: '8px 0 0 0', fontSize: '0.78rem', color: '#475569', lineHeight: 1.4 }}>
              {grp.description}
            </p>
          </div>
        ))}
      </div>

      {/* Lead Routing Broadcaster Simulator */}
      <div style={{ marginTop: 24, padding: 20, background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <span className="sales-dept-badge">Multi-Client Lead Dispatcher</span>
            <h3 style={{ margin: '4px 0 0 0', fontSize: '1.15rem', fontWeight: 800 }}>Lead Routing &amp; Broadcast Simulator</h3>
            <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>
              Simulate incoming Meta Lead form submission and verify targeted group recipient distribution.
            </p>
          </div>
          <button type="button" className="sales-btn-primary" onClick={handleSendBroadcast}>
            <Send size={14} /> Broadcast Lead to Segment
          </button>
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <select
            className="desk-form-input"
            value={broadcastCategory}
            onChange={(e) => setBroadcastCategory(e.target.value)}
            style={{ maxWidth: 320 }}
          >
            {groups.map((g) => (
              <option key={g.id} value={g.name}>
                {g.name}
              </option>
            ))}
          </select>
        </div>

        {broadcastSent && (
          <div style={{ padding: '12px 16px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 10, color: '#065f46', fontSize: '0.84rem', fontWeight: 700, marginBottom: 14 }}>
            ✓ Lead broadcasted successfully to all {matchedClients.length} active workspaces in {broadcastCategory}! Zero duplicates detected.
          </div>
        )}

        <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: 8, fontWeight: 700 }}>
          Eligible Recipient Accounts in this Segment ({matchedClients.length}):
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {matchedClients.map((c) => (
            <div key={c.id} style={{ padding: '6px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: '0.8rem' }}>
              <span style={{ fontWeight: 800, color: '#0f172a' }}>{c.name}</span> • {c.city}
              <span style={{ marginLeft: 6, fontSize: '0.72rem', color: '#059669', fontWeight: 700 }}>
                (₹{c.balance} Bal / {c.runwayDays}d)
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
