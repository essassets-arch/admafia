import { createSign } from 'crypto';
import { Notification, FcmToken, SystemUser, Customer } from '../models/index.js';

/**
 * Dual-Channel Real-Time Notification & Google Firebase Cloud Messaging (FCM HTTP v1) Engine:
 * 1. Persists every notification in MongoDB (`notifications`, 90-day TTL).
 * 2. Pushes sub-100ms live events over Server-Sent Events (SSE) to active browser sessions.
 * 3. Dispatches OS/Mobile background Web Push via Google FCM HTTP v1 API when Firebase credentials
 *    (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`) are configured.
 */

let cachedGoogleAccessToken = null;
let cachedGoogleTokenExpiresAt = 0;

// Active SSE connections keyed by subscriberKey (`customer:<id>` or `staff:<userId>`)
const sseClients = new Set();

export function getFirebaseStatus() {
  const projectId = (process.env.FIREBASE_PROJECT_ID || '').trim();
  const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || '').trim();
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
  const webApiKey = (process.env.FIREBASE_WEB_API_KEY || '').trim();
  const messagingSenderId = (process.env.FIREBASE_MESSAGING_SENDER_ID || '').trim();
  const appId = (process.env.FIREBASE_APP_ID || '').trim();
  const vapidKey = (process.env.FIREBASE_VAPID_KEY || '').trim();

  const serverConfigured = Boolean(projectId && clientEmail && privateKey.includes('PRIVATE KEY'));
  const webConfigured = Boolean(projectId && webApiKey && messagingSenderId && appId);

  return {
    serverConfigured,
    webConfigured,
    projectId: projectId || null,
    webConfig: webConfigured
      ? {
          apiKey: webApiKey,
          authDomain: `${projectId}.firebaseapp.com`,
          projectId,
          messagingSenderId,
          appId,
          vapidKey: vapidKey || null,
        }
      : null,
    activeSseConnections: sseClients.size,
  };
}

function base64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export async function getGoogleFcmAccessToken() {
  if (cachedGoogleAccessToken && Date.now() < cachedGoogleTokenExpiresAt - 60_000) {
    return cachedGoogleAccessToken;
  }

  const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || '').trim();
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
  if (!clientEmail || !privateKey) return null;

  const nowSec = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claimSet = base64Url(
    JSON.stringify({
      iss: clientEmail,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: nowSec,
      exp: nowSec + 3600,
    })
  );
  const unsigned = `${header}.${claimSet}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const signature = signer
    .sign(privateKey)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const assertion = `${unsigned}.${signature}`;
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(10_000),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Firebase OAuth2 token exchange failed (${resp.status}): ${errText}`);
  }

  const data = await resp.json();
  cachedGoogleAccessToken = data.access_token;
  cachedGoogleTokenExpiresAt = Date.now() + Number(data.expires_in || 3600) * 1000;
  return cachedGoogleAccessToken;
}

async function sendFcmHttpV1ToTokens(tokens, { title, body, deepLink = '/portal', type = 'SYSTEM_ALERT', notificationId = '' }) {
  const status = getFirebaseStatus();
  if (!status.serverConfigured || !Array.isArray(tokens) || tokens.length === 0) {
    return { dispatched: false, sentCount: 0 };
  }

  let accessToken = null;
  try {
    accessToken = await getGoogleFcmAccessToken();
  } catch (err) {
    console.warn('[FCM OAuth Warning]:', err.message);
    return { dispatched: false, sentCount: 0 };
  }
  if (!accessToken) return { dispatched: false, sentCount: 0 };

  const endpoint = `https://fcm.googleapis.com/v1/projects/${status.projectId}/messages:send`;
  const publicOrigin = (process.env.PUBLIC_ORIGIN || 'https://admafia.marketing').replace(/\/+$/, '');
  const resolvedDeepLink = String(deepLink || '/portal');
  const fullHttpsLink = resolvedDeepLink.startsWith('http')
    ? resolvedDeepLink
    : `${publicOrigin}${resolvedDeepLink.startsWith('/') ? '' : '/'}${resolvedDeepLink}`;
  const dedupeTag = String(notificationId || `admafia-${Date.now()}`);
  let sentCount = 0;

  await Promise.all(
    tokens.map(async (deviceToken) => {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              token: deviceToken,
              notification: { title, body },
              data: {
                title: String(title),
                body: String(body),
                type: String(type),
                deepLink: resolvedDeepLink,
                notificationId: dedupeTag,
              },
              webpush: {
                headers: {
                  Urgency: 'high',
                },
                fcm_options: {
                  link: fullHttpsLink,
                },
                notification: {
                  title,
                  body,
                  icon: '/AdMafia-Logo.png',
                  badge: '/AdMafia-Logo.png',
                  tag: dedupeTag,
                  renotify: true,
                },
              },
            },
          }),
          signal: AbortSignal.timeout(8_000),
        });

        if (res.ok) {
          sentCount += 1;
        } else if (res.status === 404 || res.status === 410) {
          // Prune stale/unregistered browser push token automatically
          await FcmToken.updateOne({ token: deviceToken }, { $set: { isActive: false } }).catch(() => {});
        }
      } catch {
        // Individual device push error shouldn't abort sibling tokens
      }
    })
  );

  return { dispatched: true, sentCount };
}

