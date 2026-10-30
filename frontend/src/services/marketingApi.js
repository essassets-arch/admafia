/**
 * AdMafia Marketing Panel - Authoritative API Client Service
 * Connects directly to backend PostgreSQL /api/marketing/* routes
 */

const BASE_URL = import.meta.env?.VITE_API_URL || '/api/marketing';

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

export const marketingApi = {
  // Summary Stats
  getSummary: () => request('/summary'),

  // Customers & Wallets
  getCustomers: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        qs.append(key, val);
      }
    });
    const queryStr = qs.toString() ? `?${qs.toString()}` : '';
    return request(`/customers${queryStr}`);
  },

  getCustomerDetail: (id) => request(`/customers/${id}`),

  getCustomerWalletTransactions: (id) => request(`/customers/${id}/wallet-transactions`),

  updateCustomerPacing: (customerId, pacingData) =>
    request(`/customers/${customerId}/pacing`, {
      method: 'PUT',
      body: JSON.stringify(pacingData),
    }),

  // Build Ideas
  getIdeas: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        qs.append(key, val);
      }
    });
    const queryStr = qs.toString() ? `?${qs.toString()}` : '';
    return request(`/ideas${queryStr}`);
  },

  createIdea: (ideaData) =>
    request('/ideas', {
      method: 'POST',
      body: JSON.stringify(ideaData),
    }),

  updateIdea: (id, ideaData) =>
    request(`/ideas/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(ideaData),
    }),

  archiveIdea: (id) =>
    request(`/ideas/${id}`, {
      method: 'DELETE',
    }),

  // Create Post Ideas & Verification
  getPosts: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        qs.append(key, val);
      }
    });
    const queryStr = qs.toString() ? `?${qs.toString()}` : '';
    return request(`/posts${queryStr}`);
  },

  createPost: (postData) =>
    request('/posts', {
      method: 'POST',
      body: JSON.stringify(postData),
    }),

  updatePost: (id, postData) =>
    request(`/posts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(postData),
    }),

  submitPostForVerification: (id, submitter = 'Marketing Content Creator') =>
    request(`/posts/${id}/submit`, {
      method: 'POST',
      body: JSON.stringify({ submitter }),
    }),

  reviewPost: (id, reviewData) =>
    request(`/posts/${id}/review`, {
      method: 'POST',
      body: JSON.stringify(reviewData),
    }),

  getPostHistory: (id) => request(`/posts/${id}/history`),

  // Media Creative Upload
  uploadMedia: (base64Data, filename = 'creative.jpg', contentType = 'image/jpeg') =>
    request('/media/upload', {
      method: 'POST',
      body: JSON.stringify({ base64Data, filename, contentType }),
    }),

  // Customer Marketing Control (Campaigns)
  getCampaigns: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        qs.append(key, val);
      }
    });
    const queryStr = qs.toString() ? `?${qs.toString()}` : '';
    return request(`/campaigns${queryStr}`);
  },

  createCampaign: (campaignData) =>
    request('/campaigns', {
      method: 'POST',
      body: JSON.stringify(campaignData),
    }),

  startCampaign: (id, actor = 'Marketing Manager') =>
    request(`/campaigns/${id}/start`, {
      method: 'POST',
      body: JSON.stringify({ actor }),
    }),

  stopCampaign: (id, actor = 'Marketing Manager', reason = '') =>
    request(`/campaigns/${id}/stop`, {
      method: 'POST',
      body: JSON.stringify({ actor, reason }),
    }),

  // Per-Day Service Pacing Runner
  processDailyPacing: () =>
    request('/process-daily-pacing', {
      method: 'POST',
    }),
};

export default marketingApi;

