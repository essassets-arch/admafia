import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  RefreshCw,
  History,
  Building2,
  Users,
  X,
  Lock,
  Unlock,
  Key,
  ExternalLink,
  Trash2,
  AlertTriangle,
  CheckSquare,
} from 'lucide-react';
import Swal from 'sweetalert2';
import superadminApi from '../services/superadminApi';
import crmApi from '../services/crmApi';
import { SmartTable } from '../components/SmartTabulator';
import { useAdminTheme } from '../utils/adminTheme';

function scrubDeletedCustomerFromBrowserStorage(deletedIds = [], deletedPhones = []) {
  try {
    if (typeof window === 'undefined') return;
    const idSet = new Set(deletedIds.filter(Boolean).map(String));
    const phoneSet = new Set(
      deletedPhones
        .filter(Boolean)
        .map((p) => String(p).replace(/\D/g, '').slice(-10))
        .filter(Boolean)
    );

    const activeRaw = localStorage.getItem('growthline_active_user');
    if (activeRaw) {
      const parsed = JSON.parse(activeRaw);
      const pPhone = String(parsed?.phone || '').replace(/\D/g, '').slice(-10);
      if (idSet.has(String(parsed?.id || '')) || (pPhone && phoneSet.has(pPhone))) {
        localStorage.removeItem('growthline_active_user');
        localStorage.removeItem('admafia_customer_token');
      }
    }

    const custsRaw = localStorage.getItem('growthline_registered_customers');
    if (custsRaw) {
      const list = JSON.parse(custsRaw);
      if (Array.isArray(list)) {
        const next = list.filter((c) => {
          const cp = String(c?.phone || '').replace(/\D/g, '').slice(-10);
          return !idSet.has(String(c?.id || '')) && !(cp && phoneSet.has(cp));
        });
        localStorage.setItem('growthline_registered_customers', JSON.stringify(next));
      }
    }

    const leadsRaw = localStorage.getItem('growthline_all_leads');
    if (leadsRaw) {
      const list = JSON.parse(leadsRaw);
      if (Array.isArray(list)) {
        const next = list.filter((l) => {
          const cp = String(l?.customerPhone || l?.customer_phone || '').replace(/\D/g, '').slice(-10);
          return !idSet.has(String(l?.customerId || l?.customer_id || '')) && !(cp && phoneSet.has(cp));
        });
        localStorage.setItem('growthline_all_leads', JSON.stringify(next));
      }
    }
  } catch {
    // Non-fatal browser cache cleanup
  }
}

