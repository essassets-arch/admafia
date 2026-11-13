/**
 * Country Detection & Dynamic International Pricing Service
 * Automatically detects visitor's country from public IP or Cloudflare header,
 * supports manual user override with persistence, and reacts across all components.
 */

const STORAGE_KEY = 'admafia_selected_country';
const AUTO_DETECTED_KEY = 'admafia_auto_detected_country';

// Fallback country config for India (Default)
export const DEFAULT_INDIA_COUNTRY = {
  id: 'cp_in',
  country_code: 'IN',
  country_name: 'India',
  currency_code: 'INR',
  currency_symbol: '₹',
  currency_position: 'before',
  decimal_precision: 0,
  daily_min_budget: 300,
  monthly_budget: 9000,
  min_wallet_topup: 300,
  tax_name: 'GST',
  tax_rate: 18,
  payment_gateway: 'razorpay',
  phone_code: '+91',
  flag_emoji: '🇮🇳',
  is_active: true,
  is_default: true,
  is_auto_detected: true,
  is_manual_override: false,
};

let currentCountry = null;
let allAvailableCountries = [DEFAULT_INDIA_COUNTRY];
let listeners = new Set();
let isInitialized = false;
let initPromise = null;

// Try to hydrate synchronously from localStorage to prevent flash of wrong pricing
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const parsed = JSON.parse(saved);
    if (parsed && parsed.country_code) {
      currentCountry = { ...parsed, is_manual_override: true };
    }
  }
} catch (e) {}

if (!currentCountry) {
  try {
    const autoSaved = localStorage.getItem(AUTO_DETECTED_KEY);
    if (autoSaved) {
      const parsed = JSON.parse(autoSaved);
      if (parsed && parsed.country_code) {
        currentCountry = { ...parsed, is_auto_detected: true, is_manual_override: false };
      }
    }
  } catch (e) {}
}

if (!currentCountry) {
  currentCountry = { ...DEFAULT_INDIA_COUNTRY };
}

/**
 * Format currency amount with symbol and position
 */
export function formatCurrency(amount, country = currentCountry) {
  const c = country || DEFAULT_INDIA_COUNTRY;
  const num = Number(amount || 0);
  const decimals = c.decimal_precision !== undefined ? c.decimal_precision : (c.currency_code === 'INR' ? 0 : 2);
  const formattedNum = num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  if (c.currency_position === 'after') {
    return `${formattedNum} ${c.currency_symbol || c.currency_code}`;
  }
  return `${c.currency_symbol || ''}${formattedNum}`;
}

/**
 * Format daily starting rate string (e.g. "₹300/Day", "AED 10/Day", "$10/Day")
 */
export function formatDailyRate(country = currentCountry) {
  const c = country || DEFAULT_INDIA_COUNTRY;
  return `${c.currency_symbol || ''}${Number(c.daily_min_budget || 300).toLocaleString()}/Day`;
}

/**
 * Format daily starting budget amount (e.g. "₹300", "AED 10", "$10")
 */
export function formatDailyBudget(country = currentCountry) {
  const c = country || DEFAULT_INDIA_COUNTRY;
  return `${c.currency_symbol || ''}${Number(c.daily_min_budget || 300).toLocaleString()}`;
}

/**
 * Format monthly advertising spend (e.g. "₹9,000", "AED 300", "$300")
 */
export function formatMonthlySpend(country = currentCountry) {
  const c = country || DEFAULT_INDIA_COUNTRY;
  const monthly = (Number(c.daily_min_budget || 300)) * 30;
  return `${c.currency_symbol || ''}${monthly.toLocaleString()}`;
}

/**
 * Notify all subscribers of country change
 */
function notifyListeners() {
  listeners.forEach((listener) => {
    try {
      listener(currentCountry, allAvailableCountries);
    } catch (e) {
      console.error('[countryService] Listener error:', e);
    }
  });
}

export const countryService = {
  getCurrentCountry() {
    return currentCountry || DEFAULT_INDIA_COUNTRY;
  },

  getAllCountries() {
    return allAvailableCountries;
  },

  /**
   * Subscribe to country pricing updates
   */
  subscribe(listener) {
    listeners.add(listener);
    // Call immediately with current state
    listener(currentCountry, allAvailableCountries);
    return () => {
      listeners.delete(listener);
    };
  },

  /**
   * Initialize country detection from backend API
   */
  async init() {
    if (initPromise) return initPromise;

    initPromise = (async () => {
      try {
        const res = await fetch('/api/public/country-detection', {
          headers: { 'Accept': 'application/json' },
          cache: 'no-store',
        });

        if (res.ok) {
          const data = await res.json();
          if (data && data.country) {
            if (Array.isArray(data.countries) && data.countries.length > 0) {
              allAvailableCountries = data.countries;
            }

            // Save detected country to localStorage for fast initial render on return visits
            try {
              localStorage.setItem(AUTO_DETECTED_KEY, JSON.stringify(data.country));
            } catch (e) {}

            // Check if visitor has manually overridden their country
            const manualRaw = localStorage.getItem(STORAGE_KEY);
            if (manualRaw) {
              const manual = JSON.parse(manualRaw);
              const foundInList = allAvailableCountries.find(
                (c) => c.country_code.toUpperCase() === manual.country_code?.toUpperCase()
              );
              if (foundInList) {
                currentCountry = { ...foundInList, is_manual_override: true };
                notifyListeners();
                isInitialized = true;
                return currentCountry;
              }
            }

            // Otherwise, adopt the server-side auto-detected country
            currentCountry = {
              ...data.country,
              is_auto_detected: data.isAutoDetected,
              is_fallback: data.isFallback,
              is_manual_override: false,
            };
            notifyListeners();
            isInitialized = true;
            return currentCountry;
          }
        }
      } catch (err) {
        console.warn('[countryService] Network error during country detection, using cached/default:', err.message);
      }

      isInitialized = true;
      return currentCountry;
    })();

    return initPromise;
  },

  /**
   * Manually override country selection (from header dropdown)
   */
  setManualCountry(country) {
    if (!country || !country.country_code) return;
    currentCountry = {
      ...country,
      is_manual_override: true,
      is_auto_detected: false,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(currentCountry));
    } catch (e) {}
    notifyListeners();
  },

  /**
   * Reset to auto-detected country from IP
   */
  resetToAutoDetected() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      const autoSaved = localStorage.getItem(AUTO_DETECTED_KEY);
      if (autoSaved) {
        const parsed = JSON.parse(autoSaved);
        currentCountry = {
          ...parsed,
          is_auto_detected: true,
          is_manual_override: false,
        };
      } else {
        currentCountry = { ...DEFAULT_INDIA_COUNTRY };
      }
    } catch (e) {
      currentCountry = { ...DEFAULT_INDIA_COUNTRY };
    }
    notifyListeners();
    // Re-fetch from server to ensure fresh detection
    initPromise = null;
    this.init();
  },
};

// Start background initialization immediately
countryService.init().catch(() => {});

export default countryService;
