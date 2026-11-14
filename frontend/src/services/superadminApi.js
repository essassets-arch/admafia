/**
 * AdMafia Super Admin Control Center - Authoritative Frontend API Client
 * Connects directly to backend MongoDB /api/superadmin/* routes
 */

const BASE_URL = import.meta.env?.VITE_API_URL || '/api';

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  let token = '';
  try {
    token = typeof window !== 'undefined' ? localStorage.getItem('admafia_admin_token') || '' : '';
  } catch (e) {}
  const defaultHeaders = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const response = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: {
      ...defaultHeaders,
      ...(options.headers || {}),
    },
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorMsg = json.error || `HTTP ${response.status}: ${response.statusText}`;
    throw new Error(errorMsg);
  }
  return json;
}

function buildQuery(params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== '') {
      qs.append(key, val);
    }
  });
  return qs.toString() ? `?${qs.toString()}` : '';
}

export const superadminApi = {
  // 1. Dashboard Overview
  getDashboardSummary: () => request('/superadmin/dashboard/summary'),

  // 2. Check Queries
  getQueries: (params) => request(`/superadmin/queries${buildQuery(params)}`),
  getQueryDetail: (id) => request(`/superadmin/queries/${id}`),
  replyQuery: (id, data) =>
    request(`/superadmin/queries/${id}/reply`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateQueryStatus: (id, data) =>
    request(`/superadmin/queries/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  createQuery: (data) =>
    request('/superadmin/queries', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // 3. Manage Finance
  getFinanceSummary: () => request('/superadmin/finance/summary'),
  getFinanceAccounts: (params) => request(`/superadmin/finance/accounts${buildQuery(params)}`),
  getTransactions: (params) => request(`/superadmin/finance/transactions${buildQuery(params)}`),
  getAccountLedger: (customerId) => request(`/superadmin/finance/accounts/${customerId}/ledger`),
  getExportUrl: () => `${BASE_URL}/superadmin/finance/export`,

  // 4. Check Refunds
  getRefunds: (params) => request(`/superadmin/refunds${buildQuery(params)}`),
  getPaidCustomersForRefund: (params) => request(`/superadmin/refunds/paid-customers${buildQuery(params)}`),
  getRefundReconciliation: (params) => request(`/superadmin/refunds/reconciliation${buildQuery(params)}`),
  getRefundReconciliationExportUrl: () => `${BASE_URL}/superadmin/refunds/reconciliation/export`,
  createRefund: (data) =>
    request('/superadmin/refunds', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  reviewRefund: (id, data) =>
    request(`/superadmin/refunds/${id}/review`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // 5. Account Top-Up
  getTopups: (params) => request(`/superadmin/topups${buildQuery(params)}`),
  createTopup: (data) =>
    request('/superadmin/topups', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  approveTopup: (id, data = {}) =>
    request(`/superadmin/topups/${id}/approve`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  rejectTopup: (id, data) =>
    request(`/superadmin/topups/${id}/reject`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  manualCredit: (data) =>
    request('/superadmin/topups/manual-credit', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // 6. Account Block / Activate
  getAccounts: (params) => request(`/superadmin/accounts${buildQuery(params)}`),
  updateAccountStatus: (id, data) =>
    request(`/superadmin/accounts/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  getAccountHistory: (id) => request(`/superadmin/accounts/${id}/history`),

  // 7. Add User / Business & Credentials
  createBusiness: (data) =>
    request('/superadmin/businesses', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  createUser: (data) =>
    request('/superadmin/users', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  resetAccountPassword: (id, data) =>
    request(`/superadmin/accounts/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  resetUserPassword: (id, data) =>
    request(`/superadmin/users/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getUsers: () => request('/superadmin/users'),

  // 8. Audit Logs
  getAuditLogs: (params) => request(`/superadmin/audit-logs${buildQuery(params)}`),

  // 9. Database Health, Compass Connection & Encrypted 3-2-1 Snapshots
  getDatabaseStatus: () => request('/superadmin/database/status'),
  triggerDatabaseSnapshot: (encrypt = true) =>
    request('/superadmin/database/snapshot', {
      method: 'POST',
      body: JSON.stringify({ encrypt }),
    }),
  getSnapshotDownloadUrl: (filename) => {
    let token = '';
    try {
      token = typeof window !== 'undefined' ? localStorage.getItem('admafia_admin_token') || '' : '';
    } catch (e) {}
    return `${BASE_URL}/superadmin/database/snapshots/${encodeURIComponent(filename)}/download${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  },

  // 10. High-Growth Analytics, Conversion Funnel & Churn Radar
  getGrowthAnalytics: () => request('/superadmin/growth-analytics'),
};

export default superadminApi;

