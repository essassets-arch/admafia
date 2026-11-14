/* eslint-disable no-restricted-globals */
/**
 * AdMafia Marketing — Firebase Cloud Messaging (FCM) & Web Push Service Worker
 * Dynamically configures Firebase Messaging when query params are supplied,
 * and handles native Web Push payloads + deep-link click routing.
 */

try {
  const params = new URL(self.location.href).searchParams;
  const apiKey = params.get('apiKey');
  const projectId = params.get('projectId');
  const messagingSenderId = params.get('messagingSenderId');
  const appId = params.get('appId');

  if (apiKey && projectId && messagingSenderId && appId) {
    importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
    importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js');

    firebase.initializeApp({
      apiKey,
      authDomain: params.get('authDomain') || `${projectId}.firebaseapp.com`,
      projectId,
      messagingSenderId,
      appId,
    });

    const messaging = firebase.messaging();
    messaging.onBackgroundMessage((payload) => {
      const title = payload?.notification?.title || payload?.data?.title || 'AdMafia Notification';
      const body = payload?.notification?.body || payload?.data?.body || 'You have a new real-time update.';
      const deepLink = payload?.data?.deepLink || '/';

      self.registration.showNotification(title, {
        body,
        icon: '/AdMafia-Logo.png',
        badge: '/AdMafia-Logo.png',
        data: { deepLink },
      });
    });
  }
} catch (err) {
  // Safe fallback to standard push listener below
}

self.addEventListener('push', (event) => {
  if (!event.data) return;
  try {
    const payload = event.data.json();
    // Avoid duplicate notification if firebase.messaging already handled notification key
    if (payload?.notification && self.firebase) return;
    const title = payload?.notification?.title || payload?.data?.title || payload?.title || 'AdMafia CRM Alert';
    const body = payload?.notification?.body || payload?.data?.body || payload?.body || '';
    const deepLink = payload?.data?.deepLink || payload?.deepLink || '/';

    event.waitUntil(
      self.registration.showNotification(title, {
        body,
        icon: '/AdMafia-Logo.png',
        badge: '/AdMafia-Logo.png',
        data: { deepLink },
      })
    );
  } catch (e) {
    // Ignore non-JSON push frames
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.deepLink || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if (targetUrl && 'navigate' in client) {
            client.navigate(targetUrl).catch(() => {});
          }
          return undefined;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});

