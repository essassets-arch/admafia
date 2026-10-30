/**
 * AdMafia Super Admin Control Center - Authoritative Frontend API Client
 * Connects directly to backend PostgreSQL /api/superadmin/* routes
 */

const BASE_URL = import.meta.env?.VITE_API_URL || '/api';

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const defaultHeaders = {
    'Content-Type': 'application/json',
  };

  const response = await fetch(url, {
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

  // 7. Add User / Business
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
  getUsers: () => request('/superadmin/users'),

  // 8. Audit Logs
  getAuditLogs: (params) => request(`/superadmin/audit-logs${buildQuery(params)}`),
};

export default superadminApi;

