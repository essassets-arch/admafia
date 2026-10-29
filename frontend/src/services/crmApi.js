/**
 * Growthline / AdMafia CRM — Frontend <-> PostgreSQL Backend API Client
 * Connects the React Frontend (Customer CRM & Sales Desks) to http://localhost:5000/api
 */

const isLocalhost =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

const API_BASE =
  import.meta.env?.VITE_API_BASE_URL ||
  (isLocalhost ? 'http://localhost:5000/api' : '/api');

async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;localStorage
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });
  const data = await response.json();
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || `API Error (${response.status})`);
  }
  return data;
}

export const crmApi = {
  /**
   * Check backend & PostgreSQL health
   */
  async checkHealth() {
    return apiRequest('/health');
  },

  /**
   * Fetch full CRM state from PostgreSQL and hydrate localStorage + UI
   */
  async syncStateFromPostgres() {
    try {
      const state = await apiRequest('/state');

      // 1. If local browser has any customers not yet in PostgreSQL, push them up once
      try {
        const localCustRaw = localStorage.getItem('growthline_registered_customers');
        if (localCustRaw) {
          const localCusts = JSON.parse(localCustRaw);
          if (Array.isArray(localCusts) && localCusts.length > 0) {
            const dbPhones = new Set((state.customers || []).map((c) => c.phone));
            for (const lc of localCusts) {
              if (lc.phone && !dbPhones.has(lc.phone)) {
                await this.registerCustomer({
                  username: lc.username,
                  phone: lc.phone,
                  email: lc.email,
                  password: lc.password || 'Password123!',
                  companyName: lc.companyName || lc.name,
                  contactPerson: lc.contactPerson || lc.contact,
                  city: lc.city,
                  state: lc.state,
                  category: lc.category,
                  deposit: lc.balance || lc.walletBalance || 0,
                });
              }
            }
          }
        }
      } catch (e) {}

      // Re-fetch authoritative state from PostgreSQL
      const fresh = await apiRequest('/state');

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

      window.dispatchEvent(new CustomEvent('growthline_postgres_synced', { detail: fresh }));
      return fresh;
    } catch (err) {
      console.warn('[crmApi] Backend sync warning:', err.message);
      return null;
    }
  },

  /**
   * Register a new customer in PostgreSQL (/api/auth/register)
   */
  async registerCustomer(payload) {
    const res = await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.customer;
  },

  /**
   * Authenticate customer against PostgreSQL (/api/auth/login)
   */
  async loginCustomer(identifier, password) {
    return apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    });
  },

  /**
   * Fetch isolated customer workspace from PostgreSQL (/api/customers/:identifier)
   */
  async getCustomerWorkspace(identifier) {
    return apiRequest(`/customers/${encodeURIComponent(identifier)}`);
  },

  /**
   * Update customer profile in PostgreSQL (/api/customers/:id/profile)
   */
  async updateCustomerProfile(idOrPhone, profilePayload) {
    const res = await apiRequest(`/customers/${encodeURIComponent(idOrPhone)}/profile`, {
      method: 'PUT',
      body: JSON.stringify(profilePayload),
    });
    return res.customer;
  },

  /**
   * Patch customer status / flags in PostgreSQL (/api/customers/:id)
   */
  async patchCustomer(idOrPhone, updates) {
    const res = await apiRequest(`/customers/${encodeURIComponent(idOrPhone)}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    return res.customer;
  },

  /**
   * Top up customer wallet in PostgreSQL (/api/wallets/topup)
   */
  async topUpWallet(payload) {
    return apiRequest('/wallets/topup', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Deduct daily ad spend from customer wallet in PostgreSQL (/api/wallets/deduct)
   */
  async deductDailyAdSpend(payload) {
    return apiRequest('/wallets/deduct', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Dispatch a new buyer lead to a customer in PostgreSQL (/api/leads)
   */
  async createLead(leadPayload) {
    const res = await apiRequest('/leads', {
      method: 'POST',
      body: JSON.stringify(leadPayload),
    });
    return res.lead;
  },

  /**
   * Update a lead status / read state in PostgreSQL (/api/leads/:id)
   */
  async updateLead(leadId, updates) {
    const res = await apiRequest(`/leads/${encodeURIComponent(leadId)}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    return res.lead;
  },
};

export default crmApi;

