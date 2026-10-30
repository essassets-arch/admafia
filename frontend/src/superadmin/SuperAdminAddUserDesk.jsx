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
  UserCheck,
  Eye,
  EyeOff,
  Copy,
  ExternalLink,
  Sparkles,
  Key,
  X,
  Check,
} from 'lucide-react';
import Swal from 'sweetalert2';
import superadminApi from '../services/superadminApi';
import crmApi from '../services/crmApi';

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
  'Other',
];

const ROLES = [
  { id: 'Client User', label: 'Client User (Customer Portal)', desc: 'Client team member with access to business leads, ad campaigns, and enquiries in Customer Dashboard' },
  { id: 'Client Admin', label: 'Client Admin (Customer Portal Admin)', desc: 'Client administrator managing business leads, campaign pacing, and marketing wallet' },
  { id: 'Super Admin', label: 'Super Admin (Platform HQ)', desc: 'Full platform governance, finance authorization, and user administration' },
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

const generateRandomPassword = (prefix = 'AdMafia@') => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rand = '';
  for (let i = 0; i < 4; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}${rand}!`;
};

export default function SuperAdminAddUserDesk() {
  const [activeTab, setActiveTab] = useState('business'); // 'business' | 'user' | 'roster'
  const [loading, setLoading] = useState(false);
  const [businesses, setBusinesses] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState('');

  // Password visibility toggles
  const [showBizPassword, setShowBizPassword] = useState(false);
  const [showUserPassword, setShowUserPassword] = useState(false);

  // Business Form State
  const [bizForm, setBizForm] = useState({
    companyName: '',
    contactPerson: '',
    phone: '',
    email: '',
    username: '',
    category: 'IT & Software',
    city: 'Mumbai',
    state: 'Maharashtra',
    password: generateRandomPassword('AdMafia@'),
    initialBalance: '0',
  });

  // User Form State
  const [userForm, setUserForm] = useState({
    fullName: '',
    email: '',
    username: '',
    phone: '',
    password: generateRandomPassword('User@'),
    role: 'Client User',
    customerId: '',
    status: 'active',
    permissions: ['view_all', 'manage_queries'],
  });

  // Credential Modal State (displays upon user/business creation)
  const [credentialModal, setCredentialModal] = useState({
    isOpen: false,
    data: null,
  });

  // Reset Password Modal State
  const [resetModal, setResetModal] = useState({
    isOpen: false,
    target: null,
    type: 'user', // 'user' or 'business'
    newPassword: '',
    submitting: false,
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

  // Launch Customer Dashboard helper
  const handleLaunchDashboard = async (target) => {
    try {
      const custId =
        target.customerId ||
        target.customer_id ||
        target.id ||
        (target.phone ? String(target.phone).replace(/\D/g, '').slice(-10) : null);

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
          html: `Logged into isolated workspace for <strong>${res.customer.companyName || res.customer.name}</strong>.`,
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

  // Copy Credentials Helper
  const handleCopyCredentials = (c) => {
    const text = `AdMafia Customer Portal Login Credentials:
Portal URL: ${c.loginUrl || 'https://admafia.marketing/portal'}
Business / Account: ${c.companyName || c.fullName || 'AdMafia Account'}
Mobile (Login): ${c.mobile || c.phone ? '+91 ' + (c.mobile || c.phone) : 'N/A'}
Email: ${c.email || 'N/A'}
Username: ${c.username || 'N/A'}
Login Password: ${c.password || 'N/A'}
Role: ${c.role || 'Business Customer'}`;

    navigator.clipboard.writeText(text);
    Swal.fire({
      icon: 'success',
      title: 'Credentials Copied!',
      text: 'Login details copied to clipboard.',
      timer: 1400,
      showConfirmButton: false,
    });
  };

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
    if (!bizForm.password.trim()) {
      Swal.fire('Password Required', 'Please set a portal login password for the business account.', 'warning');
      return;
    }

    const initBal = parseFloat(bizForm.initialBalance) || 0;
    const confirmResult = await Swal.fire({
      title: 'Register Business & Create Login?',
      html: `
        <div style="text-align:left; font-size:14px; line-height:1.7;">
          <p><strong>Company:</strong> ${bizForm.companyName}</p>
          <p><strong>Contact Person:</strong> ${bizForm.contactPerson}</p>
          <p><strong>Mobile (Login):</strong> +91 ${cleanPhone}</p>
          <p><strong>Login Password:</strong> <code>${bizForm.password}</code></p>
          <p><strong>Industry:</strong> ${bizForm.category}</p>
          <p><strong>Initial Wallet Balance:</strong> ₹${initBal.toLocaleString('en-IN')}</p>
          <div style="margin-top:10px; padding:10px; background:#eff6ff; border-radius:6px; font-size:12px; color:#1e40af;">
            ✓ Business owner can log in at <code>https://admafia.marketing/portal</code> immediately.
          </div>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#2563eb',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, Register & Create Login',
    });

    if (!confirmResult.isConfirmed) return;

    setLoading(true);
    try {
      const payload = {
        companyName: bizForm.companyName.trim(),
        contactPerson: bizForm.contactPerson.trim(),
        phone: cleanPhone,
        email: bizForm.email.trim(),
        username: bizForm.username.trim() || `biz_${cleanPhone}`,
        category: bizForm.category,
        city: bizForm.city.trim(),
        state: bizForm.state.trim(),
        password: bizForm.password.trim(),
        initialBalance: initBal,
      };

      const res = await superadminApi.createBusiness(payload);
      if (res.ok) {
        setCredentialModal({
          isOpen: true,
          data: {
            title: 'Business Account & Customer Login Created!',
            companyName: res.companyName || bizForm.companyName,
            customerId: res.customerId,
            username: res.username,
            mobile: cleanPhone,
            email: bizForm.email.trim() || 'N/A',
            password: res.password || bizForm.password,
            role: 'Business Owner (Customer Portal)',
            loginUrl: 'https://admafia.marketing/portal',
          },
        });

        // Reset form with fresh password
        setBizForm({
          companyName: '',
          contactPerson: '',
          phone: '',
          email: '',
          username: '',
          category: 'IT & Software',
          city: 'Mumbai',
          state: 'Maharashtra',
          password: generateRandomPassword('AdMafia@'),
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
      Swal.fire('Required Field', 'Please enter a unique login username.', 'warning');
      return;
    }
    if (!userForm.password.trim()) {
      Swal.fire('Required Field', 'Please set a login password.', 'warning');
      return;
    }

    const cleanPhone = userForm.phone ? String(userForm.phone).replace(/\D/g, '').slice(-10) : '';

    const confirmResult = await Swal.fire({
      title: 'Create User & Login Password?',
      html: `
        <div style="text-align:left; font-size:14px; line-height:1.7;">
          <p><strong>Name:</strong> ${userForm.fullName}</p>
          <p><strong>Username:</strong> <code>${userForm.username}</code></p>
          <p><strong>Email:</strong> ${userForm.email}</p>
          <p><strong>Login Password:</strong> <code>${userForm.password}</code></p>
          <p><strong>Assigned Role:</strong> <strong>${userForm.role}</strong></p>
          <p><strong>Business Scope:</strong> ${userForm.customerId ? 'Scoped to Business ID: ' + userForm.customerId : 'Platform Staff (Global HQ)'}</p>
          <div style="margin-top:10px; padding:10px; background:#eff6ff; border-radius:6px; font-size:12px; color:#1e40af;">
            ✓ User can sign in at <code>https://admafia.marketing/portal</code> to access the customer dashboard.
          </div>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#2563eb',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, Create User Login',
    });

    if (!confirmResult.isConfirmed) return;

    setLoading(true);
    try {
      const payload = {
        fullName: userForm.fullName.trim(),
        email: userForm.email.trim(),
        username: userForm.username.trim(),
        phone: cleanPhone,
        password: userForm.password.trim(),
        role: userForm.role,
        permissions: userForm.permissions,
        customerId: userForm.customerId || null,
        status: userForm.status,
      };

      const res = await superadminApi.createUser(payload);
      if (res.ok) {
        const scopedBiz = businesses.find((b) => b.id === userForm.customerId);

        setCredentialModal({
          isOpen: true,
          data: {
            title: 'User Login & Credentials Provisioned!',
            fullName: userForm.fullName,
            userId: res.userId,
            username: res.username,
            email: res.email,
            phone: cleanPhone || 'N/A',
            password: res.password || userForm.password,
            role: res.role,
            companyName: scopedBiz ? scopedBiz.company_name : 'Platform Operations (Global)',
            customerId: userForm.customerId || null,
            loginUrl: 'https://admafia.marketing/portal',
          },
        });

        setUserForm({
          fullName: '',
          email: '',
          username: '',
          phone: '',
          password: generateRandomPassword('User@'),
          role: 'Client User',
          customerId: '',
          status: 'active',
          permissions: ['view_all', 'manage_queries'],
        });

        loadUsersList();
      } else {
        Swal.fire('Creation Failed', res.error || 'Could not create user.', 'error');
      }
    } catch (err) {
      Swal.fire('Error', err.response?.data?.error || err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Open Reset Password Modal
  const handleOpenResetModal = (target, type = 'user') => {
    setResetModal({
      isOpen: true,
      target,
      type,
      newPassword: generateRandomPassword(type === 'user' ? 'User@' : 'AdMafia@'),
      submitting: false,
    });
  };

  // Submit Password Reset
  const handleSubmitResetPassword = async (e) => {
    e.preventDefault();
    if (!resetModal.newPassword.trim() || !resetModal.target) {
      Swal.fire('Warning', 'Please enter a valid new password.', 'warning');
      return;
    }

    setResetModal((prev) => ({ ...prev, submitting: true }));
    try {
      let res;
      if (resetModal.type === 'business') {
        res = await superadminApi.resetAccountPassword(resetModal.target.id, {
          newPassword: resetModal.newPassword.trim(),
        });
      } else {
        res = await superadminApi.resetUserPassword(resetModal.target.id, {
          newPassword: resetModal.newPassword.trim(),
        });
      }

      if (res && res.ok) {
        const savedTarget = resetModal.target;
        const savedNewPwd = resetModal.newPassword.trim();
        setResetModal({ isOpen: false, target: null, type: 'user', newPassword: '', submitting: false });

        Swal.fire({
          icon: 'success',
          title: 'Password Updated Successfully! 🔑',
          html: `
            <div style="text-align:left; font-size:13px; line-height:1.7;">
              <p>Account: <strong>${savedTarget.full_name || savedTarget.company_name || savedTarget.username}</strong></p>
              <p>New Login Password: <code style="font-size:14px; font-weight:700; color:#4338ca;">${savedNewPwd}</code></p>
              <div style="margin-top:10px; padding:8px 12px; background:#eff6ff; border-radius:6px; color:#1e40af;">
                ✓ Login credentials updated in PostgreSQL. User can log in with new password immediately.
              </div>
            </div>
          `,
          confirmButtonColor: '#4338ca',
        });

        loadUsersList();
      }
    } catch (err) {
      Swal.fire('Error', err.message || 'Could not reset password.', 'error');
    } finally {
      setResetModal((prev) => ({ ...prev, submitting: false }));
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
      (u.role && u.role.toLowerCase().includes(q)) ||
      (u.business_name && u.business_name.toLowerCase().includes(q))
    );
  });

  return (
    <div className="sa-desk-content">
      {/* Desk Title Header */}
      <div className="sa-desk-header">
        <div>
          <h2>Add User / Business &amp; Login Governance</h2>
          <p>
            Create authoritative enterprise businesses and user accounts, configure portal login passwords, and grant instant access to the Customer Dashboard.
          </p>
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
            Sync Accounts &amp; Roster
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
          Register Business &amp; Login
        </button>
        <button
          type="button"
          className={`sa-tab-pill ${activeTab === 'user' ? 'active' : ''}`}
          onClick={() => setActiveTab('user')}
        >
          <UserPlus size={15} />
          Create User Login / Staff
        </button>
        <button
          type="button"
          className={`sa-tab-pill ${activeTab === 'roster' ? 'active' : ''}`}
          onClick={() => setActiveTab('roster')}
        >
          <Users size={15} />
          Users &amp; Staff Roster ({usersList.length})
        </button>
      </div>

      {/* TAB 1: REGISTER NEW BUSINESS & LOGIN */}
      {activeTab === 'business' && (
        <div className="sa-form-grid-layout">
          <form className="sa-card sa-form-card" onSubmit={handleBusinessSubmit}>
            <div className="sa-card-header">
              <div className="sa-card-title-group">
                <Building2 size={18} className="sa-brand-icon" />
                <h3>Enterprise Business &amp; Customer Portal Registration</h3>
              </div>
              <span className="sa-badge sa-badge-primary">PostgreSQL Active</span>
            </div>

            <div className="sa-form-body">
              {/* Row 1: Company Name & Contact Person */}
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
                    placeholder="e.g. Rahul Sharma"
                    value={bizForm.contactPerson}
                    onChange={(e) => setBizForm({ ...bizForm, contactPerson: e.target.value })}
                  />
                </div>
              </div>

              {/* Row 2: Mobile Number & Email */}
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
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '');
                        setBizForm({
                          ...bizForm,
                          phone: val,
                          username: bizForm.username ? bizForm.username : (val ? `biz_${val}` : ''),
                        });
                      }}
                    />
                  </div>
                  <small style={{ color: '#64748b', fontSize: '11px', marginTop: '4px' }}>
                    Customer logs into dashboard using this 10-digit number.
                  </small>
                </div>

                <div className="sa-form-group">
                  <label>
                    <Mail size={14} /> Official Email Address (Alternate Login)
                  </label>
                  <input
                    type="email"
                    placeholder="contact@apexmarketing.com"
                    value={bizForm.email}
                    onChange={(e) => setBizForm({ ...bizForm, email: e.target.value })}
                  />
                  <small style={{ color: '#64748b', fontSize: '11px', marginTop: '4px' }}>
                    Used for notifications, invoices, and email-based login.
                  </small>
                </div>
              </div>

              {/* Row 3: Username & Industry */}
              <div className="sa-form-row">
                <div className="sa-form-group">
                  <label>
                    <KeyRound size={14} /> Custom Username (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder={bizForm.phone ? `biz_${bizForm.phone}` : 'e.g. apexmarketing'}
                    value={bizForm.username}
                    onChange={(e) => setBizForm({ ...bizForm, username: e.target.value.toLowerCase().replace(/\s+/g, '') })}
                  />
                  <small style={{ color: '#64748b', fontSize: '11px', marginTop: '4px' }}>
                    Defaults to <code>biz_&lt;mobile&gt;</code> if left blank.
                  </small>
                </div>

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
              </div>

              {/* Row 4: City & State */}
              <div className="sa-form-row">
                <div className="sa-form-group">
                  <label>
                    <MapPin size={14} /> City &amp; State *
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
                    If entered &gt; 0, automatically provisions verified ledger deposit.
                  </small>
                </div>
              </div>

              {/* Row 5: PROMINENT PORTAL LOGIN PASSWORD */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 16, marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label style={{ fontSize: '0.84rem', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
                    <Lock size={15} color="#4f46e5" /> Customer Portal Login Password *
                  </label>
                  <button
                    type="button"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#4f46e5',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                    onClick={() => setBizForm({ ...bizForm, password: generateRandomPassword('AdMafia@') })}
                  >
                    <Sparkles size={13} /> Generate New Password
                  </button>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <input
                      type={showBizPassword ? 'text' : 'password'}
                      required
                      style={{
                        width: '100%',
                        padding: '11px 40px 11px 14px',
                        fontSize: '0.92rem',
                        fontWeight: 600,
                        letterSpacing: showBizPassword ? '0.02em' : '0.12em',
                        borderRadius: 8,
                        border: '1px solid #cbd5e1',
                        background: '#ffffff',
                      }}
                      placeholder="Enter customer login password"
                      value={bizForm.password}
                      onChange={(e) => setBizForm({ ...bizForm, password: e.target.value })}
                    />
                    <button
                      type="button"
                      style={{
                        position: 'absolute',
                        right: 10,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'transparent',
                        border: 'none',
                        color: '#64748b',
                        cursor: 'pointer',
                      }}
                      onClick={() => setShowBizPassword(!showBizPassword)}
                      title={showBizPassword ? 'Hide Password' : 'Show Password'}
                    >
                      {showBizPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div style={{ marginTop: 8, fontSize: '0.76rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircle2 size={13} color="#10b981" />
                  <span>The business owner logs into <code>https://admafia.marketing/portal</code> using their 10-digit mobile (+91), email, or username with this password.</span>
                </div>
              </div>

              {/* Form Action */}
              <div className="sa-form-actions">
                <button
                  type="submit"
                  className="sa-action-btn sa-btn-primary"
                  disabled={loading}
                  style={{ minWidth: 240, padding: '12px 24px', fontSize: 14 }}
                >
                  <Building2 size={16} />
                  {loading ? 'Creating Business Account...' : 'Register Business & Create Login'}
                </button>
              </div>
            </div>
          </form>

          {/* Quick Guidance Panel */}
          <div className="sa-side-guidance-card">
            <h4>
              <FileCheck size={16} color="#2563eb" /> Customer Dashboard Access
            </h4>
            <ul>
              <li>
                <strong>PostgreSQL Authentication:</strong> Credentials are saved directly to PostgreSQL. The business owner can immediately log in at <code>https://admafia.marketing/portal</code> or <code>/#login</code>.
              </li>
              <li>
                <strong>Multi-Identifier Sign In:</strong> Business users can log in using either their 10-digit mobile number, official email, or assigned username.
              </li>
              <li>
                <strong>Instant Lead Hub Provisioning:</strong> Dedicated marketing wallet (with ₹300/day pacing baseline) and isolated CRM tables are auto-created.
              </li>
              <li>
                <strong>1-Click Launch:</strong> Super Admin can immediately test and launch the customer dashboard directly from the success modal.
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* TAB 2: CREATE USER LOGIN / STAFF */}
      {activeTab === 'user' && (
        <div className="sa-form-grid-layout">
          <form className="sa-card sa-form-card" onSubmit={handleUserSubmit}>
            <div className="sa-card-header">
              <div className="sa-card-title-group">
                <UserCheck size={18} className="sa-brand-icon" />
                <h3>User Login &amp; Role Provisioning</h3>
              </div>
              <span className="sa-badge sa-badge-warning">PostgreSQL Backed</span>
            </div>

            <div className="sa-form-body">
              {/* Row 1: Full Name & Email */}
              <div className="sa-form-row">
                <div className="sa-form-group">
                  <label>
                    <Users size={14} /> Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Priyanshu Verma"
                    value={userForm.fullName}
                    onChange={(e) => setBizForm ? setUserForm({ ...userForm, fullName: e.target.value }) : null}
                  />
                </div>

                <div className="sa-form-group">
                  <label>
                    <Mail size={14} /> Official Email (Login Identifier) *
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

              {/* Row 2: Unique Username & Contact Phone */}
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
                    <Phone size={14} /> Contact Phone Number (Optional)
                  </label>
                  <input
                    type="tel"
                    placeholder="e.g. 9811223344"
                    value={userForm.phone}
                    onChange={(e) => setUserForm({ ...userForm, phone: e.target.value.replace(/\D/g, '') })}
                  />
                </div>
              </div>

              {/* Row 3: Role & Scoping */}
              <div className="sa-form-row">
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

                <div className="sa-form-group">
                  <label>
                    <Building2 size={14} /> Scoped Business Account
                  </label>
                  <select
                    value={userForm.customerId}
                    onChange={(e) => setUserForm({ ...userForm, customerId: e.target.value })}
                  >
                    <option value="">Platform Staff (Global HQ Operations)</option>
                    {businesses.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.company_name} ({b.contact_person}) — {b.id}
                      </option>
                    ))}
                  </select>
                  <small style={{ color: '#64748b', fontSize: '11px', marginTop: '4px' }}>
                    Select a business if this user manages a client's customer dashboard.
                  </small>
                </div>
              </div>

              {/* Row 4: PROMINENT USER LOGIN PASSWORD */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 16, marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label style={{ fontSize: '0.84rem', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
                    <Lock size={15} color="#4f46e5" /> User Login Password *
                  </label>
                  <button
                    type="button"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#4f46e5',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                    onClick={() => setUserForm({ ...userForm, password: generateRandomPassword('User@') })}
                  >
                    <Sparkles size={13} /> Generate Password
                  </button>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <input
                      type={showUserPassword ? 'text' : 'password'}
                      required
                      style={{
                        width: '100%',
                        padding: '11px 40px 11px 14px',
                        fontSize: '0.92rem',
                        fontWeight: 600,
                        letterSpacing: showUserPassword ? '0.02em' : '0.12em',
                        borderRadius: 8,
                        border: '1px solid #cbd5e1',
                        background: '#ffffff',
                      }}
                      placeholder="Enter user login password"
                      value={userForm.password}
                      onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                    />
                    <button
                      type="button"
                      style={{
                        position: 'absolute',
                        right: 10,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'transparent',
                        border: 'none',
                        color: '#64748b',
                        cursor: 'pointer',
                      }}
                      onClick={() => setShowUserPassword(!showUserPassword)}
                      title={showUserPassword ? 'Hide Password' : 'Show Password'}
                    >
                      {showUserPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div style={{ marginTop: 8, fontSize: '0.76rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircle2 size={13} color="#10b981" />
                  <span>With this username/email and password, user signs into <code>https://admafia.marketing/portal</code> to open the Customer Dashboard.</span>
                </div>
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

              {/* Action Button */}
              <div className="sa-form-actions">
                <button
                  type="submit"
                  className="sa-action-btn sa-btn-primary"
                  disabled={loading}
                  style={{ minWidth: 240, padding: '12px 24px', fontSize: 14 }}
                >
                  <UserPlus size={16} />
                  {loading ? 'Creating User Account...' : 'Create User Login'}
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

      {/* TAB 3: STAFF & USER ROSTER TABLE */}
      {activeTab === 'roster' && (
        <div className="sa-card">
          <div className="sa-card-header">
            <div className="sa-card-title-group">
              <Users size={18} className="sa-brand-icon" />
              <h3>Platform Users &amp; Staff Roster</h3>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div className="sa-search-wrap" style={{ minWidth: 260 }}>
                <Search size={15} />
                <input
                  type="text"
                  placeholder="Search by name, email, role, or business..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                />
              </div>
              <span className="sa-badge sa-badge-neutral">{filteredUsers.length} Users</span>
            </div>
          </div>

          <div className="sa-table-wrap">
            <table className="sa-table">
              <thead>
                <tr>
                  <th>USER &amp; LOGIN IDENTIFIERS</th>
                  <th>ROLE</th>
                  <th>ASSIGNED BUSINESS</th>
                  <th>PERMISSIONS</th>
                  <th>STATUS</th>
                  <th>LAST LOGIN</th>
                  <th style={{ textAlign: 'right' }}>GOVERNANCE ACTIONS</th>
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
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>{u.full_name}</div>
                          <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>
                            <code>{u.username}</code> &bull; {u.email}
                          </div>
                          {u.phone && <div style={{ fontSize: 11, color: '#64748b' }}>📱 +91 {u.phone}</div>}
                        </td>
                        <td>
                          <span className={`sa-role-badge sa-role-${roleClass}`}>
                            <Shield size={11} style={{ marginRight: 4, display: 'inline' }} />
                            {u.role}
                          </span>
                        </td>
                        <td>
                          {u.business_name ? (
                            <span style={{ fontSize: 13, color: '#1e293b', fontWeight: 600 }}>
                              <Building2 size={12} style={{ display: 'inline', marginRight: 4, color: '#4f46e5' }} />
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
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: 6 }}>
                            {/* Launch Dashboard */}
                            <button
                              type="button"
                              className="sa-action-btn sa-btn-outline"
                              style={{ padding: '5px 9px', fontSize: 11 }}
                              onClick={() => handleLaunchDashboard(u)}
                              title="Launch Customer Dashboard as this user"
                            >
                              <ExternalLink size={12} />
                              <span>Dashboard</span>
                            </button>

                            {/* Reset Password */}
                            <button
                              type="button"
                              className="sa-action-btn sa-btn-outline"
                              style={{ padding: '5px 9px', fontSize: 11 }}
                              onClick={() => handleOpenResetModal(u, 'user')}
                              title="Reset Login Password"
                            >
                              <Key size={12} />
                              <span>Reset Pwd</span>
                            </button>
                          </div>
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

      {/* CREDENTIALS SUCCESS MODAL */}
      {credentialModal.isOpen && credentialModal.data && (
        <div className="sa-modal-backdrop" onClick={() => setCredentialModal({ isOpen: false, data: null })}>
          <div
            className="sa-modal-card"
            style={{ maxWidth: 540 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sa-modal-header" style={{ background: '#f0fdf4', borderBottom: '1px solid #bbf7d0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={20} color="#16a34a" />
                <h3 style={{ margin: 0, color: '#166534', fontSize: '1.05rem', fontWeight: 800 }}>
                  {credentialModal.data.title}
                </h3>
              </div>
              <button
                type="button"
                className="sa-btn-icon"
                onClick={() => setCredentialModal({ isOpen: false, data: null })}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: 24 }}>
              <p style={{ margin: '0 0 16px 0', fontSize: '0.86rem', color: '#475569' }}>
                The account has been recorded in PostgreSQL. You can launch the Customer Dashboard immediately or copy credentials for the customer.
              </p>

              {/* Credentials Card Box */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 12,
                  padding: 18,
                  fontSize: '0.86rem',
                  lineHeight: 1.8,
                  color: '#1e293b',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: 8, marginBottom: 8 }}>
                  <span style={{ color: '#64748b' }}>Account / Business:</span>
                  <strong>{credentialModal.data.companyName || credentialModal.data.fullName}</strong>
                </div>

                {credentialModal.data.mobile && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Mobile (Login):</span>
                    <strong>+91 {credentialModal.data.mobile}</strong>
                  </div>
                )}

                {credentialModal.data.email && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Email (Login):</span>
                    <strong>{credentialModal.data.email}</strong>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Username:</span>
                  <code>{credentialModal.data.username}</code>
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: 8,
                    paddingTop: 8,
                    borderTop: '1px dashed #cbd5e1',
                  }}
                >
                  <span style={{ color: '#4338ca', fontWeight: 700 }}>Login Password:</span>
                  <code
                    style={{
                      background: '#e0e7ff',
                      color: '#3730a3',
                      padding: '4px 8px',
                      borderRadius: 6,
                      fontSize: '0.95rem',
                      fontWeight: 800,
                    }}
                  >
                    {credentialModal.data.password}
                  </code>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                  <span style={{ color: '#64748b' }}>Portal URL:</span>
                  <a
                    href="https://admafia.marketing/portal"
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'underline' }}
                  >
                    admafia.marketing/portal
                  </a>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 10, marginTop: 22, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="sa-action-btn sa-btn-outline"
                  onClick={() => handleCopyCredentials(credentialModal.data)}
                >
                  <Copy size={14} />
                  <span>Copy Credentials</span>
                </button>

                <button
                  type="button"
                  className="sa-action-btn sa-btn-primary"
                  onClick={() => {
                    handleLaunchDashboard(credentialModal.data);
                    setCredentialModal({ isOpen: false, data: null });
                  }}
                >
                  <ExternalLink size={14} />
                  <span>🚀 Open Customer Dashboard Now</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* RESET PASSWORD MODAL */}
      {resetModal.isOpen && (
        <div className="sa-modal-backdrop" onClick={() => setResetModal({ isOpen: false, target: null, type: 'user', newPassword: '', submitting: false })}>
          <div className="sa-modal-card" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="sa-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Key size={18} color="#4f46e5" />
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>Reset Login Password</h3>
              </div>
              <button
                type="button"
                className="sa-btn-icon"
                onClick={() => setResetModal({ isOpen: false, target: null, type: 'user', newPassword: '', submitting: false })}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmitResetPassword} style={{ padding: 22 }}>
              <div style={{ marginBottom: 14 }}>
                <span style={{ fontSize: '0.82rem', color: '#64748b' }}>Account Target:</span>
                <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.94rem', marginTop: 2 }}>
                  {resetModal.target?.full_name || resetModal.target?.company_name || resetModal.target?.username}
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
                    New Login Password *
                  </label>
                  <button
                    type="button"
                    style={{ background: 'transparent', border: 'none', color: '#4f46e5', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                    onClick={() => setResetModal((prev) => ({ ...prev, newPassword: generateRandomPassword(prev.type === 'user' ? 'User@' : 'AdMafia@') }))}
                  >
                    <Sparkles size={12} style={{ display: 'inline', marginRight: 2 }} /> Generate
                  </button>
                </div>
                <input
                  type="text"
                  required
                  style={{ width: '100%', padding: '10px 12px', fontSize: '0.92rem', fontWeight: 600, borderRadius: 8, border: '1px solid #cbd5e1' }}
                  value={resetModal.newPassword}
                  onChange={(e) => setResetModal({ ...resetModal, newPassword: e.target.value })}
                  placeholder="Enter new password"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  className="sa-action-btn sa-btn-outline"
                  onClick={() => setResetModal({ isOpen: false, target: null, type: 'user', newPassword: '', submitting: false })}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="sa-action-btn sa-btn-primary"
                  disabled={resetModal.submitting}
                >
                  <Key size={14} />
                  {resetModal.submitting ? 'Updating...' : 'Save New Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
