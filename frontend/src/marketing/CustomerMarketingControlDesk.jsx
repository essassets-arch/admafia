import React, { useState, useEffect, useCallback } from 'react';
import {
  Rocket,
  Play,
  Square,
  Plus,
  RefreshCw,
  Search,
  Building,
  History,
  Calendar,
  Settings,
  Sparkles,
  Check,
} from 'lucide-react';
import Swal from 'sweetalert2';
import marketingApi from '../services/marketingApi';

const DAYS_OF_WEEK = [
  { code: 'MON', label: 'Monday', short: 'Mon', initial: 'M' },
  { code: 'TUE', label: 'Tuesday', short: 'Tue', initial: 'T' },
  { code: 'WED', label: 'Wednesday', short: 'Wed', initial: 'W' },
  { code: 'THU', label: 'Thursday', short: 'Thu', initial: 'T' },
  { code: 'FRI', label: 'Friday', short: 'Fri', initial: 'F' },
  { code: 'SAT', label: 'Saturday', short: 'Sat', initial: 'S' },
  { code: 'SUN', label: 'Sunday', short: 'Sun', initial: 'S' },
];

export default function CustomerMarketingControlDesk({ onNavigateToDesk }) {
  const [customers, setCustomers] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filterCampaignStatus, setFilterCampaignStatus] = useState('all');

  // Create Campaign Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [campaignName, setCampaignName] = useState('');
  const [submitMode, setSubmitMode] = useState('start'); // 'start' or 'draft'

  // Pacing & Active Days Schedule Modal State
  const [isPacingModalOpen, setIsPacingModalOpen] = useState(false);
  const [pacingCustomer, setPacingCustomer] = useState(null);
  const [editDailySpend, setEditDailySpend] = useState(300);
  const [editActiveDays, setEditActiveDays] = useState(['MON', 'TUE', 'WED', 'THU', 'FRI']);
  const [editPreset, setEditPreset] = useState('weekdays');
  const [savingPacing, setSavingPacing] = useState(false);

  // Today calculation (Monday = 0 ... Sunday = 6)
  const currentDayIdx = (new Date().getDay() + 6) % 7;
  const todayItem = DAYS_OF_WEEK[currentDayIdx] || DAYS_OF_WEEK[0];

  // Load Customers & Campaigns
  const fetchData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      const [custRes, campRes] = await Promise.all([
        marketingApi.getCustomers({ q: search, campaignStatus: filterCampaignStatus, limit: 100 }),
        marketingApi.getCampaigns(),
      ]);

      if (custRes && custRes.ok) {
        setCustomers(custRes.customers || []);
      }
      if (campRes && campRes.ok) {
        setCampaigns(campRes.campaigns || []);
      }
    } catch (err) {
      console.error('[CustomerMarketingControlDesk] Error:', err);
      Swal.fire({
        icon: 'error',
        title: 'Failed to load marketing control state',
        text: err.message,
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search, filterCampaignStatus]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCustomerSelectedForCampaign = (custId) => {
    setSelectedCustomerId(custId);
    const found = customers.find((c) => c.id === custId);
    if (found) {
      setCampaignName(`${found.name} - Meta Inbound Ads`);
    }
  };

  const handleOpenCreateCampaign = (customer = null) => {
    if (customer) {
      setSelectedCustomerId(customer.id);
      setCampaignName(`${customer.name} - Meta Inbound Ads`);
    } else if (customers.length > 0) {
      setSelectedCustomerId(customers[0].id);
      setCampaignName(`${customers[0].name} - Meta Inbound Ads`);
    }
    setIsCreateModalOpen(true);
  };

  // Open Pacing & Schedule Modal
  const handleOpenPacingModal = (customer) => {
    setPacingCustomer(customer);
    setEditDailySpend(customer.dailyAdSpend || 300);
    const days = customer.activeDays && customer.activeDays.length > 0
      ? customer.activeDays
      : ['MON', 'TUE', 'WED', 'THU', 'FRI'];
    setEditActiveDays(days);
    setEditPreset(customer.schedulePreset || (days.length === 7 ? 'all' : days.length === 5 ? 'weekdays' : 'custom'));
    setIsPacingModalOpen(true);
  };

  // Preset Days Selection
  const handleSelectPresetDays = (preset) => {
    setEditPreset(preset);
    if (preset === 'all') {
      setEditActiveDays(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']);
    } else if (preset === 'weekdays') {
      setEditActiveDays(['MON', 'TUE', 'WED', 'THU', 'FRI']);
    } else if (preset === 'weekends') {
      setEditActiveDays(['SAT', 'SUN']);
    } else if (preset === 'clear') {
      setEditActiveDays([]);
    }
  };

  // Toggle single day
  const handleToggleDay = (code) => {
    setEditPreset('custom');
    if (editActiveDays.includes(code)) {
      setEditActiveDays(editActiveDays.filter((d) => d !== code));
    } else {
      setEditActiveDays([...editActiveDays, code]);
    }
  };

  // Save Pacing & Active Days
  const handleSavePacing = async () => {
    if (!pacingCustomer) return;
    if (Number(editDailySpend) < 300) {
      Swal.fire({ icon: 'warning', title: 'Minimum daily budget is ₹300/day.' });
      return;
    }

    setSavingPacing(true);
    try {
      const res = await marketingApi.updateCustomerPacing(pacingCustomer.id, {
        dailyAdSpend: Number(editDailySpend),
        activeDays: editActiveDays,
        schedulePreset: editPreset,
      });

      if (res && res.ok) {
        setIsPacingModalOpen(false);
        await Swal.fire({
          icon: 'success',
          title: 'Pacing Schedule Saved!',
          text: `Daily spend set to ₹${editDailySpend}/day across ${editActiveDays.length} scheduled days. Synced with customer portal!`,
          confirmButtonColor: '#4f46e5',
        });
        fetchData(true);
      }
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'Save Failed',
        text: err.message,
      });
    } finally {
      setSavingPacing(false);
    }
  };

  // Create Campaign Submit
  const handleCreateCampaignSubmit = async (e) => {
    e.preventDefault();
    if (!selectedCustomerId) {
      Swal.fire({ icon: 'warning', title: 'Customer selection is required.' });
      return;
    }
    if (!campaignName.trim()) {
      Swal.fire({ icon: 'warning', title: 'Campaign name is required.' });
      return;
    }

    const cust = customers.find((c) => c.id === selectedCustomerId);
    const dailySpend = cust ? (cust.dailyAdSpend || 300) : 300;

    const shouldStart = submitMode === 'start';
    setCreating(true);
    try {
      const res = await marketingApi.createCampaign({
        customerId: selectedCustomerId,
        name: campaignName.trim(),
        objective: 'Lead Generation',
        platform: 'Meta Ads (Facebook & Instagram)',
        targetAudience: '',
        startDate: new Date().toISOString(),
        endDate: null,
        dailyBudget: dailySpend,
        actor: 'Marketing Campaign Manager',
        status: shouldStart ? 'Running' : 'Draft',
      });

      if (res && res.ok) {
        setIsCreateModalOpen(false);
        await Swal.fire({
          icon: 'success',
          title: shouldStart ? 'Marketing Started Live! 🚀' : 'Campaign Saved as Draft',
          text: shouldStart
            ? `Campaign "${campaignName}" is now active in Running status. ₹${dailySpend} deducted from wallet balance!`
            : `Campaign "${campaignName}" saved. Click "Start Marketing" whenever ready to launch.`,
          confirmButtonColor: '#4f46e5',
        });
        fetchData(true);
      }
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'Creation Failed',
        text: err.message,
      });
    } finally {
      setCreating(false);
    }
  };

  // Start Marketing: Cut / Deduct price from customer wallet and turn marketing ON
  const handleStartMarketingForCustomer = async (cust, activeCampaign) => {
    const spend = cust.dailyAdSpend || 300;
    const balance = cust.availableBalance || 0;

    if (balance < spend) {
      Swal.fire({
        icon: 'error',
        title: 'Insufficient Balance',
        text: `Customer has ₹${balance.toLocaleString('en-IN')}, needs minimum ₹${spend.toLocaleString('en-IN')} to start marketing. Please top up wallet first.`,
      });
      return;
    }

    const confirm = await Swal.fire({
      title: `Start Marketing: ${cust.name}?`,
      html: `
        <div style="text-align: left; font-size: 0.88rem; color: #334155; line-height: 1.6;">
          <div>Customer: <strong>${cust.name}</strong></div>
          <div style="margin-top: 4px;">Daily Ad Spend to Deduct: <strong style="color: #dc2626;">-₹${spend}</strong> (Cut from wallet immediately)</div>
          <div>Current Wallet Balance: <strong>₹${balance.toLocaleString('en-IN')}</strong></div>
          <div>Remaining Balance After Deduction: <strong style="color: #059669;">₹${(balance - spend).toLocaleString('en-IN')}</strong></div>
          <div style="margin-top: 10px; padding: 10px; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; font-size: 0.82rem; color: #065f46;">
            ✓ Marketing will turn <strong>LIVE (ON)</strong> on customer portal &amp; Meta Ads pipeline.
          </div>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#10b981',
      confirmButtonText: `Yes, Deduct ₹${spend} & Start Marketing`,
    });

    if (!confirm.isConfirmed) return;

    try {
      if (activeCampaign && activeCampaign.id) {
        const res = await marketingApi.startCampaign(activeCampaign.id, 'Marketing Operations Manager');
        if (res && res.ok) {
          await Swal.fire({
            icon: 'success',
            title: 'Marketing Started Live! 🚀',
            text: res.message || `₹${spend} daily ad spend deducted. Marketing is now active for ${cust.name}!`,
            confirmButtonColor: '#4f46e5',
          });
          fetchData(true);
        }
      } else {
        const res = await marketingApi.createCampaign({
          customerId: cust.id,
          name: `${cust.name} - Meta Inbound Ads`,
          dailyBudget: spend,
          status: 'Running',
          actor: 'Marketing Operations Manager',
        });
        if (res && res.ok) {
          await Swal.fire({
            icon: 'success',
            title: 'Marketing Started Live! 🚀',
            text: `₹${spend} daily ad spend deducted from wallet. Marketing is now active for ${cust.name}!`,
            confirmButtonColor: '#4f46e5',
          });
          fetchData(true);
        }
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Failed to Start', text: err.message });
    }
  };

  // Stop Marketing: Halt pacing and set marketing to OFF
  const handleStopMarketing = async (campaign, cust) => {
    const name = cust?.name || campaign?.companyName || 'Customer';
    const confirm = await Swal.fire({
      title: `Stop Marketing: ${name}?`,
      text: 'This will pause ad pacing and set marketing to OFF on both the operations desk and customer portal.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#e11d48',
      confirmButtonText: 'Yes, Stop Marketing',
    });

    if (!confirm.isConfirmed) return;

    try {
      if (campaign && campaign.id) {
        await marketingApi.stopCampaign(campaign.id, 'Marketing Operations Manager', 'Manual Stop by Operator');
      } else if (cust) {
        await marketingApi.updateCustomerPacing(cust.id, { adCampaignActive: false });
      }
      await Swal.fire({
        icon: 'info',
        title: 'Marketing Stopped (Paused)',
        text: `Marketing for ${name} has been paused and set to OFF. Daily ad pacing halted.`,
        confirmButtonColor: '#4f46e5',
      });
      fetchData(true);
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Failed to Stop', text: err.message });
    }
  };

  // View Customer Campaign History Modal
  const handleViewCampaignHistory = (cust, custCampaigns) => {
    const listHtml = custCampaigns.map((camp, idx) => `
      <div style="text-align: left; padding: 12px; margin-bottom: 8px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <strong style="color: #0f172a; font-size: 0.92rem;">${idx + 1}. ${camp.name}</strong>
          <span style="font-size: 0.74rem; font-weight: 800; padding: 2px 8px; border-radius: 9999px; background: ${camp.status === 'Running' ? '#ecfdf5' : '#f1f5f9'}; color: ${camp.status === 'Running' ? '#059669' : '#64748b'};">
            ${camp.status}
          </span>
        </div>
        <div style="font-size: 0.82rem; color: #475569; margin-top: 4px;">
          Daily Burn Rate: <strong>₹${camp.dailyBudget}/day</strong> • Platform: <strong>${camp.platform}</strong>
        </div>
        <div style="font-size: 0.78rem; color: #94a3b8; margin-top: 2px;">
          Last action: ${camp.lastAction || 'Created'} by ${camp.lastActor || 'Operator'}
        </div>
      </div>
    `).join('');

    Swal.fire({
      title: `Campaign History: ${cust.name}`,
      html: `
        <div style="max-height: 380px; overflow-y: auto; padding-right: 4px;">
          ${listHtml || '<p style="color:#64748b">No campaign history recorded yet.</p>'}
        </div>
      `,
      confirmButtonText: 'Close',
      confirmButtonColor: '#4f46e5',
    });
  };

  return (
    <div className="marketing-control-page">
      {/* 1. Header */}
      <div className="marketing-page-header">
        <div className="marketing-header-title-col">
          <h1>Customer Marketing Control</h1>
          <p>
            Manage active advertising pacing, daily burn rate (min ₹300), running schedules, and live customer marketing campaigns.
          </p>
        </div>
        <div className="marketing-header-actions">
          <button
            type="button"
            className="marketing-btn-primary"
            onClick={() => handleOpenCreateCampaign()}
          >
            <Plus size={16} />
            <span>Create Campaign</span>
          </button>
          <button
            type="button"
            className="marketing-btn-refresh"
            onClick={() => fetchData(true)}
            disabled={refreshing}
          >
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
            <span>{refreshing ? 'Refreshing...' : 'Live Refresh'}</span>
          </button>
        </div>
      </div>

      {/* 2. Controls & Search */}
      <div className="marketing-controls-card">
        <div className="marketing-search-box">
          <Search size={16} className="marketing-search-icon" />
          <input
            type="text"
            className="marketing-search-input"
            placeholder="Search customer, campaign name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="marketing-filter-group">
          <select
            className="marketing-select"
            value={filterCampaignStatus}
            onChange={(e) => setFilterCampaignStatus(e.target.value)}
          >
            <option value="all">All Campaign Statuses</option>
            <option value="Running">Running Deployments</option>
            <option value="Draft">Drafts Only</option>
            <option value="Stopped">Stopped / Paused</option>
            <option value="None">No Campaign Configured</option>
          </select>
        </div>
      </div>

      {/* 3. Main Customer Marketing Control Table */}
      <div className="marketing-table-card">
        <div className="marketing-table-responsive">
          <table className="marketing-table">
            <thead>
              <tr>
                <th style={{ width: '22%' }}>Customer / Business</th>
                <th style={{ width: '13%' }}>Category</th>
                <th style={{ width: '32%' }}>Marketing Pacing &amp; Schedule</th>
                <th style={{ width: '15%' }}>Ad Wallet</th>
                <th style={{ width: '18%' }}>Marketing Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '40px' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: '#64748b' }}>
                      <RefreshCw size={18} className="spin" />
                      <span>Loading marketing control dashboard...</span>
                    </div>
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '50px 20px', color: '#64748b' }}>
                    <Building size={36} style={{ color: '#cbd5e1', marginBottom: '8px' }} />
                    <h4 style={{ margin: '0 0 6px 0', color: '#0f172a' }}>No customers found</h4>
                    <p style={{ fontSize: '0.84rem', margin: 0 }}>
                      No customer records match the current filter criteria.
                    </p>
                  </td>
                </tr>
              ) : (
                customers.map((c) => {
                  const custCampaigns = campaigns.filter((camp) => camp.customerId === c.id);
                  const activeCampaign = custCampaigns.find((camp) => camp.status === 'Running') || custCampaigns[0];
                  const isLive = Boolean(c.adCampaignActive || (activeCampaign && activeCampaign.status === 'Running'));
                  const activeDays = c.activeDays && c.activeDays.length > 0 ? c.activeDays : ['MON', 'TUE', 'WED', 'THU', 'FRI'];
                  const isTodayActive = activeDays.includes(todayItem.code);
                  const dailySpend = c.dailyAdSpend || 300;
                  const isLowBalance = c.availableBalance < dailySpend || c.availableBalance <= 0;
                  const runwayDays = dailySpend > 0 ? Math.floor(c.availableBalance / dailySpend) : 0;

                  return (
                    <tr key={c.id}>
                      {/* 1. Customer Info & Live Marketing Status */}
                      <td>
                        <div className="mkt-cell-primary">{c.name}</div>
                        <div className="mkt-cell-sub">{c.contactPerson} • +91 {c.phone}</div>
                        <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                          <span
                            className={`mkt-pill ${isLive ? 'mkt-pill-green' : 'mkt-pill-slate'}`}
                            style={{ fontSize: '0.74rem', padding: '3px 8px', fontWeight: 800 }}
                          >
                            {isLive && <span className="marketing-live-dot" />}
                            {isLive ? 'MARKETING IS LIVE' : 'MARKETING IS OFF'}
                          </span>
                          {isLowBalance && (
                            <span
                              className="mkt-pill mkt-pill-rose"
                              style={{ fontSize: '0.68rem', padding: '2px 7px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                            >
                              ⚠️ Customer Balance is Low
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 2. Category */}
                      <td>
                        <span className="mkt-pill mkt-pill-slate">{c.category}</span>
                      </td>

                      {/* 3. Marketing Pacing & Scheduled Days (Synced with /app/lead#app/dashboard) */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                            <strong style={{ fontSize: '0.96rem', color: '#0f172a' }}>
                              ₹{dailySpend}
                            </strong>
                            <span style={{ fontSize: '0.72rem', color: '#64748b' }}>/ active day</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleOpenPacingModal(c)}
                            className="mkt-btn-table-action"
                            style={{ fontSize: '0.72rem', padding: '3px 8px', borderRadius: '6px', fontWeight: 700 }}
                            title="Configure Daily Spend and Scheduled Days"
                          >
                            <Calendar size={12} />
                            <span>Set Amount / Days</span>
                          </button>
                        </div>

                        {/* Interactive 7-Day Badges */}
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginTop: '6px' }}>
                          {DAYS_OF_WEEK.map((d) => {
                            const isSelected = activeDays.includes(d.code);
                            const isToday = d.code === todayItem.code;
                            return (
                              <span
                                key={d.code}
                                title={`${d.label}: ${isSelected ? `₹${dailySpend}` : 'Off'}${isToday ? ' (Today)' : ''}`}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  width: '22px',
                                  height: '22px',
                                  borderRadius: '5px',
                                  fontSize: '0.70rem',
                                  fontWeight: 800,
                                  background: isSelected ? '#4f46e5' : '#f1f5f9',
                                  color: isSelected ? '#ffffff' : '#94a3b8',
                                  border: isToday ? '1.5px solid #f59e0b' : '1px solid transparent',
                                  boxShadow: isToday ? '0 0 0 1px #fef3c7' : 'none',
                                }}
                              >
                                {d.initial}
                              </span>
                            );
                          })}
                          <span style={{ fontSize: '0.74rem', color: '#475569', marginLeft: '6px', fontWeight: 700 }}>
                            {activeDays.length} of 7 Days Active
                          </span>
                        </div>

                        {/* Weekly Pacing & Today State */}
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '6px', lineHeight: 1.4 }}>
                          Weekly: <strong>₹{(activeDays.length * dailySpend).toLocaleString('en-IN')}</strong> • Today ({todayItem.label}):{' '}
                          {isLive && isTodayActive ? (
                            <strong style={{ color: '#059669' }}>● Active (₹{dailySpend}/day)</strong>
                          ) : isLive ? (
                            <span style={{ color: '#64748b' }}>● Day Off</span>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>● Campaign Paused</span>
                          )}
                        </div>
                      </td>

                      {/* 4. Available Balance & Runway */}
                      <td>
                        <div
                          className="mkt-badge-mono"
                          style={{
                            fontSize: '0.96rem',
                            fontWeight: 800,
                            color: !isLowBalance ? '#059669' : '#dc2626',
                          }}
                        >
                          ₹{c.availableBalance.toLocaleString('en-IN')}
                        </div>
                        <div className="mkt-cell-sub" style={{ marginTop: '4px' }}>
                          Runway:{' '}
                          <strong style={{ color: !isLowBalance ? '#334155' : '#dc2626' }}>
                            {runwayDays} days funded
                          </strong>
                        </div>
                        {isLowBalance && (
                          <div style={{ marginTop: '6px' }}>
                            <span
                              className="mkt-pill mkt-pill-rose"
                              style={{
                                fontSize: '0.68rem',
                                fontWeight: 800,
                                padding: '3px 7px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                              }}
                            >
                              {c.availableBalance <= 0
                                ? '⚠️ Balance is Zero'
                                : '⚠️ Balance is Low (Needs Top Up)'}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* 5. Marketing Actions */}
                      <td>
                        <div className="mkt-actions-flex" style={{ gap: '8px', flexWrap: 'wrap' }}>
                          {isLive ? (
                            <button
                              type="button"
                              className="mkt-btn-table-action danger"
                              onClick={() => handleStopMarketing(activeCampaign, c)}
                              title="Stop Running Campaign (Halts daily ad pacing)"
                              style={{
                                fontWeight: 800,
                                padding: '7px 14px',
                                background: '#ffe4e6',
                                color: '#be123c',
                                borderColor: '#f43f5e',
                              }}
                            >
                              <Square size={13} fill="currentColor" />
                              <span>Stop Marketing</span>
                            </button>
                          ) : (
                            <div>
                              <button
                                type="button"
                                className="mkt-btn-table-action success"
                                onClick={() => handleStartMarketingForCustomer(c, activeCampaign)}
                                title="Start Marketing Campaign (Deducts daily ad spend from wallet)"
                                style={{
                                  fontWeight: 800,
                                  padding: '7px 14px',
                                  background: '#d1fae5',
                                  color: '#047857',
                                  borderColor: '#10b981',
                                }}
                              >
                                <Play size={13} fill="currentColor" />
                                <span>Start Marketing</span>
                              </button>
                              {isLowBalance && (
                                <div style={{ fontSize: '0.70rem', color: '#e11d48', fontWeight: 800, marginTop: '4px' }}>
                                  ⚠️ Balance is low (Min ₹{dailySpend})
                                </div>
                              )}
                            </div>
                          )}

                          {/* Customer Campaign History */}
                          {custCampaigns.length > 0 && (
                            <button
                              type="button"
                              className="mkt-btn-table-action"
                              onClick={() => handleViewCampaignHistory(c, custCampaigns)}
                              title="View Customer Campaign History"
                              style={{ fontSize: '0.78rem', padding: '6px 10px' }}
                            >
                              <History size={12} />
                              <span>History ({custCampaigns.length})</span>
                            </button>
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
      </div>

      {/* 4. Pacing & Schedule Modal (Set Amount & Days, matching /app/lead#app/dashboard) */}
      {isPacingModalOpen && pacingCustomer && (
        <div className="marketing-modal-backdrop" onClick={() => setIsPacingModalOpen(false)}>
          <div className="marketing-modal-box" style={{ maxWidth: '540px' }} onClick={(e) => e.stopPropagation()}>
            <div className="marketing-modal-header">
              <div>
                <h3 style={{ margin: 0 }}>Marketing Campaign &amp; Pacing Control</h3>
                <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                  Customer: <strong>{pacingCustomer.name}</strong> • Bal: ₹{pacingCustomer.availableBalance.toLocaleString('en-IN')}
                </span>
              </div>
              <button
                type="button"
                className="marketing-btn-close"
                onClick={() => setIsPacingModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="marketing-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Daily Burn Rate / Spend Amount */}
              <div className="mkt-form-group">
                <label className="mkt-form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Daily Burn Rate (Ad Spend Budget) *</span>
                  <span style={{ fontSize: '0.76rem', color: '#4f46e5', fontWeight: 800 }}>Min ₹300/day</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="number"
                    min={300}
                    step={50}
                    className="mkt-form-input"
                    value={editDailySpend}
                    onChange={(e) => setEditDailySpend(e.target.value)}
                    placeholder="300"
                    style={{ fontSize: '1.05rem', fontWeight: 800, paddingLeft: '32px' }}
                  />
                  <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontWeight: 800, color: '#64748b' }}>
                    ₹
                  </span>
                </div>
                <span className="mkt-form-help">
                  Daily spend of ₹{editDailySpend || 300} is deducted only on scheduled active days.
                </span>
              </div>

              {/* Day Selection Presets */}
              <div className="mkt-form-group">
                <label className="mkt-form-label">
                  Select Marketing Days ({editActiveDays.length} of 7 Days Active)
                </label>

                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
                  <button
                    type="button"
                    className="mkt-btn-table-action"
                    style={{
                      fontSize: '0.78rem',
                      background: editPreset === 'all' ? '#4f46e5' : '#ffffff',
                      color: editPreset === 'all' ? '#ffffff' : '#334155',
                      borderColor: editPreset === 'all' ? '#4f46e5' : '#cbd5e1',
                      fontWeight: 700,
                    }}
                    onClick={() => handleSelectPresetDays('all')}
                  >
                    All 7 Days
                  </button>
                  <button
                    type="button"
                    className="mkt-btn-table-action"
                    style={{
                      fontSize: '0.78rem',
                      background: editPreset === 'weekdays' ? '#4f46e5' : '#ffffff',
                      color: editPreset === 'weekdays' ? '#ffffff' : '#334155',
                      borderColor: editPreset === 'weekdays' ? '#4f46e5' : '#cbd5e1',
                      fontWeight: 700,
                    }}
                    onClick={() => handleSelectPresetDays('weekdays')}
                  >
                    Mon - Fri (5 Days)
                  </button>
                  <button
                    type="button"
                    className="mkt-btn-table-action"
                    style={{
                      fontSize: '0.78rem',
                      background: editPreset === 'weekends' ? '#4f46e5' : '#ffffff',
                      color: editPreset === 'weekends' ? '#ffffff' : '#334155',
                      borderColor: editPreset === 'weekends' ? '#4f46e5' : '#cbd5e1',
                      fontWeight: 700,
                    }}
                    onClick={() => handleSelectPresetDays('weekends')}
                  >
                    Sat - Sun (Weekends)
                  </button>
                  <button
                    type="button"
                    className="mkt-btn-table-action"
                    style={{ fontSize: '0.78rem' }}
                    onClick={() => handleSelectPresetDays('clear')}
                  >
                    Clear
                  </button>
                </div>

                {/* 7 Days Cards Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px' }}>
                  {DAYS_OF_WEEK.map((day) => {
                    const isSelected = editActiveDays.includes(day.code);
                    const isToday = day.code === todayItem.code;
                    return (
                      <div
                        key={day.code}
                        onClick={() => handleToggleDay(day.code)}
                        style={{
                          cursor: 'pointer',
                          padding: '10px 4px',
                          borderRadius: '8px',
                          textAlign: 'center',
                          border: isSelected ? '2px solid #4f46e5' : '1.5px solid #e2e8f0',
                          background: isSelected ? '#eef2ff' : '#f8fafc',
                          position: 'relative',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {isToday && (
                          <div
                            style={{
                              position: 'absolute',
                              top: '-6px',
                              left: '50%',
                              transform: 'translateX(-50%)',
                              background: '#f59e0b',
                              color: '#ffffff',
                              fontSize: '0.58rem',
                              fontWeight: 900,
                              padding: '1px 4px',
                              borderRadius: '4px',
                            }}
                          >
                            TODAY
                          </div>
                        )}
                        <div style={{ fontSize: '0.78rem', fontWeight: 800, color: isSelected ? '#4f46e5' : '#475569' }}>
                          {day.code}
                        </div>
                        <div style={{ fontSize: '0.66rem', color: '#64748b', marginTop: '2px' }}>
                          {day.short}
                        </div>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: isSelected ? '#059669' : '#94a3b8', marginTop: '4px' }}>
                          ₹{editDailySpend || 300}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Summary Stats */}
              <div style={{ padding: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.84rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ color: '#64748b' }}>Weekly Estimated Spend:</span>
                  <strong>₹{((Number(editDailySpend) || 300) * editActiveDays.length).toLocaleString('en-IN')}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Wallet Runway:</span>
                  <strong style={{ color: '#059669' }}>
                    {editDailySpend > 0 ? Math.floor(pacingCustomer.availableBalance / Number(editDailySpend)) : 0} days funded
                  </strong>
                </div>
              </div>
            </div>

            <div className="marketing-modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                className="mkt-btn-table-action"
                onClick={() => setIsPacingModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="marketing-btn-primary"
                onClick={handleSavePacing}
                disabled={savingPacing}
              >
                <Check size={14} />
                <span>{savingPacing ? 'Saving...' : 'Save Pacing & Schedule'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Create Campaign Modal */}
      {isCreateModalOpen && (
        <div className="marketing-modal-backdrop" onClick={() => setIsCreateModalOpen(false)}>
          <div className="marketing-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="marketing-modal-header">
              <h3>Create Marketing Campaign</h3>
              <button
                type="button"
                className="marketing-btn-close"
                onClick={() => setIsCreateModalOpen(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateCampaignSubmit}>
              <div className="marketing-modal-body">
                <div className="mkt-form-group">
                  <label className="mkt-form-label">
                    Target Customer <span className="req">*</span>
                  </label>
                  <select
                    className="mkt-form-select"
                    value={selectedCustomerId}
                    onChange={(e) => handleCustomerSelectedForCampaign(e.target.value)}
                    required
                  >
                    <option value="">-- Select Completed Customer --</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} — {c.category} (Bal: ₹{c.availableBalance})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mkt-form-group">
                  <label className="mkt-form-label">
                    Campaign Name <span className="req">*</span>
                  </label>
                  <input
                    type="text"
                    className="mkt-form-input"
                    placeholder="e.g. IT Software High-Intent Lead Inbound Campaign"
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="marketing-modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: '12px' }}>
                <button
                  type="button"
                  className="mkt-btn-table-action"
                  onClick={() => setIsCreateModalOpen(false)}
                >
                  Cancel
                </button>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="submit"
                    className="mkt-btn-table-action"
                    disabled={creating}
                    onClick={() => setSubmitMode('draft')}
                    title="Save Campaign as Draft (Do not start yet)"
                  >
                    <span>Save Draft</span>
                  </button>
                  <button
                    type="submit"
                    className="marketing-btn-primary"
                    disabled={creating}
                    onClick={() => setSubmitMode('start')}
                    style={{ background: '#059669', borderColor: '#047857', fontWeight: 800 }}
                    title="Deploy and Start Marketing Campaign Immediately"
                  >
                    <Play size={14} fill="currentColor" />
                    <span>{creating && submitMode === 'start' ? 'Starting...' : 'Start Marketing Now 🚀'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
