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
  Check,
} from 'lucide-react';
import Swal from 'sweetalert2';
import marketingApi from '../services/marketingApi';
import { SmartTable } from '../components/SmartTabulator';

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
  const [filterCodeStatus, setFilterCodeStatus] = useState('all'); // 'all', 'filled', 'not_filled'

  // Create Campaign Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [campaignName, setCampaignName] = useState('');
  const [createMarketingCode, setCreateMarketingCode] = useState('');
  const [submitMode, setSubmitMode] = useState('start'); // 'start' or 'draft'

  // Pacing & Active Days Schedule Modal State
  const [isPacingModalOpen, setIsPacingModalOpen] = useState(false);
  const [pacingCustomer, setPacingCustomer] = useState(null);
  const [editDailySpend, setEditDailySpend] = useState(300);
  const [editActiveDays, setEditActiveDays] = useState(['MON', 'TUE', 'WED', 'THU', 'FRI']);
  const [editPreset, setEditPreset] = useState('weekdays');
  const [savingPacing, setSavingPacing] = useState(false);

  // Campaign History Modal State
  const [historyModalCustomer, setHistoryModalCustomer] = useState(null);
  const [historyCampaigns, setHistoryCampaigns] = useState([]);

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
      setCreateMarketingCode(found.marketingCode || '');
    }
  };

  const handleOpenCreateCampaign = (customer = null) => {
    if (customer) {
      setSelectedCustomerId(customer.id);
      setCampaignName(`${customer.name} - Meta Inbound Ads`);
      setCreateMarketingCode(customer.marketingCode || '');
    } else if (customers.length > 0) {
      setSelectedCustomerId(customers[0].id);
      setCampaignName(`${customers[0].name} - Meta Inbound Ads`);
      setCreateMarketingCode(customers[0].marketingCode || '');
    } else {
      setCreateMarketingCode('');
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
    let finalCode = createMarketingCode.trim().toUpperCase();

    if (shouldStart && !finalCode) {
      const { value: code, isConfirmed } = await Swal.fire({
        title: 'Enter Marketing Code',
        text: 'Please enter the varchar campaign / marketing code to start marketing live:',
        input: 'text',
        inputPlaceholder: 'e.g. META-ADS-8921, CMP-4401',
        inputAttributes: {
          autocapitalize: 'off',
          autocorrect: 'off',
          style: 'text-transform: uppercase; font-family: monospace; font-weight: 700;',
        },
        showCancelButton: true,
        confirmButtonColor: '#10b981',
        confirmButtonText: 'Start Marketing',
        inputValidator: (v) => (!v || !v.trim() ? 'Marketing code is required!' : null),
      });
      if (!isConfirmed) return;
      finalCode = (code || '').trim().toUpperCase();
      setCreateMarketingCode(finalCode);
    }

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
        marketingCode: finalCode,
        externalCampaignId: finalCode,
      });

      if (finalCode) {
        try {
          await marketingApi.updateCustomerMarketingCode(selectedCustomerId, finalCode);
        } catch (e) {}
      }

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

  // Start Marketing: Deducts daily ad spend for today's per-day service (if not already deducted today) & activates pacing
  const handleStartMarketingForCustomer = async (cust, activeCampaign) => {
    const spend = cust.dailyAdSpend || 300;
    const balance = cust.availableBalance || 0;
    const isAlreadyDeducted = Boolean(cust.isDeductedToday);

    if (!isAlreadyDeducted && balance < spend) {
      Swal.fire({
        icon: 'error',
        title: 'Customer Balance is Low',
        text: `Customer has ₹${balance.toLocaleString('en-IN')}, needs minimum ₹${spend.toLocaleString('en-IN')} for today's per-day marketing service. Please top up wallet first.`,
      });
      return;
    }

    const defaultCode = cust.marketingCode || activeCampaign?.marketingCode || activeCampaign?.externalCampaignId || '';

    const { value: enteredCode, isConfirmed } = await Swal.fire({
      title: `Start Marketing: ${cust.name}`,
      html: `
        <div style="text-align: left; font-size: 0.88rem; line-height: 1.6;">
          <div style="margin-bottom: 6px;">Customer: <strong>${cust.name}</strong></div>
          <div style="margin-bottom: 6px;">Service Model: <strong>Per-Day Advertising Service (₹${spend}/day)</strong></div>
          ${isAlreadyDeducted ? `
            <div style="margin-top: 6px; margin-bottom: 8px; padding: 8px 12px; background: rgba(59, 130, 246, 0.12); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 8px; color: #3b82f6; font-size: 0.82rem;">
              ✓ <strong>Today's per-day service is already settled.</strong> Resuming campaign without charging wallet again today.
            </div>
          ` : `
            <div style="margin-bottom: 4px;">Per-Day Service to Deduct: <strong style="color: #f43f5e;">-₹${spend}</strong> (Cut from wallet for today)</div>
            <div style="margin-bottom: 4px;">Current Wallet Balance: <strong>₹${balance.toLocaleString('en-IN')}</strong></div>
            <div style="margin-bottom: 6px;">Balance After Today's Deduction: <strong style="color: #10b981;">₹${(balance - spend).toLocaleString('en-IN')}</strong></div>
          `}
          <div style="margin-top: 8px; padding: 10px; background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 8px; font-size: 0.82rem; color: #10b981;">
            ✓ Marketing will turn <strong>LIVE (ON)</strong> on customer portal &amp; Meta Ads pipeline.
          </div>
          <div style="margin-top: 14px; margin-bottom: 4px; font-weight: 700; font-size: 0.86rem;">
            Enter Marketing / Campaign Code (varchar):
          </div>
        </div>
      `,
      input: 'text',
      inputValue: defaultCode,
      inputPlaceholder: 'Enter varchar code (e.g. META-ADS-8921, CMP-4401)',
      inputAttributes: {
        autocapitalize: 'off',
        autocorrect: 'off',
        style: 'text-transform: uppercase; font-family: monospace; font-weight: 700; letter-spacing: 0.5px;',
      },
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#10b981',
      cancelButtonColor: '#64748b',
      confirmButtonText: isAlreadyDeducted ? 'Yes, Resume Marketing' : `Yes, Deduct ₹${spend} & Start Marketing`,
      cancelButtonText: 'Cancel',
      inputValidator: (value) => {
        if (!value || !value.trim()) {
          return 'Please enter the marketing / campaign code (varchar) to proceed!';
        }
      },
    });

    if (!isConfirmed) return;
    const finalCode = (enteredCode || '').trim().toUpperCase();

    try {
      let res;
      if (activeCampaign && activeCampaign.id) {
        res = await marketingApi.startCampaign(activeCampaign.id, 'Marketing Operations Manager', finalCode);
      } else {
        res = await marketingApi.startCustomerMarketing(cust.id, finalCode, 'Marketing Operations Manager');
      }

      if (res && res.ok) {
        setCustomers((prev) =>
          prev.map((item) =>
            item.id === cust.id
              ? {
                  ...item,
                  adCampaignActive: true,
                  marketingCode: finalCode,
                  isCodeFilled: true,
                  availableBalance: res.newBalance !== undefined ? res.newBalance : item.availableBalance,
                }
              : item
          )
        );

        await Swal.fire({
          icon: 'success',
          title: 'Marketing Started Live! 🚀',
          html: `
            <div style="font-size: 0.90rem;">
              <div>${res.message || `₹${spend} per-day service active for ${cust.name}!`}</div>
              <div style="margin-top: 10px; padding: 8px 12px; background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 8px; color: #10b981; font-size: 0.82rem;">
                ✓ Code Configured &amp; Saved: <strong>Filled</strong>
              </div>
            </div>
          `,
          confirmButtonColor: '#4f46e5',
        });
        fetchData(true);
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Failed to Start Marketing', text: err.message });
    }
  };

  // Quick Edit Marketing Code helper (updates code status between Filled / Not Filled without starting)
  const handleEditMarketingCode = async (cust) => {
    const currentCode = cust.marketingCode || '';
    const { value: enteredCode, isConfirmed } = await Swal.fire({
      title: `Marketing Code: ${cust.name}`,
      html: `
        <div style="text-align: left; font-size: 0.86rem; margin-bottom: 10px; line-height: 1.5;">
          Enter or update the varchar campaign / marketing tracking code for <strong>${cust.name}</strong>:
          <div style="font-size: 0.78rem; opacity: 0.8; margin-top: 4px;">
            Note: The table column will indicate <strong>Filled</strong> or <strong>Not Filled</strong> without exposing the code text.
          </div>
        </div>
      `,
      input: 'text',
      inputValue: currentCode,
      inputPlaceholder: 'e.g. META-ADS-8921, CMP-4401',
      inputAttributes: {
        autocapitalize: 'off',
        autocorrect: 'off',
        style: 'text-transform: uppercase; font-family: monospace; font-weight: 700; letter-spacing: 0.5px;',
      },
      showCancelButton: true,
      confirmButtonColor: '#4f46e5',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Save Code',
      cancelButtonText: 'Cancel',
    });

    if (!isConfirmed) return;
    const finalCode = (enteredCode || '').trim().toUpperCase();

    try {
      await marketingApi.updateCustomerMarketingCode(cust.id, finalCode);
      setCustomers((prev) =>
        prev.map((item) =>
          item.id === cust.id
            ? {
                ...item,
                marketingCode: finalCode,
                isCodeFilled: Boolean(finalCode),
              }
            : item
        )
      );

      Swal.fire({
        icon: 'success',
        title: finalCode ? 'Code Saved! ✓' : 'Code Cleared',
        text: finalCode ? 'Marketing code status updated to Filled.' : 'Status updated to Not Filled.',
        timer: 1500,
        showConfirmButton: false,
      });
      fetchData(true);
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Failed to update code', text: err.message });
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
    setHistoryModalCustomer(cust);
    setHistoryCampaigns(Array.isArray(custCampaigns) ? custCampaigns : []);
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

        <div className="marketing-filter-group" style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
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

          <select
            className="marketing-select"
            value={filterCodeStatus}
            onChange={(e) => setFilterCodeStatus(e.target.value)}
          >
            <option value="all">All Code Statuses</option>
            <option value="filled">✓ Code Filled</option>
            <option value="not_filled">✕ Code Not Filled</option>
          </select>
        </div>
      </div>

      {/* 3. Main Customer Marketing Control Table */}
      <div className="marketing-table-card">
        <SmartTable
          title="Customer Marketing Control"
          exportFilename="customer-marketing-control"
          defaultPageSize={10}
        >
          <table className="marketing-table">
            <thead>
              <tr>
                <th style={{ width: '21%' }}>Customer / Business</th>
                <th style={{ width: '11%' }}>Category</th>
                <th style={{ width: '13%', textAlign: 'center' }}>Marketing Code</th>
                <th style={{ width: '27%' }}>Marketing Pacing &amp; Schedule</th>
                <th style={{ width: '13%' }}>Ad Wallet</th>
                <th style={{ width: '15%' }}>Marketing Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '40px' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--adm-text-muted, #64748b)' }}>
                      <RefreshCw size={18} className="spin" />
                      <span>Loading marketing control dashboard...</span>
                    </div>
                  </td>
                </tr>
              ) : (() => {
                const displayedCustomers = customers.filter((c) => {
                  const custCampaigns = campaigns.filter((camp) => camp.customerId === c.id);
                  const activeCampaign = custCampaigns.find((camp) => camp.status === 'Running') || custCampaigns[0];
                  const isFilled = Boolean(c.marketingCode || (activeCampaign && (activeCampaign.marketingCode || activeCampaign.externalCampaignId)));
                  if (filterCodeStatus === 'filled') return isFilled;
                  if (filterCodeStatus === 'not_filled') return !isFilled;
                  return true;
                });

                if (displayedCustomers.length === 0) {
                  return (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--adm-text-muted, #64748b)' }}>
                        <Building size={36} style={{ color: 'var(--adm-border-strong, #cbd5e1)', marginBottom: '8px' }} />
                        <h4 style={{ margin: '0 0 6px 0', color: 'var(--adm-text-primary, #0f172a)' }}>No customers found</h4>
                        <p style={{ fontSize: '0.84rem', margin: 0 }}>
                          No customer records match the current filter criteria.
                        </p>
                      </td>
                    </tr>
                  );
                }

                return displayedCustomers.map((c) => {
                  const custCampaigns = campaigns.filter((camp) => camp.customerId === c.id);
                  const activeCampaign = custCampaigns.find((camp) => camp.status === 'Running') || custCampaigns[0];
                  const isLive = Boolean(c.adCampaignActive || (activeCampaign && activeCampaign.status === 'Running'));
                  const isCodeFilled = Boolean(c.marketingCode || (activeCampaign && (activeCampaign.marketingCode || activeCampaign.externalCampaignId)));
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

                      {/* 3. Marketing Code Column (Shows Filled / Not Filled, NEVER exposes actual code) */}
                      <td style={{ textAlign: 'center' }}>
                        {isCodeFilled ? (
                          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                            <button
                              type="button"
                              onClick={() => handleEditMarketingCode(c)}
                              title="Code is assigned. Click to view or edit."
                              style={{
                                background: 'transparent',
                                border: 'none',
                                padding: 0,
                                cursor: 'pointer',
                              }}
                            >
                              <span
                                className="mkt-pill mkt-pill-green"
                                style={{
                                  fontSize: '0.74rem',
                                  padding: '4px 10px',
                                  fontWeight: 800,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '5px',
                                  borderRadius: '9999px',
                                }}
                              >
                                <Check size={12} strokeWidth={3} />
                                <span>Filled</span>
                              </span>
                            </button>
                            <span style={{ fontSize: '0.64rem', color: 'var(--adm-text-muted, #94a3b8)', fontWeight: 600 }}>
                              Protected
                            </span>
                          </div>
                        ) : (
                          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                            <button
                              type="button"
                              onClick={() => handleEditMarketingCode(c)}
                              title="No code assigned yet. Click to enter code."
                              style={{
                                background: 'transparent',
                                border: 'none',
                                padding: 0,
                                cursor: 'pointer',
                              }}
                            >
                              <span
                                className="mkt-pill mkt-pill-rose"
                                style={{
                                  fontSize: '0.74rem',
                                  padding: '4px 10px',
                                  fontWeight: 800,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '5px',
                                  borderRadius: '9999px',
                                }}
                              >
                                <span style={{ fontSize: '0.72rem', lineHeight: 1 }}>✕</span>
                                <span>Not Filled</span>
                              </span>
                            </button>
                            <span style={{ fontSize: '0.64rem', color: 'var(--adm-text-muted, #94a3b8)', fontWeight: 600 }}>
                              Required on Start
                            </span>
                          </div>
                        )}
                      </td>

                      {/* 4. Marketing Pacing & Scheduled Days (Synced with /app/lead#app/dashboard) */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap' }}>
                            <strong style={{ fontSize: '0.96rem', color: 'var(--adm-text-primary, #0f172a)' }}>
                              ₹{dailySpend}
                            </strong>
                            <span style={{ fontSize: '0.72rem', color: 'var(--adm-text-muted, #64748b)' }}>/ active day</span>
                            <span className="mkt-pill mkt-pill-slate" style={{ fontSize: '0.64rem', fontWeight: 800, padding: '1px 5px' }}>
                              Per-Day Service
                            </span>
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
                                  background: isSelected ? '#4f46e5' : 'var(--adm-bg-muted, #f1f5f9)',
                                  color: isSelected ? '#ffffff' : 'var(--adm-text-muted, #94a3b8)',
                                  border: isToday ? '1.5px solid #f59e0b' : '1px solid transparent',
                                  boxShadow: isToday ? '0 0 0 1px rgba(245, 158, 11, 0.35)' : 'none',
                                }}
                              >
                                {d.initial}
                              </span>
                            );
                          })}
                          <span style={{ fontSize: '0.74rem', color: 'var(--adm-text-body, #475569)', marginLeft: '6px', fontWeight: 700 }}>
                            {activeDays.length} of 7 Days Active
                          </span>
                        </div>

                        {/* Weekly Pacing & Today State */}
                        <div style={{ fontSize: '0.75rem', color: 'var(--adm-text-muted, #64748b)', marginTop: '6px', lineHeight: 1.4 }}>
                          Weekly: <strong>₹{(activeDays.length * dailySpend).toLocaleString('en-IN')}</strong> • Today ({todayItem.label}):{' '}
                          {c.isDeductedToday ? (
                            <strong style={{ color: '#059669' }}>● Settled for Today (₹{dailySpend}) ✓</strong>
                          ) : isLive && isTodayActive ? (
                            <strong style={{ color: '#0ea5e9' }}>● Active (₹{dailySpend}/day Service)</strong>
                          ) : isLive ? (
                            <span style={{ color: 'var(--adm-text-muted, #64748b)' }}>● Scheduled Day Off</span>
                          ) : (
                            <span style={{ color: 'var(--adm-text-muted, #94a3b8)' }}>● Campaign Paused</span>
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
                          <strong style={{ color: !isLowBalance ? 'var(--adm-text-body, #334155)' : '#dc2626' }}>
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
                });
              })()}
            </tbody>
          </table>
        </SmartTable>
      </div>

      {/* 4. Pacing & Schedule Modal (Set Amount & Days, matching /app/lead#app/dashboard) */}
      {isPacingModalOpen && pacingCustomer && (
        <div className="marketing-modal-backdrop" onClick={() => setIsPacingModalOpen(false)}>
          <div className="marketing-modal-box" style={{ maxWidth: '540px' }} onClick={(e) => e.stopPropagation()}>
            <div className="marketing-modal-header">
              <div>
                <h3 style={{ margin: 0 }}>Marketing Campaign &amp; Pacing Control</h3>
                <span style={{ fontSize: '0.78rem', color: 'var(--adm-text-muted, #64748b)' }}>
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
                  <span style={{ fontSize: '0.76rem', color: '#6366f1', fontWeight: 800 }}>Min ₹300/day</span>
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
                  <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontWeight: 800, color: 'var(--adm-text-muted, #64748b)' }}>
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
                    className={`mkt-btn-table-action ${editPreset === 'all' ? 'active' : ''}`.trim()}
                    style={{
                      fontSize: '0.78rem',
                      background: editPreset === 'all' ? '#4f46e5' : 'var(--adm-bg-card, #ffffff)',
                      color: editPreset === 'all' ? '#ffffff' : 'var(--adm-text-body, #334155)',
                      borderColor: editPreset === 'all' ? '#4f46e5' : 'var(--adm-border-strong, #cbd5e1)',
                      fontWeight: 700,
                    }}
                    onClick={() => handleSelectPresetDays('all')}
                  >
                    All 7 Days
                  </button>
                  <button
                    type="button"
                    className={`mkt-btn-table-action ${editPreset === 'weekdays' ? 'active' : ''}`.trim()}
                    style={{
                      fontSize: '0.78rem',
                      background: editPreset === 'weekdays' ? '#4f46e5' : 'var(--adm-bg-card, #ffffff)',
                      color: editPreset === 'weekdays' ? '#ffffff' : 'var(--adm-text-body, #334155)',
                      borderColor: editPreset === 'weekdays' ? '#4f46e5' : 'var(--adm-border-strong, #cbd5e1)',
                      fontWeight: 700,
                    }}
                    onClick={() => handleSelectPresetDays('weekdays')}
                  >
                    Mon - Fri (5 Days)
                  </button>
                  <button
                    type="button"
                    className={`mkt-btn-table-action ${editPreset === 'weekends' ? 'active' : ''}`.trim()}
                    style={{
                      fontSize: '0.78rem',
                      background: editPreset === 'weekends' ? '#4f46e5' : 'var(--adm-bg-card, #ffffff)',
                      color: editPreset === 'weekends' ? '#ffffff' : 'var(--adm-text-body, #334155)',
                      borderColor: editPreset === 'weekends' ? '#4f46e5' : 'var(--adm-border-strong, #cbd5e1)',
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
                <div className="mkt-days-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px' }}>
                  {DAYS_OF_WEEK.map((day) => {
                    const isSelected = editActiveDays.includes(day.code);
                    const isToday = day.code === todayItem.code;
                    return (
                      <div
                        key={day.code}
                        className={`mkt-day-card ${isSelected ? 'selected' : ''}`.trim()}
                        onClick={() => handleToggleDay(day.code)}
                        style={{
                          cursor: 'pointer',
                          padding: '10px 4px',
                          borderRadius: '8px',
                          textAlign: 'center',
                          border: isSelected ? '2px solid #4f46e5' : '1.5px solid var(--adm-border, #e2e8f0)',
                          background: isSelected ? 'var(--mkt-primary-soft, #eef2ff)' : 'var(--adm-bg-subtle, #f8fafc)',
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
                        <div style={{ fontSize: '0.78rem', fontWeight: 800, color: isSelected ? '#6366f1' : 'var(--adm-text-body, #475569)' }}>
                          {day.code}
                        </div>
                        <div style={{ fontSize: '0.66rem', color: 'var(--adm-text-muted, #64748b)', marginTop: '2px' }}>
                          {day.short}
                        </div>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: isSelected ? '#10b981' : 'var(--adm-text-muted, #94a3b8)', marginTop: '4px' }}>
                          ₹{editDailySpend || 300}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Summary Stats */}
              <div style={{ padding: '12px', background: 'var(--adm-bg-subtle, #f8fafc)', border: '1px solid var(--adm-border, #e2e8f0)', borderRadius: '8px', fontSize: '0.84rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--adm-text-muted, #64748b)' }}>Weekly Estimated Spend:</span>
                  <strong>₹{((Number(editDailySpend) || 300) * editActiveDays.length).toLocaleString('en-IN')}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--adm-text-muted, #64748b)' }}>Wallet Runway:</span>
                  <strong style={{ color: '#059669' }}>
                    {editDailySpend > 0 ? Math.floor(pacingCustomer.availableBalance / Number(editDailySpend)) : 0} days funded
                  </strong>
                </div>
              </div>
            </div>

            <div className="marketing-modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
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

                <div className="mkt-form-group">
                  <label className="mkt-form-label">
                    Campaign / Marketing Code (varchar)
                  </label>
                  <input
                    type="text"
                    className="mkt-form-input"
                    placeholder="e.g. META-ADS-8921, CMP-4401"
                    value={createMarketingCode}
                    onChange={(e) => setCreateMarketingCode(e.target.value.toUpperCase())}
                    style={{ fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.5px' }}
                  />
                  <div style={{ fontSize: '0.74rem', color: 'var(--adm-text-muted, #64748b)', marginTop: '4px' }}>
                    Tracking varchar code. The table will mark status as <strong>Filled</strong> without exposing the code string.
                  </div>
                </div>
              </div>

              <div className="marketing-modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', width: '100%', gap: '12px' }}>
                <button
                  type="button"
                  className="mkt-btn-table-action"
                  onClick={() => setIsCreateModalOpen(false)}
                >
                  Cancel
                </button>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
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

      {/* 6. Campaign History Modal */}
      {historyModalCustomer && (
        <div
          className="marketing-modal-backdrop"
          onClick={() => {
            setHistoryModalCustomer(null);
            setHistoryCampaigns([]);
          }}
        >
          <div
            className="marketing-modal-box"
            style={{ maxWidth: '860px', width: '100%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="marketing-modal-header">
              <div>
                <h3 style={{ margin: 0 }}>Campaign History: {historyModalCustomer.name}</h3>
                <span style={{ fontSize: '0.78rem', color: 'var(--adm-text-muted, #64748b)' }}>
                  Customer ID: {historyModalCustomer.id} • {historyCampaigns.length} recorded campaign(s)
                </span>
              </div>
              <button
                type="button"
                className="marketing-btn-close"
                onClick={() => {
                  setHistoryModalCustomer(null);
                  setHistoryCampaigns([]);
                }}
              >
                ✕
              </button>
            </div>

            <div className="marketing-modal-body">
              <SmartTable
                title="Campaign History"
                defaultPageSize={8}
                exportFilename="campaign-history"
              >
                <table className="marketing-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th>Campaign Name</th>
                      <th>Status</th>
                      <th>Daily Budget</th>
                      <th>Channel</th>
                      <th>Last Action</th>
                      <th>Actor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyCampaigns.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '30px', color: 'var(--adm-text-muted, #64748b)' }}>
                          No campaign history recorded yet.
                        </td>
                      </tr>
                    ) : (
                      historyCampaigns.map((camp, idx) => (
                        <tr key={camp.id || idx}>
                          <td>
                            <strong style={{ color: 'var(--adm-text-primary, #0f172a)', fontSize: '0.88rem' }}>
                              {camp.name || 'Untitled Campaign'}
                            </strong>
                            {camp.objective && (
                              <div className="mkt-cell-sub">{camp.objective}</div>
                            )}
                          </td>
                          <td>
                            <span
                              className={`mkt-pill ${
                                camp.status === 'Running'
                                  ? 'mkt-pill-green'
                                  : camp.status === 'Draft'
                                  ? 'mkt-pill-amber'
                                  : 'mkt-pill-slate'
                              }`}
                            >
                              {camp.status || 'Draft'}
                            </span>
                          </td>
                          <td>
                            <strong style={{ color: 'var(--adm-text-primary, #0f172a)' }}>
                              ₹{Number(camp.dailyBudget || 0).toLocaleString('en-IN')}/day
                            </strong>
                          </td>
                          <td>
                            <span style={{ fontSize: '0.82rem', color: 'var(--adm-text-body, #334155)' }}>
                              {camp.platform || 'Meta Ads'}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontSize: '0.82rem', color: 'var(--adm-text-body, #475569)' }}>
                              {camp.lastAction || 'Created'}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontSize: '0.80rem', color: 'var(--adm-text-muted, #64748b)' }}>
                              {camp.lastActor || camp.actor || 'Operator'}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </SmartTable>
            </div>

            <div className="marketing-modal-footer">
              <button
                type="button"
                className="marketing-btn-primary"
                onClick={() => {
                  setHistoryModalCustomer(null);
                  setHistoryCampaigns([]);
                }}
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
