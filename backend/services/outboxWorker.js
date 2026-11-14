import { query, withTransaction } from '../db.js';
import { isMongoConnected } from '../mongo.js';
import {
  syncPostToMongo,
  syncRevisionToMongo,
  syncReviewToMongo,
  recordTelemetryEvent
} from './marketingStorage.js';

let isWorkerRunning = false;
let workerInterval = null;

/**
 * Inserts an event into the transactional outbox.
 * MUST be passed the active transaction query function if called inside withTransaction.
 */
export async function recordOutboxEvent(txQuery, { aggregateType, aggregateId, eventType, payload }) {
  const queryFn = txQuery || query;
  const id = `outbox_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

  try {
    await queryFn(
      `INSERT INTO crm_outbox (id, aggregate_type, aggregate_id, event_type, payload, status, created_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', NOW())`,
      [id, aggregateType, aggregateId, eventType, JSON.stringify(payload || {})]
    );
    return id;
  } catch (err) {
    console.error('[Outbox Record Error]:', err.message);
    throw err;
  }
}

/**
 * Processes pending outbox events and pushes them to MongoDB idempotently.
 */
export async function processPendingOutboxEvents() {
  if (isWorkerRunning) return;
  if (!isMongoConnected()) return;

  isWorkerRunning = true;

  try {
    const pendingRes = await query(`
      SELECT * FROM crm_outbox
      WHERE status IN ('pending', 'failed') AND retry_count < 5
      ORDER BY created_at ASC
      LIMIT 50
    `);

    if (pendingRes.rowCount === 0) {
      isWorkerRunning = false;
      return;
    }

    for (const event of pendingRes.rows) {
      let payload = event.payload;
      if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch (e) { payload = {}; }
      }

      try {
        let success = false;

        switch (event.event_type) {
          case 'POST_CREATED':
            await syncPostToMongo({
              id: event.aggregate_id,
              ...payload
            });
            success = true;
            break;

          case 'ARTWORK_UPLOADED':
            await syncRevisionToMongo(event.aggregate_id, payload);
            success = true;
            break;

          case 'REVIEW_RECORDED':
            await syncReviewToMongo(event.aggregate_id, payload);
            success = true;
            break;

          case 'TELEMETRY_RECORDED':
          case 'AUDIT_RECORDED':
            await recordTelemetryEvent({
              id: event.aggregate_id,
              ...payload
            });
            success = true;
            break;

          default:
            console.warn(`[Outbox] Unknown event_type: ${event.event_type}`);
            success = true; // Mark as handled to prevent infinite loop
            break;
        }

        if (success) {
          await query(
            `UPDATE crm_outbox SET status = 'completed', processed_at = NOW(), last_error = NULL WHERE id = $1`,
            [event.id]
          );
        }
      } catch (procErr) {
        console.warn(`[Outbox Process Error on ${event.id}]:`, procErr.message);
        await query(
          `UPDATE crm_outbox SET status = 'failed', retry_count = retry_count + 1, last_error = $1 WHERE id = $2`,
          [procErr.message, event.id]
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
