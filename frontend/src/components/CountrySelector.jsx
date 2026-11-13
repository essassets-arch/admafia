import React, { useState, useEffect, useRef } from 'react';
import { Globe, ChevronDown, Check, Search, RotateCcw } from 'lucide-react';
import countryService from '../services/countryService';

export default function CountrySelector() {
  const [currentCountry, setCurrentCountry] = useState(countryService.getCurrentCountry);
  const [allCountries, setAllCountries] = useState(countryService.getAllCountries);
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef(null);

  useEffect(() => {
    const unsubscribe = countryService.subscribe((country, list) => {
      if (country) setCurrentCountry(country);
      if (Array.isArray(list) && list.length > 0) setAllCountries(list);
    });
    return unsubscribe;
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const filteredCountries = allCountries.filter((c) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      c.country_name?.toLowerCase().includes(q) ||
      c.country_code?.toLowerCase().includes(q) ||
      c.currency_code?.toLowerCase().includes(q)
    );
  });

  const handleSelectCountry = (country) => {
    countryService.setManualCountry(country);
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleResetToAuto = (e) => {
    e.stopPropagation();
    countryService.resetToAutoDetected();
    setIsOpen(false);
    setSearchQuery('');
  };

  const flag = currentCountry?.flag_emoji || '🌐';
  const symbol = currentCountry?.currency_symbol || '₹';
  const dailyRate = Number(currentCountry?.daily_min_budget || 300).toLocaleString();

  return (
    <div className="country-selector-container" ref={dropdownRef}>
      <button
        type="button"
        className="country-selector-trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        title={`Selected Region: ${currentCountry.country_name} (${symbol}${dailyRate}/day)`}
      >
        <span className="country-flag">{flag}</span>
        <span className="country-label-desktop">
          {currentCountry.country_code} <small>({symbol}{dailyRate}/d)</small>
        </span>
        <ChevronDown size={14} className={`chevron-icon ${isOpen ? 'open' : ''}`} />
      </button>

      {isOpen && (
        <div className="country-dropdown-menu" role="listbox">
          <div className="country-dropdown-header">
            <div className="country-search-bar">
              <Search size={14} className="search-icon" />
              <input
                type="text"
                placeholder="Search country or currency..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
            </div>

            {currentCountry?.is_manual_override && (
              <button
                type="button"
                className="reset-auto-btn"
                onClick={handleResetToAuto}
                title="Reset to your IP-detected location"
              >
                <RotateCcw size={12} />
                <span>Reset to Auto-Detect</span>
              </button>
            )}
          </div>

          <div className="country-list-scroll">
            {filteredCountries.map((c) => {
              const isSelected = c.country_code === currentCountry?.country_code;
              const cDaily = Number(c.daily_min_budget || 300).toLocaleString();
              return (
                <button
                  type="button"
                  key={c.country_code}
                  className={`country-option-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleSelectCountry(c)}
                >
                  <div className="country-option-info">
                    <span className="country-option-flag">{c.flag_emoji || '🌐'}</span>
                    <div>
                      <div className="country-option-name">
                        {c.country_name}
                        {c.is_default && <span className="default-pill">Default</span>}
                      </div>
                      <div className="country-option-meta">
                        {c.currency_code} ({c.currency_symbol}) · Minimum{' '}
                        <strong>
                          {c.currency_symbol}
                          {cDaily}/day
                        </strong>
                      </div>
                    </div>
                  </div>
                  {isSelected && <Check size={16} className="selected-check" />}
                </button>
              );
            })}

            {filteredCountries.length === 0 && (
              <div className="no-countries-found">
                No matching country found. Contact us for custom regional pricing.
              </div>
            )}
          </div>

          <div className="country-dropdown-footer">
            <span>
              {currentCountry?.is_manual_override ? (
                <>📍 Manual override active</>
              ) : (
                <>🌐 Auto-detected from your IP ({currentCountry?.country_code})</>
              )}
            </span>
          </div>
        </div>
      )}

      <style>{`
        .country-selector-container {
          position: relative;
          display: inline-block;
        }

        .country-selector-trigger {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #f8fafc;
          border: 1px solid #cbd5e1;
          color: #1e293b;
          padding: 6px 11px;
          border-radius: 999px;
          font-size: 0.84rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s ease;
          user-select: none;
        }

        .country-selector-trigger:hover {
          background: #ffffff;
          border-color: #ffb800;
          box-shadow: 0 2px 8px rgba(255, 184, 0, 0.2);
        }

        .country-flag {
          font-size: 1.1rem;
          line-height: 1;
        }

        .country-label-desktop {
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }

        .country-label-desktop small {
          color: #d97706;
          font-weight: 800;
          font-size: 0.78rem;
        }

        .chevron-icon {
          color: #64748b;
          transition: transform 0.2s ease;
        }

        .chevron-icon.open {
          transform: rotate(180deg);
        }

        .country-dropdown-menu {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          width: 320px;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          box-shadow: 0 16px 36px -4px rgba(15, 23, 42, 0.18);
          z-index: 1000;
          overflow: hidden;
          animation: dropFadeIn 0.18s ease;
        }

        @keyframes dropFadeIn {
          from {
            opacity: 0;
            transform: translateY(-6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .country-dropdown-header {
          padding: 12px 14px 10px;
          border-bottom: 1px solid #f1f5f9;
          background: #fafbfc;
        }

        .country-search-bar {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 6px 10px;
        }

        .country-search-bar input {
          border: none;
          outline: none;
          width: 100%;
          font-size: 0.85rem;
          background: transparent;
        }

        .search-icon {
          color: #94a3b8;
          flex-shrink: 0;
        }

        .reset-auto-btn {
          margin-top: 8px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 0.74rem;
          font-weight: 700;
          color: #d97706;
          background: #fef3c7;
          border: 1px solid #fde68a;
          border-radius: 6px;
          padding: 4px 8px;
          cursor: pointer;
          width: 100%;
          justify-content: center;
        }

        .reset-auto-btn:hover {
          background: #fde68a;
        }

        .country-list-scroll {
          max-height: 280px;
          overflow-y: auto;
          padding: 6px;
        }

        .country-option-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          padding: 10px 12px;
          border-radius: 10px;
          border: none;
          background: transparent;
          cursor: pointer;
          text-align: left;
          transition: background 0.15s ease;
        }

        .country-option-item:hover {
          background: #f8fafc;
        }

        .country-option-item.selected {
          background: #eff6ff;
        }

        .country-option-info {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .country-option-flag {
          font-size: 1.35rem;
          line-height: 1;
        }

        .country-option-name {
          font-size: 0.88rem;
          font-weight: 700;
          color: #0f172a;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .default-pill {
          font-size: 0.65rem;
          padding: 2px 6px;
          background: #e2e8f0;
          color: #475569;
          border-radius: 4px;
          font-weight: 600;
        }

        .country-option-meta {
          font-size: 0.75rem;
          color: #64748b;
          margin-top: 2px;
        }

        .country-option-meta strong {
          color: #059669;
        }

        .selected-check {
          color: #2563eb;
          flex-shrink: 0;
        }

        .no-countries-found {
          padding: 20px 14px;
          text-align: center;
          font-size: 0.82rem;
          color: #94a3b8;
        }

        .country-dropdown-footer {
          padding: 8px 14px;
          border-top: 1px solid #f1f5f9;
          background: #fafbfc;
          font-size: 0.72rem;
          color: #64748b;
          text-align: center;
        }

        @media (max-width: 600px) {
          .country-label-desktop small {
            display: none;
          }
          .country-dropdown-menu {
            right: -40px;
            width: 290px;
          }
        }
      `}</style>
    </div>
  );
}
