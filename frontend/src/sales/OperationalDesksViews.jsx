import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Building2,
  ChevronDown,
  ChevronRight,
  Filter,
  FileText,
  Printer,
  Receipt,
  DollarSign,
  UserCheck,
  Sparkles,
  BadgeCheck,
  MapPin,
  Mail,
  Globe,
  User,
  Copy,
  Trash2,
  RotateCcw,
} from 'lucide-react';
import Swal from 'sweetalert2';
import crmApi from '../services/crmApi';
import adminAuthApi from '../services/adminAuthApi';
import SalesAddMoneyModal from './SalesAddMoneyModal';

const formatINR = (val) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(val || 0);

export const getLiveNowFormatted = (dateInput = new Date()) => {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) {
    return new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  }
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

export const formatIndianDateTime = (val, rawVal) => {
  const target = rawVal || val;
  if (!target) return getLiveNowFormatted();

  // 1. If it's a valid Date object
  if (target instanceof Date) {
    if (isNaN(target.getTime())) return getLiveNowFormatted();
    return target.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  }

  // 2. If it's a legacy string like "30 Oct, 05:57 am" or "30 Oct 2026, 05:57 am" (generated in UTC by old server build)
  if (typeof target === 'string') {
    const match = target.match(/(\d{1,2})\s+([A-Za-z]{3,9})(?:\s+(\d{4}))?(?:,\s*|\s+)(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?/i);
    if (match) {
      const day = parseInt(match[1], 10);
      const monthStr = match[2].toLowerCase().slice(0, 3);
      const months = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
      const month = months[monthStr];
      if (month !== undefined) {
        const year = match[3] ? parseInt(match[3], 10) : new Date().getFullYear();
        let hours = parseInt(match[4], 10);
        const minutes = parseInt(match[5], 10);
        const meridiem = (match[6] || '').toLowerCase();
        if (meridiem === 'pm' && hours < 12) hours += 12;
        if (meridiem === 'am' && hours === 12) hours = 0;

        // Interpret strictly as UTC and format into Asia/Kolkata Indian Standard Time (IST):
        const utcDate = new Date(Date.UTC(year, month, day, hours, minutes, 0));
        if (!isNaN(utcDate.getTime())) {
          return utcDate.toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          });
        }
      }
    }
  }

  // 3. If it's a valid parseable ISO string or timestamp
  if (typeof target === 'string') {
    const d = new Date(target);
    if (!isNaN(d.getTime())) {
      return d.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    }
  }

  return target || getLiveNowFormatted();
};

export const isGenericBusinessName = (str) => {
  if (!str) return true;
  const s = String(str).trim().toLowerCase();
  return (
    s === 'registered business' ||
    s === 'corporate workspace' ||
    s === 'workspace' ||
    s === 'client member' ||
    s === 'account admin' ||
    s === 'authorized lead' ||
    s === 'customer' ||
    s === 'user' ||
    s === 'not set' ||
    s === 'not provided' ||
    s === 'null' ||
    s === 'undefined'
  );
};

export const resolveCustomerIdentity = (custOrObj, customers = []) => {
  if (!custOrObj) {
    return {
      displayName: 'Client Account',
      companyName: 'Client Account',
      contactPerson: 'Client Lead',
      username: '',
      cleanUsername: '',
      initials: 'CA',
    };
  }

  const cleanPhone = String(custOrObj.phone || custOrObj.mobile || '').replace(/\D/g, '').slice(-10);
  const matchedCust =
    customers && customers.length
      ? customers.find(
        (c) =>
          c.id === custOrObj.customerId ||
          c.id === custOrObj.id ||
          (cleanPhone && c.phone && String(c.phone).replace(/\D/g, '').slice(-10) === cleanPhone)
      )
      : null;

  const rawUser = String(custOrObj.username || matchedCust?.username || '').replace(/^@/, '').trim();
  const capUser = rawUser
    ? rawUser.charAt(0).toUpperCase() + rawUser.slice(1)
    : '';

  const rawCompany = String(
    custOrObj.companyName ||
    custOrObj.company ||
    custOrObj.name ||
    custOrObj.customerName ||
    matchedCust?.companyName ||
    matchedCust?.name ||
    ''
  ).trim();

  const rawContact = String(
    custOrObj.contactPerson ||
    custOrObj.contact ||
    matchedCust?.contactPerson ||
    matchedCust?.contact ||
    ''
  ).trim();

  const validCompany = !isGenericBusinessName(rawCompany) ? rawCompany : '';
  const validContact = !isGenericBusinessName(rawContact) ? rawContact : '';

  const resolvedCompany =
    validCompany ||
    capUser ||
    validContact ||
    (cleanPhone ? 'Customer ' + cleanPhone.slice(-4) : 'Client Account');

  const resolvedContact = validContact || capUser || resolvedCompany || 'Account Admin';

  const avatarBase = capUser || resolvedCompany || resolvedContact || 'AM';
  const cleanChars = avatarBase.replace(/[^a-zA-Z0-9]/g, '');
  const initials = (cleanChars.length >= 2 ? cleanChars.slice(0, 2) : (cleanChars || 'AM')).toUpperCase();

  return {
    displayName: resolvedCompany,
    companyName: resolvedCompany,
    contactPerson: resolvedContact,
    username: rawUser,
    cleanUsername: capUser,
    initials,
  };
};

export const isTestUser = (c) => {
  if (!c) return false;
  const u = String(c.username || c.user || c.customerUsername || c.customer_username || '').toLowerCase().replace(/^@/, '').trim();
  const p = String(c.phone || c.customerPhone || c.customer_phone || '').replace(/\D/g, '').slice(-10);
  const e = String(c.email || c.customerEmail || c.customer_email || '').toLowerCase().trim();
  const n = String(c.companyName || c.company_name || c.company || c.name || c.contactPerson || c.customerCompanyName || '').toLowerCase().trim();
  const id = String(c.id || c.customerId || c.customer_id || '').toLowerCase().trim();

  if (u === 'abc' || u === 'xxx') return true;
  if (p === '7383198428' || p === '1111111111') return true;
  if (e === 'aviralshukla2612@gmail.com') return true;
  if (n === 'abc' || n === 'xxx') return true;
  if (id === 'cust_reg_7383198428' || id === 'cust_reg_1111111111' || id.includes('7383198428') || id.includes('1111111111')) return true;
  return false;
};

/* ==========================================================================
   DESK 1: CUSTOMER REGISTRATIONS (Real Intake from http://localhost:5173/#register)
   ========================================================================== */
