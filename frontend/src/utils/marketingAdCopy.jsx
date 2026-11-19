import React, { useState } from 'react';
import { Copy, Check, X, Sparkles } from 'lucide-react';

export function normalizeDisplayAmmCode(rawCode) {
  const str = String(rawCode || '').trim();
  if (!str) return '';
  const m = str.match(/^#?\s*AMM[-_\s]*0*(\d+)$/i);
  if (m && m[1]) {
    const n = Math.max(1, Number(m[1]));
    return `#AMM${String(n).padStart(2, '0')}`;
  }
  return str.toUpperCase();
}

export function buildClientAdCopyBundle(customer = {}, rawCode = '') {
  const code =
    normalizeDisplayAmmCode(rawCode || customer?.marketingCode || '') || '#AMM01';
  const company =
    String(customer?.companyName || customer?.name || 'Our Team').trim() || 'Our Team';
  const rawCat = String(customer?.category || '').trim();
  const hasRealCategory =
    rawCat && !['other', 'general', 'business enquiry', 'pending'].includes(rawCat.toLowerCase());
  const categoryLabel = hasRealCategory ? rawCat : 'Business Services';
  const city = String(customer?.city || '').trim();
  const cityPhrase = city && city.toLowerCase() !== 'india' ? ` in ${city}` : '';

  // 1. WhatsApp / Chatbot Pre-filled Message (Meta Ads "Message Template -> Greeting / Pre-filled Message")
  const whatsappGreeting = `Hi, I am interested in ${company} services. Please share complete details. (${code})`;

  // 2. Ad Primary Text / Caption (Placed in Ad Primary Text / Post Caption)
  const adPrimaryCaption = `Looking for trusted ${categoryLabel}${cityPhrase}? Connect directly with ${company} for verified details, pricing & quick assistance.\n\nTap "Send Message" below to get started! [Ref: ${code}]`;

  // 3. Ad Headline (Placed in Meta Ad Headline)
  const adHeadline = `${company} — Get Complete Details on WhatsApp (${code})`;

  // 4. Campaign Naming Convention (Placed in Ads Manager Campaign / Ad Set Name)
  const campaignNaming = `${code} | ${company}${city ? ` - ${city}` : ''} | Inbound Leads`;

  return {
    code,
    company,
    categoryLabel,
    whatsappGreeting,
    adPrimaryCaption,
    adHeadline,
    campaignNaming,
  };
}

export function MarketingAdCopyModal({ customer, marketingCode, onClose }) {
  const [copiedKey, setCopiedKey] = useState('');
  if (!customer) return null;

  const bundle = buildClientAdCopyBundle(customer, marketingCode);

  const handleCopy = (text, key) => {
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(''), 1800);
  };

  const blocks = [
    {
      key: 'wa',
      badge: '1. MOST IMPORTANT — WHATSAPP PRE-FILLED MESSAGE (CHATBOT ROUTING)',
      where: 'Paste in: Ads Manager -> Message Template -> Pre-filled Message / Greeting',
      text: bundle.whatsappGreeting,
      accent: '#059669',
    },
    {
      key: 'caption',
      badge: '2. AD PRIMARY TEXT / POST CAPTION',
      where: 'Paste in: Ads Manager -> Primary Text (or Instagram / Facebook Caption)',
      text: bundle.adPrimaryCaption,
      accent: '#4f46e5',
    },
    {
      key: 'headline',
      badge: '3. AD HEADLINE',
      where: 'Paste in: Ads Manager -> Headline (next to Send WhatsApp Message button)',
      text: bundle.adHeadline,
      accent: '#0284c7',
    },
    {
      key: 'campname',
      badge: '4. CAMPAIGN / AD SET NAME',
      where: 'Paste in: Ads Manager -> Campaign Name & Ad Set Name for easy spend tracking',
      text: bundle.campaignNaming,
      accent: '#7c3aed',
    },
  ];

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(2, 6, 23, 0.76)',
        display: 'grid',
        placeItems: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--adm-bg-card, #ffffff)',
          color: 'var(--adm-text-primary, #0f172a)',
          border: '1px solid var(--adm-border-strong, #cbd5e1)',
          borderRadius: 16,
          maxWidth: 640,
          width: '100%',
          maxHeight: '90dvh',
          overflowY: 'auto',
          padding: 22,
          boxShadow: '0 24px 48px rgba(0,0,0,0.45)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span
                style={{
                  background: 'linear-gradient(135deg, #4f46e5, #6366f1)',
                  color: '#fff',
                  fontFamily: 'monospace',
                  fontWeight: 900,
                  fontSize: '0.82rem',
                  padding: '4px 10px',
                  borderRadius: 8,
                }}
              >
                {bundle.code}
              </span>
              <h3 style={{ margin: 0, fontSize: '1.12rem', fontWeight: 900 }}>
                Ready-to-Paste Ad Texts — {bundle.company}
              </h3>
            </div>
            <p style={{ margin: '5px 0 0', fontSize: '0.79rem', color: 'var(--adm-text-muted, #64748b)' }}>
              Copy and paste directly into each placement below. Keeping <strong>{bundle.code}</strong> inside the WhatsApp Pre-filled Message ensures your Chatbot automatically routes every lead to <strong>{bundle.company}</strong>.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1px solid var(--adm-border, #e2e8f0)',
              borderRadius: 8,
              padding: 6,
              cursor: 'pointer',
              color: 'var(--adm-text-muted, #64748b)',
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {blocks.map((b) => (
            <div
              key={b.key}
              style={{
                border: '1px solid var(--adm-border, #e2e8f0)',
                borderLeft: `4px solid ${b.accent}`,
                background: 'var(--adm-bg-subtle, #f8fafc)',
                borderRadius: 10,
                padding: '11px 13px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 900, color: b.accent, letterSpacing: '0.03em' }}>
                  <Sparkles size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                  {b.badge}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(b.text, b.key)}
                  style={{
                    background: copiedKey === b.key ? '#059669' : b.accent,
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 7,
                    padding: '4px 10px',
                    fontSize: '0.73rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  {copiedKey === b.key ? <Check size={13} /> : <Copy size={13} />}
                  <span>{copiedKey === b.key ? 'Copied!' : 'Copy Text'}</span>
                </button>
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--adm-text-muted, #64748b)', marginBottom: 6 }}>
                {b.where}
              </div>
              <div
                style={{
                  background: 'var(--adm-bg-card, #ffffff)',
                  border: '1px solid var(--adm-border-strong, #cbd5e1)',
                  borderRadius: 8,
                  padding: '8px 10px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  color: 'var(--adm-text-primary, #0f172a)',
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.45,
                }}
              >
                {b.text}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