export function registerSseClient(clientInfo) {
  sseClients.add(clientInfo);
  return () => {
    sseClients.delete(clientInfo);
  };
}

function broadcastSseNotification(doc) {
  const payloadStr = `event: notification\ndata: ${JSON.stringify({
    id: String(doc._id),
    type: doc.type,
    title: doc.title,
    body: doc.body,
    deepLink: doc.deepLink,
    metadata: doc.metadata,
    isRead: doc.isRead,
    createdAt: doc.createdAt,
  })}\n\n`;

  for (const client of sseClients) {
    try {
      const matchesCustomer =
        doc.recipientType === 'customer' &&
        client.actorType === 'customer' &&
        String(client.actorId) === String(doc.recipientId);

      const matchesStaffUser =
        doc.recipientType === 'staff' &&
        client.actorType === 'staff' &&
        String(client.actorId) === String(doc.recipientId);

      const matchesBroadcastDept =
        doc.recipientType === 'broadcast_staff' &&
        client.actorType === 'staff' &&
        (String(client.department || '').toLowerCase() === 'super admin' ||
          String(client.department || '').toLowerCase() === String(doc.department || doc.recipientId || '').toLowerCase());

      if (matchesCustomer || matchesStaffUser || matchesBroadcastDept) {
        client.res.write(payloadStr);
      }
    } catch {
      sseClients.delete(client);
    }
  }
}

/**
 * Creates an in-app notification document and dispatches both SSE + Google FCM Web Push.
 */
export async function createAndPushNotification({
  recipientType,
  recipientId,
  department = '',
  type = 'SYSTEM_ALERT',
  title,
  body,
  deepLink = '/portal',
  metadata = {},
}) {
  if (!recipientType || !recipientId || !title || !body) return null;

  const doc = await Notification.create({
    recipientType,
    recipientId: String(recipientId),
    department,
    type,
    title,
    body,
    deepLink,
    metadata,
    isRead: false,
  });

  // 1. Instant SSE push to connected tabs
  broadcastSseNotification(doc);

  // 2. Google Firebase Cloud Messaging (FCM HTTP v1) push to registered devices
  let tokenQuery = null;
  if (recipientType === 'customer') {
    tokenQuery = { ownerType: 'customer', ownerId: String(recipientId), isActive: true };
  } else if (recipientType === 'staff') {
    tokenQuery = { ownerType: 'staff', ownerId: String(recipientId), isActive: true };
  } else if (recipientType === 'broadcast_staff') {
    const deptRegex = new RegExp(`^(${department || recipientId}|super admin)$`, 'i');
    tokenQuery = { ownerType: 'staff', department: deptRegex, isActive: true };
  }

  if (tokenQuery) {
    const tokenDocs = await FcmToken.find(tokenQuery).select('token').lean().catch(() => []);
    const tokens = tokenDocs.map((t) => t.token).filter(Boolean);
    if (tokens.length > 0) {
      const fcmRes = await sendFcmHttpV1ToTokens(tokens, {
        title,
        body,
        deepLink,
        type,
        notificationId: String(doc._id),
      });
      if (fcmRes.dispatched) {
        await Notification.updateOne(
          { _id: doc._id },
          { $set: { fcmDispatched: true, fcmSentCount: fcmRes.sentCount } }
        ).catch(() => {});
      }
    }
  }

  return doc;
}

export async function notifyStaffDepartments(departments, notificationPayload) {
  const uniqueDepts = Array.from(new Set(['Super Admin', ...(departments || [])]));
  const created = [];
  for (const dept of uniqueDepts) {
    const doc = await createAndPushNotification({
      recipientType: 'broadcast_staff',
      recipientId: dept,
      department: dept,
      ...notificationPayload,
    });
    if (doc) created.push(doc);
  }
  return created;
}

