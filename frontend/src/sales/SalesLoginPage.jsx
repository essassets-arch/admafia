import React, { useState } from 'react';
import './sales.css';

export default function SalesLoginPage({ onLoggedIn, onBackToWebsite, onSwitchToCustomerPortal }) {
  const [empId, setEmpId] = useState('sales.rahul@growthline.in');
  const [role, setRole] = useState('Senior Sales Executive');
  const [password, setPassword] = useState('••••••••••••');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!empId.trim()) {
      setError('Please enter your Sales Employee ID or Work Email.');
      return;
    }
    setError('');
    onLoggedIn({
      empId,
      name: 'Rahul Sharma',
      role,
    });
  };

  const handleFillDemo = (repName, repEmail, repRole) => {
    setEmpId(repEmail);
    setRole(repRole);
    setError('');
  };

  return (
    <div className="sales-auth-bg">
      <div className="sales-auth-card">
        {/* Top Department Identifier */}
        <div style={{ textAlign: 'center' }}>
          <div className="sales-dept-badge">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
            <span>Department 2: Sales Executive Desk</span>
          </div>
        </div>

        <div className="sales-auth-header">
          <div className="sales-brand-logo">
            Growth<b>line</b> <span>SALES DESK</span>
          </div>
          <h2>Sales Executive Portal</h2>
          <p>
            Sign in to access inbound qualified buyer inquiries, deal stage Kanban &amp; proposal tools.
          </p>
        </div>

        {/* Demo Fast Fill Presets */}
        <div className="sales-demo-credentials-box">
          <div className="demo-title">
            <span>Demo Sales Credentials:</span>
            <span style={{ color: '#6366f1', fontWeight: 600 }}>Click to auto-fill</span>
          </div>
          <div
            className="demo-row"
            onClick={() => handleFillDemo('Rahul Sharma', 'rahul.sharma@growthline.in', 'Senior Sales Executive')}
            style={{ cursor: 'pointer', padding: '4px 0', borderBottom: '1px dashed #e2e8f0' }}
            title="Click to select Rahul Sharma"
          >
            <strong>Rahul Sharma (Sr. Exec)</strong>
            <span>rahul.sharma@growthline.in</span>
          </div>
          <div
            className="demo-row"
            onClick={() => handleFillDemo('Priya Mehta', 'priya.mehta@growthline.in', 'Inbound Sales Specialist')}
            style={{ cursor: 'pointer', padding: '4px 0' }}
            title="Click to select Priya Mehta"
          >
            <strong>Priya Mehta (Specialist)</strong>
            <span>priya.mehta@growthline.in</span>
          </div>
        </div>

        {error && (
          <div style={{ background: '#fee2e2', border: '1px solid #fecaca', color: '#dc2626', padding: '10px 14px', borderRadius: '10px', fontSize: '0.85rem', marginBottom: '16px', fontWeight: 600 }}>
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="sales-form-group">
            <label htmlFor="salesEmpId">Employee Work Email / ID</label>
            <input
              id="salesEmpId"
              type="text"
              required
              value={empId}
              onChange={(e) => setEmpId(e.target.value)}
              placeholder="e.g. rahul.sharma@growthline.in"
            />
          </div>

          <div className="sales-form-group">
            <label htmlFor="salesRoleSelect">Sales Operational Role</label>
            <select
              id="salesRoleSelect"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="Senior Sales Executive">Senior Sales Executive (Tier 1 Inbound)</option>
              <option value="Inbound Sales Specialist">Inbound Sales Specialist (Rapid Response)</option>
              <option value="Sales Team Lead">Sales Team Lead (Escalations)</option>
            </select>
          </div>

          <div className="sales-form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label htmlFor="salesPwd" style={{ margin: 0 }}>Password</label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{ background: 'none', border: 'none', color: '#6366f1', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer', padding: 0 }}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <input
              id="salesPwd"
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
            />
          </div>

          <button type="submit" className="btn-sales-primary">
            <span>Sign In to Sales Desk</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14"/>
              <path d="M12 5l7 7-7 7"/>
            </svg>
          </button>
        </form>

        <div className="sales-login-footers">
          <div>
            Need customer portal?{' '}
            <button
              type="button"
              className="btn-sales-subtle-link"
              onClick={onSwitchToCustomerPortal}
            >
              Customer Workspace Login (/login)
            </button>
          </div>
          {onBackToWebsite && (
            <div>
              <button
                type="button"
                className="btn-sales-subtle-link"
                onClick={onBackToWebsite}
                style={{ color: '#64748b' }}
              >
                &larr; Back to Public Website
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
