import express from 'express';
import { Notification, FcmToken } from '../models/index.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { getFirebaseStatus, registerSseClient } from '../services/firebasePushService.js';

export const notificationsRouter = express.Router();

/**
 * GET /api/notifications/config
 * Public Web Push configuration so `firebaseClient.js` and `firebase-messaging-sw.js`
 * can initialize dynamically once Firebase project keys are added to `.env`.
 */
notificationsRouter.get('/config', (_req, res) => {
  const status = getFirebaseStatus();
  res.json({
    ok: true,
    serverConfigured: status.serverConfigured,
    webConfigured: status.webConfigured,
    webConfig: status.webConfig,
    firebaseConfig: status.webConfig,
  });
});

function buildRecipientFilter(auth) {
  if (auth.actorType === 'customer') {
    return {
      recipientType: 'customer',
      recipientId: String(auth.customerId || auth.sub),
    };
  }
  const dept = String(auth.department || 'Super Admin');
  const isSuper = dept.toLowerCase().includes('super');
  return {
    $or: [
      { recipientType: 'staff', recipientId: String(auth.sub) },
      ...(isSuper
        ? [{ recipientType: 'broadcast_staff' }]
        : [{ recipientType: 'broadcast_staff', department: new RegExp(`^${dept.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }]),
    ],
  };
}

/**
 * GET /api/notifications
 * Returns recent notifications + unread badge count for the authenticated user.
 */
notificationsRouter.get('/', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(50, Math.max(5, Number(req.query.limit || 25)));
    const filter = buildRecipientFilter(req.auth);

    const [items, unreadCount] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).limit(limit).lean(),
      Notification.countDocuments({ ...filter, isRead: false }),
    ]);

    res.json({
      ok: true,
      unreadCount,
      notifications: items.map((n) => ({
        id: String(n._id),
        type: n.type,
        title: n.title,
        body: n.body,
        deepLink: n.deepLink,
        metadata: n.metadata || {},
        isRead: Boolean(n.isRead),
        createdAt: n.createdAt,
      })),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/notifications/fcm-token
 * Registers or refreshes a browser/mobile Firebase Cloud Messaging device token.
 */
notificationsRouter.post('/fcm-token', requireAuth, async (req, res) => {
  try {
    const rawToken = String(req.body?.token || '').trim();
    if (!rawToken || rawToken.length < 16) {
      return res.status(400).json({ ok: false, error: 'Valid FCM registration token is required.' });
    }

    const ownerType = req.auth.actorType === 'staff' ? 'staff' : 'customer';
    const ownerId = String(ownerType === 'customer' ? (req.auth.customerId || req.auth.sub) : req.auth.sub);
    const department = String(req.auth.department || '');

    await FcmToken.findOneAndUpdate(
      { token: rawToken },
      {
        $set: {
          ownerType,
          ownerId,
          department,
          userAgent: String(req.headers['user-agent'] || '').slice(0, 250),
          platform: String(req.body?.platform || 'web'),
          isActive: true,
          lastSeenAt: new Date(),
        },
      },
      { upsert: true, new: true }
    );

    return res.json({ ok: true, registered: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * DELETE /api/notifications/fcm-token
 * Deactivates device push token upon explicit sign-out.
 */
notificationsRouter.delete('/fcm-token', requireAuth, async (req, res) => {
  try {
    const rawToken = String(req.body?.token || '').trim();
    if (rawToken) {
      await FcmToken.updateOne({ token: rawToken }, { $set: { isActive: false } });
    }
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * PATCH /api/notifications/:id/read
 */
notificationsRouter.patch('/:id/read', requireAuth, async (req, res) => {
  try {
    const filter = { _id: req.params.id, ...buildRecipientFilter(req.auth) };
    await Notification.updateOne(filter, { $set: { isRead: true, readAt: new Date() } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/notifications/read-all
 */
notificationsRouter.post('/read-all', requireAuth, async (req, res) => {
  try {
    const filter = { ...buildRecipientFilter(req.auth), isRead: false };
    const result = await Notification.updateMany(filter, { $set: { isRead: true, readAt: new Date() } });
    res.json({ ok: true, markedCount: result.modifiedCount || 0 });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/notifications/stream
 * Real-time Server-Sent Events (SSE) push channel for instant in-app & browser notifications.
 */
notificationsRouter.get('/stream', requireAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const actorType = req.auth.actorType === 'staff' ? 'staff' : 'customer';
  const actorId = String(actorType === 'customer' ? (req.auth.customerId || req.auth.sub) : req.auth.sub);
  const department = String(req.auth.department || '');

  res.write(`event: connected\ndata: ${JSON.stringify({ ok: true, actorType, actorId })}\n\n`);

  const unregister = registerSseClient({ actorType, actorId, department, res });
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
      unregister();
    }
  }, 25_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unregister();
  });
});

export default notificationsRouter;

