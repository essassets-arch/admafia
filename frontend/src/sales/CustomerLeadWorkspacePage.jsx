import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Clock,
  ExternalLink,
  Layers,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  User,
  Wallet,
  AlertTriangle,
} from 'lucide-react';
import crmApi from '../services/crmApi';
import { SmartTable } from '../components/SmartTabulator';
import { formatIndianDateTime, getLiveNowFormatted } from './OperationalDesksViews';
import {
  extractCustomerKey,
  buildCustomerLeadHref,
  navigateToCustomerLeadPage,
} from './customerLeadNavigation';

export { extractCustomerKey, buildCustomerLeadHref, navigateToCustomerLeadPage };

function parseUrlState() {
  if (typeof window === 'undefined') {
    return { customerKey: '', mode: 'add', from: 'leads' };
  }
  const rawHash = window.location.hash || '';
  const qIdx = rawHash.indexOf('?');
  const hashSearch = qIdx >= 0 ? rawHash.slice(qIdx + 1) : '';
  const hp = new URLSearchParams(hashSearch);
  const sp = new URLSearchParams(window.location.search || '');

  const customerKey = (
    hp.get('customer') ||
    hp.get('customerId') ||
    sp.get('customer') ||
    sp.get('customerId') ||
    ''
  ).trim();
  const rawMode = (hp.get('mode') || sp.get('mode') || 'add').toLowerCase();
  const mode = rawMode === 'history' || rawMode === 'assigned' || rawMode === 'list' ? 'history' : 'add';
  const from = (hp.get('from') || sp.get('from') || 'leads').toLowerCase();

  return { customerKey, mode, from };
}

function matchCustomerByKey(cust, targetKey) {
  if (!cust || !targetKey) return false;
  const k = String(targetKey).trim().toLowerCase();
  const cleanDigits = k.replace(/\D/g, '').slice(-10);

  const cId = String(cust.id || cust.customerId || '').trim().toLowerCase();
  const cPhone = String(cust.phone || '').replace(/\D/g, '').slice(-10);
  const cUser = String(cust.username || '').toLowerCase().replace(/^@/, '').trim();
  const cComp = String(cust.companyName || cust.name || '').toLowerCase().trim();

  if (cId && cId === k) return true;
  if (cleanDigits.length === 10 && cPhone && cPhone === cleanDigits) return true;
  if (cUser && (cUser === k || `@${cUser}` === k)) return true;
  if (cComp && cComp === k) return true;
  return false;
}

function matchLeadToCust(lead, cust) {
  if (!lead || !cust) return false;
  const leadCustId = String(lead.customerId || lead.customer_id || '').trim();
  const custId = String(cust.id || '').trim();
  const custPhone = String(cust.phone || '').replace(/\D/g, '').slice(-10);
  const custUser = String(cust.username || '').toLowerCase().replace(/^@/, '').trim();
  const leadCustPhone = String(lead.customerPhone || lead.customer_phone || '').replace(/\D/g, '').slice(-10);
  const leadCustUser = String(lead.customerUsername || lead.customer_username || '').toLowerCase().replace(/^@/, '').trim();

  if (leadCustId && custId && leadCustId === custId) return true;
  if (custPhone && leadCustPhone && custPhone === leadCustPhone) return true;
  if (custUser && leadCustUser && custUser === leadCustUser) return true;

  const leadComp = String(lead.company || lead.assignedCompany || lead.customerCompanyName || '').toLowerCase().trim();
  const custComp = String(cust.companyName || cust.name || '').toLowerCase().trim();
  if (leadComp && custComp && leadComp === custComp) return true;
  return false;
}

const BUDGET_PRESETS = ['₹50K – ₹1.5L', '₹1.5L – ₹3.5L', '₹3.5L – ₹10L', '₹10L+'];

