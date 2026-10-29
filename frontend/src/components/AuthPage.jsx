import React, { useState } from 'react';

export default function AuthPage({ onBackToHome }) {
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  // Form states pre-filled with requested values
  const [loginData, setLoginData] = useState({
    username: 'priya',
    password: '•••••••••••••',
    rememberMe: true,
  });

  const [registerData, setRegisterData] = useState({
    fullName: '',
    email: '',
    agency: '',
    role: 'Agency Leadership & Admin',
    password: '',
  });

  // Enterprise profiles
  const profiles = [
    {
      id: 'priya',
      name: 'Priya Raman',
      role: 'Agency Leadership & Admin',
      path: '/agency/dashboard',
      initials: 'PR',
      avatarColor: 'linear-gradient(135deg, #2a2380 0%, #1a1550 100%)',
    },
    {
      id: 'rohit',
      name: 'Rohit Sharma',
      role: 'Sales & Lead Conversion Specialist',
      path: '/sales/pipeline',
      initials: 'RS',
      avatarColor: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
    },
    {
      id: 'client',
      name: 'AdMafia Enterprise Client',
      role: 'Brand Client Account',
      path: '/client/analytics',
      initials: 'AM',
      avatarColor: 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)',
    },
  ];

  // Dynamic Routing determination based on username
  const matchedProfile =
    profiles.find((p) => loginData.username.toLowerCase().includes(p.id)) || profiles[0];

  const handleLogin = (e) => {
    e.preventDefault();
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setLoginSuccess(true);
    }, 600);
  };

  const handleRegister = (e) => {
    e.preventDefault();
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setLoginSuccess(true);
    }, 600);
  };

  return (
    <div className="crm-auth-screen">
      {/* Background Ambient Glows */}
      <div className="bg-orb-1"></div>
      <div className="bg-orb-2"></div>

      {/* Top Header Bar */}
      <header className="crm-top-bar">
        <div className="crm-bar-inner">
          <div className="crm-brand-mark">
            <div className="brand-logo-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M4 19L9 14L13 18L20 7" stroke="#ffb800" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="20" cy="7" r="2.5" fill="#ffb800" />
              </svg>
            </div>
            <span className="brand-name">
              Growth<b>line</b>
            </span>
            <span className="brand-sub">CRM</span>
          </div>

          <div className="crm-bar-actions">
            <span className="status-indicator">
              <span className="status-ping"></span>
              Meta API v21.0 Connected
            </span>
            {onBackToHome && (
              <button type="button" onClick={onBackToHome} className="btn-back-home">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Landing Page
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Workspace Auth Layout */}
      <main className="crm-auth-layout">
        <div className="crm-split-wrapper">
          {/* LEFT PANEL: Enterprise Agency Context Showcase */}
          <section className="crm-showcase-panel">
            <div className="showcase-badge">
              <span>AGENCY COMMAND CENTER</span>
            </div>

            <h2 className="showcase-title">
              Turn Meta Ad campaigns into qualified closed deals.
            </h2>
            <p className="showcase-lead">
              Unified workspace for campaign management, direct WhatsApp lead routing, and revenue follow-ups starting from ₹300/day.
            </p>

            {/* Live Widget Preview */}
            <div className="showcase-widget">
              <div className="widget-header">
                <div className="widget-dot-green"></div>
                <span>LIVE INCOMING LEAD ROUTING</span>
                <span className="widget-time">Real-time</span>
              </div>
              <div className="widget-content">
                <div className="widget-lead-row">
                  <div className="widget-lead-avatar">R</div>
                  <div className="widget-lead-meta">
                    <strong>Rohit Sharma</strong>
                    <span>Real Estate Enquiry &middot; +91 98•••• 4521</span>
                  </div>
                  <div className="widget-tag">Routed to Priya</div>
                </div>
                <div className="widget-metric-bar">
                  <div className="metric-col">
                    <small>Daily Spend</small>
                    <strong>₹300/day</strong>
                  </div>
                  <div className="metric-col">
                    <small>This Month</small>
                    <strong>1,240 Leads</strong>
                  </div>
                  <div className="metric-col">
                    <small>Conversion Rate</small>
                    <strong>14.8%</strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="showcase-footer">
              <div className="security-tag">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
                  <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span>Enterprise Workspace &middot; Role-based Access Control</span>
              </div>
            </div>
          </section>

          {/* RIGHT PANEL: The Sign In / Register Card */}
          <section className="crm-form-panel">
            <div className="auth-card-box">
              {/* Top Segmented Tab Switcher */}
              <div className="segmented-tabs">
                <button
                  type="button"
                  className={`tab-btn ${authMode === 'login' ? 'is-active' : ''}`}
                  onClick={() => { setAuthMode('login'); setLoginSuccess(false); }}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  className={`tab-btn ${authMode === 'register' ? 'is-active' : ''}`}
                  onClick={() => { setAuthMode('register'); setLoginSuccess(false); }}
                >
                  Create Account
                </button>
              </div>

              {/* VIEW: SIGN IN */}
              {authMode === 'login' && !loginSuccess && (
                <div>
                  <div className="card-headline">
                    <h1>Sign In to Growthline CRM</h1>
                    <p>Enter your credentials to access your workspace.</p>
                  </div>

                  {/* PROPER ROUTING DETECTED CARD */}
                  <div className="routing-card">
                    <div className="routing-avatar" style={{ background: matchedProfile.avatarColor }}>
                      {matchedProfile.initials}
                    </div>
                    <div className="routing-info">
                      <div className="routing-tag-row">
                        <span className="routing-pulse-indicator"></span>
                        <span className="routing-badge-label">Routing Detected:</span>
                      </div>
                      <div className="routing-name">{matchedProfile.role} ({matchedProfile.name})</div>
                      <div className="routing-path-tag">
                        <span className="dest-label">Destination:</span>
                        <code>{matchedProfile.path}</code>
                      </div>
                    </div>
                  </div>

                  {/* Form */}
                  <form onSubmit={handleLogin} className="crm-form">
                    <div className="form-row">
                      <label htmlFor="username">
                        Username or Email Address<span>*</span>
                      </label>
                      <div className="input-container">
                        <svg className="field-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                        <input
                          id="username"
                          name="username"
                          type="text"
                          required
                          autoComplete="username"
                          value={loginData.username}
                          onChange={(e) => setLoginData({ ...loginData, username: e.target.value })}
                          placeholder="priya"
                        />
                      </div>
                    </div>

                    <div className="form-row">
                      <div className="label-with-link">
                        <label htmlFor="password">
                          Password<span>*</span>
                        </label>
                        <button
                          type="button"
                          className="forgot-link"
                          onClick={() => setForgotOpen(true)}
                        >
                          Forgot password?
                        </button>
                      </div>
                      <div className="input-container">
                        <svg className="field-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                        <input
                          id="password"
                          name="password"
                          type={showPassword ? 'text' : 'password'}
                          required
                          autoComplete="current-password"
                          value={loginData.password}
                          onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                          placeholder="•••••••••••••"
                        />
                        <button
                          type="button"
                          className="pwd-toggle-btn"
                          onClick={() => setShowPassword(!showPassword)}
                          aria-label="Toggle password visibility"
                        >
                          {showPassword ? (
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                              <line x1="1" y1="1" x2="23" y2="23" />
                            </svg>
                          ) : (
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>

                    <button type="submit" className="submit-action-btn" disabled={isLoading}>
                      {isLoading ? (
                        <span>Connecting to Workspace...</span>
                      ) : (
                        <>
                          <span>Sign In to Workspace</span>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="5" y1="12" x2="19" y2="12" strokeLinecap="round" />
                            <polyline points="12 5 19 12 12 19" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </>
                      )}
                    </button>
                  </form>

                  {/* Switch Workspace Role Simulator */}
                  <div className="profile-selector-box">
                    <div className="selector-title">Quick Demo Logins:</div>
                    <div className="selector-pills">
                      {profiles.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className={`profile-pill ${matchedProfile.id === p.id ? 'is-selected' : ''}`}
                          onClick={() => setLoginData({ ...loginData, username: p.id })}
                        >
                          <span className="profile-dot" style={{ background: p.avatarColor }}></span>
                          <strong>{p.name.split(' ')[0]}</strong>
                          <span className="profile-pill-sub">({p.role.split(' ')[0]})</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Bottom Link */}
                  <div className="card-footer-switch">
                    Don't have an agency workspace?{' '}
                    <button
                      type="button"
                      className="inline-action-link"
                      onClick={() => setAuthMode('register')}
                    >
                      Create an account
                    </button>
                  </div>
                </div>
              )}

              {/* VIEW: CREATE ACCOUNT */}
              {authMode === 'register' && !loginSuccess && (
                <div>
                  <div className="card-headline">
                    <h1>Create Growthline Workspace</h1>
                    <p>Provision a new enterprise agency workspace.</p>
                  </div>

                  <form onSubmit={handleRegister} className="crm-form">
                    <div className="form-row">
                      <label htmlFor="regName">Full Name<span>*</span></label>
                      <input
                        id="regName"
                        type="text"
                        required
                        value={registerData.fullName}
                        onChange={(e) => setRegisterData({ ...registerData, fullName: e.target.value })}
                        placeholder="Priya Raman"
                        className="clean-input"
                      />
                    </div>

                    <div className="form-row">
                      <label htmlFor="regEmail">Work Email Address<span>*</span></label>
                      <input
                        id="regEmail"
                        type="email"
                        required
                        value={registerData.email}
                        onChange={(e) => setRegisterData({ ...registerData, email: e.target.value })}
                        placeholder="priya@admafia.in"
                        className="clean-input"
                      />
                    </div>

                    <div className="form-row">
                      <label htmlFor="regAgency">Agency / Business Name<span>*</span></label>
                      <input
                        id="regAgency"
                        type="text"
                        required
                        value={registerData.agency}
                        onChange={(e) => setRegisterData({ ...registerData, agency: e.target.value })}
                        placeholder="AdMafia Marketing"
                        className="clean-input"
                      />
                    </div>

                    <div className="form-row">
                      <label htmlFor="regRole">Select Leadership Role<span>*</span></label>
                      <select
                        id="regRole"
                        value={registerData.role}
                        onChange={(e) => setRegisterData({ ...registerData, role: e.target.value })}
                        className="clean-input"
                      >
                        <option value="Agency Leadership & Admin">Agency Leadership &amp; Admin</option>
                        <option value="Media Buyer & Campaign Planner">Media Buyer &amp; Campaign Planner</option>
                        <option value="Lead Conversion Executive">Lead Conversion Executive</option>
                        <option value="Enterprise Client">Enterprise Brand Client</option>
                      </select>
                    </div>

                    <div className="form-row">
                      <label htmlFor="regPwd">Set Master Password<span>*</span></label>
                      <input
                        id="regPwd"
                        type="password"
                        required
                        placeholder="Minimum 8 characters"
                        className="clean-input"
                      />
                    </div>

                    <button type="submit" className="submit-action-btn" disabled={isLoading}>
                      {isLoading ? 'Creating Workspace...' : 'Create Account & Access CRM'}
                    </button>
                  </form>

                  <div className="card-footer-switch">
                    Already registered?{' '}
                    <button
                      type="button"
                      className="inline-action-link"
                      onClick={() => setAuthMode('login')}
                    >
                      Sign In to Workspace
                    </button>
                  </div>
                </div>
              )}

              {/* SUCCESS STATE */}
              {loginSuccess && (
                <div className="verified-success-state">
                  <div className="verified-circle">
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5">
                      <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <h2>Authenticated Successfully</h2>
                  <p className="verified-sub">
                    Session confirmed for <strong>{matchedProfile.name}</strong>
                  </p>
                  <div className="verified-route-box">
                    <span className="route-icon">⚡</span>
                    <span>Routing to: <code>{matchedProfile.path}</code></span>
                  </div>

                  <div style={{ marginTop: '28px' }}>
                    <button
                      type="button"
                      onClick={() => setLoginSuccess(false)}
                      className="switch-user-btn"
                    >
                      Sign in with different credentials
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      {/* Forgot Password Modal */}
      {forgotOpen && (
        <div className="modal-backdrop">
          <div className="modal-content-card">
            <h3>Reset Password</h3>
            <p>Enter your username or registered work email to receive access credentials.</p>
            {!forgotSent ? (
              <div>
                <input
                  type="email"
                  defaultValue="priya@admafia.in"
                  className="clean-input"
                  style={{ marginBottom: '16px' }}
                />
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    className="submit-action-btn"
                    style={{ flex: 1 }}
                    onClick={() => setForgotSent(true)}
                  >
                    Send Instructions
                  </button>
                  <button
                    type="button"
                    className="modal-cancel-btn"
                    onClick={() => setForgotOpen(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="reset-alert-box">
                  Reset link dispatched! Please check your agency mailbox.
                </div>
                <button
                  type="button"
                  className="modal-cancel-btn"
                  style={{ width: '100%' }}
                  onClick={() => { setForgotOpen(false); setForgotSent(false); }}
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* STYLES */}
      <style>{`
        .crm-auth-screen {
          min-height: 100vh;
          background: #100c30;
          color: #ffffff;
          font-family: 'Figtree', system-ui, -apple-system, sans-serif;
          position: relative;
          overflow-x: hidden;
          display: flex;
          flex-direction: column;
        }

        .bg-orb-1 {
          position: absolute;
          top: -120px;
          right: -100px;
          width: 550px;
          height: 550px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(42, 35, 128, 0.45) 0%, rgba(16, 12, 48, 0) 70%);
          pointer-events: none;
        }

        .bg-orb-2 {
          position: absolute;
          bottom: -150px;
          left: -150px;
          width: 600px;
          height: 600px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(255, 184, 0, 0.08) 0%, rgba(16, 12, 48, 0) 70%);
          pointer-events: none;
        }

        /* Top Header */
        .crm-top-bar {
          position: relative;
          z-index: 20;
          background: rgba(16, 12, 48, 0.88);
          backdrop-filter: blur(12px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          height: 70px;
          display: flex;
          align-items: center;
        }

        .crm-bar-inner {
          max-width: 1220px;
          width: 100%;
          margin: 0 auto;
          padding: 0 28px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .crm-brand-mark {
          display: flex;
          align-items: center;
          gap: 10px;
          user-select: none;
        }

        .brand-logo-icon {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          background: #1a1550;
          border: 1px solid rgba(255, 184, 0, 0.3);
          display: grid;
          place-items: center;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
        }

        .brand-name {
          font-family: 'Bricolage Grotesque', system-ui, sans-serif;
          font-size: 1.4rem;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: #ffffff;
        }

        .brand-name b {
          color: #ffb800;
        }

        .brand-sub {
          background: rgba(255, 184, 0, 0.18);
          color: #ffb800;
          font-size: 0.72rem;
          font-weight: 800;
          padding: 3px 8px;
          border-radius: 6px;
          letter-spacing: 0.05em;
        }

        .crm-bar-actions {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .status-indicator {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 0.85rem;
          color: #b5b1db;
          background: rgba(255, 255, 255, 0.05);
          padding: 6px 14px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .status-ping {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #10b981;
          box-shadow: 0 0 8px #10b981;
        }

        .btn-back-home {
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.25);
          color: #ffffff;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          border-radius: 999px;
          font-size: 0.88rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-back-home:hover {
          background: rgba(255, 255, 255, 0.1);
          border-color: #ffffff;
        }

        /* Layout */
        .crm-auth-layout {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 40px 24px;
          position: relative;
          z-index: 10;
        }

        .crm-split-wrapper {
          display: grid;
          grid-template-columns: 1.05fr 1fr;
          gap: 48px;
          max-width: 1140px;
          width: 100%;
          align-items: center;
        }

        /* Left Showcase Panel */
        .crm-showcase-panel {
          padding-right: 12px;
        }

        .showcase-badge {
          display: inline-flex;
          background: rgba(255, 184, 0, 0.12);
          border: 1px solid rgba(255, 184, 0, 0.3);
          color: #ffb800;
          font-size: 0.76rem;
          font-weight: 800;
          padding: 6px 14px;
          border-radius: 999px;
          letter-spacing: 0.08em;
          margin-bottom: 20px;
        }

        .showcase-title {
          font-family: 'Bricolage Grotesque', system-ui, sans-serif;
          font-size: clamp(2rem, 3.8vw, 3rem);
          font-weight: 800;
          line-height: 1.1;
          color: #ffffff;
          letter-spacing: -0.025em;
          margin-bottom: 16px;
        }

        .showcase-lead {
          color: #c7c4e8;
          font-size: 1.1rem;
          line-height: 1.6;
          margin-bottom: 32px;
          max-width: 48ch;
        }

        .showcase-widget {
          background: rgba(26, 21, 80, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.15);
          backdrop-filter: blur(12px);
          border-radius: 20px;
          padding: 22px;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.35);
        }

        .widget-header {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.75rem;
          font-weight: 800;
          color: #ffb800;
          letter-spacing: 0.05em;
          margin-bottom: 16px;
        }

        .widget-dot-green {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #10b981;
          box-shadow: 0 0 6px #10b981;
        }

        .widget-time {
          margin-left: auto;
          color: #a29ec9;
          font-weight: 500;
        }

        .widget-lead-row {
          background: rgba(255, 255, 255, 0.06);
          border-radius: 14px;
          padding: 12px 14px;
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 16px;
        }

        .widget-lead-avatar {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          background: #eef0ff;
          color: #1a1550;
          display: grid;
          place-items: center;
          font-weight: 800;
          font-family: 'Bricolage Grotesque', system-ui, sans-serif;
        }

        .widget-lead-meta strong {
          display: block;
          font-size: 0.95rem;
          color: #ffffff;
        }

        .widget-lead-meta span {
          display: block;
          font-size: 0.82rem;
          color: #b8b5db;
        }

        .widget-tag {
          margin-left: auto;
          background: #10b981;
          color: #ffffff;
          font-size: 0.72rem;
          font-weight: 700;
          padding: 4px 10px;
          border-radius: 999px;
          white-space: nowrap;
        }

        .widget-metric-bar {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          padding-top: 14px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .metric-col small {
          display: block;
          font-size: 0.75rem;
          color: #a49fcb;
          margin-bottom: 2px;
        }

        .metric-col strong {
          font-family: 'Bricolage Grotesque', system-ui, sans-serif;
          font-size: 1.15rem;
          color: #ffffff;
        }

        .showcase-footer {
          margin-top: 24px;
        }

        .security-tag {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #a6a2cb;
          font-size: 0.86rem;
        }

        /* Right Panel: Auth Card Box */
        .auth-card-box {
          background: #ffffff;
          color: #232043;
          border-radius: 28px;
          padding: 38px 40px;
          box-shadow: 0 25px 60px rgba(0, 0, 0, 0.45);
          position: relative;
        }

        /* Segmented Tabs */
        .segmented-tabs {
          display: flex;
          background: #eef0ff;
          border-radius: 999px;
          padding: 4px;
          margin-bottom: 26px;
        }

        .tab-btn {
          flex: 1;
          background: transparent;
          border: 0;
          padding: 10px 0;
          border-radius: 999px;
          font-family: 'Figtree', system-ui, sans-serif;
          font-weight: 700;
          font-size: 0.95rem;
          color: #5d5a85;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .tab-btn.is-active {
          background: #1a1550;
          color: #ffffff;
          box-shadow: 0 3px 10px rgba(26, 21, 80, 0.2);
        }

        .card-headline h1 {
          font-family: 'Bricolage Grotesque', system-ui, sans-serif;
          font-size: 1.68rem;
          font-weight: 800;
          color: #171347;
          margin: 0;
          letter-spacing: -0.02em;
        }

        .card-headline p {
          color: #5d5a85;
          font-size: 0.96rem;
          margin: 6px 0 20px 0;
        }

        /* PROPER ROUTING DETECTED CARD */
        .routing-card {
          background: #f7f8ff;
          border: 1.5px solid #dbe0f7;
          border-radius: 16px;
          padding: 14px 16px;
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 22px;
          box-shadow: 0 2px 8px rgba(26, 21, 80, 0.04);
        }

        .routing-avatar {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          color: #ffffff;
          display: grid;
          place-items: center;
          font-family: 'Bricolage Grotesque', system-ui, sans-serif;
          font-weight: 800;
          font-size: 1.15rem;
          flex-shrink: 0;
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15);
        }

        .routing-info {
          flex: 1;
          min-width: 0;
        }

        .routing-tag-row {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 3px;
        }

        .routing-pulse-indicator {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #10b981;
          box-shadow: 0 0 6px #10b981;
        }

        .routing-badge-label {
          font-size: 0.74rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #10b981;
        }

        .routing-name {
          font-size: 0.98rem;
          font-weight: 700;
          color: #171347;
          line-height: 1.25;
        }

        .routing-path-tag {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 4px;
          font-size: 0.82rem;
        }

        .dest-label {
          color: #5d5a85;
          font-weight: 500;
        }

        .routing-path-tag code {
          background: #1a1550;
          color: #ffb800;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          padding: 2px 8px;
          border-radius: 6px;
          font-size: 0.8rem;
          font-weight: 600;
        }

        /* Form Inputs */
        .crm-form .form-row {
          margin-bottom: 18px;
        }

        .crm-form label {
          display: block;
          font-size: 0.92rem;
          font-weight: 600;
          color: #1a1550;
          margin-bottom: 7px;
        }

        .crm-form label span {
          color: #ff5a4f;
          margin-left: 2px;
        }

        .label-with-link {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .forgot-link {
          background: transparent;
          border: 0;
          color: #ff5a4f;
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          padding: 0;
        }

        .forgot-link:hover {
          text-decoration: underline;
        }

        .input-container {
          position: relative;
          display: flex;
          align-items: center;
        }

        .field-icon {
          position: absolute;
          left: 14px;
          color: #8c88b8;
          pointer-events: none;
        }

        .input-container input {
          width: 100%;
          padding: 13px 44px 13px 42px;
          border: 2px solid #d8dbf2;
          border-radius: 12px;
          font-family: inherit;
          font-size: 1rem;
          color: #171347;
          background: #ffffff;
          box-sizing: border-box;
          transition: all 0.2s ease;
        }

        .clean-input {
          width: 100%;
          padding: 13px 16px;
          border: 2px solid #d8dbf2;
          border-radius: 12px;
          font-family: inherit;
          font-size: 1rem;
          color: #171347;
          background: #ffffff;
          box-sizing: border-box;
        }

        .input-container input:focus,
        .clean-input:focus {
          border-color: #2a2380;
          outline: none;
          box-shadow: 0 0 0 4px rgba(42, 35, 128, 0.1);
        }

        .pwd-toggle-btn {
          position: absolute;
          right: 12px;
          background: transparent;
          border: 0;
          color: #6a6699;
          cursor: pointer;
          display: flex;
          align-items: center;
          padding: 4px;
        }

        .pwd-toggle-btn:hover {
          color: #1a1550;
        }

        .submit-action-btn {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          background: #ffb800;
          color: #1a1550;
          font-family: 'Figtree', system-ui, sans-serif;
          font-weight: 700;
          font-size: 1.05rem;
          padding: 15px;
          border-radius: 999px;
          border: 0;
          cursor: pointer;
          margin-top: 10px;
          box-shadow: 0 6px 18px rgba(255, 184, 0, 0.35);
          transition: all 0.2s ease;
        }

        .submit-action-btn:hover {
          background: #e6a600;
          transform: translateY(-2px);
          box-shadow: 0 10px 24px rgba(255, 184, 0, 0.45);
        }

        .submit-action-btn:active {
          transform: translateY(0);
        }

        /* Profile Selector / Quick Logins */
        .profile-selector-box {
          margin-top: 24px;
          padding-top: 18px;
          border-top: 1px dashed #dbe0f7;
        }

        .selector-title {
          font-size: 0.76rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #7b77a6;
          margin-bottom: 10px;
        }

        .selector-pills {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .profile-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #f4f5fd;
          border: 1px solid #dbe0f7;
          padding: 6px 12px;
          border-radius: 999px;
          font-size: 0.82rem;
          color: #232043;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .profile-pill:hover {
          background: #e9ebfa;
          border-color: #2a2380;
        }

        .profile-pill.is-selected {
          background: #1a1550;
          color: #ffffff;
          border-color: #1a1550;
        }

        .profile-pill.is-selected .profile-pill-sub {
          color: #ffb800;
        }

        .profile-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .profile-pill-sub {
          font-size: 0.74rem;
          color: #5d5a85;
        }

        .card-footer-switch {
          margin-top: 22px;
          text-align: center;
          font-size: 0.92rem;
          color: #5d5a85;
        }

        .inline-action-link {
          background: transparent;
          border: 0;
          color: #1a1550;
          font-weight: 700;
          cursor: pointer;
          text-decoration: underline;
          padding: 0;
        }

        /* Verified Success State */
        .verified-success-state {
          text-align: center;
          padding: 24px 0;
        }

        .verified-circle {
          width: 68px;
          height: 68px;
          border-radius: 50%;
          background: #ecfdf5;
          display: grid;
          place-items: center;
          margin: 0 auto 18px;
          box-shadow: 0 0 0 10px rgba(16, 185, 129, 0.12);
        }

        .verified-success-state h2 {
          font-family: 'Bricolage Grotesque', system-ui, sans-serif;
          font-size: 1.6rem;
          color: #171347;
          margin: 0;
        }

        .verified-sub {
          color: #5d5a85;
          margin: 8px 0 18px 0;
        }

        .verified-route-box {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: #1a1550;
          color: #ffffff;
          padding: 8px 20px;
          border-radius: 999px;
          font-size: 0.95rem;
        }

        .verified-route-box code {
          color: #ffb800;
          font-family: monospace;
          font-weight: 700;
        }

        .switch-user-btn {
          background: #eef0ff;
          border: 0;
          color: #1a1550;
          padding: 10px 22px;
          border-radius: 999px;
          font-weight: 600;
          cursor: pointer;
        }

        /* Modal */
        .modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.65);
          backdrop-filter: blur(5px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
        }

        .modal-content-card {
          background: #ffffff;
          color: #232043;
          border-radius: 22px;
          padding: 32px;
          max-width: 420px;
          width: 100%;
          box-shadow: 0 25px 60px rgba(0, 0, 0, 0.4);
        }

        .modal-content-card h3 {
          font-family: 'Bricolage Grotesque', system-ui, sans-serif;
          font-size: 1.4rem;
          color: #1a1550;
          margin: 0 0 8px 0;
        }

        .modal-content-card p {
          color: #5d5a85;
          font-size: 0.94rem;
          margin: 0 0 20px 0;
          line-height: 1.5;
        }

        .modal-cancel-btn {
          background: #eef0ff;
          color: #1a1550;
          border: 0;
          padding: 12px 20px;
          border-radius: 999px;
          font-weight: 600;
          cursor: pointer;
        }

        .reset-alert-box {
          background: #ecfdf5;
          color: #065f46;
          padding: 14px 16px;
          border-radius: 10px;
          margin-bottom: 18px;
          font-size: 0.92rem;
          border: 1px solid #a7f3d0;
        }

        /* Responsive Breakpoints */
        @media (max-width: 960px) {
          .crm-split-wrapper {
            grid-template-columns: 1fr;
            max-width: 520px;
            gap: 36px;
          }

          .crm-showcase-panel {
            display: none;
          }

          .auth-card-box {
            padding: 30px 24px;
          }
        }
      `}</style>
    </div>
  );
}
