import React, { useState, useEffect } from 'react';
import {
  Building2,
  UserPlus,
  Users,
  Shield,
  Phone,
  Mail,
  MapPin,
  Lock,
  Wallet,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  Briefcase,
  KeyRound,
  FileCheck,
  UserCheck
} from 'lucide-react';
import Swal from 'sweetalert2';
import superadminApi from '../services/superadminApi';

const CATEGORIES = [
  'IT & Software',
  'Real Estate & Construction',
  'Healthcare & Clinics',
  'Education & Coaching',
  'E-commerce & Retail',
  'Financial & Insurance Services',
  'Hospitality & Tourism',
  'Automotive & Transport',
  'Manufacturing & Industrial',
  'Fitness & Wellness',
  'Food & Restaurant',
  'Professional Consulting',
  'Other'
];

const ROLES = [
  { id: 'Super Admin', label: 'Super Admin', desc: 'Full platform governance, finance authorization, and user administration' },
  { id: 'Operations Manager', label: 'Operations Manager', desc: 'Manage business accounts, campaigns, queries, and operational workflows' },
  { id: 'Finance Auditor', label: 'Finance Auditor', desc: 'Verify UTR deposits, process refund requests, and audit ledger transactions' },
  { id: 'Support Agent', label: 'Support Agent', desc: 'Review, respond to, and resolve customer and business support queries' },
];

const PERMISSIONS = [
  { id: 'view_all', label: 'Global View Rights' },
  { id: 'manage_finance', label: 'Finance & Ledger Control' },
  { id: 'approve_refunds', label: 'Authorize Wallet Refunds' },
  { id: 'approve_topups', label: 'Verify & Credit Top-ups' },
  { id: 'block_accounts', label: 'Suspend / Reactivate Accounts' },
  { id: 'manage_queries', label: 'Query Desk Management' },
  { id: 'manage_users', label: 'Add / Edit System Staff' },
];

