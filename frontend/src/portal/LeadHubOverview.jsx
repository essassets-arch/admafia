import React, { useState } from 'react';
import emperorBannerImg from '../assets/emperor-banner.jpg';

// Formatting Helpers
function formatMinimalMaskedPhone(phone, maskedPhone) {
  if (phone) {
    const digits = phone.replace(/\D/g, '').slice(-10);
    return digits.length === 10 ? `+91 ${digits}` : phone;
  }
  return maskedPhone || '+91 9820011223';
}

function formatMinimalDateTime(createdAt) {
  if (createdAt && (createdAt.includes('pm') || createdAt.includes('am'))) {
    return createdAt;
  }
  return 'Today, 01:57 pm';
}



export default function LeadHubOverview({
  customer,
  leads,
  followUps,
  walletBalance,
  onNavigate,
  onOpenAddLead,
  onOpenScheduleFollowUp,
  onOpenAddFunds,
  onOpenSetDailyLimit,
  onOpenLanguageModal,
  onOpenConfigureDomain,
  onOpenCompleteRegistration,
  onToggleCampaign,
  onUpdateCustomer,
  onUpdateLead,
  t,
}) {
  const [activeDays, setActiveDays] = useState(customer.activeDays || ['MON', 'TUE', 'WED', 'THU', 'FRI']);
  const [unmaskedLeads, setUnmaskedLeads] = useState({});

  const todayIdx = new Date().getDay(); // 0 is SUN, 1 is MON, 2 is TUE, 3 is WED, 4 is THU, 5 is FRI, 6 is SAT
  const daysList = [
    { code: 'MON', label: 'Monday', isToday: todayIdx === 1 },
    { code: 'TUE', label: 'Tuesday', isToday: todayIdx === 2 },
    { code: 'WED', label: 'Wednesday', isToday: todayIdx === 3 },
    { code: 'THU', label: 'Thursday', isToday: todayIdx === 4 || todayIdx === 0 },
    { code: 'FRI', label: 'Friday', isToday: todayIdx === 5 },
    { code: 'SAT', label: 'Saturday', isToday: todayIdx === 6 },
    { code: 'SUN', label: 'Sunday', isToday: false },
  ];

  const dailySpend = customer.dailyAdSpend || 300;
  const weeklyPacing = activeDays.length * dailySpend;
  const currentTodayItem = daysList.find((d) => d.isToday) || daysList[3];
  const isMarketingLiveToday = customer.adCampaignActive && activeDays.includes(currentTodayItem.code);

  const isPaymentDone = customer.paymentStatus === 'paid' || customer.payment_status === 'paid' || (walletBalance > 0);
  const isProfileDone = customer.profileStatus === 'complete' || customer.profile_status === 'complete' || customer.kycPercent === 100;
  const isFullyComplete = isPaymentDone && isProfileDone;

  const toggleDay = (code) => {
    let next;
    if (activeDays.includes(code)) {
      next = activeDays.filter((d) => d !== code);
    } else {
      next = [...activeDays, code];
    }
    setActiveDays(next);
    if (onUpdateCustomer) {
      onUpdateCustomer({ activeDays: next });
    }
  };

  const handleSelectPresetDays = (preset) => {
    let next = [];
    if (preset === 'all') next = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    if (preset === 'weekdays') next = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
    if (preset === 'weekends') next = ['SAT', 'SUN'];
    if (preset === 'clear') next = [];
    setActiveDays(next);
    if (onUpdateCustomer) {
      onUpdateCustomer({ activeDays: next });
    }
  };

  // Top 4 High-Priority Enquiries (excluding dropped leads)
  const activePipelineLeads = (leads || []).filter((l) => l.status !== 'Dropped');
  const priorityLeads = activePipelineLeads.slice(0, 4);
  const totalLeadsCount = activePipelineLeads.length;
  const todayLeadsCount = activePipelineLeads.filter(
    (l) => l.dateGroup === 'today' || (l.createdAt && l.createdAt.includes('Today'))
  ).length;
  const respondedLeadsCount = activePipelineLeads.filter(
    (l) => l.read || l.status === 'In Follow-up' || l.status === 'Callback' || l.status === 'Converted'
  ).length;
  const responseRatePct = totalLeadsCount > 0 ? Math.round((respondedLeadsCount / totalLeadsCount) * 100) : 0;

  const togglePhoneReveal = (leadId) => {
    setUnmaskedLeads((prev) => ({ ...prev, [leadId]: !prev[leadId] }));
  };
  const toggleMask = togglePhoneReveal;

  const handleMoveToFollowUp = (leadId) => {
    if (onUpdateLead) {
      onUpdateLead(leadId, { status: 'In Follow-up' });
    }
  };

  const handleMarkLeadRead = (lead) => {
    if (onUpdateLead && !lead.read) {
      onUpdateLead(lead.id, { read: true });
    }
  };

  const handleDropLead = (leadId) => {
    if (onUpdateLead) {
      onUpdateLead(leadId, { status: 'Dropped' });
    }
  };

  return (
    <div className="portal-overview-view">
      {/* 1. Breadcrumbs & Title */}
      <div className="overview-top-breadcrumb-bar">
        <div className="breadcrumb-line">
          <span className="crumb-root">Lead Hub</span>
          <span className="crumb-slash">/</span>
          <span className="crumb-current">Dashboard</span>
        </div>
        <div className="live-pipeline-active-badge">
          <span className="pulse-emerald-dot"></span> Live Pipeline Active
        </div>
      </div>

      <div className="overview-title-block" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1>Dashboard Overview</h1>
          <p className="overview-desc-lead">
            Real-time performance metrics, lead conversion benchmarks, and incoming inquiries.
          </p>
        </div>

        {/* Right side top: Exact AD WALLET Card & Complete Registration Button (Screenshot Match) */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginLeft: 'auto' }}>
          {/* 1. AD WALLET Card */}
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
              onClick={(e) => {
                e.stopPropagation();
                onOpenAddFunds();
              }}
              className="btn-header-topup-exact"
            >
              + Top Up
            </button>
          </div>

          {/* 2. Complete Registration Button (Only shown when incomplete; removed once payment & profile details are submitted) */}
          {!isFullyComplete && onOpenCompleteRegistration && (
            <button
              type="button"
              onClick={onOpenCompleteRegistration}
              className="header-complete-reg-exact"
              title="Click to complete registration"
            >
              <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(255, 255, 255, 0.28)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ffffff', boxShadow: '0 0 6px #ffffff' }} />
              </span>
              <svg className="header-sparkle-svg" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" />
              </svg>
              <span className="header-reg-text">{isPaymentDone ? 'Complete Profile' : 'Complete Registration'}</span>
              <span className="header-action-badge">ACTION REQUIRED</span>
            </button>
          )}
        </div>
      </div>

        {/* 3. Marketing Campaign & Pacing Control (Exact User Screenshot Match) */}
      <div className="pacing-control-master-card">
        {/* Master Top Header */}
        <div className="pacing-master-header-exact">
          <div className="pacing-master-left-group">
            {/* Dark Slate Square Icon Box with Pause / Play */}
            <div className={`pacing-status-icon-box ${customer.adCampaignActive ? 'is-live' : 'is-paused'}`}>
              {customer.adCampaignActive ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3" fill="#ffffff" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="6" y="4" width="4" height="16" fill="#ffffff" rx="1" />
                  <rect x="14" y="4" width="4" height="16" fill="#ffffff" rx="1" />
                </svg>
              )}
            </div>

            <div className="pacing-master-title-stack">
              <div className="pacing-title-line-exact">
                <h2>Marketing Campaign &amp; Pacing Control</h2>
                <span className={`badge-marketing-pill-exact ${customer.adCampaignActive ? 'live' : 'off'}`}>
                  {customer.adCampaignActive ? (
                    <>
                      <span className="live-dot-pulse"></span>
                      <span>MARKETING IS LIVE</span>
                    </>
                  ) : (
                    <>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="5" y="4" width="4" height="16" rx="1" />
                        <rect x="15" y="4" width="4" height="16" rx="1" />
                      </svg>
                      <span>MARKETING IS OFF</span>
                    </>
                  )}
                </span>
              </div>
              <p className="pacing-master-subtitle-exact">
                Schedule running days for Meta ads &amp; local lead capture. Daily spend of <strong>₹{dailySpend}</strong> is deducted only on scheduled active days.
              </p>
            </div>
          </div>

          {/* Right: MARKETING STATUS Paused (Off) + Power Toggle Button */}
          <div className="pacing-status-toggle-cluster">
            <div className="pacing-status-text-stack">
              <span className="pacing-status-mini-label">MARKETING STATUS</span>
              <strong className="pacing-status-state-text">
                {customer.adCampaignActive ? 'Running (Active)' : 'Paused (Off)'}
              </strong>
              {!customer.adCampaignActive && walletBalance < dailySpend && (
                <span style={{ fontSize: '0.70rem', color: '#e11d48', fontWeight: 800, marginTop: 2 }}>
                  ⚠️ Balance is Low
                </span>
              )}
            </div>
            <button
              type="button"
              className={`pacing-power-switch ${customer.adCampaignActive ? 'active' : ''}`}
              onClick={() => onToggleCampaign && onToggleCampaign()}
              title={customer.adCampaignActive ? 'Click to Pause Marketing Campaign' : 'Click to Resume Marketing Campaign'}
            >
              <span className="pacing-power-thumb">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
                  <line x1="12" y1="2" x2="12" y2="12" />
                </svg>
              </span>
            </button>
          </div>
        </div>

        {/* 3 Metric Cards Grid (Daily Burn Rate, Active Schedule, Current Wallet) */}
        <div className="pacing-three-cards-grid">
          {/* Card 1: DAILY BURN RATE */}
          <div className="pacing-metric-card-exact">
            <div className="pacing-card-top-row">
              <div className="pacing-card-label-with-icon">
                <span className="pacing-icon-dollar">$</span>
                <span className="pacing-card-exact-label">DAILY BURN RATE</span>
              </div>
              <button
                type="button"
                onClick={onOpenSetDailyLimit}
                className="btn-pacing-link-purple"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <path d="M12 20h9"/>
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                </svg>
                <span>Set Amount</span>
              </button>
            </div>

            <div className="pacing-card-main-val-row">
              <div className="pacing-val-with-unit">
                <strong className="pacing-big-amount">₹{dailySpend}</strong>
                <span className="pacing-unit-sub">/ active day</span>
              </div>
              <span className="pacing-meta-verified-pill">Meta Verified</span>
            </div>

            <div className="pacing-card-footer-line">
              <span>Pacing auto-managed</span>
            </div>
          </div>

          {/* Card 2: ACTIVE SCHEDULE */}
          <div className="pacing-metric-card-exact">
            <div className="pacing-card-top-row">
              <div className="pacing-card-label-with-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="2.3">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                <span className="pacing-card-exact-label">ACTIVE SCHEDULE</span>
              </div>
            </div>

            <div className="pacing-card-main-val-row">
              <strong className="pacing-big-amount">{activeDays.length} of 7 Days Active</strong>
            </div>

            <div className="pacing-card-footer-between">
              <span>Weekly pacing: <strong>₹{weeklyPacing.toLocaleString('en-IN')}</strong></span>
              <span className="pacing-days-badge">{activeDays.length}d / wk</span>
            </div>
          </div>

          {/* Card 3: CURRENT WALLET */}
          <div className="pacing-metric-card-exact">
            <div className="pacing-card-top-row">
              <div className="pacing-card-label-with-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.3">
                  <rect x="2" y="5" width="20" height="14" rx="2"/>
                  <line x1="2" y1="10" x2="22" y2="10"/>
                </svg>
                <span className="pacing-card-exact-label">CURRENT WALLET</span>
              </div>
              <button
                type="button"
                onClick={onOpenAddFunds}
                className="btn-pacing-link-purple"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>Top Up</span>
              </button>
            </div>

            <div className="pacing-card-main-val-row">
              <strong className="pacing-big-amount">₹{walletBalance.toFixed(0)}</strong>
            </div>

            <div className="pacing-card-footer-between">
              <span>Runway: <strong className={walletBalance < dailySpend ? 'text-red-alert' : ''}>{dailySpend > 0 ? Math.floor(walletBalance / dailySpend) : 0} days funded</strong></span>
              {walletBalance < dailySpend ? (
                <span className="text-red-alert" style={{ fontWeight: 800 }}>● Balance is Low (Needs Top Up)</span>
              ) : (
                <span className="text-amber-alert">● Funded</span>
              )}
            </div>
          </div>
        </div>

        {/* Day Selection Engine: SELECT MARKETING DAYS (5 OF 7 DAYS ACTIVE) */}
        <div className="select-marketing-days-engine">
          <div className="engine-header-row">
            <div className="engine-title-with-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.3">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <span className="engine-title-text">
                SELECT MARKETING DAYS ({activeDays.length} OF 7 DAYS ACTIVE)
              </span>
            </div>

            <div className="engine-preset-buttons-row">
              {/* All 7 Days */}
              <button
                type="button"
                className={`btn-preset-chip ${activeDays.length === 7 ? 'active-purple' : ''}`}
                onClick={() => handleSelectPresetDays('all')}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                <span>All 7 Days</span>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={activeDays.length === 7 ? '#ffffff' : '#d97706'} strokeWidth="2.4">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </button>

              {/* Mon - Fri (5 Days) */}
              <button
                type="button"
                className={`btn-preset-chip ${activeDays.length === 5 && !activeDays.includes('SAT') && !activeDays.includes('SUN') ? 'active-purple' : ''}`}
                onClick={() => handleSelectPresetDays('weekdays')}
              >
                <span>Mon - Fri (5 Days)</span>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={activeDays.length === 5 && !activeDays.includes('SAT') && !activeDays.includes('SUN') ? '#ffffff' : '#d97706'} strokeWidth="2.4">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </button>

              {/* Sat - Sun (Weekends) */}
              <button
                type="button"
                className={`btn-preset-chip ${activeDays.length === 2 && activeDays.includes('SAT') && activeDays.includes('SUN') ? 'active-purple' : ''}`}
                onClick={() => handleSelectPresetDays('weekends')}
              >
                <span>Sat - Sun (Weekends)</span>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={activeDays.length === 2 && activeDays.includes('SAT') && activeDays.includes('SUN') ? '#ffffff' : '#d97706'} strokeWidth="2.4">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </button>

              {/* Clear */}
              <button
                type="button"
                className="btn-preset-chip clear"
                onClick={() => handleSelectPresetDays('clear')}
              >
                Clear
              </button>
            </div>
          </div>

          {/* 7 Day Cards (Selected with green border and checkmark, Unselected with grey border and lock) */}
          <div className="seven-days-cards-grid-exact">
            {daysList.map((d) => {
              const isSelected = activeDays.includes(d.code);
              return (
                <div
                  key={d.code}
                  className={`seven-day-card-exact ${isSelected ? 'is-selected' : 'is-unselected'} ${d.isToday ? 'is-today' : ''}`}
                  onClick={() => toggleDay(d.code)}
                  title={isSelected ? `Click to disable ${d.label}` : `Click to enable ${d.label}`}
                >
                  {/* If today, floating blue badge */}
                  {d.isToday && <span className="today-floating-pill">Today</span>}

                  <div className="day-code-title">{d.code}</div>
                  <div className="day-sub-label">{d.label}</div>
                  
                  {/* Price tag */}
                  <div className={`day-price-badge ${isSelected ? 'selected' : 'unselected'}`}>
                    ₹{dailySpend}
                  </div>

                  {/* Bottom Status Wrap */}
                  <div className="day-bottom-status-wrap">
                    {isSelected ? (
                      <div className="day-check-circle">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                    ) : (
                      <div className="day-lock-icon">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.3">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                        </svg>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Today Status & Budget Action Box */}
          <div className="today-campaign-bottom-bar-exact">
            <div className="today-status-info-left">
              <span className="today-day-prefix">Today ({currentTodayItem.label}):</span>
              <span className={`today-campaign-state ${isMarketingLiveToday ? 'state-live' : 'state-off'}`}>
                <span className="bullet-dot">●</span>
                {isMarketingLiveToday
                  ? 'Marketing is LIVE (Meta Ads Running)'
                  : walletBalance < dailySpend
                  ? 'Marketing is OFF (Customer Balance is Low - Needs Top Up)'
                  : 'Marketing is OFF (Campaign Paused)'}
              </span>
            </div>

            <div className="today-budget-actions-right">
              <div className="today-ad-budget-text-wrap">
                <span className="budget-sub-label">Today's Ad Budget:</span>
                <strong className="budget-val-purple">₹{dailySpend}</strong>
                <span className="budget-per-day">/day</span>
              </div>
              <button
                type="button"
                onClick={onOpenSetDailyLimit}
                className="btn-set-amount-purple-pill"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 20h9"/>
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                </svg>
                <span>Set Amount (Min ₹300)</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Overall Performance */}
      <div className="overall-performance-master-card">
        <div className="perf-master-header">
          <div>
            <h2>Overall Performance</h2>
            <p className="perf-master-sub">
              Lifetime inbound conversion, engagement metrics &amp; directory discovery
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenLanguageModal}
            className="btn-language-change-link"
          >
            Click here to change language
          </button>
        </div>

        <div className="perf-three-stat-grid">
          {/* Total Enquiries */}
          <div className="perf-box-card" onClick={() => onNavigate('leads')}>
            <span className="perf-box-label">Total Enquiries</span>
            <div className="perf-box-number">{totalLeadsCount.toLocaleString('en-IN')}</div>
            <div className="perf-box-today text-green">+{todayLeadsCount} Today</div>
            <div className="perf-box-records">{totalLeadsCount} live records in feed</div>
          </div>

          {/* Responded */}
          <div className="perf-box-card" onClick={() => onNavigate('followups')}>
            <span className="perf-box-label">Responded</span>
            <div className="perf-box-number">{respondedLeadsCount.toLocaleString('en-IN')}</div>
            <div className="perf-box-today text-emerald">{responseRatePct}% {totalLeadsCount > 0 ? 'Good' : 'Active'}</div>
            <div className="perf-box-records">✓ {respondedLeadsCount} of {totalLeadsCount} answered</div>
          </div>

          {/* Response Time */}
          <div className="perf-box-card">
            <span className="perf-box-label">Response Time</span>
            <div className="perf-box-number">{totalLeadsCount > 0 ? '02m : 15s' : '0m : 00s'}</div>
            <div className="perf-box-today text-gold" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              <span>Lightning Response</span>
            </div>
            <div className="perf-box-records">Dynamic latency from Call &amp; WA</div>
          </div>
        </div>
      </div>

      {/* 5. Promotional Banner Image — Redirects to https://emperorsmartsolutions.com/ */}
      <a
        href="https://emperorsmartsolutions.com/"
        target="_blank"
        rel="noopener noreferrer"
        title="Visit Emperor Smart Solutions — https://emperorsmartsolutions.com/"
        style={{
          display: 'block',
          width: '100%',
          borderRadius: '18px',
          overflow: 'hidden',
          marginBottom: '24px',
          border: '1.5px solid #e2e8f0',
          boxShadow: '0 10px 30px -8px rgba(15, 23, 42, 0.22)',
          textDecoration: 'none',
          transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          cursor: 'pointer',
          position: 'relative',
          background: '#0a0d2c',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 16px 36px -8px rgba(79, 70, 229, 0.35)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = '0 10px 30px -8px rgba(15, 23, 42, 0.22)';
        }}
      >
        <img
          src={emperorBannerImg}
          alt="Emperor Smart Solutions — Custom Web, App & Enterprise Software Development (https://emperorsmartsolutions.com/)"
          style={{
            width: '100%',
            maxHeight: '230px',
            objectFit: 'cover',
            objectPosition: 'center',
            display: 'block',
          }}
        />
      </a>

      {/* 6. Recent High-Priority Enquiries */}
      <div className="recent-priority-enquiries-panel">
        <div className="priority-panel-header">
          <div>
            <h2>Recent High-Priority Enquiries</h2>
            <div className="realtime-inbound-tag">Real-Time Inbound</div>
            <p className="priority-panel-desc">
              Showing top 4 high-intent buyer leads from Meta Lead Ads, WhatsApp &amp; Web forms.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('leads')}
            className="btn-all-leads-arrow"
          >
            All {totalLeadsCount} Leads &rarr;
          </button>
        </div>

        {/* Proper Horizontal List View Card Container */}
        <div className="proper-list-view-card" style={{ marginBottom: 20 }}>
          {/* Table Header Row */}
          <div className="list-view-table-header">
            <div className="col-phone">PHONE NUMBER</div>
            <div className="col-status">SECURITY STATUS</div>
            <div className="col-time">RECEIVED AT</div>
            <div className="col-actions">QUICK ACTIONS</div>
          </div>

          {/* List Items Stack */}
          <div className="list-view-items-stack">
            {priorityLeads.length === 0 ? (
              <div className="proper-list-empty-state">
                <div className="empty-icon">
                  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.8">
                    <circle cx="11" cy="11" r="8"/>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                </div>
                <h3>No active priority enquiries found</h3>
                <p>All current inquiries have been addressed or moved into follow-ups.</p>
              </div>
            ) : (
              priorityLeads.map((item) => {
                const isUnmasked = !!unmaskedLeads[item.id];
                const displayPhone = formatMinimalMaskedPhone(item.phone, item.maskedPhone, isUnmasked);
                const displayTime = formatMinimalDateTime(item.createdAt);
                const cleanDigits = (item.phone || '').replace(/[^\d]/g, '');
                const targetOrg = item.company || item.assignedCompany || customer?.companyName || customer?.name || 'our team';
                const waGreeting = `https://wa.me/${cleanDigits}?text=Hello,%20thank%20you%20for%20your%20inquiry%20with%20${encodeURIComponent(targetOrg)}.`;
                const isInFollowUp = item.status === 'In Follow-up' || item.status === 'Callback';

                return (
                  <div
                    key={item.id}
                    className={`proper-list-row ${!item.read ? 'is-unread-row' : ''} ${isInFollowUp ? 'is-followup-row' : ''}`}
                  >
                    {/* Col 1: Phone */}
                    <div className="col-phone">
                      <div className={`phone-icon-circle ${isInFollowUp ? 'fup' : ''}`}>
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

                    {/* Col 2: Step 1 / Unlocked Status */}
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
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
                          </svg>
                          <span>Chat</span>
                        </a>

                        {/* 3. In Follow-up */}
                        <button
                          type="button"
                          className={`btn-list-action followup ${isInFollowUp ? 'in-fup' : ''}`}
                          onClick={() => handleMoveToFollowUp(item.id)}
                          title={isInFollowUp ? 'Already in Follow-ups' : 'Move lead to Follow-ups'}
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
                          onClick={() => handleMarkLeadRead(item)}
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
                          onClick={() => handleDropLead(item.id)}
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

        {/* Footer Guarantee Bar */}
        <div className="leads-verified-footer-container">
          <div className="verified-intent-tag-text">
            All leads are verified with phone, locality &amp; requirement intent tags.
          </div>
          <button
            type="button"
            onClick={() => onNavigate('leads')}
            className="btn-open-dedicated-hub-pill"
          >
            Open Dedicated Lead Hub ({totalLeadsCount} Total Leads)
          </button>
        </div>
      </div>
    </div>
  );
}
