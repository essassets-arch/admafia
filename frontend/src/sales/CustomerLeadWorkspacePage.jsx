import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  ArrowLeft,
  Building2,
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
import { formatIndianDateTime } from './OperationalDesksViews';
import {
  extractCustomerKey,
  buildCustomerLeadHref,
  navigateToCustomerLeadPage,
} from './customerLeadNavigation';

export { extractCustomerKey, buildCustomerLeadHref, navigateToCustomerLeadPage };

export function parseBulkIndianPhones(rawInput, existingPhonesSet = new Set()) {
  const text = String(rawInput || '');
  if (!text.trim()) {
    return {
      validNumbers: [],
      invalidTokens: [],
      clientDuplicates: [],
      newValidNumbers: [],
      batchDuplicatesCount: 0,
    };
  }

  // Split by lines, commas, semicolons first; normalize "+91 98765 43210" / "98765 43210" within each chunk
  const segments = text.split(/[\r\n,;]+/);
  const tokens = [];
  for (const seg of segments) {
    const normalizedSeg = seg
      .replace(/(?:\+91|0091)[\s-]*([6-9]\d{4})[\s-]*(\d{5})/g, ' $1$2 ')
      .replace(/(?:\+91|0091)[\s-]*([6-9]\d{9})/g, ' $1 ')
      .replace(/\b([6-9]\d{4})[\s-](\d{5})\b/g, '$1$2');
    const parts = normalizedSeg.split(/[\t ]+/).map((s) => s.trim()).filter(Boolean);
    tokens.push(...parts);
  }

  const validNumbers = [];
  const invalidTokens = [];
  const clientDuplicates = [];
  const newValidNumbers = [];
  const seenInBatch = new Set();
  let batchDuplicatesCount = 0;

  for (const tok of tokens) {
    const digitsOnly = tok.replace(/\D/g, '');
    if (!digitsOnly && tok === '+91') continue;

    let clean = digitsOnly;
    if (clean.length === 12 && clean.startsWith('91')) {
      clean = clean.slice(2);
    } else if (clean.length === 11 && clean.startsWith('0')) {
      clean = clean.slice(1);
    }

    if (clean.length === 10 && ['6', '7', '8', '9'].includes(clean[0])) {
      if (seenInBatch.has(clean)) {
        batchDuplicatesCount += 1;
        continue;
      }
      seenInBatch.add(clean);
      validNumbers.push(clean);
      if (existingPhonesSet.has(clean)) {
        clientDuplicates.push(clean);
      } else {
        newValidNumbers.push(clean);
      }
    } else {
      invalidTokens.push(tok);
    }
  }

  return {
    validNumbers,
    invalidTokens,
    clientDuplicates,
    newValidNumbers,
    batchDuplicatesCount,
  };
}

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

