import express from 'express';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import mongoose from 'mongoose';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createCipheriv, createHash, randomBytes, scryptSync } from 'crypto';
import { fileURLToPath } from 'url';
import {
  Customer,
  Wallet,
  Lead,
  PaymentRecord,
  WalletTransaction,
  OtpDeliveryLog,
  Notification,
  FcmToken,
  SecurityEventLog,
  OutboxEvent,
} from '../models/index.js';
import { getMongoStatus } from '../mongo.js';
import { getRedisHealth } from '../services/redisStore.js';
import { getFirebaseStatus } from '../services/firebasePushService.js';
import { getWhatsAppConfig } from '../services/whatsappOtpService.js';
import { logSuperAdminAudit } from './superadmin.js';

const execFileAsync = promisify(execFile);
const gzipAsync = promisify(zlib.gzip);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const superadminOpsRouter = express.Router();

function resolveBackupDir() {
  const configured = (process.env.BACKUP_DIR || '').trim();
  const dir = configured || path.join(__dirname, '..', '..', 'backups');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function listSnapshotsOnDisk(backupDir) {
  if (!fs.existsSync(backupDir)) return [];
  const entries = fs.readdirSync(backupDir, { withFileTypes: true });
  return entries
    .filter(
      (e) =>
        e.isFile() &&
        (e.name.endsWith('.archive.gz') ||
          e.name.endsWith('.archive.gz.enc') ||
          e.name.endsWith('.json.gz') ||
          e.name.endsWith('.json.gz.enc'))
    )
    .map((e) => {
      const fullPath = path.join(backupDir, e.name);
      const stat = fs.statSync(fullPath);
      const shaPath = `${fullPath}.sha256`;
      const sha256 = fs.existsSync(shaPath) ? fs.readFileSync(shaPath, 'utf8').trim().split(/\s+/)[0] : null;
      return {
        filename: e.name,
        sizeBytes: stat.size,
        encrypted: e.name.endsWith('.enc'),
        engine: e.name.includes('.archive.') ? 'mongodump --oplog' : 'bson-json-snapshot',
        sha256,
        createdAt: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * GET /api/superadmin/database/status
 * Authoritative MongoDB Replica Set health, collection telemetry, snapshot catalog & Compass guides.
 */
superadminOpsRouter.get('/database/status', async (_req, res) => {
  try {
    const mongoStatus = getMongoStatus();
    const db = mongoose.connection.db;

    let replSet = { ok: false, set: null, myStateStr: 'STANDALONE', members: [] };
    let dbStats = {};
    let collectionStats = [];

    if (db) {
      try {
        const rsStatus = await db.admin().command({ replSetGetStatus: 1 });
        replSet = {
          ok: Boolean(rsStatus.ok),
          set: rsStatus.set || 'rs0',
          myStateStr:
            rsStatus.members?.find((m) => m.self)?.stateStr ||
            rsStatus.members?.[0]?.stateStr ||
            'PRIMARY',
          members: (rsStatus.members || []).map((m) => ({
            name: m.name,
            stateStr: m.stateStr,
            health: m.health,
            uptimeSeconds: m.uptime,
            optimeDate: m.optimeDate || null,
          })),
        };
      } catch {
        replSet = { ok: false, set: 'standalone', myStateStr: 'PRIMARY', members: [] };
      }

      try {
        dbStats = await db.stats();
      } catch {
        dbStats = {};
      }

      const collections = await db.listCollections().toArray().catch(() => []);
      collectionStats = await Promise.all(
        collections.map(async (col) => {
          const count = await db.collection(col.name).estimatedDocumentCount().catch(() => 0);
          return { name: col.name, documents: count };
        })
      );
      collectionStats.sort((a, b) => b.documents - a.documents);
    }

    const [redisHealth, outboxPending] = await Promise.all([
      getRedisHealth(),
      OutboxEvent.countDocuments({ status: { $in: ['pending', 'failed'] } }).catch(() => 0),
    ]);

    const backupDir = resolveBackupDir();
    const snapshots = listSnapshotsOnDisk(backupDir);
    const waCfg = getWhatsAppConfig();
    const fbStatus = getFirebaseStatus();

    res.json({
      ok: true,
      mongo: {
        ...mongoStatus,
        replicaSet: replSet,
        dataSizeBytes: Number(dbStats.dataSize || 0),
        storageSizeBytes: Number(dbStats.storageSize || 0),
        indexSizeBytes: Number(dbStats.indexSize || 0),
        collectionsCount: Number(dbStats.collections || collectionStats.length),
        objectsCount: Number(dbStats.objects || 0),
        collections: collectionStats,
      },
      redis: redisHealth,
      outbox: { pendingOrFailedCount: outboxPending },
      integrations: {
        whatsappCloudApi: {
          configured: waCfg.configured,
          mode: waCfg.mode,
          apiVersion: waCfg.apiVersion,
          phoneNumberId: waCfg.phoneNumberId,
          templateName: waCfg.templateName,
        },
        firebaseFcm: {
          serverConfigured: fbStatus.serverConfigured,
          webConfigured: fbStatus.webConfigured,
          projectId: fbStatus.projectId,
          activeSseConnections: fbStatus.activeSseConnections,
        },
      },
      compassGuides: {
        localDockerUri: 'mongodb://127.0.0.1:27018/admafia_crm?directConnection=true',
        vpsSshTunnelCmd: 'ssh -N -L 27019:127.0.0.1:27017 root@admafia.marketing',
        vpsCompassUri: 'mongodb://127.0.0.1:27019/admafia_crm?directConnection=true',
        cloudRecommendation:
          'MongoDB Atlas M10 Dedicated (Mumbai ap-south-1) with Continuous Cloud Backup + Independent Encrypted R2 Snapshots',
      },
      backupDir,
      snapshots,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/superadmin/database/snapshot
 * Triggers an immediate point-in-time `--oplog` compressed (+ optional AES-256 encrypted) snapshot.
 */
superadminOpsRouter.post('/database/snapshot', async (req, res) => {
  try {
    const encryptRequested = req.body?.encrypt !== false;
    const passphrase = (process.env.BACKUP_PASSPHRASE || '').trim();
    const shouldEncrypt = Boolean(encryptRequested && passphrase);

    const backupDir = resolveBackupDir();
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const mongoUri = (process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/admafia_crm?directConnection=true').trim();

    let rawGzippedBuffer = null;
    let baseFilename = `admafia_snapshot_${ts}.archive.gz`;
    let engineUsed = 'mongodump --oplog';

    try {
      const tmpArchivePath = path.join(backupDir, `.tmp_${baseFilename}`);
      // Note: `--oplog` captures point-in-time writes across the entire replica set; if single-DB URI is set, strip db path for `--oplog` or dump db archive
      const uriUrl = new URL(mongoUri);
      const oplogUri = `${uriUrl.protocol}//${uriUrl.host}/${uriUrl.search}`;
      try {
        await execFileAsync('mongodump', [`--uri=${oplogUri}`, '--oplog', `--archive=${tmpArchivePath}`, '--gzip'], {
          timeout: 60_000,
        });
      } catch {
        await execFileAsync('mongodump', [`--uri=${mongoUri}`, `--archive=${tmpArchivePath}`, '--gzip'], {
          timeout: 60_000,
        });
        engineUsed = 'mongodump --gzip';
      }
      rawGzippedBuffer = await fs.promises.readFile(tmpArchivePath);
      await fs.promises.unlink(tmpArchivePath).catch(() => {});
    } catch {
      // Fallback when running on a dev host without `mongodump` CLI installed: full logical collection export
      engineUsed = 'logical-json-gzip';
      baseFilename = `admafia_snapshot_${ts}.json.gz`;
      const db = mongoose.connection.db;
      const cols = await db.listCollections().toArray();
      const dumpObj = { exportedAt: new Date().toISOString(), database: db.databaseName, collections: {} };
      for (const c of cols) {
        dumpObj.collections[c.name] = await db.collection(c.name).find({}).toArray();
      }
      rawGzippedBuffer = await gzipAsync(Buffer.from(JSON.stringify(dumpObj), 'utf8'));
    }

    let finalBuffer = rawGzippedBuffer;
    let finalFilename = baseFilename;

    if (shouldEncrypt) {
      const salt = randomBytes(16);
      const iv = randomBytes(16);
      const key = scryptSync(passphrase, salt, 32);
      const cipher = createCipheriv('aes-256-cbc', key, iv);
      const encryptedBody = Buffer.concat([cipher.update(rawGzippedBuffer), cipher.final()]);
      // Header: "ADMAFIA_ENC_V1" (14 bytes) + salt (16B) + iv (16B) + ciphertext
      finalBuffer = Buffer.concat([Buffer.from('ADMAFIA_ENC_V1', 'ascii'), salt, iv, encryptedBody]);
      finalFilename = `${baseFilename}.enc`;
    }

    const finalPath = path.join(backupDir, finalFilename);
    await fs.promises.writeFile(finalPath, finalBuffer);
    const sha256 = createHash('sha256').update(finalBuffer).digest('hex');
    await fs.promises.writeFile(`${finalPath}.sha256`, `${sha256}  ${finalFilename}\n`, 'utf8');

    await logSuperAdminAudit({
      actorId: req.auth?.sub || 'superadmin',
      actorName: req.auth?.username || 'Super Admin',
      actorRole: req.auth?.role || 'Super Admin',
      actionType: 'DB_SNAPSHOT_CREATED',
      targetType: 'database',
      targetId: finalFilename,
      reason: `Manual ${shouldEncrypt ? 'AES-256 encrypted ' : ''}snapshot triggered`,
      details: { filename: finalFilename, sizeBytes: finalBuffer.length, sha256, engineUsed },
    }).catch(() => {});

    res.status(201).json({
      ok: true,
      snapshot: {
        filename: finalFilename,
        sizeBytes: finalBuffer.length,
        encrypted: shouldEncrypt,
        engine: engineUsed,
        sha256,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/superadmin/database/snapshots/:filename/download
 */
superadminOpsRouter.get('/database/snapshots/:filename/download', (req, res) => {
  const safeName = path.basename(String(req.params.filename || ''));
  const backupDir = resolveBackupDir();
  const fullPath = path.join(backupDir, safeName);
  if (!safeName || !fs.existsSync(fullPath)) {
    return res.status(404).json({ ok: false, error: 'Snapshot file not found.' });
  }
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
  res.setHeader('Content-Type', 'application/octet-stream');
  return fs.createReadStream(fullPath).pipe(res);
});

/**
 * GET /api/superadmin/growth-analytics
 * Executive 10k-User Growth, Conversion Drop-Off, Churn Runway Radar & Lead Liquidity Matrix.
 */
superadminOpsRouter.get('/growth-analytics', async (_req, res) => {
  try {
    const now = new Date();
    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const since48h = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      customerWalletFacet,
      leads7dByCat,
      recentLeads48hCustomerIds,
      otpTelemetryAgg,
      fcmActiveCount,
      notificationsTotal,
      securityAgg24h,
      recentSecurityEvents,
    ] = await Promise.all([
      Customer.aggregate([
        {
          $lookup: {
            from: 'wallets',
            localField: '_id',
            foreignField: 'customerId',
            as: 'w',
          },
        },
        { $unwind: { path: '$w', preserveNullAndEmptyArrays: true } },
        {
          $addFields: {
            bal: { $ifNull: ['$w.availableBalance', 0] },
            paidTotal: { $ifNull: ['$w.totalLifetimePaid', 0] },
            dailySpend: {
              $max: [
                1,
                {
                  $ifNull: [
                    '$w.dailyAdSpend',
                    { $cond: [{ $eq: ['$currency', 'USD'] }, 10, 300] },
                  ],
                },
              ],
            },
            campaignOn: { $ifNull: ['$w.adCampaignActive', false] },
          },
        },
        {
          $addFields: {
            runwayDays: { $floor: { $divide: ['$bal', '$dailySpend'] } },
            isPaidAccount: {
              $or: [{ $eq: ['$paymentStatus', 'paid'] }, { $gt: ['$paidTotal', 0] }],
            },
            isFundedToday: { $gte: ['$bal', '$dailySpend'] },
          },
        },
        {
          $facet: {
            funnel: [
              {
                $group: {
                  _id: null,
                  totalRegistered: { $sum: 1 },
                  whatsappVerified: {
                    $sum: { $cond: [{ $eq: ['$phoneVerified', true] }, 1, 0] },
                  },
                  profileCompleted: {
                    $sum: { $cond: [{ $eq: ['$profileStatus', 'complete'] }, 1, 0] },
                  },
                  paidActivated: {
                    $sum: { $cond: ['$isPaidAccount', 1, 0] },
                  },
                  activeCampaigns: {
                    $sum: {
                      $cond: [{ $and: ['$campaignOn', '$isFundedToday'] }, 1, 0],
                    },
                  },
                },
              },
            ],
            hotUnpaidVerifiedLeads: [
              {
                $match: {
                  isPaidAccount: false,
                  status: 'active',
                },
              },
              { $sort: { phoneVerified: -1, registeredAt: -1 } },
              { $limit: 25 },
              {
                $project: {
                  _id: 1,
                  companyName: 1,
                  contactPerson: 1,
                  username: 1,
                  phone: 1,
                  category: 1,
                  city: 1,
                  countryCode: 1,
                  currency: 1,
                  phoneVerified: 1,
                  dailySpend: 1,
                  registeredAt: 1,
                },
              },
            ],
            lowRunwayAtRisk: [
              {
                $match: {
                  isPaidAccount: true,
                  status: 'active',
                  runwayDays: { $lte: 2 },
                },
              },
              { $sort: { runwayDays: 1, paidTotal: -1 } },
              { $limit: 25 },
              {
                $project: {
                  _id: 1,
                  companyName: 1,
                  contactPerson: 1,
                  phone: 1,
                  category: 1,
                  city: 1,
                  currency: 1,
                  bal: 1,
                  dailySpend: 1,
                  paidTotal: 1,
                  runwayDays: 1,
                  campaignOn: 1,
                },
              },
            ],
            fundedByCategory: [
              {
                $match: { status: 'active' },
              },
              {
                $group: {
                  _id: { $ifNull: ['$category', 'Other'] },
                  totalClients: { $sum: 1 },
                  fundedClients: { $sum: { $cond: ['$isFundedToday', 1, 0] } },
                  totalAvailableWallet: { $sum: '$bal' },
                },
              },
              { $sort: { fundedClients: -1, totalClients: -1 } },
            ],
            fundedActiveClients: [
              {
                $match: {
                  status: 'active',
                  isFundedToday: true,
                },
              },
              {
                $project: {
                  _id: 1,
                  companyName: 1,
                  contactPerson: 1,
                  phone: 1,
                  category: 1,
                  city: 1,
                  bal: 1,
                  dailySpend: 1,
                  runwayDays: 1,
                  registeredAt: 1,
                },
              },
            ],
          },
        },
      ]),
      Lead.aggregate([
        { $match: { assignedAt: { $gte: since7d } } },
        {
          $group: {
            _id: { $ifNull: ['$category', 'Other'] },
            leads7d: { $sum: 1 },
          },
        },
      ]),
      Lead.distinct('customerId', { assignedAt: { $gte: since48h } }),
      OtpDeliveryLog.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            avgLatencyMs: { $avg: '$latencyMs' },
          },
        },
      ]),
      FcmToken.countDocuments({ isActive: true }),
      Notification.countDocuments({}),
      SecurityEventLog.aggregate([
        { $match: { createdAt: { $gte: since24h } } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
      ]),
      SecurityEventLog.find({}).sort({ createdAt: -1 }).limit(15).lean(),
    ]);

    const facet = customerWalletFacet[0] || {};
    const rawFunnel = facet.funnel?.[0] || {
      totalRegistered: 0,
      whatsappVerified: 0,
      profileCompleted: 0,
      paidActivated: 0,
      activeCampaigns: 0,
    };

    // OTP Telemetry rollup
    let otpTotalSent = 0;
    let otpDeliveredOrAccepted = 0;
    let otpFailed = 0;
    let latencyWeightedSum = 0;
    for (const row of otpTelemetryAgg) {
      const c = Number(row.count || 0);
      otpTotalSent += c;
      latencyWeightedSum += Number(row.avgLatencyMs || 0) * c;
      if (row._id === 'failed') otpFailed += c;
      else otpDeliveredOrAccepted += c;
    }
    const otpSuccessRatePct =
      otpTotalSent > 0 ? Number(((otpDeliveredOrAccepted / otpTotalSent) * 100).toFixed(1)) : 100;
    const otpAvgLatencyMs = otpTotalSent > 0 ? Math.round(latencyWeightedSum / otpTotalSent) : 0;

    // Build WhatsApp 1-click outreach URLs for unpaid drop-offs & low-runway clients
    const hotUnpaidVerifiedLeads = (facet.hotUnpaidVerifiedLeads || []).map((c) => {
      const e164 = c.countryCode === 'IN' || !c.countryCode ? `91${String(c.phone || '').slice(-10)}` : String(c.phone || '').replace(/\D/g, '');
      const msg = encodeURIComponent(
        `Hi ${c.contactPerson || c.companyName || 'there'}, welcome to AdMafia! Your business workspace (${c.companyName}) is verified. Activate your daily lead campaign starting at ${c.currency === 'USD' ? '$' : '₹'}${c.dailySpend}/day here: https://admafia.marketing/portal#wallet`
      );
      return {
        id: c._id,
        companyName: c.companyName,
        contactPerson: c.contactPerson,
        username: c.username,
        phone: c.phone,
        category: c.category,
        city: c.city,
        currency: c.currency || 'INR',
        phoneVerified: Boolean(c.phoneVerified),
        dailyMinBudget: c.dailySpend,
        registeredAt: c.registeredAt,
        whatsappOutreachUrl: `https://wa.me/${e164}?text=${msg}`,
      };
    });

    const lowRunwayAtRisk = (facet.lowRunwayAtRisk || []).map((c) => {
      const e164 = `91${String(c.phone || '').slice(-10)}`;
      const msg = encodeURIComponent(
        `Hi ${c.contactPerson || c.companyName}, your AdMafia Marketing Wallet balance is ₹${c.bal} (${c.runwayDays} day runway left). Recharge now so your inbound buyer leads continue without pause: https://admafia.marketing/portal#wallet`
      );
      return {
        id: c._id,
        companyName: c.companyName,
        contactPerson: c.contactPerson,
        phone: c.phone,
        category: c.category,
        city: c.city,
        currency: c.currency || 'INR',
        availableBalance: c.bal,
        dailyAdSpend: c.dailySpend,
        totalLifetimePaid: c.paidTotal,
        runwayDays: c.runwayDays,
        adCampaignActive: c.campaignOn,
        whatsappRemindUrl: `https://wa.me/${e164}?text=${msg}`,
      };
    });

    // Category Liquidity Matrix + Starved Funded Clients (0 leads in 48h)
    const leads7dMap = new Map(leads7dByCat.map((r) => [r._id, r.leads7d]));
    const categoryLiquidity = (facet.fundedByCategory || []).map((cat) => {
      const leads7d = leads7dMap.get(cat._id) || 0;
      const ratio = cat.fundedClients > 0 ? Number((leads7d / cat.fundedClients).toFixed(2)) : leads7d;
      return {
        category: cat._id,
        totalClients: cat.totalClients,
        fundedClients: cat.fundedClients,
        leadsDispatched7d: leads7d,
        leadsPerFundedClient7d: ratio,
        totalAvailableWallet: cat.totalAvailableWallet,
        supplyStatus:
          cat.fundedClients > 0 && leads7d === 0
            ? 'STARVED'
            : cat.fundedClients > 0 && ratio < 2
            ? 'LOW_SUPPLY'
            : 'HEALTHY',
      };
    });

    const recentLeadCustSet = new Set((recentLeads48hCustomerIds || []).map(String));
    const starvedPaidClients = (facet.fundedActiveClients || [])
      .filter((c) => !recentLeadCustSet.has(String(c._id)))
      .slice(0, 20)
      .map((c) => ({
        id: c._id,
        companyName: c.companyName,
        contactPerson: c.contactPerson,
        phone: c.phone,
        category: c.category,
        city: c.city,
        availableBalance: c.bal,
        dailyAdSpend: c.dailySpend,
        runwayDays: c.runwayDays,
      }));

    const secCounts = {};
    for (const s of securityAgg24h) {
      secCounts[s._id] = s.count;
    }

    res.json({
      ok: true,
      generatedAt: now.toISOString(),
      funnel: {
        otpChallengesSent: otpTotalSent,
        totalRegistered: rawFunnel.totalRegistered,
        whatsappVerified: rawFunnel.whatsappVerified,
        profileCompleted: rawFunnel.profileCompleted,
        paidActivated: rawFunnel.paidActivated,
        activeCampaigns: rawFunnel.activeCampaigns,
        signupToPaidConversionPct:
          rawFunnel.totalRegistered > 0
            ? Number(((rawFunnel.paidActivated / rawFunnel.totalRegistered) * 100).toFixed(1))
            : 0,
      },
      hotUnpaidVerifiedLeads,
      lowRunwayAtRisk,
      categoryLiquidity,
      starvedPaidClients,
      opsShield: {
        whatsappOtp: {
          totalDispatched: otpTotalSent,
          deliveredOrAccepted: otpDeliveredOrAccepted,
          failed: otpFailed,
          successRatePct: otpSuccessRatePct,
          avgLatencyMs: otpAvgLatencyMs,
        },
        firebaseFcm: {
          activeDeviceTokens: fcmActiveCount,
          totalNotificationsCreated: notificationsTotal,
        },
        security24h: {
          rateLimitsBlocked: secCounts.RATE_LIMIT || 0,
          otpLockouts: secCounts.OTP_LOCKOUT || 0,
          nosqlSanitized: secCounts.NOSQL_SANITIZED || 0,
          corsBlocked: secCounts.CORS_BLOCKED || 0,
          rbacDenied: secCounts.RBAC_DENIED || 0,
          authFailures: secCounts.AUTH_FAILURE || 0,
        },
        recentSecurityEvents: recentSecurityEvents.map((e) => ({
          id: String(e._id),
          category: e.category,
          ipAddress: e.ipAddress,
          path: e.path,
          method: e.method,
          detail: e.detail,
          createdAt: e.createdAt,
        })),
      },
    });
  } catch (err) {
    console.error('[GET /api/superadmin/growth-analytics]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default superadminOpsRouter;

