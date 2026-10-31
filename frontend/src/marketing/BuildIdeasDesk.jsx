import React, { useState, useEffect, useCallback } from 'react';
import {
  Lightbulb,
  Sparkles,
  Save,
  Building,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import Swal from 'sweetalert2';
import marketingApi from '../services/marketingApi';

const PLATFORMS = [
  'Instagram & Facebook (Meta Ads)',
  'Instagram',
  'Facebook',
];

const LANGUAGES = [
  'English / Hinglish',
  'Hindi',
  'English',
  'Gujarati',
  'Marathi',
];

export default function BuildIdeasDesk({ initialCustomerId = null, onNavigateToDesk }) {
  const [customers, setCustomers] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState(initialCustomerId || '');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerIdeas, setCustomerIdeas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  // 6 Core Requested Fields
  const [title, setTitle] = useState('');
  const [platform, setPlatform] = useState('Instagram & Facebook (Meta Ads)');
  const [language, setLanguage] = useState('English / Hinglish');
  const [callToAction, setCallToAction] = useState('Enquire Now');
  const [concept, setConcept] = useState('');

  // Load Customers
  useEffect(() => {
    async function loadEligibleCustomers() {
      try {
        const data = await marketingApi.getCustomers({ limit: 100 });
        if (data && data.ok) {
          setCustomers(data.customers || []);
          if (initialCustomerId) {
            setSelectedCustomerId(initialCustomerId);
          } else if (data.customers.length > 0 && !selectedCustomerId) {
            setSelectedCustomerId(data.customers[0].id);
          }
        }
      } catch (err) {
        console.error('[BuildIdeasDesk] Customer load failed', err);
      }
    }
    loadEligibleCustomers();
  }, [initialCustomerId]);

  // Load customer detail & ideas whenever selectedCustomerId changes
  const fetchCustomerData = useCallback(async (custId) => {
    if (!custId) return;
    setLoading(true);
    try {
      const [custRes, ideasRes] = await Promise.allSettled([
        marketingApi.getCustomerDetail(custId),
        marketingApi.getIdeas({ customerId: custId }),
      ]);

      if (custRes.status === 'fulfilled' && custRes.value?.ok) {
        setSelectedCustomer(custRes.value.customer);
      }

      if (ideasRes.status === 'fulfilled' && ideasRes.value?.ok) {
        setCustomerIdeas(ideasRes.value.ideas || []);
      } else {
        setCustomerIdeas([]);
      }
    } catch (err) {
      console.error('[BuildIdeasDesk] Failed to load customer detail', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedCustomerId) {
      fetchCustomerData(selectedCustomerId);
    }
  }, [selectedCustomerId, fetchCustomerData]);

  // Generate Profile Suggestions (fills Campaign Name, CTA & Description)
  const handleGenerateSuggestions = () => {
    if (!selectedCustomer) {
      Swal.fire({ icon: 'warning', title: 'Please select a customer first.' });
      return;
    }

    setGenerating(true);
    const cat = selectedCustomer.category || 'Professional Services';
    const comp = selectedCustomer.name || 'Your Business';
    const city = selectedCustomer.city || 'India';

    setTimeout(() => {
      setTitle(`${comp} - ${cat} Inbound Campaign`);
      setPlatform('Instagram & Facebook (Meta Ads)');
      setLanguage('English / Hinglish');
      setCallToAction('Enquire Now');
      setConcept(`Connect with prospective customers seeking verified ${cat} solutions in ${city}. Highlighting ${comp}'s industry expertise, verified quality, and tailored commercial offerings.`);
      setGenerating(false);

      Swal.fire({
        icon: 'success',
        title: 'Suggestions Generated',
        text: 'Tailored campaign name, CTA, and description generated from customer profile.',
        timer: 1400,
        showConfirmButton: false,
      });
    }, 300);
  };

  // Save Idea to Backend
  const handleSaveIdea = async (status = 'Saved') => {
    if (!selectedCustomerId) {
      Swal.fire({ icon: 'warning', title: 'Customer selection is required.' });
      return;
    }
    if (!title.trim()) {
      Swal.fire({ icon: 'warning', title: 'Please provide a campaign name.' });
      return;
    }
    if (!concept.trim()) {
      Swal.fire({ icon: 'warning', title: 'Please provide a description.' });
      return;
    }

    setSaving(true);
    try {
      const res = await marketingApi.createIdea({
        customerId: selectedCustomerId,
        title: title.trim(),
        objective: 'Lead Generation',
        concept: concept.trim(),
        targetAudience: '',
        captionSuggestions: concept.trim(),
        callToAction: callToAction || 'Enquire Now',
        hashtags: '',
        creativeBrief: '',
        platform,
        language,
        campaignPeriod: '',
        constraints: '',
        status,
        createdBy: 'Marketing Strategy Team',
      });

      if (res && res.ok) {
        Swal.fire({
          icon: 'success',
          title: 'Idea Saved!',
          text: `Marketing idea "${title}" has been saved and is now ready for post creation.`,
          confirmButtonColor: '#4f46e5',
        });
        // Clear or refresh customer ideas list
        fetchCustomerData(selectedCustomerId);
      }
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'Failed to Save Idea',
        text: err.message || 'An error occurred while saving the idea.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="marketing-build-ideas-page">
      {/* 1. Header */}
      <div className="marketing-page-header">
        <div className="marketing-header-title-col">
          <h1>Build Marketing Ideas</h1>
          <p>
            Structure campaign ideas with platform targeting, language, call to action, and strategic descriptions.
          </p>
        </div>
      </div>

      {/* 2. Customer Selector Bar */}
      <div className="marketing-controls-card" style={{ background: '#ffffff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, flexWrap: 'wrap' }}>
          <label style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0f172a' }}>
            Target Customer:
          </label>
          <select
            className="marketing-select"
            style={{ minWidth: '280px', flex: 1 }}
            value={selectedCustomerId}
            onChange={(e) => setSelectedCustomerId(e.target.value)}
          >
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — {c.category} ({c.city || 'India'}) | Bal: ₹{c.availableBalance}
              </option>
            ))}
          </select>

          {selectedCustomer && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="mkt-pill mkt-pill-slate">{selectedCustomer.category}</span>
              <span className="mkt-pill mkt-pill-green">
                Wallet: ₹{selectedCustomer.availableBalance.toLocaleString('en-IN')}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 3. Main Workspace Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: '24px' }}>
        {/* Left Column: 6 Core Requested Fields */}
        <div className="marketing-table-card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>Campaign Concept &amp; Strategy</h3>
            <button
              type="button"
              className="marketing-btn-primary"
              onClick={handleGenerateSuggestions}
              disabled={generating || !selectedCustomer}
              style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' }}
            >
              <Sparkles size={14} className={generating ? 'spin' : ''} />
              <span>{generating ? 'Structuring...' : 'Generate Profile Suggestions'}</span>
            </button>
          </div>

          {/* 1. Customer Name */}
          <div className="mkt-form-group">
            <label className="mkt-form-label">
              Customer Name <span className="req">*</span>
            </label>
            <input
              type="text"
              className="mkt-form-input"
              value={selectedCustomer ? selectedCustomer.name : 'No customer selected'}
              disabled
              style={{ background: '#f8fafc', color: '#0f172a', fontWeight: 700 }}
            />
          </div>

          {/* 2. Campaign Name */}
          <div className="mkt-form-group">
            <label className="mkt-form-label">
              Campaign Name <span className="req">*</span>
            </label>
            <input
              type="text"
              className="mkt-form-input"
              placeholder="e.g. IT & Software High-Intent Lead Inbound Campaign"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* 3. Platform & 4. Language */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="mkt-form-group">
              <label className="mkt-form-label">Platform</label>
              <select
                className="mkt-form-select"
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
              >
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className="mkt-form-group">
              <label className="mkt-form-label">Language</label>
              <select
                className="mkt-form-select"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                {LANGUAGES.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 5. Call to Action (CTA) */}
          <div className="mkt-form-group">
            <label className="mkt-form-label">Call to Action (CTA)</label>
            <input
              type="text"
              className="mkt-form-input"
              placeholder="Call to action text (e.g. Enquire Now, Contact Us)"
              value={callToAction}
              onChange={(e) => setCallToAction(e.target.value)}
            />
          </div>

          {/* 6. Description */}
          <div className="mkt-form-group">
            <label className="mkt-form-label">
              Description <span className="req">*</span>
            </label>
            <textarea
              className="mkt-form-textarea"
              rows={5}
              placeholder="Describe the campaign concept, key business proposition, and customer messaging..."
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
            />
          </div>

          {/* Action Row */}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
            <button
              type="button"
              className="mkt-btn-table-action"
              onClick={() => handleSaveIdea('Draft')}
              disabled={saving}
            >
              Save as Draft
            </button>
            <button
              type="button"
              className="marketing-btn-primary"
              onClick={() => handleSaveIdea('Saved')}
              disabled={saving}
            >
              <Save size={14} />
              <span>{saving ? 'Saving...' : 'Save Marketing Idea'}</span>
            </button>
          </div>
        </div>

        {/* Right Column: Customer's Existing Saved Ideas */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Customer Summary Card */}
          {selectedCustomer && (
            <div className="marketing-stat-card" style={{ display: 'block', padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <Building size={20} color="#4f46e5" />
                <h4 style={{ margin: 0, fontSize: '0.96rem' }}>Selected Customer Profile</h4>
              </div>
              <div style={{ fontSize: '0.85rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <span className="mkt-form-help">Company:</span>
                  <strong>{selectedCustomer.name}</strong>
                </div>
                <div>
                  <span className="mkt-form-help">Category:</span>
                  <strong>{selectedCustomer.category}</strong>
                </div>
                <div>
                  <span className="mkt-form-help">City:</span>
                  <span>{selectedCustomer.city || 'India'}</span>
                </div>
                <div>
                  <span className="mkt-form-help">Ad Balance:</span>
                  <strong style={{ color: '#059669' }}>₹{selectedCustomer.availableBalance}</strong>
                </div>
              </div>
            </div>
          )}

          {/* Saved Ideas List */}
          <div className="marketing-table-card" style={{ padding: '20px', flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>
                Saved Ideas ({customerIdeas.length})
              </h4>
              <span className="mkt-form-help">Customer-Scoped</span>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                <RefreshCw size={16} className="spin" /> Loading customer ideas...
              </div>
            ) : customerIdeas.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 16px', color: '#64748b' }}>
                <Lightbulb size={32} style={{ color: '#cbd5e1', marginBottom: '8px' }} />
                <p style={{ margin: 0, fontSize: '0.85rem' }}>
                  No ideas saved yet for this customer. Fill the form on the left to structure and save your first campaign idea.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '560px', overflowY: 'auto' }}>
                {customerIdeas.map((idea) => (
                  <div
                    key={idea.id}
                    style={{
                      border: '1.5px solid #e2e8f0',
                      borderRadius: '12px',
                      padding: '14px',
                      background: '#ffffff',
                      transition: 'border-color 0.15s',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                      <strong style={{ fontSize: '0.92rem', color: '#0f172a' }}>{idea.title}</strong>
                      <span className={`mkt-pill ${idea.status === 'Saved' ? 'mkt-pill-green' : 'mkt-pill-amber'}`}>
                        {idea.status}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '6px 0 8px 0' }}>
                      <span className="mkt-pill mkt-pill-indigo" style={{ fontSize: '0.72rem' }}>
                        {idea.platform}
                      </span>
                      {idea.callToAction && (
                        <span className="mkt-pill mkt-pill-slate" style={{ fontSize: '0.72rem' }}>
                          CTA: {idea.callToAction}
                        </span>
                      )}
                    </div>

                    <p style={{ margin: '0 0 10px 0', fontSize: '0.82rem', color: '#475569', lineHeight: 1.4 }}>
                      {idea.concept.length > 120 ? `${idea.concept.substring(0, 120)}...` : idea.concept}
                    </p>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f1f5f9', paddingTop: '10px' }}>
                      <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                        {new Date(idea.createdAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short' })}
                      </span>
                      <button
                        type="button"
                        className="mkt-btn-table-action primary"
                        style={{ fontSize: '0.76rem', padding: '4px 10px' }}
                        onClick={() => {
                          onNavigateToDesk && onNavigateToDesk('create_posts', idea.customerId, idea.id);
                        }}
                        title="Create Post from this Idea"
                      >
                        <span>Create Post</span>
                        <ArrowRight size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
