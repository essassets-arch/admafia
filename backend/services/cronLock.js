import os from 'os';
import { randomBytes } from 'crypto';
import { CronLock } from '../models/index.js';
import { isMongoConnected } from '../mongo.js';

const INSTANCE_ID = `${os.hostname()}_${process.pid}_${randomBytes(3).toString('hex')}`;

/**
 * Acquires a distributed MongoDB atomic TTL lease lock so scheduled cron tasks
 * (`processDailyAdSpendPacing`, snapshot pruning, etc.) NEVER double-execute when
 * horizontally scaled across multiple Cloud Run / Kubernetes / Docker replicas.
 */
export async function withDistributedCronLock(jobName, leaseDurationMs, taskFn) {
  if (!isMongoConnected()) return { skipped: true, reason: 'mongo_disconnected' };

  const now = new Date();
  const lockedUntil = new Date(now.getTime() + Math.max(5_000, leaseDurationMs));

  try {
    await CronLock.findOneAndUpdate(
      {
        _id: jobName,
        $or: [{ lockedUntil: { $lte: now } }, { holderId: INSTANCE_ID }],
      },
      {
        $set: {
          holderId: INSTANCE_ID,
          lockedAt: now,
          lockedUntil,
        },
      },
      { upsert: true, new: true }
    );
  } catch (err) {
    // E11000 duplicate key means another active container currently holds a valid lease
    if (err?.code === 11000) {
      return { skipped: true, reason: 'lease_held_by_peer' };
    }
    throw err;
  }

  try {
    const result = await taskFn();
    return { skipped: false, holderId: INSTANCE_ID, result };
  } finally {
    // Release lease early on clean finish so rapid manual/test triggers aren't blocked
    await CronLock.deleteOne({ _id: jobName, holderId: INSTANCE_ID }).catch(() => {});
  }
}

export function getInstanceId() {
  return INSTANCE_ID;
}

