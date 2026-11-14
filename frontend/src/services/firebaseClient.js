/**
 * Ad Mafia Real-Time Notification & Firebase Cloud Messaging (FCM) Client (v2)
 * Dual-channel real-time engine:
 *  1. Instant Server-Sent Events (SSE) stream (/api/notifications/stream)
 *  2. Google Firebase Cloud Messaging (FCM HTTP v1) Web Push + Service Worker bridge
 */

import crmApi, { getActiveAuthToken } from './crmApi';

let cachedConfig = null;
const recentlyShownTags = new Map();

function markTagSeen(tag) {
  if (!tag) return false;
  const key = String(tag);
  const now = Date.now();
  // Clean old entries (>60s)
  for (const [k, ts] of recentlyShownTags.entries()) {
    if (now - ts > 60_000) recentlyShownTags.delete(k);
  }
  if (recentlyShownTags.has(key)) return true;
  recentlyShownTags.set(key, now);
  return false;
}

function getStreamBaseUrl() {
  if (typeof window === 'undefined') return '/api';
  const isViteDev =
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
    window.location.port === '5173';
  return import.meta.env?.VITE_API_BASE_URL || (isViteDev ? 'http://localhost:5000/api' : '/api');
}

export async function fetchFirebaseWebConfig() {
  if (typeof window === 'undefined') return null;
  if (cachedConfig) return cachedConfig;
  try {
    const res = await crmApi.getNotificationConfig();
    cachedConfig = res;
    return res;
  } catch (err) {
    return null;
  }
}

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') return reject(new Error('No DOM'));
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') return resolve();
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', reject, { once: true });
      return undefined;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = reject;
    document.head.appendChild(script);
    return undefined;
  });
}

/**
 * Displays an OS-level notification (Windows Notification Center / macOS / Android)
 * whether the tab is in the foreground OR background, deduplicated by notification ID tag.
 */
export async function triggerDesktopOsNotification(data) {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;

  const title = data?.title || 'Ad Mafia Notification';
  const body = data?.body || '';
  const tag = String(data?.id || `admafia-${Date.now()}`);
  const deepLink = data?.deepLink || '/portal';

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js') ||
        await navigator.serviceWorker.getRegistration();
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(title, {
          body,
          icon: '/AdMafia-Logo.png',
          badge: '/AdMafia-Logo.png',
          tag,
          renotify: false,
          data: { deepLink, notificationId: tag },
        });
        return;
      }
    }
  } catch {
    // Fallback to window Notification API below
  }

  try {
    const n = new Notification(title, {
      body,
      icon: '/AdMafia-Logo.png',
      tag,
    });
    n.onclick = () => {
      window.focus();
      if (deepLink) {
        window.location.href = deepLink;
      }
    };
  } catch {
    // Ignore restricted context errors
  }
}

/**
 * Requests browser Notification permission & registers Firebase FCM Web Push token when configured
 */
export async function enableBrowserPushNotifications({ promptIfDefault = true } = {}) {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return { ok: false, reason: 'Browser does not support Web Notifications' };
  }

  let permission = Notification.permission;
  if (permission === 'default' && promptIfDefault) {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') {
    return { ok: false, permission, reason: 'Notification permission was not granted' };
  }

  const cfgRes = await fetchFirebaseWebConfig();
  const cfg = cfgRes?.webConfig || cfgRes?.firebaseConfig;
  if (!cfgRes?.webConfigured || !cfg?.apiKey || !cfg?.projectId || !cfg?.messagingSenderId || !cfg?.appId) {
    return { ok: true, mode: 'sse-desktop-push', permission };
  }

  try {
    if (!('serviceWorker' in navigator)) {
      return { ok: true, mode: 'sse-desktop-push', permission };
    }

    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      updateViaCache: 'none',
    });
    // Force immediate check for updated Service Worker script
    registration.update().catch(() => {});
    await navigator.serviceWorker.ready;

    await loadScriptOnce('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
    await loadScriptOnce('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js');

    if (window.firebase) {
      if (!window.firebase.apps?.length) {
        window.firebase.initializeApp({
          apiKey: cfg.apiKey,
          authDomain: cfg.authDomain || `${cfg.projectId}.firebaseapp.com`,
          projectId: cfg.projectId,
          messagingSenderId: cfg.messagingSenderId,
          appId: cfg.appId,
        });
      }
      const messaging = window.firebase.messaging();
      const fcmToken = await messaging.getToken({
        vapidKey: cfg.vapidKey || undefined,
        serviceWorkerRegistration: registration,
      });

      if (fcmToken) {
        await crmApi.registerFcmToken(fcmToken, 'web');
        return { ok: true, mode: 'fcm-web-push', token: fcmToken, permission };
      }
    }
  } catch (err) {
    console.warn('[firebaseClient] FCM registration fallback to SSE desktop notifications:', err.message);
  }

  return { ok: true, mode: 'sse-desktop-push', permission };
}

/**
 * Connects to /api/notifications/stream (SSE) + Service Worker FCM bridge
 * for instant <100ms in-app toasts, live wallet/lead sync, and OS desktop alerts.
 */
export function subscribeToRealtimeNotifications({ onNotification, onStatusChange } = {}) {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
    return () => {};
  }

  let es = null;
  let reconnectTimer = null;
  let closed = false;

  const deliverInboundEvent = (data, { fromServiceWorker = false } = {}) => {
    if (!data) return;
    const dedupeKey = data.id || `${data.type}:${data.title}:${data.body}`;
    if (markTagSeen(dedupeKey)) return;

    if (onNotification) onNotification(data);

    // Trigger live workspace refresh when wallet or lead state mutates
    const evtType = String(data.type || '').toUpperCase();
    if (
      evtType.includes('WALLET') ||
      evtType.includes('PAYMENT') ||
      evtType.includes('LEAD') ||
      evtType.includes('CAMPAIGN')
    ) {
      crmApi.syncStateFromPostgres().catch(() => {});
    }

    // If this arrived via SSE (not already shown by Service Worker push), also surface OS notification!
    if (!fromServiceWorker) {
      triggerDesktopOsNotification(data).catch(() => {});
    }
  };

  const handleSwMessage = (event) => {
    if (event?.data?.type === 'ADMAFIA_FCM_PUSH' && event.data.notification) {
      deliverInboundEvent(event.data.notification, { fromServiceWorker: true });
    }
  };

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', handleSwMessage);
  }

  const connect = () => {
    if (closed) return;
    const token = getActiveAuthToken();
    if (!token) return;

    const streamUrl = `${getStreamBaseUrl()}/notifications/stream?token=${encodeURIComponent(token)}`;
    try {
      es = new EventSource(streamUrl, { withCredentials: true });
    } catch (e) {
      return;
    }

    es.addEventListener('connected', () => {
      if (onStatusChange) onStatusChange(true);
    });

    es.addEventListener('notification', (event) => {
      try {
        const data = JSON.parse(event.data);
        deliverInboundEvent(data, { fromServiceWorker: false });
      } catch (err) {
        // Ignore malformed frame
      }
    });

    es.onerror = () => {
      if (onStatusChange) onStatusChange(false);
      try {
        es.close();
      } catch (e) {}
      if (!closed) {
        reconnectTimer = setTimeout(connect, 5000);
      }
    };
  };

  connect();

  // Auto-refresh Service Worker + FCM token silently if permission was already granted
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    enableBrowserPushNotifications({ promptIfDefault: false }).catch(() => {});
  }

  return () => {
    closed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.removeEventListener('message', handleSwMessage);
    }
    if (es) {
      try {
        es.close();
      } catch (e) {}
    }
  };
}
