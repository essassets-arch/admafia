/**
 * AdMafia Unified Department & Admin Authentication Service
 * Communicates with MongoDB system_users collection via HttpOnly Cookie + HS256 JWT
 */

const API_BASE = '';

const STORAGE_KEY = 'admafia_admin_user';
const TOKEN_KEY = 'admafia_admin_token';

export const adminAuthApi = {
  /**
   * Fetch configured departments and assigned URLs (zero plaintext passwords)
   */
  async getDepartments() {
    try {
      const res = await fetch(`${API_BASE}/api/auth/admin-departments`, {
        credentials: 'include',
      });
      const data = await res.json();
      return data;
    } catch (err) {
      console.error('[adminAuthApi.getDepartments]', err);
      return {
        ok: true,
        departments: [
          {
            id: 'superadmin',
            name: 'Super Admin Control Center',
            icon: '👑',
            path: '/superadmin',
            roleBadge: 'Super Admin',
            color: '#7c3aed',
            desks: ['Dashboard', 'Growth Analytics', 'Database & Snapshots', 'Check Queries', 'Manage Finance', 'Check Refunds', 'Account Top-Up', 'Account Block / Activate', 'Add User / Business'],
          },
          {
            id: 'marketing',
            name: 'Marketing Department',
            icon: '✨',
            path: '/marketing',
            roleBadge: 'Marketing Manager',
            color: '#ec4899',
            desks: ['Marketing Overview', 'Customers Desk', 'Build Ideas Desk', 'Create Post Ideas', 'Verify Posts Desk', 'Customer Marketing Control'],
          },
          {
            id: 'graphics',
            name: 'Graphics Department',
            icon: '🎨',
            path: '/graphics',
            roleBadge: 'Senior Graphics Designer',
            color: '#06b6d4',
            desks: ['Post Requests Queue', 'Upload Post / Creative', 'Approved Posts', 'Rejected Posts / Revisions'],
          },
          {
            id: 'sales',
            name: 'Sales Department',
            icon: '💼',
            path: '/sales',
            roleBadge: 'Sales Executive',
            color: '#10b981',
            desks: ['Sales Executive Dashboard', 'Customer Groups Desk', 'Lead Qualification & Follow-up Desks'],
          },
        ],
      };
    }
  },

  /**
   * Dynamic Admin & Department Login against MongoDB system_users
   */
  async login({ identifier, username, password }) {
    const res = await fetch(`${API_BASE}/api/auth/admin-login`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        identifier: identifier || username,
        password,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      throw new Error(data.error || 'Authentication failed. Please check your credentials.');
    }

    if (data.user) {
      this.saveSession(data.user, data.token);
    }
    return data;
  },

  /**
   * Save user session to localStorage
   */
  saveSession(user, token) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
      if (token) {
        localStorage.setItem(TOKEN_KEY, token);
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('admafia_admin_session_changed'));
      }
    } catch (e) {
      console.warn('[adminAuthApi] Could not save session to localStorage', e);
    }
  },

  /**
   * Get active authenticated user (requires valid, non-expired JWT token)
   */
  getCurrentUser() {
    try {
      if (typeof window === 'undefined') return null;
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const token = localStorage.getItem(TOKEN_KEY) || '';
      const parts = token.split('.');
      if (!token || token.includes('_direct') || parts.length !== 3) {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(TOKEN_KEY);
        return null;
      }
      // Verify JWT expiration claim if present
      try {
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(atob(base64));
        if (payload && typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now()) {
          localStorage.removeItem(STORAGE_KEY);
          localStorage.removeItem(TOKEN_KEY);
          return null;
        }
      } catch {}
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  },

  /**
   * Resolve default authorized workspace destination for an active staff/admin user
   */
  getDefaultWorkspace(userOverride = null) {
    const user = userOverride || this.getCurrentUser();
    if (!user) return null;
    const role = String(user.role || '').toLowerCase();
    const dept = String(user.department || '').toLowerCase();

    if (
      dept === 'super admin' ||
      role.includes('super admin') ||
      role === 'operations manager' ||
      role === 'finance auditor'
    ) {
      return { path: '/superadmin', view: 'superadmin-portal', label: 'Super Admin HQ' };
    }
    if (dept === 'sales' || role.includes('sales') || role.includes('telecaller')) {
      return { path: '/sales', view: 'sales-portal', label: 'Sales Desk' };
    }
    if (dept === 'marketing' || role.includes('marketing') || role.includes('campaign')) {
      return { path: '/marketing', view: 'marketing-portal', label: 'Marketing Desk' };
    }
    if (dept === 'graphics' || role.includes('graphic') || role.includes('designer')) {
      return { path: '/graphics', view: 'graphics-portal', label: 'Graphics Studio' };
    }
    return { path: '/superadmin', view: 'superadmin-portal', label: 'Admin Workspace' };
  },

  /**
   * Resolve workspace respecting an optional `?dept=` query if authorized, else default workspace
   */
  resolveRequestedWorkspace(deptQuery = '') {
    const user = this.getCurrentUser();
    if (!user) return null;
    const q = String(deptQuery || '').toLowerCase();
    if (q.includes('sales') && this.hasAccessTo('Sales')) {
      return { path: '/sales', view: 'sales-portal', label: 'Sales Desk' };
    }
    if (q.includes('marketing') && this.hasAccessTo('Marketing')) {
      return { path: '/marketing', view: 'marketing-portal', label: 'Marketing Desk' };
    }
    if (q.includes('graphics') && this.hasAccessTo('Graphics')) {
      return { path: '/graphics', view: 'graphics-portal', label: 'Graphics Studio' };
    }
    if ((q.includes('superadmin') || q.includes('super admin')) && this.hasAccessTo('Super Admin')) {
      return { path: '/superadmin', view: 'superadmin-portal', label: 'Super Admin HQ' };
    }
    return this.getDefaultWorkspace(user);
  },

  /**
   * Get active session token
   */
  getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY) || '';
    } catch (e) {
      return '';
    }
  },

  /**
   * Clear session & HttpOnly cookie on Sign Out
   */
  logout() {
    try {
      fetch(`${API_BASE}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      }).catch(() => {});
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(TOKEN_KEY);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('admafia_admin_session_changed'));
      }
    } catch (e) {}
  },

  /**
   * Check if current user has authorized access to a department
   * @param {'Super Admin'|'Marketing'|'Graphics'|'Sales'|string} targetDept
   */
  hasAccessTo(targetDept) {
    const user = this.getCurrentUser();
    if (!user) return false;

    const role = (user.role || '').toLowerCase();
    const dept = (user.department || '').toLowerCase();
    const target = (targetDept || '').toLowerCase();

    if (dept === 'super admin' || role === 'super admin' || role === 'operations manager' || role === 'finance auditor') {
      return true;
    }

    if (target.includes('superadmin') || target.includes('super admin')) {
      return dept === 'super admin' || role.includes('super admin');
    }

    if (target.includes('marketing')) {
      return dept === 'marketing' || role.includes('marketing') || role.includes('campaign');
    }

    if (target.includes('graphics') || target.includes('creative')) {
      return dept === 'graphics' || role.includes('graphic') || role.includes('designer');
    }

    if (target.includes('sales')) {
      return dept === 'sales' || role.includes('sales') || role.includes('telecaller');
    }

    return dept === target;
  },
};

export default adminAuthApi;