export default function CustomerLeadWorkspacePage({ customers: propsCustomers = [], navigateToDesk }) {
  const [urlState, setUrlState] = useState(parseUrlState);
  const [allCustomers, setAllCustomers] = useState(() => (Array.isArray(propsCustomers) ? propsCustomers : []));
  const [assignedLeads, setAssignedLeads] = useState([]);
  const [isLoadingLeads, setIsLoadingLeads] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [successBanner, setSuccessBanner] = useState(null);

  // Add Lead Form State (pre-bound to target user — zero customer dropdown hunting!)
  const [buyerPhone, setBuyerPhone] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [city, setCity] = useState('');
  const [category, setCategory] = useState('');
  const [budget, setBudget] = useState('₹1.5L – ₹3.5L');
  const [priority, setPriority] = useState('Urgent');
  const [requirement, setRequirement] = useState('');
  const [notes, setNotes] = useState('');

  // Assigned Leads History Filter State
  const [historyFilter, setHistoryFilter] = useState('all');
  const [historySearch, setHistorySearch] = useState('');

  const phoneInputRef = useRef(null);

  useEffect(() => {
    if (Array.isArray(propsCustomers) && propsCustomers.length > 0) {
      setAllCustomers(propsCustomers);
    }
  }, [propsCustomers]);

  useEffect(() => {
    const syncFromUrl = () => {
      setUrlState(parseUrlState());
      setSubmitError('');
    };
    window.addEventListener('hashchange', syncFromUrl);
    window.addEventListener('popstate', syncFromUrl);
    return () => {
      window.removeEventListener('hashchange', syncFromUrl);
      window.removeEventListener('popstate', syncFromUrl);
    };
  }, []);

  const targetCustomer = useMemo(() => {
    if (!urlState.customerKey) return allCustomers[0] || null;
    const found = allCustomers.find((c) => matchCustomerByKey(c, urlState.customerKey));
    if (found) return found;
    return null;
  }, [allCustomers, urlState.customerKey]);

  // Pre-fill city & category defaults whenever target customer resolves
  useEffect(() => {
    if (targetCustomer) {
      setCity(targetCustomer.city || '');
      setCategory(targetCustomer.category || '');
    }
  }, [targetCustomer?.id, targetCustomer?.phone]);

  // Auto-focus buyer phone input when opening in "add" mode
  useEffect(() => {
    if (urlState.mode === 'add') {
      const t = setTimeout(() => {
        if (phoneInputRef.current) phoneInputRef.current.focus();
      }, 80);
      return () => clearTimeout(t);
    }
  }, [urlState.mode, targetCustomer?.id]);

  const normalizeLeadItem = useCallback((item) => {
    const rawDigits = String(item.phone || item.name || '').replace(/\D/g, '').slice(-10);
    return {
      ...item,
      phone: rawDigits || item.phone || '',
      displayPhone: rawDigits ? `+91 ${rawDigits}` : item.displayPhone || item.phone || '',
      name: item.name && !/^\+?91?\s*\d{10}$/.test(String(item.name).trim()) ? item.name : (rawDigits ? `+91 ${rawDigits}` : item.name || '—'),
      buyerLabel:
        item.name && !/^\+?91?\s*\d{10}$/.test(String(item.name).trim())
          ? item.name
          : '',
      read: Boolean(item.read || item.is_read || item.status === 'read'),
      is_read: Boolean(item.read || item.is_read || item.status === 'read'),
    };
  }, []);

  const fetchCustomerLeads = useCallback(async (showSpinner = false) => {
    if (showSpinner) setIsLoadingLeads(true);
    try {
      // Ensure customers list is also fresh if direct page load
      if (allCustomers.length === 0 || (urlState.customerKey && !targetCustomer)) {
        const state = await crmApi.syncStateFromPostgres();
        if (Array.isArray(state?.customers) && state.customers.length > 0) {
          setAllCustomers(state.customers);
        }
      }

      const resolvedCust =
        targetCustomer ||
        (urlState.customerKey
          ? { id: urlState.customerKey, phone: urlState.customerKey.replace(/\D/g, '').slice(-10), username: urlState.customerKey }
          : null);

      if (!resolvedCust) {
        setAssignedLeads([]);
        return;
      }

      const cleanPhone = String(resolvedCust.phone || '').replace(/\D/g, '').slice(-10);
      const cleanUser = String(resolvedCust.username || '').replace(/^@/, '').trim();
      const apiLeads = await crmApi.getLeads({
        customerId: resolvedCust.id || '',
        phone: cleanPhone,
        username: cleanUser,
      });

      if (Array.isArray(apiLeads)) {
        setAssignedLeads(apiLeads.map(normalizeLeadItem));
      }
    } catch (_) {
      // Fallback to localStorage cache if network hiccup
      try {
        const raw = localStorage.getItem('growthline_all_leads');
        if (raw && targetCustomer) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            setAssignedLeads(parsed.filter((l) => matchLeadToCust(l, targetCustomer)).map(normalizeLeadItem));
          }
        }
      } catch (_) {}
    } finally {
      setIsLoadingLeads(false);
    }
  }, [allCustomers.length, normalizeLeadItem, targetCustomer, urlState.customerKey]);

  useEffect(() => {
    fetchCustomerLeads(true);
    const poll = setInterval(() => fetchCustomerLeads(false), 6000);
    return () => clearInterval(poll);
  }, [fetchCustomerLeads]);

  const switchMode = (nextMode) => {
    const key = extractCustomerKey(targetCustomer) || urlState.customerKey;
    navigateToCustomerLeadPage(key, nextMode, urlState.from);
  };

  const handleBack = () => {
    const fromDesk = urlState.from || 'leads';
    if (typeof navigateToDesk === 'function') {
      if (fromDesk === 'customers') return navigateToDesk('customers', '#customers');
      if (fromDesk === 'approved') return navigateToDesk('approved', '#approved');
      return navigateToDesk('leads', '#leads');
    }
    window.location.hash = '#leads';
  };

  const backLabel =
    urlState.from === 'customers'
      ? 'Back to Customer Registrations'
      : urlState.from === 'approved'
        ? 'Back to Approved Members'
        : 'Back to Lead Management';

  // Phone validation & duplicate check for this user
  const isPhoneValidStart = buyerPhone.length === 0 || ['6', '7', '8', '9'].includes(buyerPhone[0]);
  const isPhoneComplete = buyerPhone.length === 10 && isPhoneValidStart;
  const duplicateAssignedLead = useMemo(() => {
    if (buyerPhone.length !== 10) return null;
    return assignedLeads.find((l) => String(l.phone || '').replace(/\D/g, '').slice(-10) === buyerPhone) || null;
  }, [assignedLeads, buyerPhone]);

  const handleAssignLead = async (e) => {
    e.preventDefault();
    setSubmitError('');
    if (!targetCustomer) {
      setSubmitError('Target customer account could not be resolved.');
      return;
    }
    if (!isPhoneComplete) {
      setSubmitError('Enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.');
      return;
    }

    setIsSubmitting(true);
    const cleanDigits = buyerPhone.replace(/\D/g, '').slice(-10);
    const formattedPhone = `+91 ${cleanDigits}`;
    const companyDisplay =
      targetCustomer.companyName || targetCustomer.name || `@${targetCustomer.username || 'client'}`;
    const resolvedBuyerName = buyerName.trim() || formattedPhone;
    const resolvedReq = requirement.trim() || `Verified Business Enquiry for ${companyDisplay}`;
    const resolvedCity = city.trim() || targetCustomer.city || '';
    const resolvedCat = category.trim() || targetCustomer.category || 'Other';
    const leadId = `lead_${Date.now()}`;

    try {
      const savedLead = await crmApi.createLead({
        id: leadId,
        customerId: targetCustomer.id,
        customerPhone: targetCustomer.phone || '',
        customerUsername: targetCustomer.username || '',
        company: companyDisplay,
        phone: cleanDigits,
        name: resolvedBuyerName,
        category: resolvedCat,
        city: resolvedCity,
        requirement: resolvedReq,
        budget: budget.trim() || '₹1.5L – ₹3.5L',
        priority: priority || 'Urgent',
        notes: notes.trim() || `Direct assignment from Lead Workspace for ${companyDisplay}`,
      });

      const normalized = normalizeLeadItem(
        savedLead || {
          id: leadId,
          customerId: targetCustomer.id,
          customerPhone: targetCustomer.phone || '',
          customerUsername: targetCustomer.username || '',
          company: companyDisplay,
          assignedCompany: companyDisplay,
          customerCompanyName: companyDisplay,
          phone: cleanDigits,
          displayPhone: formattedPhone,
          name: resolvedBuyerName,
          category: resolvedCat,
          city: resolvedCity,
          requirement: resolvedReq,
          budget: budget.trim() || '₹1.5L – ₹3.5L',
          priority: priority || 'Urgent',
          status: 'new',
          read: false,
          createdAt: getLiveNowFormatted(),
          notes: notes.trim(),
        }
      );

      setAssignedLeads((prev) => [normalized, ...prev.filter((l) => l.id !== normalized.id)]);

      // Keep shared localStorage + cross-desk listeners synchronized
      try {
        const rawLeads = localStorage.getItem('growthline_all_leads');
        const existing = rawLeads ? JSON.parse(rawLeads) : [];
        const nextAll = [
          normalized,
          ...(Array.isArray(existing) ? existing.filter((l) => l.id !== normalized.id) : []),
        ];
        localStorage.setItem('growthline_all_leads', JSON.stringify(nextAll));
        localStorage.setItem('growthline_latest_added_lead', JSON.stringify(normalized));
        window.dispatchEvent(new CustomEvent('growthline_lead_added', { detail: normalized }));
        window.dispatchEvent(new Event('storage'));
      } catch (_) {}

      setSuccessBanner({
        phone: cleanDigits,
        buyerName: buyerName.trim() || '',
        company: companyDisplay,
        leadId: normalized.id,
        assignedAt: getLiveNowFormatted(),
      });

      // Reset buyer-specific fields for instant consecutive entry while keeping customer & territory defaults
      setBuyerPhone('');
      setBuyerName('');
      setRequirement('');
      setNotes('');
      setTimeout(() => {
        if (phoneInputRef.current) phoneInputRef.current.focus();
      }, 50);
    } catch (err) {
      setSubmitError(err?.message || 'Failed to assign lead. Please verify connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleLeadRead = async (lead) => {
    const currentlyRead = Boolean(lead.read || lead.is_read || lead.status === 'read');
    const nextRead = !currentlyRead;
    const nextStatus = nextRead
      ? lead.status === 'new'
        ? 'read'
        : lead.status
      : lead.status === 'read'
        ? 'new'
        : lead.status;
    const updates = { read: nextRead, is_read: nextRead, status: nextStatus };

    setAssignedLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, ...updates } : l)));
    try {
      await crmApi.updateLead(lead.id, updates);
      window.dispatchEvent(new CustomEvent('growthline_lead_updated', { detail: { leadId: lead.id, updates } }));
    } catch (_) {}
  };

  // Computed KPIs for this customer's assigned leads
  const totalAssigned = assignedLeads.length;
  const readCount = assignedLeads.filter((l) => Boolean(l.read || l.is_read || l.status === 'read')).length;
  const unreadCount = totalAssigned - readCount;
  const readRatePct = totalAssigned > 0 ? Math.round((readCount / totalAssigned) * 100) : 0;
  const engagedCount = assignedLeads.filter((l) =>
    ['interested', 'in follow-up', 'callback', 'converted', 'won', 'qualified'].includes(
      String(l.status || '').toLowerCase()
    )
  ).length;
  const urgentCount = assignedLeads.filter((l) => String(l.priority || 'Urgent') === 'Urgent').length;

  const filteredHistory = useMemo(() => {
    return assignedLeads.filter((l) => {
      const isRead = Boolean(l.read || l.is_read || l.status === 'read');
      const st = String(l.status || 'new').toLowerCase();

      if (historyFilter === 'read' && !isRead) return false;
      if (historyFilter === 'unread' && isRead) return false;
      if (
        historyFilter === 'engaged' &&
        !['interested', 'in follow-up', 'callback', 'converted', 'won', 'qualified'].includes(st)
      ) {
        return false;
      }
      if (historyFilter === 'urgent' && String(l.priority || 'Urgent') !== 'Urgent') return false;

      const q = historySearch.trim().toLowerCase();
      if (q) {
        const hay = [
          l.phone,
          l.displayPhone,
          l.name,
          l.buyerLabel,
          l.city,
          l.category,
          l.requirement,
          l.budget,
          l.status,
          l.notes,
          l.id,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [assignedLeads, historyFilter, historySearch]);

  const companyTitle =
    targetCustomer?.companyName || targetCustomer?.name || urlState.customerKey || 'Client Account';
  const cleanCustPhone = String(targetCustomer?.phone || '').replace(/\D/g, '').slice(-10);
  const cleanCustUser = String(targetCustomer?.username || '').replace(/^@/, '').trim();
  const walletBalance = Number(targetCustomer?.balance ?? targetCustomer?.walletBalance ?? targetCustomer?.wallet_balance ?? 0);
  const currentPageHref = buildCustomerLeadHref(targetCustomer || urlState.customerKey, urlState.mode, urlState.from);

  const renderAssignedLeadsTable = (rows, tableTitle, maxInitialSize = 15) => (
    <div className="desk-table-card">
      <SmartTable
        title={tableTitle}
        defaultPageSize={maxInitialSize}
        exportFilename={`assigned-leads-${cleanCustUser || cleanCustPhone || 'customer'}`}
      >
        <table className="desk-table">
          <thead>
            <tr>
              <th>Inbound Buyer</th>
              <th>Requirement &amp; Location</th>
              <th>Budget &amp; Priority</th>
              <th>Client CRM Stage</th>
              <th>Read Status</th>
              <th>Assigned At</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '44px 24px', color: 'var(--adm-text-muted, #64748b)' }}>
                  <Layers size={30} style={{ margin: '0 auto 10px auto', opacity: 0.55 }} />
                  <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--adm-text-primary, #0f172a)' }}>
                    {totalAssigned === 0
                      ? `No Leads Assigned to ${companyTitle} Yet`
                      : 'No Assigned Leads Match Your Filter'}
                  </div>
                  <div style={{ fontSize: '0.84rem', marginTop: 4 }}>
                    {totalAssigned === 0
                      ? 'Use the Direct Lead Assignment form to dispatch your first verified buyer enquiry to this user.'
                      : 'Try clearing the search query or switching status filter tabs.'}
                  </div>
                  {totalAssigned === 0 && urlState.mode === 'history' && (
                    <button
                      type="button"
                      onClick={() => switchMode('add')}
                      className="sales-btn-primary"
                      style={{
                        marginTop: 14,
                        background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                        borderColor: '#059669',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <Plus size={15} /> Add First Lead to {companyTitle}
                    </button>
                  )}
                  {totalAssigned > 0 && (historyFilter !== 'all' || historySearch) && (
                    <button
                      type="button"
                      onClick={() => {
                        setHistoryFilter('all');
                        setHistorySearch('');
                      }}
                      className="desk-action-btn"
                      style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <RotateCcw size={14} /> Reset Filters
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              rows.map((lead) => {
                const digits = String(lead.phone || '').replace(/\D/g, '').slice(-10);
                const phoneFormatted = digits.length === 10 ? `+91 ${digits}` : lead.displayPhone || lead.phone || '—';
                const callHref = digits.length === 10 ? `tel:+91${digits}` : `tel:${lead.phone || ''}`;
                const isRead = Boolean(lead.read || lead.is_read || lead.status === 'read');
                const stageRaw = String(lead.status || 'new');
                const stageDisplay =
                  stageRaw.toLowerCase() === 'new'
                    ? 'New Assigned'
                    : stageRaw.toLowerCase() === 'read'
                      ? 'Viewed by Client'
                      : stageRaw;
                const stagePillClass = ['interested', 'converted', 'won', 'qualified'].includes(stageRaw.toLowerCase())
                  ? 'pill-emerald'
                  : ['dropped', 'not interested'].includes(stageRaw.toLowerCase())
                    ? 'pill-rose'
                    : ['in follow-up', 'callback'].includes(stageRaw.toLowerCase())
                      ? 'pill-amber'
                      : 'pill-indigo';

                return (
                  <tr key={lead.id}>
                    {/* 1. Buyer Phone & Name */}
                    <td>
                      <div style={{ fontSize: '0.98rem', fontWeight: 800, color: 'var(--adm-text-primary, #0f172a)', fontFamily: 'monospace' }}>
                        {phoneFormatted}
                      </div>
                      {lead.buyerLabel && (
                        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--adm-soft-blue-text, #1e3a8a)', marginTop: 2 }}>
                          {lead.buyerLabel}
                        </div>
                      )}
                      {lead.id && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--adm-text-muted, #64748b)', fontFamily: 'monospace', marginTop: 2 }}>
                          {lead.id}
                        </div>
                      )}
                    </td>

                    {/* 2. Requirement & Location */}
                    <td>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--adm-text-primary, #0f172a)', maxWidth: 280 }}>
                        {lead.requirement || 'Verified Business Enquiry'}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                        {lead.category && (
                          <span
                            style={{
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              color: 'var(--adm-text-body, #475569)',
                              background: 'var(--adm-bg-muted, #f1f5f9)',
                              padding: '1px 7px',
                              borderRadius: 4,
                            }}
                          >
                            {lead.category}
                          </span>
                        )}
                        {lead.city && (
                          <span style={{ fontSize: '0.74rem', color: 'var(--adm-text-muted, #64748b)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <MapPin size={11} /> {lead.city}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 3. Budget & Priority */}
                    <td>
                      <div style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--adm-text-primary, #0f172a)' }}>
                        {lead.budget || '₹1.5L – ₹3.5L'}
                      </div>
                      <div style={{ marginTop: 4 }}>
                        <span
                          className={`desk-pill ${lead.priority === 'Urgent' ? 'pill-rose' : lead.priority === 'High' ? 'pill-amber' : 'pill-indigo'}`}
                          style={{ fontSize: '0.68rem', fontWeight: 800 }}
                        >
                          {lead.priority || 'Urgent'}
                        </span>
                      </div>
                    </td>

                    {/* 4. Client CRM Stage */}
                    <td>
                      <span className={`desk-pill ${stagePillClass}`} style={{ fontWeight: 800 }}>
                        {stageDisplay}
                      </span>
                      {lead.notes && (
                        <div
                          style={{
                            fontSize: '0.74rem',
                            color: 'var(--adm-text-muted, #64748b)',
                            marginTop: 4,
                            maxWidth: 230,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={lead.notes}
                        >
                          {lead.notes}
                        </div>
                      )}
                    </td>

                    {/* 5. Client Read Status */}
                    <td>
                      <button
                        type="button"
                        onClick={() => handleToggleLeadRead(lead)}
                        title="Click to toggle read / unread status"
                        className={`desk-pill ${isRead ? 'pill-emerald' : 'pill-amber'}`}
                        style={{
                          fontWeight: 800,
                          border: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        {isRead ? '✓ Marked as Read' : '⏳ Unread by Client'}
                      </button>
                    </td>

                    {/* 6. Assigned At */}
                    <td>
                      <span style={{ fontSize: '0.83rem', fontWeight: 600, color: 'var(--adm-text-body, #334155)' }}>
                        {lead.createdAt || lead.assignedAt
                          ? formatIndianDateTime(lead.createdAt, lead.createdAtRaw || lead.created_at || lead.assignedAt)
                          : '—'}
                      </span>
                    </td>

                    {/* 7. Actions */}
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <a
                          href={callHref}
                          className="desk-action-btn"
                          style={{
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '6px 11px',
                            fontSize: '0.77rem',
                            fontWeight: 700,
                          }}
                        >
                          <Phone size={13} /> Call Buyer
                        </a>
                        {digits.length === 10 && (
                          <a
                            href={`https://wa.me/91${digits}?text=Hello,%20thank%20you%20for%20your%20inquiry%20with%20${encodeURIComponent(companyTitle)}.`}
                            target="_blank"
                            rel="noreferrer"
                            className="desk-action-btn"
                            style={{
                              textDecoration: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              padding: '6px 11px',
                              fontSize: '0.77rem',
                              fontWeight: 700,
                              background: 'var(--adm-soft-emerald-bg, #ecfdf5)',
                              color: 'var(--adm-soft-emerald-text, #065f46)',
                              borderColor: 'var(--adm-soft-emerald-border, #a7f3d0)',
                            }}
                          >
                            <MessageSquare size={13} color="#059669" /> WhatsApp
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
      </SmartTable>
    </div>
  );

  return (
    <div className="desk-page-container">
      {/* Top Navigation & Mode Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 14,
        }}
      >
        <button
          type="button"
          onClick={handleBack}
          className="desk-action-btn"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            padding: '8px 14px',
            fontSize: '0.84rem',
            fontWeight: 800,
            borderRadius: 10,
          }}
        >
          <ArrowLeft size={15} /> {backLabel}
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Dedicated Page Mode Switcher */}
          <div
            style={{
              display: 'inline-flex',
              background: 'var(--adm-bg-card, #ffffff)',
              border: '1px solid var(--adm-border-strong, #cbd5e1)',
              borderRadius: 10,
              padding: 3,
              gap: 4,
            }}
          >
            <button
              type="button"
              onClick={() => switchMode('add')}
              style={{
                border: 'none',
                borderRadius: 8,
                padding: '7px 14px',
                fontSize: '0.82rem',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background:
                  urlState.mode === 'add'
                    ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)'
                    : 'transparent',
                color: urlState.mode === 'add' ? '#ffffff' : 'var(--adm-text-body, #475569)',
              }}
            >
              <Plus size={14} strokeWidth={2.6} /> Add Lead Directly
            </button>
            <button
              type="button"
              onClick={() => switchMode('history')}
              style={{
                border: 'none',
                borderRadius: 8,
                padding: '7px 14px',
                fontSize: '0.82rem',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background:
                  urlState.mode === 'history'
                    ? 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)'
                    : 'transparent',
                color: urlState.mode === 'history' ? '#ffffff' : 'var(--adm-text-body, #475569)',
              }}
            >
              <Layers size={14} /> Assigned Leads Till Yet ({totalAssigned})
            </button>
          </div>

          <button
            type="button"
            onClick={() => fetchCustomerLeads(true)}
            className="desk-action-btn"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 12px',
              fontSize: '0.8rem',
              fontWeight: 700,
              borderRadius: 10,
            }}
            title="Refresh live leads from MongoDB"
          >
            <RefreshCw size={14} className={isLoadingLeads ? 'spin' : ''} /> Sync
          </button>

          <a
            href={currentPageHref}
            target="_blank"
            rel="noreferrer"
            className="desk-action-btn"
            style={{
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 12px',
              fontSize: '0.8rem',
              fontWeight: 700,
              borderRadius: 10,
            }}
            title="Open this user's lead page in a separate browser tab"
          >
            New Tab <ExternalLink size={13} />
          </a>
        </div>
      </div>

      {/* Page Header */}
      <div className="desk-header" style={{ marginBottom: 16 }}>
        <div>
          <div className="desk-breadcrumb">
            SUB ADMIN &amp; SUPPORT OPERATIONS / DESK 03 / DEDICATED USER LEAD WORKSPACE
          </div>
          <h1 className="desk-title">
            {urlState.mode === 'add'
              ? `Add Lead Directly — ${companyTitle}`
              : `All Assigned Leads — ${companyTitle}`}
          </h1>
          <p className="desk-subtitle">
            {urlState.mode === 'add'
              ? `Direct 1-step lead assignment locked to ${companyTitle}. Every submitted lead is delivered in real time to this user's CRM Lead Hub.`
              : `Complete history of all ${totalAssigned} inbound buyer ${totalAssigned === 1 ? 'lead' : 'leads'} assigned till yet to ${companyTitle}, with live client read & pipeline status.`}
          </p>
        </div>
      </div>

      {/* Locked Target Customer Identity Banner (Zero Dropdown Selection Needed!) */}
      <div className="desk-customer-kpi-banner" style={{ marginBottom: 18 }}>
        <div className="desk-customer-kpi-header">
          <div className="desk-customer-kpi-info">
            <div
              style={{
                width: 50,
                height: 50,
                minWidth: 50,
                borderRadius: 13,
                background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                color: '#ffffff',
                display: 'grid',
                placeItems: 'center',
                fontSize: '1.35rem',
                fontWeight: 900,
                boxShadow: '0 4px 14px rgba(99, 102, 241, 0.4)',
                border: '2px solid rgba(255, 255, 255, 0.2)',
                flexShrink: 0,
              }}
            >
              {companyTitle.charAt(0).toUpperCase()}
            </div>
            <div style={{ minWidth: 0, flex: '1 1 auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span
                  style={{
                    background: 'rgba(16, 185, 129, 0.2)',
                    color: '#34d399',
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    padding: '3px 8px',
                    borderRadius: 6,
                    border: '1px solid rgba(52, 211, 153, 0.4)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  ✓ Target User Locked
                </span>
                <h2
                  style={{
                    margin: 0,
                    fontSize: '1.22rem',
                    fontWeight: 800,
                    color: '#ffffff',
                    lineHeight: 1.3,
                  }}
                >
                  🏢 {companyTitle}
                </h2>
                {targetCustomer?.category && (
                  <span
                    style={{
                      background: 'rgba(255,255,255,0.12)',
                      color: '#e2e8f0',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '3px 9px',
                      borderRadius: 6,
                    }}
                  >
                    {targetCustomer.category}
                  </span>
                )}
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  marginTop: 6,
                  flexWrap: 'wrap',
                  fontSize: '0.82rem',
                  color: '#cbd5e1',
                }}
              >
                {cleanCustUser && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#a5b4fc', fontWeight: 700 }}>
                    <User size={13} /> @{cleanCustUser}
                  </span>
                )}
                {cleanCustPhone && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'monospace', fontWeight: 700 }}>
                    <Phone size={13} color="#34d399" /> +91 {cleanCustPhone}
                  </span>
                )}
                {targetCustomer?.email && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#94a3b8' }}>
                    <Mail size={13} /> {targetCustomer.email}
                  </span>
                )}
                {targetCustomer?.city && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#94a3b8' }}>
                    <MapPin size={13} /> {targetCustomer.city}
                  </span>
                )}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: walletBalance > 0 ? '#34d399' : '#fbbf24', fontWeight: 800 }}>
                  <Wallet size={13} /> Wallet: ₹{walletBalance.toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          </div>

          <div className="desk-customer-kpi-actions">
            {cleanCustPhone && (
              <>
                <a
                  href={`tel:+91${cleanCustPhone}`}
                  style={{
                    background: 'rgba(255, 255, 255, 0.12)',
                    color: '#ffffff',
                    border: '1px solid rgba(255, 255, 255, 0.25)',
                    fontWeight: 800,
                    fontSize: '0.8rem',
                    padding: '8px 14px',
                    borderRadius: 8,
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <Phone size={13} /> Call Client
                </a>
                <a
                  href={`https://wa.me/91${cleanCustPhone}?text=Hello%20${encodeURIComponent(companyTitle)},%20this%20is%20Ad%20Mafia%20Operations%20regarding%20your%20assigned%20campaign%20leads.`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    background: '#25D366',
                    color: '#ffffff',
                    fontWeight: 800,
                    fontSize: '0.8rem',
                    padding: '8px 14px',
                    borderRadius: 8,
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <MessageSquare size={13} /> WhatsApp Client
                </a>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Success Toast Banner */}
      {successBanner && (
        <div
          style={{
            background: 'linear-gradient(135deg, #065f46 0%, #047857 100%)',
            color: '#ffffff',
            borderRadius: 14,
            padding: '15px 20px',
            marginBottom: 18,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: '0 10px 25px rgba(5, 150, 105, 0.22)',
            border: '1px solid #10b981',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: '#ecfdf5',
                color: '#059669',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 900,
              }}
            >
              ✓
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.96rem' }}>
                Lead Assigned Directly to {successBanner.company}!
              </div>
              <div style={{ fontSize: '0.83rem', color: '#d1fae5', marginTop: 2 }}>
                Buyer <strong style={{ color: '#fff' }}>+91 {successBanner.phone}</strong>
                {successBanner.buyerName ? ` (${successBanner.buyerName})` : ''} is now live in their CRM Lead Hub. Total assigned till yet:{' '}
                <strong style={{ color: '#fff' }}>{totalAssigned}</strong>.
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={() => switchMode('history')}
              style={{
                background: '#ffffff',
                color: '#065f46',
                border: 'none',
                borderRadius: 9999,
                padding: '8px 16px',
                fontWeight: 800,
                fontSize: '0.82rem',
                cursor: 'pointer',
              }}
            >
              View All Assigned Leads ({totalAssigned}) →
            </button>
            <button
              type="button"
              onClick={() => setSuccessBanner(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#a7f3d0',
                cursor: 'pointer',
                fontWeight: 800,
                fontSize: '1.1rem',
                padding: '4px 8px',
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODE 1: DIRECT LEAD ASSIGNMENT PAGE (NO CUSTOMER DROPDOWN NEEDED)
         ===================================================================== */}
      {urlState.mode === 'add' && (
        <>
          <div
            style={{
              background: 'var(--adm-bg-card, #ffffff)',
              border: '1px solid var(--adm-border-strong, #cbd5e1)',
              borderRadius: 16,
              padding: '24px',
              marginBottom: 22,
              boxShadow: '0 4px 18px rgba(15, 23, 42, 0.06)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
                marginBottom: 18,
                paddingBottom: 14,
                borderBottom: '1px solid var(--adm-border, #e2e8f0)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                    color: '#ffffff',
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  <Sparkles size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.08rem', fontWeight: 800, color: 'var(--adm-text-primary, #0f172a)' }}>
                    New Buyer Lead Details for {companyTitle}
                  </h3>
                  <div style={{ fontSize: '0.8rem', color: 'var(--adm-text-muted, #64748b)', marginTop: 2 }}>
                    Enter the 10-digit buyer mobile number to dispatch immediately, or include optional enquiry details below.
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => switchMode('history')}
                className="desk-action-btn"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 14px',
                  fontSize: '0.82rem',
                  fontWeight: 800,
                  color: 'var(--adm-soft-indigo-text, #4f46e5)',
                  borderColor: 'var(--adm-soft-indigo-border, #c7d2fe)',
                  background: 'var(--adm-soft-indigo-bg, #eef2ff)',
                }}
              >
                <Layers size={14} /> See All {totalAssigned} Assigned Leads →
              </button>
            </div>

            {submitError && (
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  color: '#ef4444',
                  padding: '10px 14px',
                  borderRadius: 10,
                  fontSize: '0.84rem',
                  fontWeight: 700,
                  marginBottom: 16,
                }}
              >
                {submitError}
              </div>
            )}

            <form onSubmit={handleAssignLead}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
                  gap: 16,
                }}
              >
                {/* 1. Buyer Mobile Number (Required) */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label
                      className="desk-form-label"
                      style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--adm-text-primary, #0f172a)', margin: 0 }}
                    >
                      Buyer Mobile Number (10 Digits) <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 800,
                        color: isPhoneComplete ? '#059669' : 'var(--adm-text-muted, #64748b)',
                        background: isPhoneComplete
                          ? 'var(--adm-soft-emerald-bg, #ecfdf5)'
                          : 'var(--adm-bg-muted, #f1f5f9)',
                        padding: '2px 8px',
                        borderRadius: 6,
                        border: `1px solid ${
                          isPhoneComplete
                            ? 'var(--adm-soft-emerald-border, #a7f3d0)'
                            : 'var(--adm-border, #e2e8f0)'
                        }`,
                      }}
                    >
                      {buyerPhone.length}/10 digits
                    </span>
                  </div>
                  <input
                    ref={phoneInputRef}
                    type="tel"
                    required
                    maxLength={10}
                    className="desk-form-input"
                    placeholder="e.g. 9876543210"
                    value={buyerPhone}
                    onChange={(e) => setBuyerPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '1.05rem',
                      fontWeight: 800,
                      letterSpacing: '0.05em',
                      padding: '11px 14px',
                      width: '100%',
                      boxSizing: 'border-box',
                      borderColor: !isPhoneValidStart
                        ? '#ef4444'
                        : isPhoneComplete
                          ? '#10b981'
                          : 'var(--adm-border-strong, #cbd5e1)',
                    }}
                  />
                  {!isPhoneValidStart && (
                    <div style={{ fontSize: '0.76rem', color: '#ef4444', fontWeight: 700, marginTop: 4 }}>
                      Indian mobile numbers must start with 6, 7, 8, or 9.
                    </div>
                  )}
                  {duplicateAssignedLead && (
                    <div
                      style={{
                        fontSize: '0.76rem',
                        color: '#d97706',
                        fontWeight: 700,
                        marginTop: 5,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                      }}
                    >
                      <AlertTriangle size={13} /> Heads up: +91 {buyerPhone} was already assigned to {companyTitle} earlier.
                    </div>
                  )}
                </div>

                {/* 2. Buyer Name (Optional) */}
                <div>
                  <label
                    className="desk-form-label"
                    style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--adm-text-primary, #0f172a)', marginBottom: 6, display: 'block' }}
                  >
                    Buyer Name <span style={{ color: 'var(--adm-text-muted, #64748b)', fontWeight: 500 }}>(Optional)</span>
                  </label>
                  <input
                    type="text"
                    className="desk-form-input"
                    placeholder="e.g. Rajesh Patel (defaults to +91 phone)"
                    value={buyerName}
                    onChange={(e) => setBuyerName(e.target.value)}
                    style={{ padding: '11px 14px', width: '100%', boxSizing: 'border-box' }}
                  />
                </div>

                {/* 3. City / Territory (Optional) */}
                <div>
                  <label
                    className="desk-form-label"
                    style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--adm-text-primary, #0f172a)', marginBottom: 6, display: 'block' }}
                  >
                    Buyer City / Territory
                  </label>
                  <input
                    type="text"
                    className="desk-form-input"
                    placeholder="e.g. Ahmedabad, Mumbai, Surat"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    style={{ padding: '11px 14px', width: '100%', boxSizing: 'border-box' }}
                  />
                </div>

                {/* 4. Category & Priority */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px', gap: 10 }}>
                  <div>
                    <label
                      className="desk-form-label"
                      style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--adm-text-primary, #0f172a)', marginBottom: 6, display: 'block' }}
                    >
                      Business Category
                    </label>
                    <input
                      type="text"
                      className="desk-form-input"
                      placeholder="Category"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      style={{ padding: '11px 12px', width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label
                      className="desk-form-label"
                      style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--adm-text-primary, #0f172a)', marginBottom: 6, display: 'block' }}
                    >
                      Priority
                    </label>
                    <select
                      className="desk-form-input"
                      value={priority}
                      onChange={(e) => setPriority(e.target.value)}
                      style={{ padding: '11px 10px', width: '100%', boxSizing: 'border-box', fontWeight: 700 }}
                    >
                      <option value="Urgent">Urgent</option>
                      <option value="High">High</option>
                      <option value="Normal">Normal</option>
                    </select>
                  </div>
                </div>

                {/* 5. Budget Range */}
                <div>
                  <label
                    className="desk-form-label"
                    style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--adm-text-primary, #0f172a)', marginBottom: 6, display: 'block' }}
                  >
                    Estimated Buyer Budget
                  </label>
                  <input
                    type="text"
                    className="desk-form-input"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    style={{ padding: '10px 14px', width: '100%', boxSizing: 'border-box' }}
                  />
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                    {BUDGET_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setBudget(preset)}
                        style={{
                          padding: '3px 9px',
                          borderRadius: 6,
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          border:
                            budget === preset
                              ? '1px solid #6366f1'
                              : '1px solid var(--adm-border-strong, #cbd5e1)',
                          background:
                            budget === preset
                              ? 'var(--adm-soft-indigo-bg, #eef2ff)'
                              : 'var(--adm-bg-subtle, #f8fafc)',
                          color: budget === preset ? '#4f46e5' : 'var(--adm-text-muted, #64748b)',
                        }}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 6. Requirement / Enquiry Summary */}
                <div>
                  <label
                    className="desk-form-label"
                    style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--adm-text-primary, #0f172a)', marginBottom: 6, display: 'block' }}
                  >
                    Buyer Requirement <span style={{ color: 'var(--adm-text-muted, #64748b)', fontWeight: 500 }}>(Optional)</span>
                  </label>
                  <input
                    type="text"
                    className="desk-form-input"
                    placeholder="e.g. Bulk order / service inquiry — ready for immediate call"
                    value={requirement}
                    onChange={(e) => setRequirement(e.target.value)}
                    style={{ padding: '11px 14px', width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              {/* Optional Handover Notes */}
              <div style={{ marginTop: 14 }}>
                <label
                  className="desk-form-label"
                  style={{ fontWeight: 700, fontSize: '0.84rem', color: 'var(--adm-text-primary, #0f172a)', marginBottom: 6, display: 'block' }}
                >
                  Handover Notes for Client <span style={{ color: 'var(--adm-text-muted, #64748b)', fontWeight: 500 }}>(Optional)</span>
                </label>
                <input
                  type="text"
                  className="desk-form-input"
                  placeholder="Optional call instructions or buyer preference..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  style={{ padding: '10px 14px', width: '100%', boxSizing: 'border-box' }}
                />
              </div>

              {/* Submit Footer */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  flexWrap: 'wrap',
                  marginTop: 20,
                  paddingTop: 16,
                  borderTop: '1px solid var(--adm-border, #e2e8f0)',
                }}
              >
                <div style={{ fontSize: '0.8rem', color: '#059669', fontWeight: 700 }}>
                  ✓ Strictly isolated delivery — only <strong>{companyTitle}</strong> receives this lead in their CRM.
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button type="button" className="sales-btn-secondary" onClick={handleBack}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!isPhoneComplete || isSubmitting || !targetCustomer}
                    className="sales-btn-primary"
                    style={{
                      background:
                        isPhoneComplete && !isSubmitting
                          ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)'
                          : '#94a3b8',
                      borderColor: isPhoneComplete && !isSubmitting ? '#059669' : '#94a3b8',
                      cursor: isPhoneComplete && !isSubmitting ? 'pointer' : 'not-allowed',
                      padding: '11px 24px',
                      fontWeight: 800,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <Send size={15} />
                    {isSubmitting ? 'Assigning Lead...' : `Assign Lead to ${companyTitle}`}
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* Live Assigned Leads Section Right Below Add Form */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
              marginBottom: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Building2 size={17} color="#6366f1" />
              <span style={{ fontWeight: 800, fontSize: '0.96rem', color: 'var(--adm-text-primary, #0f172a)' }}>
                Leads Assigned Till Yet to {companyTitle} ({totalAssigned})
              </span>
            </div>
            {totalAssigned > 0 && (
              <button
                type="button"
                onClick={() => switchMode('history')}
                className="desk-action-btn"
                style={{ fontSize: '0.78rem', fontWeight: 800 }}
              >
                Open Full History &amp; Analytics View →
              </button>
            )}
          </div>

          {renderAssignedLeadsTable(assignedLeads, `Assigned Leads — ${companyTitle}`, 10)}
        </>
      )}

      {/* =====================================================================
          MODE 2: COMPLETE ASSIGNED LEADS HISTORY PAGE FOR THIS USER
         ===================================================================== */}
      {urlState.mode === 'history' && (
        <>
          {/* 4 Scoped KPI Cards */}
          <div className="desk-kpi-grid" style={{ marginBottom: 16 }}>
            <div className="desk-kpi-card">
              <div className="desk-kpi-label">TOTAL ASSIGNED TILL YET</div>
              <div className="desk-kpi-val text-indigo">{totalAssigned}</div>
              <div className="desk-kpi-sub">All leads delivered to {companyTitle}</div>
            </div>
            <div className="desk-kpi-card">
              <div className="desk-kpi-label">READ BY CLIENT</div>
              <div className="desk-kpi-val text-emerald">{readCount}</div>
              <div className="desk-kpi-sub">
                {totalAssigned > 0 ? `${readRatePct}% client read rate` : 'No leads assigned yet'}
              </div>
            </div>
            <div className="desk-kpi-card">
              <div className="desk-kpi-label">UNREAD / PENDING</div>
              <div className="desk-kpi-val text-amber">{unreadCount}</div>
              <div className="desk-kpi-sub">
                {unreadCount > 0 ? 'Awaiting client open in CRM' : 'All assigned leads read ✓'}
              </div>
            </div>
            <div className="desk-kpi-card">
              <div className="desk-kpi-label">ENGAGED / INTERESTED</div>
              <div className="desk-kpi-val text-emerald">{engagedCount}</div>
              <div className="desk-kpi-sub">Marked Interested / Follow-up / Won</div>
            </div>
          </div>

          {/* Filter Tabs + Search + Quick "+ Add Lead" CTA */}
          <div
            className="desk-filter-bar"
            style={{
              marginBottom: 14,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div className="desk-tabs">
              <button
                type="button"
                className={`desk-tab ${historyFilter === 'all' ? 'active' : ''}`}
                onClick={() => setHistoryFilter('all')}
              >
                All Assigned ({totalAssigned})
              </button>
              <button
                type="button"
                className={`desk-tab ${historyFilter === 'read' ? 'active' : ''}`}
                onClick={() => setHistoryFilter('read')}
              >
                ✓ Read by Client ({readCount})
              </button>
              <button
                type="button"
                className={`desk-tab ${historyFilter === 'unread' ? 'active' : ''}`}
                onClick={() => setHistoryFilter('unread')}
              >
                ⏳ Unread ({unreadCount})
              </button>
              <button
                type="button"
                className={`desk-tab ${historyFilter === 'engaged' ? 'active' : ''}`}
                onClick={() => setHistoryFilter('engaged')}
              >
                Interested / Follow-up ({engagedCount})
              </button>
              <button
                type="button"
                className={`desk-tab ${historyFilter === 'urgent' ? 'active' : ''}`}
                onClick={() => setHistoryFilter('urgent')}
              >
                Urgent SLA ({urgentCount})
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div className="desk-search-wrap" style={{ margin: 0, minWidth: 230 }}>
                <Search size={15} className="desk-search-icon" />
                <input
                  type="text"
                  className="desk-search-input"
                  placeholder="Search buyer phone, name, city, notes..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                />
              </div>
              <button
                type="button"
                onClick={() => switchMode('add')}
                className="sales-btn-primary"
                style={{
                  background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                  borderColor: '#059669',
                  color: '#ffffff',
                  fontWeight: 800,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  whiteSpace: 'nowrap',
                }}
              >
                <Plus size={15} strokeWidth={2.5} /> Add Lead to {companyTitle}
              </button>
            </div>
          </div>

          {renderAssignedLeadsTable(filteredHistory, `All Assigned Leads — ${companyTitle}`, 15)}
        </>
      )}
    </div>
  );
}
