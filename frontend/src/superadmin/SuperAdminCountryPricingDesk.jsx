import React, { useState, useEffect } from 'react';
import {
  Globe,
  Plus,
  Edit2,
  Check,
  X,
  Search,
  RotateCcw,
  ShieldCheck,
  AlertCircle,
  TrendingUp,
  Activity,
  History,
  DollarSign,
  ChevronRight,
  Eye,
} from 'lucide-react';
import adminAuthApi from '../services/adminAuthApi';

export default function SuperAdminCountryPricingDesk() {
  const [countries, setCountries] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('countries'); // 'countries' | 'logs' | 'test-ip'
  const [searchQuery, setSearchQuery] = useState('');
  const [alert, setAlert] = useState(null);

  // Edit / Add Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCountry, setEditingCountry] = useState(null);
  const [formData, setFormData] = useState({
    country_code: '',
    country_name: '',
    currency_code: '',
    currency_symbol: '',
    currency_position: 'before',
    decimal_precision: 0,
    daily_min_budget: 10,
    monthly_budget: 300,
    min_wallet_topup: 10,
    tax_name: 'VAT',
    tax_rate: 5,
    payment_gateway: 'razorpay',
    phone_code: '+1',
    flag_emoji: '🌐',
    is_active: true,
  });

  // IP Geolocation Sandbox Tester
  const [testIp, setTestIp] = useState('94.200.0.1'); // UAE IP as sample
  const [testResult, setTestResult] = useState(null);
  const [testingIp, setTestingIp] = useState(false);

  const fetchPricingData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/superadmin/country-pricing', {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminAuthApi.getToken()}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setCountries(data.countries || []);
      }

      // Fetch analytics
      const anaRes = await fetch('/api/superadmin/country-pricing/analytics', {
        headers: {
          'Authorization': `Bearer ${adminAuthApi.getToken()}`,
        },
      });
      if (anaRes.ok) {
        const anaData = await anaRes.json();
        setAnalytics(anaData);
      }

      // Fetch audit logs
      const logRes = await fetch('/api/superadmin/country-pricing/audit-logs', {
        headers: {
          'Authorization': `Bearer ${adminAuthApi.getToken()}`,
        },
      });
      if (logRes.ok) {
        const logData = await logRes.json();
        setAuditLogs(logData.logs || []);
      }
    } catch (err) {
      console.error('[CountryPricingDesk] Failed to fetch pricing data:', err);
      showAlert('error', 'Failed to connect to backend server');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPricingData();
  }, []);

  const showAlert = (type, message) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 4000);
  };

  const openAddModal = () => {
    setEditingCountry(null);
    setFormData({
      country_code: '',
      country_name: '',
      currency_code: '',
      currency_symbol: '',
      currency_position: 'before',
      decimal_precision: 2,
      daily_min_budget: 10,
      monthly_budget: 300,
      min_wallet_topup: 10,
      tax_name: 'VAT',
      tax_rate: 0,
      payment_gateway: 'razorpay',
      phone_code: '+',
      flag_emoji: '🌐',
      is_active: true,
    });
    setModalOpen(true);
  };

  const openEditModal = (c) => {
    setEditingCountry(c);
    setFormData({
      country_code: c.country_code,
      country_name: c.country_name,
      currency_code: c.currency_code,
      currency_symbol: c.currency_symbol,
      currency_position: c.currency_position || 'before',
      decimal_precision: c.decimal_precision !== undefined ? c.decimal_precision : 0,
      daily_min_budget: c.daily_min_budget,
      monthly_budget: c.monthly_budget || c.daily_min_budget * 30,
      min_wallet_topup: c.min_wallet_topup || c.daily_min_budget,
      tax_name: c.tax_name || '',
      tax_rate: c.tax_rate !== undefined ? c.tax_rate : 0,
      payment_gateway: c.payment_gateway || 'razorpay',
      phone_code: c.phone_code || '+',
      flag_emoji: c.flag_emoji || '🌐',
      is_active: c.is_active,
    });
    setModalOpen(true);
  };

  const handleSaveCountry = async (e) => {
    e.preventDefault();
    if (!formData.country_code || !formData.currency_code || !formData.daily_min_budget) {
      showAlert('error', 'Please fill in country code, currency code, and daily budget');
      return;
    }

    try {
      const isEdit = Boolean(editingCountry);
      const url = isEdit
        ? `/api/superadmin/country-pricing/${editingCountry.id || editingCountry.country_code}`
        : '/api/superadmin/country-pricing';
      const method = isEdit ? 'PUT' : 'POST';

      const user = adminAuthApi.getCurrentUser();
      const payload = {
        ...formData,
        daily_min_budget: Number(formData.daily_min_budget),
        monthly_budget: Number(formData.daily_min_budget) * 30,
        min_wallet_topup: Number(formData.min_wallet_topup || formData.daily_min_budget),
        tax_rate: Number(formData.tax_rate || 0),
        changed_by: user?.fullName || user?.username || 'Super Admin',
      };

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminAuthApi.getToken()}`,
        },
        body: JSON.stringify(payload),
      });

      const resData = await res.json();
      if (res.ok && resData.ok) {
        showAlert('success', `Country pricing for ${formData.country_name} (${formData.country_code}) successfully saved.`);
        setModalOpen(false);
        fetchPricingData();
      } else {
        showAlert('error', resData.error || 'Failed to save country pricing');
      }
    } catch (err) {
      showAlert('error', err.message);
    }
  };

  const handleToggleStatus = async (country) => {
    try {
      const user = adminAuthApi.getCurrentUser();
      const newStatus = !country.is_active;
      const res = await fetch(`/api/superadmin/country-pricing/${country.id || country.country_code}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminAuthApi.getToken()}`,
        },
        body: JSON.stringify({
          is_active: newStatus,
          changed_by: user?.fullName || 'Super Admin',
        }),
      });

      if (res.ok) {
        showAlert('success', `${country.country_name} marked as ${newStatus ? 'ACTIVE' : 'INACTIVE'}`);
        fetchPricingData();
      }
    } catch (err) {
      showAlert('error', err.message);
    }
  };

  const handleTestIp = async (e) => {
    e.preventDefault();
    if (!testIp.trim()) return;
    setTestingIp(true);
    setTestResult(null);

    try {
      const res = await fetch(`/api/public/country-detection?test_ip=${encodeURIComponent(testIp.trim())}`, {
        headers: { 'X-Forwarded-For': testIp.trim() },
      });
      const data = await res.json();
      setTestResult(data);
    } catch (err) {
      showAlert('error', `Failed to test IP: ${err.message}`);
    } finally {
      setTestingIp(false);
    }
  };

  const filteredCountries = countries.filter((c) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      c.country_name?.toLowerCase().includes(q) ||
      c.country_code?.toLowerCase().includes(q) ||
      c.currency_code?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="country-pricing-desk">
      {/* Top Banner Alert */}
      {alert && (
        <div className={`cp-alert-banner ${alert.type}`}>
          {alert.type === 'success' ? <Check size={18} /> : <AlertCircle size={18} />}
          <span>{alert.message}</span>
        </div>
      )}

      {/* KPI Cards Strip */}
      <div className="cp-kpi-grid">
        <div className="cp-kpi-card">
          <div className="cp-kpi-header">
            <span>Configured Countries</span>
            <Globe size={18} color="#4f46e5" />
          </div>
          <div className="cp-kpi-value">{countries.length} Regions</div>
          <div className="cp-kpi-sub">
            {countries.filter((c) => c.is_active).length} Active · 1 Default Fallback
          </div>
        </div>

        <div className="cp-kpi-card">
          <div className="cp-kpi-header">
            <span>Base Indian Rate</span>
            <DollarSign size={18} color="#059669" />
          </div>
          <div className="cp-kpi-value">₹300 / Day</div>
          <div className="cp-kpi-sub">Domestic baseline budget (₹9,000/mo)</div>
        </div>

        <div className="cp-kpi-card">
          <div className="cp-kpi-header">
            <span>Standard Global Rate</span>
            <TrendingUp size={18} color="#d97706" />
          </div>
          <div className="cp-kpi-value">$10 / Day</div>
          <div className="cp-kpi-sub">US, UAE (AED 10), UK (£10), SA (SAR 10)</div>
        </div>

        <div className="cp-kpi-card">
          <div className="cp-kpi-header">
            <span>Detection Engine</span>
            <Activity size={18} color="#10b981" />
          </div>
          <div className="cp-kpi-value">Live (Cloudflare + GeoIP)</div>
          <div className="cp-kpi-sub">Dual-tier offline &amp; edge resolution</div>
        </div>
      </div>

      {/* Nav Tabs & Action Controls */}
      <div className="cp-controls-bar">
        <div className="cp-tabs">
          <button
            type="button"
            className={`cp-tab-btn ${activeTab === 'countries' ? 'active' : ''}`}
            onClick={() => setActiveTab('countries')}
          >
            <Globe size={15} />
            <span>Country Pricing Master ({countries.length})</span>
          </button>
          <button
            type="button"
            className={`cp-tab-btn ${activeTab === 'test-ip' ? 'active' : ''}`}
            onClick={() => setActiveTab('test-ip')}
          >
            <Activity size={15} />
            <span>Live IP Detection Sandbox</span>
          </button>
          <button
            type="button"
            className={`cp-tab-btn ${activeTab === 'logs' ? 'active' : ''}`}
            onClick={() => setActiveTab('logs')}
          >
            <History size={15} />
            <span>Audit Trail &amp; Rate Changes ({auditLogs.length})</span>
          </button>
        </div>

        {activeTab === 'countries' && (
          <button type="button" className="cp-add-btn" onClick={openAddModal}>
            <Plus size={16} />
            <span>Add Regional Rate</span>
          </button>
        )}
      </div>

      {/* VIEW 1: Country Master Table */}
      {activeTab === 'countries' && (
        <div className="cp-card">
          <div className="cp-card-header">
            <div className="cp-search-wrap">
              <Search size={16} color="#94a3b8" />
              <input
                type="text"
                placeholder="Search country name, ISO code, or currency..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="cp-count-pill">{filteredCountries.length} countries matching</div>
          </div>

          <div className="cp-table-wrap">
            <table className="cp-table">
              <thead>
                <tr>
                  <th>Country &amp; ISO</th>
                  <th>Currency</th>
                  <th>Daily Min Starting Rate</th>
                  <th>Monthly Spend (30d)</th>
                  <th>Min Wallet Top-Up</th>
                  <th>Tax Setting</th>
                  <th>Gateway</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCountries.map((c) => (
                  <tr key={c.country_code} className={!c.is_active ? 'inactive-row' : ''}>
                    <td>
                      <div className="cp-country-cell">
                        <span className="cp-flag">{c.flag_emoji || '🌐'}</span>
                        <div>
                          <strong>{c.country_name}</strong>
                          <div className="cp-iso-code">
                            <code>{c.country_code}</code>
                            {c.is_default && <span className="default-pill">Default</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div>
                        <strong>{c.currency_code}</strong> ({c.currency_symbol})
                      </div>
                      <small className="cp-muted-text">Code: {c.phone_code || 'N/A'}</small>
                    </td>
                    <td>
                      <div className="cp-rate-tag">
                        <strong>
                          {c.currency_symbol}
                          {Number(c.daily_min_budget).toLocaleString()}
                        </strong>
                        <span className="unit">/day</span>
                      </div>
                    </td>
                    <td>
                      <div className="cp-monthly-tag">
                        {c.currency_symbol}
                        {Number(c.daily_min_budget * 30).toLocaleString()}
                      </div>
                    </td>
                    <td>
                      {c.currency_symbol}
                      {Number(c.min_wallet_topup || c.daily_min_budget).toLocaleString()}
                    </td>
                    <td>
                      <div className="cp-tax-pill">
                        {c.tax_name || 'Tax'}: {c.tax_rate}%
                      </div>
                    </td>
                    <td>
                      <code className="cp-gateway-code">{c.payment_gateway || 'razorpay'}</code>
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(c)}
                        className={`cp-status-pill ${c.is_active ? 'active' : 'inactive'}`}
                        title="Click to toggle status"
                      >
                        {c.is_active ? 'Active ✓' : 'Inactive ✕'}
                      </button>
                    </td>
                    <td>
                      <div className="cp-action-row">
                        <button
                          type="button"
                          className="cp-edit-btn"
                          onClick={() => openEditModal(c)}
                          title="Edit Pricing & Settings"
                        >
                          <Edit2 size={14} />
                          <span>Edit</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 2: Live IP Detection Sandbox */}
      {activeTab === 'test-ip' && (
        <div className="cp-card">
          <div style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '8px', color: '#0f172a' }}>
              Test Visitor IP Country Detection
            </h3>
            <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '20px' }}>
              Simulate an incoming visitor request with any public IP address to verify how Cloudflare headers and offline MaxMind GeoIP resolve their country, currency, and daily rate.
            </p>

            <form onSubmit={handleTestIp} style={{ display: 'flex', gap: '12px', maxWidth: '640px', marginBottom: '24px' }}>
              <input
                type="text"
                placeholder="Enter test IP address (e.g. 94.200.0.1 or 8.8.8.8)"
                value={testIp}
                onChange={(e) => setTestIp(e.target.value)}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontFamily: 'monospace',
                }}
              />
              <button
                type="submit"
                disabled={testingIp}
                style={{
                  background: '#4f46e5',
                  color: '#ffffff',
                  padding: '10px 20px',
                  borderRadius: '8px',
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {testingIp ? 'Detecting...' : 'Resolve IP Country'}
              </button>
            </form>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '24px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setTestIp('122.161.0.1')}
                className="cp-preset-ip-btn"
              >
                🇮🇳 India (122.161.0.1)
              </button>
              <button
                type="button"
                onClick={() => setTestIp('94.200.0.1')}
                className="cp-preset-ip-btn"
              >
                🇦🇪 UAE (94.200.0.1)
              </button>
              <button
                type="button"
                onClick={() => setTestIp('8.8.8.8')}
                className="cp-preset-ip-btn"
              >
                🇺🇸 USA (8.8.8.8)
              </button>
              <button
                type="button"
                onClick={() => setTestIp('81.130.0.1')}
                className="cp-preset-ip-btn"
              >
                🇬🇧 UK (81.130.0.1)
              </button>
              <button
                type="button"
                onClick={() => setTestIp('212.118.128.1')}
                className="cp-preset-ip-btn"
              >
                🇸🇦 Saudi Arabia (212.118.128.1)
              </button>
            </div>

            {testResult && (
              <div className="cp-test-result-box">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <span style={{ fontSize: '2.5rem' }}>{testResult.country?.flag_emoji || '🌐'}</span>
                  <div>
                    <h4 style={{ fontSize: '1.3rem', margin: 0, color: '#0f172a' }}>
                      {testResult.country?.country_name} ({testResult.country?.country_code})
                    </h4>
                    <span style={{ color: '#059669', fontWeight: 700, fontSize: '0.95rem' }}>
                      Daily Starting Budget: {testResult.country?.currency_symbol}
                      {testResult.country?.daily_min_budget}/Day ({testResult.country?.currency_code})
                    </span>
                  </div>
                </div>

                <div className="cp-test-details-grid">
                  <div>
                    <small>Tested IP</small>
                    <code>{testResult.ip}</code>
                  </div>
                  <div>
                    <small>Detection Source</small>
                    <strong>{testResult.detectionSource}</strong>
                  </div>
                  <div>
                    <small>Auto-Detected</small>
                    <span style={{ color: testResult.isAutoDetected ? '#059669' : '#d97706', fontWeight: 700 }}>
                      {testResult.isAutoDetected ? 'YES ✓' : 'NO (Fallback)'}
                    </span>
                  </div>
                  <div>
                    <small>Currency &amp; Decimals</small>
                    <strong>
                      {testResult.country?.currency_code} ({testResult.country?.currency_symbol}) · {testResult.country?.decimal_precision} dec
                    </strong>
                  </div>
                  <div>
                    <small>Monthly Spend</small>
                    <strong>
                      {testResult.country?.currency_symbol}
                      {testResult.country?.daily_min_budget * 30} / month
                    </strong>
                  </div>
                  <div>
                    <small>Applicable Tax</small>
                    <strong>
                      {testResult.country?.tax_name} ({testResult.country?.tax_rate}%)
                    </strong>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 3: Audit Trail & Logs */}
      {activeTab === 'logs' && (
        <div className="cp-card">
          <div className="cp-card-header">
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Pricing Modification Audit Logs</h3>
              <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.85rem' }}>
                Permanent audit log of every daily rate, tax rate, or currency change made by Super Admin.
              </p>
            </div>
          </div>

          <div className="cp-table-wrap">
            <table className="cp-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Action</th>
                  <th>Country</th>
                  <th>Modified By</th>
                  <th>Details / Changes</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td>
                      <small className="cp-muted-text">
                        {new Date(log.created_at).toLocaleString('en-US', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </small>
                    </td>
                    <td>
                      <span className={`cp-action-tag ${log.action}`}>
                        {log.action?.toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <strong>{log.country_code}</strong>
                    </td>
                    <td>
                      <code>{log.changed_by}</code>
                    </td>
                    <td>
                      <pre className="cp-log-json">
                        {JSON.stringify(log.new_values || log.old_values, null, 2)}
                      </pre>
                    </td>
                  </tr>
                ))}
                {auditLogs.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
                      No rate adjustments logged yet. Initial rates seeded into MongoDB master.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit / Add Modal */}
      {modalOpen && (
        <div className="cp-modal-backdrop" onClick={() => setModalOpen(false)}>
          <div className="cp-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="cp-modal-header">
              <h3>{editingCountry ? `Edit ${editingCountry.country_name} (${editingCountry.country_code})` : 'Add New Country Pricing'}</h3>
              <button type="button" onClick={() => setModalOpen(false)} className="cp-modal-close">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveCountry} className="cp-modal-form">
              <div className="cp-form-row-2">
                <div className="cp-input-group">
                  <label>Country Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Germany"
                    value={formData.country_name}
                    onChange={(e) => setFormData({ ...formData, country_name: e.target.value })}
                  />
                </div>
                <div className="cp-input-group">
                  <label>ISO 2-Letter Code *</label>
                  <input
                    type="text"
                    required
                    maxLength={2}
                    placeholder="e.g. DE"
                    value={formData.country_code}
                    disabled={Boolean(editingCountry)}
                    onChange={(e) => setFormData({ ...formData, country_code: e.target.value.toUpperCase() })}
                  />
                </div>
              </div>

              <div className="cp-form-row-3">
                <div className="cp-input-group">
                  <label>Currency Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. EUR"
                    value={formData.currency_code}
                    onChange={(e) => setFormData({ ...formData, currency_code: e.target.value.toUpperCase() })}
                  />
                </div>
                <div className="cp-input-group">
                  <label>Symbol *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. €"
                    value={formData.currency_symbol}
                    onChange={(e) => setFormData({ ...formData, currency_symbol: e.target.value })}
                  />
                </div>
                <div className="cp-input-group">
                  <label>Flag Emoji</label>
                  <input
                    type="text"
                    placeholder="e.g. 🇩🇪"
                    value={formData.flag_emoji}
                    onChange={(e) => setFormData({ ...formData, flag_emoji: e.target.value })}
                  />
                </div>
              </div>

              <div className="cp-form-row-3">
                <div className="cp-input-group">
                  <label>Daily Min Budget *</label>
                  <input
                    type="number"
                    step="any"
                    min="1"
                    required
                    value={formData.daily_min_budget}
                    onChange={(e) => setFormData({ ...formData, daily_min_budget: e.target.value })}
                  />
                </div>
                <div className="cp-input-group">
                  <label>Min Wallet Top-Up</label>
                  <input
                    type="number"
                    step="any"
                    min="1"
                    value={formData.min_wallet_topup}
                    onChange={(e) => setFormData({ ...formData, min_wallet_topup: e.target.value })}
                  />
                </div>
                <div className="cp-input-group">
                  <label>Phone Dialing Code</label>
                  <input
                    type="text"
                    placeholder="e.g. +49"
                    value={formData.phone_code}
                    onChange={(e) => setFormData({ ...formData, phone_code: e.target.value })}
                  />
                </div>
              </div>

              <div className="cp-form-row-3">
                <div className="cp-input-group">
                  <label>Tax Name</label>
                  <input
                    type="text"
                    placeholder="e.g. VAT, GST"
                    value={formData.tax_name}
                    onChange={(e) => setFormData({ ...formData, tax_name: e.target.value })}
                  />
                </div>
                <div className="cp-input-group">
                  <label>Tax Rate (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={formData.tax_rate}
                    onChange={(e) => setFormData({ ...formData, tax_rate: e.target.value })}
                  />
                </div>
                <div className="cp-input-group">
                  <label>Gateway</label>
                  <select
                    value={formData.payment_gateway}
                    onChange={(e) => setFormData({ ...formData, payment_gateway: e.target.value })}
                  >
                    <option value="razorpay">Razorpay</option>
                    <option value="stripe">Stripe</option>
                    <option value="manual_bank">Manual Bank UTR</option>
                  </select>
                </div>
              </div>

              <div className="cp-form-row-2" style={{ marginTop: '12px', alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  />
                  <span style={{ fontWeight: 600 }}>Active for Public IP Detection &amp; Selection</span>
                </label>
              </div>

              <div className="cp-modal-footer">
                <button type="button" onClick={() => setModalOpen(false)} className="cp-btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="cp-btn-primary">
                  Save Regional Pricing
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Desk Scoped Styles */}
      <style>{`
        .country-pricing-desk {
          padding: 24px;
        }

        .cp-alert-banner {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 18px;
          border-radius: 8px;
          margin-bottom: 20px;
          font-weight: 600;
        }
        .cp-alert-banner.success {
          background: #ecfdf5;
          color: #065f46;
          border: 1px solid #a7f3d0;
        }
        .cp-alert-banner.error {
          background: #fef2f2;
          color: #991b1b;
          border: 1px solid #fecaca;
        }

        .cp-kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 16px;
          margin-bottom: 24px;
        }
        .cp-kpi-card {
          background: #ffffff;
          padding: 18px;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        .cp-kpi-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          color: #64748b;
          font-size: 0.84rem;
          font-weight: 600;
        }
        .cp-kpi-value {
          font-size: 1.6rem;
          font-weight: 800;
          color: #0f172a;
          margin: 8px 0 4px;
        }
        .cp-kpi-sub {
          font-size: 0.78rem;
          color: #94a3b8;
        }

        .cp-controls-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          flex-wrap: wrap;
          gap: 12px;
        }
        .cp-tabs {
          display: flex;
          gap: 8px;
        }
        .cp-tab-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          background: #ffffff;
          color: #475569;
          font-weight: 600;
          font-size: 0.88rem;
          cursor: pointer;
          transition: all 0.2s;
        }
        .cp-tab-btn.active {
          background: #4f46e5;
          color: #ffffff;
          border-color: #4f46e5;
        }
        .cp-add-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          background: #059669;
          color: #ffffff;
          border: none;
          border-radius: 8px;
          font-weight: 700;
          cursor: pointer;
        }

        .cp-card {
          background: #ffffff;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        .cp-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          border-bottom: 1px solid #f1f5f9;
        }
        .cp-search-wrap {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #f8fafc;
          border: 1px solid #cbd5e1;
          padding: 6px 12px;
          border-radius: 8px;
          width: 320px;
        }
        .cp-search-wrap input {
          border: none;
          background: transparent;
          outline: none;
          font-size: 0.88rem;
          width: 100%;
        }
        .cp-count-pill {
          font-size: 0.8rem;
          color: #64748b;
          font-weight: 600;
        }

        .cp-table-wrap {
          overflow-x: auto;
        }
        .cp-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.88rem;
          text-align: left;
        }
        .cp-table th {
          background: #f8fafc;
          padding: 12px 16px;
          color: #475569;
          font-weight: 700;
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          border-bottom: 1px solid #e2e8f0;
        }
        .cp-table td {
          padding: 14px 16px;
          border-bottom: 1px solid #f1f5f9;
          vertical-align: middle;
        }
        .cp-table tr:hover {
          background: #f8fafc;
        }
        .inactive-row {
          opacity: 0.55;
          background: #fafafa;
        }

        .cp-country-cell {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .cp-flag {
          font-size: 1.5rem;
          line-height: 1;
        }
        .cp-iso-code {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 2px;
        }
        .cp-iso-code code {
          background: #f1f5f9;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 0.75rem;
          color: #475569;
        }
        .default-pill {
          background: #dbeafe;
          color: #1e40af;
          font-size: 0.7rem;
          padding: 1px 6px;
          border-radius: 4px;
          font-weight: 700;
        }

        .cp-rate-tag {
          font-size: 1rem;
          color: #059669;
        }
        .cp-rate-tag .unit {
          color: #64748b;
          font-size: 0.8rem;
        }
        .cp-monthly-tag {
          font-weight: 700;
          color: #0f172a;
        }
        .cp-tax-pill {
          display: inline-block;
          background: #f1f5f9;
          color: #334155;
          padding: 3px 8px;
          border-radius: 6px;
          font-size: 0.8rem;
          font-weight: 600;
        }
        .cp-gateway-code {
          background: #ede9fe;
          color: #6d28d9;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 0.78rem;
        }

        .cp-status-pill {
          border: none;
          padding: 4px 10px;
          border-radius: 999px;
          font-size: 0.78rem;
          font-weight: 700;
          cursor: pointer;
        }
        .cp-status-pill.active {
          background: #dcfce7;
          color: #15803d;
        }
        .cp-status-pill.inactive {
          background: #fee2e2;
          color: #b91c1c;
        }

        .cp-edit-btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          background: #f8fafc;
          border: 1px solid #cbd5e1;
          color: #334155;
          padding: 5px 10px;
          border-radius: 6px;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
        }
        .cp-edit-btn:hover {
          background: #f1f5f9;
          border-color: #94a3b8;
        }

        .cp-preset-ip-btn {
          background: #f1f5f9;
          border: 1px solid #cbd5e1;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 0.82rem;
          cursor: pointer;
          font-weight: 600;
          color: #334155;
        }
        .cp-preset-ip-btn:hover {
          background: #e2e8f0;
        }

        .cp-test-result-box {
          background: #f8fafc;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          padding: 20px;
        }
        .cp-test-details-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 16px;
          margin-top: 14px;
          padding-top: 14px;
          border-top: 1px solid #e2e8f0;
        }
        .cp-test-details-grid small {
          display: block;
          color: #64748b;
          font-size: 0.75rem;
          text-transform: uppercase;
          margin-bottom: 4px;
        }

        .cp-action-tag {
          font-size: 0.72rem;
          font-weight: 800;
          padding: 2px 6px;
          border-radius: 4px;
        }
        .cp-action-tag.insert { background: #dcfce7; color: #15803d; }
        .cp-action-tag.update { background: #dbeafe; color: #1e40af; }
        .cp-log-json {
          margin: 0;
          font-size: 0.72rem;
          max-height: 80px;
          overflow-y: auto;
          background: #f1f5f9;
          padding: 6px;
          border-radius: 4px;
        }

        .cp-modal-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(15, 23, 42, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 16px;
        }
        .cp-modal-card {
          background: #ffffff;
          border-radius: 12px;
          width: 100%;
          max-width: 600px;
          box-shadow: 0 20px 25px -5px rgba(0,0,0,0.2);
          overflow: hidden;
        }
        .cp-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          border-bottom: 1px solid #e2e8f0;
        }
        .cp-modal-header h3 {
          margin: 0;
          font-size: 1.15rem;
          color: #0f172a;
        }
        .cp-modal-close {
          background: transparent;
          border: none;
          color: #64748b;
          cursor: pointer;
        }
        .cp-modal-form {
          padding: 20px;
        }
        .cp-form-row-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
          margin-bottom: 14px;
        }
        .cp-form-row-3 {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 14px;
          margin-bottom: 14px;
        }
        .cp-input-group label {
          display: block;
          font-size: 0.8rem;
          font-weight: 700;
          color: #334155;
          margin-bottom: 4px;
        }
        .cp-input-group input, .cp-input-group select {
          width: 100%;
          padding: 8px 12px;
          border-radius: 6px;
          border: 1px solid #cbd5e1;
          font-size: 0.88rem;
          outline: none;
        }
        .cp-input-group input:focus, .cp-input-group select:focus {
          border-color: #4f46e5;
        }
        .cp-modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 20px;
          padding-top: 16px;
          border-top: 1px solid #f1f5f9;
        }
        .cp-btn-secondary {
          background: #f1f5f9;
          color: #334155;
          border: none;
          padding: 8px 16px;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
        }
        .cp-btn-primary {
          background: #4f46e5;
          color: #ffffff;
          border: none;
          padding: 8px 18px;
          border-radius: 6px;
          font-weight: 700;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}

