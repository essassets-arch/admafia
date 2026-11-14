let currentCountry = typeof window !== 'undefined' && window.__ADMAFIA_COUNTRY__
  ? { ...window.__ADMAFIA_COUNTRY__, is_auto_detected: true, is_manual_override: false }
  : null;
let allAvailableCountries = [];
let listeners = new Set();
let isInitialized = false;
let initPromise = null;

/**
 * Format currency amount with symbol and position
 */
export function formatCurrency(amount, country = currentCountry) {
  const c = country;
  if (!c) return '';
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
 * Format daily starting rate from the server-provided pricing result.
 */
export function formatDailyRate(country = currentCountry) {
  const c = country;
  if (!c) return '';
  return `${c.currency_symbol}${Number(c.daily_min_budget).toLocaleString()}/Day`;
}

/**
 * Format daily starting budget from the server-provided pricing result.
 */
export function formatDailyBudget(country = currentCountry) {
  const c = country;
  if (!c) return '';
  return `${c.currency_symbol}${Number(c.daily_min_budget).toLocaleString()}`;
}

/**
 * Format monthly advertising spend from the server-provided pricing result.
 */
export function formatMonthlySpend(country = currentCountry) {
  const c = country;
  if (!c) return '';
  return `${c.currency_symbol}${Number(c.monthly_budget || Number(c.daily_min_budget) * 30).toLocaleString()}`;
}

/**
 * Notify all subscribers of country change
 */
function notifyListeners() {
  listeners.forEach((listener) => {
    try {
      listener(typeof window !== 'undefined' && window.__ADMAFIA_IS_SERVER_RENDER__
        ? window.__ADMAFIA_COUNTRY__ || null
        : currentCountry, allAvailableCountries);
    } catch (e) {
      console.error('[countryService] Listener error:', e);
    }
  });
}

export const countryService = {
  getCurrentCountry() {
    return currentCountry;
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
    listener(typeof window !== 'undefined' && window.__ADMAFIA_IS_SERVER_RENDER__
      ? window.__ADMAFIA_COUNTRY__ || null
      : currentCountry, allAvailableCountries);
    return () => {
      listeners.delete(listener);
    };
  },

  /**
   * Initialize country detection from backend API
   */
  async init() {
    if (typeof window === 'undefined' || window.__ADMAFIA_IS_SERVER_RENDER__) {
      return currentCountry;
    }
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
          currentCountry = null;
          notifyListeners();
        } else {
          currentCountry = null;
          notifyListeners();
        }
      } catch (err) {
      console.warn('[countryService] Network error during country detection:', err.message);
      }

      isInitialized = true;
      return currentCountry;
    })();

    return initPromise;
  },

};

// Start background initialization immediately
if (typeof window !== 'undefined' && !window.__ADMAFIA_IS_SERVER_RENDER__) {
  countryService.init().catch(() => {});
}

export default countryService;

