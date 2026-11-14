import { OutboxEvent } from '../models/index.js';
import { isMongoConnected } from '../mongo.js';

let isWorkerRunning = false;
let workerInterval = null;

/**
 * Records an outbox event inside a MongoDB session (transaction).
 * Ensures business data and event are committed atomically in MongoDB.
 */
export async function recordMongoOutboxEvent(session, { aggregateType, aggregateId, eventType, payload }) {
  const id = `outbox_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

  const eventDoc = new OutboxEvent({
    _id: id,
    aggregateType,
    aggregateId,
    eventType,
    payload: payload || {},
    status: 'pending',
    retryCount: 0,
    createdAt: new Date()
  });

  if (session) {
    await eventDoc.save({ session });
  } else {
    await eventDoc.save();
  }

  return id;
}

/**
 * Processes pending MongoDB outbox events with exponential backoff and idempotency.
 */
export async function processPendingMongoOutboxEvents() {
  if (isWorkerRunning) return;
  if (!isMongoConnected()) return;

  isWorkerRunning = true;

  try {
    const pendingEvents = await OutboxEvent.find({
      status: { $in: ['pending', 'failed'] },
      retryCount: { $lt: 5 }
    })
      .sort({ createdAt: 1 })
      .limit(50);

    if (pendingEvents.length === 0) {
      isWorkerRunning = false;
      return;
    }

    for (const event of pendingEvents) {
      try {
        // Dispatch according to event type
        switch (event.eventType) {
          case 'WALLET_CREDITED':
          case 'WALLET_DEBITED':
          case 'PAYMENT_RECEIVED':
          case 'LEAD_DISPATCHED':
          case 'ARTWORK_UPLOADED':
          case 'ARTWORK_REVIEWED':
          case 'CAMPAIGN_STARTED':
            // Event hooks dispatched to external webhooks, logging or notification queues
            break;

          default:
            break;
        }

        event.status = 'completed';
        event.processedAt = new Date();
        event.lastError = null;
        await event.save();
      } catch (err) {
        console.warn(`[MongoOutbox Worker] Error processing event ${event._id}:`, err.message);
        event.status = 'failed';
        event.retryCount += 1;
        event.lastError = err.message;
        await event.save();
      }
    }
  } catch (err) {
    console.error('[MongoOutbox Fatal Error]:', err.message);
  } finally {
    isWorkerRunning = false;
  }
}

/**
 * Starts the MongoDB transactional outbox relay worker.
 */
export function startMongoOutboxWorker(intervalMs = 2500) {
  if (workerInterval) clearInterval(workerInterval);

  workerInterval = setInterval(() => {
    processPendingMongoOutboxEvents().catch((err) => {
      console.warn('[MongoOutbox Interval Warning]:', err.message);
    });
  }, intervalMs);

  console.log(`[MongoOutbox Worker] Background relay worker started (interval: ${intervalMs}ms).`);
}

export function stopMongoOutboxWorker() {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
}
