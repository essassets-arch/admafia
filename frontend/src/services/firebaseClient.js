/**
 * AdMafia Real-Time Notification & Firebase Cloud Messaging (FCM) Client
 * SSR-safe dual-channel engine:
 *  1. Instant Server-Sent Events (SSE) stream (/api/notifications/stream)
 *  2. Google Firebase Cloud Messaging (FCM HTTP v1) Web Push registration
 */

import crmApi, { getActiveAuthToken } from './crmApi';

let cachedConfig = null;

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
 * Requests browser Notification permission & registers Firebase FCM Web Push token when configured
 */
export async function enableBrowserPushNotifications() {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return { ok: false, reason: 'Browser does not support Web Notifications' };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { ok: false, permission, reason: 'Notification permission was not granted' };
  }

  const cfgRes = await fetchFirebaseWebConfig();
  const cfg = cfgRes?.webConfig || cfgRes?.firebaseConfig;
  if (!cfgRes?.webConfigured || !cfg?.apiKey || !cfg?.projectId || !cfg?.messagingSenderId || !cfg?.appId) {
    // Desktop Notification API still works via live SSE stream!
    return { ok: true, mode: 'sse-desktop-push', permission };
  }

  try {
    if (!('serviceWorker' in navigator)) {
      return { ok: true, mode: 'sse-desktop-push', permission };
    }

    const swQuery = new URLSearchParams({
      apiKey: cfg.apiKey,
      authDomain: cfg.authDomain || `${cfg.projectId}.firebaseapp.com`,
      projectId: cfg.projectId,
      messagingSenderId: cfg.messagingSenderId,
      appId: cfg.appId,
    }).toString();

    const registration = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${swQuery}`);

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
 * Connects to /api/notifications/stream (SSE) for instant <100ms in-app & desktop alerts
 */
export function subscribeToRealtimeNotifications({ onNotification, onStatusChange } = {}) {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
    return () => {};
  }

  let es = null;
  let reconnectTimer = null;
  let closed = false;

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
        if (onNotification) onNotification(data);

        // Also trigger native browser desktop notification if tab is in background & permission granted
        if (
          typeof Notification !== 'undefined' &&
          Notification.permission === 'granted' &&
          document.visibilityState !== 'visible'
        ) {
          const n = new Notification(data.title || 'AdMafia Notification', {
            body: data.body || '',
            icon: '/AdMafia-Logo.png',
          });
          n.onclick = () => {
            window.focus();
            if (data.deepLink) {
              window.location.href = data.deepLink;
            }
          };
        }
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

  // Auto-register FCM token silently if permission was already granted earlier
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    enableBrowserPushNotifications().catch(() => {});
  }

  return () => {
    closed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (es) {
      try {
        es.close();
      } catch (e) {}
    }
  };
}

