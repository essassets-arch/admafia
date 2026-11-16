/* eslint-disable no-restricted-globals */
/**
 * Ad Mafia Marketing — Firebase Cloud Messaging (FCM) & Web Push Service Worker (v2)
 * Handles 100% of Google FCM HTTP v1 Web Push frames directly so OS notifications
 * ALWAYS display in Windows / macOS / Android Notification Center (even when a tab
 * of admafia.marketing is open in the foreground) AND broadcasts to active tabs.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch (err) {
    try {
      payload = { title: 'Ad Mafia CRM Alert', body: event.data.text() };
    } catch {
      return;
    }
  }

  const notif = payload?.notification || {};
  const data = payload?.data || {};

  const title = notif.title || data.title || payload.title || 'Ad Mafia Notification';
  const body = notif.body || data.body || payload.body || 'You have a new real-time update.';
  const deepLink = data.deepLink || payload.deepLink || notif.click_action || '/portal';
  const notificationId = data.notificationId || notif.tag || payload.tag || `admafia-${Date.now()}`;

  const notifRecord = {
    id: String(notificationId),
    type: data.type || 'SYSTEM_ALERT',
    title,
    body,
    deepLink,
    isRead: false,
    createdAt: new Date().toISOString(),
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, {
        body,
        icon: notif.icon || '/AdMafia-Logo.png',
        badge: notif.badge || '/AdMafia-Logo.png',
        tag: String(notificationId),
        renotify: true,
        data: { deepLink, notificationId: String(notificationId) },
      }),
      self.clients
        .matchAll({ type: 'window', includeUncontrolled: true })
        .then((clientList) => {
          for (const client of clientList) {
            try {
              client.postMessage({
                type: 'ADMAFIA_FCM_PUSH',
                notification: notifRecord,
              });
            } catch {
              // Ignore cross-context errors
            }
          }
        })
        .catch(() => {}),
    ])
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.deepLink || '/portal';

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
