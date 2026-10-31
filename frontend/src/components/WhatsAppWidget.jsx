import React, { useState, useEffect } from 'react';
import { X, Send, MessageCircle, Phone, Sparkles } from 'lucide-react';

const WA_NUMBER = '916359120081'; // +91 6359 120 081

export default function WhatsAppWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [userMsg, setUserMsg] = useState('');
  const [hasInteracted, setHasInteracted] = useState(false);

  // Auto-show tooltip bubble after 2.5 seconds to invite interaction
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!hasInteracted) {
        setShowTooltip(true);
      }
    }, 2500);
    return () => clearTimeout(timer);
  }, [hasInteracted]);

  const quickQuestions = [
    '⚡ I want to launch Meta Ads from ₹300/day',
    '📊 Help me calculate ad spend & expected leads',
    '🏢 I have a local business and need customer calls',
    '💬 Can I speak with an AdMafia campaign specialist?',
  ];

  const handleOpenWhatsApp = (customText) => {
    const defaultText = customText || userMsg.trim() || "Hi AdMafia Marketing! I'm interested in generating customer leads from ₹300/day. Please guide me.";
    const encoded = encodeURIComponent(defaultText);
    const url = `https://wa.me/${WA_NUMBER}?text=${encoded}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    setHasInteracted(true);
    setShowTooltip(false);
  };

  const handleSendForm = (e) => {
    e.preventDefault();
    if (!userMsg.trim()) return;
    handleOpenWhatsApp(userMsg.trim());
    setUserMsg('');
  };

  const toggleOpen = () => {
    setIsOpen(!isOpen);
    setShowTooltip(false);
    setHasInteracted(true);
  };

  return (
    <div className="wa-widget-container">
      {/* 1. Interactive Tooltip / Teaser Bubble */}
      {showTooltip && !isOpen && (
        <div className="wa-teaser-bubble">
          <button
            type="button"
            className="wa-teaser-close"
            onClick={(e) => {
              e.stopPropagation();
              setShowTooltip(false);
              setHasInteracted(true);
            }}
            aria-label="Close message preview"
          >
            <X size={12} />
          </button>
          <div className="wa-teaser-content" onClick={toggleOpen}>
            <div className="wa-teaser-header">
              <span className="wa-online-dot" />
              <strong>AdMafia Marketing Support</strong>
            </div>
            <p className="wa-teaser-text">
              Looking to generate verified customer enquiries from <strong>₹300/day</strong>? Chat with us live! 👋
            </p>
          </div>
        </div>
      )}

      {/* 2. Interactive WhatsApp Chat Popup Window */}
      {isOpen && (
        <div className="wa-chat-window">
          {/* Header */}
          <div className="wa-chat-header">
            <div className="wa-chat-avatar-wrap">
              <img
                src="/AdMafia-Logo.png"
                alt="AdMafia Marketing"
                className="wa-chat-avatar"
              />
              <span className="wa-avatar-status" />
            </div>
            <div className="wa-chat-header-info">
              <div className="wa-chat-header-title">
                <span>AdMafia Growth Support</span>
                <span className="wa-verified-badge" title="Official Verified Support">✓</span>
              </div>
              <div className="wa-chat-header-subtitle">
                <span className="wa-pulse-dot" />
                <span>Online | Replies in ~2 mins</span>
              </div>
            </div>
            <button
              type="button"
              className="wa-chat-close-btn"
              onClick={() => setIsOpen(false)}
              aria-label="Close WhatsApp chat popup"
            >
              <X size={18} />
            </button>
          </div>

          {/* Body with Chat Pattern */}
          <div className="wa-chat-body">
            <div className="wa-chat-timestamp">Today</div>

            {/* Incoming Agent Message Bubble */}
            <div className="wa-chat-bubble incoming">
              <div className="wa-bubble-sender">AdMafia Specialist</div>
              <p className="wa-bubble-text">
                Hello! 👋 Welcome to <strong>AdMafia Marketing</strong>.
              </p>
              <p className="wa-bubble-text" style={{ marginTop: '6px' }}>
                We help businesses generate real customer enquiries with names &amp; phone numbers via Facebook &amp; Instagram ads starting from just <strong>₹300/Day</strong>.
              </p>
              <p className="wa-bubble-text" style={{ marginTop: '6px' }}>
                How can we assist your campaign today?
              </p>
              <div className="wa-bubble-meta">
                <span>Just now</span>
                <span className="wa-double-check">✓✓</span>
              </div>
            </div>

            {/* Quick Interactive Questions */}
            <div className="wa-quick-questions">
              <div className="wa-quick-title">Choose a quick question:</div>
              {quickQuestions.map((q, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="wa-quick-chip"
                  onClick={() => handleOpenWhatsApp(q)}
                >
                  <span>{q}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Footer Interactive Input & Direct Action */}
          <div className="wa-chat-footer">
            <form onSubmit={handleSendForm} className="wa-input-row">
              <input
                type="text"
                placeholder="Type a message..."
                value={userMsg}
                onChange={(e) => setUserMsg(e.target.value)}
                className="wa-chat-input"
              />
              <button
                type="submit"
                className="wa-chat-send-btn"
                title="Send message on WhatsApp"
                aria-label="Send message on WhatsApp"
              >
                <Send size={16} />
              </button>
            </form>

            <button
              type="button"
              onClick={() => handleOpenWhatsApp()}
              className="wa-direct-cta-btn"
            >
              <WhatsAppIcon size={20} />
              <span>Chat on WhatsApp (+91 6359 120 081)</span>
            </button>
          </div>
        </div>
      )}

      {/* 3. Floating Bottom-Right WhatsApp Action Button */}
      <button
        type="button"
        className={`wa-floating-btn ${isOpen ? 'active' : ''}`}
        onClick={toggleOpen}
        aria-label="Open WhatsApp live chat with AdMafia Marketing"
        title="Chat with AdMafia on WhatsApp (+91 6359 120 081)"
      >
        <span className="wa-btn-pulse-ring" />
        <span className="wa-badge-dot">1</span>
        <WhatsAppIcon size={32} />
      </button>
    </div>
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

