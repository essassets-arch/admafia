/**
 * AdMafia Unified Department & Admin Authentication Service
 * Communicates with PostgreSQL system_users table
 */

const API_BASE = '';

const STORAGE_KEY = 'admafia_admin_user';
const TOKEN_KEY = 'admafia_admin_token';

export const adminAuthApi = {
  /**
   * Fetch configured departments, assigned URLs, and valid default demo credentials
   */
  async getDepartments() {
    try {
      const res = await fetch(`${API_BASE}/api/auth/admin-departments`);
      const data = await res.json();
      return data;
    } catch (err) {
      console.error('[adminAuthApi.getDepartments]', err);
      // Fallback offline catalog
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
            defaultUser: {
              username: 'superadmin',
              email: 'admin@admafia.marketing',
              password: 'SuperAdmin@2026!',
              role: 'Super Admin',
              title: 'Founders, Platform Owners & Finance Directors',
            },
            desks: ['Dashboard', 'Check Queries', 'Manage Finance', 'Check Refunds', 'Account Top-Up', 'Account Block / Activate', 'Add User / Business'],
          },
          {
            id: 'marketing',
            name: 'Marketing Department',
            icon: '✨',
            path: '/marketing',
            roleBadge: 'Marketing Manager',
            color: '#ec4899',
            defaultUser: {
              username: 'marketing',
              email: 'marketing@admafia.marketing',
              password: 'Marketing@2026!',
              role: 'Marketing Manager',
              title: 'Marketing Managers, Planners & Media Buyers',
            },
            desks: ['Marketing Overview', 'Customers Desk', 'Build Ideas Desk', 'Create Post Ideas', 'Verify Posts Desk', 'Customer Marketing Control'],
          },
          {
            id: 'graphics',
            name: 'Graphics Department',
            icon: '🎨',
            path: '/graphics',
            roleBadge: 'Senior Graphics Designer',
            color: '#06b6d4',
            defaultUser: {
              username: 'graphics',
              email: 'graphics@admafia.marketing',
              password: 'Graphics@2026!',
              role: 'Senior Graphics Designer',
              title: 'Graphic Designers & Creative Artists',
            },
            desks: ['Post Requests Queue', 'Upload Post / Creative', 'Approved Posts', 'Rejected Posts / Revisions'],
          },
          {
            id: 'sales',
            name: 'Sales Department',
            icon: '💼',
            path: '/sales',
            roleBadge: 'Sales Executive',
            color: '#10b981',
            defaultUser: {
              username: 'sales',
              email: 'sales@admafia.marketing',
              password: 'Sales@2026!',
              role: 'Sales Executive',
              title: 'Sales Executives, Telecallers & Closers',
            },
            desks: ['Sales Executive Dashboard', 'Customer Groups Desk', 'Lead Qualification & Follow-up Desks'],
          },
        ],
      };
    }
  },

  /**
   * Dynamic Admin & Department Login against PostgreSQL system_users
   */
  async login({ identifier, username, password }) {
    const res = await fetch(`${API_BASE}/api/auth/admin-login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        identifier: identifier || username,
        password,
      }),
    });

    const data = await res.json();
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
    } catch (e) {
      console.warn('[adminAuthApi] Could not save session to localStorage', e);
    }
  },

  /**
   * Get active authenticated user
   */
  getCurrentUser() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
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
   * Clear session on Sign Out
   */
  logout() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(TOKEN_KEY);
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

    // Super Admin has global override access to all departments
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

