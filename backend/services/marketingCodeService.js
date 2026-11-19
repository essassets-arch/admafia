import mongoose from 'mongoose';
import { randomBytes, timingSafeEqual } from 'crypto';
import { Customer, Wallet, MarketingCampaign } from '../models/index.js';

const SystemCounterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 },
    secretValue: { type: String, default: '' },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: 'system_counters', versionKey: false }
);

export const SystemCounter =
  mongoose.models.SystemCounter || mongoose.model('SystemCounter', SystemCounterSchema);

function isTestCustomerDoc(c) {
  if (!c) return true;
  const u = String(c.username || '').toLowerCase().replace(/^@/, '').trim();
  const p = String(c.phone || '').replace(/\D/g, '').slice(-10);
  const e = String(c.email || '').toLowerCase().trim();
  const id = String(c._id || c.id || '').toLowerCase().trim();
  if (u === 'abc' || u === 'xxx') return true;
  if (p === '7383198428' || p === '1111111111') return true;
  if (e === 'aviralshukla2612@gmail.com') return true;
  if (id.includes('7383198428') || id.includes('1111111111')) return true;
  return false;
}

export function formatAmmCode(seqNum) {
  const n = Math.max(1, Math.floor(Number(seqNum) || 1));
  return `#AMM${String(n).padStart(2, '0')}`;
}