export default function SuperAdminAccountsDesk() {
  const { isDark } = useAdminTheme({ syncDocument: false });
  const [activeType, setActiveType] = useState('business'); // 'business' or 'user'
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });

  // Multi-select state for bulk demo cleanup
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Status Change Modal
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [targetNewStatus, setTargetNewStatus] = useState('suspended');
  const [changeReason, setChangeReason] = useState('');
  const [submittingStatus, setSubmittingStatus] = useState(false);

  // End-to-End Permanent Delete Modal
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteReason, setDeleteReason] = useState('Demo / Test Account End-to-End Cleanup');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [submittingDelete, setSubmittingDelete] = useState(false);

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
    setSelectedIds([]);
    fetchAccounts();
  }, [fetchAccounts]);

  const toggleSelectOne = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSelectUnfundedDemoAccounts = () => {
    if (activeType !== 'business') return;
    const zeroBalIds = accounts
      .filter((b) => Number(b.available_balance || 0) <= 0)
      .map((b) => b.id);
    setSelectedIds(zeroBalIds);
  };

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

  // Open End-to-End Delete Modal
  const handleOpenDeleteModal = (target) => {
    setDeleteTarget(target);
    setDeleteReason('Demo / Test Account End-to-End Cleanup');
    setDeleteConfirmText('');
  };

  // Execute Single End-to-End Delete
  const handleConfirmPermanentDelete = async (e) => {
    e.preventDefault();
    if (!deleteTarget) return;

    const fundedBalance = activeType === 'business' ? Number(deleteTarget.available_balance || 0) : 0;
    if (fundedBalance > 0 && deleteConfirmText.trim().toUpperCase() !== 'DELETE') {
      Swal.fire({
        icon: 'warning',
        title: 'Confirmation Required',
        text: 'This business has a funded wallet balance. Type DELETE to confirm permanent removal.',
      });
      return;
    }

    setSubmittingDelete(true);
    try {
      const res = await superadminApi.deleteAccount(deleteTarget.id, {
        accountType: activeType,
        reason: deleteReason.trim() || 'Demo / Test Account End-to-End Cleanup',
      });

      if (res && res.ok) {
        const targetCopy = deleteTarget;
        setDeleteTarget(null);
        setSelectedIds((prev) => prev.filter((id) => id !== targetCopy.id));

        if (activeType === 'business') {
          scrubDeletedCustomerFromBrowserStorage([targetCopy.id], [targetCopy.phone]);
        }

        await fetchAccounts();

        const counts = res.deletedCounts || {};
        const nonZeroItems = Object.entries(counts)
          .filter(([, cnt]) => Number(cnt) > 0)
          .map(([k, cnt]) => `<span style="display:inline-block; margin:2px 4px 2px 0; padding:2px 8px; border-radius:6px; background:rgba(99,102,241,0.14); font-size:11px; font-weight:700;">${k}: ${cnt}</span>`)
          .join('');

        Swal.fire({
          icon: 'success',
          title: 'Account Purged End-to-End',
          html: `
            <div style="text-align:left; font-size:13px; line-height:1.65;">
              <p style="margin:0 0 8px 0;">${res.message || 'Account and all associated records were permanently removed.'}</p>
              ${
                nonZeroItems
                  ? `<div style="margin-top:8px;"><strong>Purged Records Breakdown:</strong><div style="margin-top:5px;">${nonZeroItems}</div></div>`
                  : ''
              }
              ${
                targetCopy.phone
                  ? `<div style="margin-top:10px; padding:8px 10px; border-radius:8px; background:rgba(16,185,129,0.12); color:#059669; font-size:12px; font-weight:700;">✓ WhatsApp OTP locks &amp; phone +91 ${targetCopy.phone} are now 100% free for fresh re-registration.</div>`
                  : ''
              }
            </div>
          `,
        });
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Delete Blocked / Failed', text: err.message });
    } finally {
      setSubmittingDelete(false);
    }
  };

  // Execute Bulk Demo Purge
  const handleBulkDeleteSelected = async () => {
    if (selectedIds.length === 0) return;

    const selectedRows = accounts.filter((a) => selectedIds.includes(a.id));
    const fundedSelected =
      activeType === 'business'
        ? selectedRows.filter((a) => Number(a.available_balance || 0) > 0)
        : [];

    const confirmOpts = {
      icon: 'warning',
      title: `Delete ${selectedIds.length} Selected ${activeType === 'business' ? 'Business' : 'User'} Account(s)?`,
      html: `
        <div style="text-align:left; font-size:13px; line-height:1.65;">
          <p style="margin:0 0 8px 0;">This permanently wipes all selected accounts end-to-end across MongoDB (wallets, transactions, leads, campaigns, posts, notifications, FCM tokens &amp; WhatsApp OTP locks).</p>
          ${
            fundedSelected.length > 0
              ? `<div style="padding:9px 11px; border-radius:8px; background:rgba(239,68,68,0.14); border:1px solid rgba(239,68,68,0.4); color:#dc2626; font-weight:700; margin-bottom:8px;">⚠️ ${fundedSelected.length} selected account(s) have a non-zero wallet balance. Type DELETE below to confirm.</div>`
              : ''
          }
        </div>
      `,
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#64748b',
      confirmButtonText: `Yes, Purge ${selectedIds.length} Account(s)`,
    };

    if (fundedSelected.length > 0) {
      confirmOpts.input = 'text';
      confirmOpts.inputPlaceholder = 'Type DELETE to confirm funded account removal';
      confirmOpts.inputValidator = (val) =>
        String(val || '').trim().toUpperCase() === 'DELETE'
          ? null
          : 'Please type DELETE to confirm.';
    }

    const confirmRes = await Swal.fire(confirmOpts);
    if (!confirmRes.isConfirmed) return;

    setBulkDeleting(true);
    try {
      const res = await superadminApi.bulkDeleteAccounts({
        ids: selectedIds,
        accountType: activeType,
        reason: 'Bulk Demo / Test Account End-to-End Cleanup by Super Admin',
      });

      if (res && res.ok) {
        if (activeType === 'business') {
          scrubDeletedCustomerFromBrowserStorage(
            selectedRows.map((r) => r.id),
            selectedRows.map((r) => r.phone)
          );
        }
        setSelectedIds([]);
        await fetchAccounts();
        Swal.fire({
          icon: 'success',
          title: `Purged ${res.deletedCount} Account(s)`,
          text: res.message,
        });
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Bulk Delete Failed', text: err.message });
    } finally {
      setBulkDeleting(false);
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

  const zeroBalanceCount =
    activeType === 'business'
      ? accounts.filter((b) => Number(b.available_balance || 0) <= 0).length
      : 0;

  return (
    <div className="sa-desk-content">
      {/* 1. Page Header */}
      <div className="sa-page-header">
        <div>
          <h1>Account Governance &amp; End-to-End Purge</h1>
          <p>
            Manage operational standing for businesses and platform users. Suspend or reactivate accounts with recorded audit reasons, or permanently delete demo/test accounts end-to-end across all MongoDB collections &amp; WhatsApp OTP locks.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {activeType === 'business' && zeroBalanceCount > 0 && (
            <button
              type="button"
              className="sa-btn-secondary"
              onClick={handleSelectUnfundedDemoAccounts}
              title="Select all ₹0 wallet business accounts on this page for fast demo cleanup"
            >
              <CheckSquare size={14} />
              <span>Select ₹0 Accounts ({zeroBalanceCount})</span>
            </button>
          )}
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
      </div>

      {/* Bulk Selection Action Banner */}
      {selectedIds.length > 0 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
            padding: '12px 16px',
            marginBottom: 14,
            borderRadius: 12,
            background: isDark ? 'rgba(239, 68, 68, 0.14)' : '#fff1f2',
            border: `1px solid ${isDark ? 'rgba(239, 68, 68, 0.38)' : '#fecdd3'}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                padding: '3px 10px',
                borderRadius: 999,
                background: '#dc2626',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: '0.78rem',
              }}
            >
              {selectedIds.length} Selected
            </span>
            <span style={{ fontSize: '0.84rem', fontWeight: 700, color: isDark ? '#fecaca' : '#9f1239' }}>
              Ready for complete end-to-end database &amp; OTP cleanup
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className="sa-btn-secondary"
              onClick={() => setSelectedIds([])}
              style={{ padding: '6px 12px', fontSize: '0.78rem' }}
            >
              Clear Selection
            </button>
            <button
              type="button"
              className="sa-btn-danger"
              disabled={bulkDeleting}
              onClick={handleBulkDeleteSelected}
              style={{ padding: '7px 14px', fontSize: '0.8rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Trash2 size={14} />
              <span>{bulkDeleting ? 'Purging...' : `Delete ${selectedIds.length} Selected End-to-End`}</span>
            </button>
          </div>
        </div>
      )}

      {/* 2. Tabs */}
      <div className="sa-tabs-bar">
        <button
          type="button"
          className={`sa-tab-btn ${activeType === 'business' ? 'active' : ''}`}
          onClick={() => {
            setActiveType('business');
            setSelectedIds([]);
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
            setSelectedIds([]);
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
                  <th style={{ width: '4%' }}>Select</th>
                  <th style={{ width: '20%' }}>Business / Company</th>
                  <th style={{ width: '17%' }}>Contact &amp; Location</th>
                  <th style={{ width: '11%' }}>Wallet Balance</th>
                  <th style={{ width: '11%' }}>Campaigns &amp; Leads</th>
                  <th style={{ width: '11%' }}>Registered Date</th>
                  <th style={{ width: '8%' }}>Status</th>
                  <th style={{ width: '18%', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--adm-text-muted, #64748b)' }}>
                      <RefreshCw size={20} className="spin" style={{ margin: '0 auto 8px' }} />
                      <div>Loading business accounts...</div>
                    </td>
                  </tr>
                ) : accounts.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: 48, color: 'var(--adm-text-muted, #94a3b8)' }}>
                      No business accounts found.
                    </td>
                  </tr>
                ) : (
                  accounts.map((b) => {
                    const isChecked = selectedIds.includes(b.id);
                    return (
                      <tr key={b.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleSelectOne(b.id)}
                            aria-label={`Select ${b.company_name}`}
                            style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#dc2626' }}
                          />
                        </td>

                        <td>
                          <strong style={{ color: 'var(--adm-text-primary, #0f172a)' }}>{b.company_name}</strong>
                          <div style={{ fontSize: '0.74rem', color: 'var(--adm-text-muted, #64748b)' }}>
                            ID: <span style={{ fontFamily: 'monospace' }}>{b.id}</span>
                          </div>
                          {b.category && (
                            <span className="sa-pill sa-pill-slate" style={{ fontSize: '0.64rem', marginTop: 3 }}>
                              {b.category}
                            </span>
                          )}
                        </td>

                        <td>
                          <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--adm-text-primary, #0f172a)' }}>{b.contact_person}</div>
                          <div style={{ fontSize: '0.74rem', color: 'var(--adm-text-muted, #64748b)' }}>
                            📞 {b.phone} {b.city ? `• ${b.city}` : ''}
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
                          <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
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
                                style={{ padding: '5px 9px', fontSize: '0.73rem' }}
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
                                style={{ padding: '5px 9px', fontSize: '0.73rem' }}
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

                            <button
                              type="button"
                              onClick={() => handleOpenDeleteModal(b)}
                              title="Delete Business Account Completely End-to-End"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '5px 9px',
                                fontSize: '0.73rem',
                                fontWeight: 800,
                                borderRadius: 7,
                                border: '1px solid rgba(220, 38, 38, 0.45)',
                                background: isDark ? 'rgba(220, 38, 38, 0.2)' : '#fee2e2',
                                color: isDark ? '#fca5a5' : '#b91c1c',
                                cursor: 'pointer',
                              }}
                            >
                              <Trash2 size={12} />
                              <span>Delete</span>
                            </button>
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
                  <th style={{ width: '5%' }}>Select</th>
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
                    <td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--adm-text-muted, #64748b)' }}>
                      <RefreshCw size={20} className="spin" style={{ margin: '0 auto 8px' }} />
                      <div>Loading system users...</div>
                    </td>
                  </tr>
                ) : accounts.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: 48, color: 'var(--adm-text-muted, #94a3b8)' }}>
                      No system users found.
                    </td>
                  </tr>
                ) : (
                  accounts.map((u) => {
                    const isChecked = selectedIds.includes(u.id);
                    return (
                      <tr key={u.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleSelectOne(u.id)}
                            aria-label={`Select ${u.username}`}
                            style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#dc2626' }}
                          />
                        </td>

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
                          <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
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
                                style={{ padding: '5px 9px', fontSize: '0.73rem' }}
                                onClick={() => handleOpenStatusModal(u, 'suspended')}
                              >
                                <Lock size={12} />
                                <span>Suspend</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="sa-btn-success"
                                style={{ padding: '5px 9px', fontSize: '0.73rem' }}
                                onClick={() => handleOpenStatusModal(u, 'active')}
                              >
                                <Unlock size={12} />
                                <span>Activate</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleOpenDeleteModal(u)}
                              title="Delete System User Account End-to-End"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '5px 9px',
                                fontSize: '0.73rem',
                                fontWeight: 800,
                                borderRadius: 7,
                                border: '1px solid rgba(220, 38, 38, 0.45)',
                                background: isDark ? 'rgba(220, 38, 38, 0.2)' : '#fee2e2',
                                color: isDark ? '#fca5a5' : '#b91c1c',
                                cursor: 'pointer',
                              }}
                            >
                              <Trash2 size={12} />
                              <span>Delete</span>
                            </button>
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

      {/* 5B. Permanent End-to-End Account Deletion Modal */}
      {deleteTarget && (() => {
        const fundedBalance = activeType === 'business' ? Number(deleteTarget.available_balance || 0) : 0;
        const requiresTypeDelete = fundedBalance > 0;
        const canConfirmDelete =
          !submittingDelete &&
          (!requiresTypeDelete || deleteConfirmText.trim().toUpperCase() === 'DELETE');

        return (
          <div className="sa-modal-backdrop" onClick={() => setDeleteTarget(null)}>
            <div className="sa-modal-card" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
              <div className="sa-modal-header">
                <div>
                  <span className="sa-pill sa-pill-rose">Irreversible End-to-End Purge</span>
                  <h3 style={{ margin: '4px 0 0 0', fontSize: '1.12rem', fontWeight: 800 }}>
                    Delete {activeType === 'business' ? 'Business Account' : 'System User'} Permanently
                  </h3>
                </div>
                <button
                  type="button"
                  className="sa-footer-btn"
                  style={{ width: 'auto', padding: 6, borderRadius: '50%' }}
                  onClick={() => setDeleteTarget(null)}
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleConfirmPermanentDelete}>
                <div className="sa-modal-body">
                  {/* Target Summary Card */}
                  <div
                    style={{
                      background: isDark ? 'rgba(239, 68, 68, 0.14)' : '#fff1f2',
                      border: `1px solid ${isDark ? 'rgba(239, 68, 68, 0.38)' : '#fecdd3'}`,
                      borderRadius: 10,
                      padding: '13px 15px',
                      marginBottom: 14,
                    }}
                  >
                    <div style={{ fontWeight: 800, fontSize: '0.94rem', color: isDark ? '#fecaca' : '#9f1239' }}>
                      {deleteTarget.company_name || deleteTarget.full_name}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--adm-text-body, #334155)', marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <span>ID: <code>{deleteTarget.id}</code></span>
                      {deleteTarget.phone && <span>Phone: <strong>+91 {deleteTarget.phone}</strong></span>}
                      {deleteTarget.username && <span>Handle: <code>@{deleteTarget.username}</code></span>}
                    </div>
                    {activeType === 'business' && (
                      <div style={{ fontSize: '0.76rem', color: 'var(--adm-text-muted, #64748b)', marginTop: 6 }}>
                        Removes end-to-end: <strong>Customer Profile</strong>, <strong>Wallet &amp; Transactions</strong>,{' '}
                        <strong>Payments &amp; GST Invoices</strong>, <strong>{deleteTarget.total_leads || 0} Leads &amp; Assignments</strong>,{' '}
                        <strong>{deleteTarget.running_campaigns || 0} Campaigns &amp; Uploaded Creatives</strong>,{' '}
                        <strong>Support Queries</strong>, <strong>Notifications &amp; FCM Tokens</strong>, and{' '}
                        <strong>WhatsApp OTP Locks</strong>.
                      </div>
                    )}
                  </div>

                  {/* Extra Guard Only If Wallet Has Real Funds */}
                  {requiresTypeDelete && (
                    <div
                      style={{
                        background: isDark ? 'rgba(245, 158, 11, 0.15)' : '#fffbeb',
                        border: `1px solid ${isDark ? 'rgba(245, 158, 11, 0.4)' : '#fde68a'}`,
                        borderRadius: 10,
                        padding: '12px 14px',
                        marginBottom: 14,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: '0.84rem', color: isDark ? '#fcd34d' : '#b45309' }}>
                        <AlertTriangle size={15} /> Funded Wallet Detected: ₹{fundedBalance.toFixed(2)}
                      </div>
                      <div style={{ fontSize: '0.77rem', color: 'var(--adm-text-body, #334155)', marginTop: 4, marginBottom: 8 }}>
                        To prevent accidental deletion of a funded client, type <strong>DELETE</strong> below to unlock permanent removal:
                      </div>
                      <input
                        type="text"
                        className="sa-search-input"
                        placeholder="Type DELETE to confirm"
                        value={deleteConfirmText}
                        onChange={(e) => setDeleteConfirmText(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: 8,
                          border: '1px solid var(--adm-border-strong, #cbd5e1)',
                          fontFamily: 'monospace',
                          fontWeight: 800,
                        }}
                      />
                    </div>
                  )}

                  <div className="sa-form-group">
                    <label className="sa-form-label">Audit Log Reason</label>
                    <input
                      type="text"
                      className="sa-search-input"
                      value={deleteReason}
                      onChange={(e) => setDeleteReason(e.target.value)}
                      placeholder="Demo / Test Account End-to-End Cleanup"
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: 8,
                        border: '1px solid var(--adm-border-strong, #cbd5e1)',
                      }}
                    />
                  </div>
                </div>

                <div className="sa-modal-footer">
                  <button
                    type="button"
                    className="sa-btn-secondary"
                    onClick={() => setDeleteTarget(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!canConfirmDelete}
                    className="sa-btn-danger"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontWeight: 800,
                      opacity: canConfirmDelete ? 1 : 0.55,
                      cursor: canConfirmDelete ? 'pointer' : 'not-allowed',
                    }}
                  >
                    <Trash2 size={14} />
                    {submittingDelete ? 'Purging End-to-End...' : 'Delete Permanently'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

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