/**
 * Translates Transactional Outbox events into targeted Customer & Department Real-Time Notifications.
 */
export async function dispatchOutboxNotification(event) {
  if (!event || !event.eventType) return;
  const p = event.payload && typeof event.payload === 'object' ? event.payload : {};

  switch (event.eventType) {
    case 'LEAD_DISPATCHED': {
      const customerId = p.customerId || p.customer_id || event.aggregateId;
      if (customerId) {
        const leadName = p.buyerName || p.fullName || 'New Verified Prospect';
        const city = p.city ? ` (${p.city})` : '';
        await createAndPushNotification({
          recipientType: 'customer',
          recipientId: customerId,
          type: 'LEAD_DISPATCHED',
          title: '🔥 New Qualified Lead Received!',
          body: `${leadName}${city} has been dispatched to your Lead Pipeline Inbox.`,
          deepLink: '/portal#leads',
          metadata: { leadId: p.leadId || event.aggregateId, category: p.category || '' },
        });
      }
      break;
    }

    case 'WALLET_CREDITED':
    case 'PAYMENT_RECEIVED': {
      const customerId = p.customerId || p.customer_id || event.aggregateId;
      const amount = Number(p.amount || 0);
      const sym = p.currency === 'USD' ? '$' : '₹';
      if (customerId && amount > 0) {
        await createAndPushNotification({
          recipientType: 'customer',
          recipientId: customerId,
          type: 'WALLET_CREDITED',
          title: '💳 Wallet Recharged Successfully',
          body: `${sym}${amount.toLocaleString('en-IN')} has been credited to your Marketing Wallet.`,
          deepLink: '/portal#wallet',
          metadata: { amount, utr: p.referenceUtr || '' },
        });
        await notifyStaffDepartments(['Sales'], {
          type: 'PAYMENT_RECEIVED',
          title: '💰 Client Wallet Top-Up Credited',
          body: `${p.companyName || customerId} recharged ${sym}${amount.toLocaleString('en-IN')} (UTR: ${p.referenceUtr || 'Verified'}).`,
          deepLink: '/superadmin/finance',
          metadata: { customerId, amount },
        });
      }
      break;
    }

    case 'WALLET_DEBITED': {
      const customerId = p.customerId || p.customer_id || event.aggregateId;
      const balanceAfter = Number(p.balanceAfter ?? p.availableBalance ?? -1);
      const dailySpend = Number(p.dailyAdSpend || p.amount || 300);
      if (customerId && balanceAfter >= 0 && balanceAfter < dailySpend * 2) {
        await createAndPushNotification({
          recipientType: 'customer',
          recipientId: customerId,
          type: 'LOW_WALLET_RUNWAY',
          title: '⚠️ Low Ad Wallet Balance Alert',
          body: `Your campaign runway is under 2 days (Balance: ₹${balanceAfter.toLocaleString('en-IN')}). Top up now to avoid lead pause.`,
          deepLink: '/portal#wallet',
          metadata: { balanceAfter, dailySpend },
        });
      }
      break;
    }

    case 'NEW_CUSTOMER_REGISTERED': {
      const company = p.companyName || p.username || 'New Business';
      await notifyStaffDepartments(['Sales'], {
        type: 'NEW_CUSTOMER_REGISTERED',
        title: '🚀 New WhatsApp-Verified Signup!',
        body: `${company} (${p.phone || ''}) verified via WhatsApp OTP and joined AdMafia.`,
        deepLink: '/sales',
        metadata: { customerId: event.aggregateId, phone: p.phone || '' },
      });
      break;
    }

    case 'ARTWORK_UPLOADED': {
      await notifyStaffDepartments(['Marketing'], {
        type: 'ARTWORK_UPLOADED',
        title: '🎨 Creative Uploaded for Review',
        body: `Graphics uploaded creative revision #${p.revision_number || 1} for post ${event.aggregateId}.`,
        deepLink: '/marketing/verify-posts',
        metadata: { postId: event.aggregateId },
      });
      break;
    }

    case 'REVIEW_RECORDED':
    case 'ARTWORK_REVIEWED': {
      const decision = p.action || p.decision || 'Reviewed';
      await notifyStaffDepartments(['Graphics'], {
        type: 'ARTWORK_REVIEWED',
        title: `📋 Creative ${decision}`,
        body: `Marketing marked post ${event.aggregateId} as "${decision}".`,
        deepLink: decision.toLowerCase().includes('reject') ? '/graphics/rejected-posts' : '/graphics/approved-posts',
        metadata: { postId: event.aggregateId, decision },
      });
      break;
    }

    default:
      break;
  }
}

