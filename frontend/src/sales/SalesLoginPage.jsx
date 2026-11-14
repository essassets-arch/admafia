import React, { useState } from 'react';
import adminAuthApi from '../services/adminAuthApi';
import './sales.css';

export default function SalesLoginPage({ onLoggedIn, onBackToWebsite, onSwitchToCustomerPortal }) {
  const [empId, setEmpId] = useState('sales@admafia.marketing');
  const [role, setRole] = useState('Sales Executive');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!empId.trim() || !password) {
      setError('Please enter your Sales Employee Email/Username and Password.');
      return;
    }
    setError('');
    setIsLoading(true);
    try {
      const res = await adminAuthApi.login({
        identifier: empId.trim(),
        password,
      });
      if (onLoggedIn) {
        onLoggedIn({
          empId: res.user?.email || empId.trim(),
          name: res.user?.fullName || 'Sales Executive',
          role: res.user?.role || role,
          user: res.user,
        });
      }
    } catch (err) {
      setError(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="sales-auth-bg">
      <div className="sales-auth-card">
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
            Ad <b>Mafia</b> <span>SALES DESK</span>
          </div>
          <h2>Sales Executive Portal</h2>
          <p>
            Sign in with your authoritative staff credentials to access inbound buyer inquiries, wallets &amp; lead distribution.
          </p>
        </div>

        {error && (
          <div style={{ background: '#fee2e2', border: '1px solid #fecaca', color: '#dc2626', padding: '10px 14px', borderRadius: '10px', fontSize: '0.85rem', marginBottom: '16px', fontWeight: 600 }}>
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="sales-form-group">
            <label htmlFor="salesEmpId">Employee Work Email / Username</label>
            <input
              id="salesEmpId"
              type="text"
              required
              value={empId}
              onChange={(e) => setEmpId(e.target.value)}
              placeholder="sales@admafia.marketing or sales"
            />
          </div>

          <div className="sales-form-group">
            <label htmlFor="salesRoleSelect">Sales Operational Role</label>
            <select
              id="salesRoleSelect"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="Sales Executive">Sales Executive (Inbound &amp; Wallets)</option>
              <option value="Senior Sales Executive">Senior Sales Executive (Tier 1 Inbound)</option>
              <option value="Sales Team Lead">Sales Team Lead (Escalations)</option>
            </select>
          </div>

          <div className="sales-form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label htmlFor="salesPwd" style={{ margin: 0 }}>Staff Password</label>
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
              placeholder="Enter authoritative password"
            />
          </div>

          <button type="submit" className="btn-sales-primary" disabled={isLoading}>
            <span>{isLoading ? 'Verifying Credentials...' : 'Sign In to Sales Desk'}</span>
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