export default function SuperAdminAddUserDesk() {
  const [activeTab, setActiveTab] = useState('business'); // 'business' | 'user' | 'roster'
  const [loading, setLoading] = useState(false);
  const [businesses, setBusinesses] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState('');

  // Business Form State
  const [bizForm, setBizForm] = useState({
    companyName: '',
    contactPerson: '',
    phone: '',
    email: '',
    category: 'IT & Software',
    city: 'Mumbai',
    state: 'Maharashtra',
    password: '',
    initialBalance: '0',
  });

  // User Form State
  const [userForm, setUserForm] = useState({
    fullName: '',
    email: '',
    username: '',
    phone: '',
    password: '',
    role: 'Support Agent',
    customerId: '',
    status: 'active',
    permissions: ['view_all', 'manage_queries'],
  });

  // Fetch Businesses for user assignment dropdown
  const loadBusinesses = async () => {
    try {
      const res = await superadminApi.getAccounts({ type: 'business', limit: 100 });
      if (res.ok && res.accounts) {
        setBusinesses(res.accounts);
      }
    } catch (err) {
      console.error('Error fetching businesses for dropdown:', err);
    }
  };

  // Fetch System Users Roster
  const loadUsersList = async () => {
    setUsersLoading(true);
    try {
      const res = await superadminApi.getUsers();
      if (res.ok && res.users) {
        setUsersList(res.users);
      }
    } catch (err) {
      console.error('Error fetching system users:', err);
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => {
    loadBusinesses();
    loadUsersList();
  }, []);

  // Handle Business Submit
  const handleBusinessSubmit = async (e) => {
    e.preventDefault();

    if (!bizForm.companyName.trim()) {
      Swal.fire('Required Field', 'Please enter the Business Legal / Company Name.', 'warning');
      return;
    }
    if (!bizForm.contactPerson.trim()) {
      Swal.fire('Required Field', 'Please enter Authorized Contact Person Name.', 'warning');
      return;
    }
    const cleanPhone = String(bizForm.phone).replace(/\D/g, '').slice(-10);
    if (!cleanPhone || cleanPhone.length !== 10) {
      Swal.fire('Invalid Phone', 'Please enter a valid 10-digit Indian mobile number.', 'warning');
      return;
    }

    const initBal = parseFloat(bizForm.initialBalance) || 0;
    const confirmResult = await Swal.fire({
      title: 'Register Business Account?',
      html: `
        <div style="text-align:left; font-size:14px; line-height:1.7;">
          <p><strong>Company:</strong> ${bizForm.companyName}</p>
          <p><strong>Authorized Person:</strong> ${bizForm.contactPerson}</p>
          <p><strong>Mobile (Login):</strong> +91 ${cleanPhone}</p>
          <p><strong>Industry:</strong> ${bizForm.category}</p>
          <p><strong>Initial Wallet Balance:</strong> ₹${initBal.toLocaleString('en-IN')}</p>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#2563eb',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, Register Business',
    });

    if (!confirmResult.isConfirmed) return;

    setLoading(true);
    try {
      const payload = {
        companyName: bizForm.companyName.trim(),
        contactPerson: bizForm.contactPerson.trim(),
        phone: cleanPhone,
        email: bizForm.email.trim(),
        category: bizForm.category,
        city: bizForm.city.trim(),
        state: bizForm.state.trim(),
        password: bizForm.password.trim() || `AdMafia@${cleanPhone.slice(-4)}`,
        initialBalance: initBal,
      };

      const res = await superadminApi.createBusiness(payload);
      if (res.ok) {
        await Swal.fire({
          title: 'Business Created!',
          html: `
            <div style="text-align:left; font-size:14px; background:#f0fdf4; border:1px solid #bbf7d0; padding:14px; border-radius:8px; line-height:1.7;">
              <p style="color:#166534; font-weight:700;">Account Activated in PostgreSQL</p>
              <p><strong>Customer ID:</strong> <code>${res.customerId}</code></p>
              <p><strong>Assigned Username:</strong> <code>${res.username}</code></p>
              <p><strong>Company Name:</strong> ${res.companyName}</p>
              <p style="font-size:12px; color:#64748b; margin-top:8px;">A dedicated marketing wallet has been provisioned.</p>
            </div>
          `,
          icon: 'success',
          confirmButtonColor: '#16a34a',
        });

        // Reset form
        setBizForm({
          companyName: '',
          contactPerson: '',
          phone: '',
          email: '',
          category: 'IT & Software',
          city: 'Mumbai',
          state: 'Maharashtra',
          password: '',
          initialBalance: '0',
        });

        loadBusinesses();
      } else {
        Swal.fire('Registration Failed', res.error || 'Could not register business.', 'error');
      }
    } catch (err) {
      Swal.fire('Error', err.response?.data?.error || err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Handle User Submit
  const handleUserSubmit = async (e) => {
    e.preventDefault();

    if (!userForm.fullName.trim()) {
      Swal.fire('Required Field', 'Please enter Full Name of the staff/user.', 'warning');
      return;
    }
    if (!userForm.email.trim()) {
      Swal.fire('Required Field', 'Please enter a valid official email address.', 'warning');
      return;
    }
    if (!userForm.username.trim()) {
      Swal.fire('Required Field', 'Please enter a unique username.', 'warning');
      return;
    }

    const defaultPwd = userForm.password.trim() || 'User@2026!';
    const confirmResult = await Swal.fire({
      title: 'Create System User?',
      html: `
        <div style="text-align:left; font-size:14px; line-height:1.7;">
          <p><strong>Name:</strong> ${userForm.fullName}</p>
          <p><strong>Username:</strong> ${userForm.username}</p>
          <p><strong>Email:</strong> ${userForm.email}</p>
          <p><strong>Assigned Role:</strong> <span class="sa-role-badge sa-role-${userForm.role.toLowerCase().replace(/\s+/g, '-')}">${userForm.role}</span></p>
          <p><strong>Business Scope:</strong> ${userForm.customerId ? 'Scoped to Business ID: ' + userForm.customerId : 'Platform Staff (Global)'}</p>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#2563eb',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, Create User',
    });

    if (!confirmResult.isConfirmed) return;

    setLoading(true);
    try {
      const payload = {
        fullName: userForm.fullName.trim(),
        email: userForm.email.trim(),
        username: userForm.username.trim(),
        phone: userForm.phone.trim(),
        password: defaultPwd,
        role: userForm.role,
        permissions: userForm.permissions,
        customerId: userForm.customerId || null,
        status: userForm.status,
      };

      const res = await superadminApi.createUser(payload);
      if (res.ok) {
        await Swal.fire({
          title: 'User Created Successfully!',
          html: `
            <div style="text-align:left; font-size:14px; background:#eff6ff; border:1px solid #bfdbfe; padding:14px; border-radius:8px; line-height:1.7;">
              <p style="color:#1e40af; font-weight:700;">Account Credentials Generated</p>
              <p><strong>User ID:</strong> <code>${res.userId}</code></p>
              <p><strong>Username:</strong> <code>${res.username}</code></p>
              <p><strong>Email:</strong> ${res.email}</p>
              <p><strong>Role:</strong> ${res.role}</p>
            </div>
          `,
          icon: 'success',
          confirmButtonColor: '#2563eb',
        });

        setUserForm({
          fullName: '',
          email: '',
          username: '',
          phone: '',
          password: '',
          role: 'Support Agent',
          customerId: '',
          status: 'active',
          permissions: ['view_all', 'manage_queries'],
        });

        loadUsersList();
        setActiveTab('roster');
      } else {
        Swal.fire('Creation Failed', res.error || 'Could not create user.', 'error');
      }
    } catch (err) {
      Swal.fire('Error', err.response?.data?.error || err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const togglePermission = (permId) => {
    setUserForm((prev) => {
      const exists = prev.permissions.includes(permId);
      if (exists) {
        return { ...prev, permissions: prev.permissions.filter((p) => p !== permId) };
      } else {
        return { ...prev, permissions: [...prev.permissions, permId] };
      }
    });
  };

  const filteredUsers = usersList.filter((u) => {
    if (!userSearch.trim()) return true;
    const q = userSearch.toLowerCase();
    return (
      (u.full_name && u.full_name.toLowerCase().includes(q)) ||
      (u.email && u.email.toLowerCase().includes(q)) ||
      (u.username && u.username.toLowerCase().includes(q)) ||
      (u.role && u.role.toLowerCase().includes(q))
    );
  });

  return (
    <div className="sa-desk-content">
      {/* Desk Title Header */}
      <div className="sa-desk-header">
        <div>
          <h2>Add User / Business</h2>
          <p>Register authoritative enterprise businesses or provision platform staff with granular role permissions</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="sa-action-btn sa-btn-outline"
            onClick={() => {
              loadBusinesses();
              loadUsersList();
            }}
          >
            <RefreshCw size={14} className={usersLoading ? 'sa-spin' : ''} />
            Sync Roster
          </button>
        </div>
      </div>

      {/* Primary Sub-Tabs */}
      <div className="sa-tab-pills" style={{ marginBottom: 20 }}>
        <button
          type="button"
          className={`sa-tab-pill ${activeTab === 'business' ? 'active' : ''}`}
          onClick={() => setActiveTab('business')}
        >
          <Building2 size={15} />
          Register New Business
        </button>
        <button
          type="button"
          className={`sa-tab-pill ${activeTab === 'user' ? 'active' : ''}`}
          onClick={() => setActiveTab('user')}
        >
          <UserPlus size={15} />
          Add System User / Staff
        </button>
        <button
          type="button"
          className={`sa-tab-pill ${activeTab === 'roster' ? 'active' : ''}`}
          onClick={() => setActiveTab('roster')}
        >
          <Users size={15} />
          Staff Roster ({usersList.length})
        </button>
      </div>

      {/* TAB 1: REGISTER NEW BUSINESS */}
      {activeTab === 'business' && (
        <div className="sa-form-grid-layout">
          <form className="sa-card sa-form-card" onSubmit={handleBusinessSubmit}>
            <div className="sa-card-header">
              <div className="sa-card-title-group">
                <Building2 size={18} className="sa-brand-icon" />
                <h3>Enterprise Business Registration</h3>
              </div>
              <span className="sa-badge sa-badge-primary">PostgreSQL Backed</span>
            </div>

            <div className="sa-form-body">
              <div className="sa-form-row">
                <div className="sa-form-group">
                  <label>
                    <Briefcase size={14} /> Business Legal / Company Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Apex Marketing Solutions LLP"
                    value={bizForm.companyName}
                    onChange={(e) => setBizForm({ ...bizForm, companyName: e.target.value })}
                  />
                </div>

                <div className="sa-form-group">
                  <label>
                    <Users size={14} /> Authorized Contact Person *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Rahul Sharma (Managing Director)"
                    value={bizForm.contactPerson}
                    onChange={(e) => setBizForm({ ...bizForm, contactPerson: e.target.value })}
                  />
                </div>
              </div>

              <div className="sa-form-row">
                <div className="sa-form-group">
                  <label>
                    <Phone size={14} /> 10-Digit Mobile Number (Primary Login) *
                  </label>
                  <div className="sa-input-prefix-wrap">
                    <span className="sa-input-prefix">+91</span>
                    <input
                      type="tel"
                      required
                      maxLength="10"
                      placeholder="9876543210"
                      value={bizForm.phone}
                      onChange={(e) => setBizForm({ ...bizForm, phone: e.target.value.replace(/\D/g, '') })}
                    />
                  </div>
                </div>

                <div className="sa-form-group">
                  <label>
                    <Mail size={14} /> Official Email Address
                  </label>
                  <input
                    type="email"
                    placeholder="contact@apexmarketing.com"
                    value={bizForm.email}
                    onChange={(e) => setBizForm({ ...bizForm, email: e.target.value })}
                  />
                </div>
              </div>

              <div className="sa-form-row">
                <div className="sa-form-group">
                  <label>Industry / Business Category *</label>
                  <select
                    value={bizForm.category}
                    onChange={(e) => setBizForm({ ...bizForm, category: e.target.value })}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sa-form-group">
                  <label>
                    <MapPin size={14} /> City & State *
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <input
                      type="text"
                      required
                      placeholder="City (e.g. Mumbai)"
                      value={bizForm.city}
                      onChange={(e) => setBizForm({ ...bizForm, city: e.target.value })}
                    />
                    <input
                      type="text"
                      required
                      placeholder="State (e.g. Maharashtra)"
                      value={bizForm.state}
                      onChange={(e) => setBizForm({ ...bizForm, state: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="sa-form-row">
                <div className="sa-form-group">
                  <label>
                    <Lock size={14} /> Portal Password
                  </label>
                  <input
                    type="password"
                    placeholder="Default: Customer@2026! or custom password"
                    value={bizForm.password}
                    onChange={(e) => setBizForm({ ...bizForm, password: e.target.value })}
                  />
                  <small style={{ color: '#64748b', fontSize: '11px', marginTop: '4px' }}>
                    Leave blank to auto-generate default credentials.
                  </small>
                </div>

                <div className="sa-form-group">
                  <label>
                    <Wallet size={14} /> Initial Marketing Wallet Credit (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    placeholder="0.00"
                    value={bizForm.initialBalance}
                    onChange={(e) => setBizForm({ ...bizForm, initialBalance: e.target.value })}
                  />
                  <small style={{ color: '#64748b', fontSize: '11px', marginTop: '4px' }}>
                    If entered &gt; 0, automatically creates verified credit entry in ledger.
                  </small>
                </div>
              </div>

              <div className="sa-form-actions">
                <button
                  type="submit"
                  className="sa-action-btn sa-btn-primary"
                  disabled={loading}
                  style={{ minWidth: 200, padding: '12px 20px', fontSize: 14 }}
                >
                  <Building2 size={16} />
                  {loading ? 'Creating Business Account...' : 'Register Business'}
                </button>
              </div>
            </div>
          </form>

          {/* Quick Guidance Panel */}
          <div className="sa-side-guidance-card">
            <h4>
              <FileCheck size={16} color="#2563eb" /> Business Onboarding Rules
            </h4>
            <ul>
              <li>
                <strong>PostgreSQL Wallet Integration:</strong> Every registered business receives an isolated
                marketing wallet with ₹300/day pacing baseline.
              </li>
              <li>
                <strong>Immediate Lead Center Access:</strong> Credentials allow direct sign-in at{' '}
                <code>https://admafia.marketing/login</code>.
              </li>
              <li>
                <strong>KYC & Status:</strong> Default status is set to <code>active</code> with KYC status 100% verified.
              </li>
              <li>
                <strong>Duplicate Guard:</strong> Duplicate 10-digit mobile numbers are rejected to preserve database integrity.
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* TAB 2: ADD SYSTEM USER / STAFF */}
      {activeTab === 'user' && (
        <div className="sa-form-grid-layout">
          <form className="sa-card sa-form-card" onSubmit={handleUserSubmit}>
            <div className="sa-card-header">
              <div className="sa-card-title-group">
                <UserCheck size={18} className="sa-brand-icon" />
                <h3>Platform Staff &amp; Administrator Provisioning</h3>
              </div>
              <span className="sa-badge sa-badge-warning">Role Governance</span>
            </div>

            <div className="sa-form-body">
              <div className="sa-form-row">
                <div className="sa-form-group">
                  <label>
                    <Users size={14} /> Staff Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Priyanshu Verma"
                    value={userForm.fullName}
                    onChange={(e) => setUserForm({ ...userForm, fullName: e.target.value })}
                  />
                </div>

                <div className="sa-form-group">
                  <label>
                    <Mail size={14} /> Official Staff Email *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="verma.p@admafia.marketing"
                    value={userForm.email}
                    onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                  />
                </div>
              </div>

              <div className="sa-form-row">
                <div className="sa-form-group">
                  <label>
                    <KeyRound size={14} /> Unique Username *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. pverma"
                    value={userForm.username}
                    onChange={(e) => setUserForm({ ...userForm, username: e.target.value.toLowerCase().replace(/\s+/g, '') })}
                  />
                </div>

                <div className="sa-form-group">
                  <label>
                    <Phone size={14} /> Contact Phone Number
                  </label>
                  <input
                    type="tel"
                    placeholder="e.g. 9811223344"
                    value={userForm.phone}
                    onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })}
                  />
                </div>
              </div>

              <div className="sa-form-row">
                <div className="sa-form-group">
                  <label>
                    <Lock size={14} /> Login Password
                  </label>
                  <input
                    type="password"
                    placeholder="Default: User@2026!"
                    value={userForm.password}
                    onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                  />
                  <small style={{ color: '#64748b', fontSize: '11px', marginTop: '4px' }}>
                    Leave blank to use temporary default: <code>User@2026!</code>
                  </small>
                </div>

                <div className="sa-form-group">
                  <label>
                    <Shield size={14} /> Assigned Role *
                  </label>
                  <select
                    value={userForm.role}
                    onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                  >
                    {ROLES.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Business Scope Dropdown */}
              <div className="sa-form-group">
                <label>
                  <Building2 size={14} /> Business Scoping (Optional)
                </label>
                <select
                  value={userForm.customerId}
                  onChange={(e) => setUserForm({ ...userForm, customerId: e.target.value })}
                >
                  <option value="">Platform Staff (Antigravity Super Admin / Global HQ)</option>
                  {businesses.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.company_name} ({b.contact_person}) — {b.id}
                    </option>
                  ))}
                </select>
                <small style={{ color: '#64748b', fontSize: '11px', marginTop: '4px' }}>
                  Leave as "Platform Staff" for internal team members who manage all accounts.
                </small>
              </div>

              {/* Granular Permissions Checkboxes */}
              <div className="sa-form-group" style={{ marginTop: 8 }}>
                <label style={{ marginBottom: 8, display: 'block' }}>Granular Access Permissions</label>
                <div className="sa-permissions-grid">
                  {PERMISSIONS.map((perm) => {
                    const checked = userForm.permissions.includes(perm.id);
                    return (
                      <label key={perm.id} className={`sa-perm-checkbox-item ${checked ? 'checked' : ''}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => togglePermission(perm.id)}
                        />
                        <span>{perm.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="sa-form-actions">
                <button
                  type="submit"
                  className="sa-action-btn sa-btn-primary"
                  disabled={loading}
                  style={{ minWidth: 200, padding: '12px 20px', fontSize: 14 }}
                >
                  <UserPlus size={16} />
                  {loading ? 'Creating User...' : 'Provision User Account'}
                </button>
              </div>
            </div>
          </form>

          {/* Role Descriptions */}
          <div className="sa-side-guidance-card">
            <h4>
              <Shield size={16} color="#7c3aed" /> Approved Role Matrix
            </h4>
            <div className="sa-role-guide-list">
              {ROLES.map((r) => (
                <div key={r.id} className="sa-role-guide-item">
                  <div className="sa-role-guide-header">
                    <strong>{r.label}</strong>
                  </div>
                  <p>{r.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: STAFF ROSTER TABLE */}
      {activeTab === 'roster' && (
        <div className="sa-card">
          <div className="sa-card-header">
            <div className="sa-card-title-group">
              <Users size={18} className="sa-brand-icon" />
              <h3>Platform Staff &amp; Administrator Roster</h3>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div className="sa-search-wrap" style={{ minWidth: 260 }}>
                <Search size={15} />
                <input
                  type="text"
                  placeholder="Search staff by name, email, or role..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                />
              </div>
              <span className="sa-badge sa-badge-neutral">{filteredUsers.length} Active Users</span>
            </div>
          </div>

          <div className="sa-table-wrap">
            <table className="sa-table">
              <thead>
                <tr>
                  <th>STAFF MEMBER</th>
                  <th>ROLE</th>
                  <th>ASSIGNED BUSINESS</th>
                  <th>PERMISSIONS</th>
                  <th>STATUS</th>
                  <th>LAST LOGIN</th>
                  <th>CREATED AT</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
                      No staff members match the selected search criteria.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => {
                    const roleClass = (u.role || 'support-agent').toLowerCase().replace(/\s+/g, '-');
                    const perms = Array.isArray(u.permissions)
                      ? u.permissions
                      : typeof u.permissions === 'string'
                      ? JSON.parse(u.permissions || '[]')
                      : [];

                    return (
                      <tr key={u.id}>
                        <td>
                          <div style={{ fontWeight: 600, color: '#0f172a' }}>{u.full_name}</div>
                          <div style={{ fontSize: 12, color: '#64748b' }}>
                            <code>{u.username}</code> &bull; {u.email}
                          </div>
                          {u.phone && <div style={{ fontSize: 11, color: '#94a3b8' }}>📱 {u.phone}</div>}
                        </td>
                        <td>
                          <span className={`sa-role-badge sa-role-${roleClass}`}>
                            <Shield size={11} style={{ marginRight: 4, display: 'inline' }} />
                            {u.role}
                          </span>
                        </td>
                        <td>
                          {u.business_name ? (
                            <span style={{ fontSize: 13, color: '#334155' }}>
                              <Building2 size={12} style={{ display: 'inline', marginRight: 4 }} />
                              {u.business_name}
                            </span>
                          ) : (
                            <span className="sa-badge sa-badge-primary">Platform HQ</span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', maxWidth: 220 }}>
                            {perms.map((p, idx) => (
                              <span key={idx} className="sa-badge sa-badge-neutral" style={{ fontSize: 10 }}>
                                {p.replace('_', ' ')}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td>
                          <span
                            className={`sa-status-pill ${
                              u.status === 'active' ? 'sa-status-resolved' : 'sa-status-closed'
                            }`}
                          >
                            {u.status === 'active' ? 'Active' : 'Suspended'}
                          </span>
                        </td>
                        <td style={{ fontSize: 12, color: '#64748b' }}>
                          {u.last_login_at
                            ? new Date(u.last_login_at).toLocaleString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : 'Never'}
                        </td>
                        <td style={{ fontSize: 12, color: '#64748b' }}>
                          {u.created_at
                            ? new Date(u.created_at).toLocaleDateString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })
                            : '—'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

