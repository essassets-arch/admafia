import React, { useState } from 'react';
import { SmartTable } from '../components/SmartTabulator';
import { evaluateCustomerProfileCompletion } from '../utils/profileCompletion';

function downloadFollowUpsCsv(rows, filenamePrefix = 'followups-queue') {
  if (typeof window === 'undefined' || !Array.isArray(rows) || rows.length === 0) return;
  const escapeCsv = (val) => {
    const s = String(val ?? '').replace(/\r?\n|\r/g, ' ').replace(/\s+/g, ' ').trim();
    if (s.includes(',') || s.includes('"') || s.includes(';')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const headers = ['Phone Number', 'Queue Status', 'Security Status', 'Read Status', 'Scheduled At', 'Company'];
  const lines = [
    headers.map(escapeCsv).join(','),
    ...rows.map((r) => [r.phone, r.queueStatus, r.securityStatus, r.readStatus, r.scheduledAt, r.company].map(escapeCsv).join(',')),
  ];
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filenamePrefix}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Helpers
function formatMinimalMaskedPhone(phone, maskedPhone, isUnmasked = true) {
  if (!isUnmasked) {
    if (maskedPhone && /[*•X]/i.test(String(maskedPhone))) {
      return maskedPhone;
    }
    const maskedDigits = String(phone || '').replace(/\D/g, '').slice(-10);
    if (maskedDigits.length === 10) {
      return `+91 ${maskedDigits.slice(0, 2)}••••••${maskedDigits.slice(-2)}`;
    }
    return maskedPhone || '+91 98••••••23';
  }
  if (phone) {
    const digits = String(phone).replace(/\D/g, '').slice(-10);
    return digits.length === 10 ? `+91 ${digits}` : phone;
  }
  return maskedPhone || '+91 9820011223';
}

function formatMinimalDateTime(createdAt) {
  if (createdAt && (createdAt.includes('pm') || createdAt.includes('am') || createdAt.includes('PM') || createdAt.includes('AM'))) {
    return createdAt;
  }
  if (createdAt) {
    const d = new Date(createdAt);
    if (!isNaN(d.getTime())) {
      return d.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    }
    return createdAt;
  }
  return 'Today, 01:57 pm';
}

export default function FollowUpsQueue({
  leads = [],
  customer = {},
  walletBalance = 0,
  onUpdateLead,
  onOpenAddFunds,
  onOpenCompleteRegistration,
}) {
  const [search, setSearch] = useState('');
  const [viewFilter, setViewFilter] = useState('active'); // 'active' | 'dropped'
  const [unmaskedMap, setUnmaskedMap] = useState({});

  const currencySymbol = customer?.currencySymbol || (String(customer?.currency || 'INR').toUpperCase() === 'USD' ? '$' : '₹');

  const isPaymentDone = customer.paymentStatus === 'paid' || customer.payment_status === 'paid' || (walletBalance > 0);
  const profEval = evaluateCustomerProfileCompletion(customer);
  const isProfileDone = profEval.isComplete;
  const isFullyComplete = isPaymentDone && isProfileDone;

  // Follow-up leads
  const followUpLeads = leads.filter(
    (l) => (l.status === 'In Follow-up' || l.status === 'Callback') && l.status !== 'Dropped'
  );

  // Dropped leads
  const droppedLeads = leads.filter((l) => l.status === 'Dropped');

  const togglePhoneReveal = (id) => {
    setUnmaskedMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Move back to active leads if needed
  const handleMoveBackToLeads = (leadId) => {
    if (onUpdateLead) {
      onUpdateLead(leadId, { status: 'New' });
    }
  };

  // Restore dropped lead to Follow-ups queue
  const handleRestoreToFollowUp = (leadId) => {
    if (onUpdateLead) {
      onUpdateLead(leadId, { status: 'In Follow-up' });
    }
  };

  // Restore dropped lead to Active Pipeline
  const handleRestoreToPipeline = (leadId) => {
    if (onUpdateLead) {
      onUpdateLead(leadId, { status: 'New' });
    }
  };

  // Toggle Read
  const handleToggleRead = (lead) => {
    if (onUpdateLead && !lead.read) {
      onUpdateLead(lead.id, { read: true });
    }
  };

  // Drop lead
  const handleDrop = (leadId) => {
    if (onUpdateLead) {
      onUpdateLead(leadId, { status: 'Dropped' });
    }
  };

  const currentPool = viewFilter === 'dropped' ? droppedLeads : followUpLeads;

  // Search filter
  const filteredLeads = currentPool.filter((item) => {
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      const matchPhone = (item.phone || '').includes(q) || (item.maskedPhone || '').includes(q);
      const matchDate = (item.createdAt || '').toLowerCase().includes(q);
      if (!matchPhone && !matchDate) return false;
    }
    return true;
  });

  const handleExportCsv = () => {
    if (filteredLeads.length === 0) return;
    const csvRows = filteredLeads.map((item) => ({
      phone: formatMinimalMaskedPhone(item.phone, item.maskedPhone),
      queueStatus: item.status === 'Dropped' ? 'Dropped Lead' : 'In Callback Queue',
      securityStatus: item.status === 'Dropped' ? 'Dropped Lead' : isFullyComplete ? 'Active Lead' : isPaymentDone ? 'Step 2 Required' : 'Step 1 Required',
      readStatus: item.read ? 'Read' : 'Unread',
      scheduledAt: formatMinimalDateTime(item.createdAt),
      company: item.company || item.assignedCompany || customer?.companyName || customer?.name || '',
    }));
    downloadFollowUpsCsv(csvRows, viewFilter === 'dropped' ? 'dropped-followups' : 'followups-queue');
  };

  return (
    <div className="portal-followups-feed-page followups-page-wrap">
      {/* 1. Breadcrumbs */}
      <div className="overview-top-breadcrumb-bar">
        <div className="breadcrumb-line">
          <span className="crumb-root">Lead Hub</span>
          <span className="crumb-slash">/</span>
          <span className="crumb-current">Follow-ups Queue</span>
        </div>
        <div className="live-pipeline-active-badge">
          <span className="pulse-emerald-dot"></span> Active Callback Queue
        </div>
      </div>

      {/* 2. Header Bar with Count & Top-Right Actions */}
      <div className="lead-pipeline-header-cluster">
        <div>
          <div className="lead-header-title-row">
            <h1>Follow-ups Queue</h1>
            {viewFilter === 'dropped' ? (
              <span className="lead-count-badge-top" style={{ background: '#fef2f2', color: '#b91c1c', borderColor: '#fecaca' }}>
                {droppedLeads.length} Dropped
              </span>
            ) : (
              <span className="lead-count-badge-top" style={{ background: '#fdf2f8', color: '#be185d', borderColor: '#fbcfe8' }}>
                {followUpLeads.length} In Queue
              </span>
            )}
          </div>
          <p className="lead-header-desc">
            Leads scheduled for follow-up callback. Call, message on WhatsApp, or update status.
          </p>
        </div>

        <div className="lead-header-actions-right">
          {/* GROWTH WALLET Card */}
          <div
            className="header-ad-wallet-card"
            title="Growth Wallet Balance"
            onClick={onOpenAddFunds}
          >
            <div className="header-wallet-icon-box">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
                <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
              </svg>
            </div>
            <div className="header-wallet-text-col">
              <span className="header-wallet-tag">GROWTH WALLET</span>
              <strong className="header-wallet-val">{currencySymbol}{walletBalance.toFixed(0)}</strong>
            </div>
            <button
              type="button"
              className="btn-header-topup"
              onClick={(e) => {
                e.stopPropagation();
                onOpenAddFunds && onOpenAddFunds();
              }}
            >
              + Top Up
            </button>
          </div>

          {/* Complete Registration Action Button (removed once payment and profile details are submitted) */}
          {!isFullyComplete && onOpenCompleteRegistration && (
            <button
              type="button"
              className="btn-complete-reg-action"
              onClick={onOpenCompleteRegistration}
              title="Complete business profile registration"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              <span>{isPaymentDone ? 'Complete Profile' : 'Complete Registration'}</span>
              <span className="action-req-pill">[ACTION REQUIRED]</span>
            </button>
          )}
        </div>
      </div>

      {/* 3. Search & Tabs Bar */}
      <div className="list-controls-bar">
        <div className="list-search-wrap">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className="list-search-input"
            placeholder={viewFilter === 'dropped' ? "Search dropped leads by phone or date..." : "Search follow-up leads by phone or date..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="btn-search-clear"
              onClick={() => setSearch('')}
            >
              ✕
            </button>
          )}
        </div>

        <div className="list-controls-actions-row">
          <div className="list-date-tabs">
            <button
              type="button"
              className={`list-tab-pill ${viewFilter === 'active' ? 'active' : ''}`}
              onClick={() => setViewFilter('active')}
            >
              Active Queue ({followUpLeads.length})
            </button>
            <button
              type="button"
              className={`list-tab-pill dropped-tab ${viewFilter === 'dropped' ? 'active' : ''}`}
              onClick={() => setViewFilter('dropped')}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
                <span>Dropped ({droppedLeads.length})</span>
              </span>
            </button>
          </div>

          <button
            type="button"
            className="btn-leads-csv-export"
            onClick={handleExportCsv}
            disabled={filteredLeads.length === 0}
            title={filteredLeads.length === 0 ? 'No follow-up leads to export' : `Export ${filteredLeads.length} lead(s) to CSV`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Export CSV ({filteredLeads.length})</span>
          </button>
        </div>
      </div>

      {/* 4. Tabulator Data Grid for Follow-ups Queue */}
      <SmartTable
        title="Follow-ups Queue"
        defaultPageSize={15}
        exportFilename="followups-queue"
      >
        <table className="cp-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th>Prospect Mobile</th>
              <th>Queue Status</th>
              <th>Security / Gate Status</th>
              <th>Received Time</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredLeads.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <div className="proper-list-empty-state" style={{ padding: '32px 20px' }}>
                    <div className="empty-icon">
                      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.8">
                        {viewFilter === 'dropped' ? (
                          <>
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                          </>
                        ) : (
                          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                        )}
                      </svg>
                    </div>
                    <h3>{viewFilter === 'dropped' ? 'No dropped leads' : 'No follow-up leads in queue'}</h3>
                    <p>
                      {viewFilter === 'dropped'
                        ? 'There are currently no dropped leads.'
                        : 'Click "In Follow-up" on any lead in the Lead Pipeline to move it here.'}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredLeads.map((item, idx) => {
                const hasDialablePhone = Boolean(item.phone && !/[*•X]/i.test(String(item.phone)));
                const cleanDigits = String(item.phone || '').replace(/[^\d]/g, '');
                const waPhone = cleanDigits.length === 10 ? `91${cleanDigits}` : cleanDigits;
                const targetOrg = item.company || item.assignedCompany || customer?.companyName || customer?.name || 'Ad Mafia';
                const waGreeting = `https://wa.me/${waPhone}?text=Hello,%20thank%20you%20for%20your%20inquiry%20with%20${encodeURIComponent(targetOrg)}.`;
                const isUnmasked =
                  unmaskedMap[item.id] !== undefined
                    ? Boolean(unmaskedMap[item.id])
                    : item.unmasked !== undefined
                    ? Boolean(item.unmasked)
                    : hasDialablePhone;
                const displayPhone = formatMinimalMaskedPhone(item.phone, item.maskedPhone, isUnmasked);
                const displayTime = formatMinimalDateTime(item.createdAt);
                const canContact = isUnmasked && hasDialablePhone;
                const btnCompact = { height: 30, padding: '0 10px', fontSize: '0.76rem', borderRadius: 7 };

                return (
                  <tr
                    key={item.id || `fup_lead_${idx}`}
                    style={!item.read ? { background: '#fbfdff' } : undefined}
                  >
                    {/* Col 1: Prospect Mobile */}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <div
                          className="phone-icon-circle fup"
                          style={{ width: 34, height: 34, borderRadius: 10, position: 'relative' }}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                          </svg>
                          {!item.read && (
                            <span
                              aria-hidden="true"
                              style={{
                                position: 'absolute',
                                top: -2,
                                right: -2,
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                background: '#2563eb',
                                border: '1.5px solid #ffffff',
                              }}
                            />
                          )}
                        </div>

                        <div className="phone-text-wrap" style={{ gap: 3 }}>
                          <div className="phone-digits-line" style={{ flexWrap: 'wrap', gap: 6 }}>
                            <span className="phone-strong" style={{ fontSize: '0.94rem' }}>
                              {displayPhone}
                            </span>
                            {item.unmasked === false && hasDialablePhone && (
                              <button
                                type="button"
                                className="btn-phone-eye-toggle"
                                onClick={() => togglePhoneReveal(item.id)}
                                title={isUnmasked ? 'Hide phone number' : 'Reveal phone number'}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                  <circle cx="12" cy="12" r="3" />
                                </svg>
                              </button>
                            )}
                            {!item.read && <span className="unread-micro-tag">NEW</span>}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Col 2: Queue Status */}
                    <td>
                      {item.status === 'Dropped' ? (
                        <span
                          className="proper-step-badge"
                          style={{ background: '#fef2f2', color: '#b91c1c', borderColor: '#fecaca' }}
                        >
                          Dropped Lead
                        </span>
                      ) : (
                        <span
                          className="proper-step-badge"
                          style={{ background: '#fdf2f8', color: '#be185d', borderColor: '#fbcfe8' }}
                        >
                          In Callback Queue
                        </span>
                      )}
                    </td>

                    {/* Col 3: Security / Gate Status */}
                    <td>
                      {item.status === 'Dropped' ? (
                        <span className="proper-step-badge" style={{ background: '#fef2f2', color: '#dc2626', borderColor: '#fecaca' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="15" y1="9" x2="9" y2="15" />
                            <line x1="9" y1="9" x2="15" y2="15" />
                          </svg>
                          <span>Dropped Lead</span>
                        </span>
                      ) : isFullyComplete ? (
                        <span className="proper-step-badge" style={{ background: '#ecfdf5', color: '#059669', borderColor: '#a7f3d0' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          <span>Active Lead ✓</span>
                        </span>
                      ) : isPaymentDone ? (
                        <span className="proper-step-badge" style={{ background: '#eff6ff', color: '#2563eb', borderColor: '#bfdbfe' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2563eb' }} />
                          <span>Step 2 Required</span>
                        </span>
                      ) : (
                        <span className="proper-step-badge">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2.5">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                          </svg>
                          <span>Step 1 Required</span>
                        </span>
                      )}
                    </td>

                    {/* Col 4: Received Time */}
                    <td>
                      <div className="time-display-wrap">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                        <span>{displayTime}</span>
                      </div>
                    </td>

                    {/* Col 5: Actions */}
                    <td style={{ textAlign: 'right' }}>
                      <div className="list-actions-group" style={{ gap: 6, justifyContent: 'flex-end' }}>
                        {/* 1. Call */}
                        {canContact ? (
                          <a
                            href={`tel:${item.phone}`}
                            className="btn-list-action call"
                            style={btnCompact}
                            title={`Call ${displayPhone}`}
                            onClick={() => handleToggleRead(item)}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                            </svg>
                            <span>Call</span>
                          </a>
                        ) : (
                          <button
                            type="button"
                            className="btn-list-action call"
                            disabled
                            style={{ ...btnCompact, opacity: 0.5, cursor: 'not-allowed' }}
                            title="Unlock prospect contact to initiate call"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                            <span>Call</span>
                          </button>
                        )}

                        {/* 2. Chat */}
                        {canContact ? (
                          <a
                            href={waGreeting}
                            target="_blank"
                            rel="noreferrer"
                            className="btn-list-action chat"
                            style={btnCompact}
                            title="Chat on WhatsApp"
                            onClick={() => handleToggleRead(item)}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                            </svg>
                            <span>Chat</span>
                          </a>
                        ) : (
                          <button
                            type="button"
                            className="btn-list-action chat"
                            disabled
                            style={{ ...btnCompact, opacity: 0.5, cursor: 'not-allowed' }}
                            title="Unlock prospect contact to chat on WhatsApp"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                            <span>Chat</span>
                          </button>
                        )}

                        {/* If Dropped, show Restore to Follow-up and To Pipeline; else Move to Leads + Mark Read + Drop */}
                        {item.status === 'Dropped' ? (
                          <>
                            <button
                              type="button"
                              className="btn-list-action restore"
                              style={btnCompact}
                              onClick={() => handleRestoreToFollowUp(item.id)}
                              title="Restore lead back to follow-ups queue"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                                <polyline points="1 4 1 10 7 10" />
                                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                              </svg>
                              <span>Restore</span>
                            </button>

                            <button
                              type="button"
                              className="btn-list-action followup"
                              style={btnCompact}
                              onClick={() => handleRestoreToPipeline(item.id)}
                              title="Restore lead and move to active Lead Pipeline"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                <polyline points="15 18 9 12 15 6" />
                              </svg>
                              <span>To Pipeline</span>
                            </button>
                          </>
                        ) : (
                          <>
                            {/* 3. Move back to active leads */}
                            <button
                              type="button"
                              className="btn-list-action followup in-fup"
                              style={btnCompact}
                              onClick={() => handleMoveBackToLeads(item.id)}
                              title="Move lead back to active Lead Pipeline"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                <polyline points="15 18 9 12 15 6" />
                              </svg>
                              <span>Move to Leads</span>
                            </button>

                            {/* 4. Read (Permanent: once read, stays read) */}
                            <button
                              type="button"
                              className={`btn-list-action read ${item.read ? 'is-read' : ''}`}
                              style={{
                                ...btnCompact,
                                ...(item.read ? { cursor: 'default', opacity: 0.85 } : {}),
                              }}
                              onClick={() => handleToggleRead(item)}
                              disabled={Boolean(item.read)}
                              title={item.read ? 'Lead Read' : 'Mark as Read'}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                {item.read ? (
                                  <polyline points="20 6 9 17 4 12" />
                                ) : (
                                  <>
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                    <circle cx="12" cy="12" r="3" />
                                  </>
                                )}
                              </svg>
                              <span>{item.read ? 'Read ✓' : 'Mark Read'}</span>
                            </button>

                            {/* 5. Drop */}
                            <button
                              type="button"
                              className="btn-list-action drop"
                              style={btnCompact}
                              onClick={() => handleDrop(item.id)}
                              title="Drop lead and remove from follow-ups"
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                <circle cx="8.5" cy="7" r="4" />
                                <line x1="23" y1="11" x2="17" y2="11" />
                              </svg>
                              <span>Drop</span>
                            </button>
                          </>
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
}
