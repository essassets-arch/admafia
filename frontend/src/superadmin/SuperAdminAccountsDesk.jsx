import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertOctagon,
  History,
  Building2,
  Users,
  X,
  Lock,
  Unlock,
  Key,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import Swal from 'sweetalert2';
import superadminApi from '../services/superadminApi';
import crmApi from '../services/crmApi';
import { SmartTable } from '../components/SmartTabulator';
import { useAdminTheme } from '../utils/adminTheme';

export default function SuperAdminAccountsDesk() {
  const { isDark } = useAdminTheme({ syncDocument: false });
  const [activeType, setActiveType] = useState('business'); // 'business' or 'user'
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });

  // Status Change Modal
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [targetNewStatus, setTargetNewStatus] = useState('suspended');
  const [changeReason, setChangeReason] = useState('');
  const [submittingStatus, setSubmittingStatus] = useState(false);

  // Status History Modal
  const [historyTarget, setHistoryTarget] = useState(null);
  const [statusHistory, setStatusHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fetchAccounts = useCallback(async () => {
    try {
      setRefreshing(true);
      const res = await superadminApi.getAccounts({
        type: activeType,
        status: statusFilter,
        search,
        page: pagination.page,
        limit: 25,
      });

      if (res && res.ok) {
        setAccounts(res.accounts || []);
        if (res.pagination) setPagination(res.pagination);
      }
    } catch (err) {
      console.error('Failed to load accounts:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeType, statusFilter, search, pagination.page]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  // Open Status Change Modal
  const handleOpenStatusModal = (target, newStatus) => {
    setSelectedTarget(target);
    setTargetNewStatus(newStatus);
    setChangeReason('');
  };

  // Submit Status Change
  const handleSubmitStatusChange = async (e) => {
    e.preventDefault();
    if (!changeReason.trim() || !selectedTarget) {
      Swal.fire({ icon: 'warning', title: 'Mandatory reason is required.' });
      return;
    }

    setSubmittingStatus(true);
    try {
      const res = await superadminApi.updateAccountStatus(selectedTarget.id, {
        accountType: activeType,
        status: targetNewStatus,
        reason: changeReason.trim(),
        adminName: 'Super Admin',
      });

      if (res && res.ok) {
        setSelectedTarget(null);
        setChangeReason('');
        fetchAccounts();
        Swal.fire({
          icon: 'success',
          title: `Account ${targetNewStatus === 'active' ? 'Activated' : 'Suspended'}`,
          text: res.message || 'Governance status updated successfully.',
        });
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Status Change Failed', text: err.message });
    } finally {
      setSubmittingStatus(false);
    }
  };

  // Open History Modal
  const handleOpenHistory = async (target) => {
    setHistoryTarget(target);
    setLoadingHistory(true);
    try {
      const res = await superadminApi.getAccountHistory(target.id);
      if (res && res.ok) {
        setStatusHistory(res.history || []);
      }
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Launch Customer Dashboard
  const handleLaunchDashboard = async (target) => {
    try {
      const custId = target.customer_id || target.customerId || target.id || target.phone;
      if (!custId) {
        window.open('/portal', '_blank');
        return;
      }
      const res = await crmApi.getCustomerWorkspace(custId).catch(() => null);
      if (res?.customer) {
        localStorage.setItem('growthline_active_user', JSON.stringify(res.customer));
        window.open('/app/lead#app/dashboard', '_blank');
        Swal.fire({
          icon: 'success',
          title: 'Customer Dashboard Launched 🚀',
          html: `Logged into workspace for <strong>${res.customer.companyName || res.customer.name}</strong>.`,
          timer: 1600,
          showConfirmButton: false,
        });
      } else {
        window.open('/portal', '_blank');
      }
    } catch (err) {
      window.open('/portal', '_blank');
    }
  };

  // Quick Reset Password prompt
  const handlePromptResetPassword = async (target, type = 'business') => {
    const targetName = target.company_name || target.full_name || target.username;
    const defaultPrefix = type === 'business' ? 'AdMafia@' : 'User@';
    const suggested = `${defaultPrefix}${Math.floor(1000 + Math.random() * 9000)}!`;

    const { value: newPassword } = await Swal.fire({
      title: `Reset Login Password`,
      html: `
        <div style="text-align:left; font-size:13px; line-height:1.6; margin-bottom:10px;">
          <div>Target: <strong>${targetName}</strong></div>
          <div style="font-size:12px; color:#64748b;">Set a new portal password for this account.</div>
        </div>
      `,
      input: 'text',
      inputValue: suggested,
      inputLabel: 'New Portal Password',
      inputPlaceholder: 'Enter new password',
      showCancelButton: true,
      confirmButtonText: 'Update Password',
      confirmButtonColor: '#4f46e5',
      inputValidator: (val) => {
        if (!val || !val.trim()) return 'Password cannot be empty!';
      },
    });

    if (newPassword) {
      try {
        let res;
        if (type === 'business') {
          res = await superadminApi.resetAccountPassword(target.id, { newPassword: newPassword.trim() });
        } else {
          res = await superadminApi.resetUserPassword(target.id, { newPassword: newPassword.trim() });
        }

        if (res && res.ok) {
          Swal.fire({
            icon: 'success',
            title: 'Password Updated!',
            html: `
              <div style="text-align:left; font-size:13px;">
                <p>New Password: <code style="font-size:14px; color:#4338ca; font-weight:700;">${newPassword.trim()}</code></p>
                <div style="margin-top:8px; padding:8px; background:#eff6ff; border-radius:6px; font-size:12px; color:#1e40af;">
                  ✓ Updated in MongoDB. Customer can log in immediately.
                </div>
              </div>
            `,
          });
        }
      } catch (err) {
        Swal.fire('Error', err.message || 'Could not reset password.', 'error');
      }
    }
  };

  return (
    <div className="sa-desk-content">
      {/* 1. Page Header */}
      <div className="sa-page-header">
        <div>
          <h1>Account Block &amp; Activation Governance</h1>
          <p>
            Manage operational standing for businesses and platform users. Suspend non-compliant accounts with mandatory recorded reasons, view historical audit trails, and protect against lockout.
          </p>
        </div>

        <button
          type="button"
          className="sa-btn-secondary"
          onClick={fetchAccounts}
          disabled={refreshing}
        >
          <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
          <span>{refreshing ? 'Syncing...' : 'Live Refresh'}</span>
        </button>
      </div>

      {/* 2. Tabs */}
      <div className="sa-tabs-bar">
        <button
          type="button"
          className={`sa-tab-btn ${activeType === 'business' ? 'active' : ''}`}
          onClick={() => {
            setActiveType('business');
            setPagination({ page: 1, total: 0, totalPages: 1 });
          }}
        >
          <Building2 size={15} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />
          <span>Business Accounts (Customers)</span>
        </button>
        <button
          type="button"
          className={`sa-tab-btn ${activeType === 'user' ? 'active' : ''}`}
          onClick={() => {
            setActiveType('user');
            setPagination({ page: 1, total: 0, totalPages: 1 });
          }}
        >
          <Users size={15} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />
          <span>Platform &amp; System Users</span>
        </button>
      </div>

      {/* 3. Controls & Filter */}
      <div className="sa-controls-card">
        <div className="sa-search-box">
          <Search size={16} className="sa-search-icon" />
          <input
            type="text"
            className="sa-search-input"
            placeholder={
              activeType === 'business'
                ? 'Search by company name, contact, phone, ID...'
                : 'Search by full name, email, username...'
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="sa-filter-group">
          <select
            className="sa-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Account Statuses</option>
            <option value="active">Active Accounts</option>
            <option value="suspended">Blocked / Suspended</option>
          </select>
        </div>
      </div>

      {/* 4A. Business Accounts Table */}
      {activeType === 'business' && (
        <div className="sa-table-card">
          <SmartTable
            title="Business Accounts"
            exportFilename="sa-business-accounts"
            defaultPageSize={25}
          >
            <table className="sa-table">
              <thead>
                <tr>
                  <th style={{ width: '22%' }}>Business / Company</th>
                  <th style={{ width: '18%' }}>Contact &amp; Location</th>
                  <th style={{ width: '12%' }}>Wallet Balance</th>
                  <th style={{ width: '12%' }}>Campaigns &amp; Leads</th>
                  <th style={{ width: '14%' }}>Registered Date</th>
                  <th style={{ width: '10%' }}>Status</th>
                  <th style={{ width: '12%', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--adm-text-muted, #64748b)' }}>
                      <RefreshCw size={20} className="spin" style={{ margin: '0 auto 8px' }} />
                      <div>Loading business accounts...</div>
                    </td>
                  </tr>
                ) : accounts.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: 48, color: 'var(--adm-text-muted, #94a3b8)' }}>
                      No business accounts found.
                    </td>
                  </tr>
                ) : (
                  accounts.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <strong style={{ color: 'var(--adm-text-primary, #0f172a)' }}>{b.company_name}</strong>
                        <div style={{ fontSize: '0.74rem', color: 'var(--adm-text-muted, #64748b)' }}>
                          ID: <span style={{ fontFamily: 'monospace' }}>{b.id}</span>
                        </div>
                        <span className="sa-pill sa-pill-slate" style={{ fontSize: '0.64rem', marginTop: 3 }}>
                          {b.category}
                        </span>
                      </td>

                      <td>
                        <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--adm-text-primary, #0f172a)' }}>{b.contact_person}</div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--adm-text-muted, #64748b)' }}>
                          📞 {b.phone} • {b.city || 'India'}
                        </div>
                      </td>

                      <td>
                        <div style={{ fontWeight: 800, color: Number(b.available_balance) > 0 ? (isDark ? '#34d399' : '#059669') : (isDark ? '#f87171' : '#dc2626') }}>
                          ₹{Number(b.available_balance || 0).toFixed(2)}
                        </div>
                      </td>

                      <td>
                        <div style={{ fontSize: '0.80rem', fontWeight: 600, color: 'var(--adm-text-primary, #0f172a)' }}>
                          {b.running_campaigns || 0} active ads
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--adm-text-muted, #64748b)' }}>
                          {b.total_leads || 0} total leads
                        </div>
                      </td>

                      <td>
                        <div style={{ fontSize: '0.78rem', color: 'var(--adm-text-muted, #64748b)' }}>
                          {new Date(b.registered_at || b.created_at).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </div>
                      </td>

                      <td>
                        <span
                          className={`sa-pill ${
                            b.status === 'active' ? 'sa-pill-green' : 'sa-pill-rose'
                          }`}
                        >
                          {b.status}
                        </span>
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <button
                            type="button"
                            className="sa-action-btn sa-btn-outline"
                            style={{ padding: '5px 8px', fontSize: 11 }}
                            onClick={() => handleLaunchDashboard(b)}
                            title="Launch Customer Dashboard"
                          >
                            <ExternalLink size={12} />
                            <span>Dashboard</span>
                          </button>

                          <button
                            type="button"
                            className="sa-action-btn sa-btn-outline"
                            style={{ padding: '5px 8px', fontSize: 11 }}
                            onClick={() => handlePromptResetPassword(b, 'business')}
                            title="Reset Portal Password"
                          >
                            <Key size={12} />
                          </button>

                          {b.status === 'active' ? (
                            <button
                              type="button"
                              className="sa-btn-danger"
                              style={{ padding: '5px 10px', fontSize: '0.74rem' }}
                              onClick={() => handleOpenStatusModal(b, 'suspended')}
                              title="Suspend Business Account"
                            >
                              <Lock size={12} />
                              <span>Block</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="sa-btn-success"
                              style={{ padding: '5px 10px', fontSize: '0.74rem' }}
                              onClick={() => handleOpenStatusModal(b, 'active')}
                              title="Reactivate Business Account"
                            >
                              <Unlock size={12} />
                              <span>Activate</span>
                            </button>
                          )}

                          <button
                            type="button"
                            className="sa-btn-secondary"
                            style={{ padding: '5px 8px' }}
                            onClick={() => handleOpenHistory(b)}
                            title="View Status Change History"
                          >
                            <History size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </SmartTable>
        </div>
      )}

      {/* 4B. System Users Table */}
      {activeType === 'user' && (
        <div className="sa-table-card">
          <SmartTable
            title="System Users"
            exportFilename="sa-system-users"
            defaultPageSize={25}
          >
            <table className="sa-table">
              <thead>
                <tr>
                  <th>User &amp; Username</th>
                  <th>Email &amp; Phone</th>
                  <th>Role</th>
                  <th>Linked Business</th>
                  <th>Created Date</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--adm-text-muted, #64748b)' }}>
                      <RefreshCw size={20} className="spin" style={{ margin: '0 auto 8px' }} />
                      <div>Loading system users...</div>
                    </td>
                  </tr>
                ) : accounts.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: 48, color: 'var(--adm-text-muted, #94a3b8)' }}>
                      No system users found.
                    </td>
                  </tr>
                ) : (
                  accounts.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <strong style={{ color: 'var(--adm-text-primary, #0f172a)' }}>{u.full_name}</strong>
                        <div style={{ fontSize: '0.74rem', color: 'var(--adm-text-muted, #64748b)', fontFamily: 'monospace' }}>
                          @{u.username}
                        </div>
                      </td>

                      <td>
                        <div style={{ fontSize: '0.80rem', color: 'var(--adm-text-primary, #0f172a)' }}>{u.email}</div>
                        {u.phone && <div style={{ fontSize: '0.72rem', color: 'var(--adm-text-muted, #64748b)' }}>📞 {u.phone}</div>}
                      </td>

                      <td>
                        <span className="sa-pill sa-pill-indigo">
                          {u.role}
                        </span>
                      </td>

                      <td>
                        <span style={{ fontSize: '0.80rem', color: u.business_name ? 'var(--adm-text-primary, #0f172a)' : 'var(--adm-text-muted, #94a3b8)' }}>
                          {u.business_name || 'Platform Level'}
                        </span>
                      </td>

                      <td>
                        <div style={{ fontSize: '0.76rem', color: 'var(--adm-text-muted, #64748b)' }}>
                          {new Date(u.created_at).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </div>
                      </td>

                      <td>
                        <span
                          className={`sa-pill ${
                            u.status === 'active' ? 'sa-pill-green' : 'sa-pill-rose'
                          }`}
                        >
                          {u.status}
                        </span>
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <button
                            type="button"
                            className="sa-action-btn sa-btn-outline"
                            style={{ padding: '5px 8px', fontSize: 11 }}
                            onClick={() => handleLaunchDashboard(u)}
                            title="Launch Customer Dashboard as this user"
                          >
                            <ExternalLink size={12} />
                            <span>Dashboard</span>
                          </button>

                          <button
                            type="button"
                            className="sa-action-btn sa-btn-outline"
                            style={{ padding: '5px 8px', fontSize: 11 }}
                            onClick={() => handlePromptResetPassword(u, 'user')}
                            title="Reset User Password"
                          >
                            <Key size={12} />
                          </button>

                          {u.status === 'active' ? (
                            <button
                              type="button"
                              className="sa-btn-danger"
                              style={{ padding: '5px 10px', fontSize: '0.74rem' }}
                              onClick={() => handleOpenStatusModal(u, 'suspended')}
                            >
                              <Lock size={12} />
                              <span>Suspend</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="sa-btn-success"
                              style={{ padding: '5px 10px', fontSize: '0.74rem' }}
                              onClick={() => handleOpenStatusModal(u, 'active')}
                            >
                              <Unlock size={12} />
                              <span>Activate</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </SmartTable>
        </div>
      )}

      {/* 5. Status Change Modal (Mandatory Reason) */}
      {selectedTarget && (
        <div className="sa-modal-backdrop" onClick={() => setSelectedTarget(null)}>
          <div className="sa-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="sa-modal-header">
              <div>
                <span className={`sa-pill ${targetNewStatus === 'active' ? 'sa-pill-green' : 'sa-pill-rose'}`}>
                  Governance Enforcement
                </span>
                <h3 style={{ margin: '4px 0 0 0', fontSize: '1.1rem', fontWeight: 800 }}>
                  {targetNewStatus === 'active' ? 'Reactivate Account' : 'Suspend / Block Account'}
                </h3>
              </div>
              <button
                type="button"
                className="sa-footer-btn"
                style={{ width: 'auto', padding: 6, borderRadius: '50%' }}
                onClick={() => setSelectedTarget(null)}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmitStatusChange}>
              <div className="sa-modal-body">
                <div
                  style={{
                    background:
                      targetNewStatus === 'active'
                        ? isDark
                          ? 'rgba(16, 185, 129, 0.14)'
                          : '#ecfdf5'
                        : isDark
                        ? 'rgba(244, 63, 94, 0.14)'
                        : '#fff1f2',
                    border: `1px solid ${
                      targetNewStatus === 'active'
                        ? isDark
                          ? 'rgba(16, 185, 129, 0.35)'
                          : '#a7f3d0'
                        : isDark
                        ? 'rgba(244, 63, 94, 0.35)'
                        : '#fecdd3'
                    }`,
                    borderRadius: 8,
                    padding: '12px 14px',
                    marginBottom: 16,
                  }}
                >
                  <div
                    style={{
                      fontSize: '0.86rem',
                      color:
                        targetNewStatus === 'active'
                          ? isDark
                            ? '#6ee7b7'
                            : '#065f46'
                          : isDark
                          ? '#fda4af'
                          : '#9f1239',
                      fontWeight: 700,
                    }}
                  >
                    Target: {selectedTarget.company_name || selectedTarget.full_name} ({selectedTarget.id})
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--adm-text-muted, #64748b)', marginTop: 4 }}>
                    {targetNewStatus === 'suspended'
                      ? '⚠️ Blocking this business will automatically pause running ad campaigns and hold wallet pacing.'
                      : '✓ Reactivating will restore normal workspace permissions and campaign eligibility.'}
                  </div>
                </div>

                <div className="sa-form-group">
                  <label className="sa-form-label">Mandatory Action Reason *</label>
                  <textarea
                    rows={4}
                    required
                    className="sa-form-textarea"
                    placeholder={
                      targetNewStatus === 'suspended'
                        ? 'e.g. Compliance review failure, non-payment of invoice, requested by customer, policy violation...'
                        : 'e.g. Account audit cleared, pending dues cleared, compliance verified...'
                    }
                    value={changeReason}
                    onChange={(e) => setChangeReason(e.target.value)}
                  />
                </div>
              </div>

              <div className="sa-modal-footer">
                <button
                  type="button"
                  className="sa-btn-secondary"
                  onClick={() => setSelectedTarget(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingStatus || !changeReason.trim()}
                  className={targetNewStatus === 'active' ? 'sa-btn-success' : 'sa-btn-danger'}
                >
                  {submittingStatus
                    ? 'Updating...'
                    : targetNewStatus === 'active'
                    ? 'Confirm Reactivation'
                    : 'Confirm Suspension'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. Status History Drawer / Modal */}
      {historyTarget && (
        <div className="sa-modal-backdrop" onClick={() => setHistoryTarget(null)}>
          <div
            className="sa-modal-card"
            style={{ maxWidth: '760px', width: '100%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sa-modal-header">
              <div>
                <span className="sa-pill sa-pill-indigo">Status Change Audit Trail</span>
                <h3 style={{ margin: '4px 0 0 0', fontSize: '1.1rem', fontWeight: 800 }}>
                  {historyTarget.company_name || historyTarget.full_name}
                </h3>
              </div>
              <button
                type="button"
                className="sa-footer-btn"
                style={{ width: 'auto', padding: 6, borderRadius: '50%' }}
                onClick={() => setHistoryTarget(null)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="sa-modal-body">
              {loadingHistory ? (
                <div style={{ textAlign: 'center', padding: 32, color: 'var(--adm-text-muted, #64748b)' }}>
                  <RefreshCw size={20} className="spin" style={{ margin: '0 auto 8px' }} />
                  <div>Loading status history...</div>
                </div>
              ) : (
                <SmartTable
                  title="Account Status History"
                  defaultPageSize={8}
                  exportFilename="account-status-history"
                >
                  <table className="sa-table">
                    <thead>
                      <tr>
                        <th>Transition</th>
                        <th>Changed By</th>
                        <th>Reason</th>
                        <th>Timestamp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statusHistory.length === 0 ? (
                        <tr>
                          <td colSpan={4} style={{ textAlign: 'center', padding: 32, color: 'var(--adm-text-muted, #94a3b8)' }}>
                            No prior status changes recorded for this account.
                          </td>
                        </tr>
                      ) : (
                        statusHistory.map((h, idx) => (
                          <tr key={h.id || idx}>
                            <td>
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <span className="sa-pill sa-pill-slate">{h.previous_status || '—'}</span>
                                <span style={{ color: 'var(--adm-text-muted, #64748b)', fontWeight: 700 }}>→</span>
                                <span
                                  className={`sa-pill ${
                                    h.new_status === 'active' ? 'sa-pill-green' : 'sa-pill-rose'
                                  }`}
                                >
                                  {h.new_status || '—'}
                                </span>
                              </div>
                            </td>
                            <td>
                              <strong style={{ fontSize: '0.82rem', color: 'var(--adm-text-primary, #0f172a)' }}>
                                {h.changed_by || 'Super Admin'}
                              </strong>
                            </td>
                            <td style={{ fontSize: '0.82rem', color: 'var(--adm-text-body, #334155)' }}>
                              {h.reason || '—'}
                            </td>
                            <td style={{ fontSize: '0.76rem', color: 'var(--adm-text-muted, #64748b)' }}>
                              {h.created_at
                                ? new Date(h.created_at).toLocaleString('en-IN', {
                                    timeZone: 'Asia/Kolkata',
                                    day: '2-digit',
                                    month: 'short',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                : '—'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </SmartTable>
              )}
            </div>

            <div className="sa-modal-footer">
              <button
                type="button"
                className="sa-btn-secondary"
                onClick={() => setHistoryTarget(null)}
              >
                Close History
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

