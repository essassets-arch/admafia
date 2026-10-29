import React, { useState } from 'react';

export default function MetaAdsCalculator() {
  const [dailyBudget, setDailyBudget] = useState(300);

  // Exact math formulas matching the screenshot:
  const monthlySpend = dailyBudget * 30;
  const minReach = Math.round(dailyBudget * 6.5 * 30);
  const maxReach = Math.round(dailyBudget * 14 * 30);
  const minLeads = Math.round((dailyBudget * 30) / 180);
  const maxLeads = Math.round((dailyBudget * 30) / 75);

  return (
    <div className="planner-container">
      {/* Header Row */}
      <div className="planner-header">
        <div className="planner-title-group">
          <div className="planner-heading-row">
            {/* Colorful Slider / Planner Icon matching screenshot */}
            <div className="planner-icon-box">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <rect x="2" y="2" width="20" height="20" rx="5" fill="#fff5f2" stroke="#ff8476" strokeWidth="1.5" />
                <line x1="6" y1="7" x2="18" y2="7" stroke="#ff5a4f" strokeWidth="2" strokeLinecap="round" />
                <circle cx="9" cy="7" r="2" fill="#ff5a4f" />
                <line x1="6" y1="12" x2="18" y2="12" stroke="#ffb800" strokeWidth="2" strokeLinecap="round" />
                <circle cx="14" cy="12" r="2" fill="#ffb800" />
                <line x1="6" y1="17" x2="18" y2="17" stroke="#10b981" strokeWidth="2" strokeLinecap="round" />
                <circle cx="8" cy="17" r="2" fill="#10b981" />
              </svg>
            </div>
            <h2>Interactive Meta Ads Budget Planner</h2>
          </div>
          <p className="planner-subtitle">
            Adjust your daily budget to preview estimated monthly visibility &amp; enquiries
          </p>
        </div>

        {/* Dark Navy Pill Badge */}
        <div className="planner-daily-badge">
          Daily: <span className="gold-text">₹{dailyBudget.toLocaleString('en-IN')}</span> /day
        </div>
      </div>

      {/* Thick Pill Slider Track */}
      <div className="planner-slider-section">
        <div className="slider-track-capsule">
          <input
            type="range"
            min="300"
            max="3000"
            step="100"
            value={dailyBudget}
            onChange={(e) => setDailyBudget(Number(e.target.value))}
            className="capsule-range-slider"
            aria-label="Daily advertising budget slider"
          />
        </div>

        {/* Labels below slider */}
        <div className="slider-labels-row">
          <span>₹300 (Starter)</span>
          <span>₹1,500 (Growth)</span>
          <span>₹3,000+ (Scale)</span>
        </div>
      </div>

      {/* 3 Metric Cards */}
      <div className="planner-cards-grid">
        {/* Card 1: Monthly Ad Spend */}
        <div className="metric-box">
          <div className="metric-label">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span>Monthly Ad Spend</span>
          </div>
          <div className="metric-value">
            ₹{monthlySpend.toLocaleString('en-IN')}
          </div>
        </div>

        {/* Card 2: Estimated Reach */}
        <div className="metric-box">
          <div className="metric-label">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span>Estimated Monthly Reach</span>
          </div>
          <div className="metric-value">
            {minReach.toLocaleString('en-IN')} - {maxReach.toLocaleString('en-IN')}
          </div>
        </div>

        {/* Card 3: Projected Enquiries */}
        <div className="metric-box">
          <div className="metric-label">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
              <line x1="4" y1="22" x2="4" y2="15" />
            </svg>
            <span>Projected Enquiries</span>
          </div>
          <div className="metric-value coral-highlight">
            {minLeads} - {maxLeads}+ Leads*
          </div>
        </div>
      </div>

      <style>{`
        .planner-container {
          background: #ffffff;
          border-radius: 26px;
          padding: 34px 38px;
          border: 1px solid #e7ebf8;
          box-shadow: 0 14px 40px rgba(26, 21, 80, 0.07);
          max-width: 920px;
          margin: 0 auto;
          font-family: 'Figtree', system-ui, -apple-system, sans-serif;
          color: #232043;
          box-sizing: border-box;
        }

        .planner-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
        }

        .planner-heading-row {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .planner-icon-box {
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .planner-heading-row h2 {
          font-family: 'Bricolage Grotesque', system-ui, sans-serif;
          font-size: 1.48rem;
          font-weight: 800;
          color: #171347;
          margin: 0;
          letter-spacing: -0.02em;
          line-height: 1.15;
        }

        .planner-subtitle {
          color: #5d5a85;
          font-size: 0.95rem;
          margin: 6px 0 0 0;
          font-weight: 400;
        }

        .planner-daily-badge {
          background: #151147;
          color: #ffffff;
          padding: 8px 22px;
          border-radius: 999px;
          font-family: 'Bricolage Grotesque', system-ui, sans-serif;
          font-size: 1.15rem;
          font-weight: 700;
          white-space: nowrap;
          letter-spacing: -0.01em;
        }

        .gold-text {
          color: #ffb800;
          font-weight: 800;
        }

        /* Thick Capsule Slider */
        .planner-slider-section {
          margin: 28px 0 26px 0;
        }

        .slider-track-capsule {
          background: #e9ebfa;
          height: 34px;
          border-radius: 999px;
          display: flex;
          align-items: center;
          padding: 0 5px;
          box-sizing: border-box;
        }

        .capsule-range-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 100%;
          background: transparent;
          outline: none;
          cursor: pointer;
          margin: 0;
          padding: 0;
        }

        /* WebKit Slider Thumb (Chrome, Safari, Edge) */
        .capsule-range-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: #ffb800;
          border: 2.5px solid #171347;
          box-shadow: 0 2px 5px rgba(0, 0, 0, 0.25);
          cursor: grab;
          transition: transform 0.15s ease, background 0.15s ease;
        }

        .capsule-range-slider::-webkit-slider-thumb:hover {
          transform: scale(1.15);
        }

        .capsule-range-slider::-webkit-slider-thumb:active {
          cursor: grabbing;
        }

        /* Firefox Slider Thumb */
        .capsule-range-slider::-moz-range-thumb {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: #ffb800;
          border: 2.5px solid #171347;
          box-shadow: 0 2px 5px rgba(0, 0, 0, 0.25);
          cursor: grab;
        }

        .capsule-range-slider::-moz-range-track {
          background: transparent;
        }

        .slider-labels-row {
          display: flex;
          justify-content: space-between;
          margin-top: 10px;
          font-size: 0.9rem;
          color: #5d5a85;
          font-weight: 600;
          padding: 0 2px;
        }

        /* 3 Stat Cards */
        .planner-cards-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
          margin-top: 24px;
        }

        .metric-box {
          background: #f7f8ff;
          border: 1px solid #e7ebf8;
          border-radius: 16px;
          padding: 20px 22px;
          transition: transform 0.2s ease, border-color 0.2s ease;
        }

        .metric-box:hover {
          border-color: #cbd2f5;
        }

        .metric-label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.92rem;
          color: #5d5a85;
          font-weight: 500;
          margin-bottom: 10px;
        }

        .metric-label svg {
          color: #6a6699;
          flex-shrink: 0;
        }

        .metric-value {
          font-family: 'Bricolage Grotesque', system-ui, sans-serif;
          font-size: 1.65rem;
          font-weight: 800;
          color: #171347;
          letter-spacing: -0.025em;
          line-height: 1.1;
        }

        .metric-value.coral-highlight {
          color: #ff5a4f;
        }

        @media (max-width: 820px) {
          .planner-container {
            padding: 24px 20px;
          }

          .planner-cards-grid {
            grid-template-columns: 1fr;
            gap: 12px;
          }

          .planner-header {
            flex-direction: column;
            align-items: flex-start;
          }

          .planner-daily-badge {
            align-self: flex-start;
          }

          .metric-value {
            font-size: 1.45rem;
          }
        }
      `}</style>
    </div>
  );
}