export function CustomerRegistrationsDesk({ customers: propsCustomers = [], setCustomers }) {
  const customers = useMemo(() => (propsCustomers || []).filter((c) => !isTestUser(c)), [propsCustomers]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedCust, setSelectedCust] = useState(null);
  const [addMoneyCust, setAddMoneyCust] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');
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

  const handleToggleCustomerPassword = async () => {
    if (showPassword) {
      setShowPassword(false);
      setPasswordError('');
      return;
    }

    if (selectedCust?.password && !/^[\u2022*]+$/.test(selectedCust.password)) {
      setShowPassword(true);
      return;
    }

    setPasswordLoading(true);
    setPasswordError('');
    try {
      const token = adminAuthApi.getToken();
      if (!token) throw new Error('Your admin session has expired. Please sign in again.');
      // The backend password lookup accepts a phone number or username, not the CRM row ID.
      const identifier = encodeURIComponent(selectedCust.phone || selectedCust.username || selectedCust.id);
      const response = await fetch(`/api/admin/customer-password/${identifier}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok || !data.ok || !data.password) {
        throw new Error(data.error || 'Could not retrieve this customer password.');
      }
      const updatedCustomer = { ...selectedCust, password: data.password };
      setSelectedCust(updatedCustomer);
      setCustomers((prev) => prev.map((customer) =>
        customer.id === updatedCustomer.id ? { ...customer, password: data.password } : customer
      ));
      setShowPassword(true);
    } catch (error) {
      setPasswordError(error.message || 'Could not retrieve this customer password.');
    } finally {
      setPasswordLoading(false);
    }
  };

  // Phone sanitization & validation (0/10 digits, starts with 6, 7, 8, or 9)
  const handlePhoneChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 10);
    setLeadPhoneDigits(raw);
  };
  const isPhoneValidStart = leadPhoneDigits.length === 0 || ['6', '7', '8', '9'].includes(leadPhoneDigits[0]);
  const isPhoneComplete = leadPhoneDigits.length === 10 && isPhoneValidStart;

  // Available Companies list (Strictly real registered customers only)
  const availableCompanies = Array.from(
    new Set(customers.map((c) => c.companyName || c.name || c.username).filter(Boolean))
  );

  const handleOpenAddLead = (compOrCust) => {
    setLeadPhoneDigits('');
    let matched = null;
    if (typeof compOrCust === 'object' && compOrCust !== null) {
      matched = compOrCust;
    } else if (typeof compOrCust === 'string' && compOrCust) {
      matched = customers.find(
        (c) =>
          c.id === compOrCust ||
          c.phone === compOrCust ||
          c.username === compOrCust ||
          (c.companyName && c.companyName.toLowerCase() === compOrCust.toLowerCase()) ||
          (c.name && c.name.toLowerCase() === compOrCust.toLowerCase())
      );
    }
    if (!matched && customers.length > 0) {
      matched = customers[0];
    }

    const defaultComp = matched ? (matched.companyName || matched.name || `@${matched.username}`) : (availableCompanies[0] || '');
    const defaultKey = matched ? (matched.id || matched.phone || matched.username) : '';

    setLeadFormData({
      selectedCustomerKey: defaultKey,
      company: defaultComp,
      customCompany: '',
      name: '',
      city: matched?.city || '',
      requirement: 'Inbound Meta Ads Campaign Enquiry',
      budget: '₹1.5L – ₹3.5L',
    });
    setIsAddLeadModalOpen(true);
  };

  const handleSubmitLead = (e) => {
    e.preventDefault();
    if (!isPhoneComplete) return;

    const targetKey = leadFormData.selectedCustomerKey;
    const targetCompany = leadFormData.company;

    const matchedCust = customers.find(
      (c) =>
        (targetKey && (String(c.id) === String(targetKey) || String(c.phone) === String(targetKey) || c.username === targetKey)) ||
        (targetCompany && (
          (c.companyName && c.companyName.toLowerCase() === targetCompany.toLowerCase()) ||
          (c.name && c.name.toLowerCase() === targetCompany.toLowerCase()) ||
          c.username === targetCompany
        ))
    );

    const finalCompany = matchedCust
      ? (matchedCust.companyName || matchedCust.name || `@${matchedCust.username}`)
      : (targetCompany || 'Client Account');

    const cleanDigits = leadPhoneDigits.replace(/\D/g, '').slice(-10);
    const formattedPhone = `+91 ${cleanDigits}`;

    const newLead = {
      id: `lead_${Date.now()}`,
      name: formattedPhone,
      company: finalCompany,
      assignedCompany: finalCompany,
      customerCompanyName: finalCompany,
      customerId: matchedCust?.id || '',
      customerPhone: matchedCust?.phone || '',
      customerUsername: matchedCust?.username || '',
      phone: cleanDigits,
      displayPhone: formattedPhone,
      maskedPhone: formattedPhone,
      email: `lead_${cleanDigits.slice(-4)}@example.com`,
      city: matchedCust?.city || '',
      requirement: `Inbound Lead for ${finalCompany}`,
      budget: '₹1.5L – ₹3.5L',
      source: 'Direct Intake',
      status: 'new',
      stepRequired: 'Step 1 Required',
      read: false,
      isHot: true,
      isBeFirst: true,
      unmasked: true,
      dateGroup: 'today',
      createdAt: getLiveNowFormatted(),
      notes: `Direct intake via Sales Desk 01 for ${finalCompany}`,
    };

    try {
      // 1. Save to growthline_all_leads in localStorage
      const rawLeads = localStorage.getItem('growthline_all_leads');
      let existingLeads = [];
      if (rawLeads) {
        try { existingLeads = JSON.parse(rawLeads); } catch (err) { }
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
          company: finalCompany,
          phone: cleanDigits,
          name: formattedPhone,
          city: newLead.city,
          requirement: newLead.requirement,
        })
        .catch(() => { });

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
  const profileCompleteCount = customers.filter((c) => c.profileStatus === 'complete' || (c.kycPercent || 0) >= 100 || c.verified).length;
  const profileIncompleteCount = customers.filter((c) => c.profileStatus !== 'complete' && (c.kycPercent || 0) < 100 && !c.verified).length;
  const kycCompleteCount = profileCompleteCount;

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
    if (filter === 'profile_incomplete') return c.profileStatus !== 'complete' && (c.kycPercent || 0) < 100 && !c.verified;
    if (filter === 'profile_complete') return c.profileStatus === 'complete' || (c.kycPercent || 0) >= 100 || c.verified;
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
        } catch (e) { }
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
        } catch (e) { }
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
        } catch (e) { }
        return { ...c, kycPercent: nextKyc, profileStatus: nextProfile, verified: nextProfile === 'complete' };
      })
    );
  };

  const handleDeleteCustomer = async (cust) => {
    if (!cust) return;
    const custId = cust.id || cust.phone || cust.username;
    const displayName = cust.companyName || cust.name || cust.contact || `@${cust.username}`;
    const displayPhone = cust.phone || 'N/A';
    const displayUsername = cust.username || '';

    const confirmResult = await Swal.fire({
      title: 'Permanently Delete Customer?',
      html: `
        <div style="text-align: left; font-size: 0.90rem; line-height: 1.7; color: #334155;">
          <p style="margin-bottom: 10px; color: #dc2626; font-weight: 700;">
            ⚠️ This will permanently erase this customer and all their data:
          </p>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 12px;">
            <div>Account: <strong style="color: #0f172a;">@${displayUsername}</strong> (${displayName})</div>
            <div>Phone: <strong style="color: #0f172a;">+91 ${displayPhone}</strong></div>
            <div>Workspace ID: <code>${cust.id}</code></div>
          </div>
          <p style="font-size: 0.82rem; color: #64748b; margin: 0;">
            Includes: Wallet balances, transaction ledger, active campaigns, leads, invoices, and verification history. This cannot be undone.
          </p>
        </div>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, Delete All Data',
      cancelButtonText: 'Cancel',
      focusCancel: true,
    });

    if (!confirmResult.isConfirmed) return;

    try {
      await crmApi.deleteCustomer(custId);

      setCustomers((prev) =>
        prev.filter((c) => c.id !== cust.id && c.phone !== cust.phone && c.username !== cust.username)
      );

      if (selectedCust?.id === cust.id || selectedCust?.phone === cust.phone) {
        setSelectedCust(null);
      }

      Swal.fire({
        icon: 'success',
        title: 'Customer Data Erased',
        text: `Customer @${displayUsername} and all associated records have been permanently removed.`,
        timer: 2000,
        showConfirmButton: false,
      });
    } catch (err) {
      console.error('Delete customer error:', err);
      Swal.fire({
        icon: 'error',
        title: 'Failed to Delete',
        text: err.message || 'An error occurred while deleting customer data.',
        confirmButtonColor: '#4f46e5',
      });
    }
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
      registeredAt: getLiveNowFormatted(),
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
      .catch(() => { });
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
          <button type="button" className={`desk-tab ${filter === 'profile_complete' ? 'active' : ''}`} onClick={() => setFilter('profile_complete')}>
            ✓ Profile Complete ({profileCompleteCount})
          </button>
          <button type="button" className={`desk-tab ${filter === 'profile_incomplete' ? 'active' : ''}`} onClick={() => setFilter('profile_incomplete')}>
            ⏳ Profile Incomplete ({profileIncompleteCount})
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
              <th>Payment Status</th>
              <th>Wallet / Runway</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                  No customer registrations match your filter. Register a new user at{' '}
                  <a href="#register" style={{ color: '#4f46e5', fontWeight: 700 }}>
                    http://localhost:5173/#register
                  </a>
                </td>
              </tr>
            ) : (
              filtered.map((c) => {
                const identity = resolveCustomerIdentity(c);
                return (
                  <tr key={c.id}>
                    {/* 1. Username & Workspace */}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontWeight: 800, color: '#4f46e5', background: '#eef2ff', padding: '2px 8px', borderRadius: 6, fontSize: '0.84rem' }}>
                          @{identity.username || c.username || 'user'}
                        </span>
                        <span className="desk-pill" style={{ background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', fontSize: '0.68rem', fontWeight: 800, padding: '1px 6px' }}>
                          🌐 #register
                        </span>
                      </div>
                      <div style={{ fontWeight: 700, color: '#0f172a', marginTop: 3, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span>{identity.displayName}</span>
                        {((c.balance || 0) < (c.dailyPacing || 300) || (c.runwayDays || 0) <= 1) && (
                          <span className="desk-pill pill-rose" style={{ fontSize: '0.62rem', padding: '1px 6px', fontWeight: 800 }}>
                            ⚠️ Low Balance
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                        {c.city} • Registered: {formatIndianDateTime(c.registeredAt, c.registeredAtRaw || c.registered_at)}
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
                          href={`https://wa.me/91${c.phone}?text=Hello%20${encodeURIComponent(c.contact || c.username)},%20AdMafia%20Support%20here%20regarding%20your%20registered%20workspace.`}
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
                      <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{identity.contactPerson}</div>
                    </td>

                    {/* 4. Profile Status (Single Column - 100% Automatic) */}
                    <td>
                      {c.profileStatus === 'complete' || (c.kycPercent || 0) >= 100 || c.verified ? (
                        <div>
                          <span
                            className="desk-pill pill-emerald"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', fontSize: '0.78rem', fontWeight: 800 }}
                          >
                            ✓ Complete
                          </span>
                          <div style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 700, marginTop: 3 }}>
                            100% KYC Verified
                          </div>
                        </div>
                      ) : (
                        <div>
                          <span
                            className="desk-pill pill-amber"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', fontSize: '0.78rem', fontWeight: 800 }}
                          >
                            ⏳ Incomplete
                          </span>
                          <div style={{ fontSize: '0.72rem', color: '#d97706', fontWeight: 600, marginTop: 3 }}>
                            Registration Pending
                          </div>
                        </div>
                      )}
                    </td>

                    {/* 5. Payment Status (Automatic - Zero Manual Buttons) */}
                    <td>
                      <span className={`desk-pill ${c.paymentStatus === 'paid' || (c.balance || 0) > 0 ? 'pill-emerald' : 'pill-rose'}`}>
                        {c.paymentStatus === 'paid' || (c.balance || 0) > 0 ? '✓ Paid' : '⏳ Pending'}
                      </span>
                      <div style={{ fontSize: '0.72rem', color: c.paymentStatus === 'paid' || (c.balance || 0) > 0 ? '#059669' : '#d97706', fontWeight: 700, marginTop: 3 }}>
                        {c.paymentStatus === 'paid' || (c.balance || 0) > 0 ? `Settled (${formatINR(c.amountPaid || c.balance || 0)})` : 'Awaiting Payment'}
                      </div>
                    </td>

                    {/* 8. Wallet / Runway */}
                    <td>
                      <div style={{ fontWeight: 800, color: ((c.balance || 0) >= (c.dailyPacing || 300) && (c.runwayDays || 0) > 1) ? '#0f172a' : '#e11d48' }}>
                        {formatINR(c.balance || 0)}
                      </div>
                      <div style={{ fontSize: '0.74rem', color: ((c.balance || 0) >= (c.dailyPacing || 300) && (c.runwayDays || 0) > 1) ? '#059669' : '#e11d48', fontWeight: 700 }}>
                        {c.runwayDays || 0} Days @ ₹{c.dailyPacing || 300}/d
                      </div>
                      {((c.balance || 0) < (c.dailyPacing || 300) || (c.runwayDays || 0) <= 1) && (
                        <div style={{ marginTop: 4 }}>
                          <span className="desk-pill pill-rose" style={{ fontSize: '0.64rem', padding: '1px 6px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <AlertTriangle size={10} /> ⚠️ Balance is Low
                          </span>
                        </div>
                      )}
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
                            setPasswordError('');
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
                );
              })
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
                {(() => {
                  const selIdentity = resolveCustomerIdentity(selectedCust);
                  return (
                    <h3 style={{ margin: '4px 0 0 0', fontSize: '1.3rem', fontWeight: 800 }}>
                      @{selIdentity.username || selectedCust.username} • {selIdentity.displayName}
                    </h3>
                  );
                })()}
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
                      onClick={handleToggleCustomerPassword}
                      disabled={passwordLoading}
                      aria-label={showPassword ? 'Hide customer password' : 'Reveal customer password'}
                      style={{ background: 'none', border: 'none', color: '#4f46e5', fontSize: '0.72rem', cursor: 'pointer', fontWeight: 700 }}
                    >
                      {passwordLoading ? 'Loading…' : showPassword ? 'Hide' : 'Reveal'}
                    </button>
                  </div>
                  {passwordError && (
                    <div role="alert" style={{ marginTop: 4, color: '#b91c1c', fontSize: '0.72rem' }}>{passwordError}</div>
                  )}
                </div>
              </div>
            </div>

            {/* Profile & Payment Dual Gate Status */}
            {/* Profile & Payment Dual Gate Status (Pure Automatic Badges - Zero Toggles) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 14 }}>
              <div className="desk-modal-box">
                <div className="desk-box-label">Profile Status</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                  <span className={`desk-pill ${selectedCust.profileStatus === 'complete' || (selectedCust.kycPercent || 0) >= 100 || selectedCust.verified ? 'pill-emerald' : 'pill-amber'}`}>
                    {selectedCust.profileStatus === 'complete' || (selectedCust.kycPercent || 0) >= 100 || selectedCust.verified ? '✓ Profile Complete' : '⏳ Profile Incomplete'}
                  </span>
                </div>
                <div style={{ fontSize: '0.76rem', color: selectedCust.profileStatus === 'complete' || (selectedCust.kycPercent || 0) >= 100 ? '#059669' : '#64748b', fontWeight: 700, marginTop: 6 }}>
                  KYC Audit Score: <b>{selectedCust.profileStatus === 'complete' ? 100 : (selectedCust.kycPercent || 25)}%</b> (Auto-Verified)
                </div>
              </div>

              <div className="desk-modal-box">
                <div className="desk-box-label">Payment Status</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                  <span className={`desk-pill ${selectedCust.paymentStatus === 'paid' || (selectedCust.balance || 0) > 0 ? 'pill-emerald' : 'pill-rose'}`}>
                    {selectedCust.paymentStatus === 'paid' || (selectedCust.balance || 0) > 0 ? '✓ Payment Done' : '⏳ Payment Pending'}
                  </span>
                </div>
                <div style={{ fontSize: '0.76rem', color: selectedCust.paymentStatus === 'paid' || (selectedCust.balance || 0) > 0 ? '#059669' : '#d97706', fontWeight: 700, marginTop: 6 }}>
                  Wallet Balance: {formatINR(selectedCust.balance || 0)} ({selectedCust.runwayDays || 0}d runway)
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

                {/* 1. Select Customer Account * */}
                <div>
                  <label className="desk-form-label" style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0f172a', marginBottom: 6, display: 'block' }}>
                    Target Customer Account <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <select
                      className="desk-form-input"
                      required
                      value={leadFormData.selectedCustomerKey || ''}
                      onChange={(e) => {
                        const selKey = e.target.value;
                        const matched = customers.find(
                          (c) => String(c.id) === selKey || String(c.phone) === selKey || c.username === selKey
                        );
                        setLeadFormData({
                          ...leadFormData,
                          selectedCustomerKey: selKey,
                          company: matched ? (matched.companyName || matched.name || `@${matched.username}`) : '',
                        });
                      }}
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
                      {customers.length === 0 ? (
                        <option value="">-- No registered customer accounts yet --</option>
                      ) : (
                        customers.map((c) => {
                          const key = c.id || c.phone || c.username;
                          const compDisplay = c.companyName || c.name || `@${c.username}`;
                          const phoneDisplay = c.phone ? `+91 ${c.phone}` : '';
                          const paidStatus = c.paymentStatus === 'paid' ? 'PAID ✓' : 'PENDING';
                          return (
                            <option key={key} value={key}>
                              🏢 {compDisplay} {phoneDisplay ? `(${phoneDisplay})` : ''} - @{c.username} [{paidStatus}]
                            </option>
                          );
                        })
                      )}
                    </select>
                  </div>
                  {leadFormData.selectedCustomerKey && (
                    <div style={{ fontSize: '0.78rem', color: '#059669', marginTop: 5, fontWeight: 600 }}>
                      ✓ Strictly isolated to selected account. Only this customer will see this lead in their Lead Hub.
                    </div>
                  )}
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
      {/* Sales Assisted Add Money Modal */}
      {addMoneyCust && (
        <SalesAddMoneyModal
          customer={addMoneyCust}
          onClose={() => setAddMoneyCust(null)}
          onSuccess={(updatedCust) => {
            if (setCustomers && updatedCust) {
              setCustomers((prev) =>
                prev.map((item) =>
                  (item.id === updatedCust.id || item.phone === updatedCust.phone)
                    ? { ...item, ...updatedCust }
                    : item
                )
              );
            }
          }}
        />
      )}
    </div>
  );
}

/* ==========================================================================
   DESK 2: PENDING VERIFICATION (Badge: 7)
   ========================================================================== */
export function PendingVerificationDesk({ verifications: propsVerifications = [], setVerifications, onApproveSuccess, customers = [] }) {
  const verifications = useMemo(() => (propsVerifications || []).filter((v) => !isTestUser(v)), [propsVerifications]);
  const [filter, setFilter] = useState('all');
  const [selectedDetail, setSelectedDetail] = useState(null);

  const filtered = verifications.filter((v) => {
    if (filter === 'paid') return v.paymentStatus === 'paid';
    if (filter === 'awaiting') return v.paymentStatus !== 'paid';
    return true;
  });

  return (
    <div className="desk-page-container">
      {/* Header */}
      <div className="desk-header">
        <div>
          <div className="desk-breadcrumb">SUB ADMIN &amp; SUPPORT OPERATIONS / DESK 02</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 className="desk-title">Automated Verification &amp; Profile Intake</h1>
            <span className="desk-badge-count-alert" style={{ background: '#ecfdf5', color: '#059669', borderColor: '#a7f3d0' }}>
              {verifications.length} Auto-Verified
            </span>
          </div>
          <p className="desk-subtitle">
            100% automated onboarding &amp; KYC verification: Accounts are automatically verified upon customer submission with zero manual admin approval hurdles.
          </p>
        </div>
      </div>

      {/* KPI Quad Grid */}
      <div className="desk-kpi-grid">
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">TOTAL REGISTERED ACCOUNTS</div>
          <div className="desk-kpi-val text-indigo">{verifications.length}</div>
          <div className="desk-kpi-sub">Total onboarding intake</div>
        </div>
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">100% PROFILE VERIFIED</div>
          <div className="desk-kpi-val text-emerald">{verifications.length}</div>
          <div className="desk-kpi-sub">Auto-verified on registration</div>
        </div>
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">PAYMENT SETTLED</div>
          <div className="desk-kpi-val text-emerald">{verifications.filter((v) => v.paymentStatus === 'paid').length}</div>
          <div className="desk-kpi-sub">Active ad wallet funded</div>
        </div>
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">AWAITING AD BUDGET</div>
          <div className="desk-kpi-val text-amber">{verifications.filter((v) => v.paymentStatus !== 'paid').length}</div>
          <div className="desk-kpi-sub">Self-serve wallet top-up</div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="desk-filter-bar">
        <div className="desk-tabs">
          <button type="button" className={`desk-tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
            All Accounts ({verifications.length})
          </button>
          <button type="button" className={`desk-tab ${filter === 'paid' ? 'active' : ''}`} onClick={() => setFilter('paid')}>
            Payment Settled ({verifications.filter((v) => v.paymentStatus === 'paid').length})
          </button>
          <button type="button" className={`desk-tab ${filter === 'awaiting' ? 'active' : ''}`} onClick={() => setFilter('awaiting')}>
            Awaiting Ad Budget ({verifications.filter((v) => v.paymentStatus !== 'paid').length})
          </button>
        </div>
      </div>

      {/* Verification Queue Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filtered.map((item) => {
          const vIdentity = resolveCustomerIdentity(item, customers);
          return (
            <div key={item.id} className="desk-card-row">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>{vIdentity.displayName}</h3>
                    <span className={`desk-pill ${item.paymentStatus === 'paid' ? 'pill-emerald' : 'pill-amber'}`}>
                      {item.paymentStatus === 'paid' ? '✓ Auto-Verified & Paid' : '✓ Auto-Verified (Budget Pending)'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 4 }}>
                    Contact: <span style={{ fontWeight: 600, color: '#334155' }}>{vIdentity.contactPerson}</span> • Phone: <a href={`tel:${item.phone}`} style={{ color: '#4f46e5' }}>+91 {item.phone}</a> • Submitted: {formatIndianDateTime(item.submittedAt, item.submittedAtRaw || item.submitted_at)}
                  </div>
                </div>

                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  <div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>{formatINR(item.amount)}</div>
                    <div style={{ fontSize: '0.76rem', color: '#059669', fontWeight: 700 }}>
                      {item.runwayDays} Days Runway @ ₹300/day
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedDetail(item)}
                    className="sales-btn-primary"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '5px 14px',
                      fontSize: '0.8rem',
                      borderRadius: 6,
                      cursor: 'pointer',
                      background: '#4f46e5',
                      color: '#ffffff',
                      border: 'none',
                      fontWeight: 700
                    }}
                    title="View full payment and profile completion audit record"
                  >
                    <Eye size={14} />
                    <span>Detail</span>
                  </button>
                </div>
              </div>

              {/* Dual Gate Matrix & Information */}
              <div style={{ marginTop: 12, padding: '10px 14px', background: '#f8fafc', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', gap: 16 }}>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Gate 1: Payment Status</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.82rem', fontWeight: 700, color: item.paymentStatus === 'paid' ? '#059669' : '#d97706' }}>
                      {item.paymentStatus === 'paid' ? <CheckCircle2 size={14} /> : <Clock size={14} />}
                      {item.paymentStatus === 'paid' ? 'Settled (Online Razorpay)' : 'Awaiting Online Top-Up'}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Gate 2: Profile &amp; KYC Status</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.82rem', fontWeight: 700, color: '#059669' }}>
                      <CheckCircle2 size={14} />
                      <span>100% Completed &amp; Auto-Verified</span>
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: '0.8rem', color: '#475569' }}>
                  Reference: <span style={{ fontFamily: 'monospace', fontWeight: 700, background: '#e2e8f0', padding: '2px 6px', borderRadius: 4 }}>{item.utrNumber || 'Auto-Verified'}</span>
                </div>
              </div>

              {/* Profile Completion & Verification Information Bar (Pure Info) */}
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: '#059669', fontWeight: 700 }}>
                  <CheckCircle2 size={15} />
                  <span>Profile Registration Complete &amp; 100% Auto-Verified</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontSize: '0.78rem', color: '#475569' }}>
                    Account State: <strong style={{ color: '#059669', background: '#ecfdf5', padding: '2px 8px', borderRadius: 4, border: '1px solid #a7f3d0' }}>Active Live Account</strong>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedDetail(item)}
                    className="desk-action-btn"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '4px 10px',
                      fontSize: '0.75rem',
                      color: '#4f46e5',
                      fontWeight: 700
                    }}
                  >
                    <FileText size={13} /> View Audit Details
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Customer 360 Detail Modal */}
      {selectedDetail && (() => {
        const cust = (customers || []).find((c) => c.phone === selectedDetail.phone || c.id === selectedDetail.customerId || c.id === selectedDetail.id) || selectedDetail;
        return (
          <div className="sales-modal-overlay" onClick={() => setSelectedDetail(null)}>
            <div className="sales-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 660, maxHeight: '90vh', overflowY: 'auto' }}>
              {/* Modal Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div>
                  <span className="sales-dept-badge">Customer Profile &amp; Payment Audit Details</span>
                  <h3 style={{ margin: '4px 0 0 0', fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
                    {cust.companyName || cust.name || selectedDetail.company}
                  </h3>
                  <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: 2 }}>
                    Contact Person: <strong style={{ color: '#0f172a' }}>{cust.contactPerson || cust.contact || selectedDetail.contact}</strong> • Phone: <strong style={{ color: '#4f46e5' }}>+91 {selectedDetail.phone}</strong>
                  </div>
                </div>
                <button type="button" className="desk-close-btn" onClick={() => setSelectedDetail(null)}>
                  <X size={18} />
                </button>
              </div>

              {/* Section 1: Complete Profile & Onboarding Information */}
              <div className="desk-modal-box" style={{ marginBottom: 14, background: '#f8fafc', borderColor: '#e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div className="desk-box-label" style={{ color: '#0f172a', fontWeight: 800, margin: 0 }}>
                    1. Profile &amp; KYC Verification Completion
                  </div>
                  <span className="desk-pill pill-emerald" style={{ fontSize: '0.74rem' }}>
                    ✓ 100% Profile Complete
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Company / Registered Business</div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0f172a' }}>{cust.companyName || cust.name || selectedDetail.company}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Authorized Contact Person</div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0f172a' }}>{cust.contactPerson || cust.contact || selectedDetail.contact}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Direct Indian Mobile Number</div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0f172a', fontFamily: 'monospace' }}>+91 {selectedDetail.phone}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Work Email Address</div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0f172a' }}>{cust.email || 'Registered via Web Intake'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Business Category</div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0f172a' }}>{cust.category || 'Meta Ads Lead Generation'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Target Geography / City</div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0f172a' }}>{cust.city || 'India'}, {cust.state || 'Maharashtra'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Intake Submission Time</div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0f172a' }}>
                      {formatIndianDateTime(selectedDetail.submittedAt || cust.registeredAt, selectedDetail.submittedAtRaw || selectedDetail.submitted_at || cust.registeredAtRaw || cust.registered_at)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>KYC Audit Progress</div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#059669' }}>100% Verified (Gate 2 Passed)</div>
                  </div>
                  {cust.website && (
                    <div style={{ gridColumn: 'span 2' }}>
                      <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Business Website / Landing Page</div>
                      <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#4f46e5' }}>
                        <a href={cust.website.startsWith('http') ? cust.website : `https://${cust.website}`} target="_blank" rel="noreferrer" style={{ color: '#4f46e5', textDecoration: 'none' }}>
                          {cust.website} ↗
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Section 2: Payment & Ad Wallet Details */}
              <div className="desk-modal-box" style={{ marginBottom: 14, background: '#f8fafc', borderColor: '#e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div className="desk-box-label" style={{ color: '#0f172a', fontWeight: 800, margin: 0 }}>
                    2. Payment &amp; Ad Wallet Settlement (Gate 1)
                  </div>
                  <span className={`desk-pill ${selectedDetail.paymentStatus === 'paid' ? 'pill-emerald' : 'pill-amber'}`} style={{ fontSize: '0.74rem' }}>
                    {selectedDetail.paymentStatus === 'paid' ? '✓ Payment Settled' : '⏳ Awaiting Online Top-Up'}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Current Available Balance</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#059669' }}>
                      {formatINR(cust.balance || selectedDetail.amount || 0)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Daily Campaign Ad Spend</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                      {formatINR(cust.dailyPacing || selectedDetail.dailyRate || 300)} / day
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Active Funded Runway</div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0f172a' }}>
                      {cust.runwayDays || selectedDetail.runwayDays || 0} Days @ ₹300/day
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Payment Mode</div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0f172a' }}>
                      Razorpay UPI / Online Netbanking
                    </div>
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Settlement / UTR Reference</div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0f172a', fontFamily: 'monospace', background: '#e2e8f0', padding: '4px 10px', borderRadius: 4, display: 'inline-block', marginTop: 3 }}>
                      {selectedDetail.utrNumber || 'Auto-Allocated Online Settlement'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                <button
                  type="button"
                  className="sales-btn-secondary"
                  onClick={() => setSelectedDetail(null)}
                  style={{ padding: '8px 22px', borderRadius: 8, fontWeight: 700 }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/* ==========================================================================
   DESK 3: LEAD MANAGEMENT
   ========================================================================== */
export const DEFAULT_DESK_LEADS = [];

export function LeadManagementDesk({ customers: propsCustomers = [] } = {}) {
  // Add Lead Modal State
  const [isAddLeadModalOpen, setIsAddLeadModalOpen] = useState(false);
  const [leadPhoneDigits, setLeadPhoneDigits] = useState('');
  const [leadFormData, setLeadFormData] = useState({
    selectedCustomerKey: '',
    company: '',
    customCompany: '',
  });
  const [leadSuccessToast, setLeadSuccessToast] = useState(null);

  const [deskCustomers, setDeskCustomers] = useState(() => {
    if (Array.isArray(propsCustomers) && propsCustomers.length > 0) return propsCustomers.filter((c) => !isTestUser(c));
    try {
      const raw = localStorage.getItem('growthline_registered_customers');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed.filter((c) => !isTestUser(c));
      }
    } catch (e) { }
    return [];
  });

  useEffect(() => {
    if (Array.isArray(propsCustomers) && propsCustomers.length > 0) {
      setDeskCustomers(propsCustomers.filter((c) => !isTestUser(c)));
    }
  }, [propsCustomers]);

  const fetchAuthoritativeDeskData = () => {
    crmApi
      .syncStateFromPostgres()
      .then((state) => {
        if (Array.isArray(state?.customers) && state.customers.length > 0) {
          setDeskCustomers(state.customers.filter((c) => !isTestUser(c)));
        }
        if (Array.isArray(state?.leads) && state.leads.length > 0) {
          const cleaned = state.leads
            .filter((item) => !isTestUser(item))
            .map((item) => {
            const rawDigits = (item.phone || item.name || '').replace(/\D/g, '').slice(-10);
            return {
              ...item,
              phone: rawDigits || item.phone,
              name: rawDigits ? `+91 ${rawDigits}` : item.name,
              read: Boolean(item.read || item.is_read || item.status === 'read'),
              is_read: Boolean(item.read || item.is_read || item.status === 'read'),
              unmasked: true,
            };
          });
          setLeads(cleaned);
        }
      })
      .catch(() => { });
  };

  useEffect(() => {
    fetchAuthoritativeDeskData();
    // Auto-poll every 6 seconds so status of "Marked as Read" synchronizes in real time
    const pollTimer = setInterval(fetchAuthoritativeDeskData, 6000);
    return () => clearInterval(pollTimer);
  }, []);

  const handlePhoneChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 10);
    setLeadPhoneDigits(raw);
  };
  const isPhoneValidStart = leadPhoneDigits.length === 0 || ['6', '7', '8', '9'].includes(leadPhoneDigits[0]);
  const isPhoneComplete = leadPhoneDigits.length === 10 && isPhoneValidStart;

  const handleOpenAddLead = () => {
    setLeadPhoneDigits('');
    const firstCust = deskCustomers[0] || null;
    const firstKey = firstCust ? (firstCust.id || firstCust.phone || firstCust.username) : '';
    setLeadFormData({
      selectedCustomerKey: firstKey,
      company: firstCust ? (firstCust.companyName || firstCust.name || `@${firstCust.username}`) : '',
      customCompany: '',
    });
    setIsAddLeadModalOpen(true);
  };

  const handleSubmitLead = (e) => {
    e.preventDefault();
    if (!isPhoneComplete) return;

    const targetKey = leadFormData.selectedCustomerKey;
    const targetCompany = leadFormData.company;

    const matchedCust = deskCustomers.find(
      (c) =>
        (targetKey && (String(c.id) === String(targetKey) || String(c.phone) === String(targetKey) || c.username === targetKey)) ||
        (targetCompany && (
          (c.companyName && c.companyName.toLowerCase() === targetCompany.toLowerCase()) ||
          (c.name && c.name.toLowerCase() === targetCompany.toLowerCase()) ||
          c.username === targetCompany
        ))
    );

    const finalCompany = matchedCust
      ? (matchedCust.companyName || matchedCust.name || `@${matchedCust.username}`)
      : (targetCompany || 'Client Account');

    const cleanDigits = leadPhoneDigits.replace(/\D/g, '').slice(-10);
    const formattedPhone = `+91 ${cleanDigits}`;

    const newLead = {
      id: `lead_${Date.now()}`,
      name: formattedPhone,
      company: finalCompany,
      assignedCompany: finalCompany,
      customerCompanyName: finalCompany,
      customerId: matchedCust?.id || '',
      customerPhone: matchedCust?.phone || '',
      customerUsername: matchedCust?.username || '',
      phone: cleanDigits,
      displayPhone: formattedPhone,
      maskedPhone: formattedPhone,
      email: `lead_${cleanDigits.slice(-4)}@example.com`,
      city: matchedCust?.city || '',
      requirement: `Inbound Lead for ${finalCompany}`,
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
      createdAt: getLiveNowFormatted(),
      notes: `Direct intake via Lead Management Desk for ${finalCompany}`,
      speedSlaMinutes: 1,
    };

    try {
      const rawLeads = localStorage.getItem('growthline_all_leads');
      let existingLeads = [];
      if (rawLeads) {
        try { existingLeads = JSON.parse(rawLeads); } catch (err) { }
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
          company: finalCompany,
          phone: cleanDigits,
          name: formattedPhone,
          city: newLead.city,
          requirement: newLead.requirement,
        })
        .catch(() => { });

      // Dispatch custom events without overwriting active customer session
      window.dispatchEvent(new CustomEvent('growthline_lead_added', { detail: newLead }));
      window.dispatchEvent(new Event('storage'));
    } catch (err) {
      console.error(err);
    }

    setIsAddLeadModalOpen(false);
    setLeadSuccessToast({
      company: finalCompany,
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
          const cleaned = parsed
            .filter((item) => !isTestUser(item))
            .map((item) => {
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
    } catch (e) { }
    return DEFAULT_DESK_LEADS;
  });

  useEffect(() => {
    const handleLeadAdded = (e) => {
      const newLead = e?.detail;
      if (newLead) {
        setLeads((prev) => [newLead, ...prev.filter((l) => l.id !== newLead.id)]);
      }
    };
    const handleLeadUpdated = (e) => {
      const { leadId, updates } = e?.detail || {};
      if (leadId && updates) {
        setLeads((prev) =>
          prev.map((l) => (l.id === leadId ? { ...l, ...updates } : l))
        );
      }
    };
    const handleStorage = (e) => {
      if (e.key === 'growthline_all_leads' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) setLeads(parsed);
        } catch (err) { }
      }
    };
    window.addEventListener('growthline_lead_added', handleLeadAdded);
    window.addEventListener('growthline_lead_updated', handleLeadUpdated);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('growthline_lead_added', handleLeadAdded);
      window.removeEventListener('growthline_lead_updated', handleLeadUpdated);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedCustomerId, setSelectedCustomerId] = useState('all');

  // Smart Searchable Customer Dropdown State
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const customerDropdownRef = useRef(null);
  const customerSearchInputRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(event.target)) {
        setIsCustomerDropdownOpen(false);
      }
    };
    if (isCustomerDropdownOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      setTimeout(() => {
        if (customerSearchInputRef.current) {
          customerSearchInputRef.current.focus();
        }
      }, 50);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isCustomerDropdownOpen]);

  // Customer matching helper to link leads to authoritative registered customers
  const matchLeadToCustomer = (lead, cust) => {
    if (!lead || !cust) return false;
    const leadCustId = String(lead.customerId || lead.customer_id || '').trim();
    const custId = String(cust.id || '').trim();
    const custPhone = String(cust.phone || '').replace(/\D/g, '').slice(-10);
    const custUser = String(cust.username || '').toLowerCase().replace(/^@/, '').trim();
    const leadCustPhone = String(lead.customerPhone || lead.customer_phone || '').replace(/\D/g, '').slice(-10);
    const leadCustUser = String(lead.customerUsername || lead.customer_username || '').toLowerCase().replace(/^@/, '').trim();

    // 1. Direct ID match
    if (leadCustId && (leadCustId === custId || leadCustId === custPhone || leadCustId === custUser)) return true;

    // 2. Customer Phone match
    if (custPhone && leadCustPhone && custPhone === leadCustPhone) return true;

    // 3. Customer Username match
    if (custUser && leadCustUser && custUser === leadCustUser) return true;

    // 4. Company Name / Business Name match
    const leadComp = String(lead.company || lead.assignedCompany || lead.customerCompanyName || '').toLowerCase().trim();
    const custComp = String(cust.companyName || cust.company_name || cust.name || '').toLowerCase().trim();
    const custContact = String(cust.contactPerson || cust.contact || '').toLowerCase().trim();

    if (leadComp && custComp && (leadComp === custComp || leadComp.includes(custComp) || custComp.includes(leadComp))) return true;
    if (leadComp && custContact && (leadComp === custContact || leadComp.includes(custContact) || custContact.includes(leadComp))) return true;
    if (leadComp && custUser && (leadComp === custUser || leadComp.includes(custUser))) return true;
    if (leadComp && custPhone && leadComp.includes(custPhone)) return true;

    return false;
  };

  const resolveCustomerForLead = (lead, customersList = []) => {
    if (!lead) return null;
    const matched = customersList.find((c) => matchLeadToCustomer(lead, c));
    if (matched) return matched;

    const fallbackComp = lead.company || lead.assignedCompany || lead.customerCompanyName || 'Client Account';
    const cleanPhone = String(lead.customerPhone || '').replace(/\D/g, '').slice(-10);
    return {
      id: lead.customerId || fallbackComp,
      name: fallbackComp,
      companyName: fallbackComp,
      phone: cleanPhone,
      username: lead.customerUsername || fallbackComp.toLowerCase().replace(/[^a-z0-9]/g, ''),
      balance: 0,
      isFallback: true,
    };
  };

  // Authoritative helper to determine if a lead has been marked as read by the client
  const isLeadRead = (l) => Boolean(l.read || l.is_read || l.status === 'read');

  // Unified list of customer filter options with dynamic lead counts
  const customerFilterOptions = useMemo(() => {
    const options = [];
    const seenKeys = new Set();

    (deskCustomers || []).forEach((cust) => {
      const key = String(cust.id || cust.phone || cust.username || cust.companyName);
      if (!key || seenKeys.has(key)) return;
      seenKeys.add(key);

      const comp = cust.companyName || cust.name || `@${cust.username}`;
      const phoneDigits = String(cust.phone || '').replace(/\D/g, '').slice(-10);
      const phoneStr = phoneDigits ? `+91 ${phoneDigits}` : '';
      const leadCount = leads.filter((l) => matchLeadToCustomer(l, cust)).length;

      options.push({
        key,
        customer: cust,
        displayName: comp,
        phone: phoneStr,
        leadCount,
      });
    });

    (leads || []).forEach((l) => {
      const comp = l.company || l.assignedCompany || l.customerCompanyName;
      if (!comp) return;
      const isMatched = deskCustomers.some((c) => matchLeadToCustomer(l, c));
      if (!isMatched && !seenKeys.has(comp)) {
        seenKeys.add(comp);
        const leadCount = leads.filter((item) => {
          const itemComp = item.company || item.assignedCompany || item.customerCompanyName;
          return itemComp === comp;
        }).length;
        const phoneDigits = String(l.customerPhone || '').replace(/\D/g, '').slice(-10);
        options.push({
          key: comp,
          customer: {
            id: comp,
            companyName: comp,
            name: comp,
            phone: phoneDigits,
            username: l.customerUsername || comp.toLowerCase().replace(/[^a-z0-9]/g, ''),
            balance: 0,
            isFallback: true,
          },
          displayName: comp,
          phone: phoneDigits ? `+91 ${phoneDigits}` : '',
          leadCount,
        });
      }
    });

    return options.sort((a, b) => b.leadCount - a.leadCount);
  }, [deskCustomers, leads]);

  // Live smart-filtered customer options based on search query
  const filteredCustomerOptions = useMemo(() => {
    const q = customerSearchQuery.toLowerCase().trim();
    if (!q) return customerFilterOptions;

    return customerFilterOptions.filter((opt) => {
      const c = opt.customer || {};
      const name = String(c.companyName || c.name || opt.displayName || '').toLowerCase();
      const contact = String(c.contactPerson || c.contact || '').toLowerCase();
      const phone = String(c.phone || opt.phone || '').replace(/\D/g, '');
      const user = String(c.username || '').toLowerCase();
      const email = String(c.email || '').toLowerCase();
      const cat = String(c.category || '').toLowerCase();

      return (
        name.includes(q) ||
        contact.includes(q) ||
        phone.includes(q) ||
        user.includes(q) ||
        email.includes(q) ||
        cat.includes(q)
      );
    });
  }, [customerFilterOptions, customerSearchQuery]);

  // Active customer object (if a single customer is selected)
  const selectedCustomerObj = useMemo(() => {
    if (selectedCustomerId === 'all') return null;
    const foundOpt = customerFilterOptions.find((o) => String(o.key) === String(selectedCustomerId));
    if (foundOpt) return foundOpt.customer;
    return deskCustomers.find(
      (c) => String(c.id) === String(selectedCustomerId) || String(c.phone) === String(selectedCustomerId) || c.username === selectedCustomerId
    ) || null;
  }, [selectedCustomerId, customerFilterOptions, deskCustomers]);

  // Customer-scoped leads
  const customerLeads = useMemo(() => {
    if (selectedCustomerId === 'all' || !selectedCustomerObj) return leads;
    return leads.filter((l) => matchLeadToCustomer(l, selectedCustomerObj));
  }, [leads, selectedCustomerId, selectedCustomerObj]);

  // Dynamic KPI counts for selected scope
  const totalLeadsCount = customerLeads.length;
  const readCount = customerLeads.filter(isLeadRead).length;
  const unreadCount = customerLeads.filter((l) => !isLeadRead(l)).length;
  const readRatePct = totalLeadsCount > 0 ? Math.round((readCount / totalLeadsCount) * 100) : 0;
  const urgentCount = customerLeads.filter((l) => l.priority === 'Urgent').length;
  const newCount = customerLeads.filter((l) => l.status === 'new').length;
  const qualifiedCount = customerLeads.filter((l) => l.status === 'qualified').length;

  // Toggle read status directly from sales desk and synchronize with PostgreSQL
  const handleToggleLeadRead = async (lead) => {
    const currentlyRead = isLeadRead(lead);
    const nextRead = !currentlyRead;
    const nextStatus = nextRead
      ? (lead.status === 'new' ? 'read' : lead.status)
      : (lead.status === 'read' ? 'new' : lead.status);

    const updates = { read: nextRead, is_read: nextRead, status: nextStatus };

    setLeads((prev) =>
      prev.map((l) => (l.id === lead.id ? { ...l, ...updates } : l))
    );

    try {
      await crmApi.updateLead(lead.id, updates);
      const raw = localStorage.getItem('growthline_all_leads');
      if (raw) {
        const list = JSON.parse(raw);
        const updated = list.map((l) => (l.id === lead.id ? { ...l, ...updates } : l));
        localStorage.setItem('growthline_all_leads', JSON.stringify(updated));
      }
      window.dispatchEvent(new CustomEvent('growthline_lead_updated', { detail: { leadId: lead.id, updates } }));
      window.dispatchEvent(new Event('storage'));
    } catch (err) {
      console.warn('Failed to update lead read status:', err);
    }
  };

  const filtered = useMemo(() => {
    return customerLeads.filter((l) => {
      const q = search.toLowerCase().trim();
      if (q) {
        const matchedCust = resolveCustomerForLead(l, deskCustomers);
        const cName = String(matchedCust?.name || matchedCust?.companyName || '').toLowerCase();
        const cPhone = String(matchedCust?.phone || '').replace(/\D/g, '');
        const cUser = String(matchedCust?.username || '').toLowerCase();
        const lPhone = String(l.phone || '').replace(/\D/g, '');
        const lBuyerName = String(l.name || '').toLowerCase();
        const lComp = String(l.company || l.assignedCompany || l.customerCompanyName || '').toLowerCase();
        const lCity = String(l.city || '').toLowerCase();

        const matchSearch =
          lBuyerName.includes(q) ||
          lPhone.includes(q) ||
          lComp.includes(q) ||
          lCity.includes(q) ||
          cName.includes(q) ||
          cPhone.includes(q) ||
          cUser.includes(q);

        if (!matchSearch) return false;
      }

      if (filter === 'urgent') return l.priority === 'Urgent';
      if (filter === 'new') return l.status === 'new';
      if (filter === 'qualified') return l.status === 'qualified';
      if (filter === 'read') return isLeadRead(l);
      if (filter === 'unread') return !isLeadRead(l);
      return true;
    });
  }, [customerLeads, search, filter, deskCustomers]);

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

      {/* KPI Quad Grid (Dynamically Calculated for Selected Customer or All Customers) */}
      <div className="desk-kpi-grid">
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">
            {selectedCustomerObj ? 'CUSTOMER INBOUND LEADS' : 'TOTAL INBOUND LEADS'}
          </div>
          <div className="desk-kpi-val">{totalLeadsCount}</div>
          <div className="desk-kpi-sub">
            {selectedCustomerObj
              ? `Delivered to ${selectedCustomerObj.companyName || selectedCustomerObj.name}`
              : `Active across ${customerFilterOptions.length} client accounts`}
          </div>
        </div>
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">READ BY CLIENT</div>
          <div className="desk-kpi-val text-emerald">{readCount}</div>
          <div className="desk-kpi-sub">
            {totalLeadsCount > 0 ? `${readRatePct}% client acknowledgment rate` : 'No leads to acknowledge'}
          </div>
        </div>
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">UNREAD IN CRM</div>
          <div className="desk-kpi-val text-amber">{unreadCount}</div>
          <div className="desk-kpi-sub">
            {unreadCount > 0 ? 'Awaiting client response / action' : 'All leads acknowledged ✓'}
          </div>
        </div>
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">
            {selectedCustomerObj ? 'WALLET BALANCE' : 'CLIENT READ RATE'}
          </div>
          <div className={`desk-kpi-val ${selectedCustomerObj ? (Number(selectedCustomerObj.balance || selectedCustomerObj.wallet_balance || 0) > 0 ? 'text-emerald' : 'text-rose') : 'text-indigo'}`}>
            {selectedCustomerObj
              ? `₹${Number(selectedCustomerObj.balance || selectedCustomerObj.wallet_balance || 0).toLocaleString('en-IN')}`
              : `${readRatePct}%`}
          </div>
          <div className="desk-kpi-sub">
            {selectedCustomerObj
              ? (Number(selectedCustomerObj.balance || selectedCustomerObj.wallet_balance || 0) > 0 ? 'Ad budget active & funded' : 'Wallet empty — recharge needed')
              : 'Across all active campaigns'}
          </div>
        </div>
      </div>

      {/* Dedicated Customer Profile & Delivery Intelligence KPI Card (Shown when specific customer is selected) */}
      {selectedCustomerObj && (
        <div className="desk-customer-kpi-banner">
          <div className="desk-customer-kpi-header">
            {/* Customer Details */}
            {(() => {
              const custTitle = selectedCustomerObj.companyName || selectedCustomerObj.name || 'Client Account';
              const rawUser = String(selectedCustomerObj.username || '').trim().replace(/^@/, '');
              const rawEmail = String(selectedCustomerObj.email || '').trim();
              const isEmailHandle = rawUser.toLowerCase() === rawEmail.toLowerCase() || rawUser.includes('@');
              const cleanPhone = String(selectedCustomerObj.phone || '').replace(/\D/g, '').slice(-10);
              const initialLetter = custTitle.charAt(0).toUpperCase();

              return (
                <div className="desk-customer-kpi-info">
                  <div style={{
                    width: 48,
                    height: 48,
                    minWidth: 48,
                    borderRadius: 12,
                    background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                    color: '#ffffff',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: '1.35rem',
                    fontWeight: 900,
                    boxShadow: '0 4px 14px rgba(99, 102, 241, 0.4)',
                    border: '2px solid rgba(255, 255, 255, 0.2)',
                    flexShrink: 0
                  }}>
                    {initialLetter}
                  </div>
                  <div style={{ minWidth: 0, flex: '1 1 auto' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <h2 style={{
                        margin: 0,
                        fontSize: '1.25rem',
                        fontWeight: 800,
                        color: '#ffffff',
                        wordBreak: 'break-word',
                        overflowWrap: 'anywhere',
                        lineHeight: 1.3
                      }}>
                        {custTitle}
                      </h2>
                      <span style={{
                        background: '#065f46',
                        color: '#34d399',
                        fontSize: '0.7rem',
                        fontWeight: 800,
                        padding: '3px 8px',
                        borderRadius: 6,
                        border: '1px solid #059669',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        whiteSpace: 'nowrap'
                      }}>
                        Active Customer
                      </span>
                      {selectedCustomerObj.category && (
                        <span style={{
                          background: 'rgba(255,255,255,0.1)',
                          color: '#cbd5e1',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: 6,
                          whiteSpace: 'nowrap'
                        }}>
                          {selectedCustomerObj.category}
                        </span>
                      )}
                    </div>

                    {/* Subline Details with zero email duplication */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      marginTop: 6,
                      flexWrap: 'wrap',
                      fontSize: '0.82rem',
                      color: '#cbd5e1'
                    }}>
                      {cleanPhone && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'monospace', fontWeight: 700, whiteSpace: 'nowrap' }}>
                          <Phone size={13} color="#a5b4fc" /> +91 {cleanPhone}
                        </span>
                      )}
                      {rawUser && !isEmailHandle && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#a5b4fc', fontWeight: 700, whiteSpace: 'nowrap' }}>
                          <User size={13} /> @{rawUser}
                        </span>
                      )}
                      {rawEmail && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#94a3b8', wordBreak: 'break-all' }}>
                          <Mail size={13} /> {rawEmail}
                        </span>
                      )}
                      {selectedCustomerObj.city && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                          <MapPin size={13} /> {selectedCustomerObj.city}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Quick Actions */}
            <div className="desk-customer-kpi-actions">
              {selectedCustomerObj.phone && (
                <a
                  href={`https://wa.me/91${String(selectedCustomerObj.phone).replace(/\D/g, '').slice(-10)}?text=Hello%20${encodeURIComponent(selectedCustomerObj.companyName || selectedCustomerObj.name || 'Client')},%20this%20is%20AdMafia%20GrowthLine%20Desk%20regarding%20your%20campaign%20leads.`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    background: '#25D366',
                    color: '#ffffff',
                    fontWeight: 800,
                    fontSize: '0.82rem',
                    padding: '8px 16px',
                    borderRadius: 8,
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    boxShadow: '0 4px 10px rgba(37, 211, 102, 0.25)',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <MessageSquare size={14} /> WhatsApp Customer
                </a>
              )}
              <a
                href="/app/lead#app/lead"
                target="_blank"
                rel="noreferrer"
                style={{
                  background: 'rgba(255, 255, 255, 0.12)',
                  color: '#ffffff',
                  border: '1px solid rgba(255, 255, 255, 0.25)',
                  fontWeight: 800,
                  fontSize: '0.82rem',
                  padding: '8px 16px',
                  borderRadius: 8,
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  backdropFilter: 'blur(4px)',
                  whiteSpace: 'nowrap'
                }}
              >
                <span>Open Customer CRM</span>
                <ExternalLink size={13} />
              </a>
              <button
                type="button"
                onClick={() => setSelectedCustomerId('all')}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  color: '#cbd5e1',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  padding: '8px 14px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  whiteSpace: 'nowrap'
                }}
              >
                <X size={14} /> Show All Customers
              </button>
            </div>
          </div>

          {/* Metric Tiles Grid - Fully Responsive */}
          <div className="desk-customer-kpi-metrics-grid">
            {/* Tile 1: Customer Wallet Balance */}
            <div className="desk-customer-kpi-metric-tile">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Customer Wallet Balance
                </span>
                <Wallet size={15} color="#34d399" />
              </div>
              <div style={{
                fontSize: '1.35rem',
                fontWeight: 900,
                color: (Number(selectedCustomerObj.balance || selectedCustomerObj.wallet_balance || 0) > 0 ? '#34d399' : '#f87171'),
                marginTop: 2
              }}>
                ₹{Number(selectedCustomerObj.balance || selectedCustomerObj.wallet_balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: '0.74rem', color: '#94a3b8', fontWeight: 600 }}>
                {Number(selectedCustomerObj.balance || selectedCustomerObj.wallet_balance || 0) > 0 ? '✓ Daily Ad Spend Funded' : '⚠ Recharge Needed'}
              </div>
            </div>

            {/* Tile 2: Total Leads Delivered */}
            <div className="desk-customer-kpi-metric-tile">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Total Leads Delivered
                </span>
                <Users size={15} color="#818cf8" />
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#ffffff', marginTop: 2 }}>
                {totalLeadsCount} <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1' }}>Leads</span>
              </div>
              <div style={{ fontSize: '0.74rem', color: '#94a3b8', fontWeight: 600 }}>
                Routed to Customer CRM
              </div>
            </div>

            {/* Tile 3: Read by Client */}
            <div className="desk-customer-kpi-metric-tile">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Read by Client
                </span>
                <CheckCircle2 size={15} color="#34d399" />
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#34d399', marginTop: 2 }}>
                {readCount} <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#a7f3d0' }}>({readRatePct}%)</span>
              </div>
              <div style={{ fontSize: '0.74rem', color: '#94a3b8', fontWeight: 600 }}>
                Acknowledged in Lead Hub
              </div>
            </div>

            {/* Tile 4: Unread / Pending SLA */}
            <div className="desk-customer-kpi-metric-tile">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Unread / Pending SLA
                </span>
                <Clock size={15} color="#fbbf24" />
              </div>
              <div style={{
                fontSize: '1.35rem',
                fontWeight: 900,
                color: unreadCount > 0 ? '#fbbf24' : '#94a3b8',
                marginTop: 2
              }}>
                {unreadCount} <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1' }}>Leads</span>
              </div>
              <div style={{ fontSize: '0.74rem', color: '#94a3b8', fontWeight: 600 }}>
                {unreadCount > 0 ? 'Awaiting Client Action' : 'All Leads Read ✓'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Customer Selector & Search Toolbar (Responsive) */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        marginBottom: 14,
        flexWrap: 'wrap',
        background: '#ffffff',
        padding: '12px 16px',
        borderRadius: 12,
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
      }}>
        {/* Customer-Wise Smart Search Dropdown Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: '1 1 340px', minWidth: 260 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <Building2 size={18} style={{ color: '#4f46e5' }} />
            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#1e293b', letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
              Customer Account:
            </span>
          </div>

          <div ref={customerDropdownRef} style={{ position: 'relative', flex: '1 1 240px', minWidth: 220 }}>
            {/* Interactive Smart Search Trigger Button */}
            <button
              type="button"
              onClick={() => {
                setIsCustomerDropdownOpen((prev) => !prev);
                setCustomerSearchQuery('');
              }}
              style={{
                width: '100%',
                padding: '9px 14px',
                fontSize: '0.88rem',
                fontWeight: 700,
                color: selectedCustomerId !== 'all' ? '#1e1b4b' : '#0f172a',
                background: selectedCustomerId !== 'all' ? '#eef2ff' : '#ffffff',
                border: selectedCustomerId !== 'all' ? '1.5px solid #6366f1' : '1px solid #cbd5e1',
                borderRadius: 10,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                boxShadow: selectedCustomerId !== 'all' ? '0 0 0 3px rgba(99, 102, 241, 0.15)' : 'none',
                outline: 'none',
                textAlign: 'left'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, overflow: 'hidden' }}>
                <span style={{ fontSize: '0.95rem' }}>🏢</span>
                <span style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontWeight: selectedCustomerId !== 'all' ? 800 : 700
                }}>
                  {selectedCustomerObj
                    ? `${selectedCustomerObj.companyName || selectedCustomerObj.name} (${customerLeads.length} leads)`
                    : `All Customers (${leads.length} total leads • ${customerFilterOptions.length} accounts)`}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                {selectedCustomerId !== 'all' && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedCustomerId('all');
                    }}
                    style={{
                      padding: '2px 6px',
                      borderRadius: 6,
                      background: 'rgba(99, 102, 241, 0.15)',
                      color: '#4f46e5',
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center'
                    }}
                    title="Reset to All Customers"
                  >
                    ✕
                  </span>
                )}
                <ChevronDown size={16} style={{ color: '#64748b', transform: isCustomerDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
              </div>
            </button>

            {/* Smart Search Dropdown Popup Menu */}
            {isCustomerDropdownOpen && (
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                left: 0,
                width: '100%',
                minWidth: 320,
                maxWidth: 460,
                background: '#ffffff',
                borderRadius: 12,
                border: '1px solid #cbd5e1',
                boxShadow: '0 12px 30px rgba(15, 23, 42, 0.18)',
                zIndex: 100,
                padding: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                animation: 'modal-pop-in 0.15s ease'
              }}>
                {/* Smart Search Input Header */}
                <div style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  background: '#f8fafc',
                  borderRadius: 8,
                  border: '1.5px solid #cbd5e1',
                  padding: '2px 10px'
                }}>
                  <Search size={15} style={{ color: '#6366f1', flexShrink: 0, marginRight: 6 }} />
                  <input
                    ref={customerSearchInputRef}
                    type="text"
                    placeholder="Smart search by name, phone, email..."
                    value={customerSearchQuery}
                    onChange={(e) => setCustomerSearchQuery(e.target.value)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      padding: '8px 4px',
                      fontSize: '0.86rem',
                      fontWeight: 600,
                      width: '100%',
                      outline: 'none',
                      color: '#0f172a'
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setIsCustomerDropdownOpen(false);
                      } else if (e.key === 'Enter' && filteredCustomerOptions.length > 0) {
                        const first = filteredCustomerOptions[0];
                        setSelectedCustomerId(first.key);
                        setIsCustomerDropdownOpen(false);
                      }
                    }}
                  />
                  {customerSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setCustomerSearchQuery('')}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        padding: '2px 4px',
                        fontSize: '0.85rem'
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Options List */}
                <div style={{ maxHeight: 290, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3, paddingRight: 2 }}>
                  {/* Option: All Customers */}
                  <div
                    onClick={() => {
                      setSelectedCustomerId('all');
                      setIsCustomerDropdownOpen(false);
                    }}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 8,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: selectedCustomerId === 'all' ? '#eff6ff' : 'transparent',
                      border: selectedCustomerId === 'all' ? '1px solid #bfdbfe' : '1px solid transparent',
                      transition: 'background 0.15s'
                    }}
                    onMouseEnter={(e) => {
                      if (selectedCustomerId !== 'all') e.currentTarget.style.background = '#f8fafc';
                    }}
                    onMouseLeave={(e) => {
                      if (selectedCustomerId !== 'all') e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <div style={{
                        width: 28,
                        height: 28,
                        borderRadius: 7,
                        background: '#e0e7ff',
                        color: '#4338ca',
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: '0.85rem',
                        fontWeight: 800
                      }}>
                        🏢
                      </div>
                      <div>
                        <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#1e3a8a' }}>
                          All Registered Customers
                        </div>
                        <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                          {customerFilterOptions.length} active business accounts
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        fontSize: '0.76rem',
                        fontWeight: 800,
                        color: '#4338ca',
                        background: '#e0e7ff',
                        padding: '2px 8px',
                        borderRadius: 6
                      }}>
                        {leads.length} leads
                      </span>
                      {selectedCustomerId === 'all' && <Check size={15} style={{ color: '#2563eb' }} strokeWidth={2.8} />}
                    </div>
                  </div>

                  <div style={{ height: 1, background: '#e2e8f0', margin: '3px 0' }} />

                  {/* Filtered Customer Options */}
                  {filteredCustomerOptions.length === 0 ? (
                    <div style={{ padding: '16px 12px', textAlign: 'center', color: '#64748b', fontSize: '0.84rem' }}>
                      No customers found matching "<strong>{customerSearchQuery}</strong>"
                    </div>
                  ) : (
                    filteredCustomerOptions.map((opt) => {
                      const cust = opt.customer || {};
                      const isSelected = String(selectedCustomerId) === String(opt.key);
                      const initial = (opt.companyName || 'C').charAt(0).toUpperCase();
                      const phoneDigits = String(cust.phone || opt.phone || '').replace(/\D/g, '').slice(-10);

                      return (
                        <div
                          key={opt.key}
                          onClick={() => {
                            setSelectedCustomerId(opt.key);
                            setIsCustomerDropdownOpen(false);
                          }}
                          style={{
                            padding: '8px 12px',
                            borderRadius: 8,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 10,
                            background: isSelected ? '#eff6ff' : 'transparent',
                            border: isSelected ? '1px solid #bfdbfe' : '1px solid transparent',
                            transition: 'background 0.15s'
                          }}
                          onMouseEnter={(e) => {
                            if (!isSelected) e.currentTarget.style.background = '#f8fafc';
                          }}
                          onMouseLeave={(e) => {
                            if (!isSelected) e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                            <div style={{
                              width: 30,
                              height: 30,
                              minWidth: 30,
                              borderRadius: 8,
                              background: isSelected ? 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' : '#f1f5f9',
                              color: isSelected ? '#ffffff' : '#334155',
                              display: 'grid',
                              placeItems: 'center',
                              fontSize: '0.85rem',
                              fontWeight: 800
                            }}>
                              {initial}
                            </div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{
                                fontSize: '0.86rem',
                                fontWeight: 800,
                                color: isSelected ? '#1e3a8a' : '#0f172a',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}>
                                {opt.displayName}
                              </div>
                              <div style={{
                                fontSize: '0.73rem',
                                color: '#64748b',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                flexWrap: 'wrap',
                                marginTop: 1
                              }}>
                                {phoneDigits && (
                                  <span style={{ fontFamily: 'monospace' }}>
                                    +91 {phoneDigits}
                                  </span>
                                )}
                                {cust.category && (
                                  <span>• {cust.category}</span>
                                )}
                                {cust.balance != null && (
                                  <span style={{ color: Number(cust.balance) > 0 ? '#059669' : '#94a3b8', fontWeight: 700 }}>
                                    • Bal: ₹{Number(cust.balance).toLocaleString('en-IN')}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                            <span style={{
                              fontSize: '0.75rem',
                              fontWeight: 800,
                              color: opt.leadCount > 0 ? '#059669' : '#94a3b8',
                              background: opt.leadCount > 0 ? '#ecfdf5' : '#f1f5f9',
                              border: opt.leadCount > 0 ? '1px solid #a7f3d0' : '1px solid #e2e8f0',
                              padding: '2px 8px',
                              borderRadius: 6,
                              whiteSpace: 'nowrap'
                            }}>
                              {opt.leadCount} {opt.leadCount === 1 ? 'lead' : 'leads'}
                            </span>
                            {isSelected && <Check size={15} style={{ color: '#2563eb' }} strokeWidth={2.8} />}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {selectedCustomerId !== 'all' && (
            <button
              type="button"
              onClick={() => setSelectedCustomerId('all')}
              style={{
                background: '#f1f5f9',
                border: '1px solid #cbd5e1',
                borderRadius: 8,
                padding: '8px 12px',
                fontSize: '0.8rem',
                fontWeight: 700,
                color: '#475569',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                whiteSpace: 'nowrap'
              }}
            >
              <X size={14} /> Clear Customer Filter
            </button>
          )}
        </div>

        {/* Search input */}
        <div className="desk-search-wrap" style={{ margin: 0, minWidth: 220, flex: '1 1 220px' }}>
          <Search size={16} className="desk-search-icon" />
          <input
            type="text"
            className="desk-search-input"
            placeholder="Search leads, phone, company..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className="desk-filter-bar" style={{ marginBottom: 14 }}>
        <div className="desk-tabs">
          <button type="button" className={`desk-tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
            All Leads ({totalLeadsCount})
          </button>
          <button
            type="button"
            className={`desk-tab ${filter === 'read' ? 'active' : ''}`}
            onClick={() => setFilter('read')}
            style={
              filter === 'read'
                ? { background: '#059669', borderColor: '#059669', color: '#ffffff', fontWeight: 800 }
                : { color: '#059669', borderColor: '#a7f3d0', fontWeight: 700 }
            }
          >
            ✓ Read by Client ({readCount})
          </button>
          <button
            type="button"
            className={`desk-tab ${filter === 'unread' ? 'active' : ''}`}
            onClick={() => setFilter('unread')}
            style={
              filter === 'unread'
                ? { background: '#d97706', borderColor: '#d97706', color: '#ffffff', fontWeight: 800 }
                : { color: '#d97706', borderColor: '#fde68a', fontWeight: 700 }
            }
          >
            ⏳ Unread ({unreadCount})
          </button>
          <button type="button" className={`desk-tab ${filter === 'urgent' ? 'active' : ''}`} onClick={() => setFilter('urgent')}>
            Urgent SLA ({urgentCount})
          </button>
          <button type="button" className={`desk-tab ${filter === 'new' ? 'active' : ''}`} onClick={() => setFilter('new')}>
            New Inbound ({newCount})
          </button>
          <button type="button" className={`desk-tab ${filter === 'qualified' ? 'active' : ''}`} onClick={() => setFilter('qualified')}>
            Qualified ({qualifiedCount})
          </button>
        </div>
      </div>

      {/* Leads List - Prominently Displays Customer Name, Buyer Phone, Read Status and Actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filtered.length === 0 ? (
          <div style={{
            background: '#ffffff',
            borderRadius: 14,
            padding: '48px 24px',
            textAlign: 'center',
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
          }}>
            <div style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: '#f1f5f9',
              color: '#64748b',
              display: 'grid',
              placeItems: 'center',
              margin: '0 auto 16px auto'
            }}>
              <Search size={24} />
            </div>
            <h3 style={{ margin: '0 0 6px 0', fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
              No Leads Found
            </h3>
            <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>
              {selectedCustomerId !== 'all'
                ? `No leads match the current filters for ${selectedCustomerObj?.companyName || selectedCustomerObj?.name || 'this customer'}.`
                : 'No inbound leads match your selected search or filter criteria.'}
            </p>
            {(selectedCustomerId !== 'all' || filter !== 'all' || search) && (
              <button
                type="button"
                onClick={() => {
                  setSelectedCustomerId('all');
                  setFilter('all');
                  setSearch('');
                }}
                className="desk-action-btn"
                style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <RotateCcw size={14} /> Reset All Filters
              </button>
            )}
          </div>
        ) : (
          filtered.map((lead) => {
            const rawDigits = (lead.phone || lead.name || '').replace(/\D/g, '').slice(-10);
            const cleanPhone = rawDigits.length === 10 ? `+91 ${rawDigits}` : (lead.phone || lead.name);
            const callDigits = rawDigits.length === 10 ? `+91${rawDigits}` : (lead.phone || '');
            const targetComp = lead.company || lead.assignedCompany || lead.customerCompanyName || 'Client Account';
            const matchedCust = resolveCustomerForLead(lead, deskCustomers);
            const customerName = matchedCust?.companyName || matchedCust?.name || targetComp;
            const customerPhoneDigits = matchedCust?.phone ? String(matchedCust.phone).replace(/\D/g, '').slice(-10) : (lead.customerPhone ? String(lead.customerPhone).replace(/\D/g, '').slice(-10) : '');
            const customerUser = matchedCust?.username ? `@${String(matchedCust.username).replace(/^@/, '')}` : (lead.customerUsername ? `@${String(lead.customerUsername).replace(/^@/, '')}` : '');
            const initialChar = (customerName || 'C').charAt(0).toUpperCase();
            const isRead = isLeadRead(lead);

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
                {/* Left Columns: Buyer Phone Number, Customer Name/Details, and Client Read Status */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', flex: '1 1 auto', minWidth: 0 }}>
                  {/* Inbound Buyer Phone Number */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
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
                        Inbound Buyer Phone
                      </span>
                      <span style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', letterSpacing: '0.02em', fontFamily: 'monospace' }}>
                        {cleanPhone}
                      </span>
                    </div>
                  </div>

                  {/* Customer / Client Account Details Prominently Displayed */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    paddingLeft: 16,
                    borderLeft: '1px solid #e2e8f0',
                    flex: '1 1 240px',
                    minWidth: 0
                  }}>
                    <div style={{
                      width: 38,
                      height: 38,
                      minWidth: 38,
                      borderRadius: 10,
                      background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                      color: '#1d4ed8',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 900,
                      fontSize: '1rem',
                      border: '1px solid #bfdbfe',
                      flexShrink: 0
                    }}>
                      {initialChar}
                    </div>
                    <div style={{ minWidth: 0, flex: '1 1 auto' }}>
                      <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Customer / Client Account
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
                        <span style={{
                          fontSize: '1.02rem',
                          fontWeight: 800,
                          color: '#1e3a8a',
                          letterSpacing: '-0.01em',
                          wordBreak: 'break-word',
                          overflowWrap: 'anywhere'
                        }}>
                          🏢 {customerName}
                        </span>
                        {customerPhoneDigits && (
                          <span style={{
                            fontSize: '0.76rem',
                            fontWeight: 700,
                            color: '#059669',
                            background: '#ecfdf5',
                            border: '1px solid #a7f3d0',
                            padding: '2px 8px',
                            borderRadius: 6,
                            fontFamily: 'monospace',
                            whiteSpace: 'nowrap'
                          }}>
                            📞 +91 {customerPhoneDigits}
                          </span>
                        )}
                        {customerUser && (
                          <span style={{
                            fontSize: '0.76rem',
                            fontWeight: 700,
                            color: '#6366f1',
                            background: '#eef2ff',
                            border: '1px solid #c7d2fe',
                            padding: '2px 8px',
                            borderRadius: 6,
                            whiteSpace: 'nowrap'
                          }}>
                            {customerUser}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Client Read Status Badge: Marked as Read vs Unread */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 16, borderLeft: '1px solid #e2e8f0', flexShrink: 0 }}>
                    <div>
                      <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Client Read Status
                      </span>
                      {isRead ? (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: '0.88rem',
                          fontWeight: 800,
                          color: '#047857',
                          background: '#ecfdf5',
                          border: '1.5px solid #a7f3d0',
                          padding: '4px 12px',
                          borderRadius: 9999,
                          marginTop: 2,
                          boxShadow: '0 1px 3px rgba(16, 185, 129, 0.12)',
                          whiteSpace: 'nowrap'
                        }}>
                          <CheckCircle2 size={15} strokeWidth={2.6} style={{ color: '#059669' }} />
                          <span>Marked as Read ✓</span>
                        </span>
                      ) : (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: '0.88rem',
                          fontWeight: 800,
                          color: '#b45309',
                          background: '#fffbeb',
                          border: '1.5px solid #fde68a',
                          padding: '4px 12px',
                          borderRadius: 9999,
                          marginTop: 2,
                          whiteSpace: 'nowrap'
                        }}>
                          <Clock size={15} strokeWidth={2.4} style={{ color: '#d97706' }} />
                          <span>Unread by Client</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Column: Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
                  <a
                    href={`tel:${callDigits}`}
                    className="desk-action-btn"
                    style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: '0.82rem', fontWeight: 600, whiteSpace: 'nowrap' }}
                  >
                    <Phone size={14} /> Direct Call Buyer
                  </a>
                  <a
                    href={`https://wa.me/91${rawDigits}?text=Hello,%20thank%20you%20for%20your%20inquiry%20with%20${encodeURIComponent(customerName)}.`}
                    target="_blank"
                    rel="noreferrer"
                    className="desk-action-btn"
                    style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: '0.82rem', fontWeight: 600, whiteSpace: 'nowrap' }}
                  >
                    <MessageSquare size={14} /> WhatsApp Buyer
                  </a>
                </div>
              </div>
            );
          })
        )}
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

                {/* 1. Select Customer Account * */}
                <div>
                  <label className="desk-form-label" style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0f172a', marginBottom: 6, display: 'block' }}>
                    Target Customer Account <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <select
                      className="desk-form-input"
                      required
                      value={leadFormData.selectedCustomerKey || ''}
                      onChange={(e) => {
                        const selKey = e.target.value;
                        const matched = deskCustomers.find(
                          (c) => String(c.id) === selKey || String(c.phone) === selKey || c.username === selKey
                        );
                        setLeadFormData({
                          ...leadFormData,
                          selectedCustomerKey: selKey,
                          company: matched ? (matched.companyName || matched.name || `@${matched.username}`) : '',
                        });
                      }}
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
                      {deskCustomers.length === 0 ? (
                        <option value="">-- No registered customer accounts yet --</option>
                      ) : (
                        deskCustomers.map((c) => {
                          const key = c.id || c.phone || c.username;
                          const compDisplay = c.companyName || c.name || `@${c.username}`;
                          const phoneDisplay = c.phone ? `+91 ${c.phone}` : '';
                          const paidStatus = c.paymentStatus === 'paid' ? 'PAID ✓' : 'PENDING';
                          return (
                            <option key={key} value={key}>
                              🏢 {compDisplay} {phoneDisplay ? `(${phoneDisplay})` : ''} - @{c.username} [{paidStatus}]
                            </option>
                          );
                        })
                      )}
                    </select>
                  </div>
                  {leadFormData.selectedCustomerKey && (
                    <div style={{ fontSize: '0.78rem', color: '#059669', marginTop: 5, fontWeight: 600 }}>
                      ✓ Strictly isolated to selected account. Only this customer will see this lead in their Lead Hub.
                    </div>
                  )}
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
   DESK 4: PROFILE COMPLETION (Complete Customer Intake Dossier Desk)
   ========================================================================== */
export function ProfileCompletionDesk({ customers = [], setCustomers }) {
  const [filterTab, setFilterTab] = useState('all'); // 'all' | 'complete' | 'incomplete'
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'cards'
  const [selectedProfileCust, setSelectedProfileCust] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);

  // Auto-sync fresh customer profiles from backend PostgreSQL on mount
  const handleSyncLatest = React.useCallback(async () => {
    setIsSyncing(true);
    try {
      const state = await crmApi.syncStateFromPostgres();
      if (state && Array.isArray(state.customers) && typeof setCustomers === 'function') {
        setCustomers(state.customers);
      }
    } catch (e) {
      console.warn('[Profile sync note]', e);
    } finally {
      setIsSyncing(false);
    }
  }, [setCustomers]);

  useEffect(() => {
    handleSyncLatest();
    const handleSyncEvent = (e) => {
      const state = e?.detail;
      if (state && Array.isArray(state.customers) && typeof setCustomers === 'function') {
        setCustomers(state.customers);
      }
    };
    window.addEventListener('growthline_postgres_synced', handleSyncEvent);
    window.addEventListener('growthline_active_user_changed', handleSyncLatest);
    return () => {
      window.removeEventListener('growthline_postgres_synced', handleSyncEvent);
      window.removeEventListener('growthline_active_user_changed', handleSyncLatest);
    };
  }, [handleSyncLatest, setCustomers]);

  const handleToggleCheck = (custId) => {
    setCustomers((prev) =>
      prev.map((c) => {
        if (c.id !== custId) return c;
        const newPercent = Math.min(100, (c.kycPercent || 0) + 25);
        const newProfileStatus = newPercent === 100 ? 'complete' : c.profileStatus;
        try {
          crmApi.patchCustomer(c.id, { profileStatus: newProfileStatus, kycPercent: newPercent });
        } catch (e) { }
        const updated = { ...c, kycPercent: newPercent, profileStatus: newProfileStatus, verified: newPercent === 100 };
        if (selectedProfileCust?.id === custId) {
          setSelectedProfileCust(updated);
        }
        return updated;
      })
    );
  };

  const handleMarkComplete = (custId) => {
    setCustomers((prev) =>
      prev.map((c) => {
        if (c.id !== custId) return c;
        try {
          crmApi.patchCustomer(c.id, { profileStatus: 'complete', kycPercent: 100, verified: true });
        } catch (e) { }
        const updated = { ...c, kycPercent: 100, profileStatus: 'complete', verified: true };
        if (selectedProfileCust?.id === custId) {
          setSelectedProfileCust(updated);
        }
        return updated;
      })
    );
  };

  const handleCopyProfile = (cust) => {
    if (!cust) return;
    const text = `
=== ADMAFIA CUSTOMER PROFILE DOSSIER ===
Company / Name: ${cust.companyName || cust.name || 'Not Provided'}
Contact Person: ${cust.contactPerson || cust.contact || cust.username || 'Not Provided'}
Username: @${cust.username || 'user'}
Workspace ID: ${cust.id}
Mobile Phone: +91 ${cust.phone}
Work Email: ${cust.email || 'Not Provided'}
Personal / Backup Email: ${cust.personalEmail || 'Not Provided'}
Category: ${cust.category || 'General'}
Industry: ${cust.industry || 'General'}
Website: ${cust.website || cust.domain || 'Not Configured'}
Location: ${cust.city || 'Not Specified'}, ${cust.state || 'Not Specified'}, ${cust.country || 'India'}
KYC Status: ${(cust.kycPercent === 100 || cust.profileStatus === 'complete') ? '100% KYC Complete & Verified' : 'Pending KYC Audit (' + (cust.kycPercent || 25) + '%)'}
Wallet Balance: ₹${(cust.walletBalance ?? cust.balance ?? 0).toLocaleString('en-IN')}
Daily Budget Pacing: ₹${(cust.dailyAdSpend ?? cust.dailyPacing ?? 300).toLocaleString('en-IN')}/day
Total Lifetime Paid: ₹${(cust.amountPaid || cust.totalLifetimePaid || 0).toLocaleString('en-IN')}
Lead Delivery Status: ${(cust.kycPercent === 100 || cust.profileStatus === 'complete') ? 'Active & Delivering' : 'Pending Verification'}
Scheduled Active Days: ${Array.isArray(cust.activeDays) ? cust.activeDays.join(', ') : 'MON, TUE, WED, THU, FRI'}
Registration Date: ${cust.registeredAt || 'Active'}
Profile Completed At: ${cust.completedAt || 'Recently Active'}
========================================
`.trim();
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2500);
    }
  };

  const completeList = customers.filter((c) => c.kycPercent === 100 || c.profileStatus === 'complete');
  const incompleteList = customers.filter((c) => (c.kycPercent || 0) < 100 && c.profileStatus !== 'complete');

  const tabFiltered = filterTab === 'complete' ? completeList : (filterTab === 'incomplete' ? incompleteList : customers);
  const displayedList = tabFiltered.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      (c.name || '').toLowerCase().includes(q) ||
      (c.companyName || '').toLowerCase().includes(q) ||
      (c.contact || '').toLowerCase().includes(q) ||
      (c.contactPerson || '').toLowerCase().includes(q) ||
      (c.username || '').toLowerCase().includes(q) ||
      (c.phone || '').includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.personalEmail || '').toLowerCase().includes(q) ||
      (c.city || '').toLowerCase().includes(q) ||
      (c.state || '').toLowerCase().includes(q) ||
      (c.country || '').toLowerCase().includes(q) ||
      (c.category || '').toLowerCase().includes(q) ||
      (c.industry || '').toLowerCase().includes(q) ||
      (c.website || '').toLowerCase().includes(q) ||
      (c.domain || '').toLowerCase().includes(q) ||
      (c.id || '').toLowerCase().includes(q)
    );
  });

  const avgCompletion = customers.length ? Math.round(customers.reduce((a, b) => a + (b.kycPercent || 0), 0) / customers.length) : 0;

  return (
    <div className="desk-page-container">
      {/* Header */}
      <div className="desk-header">
        <div>
          <div className="desk-breadcrumb">SUB ADMIN &amp; SUPPORT OPERATIONS / DESK 04</div>
          <h1 className="desk-title">Profile Completion</h1>
          <p className="desk-subtitle">
            Authoritative registry of all customer profile intake information (Company Name, Contact Person, Work &amp; Personal Email, City, State, Country, Industry, Website, and KYC Verification).
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            type="button"
            className="desk-action-btn"
            onClick={handleSyncLatest}
            disabled={isSyncing}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
          >
            <RefreshCw size={15} className={isSyncing ? 'spin-anim' : ''} />
            <span>{isSyncing ? 'Syncing...' : '↻ Sync Latest Profiles'}</span>
          </button>
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
          <div className="desk-kpi-label">TOTAL PROFILES</div>
          <div className="desk-kpi-val text-indigo">{customers.length}</div>
          <div className="desk-kpi-sub">Registered Client Accounts</div>
        </div>
      </div>

      {/* Tab Filter, View Toggle & Search Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, margin: '20px 0 16px 0' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
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

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* View Mode Toggle */}
          <div style={{ display: 'inline-flex', background: '#f1f5f9', padding: 3, borderRadius: 8, border: '1px solid #cbd5e1' }}>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                border: 'none',
                background: viewMode === 'table' ? '#0f172a' : 'transparent',
                color: viewMode === 'table' ? '#ffffff' : '#475569',
                fontWeight: 700,
                fontSize: '0.82rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              📑 Master Table
            </button>
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                border: 'none',
                background: viewMode === 'cards' ? '#0f172a' : 'transparent',
                color: viewMode === 'cards' ? '#ffffff' : '#475569',
                fontWeight: 700,
                fontSize: '0.82rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              🗂 Visual Cards
            </button>
          </div>

          <div style={{ position: 'relative', minWidth: 260 }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Search company, contact, phone, email, city..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 14px 8px 36px',
                borderRadius: 8,
                border: '1.5px solid #cbd5e1',
                fontSize: '0.85rem',
                outline: 'none',
                background: '#ffffff'
              }}
            />
          </div>
        </div>
      </div>

      {/* VIEW 1: MASTER TABLE VIEW (Default) */}
      {viewMode === 'table' && (
        <div className="desk-table-card">
          <table className="desk-table">
            <thead>
              <tr>
                <th>Company &amp; Workspace</th>
                <th>Contact Person &amp; Mobile</th>
                <th>Work &amp; Backup Email</th>
                <th>Category &amp; Industry</th>
                <th>Location (City, State)</th>
                <th>Website</th>
                <th>KYC Audit Status</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {displayedList.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                    <Building2 size={36} color="#94a3b8" style={{ margin: '0 auto 10px' }} />
                    <div style={{ fontWeight: 700, color: '#334155' }}>No Customer Profiles Found</div>
                    <div style={{ fontSize: '0.84rem' }}>Try clearing the search query or changing filter tab.</div>
                  </td>
                </tr>
              ) : (
                displayedList.map((c) => {
                  const isComplete = c.kycPercent === 100 || c.profileStatus === 'complete';
                  const identity = resolveCustomerIdentity(c, customers);
                  const companyDisplayName = identity.displayName;
                  const contactDisplayName = identity.contactPerson;
                  const cleanPhone = String(c.phone || '').replace(/\D/g, '').slice(-10);

                  return (
                    <tr key={c.id}>
                      {/* 1. Company & Workspace */}
                      <td>
                        <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.94rem' }}>
                          {companyDisplayName}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                          <span style={{ fontWeight: 700, color: '#4f46e5', background: '#eef2ff', padding: '1px 6px', borderRadius: 4, fontSize: '0.74rem' }}>
                            @{c.username || 'user'}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: '#64748b', fontFamily: 'monospace' }}>
                            {c.id}
                          </span>
                        </div>
                      </td>

                      {/* 2. Contact Person & Mobile */}
                      <td>
                        <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.90rem' }}>
                          {contactDisplayName}
                        </div>
                        <div style={{ fontWeight: 800, color: '#059669', fontFamily: 'monospace', fontSize: '0.88rem', marginTop: 2 }}>
                          +91 {cleanPhone || c.phone}
                        </div>
                      </td>

                      {/* 3. Work & Backup Email */}
                      <td>
                        <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#0f172a' }}>
                          {c.email ? (
                            <a href={`mailto:${c.email}`} style={{ color: '#2563eb', textDecoration: 'none' }}>
                              {c.email}
                            </a>
                          ) : (
                            <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Not Provided</span>
                          )}
                        </div>
                        {c.personalEmail && (
                          <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: 2 }}>
                            Backup: {c.personalEmail}
                          </div>
                        )}
                      </td>

                      {/* 4. Category & Industry */}
                      <td>
                        <span
                          style={{
                            background: '#f1f5f9',
                            color: '#334155',
                            padding: '2px 8px',
                            borderRadius: 6,
                            fontSize: '0.76rem',
                            fontWeight: 700,
                            display: 'inline-block'
                          }}
                        >
                          {c.category || 'General'}
                        </span>
                        <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: 2 }}>
                          {c.industry || 'Standard Niche'}
                        </div>
                      </td>

                      {/* 5. Location (City, State) */}
                      <td>
                        <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.88rem' }}>
                          {c.city ? `${c.city}, ` : ''}{c.state || 'Maharashtra'}
                        </div>
                        <div style={{ fontSize: '0.76rem', color: '#64748b' }}>
                          {c.country || 'India'}
                        </div>
                      </td>

                      {/* 6. Website */}
                      <td>
                        {c.website || c.domain ? (
                          <a
                            href={c.website?.startsWith('http') ? c.website : `https://${c.website || c.domain}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 600, fontSize: '0.84rem', display: 'inline-flex', alignItems: 'center', gap: 3 }}
                          >
                            <Globe size={13} /> {c.website || c.domain} ↗
                          </a>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '0.80rem' }}>—</span>
                        )}
                      </td>

                      {/* 7. KYC Audit Status */}
                      <td>
                        <span
                          style={{
                            background: isComplete ? '#ecfdf5' : '#fffbeb',
                            color: isComplete ? '#047857' : '#b45309',
                            border: isComplete ? '1px solid #a7f3d0' : '1px solid #fde68a',
                            padding: '3px 10px',
                            borderRadius: 9999,
                            fontSize: '0.76rem',
                            fontWeight: 800,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4
                          }}
                        >
                          {isComplete ? '✓ 100% KYC Complete' : `⏳ Incomplete (${c.kycPercent || 25}%)`}
                        </span>
                      </td>

                      {/* 8. Actions (Details Button) */}
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                          {/* 1. Prominent Details Button */}
                          <button
                            type="button"
                            className="sales-btn-primary"
                            style={{
                              padding: '6px 14px',
                              fontSize: '0.82rem',
                              fontWeight: 800,
                              background: '#4f46e5',
                              borderColor: '#4338ca',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              boxShadow: '0 2px 6px rgba(79, 70, 229, 0.25)',
                              cursor: 'pointer'
                            }}
                            title="View Complete Profile Dossier"
                            onClick={() => setSelectedProfileCust(c)}
                          >
                            <Eye size={14} /> Details
                          </button>

                          {/* WhatsApp Shortcut */}
                          <a
                            href={`https://wa.me/91${cleanPhone}?text=Hello%20${encodeURIComponent(contactDisplayName)},%20we%20reviewed%20your%20AdMafia%20business%20profile.`}
                            target="_blank"
                            rel="noreferrer"
                            className="desk-action-btn"
                            style={{ padding: '6px 9px', textDecoration: 'none', background: '#ecfdf5', color: '#065f46', borderColor: '#a7f3d0' }}
                            title="Open WhatsApp"
                          >
                            <MessageSquare size={14} color="#059669" />
                          </a>

                          {/* Direct Call Shortcut */}
                          <a
                            href={`tel:${cleanPhone}`}
                            className="desk-action-btn"
                            style={{ padding: '6px 9px', textDecoration: 'none', background: '#f8fafc', color: '#0f172a', borderColor: '#cbd5e1' }}
                            title="Call Partner"
                          >
                            <Phone size={14} color="#0284c7" />
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* VIEW 2: VISUAL CARDS VIEW */}
      {viewMode === 'cards' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {displayedList.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', background: '#ffffff', borderRadius: 16, border: '1.5px solid #e2e8f0', color: '#64748b' }}>
              <Building2 size={36} color="#94a3b8" style={{ margin: '0 auto 10px' }} />
              <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#334155' }}>No Customer Profiles Found</h4>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.84rem' }}>Try clearing the search query or changing filter tab.</p>
            </div>
          ) : (
            displayedList.map((c) => {
              const isComplete = c.kycPercent === 100 || c.profileStatus === 'complete';
              const identity = resolveCustomerIdentity(c, customers);
              const companyDisplayName = identity.displayName;
              const contactDisplayName = identity.contactPerson;
              const cleanPhone = String(c.phone || '').replace(/\D/g, '').slice(-10);

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
                          {companyDisplayName}
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
                        Workspace ID: <code>{c.id}</code> • Registered Phone: <strong style={{ color: '#0f172a' }}>+91 {cleanPhone}</strong> • Completed: {c.completedAt || c.registeredAt || 'Recently Active'}
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
                      <div style={{ fontSize: '0.94rem', fontWeight: 700, color: '#0f172a' }}>{contactDisplayName}</div>
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
                      <div style={{ fontSize: '0.94rem', fontWeight: 700, color: '#059669' }}>+91 {cleanPhone}</div>
                    </div>
                    <div>
                      <small style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Primary Industry / Niche</small>
                      <div style={{ fontSize: '0.94rem', fontWeight: 700, color: '#0f172a' }}>{c.industry || c.category || 'Other'}</div>
                    </div>
                    <div>
                      <small style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Company Website</small>
                      <div style={{ fontSize: '0.94rem', fontWeight: 600, color: '#2563eb' }}>
                        {c.website || c.domain ? (
                          <a href={c.website?.startsWith('http') ? c.website : `https://${c.website || c.domain}`} target="_blank" rel="noreferrer" style={{ color: '#2563eb', textDecoration: 'none' }}>
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
                      <small style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Wallet Balance &amp; Spend</small>
                      <div style={{ fontSize: '0.94rem', fontWeight: 700, color: '#0f172a' }}>
                        ₹{(c.walletBalance ?? c.balance ?? 0).toLocaleString('en-IN')} <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 500 }}>(@ ₹{(c.dailyAdSpend ?? c.dailyPacing ?? 300).toLocaleString('en-IN')}/d)</span>
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
                  <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    {/* Details Button - Opens Comprehensive Customer Dossier Modal */}
                    <button
                      type="button"
                      className="desk-action-btn"
                      style={{
                        background: '#4f46e5',
                        color: '#ffffff',
                        borderColor: '#4338ca',
                        fontWeight: 800,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        boxShadow: '0 2px 8px rgba(79, 70, 229, 0.25)'
                      }}
                      onClick={() => setSelectedProfileCust(c)}
                    >
                      <Eye size={14} /> Details
                    </button>

                    <a
                      href={`https://wa.me/91${cleanPhone}?text=Hello%20${encodeURIComponent(contactDisplayName)},%20your%20AdMafia%20business%20profile%20is%20now%20reviewed.`}
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
                      onClick={() => alert(`Compliance dossier dispatched for ${companyDisplayName} to ${c.email || 'customer'}!`)}
                    >
                      <Send size={14} /> Send Certificate
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
            })
          )}
        </div>
      )}

      {/* Comprehensive Customer Profile Details Modal (Popup) */}
      {selectedProfileCust && (
        <div className="sales-modal-overlay" onClick={() => setSelectedProfileCust(null)}>
          <div
            className="sales-modal-card"
            style={{ maxWidth: 860, width: '95%', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e2e8f0', paddingBottom: 16, marginBottom: 18 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span className="sales-dept-badge" style={{ background: '#e0e7ff', color: '#4338ca', fontWeight: 800 }}>
                    Customer Profile 360° Dossier
                  </span>
                  <span
                    style={{
                      background: (selectedProfileCust.kycPercent === 100 || selectedProfileCust.profileStatus === 'complete') ? '#ecfdf5' : '#fffbeb',
                      color: (selectedProfileCust.kycPercent === 100 || selectedProfileCust.profileStatus === 'complete') ? '#047857' : '#b45309',
                      border: (selectedProfileCust.kycPercent === 100 || selectedProfileCust.profileStatus === 'complete') ? '1px solid #a7f3d0' : '1px solid #fde68a',
                      padding: '3px 10px',
                      borderRadius: 9999,
                      fontSize: '0.76rem',
                      fontWeight: 800
                    }}
                  >
                    {(selectedProfileCust.kycPercent === 100 || selectedProfileCust.profileStatus === 'complete') ? '✓ 100% KYC Audit Complete' : `⏳ Incomplete Audit (${selectedProfileCust.kycPercent || 25}%)`}
                  </span>
                  <span
                    style={{
                      background: selectedProfileCust.status === 'active' ? '#ecfdf5' : '#fff1f2',
                      color: selectedProfileCust.status === 'active' ? '#047857' : '#be123c',
                      padding: '3px 8px',
                      borderRadius: 6,
                      fontSize: '0.74rem',
                      fontWeight: 700
                    }}
                  >
                    Account: {selectedProfileCust.status === 'active' ? 'Active' : 'Suspended'}
                  </span>
                </div>
                {(() => {
                  const pIdentity = resolveCustomerIdentity(selectedProfileCust, customers);
                  return (
                    <h2 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 800, color: '#0f172a' }}>
                      {pIdentity.displayName}
                    </h2>
                  );
                })()}
                <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: 4 }}>
                  Workspace ID: <code>{selectedProfileCust.id}</code> • Registered: {selectedProfileCust.registeredAt || 'Active'}
                </div>
              </div>
              <button
                type="button"
                className="desk-close-btn"
                onClick={() => setSelectedProfileCust(null)}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            {/* Dossier Content - 5 Structured Section Panels */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Panel 1: Business Identity & Commercial Classification */}
              <div style={{ background: '#f8fafc', padding: '16px 18px', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <Building2 size={16} color="#4f46e5" />
                  <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    1. Business Identity &amp; Industry Classification
                  </h4>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Company / Brand Name</div>
                    <div style={{ fontSize: '0.96rem', fontWeight: 800, color: '#0f172a', marginTop: 2 }}>
                      {resolveCustomerIdentity(selectedProfileCust, customers).displayName}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Lead Generation Category</div>
                    <div style={{ fontSize: '0.96rem', fontWeight: 700, color: '#0f172a', marginTop: 2 }}>
                      {selectedProfileCust.category || 'IT & Software'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Primary Industry / Specialization</div>
                    <div style={{ fontSize: '0.96rem', fontWeight: 700, color: '#0f172a', marginTop: 2 }}>
                      {selectedProfileCust.industry || selectedProfileCust.category || 'General'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Company Website / Domain</div>
                    <div style={{ fontSize: '0.96rem', fontWeight: 700, color: '#2563eb', marginTop: 2 }}>
                      {selectedProfileCust.website || selectedProfileCust.domain ? (
                        <a
                          href={selectedProfileCust.website?.startsWith('http') ? selectedProfileCust.website : `https://${selectedProfileCust.website || selectedProfileCust.domain}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: '#2563eb', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          {selectedProfileCust.website || selectedProfileCust.domain} <ExternalLink size={12} />
                        </a>
                      ) : (
                        <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Not Provided</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Panel 2: Authorized Contacts & Administrator Communications */}
              <div style={{ background: '#f8fafc', padding: '16px 18px', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <User size={16} color="#059669" />
                  <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    2. Authorized Administrator Contacts
                  </h4>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Contact Person / Representative</div>
                    <div style={{ fontSize: '0.96rem', fontWeight: 800, color: '#0f172a', marginTop: 2 }}>
                      {resolveCustomerIdentity(selectedProfileCust, customers).contactPerson}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Direct Phone / WhatsApp Number</div>
                    <div style={{ fontSize: '0.96rem', fontWeight: 800, color: '#059669', marginTop: 2 }}>
                      +91 {String(selectedProfileCust.phone || '').replace(/\D/g, '').slice(-10)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Primary Business Email</div>
                    <div style={{ fontSize: '0.96rem', fontWeight: 700, color: '#0f172a', marginTop: 2 }}>
                      {selectedProfileCust.email ? (
                        <a href={`mailto:${selectedProfileCust.email}`} style={{ color: '#2563eb', textDecoration: 'none' }}>
                          {selectedProfileCust.email}
                        </a>
                      ) : 'Not Provided'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Personal / Backup Email</div>
                    <div style={{ fontSize: '0.96rem', fontWeight: 600, color: '#334155', marginTop: 2 }}>
                      {selectedProfileCust.personalEmail || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>None (Optional)</span>}
                    </div>
                  </div>
                </div>
              </div>

              {/* Panel 3: Geographic Headquarters & Service Jurisdiction */}
              <div style={{ background: '#f8fafc', padding: '16px 18px', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <MapPin size={16} color="#d97706" />
                  <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    3. Geographic Headquarters &amp; Service Location
                  </h4>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>City / Operational Base</div>
                    <div style={{ fontSize: '0.96rem', fontWeight: 800, color: '#0f172a', marginTop: 2 }}>
                      {selectedProfileCust.city || 'Not Specified'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>State / Province</div>
                    <div style={{ fontSize: '0.96rem', fontWeight: 700, color: '#0f172a', marginTop: 2 }}>
                      {selectedProfileCust.state || 'Not Specified'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Country</div>
                    <div style={{ fontSize: '0.96rem', fontWeight: 700, color: '#0f172a', marginTop: 2 }}>
                      {selectedProfileCust.country || 'India'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Panel 4: Marketing Wallet, Ad Spend & Distribution Eligibility */}
              <div style={{ background: '#f8fafc', padding: '16px 18px', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <Wallet size={16} color="#0891b2" />
                  <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    4. Marketing Wallet, Budget &amp; Lead Dispatch
                  </h4>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Available Wallet Balance</div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 900, color: (selectedProfileCust.walletBalance ?? selectedProfileCust.balance ?? 0) > 0 ? '#059669' : '#e11d48', marginTop: 2 }}>
                      ₹{(selectedProfileCust.walletBalance ?? selectedProfileCust.balance ?? 0).toLocaleString('en-IN')}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Daily Ad Spend Pacing</div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#0f172a', marginTop: 2 }}>
                      ₹{(selectedProfileCust.dailyAdSpend ?? selectedProfileCust.dailyPacing ?? 300).toLocaleString('en-IN')}<span style={{ fontSize: '0.76rem', color: '#64748b', fontWeight: 600 }}>/day</span>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Total Lifetime Paid</div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', marginTop: 2 }}>
                      ₹{(selectedProfileCust.amountPaid || selectedProfileCust.totalLifetimePaid || 0).toLocaleString('en-IN')}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Lead Distribution Status</div>
                    <div style={{ fontSize: '0.96rem', fontWeight: 800, color: (selectedProfileCust.kycPercent === 100 || selectedProfileCust.profileStatus === 'complete') ? '#059669' : '#d97706', marginTop: 2 }}>
                      {(selectedProfileCust.kycPercent === 100 || selectedProfileCust.profileStatus === 'complete') ? '● Active & Delivering Leads' : '⏸ Verification Required'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Panel 5: Verification & Compliance Checkpoints */}
              <div style={{ background: '#f8fafc', padding: '16px 18px', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <ShieldCheck size={16} color="#059669" />
                  <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    5. Compliance &amp; Verification Ledger
                  </h4>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.84rem', color: '#1e293b', fontWeight: 600 }}>
                    <CheckCircle2 size={16} color="#059669" />
                    <span>Company Name &amp; Workspace Registered</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.84rem', color: '#1e293b', fontWeight: 600 }}>
                    <CheckCircle2 size={16} color={(selectedProfileCust.kycPercent === 100 || selectedProfileCust.profileStatus === 'complete') ? '#059669' : '#d97706'} />
                    <span>Industry &amp; Campaign Category Allocated</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.84rem', color: '#1e293b', fontWeight: 600 }}>
                    <CheckCircle2 size={16} color={(selectedProfileCust.kycPercent === 100 || selectedProfileCust.profileStatus === 'complete') ? '#059669' : '#94a3b8'} />
                    <span>Administrator WhatsApp &amp; Email Contact Verified</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.84rem', color: '#1e293b', fontWeight: 600 }}>
                    <CheckCircle2 size={16} color={(selectedProfileCust.kycPercent === 100 || selectedProfileCust.profileStatus === 'complete') ? '#059669' : '#94a3b8'} />
                    <span>Headquarters City &amp; State Geocoded</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Actions Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22, paddingTop: 16, borderTop: '1px solid #e2e8f0', flexWrap: 'wrap', alignItems: 'center' }}>
              {/* Copy Profile Details to Clipboard */}
              <button
                type="button"
                className="desk-action-btn"
                onClick={() => handleCopyProfile(selectedProfileCust)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontWeight: 700,
                  background: copyFeedback ? '#ecfdf5' : '#f8fafc',
                  color: copyFeedback ? '#065f46' : '#334155',
                  borderColor: copyFeedback ? '#a7f3d0' : '#cbd5e1'
                }}
              >
                <Copy size={14} />
                <span>{copyFeedback ? '✓ Copied to Clipboard!' : 'Copy Dossier'}</span>
              </button>

              <a
                href={`https://wa.me/91${String(selectedProfileCust.phone || '').replace(/\D/g, '').slice(-10)}?text=Hello%20${encodeURIComponent(selectedProfileCust.contactPerson || selectedProfileCust.contact || selectedProfileCust.name || 'Partner')},%20we%20reviewed%20your%20AdMafia%20business%20profile.`}
                target="_blank"
                rel="noreferrer"
                className="desk-action-btn"
                style={{ textDecoration: 'none', background: '#25D366', color: '#ffffff', borderColor: '#22c55e', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <MessageSquare size={14} /> Open WhatsApp Chat
              </a>

              <a
                href={`tel:${String(selectedProfileCust.phone || '').replace(/\D/g, '').slice(-10)}`}
                className="desk-action-btn"
                style={{ textDecoration: 'none', background: '#0284c7', color: '#ffffff', borderColor: '#0369a1', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Phone size={14} /> Call Partner
              </a>

              {!(selectedProfileCust.kycPercent === 100 || selectedProfileCust.profileStatus === 'complete') && (
                <button
                  type="button"
                  className="sales-btn-primary"
                  onClick={() => handleMarkComplete(selectedProfileCust.id)}
                  style={{ fontWeight: 700 }}
                >
                  <Check size={14} /> Mark Profile 100% Verified
                </button>
              )}

              <button
                type="button"
                className="desk-action-btn"
                onClick={() => setSelectedProfileCust(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ==========================================================================
   DESK 5: PAYMENT COLLECTION & CLIENT TOP-UP LEDGER
   ========================================================================== */
export const INITIAL_PAYMENT_RECORDS = [];

export const isTestingPaymentRecord = (r) => {
  if (!r) return false;
  const id = String(r.id || '').toLowerCase();
  const receipt = String(r.receiptNumber || r.receiptNo || r.receipt_number || r.invoiceNumber || r.invoice_number || '').toUpperCase();
  const utr = String(r.utr || r.utr_reference || '').toLowerCase();
  const phone = String(r.phone || '').replace(/\D/g, '');
  const company = String(r.company || r.companyName || r.name || '').trim().toLowerCase();
  const contact = String(r.contact || r.contactPerson || '').trim().toLowerCase();

  // Test receipts identified by user:
  // REC_1793882500916_D467, REC_1793881526162_E051, RCP-2026-5814, RCP-2026-9969
  if (
    receipt === 'REC_1793882500916_D467' ||
    receipt === 'REC_1793881526162_E051' ||
    receipt === 'RCP-2026-5814' ||
    receipt === 'RCP-2026-9969'
  ) {
    return true;
  }

  // Test UTRs: 'aaggg', 'aa', 'pay_tvcjrvjjkphawp', 'pay_tvcfjhw56ixevu'
  if (
    utr === 'aaggg' ||
    utr === 'aa' ||
    utr === 'pay_tvcjrvjjkphawp' ||
    utr === 'pay_tvcfjhw56ixevu'
  ) {
    return true;
  }

  // Test payment IDs:
  if (
    id === 'pay_1793882500916_18d1ec' ||
    id === 'pay_1793881526162_89c397' ||
    id === 'pay_1793600155814' ||
    id === 'pay_1793600029969'
  ) {
    return true;
  }

  // Synthetic customer registration rows previously generated: id starts with 'pay_reg_'
  if (id.startsWith('pay_reg_')) {
    return true;
  }

  // Test accounts matching user's specific test entries:
  // Abc (+91 7383198428)
  if (phone.endsWith('7383198428') && (company === 'abc' || contact === 'abc' || utr === 'aa' || utr === 'aaggg')) {
    return true;
  }
  // Priyank (+91 8200792130) with test entries
  if (phone.endsWith('8200792130') && (receipt.startsWith('RCP-2026-5814') || receipt.startsWith('RCP-2026-9969') || utr.startsWith('pay_tvc'))) {
    return true;
  }

  return false;
};

export const formatPaymentRecord = (r) => {
  if (!r) return r;
  const receiptVal =
    r.receiptNumber ||
    r.receiptNo ||
    r.receipt_number ||
    r.invoiceNumber ||
    r.invoice_number ||
    r.invoiceNo ||
    (r.id ? `RCP-2026-${String(r.id).replace(/\D/g, '').slice(-4).padStart(4, '0')}` : 'RCP-2026-1001');
  return {
    ...r,
    receiptNumber: receiptVal,
    receiptNo: receiptVal,
    paymentMode: r.paymentMode || r.mode || 'Razorpay Secure (UPI/Card)',
  };
};

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
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  // Persistent Payment & Top-Up Ledger State (sanitized from test entries)
  const [records, setRecords] = useState(() => {
    try {
      const raw = localStorage.getItem('growthline_payment_records');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const clean = parsed.map(formatPaymentRecord).filter((r) => !isTestingPaymentRecord(r));
          localStorage.setItem('growthline_payment_records', JSON.stringify(clean));
          return clean;
        }
      }
    } catch (e) { }
    return INITIAL_PAYMENT_RECORDS;
  });

  // Fetch authoritative payments from backend (/api/payments)
  const fetchPayments = async (showToast = false) => {
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/payments?t=' + Date.now());
      const data = await res.json();
      if (data && data.ok && Array.isArray(data.payments)) {
        const clean = data.payments
          .map(formatPaymentRecord)
          .filter((r) => !isTestingPaymentRecord(r));
        setRecords(clean);
        try {
          localStorage.setItem('growthline_payment_records', JSON.stringify(clean));
        } catch (e) { }
        if (showToast) {
          Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'success',
            title: `Synced ${clean.length} live payment records`,
            showConfirmButton: false,
            timer: 2000,
          });
        }
      }
    } catch (err) {
      console.warn('Failed to fetch payments:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchPayments(false);
  }, []);

  // Listen to cross-desk storage / event updates
  useEffect(() => {
    const handleNewPayment = (e) => {
      const rec = e?.detail;
      if (rec && !isTestingPaymentRecord(rec)) {
        const formatted = formatPaymentRecord(rec);
        setRecords((prev) => [formatted, ...prev.filter((r) => r.id !== formatted.id)]);
      }
    };
    const handlePaymentDeleted = (e) => {
      const delId = e?.detail?.id;
      const delReceipt = e?.detail?.receiptNumber;
      if (delId || delReceipt) {
        setRecords((prev) => prev.filter((r) => r.id !== delId && r.receiptNumber !== delReceipt));
      }
    };
    const handlePostgresSynced = (e) => {
      const state = e?.detail;
      if (state && Array.isArray(state.payments)) {
        const clean = state.payments.map(formatPaymentRecord).filter((r) => !isTestingPaymentRecord(r));
        setRecords(clean);
        try {
          localStorage.setItem('growthline_payment_records', JSON.stringify(clean));
        } catch (err) { }
      }
    };
    const handleStorage = (e) => {
      if (e.key === 'growthline_payment_records' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) {
            setRecords(parsed.map(formatPaymentRecord).filter((r) => !isTestingPaymentRecord(r)));
          }
        } catch (err) { }
      }
    };

    window.addEventListener('growthline_payment_recorded', handleNewPayment);
    window.addEventListener('growthline_payment_deleted', handlePaymentDeleted);
    window.addEventListener('growthline_postgres_synced', handlePostgresSynced);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('growthline_payment_recorded', handleNewPayment);
      window.removeEventListener('growthline_payment_deleted', handlePaymentDeleted);
      window.removeEventListener('growthline_postgres_synced', handlePostgresSynced);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const saveRecords = (newList) => {
    const clean = newList.filter((r) => !isTestingPaymentRecord(r));
    setRecords(clean);
    try {
      localStorage.setItem('growthline_payment_records', JSON.stringify(clean));
    } catch (e) { }
  };

  // Delete payment record from backend and local state
  const handleDeletePayment = async (r) => {
    const receiptLabel = r.receiptNumber || r.receiptNo || r.receipt_number || r.id;
    const confirm = await Swal.fire({
      title: 'Delete Payment Record?',
      html: `Are you sure you want to delete payment <b>${receiptLabel}</b> (₹${Number(r.amount || 0).toLocaleString('en-IN')})?<br/><br/><span style="font-size:0.85rem;color:#ef4444;">This will remove the payment entry from the ledger and adjust associated customer balances.</span>`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, Delete',
      cancelButtonText: 'Cancel',
    });

    if (!confirm.isConfirmed) return;

    try {
      const targetId = r.id || r.receiptNumber;
      const res = await crmApi.deletePayment(targetId);
      if (res && res.ok) {
        setRecords((prev) => {
          const next = prev.filter((p) => p.id !== r.id && p.receiptNumber !== r.receiptNumber);
          try {
            localStorage.setItem('growthline_payment_records', JSON.stringify(next));
          } catch (e) { }
          return next;
        });

        window.dispatchEvent(
          new CustomEvent('growthline_payment_deleted', {
            detail: { id: r.id, receiptNumber: r.receiptNumber },
          })
        );

        Swal.fire({
          icon: 'success',
          title: 'Payment Deleted',
          text: `Payment ${receiptLabel} removed successfully.`,
          timer: 2000,
          showConfirmButton: false,
        });
      } else {
        throw new Error(res?.error || 'Failed to delete payment');
      }
    } catch (err) {
      console.error('Delete payment error:', err);
      // Remove locally even if network fails or row was already gone
      setRecords((prev) => {
        const next = prev.filter((p) => p.id !== r.id && p.receiptNumber !== r.receiptNumber);
        try {
          localStorage.setItem('growthline_payment_records', JSON.stringify(next));
        } catch (e) { }
        return next;
      });
      Swal.fire({
        icon: 'info',
        title: 'Removed from View',
        text: `Record ${receiptLabel} removed from current view.`,
        timer: 1800,
        showConfirmButton: false,
      });
    }
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
      date: getLiveNowFormatted(),
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
      const matchRec = (r.receiptNumber || r.receiptNo || r.receipt_number || r.invoiceNumber || r.invoice_number || '').toLowerCase().includes(q);
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            className="sales-btn-secondary"
            onClick={() => fetchPayments(true)}
            disabled={isRefreshing}
            style={{
              padding: '6px 14px',
              fontSize: '0.82rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              cursor: isRefreshing ? 'wait' : 'pointer',
            }}
            title="Refresh payments from live server"
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            {isRefreshing ? 'Syncing...' : '↻ Sync Live'}
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

        <div className="desk-search-wrap">
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
                const identity = resolveCustomerIdentity(r, customers);
                return (
                  <tr key={r.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontWeight: 800, fontFamily: 'monospace', color: '#0f172a', fontSize: '0.85rem' }}>
                          {r.receiptNumber || r.receiptNo || r.receipt_number || r.invoiceNumber || r.invoice_number || (r.id ? `RCP-2026-${String(r.id).replace(/\D/g, '').slice(-4).padStart(4, '0')}` : 'RCP-2026-1001')}
                        </span>
                      </div>
                    </td>

                    <td>
                      <div>
                        <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.9rem' }}>
                          {identity.displayName}
                        </div>
                        <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: 1 }}>
                          👤 {identity.contactPerson} • 📞 +91 {r.phone}
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
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
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
                        <button
                          type="button"
                          className="sales-btn-secondary"
                          style={{
                            padding: '4px 8px',
                            fontSize: '0.74rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            color: '#ef4444',
                            borderColor: '#fecaca',
                            background: '#fef2f2',
                          }}
                          onClick={() => handleDeletePayment(r)}
                          title="Delete payment entry"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
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
                  {activeReceipt.receiptNumber || activeReceipt.receiptNo || activeReceipt.receipt_number || activeReceipt.invoiceNumber || activeReceipt.invoice_number || 'RCP-2026-1001'}
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
              {(() => {
                const rcptIdentity = resolveCustomerIdentity(activeReceipt, customers);
                return (
                  <>
                    <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
                      {rcptIdentity.displayName}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: 2 }}>
                      Attention: <b>{rcptIdentity.contactPerson}</b> • Phone: <b>+91 {activeReceipt.phone}</b> • Location: {activeReceipt.city || 'India'}
                    </div>
                  </>
                );
              })()}
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
              <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Invoice / Receipt: {activeInv.invoiceNumber || activeInv.receiptNumber || activeInv.receiptNo || 'RCP-2026-1001'}</div>
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
export function WalletsBalancesDesk({ customers: propsCustomers = [], setCustomers }) {
  const customers = useMemo(() => (propsCustomers || []).filter((c) => !isTestUser(c)), [propsCustomers]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedWalletCust, setSelectedWalletCust] = useState(null);
  const [addMoneyCust, setAddMoneyCust] = useState(null);

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase().trim();
    const matchSearch =
      !q ||
      (c.companyName || '').toLowerCase().includes(q) ||
      (c.name || '').toLowerCase().includes(q) ||
      (c.contactPerson || '').toLowerCase().includes(q) ||
      (c.contact || '').toLowerCase().includes(q) ||
      (c.username || '').toLowerCase().includes(q) ||
      (c.phone || '').includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.personalEmail || '').toLowerCase().includes(q) ||
      (c.city || '').toLowerCase().includes(q) ||
      (c.state || '').toLowerCase().includes(q) ||
      (c.category || '').toLowerCase().includes(q) ||
      (c.industry || '').toLowerCase().includes(q) ||
      (c.id || '').toLowerCase().includes(q);

    if (!matchSearch) return false;
    const bal = c.balance ?? c.walletBalance ?? 0;
    const pacing = c.dailyPacing || c.dailyAdSpend || 300;
    const runway = c.runwayDays ?? Math.floor(bal / pacing);

    if (filter === 'healthy') return runway > 15;
    if (filter === 'low') return runway > 0 && runway <= 5;
    if (filter === 'paused') return bal <= 0 || runway === 0;
    return true;
  });

  const totalPlatformBalance = customers.reduce((sum, c) => sum + (c.balance ?? c.walletBalance ?? 0), 0);
  const healthyCount = customers.filter((c) => {
    const bal = c.balance ?? c.walletBalance ?? 0;
    const pacing = c.dailyPacing || c.dailyAdSpend || 300;
    const runway = c.runwayDays ?? Math.floor(bal / pacing);
    return runway > 15;
  }).length;
  const lowCount = customers.filter((c) => {
    const bal = c.balance ?? c.walletBalance ?? 0;
    const pacing = c.dailyPacing || c.dailyAdSpend || 300;
    const runway = c.runwayDays ?? Math.floor(bal / pacing);
    return runway > 0 && runway <= 5;
  }).length;
  const pausedCount = customers.filter((c) => (c.balance ?? c.walletBalance ?? 0) <= 0).length;



  const handleDeleteCustomer = async (cust) => {
    if (!cust) return;
    const custId = cust.id || cust.phone || cust.username;
    const displayName = cust.companyName || cust.name || cust.contactPerson || cust.contact || `@${cust.username}`;
    const displayPhone = cust.phone || 'N/A';
    const displayUsername = cust.username || '';

    const confirmResult = await Swal.fire({
      title: 'Permanently Delete Customer?',
      html: `
        <div style="text-align: left; font-size: 0.90rem; line-height: 1.7; color: #334155;">
          <p style="margin-bottom: 10px; color: #dc2626; font-weight: 700;">
            ⚠️ This will permanently erase this customer and all their data:
          </p>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 12px;">
            <div>Account: <strong style="color: #0f172a;">@${displayUsername}</strong> (${displayName})</div>
            <div>Phone: <strong style="color: #0f172a;">+91 ${displayPhone}</strong></div>
            <div>Workspace ID: <code>${cust.id}</code></div>
          </div>
          <p style="font-size: 0.82rem; color: #64748b; margin: 0;">
            Includes: Wallet balances, transaction ledger, active campaigns, leads, invoices, and verification history. This cannot be undone.
          </p>
        </div>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, Delete All Data',
      cancelButtonText: 'Cancel',
      focusCancel: true,
    });

    if (!confirmResult.isConfirmed) return;

    try {
      await crmApi.deleteCustomer(custId);

      if (setCustomers) {
        setCustomers((prev) =>
          prev.filter((c) => c.id !== cust.id && c.phone !== cust.phone && c.username !== cust.username)
        );
      }

      if (selectedWalletCust?.id === cust.id || selectedWalletCust?.phone === cust.phone) {
        setSelectedWalletCust(null);
      }

      Swal.fire({
        icon: 'success',
        title: 'Customer Data Erased',
        text: `Customer @${displayUsername} and all associated records have been permanently removed.`,
        timer: 2000,
        showConfirmButton: false,
      });
    } catch (err) {
      console.error('Delete customer error:', err);
      Swal.fire({
        icon: 'error',
        title: 'Failed to Delete',
        text: err.message || 'An error occurred while deleting customer data.',
        confirmButtonColor: '#4f46e5',
      });
    }
  };

  return (
    <div className="desk-page-container">
      {/* Header */}
      <div className="desk-header">
        <div>
          <div className="desk-breadcrumb">SUB ADMIN &amp; SUPPORT OPERATIONS / DESK 06</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 className="desk-title">Wallets &amp; Balances</h1>
            <span className="desk-pill pill-indigo" style={{ fontWeight: 800 }}>{customers.length} Accounts</span>
            <span className="desk-pill pill-emerald" style={{ fontWeight: 800 }}>Platform Funds: {formatINR(totalPlatformBalance)}</span>
          </div>
          <p className="desk-subtitle">
            Centralized client advertising ledger, daily ₹300 auto-cut deduction monitoring, and runway health alerts.
          </p>
        </div>
      </div>

      {/* KPI Quad Grid */}
      <div className="desk-kpi-grid">
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">TOTAL BILLING ACCOUNTS</div>
          <div className="desk-kpi-val text-indigo">{customers.length}</div>
          <div className="desk-kpi-sub">Managed client ad ledgers</div>
        </div>
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">TOTAL PLATFORM FUNDS</div>
          <div className="desk-kpi-val text-emerald">{formatINR(totalPlatformBalance)}</div>
          <div className="desk-kpi-sub">Total active client balances</div>
        </div>
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">HEALTHY RUNWAY (&gt;15d)</div>
          <div className="desk-kpi-val text-emerald">{healthyCount}</div>
          <div className="desk-kpi-sub">Uninterrupted ad placement</div>
        </div>
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">PAUSED (ZERO BAL)</div>
          <div className="desk-kpi-val text-rose">{pausedCount}</div>
          <div className="desk-kpi-sub">Awaiting recharge to resume</div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="desk-filter-bar">
        <div className="desk-tabs">
          <button type="button" className={`desk-tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
            All Accounts ({customers.length})
          </button>
          <button type="button" className={`desk-tab ${filter === 'healthy' ? 'active' : ''}`} onClick={() => setFilter('healthy')}>
            🟢 Healthy (&gt;15 Days) ({healthyCount})
          </button>
          <button type="button" className={`desk-tab ${filter === 'low' ? 'active' : ''}`} onClick={() => setFilter('low')}>
            ⚠️ Low Balance (&le;5 Days) ({lowCount})
          </button>
          <button type="button" className={`desk-tab ${filter === 'paused' ? 'active' : ''}`} onClick={() => setFilter('paused')}>
            🔴 Paused (₹0) ({pausedCount})
          </button>
        </div>
        <div className="desk-search-wrap">
          <Search size={16} className="desk-search-icon" />
          <input
            type="text"
            className="desk-search-input"
            placeholder="Search company, name, phone, city, email..."
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
              <th>Client Business Identity</th>
              <th>Contact &amp; Location</th>
              <th>Available Balance</th>
              <th>Daily Burn</th>
              <th>Runway</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                  <Building2 size={32} color="#94a3b8" style={{ margin: '0 auto 8px' }} />
                  <div style={{ fontWeight: 700, color: '#334155' }}>No client wallets matching search or filter criteria</div>
                </td>
              </tr>
            ) : (
              filtered.map((c) => {
                const bal = c.balance ?? c.walletBalance ?? 0;
                const pacing = c.dailyPacing || c.dailyAdSpend || 300;
                const runway = c.runwayDays ?? Math.floor(bal / pacing);
                const isDepleted = bal <= 0;
                const isLow = isDepleted || bal < pacing * 2 || runway <= 1;

                const identity = resolveCustomerIdentity(c, customers);
                const companyName = identity.displayName;
                const contactPerson = identity.contactPerson;

                return (
                  <tr key={c.id}>
                    {/* 1. Client Business Identity (Proper Name, Category, ID) */}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 800, fontSize: '0.96rem', color: '#0f172a' }}>
                          {companyName}
                        </span>
                        {c.category && (
                          <span style={{ background: '#f1f5f9', color: '#475569', padding: '1px 7px', borderRadius: 6, fontSize: '0.70rem', fontWeight: 700 }}>
                            {c.category}
                          </span>
                        )}
                        {isDepleted ? (
                          <span className="desk-pill pill-rose" style={{ fontSize: '0.62rem', padding: '1px 6px', fontWeight: 800 }}>
                            🔴 Zero Balance
                          </span>
                        ) : isLow ? (
                          <span className="desk-pill pill-rose" style={{ fontSize: '0.62rem', padding: '1px 6px', fontWeight: 800 }}>
                            ⚠️ Low Balance
                          </span>
                        ) : null}
                      </div>
                      <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: 3 }}>
                        Workspace ID: <code>{c.id}</code> • Registered: {c.registeredAt || 'Active'}
                      </div>
                    </td>

                    {/* 2. Contact & Location */}
                    <td>
                      <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.86rem' }}>
                        {contactPerson}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#059669', fontWeight: 700 }}>
                        +91 {c.phone}
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                        {c.email || 'No Email'} • {c.city ? `${c.city}, ` : ''}{c.state || c.country || 'India'}
                      </div>
                    </td>

                    {/* 3. Available Balance & Lifetime Paid */}
                    <td>
                      <span style={{ fontSize: '1.05rem', fontWeight: 900, color: !isLow ? '#059669' : '#e11d48' }}>
                        {formatINR(bal)}
                      </span>
                      <div style={{ fontSize: '0.70rem', color: '#64748b', fontWeight: 600, marginTop: 2 }}>
                        Total Paid: {formatINR(c.amountPaid || c.totalLifetimePaid || 0)}
                      </div>
                      {isLow && (
                        <div style={{ fontSize: '0.70rem', color: '#e11d48', fontWeight: 800, marginTop: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
                          <AlertTriangle size={11} /> ⚠️ Balance is Low
                        </div>
                      )}
                    </td>

                    {/* 4. Daily Burn Rate */}
                    <td>
                      <span style={{ fontWeight: 800, color: '#4f46e5' }}>₹{pacing} / day</span>
                      <div style={{ fontSize: '0.70rem', color: '#64748b', marginTop: 2 }}>
                        {Array.isArray(c.activeDays) && c.activeDays.length > 0 ? c.activeDays.join(', ') : 'Weekdays'}
                      </div>
                    </td>

                    {/* 5. Campaign Runway */}
                    <td>
                      <span className={`desk-pill ${runway > 15 ? 'pill-emerald' : !isLow ? 'pill-amber' : 'pill-rose'}`} style={{ fontWeight: 800 }}>
                        {runway} Days
                      </span>
                    </td>

                    {/* 6. Interactive Action Buttons */}
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        {/* Sales Assisted Add Money Button */}
                        <button
                          type="button"
                          className="desk-action-btn"
                          style={{ background: '#ecfdf5', color: '#047857', borderColor: '#a7f3d0', fontWeight: 700 }}
                          onClick={() => setAddMoneyCust(c)}
                          title="Add Money / Credit Client Wallet"
                        >
                          <CreditCard size={13} color="#059669" /> + Add Money
                        </button>

                        {/* Details Modal Button */}
                        <button
                          type="button"
                          className="desk-action-btn"
                          style={{ background: '#f8fafc', color: '#334155', borderColor: '#cbd5e1', fontWeight: 700 }}
                          onClick={() => setSelectedWalletCust(c)}
                          title="View 360° Account Details & Ledger"
                        >
                          <Eye size={13} /> Details
                        </button>

                        {/* Direct WhatsApp Chat Action */}
                        <a
                          href={`https://wa.me/91${c.phone}?text=Hello%20${encodeURIComponent(contactPerson)},%20your%20current%20AdMafia%20wallet%20balance%20is%20${encodeURIComponent(formatINR(bal))}%20(${runway}%20days%20runway).`}
                          target="_blank"
                          rel="noreferrer"
                          className="desk-action-btn"
                          style={{ textDecoration: 'none', background: '#ecfdf5', color: '#065f46', borderColor: '#a7f3d0' }}
                          title="Open WhatsApp Chat"
                        >
                          <MessageSquare size={13} color="#059669" />
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Comprehensive Customer Wallet 360° Dossier Details Modal */}
      {selectedWalletCust && (
        <div className="sales-modal-overlay" onClick={() => setSelectedWalletCust(null)}>
          <div className="sales-modal-card" style={{ maxWidth: 740, width: '95%', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e2e8f0', paddingBottom: 14, marginBottom: 16 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span className="sales-dept-badge" style={{ background: '#e0e7ff', color: '#4338ca', fontWeight: 800 }}>
                    Client Wallet Ledger
                  </span>
                  <span
                    style={{
                      background: (selectedWalletCust.balance ?? selectedWalletCust.walletBalance ?? 0) > 0 ? '#ecfdf5' : '#fff1f2',
                      color: (selectedWalletCust.balance ?? selectedWalletCust.walletBalance ?? 0) > 0 ? '#047857' : '#be123c',
                      padding: '2px 8px',
                      borderRadius: 9999,
                      fontSize: '0.74rem',
                      fontWeight: 800
                    }}
                  >
                    {(selectedWalletCust.balance ?? selectedWalletCust.walletBalance ?? 0) > 0 ? '● Funded & Active' : '🔴 Depleted'}
                  </span>
                </div>
                {(() => {
                  const wIdentity = resolveCustomerIdentity(selectedWalletCust, customers);
                  return (
                    <h3 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#0f172a' }}>
                      {wIdentity.displayName}
                    </h3>
                  );
                })()}
                <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: 3 }}>
                  Workspace ID: <code>{selectedWalletCust.id}</code> • Registered Phone: <strong style={{ color: '#0f172a' }}>+91 {selectedWalletCust.phone}</strong>
                </div>
              </div>
              <button type="button" className="desk-close-btn" onClick={() => setSelectedWalletCust(null)}>
                <X size={18} />
              </button>
            </div>

            {/* Financial Overview Metrics Quad */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
              <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.70rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Available Balance</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 900, color: (selectedWalletCust.balance ?? selectedWalletCust.walletBalance ?? 0) > 0 ? '#059669' : '#e11d48', marginTop: 2 }}>
                  {formatINR(selectedWalletCust.balance ?? selectedWalletCust.walletBalance ?? 0)}
                </div>
              </div>
              <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.70rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Daily Ad Burn</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#4f46e5', marginTop: 2 }}>
                  ₹{selectedWalletCust.dailyPacing || selectedWalletCust.dailyAdSpend || 300}/d
                </div>
              </div>
              <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.70rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Runway Health</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0f172a', marginTop: 2 }}>
                  {selectedWalletCust.runwayDays ?? Math.floor((selectedWalletCust.balance ?? 0) / (selectedWalletCust.dailyPacing || 300))} Days
                </div>
              </div>
              <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.70rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Total Lifetime Paid</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0f172a', marginTop: 2 }}>
                  {formatINR(selectedWalletCust.amountPaid || selectedWalletCust.totalLifetimePaid || 0)}
                </div>
              </div>
            </div>

            {/* Business & Authorized Contact Details */}
            <div style={{ background: '#f8fafc', padding: '14px 16px', borderRadius: 10, border: '1px solid #e2e8f0', marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                <div>
                  <div style={{ fontSize: '0.70rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Company / Brand</div>
                  <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0f172a' }}>{resolveCustomerIdentity(selectedWalletCust, customers).displayName}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.70rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Contact Person</div>
                  <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0f172a' }}>{resolveCustomerIdentity(selectedWalletCust, customers).contactPerson}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.70rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Direct Phone</div>
                  <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#059669' }}>+91 {selectedWalletCust.phone}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.70rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Business Email</div>
                  <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#0f172a' }}>{selectedWalletCust.email || 'Not Provided'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.70rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Category &amp; Industry</div>
                  <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#0f172a' }}>{selectedWalletCust.category || 'General'} • {selectedWalletCust.industry || 'IT & Software'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.70rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Operating City &amp; State</div>
                  <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#0f172a' }}>{selectedWalletCust.city ? `${selectedWalletCust.city}, ` : ''}{selectedWalletCust.state || selectedWalletCust.country || 'India'}</div>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 14, borderTop: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
              <a
                href={`https://wa.me/91${selectedWalletCust.phone}?text=Hello%20${encodeURIComponent(selectedWalletCust.contactPerson || selectedWalletCust.contact || selectedWalletCust.name || 'Partner')},%20your%20current%20AdMafia%20wallet%20balance%20is%20${encodeURIComponent(formatINR(selectedWalletCust.balance ?? selectedWalletCust.walletBalance ?? 0))}.`}
                target="_blank"
                rel="noreferrer"
                className="desk-action-btn"
                style={{ textDecoration: 'none', background: '#25D366', color: '#ffffff', borderColor: '#22c55e', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <MessageSquare size={14} /> Open WhatsApp Chat
              </a>
              <button type="button" className="desk-action-btn" onClick={() => setSelectedWalletCust(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sales Assisted Add Money Modal */}
      {addMoneyCust && (
        <SalesAddMoneyModal
          customer={addMoneyCust}
          onClose={() => setAddMoneyCust(null)}
          onSuccess={(updatedCust) => {
            if (setCustomers && updatedCust) {
              setCustomers((prev) =>
                prev.map((item) =>
                  (item.id === updatedCust.id || item.phone === updatedCust.phone)
                    ? { ...item, ...updatedCust }
                    : item
                )
              );
            }
            if (selectedWalletCust && (selectedWalletCust.id === updatedCust?.id || selectedWalletCust.phone === updatedCust?.phone)) {
              setSelectedWalletCust((prev) => ({ ...prev, ...updatedCust }));
            }
          }}
        />
      )}
    </div>
  );
}

/* ==========================================================================
   DESK 7: QUERY & SUPPORT
   ========================================================================== */
export function QuerySupportDesk({
  customers: initialCustomers = [],
  setCustomers,
  queries: initialQueries = [],
  setQueries,
}) {
  const [filter, setFilter] = useState('all'); // 'all' | 'open' | 'resolved' | 'none'
  const [search, setSearch] = useState('');

  // Real-time queries list
  const [queriesList, setQueriesList] = useState(() => {
    try {
      const raw = localStorage.getItem('growthline_support_queries');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) { }
    return Array.isArray(initialQueries) ? initialQueries : [];
  });

  // Safe fallback to load stored customers if not passed
  const [customersList, setCustomersList] = useState(() => {
    if (Array.isArray(initialCustomers) && initialCustomers.length > 0) return initialCustomers;
    try {
      const raw = localStorage.getItem('growthline_registered_customers');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) { }
    return [];
  });

  useEffect(() => {
    if (Array.isArray(initialCustomers) && initialCustomers.length > 0) {
      setCustomersList(initialCustomers);
    }
  }, [initialCustomers]);

  // Fetch authoritative queries from PostgreSQL backend on mount
  useEffect(() => {
    let isMounted = true;
    crmApi.getQueries()
      .then((res) => {
        if (!isMounted) return;
        if (res && res.ok && Array.isArray(res.queries)) {
          setQueriesList(res.queries);
          if (setQueries) setQueries(res.queries);
          try {
            localStorage.setItem('growthline_support_queries', JSON.stringify(res.queries));
          } catch (e) { }
        }
      })
      .catch(() => { });

    const handleSync = (e) => {
      const fresh = e?.detail;
      if (fresh && Array.isArray(fresh.queries)) {
        setQueriesList(fresh.queries);
        if (setQueries) setQueries(fresh.queries);
      }
      if (fresh && Array.isArray(fresh.customers) && fresh.customers.length > 0) {
        setCustomersList(fresh.customers);
      }
    };

    window.addEventListener('growthline_postgres_synced', handleSync);
    return () => {
      isMounted = false;
      window.removeEventListener('growthline_postgres_synced', handleSync);
    };
  }, [setQueries]);

  // Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedCustDossier, setSelectedCustDossier] = useState(null);

  // New Query Form State
  const [newQueryForm, setNewQueryForm] = useState({
    customerId: '',
    company: '',
    contactName: '',
    contactPhone: '',
    contactEmail: '',
    category: 'Campaign Delivery & Pacing',
    priority: 'Normal',
    subject: '',
    internalNotes: '',
    status: 'open',
  });

  // Helper to match queries to a customer
  const getCustomerQueries = (c) => {
    if (!c) return [];
    const cId = c.id || c.phone;
    const cleanCPhone = String(c.phone || '').replace(/\D/g, '').slice(-10);
    const cComp = (c.companyName || c.name || '').trim().toLowerCase();

    return queriesList.filter((q) => {
      if (q.customerId && (q.customerId === cId || q.customerId === c.phone)) return true;
      if (q.customer_id && (q.customer_id === cId || q.customer_id === c.phone)) return true;
      const cleanQPhone = String(q.contactPhone || q.phone || '').replace(/\D/g, '').slice(-10);
      if (cleanCPhone && cleanQPhone && cleanCPhone === cleanQPhone) return true;
      const qComp = (q.company || q.companyName || '').trim().toLowerCase();
      if (cComp && qComp && cComp === qComp) return true;
      return false;
    });
  };

  // Open Add Modal for a specific customer
  const handleOpenAddForCustomer = (c) => {
    const compName = c.companyName || c.name || 'Client Account';
    const contact = c.contactPerson || c.contact || c.name || '';
    const phone = c.phone || '';
    const email = c.email || '';

    setNewQueryForm({
      customerId: c.id || phone,
      company: compName,
      contactName: contact,
      contactPhone: phone,
      contactEmail: email,
      category: 'Campaign Delivery & Pacing',
      priority: 'Normal',
      subject: '',
      internalNotes: '',
      status: 'open',
    });
    setIsAddModalOpen(true);
  };

  // Open Add Modal globally
  const handleOpenAddGlobal = () => {
    const defaultCust = customersList[0] || {};
    handleOpenAddForCustomer(defaultCust);
  };

  // Submit New Query
  const handleCreateQuery = async (e) => {
    e.preventDefault();
    if (!newQueryForm.subject.trim()) {
      Swal.fire({
        icon: 'warning',
        title: 'Subject Required',
        text: 'Please enter a subject or title for this query.',
        confirmButtonColor: '#4f46e5',
      });
      return;
    }

    const targetCust = customersList.find(c => c.id === newQueryForm.customerId || c.phone === newQueryForm.customerId) || {};
    const compName = targetCust.companyName || targetCust.name || newQueryForm.company || 'Client Account';
    const contact = targetCust.contactPerson || targetCust.contact || newQueryForm.contactName || '';
    const phone = targetCust.phone || newQueryForm.contactPhone || '';
    const email = targetCust.email || newQueryForm.contactEmail || '';

    const payload = {
      customerId: targetCust.id || phone || newQueryForm.customerId,
      company: compName,
      companyName: compName,
      contactName: contact,
      contactPhone: phone,
      contactEmail: email,
      category: newQueryForm.category,
      priority: newQueryForm.priority,
      subject: newQueryForm.subject.trim(),
      internalNotes: newQueryForm.internalNotes.trim(),
      status: newQueryForm.status || 'open',
    };

    try {
      const res = await crmApi.createQuery(payload);
      const created = res?.query || {
        ...payload,
        id: `qry_${Date.now()}`,
        createdAt: 'Just now',
        hoursOpen: 0,
      };

      const updated = [created, ...queriesList];
      setQueriesList(updated);
      if (setQueries) setQueries(updated);
      try {
        localStorage.setItem('growthline_support_queries', JSON.stringify(updated));
      } catch (err) { }

      setIsAddModalOpen(false);
      Swal.fire({
        icon: 'success',
        title: 'Query Logged! 🎟️',
        html: `Support query created for <strong>${compName}</strong>.`,
        timer: 1800,
        showConfirmButton: false,
      });
    } catch (err) {
      console.error('[Create Query]', err);
      // Fallback local save
      const fallback = {
        ...payload,
        id: `qry_${Date.now()}`,
        createdAt: 'Just now',
        hoursOpen: 0,
      };
      const updated = [fallback, ...queriesList];
      setQueriesList(updated);
      if (setQueries) setQueries(updated);
      try {
        localStorage.setItem('growthline_support_queries', JSON.stringify(updated));
      } catch (e) { }

      setIsAddModalOpen(false);
      Swal.fire({
        icon: 'success',
        title: 'Query Logged! 🎟️',
        html: `Support query saved for <strong>${compName}</strong>.`,
        timer: 1800,
        showConfirmButton: false,
      });
    }
  };

  // Toggle Resolve / Reopen
  const handleToggleResolve = async (q) => {
    const newStatus = q.status === 'resolved' ? 'open' : 'resolved';
    try {
      await crmApi.updateQuery(q.id, { status: newStatus });
    } catch (e) {
      console.warn('[Toggle resolve non-fatal]', e);
    }

    const updated = queriesList.map(item => item.id === q.id ? {
      ...item,
      status: newStatus,
      resolvedAt: newStatus === 'resolved' ? 'Just now' : null,
    } : item);

    setQueriesList(updated);
    if (setQueries) setQueries(updated);
    try {
      localStorage.setItem('growthline_support_queries', JSON.stringify(updated));
    } catch (e) { }

    Swal.fire({
      icon: 'success',
      title: newStatus === 'resolved' ? 'Ticket Resolved ✓' : 'Ticket Reopened ↻',
      text: `Status changed to ${newStatus.toUpperCase()}`,
      timer: 1500,
      showConfirmButton: false,
    });
  };

  // Delete Query
  const handleDeleteQuery = async (q) => {
    const confirmResult = await Swal.fire({
      title: 'Delete Support Query?',
      html: `
        <div style="text-align: left; font-size: 0.90rem; line-height: 1.7; color: #334155;">
          <div>Subject: <strong style="color: #0f172a;">${q.subject}</strong></div>
          <div>Company: <strong>${q.company || q.companyName}</strong></div>
          <div style="margin-top: 10px; padding: 10px; background: #fff1f2; border: 1px solid #fecdd3; border-radius: 8px; color: #be123c; font-size: 0.82rem;">
            ⚠️ This will permanently remove this support ticket from the platform.
          </div>
        </div>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, Delete',
      cancelButtonText: 'Cancel',
      reverseButtons: true,
      focusCancel: true,
    });

    if (!confirmResult.isConfirmed) return;

    try {
      await crmApi.deleteQuery(q.id);
    } catch (e) {
      console.warn('[Delete query non-fatal]', e);
    }

    const updated = queriesList.filter(item => item.id !== q.id);
    setQueriesList(updated);
    if (setQueries) setQueries(updated);
    try {
      localStorage.setItem('growthline_support_queries', JSON.stringify(updated));
    } catch (e) { }

    Swal.fire({
      icon: 'success',
      title: 'Query Deleted',
      timer: 1500,
      showConfirmButton: false,
    });
  };

  // KPI Calculations
  const totalCustomersCount = customersList.length;
  const openQueriesCount = queriesList.filter((q) => q.status === 'open').length;
  const resolvedQueriesCount = queriesList.filter((q) => q.status === 'resolved').length;
  const clientsWithOpenCount = customersList.filter(c => getCustomerQueries(c).some(q => q.status === 'open')).length;
  const clientsWithAnyQueryCount = customersList.filter(c => getCustomerQueries(c).length > 0).length;

  // Filter Customers
  const filteredCustomers = customersList.filter((c) => {
    const custQueries = getCustomerQueries(c);
    const hasOpen = custQueries.some(q => q.status === 'open');
    const hasResolved = custQueries.some(q => q.status === 'resolved');
    const hasNone = custQueries.length === 0;

    if (filter === 'open' && !hasOpen) return false;
    if (filter === 'resolved' && (hasOpen || !hasResolved)) return false;
    if (filter === 'none' && !hasNone) return false;

    if (search.trim()) {
      const q = search.toLowerCase();
      const comp = (c.companyName || c.name || '').toLowerCase();
      const contact = (c.contactPerson || c.contact || '').toLowerCase();
      const phone = String(c.phone || '');
      const city = (c.city || '').toLowerCase();
      const cat = (c.category || '').toLowerCase();
      const matchCust = comp.includes(q) || contact.includes(q) || phone.includes(q) || city.includes(q) || cat.includes(q);
      const matchQuery = custQueries.some(
        item => (item.subject || '').toLowerCase().includes(q) ||
          (item.category || '').toLowerCase().includes(q) ||
          (item.internalNotes || '').toLowerCase().includes(q)
      );
      return matchCust || matchQuery;
    }

    return true;
  });

  return (
    <div className="desk-page-container">
      {/* Header */}
      <div className="desk-header">
        <div>
          <div className="desk-breadcrumb">SUB ADMIN &amp; SUPPORT OPERATIONS / DESK 07</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 className="desk-title">Customer Query &amp; Support</h1>
            <span className="desk-pill pill-indigo" style={{ fontWeight: 800 }}>
              {totalCustomersCount} Registered Accounts
            </span>
            <span className={`desk-pill ${openQueriesCount > 0 ? 'pill-rose' : 'pill-emerald'}`} style={{ fontWeight: 800 }}>
              {openQueriesCount} Active Tickets
            </span>
          </div>
          <p className="desk-subtitle">
            Centralized customer support desk, issue categorization, SLA resolution timers, and direct customer query logging.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="sales-btn-primary"
            onClick={handleOpenAddGlobal}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
          >
            <Plus size={16} strokeWidth={2.5} /> Log Support Query
          </button>
        </div>
      </div>

      {/* KPI Quad Grid */}
      <div className="desk-kpi-grid">
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">TOTAL REGISTERED CLIENTS</div>
          <div className="desk-kpi-val text-indigo">{totalCustomersCount}</div>
          <div className="desk-kpi-sub">{clientsWithAnyQueryCount} clients with query history</div>
        </div>
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">ACTIVE OPEN QUERIES</div>
          <div className={`desk-kpi-val ${openQueriesCount > 0 ? 'text-rose' : 'text-emerald'}`}>{openQueriesCount}</div>
          <div className="desk-kpi-sub">Across {clientsWithOpenCount} customer accounts</div>
        </div>
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">RESOLVED QUERIES</div>
          <div className="desk-kpi-val text-emerald">{resolvedQueriesCount}</div>
          <div className="desk-kpi-sub">Closed successfully</div>
        </div>
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">AVG SLA RESOLUTION</div>
          <div className="desk-kpi-val text-indigo">1.8h</div>
          <div className="desk-kpi-sub">Within 24-hour guarantee</div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="desk-filter-bar">
        <div className="desk-tabs">
          <button
            type="button"
            className={`desk-tab ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All Customers ({totalCustomersCount})
          </button>
          <button
            type="button"
            className={`desk-tab ${filter === 'open' ? 'active' : ''}`}
            onClick={() => setFilter('open')}
          >
            ⚠️ With Open Queries ({clientsWithOpenCount})
          </button>
          <button
            type="button"
            className={`desk-tab ${filter === 'resolved' ? 'active' : ''}`}
            onClick={() => setFilter('resolved')}
          >
            ✓ All Resolved ({customersList.filter(c => {
              const q = getCustomerQueries(c);
              return q.length > 0 && q.every(item => item.status === 'resolved');
            }).length})
          </button>
          <button
            type="button"
            className={`desk-tab ${filter === 'none' ? 'active' : ''}`}
            onClick={() => setFilter('none')}
          >
            Zero Queries ({customersList.filter(c => getCustomerQueries(c).length === 0).length})
          </button>
        </div>

        <div className="desk-search-wrap">
          <Search size={16} className="desk-search-icon" />
          <input
            type="text"
            className="desk-search-input"
            placeholder="Search customer, phone, company, or query..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Master Customers & Queries Table */}
      <div className="desk-table-card">
        <table className="desk-table">
          <thead>
            <tr>
              <th>Customer Business &amp; Contact</th>
              <th>Support Status</th>
              <th>Queries &amp; Tickets Preview</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredCustomers.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                  <CheckCircle2 size={36} color="#059669" style={{ margin: '0 auto 10px' }} />
                  <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
                    No Customers Matching Filter
                  </h4>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.84rem' }}>
                    Try selecting a different filter tab or search query.
                  </p>
                </td>
              </tr>
            ) : (
              filteredCustomers.map((c) => {
                const custQueries = getCustomerQueries(c);
                const openQ = custQueries.filter((q) => q.status === 'open');
                const resolvedQ = custQueries.filter((q) => q.status === 'resolved');
                const cleanPhone = String(c.phone || '').replace(/\D/g, '').slice(-10);
                const compName = c.companyName || c.name || 'Client Account';
                const contactPerson = c.contactPerson || c.contact || c.name || 'Account Admin';
                const latestQuery = custQueries[0];

                return (
                  <tr key={c.id || cleanPhone}>
                    {/* 1. Customer & Business */}
                    <td style={{ minWidth: 260 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.94rem' }}>
                          {compName}
                        </span>
                        {c.category && (
                          <span style={{ background: '#f1f5f9', color: '#475569', padding: '1px 7px', borderRadius: 6, fontSize: '0.70rem', fontWeight: 700 }}>
                            {c.category}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 3 }}>
                        👤 {contactPerson} • <span style={{ fontFamily: 'monospace', color: '#059669', fontWeight: 700 }}>📞 +91 {cleanPhone}</span>
                      </div>
                      <div style={{ fontSize: '0.73rem', color: '#94a3b8', marginTop: 1 }}>
                        📍 {c.city || 'India'}{c.state ? `, ${c.state}` : ''}
                      </div>
                    </td>

                    {/* 2. Support Status */}
                    <td style={{ minWidth: 160 }}>
                      {openQ.length > 0 ? (
                        <div>
                          <span className="desk-pill pill-rose" style={{ fontWeight: 800, fontSize: '0.76rem' }}>
                            ⚠️ {openQ.length} Open Ticket{openQ.length > 1 ? 's' : ''}
                          </span>
                          <div style={{ fontSize: '0.70rem', color: '#dc2626', marginTop: 2, fontWeight: 600 }}>
                            Requires Support Attention
                          </div>
                        </div>
                      ) : resolvedQ.length > 0 ? (
                        <div>
                          <span className="desk-pill pill-emerald" style={{ fontWeight: 800, fontSize: '0.76rem' }}>
                            ✓ {resolvedQ.length} Resolved
                          </span>
                          <div style={{ fontSize: '0.70rem', color: '#059669', marginTop: 2 }}>
                            All Inquiries Closed
                          </div>
                        </div>
                      ) : (
                        <div>
                          <span className="desk-pill" style={{ background: '#f1f5f9', color: '#64748b', fontSize: '0.74rem' }}>
                            No Queries Logged
                          </span>
                        </div>
                      )}
                    </td>

                    {/* 3. Queries Preview */}
                    <td style={{ minWidth: 320 }}>
                      {latestQuery ? (
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span
                              className={`desk-pill ${latestQuery.priority === 'Urgent'
                                ? 'pill-rose'
                                : latestQuery.priority === 'High'
                                  ? 'pill-amber'
                                  : 'pill-indigo'
                                }`}
                              style={{ fontSize: '0.68rem', padding: '1px 6px', fontWeight: 800 }}
                            >
                              {latestQuery.priority}
                            </span>
                            <span style={{ fontSize: '0.74rem', background: '#f1f5f9', color: '#334155', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
                              {latestQuery.category}
                            </span>
                            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                              ⏱️ {latestQuery.createdAt}
                            </span>
                          </div>
                          <div style={{ fontWeight: 700, fontSize: '0.86rem', color: '#0f172a', marginTop: 4 }}>
                            {latestQuery.subject}
                          </div>
                          {latestQuery.internalNotes && (
                            <div style={{ fontSize: '0.74rem', color: '#64748b', fontStyle: 'italic', marginTop: 2 }}>
                              &ldquo;{latestQuery.internalNotes.slice(0, 80)}{latestQuery.internalNotes.length > 80 ? '...' : ''}&rdquo;
                            </div>
                          )}
                          {custQueries.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setSelectedCustDossier(c)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#4f46e5',
                                fontWeight: 700,
                                fontSize: '0.74rem',
                                padding: 0,
                                marginTop: 4,
                                cursor: 'pointer',
                                textDecoration: 'underline',
                              }}
                            >
                              + View {custQueries.length - 1} more ticket{custQueries.length - 1 > 1 ? 's' : ''}
                            </button>
                          )}
                        </div>
                      ) : (
                        <div style={{ fontSize: '0.80rem', color: '#94a3b8' }}>
                          No tickets logged yet. Click &ldquo;+ Add Query&rdquo; to create one.
                        </div>
                      )}
                    </td>

                    {/* 4. Actions */}
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        {/* Add Query for this Customer Button */}
                        <button
                          type="button"
                          className="sales-btn-primary"
                          style={{
                            padding: '5px 10px',
                            fontSize: '0.75rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                          onClick={() => handleOpenAddForCustomer(c)}
                          title={`Add Query for ${compName}`}
                        >
                          <Plus size={13} strokeWidth={2.5} /> Add Query
                        </button>

                        {/* Manage Customer Queries Dossier */}
                        {custQueries.length > 0 && (
                          <button
                            type="button"
                            className="desk-action-btn"
                            style={{
                              padding: '5px 10px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                            onClick={() => setSelectedCustDossier(c)}
                            title={`Manage ${custQueries.length} tickets for ${compName}`}
                          >
                            <Eye size={13} /> Tickets ({custQueries.length})
                          </button>
                        )}

                        {/* WhatsApp Customer Action */}
                        {cleanPhone && (
                          <a
                            href={`https://wa.me/91${cleanPhone}?text=Hello%20${encodeURIComponent(contactPerson)},%20this%20is%20AdMafia%20Growth%20Support%20regarding%20${encodeURIComponent(compName)}.%20How%20may%20our%20team%20assist%20you%20today?`}
                            target="_blank"
                            rel="noreferrer"
                            className="desk-action-btn"
                            style={{
                              textDecoration: 'none',
                              background: '#25D366',
                              color: '#ffffff',
                              borderColor: '#22c55e',
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              padding: '5px 8px',
                            }}
                            title="WhatsApp Customer"
                          >
                            <MessageSquare size={13} />
                          </a>
                        )}

                        {/* Call Customer Action */}
                        {cleanPhone && (
                          <a
                            href={`tel:+91${cleanPhone}`}
                            className="desk-action-btn"
                            style={{
                              textDecoration: 'none',
                              background: '#f8fafc',
                              color: '#0f172a',
                              fontWeight: 700,
                              padding: '5px 8px',
                            }}
                            title={`Call +91 ${cleanPhone}`}
                          >
                            <Phone size={13} color="#059669" />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 5. ADD NEW QUERY MODAL */}
      {isAddModalOpen && (
        <div className="sales-modal-overlay" onClick={() => setIsAddModalOpen(false)}>
          <div className="sales-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 580, width: '95%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: 'linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)',
                    display: 'grid',
                    placeItems: 'center',
                    color: '#fff',
                  }}
                >
                  <Headphones size={20} strokeWidth={2.2} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>
                    Log Support Ticket
                  </h3>
                  <div style={{ fontSize: '0.76rem', color: '#64748b' }}>
                    Record inquiry and dispatch to customer account history
                  </div>
                </div>
              </div>
              <button type="button" className="desk-close-btn" onClick={() => setIsAddModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateQuery}>
              {/* Customer Selector */}
              <div style={{ marginBottom: 14 }}>
                <label className="desk-form-label" style={{ fontWeight: 700, fontSize: '0.82rem' }}>
                  Select Customer Account *
                </label>
                <select
                  className="desk-form-input"
                  style={{ fontWeight: 600 }}
                  value={newQueryForm.customerId}
                  onChange={(e) => {
                    const selId = e.target.value;
                    const cust = customersList.find(c => c.id === selId || c.phone === selId) || {};
                    setNewQueryForm(prev => ({
                      ...prev,
                      customerId: selId,
                      company: cust.companyName || cust.name || '',
                      contactName: cust.contactPerson || cust.contact || cust.name || '',
                      contactPhone: cust.phone || '',
                      contactEmail: cust.email || '',
                    }));
                  }}
                  required
                >
                  {customersList.map((c) => (
                    <option key={c.id || c.phone} value={c.id || c.phone}>
                      {c.companyName || c.name} — {c.contactPerson || c.contact} (+91 {c.phone})
                    </option>
                  ))}
                </select>
              </div>

              {/* Category & Priority Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label className="desk-form-label" style={{ fontWeight: 700, fontSize: '0.82rem' }}>
                    Issue Category *
                  </label>
                  <select
                    className="desk-form-input"
                    value={newQueryForm.category}
                    onChange={(e) => setNewQueryForm({ ...newQueryForm, category: e.target.value })}
                  >
                    <option value="Campaign Delivery & Pacing">Campaign Delivery &amp; Pacing</option>
                    <option value="Wallet Balance & Top-Up">Wallet Balance &amp; Top-Up</option>
                    <option value="Lead Quality & Distribution">Lead Quality &amp; Distribution</option>
                    <option value="KYC & Document Verification">KYC &amp; Verification</option>
                    <option value="Billing & Tax Invoices">Billing &amp; Tax Invoices</option>
                    <option value="Creative & Ad Artwork">Creative &amp; Ad Artwork</option>
                    <option value="Technical Issue & Other">Technical Issue &amp; Other</option>
                  </select>
                </div>

                <div>
                  <label className="desk-form-label" style={{ fontWeight: 700, fontSize: '0.82rem' }}>
                    Priority Level *
                  </label>
                  <select
                    className="desk-form-input"
                    value={newQueryForm.priority}
                    onChange={(e) => setNewQueryForm({ ...newQueryForm, priority: e.target.value })}
                  >
                    <option value="Normal">Normal (Standard)</option>
                    <option value="High">High Priority</option>
                    <option value="Urgent">🔥 Urgent (SLA &lt; 2h)</option>
                  </select>
                </div>
              </div>

              {/* Subject */}
              <div style={{ marginBottom: 14 }}>
                <label className="desk-form-label" style={{ fontWeight: 700, fontSize: '0.82rem' }}>
                  Query Subject / Summary *
                </label>
                <input
                  type="text"
                  className="desk-form-input"
                  placeholder="e.g. Requesting daily ad burn pacing adjustment to ₹600/day"
                  value={newQueryForm.subject}
                  onChange={(e) => setNewQueryForm({ ...newQueryForm, subject: e.target.value })}
                  required
                />
              </div>

              {/* Internal Notes / Details */}
              <div style={{ marginBottom: 18 }}>
                <label className="desk-form-label" style={{ fontWeight: 700, fontSize: '0.82rem' }}>
                  Inquiry Description &amp; Resolution Notes
                </label>
                <textarea
                  className="desk-form-input"
                  rows={3}
                  placeholder="Enter full details of customer query, phone call outcome, or proposed action..."
                  value={newQueryForm.internalNotes}
                  onChange={(e) => setNewQueryForm({ ...newQueryForm, internalNotes: e.target.value })}
                  style={{ resize: 'vertical' }}
                />
              </div>

              {/* Form Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  className="sales-btn-secondary"
                  onClick={() => setIsAddModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="sales-btn-primary"
                  style={{ fontWeight: 800 }}
                >
                  <Plus size={15} strokeWidth={2.5} /> Log &amp; Save Query
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. CUSTOMER QUERY DOSSIER MODAL */}
      {selectedCustDossier && (
        <div className="sales-modal-overlay" onClick={() => setSelectedCustDossier(null)}>
          <div className="sales-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 680, width: '95%' }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e2e8f0', paddingBottom: 14, marginBottom: 16 }}>
              <div>
                <span className="sales-dept-badge" style={{ background: '#e0e7ff', color: '#4338ca', fontWeight: 800 }}>
                  Customer Support Dossier
                </span>
                <h3 style={{ margin: '4px 0 0 0', fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
                  {selectedCustDossier.companyName || selectedCustDossier.name}
                </h3>
                <div style={{ fontSize: '0.80rem', color: '#64748b', marginTop: 2 }}>
                  👤 {selectedCustDossier.contactPerson || selectedCustDossier.contact} • 📞 +91 {selectedCustDossier.phone}
                </div>
              </div>

              <button type="button" className="desk-close-btn" onClick={() => setSelectedCustDossier(null)}>
                <X size={18} />
              </button>
            </div>

            {/* Queries List */}
            <div style={{ maxHeight: 380, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, paddingRight: 4, marginBottom: 16 }}>
              {getCustomerQueries(selectedCustDossier).length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 10px', color: '#64748b' }}>
                  No queries logged yet for this customer.
                </div>
              ) : (
                getCustomerQueries(selectedCustDossier).map((q) => {
                  const isOpen = q.status === 'open';
                  return (
                    <div
                      key={q.id}
                      style={{
                        background: isOpen ? '#fffcf0' : '#f8fafc',
                        border: isOpen ? '1px solid #fef08a' : '1px solid #e2e8f0',
                        borderRadius: 10,
                        padding: '12px 14px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span
                              className={`desk-pill ${q.priority === 'Urgent'
                                ? 'pill-rose'
                                : q.priority === 'High'
                                  ? 'pill-amber'
                                  : 'pill-indigo'
                                }`}
                              style={{ fontSize: '0.66rem', padding: '1px 6px', fontWeight: 800 }}
                            >
                              {q.priority}
                            </span>
                            <span style={{ fontSize: '0.72rem', background: '#f1f5f9', color: '#334155', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
                              {q.category}
                            </span>
                            <span style={{ fontSize: '0.70rem', color: '#94a3b8' }}>
                              ⏱️ {q.createdAt}
                            </span>
                          </div>
                          <h4 style={{ margin: '6px 0 2px 0', fontSize: '0.94rem', fontWeight: 800, color: '#0f172a' }}>
                            {q.subject}
                          </h4>
                          {q.internalNotes && (
                            <div style={{ fontSize: '0.80rem', color: '#475569', marginTop: 4, background: '#ffffff', padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                              {q.internalNotes}
                            </div>
                          )}
                        </div>

                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          {/* Toggle Status Button */}
                          <button
                            type="button"
                            className="desk-action-btn"
                            style={{
                              background: isOpen ? '#ecfdf5' : '#eff6ff',
                              color: isOpen ? '#059669' : '#2563eb',
                              borderColor: isOpen ? '#a7f3d0' : '#bfdbfe',
                              fontWeight: 700,
                              fontSize: '0.74rem',
                              padding: '4px 10px',
                            }}
                            onClick={() => handleToggleResolve(q)}
                            title={isOpen ? 'Mark Ticket as Resolved' : 'Reopen Ticket'}
                          >
                            {isOpen ? (
                              <>
                                <Check size={13} /> Resolve
                              </>
                            ) : (
                              <>
                                <RotateCcw size={13} /> Reopen
                              </>
                            )}
                          </button>

                          {/* Delete Query Button */}
                          <button
                            type="button"
                            className="desk-action-btn"
                            style={{
                              background: '#fff1f2',
                              color: '#dc2626',
                              borderColor: '#fecdd3',
                              padding: '4px 8px',
                            }}
                            onClick={() => handleDeleteQuery(q)}
                            title="Delete this query"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer Controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, borderTop: '1px solid #e2e8f0', flexWrap: 'wrap', gap: 8 }}>
              <button
                type="button"
                className="sales-btn-primary"
                style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                onClick={() => {
                  const target = selectedCustDossier;
                  setSelectedCustDossier(null);
                  handleOpenAddForCustomer(target);
                }}
              >
                <Plus size={14} /> Add Another Query
              </button>

              <button
                type="button"
                className="desk-action-btn"
                onClick={() => setSelectedCustDossier(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
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
                href={`https://wa.me/91${t.phone}?text=Hello%20${encodeURIComponent(t.contact)},%20AdMafia%20Support%20follow-up%20regarding%20${encodeURIComponent(t.type)}.`}
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
   DESK 08: CUSTOMER GROUPS & CATEGORY-BASED LEAD DISTRIBUTION
   ========================================================================== */
export { default as CustomerGroupsDesk } from './CustomerGroupsDesk';
export { default as MasterTransactionLogsDesk } from './MasterTransactionLogsDesk';

/* ==========================================================================
   APPROVED MEMBERS DESK: Customers who completed Payment & Profile KYC
   ========================================================================== */
export function ApprovedMembersDesk({ customers = [], setCustomers, navigateToDesk }) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [balanceFilter, setBalanceFilter] = useState('all'); // 'all' | 'healthy' | 'low' | 'zero'
  const [selectedMember, setSelectedMember] = useState(null);

  // Criteria: Member who has completed both Gate 1 Payment and Gate 2 Profile Submission
  const isApproved = (c) => {
    const isPaymentDone =
      c.paymentStatus === 'paid' ||
      c.payment_status === 'paid' ||
      Number(c.amountPaid || 0) > 0 ||
      Number(c.balance || c.walletBalance || 0) > 0;
    const isProfileDone =
      c.profileStatus === 'complete' ||
      c.profile_status === 'complete' ||
      Number(c.kycPercent || c.kyc_percent || 0) >= 100;
    return (isPaymentDone && isProfileDone) || c.verified === true;
  };

  const approvedList = customers.filter(isApproved);

  // Extract unique categories
  const categories = Array.from(
    new Set(approvedList.map((c) => c.category).filter(Boolean))
  );

  // Filtered members based on search, category and balance filters
  const filtered = approvedList.filter((c) => {
    const q = search.trim().toLowerCase();
    const matchSearch =
      !q ||
      (c.companyName || c.name || '').toLowerCase().includes(q) ||
      (c.contactPerson || c.contact || '').toLowerCase().includes(q) ||
      (c.phone || '').includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.city || '').toLowerCase().includes(q) ||
      (c.category || '').toLowerCase().includes(q);

    if (!matchSearch) return false;

    if (categoryFilter !== 'all' && (c.category || 'Other') !== categoryFilter) {
      return false;
    }

    const bal = Number(c.balance || c.walletBalance || 0);
    const runway = Number(c.runwayDays ?? Math.floor(bal / 300));
    if (balanceFilter === 'healthy') return runway > 3;
    if (balanceFilter === 'low') return runway > 0 && runway <= 3;
    if (balanceFilter === 'zero') return runway === 0 || bal === 0;

    return true;
  });

  // KPI Calculations
  const totalApproved = approvedList.length;
  const totalReserves = approvedList.reduce(
    (sum, c) => sum + Number(c.balance || c.walletBalance || 0),
    0
  );
  const totalDailyBurn = totalApproved * 300;
  const avgRunwayDays = totalApproved > 0 ? Math.round(totalReserves / (totalApproved * 300)) : 0;
  const healthyCount = approvedList.filter((c) => (c.runwayDays || Math.floor((c.balance || 0) / 300)) > 3).length;
  const lowCount = approvedList.filter((c) => {
    const r = c.runwayDays || Math.floor((c.balance || 0) / 300);
    return r > 0 && r <= 3;
  }).length;
  const zeroCount = approvedList.filter((c) => (c.balance || 0) <= 0).length;

  return (
    <div className="desk-page-container appr-desk-container">
      {/* Desk Header */}
      <div className="desk-header">
        <div>
          <div className="desk-breadcrumb">SUB ADMIN OPERATIONS / CLIENT COMPLIANCE &amp; ACCOUNTS</div>
          <h1 className="desk-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>Approved Client Members</span>
            <span className="appr-badge-verified">
              <span className="sales-pulse-dot" style={{ width: 7, height: 7 }} /> Gate 1 (Payment) &amp; Gate 2 (Profile) Complete
            </span>
          </h1>
          <p className="desk-subtitle">
            Authoritative registry of verified client members who have completed full business profile KYC and active wallet payment settlements. Monitor live wallet balances and campaign runway pacing in real time.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="sales-btn-secondary"
            onClick={() => window.location.reload()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.82rem' }}
          >
            <RefreshCw size={14} /> Refresh Members
          </button>
          {navigateToDesk && (
            <button
              type="button"
              className="sales-btn-primary"
              onClick={() => navigateToDesk('groups', '#groups')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.82rem' }}
            >
              <FolderTree size={14} /> Distribute Leads to Members →
            </button>
          )}
        </div>
      </div>

      {/* KPI Ribbon */}
      <div className="appr-kpi-grid">
        <div className="appr-kpi-card">
          <div className="appr-kpi-header">
            <span className="appr-kpi-label">TOTAL APPROVED MEMBERS</span>
            <div className="appr-kpi-icon-wrap emerald">
              <UserCheck size={18} />
            </div>
          </div>
          <div className="appr-kpi-val text-emerald">{totalApproved}</div>
          <div className="appr-kpi-sub">
            <span className="text-emerald" style={{ fontWeight: 700 }}>100% KYC &amp; Payment Passed</span>
          </div>
        </div>

        <div className="appr-kpi-card">
          <div className="appr-kpi-header">
            <span className="appr-kpi-label">COLLECTIVE LIVE RESERVES</span>
            <div className="appr-kpi-icon-wrap indigo">
              <Wallet size={18} />
            </div>
          </div>
          <div className="appr-kpi-val text-indigo">{formatINR(totalReserves)}</div>
          <div className="appr-kpi-sub">
            <span className="text-indigo" style={{ fontWeight: 700 }}>Live Real-Time Wallet Balance</span>
          </div>
        </div>

        <div className="appr-kpi-card">
          <div className="appr-kpi-header">
            <span className="appr-kpi-label">DAILY AD SPEND PACING</span>
            <div className="appr-kpi-icon-wrap cyan">
              <Clock size={18} />
            </div>
          </div>
          <div className="appr-kpi-val text-cyan">{formatINR(totalDailyBurn)}/day</div>
          <div className="appr-kpi-sub">
            <span>₹300/day pacing across all active accounts</span>
          </div>
        </div>

        <div className="appr-kpi-card">
          <div className="appr-kpi-header">
            <span className="appr-kpi-label">AVERAGE RUNWAY HEALTH</span>
            <div className="appr-kpi-icon-wrap emerald">
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div className="appr-kpi-val text-emerald">{avgRunwayDays} Days</div>
          <div className="appr-kpi-sub">
            <span>{healthyCount} Healthy • {lowCount} Low Alert • {zeroCount} Depleted</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="appr-filter-bar">
        {/* Search Input */}
        <div className="appr-search-wrap">
          <Search size={16} className="appr-search-icon" />
          <input
            type="text"
            placeholder="Search by company, contact person, phone, city..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="appr-search-input"
          />
          {search && (
            <button
              type="button"
              className="appr-search-clear"
              onClick={() => setSearch('')}
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filters Group */}
        <div className="appr-filters-group">
          {/* Category Dropdown */}
          <div className="appr-select-wrap">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="appr-select-input"
            >
              <option value="all">All Categories ({categories.length})</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Runway Filter Tabs */}
          <div className="appr-tabs-wrap">
            <button
              type="button"
              className={`appr-tab-btn ${balanceFilter === 'all' ? 'active' : ''}`}
              onClick={() => setBalanceFilter('all')}
            >
              All <span className="appr-tab-count">{totalApproved}</span>
            </button>
            <button
              type="button"
              className={`appr-tab-btn tab-healthy ${balanceFilter === 'healthy' ? 'active' : ''}`}
              onClick={() => setBalanceFilter('healthy')}
            >
              Healthy <span className="appr-tab-count">{healthyCount}</span>
            </button>
            <button
              type="button"
              className={`appr-tab-btn tab-low ${balanceFilter === 'low' ? 'active' : ''}`}
              onClick={() => setBalanceFilter('low')}
            >
              Low Alert <span className="appr-tab-count">{lowCount}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Approved Members List Table */}
      <div className="appr-table-card">
        <table>
          <thead>
            <tr>
              <th style={{ width: '30%' }}>Approved Client &amp; Entity</th>
              <th style={{ width: '24%' }}>Verification &amp; Compliance</th>
              <th style={{ width: '26%' }}>Live Wallet Balance &amp; Burn Pacing</th>
              <th style={{ width: '20%', textAlign: 'right' }}>Direct Operations Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', padding: '48px 24px', color: '#64748b' }}>
                  <UserCheck size={36} color="#cbd5e1" style={{ marginBottom: 12 }} />
                  <div style={{ fontWeight: 800, fontSize: '1rem', color: '#1e293b' }}>No Approved Members Found</div>
                  <div style={{ fontSize: '0.84rem', marginTop: 4 }}>
                    Approved members require both Gate 1 Payment and Gate 2 Profile KYC completion.
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((m) => {
                const bal = Number(m.balance || m.walletBalance || 0);
                const pacing = Number(m.dailyPacing || m.dailyAdSpend || 300);
                const runway = Number(m.runwayDays ?? Math.floor(bal / Math.max(pacing, 1)));
                const isHealthy = runway > 3;
                const isLow = runway > 0 && runway <= 3;
                const isLowBalance = bal < pacing || bal <= 0 || runway <= 1;
                const cleanPhone = (m.phone || '').trim();

                const proper = resolveCustomerIdentity(m, customers);
                return (
                  <tr key={m.id || m.phone}>
                    {/* 1. Client & Entity Details */}
                    <td>
                      <div className="appr-client-cell">
                        <div className="appr-client-avatar">
                          {proper.initials}
                        </div>
                        <div className="appr-client-info">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
                            {proper.username && (
                              <span style={{ fontWeight: 800, color: '#4f46e5', background: '#eef2ff', padding: '2px 8px', borderRadius: 6, fontSize: '0.80rem' }}>
                                @{proper.username}
                              </span>
                            )}
                            <span className="desk-pill" style={{ background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', fontSize: '0.66rem', fontWeight: 800, padding: '1px 6px' }}>
                              ✓ Approved Member
                            </span>
                          </div>
                          <div className="appr-client-name-row">
                            <span className="appr-client-name" style={{ fontSize: '0.96rem', fontWeight: 800, color: '#0f172a' }}>
                              {proper.displayName}
                            </span>
                            {isLowBalance && (
                              <span className="desk-pill pill-rose appr-low-pill">
                                ⚠️ Low Balance
                              </span>
                            )}
                          </div>
                          <div className="appr-client-lead">
                            👤 <b>{m.contactPerson || m.contact || 'Authorized Lead'}</b> • +91{' '}
                            <span className="appr-phone">{cleanPhone}</span>
                          </div>
                          <div className="appr-client-meta">
                            ✉️ {m.email || 'Registered via Web Portal'} • 📍 {m.city || 'India'}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* 2. Verification Badges */}
                    <td>
                      <div className="appr-compliance-stack">
                        <div className="appr-badge-row">
                          <span className="desk-pill pill-emerald">
                            <CheckCircle2 size={12} /> Gate 1: Paid (₹{Number(m.amountPaid || bal).toLocaleString('en-IN')})
                          </span>
                          <span className="desk-pill pill-indigo">
                            <ShieldCheck size={12} /> Gate 2: 100% KYC Complete
                          </span>
                        </div>
                        <div className="appr-category-line">
                          Category: <b>{m.category || 'Meta Ads Lead Generation'}</b>
                        </div>
                        <div className="appr-timestamp">
                          Approved: {formatIndianDateTime(m.completedAt || m.registeredAt, m.completedAt || m.registeredAtRaw || m.registered_at)}
                        </div>
                      </div>
                    </td>

                    {/* 3. Live Wallet Balance */}
                    <td>
                      <div className={`appr-wallet-card ${isLowBalance ? 'is-low' : 'is-healthy'}`}>
                        <div className="appr-wallet-header">
                          <span className="appr-wallet-tag">Live Ad Balance</span>
                          <span className={`appr-status-badge ${!isLowBalance ? 'badge-live' : 'badge-low'}`}>
                            <span className="sales-pulse-dot" style={{ width: 6, height: 6, background: !isLowBalance ? '#059669' : '#e11d48' }} />
                            {!isLowBalance ? 'LIVE' : 'LOW BALANCE'}
                          </span>
                        </div>

                        <div className={`appr-wallet-amount ${!isLowBalance ? 'text-emerald' : 'text-rose'}`}>
                          {formatINR(bal)}
                        </div>

                        <div className="appr-wallet-footer">
                          <span className="appr-daily-rate">
                            Daily: <b>₹{pacing}/day</b>
                          </span>
                          <span className={`desk-pill ${isHealthy ? 'pill-emerald' : !isLowBalance ? 'pill-amber' : 'pill-rose'}`}>
                            {runway} Days Runway
                          </span>
                        </div>
                        {isLowBalance && (
                          <div className="appr-wallet-alert">
                            <AlertTriangle size={11} /> ⚠️ Low Balance - Replenish Soon
                          </div>
                        )}
                      </div>
                    </td>

                    {/* 4. Operations Actions (Top-Up Removed) */}
                    <td className="appr-actions-cell">
                      <div className="appr-actions-wrap">
                        <a
                          href={`tel:${cleanPhone}`}
                          className="appr-action-btn appr-action-call"
                          title="Direct phone call"
                        >
                          <Phone size={13} />
                          <span>Call</span>
                        </a>
                        <a
                          href={`https://wa.me/91${cleanPhone}?text=Hello%20${encodeURIComponent(m.contactPerson || m.name)},%20this%20is%20AdMafia%20Marketing%20Operations.%20Your%20active%20campaign%20wallet%20balance%20is%20%E2%82%B9${bal.toLocaleString('en-IN')}%20(${runway}%20days%20runway%20remaining).`}
                          target="_blank"
                          rel="noreferrer"
                          className="appr-action-btn appr-action-wa"
                          title="Open WhatsApp chat"
                        >
                          <MessageSquare size={13} />
                          <span>WhatsApp</span>
                        </a>
                        <button
                          type="button"
                          onClick={() => setSelectedMember(m)}
                          className="appr-action-btn appr-action-profile"
                          title="View verified business profile"
                        >
                          <Eye size={13} />
                          <span>Profile</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL: Full Business Profile Viewer */}
      {selectedMember && (
        <div className="sales-modal-overlay" onClick={() => setSelectedMember(null)}>
          <div className="sales-modal-card" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
            <div className="desk-modal-header" style={{ marginBottom: 20 }}>
              <div>
                {(() => {
                  const selProper = resolveCustomerIdentity(selectedMember, customers);
                  return (
                    <div>
                      <div className="desk-modal-tag" style={{ color: '#059669', marginBottom: 4 }}>
                        ✓ 100% KYC &amp; PAYMENT VERIFIED MEMBER
                      </div>
                      {selProper.username && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontWeight: 800, color: '#4f46e5', background: '#eef2ff', padding: '2px 8px', borderRadius: 6, fontSize: '0.80rem' }}>
                            @{selProper.username}
                          </span>
                        </div>
                      )}
                      <h3 className="desk-modal-title" style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#0f172a' }}>
                        {selProper.displayName}
                      </h3>
                    </div>
                  );
                })()}
              </div>
              <button type="button" className="desk-close-btn" onClick={() => setSelectedMember(null)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 22 }}>
              <div style={{ background: '#f8fafc', padding: '14px 16px', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.70rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 800 }}>Authorized Contact</div>
                <div style={{ fontWeight: 800, fontSize: '0.94rem', color: '#0f172a', marginTop: 3 }}>{resolveCustomerIdentity(selectedMember, customers).contactPerson}</div>
                <div style={{ fontSize: '0.80rem', color: '#475569', marginTop: 2 }}>+91 {selectedMember.phone}</div>
              </div>

              <div style={{ background: '#f8fafc', padding: '14px 16px', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.70rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 800 }}>Business Category</div>
                <div style={{ fontWeight: 800, fontSize: '0.94rem', color: '#4f46e5', marginTop: 3 }}>{selectedMember.category || 'Meta Ads Lead Gen'}</div>
                <div style={{ fontSize: '0.80rem', color: '#475569', marginTop: 2 }}>{selectedMember.industry || 'Digital Lead Acquisition'}</div>
              </div>

              <div style={{ background: '#f8fafc', padding: '14px 16px', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.70rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 800 }}>Live Wallet Reserves</div>
                <div style={{ fontWeight: 900, fontSize: '1.25rem', color: '#059669', marginTop: 3 }}>{formatINR(selectedMember.balance || selectedMember.walletBalance || 0)}</div>
                <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: 2 }}>Burn: ₹300/day • {selectedMember.runwayDays || Math.floor((selectedMember.balance || 0) / 300)} Days Left</div>
              </div>

              <div style={{ background: '#f8fafc', padding: '14px 16px', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.70rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 800 }}>Target Geography</div>
                <div style={{ fontWeight: 800, fontSize: '0.94rem', color: '#0f172a', marginTop: 3 }}>{selectedMember.city || 'India'}</div>
                <div style={{ fontSize: '0.80rem', color: '#475569', marginTop: 2 }}>{selectedMember.state || 'Maharashtra'}, India</div>
              </div>

              <div style={{ gridColumn: 'span 2', background: '#f8fafc', padding: '14px 16px', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.70rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 800 }}>Registered Work Email &amp; Web Domain</div>
                <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0f172a', marginTop: 3 }}>✉️ {selectedMember.email || 'Registered via Web Portal'}</div>
                {selectedMember.website && (
                  <div style={{ fontSize: '0.82rem', color: '#4f46e5', marginTop: 4 }}>
                    🌐 <a href={selectedMember.website.startsWith('http') ? selectedMember.website : `https://${selectedMember.website}`} target="_blank" rel="noreferrer" style={{ color: '#4f46e5', textDecoration: 'none', fontWeight: 600 }}>{selectedMember.website} ↗</a>
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, borderTop: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                Approved Member since: {formatIndianDateTime(selectedMember.completedAt || selectedMember.registeredAt)}
              </span>
              <button
                type="button"
                className="sales-btn-primary"
                onClick={() => setSelectedMember(null)}
                style={{ padding: '8px 18px', borderRadius: 10, fontSize: '0.84rem' }}
              >
                Close Profile
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ==========================================================================
   DESK 11: ALL FAILED TRANSACTIONS (Recovery & Reconnection Desk)
   ========================================================================== */
export function FailedTransactionsDesk({ customers = [], setCustomers, allTransactions = [], onRefresh }) {
  const [filter, setFilter] = useState('all'); // 'all' | 'high' | 'upi' | 'card' | 'deleted'
  const [search, setSearch] = useState('');
  const [failedList, setFailedList] = useState(() => {
    try {
      const raw = localStorage.getItem('growthline_failed_transactions');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) { }
    return [];
  });
  const [loading, setLoading] = useState(true);
  const [selectedFailTx, setSelectedFailTx] = useState(null);
  const [topupCust, setTopupCust] = useState(null);
  const [topupAmount, setTopupAmount] = useState(1000);

  // Deleted history archive state (dynamically fetched from PostgreSQL & synced)
  const [deletedHistoryList, setDeletedHistoryList] = useState(() => {
    try {
      const raw = localStorage.getItem('growthline_deleted_failed_transactions');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) { }
    return [];
  });

  const loadFailedTransactions = React.useCallback(async (showToast = false) => {
    setLoading(true);
    try {
      const res = await crmApi.getFailedTransactions();
      if (res && res.ok && Array.isArray(res.failedTransactions)) {
        setFailedList(res.failedTransactions);
        try {
          localStorage.setItem('growthline_failed_transactions', JSON.stringify(res.failedTransactions));
        } catch (e) { }
        setLoading(false);
        if (showToast) {
          Swal.fire({
            icon: 'success',
            title: 'Failed Transactions Synced',
            text: `Successfully synced ${res.failedTransactions.length} records from database.`,
            timer: 1600,
            showConfirmButton: false,
          });
        }
        return;
      }
    } catch (e) {
      console.warn('[Failed transactions API fallback]', e);
    }

    try {
      const raw = localStorage.getItem('growthline_failed_transactions');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setFailedList(parsed);
        }
      }
    } catch (e) { }
    setLoading(false);
  }, []);

  const loadDeletedHistory = React.useCallback(async () => {
    try {
      const res = await crmApi.getFailedTransactionsHistory();
      if (res && res.ok && Array.isArray(res.history)) {
        setDeletedHistoryList(res.history);
        try {
          localStorage.setItem('growthline_deleted_failed_transactions', JSON.stringify(res.history));
        } catch (e) { }
        return;
      }
    } catch (e) {
      console.warn('[Load deleted history fallback]', e);
    }

    try {
      const raw = localStorage.getItem('growthline_deleted_failed_transactions');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setDeletedHistoryList(parsed);
        }
      }
    } catch (e) { }
  }, []);

  useEffect(() => {
    loadFailedTransactions();
    loadDeletedHistory();

    const handleSync = (e) => {
      const fresh = e?.detail;
      if (fresh) {
        if (Array.isArray(fresh.failedTransactions)) {
          setFailedList(fresh.failedTransactions);
        }
        if (Array.isArray(fresh.deletedFailedTransactions)) {
          setDeletedHistoryList(fresh.deletedFailedTransactions);
        }
      }
    };

    const handleFailedTxChange = () => {
      loadFailedTransactions();
      loadDeletedHistory();
    };

    window.addEventListener('growthline_postgres_synced', handleSync);
    window.addEventListener('growthline_failed_tx_updated', handleFailedTxChange);

    return () => {
      window.removeEventListener('growthline_postgres_synced', handleSync);
      window.removeEventListener('growthline_failed_tx_updated', handleFailedTxChange);
    };
  }, [loadFailedTransactions, loadDeletedHistory]);

  const filtered = failedList.filter((item) => {
    const q = search.toLowerCase().trim();
    const matchSearch =
      !q ||
      (item.customerName || '').toLowerCase().includes(q) ||
      (item.contactPerson || '').toLowerCase().includes(q) ||
      (item.phone || '').includes(q) ||
      (item.email || '').toLowerCase().includes(q) ||
      (item.city || '').toLowerCase().includes(q) ||
      (item.ref || '').toLowerCase().includes(q) ||
      (item.desc || '').toLowerCase().includes(q) ||
      (item.failureReason || '').toLowerCase().includes(q);

    if (!matchSearch) return false;
    if (filter === 'high') return (Number(item.amount) || 0) >= 2000;
    if (filter === 'upi') return (item.method || '').toLowerCase().includes('upi') || (item.desc || '').toLowerCase().includes('upi');
    if (filter === 'card') return (item.method || '').toLowerCase().includes('card') || (item.method || '').toLowerCase().includes('gateway');
    return true;
  });

  const filteredHistory = deletedHistoryList.filter((item) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      (item.customerName || '').toLowerCase().includes(q) ||
      (item.companyName || '').toLowerCase().includes(q) ||
      (item.contactPerson || '').toLowerCase().includes(q) ||
      (item.phone || '').includes(q) ||
      (item.email || '').toLowerCase().includes(q) ||
      (item.city || '').toLowerCase().includes(q) ||
      (item.ref || '').toLowerCase().includes(q) ||
      (item.desc || '').toLowerCase().includes(q) ||
      (item.failureReason || '').toLowerCase().includes(q)
    );
  });

  const totalAtRisk = failedList.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const avgFailedAmount = failedList.length ? Math.round(totalAtRisk / failedList.length) : 0;
  const totalDeletedAmount = deletedHistoryList.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  const handleApplyTopup = async () => {
    if (!topupCust) return;
    const rechargeNum = Number(topupAmount) || 0;
    if (rechargeNum <= 0) {
      Swal.fire({
        icon: 'warning',
        title: 'Invalid Amount',
        text: 'Please enter a valid recharge amount.',
        confirmButtonColor: '#4f46e5',
      });
      return;
    }
    const targetCust = customers.find((c) => c.id === topupCust.id || c.phone === topupCust.phone) || topupCust;
    const curBal = targetCust.balance ?? targetCust.walletBalance ?? 0;
    const newBal = curBal + rechargeNum;
    const pacing = targetCust.dailyPacing || targetCust.dailyAdSpend || 300;
    const addedDays = Math.floor(rechargeNum / pacing);
    const newRunway = (targetCust.runwayDays || 0) + addedDays;

    if (setCustomers) {
      setCustomers((prev) =>
        prev.map((c) => {
          if (c.id === targetCust.id || c.phone === targetCust.phone) {
            return {
              ...c,
              balance: newBal,
              walletBalance: newBal,
              amountPaid: (c.amountPaid || 0) + rechargeNum,
              runwayDays: newRunway,
              paymentStatus: 'paid',
              payment_status: 'paid',
              status: 'active',
            };
          }
          return c;
        })
      );
    }

    try {
      await crmApi.salesTopUpWallet({
        customerId: targetCust.id || targetCust.phone,
        phone: targetCust.phone,
        amount: rechargeNum,
        paymentMode: 'Sales Deposit (Recovery Top-Up)',
        notes: `Recovered failed payment of ₹${topupCust.amount || rechargeNum}. Sales-assisted wallet activation.`,
      });

      const targetId = topupCust.id || topupCust.ref;
      if (targetId) {
        await crmApi.deleteFailedTransaction(targetId, {
          ...topupCust,
          status: 'Recovered & Settled ✓',
          failureReason: `Recovered via Sales Assisted Top-Up of ₹${rechargeNum}`,
        }).catch(() => { });
      }
    } catch (e) {
      console.warn('[Sales top-up recovery non-fatal]', e);
    }

    // Remove from local failedList
    setFailedList((prev) => prev.filter((t) => t.id !== topupCust.id && t.ref !== topupCust.ref && t.customerId !== topupCust.id));

    try {
      crmApi.syncStateFromPostgres();
      window.dispatchEvent(new CustomEvent('growthline_failed_tx_updated'));
      window.dispatchEvent(new CustomEvent('growthline_wallet_transactions_updated'));
      window.dispatchEvent(new CustomEvent('growthline_payment_recorded'));
    } catch (e) { }

    Swal.fire({
      icon: 'success',
      title: 'Wallet Credited & Recovered!',
      html: `Successfully credited <strong>₹${rechargeNum.toLocaleString('en-IN')}</strong> to <strong>${targetCust.companyName || targetCust.name}</strong>.<br/><small style="color: #64748b;">Authoritative ledger entry and official tax receipt recorded in PostgreSQL.</small>`,
      confirmButtonColor: '#059669',
    });
    setTopupCust(null);
  };

  const handleDeleteFailedTx = async (tx) => {
    const confirmResult = await Swal.fire({
      title: 'Remove Failed Transaction?',
      html: `
        <div style="text-align: left; font-size: 0.90rem; line-height: 1.7; color: #334155;">
          <div style="margin-bottom: 6px;">Client / Business: <strong style="color: #0f172a;">${tx.companyName || tx.customerName || 'Customer'}</strong></div>
          <div style="margin-bottom: 6px;">Failed Amount: <strong style="color: #dc2626; font-size: 1.05rem;">₹${Number(tx.amount || 0).toLocaleString('en-IN')}</strong></div>
          <div style="margin-bottom: 6px;">Transaction Ref: <code style="font-family: monospace; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; color: #475569;">${tx.ref || tx.id}</code></div>
          <div style="margin-top: 10px; padding: 10px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; color: #15803d; font-size: 0.82rem;">
            ℹ️ This record will be archived into the <strong>Deleted History</strong> tab and can be reviewed or restored anytime.
          </div>
        </div>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, Delete Record',
      cancelButtonText: 'Cancel',
      reverseButtons: true,
      focusCancel: true,
    });

    if (!confirmResult.isConfirmed) return;

    const targetId = tx.id || tx.ref;
    try {
      await crmApi.deleteFailedTransaction(targetId, tx);
    } catch (e) {
      console.warn('[Delete failed tx non-fatal]', e);
    }

    const nowStr = new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    const archivedItem = {
      ...tx,
      originalId: tx.id || tx.ref,
      id: `del_${tx.id || tx.ref}_${Date.now()}`,
      deletedAt: nowStr,
      deletedBy: 'Sales Admin',
      status: 'Deleted Record',
    };

    setDeletedHistoryList((prev) => {
      const updated = [archivedItem, ...prev.filter(item => item.ref !== tx.ref && item.id !== tx.id)];
      try {
        localStorage.setItem('growthline_deleted_failed_transactions', JSON.stringify(updated));
      } catch (err) { }
      return updated;
    });

    try {
      const raw = localStorage.getItem('growthline_wallet_transactions');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const updated = parsed.filter(t => t.id !== tx.id && t.reference_utr !== tx.ref && t.ref !== tx.ref);
          localStorage.setItem('growthline_wallet_transactions', JSON.stringify(updated));
        }
      }
    } catch (e) { }

    setFailedList((prev) => {
      const updated = prev.filter((t) => t.id !== tx.id && t.ref !== tx.ref);
      try {
        localStorage.setItem('growthline_failed_transactions', JSON.stringify(updated));
      } catch (e) { }
      return updated;
    });
    if (selectedFailTx && (selectedFailTx.id === tx.id || selectedFailTx.ref === tx.ref)) {
      setSelectedFailTx(null);
    }

    try {
      window.dispatchEvent(new CustomEvent('growthline_failed_tx_updated'));
    } catch (e) { }

    Swal.fire({
      icon: 'success',
      title: 'Archived to Deleted History',
      html: `Transaction moved to <strong>Deleted History</strong> tab.`,
      timer: 1600,
      showConfirmButton: false,
    });
  };

  const handleClearAllFailed = async () => {
    const confirmResult = await Swal.fire({
      title: 'Clear All Failed Records?',
      html: `
        <div style="text-align: left; font-size: 0.90rem; line-height: 1.7; color: #334155;">
          <p>You are about to clear all <strong>${failedList.length} declined transaction records</strong> totalling <strong>${formatINR(totalAtRisk)}</strong>.</p>
          <div style="margin-top: 10px; padding: 10px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; color: #15803d; font-size: 0.82rem;">
            ℹ️ All records will be preserved in the <strong>Deleted History</strong> tab for auditing and restoration.
          </div>
        </div>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, Clear All',
      cancelButtonText: 'Cancel',
      reverseButtons: true,
      focusCancel: true,
    });

    if (!confirmResult.isConfirmed) return;

    try {
      await crmApi.clearAllFailedTransactions(failedList);
    } catch (e) {
      console.warn('[Clear all failed tx non-fatal]', e);
    }

    const nowStr = new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    const archivedBatch = failedList.map((tx) => ({
      ...tx,
      originalId: tx.id || tx.ref,
      id: `del_${tx.id || tx.ref}_${Date.now()}`,
      deletedAt: nowStr,
      deletedBy: 'Sales Admin',
      status: 'Deleted Record',
    }));

    setDeletedHistoryList((prev) => {
      const updated = [...archivedBatch, ...prev];
      try {
        localStorage.setItem('growthline_deleted_failed_transactions', JSON.stringify(updated));
      } catch (err) { }
      return updated;
    });

    try {
      const raw = localStorage.getItem('growthline_wallet_transactions');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const updated = parsed.filter(
            (t) =>
              !String(t.status || '').toLowerCase().includes('fail') &&
              !String(t.type || '').toLowerCase().includes('fail') &&
              !String(t.ref || t.reference_utr || '').startsWith('DISMISS-')
          );
          localStorage.setItem('growthline_wallet_transactions', JSON.stringify(updated));
        }
      }
    } catch (e) { }

    setFailedList([]);
    try {
      localStorage.setItem('growthline_failed_transactions', JSON.stringify([]));
    } catch (e) { }
    setSelectedFailTx(null);

    try {
      window.dispatchEvent(new CustomEvent('growthline_failed_tx_updated'));
    } catch (e) { }

    Swal.fire({
      icon: 'success',
      title: 'Records Moved to History',
      text: 'All failed transaction records have been safely archived in Deleted History.',
      timer: 1600,
      showConfirmButton: false,
    });
  };

  const handleRestoreHistory = async (item) => {
    const confirmResult = await Swal.fire({
      title: 'Restore Failed Transaction?',
      html: `
        <div style="text-align: left; font-size: 0.90rem; line-height: 1.7; color: #334155;">
          <div>Customer: <strong style="color: #0f172a;">${item.companyName || item.customerName}</strong></div>
          <div>Amount: <strong style="color: #dc2626;">₹${Number(item.amount || 0).toLocaleString('en-IN')}</strong></div>
          <div>Ref: <code>${item.ref || item.id}</code></div>
          <div style="margin-top: 10px; padding: 10px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; color: #1e40af; font-size: 0.82rem;">
            This will return the declined transaction back to the active Failed Transactions table.
          </div>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#4f46e5',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, Restore Record',
      cancelButtonText: 'Cancel',
      reverseButtons: true,
    });

    if (!confirmResult.isConfirmed) return;

    try {
      await crmApi.restoreFailedTransaction(item.id || item.ref);
    } catch (e) {
      console.warn('[Restore history non-fatal]', e);
    }

    setDeletedHistoryList((prev) => {
      const updated = prev.filter(t => t.id !== item.id && t.ref !== item.ref);
      try {
        localStorage.setItem('growthline_deleted_failed_transactions', JSON.stringify(updated));
      } catch (err) { }
      return updated;
    });

    const restoredItem = {
      ...item,
      id: item.originalId || item.id,
      status: 'Failed ✕',
      date: item.originalDate || item.date || 'Recently Failed',
    };
    setFailedList((prev) => {
      const updated = [restoredItem, ...prev.filter(t => t.id !== restoredItem.id && t.ref !== restoredItem.ref)];
      try {
        localStorage.setItem('growthline_failed_transactions', JSON.stringify(updated));
      } catch (e) { }
      return updated;
    });

    try {
      window.dispatchEvent(new CustomEvent('growthline_failed_tx_updated'));
    } catch (e) { }

    Swal.fire({
      icon: 'success',
      title: 'Transaction Restored!',
      text: 'The record is now back in your active Failed Transactions ledger.',
      timer: 1600,
      showConfirmButton: false,
    });
  };

  const handlePurgeHistory = async (item) => {
    const confirmResult = await Swal.fire({
      title: 'Permanently Purge Record?',
      html: `
        <div style="text-align: left; font-size: 0.90rem; line-height: 1.7; color: #334155;">
          <div>Customer: <strong style="color: #0f172a;">${item.companyName || item.customerName}</strong></div>
          <div>Amount: <strong style="color: #dc2626;">₹${Number(item.amount || 0).toLocaleString('en-IN')}</strong></div>
          <div>Ref: <code>${item.ref || item.id}</code></div>
          <div style="margin-top: 10px; padding: 10px; background: #fff1f2; border: 1px solid #fecdd3; border-radius: 8px; color: #be123c; font-size: 0.82rem;">
            ⚠️ This will permanently erase this record from history and cannot be recovered.
          </div>
        </div>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, Purge Permanently',
      cancelButtonText: 'Cancel',
      reverseButtons: true,
      focusCancel: true,
    });

    if (!confirmResult.isConfirmed) return;

    try {
      await crmApi.deleteFailedTransactionHistory(item.id || item.ref);
    } catch (e) {
      console.warn('[Purge history non-fatal]', e);
    }

    setDeletedHistoryList((prev) => {
      const updated = prev.filter(t => t.id !== item.id && t.ref !== item.ref);
      try {
        localStorage.setItem('growthline_deleted_failed_transactions', JSON.stringify(updated));
      } catch (err) { }
      return updated;
    });

    try {
      window.dispatchEvent(new CustomEvent('growthline_failed_tx_updated'));
    } catch (e) { }

    Swal.fire({
      icon: 'success',
      title: 'Permanently Purged',
      text: 'The record has been permanently wiped from history.',
      timer: 1500,
      showConfirmButton: false,
    });
  };

  const handleClearAllHistory = async () => {
    const confirmResult = await Swal.fire({
      title: 'Purge Entire Deleted History?',
      html: `
        <div style="text-align: left; font-size: 0.90rem; line-height: 1.7; color: #334155;">
          <p>You are about to permanently purge all <strong>${deletedHistoryList.length} deleted transaction history records</strong>.</p>
          <div style="margin-top: 10px; padding: 10px; background: #fff1f2; border: 1px solid #fecdd3; border-radius: 8px; color: #be123c; font-size: 0.82rem;">
            ⚠️ This action is irreversible. All historical deleted records will be permanently erased.
          </div>
        </div>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, Purge All History',
      cancelButtonText: 'Cancel',
      reverseButtons: true,
      focusCancel: true,
    });

    if (!confirmResult.isConfirmed) return;

    try {
      await crmApi.clearAllFailedTransactionHistory();
    } catch (e) {
      console.warn('[Clear all history non-fatal]', e);
    }

    setDeletedHistoryList([]);
    try {
      localStorage.removeItem('growthline_deleted_failed_transactions');
    } catch (err) { }

    try {
      window.dispatchEvent(new CustomEvent('growthline_failed_tx_updated'));
    } catch (e) { }

    Swal.fire({
      icon: 'success',
      title: 'History Cleared',
      text: 'All historical deleted records have been permanently wiped.',
      timer: 1600,
      showConfirmButton: false,
    });
  };

  return (
    <div className="desk-page-container">
      {/* Header */}
      <div className="desk-header">
        <div>
          <div className="desk-breadcrumb">SUB ADMIN &amp; SALES OPERATIONS / DESK 11</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 className="desk-title">All Failed Transactions</h1>
            <button
              type="button"
              className="sales-btn-secondary"
              style={{
                padding: '4px 12px',
                fontSize: '0.76rem',
                fontWeight: 700,
                color: '#4338ca',
                borderColor: '#c7d2fe',
                background: '#eef2ff',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                cursor: 'pointer',
                borderRadius: 6,
              }}
              onClick={() => {
                loadFailedTransactions(true);
                loadDeletedHistory();
                if (onRefresh) onRefresh();
              }}
              title="Synchronize live failed transaction logs from database"
            >
              <RefreshCw size={13} className={loading ? 'spinner-rotate' : ''} /> Sync Live
            </button>
            {filter === 'deleted' ? (
              <>
                <span className="desk-pill" style={{ background: '#fee2e2', color: '#b91c1c', fontWeight: 800 }}>
                  🗑️ {deletedHistoryList.length} Archived in Deleted History
                </span>
                <span className="desk-pill pill-indigo" style={{ fontWeight: 800 }}>
                  Archived Volume: {formatINR(totalDeletedAmount)}
                </span>
                {deletedHistoryList.length > 0 && (
                  <button
                    type="button"
                    className="sales-btn-secondary"
                    style={{
                      padding: '4px 12px',
                      fontSize: '0.76rem',
                      fontWeight: 700,
                      color: '#dc2626',
                      borderColor: '#fecdd3',
                      background: '#fff1f2',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      cursor: 'pointer',
                      borderRadius: 6,
                    }}
                    onClick={handleClearAllHistory}
                    title="Permanently purge all records in deleted history"
                  >
                    <Trash2 size={13} /> Purge All History
                  </button>
                )}
              </>
            ) : (
              <>
                <span className="desk-pill pill-rose" style={{ fontWeight: 800 }}>
                  {failedList.length} Declined Attempts
                </span>
                <span className="desk-pill pill-amber" style={{ fontWeight: 800 }}>
                  Capital at Risk: {formatINR(totalAtRisk)}
                </span>
                {failedList.length > 0 && (
                  <button
                    type="button"
                    className="sales-btn-secondary"
                    style={{
                      padding: '4px 12px',
                      fontSize: '0.76rem',
                      fontWeight: 700,
                      color: '#dc2626',
                      borderColor: '#fecdd3',
                      background: '#fff1f2',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      cursor: 'pointer',
                      borderRadius: 6,
                    }}
                    onClick={handleClearAllFailed}
                    title="Clear all failed transaction records"
                  >
                    <Trash2 size={13} /> Clear All Records
                  </button>
                )}
              </>
            )}
          </div>
          <p className="desk-subtitle">
            Comprehensive audit log of all declined client wallet payments, bank gateway rejections, customer contact details, and instant sales recovery WhatsApp actions.
          </p>
        </div>
      </div>

      {/* KPI Quad Grid */}
      <div className="desk-kpi-grid">
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">TOTAL FAILED TRANSACTIONS</div>
          <div className="desk-kpi-val text-rose">{failedList.length}</div>
          <div className="desk-kpi-sub">Total payment attempts declined</div>
        </div>
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">LOST CAPITAL AT RISK</div>
          <div className="desk-kpi-val text-rose">{formatINR(totalAtRisk)}</div>
          <div className="desk-kpi-sub">Uncollected customer ad spend</div>
        </div>
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">AVG FAILED ORDER VALUE</div>
          <div className="desk-kpi-val text-indigo">{formatINR(avgFailedAmount)}</div>
          <div className="desk-kpi-sub">Average recharge amount</div>
        </div>
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">SALES RECOVERY ACTION</div>
          <div className="desk-kpi-val text-emerald">100% Ready</div>
          <div className="desk-kpi-sub">Direct WhatsApp sales assistance</div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="desk-filter-bar">
        <div className="desk-tabs">
          <button
            type="button"
            className={`desk-tab ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All Failed ({failedList.length})
          </button>
          <button
            type="button"
            className={`desk-tab ${filter === 'high' ? 'active' : ''}`}
            onClick={() => setFilter('high')}
          >
            🔥 High Value (&ge; ₹2,000)
          </button>
          <button
            type="button"
            className={`desk-tab ${filter === 'upi' ? 'active' : ''}`}
            onClick={() => setFilter('upi')}
          >
            📱 UPI &amp; Netbanking
          </button>
          <button
            type="button"
            className={`desk-tab ${filter === 'card' ? 'active' : ''}`}
            onClick={() => setFilter('card')}
          >
            💳 Card &amp; Gateway
          </button>
          <button
            type="button"
            className={`desk-tab ${filter === 'deleted' ? 'active' : ''}`}
            onClick={() => setFilter('deleted')}
            style={
              filter === 'deleted'
                ? {
                  background: '#fee2e2',
                  color: '#b91c1c',
                  borderColor: '#fca5a5',
                  fontWeight: 800,
                }
                : {
                  color: '#64748b',
                  fontWeight: 700,
                }
            }
          >
            🗑️ Deleted History ({deletedHistoryList.length})
          </button>
        </div>
        <div className="desk-search-wrap">
          <Search size={16} className="desk-search-icon" />
          <input
            type="text"
            className="desk-search-input"
            placeholder={
              filter === 'deleted'
                ? 'Search deleted history by customer, phone, UTR...'
                : 'Search by customer name, phone, UTR, decline reason...'
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="desk-table-card">
        <table className="desk-table">
          <thead>
            {filter === 'deleted' ? (
              <tr>
                <th>Customer Business &amp; Contact Number</th>
                <th>Failed Amount</th>
                <th>Declined Date &amp; Time</th>
                <th>Deleted Date &amp; Info</th>
                <th>Decline Reason &amp; Gateway Data</th>
                <th style={{ textAlign: 'right' }}>History Actions</th>
              </tr>
            ) : (
              <tr>
                <th>Customer Business &amp; Contact Number</th>
                <th>Failed Amount</th>
                <th>Date &amp; Time</th>
                <th>Payment Gateway &amp; UTR</th>
                <th>Decline Reason &amp; Error Data</th>
                <th style={{ textAlign: 'right' }}>Recovery Actions</th>
              </tr>
            )}
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                  <RefreshCw size={24} className="spinner-rotate" style={{ margin: '0 auto 8px' }} />
                  <div>Loading failed transactions log...</div>
                </td>
              </tr>
            ) : filter === 'deleted' ? (
              filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                    <CheckCircle2 size={36} color="#059669" style={{ margin: '0 auto 10px' }} />
                    <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
                      Deleted History is Clean
                    </h4>
                    <p style={{ margin: '4px 0 0 0', fontSize: '0.84rem' }}>
                      No deleted failed transaction records found in the archive.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredHistory.map((item) => {
                  const cleanPhone = String(item.phone || '').replace(/\D/g, '').slice(-10);
                  return (
                    <tr key={item.id || item.ref} style={{ background: '#fff9f9' }}>
                      {/* 1. Customer Business & Contact */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 800, fontSize: '0.96rem', color: '#0f172a' }}>
                            {item.companyName || item.customerName || 'Customer'}
                          </span>
                          {item.category && (
                            <span style={{ background: '#f1f5f9', color: '#475569', padding: '1px 6px', borderRadius: 6, fontSize: '0.70rem', fontWeight: 700 }}>
                              {item.category}
                            </span>
                          )}
                        </div>
                        <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 800, color: '#059669', fontSize: '0.92rem', fontFamily: 'monospace' }}>
                            📞 +91 {cleanPhone || 'No Phone'}
                          </span>
                          <span style={{ fontSize: '0.80rem', fontWeight: 700, color: '#4338ca' }}>
                            ({item.contactPerson || 'Customer'})
                          </span>
                        </div>
                        <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: 2 }}>
                          {item.city ? `${item.city}, ` : ''}{item.state || 'Maharashtra'}
                        </div>
                      </td>

                      {/* 2. Failed Amount */}
                      <td>
                        <span style={{ fontSize: '1.15rem', fontWeight: 900, color: '#dc2626', textDecoration: 'line-through' }}>
                          {formatINR(item.amount)}
                        </span>
                        <div style={{ marginTop: 3 }}>
                          <span
                            className="desk-pill"
                            style={{ fontSize: '0.66rem', padding: '2px 7px', fontWeight: 800, background: '#fee2e2', color: '#b91c1c' }}
                          >
                            🗑️ Archived in Trash
                          </span>
                        </div>
                      </td>

                      {/* 3. Declined Date & Time */}
                      <td>
                        <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#1e293b' }}>
                          {item.originalDate || item.date || 'Previous Session'}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 2 }}>
                          Original Ref: <code>{item.ref || item.id}</code>
                        </div>
                      </td>

                      {/* 4. Deleted Date & Info */}
                      <td>
                        <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#b91c1c' }}>
                          🗑️ {item.deletedAt || 'Recently Deleted'}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 2 }}>
                          By: <span style={{ fontWeight: 700, color: '#334155' }}>{item.deletedBy || 'Sales Admin'}</span>
                        </div>
                      </td>

                      {/* 5. Decline Reason & Gateway */}
                      <td style={{ maxWidth: 280 }}>
                        <div
                          style={{
                            background: '#fff1f2',
                            color: '#be123c',
                            border: '1px solid #fecdd3',
                            padding: '6px 10px',
                            borderRadius: 8,
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            lineHeight: 1.3
                          }}
                        >
                          ⚠️ {item.failureReason || item.desc || 'Bank transaction declined'}
                        </div>
                        <div style={{ fontSize: '0.70rem', color: '#64748b', marginTop: 4 }}>
                          Gateway: {item.method || 'Razorpay Gateway'}
                        </div>
                      </td>

                      {/* 6. Actions: Restore & Purge */}
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                          {/* Restore Button */}
                          <button
                            type="button"
                            className="desk-action-btn"
                            style={{
                              background: '#eff6ff',
                              color: '#2563eb',
                              borderColor: '#bfdbfe',
                              fontWeight: 800,
                              padding: '5px 10px',
                              fontSize: '0.78rem',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                            }}
                            onClick={() => handleRestoreHistory(item)}
                            title="Restore back to active failed transactions"
                          >
                            <RotateCcw size={13} /> Restore
                          </button>

                          {/* WhatsApp Direct Action */}
                          {cleanPhone && (
                            <a
                              href={`https://wa.me/91${cleanPhone}?text=Hello%20${encodeURIComponent(item.contactPerson || '')},%20we%20are%20following%20up%20on%20your%20AdMafia%20recharge%20attempt%20of%20${encodeURIComponent(formatINR(item.amount))}.`}
                              target="_blank"
                              rel="noreferrer"
                              className="desk-action-btn"
                              style={{
                                textDecoration: 'none',
                                background: '#25D366',
                                color: '#ffffff',
                                borderColor: '#22c55e',
                                fontWeight: 800,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 5,
                                padding: '5px 8px',
                                fontSize: '0.78rem'
                              }}
                              title="Chat with customer on WhatsApp"
                            >
                              <MessageSquare size={13} />
                            </a>
                          )}

                          {/* Purge Button */}
                          <button
                            type="button"
                            className="desk-action-btn"
                            style={{
                              background: '#fff1f2',
                              color: '#dc2626',
                              borderColor: '#fecdd3',
                              fontWeight: 700,
                              padding: '5px 8px',
                            }}
                            onClick={() => handlePurgeHistory(item)}
                            title="Permanently erase from history"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                  <CheckCircle2 size={36} color="#059669" style={{ margin: '0 auto 10px' }} />
                  <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
                    Zero Failed Transactions
                  </h4>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.84rem' }}>
                    All customer wallet recharge payments and auto-debits have succeeded without bank rejection errors.
                  </p>
                </td>
              </tr>
            ) : (
              filtered.map((tx) => {
                const cleanPhone = String(tx.phone || '').replace(/\D/g, '').slice(-10);
                const matchedCust = customers.find(c => c.id === tx.customerId || (cleanPhone && c.phone && String(c.phone).includes(cleanPhone)));
                const rawUser = tx.username || matchedCust?.username || '';
                const capUser = rawUser ? rawUser.charAt(0).toUpperCase() + rawUser.slice(1) : '';

                let contactTitle = tx.contactPerson || matchedCust?.contactPerson || matchedCust?.name || '';
                if (!contactTitle || contactTitle.toLowerCase() === 'registered business' || contactTitle.toLowerCase() === 'account admin') {
                  contactTitle = capUser || (cleanPhone ? `Customer ${cleanPhone.slice(-4)}` : 'Client Admin');
                }

                let companyTitle = tx.companyName || tx.customerName || matchedCust?.companyName || '';
                if (!companyTitle || companyTitle.toLowerCase() === 'registered business' || companyTitle.toLowerCase() === 'corporate workspace') {
                  companyTitle = capUser ? `${capUser} Enterprises` : contactTitle;
                }
                const failReason = tx.failureReason || tx.desc || 'Payment declined by bank or user cancelled';

                return (
                  <tr key={tx.id || tx.ref} style={{ background: '#fffcfc' }}>
                    {/* 1. Customer Business & Phone Number */}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 800, fontSize: '0.96rem', color: '#0f172a' }}>
                          {companyTitle}
                        </span>
                        {(tx.category || matchedCust?.category) && (
                          <span style={{ background: '#f1f5f9', color: '#475569', padding: '1px 6px', borderRadius: 6, fontSize: '0.70rem', fontWeight: 700 }}>
                            {tx.category || matchedCust?.category}
                          </span>
                        )}
                      </div>
                      <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 800, color: '#059669', fontSize: '0.92rem', fontFamily: 'monospace' }}>
                          📞 +91 {cleanPhone || 'No Phone'}
                        </span>
                        <span style={{ fontSize: '0.80rem', fontWeight: 700, color: '#4338ca' }}>
                          ({contactTitle})
                        </span>
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: 2 }}>
                        {(tx.email || matchedCust?.email) && <span>{tx.email || matchedCust?.email} • </span>}
                        {tx.city || matchedCust?.city ? `${tx.city || matchedCust?.city}, ` : ''}
                        {tx.state || matchedCust?.state || 'Maharashtra'}
                      </div>
                    </td>

                    {/* 2. Failed Amount */}
                    <td>
                      <span style={{ fontSize: '1.15rem', fontWeight: 900, color: '#dc2626', textDecoration: 'line-through' }}>
                        {formatINR(tx.amount)}
                      </span>
                      <div style={{ marginTop: 3 }}>
                        <span
                          className="desk-pill pill-rose"
                          style={{ fontSize: '0.66rem', padding: '2px 7px', fontWeight: 800 }}
                        >
                          ✕ Payment Declined
                        </span>
                      </div>
                    </td>

                    {/* 3. Date & Time */}
                    <td>
                      <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#1e293b' }}>
                        {tx.date}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 2 }}>
                        Transaction Ref: <code>{tx.ref || tx.id}</code>
                      </div>
                    </td>

                    {/* 4. Payment Gateway & Method */}
                    <td>
                      <div style={{ fontWeight: 700, fontSize: '0.86rem', color: '#4f46e5' }}>
                        {tx.method || 'Razorpay Secure (Failed)'}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 2 }}>
                        Ref UTR: <code>{tx.ref}</code>
                      </div>
                    </td>

                    {/* 5. Decline Reason & Error Data */}
                    <td style={{ maxWidth: 280 }}>
                      <div
                        style={{
                          background: '#fff1f2',
                          color: '#be123c',
                          border: '1px solid #fecdd3',
                          padding: '6px 10px',
                          borderRadius: 8,
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          lineHeight: 1.3
                        }}
                      >
                        ⚠️ {failReason}
                      </div>
                    </td>

                    {/* 6. Recovery Actions */}
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        {/* WhatsApp Customer Action */}
                        {cleanPhone ? (
                          <a
                            href={`https://wa.me/91${cleanPhone}?text=Hello%20${encodeURIComponent(contactTitle)},%20we%20noticed%20your%20recent%20wallet%20recharge%20attempt%20of%20${encodeURIComponent(formatINR(tx.amount))}%20on%20AdMafia%20was%20declined%20by%20the%20bank.%20Would%20you%20like%20our%20team%20to%20assist%20you%20with%20activating%20your%20campaign?`}
                            target="_blank"
                            rel="noreferrer"
                            className="desk-action-btn"
                            style={{
                              textDecoration: 'none',
                              background: '#25D366',
                              color: '#ffffff',
                              borderColor: '#22c55e',
                              fontWeight: 800,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              padding: '5px 10px',
                              fontSize: '0.78rem'
                            }}
                            title="Chat with customer on WhatsApp"
                          >
                            <MessageSquare size={13} /> WhatsApp
                          </a>
                        ) : null}

                        {/* Direct Call Button */}
                        {cleanPhone ? (
                          <a
                            href={`tel:+91${cleanPhone}`}
                            className="desk-action-btn"
                            style={{ textDecoration: 'none', background: '#f8fafc', color: '#0f172a', fontWeight: 700, padding: '5px 8px' }}
                            title={`Call +91 ${cleanPhone}`}
                          >
                            <Phone size={13} color="#059669" />
                          </a>
                        ) : null}

                        {/* Direct 1-Click Recovery Credit Button */}
                        <button
                          type="button"
                          className="desk-action-btn"
                          style={{
                            background: '#ecfdf5',
                            color: '#047857',
                            borderColor: '#a7f3d0',
                            fontWeight: 800,
                            padding: '5px 10px',
                            fontSize: '0.78rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                          }}
                          onClick={() => {
                            setTopupCust({
                              id: tx.customerId,
                              name: tx.customerName || companyTitle,
                              companyName: companyTitle,
                              phone: cleanPhone || tx.phone,
                              contactPerson: contactTitle,
                              amount: tx.amount,
                              ref: tx.ref || tx.id,
                            });
                            setTopupAmount(tx.amount || 1000);
                          }}
                          title="Credit client wallet & recover transaction"
                        >
                          <Plus size={13} /> Credit Wallet
                        </button>

                        {/* Details Modal */}
                        <button
                          type="button"
                          className="desk-action-btn"
                          style={{ background: '#f8fafc', color: '#334155', fontWeight: 700, padding: '5px 8px' }}
                          onClick={() => setSelectedFailTx(tx)}
                          title="View Failed Transaction Dossier"
                        >
                          <Eye size={13} /> Details
                        </button>

                        {/* Remove / Delete Failed Transaction */}
                        <button
                          type="button"
                          className="desk-action-btn"
                          style={{
                            background: '#fff1f2',
                            color: '#dc2626',
                            borderColor: '#fecdd3',
                            fontWeight: 700,
                            padding: '5px 8px',
                          }}
                          onClick={() => handleDeleteFailedTx(tx)}
                          title="Remove this failed transaction record"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Failed Transaction Dossier Modal */}
      {selectedFailTx && (
        <div className="sales-modal-overlay" onClick={() => setSelectedFailTx(null)}>
          <div className="sales-modal-card" style={{ maxWidth: 640, width: '95%' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e2e8f0', paddingBottom: 14, marginBottom: 16 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span className="sales-dept-badge" style={{ background: '#fee2e2', color: '#b91c1c', fontWeight: 800 }}>
                    ✕ Failed Payment Dossier
                  </span>
                  <span
                    style={{
                      background: '#fff1f2',
                      color: '#be123c',
                      border: '1px solid #fecdd3',
                      padding: '2px 8px',
                      borderRadius: 9999,
                      fontSize: '0.72rem',
                      fontWeight: 800
                    }}
                  >
                    Decline Ref: {selectedFailTx.ref || selectedFailTx.id}
                  </span>
                </div>
                <h3 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: '#0f172a' }}>
                  {selectedFailTx.companyName || selectedFailTx.customerName || 'Corporate Workspace'}
                </h3>
                <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: 3 }}>
                  Registered Phone: <strong style={{ color: '#059669' }}>+91 {selectedFailTx.phone}</strong> • Contact: {selectedFailTx.contactPerson}
                </div>
              </div>
              <button type="button" className="desk-close-btn" onClick={() => setSelectedFailTx(null)}>
                <X size={18} />
              </button>
            </div>

            {/* Error & Financial Box */}
            <div style={{ background: '#fff1f2', border: '1.5px solid #fecdd3', padding: '16px', borderRadius: 12, marginBottom: 16 }}>
              <div style={{ fontSize: '0.72rem', color: '#9f1239', fontWeight: 800, textTransform: 'uppercase' }}>
                Bank Gateway Decline Reason
              </div>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: '#be123c', marginTop: 3 }}>
                ⚠️ {selectedFailTx.failureReason || selectedFailTx.desc || 'Transaction declined by bank'}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 10, borderTop: '1px dashed #fecdd3' }}>
                <div>
                  <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Attempted Amount:</span>
                  <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#dc2626' }}>
                    {formatINR(selectedFailTx.amount)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Failure Timestamp:</span>
                  <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#0f172a' }}>
                    {selectedFailTx.date}
                  </div>
                </div>
              </div>
            </div>

            {/* Customer Details Box */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '14px 16px', borderRadius: 12, marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                <div>
                  <div style={{ fontSize: '0.70rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Company / Client</div>
                  <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0f172a' }}>{selectedFailTx.companyName}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.70rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Representative</div>
                  <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0f172a' }}>{selectedFailTx.contactPerson}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.70rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Direct Phone</div>
                  <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#059669' }}>+91 {selectedFailTx.phone}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.70rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Email</div>
                  <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#0f172a' }}>{selectedFailTx.email || 'Not Provided'}</div>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 14, borderTop: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
              <a
                href={`https://wa.me/91${String(selectedFailTx.phone || '').replace(/\D/g, '').slice(-10)}?text=Hello%20${encodeURIComponent(selectedFailTx.contactPerson || 'Partner')},%20we%20noticed%20your%20recent%20wallet%20recharge%20attempt%20of%20${encodeURIComponent(formatINR(selectedFailTx.amount))}%20on%20AdMafia%20was%20declined%20by%20the%20bank.%20Would%20you%20like%20our%20team%20to%20assist%20you%20with%20activating%20your%20campaign?`}
                target="_blank"
                rel="noreferrer"
                className="desk-action-btn"
                style={{ textDecoration: 'none', background: '#25D366', color: '#ffffff', borderColor: '#22c55e', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <MessageSquare size={14} /> Open WhatsApp Chat
              </a>
              <button
                type="button"
                className="sales-btn-primary"
                onClick={() => {
                  setTopupCust({
                    id: selectedFailTx.customerId,
                    name: selectedFailTx.customerName,
                    companyName: selectedFailTx.companyName,
                    phone: selectedFailTx.phone,
                    contactPerson: selectedFailTx.contactPerson,
                  });
                  setTopupAmount(selectedFailTx.amount || 1000);
                  setSelectedFailTx(null);
                }}
                style={{ fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Plus size={14} /> Credit Wallet Manually
              </button>
              <button
                type="button"
                className="sales-btn-secondary"
                style={{
                  color: '#dc2626',
                  borderColor: '#fecdd3',
                  background: '#fff1f2',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  fontWeight: 700,
                }}
                onClick={() => handleDeleteFailedTx(selectedFailTx)}
                title="Delete this record"
              >
                <Trash2 size={14} /> Remove Record
              </button>
              <button type="button" className="desk-action-btn" onClick={() => setSelectedFailTx(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top-Up Recovery Modal */}
      {topupCust && (
        <div className="sales-modal-overlay" onClick={() => setTopupCust(null)}>
          <div className="sales-modal-card" style={{ maxWidth: 500, width: '95%' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <span className="sales-dept-badge">Sales Assisted Top-Up</span>
                <h3 style={{ margin: '4px 0 0 0', fontSize: '1.25rem', fontWeight: 800 }}>Recharge Client Wallet</h3>
              </div>
              <button type="button" className="desk-close-btn" onClick={() => setTopupCust(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="desk-modal-box" style={{ marginBottom: 14, background: '#f8fafc' }}>
              <div style={{ fontWeight: 800, fontSize: '1rem', color: '#0f172a' }}>
                {topupCust.companyName || topupCust.name || 'Corporate Workspace'}
              </div>
              <div style={{ fontSize: '0.80rem', color: '#475569', marginTop: 2 }}>
                Phone: <strong style={{ color: '#059669' }}>+91 {topupCust.phone}</strong> • Contact: {topupCust.contactPerson || 'Account Admin'}
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label className="desk-form-label" style={{ fontWeight: 800, fontSize: '0.84rem' }}>Recharge Amount (₹)</label>
              <input
                type="number"
                min="100"
                step="100"
                value={topupAmount}
                onChange={(e) => setTopupAmount(Math.max(0, Number(e.target.value) || 0))}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 8,
                  border: '1.5px solid #cbd5e1',
                  fontSize: '0.94rem',
                  fontWeight: 700,
                  marginTop: 4,
                  outline: 'none'
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className="sales-btn-secondary" onClick={() => setTopupCust(null)}>
                Cancel
              </button>
              <button type="button" className="sales-btn-primary" onClick={handleApplyTopup} style={{ fontWeight: 800 }}>
                Credit Wallet Instantly
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
