import adminAuthApi from '../services/adminAuthApi';

const PENDING_WA_URL_KEY = 'admafia_pending_whatsapp_url';
const PENDING_WA_TS_KEY = 'admafia_pending_whatsapp_ts';
const REGISTER_PREFILL_KEY = 'admafia_register_prefill';
const PENDING_WA_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

export function isVisitorAuthenticated() {
  if (typeof window === 'undefined') return false;
  try {
    const custToken = localStorage.getItem('admafia_customer_token');
    const rawCust = localStorage.getItem('growthline_active_user');
    if (custToken && rawCust) {
      const parsed = JSON.parse(rawCust);
      if (
        parsed &&
        (parsed.id || parsed.phone || parsed.username || parsed.companyName || parsed.name)
      ) {
        return true;
      }
    }
  } catch {
    // Ignore storage read errors
  }

  try {
    if (adminAuthApi.getCurrentUser()) {
      return true;
    }
  } catch {
    // Ignore staff auth read errors
  }

  return false;
}

export function hasPendingWhatsAppRedirect() {
  if (typeof window === 'undefined') return false;
  try {
    const url = sessionStorage.getItem(PENDING_WA_URL_KEY);
    const ts = Number(sessionStorage.getItem(PENDING_WA_TS_KEY) || 0);
    if (!url || !url.startsWith('https://wa.me/')) return false;
    if (ts && Date.now() - ts > PENDING_WA_MAX_AGE_MS) {
      clearPendingWhatsAppRedirect();
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function clearPendingWhatsAppRedirect() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(PENDING_WA_URL_KEY);
    sessionStorage.removeItem(PENDING_WA_TS_KEY);
  } catch {
    // Ignore storage errors
  }
}

export function consumePendingWhatsAppRedirect() {
  if (typeof window === 'undefined') return null;
  try {
    const url = sessionStorage.getItem(PENDING_WA_URL_KEY);
    const ts = Number(sessionStorage.getItem(PENDING_WA_TS_KEY) || 0);
    sessionStorage.removeItem(PENDING_WA_URL_KEY);
    sessionStorage.removeItem(PENDING_WA_TS_KEY);
    if (!url || !url.startsWith('https://wa.me/')) return null;
    if (ts && Date.now() - ts > PENDING_WA_MAX_AGE_MS) return null;
    return url;
  } catch {
    return null;
  }
}

export function launchPendingWhatsAppIfAny() {
  if (typeof window === 'undefined') return false;
  const pendingUrl = consumePendingWhatsAppRedirect();
  if (!pendingUrl) return false;

  try {
    const opened = window.open(pendingUrl, '_blank', 'noopener,noreferrer');
    if (!opened) {
      setTimeout(() => {
        window.location.href = pendingUrl;
      }, 120);
    }
    return true;
  } catch {
    window.location.href = pendingUrl;
    return true;
  }
}

export function gateOrOpenWhatsApp(waUrl, event) {
  if (event) {
    event.preventDefault();
    if (typeof event.stopPropagation === 'function') {
      event.stopPropagation();
    }
  }
  if (typeof window === 'undefined') return false;

  if (isVisitorAuthenticated()) {
    clearPendingWhatsAppRedirect();
    const opened = window.open(waUrl, '_blank', 'noopener,noreferrer');
    if (!opened) {
      window.location.href = waUrl;
    }
    return true;
  }

  try {
    sessionStorage.setItem(PENDING_WA_URL_KEY, waUrl);
    sessionStorage.setItem(PENDING_WA_TS_KEY, String(Date.now()));
  } catch {
    // Ignore storage errors
  }

  try {
    window.history.pushState({}, '', '/register');
    window.dispatchEvent(new PopStateEvent('popstate'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch {
    window.location.href = '/register';
  }
  return false;
}

export function saveRegisterPrefill(data) {
  if (typeof window === 'undefined' || !data) return;
  try {
    sessionStorage.setItem(REGISTER_PREFILL_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage errors
  }
}

export function consumeRegisterPrefill() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(REGISTER_PREFILL_KEY);
    sessionStorage.removeItem(REGISTER_PREFILL_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