export default function CustomerLeadWorkspacePage({ customers: propsCustomers = [], navigateToDesk }) {
  const [urlState, setUrlState] = useState(parseUrlState);
  const [allCustomers, setAllCustomers] = useState(() => (Array.isArray(propsCustomers) ? propsCustomers : []));
  const [assignedLeads, setAssignedLeads] = useState([]);
  const [isLoadingLeads, setIsLoadingLeads] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [successBanner, setSuccessBanner] = useState(null);

  // Sleek Phone-Only (+ Bulk Multi-Number Paste) Lead Dispatch State
  const [phonesInput, setPhonesInput] = useState('');
  const [multiLineMode, setMultiLineMode] = useState(false);

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
      name: rawDigits ? `+91 ${rawDigits}` : item.name || '—',
      read: Boolean(item.read || item.is_read || item.status === 'read'),
      is_read: Boolean(item.read || item.is_read || item.status === 'read'),
    };
  }, []);

  const fetchCustomerLeads = useCallback(async (showSpinner = false) => {
    if (showSpinner) setIsLoadingLeads(true);
    try {
      if (allCustomers.length === 0 || (urlState.customerKey && !targetCustomer)) {
        const state = await crmApi.syncStateFromPostgres();
        if (Array.isArray(state?.customers) && state.customers.length > 0) {
          setAllCustomers(state.customers);
        }
      }

      const resolvedCust =
        targetCustomer ||
        (urlState.customerKey
          ? {
              id: urlState.customerKey,
              phone: urlState.customerKey.replace(/\D/g, '').slice(-10),
              username: urlState.customerKey,
            }
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
      if (fromDesk === 'approved') return navigateToDesk('customers', '#approved');
      return navigateToDesk('leads', '#leads');
    }
    window.location.hash = '#leads';
  };

  const backLabel =
    urlState.from === 'customers'
      ? 'Back to Customers & Wallets'
      : urlState.from === 'approved'
        ? 'Back to Active & Approved'
        : 'Back to Leads & Distribution';

  // Live phone parsing & client-duplicate detection
  const existingPhonesSet = useMemo(() => {
    const s = new Set();
    for (const l of assignedLeads) {
      const d = String(l.phone || '').replace(/\D/g, '').slice(-10);
      if (d.length === 10) s.add(d);
    }
    return s;
  }, [assignedLeads]);

  const parsedPhones = useMemo(
    () => parseBulkIndianPhones(phonesInput, existingPhonesSet),
    [phonesInput, existingPhonesSet]
  );

  const isSingleLineActive = !multiLineMode && !phonesInput.includes('\n');
  const canDispatch = Boolean(targetCustomer) && parsedPhones.validNumbers.length > 0 && !isSubmitting;

  const handleAssignLead = async (e) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    setSubmitError('');

    if (!targetCustomer) {
      setSubmitError('Target customer account could not be resolved.');
      return;
    }
    if (parsedPhones.validNumbers.length === 0) {
      setSubmitError('Enter at least one valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.');
      return;
    }

    setIsSubmitting(true);
    const companyDisplay =
      targetCustomer.companyName || targetCustomer.name || `@${targetCustomer.username || 'client'}`;

    try {
      const res = await crmApi.createBulkLeads({
        customerId: targetCustomer.id,
        customerPhone: targetCustomer.phone || '',
        customerUsername: targetCustomer.username || '',
        company: companyDisplay,
        phones: parsedPhones.validNumbers,
      });

      const createdList = Array.isArray(res?.leads) ? res.leads.map(normalizeLeadItem) : [];
      const addedCount = Number(res?.addedCount ?? createdList.length);
      const skippedDuplicates = Array.isArray(res?.skippedDuplicates) ? res.skippedDuplicates : [];
      const serverInvalid = Array.isArray(res?.invalidNumbers) ? res.invalidNumbers : [];

      if (addedCount === 0 && skippedDuplicates.length > 0) {
        setSubmitError(
          `Duplicate skipped: ${skippedDuplicates.map((d) => `+91 ${d}`).join(', ')} ${
            skippedDuplicates.length === 1 ? 'was' : 'were'
          } already assigned to ${companyDisplay}.`
        );
        return;
      }

      if (createdList.length > 0) {
        const createdIds = new Set(createdList.map((l) => l.id));
        setAssignedLeads((prev) => [...createdList, ...prev.filter((l) => !createdIds.has(l.id))]);

        try {
          const rawLeads = localStorage.getItem('growthline_all_leads');
          const existing = rawLeads ? JSON.parse(rawLeads) : [];
          const nextAll = [
            ...createdList,
            ...(Array.isArray(existing) ? existing.filter((l) => !createdIds.has(l.id)) : []),
          ];
          localStorage.setItem('growthline_all_leads', JSON.stringify(nextAll));
          localStorage.setItem('growthline_latest_added_lead', JSON.stringify(createdList[0]));
          createdList.forEach((leadItem) => {
            window.dispatchEvent(new CustomEvent('growthline_lead_added', { detail: leadItem }));
          });
          window.dispatchEvent(new Event('storage'));
        } catch (_) {}
      }

      setSuccessBanner({
        addedCount,
        phones: createdList.map((l) => l.phone),
        skippedDuplicates,
        invalidCount: parsedPhones.invalidTokens.length + serverInvalid.length,
        company: companyDisplay,
      });

      setPhonesInput('');
      setTimeout(() => {
        if (phoneInputRef.current) phoneInputRef.current.focus();
      }, 50);
    } catch (err) {
      setSubmitError(err?.message || 'Failed to dispatch lead(s). Please verify connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTextareaKeyDown = (e) => {
    if (e.key === 'Enter') {
      if ((e.ctrlKey || e.metaKey) && canDispatch) {
        e.preventDefault();
        handleAssignLead(e);
        return;
      }
      if (isSingleLineActive && !e.shiftKey) {
        e.preventDefault();
        if (canDispatch) {
          handleAssignLead(e);
        }
      }
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

      const q = historySearch.trim().toLowerCase();
      if (q) {
        const hay = [l.phone, l.displayPhone, l.status, l.id].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [assignedLeads, historyFilter, historySearch]);

  const companyTitle =
    targetCustomer?.companyName || targetCustomer?.name || urlState.customerKey || 'Client Account';
  const cleanCustPhone = String(targetCustomer?.phone || '').replace(/\D/g, '').slice(-10);
  const cleanCustUser = String(targetCustomer?.username || '').replace(/^@/, '').trim();
  const walletBalance = Number(
    targetCustomer?.balance ?? targetCustomer?.walletBalance ?? targetCustomer?.wallet_balance ?? 0
  );
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
              <th>Buyer Mobile (+91)</th>
              <th>Read / Unread Status</th>
              <th>Assigned Date &amp; Time (IST)</th>
              <th style={{ textAlign: 'right' }}>Call / WhatsApp</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', padding: '44px 24px', color: 'var(--adm-text-muted, #64748b)' }}>
                  <Layers size={30} style={{ margin: '0 auto 10px auto', opacity: 0.55 }} />
                  <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--adm-text-primary, #0f172a)' }}>
                    {totalAssigned === 0
                      ? `No Leads Assigned to ${companyTitle} Yet`
                      : 'No Assigned Leads Match Your Filter'}
                  </div>
                  <div style={{ fontSize: '0.84rem', marginTop: 4 }}>
                    {totalAssigned === 0
                      ? 'Enter or paste 10-digit buyer mobile numbers above to dispatch verified leads instantly.'
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
                      <Plus size={15} /> Send First Lead to {companyTitle}
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
                const stageRaw = String(lead.status || 'new').trim();
                const stageLower = stageRaw.toLowerCase();
                const showPipelineStage = !['new', 'read', ''].includes(stageLower);
                const stagePillClass = ['interested', 'converted', 'won', 'qualified'].includes(stageLower)
                  ? 'pill-emerald'
                  : ['dropped', 'not interested'].includes(stageLower)
                    ? 'pill-rose'
                    : 'pill-indigo';

                return (
                  <tr key={lead.id}>
                    {/* 1. Buyer Mobile (+91) */}
                    <td>
                      <div
                        style={{
                          fontSize: '1.02rem',
                          fontWeight: 800,
                          color: 'var(--adm-text-primary, #0f172a)',
                          fontFamily: 'monospace',
                          letterSpacing: '0.02em',
                        }}
                      >
                        {phoneFormatted}
                      </div>
                      {lead.id && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--adm-text-muted, #64748b)', fontFamily: 'monospace', marginTop: 2 }}>
                          {lead.id}
                        </div>
                      )}
                    </td>

                    {/* 2. Read / Unread Status */}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
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
                        {showPipelineStage && (
                          <span className={`desk-pill ${stagePillClass}`} style={{ fontSize: '0.72rem', fontWeight: 800 }}>
                            {stageRaw}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 3. Assigned Date & Time (IST) */}
                    <td>
                      <span style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--adm-text-body, #334155)' }}>
                        {lead.createdAt || lead.assignedAt
                          ? formatIndianDateTime(lead.createdAt, lead.createdAtRaw || lead.created_at || lead.assignedAt)
                          : '—'}
                      </span>
                    </td>

                    {/* 4. Call / WhatsApp Actions */}
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
                          <Phone size={13} /> Call
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
              <Plus size={14} strokeWidth={2.6} /> Quick Phone Dispatch
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
              <Layers size={14} /> Assigned Leads ({totalAssigned})
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
            title="Refresh live leads from database"
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
            title="Open this client's lead workspace in a new browser tab"
          >
            New Tab <ExternalLink size={13} />
          </a>
        </div>
      </div>

      {/* Page Header */}
      <div className="desk-header" style={{ marginBottom: 16 }}>
        <div>
          <div className="desk-breadcrumb">
            AD MAFIA SALES OPERATIONS / LEADS &amp; DISTRIBUTION / CLIENT LEAD WORKSPACE
          </div>
          <h1 className="desk-title">
            {urlState.mode === 'add'
              ? `Send Buyer Mobile Leads — ${companyTitle}`
              : `Assigned Buyer Leads — ${companyTitle}`}
          </h1>
          <p className="desk-subtitle">
            {urlState.mode === 'add'
              ? `Instant 1-field verified +91 buyer mobile dispatch locked to ${companyTitle}. Type 1 number or paste multiple 10-digit numbers at once.`
              : `Complete history of all ${totalAssigned} verified +91 buyer ${totalAssigned === 1 ? 'number' : 'numbers'} delivered to ${companyTitle}, with live read status.`}
          </p>
        </div>
      </div>

      {/* Locked Target Customer Identity Banner */}
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
                  ✓ Target Client Locked
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
                {successBanner.addedCount === 1
                  ? `Lead +91 ${successBanner.phones[0] || ''} Sent to ${successBanner.company}!`
                  : `${successBanner.addedCount} Verified Buyer Mobile Leads Sent to ${successBanner.company}!`}
              </div>
              <div style={{ fontSize: '0.82rem', color: '#d1fae5', marginTop: 2 }}>
                {successBanner.phones.length > 1 && (
                  <span>
                    Numbers: <strong style={{ color: '#fff' }}>{successBanner.phones.slice(0, 4).map((p) => `+91 ${p}`).join(', ')}{successBanner.phones.length > 4 ? ` +${successBanner.phones.length - 4} more` : ''}</strong>.{' '}
                  </span>
                )}
                {successBanner.skippedDuplicates?.length > 0 && (
                  <span>
                    Skipped {successBanner.skippedDuplicates.length} existing duplicate{successBanner.skippedDuplicates.length === 1 ? '' : 's'}.{' '}
                  </span>
                )}
                Total assigned till yet: <strong style={{ color: '#fff' }}>{totalAssigned}</strong>.
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
              View All ({totalAssigned}) →
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
          MODE 1: PHONE-ONLY (+ BULK PASTE) LEAD DISPATCH CARD
         ===================================================================== */}
      {urlState.mode === 'add' && (
        <>
          <div
            style={{
              background: 'var(--adm-bg-card, #ffffff)',
              border: '1px solid var(--adm-border-strong, #cbd5e1)',
              borderRadius: 16,
              padding: '22px 24px',
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
                marginBottom: 16,
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
                    flexShrink: 0,
                  }}
                >
                  <Sparkles size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.08rem', fontWeight: 800, color: 'var(--adm-text-primary, #0f172a)' }}>
                    Phone-Only (+ Bulk Paste) Lead Dispatch
                  </h3>
                  <div style={{ fontSize: '0.8rem', color: 'var(--adm-text-muted, #64748b)', marginTop: 2 }}>
                    Ad Mafia delivers verified <strong>+91 10-digit buyer mobile numbers</strong> directly to {companyTitle}.
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div
                  style={{
                    display: 'inline-flex',
                    background: 'var(--adm-bg-subtle, #f8fafc)',
                    border: '1px solid var(--adm-border, #e2e8f0)',
                    borderRadius: 8,
                    padding: 2,
                    gap: 2,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setMultiLineMode(false)}
                    style={{
                      border: 'none',
                      borderRadius: 6,
                      padding: '5px 10px',
                      fontSize: '0.74rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      background: !multiLineMode ? 'var(--adm-bg-card, #ffffff)' : 'transparent',
                      color: !multiLineMode ? '#059669' : 'var(--adm-text-muted, #64748b)',
                      boxShadow: !multiLineMode ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                    }}
                  >
                    ⚡ Single-Line (Enter = Send)
                  </button>
                  <button
                    type="button"
                    onClick={() => setMultiLineMode(true)}
                    style={{
                      border: 'none',
                      borderRadius: 6,
                      padding: '5px 10px',
                      fontSize: '0.74rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      background: multiLineMode ? 'var(--adm-bg-card, #ffffff)' : 'transparent',
                      color: multiLineMode ? '#4f46e5' : 'var(--adm-text-muted, #64748b)',
                      boxShadow: multiLineMode ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                    }}
                  >
                    📋 Bulk Paste Mode
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => switchMode('history')}
                  className="desk-action-btn"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '7px 13px',
                    fontSize: '0.8rem',
                    fontWeight: 800,
                    color: 'var(--adm-soft-indigo-text, #4f46e5)',
                    borderColor: 'var(--adm-soft-indigo-border, #c7d2fe)',
                    background: 'var(--adm-soft-indigo-bg, #eef2ff)',
                  }}
                >
                  <Layers size={14} /> Assigned ({totalAssigned}) →
                </button>
              </div>
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
                  marginBottom: 14,
                }}
              >
                {submitError}
              </div>
            )}

            <form onSubmit={handleAssignLead}>
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'wrap',
                    marginBottom: 8,
                  }}
                >
                  <label
                    className="desk-form-label"
                    style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--adm-text-primary, #0f172a)', margin: 0 }}
                  >
                    Buyer 10-Digit Mobile Number(s) <span style={{ color: '#ef4444' }}>*</span>
                  </label>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {/* Live Valid Count Badge */}
                    <span
                      style={{
                        fontSize: '0.76rem',
                        fontWeight: 800,
                        color:
                          parsedPhones.validNumbers.length > 0
                            ? 'var(--adm-soft-emerald-text, #059669)'
                            : phonesInput.trim()
                              ? 'var(--adm-soft-rose-text, #e11d48)'
                              : 'var(--adm-text-muted, #64748b)',
                        background:
                          parsedPhones.validNumbers.length > 0
                            ? 'var(--adm-soft-emerald-bg, #ecfdf5)'
                            : phonesInput.trim()
                              ? 'var(--adm-soft-rose-bg, #fff1f2)'
                              : 'var(--adm-bg-muted, #f1f5f9)',
                        padding: '3px 10px',
                        borderRadius: 9999,
                        border: `1px solid ${
                          parsedPhones.validNumbers.length > 0
                            ? 'var(--adm-soft-emerald-border, #a7f3d0)'
                            : phonesInput.trim()
                              ? 'var(--adm-soft-rose-border, #fecdd3)'
                              : 'var(--adm-border, #e2e8f0)'
                        }`,
                      }}
                    >
                      {parsedPhones.validNumbers.length > 0
                        ? `✓ ${parsedPhones.validNumbers.length} valid ${
                            parsedPhones.validNumbers.length === 1 ? 'number' : 'numbers'
                          } ready`
                        : phonesInput.trim()
                          ? '0 valid numbers detected'
                          : 'Paste 1 or 50+ numbers (comma, space, or newline)'}
                    </span>

                    {phonesInput.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setPhonesInput('');
                          setSubmitError('');
                          if (phoneInputRef.current) phoneInputRef.current.focus();
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--adm-text-muted, #64748b)',
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          textDecoration: 'underline',
                        }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                <textarea
                  ref={phoneInputRef}
                  rows={
                    isSingleLineActive
                      ? 2
                      : Math.min(7, Math.max(4, phonesInput.split('\n').length + 1))
                  }
                  className="desk-form-input"
                  placeholder={
                    isSingleLineActive
                      ? 'Type a 10-digit buyer mobile (e.g. 9876543210) & press Enter — or paste multiple numbers separated by comma, space, or newline...'
                      : 'Paste multiple 10-digit buyer mobile numbers (one per line, comma-separated, or space-separated)...\n9876543210\n9123456789\n8877665544'
                  }
                  value={phonesInput}
                  onChange={(e) => setPhonesInput(e.target.value)}
                  onKeyDown={handleTextareaKeyDown}
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '1.04rem',
                    fontWeight: 800,
                    letterSpacing: '0.03em',
                    padding: '12px 14px',
                    width: '100%',
                    boxSizing: 'border-box',
                    resize: 'vertical',
                    lineHeight: 1.5,
                    borderColor:
                      parsedPhones.validNumbers.length > 0
                        ? '#10b981'
                        : phonesInput.trim() && parsedPhones.invalidTokens.length > 0
                          ? '#ef4444'
                          : 'var(--adm-border-strong, #cbd5e1)',
                  }}
                />

                {/* Automatic Client-Duplicate Warning */}
                {parsedPhones.clientDuplicates.length > 0 && (
                  <div
                    style={{
                      marginTop: 8,
                      padding: '8px 12px',
                      borderRadius: 8,
                      background: 'var(--adm-soft-amber-bg, #fffbeb)',
                      border: '1px solid var(--adm-soft-amber-border, #fde68a)',
                      color: 'var(--adm-soft-amber-text, #b45309)',
                      fontSize: '0.79rem',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 7,
                      flexWrap: 'wrap',
                    }}
                  >
                    <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                    <span>
                      Already assigned to {companyTitle} ({parsedPhones.clientDuplicates.length}):{' '}
                      <strong style={{ fontFamily: 'monospace' }}>
                        {parsedPhones.clientDuplicates.slice(0, 5).map((d) => `+91 ${d}`).join(', ')}
                        {parsedPhones.clientDuplicates.length > 5
                          ? ` +${parsedPhones.clientDuplicates.length - 5} more`
                          : ''}
                      </strong>{' '}
                      — duplicates will be skipped automatically.
                    </span>
                  </div>
                )}

                {/* Invalid Token Notice */}
                {parsedPhones.invalidTokens.length > 0 && (
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: '0.76rem',
                      color: '#ef4444',
                      fontWeight: 700,
                    }}
                  >
                    Ignored {parsedPhones.invalidTokens.length} incomplete/invalid entry
                    {parsedPhones.invalidTokens.length === 1 ? '' : 'ies'} (
                    {parsedPhones.invalidTokens.slice(0, 4).join(', ')}) — Indian mobile numbers must be 10 digits starting with 6, 7, 8, or 9.
                  </div>
                )}
              </div>

              {/* Submit Footer */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  flexWrap: 'wrap',
                  marginTop: 16,
                  paddingTop: 14,
                  borderTop: '1px solid var(--adm-border, #e2e8f0)',
                }}
              >
                <div style={{ fontSize: '0.79rem', color: 'var(--adm-text-muted, #64748b)', fontWeight: 600 }}>
                  {isSingleLineActive
                    ? 'Tip: Press Enter to send immediately • Shift+Enter for new line • Paste bulk list anytime'
                    : 'Tip: Press Ctrl+Enter or click "+ Send Lead(s) Now" to dispatch all valid numbers'}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button type="button" className="sales-btn-secondary" onClick={handleBack}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!canDispatch}
                    className="sales-btn-primary"
                    style={{
                      background: canDispatch
                        ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)'
                        : '#94a3b8',
                      borderColor: canDispatch ? '#059669' : '#94a3b8',
                      cursor: canDispatch ? 'pointer' : 'not-allowed',
                      padding: '11px 24px',
                      fontWeight: 800,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <Send size={15} />
                    {isSubmitting
                      ? 'Sending Lead(s)...'
                      : parsedPhones.validNumbers.length > 1
                        ? `+ Send ${parsedPhones.validNumbers.length} Leads Now`
                        : '+ Send Lead(s) Now'}
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* Live Assigned Leads Section Right Below Dispatch Card */}
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
                Assigned Buyer Mobile Leads — {companyTitle} ({totalAssigned})
              </span>
            </div>
            {totalAssigned > 0 && (
              <button
                type="button"
                onClick={() => switchMode('history')}
                className="desk-action-btn"
                style={{ fontSize: '0.78rem', fontWeight: 800 }}
              >
                Open Full History &amp; Filters →
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
          <div className="desk-kpi-grid" style={{ marginBottom: 16 }}>
            <div className="desk-kpi-card">
              <div className="desk-kpi-label">TOTAL ASSIGNED TILL YET</div>
              <div className="desk-kpi-val text-indigo">{totalAssigned}</div>
              <div className="desk-kpi-sub">Verified +91 numbers delivered to {companyTitle}</div>
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
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div className="desk-search-wrap" style={{ margin: 0, minWidth: 230 }}>
                <Search size={15} className="desk-search-icon" />
                <input
                  type="text"
                  className="desk-search-input"
                  placeholder="Search +91 mobile number..."
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
                <Plus size={15} strokeWidth={2.5} /> + Send Lead(s) Now
              </button>
            </div>
          </div>

          {renderAssignedLeadsTable(filteredHistory, `All Assigned Leads — ${companyTitle}`, 15)}
        </>
      )}
    </div>
  );
}
