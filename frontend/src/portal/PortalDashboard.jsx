import React, { useState, useEffect } from 'react';
import {
  initialCustomer,
  initialLeads,
  initialFollowUps,
  initialTransactions,
  initialInvoices,
  translations,
} from './portalData';

import LeadHubOverview from './LeadHubOverview';
import LeadPipelineInbox from './LeadPipelineInbox';
import FollowUpsQueue from './FollowUpsQueue';
import MarketingWallet from './MarketingWallet';
import AccountProfileKYC from './AccountProfileKYC';
import {
  AddOfflineLeadModal,
  ScheduleFollowUpModal,
  LanguageSelectorModal,
  HelpSupportModal,
  AddFundsModal,
  SetDailyLimitModal,
  GstTaxInvoiceModal,
  RescheduleCallbackModal,
  ConfigureDomainModal,
  CompleteRegistrationModal,
  MarketingGrowthPaymentModal,
  BusinessProfileModal,
} from './PortalModals';
import crmApi from '../services/crmApi';
import Swal from 'sweetalert2';

export default function PortalDashboard({ onSignOut, onBackToWebsite, initialTab }) {
  const getTabFromHash = () => {
    const h = window.location.hash.toLowerCase();
    const p = window.location.pathname.toLowerCase();
    // Prioritize specific hash if present
    if (h.includes('dashboard')) return 'dashboard';
    if (h.includes('wallet')) return 'wallet';
    if (h.includes('profile')) return 'profile';
    if (h.includes('lead') || h.includes('enquiries')) return 'leads';
    if (h.includes('follow')) return 'followups';
    // Pathname fallback
    if (p.includes('wallet')) return 'wallet';
    if (p.includes('profile')) return 'profile';
    if (p.includes('lead') || p.includes('enquiries')) return 'leads';
    if (p.includes('follow')) return 'followups';
    if (p.includes('dashboard')) return 'dashboard';
    return initialTab || 'dashboard';
  };

  const [activeTab, setActiveTab] = useState(getTabFromHash);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [currentLang, setCurrentLang] = useState('en');

  // Helper to check if an item (lead/transaction/invoice) belongs to the active customer
  const belongsToCustomer = (item, cust) => {
    if (!item || !cust) return false;
    const cId = String(cust.id || '').trim();
    const cPhone = String(cust.phone || '').replace(/\D/g, '').slice(-10);
    const cUser = String(cust.username || '').trim().toLowerCase();
    const cComp = String(cust.companyName || cust.name || '').trim().toLowerCase();

    const itemCustId = String(item.customerId || '').trim();
    const itemCustPhone = String(item.customerPhone || '').replace(/\D/g, '').slice(-10);
    const itemCustUser = String(item.customerUsername || '').trim().toLowerCase();

    // Strict conflict guard: if item explicitly belongs to a different customer identity, reject immediately
    if (itemCustId && cId && itemCustId !== cId) return false;
    if (itemCustPhone && cPhone && itemCustPhone !== cPhone) return false;
    if (itemCustUser && cUser && itemCustUser !== cUser) return false;

    // 1. Authoritative Customer ID match
    if (cId && itemCustId && itemCustId === cId) return true;
    // 2. Authoritative 10-digit mobile number match
    if (cPhone && itemCustPhone && itemCustPhone === cPhone) return true;
    if (cPhone && item.phone && String(item.phone).replace(/\D/g, '').slice(-10) === cPhone && (item.type === 'topup' || item.type === 'wallet')) return true;
    // 3. Authoritative username match
    if (cUser && itemCustUser && itemCustUser === cUser) return true;
    // 4. Company Name match (only fallback when item has no conflicting customer identity)
    if (cComp && cComp.length > 2) {
      if (item.company && String(item.company).trim().toLowerCase() === cComp) return true;
      if (item.customerCompanyName && String(item.customerCompanyName).trim().toLowerCase() === cComp) return true;
      if (item.assignedCompany && String(item.assignedCompany).trim().toLowerCase() === cComp) return true;
    }

    return false;
  };

  // Customer state & entities (strictly isolated to active logged-in user)
  const [customer, setCustomer] = useState(() => {
    try {
      const activeUser = localStorage.getItem('growthline_active_user');
      if (activeUser) {
        const u = JSON.parse(activeUser);
        return {
          ...initialCustomer,
          id: u.id || '',
          companyName: u.companyName || u.name || '',
          contactPerson: u.contactPerson || u.contact || u.username || '',
          username: u.username || '',
          email: u.email || '',
          phone: u.phone || '',
          personalEmail: u.personalEmail || '',
          website: u.website || u.domain || '',
          domain: u.website || u.domain || '',
          category: u.category || '',
          industry: u.industry || '',
          city: u.city || '',
          state: u.state || '',
          country: u.country || 'India',
          profile_status: u.profileStatus || u.profile_status || 'incomplete',
          profileStatus: u.profileStatus || u.profile_status || 'incomplete',
          payment_status: u.paymentStatus || u.payment_status || 'pending',
          paymentStatus: u.paymentStatus || u.payment_status || 'pending',
          kycPercent: typeof u.kycPercent === 'number' ? u.kycPercent : 25,
          balance: typeof u.walletBalance === 'number' ? u.walletBalance : (typeof u.balance === 'number' ? u.balance : 0),
          walletBalance: typeof u.walletBalance === 'number' ? u.walletBalance : (typeof u.balance === 'number' ? u.balance : 0),
          amountPaid: typeof u.amountPaid === 'number' ? u.amountPaid : (typeof u.totalLifetimePaid === 'number' ? u.totalLifetimePaid : 0),
          totalLifetimePaid: typeof u.totalLifetimePaid === 'number' ? u.totalLifetimePaid : (typeof u.amountPaid === 'number' ? u.amountPaid : 0),
        };
      }
    } catch (e) {}
    return { ...initialCustomer };
  });

  const [leads, setLeads] = useState(() => {
    try {
      const raw = localStorage.getItem('growthline_all_leads');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const cleaned = parsed
            .filter((item) => belongsToCustomer(item, customer))
            .map((item) => {
              const rawDigits = (item.phone || item.name || '').replace(/\D/g, '').slice(-10);
              return {
                ...item,
                phone: rawDigits || item.phone,
                name: rawDigits ? `+91 ${rawDigits}` : item.name,
                unmasked: true,
              };
            });
          return cleaned;
        }
      }
    } catch (e) {}
    return [];
  });
  const [followUps, setFollowUps] = useState([]);
  const [transactions, setTransactions] = useState(() => {
    try {
      const raw = localStorage.getItem('growthline_wallet_transactions');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.filter((tx) => belongsToCustomer(tx, customer));
        }
      }
    } catch (e) {}
    return [];
  });
  const [walletBalance, setWalletBalance] = useState(() => {
    try {
      const activeUser = localStorage.getItem('growthline_active_user');
      if (activeUser) {
        const u = JSON.parse(activeUser);
        if (typeof u.walletBalance === 'number') return u.walletBalance;
        if (typeof u.balance === 'number') return u.balance;
      }
    } catch (e) {}
    return customer.walletBalance || customer.balance || 0;
  });

  // Real-time synchronization with PostgreSQL Backend & Sales Desk (strictly filtered for active customer)
  useEffect(() => {
    const identifier = customer?.id || customer?.phone || customer?.username;
    if (identifier) {
      crmApi
        .getCustomerWorkspace(identifier)
        .then((res) => {
          if (res?.customer) {
            setCustomer((prev) => {
              const merged = { ...prev, ...res.customer };
              try {
                localStorage.setItem('growthline_active_user', JSON.stringify(merged));
              } catch (e) {}
              return merged;
            });
            setWalletBalance(Number(res.customer.walletBalance ?? res.customer.balance ?? 0));
          }
          if (Array.isArray(res?.leads)) {
            const activeCustObj = res.customer || customer;
            setLeads(res.leads.filter((item) => belongsToCustomer(item, activeCustObj)));
          }
          if (Array.isArray(res?.transactions)) {
            const activeCustObj = res.customer || customer;
            setTransactions(res.transactions.filter((tx) => belongsToCustomer(tx, activeCustObj)));
          }
          if (Array.isArray(res?.invoices)) {
            const activeCustObj = res.customer || customer;
            setInvoices(res.invoices.filter((inv) => belongsToCustomer(inv, activeCustObj)));
          }
        })
        .catch(() => {});
    }
  }, [customer?.id, customer?.phone]);

  // Real-time synchronization when returning to browser tab or regaining focus
  useEffect(() => {
    let lastSyncTime = 0;
    const handleSync = () => {
      const now = Date.now();
      // Throttle to avoid excessive requests (minimum 5s between re-syncs)
      if (now - lastSyncTime < 5000) return;
      lastSyncTime = now;
      if (document.visibilityState === 'visible' && (customer?.id || customer?.phone)) {
        crmApi.syncStateFromPostgres().catch(() => {});
      }
    };
    window.addEventListener('focus', handleSync);
    document.addEventListener('visibilitychange', handleSync);
    return () => {
      window.removeEventListener('focus', handleSync);
      document.removeEventListener('visibilitychange', handleSync);
    };
  }, [customer?.id, customer?.phone]);

  useEffect(() => {
    const syncCustomerLeads = (activeCust) => {
      try {
        const raw = localStorage.getItem('growthline_all_leads');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            setLeads(parsed.filter((item) => belongsToCustomer(item, activeCust)));
          }
        }
      } catch (err) {}
    };

    const handleLeadAdded = (e) => {
      const newLead = e?.detail;
      if (newLead && belongsToCustomer(newLead, customer)) {
        setLeads((prev) => [newLead, ...prev.filter((l) => l.id !== newLead.id)]);
      } else {
        syncCustomerLeads(customer);
      }
    };

    const handleActiveUserChange = (e) => {
      const u = e?.detail;
      if (u && (u.id === customer.id || u.phone === customer.phone || u.username === customer.username)) {
        setCustomer((prev) => ({
          ...prev,
          ...u,
          companyName: u.companyName || u.name || prev.companyName,
          name: u.companyName || u.name || prev.name,
          contactPerson: u.contactPerson || u.contact || prev.contactPerson,
          contact: u.contactPerson || u.contact || prev.contact,
          phone: u.phone || prev.phone,
          category: u.category || prev.category,
          industry: u.industry || prev.industry,
          website: u.website || u.domain || prev.website,
          domain: u.website || u.domain || prev.domain,
          city: u.city || prev.city,
          state: u.state || prev.state,
          country: u.country || prev.country,
          email: u.email || prev.email,
          personalEmail: u.personalEmail || prev.personalEmail,
          profile_status: u.profile_status || u.profileStatus || prev.profile_status,
          profileStatus: u.profile_status || u.profileStatus || prev.profileStatus,
        }));
      }
    };

    const handleStorage = (e) => {
      if (e.key === 'growthline_all_leads') {
        syncCustomerLeads(customer);
      }
    };

    window.addEventListener('growthline_lead_added', handleLeadAdded);
    window.addEventListener('growthline_active_user_changed', handleActiveUserChange);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('growthline_lead_added', handleLeadAdded);
      window.removeEventListener('growthline_active_user_changed', handleActiveUserChange);
      window.removeEventListener('storage', handleStorage);
    };
  }, [customer]);

  // Sync tab with hash changes
  useEffect(() => {
    const onHashChange = () => {
      const tab = getTabFromHash();
      setActiveTab(tab);
      setIsMobileDrawerOpen(false);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const handleSwitchTab = (newTab) => {
    setActiveTab(newTab);
    setIsMobileDrawerOpen(false);
    const slugMap = {
      dashboard: 'dashboard',
      leads: 'lead',
      followups: 'follow-ups',
      wallet: 'wallet',
      profile: 'profile',
    };
    const slug = slugMap[newTab] || 'dashboard';
    try {
      window.history.pushState({}, '', `/app/lead#app/${slug}`);
    } catch (e) {}
    window.location.hash = `#app/${slug}`;
  };

  // Modals & Popovers
  const [isAddLeadOpen, setIsAddLeadOpen] = useState(false);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [selectedLeadForFollowUp, setSelectedLeadForFollowUp] = useState(null);
  const [isAddFundsOpen, setIsAddFundsOpen] = useState(false);
  const [isLangOpen, setIsLangOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isSetDailyLimitOpen, setIsSetDailyLimitOpen] = useState(false);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [isRescheduleModalOpen, setIsRescheduleModalOpen] = useState(false);
  const [selectedFollowUpForReschedule, setSelectedFollowUpForReschedule] = useState(null);
  const [isConfigureDomainOpen, setIsConfigureDomainOpen] = useState(false);
  const [isCompleteRegistrationOpen, setIsCompleteRegistrationOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(() => {
    const isPaid = customer?.paymentStatus === 'paid' || customer?.payment_status === 'paid';
    return !isPaid;
  });
  const [isBusinessProfileModalOpen, setIsBusinessProfileModalOpen] = useState(false);
  // Invoices (isolated strictly to current customer)
  const [invoices, setInvoices] = useState(() => {
    try {
      const raw = localStorage.getItem('growthline_wallet_invoices');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.filter((inv) => belongsToCustomer(inv, customer));
        }
      }
    } catch (e) {}
    return [];
  });

  const t = translations[currentLang] || translations.en;

  // Actions
  const handleUpdateDailyLimit = (newLimit, customDays) => {
    const safeLimit = Math.max(300, Number(newLimit) || 300);
    const dayCodes = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const todayDayCode = dayCodes[new Date().getDay()];

    setCustomer((prev) => {
      const existingDays = Array.isArray(customDays) && customDays.length > 0
        ? customDays
        : (Array.isArray(prev?.activeDays) ? prev.activeDays : ['MON', 'TUE', 'WED', 'THU', 'FRI']);
      const finalDays = Array.from(new Set([...existingDays, todayDayCode]));
      const updated = {
        ...prev,
        dailyAdSpend: safeLimit,
        dailyPacing: safeLimit,
        adCampaignActive: true,
        activeDays: finalDays,
        isDeductedToday: true,
        lockedDays: Array.from(new Set([...(prev?.lockedDays || []), todayDayCode])),
      };
      try {
        localStorage.setItem('growthline_active_user', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    if (customer?.id || customer?.phone) {
      crmApi.patchCustomer(customer.id || customer.phone, {
        dailyAdSpend: safeLimit,
        ...(Array.isArray(customDays) ? { activeDays: customDays } : {}),
      }).catch(() => {});
    }
  };

  const handleSaveReschedule = (fupId, updates) => {
    setFollowUps((prev) =>
      prev.map((f) => (f.id === fupId ? { ...f, ...updates } : f))
    );
  };

  const handleViewInvoice = (inv) => {
    setSelectedInvoice(inv);
    setIsInvoiceModalOpen(true);
  };

  const handleUpdateLead = (leadId, updates) => {
    crmApi.updateLead(leadId, updates).catch(() => {});
    setLeads((prev) => {
      const updated = prev.map((item) => (item.id === leadId ? { ...item, ...updates } : item));
      try {
        const rawAll = localStorage.getItem('growthline_all_leads');
        const allList = rawAll ? JSON.parse(rawAll) : [];
        const syncedAll = allList.map((item) => (item.id === leadId ? { ...item, ...updates } : item));
        localStorage.setItem('growthline_all_leads', JSON.stringify(syncedAll));
      } catch (e) {}
      return updated;
    });
  };

  const handleAddLead = (newLead) => {
    const taggedLead = {
      ...newLead,
      customerId: customer?.id || '',
      customerPhone: customer?.phone || '',
      customerUsername: customer?.username || '',
      company: customer?.companyName || customer?.name || '',
    };
    crmApi.createLead(taggedLead).catch(() => {});
    setLeads((prev) => {
      const updated = [taggedLead, ...prev];
      try {
        const rawAll = localStorage.getItem('growthline_all_leads');
        const allList = rawAll ? JSON.parse(rawAll) : [];
        const syncedAll = [taggedLead, ...allList.filter((l) => l.id !== taggedLead.id)];
        localStorage.setItem('growthline_all_leads', JSON.stringify(syncedAll));
      } catch (e) {}
      return updated;
    });
  };

  const handleCompleteFollowUp = (fupId) => {
    setFollowUps((prev) =>
      prev.map((f) => (f.id === fupId ? { ...f, status: 'completed' } : f))
    );
  };

  const handleDismissFollowUp = (fupId) => {
    setFollowUps((prev) => prev.filter((f) => f.id !== fupId));
  };

  const handleScheduleFollowUp = (newFup) => {
    setFollowUps((prev) => [newFup, ...prev]);
  };

  const handleTopUpWallet = (amount, utr, sourceInfo = {}) => {
    const payNum = Number(amount) || 0;
    const currentBal = Number(walletBalance) || 0;
    const newBal = currentBal + payNum;
    setWalletBalance(newBal);

    const refCode = utr || `rzp_${Date.now().toString().slice(-8)}`;
    const nowTimeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + ', Today';
    const runtimeDays = Math.max(1, Math.floor(payNum / (customer?.dailyAdSpend || 300)));

    crmApi
      .topUpWallet({
        customerId: customer?.id,
        phone: customer?.phone,
        username: customer?.username,
        amount: payNum,
        referenceUtr: refCode,
        paymentMethod: sourceInfo.method || 'Razorpay Secure (UPI/Card)',
        description: sourceInfo.desc || `Marketing & Growth Budget Credit (₹${payNum.toLocaleString('en-IN')})`,
      })
      .then(() => crmApi.syncStateFromPostgres())
      .catch(() => {});

    const newTx = {
      id: `tx_${Date.now()}`,
      customerId: customer?.id || '',
      customerPhone: customer?.phone || '',
      customerUsername: customer?.username || '',
      company: customer?.companyName || customer?.name || '',
      date: 'Today, Just now',
      ref: refCode,
      desc: sourceInfo.desc || `Marketing & Growth Budget Credit (₹${payNum.toLocaleString('en-IN')})`,
      type: 'Credit',
      amount: payNum,
      balance: newBal,
      method: sourceInfo.method || 'Razorpay Secure (UPI/Card)',
      status: 'Verified ✓',
    };

    setTransactions((prev) => {
      const updated = [newTx, ...prev];
      try {
        const rawAll = localStorage.getItem('growthline_wallet_transactions');
        const allList = rawAll ? JSON.parse(rawAll) : [];
        localStorage.setItem('growthline_wallet_transactions', JSON.stringify([newTx, ...allList]));
      } catch (e) {}
      return updated;
    });

    // Also create official GST invoice isolated to this customer
    const baseAmt = Math.round((payNum / 1.18) * 100) / 100;
    const gstHalf = Math.round(((payNum - baseAmt) / 2) * 100) / 100;
    const newInv = {
      customerId: customer?.id || '',
      customerPhone: customer?.phone || '',
      customerUsername: customer?.username || '',
      company: customer?.companyName || customer?.name || '',
      invoiceNo: `INV-2026-${String(invoices.length + 1).padStart(3, '0')}`,
      date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      particulars: `Meta Ads Campaign Ad Spend Budget Credit`,
      sacCode: '998311',
      baseAmount: baseAmt,
      cgst: gstHalf,
      sgst: gstHalf,
      totalAmount: payNum,
      status: 'Paid',
      paymentMode: `Razorpay Secure (Ref: ${refCode})`,
    };

    setInvoices((prev) => {
      const updated = [newInv, ...prev];
      try {
        const rawAll = localStorage.getItem('growthline_wallet_invoices');
        const allList = rawAll ? JSON.parse(rawAll) : [];
        localStorage.setItem('growthline_wallet_invoices', JSON.stringify([newInv, ...allList]));
      } catch (e) {}
      return updated;
    });

    // Update customer in state and in localStorage
    setCustomer((prev) => {
      const updated = {
        ...prev,
        balance: newBal,
        walletBalance: newBal,
        amountPaid: (prev.amountPaid || prev.totalLifetimePaid || 0) + payNum,
        totalLifetimePaid: (prev.totalLifetimePaid || prev.amountPaid || 0) + payNum,
        paymentStatus: 'paid',
        payment_status: 'paid',
        adCampaignActive: true,
      };

      try {
        localStorage.setItem('growthline_active_user', JSON.stringify(updated));

        // 1. Sync with Desk 1 (Customer Registrations)
        const rawCusts = localStorage.getItem('growthline_registered_customers');
        if (rawCusts) {
          const parsed = JSON.parse(rawCusts);
          const synced = parsed.map((c) => {
            if (c.phone === updated.phone || c.username === updated.username || c.id === updated.id) {
              return {
                ...c,
                balance: newBal,
                walletBalance: newBal,
                amountPaid: (c.amountPaid || 0) + payNum,
                runwayDays: Math.floor(newBal / (c.dailyPacing || 300)),
                paymentStatus: 'paid',
                payment_status: 'paid',
                status: 'active',
              };
            }
            return c;
          });
          localStorage.setItem('growthline_registered_customers', JSON.stringify(synced));
        }

        // 2. Sync with Desk 2 (Pending Verification)
        const rawPV = localStorage.getItem('growthline_pending_verifications');
        if (rawPV) {
          const parsedPV = JSON.parse(rawPV);
          const syncedPV = parsedPV.map((pv) => {
            if (pv.phone === updated.phone || pv.customerId === updated.id) {
              return {
                ...pv,
                amount: (pv.amount || 0) + payNum,
                paymentStatus: 'verified',
                queueType: pv.profileStatus === 'complete' ? 'Completed' : 'Profile Only Incomplete',
              };
            }
            return pv;
          });
          localStorage.setItem('growthline_pending_verifications', JSON.stringify(syncedPV));
        }

        // 3. Record in Desk 05: Payment Collection & Top-Up Ledger (http://localhost:5173/sales#payments)
        const paymentRecord = {
          id: `pay_top_${Date.now()}`,
          customerId: updated.id || '',
          receiptNumber: `REC-2026-${Math.floor(1000 + Math.random() * 9000)}`,
          company: updated.companyName || updated.name || updated.username || 'Customer Account',
          contact: updated.contactPerson || updated.contact || updated.username || '',
          phone: updated.phone || '',
          city: updated.city || 'India',
          type: 'topup',
          typeLabel: 'Ad Spend Budget Top-Up',
          amount: payNum,
          gstAmount: Math.round(payNum * 0.18),
          total: payNum,
          paymentMode: sourceInfo.method || 'Razorpay UPI / Online',
          utr: refCode,
          date: nowTimeStr,
          status: 'paid',
          runwayAdded: runtimeDays,
          notes: `Wallet Credit: ₹${payNum.toLocaleString('en-IN')}`,
        };

        const rawPayments = localStorage.getItem('growthline_payment_records');
        const paymentsList = rawPayments ? JSON.parse(rawPayments) : [];
        const updatedPayments = [paymentRecord, ...paymentsList.filter((p) => p.id !== paymentRecord.id)];
        localStorage.setItem('growthline_payment_records', JSON.stringify(updatedPayments));

        window.dispatchEvent(new CustomEvent('growthline_payment_recorded', { detail: paymentRecord }));
        window.dispatchEvent(new CustomEvent('growthline_customer_registered', { detail: updated }));
        window.dispatchEvent(new CustomEvent('growthline_active_user_changed', { detail: updated }));
      } catch (err) {
        console.error('Failed to sync customer state and payment records', err);
      }

      return updated;
    });
  };

  const handleDeductDailyAdSpend = (overrideSpend) => {
    const spend = overrideSpend ? Number(overrideSpend) : (customer.dailyAdSpend || 300);
    if (walletBalance >= spend) {
      // Current day code in India / local time
      const dayCodes = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
      const todayDayCode = dayCodes[new Date().getDay()];

      const currentDays = Array.isArray(customer.activeDays) && customer.activeDays.length > 0
        ? customer.activeDays
        : ['MON', 'TUE', 'WED', 'THU', 'FRI'];
      const nextActiveDays = currentDays.includes(todayDayCode)
        ? currentDays
        : [...currentDays, todayDayCode];

      crmApi
        .deductDailyAdSpend({
          customerId: customer?.id,
          phone: customer?.phone,
          username: customer?.username,
          amount: spend,
          activeDays: nextActiveDays,
        })
        .then(() => crmApi.syncStateFromPostgres())
        .catch(() => {});
      const newBal = walletBalance - spend;
      setWalletBalance(newBal);
      const newTx = {
        id: `tx_${Date.now()}`,
        customerId: customer?.id || '',
        customerPhone: customer?.phone || '',
        customerUsername: customer?.username || '',
        company: customer?.companyName || customer?.name || '',
        date: 'Today, 12:00 AM',
        ref: `SYS-DAILY-ADSPEND-${Date.now().toString().slice(-4)}`,
        desc: `Daily Meta Ad Spend Campaign Deduction (₹${spend}/day)`,
        type: 'Debit',
        amount: spend,
        balance: newBal,
        method: 'Auto-Debit',
        status: 'Settled ✓',
      };
      setTransactions((prev) => {
        const updated = [newTx, ...prev];
        try {
          const rawAll = localStorage.getItem('growthline_wallet_transactions');
          const allList = rawAll ? JSON.parse(rawAll) : [];
          localStorage.setItem('growthline_wallet_transactions', JSON.stringify([newTx, ...allList]));
        } catch (e) {}
        return updated;
      });
      setCustomer((prev) => {
        const updated = {
          ...prev,
          balance: newBal,
          walletBalance: newBal,
          dailyAdSpend: spend,
          dailyPacing: spend,
          adCampaignActive: true,
          activeDays: nextActiveDays,
          lastDeductedAt: new Date().toISOString(),
          isDeductedToday: true,
          lockedDays: Array.from(new Set([...(prev?.lockedDays || []), todayDayCode])),
        };
        try {
          localStorage.setItem('growthline_active_user', JSON.stringify(updated));
        } catch (e) {}
        return updated;
      });
      return { success: true, message: `Successfully deducted ₹${spend} ad spend for today!` };
    }
    return { success: false, message: `Insufficient balance! Wallet has ₹${walletBalance.toFixed(0)}, needs ₹${spend}.` };
  };

  const handleUpdateCustomer = (updates) => {
    const targetId = customer?.id || customer?.phone || updates.id || updates.phone;
    if (targetId) {
      crmApi
        .updateCustomerProfile(targetId, updates)
        .then(() => crmApi.syncStateFromPostgres().catch(() => {}))
        .catch((err) => console.warn('Backend customer update note:', err.message));
    }

    setCustomer((prev) => {
      const updated = { ...prev, ...updates };
      try {
        localStorage.setItem('growthline_active_user', JSON.stringify(updated));
        const rawCusts = localStorage.getItem('growthline_registered_customers');
        if (rawCusts) {
          const parsed = JSON.parse(rawCusts);
          if (Array.isArray(parsed)) {
            const synced = parsed.map((c) => {
              if (c.id === updated.id || c.phone === updated.phone || c.phone === prev.phone || c.username === updated.username) {
                return {
                  ...c,
                  ...updates,
                  name: updated.companyName || updated.name || c.name,
                  companyName: updated.companyName || updated.name || c.companyName,
                  contact: updated.contactPerson || updated.contact || c.contact,
                  contactPerson: updated.contactPerson || updated.contact || c.contactPerson,
                  profileStatus: 'complete',
                  profile_status: 'complete',
                  kycPercent: 100,
                  verified: true,
                };
              }
              return c;
            });
            localStorage.setItem('growthline_registered_customers', JSON.stringify(synced));
          }
        }

        // Sync Desk 02 (Pending Verification)
        const rawPV = localStorage.getItem('growthline_pending_verifications');
        if (rawPV) {
          const parsedPV = JSON.parse(rawPV);
          if (Array.isArray(parsedPV)) {
            const syncedPV = parsedPV.map((pv) => {
              if (pv.customerId === updated.id || pv.phone === updated.phone || pv.phone === prev.phone) {
                return {
                  ...pv,
                  company: updated.companyName || pv.company,
                  contact: updated.contactPerson || pv.contact,
                  phone: updated.phone || pv.phone,
                  profileStatus: 'complete',
                  queueType: pv.paymentStatus === 'verified' || pv.paymentStatus === 'paid' ? 'Completed' : 'Payment Pending',
                };
              }
              return pv;
            });
            localStorage.setItem('growthline_pending_verifications', JSON.stringify(syncedPV));
          }
        }

        // Sync Desk 05 (Payment Records)
        const rawPay = localStorage.getItem('growthline_payment_records');
        if (rawPay) {
          const parsedPay = JSON.parse(rawPay);
          if (Array.isArray(parsedPay)) {
            const syncedPay = parsedPay.map((pr) => {
              if (pr.customerId === updated.id || pr.phone === updated.phone || pr.phone === prev.phone) {
                return {
                  ...pr,
                  company: updated.companyName || pr.company,
                  contact: updated.contactPerson || pr.contact,
                  phone: updated.phone || pr.phone,
                  city: updated.city || pr.city,
                };
              }
              return pr;
            });
            localStorage.setItem('growthline_payment_records', JSON.stringify(syncedPay));
          }
        }

        window.dispatchEvent(new CustomEvent('growthline_customer_registered', { detail: updated }));
        window.dispatchEvent(new CustomEvent('growthline_active_user_changed', { detail: updated }));
      } catch (e) {}
      return updated;
    });
  };

  const pendingFollowupsCount = leads.filter((l) => (l.status === 'In Follow-up' || l.status === 'Callback') && l.status !== 'Dropped').length;

  
  const handlePaymentModalPay = (amount, paymentId) => {
    const payAmount = Number(amount) || 600;
    const refCode = paymentId || `rzp_pay_${Date.now().toString().slice(-8)}`;
    
    // Top up wallet, update AD WALLET balance, add wallet transaction, create invoice, and record in Desk 05
    handleTopUpWallet(payAmount, refCode, {
      desc: `Marketing & Growth Budget Credit (₹${payAmount.toLocaleString('en-IN')})`,
      method: 'Razorpay Secure (UPI/Card)',
    });

    setIsPaymentModalOpen(false);

    // Per User Request: "when payment complete thann open information all submit page and than submit"
    // Open the complete business information submission page/modal
    setIsBusinessProfileModalOpen(true);
  };

  
  const handleSaveBusinessProfile = (profileData) => {
    const idOrPhone = customer?.id || customer?.phone || profileData.phone;
    if (idOrPhone) {
      crmApi
        .updateCustomerProfile(idOrPhone, profileData)
        .then(() => crmApi.syncStateFromPostgres())
        .catch(() => {});
    }
    setCustomer((prev) => {
      const nowStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + ', Today';
      const updated = {
        ...prev,
        companyName: profileData.companyName || prev.companyName || '',
        name: profileData.companyName || prev.name || '',
        category: profileData.category || prev.category || 'Other',
        industry: profileData.industry || profileData.category || 'Other',
        domain: profileData.website || prev.domain || '',
        website: profileData.website || prev.website || '',
        contactPerson: profileData.contactPerson || prev.contactPerson || '',
        contact: profileData.contactPerson || prev.contact || '',
        email: profileData.email || prev.email || '',
        phone: profileData.phone || prev.phone || '',
        personalEmail: profileData.personalEmail || prev.personalEmail || '',
        city: profileData.city || prev.city || '',
        state: profileData.state || prev.state || 'Maharashtra',
        country: profileData.country || prev.country || 'India',
        profile_status: 'complete',
        profileStatus: 'complete',
        kycPercent: 100,
        verified: true,
        completedAt: nowStr,
      };

      try {
        localStorage.setItem('growthline_active_user', JSON.stringify(updated));

        // Sync with Desk 1 (Customer Registrations) and Desk 4 (Profile Completion)
        const rawCusts = localStorage.getItem('growthline_registered_customers');
        let parsed = rawCusts ? JSON.parse(rawCusts) : [];
        let matched = false;

        const synced = parsed.map((c) => {
          if (c.phone === updated.phone || c.phone === prev.phone || c.username === updated.username || c.id === updated.id) {
            matched = true;
            return {
              ...c,
              name: updated.companyName,
              companyName: updated.companyName,
              contact: updated.contactPerson,
              contactPerson: updated.contactPerson,
              phone: updated.phone,
              email: updated.email,
              personalEmail: updated.personalEmail,
              category: updated.category,
              industry: updated.industry,
              website: updated.website,
              city: updated.city,
              state: updated.state,
              country: updated.country,
              profileStatus: 'complete',
              profile_status: 'complete',
              paymentStatus: updated.paymentStatus || 'paid',
              payment_status: updated.paymentStatus || 'paid',
              balance: updated.walletBalance || 0,
              kycPercent: 100,
              verified: true,
              isSelfRegistered: true,
              completedAt: nowStr,
            };
          }
          return c;
        });

        if (!matched) {
          synced.unshift({
            id: updated.id || 'cust_reg_' + Date.now(),
            username: updated.username || '',
            name: updated.companyName,
            companyName: updated.companyName,
            contact: updated.contactPerson,
            contactPerson: updated.contactPerson,
            phone: updated.phone,
            email: updated.email,
            personalEmail: updated.personalEmail,
            category: updated.category,
            industry: updated.industry,
            website: updated.website,
            city: updated.city,
            state: updated.state,
            country: updated.country,
            profileStatus: 'complete',
            profile_status: 'complete',
            paymentStatus: updated.paymentStatus || 'paid',
            payment_status: updated.paymentStatus || 'paid',
            amountPaid: updated.totalLifetimePaid || 0,
            balance: updated.walletBalance || 0,
            runwayDays: Math.floor((updated.walletBalance || 0) / 300),
            status: 'active',
            kycPercent: 100,
            verified: true,
            isSelfRegistered: true,
            registeredAt: 'Today',
            completedAt: nowStr,
            registeredFrom: 'http://localhost:5173/#register',
          });
        }

        localStorage.setItem('growthline_registered_customers', JSON.stringify(synced));

        // Also sync Desk 02 (Pending Verification) with updated company name & profile completion
        const rawPV = localStorage.getItem('growthline_pending_verifications');
        if (rawPV) {
          const parsedPV = JSON.parse(rawPV);
          if (Array.isArray(parsedPV)) {
            const syncedPV = parsedPV.map((pv) => {
              if (pv.customerId === updated.id || pv.phone === updated.phone || pv.phone === prev.phone) {
                return {
                  ...pv,
                  company: updated.companyName || pv.company,
                  contact: updated.contactPerson || pv.contact,
                  phone: updated.phone || pv.phone,
                  profileStatus: 'complete',
                  queueType: pv.paymentStatus === 'verified' || pv.paymentStatus === 'paid' ? 'Completed' : 'Payment Pending',
                };
              }
              return pv;
            });
            localStorage.setItem('growthline_pending_verifications', JSON.stringify(syncedPV));
          }
        }

        // Also sync Desk 05 (Payment Collection Ledger) so existing payment rows show the newly configured company name
        const rawPay = localStorage.getItem('growthline_payment_records');
        if (rawPay) {
          const parsedPay = JSON.parse(rawPay);
          if (Array.isArray(parsedPay)) {
            const syncedPay = parsedPay.map((pr) => {
              if (pr.customerId === updated.id || pr.phone === updated.phone || pr.phone === prev.phone) {
                return {
                  ...pr,
                  company: updated.companyName || pr.company,
                  contact: updated.contactPerson || pr.contact,
                  phone: updated.phone || pr.phone,
                  city: updated.city || pr.city,
                };
              }
              return pr;
            });
            localStorage.setItem('growthline_payment_records', JSON.stringify(syncedPay));
          }
        }

        window.dispatchEvent(new CustomEvent('growthline_customer_registered', { detail: updated }));
        window.dispatchEvent(new CustomEvent('growthline_active_user_changed', { detail: updated }));
      } catch (err) {
        console.error('Failed to sync profile completion details', err);
      }

      return updated;
    });

    setIsBusinessProfileModalOpen(false);
    // Once payment and profile registration are done, land directly on http://localhost:5173/app/lead#app/dashboard
    handleSwitchTab('dashboard');
  };

  const handleOpenRegistrationFlow = () => {
    if (customer.paymentStatus !== 'paid' && customer.payment_status !== 'paid') {
      setIsPaymentModalOpen(true);
    } else {
      setIsBusinessProfileModalOpen(true);
    }
  };

  const handleToggleCampaign = async (forceState) => {
    const dailyLimit = Number(customer.dailyAdSpend || 300);
    const nextActive = typeof forceState === 'boolean' ? forceState : !customer.adCampaignActive;

    // 1. Low Balance Check with SweetAlert2
    if (nextActive && walletBalance < dailyLimit) {
      Swal.fire({
        icon: 'warning',
        title: 'Ad Wallet Balance is Low',
        html: `Your available Ad Wallet balance is <strong>₹${walletBalance.toLocaleString('en-IN')}</strong>, which is below your daily spend pacing of <strong>₹${dailyLimit.toLocaleString('en-IN')}</strong>.<br/><br/>Please top up your wallet to start marketing campaigns.`,
        showCancelButton: true,
        confirmButtonText: 'Top Up Wallet Now',
        confirmButtonColor: '#059669',
        cancelButtonText: 'Cancel',
      }).then((res) => {
        if (res.isConfirmed) setIsPaymentModalOpen(true);
      });
      return;
    }

    // 2. SweetAlert2 Confirmation Dialog before Start or Stop
    if (nextActive) {
      const confirmStart = await Swal.fire({
        icon: 'question',
        title: 'Start Marketing Campaign?',
        html: `Daily spend of <strong>₹${dailyLimit.toLocaleString('en-IN')}/day</strong> will be scheduled.<br/>Meta &amp; local buyer lead capture will become active on scheduled days.<br/><br/>Current Wallet Balance: <strong style="color:#059669;">₹${walletBalance.toLocaleString('en-IN')}</strong>`,
        showCancelButton: true,
        confirmButtonText: '▶ Yes, Start Marketing',
        confirmButtonColor: '#059669',
        cancelButtonText: 'Cancel',
      });
      if (!confirmStart.isConfirmed) return;
    } else {
      const confirmStop = await Swal.fire({
        icon: 'warning',
        title: 'Stop Marketing Campaign?',
        html: `Are you sure you want to stop/pause your marketing campaigns?<br/><br/>Daily ad deductions and active Meta buyer lead capture will be <strong>paused</strong>.`,
        showCancelButton: true,
        confirmButtonText: '⏹ Yes, Stop Marketing',
        confirmButtonColor: '#e11d48',
        cancelButtonText: 'Keep Running',
      });
      if (!confirmStop.isConfirmed) return;
    }

    const dayCodes = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const todayDayCode = dayCodes[new Date().getDay()];
    const currentDays = Array.isArray(customer.activeDays) && customer.activeDays.length > 0
      ? customer.activeDays
      : ['MON', 'TUE', 'WED', 'THU', 'FRI'];

    const nextActiveDays = nextActive && !currentDays.includes(todayDayCode)
      ? [...currentDays, todayDayCode]
      : currentDays;

    setCustomer((prev) => {
      const updated = {
        ...prev,
        adCampaignActive: nextActive,
        activeDays: nextActiveDays,
      };
      try {
        localStorage.setItem('growthline_active_user', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    try {
      await crmApi.patchCustomer(customer.id, {
        adCampaignActive: nextActive,
        activeDays: nextActiveDays,
      });
    } catch (e) {
      console.warn('Sync campaign state note:', e.message);
    }

    // 3. SweetAlert2 Success Notice
    if (nextActive) {
      Swal.fire({
        icon: 'success',
        title: 'Marketing is LIVE!',
        html: `Your marketing campaign is now active and pacing at <strong>₹${dailyLimit.toLocaleString('en-IN')}/day</strong>.`,
        timer: 2000,
        showConfirmButton: false,
      });
    } else {
      Swal.fire({
        icon: 'info',
        title: 'Marketing Paused (Off)',
        html: `Your campaign has been paused. Daily ad spend will not be deducted until you start it again.`,
        timer: 2000,
        showConfirmButton: false,
      });
    }
  };

  return (
    <div className={`portal-app-root ${isSidebarCollapsed ? 'collapsed' : ''} ${isMobileDrawerOpen ? 'mobile-drawer-active' : ''}`}>
      {/* Mobile Top Bar (visible on screens <= 860px) */}
      <header className="portal-mobile-top-bar">
        <button
          type="button"
          className="btn-mobile-hamburger"
          onClick={() => setIsMobileDrawerOpen(true)}
          title="Open Navigation Menu"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        <div className="mobile-brand-title" onClick={() => handleSwitchTab('dashboard')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <img
            src="/AdMafia-Logo.png"
            alt="AdMafia Marketing"
            style={{ height: '34px', width: 'auto', objectFit: 'contain', background: '#ffffff', padding: '3px 6px', borderRadius: '6px' }}
          />
          <span className="portal-logo-text" style={{ fontSize: '1.04rem' }}>
            Ad<b>Mafia</b>
          </span>
        </div>

        <button
          type="button"
          className="mobile-wallet-pill"
          onClick={() => handleSwitchTab('wallet')}
          title="View Wallet Balance"
        >
          <span className="dot-green"></span>
          <span>₹{walletBalance.toFixed(0)}</span>
        </button>
      </header>

      {/* Backdrop for mobile drawer */}
      {isMobileDrawerOpen && (
        <div
          className="portal-mobile-backdrop"
          onClick={() => setIsMobileDrawerOpen(false)}
        />
      )}

      {/* SIDEBAR NAVIGATION */}
      <aside className={`portal-sidebar ${isMobileDrawerOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-top">
          <div className="portal-logo-wrap" onClick={() => handleSwitchTab('dashboard')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <img
              src="/AdMafia-Logo.png"
              alt="AdMafia Marketing"
              style={{
                height: isSidebarCollapsed ? '34px' : '40px',
                width: 'auto',
                objectFit: 'contain',
                background: '#ffffff',
                padding: '4px 7px',
                borderRadius: '8px',
              }}
            />
            {!isSidebarCollapsed && (
              <span className="portal-logo-text">
                Ad<b>Mafia</b> <span>CRM</span>
              </span>
            )}
          </div>

          <button
            type="button"
            className="btn-sidebar-collapse"
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            title="Toggle Sidebar Rail"
          >
            {isSidebarCollapsed ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            )}
          </button>

          <button
            type="button"
            className="btn-mobile-sidebar-close"
            onClick={() => setIsMobileDrawerOpen(false)}
            title="Close Menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="portal-nav-menu">
          <div className="nav-group-label">{!isSidebarCollapsed && 'LEAD HUB OVERVIEW'}</div>

          {/* 1. Lead Hub Overview */}
          <button
            type="button"
            className={`nav-item-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => handleSwitchTab('dashboard')}
            title="Lead Hub Overview (/app/dashboard)"
          >
            <span className="nav-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="9" rx="1.5" />
                <rect x="14" y="3" width="7" height="5" rx="1.5" />
                <rect x="14" y="12" width="7" height="9" rx="1.5" />
                <rect x="3" y="16" width="7" height="5" rx="1.5" />
              </svg>
            </span>
            {!isSidebarCollapsed && <span className="nav-title">Dashboard</span>}
          </button>

          {/* 2. Lead Pipeline (33) */}
          <button
            type="button"
            className={`nav-item-btn ${activeTab === 'leads' ? 'active' : ''}`}
            onClick={() => handleSwitchTab('leads')}
            title="Lead Pipeline (/app/lead)"
          >
            <span className="nav-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 12h-6l-2 3h-4l-2-3H2" />
                <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
              </svg>
            </span>
            {!isSidebarCollapsed && (
              <>
                <span className="nav-title">Lead Pipeline</span>
                <span className="nav-badge-count">{leads.filter((l) => l.status !== 'In Follow-up' && l.status !== 'Callback' && l.status !== 'Dropped').length}</span>
              </>
            )}
          </button>

          {/* 3. Follow-ups (5) */}
          <button
            type="button"
            className={`nav-item-btn ${activeTab === 'followups' ? 'active' : ''}`}
            onClick={() => handleSwitchTab('followups')}
            title="Follow-ups Queue (/app/follow-ups)"
          >
            <span className="nav-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            </span>
            {!isSidebarCollapsed && (
              <>
                <span className="nav-title">Follow-ups</span>
                <span className="nav-badge-count coral">{pendingFollowupsCount}</span>
              </>
            )}
          </button>

          {/* 4. Marketing Wallet */}
          <button
            type="button"
            className={`nav-item-btn ${activeTab === 'wallet' ? 'active' : ''}`}
            onClick={() => handleSwitchTab('wallet')}
            title="Marketing Wallet (/app/wallet)"
          >
            <span className="nav-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <line x1="2" y1="10" x2="22" y2="10" />
              </svg>
            </span>
            {!isSidebarCollapsed && (
              <>
                <span className="nav-title">Wallet</span>
                <span className={`nav-badge-wallet ${walletBalance <= 0 ? 'zero' : ''}`}>
                  ₹{walletBalance.toFixed(0)}
                </span>
              </>
            )}
          </button>
          <div className="nav-group-label" style={{ marginTop: '16px' }}>
            {!isSidebarCollapsed && 'ACCOUNT MANAGEMENT'}
          </div>

          {/* 5. Account / My Profile */}
          <button
            type="button"
            className={`nav-item-btn ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => handleSwitchTab('profile')}
            title="My Profile (/app/profile)"
          >
            <span className="nav-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </span>
            {!isSidebarCollapsed && <span className="nav-title">My Profile</span>}
          </button>

          {/* 6. Language Selector Modal */}
          <button
            type="button"
            className="nav-item-btn"
            onClick={() => setIsLangOpen(true)}
            title="Language: English (EN / HI / GU / MR / TA / TE / KN / BN)"
          >
            <span className="nav-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
            </span>
            {!isSidebarCollapsed && (
              <span className="nav-title">Language ({currentLang.toUpperCase()})</span>
            )}
          </button>

          {/* 7. Help & Support */}
          <button
            type="button"
            className="nav-item-btn"
            onClick={() => setIsHelpOpen(true)}
            title="Help & Support Desk"
          >
            <span className="nav-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
                <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
              </svg>
            </span>
            {!isSidebarCollapsed && <span className="nav-title">Help &amp; Support</span>}
          </button>
        </nav>

        {/* Sidebar Footer Actions */}
        <div className="sidebar-footer-actions">
          {onBackToWebsite && (
            <button
              type="button"
              onClick={onBackToWebsite}
              className="sidebar-bottom-btn"
              title="Return to Public Website (/website)"
            >
              <span className="nav-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12" />
                  <polyline points="12 19 5 12 12 5" />
                </svg>
              </span>
              {!isSidebarCollapsed && <span>Back to Website</span>}
            </button>
          )}

          <button
            type="button"
            onClick={onSignOut}
            className="sidebar-bottom-btn logout"
            title="Sign Out"
          >
            <span className="nav-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </span>
            {!isSidebarCollapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="portal-main-area">
        <div className="portal-content-body">
          {activeTab === 'dashboard' && (
            <LeadHubOverview
              customer={customer}
              leads={leads}
              followUps={followUps}
              walletBalance={walletBalance}
              onNavigate={(tab) => handleSwitchTab(tab)}
              onOpenAddLead={() => setIsAddLeadOpen(true)}
              onOpenScheduleFollowUp={(lead) => {
                setSelectedLeadForFollowUp(lead || null);
                setIsScheduleOpen(true);
              }}
              onOpenAddFunds={() => setIsPaymentModalOpen(true)}
              onOpenCompleteRegistration={handleOpenRegistrationFlow}
              onOpenSetDailyLimit={() => setIsSetDailyLimitOpen(true)}
              onOpenLanguageModal={() => setIsLangOpen(true)}
              onOpenConfigureDomain={() => setIsConfigureDomainOpen(true)}
                            onToggleCampaign={handleToggleCampaign}
              onUpdateCustomer={handleUpdateCustomer}
              onUpdateLead={handleUpdateLead}
              t={t}
            />
          )}

          {activeTab === 'leads' && (
            <LeadPipelineInbox
              leads={leads}
              customer={customer}
              walletBalance={walletBalance}
              dailyAdSpend={customer.dailyAdSpend}
              onUpdateLead={handleUpdateLead}
              onOpenAddLead={() => setIsAddLeadOpen(true)}
              onOpenScheduleFollowUp={(lead) => {
                setSelectedLeadForFollowUp(lead || null);
                setIsScheduleOpen(true);
              }}
              onOpenAddFunds={() => setIsAddFundsOpen(true)}
              onOpenCompleteRegistration={handleOpenRegistrationFlow}
            />
          )}

          {activeTab === 'followups' && (
            <FollowUpsQueue
              leads={leads}
              customer={customer}
              walletBalance={walletBalance}
              onUpdateLead={handleUpdateLead}
              onOpenAddFunds={() => setIsAddFundsOpen(true)}
              onOpenCompleteRegistration={handleOpenRegistrationFlow}
            />
          )}

          {activeTab === 'wallet' && (
            <MarketingWallet
              walletBalance={walletBalance}
              transactions={transactions}
              dailyAdSpend={customer.dailyAdSpend || 300}
              customer={customer}
              leadsCount={leads.length}
              onTopUpWallet={handleTopUpWallet}
              onDeductDailyAdSpend={handleDeductDailyAdSpend}
              onToggleCampaign={handleToggleCampaign}
              onOpenSetDailyLimit={() => setIsSetDailyLimitOpen(true)}
              onViewInvoice={handleViewInvoice}
              invoices={invoices}
            />
          )}

          {activeTab === 'profile' && (
            <AccountProfileKYC
              customer={customer}
              onUpdateCustomer={handleUpdateCustomer}
              onOpenCompleteRegistration={handleOpenRegistrationFlow}
            />
          )}
        </div>
      </div>

      {/* Global Modals */}
      
      {/* Step 1 of 2: Marketing & Growth Budget Payment Completion Modal */}
      <MarketingGrowthPaymentModal
        isOpen={isPaymentModalOpen}
        customer={customer}
        onClose={() => setIsPaymentModalOpen(false)}
        onPay={handlePaymentModalPay}
        onGoToProfile={() => {
          setIsPaymentModalOpen(false);
          handleSwitchTab('profile');
        }}
        dailyAdSpend={customer.dailyAdSpend || 300}
      />

      
      {/* Step 2 of 2: Business Profile & Contact Details Modal */}
      <BusinessProfileModal
        isOpen={isBusinessProfileModalOpen}
        onClose={() => setIsBusinessProfileModalOpen(false)}
        onSave={handleSaveBusinessProfile}
        customer={customer}
      />

      <AddOfflineLeadModal
        isOpen={isAddLeadOpen}
        onClose={() => setIsAddLeadOpen(false)}
        onAddLead={handleAddLead}
      />

      <ScheduleFollowUpModal
        isOpen={isScheduleOpen}
        onClose={() => {
          setIsScheduleOpen(false);
          setSelectedLeadForFollowUp(null);
        }}
        onSchedule={handleScheduleFollowUp}
        leads={leads}
        defaultLead={selectedLeadForFollowUp}
      />

      <AddFundsModal
        isOpen={isAddFundsOpen}
        onClose={() => setIsAddFundsOpen(false)}
        onTopUp={handleTopUpWallet}
        transactions={transactions}
        dailyAdSpend={customer.dailyAdSpend || 300}
        walletBalance={walletBalance}
        customer={customer}
      />

      <SetDailyLimitModal
        isOpen={isSetDailyLimitOpen}
        onClose={() => setIsSetDailyLimitOpen(false)}
        currentLimit={customer.dailyAdSpend}
        onUpdateLimit={handleUpdateDailyLimit}
        walletBalance={walletBalance}
        customer={customer}
        onUpdateCustomer={handleUpdateCustomer}
        onOpenTopUp={() => {
          setIsSetDailyLimitOpen(false);
          setIsAddFundsOpen(true);
        }}
        onDeductDailyAdSpend={handleDeductDailyAdSpend}
      />

      <GstTaxInvoiceModal
        isOpen={isInvoiceModalOpen}
        onClose={() => {
          setIsInvoiceModalOpen(false);
          setSelectedInvoice(null);
        }}
        invoice={selectedInvoice}
        customer={customer}
      />

      <RescheduleCallbackModal
        isOpen={isRescheduleModalOpen}
        onClose={() => {
          setIsRescheduleModalOpen(false);
          setSelectedFollowUpForReschedule(null);
        }}
        followUp={selectedFollowUpForReschedule}
        onSaveReschedule={handleSaveReschedule}
      />

      <LanguageSelectorModal
        isOpen={isLangOpen}
        onClose={() => setIsLangOpen(false)}
        currentLang={currentLang}
        onChangeLang={(code) => setCurrentLang(code)}
      />

      <HelpSupportModal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
      />

      <ConfigureDomainModal
        isOpen={isConfigureDomainOpen}
        onClose={() => setIsConfigureDomainOpen(false)}
        customer={customer}
        onUpdateDomain={(domain) => setCustomer((prev) => ({ ...prev, domain }))}
      />

      <CompleteRegistrationModal
        isOpen={isCompleteRegistrationOpen}
        onClose={() => setIsCompleteRegistrationOpen(false)}
        customer={customer}
        onComplete={(data) => setCustomer((prev) => ({ ...prev, ...data }))}
      />
    </div>
  );
}
