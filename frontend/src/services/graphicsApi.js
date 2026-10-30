/**
 * AdMafia Graphics Department - Authoritative API Client Service
 * Connects directly to backend PostgreSQL /api/graphics/* routes
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

export const graphicsApi = {
  // Summary Stats
  getSummary: () => request('/graphics/summary'),

  // Post Requests
  getRequests: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        qs.append(key, val);
      }
    });
    const queryStr = qs.toString() ? `?${qs.toString()}` : '';
    return request(`/graphics/requests${queryStr}`);
  },

  getRequestDetail: (id) => request(`/graphics/requests/${id}`),

  // Media Creative File Upload (uses shared secure media storage)
  uploadMedia: (base64Data, filename = 'creative.jpg', contentType = 'image/jpeg') =>
    request('/marketing/media/upload', {
      method: 'POST',
      body: JSON.stringify({ base64Data, filename, contentType }),
    }),

  // Upload Finished Artwork
  uploadArtwork: (data) =>
    request('/graphics/upload', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Reupload Corrected Artwork
  reuploadArtwork: (postId, data) =>
    request(`/graphics/requests/${postId}/reupload`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Approved Posts
  getApprovedPosts: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        qs.append(key, val);
      }
    });
    const queryStr = qs.toString() ? `?${qs.toString()}` : '';
    return request(`/graphics/approved${queryStr}`);
  },

  // Rejected Posts
  getRejectedPosts: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        qs.append(key, val);
      }
    });
    const queryStr = qs.toString() ? `?${qs.toString()}` : '';
    return request(`/graphics/rejected${queryStr}`);
  },
};

export default graphicsApi;

