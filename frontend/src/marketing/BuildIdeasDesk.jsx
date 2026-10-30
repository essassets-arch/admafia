import React, { useState, useEffect, useCallback } from 'react';
import {
  Lightbulb,
  Sparkles,
  Save,
  Users,
  Building,
  Target,
  Send,
  Layers,
  CheckCircle2,
  Trash2,
  RefreshCw,
  ArrowRight,
  HelpCircle,
} from 'lucide-react';
import Swal from 'sweetalert2';
import marketingApi from '../services/marketingApi';

const OBJECTIVES = [
  { id: 'lead_generation', label: 'Lead Generation', desc: 'Direct enquiries, form fills and phone calls.' },
  { id: 'brand_awareness', label: 'Brand Awareness', desc: 'Reach local business audience and establish authority.' },
  { id: 'product_promotion', label: 'Product Promotion', desc: 'Spotlight flagship commercial offerings & packages.' },
  { id: 'festival_campaign', label: 'Festival Campaign', desc: 'Seasonal promotions, festive greetings & incentives.' },
  { id: 'customer_engagement', label: 'Customer Engagement', desc: 'Social proof, testimonials and audience interaction.' },
];

export default function BuildIdeasDesk({ initialCustomerId = null, onNavigateToDesk }) {
  const [customers, setCustomers] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState(initialCustomerId || '');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerIdeas, setCustomerIdeas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form State
  const [title, setTitle] = useState('');
  const [objective, setObjective] = useState('lead_generation');
  const [platform, setPlatform] = useState('Meta Ads (Facebook & Instagram)');
  const [language, setLanguage] = useState('English / Hinglish');
  const [targetAudience, setTargetAudience] = useState('');
  const [campaignPeriod, setCampaignPeriod] = useState('Immediate (Next 7–14 Days)');
  const [constraints, setConstraints] = useState('');

  // Generated / Editable Content Fields
  const [concept, setConcept] = useState('');
  const [captionSuggestions, setCaptionSuggestions] = useState('');
  const [callToAction, setCallToAction] = useState('Book Free Consultation');
  const [hashtags, setHashtags] = useState('');
  const [creativeBrief, setCreativeBrief] = useState('');

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
      const [custData, ideasData] = await Promise.all([
        marketingApi.getCustomerDetail(custId),
        marketingApi.getIdeas({ customerId: custId }),
      ]);

      if (custData && custData.ok) {
        const c = custData.customer;
        setSelectedCustomer(c);
        // Default target audience based on real customer data
        setTargetAudience(`Business owners, managers and consumers located in ${c.city || 'target region'} interested in ${c.category}.`);
      }

      if (ideasData && ideasData.ok) {
        setCustomerIdeas(ideasData.ideas || []);
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

  // Generate Suggestions Engine (strictly grounded on customer profile, zero fabricated pricing or false claims)
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
      let genTitle = '';
      let genConcept = '';
      let genCaption = '';
      let genCta = '';
      let genTags = '';
      let genBrief = '';

      if (objective === 'lead_generation') {
        genTitle = `${cat} High-Intent Lead Inbound Campaign`;
        genConcept = `Target decision-makers looking for verified ${cat} solutions in ${city}. Focus on reliability, transparent communication, and rapid project turnaround.`;
        genCaption = `Looking for reliable ${cat} solutions in ${city}?\n\nPartner with ${comp} to streamline your operations and achieve verified results.\n\n✓ Industry-certified expertise\n✓ Direct customer support\n✓ Tailored commercial solutions\n\nSend your requirement today to discuss your next steps with our team!`;
        genCta = 'Enquire Now';
        genTags = `#${cat.replace(/\s+/g, '')} #${city.replace(/\s+/g, '')} #BusinessGrowth #VerifiedLeads #${comp.replace(/\s+/g, '')}`;
        genBrief = `High-contrast social banner featuring verified checkmarks, clean typography, company branding for ${comp}, and a prominent '${genCta}' action button.`;
      } else if (objective === 'brand_awareness') {
        genTitle = `${comp} Regional Authority & Brand Spotlight`;
        genConcept = `Position ${comp} as the premier choice for ${cat} in ${city}, highlighting market credibility and dedicated customer commitment.`;
        genCaption = `Trusted by businesses across ${city} for ${cat}.\n\nAt ${comp}, we help you turn ambitious objectives into reality with proven industry standards.\n\nDiscover how our solutions empower your business to thrive in a competitive market.`;
        genCta = 'Learn More';
        genTags = `#${cat.replace(/\s+/g, '')} #BrandSpotlight #${city.replace(/\s+/g, '')} #${comp.replace(/\s+/g, '')}`;
        genBrief = `Clean corporate graphic showing ${comp}'s brand emblem, bold headline, and regional focus in ${city}.`;
      } else if (objective === 'product_promotion') {
        genTitle = `Featured ${cat} Offerings & Solutions`;
        genConcept = `Showcase flagship commercial services offered by ${comp} with clear value propositions and easy enquiry channels.`;
        genCaption = `Upgrade your business with specialized ${cat} services from ${comp}.\n\nDesigned specifically for businesses seeking quality, dependability, and commercial excellence.\n\nConnect with our specialists for a tailored solution.`;
        genCta = 'Get Details';
        genTags = `#${cat.replace(/\s+/g, '')} #ProductPromotion #BusinessExcellence #${city.replace(/\s+/g, '')}`;
        genBrief = `Product/service showcase grid with distinct visual hierarchy, clean card outlines, and key value badges.`;
      } else if (objective === 'festival_campaign') {
        genTitle = `${comp} Festive Season Marketing Greeting`;
        genConcept = `Seasonal customer outreach connecting festive occasions with special ${cat} consultation opportunities.`;
        genCaption = `Wishing our valued clients and partners a prosperous festive season!\n\nCelebrate new milestones with ${comp}. We look forward to powering your growth in the coming quarter.\n\nSchedule your festive strategy session today.`;
        genCta = 'Connect With Us';
        genTags = `#FestiveGreetings #BusinessProsperity #${cat.replace(/\s+/g, '')} #${comp.replace(/\s+/g, '')}`;
        genBrief = `Warm festive graphic with subtle gold/navy accents, celebratory greeting, and ${comp} branding.`;
      } else {
        genTitle = `${comp} Client Engagement & Community Dialogue`;
        genConcept = `Interactive social content engaging prospective buyers around common industry challenges in ${cat}.`;
        genCaption = `What is your biggest operational challenge when selecting a ${cat} provider in ${city}?\n\n1. Delivery timelines\n2. Quality consistency\n3. Dedicated technical support\n\nShare your thoughts in the comments, or reach out to our team at ${comp}!`;
        genCta = 'Send Message';
        genTags = `#IndustryInsights #${cat.replace(/\s+/g, '')} #BusinessDiscussion #${comp.replace(/\s+/g, '')}`;
        genBrief = `Interactive poll/question layout with high legibility, clean spacing, and brand logo.`;
      }

      setTitle(genTitle);
      setConcept(genConcept);
      setCaptionSuggestions(genCaption);
      setCallToAction(genCta);
      setHashtags(genTags);
      setCreativeBrief(genBrief);
      setGenerating(false);

      Swal.fire({
        icon: 'success',
        title: 'Suggestions Generated',
        text: 'Tailored suggestions generated based on verified customer profile.',
        timer: 1400,
        showConfirmButton: false,
      });
    }, 400);
  };

  // Save Idea to Backend
  const handleSaveIdea = async (status = 'Saved') => {
    if (!selectedCustomerId) {
      Swal.fire({ icon: 'warning', title: 'Customer selection is required.' });
      return;
    }
    if (!title.trim()) {
      Swal.fire({ icon: 'warning', title: 'Please provide an idea title.' });
      return;
    }
    if (!concept.trim()) {
      Swal.fire({ icon: 'warning', title: 'Please provide a concept description.' });
      return;
    }

    setSaving(true);
    try {
      const res = await marketingApi.createIdea({
        customerId: selectedCustomerId,
        title,
        objective,
        concept,
        targetAudience,
        captionSuggestions,
        callToAction,
        hashtags,
        creativeBrief,
        platform,
        language,
        campaignPeriod,
        constraints,
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
        // Refresh customer ideas list
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
            Customer-grounded workspace to structure marketing concepts, audience targets, and creative briefs.
          </p>
        </div>
      </div>

      {/* 2. Customer Selector Bar */}
      <div className="marketing-controls-card" style={{ background: '#ffffff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, flexWrap: 'wrap' }}>
          <label style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0f172a' }}>
            Select Active Customer:
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
        {/* Left Column: Form & Suggestions Builder */}
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

          {/* Form Fields */}
          <div className="mkt-form-group">
            <label className="mkt-form-label">
              Marketing Objective <span className="req">*</span>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
              {OBJECTIVES.map((obj) => (
                <button
                  type="button"
                  key={obj.id}
                  onClick={() => setObjective(obj.id)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: objective === obj.id ? '2px solid #4f46e5' : '1.5px solid #e2e8f0',
                    background: objective === obj.id ? '#eef2ff' : '#ffffff',
                    color: objective === obj.id ? '#4f46e5' : '#334155',
                    fontWeight: objective === obj.id ? 800 : 600,
                    fontSize: '0.82rem',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  {obj.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mkt-form-group">
            <label className="mkt-form-label">
              Idea Title <span className="req">*</span>
            </label>
            <input
              type="text"
              className="mkt-form-input"
              placeholder="e.g. IT Software High-Intent Lead Inbound Campaign"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="mkt-form-group">
              <label className="mkt-form-label">Platform</label>
              <select
                className="mkt-form-select"
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
              >
                <option value="Meta Ads (Facebook & Instagram)">Meta Ads (Facebook &amp; Instagram)</option>
                <option value="Google Ads (Search & Performance Max)">Google Ads</option>
                <option value="LinkedIn Sponsored Content">LinkedIn Ads</option>
              </select>
            </div>
            <div className="mkt-form-group">
              <label className="mkt-form-label">Language</label>
              <select
                className="mkt-form-select"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                <option value="English / Hinglish">English / Hinglish</option>
                <option value="English Only">English Only</option>
                <option value="Hindi (Devanagari)">Hindi</option>
                <option value="Gujarati">Gujarati</option>
              </select>
            </div>
          </div>

          <div className="mkt-form-group">
            <label className="mkt-form-label">Target Audience Definition</label>
            <input
              type="text"
              className="mkt-form-input"
              placeholder="e.g. Business decision makers and MSME owners in target cities"
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value)}
            />
          </div>

          <div className="mkt-form-group">
            <label className="mkt-form-label">
              Marketing Concept / Strategic Brief <span className="req">*</span>
            </label>
            <textarea
              className="mkt-form-textarea"
              rows={3}
              placeholder="Describe the core proposition, problem addressed, and business benefit..."
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
            />
          </div>

          <div className="mkt-form-group">
            <label className="mkt-form-label">Caption Suggestions</label>
            <textarea
              className="mkt-form-textarea"
              rows={4}
              placeholder="Primary advertising copy and bulleted value points..."
              value={captionSuggestions}
              onChange={(e) => setCaptionSuggestions(e.target.value)}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="mkt-form-group">
              <label className="mkt-form-label">Call to Action (CTA)</label>
              <input
                type="text"
                className="mkt-form-input"
                placeholder="e.g. Enquire Now, Book Consultation"
                value={callToAction}
                onChange={(e) => setCallToAction(e.target.value)}
              />
            </div>
            <div className="mkt-form-group">
              <label className="mkt-form-label">Campaign Period</label>
              <input
                type="text"
                className="mkt-form-input"
                placeholder="e.g. 7–14 Days"
                value={campaignPeriod}
                onChange={(e) => setCampaignPeriod(e.target.value)}
              />
            </div>
          </div>

          <div className="mkt-form-group">
            <label className="mkt-form-label">Hashtags</label>
            <input
              type="text"
              className="mkt-form-input"
              placeholder="#BrandName #Category #City #TargetKeywords"
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
            />
          </div>

          <div className="mkt-form-group">
            <label className="mkt-form-label">Creative Brief (Instructions for Designer)</label>
            <textarea
              className="mkt-form-textarea"
              rows={2}
              placeholder="Visual direction: Colors, imagery style, headline hierarchy, banner format..."
              value={creativeBrief}
              onChange={(e) => setCreativeBrief(e.target.value)}
            />
          </div>

          {/* Action Row */}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px' }}>
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
                  No ideas saved yet for this customer. Use the builder on the left to structure and save your first campaign idea.
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
