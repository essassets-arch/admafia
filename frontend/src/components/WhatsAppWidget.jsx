import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import countryService, { formatDailyRate } from '../services/countryService';

const WA_NUMBER = '916359120081'; // +91 6359 120 081

export default function WhatsAppWidget() {
  const [country, setCountry] = useState(countryService.getCurrentCountry);
  const [showTooltip, setShowTooltip] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  useEffect(() => {
    const unsubscribe = countryService.subscribe((c) => {
      if (c) setCountry(c);
    });
    return unsubscribe;
  }, []);

  // Auto-show teaser bubble after 2.5s for initial visitor engagement
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!hasInteracted) {
        setShowTooltip(true);
      }
    }, 2500);
    return () => clearTimeout(timer);
  }, [hasInteracted]);

  const dailyRate = formatDailyRate(country);
  const dynamicMsg = `Hi AdMafia Marketing! I'm interested in generating customer leads from ${dailyRate} in ${country?.country_name || 'my area'}. Please guide me.`;
  const waUrl = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(dynamicMsg)}`;

  return (
    <div className="wa-widget-container">
      {/* 1. Interactive Teaser Bubble - Direct WhatsApp Redirect */}
      {showTooltip && (
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="wa-teaser-bubble"
          style={{ textDecoration: 'none', color: 'inherit' }}
        >
          <button
            type="button"
            className="wa-teaser-close"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowTooltip(false);
              setHasInteracted(true);
            }}
            aria-label="Close message preview"
          >
            <X size={13} />
          </button>
          <div className="wa-teaser-content">
            <div className="wa-teaser-header">
              <span className="wa-online-dot" />
              <strong>AdMafia Growth Support</strong>
              <VerifiedBadge size={14} />
            </div>
            <p className="wa-teaser-text">
              Generate genuine buyer leads with phone numbers from <strong>{dailyRate}</strong>. Chat with us on WhatsApp! 👋
            </p>
          </div>
        </a>
      )}

      {/* 2. Floating Bottom-Right WhatsApp Action Button - Direct WhatsApp Redirect */}
      <a
        href={waUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="wa-floating-btn"
        aria-label="Chat directly with AdMafia Marketing on WhatsApp"
        title="Chat on WhatsApp (+91 6359 120 081)"
      >
        <span className="wa-btn-pulse-ring" />
        <span className="wa-badge-dot">1</span>
        <WhatsAppIcon size={32} />
      </a>
    </div>
  );
}

// Official Meta / WhatsApp Verified Badge SVG
function VerifiedBadge({ size = 15 }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      style={{ display: 'inline-block', flexShrink: 0 }}
      aria-label="Verified Support Badge"
    >
      <path
        fill="#25D366"
        d="m10.06 2.4.92-.93a2 2 0 0 1 2.83 0l.92.93 1.28-.27a2 2 0 0 1 2.3 1.33l.47 1.22 1.3.16a2 2 0 0 1 1.7 1.7l.17 1.3 1.22.47a2 2 0 0 1 1.33 2.3l-.27 1.28.93.92a2 2 0 0 1 0 2.83l-.93.92.27 1.28a2 2 0 0 1-1.33 2.3l-1.22.47-.16 1.3a2 2 0 0 1-1.7 1.7l-1.3.17-.47 1.22a2 2 0 0 1-2.3 1.33l-1.28-.27-.92.93a2 2 0 0 1-2.83 0l-.92-.93-1.28.27a2 2 0 0 1-2.3-1.33l-.47-1.22-1.3-.16a2 2 0 0 1-1.7-1.7l-.17-1.3-1.22-.47a2 2 0 0 1-1.33-2.3l.27-1.28-.93-.92a2 2 0 0 1 0-2.83l.93-.92-.27-1.28a2 2 0 0 1 1.33-2.3l1.22-.47.16-1.3a2 2 0 0 1 1.7-1.7l1.3-.17.47-1.22a2 2 0 0 1 2.3-1.33l1.28.27z"
      />
      <path
        fill="#ffffff"
        d="m9.5 12.5-2-2a1 1 0 0 0-1.4 1.4l2.7 2.7c.4.4 1 .4 1.4 0l6.7-6.7a1 1 0 1 0-1.4-1.4l-6 6z"
      />
    </svg>
  );
}

// Crisp official WhatsApp SVG icon
function WhatsAppIcon({ size = 28 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="#ffffff"
      aria-label="WhatsApp"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2z" />
    </svg>
  );
}
