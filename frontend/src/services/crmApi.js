/**
 * Growthline / AdMafia CRM — Frontend <-> MongoDB Backend API Client
 * Supports HttpOnly Session Cookies + Bearer JWT RBAC + Tenant Isolation
 */

export const CUSTOMER_TOKEN_KEY = 'admafia_customer_token';
const ADMIN_TOKEN_KEY = 'admafia_admin_token';

const isViteDevServer =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
  window.location.port === '5173';

const API_BASE =
  import.meta.env?.VITE_API_BASE_URL || (isViteDevServer ? 'http://localhost:5000/api' : '/api');

export function getActiveAuthToken() {
  if (typeof window === 'undefined') return '';
  try {
    const p = (window.location.pathname || '').toLowerCase();
    const h = (window.location.hash || '').toLowerCase();
    const isStaffSurface =
      p.startsWith('/superadmin') ||
      p.startsWith('/admin') ||
      p.startsWith('/sales') ||
      p.startsWith('/marketing') ||
      p.startsWith('/graphics') ||
      h.startsWith('#superadmin') ||
      h.startsWith('#/superadmin') ||
      h.startsWith('#sales') ||
      h.startsWith('#marketing') ||
      h.startsWith('#graphics');

    const adminTok = localStorage.getItem(ADMIN_TOKEN_KEY) || '';
    const custTok = localStorage.getItem(CUSTOMER_TOKEN_KEY) || '';
    if (isStaffSurface) {
      return adminTok || custTok;
    }
    return custTok || adminTok;
  } catch (e) {
    return '';
  }
}

async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const token = getActiveAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(url, {
    credentials: 'include',
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    const err = new Error(data.error || `API Error (${response.status})`);
    err.status = response.status;
    err.code = data.code || null;
    err.payload = data;
    throw err;
  }
  return data;
}

