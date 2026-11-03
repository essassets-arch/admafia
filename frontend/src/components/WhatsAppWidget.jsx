import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

const WA_NUMBER = '916359120081'; // +91 6359 120 081
const DEFAULT_MSG = "Hi AdMafia Marketing! I'm interested in generating customer leads from ₹300/day. Please guide me.";
const WA_URL = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(DEFAULT_MSG)}`;

export default function WhatsAppWidget() {
  const [showTooltip, setShowTooltip] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  // Auto-show teaser bubble after 2.5s for initial visitor engagement
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!hasInteracted) {
        setShowTooltip(true);
      }
    }, 2500);
    return () => clearTimeout(timer);
  }, [hasInteracted]);

  return (
    <div className="wa-widget-container">
          {/* 1. Interactive Teaser Bubble - Direct WhatsApp Redirect */}
          {showTooltip && (
            <a
              href={WA_URL}
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
                  Generate genuine buyer leads with phone numbers from <strong>₹300/day</strong>. Chat with us on WhatsApp! 👋
                </p>
              </div>
        </a>
      )}

        {/* 2. Floating Bottom-Right WhatsApp Action Button - Direct WhatsApp Redirect */}
      <a
        href={WA_URL}
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
    </div >
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
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.82 11.82 0 00-3.48-8.413z" />
    </svg>
  );
}
