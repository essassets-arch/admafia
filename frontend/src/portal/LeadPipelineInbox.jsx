import React, { useState } from 'react';

// Helpers
function formatMinimalMaskedPhone(phone, maskedPhone) {
  const digits = (phone || '').replace(/\D/g, '').slice(-10);
  if (digits) {
    return `+91 ${digits}`;
  }
  return phone || maskedPhone || '+91 8989898989';
}

function formatMinimalDateTime(createdAt) {
  if (!createdAt) {
    return new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  }
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

export default function LeadPipelineInbox({
  leads = [],
  customer,
  walletBalance = 0,
  dailyAdSpend = 300,
  onUpdateLead,
  onOpenScheduleFollowUp,
  onOpenAddFunds,
  onOpenAddLead,
  onOpenCompleteRegistration,
}) {
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('all'); // 'all' | 'today' | 'yesterday'
  const [unmaskedMap, setUnmaskedMap] = useState({});

  const isPaymentDone = customer.paymentStatus === 'paid' || customer.payment_status === 'paid' || (walletBalance > 0);
  const isProfileDone = customer.profileStatus === 'complete' || customer.profile_status === 'complete' || customer.kycPercent === 100;
  const isFullyComplete = isPaymentDone && isProfileDone;

  // Active leads: not in follow-up, not callback, not dropped
  const activeLeads = leads.filter(
    (l) => l.status !== 'In Follow-up' && l.status !== 'Callback' && l.status !== 'Dropped'
  );

  const togglePhoneReveal = (id) => {
    setUnmaskedMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Move lead to Follow-ups
  const handleMoveToFollowUp = (leadId) => {
    if (onUpdateLead) {
      onUpdateLead(leadId, { status: 'In Follow-up' });
    }
  };

  // Mark as Read (once read, stays read permanently; cannot be un-read)
  const handleMarkAsRead = (lead) => {
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

  // Filtered leads
  const filteredLeads = activeLeads.filter((item) => {
    // Date filter
    if (dateFilter === 'today') {
      const isToday = item.dateGroup === 'today' || (item.createdAt && item.createdAt.includes('Today'));
      if (!isToday) return false;
    } else if (dateFilter === 'yesterday') {
      const isYesterday = item.dateGroup === 'yesterday' || (item.createdAt && item.createdAt.includes('Yesterday'));
      if (!isYesterday) return false;
    }

    // Search query
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      const matchPhone = (item.phone || '').includes(q) || (item.maskedPhone || '').includes(q);
      const matchDate = (item.createdAt || '').toLowerCase().includes(q);
      if (!matchPhone && !matchDate) return false;
    }

    return true;
  });

  const todayCount = activeLeads.filter((l) => l.dateGroup === 'today' || (l.createdAt && l.createdAt.includes('Today'))).length;
  const yesterdayCount = activeLeads.filter((l) => l.dateGroup === 'yesterday' || (l.createdAt && l.createdAt.includes('Yesterday'))).length;

  return (
    <div className="portal-lead-feed-page">
      {/* 1. Breadcrumbs */}
      <div className="overview-top-breadcrumb-bar">
        <div className="breadcrumb-line">
          <span className="crumb-root">Lead Hub</span>
          <span className="crumb-slash">/</span>
          <span className="crumb-current">Inbound Lead Pipeline</span>
        </div>
        <div className="live-pipeline-active-badge">
          <span className="pulse-emerald-dot"></span> Live Pipeline Active
        </div>
      </div>

      {/* 2. Header Bar with Count & Top-Right Action Cluster */}
      <div className="lead-pipeline-header-cluster">
        <div>
          <div className="lead-header-title-row" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1>Lead Pipeline</h1>
            <span className="lead-count-badge-top">{activeLeads.length} Active Leads</span>
            {customer?.companyName && (
              <span style={{
                fontSize: '0.82rem',
                fontWeight: 700,
                color: '#1e40af',
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                padding: '3px 10px',
                borderRadius: '8px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px'
              }}>
                🏢 {customer.companyName}
              </span>
            )}
          </div>
          <p className="lead-header-desc">
            Streamlined list view of inbound buyer inquiries. Move to follow-ups, initiate direct calls, or connect via WhatsApp.
          </p>
        </div>

        <div className="lead-header-actions-right">
          {/* AD WALLET Card */}
          <div
            className="header-ad-wallet-card"
            title="Ad Wallet Balance"
            onClick={onOpenAddFunds}
          >
            <div className="header-wallet-icon-box">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
                <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
              </svg>
            </div>
            <div className="header-wallet-text-col">
              <span className="header-wallet-tag">AD WALLET</span>
              <strong className="header-wallet-val">₹{walletBalance.toFixed(0)}</strong>
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

          {/* Ingest Inbound Lead Button */}
          {onOpenAddLead && (
            <button
              type="button"
              className="btn-ingest-lead-action"
              onClick={onOpenAddLead}
              title="Ingest offline or direct buyer enquiry"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>+ Ingest Lead</span>
            </button>
          )}
        </div>
      </div>

      {/* 3. Search & Date Filter Bar */}
      <div className="list-controls-bar">
        <div className="list-search-wrap">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className="list-search-input"
            placeholder="Search by phone number or date..."
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

        <div className="list-date-tabs">
          <button
            type="button"
            className={`list-tab-pill ${dateFilter === 'all' ? 'active' : ''}`}
            onClick={() => setDateFilter('all')}
          >
            All ({activeLeads.length})
          </button>
          <button
            type="button"
            className={`list-tab-pill ${dateFilter === 'today' ? 'active' : ''}`}
            onClick={() => setDateFilter('today')}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <span>Today ({todayCount})</span>
            </span>
          </button>
          <button
            type="button"
            className={`list-tab-pill ${dateFilter === 'yesterday' ? 'active' : ''}`}
            onClick={() => setDateFilter('yesterday')}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              <span>Yesterday ({yesterdayCount})</span>
            </span>
          </button>
        </div>
      </div>

      {/* 4. Proper UI List View Card Container */}
      <div className="proper-list-view-card">
        {/* Table Header Row */}
        <div className="list-view-table-header">
          <div className="col-phone">PHONE NUMBER</div>
          <div className="col-status">SECURITY STATUS</div>
          <div className="col-time">RECEIVED AT</div>
          <div className="col-actions">QUICK ACTIONS</div>
        </div>

        {/* List Items */}
        <div className="list-view-items-stack">
          {filteredLeads.length === 0 ? (
            <div className="proper-list-empty-state">
              <div className="empty-icon">
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.8">
                  <circle cx="11" cy="11" r="8"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
              </div>
              <h3>No leads found</h3>
              <p>There are currently no active leads matching your filter.</p>
            </div>
          ) : (
            filteredLeads.map((item) => {
              const raw10 = (item.phone || item.name || '').replace(/\D/g, '').slice(-10);
              const waPhone = raw10.length === 10 ? `91${raw10}` : (item.phone || '');
              const targetCompany = item.company || item.assignedCompany || customer?.companyName || 'Growthline';
              const waGreeting = `https://wa.me/${waPhone}?text=Hello,%20thank%20you%20for%20your%20inquiry%20with%20${encodeURIComponent(targetCompany)}.`;
              const isUnmasked = unmaskedMap[item.id] !== undefined ? unmaskedMap[item.id] : (item.unmasked || false);
              const displayPhone = formatMinimalMaskedPhone(item.phone, item.maskedPhone, isUnmasked);
              const displayTime = formatMinimalDateTime(item.createdAt);

              return (
                <div
                  key={item.id}
                  className={`proper-list-row ${!item.read ? 'is-unread-row' : ''}`}
                >
                  {/* Col 1: Phone */}
                  <div className="col-phone">
                    <div className="phone-icon-circle">
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                      </svg>
                    </div>

                    <div className="phone-text-wrap">
                      <div className="phone-digits-line">
                        <span className="phone-strong">{displayPhone}</span>
                      </div>
                    </div>
                  </div>

                  {/* Col 2: Dynamic Security Status */}
                  <div className="col-status">
                    {isFullyComplete ? (
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
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                        </svg>
                        <span>Step 1 Required</span>
                      </span>
                    )}
                  </div>

                  {/* Col 3: Time */}
                  <div className="col-time">
                    <div className="time-display-wrap">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12 6 12 12 16 14"/>
                      </svg>
                      <span>{displayTime}</span>
                    </div>
                  </div>

                  {/* Col 4: Actions Row */}
                  <div className="col-actions">
                    <div className="list-actions-group">
                      {/* 1. Call */}
                      <a
                        href={`tel:${item.phone}`}
                        className="btn-list-action call"
                        title={`Call ${displayPhone}`}
                        onClick={() => handleMarkAsRead(item)}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                        </svg>
                        <span>Call</span>
                      </a>

                      {/* 2. Chat */}
                      <a
                        href={waGreeting}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-list-action chat"
                        title="Chat on WhatsApp"
                        onClick={() => handleMarkAsRead(item)}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
                        </svg>
                        <span>Chat</span>
                      </a>

                      {/* 3. In Follow-up */}
                      <button
                        type="button"
                        className="btn-list-action followup"
                        onClick={() => handleMoveToFollowUp(item.id)}
                        title="Move lead to Follow-ups page"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                          <line x1="16" y1="2" x2="16" y2="6"/>
                          <line x1="8" y1="2" x2="8" y2="6"/>
                          <line x1="3" y1="10" x2="21" y2="10"/>
                        </svg>
                        <span>In Follow-up</span>
                      </button>

                      {/* 4. Read (Permanent: once read, stays read) */}
                      <button
                        type="button"
                        className={`btn-list-action read ${item.read ? 'is-read' : ''}`}
                        onClick={() => handleMarkAsRead(item)}
                        disabled={Boolean(item.read)}
                        title={item.read ? 'Lead Read' : 'Mark as Read'}
                        style={item.read ? { cursor: 'default', opacity: 0.85 } : undefined}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                          {item.read ? (
                            <polyline points="20 6 9 17 4 12" />
                          ) : (
                            <>
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                              <circle cx="12" cy="12" r="3"/>
                            </>
                          )}
                        </svg>
                        <span>{item.read ? 'Read ✓' : 'Mark Read'}</span>
                      </button>

                      {/* 5. Drop */}
                      <button
                        type="button"
                        className="btn-list-action drop"
                        onClick={() => handleDrop(item.id)}
                        title="Drop lead and remove from active pipeline"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                          <circle cx="8.5" cy="7" r="4"/>
                          <line x1="23" y1="11" x2="17" y2="11"/>
                        </svg>
                        <span>Drop</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
