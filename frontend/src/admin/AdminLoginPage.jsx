import React, { useState } from 'react';
import {
  Lock,
  User,
  Key,
  Eye,
  EyeOff,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import Swal from 'sweetalert2';
import adminAuthApi from '../services/adminAuthApi';
import './admin-login.css';

export default function AdminLoginPage({
  targetUrl = null,
  notice = null,
  onLoginSuccess = null,
  onBackToWebsite = null,
}) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(notice || '');

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

  return (
    <div className="adm-login-page">
      {/* Main Container */}
      <main className="adm-login-container">
        {/* Administrator Login Form */}
        <section
          className="adm-form-card"
          style={{
            gridColumn: '1 / -1',
            width: 'min(100%, 520px)',
            justifySelf: 'center',
            background: 'linear-gradient(180deg, #131c2e 0%, #0d1527 100%)',
            border: '1px solid rgba(255, 255, 255, 0.14)',
            borderRadius: '20px',
            padding: '34px 30px',
            boxShadow: '0 25px 60px rgba(0, 0, 0, 0.6)',
            boxSizing: 'border-box',
          }}
        >
          <div className="adm-form-header">
            <h3>Administrator Sign In</h3>
            <p>Enter your username, work email, or 10-digit mobile number</p>
          </div>

          {/* Routing Target Preview */}
          <div className="adm-routing-preview">
            <ArrowRight size={16} className="adm-routing-icon" />
            <div className="adm-routing-text">
              Target Destination: <strong>Administrator Workspace</strong>
              <div style={{ marginTop: 2 }}>
                Routes to your authorized workspace after sign in.
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
                  placeholder="Username, email, or mobile number"
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
                    Sign In to Administrator Workspace
                  </span>
                </>
              )}
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
        &copy; {new Date().getFullYear()} AdMafia Marketing CRM &bull; Multi-Department Operations Gateway &bull; MongoDB Protected
      </footer>
    </div>
  );
}

