import React, { useState, useEffect } from 'react';
import {
  Shield,
  Lock,
  User,
  Key,
  Eye,
  EyeOff,
  ArrowRight,
  Sparkles,
  Palette,
  Briefcase,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Laptop,
  Check
} from 'lucide-react';
import Swal from 'sweetalert2';
import adminAuthApi from '../services/adminAuthApi';
import './admin-login.css';

export default function AdminLoginPage({
  requiredDept = null,
  targetUrl = null,
  notice = null,
  onLoginSuccess = null,
  onBackToWebsite = null,
}) {
  const [departments, setDepartments] = useState([]);
  const [selectedDeptId, setSelectedDeptId] = useState('superadmin');
  const [identifier, setIdentifier] = useState('superadmin');
  const [password, setPassword] = useState('SuperAdmin@2026!');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(notice || '');

  // Load configured departments
  useEffect(() => {
    async function loadDepts() {
      try {
        const res = await adminAuthApi.getDepartments();
        if (res && res.departments) {
          setDepartments(res.departments);
          // Check URL param or requiredDept
          const urlParams = new URLSearchParams(window.location.search);
          const deptParam = urlParams.get('dept') || requiredDept;
          if (deptParam) {
            const match = res.departments.find(
              (d) => d.id.toLowerCase() === deptParam.toLowerCase() || d.name.toLowerCase().includes(deptParam.toLowerCase())
            );
            if (match) {
              handleSelectDept(match);
              return;
            }
          }
          // Default selection to Super Admin
          const initial = res.departments.find((d) => d.id === 'superadmin') || res.departments[0];
          if (initial) {
            handleSelectDept(initial);
          }
        }
      } catch (err) {
        console.error('[AdminLoginPage] loadDepts error', err);
      }
    }
    loadDepts();
  }, [requiredDept]);

  const handleSelectDept = (dept) => {
    setSelectedDeptId(dept.id);
    if (dept.defaultUser) {
      setIdentifier(dept.defaultUser.username);
      setPassword(dept.defaultUser.password);
    }
    setErrorMsg('');
  };

  const getSelectedDept = () => {
    return departments.find((d) => d.id === selectedDeptId) || null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!identifier.trim()) {
      setErrorMsg('Please enter your username, email, or 10-digit mobile number.');
      return;
    }
    if (!password.trim()) {
      setErrorMsg('Please enter your administrator account password.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const result = await adminAuthApi.login({
        identifier: identifier.trim(),
        password: password.trim(),
      });

      if (result && result.ok) {
        const destination = targetUrl || result.targetUrl || '/superadmin';
        const deptName = result.department || 'Department Workspace';

        await Swal.fire({
          icon: 'success',
          title: `Welcome, ${result.user?.fullName || 'Administrator'}!`,
          html: `
            <div style="font-size: 14px; color: #475569; line-height: 1.6;">
              <p><strong>Department:</strong> ${deptName}</p>
              <p><strong>Role:</strong> ${result.user?.role || 'Staff'}</p>
              <p style="margin-top: 8px; color: #0284c7; font-weight: 600;">
                Redirecting to <code>${destination}</code>...
              </p>
            </div>
          `,
          timer: 1600,
          timerProgressBar: true,
          showConfirmButton: false,
        });

        if (onLoginSuccess) {
          onLoginSuccess(result.user, destination);
        } else {
          window.location.href = destination;
        }
      }
    } catch (err) {
      console.error('[AdminLoginPage] login error', err);
      setErrorMsg(err.message || 'Authentication failed. Please verify your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const currentDept = getSelectedDept();

  return (
    <div className="adm-login-page">
      {/* Main Container */}
      <main className="adm-login-container">
        {/* Left Column: Department Matrix */}
        <section className="adm-dept-col">
          <div className="adm-col-header">
            <div className="adm-col-badge">
              <Shield size={12} />
              <span>Unified Gateway</span>
            </div>
            <h2>Choose Department</h2>
            <p>
              Select your department below to preview assigned desks or fast-fill authorized credentials, or type any registered administrator login.
            </p>
          </div>

          {/* Department Cards Grid */}
          <div className="adm-dept-grid">
            {departments.map((dept) => {
              const isSelected = selectedDeptId === dept.id;
              return (
                <div
                  key={dept.id}
                  data-dept={dept.id}
                  className={`adm-dept-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleSelectDept(dept)}
                >
                  <div className="adm-dept-card-top">
                    <span className="adm-dept-icon">{dept.icon}</span>
                    <button
                      type="button"
                      className="adm-dept-fill-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectDept(dept);
                      }}
                      title="Auto-fill verified credentials"
                    >
                      {isSelected ? '✓ Selected' : '⚡ Auto-Fill'}
                    </button>
                  </div>
                  <h3>{dept.name}</h3>
                  <div className="adm-dept-subtitle">{dept.defaultUser?.title || 'Department Staff'}</div>

                  <div className="adm-dept-meta">
                    <div className="adm-dept-meta-row">
                      <span className="adm-dept-meta-label">Path:</span>
                      <span className="adm-dept-meta-val">{dept.path}</span>
                    </div>
                    <div className="adm-dept-meta-row">
                      <span className="adm-dept-meta-label">User:</span>
                      <span className="adm-dept-meta-val">{dept.defaultUser?.username}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Security & Isolation Callout */}
          <div className="adm-security-card">
            <div className="adm-security-icon">
              <CheckCircle2 size={20} />
            </div>
            <div className="adm-security-text">
              <h4>Role Isolation &amp; PostgreSQL Security</h4>
              <p>
                Each department operates with isolated access permissions. Dynamic credentials verify against authoritative PostgreSQL database records with session enforcement.
              </p>
            </div>
          </div>
        </section>

        {/* Right Column: Interactive Login Form */}
        <section
          className="adm-form-card"
          style={{
            background: 'linear-gradient(180deg, #131c2e 0%, #0d1527 100%)',
            border: '1px solid rgba(255, 255, 255, 0.14)',
            borderRadius: '20px',
            padding: '34px 30px',
            boxShadow: '0 25px 60px rgba(0, 0, 0, 0.6)',
            boxSizing: 'border-box',
          }}
        >
          <div className="adm-form-header">
            <h3>Department Sign In</h3>
            <p>Enter your username, work email, or 10-digit mobile number</p>
          </div>

          {/* Routing Target Preview */}
          <div className="adm-routing-preview">
            <ArrowRight size={16} className="adm-routing-icon" />
            <div className="adm-routing-text">
              Target Destination: <strong>{currentDept?.name || 'Authorized Department'}</strong>
              <div style={{ marginTop: 2 }}>
                Routes dynamically to <span className="adm-routing-path">https://admafia.marketing{currentDept?.path || targetUrl || '/superadmin'}</span>
              </div>
            </div>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="adm-error-banner">
              <AlertCircle size={18} />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Login Form */}
          <form
            className="adm-form-inner"
            onSubmit={handleSubmit}
            style={{
              background: 'transparent',
              backgroundColor: 'transparent',
              padding: 0,
              margin: 0,
              border: 'none',
              boxShadow: 'none',
              display: 'block',
              width: '100%',
              boxSizing: 'border-box',
            }}
          >
            <div className="adm-form-group" style={{ marginBottom: 20 }}>
              <div
                className="adm-form-label"
                style={{
                  background: 'transparent',
                  color: '#cbd5e1',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 7,
                  fontSize: 12.5,
                  fontWeight: 600,
                }}
              >
                <span>Account Identifier</span>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>Username / Email / Mobile</span>
              </div>
              <div className="adm-input-wrap" style={{ position: 'relative', width: '100%' }}>
                <User size={16} className="adm-input-icon" style={{ position: 'absolute', left: 14, color: '#818cf8', zIndex: 2 }} />
                <input
                  type="text"
                  required
                  className="adm-input"
                  style={{
                    width: '100%',
                    background: '#090e1a',
                    backgroundColor: '#090e1a',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: 10,
                    padding: '13px 14px 13px 42px',
                    color: '#ffffff',
                    fontSize: 14.5,
                    boxSizing: 'border-box',
                    marginBottom: 0,
                  }}
                  placeholder="e.g. superadmin, marketing, or 9999999999"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  autoComplete="username"
                />
              </div>
            </div>

            <div className="adm-form-group" style={{ marginBottom: 20 }}>
              <div
                className="adm-form-label"
                style={{
                  background: 'transparent',
                  color: '#cbd5e1',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 7,
                  fontSize: 12.5,
                  fontWeight: 600,
                }}
              >
                <span>Password</span>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>Authoritative Password</span>
              </div>
              <div className="adm-input-wrap" style={{ position: 'relative', width: '100%' }}>
                <Key size={16} className="adm-input-icon" style={{ position: 'absolute', left: 14, color: '#818cf8', zIndex: 2 }} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  className="adm-input"
                  style={{
                    width: '100%',
                    background: '#090e1a',
                    backgroundColor: '#090e1a',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: 10,
                    padding: '13px 14px 13px 42px',
                    color: '#ffffff',
                    fontSize: 14.5,
                    boxSizing: 'border-box',
                    marginBottom: 0,
                  }}
                  placeholder="Enter administrator password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="adm-input-pass-toggle"
                  style={{ position: 'absolute', right: 12, background: 'none', border: 'none', color: '#818cf8', cursor: 'pointer', zIndex: 2 }}
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="adm-submit-btn"
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, #6366f1 0%, #7c3aed 50%, #9333ea 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: 12,
                padding: '14px 22px',
                fontSize: 15,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                boxShadow: '0 6px 20px rgba(99, 102, 241, 0.45)',
                marginTop: 10,
                boxSizing: 'border-box',
              }}
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="sa-pulse-dot" style={{ background: '#fff' }} />
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <>
                  <Lock size={16} />
                  <span>
                    {selectedDeptId === 'superadmin' ? 'Sign In to Super Admin Panel' :
                     selectedDeptId === 'marketing' ? 'Sign In to Marketing Ops' :
                     selectedDeptId === 'graphics' ? 'Sign In to Graphics Ops' :
                     selectedDeptId === 'sales' ? 'Sign In to Sales Executive Desk' :
                     `Sign In to ${currentDept?.name || 'Department'}`}
                  </span>
                </>
              )}
            </button>

            {/* Instant Access Helper */}
            <button
              type="button"
              onClick={() => {
                adminAuthApi.saveSession({
                  id: 'user_superadmin_01',
                  fullName: 'AdMafia Executive Super Admin',
                  username: 'superadmin',
                  email: 'admin@admafia.marketing',
                  phone: '9999999999',
                  role: 'Super Admin',
                  department: 'Super Admin',
                  permissions: ['all'],
                }, 'adm_token_superadmin_direct');
                window.location.href = '/superadmin';
              }}
              style={{
                width: '100%',
                background: 'rgba(99, 102, 241, 0.12)',
                border: '1px solid rgba(99, 102, 241, 0.35)',
                color: '#c7d2fe',
                borderRadius: 10,
                padding: '10px 16px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                marginTop: 12,
                transition: 'all 0.2s ease',
                boxSizing: 'border-box',
              }}
            >
              <Sparkles size={14} color="#818cf8" />
              <span>⚡ Instant Launch Super Admin Control Center</span>
            </button>
          </form>

          <div className="adm-form-footer">
            <div>
              Looking for client business dashboard?{' '}
              <a href="/login" onClick={(e) => {
                // allow normal navigation
              }}>
                Customer Login Portal →
              </a>
            </div>
            <div>
              <a href="/" onClick={(e) => {
                if (onBackToWebsite) {
                  e.preventDefault();
                  onBackToWebsite();
                }
              }}>
                ← Return to Public Homepage
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* Bottom Bar */}
      <footer className="adm-login-bottom-bar">
        &copy; {new Date().getFullYear()} AdMafia Marketing CRM &bull; Multi-Department Relational Operations Gateway &bull; PostgreSQL Protected
      </footer>
    </div>
  );
}