export const crmApi = {
  getCustomerToken() {
    try {
      return typeof window !== 'undefined' ? localStorage.getItem(CUSTOMER_TOKEN_KEY) || '' : '';
    } catch (e) {
      return '';
    }
  },

  saveCustomerToken(token) {
    try {
      if (typeof window !== 'undefined' && token) {
        localStorage.setItem(CUSTOMER_TOKEN_KEY, token);
      }
    } catch (e) {}
  },

  async logout() {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      }).catch(() => {});
    } finally {
      try {
        localStorage.removeItem(CUSTOMER_TOKEN_KEY);
        localStorage.removeItem('growthline_active_user');
      } catch (e) {}
    }
  },

  /**
   * Check backend & MongoDB health
   */
  async checkHealth() {
    return apiRequest('/health');
  },

  /**
   * Synchronize CRM state safely based on active role:
   * - Staff (Admin/Sales/Marketing/Graphics): fetches /api/state
   * - Customer: fetches tenant-isolated /api/me/workspace (never exposes other tenants)
   * - Anonymous visitor: no-op (zero payload / zero DB scan)
   */
  async syncStateFromPostgres() {
    if (typeof window === 'undefined') return null;
    try {
      const adminTok = localStorage.getItem(ADMIN_TOKEN_KEY) || '';
      const custTok = localStorage.getItem(CUSTOMER_TOKEN_KEY) || '';
      const p = (window.location.pathname || '').toLowerCase();
      const h = (window.location.hash || '').toLowerCase();
      const isCustomerPortal = p.startsWith('/app') || h.includes('#app') || (!adminTok && Boolean(custTok));

      if (!adminTok && !custTok) {
        return null;
      }

      if (isCustomerPortal && custTok) {
        const ws = await this.getMyWorkspace();
        if (ws?.customer) {
          localStorage.setItem('growthline_active_user', JSON.stringify(ws.customer));
          window.dispatchEvent(new CustomEvent('growthline_active_user_changed', { detail: ws.customer }));
        }
        if (Array.isArray(ws?.leads)) {
          localStorage.setItem('growthline_all_leads', JSON.stringify(ws.leads));
        }
        if (Array.isArray(ws?.transactions)) {
          localStorage.setItem('growthline_wallet_transactions', JSON.stringify(ws.transactions));
        }
        if (Array.isArray(ws?.invoices)) {
          localStorage.setItem('growthline_wallet_invoices', JSON.stringify(ws.invoices));
        }
        window.dispatchEvent(new CustomEvent('growthline_postgres_synced', { detail: ws }));
        window.dispatchEvent(new CustomEvent('growthline_database_synced', { detail: ws }));
        window.dispatchEvent(new CustomEvent('growthline_mongo_synced', { detail: ws }));
        return ws;
      }

      // Staff full operational state sync
      const fresh = await apiRequest('/state', {
        headers: adminTok ? { Authorization: `Bearer ${adminTok}` } : {},
      });

      if (Array.isArray(fresh.customers)) {
        localStorage.setItem('growthline_registered_customers', JSON.stringify(fresh.customers));
      }
      if (Array.isArray(fresh.leads)) {
        localStorage.setItem('growthline_all_leads', JSON.stringify(fresh.leads));
      }
      if (Array.isArray(fresh.payments)) {
        localStorage.setItem('growthline_payment_records', JSON.stringify(fresh.payments));
      }
      if (Array.isArray(fresh.verifications)) {
        localStorage.setItem('growthline_pending_verifications', JSON.stringify(fresh.verifications));
      }
      if (Array.isArray(fresh.groups)) {
        localStorage.setItem('growthline_customer_groups', JSON.stringify(fresh.groups));
      }
      if (Array.isArray(fresh.masterLeads)) {
        localStorage.setItem('growthline_master_leads', JSON.stringify(fresh.masterLeads));
      }
      if (Array.isArray(fresh.queries)) {
        localStorage.setItem('growthline_support_queries', JSON.stringify(fresh.queries));
      }
      if (Array.isArray(fresh.failedTransactions)) {
        localStorage.setItem('growthline_failed_transactions', JSON.stringify(fresh.failedTransactions));
      }
      if (Array.isArray(fresh.allTransactions)) {
        localStorage.setItem('growthline_all_transactions', JSON.stringify(fresh.allTransactions));
      }
      if (Array.isArray(fresh.deletedFailedTransactions)) {
        localStorage.setItem('growthline_deleted_failed_transactions', JSON.stringify(fresh.deletedFailedTransactions));
      }

      window.dispatchEvent(new CustomEvent('growthline_postgres_synced', { detail: fresh }));
      window.dispatchEvent(new CustomEvent('growthline_database_synced', { detail: fresh }));
      window.dispatchEvent(new CustomEvent('growthline_mongo_synced', { detail: fresh }));
      return fresh;
    } catch (err) {
      console.warn('[crmApi] Backend sync warning:', err.message);
      return null;
    }
  },

  async syncStateFromMongo() {
    return this.syncStateFromPostgres();
  },

  async syncStateFromDatabase() {
    return this.syncStateFromPostgres();
  },

  /**
   * Meta WhatsApp Cloud API v26.0 OTP Endpoints
   */
  async sendWhatsAppOtp(payload) {
    return apiRequest('/auth/otp/send', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async verifyWhatsAppOtp(payload) {
    return apiRequest('/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async checkUsernameAvailability(username) {
    return apiRequest(`/auth/check-username?username=${encodeURIComponent(String(username || '').trim())}`);
  },

  async resetPasswordWithOtp(payload) {
    return apiRequest('/auth/password/reset-otp', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async verifyExistingPhone(payload) {
    return apiRequest('/auth/verify-existing-phone', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Register a new WhatsApp-verified customer in MongoDB (/api/auth/register)
   */
  async registerCustomer(payload) {
    const res = await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res.token) {
      this.saveCustomerToken(res.token);
    }
    return res.customer;
  },

  /**
   * Authenticate customer against MongoDB (/api/auth/login)
   */
  async loginCustomer(identifier, password) {
    const res = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    });
    if (res.token) {
      this.saveCustomerToken(res.token);
    }
    return res;
  },

  /**
   * Fetch paginated, tenant-isolated customer workspace (/api/me/workspace)
   */
  async getMyWorkspace(params = {}) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const queryStr = qs.toString() ? `?${qs.toString()}` : '';
    return apiRequest(`/me/workspace${queryStr}`);
  },

  /**
   * Fetch isolated customer workspace from MongoDB (/api/customers/:identifier)
   */
  async getCustomerWorkspace(identifier) {
    return apiRequest(`/customers/${encodeURIComponent(identifier)}`);
  },

  /**
   * Real-Time Notifications & Firebase Cloud Messaging (FCM)
   */
  async getNotificationConfig() {
    return apiRequest('/notifications/config');
  },

  async getNotifications(limit = 30) {
    return apiRequest(`/notifications?limit=${encodeURIComponent(limit)}`);
  },

  async markNotificationRead(id) {
    return apiRequest(`/notifications/${encodeURIComponent(id)}/read`, {
      method: 'PATCH',
    });
  },

  async markAllNotificationsRead() {
    return apiRequest('/notifications/read-all', {
      method: 'POST',
    });
  },

  async registerFcmToken(token, platform = 'web') {
    return apiRequest('/notifications/fcm-token', {
      method: 'POST',
      body: JSON.stringify({ token, platform }),
    });
  },

  /**
   * Update customer profile in MongoDB (/api/customers/:id/profile)
   */
  async updateCustomerProfile(idOrPhone, profilePayload) {
    const res = await apiRequest(`/customers/${encodeURIComponent(idOrPhone)}/profile`, {
      method: 'PUT',
      body: JSON.stringify(profilePayload),
    });
    return res.customer;
  },

  /**
   * Patch customer status / flags in MongoDB (/api/customers/:id)
   */
  async patchCustomer(idOrPhone, updates) {
    const res = await apiRequest(`/customers/${encodeURIComponent(idOrPhone)}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    return res.customer;
  },

  /**
   * Permanently delete customer from MongoDB (/api/customers/:identifier)
   */
  async deleteCustomer(idOrPhone) {
    const res = await apiRequest(`/customers/${encodeURIComponent(idOrPhone)}`, {
      method: 'DELETE',
    });
    try {
      const raw = localStorage.getItem('growthline_registered_customers');
      if (raw) {
        const custs = JSON.parse(raw);
        const norm = String(idOrPhone).replace(/\D/g, '').slice(-10);
        const filtered = custs.filter((c) => {
          const cNorm = String(c.phone || c.id || '').replace(/\D/g, '').slice(-10);
          return c.id !== idOrPhone && c.username !== idOrPhone && (!norm || cNorm !== norm);
        });
        localStorage.setItem('growthline_registered_customers', JSON.stringify(filtered));
      }
    } catch (e) {
      console.warn('Could not remove customer from localStorage', e);
    }
    return res;
  },

  /**
   * Top up customer wallet in MongoDB (/api/wallets/topup)
   */
  async topUpWallet(payload) {
    return apiRequest('/wallets/topup', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Sales Desk Manual Wallet Top-Up (/api/sales/wallet/topup)
   */
  async salesTopUpWallet(payload) {
    return apiRequest('/sales/wallet/topup', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Record a failed transaction in the customer's wallet ledger
   */
  async recordFailedTransaction(payload) {
    return apiRequest('/wallets/failed-transaction', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Retrieve all master transaction logs across all customers for Sales desk
   */
  async fetchAllTransactions() {
    return apiRequest('/sales/transactions', { method: 'GET' });
  },

  /**
   * Delete a specific payment record by receipt number, UTR, or ID
   */
  async deletePayment(id) {
    return apiRequest(`/payments/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  /**
   * Retrieve Customer Balance Audit Logs
   */
  async getBalanceLogs(params = {}) {
    const cleanParams = {};
    if (params && typeof params === 'object') {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '' && v !== 'all' && v !== 'undefined' && v !== 'null') {
          cleanParams[k] = v;
        }
      });
    }
    const query = new URLSearchParams(cleanParams).toString();
    return apiRequest(`/sales/balance-logs${query ? `?${query}` : ''}`, {
      method: 'GET',
    });
  },

  async getFailedTransactions() {
    return apiRequest('/sales/failed-transactions');
  },

  async deleteFailedTransaction(id, txSnapshot = null) {
    return apiRequest(`/sales/failed-transactions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      body: txSnapshot ? JSON.stringify({ txSnapshot }) : undefined,
    });
  },

  async clearAllFailedTransactions(recordsSnapshot = null) {
    return apiRequest('/sales/failed-transactions/all', {
      method: 'DELETE',
      body: recordsSnapshot ? JSON.stringify({ recordsSnapshot }) : undefined,
    });
  },

  async getFailedTransactionsHistory() {
    return apiRequest('/sales/failed-transactions/history', { method: 'GET' });
  },

  async restoreFailedTransaction(id) {
    return apiRequest('/sales/failed-transactions/history/restore', {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
  },

  async deleteFailedTransactionHistory(id) {
    return apiRequest(`/sales/failed-transactions/history/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  async clearAllFailedTransactionHistory() {
    return apiRequest('/sales/failed-transactions/history/all', {
      method: 'DELETE',
    });
  },

  async getQueries(params = {}) {
    const queryStr = new URLSearchParams(params).toString();
    return apiRequest(`/queries${queryStr ? `?${queryStr}` : ''}`);
  },

  async createQuery(payload) {
    return apiRequest('/queries', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateQuery(id, payload) {
    return apiRequest(`/queries/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async deleteQuery(id) {
    return apiRequest(`/queries/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  async getRazorpayConfig() {
    return apiRequest('/payments/razorpay/config', { method: 'GET' });
  },

  async createRazorpayOrder(payload) {
    return apiRequest('/payments/razorpay/order', { method: 'POST', body: JSON.stringify(payload) });
  },

  async createRazorpayPaymentLink(payload) {
    return apiRequest('/payments/razorpay/payment-link', { method: 'POST', body: JSON.stringify(payload) });
  },

  async verifyRazorpayPayment(payload) {
    return apiRequest('/payments/razorpay/verify', { method: 'POST', body: JSON.stringify(payload) });
  },

  async deductDailyAdSpend(payload) {
    return apiRequest('/wallets/deduct', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async createLead(leadPayload) {
    const res = await apiRequest('/leads', {
      method: 'POST',
      body: JSON.stringify(leadPayload),
    });
    return res.lead;
  },

  async updateLead(leadId, updates) {
    const res = await apiRequest(`/leads/${encodeURIComponent(leadId)}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    return res.lead;
  },

  async getCategories() {
    const res = await apiRequest('/categories');
    return res.categories || [];
  },

  async previewCategoryRecipients(category, groupId = '') {
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (groupId) params.set('groupId', groupId);
    return apiRequest(`/categories/preview?${params.toString()}`);
  },

  async getGroups() {
    const res = await apiRequest('/groups');
    return res.groups || [];
  },

  async createGroup(payload) {
    const res = await apiRequest('/groups', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.group;
  },

  async updateGroup(groupId, updates) {
    const res = await apiRequest(`/groups/${encodeURIComponent(groupId)}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    return res.group;
  },

  async deleteGroup(groupId) {
    return apiRequest(`/groups/${encodeURIComponent(groupId)}`, {
      method: 'DELETE',
    });
  },

  async getGroupMembers(groupId) {
    const res = await apiRequest(`/groups/${encodeURIComponent(groupId)}/members`);
    return res.members || [];
  },

  async assignCustomersToGroup(groupId, customerIds) {
    return apiRequest(`/groups/${encodeURIComponent(groupId)}/members`, {
      method: 'POST',
      body: JSON.stringify({ customerIds }),
    });
  },

  async removeCustomerFromGroup(groupId, customerId) {
    return apiRequest(`/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(customerId)}`, {
      method: 'DELETE',
    });
  },

  async previewDistributionRecipients(groupId) {
    return apiRequest(`/groups/${encodeURIComponent(groupId)}/preview-recipients`);
  },

  async distributeLead(payload) {
    return apiRequest('/leads/distribute', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async getDistributionHistory() {
    const res = await apiRequest('/leads/distribution-history');
    return res.history || [];
  },

  async getDistributionDetails(masterLeadId) {
    return apiRequest(`/leads/distribution-history/${encodeURIComponent(masterLeadId)}`);
  },

  async updateLeadAssignment(assignmentId, updates) {
    const res = await apiRequest(`/lead-assignments/${encodeURIComponent(assignmentId)}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    return res.assignment;
  },
};

export default crmApi;
