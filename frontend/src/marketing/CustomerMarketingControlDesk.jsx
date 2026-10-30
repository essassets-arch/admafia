import React, { useState, useEffect, useCallback } from 'react';
import {
  Rocket,
  Play,
  Square,
  Plus,
  RefreshCw,
  Search,
  Building,
  Wallet,
  CheckCircle2,
  AlertTriangle,
  History,
  Clock,
  Sparkles,
  Info,
  Calendar,
} from 'lucide-react';
import Swal from 'sweetalert2';
import marketingApi from '../services/marketingApi';

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
        dailyBudget: 300,
        actor: 'Marketing Campaign Manager',
        status: shouldStart ? 'Running' : 'Draft',
      });

      if (res && res.ok) {
        if (shouldStart && res.campaignId) {
          try {
            await marketingApi.startCampaign(res.campaignId, 'Marketing Campaign Manager');
          } catch (startErr) {
            console.warn('[Start Campaign Warning]', startErr);
          }
        }

        setIsCreateModalOpen(false);
        await Swal.fire({
          icon: 'success',
          title: shouldStart ? 'Marketing Started Live! 🚀' : 'Campaign Saved as Draft',
          text: shouldStart
            ? `Campaign "${campaignName}" is now active in Running status.`
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
          Budget: <strong>₹${camp.dailyBudget}/day</strong> • Platform: <strong>${camp.platform}</strong>
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

  // Start Marketing Campaign
  const handleStartMarketing = async (campaign) => {
    const confirm = await Swal.fire({
      title: `Start Marketing: ${campaign.name}?`,
      html: `
        <div style="text-align: left; font-size: 0.88rem; color: #334155; line-height: 1.5;">
          <div>Customer: <strong>${campaign.companyName}</strong></div>
          <div>Daily Ad Budget: <strong>₹${campaign.dailyBudget}/day</strong></div>
          <div>Wallet Balance: <strong>₹${campaign.walletBalance.toLocaleString('en-IN')}</strong></div>
          <div>Approved Post: <strong>${campaign.postTitle}</strong></div>
          <div style="margin-top: 10px; padding: 10px; background: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; font-size: 0.8rem; color: #b45309;">
            Notice: If external Meta Ads API is not configured on this server, campaign will be tracked in internal Running state without live Meta delivery.
          </div>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#10b981',
      confirmButtonText: 'Yes, Start Campaign',
    });

    if (!confirm.isConfirmed) return;

    try {
      const res = await marketingApi.startCampaign(campaign.id, 'Marketing Operations Manager');
      if (res && res.ok) {
        await Swal.fire({
          icon: 'success',
          title: 'Campaign Started!',
          text: res.message,
          confirmButtonColor: '#4f46e5',
        });
        fetchData(true);
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Failed to Start', text: err.message });
    }
  };

  // Stop Marketing Campaign
  const handleStopMarketing = async (campaign) => {
    const confirm = await Swal.fire({
      title: `Stop Marketing: ${campaign.name}?`,
      text: 'This will pause ad pacing and stop campaign operations.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#e11d48',
      confirmButtonText: 'Yes, Stop Campaign',
    });

    if (!confirm.isConfirmed) return;

    try {
      const res = await marketingApi.stopCampaign(campaign.id, 'Marketing Operations Manager', 'Manual Stop by Operator');
      if (res && res.ok) {
        await Swal.fire({
          icon: 'info',
          title: 'Campaign Stopped',
          text: 'The campaign has been stopped and daily pacing halted.',
          confirmButtonColor: '#4f46e5',
        });
        fetchData(true);
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Failed to Stop', text: err.message });
    }
  };

  return (
    <div className="marketing-control-page">
      {/* 1. Header */}
      <div className="marketing-page-header">
        <div className="marketing-header-title-col">
          <h1>Customer Marketing Control</h1>
          <p>
            Deploy and manage advertising campaigns connected to verified customer wallets and approved creative posts.
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
            <option value="Stopped">Stopped</option>
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
                <th>Customer / Business</th>
                <th>Category</th>
                <th>Available Balance</th>
                <th>Marketing Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '40px' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: '#64748b' }}>
                      <RefreshCw size={18} className="spin" />
                      <span>Loading marketing control dashboard...</span>
                    </div>
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '50px 20px', color: '#64748b' }}>
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

                  return (
                    <tr key={c.id}>
                      {/* Customer Info */}
                      <td>
                        <div className="mkt-cell-primary">{c.name}</div>
                        <div className="mkt-cell-sub">{c.contactPerson} • +91 {c.phone}</div>
                        {activeCampaign && (
                          <div style={{ marginTop: '4px' }}>
                            <span
                              className={`mkt-pill ${
                                activeCampaign.status === 'Running'
                                  ? 'mkt-pill-green'
                                  : activeCampaign.status === 'Draft'
                                  ? 'mkt-pill-amber'
                                  : 'mkt-pill-rose'
                              }`}
                              style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                            >
                              {activeCampaign.status === 'Running' && <span className="marketing-live-dot" />}
                              {activeCampaign.name}: {activeCampaign.status}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Category */}
                      <td>
                        <span className="mkt-pill mkt-pill-slate">{c.category}</span>
                      </td>

                      {/* Available Balance */}
                      <td>
                        <div
                          className="mkt-badge-mono"
                          style={{ color: c.availableBalance > 0 ? '#059669' : '#dc2626' }}
                        >
                          ₹{c.availableBalance.toLocaleString('en-IN')}
                        </div>
                        <div className="mkt-cell-sub">
                          Daily: ₹{c.dailyAdSpend}/day
                        </div>
                      </td>

                      {/* Actions */}
                      <td>
                        <div className="mkt-actions-flex" style={{ gap: '8px', flexWrap: 'wrap' }}>
                          {/* 1. Primary Start / Stop Button */}
                          {activeCampaign && activeCampaign.status === 'Running' ? (
                            <button
                              type="button"
                              className="mkt-btn-table-action danger"
                              onClick={() => handleStopMarketing(activeCampaign)}
                              title="Stop Running Campaign (Halts daily ad pacing)"
                              style={{ fontWeight: 800, padding: '7px 14px', background: '#ffe4e6', color: '#be123c', borderColor: '#f43f5e' }}
                            >
                              <Square size={13} fill="currentColor" />
                              <span>Stop Marketing</span>
                            </button>
                          ) : activeCampaign ? (
                            <button
                              type="button"
                              className="mkt-btn-table-action success"
                              onClick={() => handleStartMarketing(activeCampaign)}
                              title="Start / Resume Marketing Campaign"
                              style={{ fontWeight: 800, padding: '7px 14px', background: '#d1fae5', color: '#047857', borderColor: '#10b981' }}
                            >
                              <Play size={13} fill="currentColor" />
                              <span>Start Marketing</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="mkt-btn-table-action primary"
                              onClick={() => handleOpenCreateCampaign(c)}
                              title="Start Marketing Campaign for this Customer"
                              style={{ fontWeight: 800, padding: '7px 14px' }}
                            >
                              <Rocket size={13} />
                              <span>Start Marketing</span>
                            </button>
                          )}

                          {/* 2. Secondary New Campaign Button */}
                          {activeCampaign && (
                            <button
                              type="button"
                              className="mkt-btn-table-action"
                              onClick={() => handleOpenCreateCampaign(c)}
                              title="Configure New Campaign"
                              style={{ fontSize: '0.78rem', padding: '6px 10px' }}
                            >
                              <Plus size={12} />
                              <span>New</span>
                            </button>
                          )}

                          {/* 3. Customer Campaign History */}
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

      {/* 4. Create Campaign Modal */}
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

