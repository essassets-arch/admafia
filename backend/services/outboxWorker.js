import { OutboxEvent, MarketingPost } from '../models/index.js';
import { isMongoConnected } from '../mongo.js';
import { recordMongoOutboxEvent } from './mongoOutbox.js';
import {
  syncPostToMongo,
  syncRevisionToMongo,
  syncReviewToMongo,
  recordTelemetryEvent
} from './marketingStorage.js';

let isWorkerRunning = false;
let workerInterval = null;

const MAX_RETRIES = 5;
const BATCH_SIZE = 50;
// A claimed ('processing') event that has not completed within this window is considered
// abandoned (e.g. process crashed mid-flight) and becomes claimable again.
const STALE_CLAIM_MS = 5 * 60 * 1000;

/**
 * Inserts an event into the transactional outbox (MongoDB `outbox_events` collection).
 * Pass the active MongoDB session when called inside withMongoTransaction so the business
 * write and the event commit atomically; pass null/undefined to write outside a transaction.
 */
export async function recordOutboxEvent(session, { aggregateType, aggregateId, eventType, payload }) {
  // Legacy callers used to pass a SQL tx query function here; anything that is not a session
  // object is treated as "no session".
  const activeSession = session && typeof session === 'object' ? session : null;

  try {
    return await recordMongoOutboxEvent(activeSession, { aggregateType, aggregateId, eventType, payload });
  } catch (err) {
    console.error('[Outbox Record Error]:', err.message);
    throw err;
  }
}

/** Atomically claim the oldest claimable event so concurrent workers never process the same one. */
async function claimNextEvent() {
  const staleBefore = new Date(Date.now() - STALE_CLAIM_MS);
  return OutboxEvent.findOneAndUpdate(
    {
      retryCount: { $lt: MAX_RETRIES },
      $or: [
        { status: { $in: ['pending', 'failed'] } },
        { status: 'processing', claimedAt: { $lt: staleBefore } },
      ],
    },
    { $set: { status: 'processing', claimedAt: new Date() } },
    { sort: { createdAt: 1 }, new: true, lean: true }
  );
}

/** Dispatch one claimed event. Returns normally on success, throws on failure. */
async function dispatchEvent(event) {
  const payload = event.payload && typeof event.payload === 'object' ? event.payload : {};

  switch (event.eventType) {
    case 'POST_CREATED':
      // MongoDB is the source of truth: only materialise the post if it does not exist yet,
      // never overwrite a document that already holds newer state.
      if (!(await MarketingPost.exists({ _id: event.aggregateId }))) {
        await syncPostToMongo({ id: event.aggregateId, ...payload });
      }
      return;

    case 'ARTWORK_UPLOADED': {
      // Revision already embedded on the post (written in the same transaction as this event)
      if (payload.revision_id) {
        const alreadyStored = await MarketingPost.exists({
          _id: event.aggregateId,
          'revisions.revisionId': payload.revision_id,
        });
        if (alreadyStored) return;
      }
      // syncRevisionToMongo merges into an existing revision (never discards stored data)
      await syncRevisionToMongo(event.aggregateId, payload);
      return;
    }

    case 'REVIEW_RECORDED': {
      // Skip if this decision is already embedded on the post (written in the same transaction)
      const action = payload.action || payload.decision || 'Approved';
      const revisionNumber = Number(payload.revision_number || 1);
      const alreadyStored = await MarketingPost.exists({
        _id: event.aggregateId,
        reviews: {
          $elemMatch: {
            revisionNumber,
            $or: [{ action }, { decision: action }],
          },
        },
      });
      if (!alreadyStored) await syncReviewToMongo(event.aggregateId, payload);
      return;
    }

    case 'TELEMETRY_RECORDED':
    case 'AUDIT_RECORDED':
      await recordTelemetryEvent({ id: event.aggregateId, ...payload });
      return;

    case 'WALLET_CREDITED':
    case 'WALLET_DEBITED':
    case 'PAYMENT_RECEIVED':
    case 'LEAD_DISPATCHED':
    case 'ARTWORK_REVIEWED':
    case 'CAMPAIGN_STARTED':
      // Informational events: hooks for external webhooks / notifications; nothing to replicate.
      return;

    default:
      console.warn(`[Outbox] Unknown eventType: ${event.eventType}`);
      return; // Mark as handled to prevent infinite loop
  }
}

/**
 * Processes pending outbox events from the MongoDB outbox_events collection.
 */
export async function processPendingOutboxEvents() {
  if (isWorkerRunning) return;
  if (!isMongoConnected()) return;

  isWorkerRunning = true;

  try {
    for (let i = 0; i < BATCH_SIZE; i += 1) {
      const event = await claimNextEvent();
      if (!event) break;

      try {
        await dispatchEvent(event);
        await OutboxEvent.updateOne(
          { _id: event._id },
          { $set: { status: 'completed', processedAt: new Date(), lastError: null } }
        );
      } catch (procErr) {
        console.warn(`[Outbox Process Error on ${event._id}]:`, procErr.message);
        await OutboxEvent.updateOne(
          { _id: event._id },
          { $set: { status: 'failed', lastError: procErr.message }, $inc: { retryCount: 1 } }
        );
      }
    }
  } catch (err) {
    console.error('[Outbox Worker Fatal Error]:', err.message);
  } finally {
    isWorkerRunning = false;
  }
}

/**
 * Starts the background outbox relay worker.
 */
export function startOutboxWorker(intervalMs = 2500) {
  if (workerInterval) clearInterval(workerInterval);

  workerInterval = setInterval(() => {
    processPendingOutboxEvents().catch((err) => {
      console.warn('[Outbox Interval Warning]:', err.message);
    });
  }, intervalMs);

  console.log(`[Outbox Worker] Background relay worker started (interval: ${intervalMs}ms).`);
}

export function stopOutboxWorker() {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
}