export function parseAmmSeqNumber(codeStr) {
  const raw = String(codeStr || '').trim();
  const m = raw.match(/^#?\s*AMM[-_\s]*0*(\d+)$/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

export function normalizeMarketingCode(rawCode) {
  const trimmed = String(rawCode || '').trim();
  if (!trimmed) return '';
  const seq = parseAmmSeqNumber(trimmed);
  if (seq !== null) return formatAmmCode(seq);
  return trimmed.startsWith('#') ? trimmed.toUpperCase() : trimmed.toUpperCase();
}

/**
 * Extracts `#AMM01` style marketing code from free-form text (e.g. WhatsApp message, ad title, UTM, chatbot payload).
 */
export function extractMarketingCodeFromText(rawText) {
  const str = String(rawText || '');
  if (!str) return null;
  const match = str.match(/#?\bAMM[-_\s]*0*(\d+)\b/i);
  if (match && match[1]) {
    const seq = Number(match[1]);
    if (Number.isFinite(seq) && seq >= 1) {
      return formatAmmCode(seq);
    }
  }
  return null;
}

let counterFloorSynced = false;

async function ensureCounterFloor() {
  if (counterFloorSynced) return;
  const existing = await Customer.find(
    { marketingCode: { $nin: [null, ''] } },
    { marketingCode: 1 }
  ).lean();
  let maxSeq = 0;
  for (const doc of existing) {
    const n = parseAmmSeqNumber(doc.marketingCode);
    if (n && n > maxSeq) maxSeq = n;
  }
  if (maxSeq > 0) {
    await SystemCounter.updateOne(
      { _id: 'amm_marketing_code' },
      { $max: { seq: maxSeq }, $setOnInsert: { secretValue: '' }, $set: { updatedAt: new Date() } },
      { upsert: true }
    );
  }
  counterFloorSynced = true;
}

/**
 * Atomically allocates the next unique `#AMM01`, `#AMM02`, `#AMM03`... code.
 */
export async function allocateNextMarketingCode(session = null) {
  await ensureCounterFloor().catch(() => {});

  for (let attempt = 0; attempt < 25; attempt++) {
    const doc = await SystemCounter.findOneAndUpdate(
      { _id: 'amm_marketing_code' },
      {
        $inc: { seq: 1 },
        $set: { updatedAt: new Date() },
      },
      { upsert: true, new: true, ...(session ? { session } : {}) }
    ).lean();

    const candidate = formatAmmCode(doc?.seq || 1);
    const conflict = await Customer.exists({
      marketingCode: { $in: [candidate, candidate.replace(/^#/, '')] },
    }).session(session || null);
    if (!conflict) {
      return candidate;
    }
  }
  return formatAmmCode(Date.now() % 10000);
}

/**
 * Startup backfill: assigns `#AMM01`, `#AMM02`, `#AMM03`... in chronological registration order
 * to all existing customers missing a marketingCode, and syncs Wallet + MarketingCampaign.
 */
export async function backfillMissingMarketingCodes() {
  const allCustomers = await Customer.find({ status: { $ne: 'deleted' } })
    .sort({ registeredAt: 1, _id: 1 })
    .lean();

  const realCustomers = allCustomers.filter((c) => !isTestCustomerDoc(c));
  let maxSeq = 0;
  const usedCodes = new Set();

  // First pass: normalize any existing valid #AMM codes (`AMM1` -> `#AMM01`) & find max sequence
  let normalizedCount = 0;
  for (const c of realCustomers) {
    const raw = String(c.marketingCode || '').trim();
    if (!raw) continue;
    const seq = parseAmmSeqNumber(raw);
    if (seq === null) continue; // Legacy non-#AMM strings will be upgraded to #AMMxx in pass 2
    const norm = formatAmmCode(seq);
    if (seq > maxSeq) maxSeq = seq;
    usedCodes.add(norm);
    if (norm !== raw) {
      const now = new Date();
      await Promise.all([
        Customer.updateOne({ _id: c._id }, { $set: { marketingCode: norm, updatedAt: now } }),
        Wallet.updateOne({ customerId: c._id }, { $set: { marketingCode: norm, updatedAt: now } }),
        MarketingCampaign.updateMany(
          { customerId: c._id },
          { $set: { marketingCode: norm, externalCampaignId: norm, updatedAt: now } }
        ),
      ]);
      normalizedCount += 1;
    }
  }

  await SystemCounter.updateOne(
    { _id: 'amm_marketing_code' },
    { $max: { seq: maxSeq }, $set: { updatedAt: new Date() } },
    { upsert: true }
  );
  counterFloorSynced = true;

  // Second pass: assign sequential `#AMM01`, `#AMM02`... to customers missing a code OR holding legacy non-#AMM strings
  let assignedCount = 0;
  for (const c of realCustomers) {
    const raw = String(c.marketingCode || '').trim();
    const existingAmmSeq = parseAmmSeqNumber(raw);
    if (existingAmmSeq !== null) {
      const norm = formatAmmCode(existingAmmSeq);
      await Promise.all([
        Wallet.updateOne({ customerId: c._id }, { $set: { marketingCode: norm } }),
        MarketingCampaign.updateMany(
          { customerId: c._id },
          { $set: { marketingCode: norm, externalCampaignId: norm } }
        ),
      ]);
      continue;
    }

    const nextCode = await allocateNextMarketingCode(null);
    usedCodes.add(nextCode);
    const now = new Date();
    await Promise.all([
      Customer.updateOne({ _id: c._id }, { $set: { marketingCode: nextCode, updatedAt: now } }),
      Wallet.updateOne({ customerId: c._id }, { $set: { marketingCode: nextCode, updatedAt: now } }),
      MarketingCampaign.updateMany(
        { customerId: c._id },
        { $set: { marketingCode: nextCode, externalCampaignId: nextCode, updatedAt: now } }
      ),
    ]);
    assignedCount += 1;
  }

  return { assignedCount, normalizedCount, totalCustomers: realCustomers.length };
}

/**
 * Resolves a Customer by `#AMM01` / `AMM01` / `amm-1` marketing code (checks Customer, Wallet, MarketingCampaign).
 */
export async function findCustomerByMarketingCode(rawInput) {
  const directNorm = normalizeMarketingCode(rawInput);
  const extracted = extractMarketingCodeFromText(rawInput);
  const targetCode = extracted || directNorm;
  if (!targetCode) return null;

  const bare = targetCode.replace(/^#/, '');
  const regexVariants = [
    new RegExp(`^#?\\s*${bare.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
  ];
  const seq = parseAmmSeqNumber(targetCode);
  if (seq !== null) {
    regexVariants.push(new RegExp(`^#?\\s*AMM[-_\\s]*0*${seq}$`, 'i'));
  }

  let cust = await Customer.findOne({
    status: { $ne: 'deleted' },
    $or: regexVariants.map((re) => ({ marketingCode: re })),
  }).lean();

  if (!cust) {
    const camp = await MarketingCampaign.findOne({
      $or: regexVariants.map((re) => ({ marketingCode: re })),
    })
      .sort({ updatedAt: -1 })
      .lean();
    if (camp?.customerId) {
      cust = await Customer.findById(camp.customerId).lean();
    }
  }

  if (!cust) {
    const wal = await Wallet.findOne({
      $or: regexVariants.map((re) => ({ marketingCode: re })),
    }).lean();
    if (wal?.customerId) {
      cust = await Customer.findById(wal.customerId).lean();
    }
  }

  return cust ? { customer: cust, matchedCode: cust.marketingCode || targetCode } : null;
}

/**
 * Persistent Chatbot Webhook API Key (env override or auto-generated in MongoDB `system_counters`).
 */
export async function getOrCreateChatbotWebhookSecret() {
  const envSecret = String(
    process.env.CHATBOT_WEBHOOK_SECRET || process.env.WEBHOOK_API_KEY || ''
  ).trim();
  if (envSecret) {
    return { secret: envSecret, source: 'env' };
  }

  const existing = await SystemCounter.findById('chatbot_webhook_secret').lean();
  if (existing?.secretValue) {
    return { secret: existing.secretValue, source: 'database' };
  }

  const generated = `amk_live_${randomBytes(18).toString('hex')}`;
  const saved = await SystemCounter.findOneAndUpdate(
    { _id: 'chatbot_webhook_secret' },
    {
      $setOnInsert: {
        seq: 1,
        secretValue: generated,
        updatedAt: new Date(),
      },
    },
    { upsert: true, new: true }
  ).lean();

  return { secret: saved?.secretValue || generated, source: 'database' };
}

export async function rotateChatbotWebhookSecret() {
  const envSecret = String(
    process.env.CHATBOT_WEBHOOK_SECRET || process.env.WEBHOOK_API_KEY || ''
  ).trim();
  if (envSecret) {
    return {
      secret: envSecret,
      source: 'env',
      rotated: false,
      note: 'Secret is pinned in CHATBOT_WEBHOOK_SECRET environment variable.',
    };
  }
  const nextSecret = `amk_live_${randomBytes(18).toString('hex')}`;
  await SystemCounter.findOneAndUpdate(
    { _id: 'chatbot_webhook_secret' },
    {
      $inc: { seq: 1 },
      $set: { secretValue: nextSecret, updatedAt: new Date() },
    },
    { upsert: true, new: true }
  );
  return { secret: nextSecret, source: 'database', rotated: true };
}

export async function verifyChatbotWebhookSecret(candidate) {
  const given = String(candidate || '').trim();
  if (!given) return false;
  const { secret } = await getOrCreateChatbotWebhookSecret();
  if (!secret) return false;
  const a = Buffer.from(given, 'utf8');
  const b = Buffer.from(secret, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
