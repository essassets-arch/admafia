import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';
import {
  Customer,
  Wallet,
  WalletTransaction,
  PaymentRecord,
  DailyAdSpendLog,
  Lead,
  MarketingCampaign,
  MarketingPost,
  SuperAdminAuditLog,
} from '../models/index.js';
import {
  attachOptionalAuth,
  requireStaff,
  requireSuperAdmin,
  requireCustomerSelfOrStaff,
} from '../middleware/authMiddleware.js';
import { withMongoTransaction, genId } from '../repositories/tx.js';
import { recordOutboxEvent } from '../services/outboxWorker.js';
import {
  normalizeMarketingCode,
  extractMarketingCodeFromText,
  findCustomerByMarketingCode,
  getOrCreateChatbotWebhookSecret,
  rotateChatbotWebhookSecret,
  verifyChatbotWebhookSecret,
} from '../services/marketingCodeService.js';

export const operationsCycleRouter = express.Router();

const DAY_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function getKolkataNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
}

function toIstIsoDate(dateInput) {
  if (!dateInput) return '';
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
    return dateInput.trim();
  }
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function addDaysToIso(baseIso, offsetDays) {
  const [y, m, d] = baseIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + offsetDays, 12, 0, 0));
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getDayMetaFromIso(iso, todayIso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dayCode = DAY_CODES[dt.getUTCDay()];
  const shortDate = dt.toLocaleDateString('en-IN', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
  });
  const fullLabel = dt.toLocaleDateString('en-IN', {
    timeZone: 'UTC',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const tomorrowIso = addDaysToIso(todayIso, 1);
  const dayAfterIso = addDaysToIso(todayIso, 2);
  return {
    dateIso: iso,
    dayCode,
    shortDate,
    fullLabel,
    isToday: iso === todayIso,
    isTomorrow: iso === tomorrowIso,
    isDayAfter: iso === dayAfterIso,
    isPast: iso < todayIso,
    isFuture: iso > todayIso,
  };
}

function istDayBoundsUtc(dateIso) {
  // IST is UTC+05:30
  const startUtc = new Date(`${dateIso}T00:00:00.000+05:30`);
  const endUtc = new Date(`${dateIso}T23:59:59.999+05:30`);
  return { startUtc, endUtc };
}

function isInternalTestAccount(c) {
  if (!c) return true;
  const u = String(c.username || '').toLowerCase().replace(/^@/, '').trim();
  const p = String(c.phone || '').replace(/\D/g, '').slice(-10);
  const e = String(c.email || '').toLowerCase().trim();
  const n = String(c.companyName || '').toLowerCase().trim();
  const id = String(c._id || '').toLowerCase().trim();
  if (u === 'abc' || u === 'xxx') return true;
  if (p === '7383198428' || p === '1111111111') return true;
  if (e === 'aviralshukla2612@gmail.com') return true;
  if (n === 'abc' || n === 'xxx') return true;
  if (id.includes('7383198428') || id.includes('1111111111')) return true;
  return false;
}

function resolveEffectiveMediaUrl(post) {
  if (!post) return '';
  if (post.mediaUrl && String(post.mediaUrl).trim()) return String(post.mediaUrl).trim();
  const revs = Array.isArray(post.revisions) ? post.revisions : [];
  let best = null;
  for (const r of revs) {
    if (!best || Number(r.revisionNumber || 0) >= Number(best.revisionNumber || 0)) {
      best = r;
    }
  }
  return (best && best.artworkUrl) || '';
}

/**
 * Determines which exact ISO dates (from todayIso up to +21 days, plus any past booked dates)
 * a customer is funded/booked to run on.
 */
function computeCustomerEffectiveDates(wallet, todayIso) {
  const bookedSet = new Set(
    (Array.isArray(wallet?.bookedDates) ? wallet.bookedDates : [])
      .map((s) => String(s || '').trim())
      .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s))
  );

  if (wallet?.lastDeductedAt) {
    const lastIso = toIstIsoDate(wallet.lastDeductedAt);
    if (lastIso === todayIso) bookedSet.add(todayIso);
  }

  const currency = String(wallet?.currency || 'INR').toUpperCase();
  const dailyBudget = Math.max(1, Number(wallet?.dailyAdSpend || (currency === 'INR' ? 300 : 10)));
  const balance = Math.max(0, Number(wallet?.availableBalance || 0));
  const fundedRunwayDays = Math.floor(balance / dailyBudget);

  const effectiveScheduledSet = new Set(bookedSet);
  const preset = String(wallet?.schedulePreset || 'custom').toLowerCase();

  if (preset === 'clear' || fundedRunwayDays <= 0) {
    return {
      bookedSet,
      effectiveScheduledSet,
      fundedRunwayDays,
      dailyBudget,
      balance,
    };
  }

  const explicitIso = (Array.isArray(wallet?.scheduledDates) ? wallet.scheduledDates : [])
    .map((s) => String(s || '').trim())
    .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && s >= todayIso && !bookedSet.has(s))
    .sort();

  if (explicitIso.length > 0) {
    let slotsUsed = 0;
    for (const iso of explicitIso) {
      if (slotsUsed >= fundedRunwayDays) break;
      effectiveScheduledSet.add(iso);
      slotsUsed += 1;
    }
  } else {
    // Backward-compatible weekday projection when client used activeDays
    const activeCodes = new Set(
      (Array.isArray(wallet?.activeDays) ? wallet.activeDays : [])
        .map((d) => String(d || '').trim().toUpperCase())
        .filter(Boolean)
    );
    if (activeCodes.size > 0) {
      let slotsUsed = 0;
      for (let offset = 0; offset < 14 && slotsUsed < fundedRunwayDays; offset++) {
        const candidateIso = addDaysToIso(todayIso, offset);
        if (bookedSet.has(candidateIso)) continue;
        const meta = getDayMetaFromIso(candidateIso, todayIso);
        if (activeCodes.has(meta.dayCode)) {
          effectiveScheduledSet.add(candidateIso);
          slotsUsed += 1;
        }
      }
    }
  }

  return {
    bookedSet,
    effectiveScheduledSet,
    fundedRunwayDays,
    dailyBudget,
    balance,
  };
}

function diffMinutes(fromDate, toDate = new Date()) {
  if (!fromDate) return 0;
  const d = new Date(fromDate);
  if (Number.isNaN(d.getTime())) return 0;
  return Math.max(0, Math.round((toDate.getTime() - d.getTime()) / 60000));
}

function formatDurationShort(mins) {
  if (!mins || mins < 1) return '<1m';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hrs < 24) return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
  const days = Math.floor(hrs / 24);
  const remH = hrs % 24;
  return remH > 0 ? `${days}d ${remH}h` : `${days}d`;
}

// =============================================================================
// 1. GET /api/ops/active-schedule
//    Synchronized Active Leads & Campaign Schedule for Sales, Marketing & Super Admin
// =============================================================================
operationsCycleRouter.get(
  '/ops/active-schedule',
  requireStaff(['sales', 'marketing', 'super admin']),
  async (req, res) => {
    try {
      const actorRole = String(req.auth?.role || '').toLowerCase();
      const isSuperAdmin = actorRole === 'super admin';
      const isMarketing = actorRole.includes('marketing') || isSuperAdmin;
      const isSales = actorRole.includes('sales') || isSuperAdmin;

      const kolkataNow = getKolkataNow();
      const todayIso = toIstIsoDate(kolkataNow);
      const requestedDate = String(req.query.date || '').trim();
      const targetDateIso = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : todayIso;
      const targetMeta = getDayMetaFromIso(targetDateIso, todayIso);
      const { startUtc, endUtc } = istDayBoundsUtc(targetDateIso);
      const isAfter2PmIst = kolkataNow.getHours() >= 14;
      const realNow = new Date();

      const [rawCustomers, wallets, campaigns, posts, leadsOnDate, allLeadCounts, spendLogsOnDate, debitTxsOnDate] =
        await Promise.all([
          Customer.find({ status: { $ne: 'deleted' } }).lean(),
          Wallet.find({}).lean(),
          MarketingCampaign.find({}).sort({ updatedAt: -1 }).lean(),
          MarketingPost.find({ isDeleted: { $ne: true } }).sort({ updatedAt: -1 }).lean(),
          Lead.find({
            $or: [
              { assignedAt: { $gte: startUtc, $lte: endUtc } },
              { createdAt: { $gte: startUtc, $lte: endUtc } },
            ],
          })
            .select('customerId assignedAt createdAt')
            .lean(),
          Lead.aggregate([{ $group: { _id: '$customerId', count: { $sum: 1 } } }]),
          DailyAdSpendLog.find({ dateIso: targetDateIso }).lean(),
          WalletTransaction.find({
            txType: 'Debit',
            createdAt: { $gte: startUtc, $lte: endUtc },
          })
            .select('customerId amount')
            .lean(),
        ]);

      const customers = rawCustomers.filter((c) => !isInternalTestAccount(c));
      const walletByCust = new Map(wallets.map((w) => [String(w.customerId), w]));
      const totalLeadsByCust = new Map(allLeadCounts.map((x) => [String(x._id), x.count]));
      const spendByCust = new Map(spendLogsOnDate.map((s) => [String(s.customerId), s]));
      const debitAmtByCust = new Map();
      for (const tx of debitTxsOnDate) {
        const cid = String(tx.customerId);
        debitAmtByCust.set(cid, (debitAmtByCust.get(cid) || 0) + Number(tx.amount || 0));
      }

      const dateLeadsByCust = new Map();
      const lastLeadAtByCust = new Map();
      for (const l of leadsOnDate) {
        const cid = String(l.customerId);
        dateLeadsByCust.set(cid, (dateLeadsByCust.get(cid) || 0) + 1);
        const ts = l.assignedAt || l.createdAt;
        const prev = lastLeadAtByCust.get(cid);
        if (ts && (!prev || new Date(ts) > new Date(prev))) {
          lastLeadAtByCust.set(cid, ts);
        }
      }

      const campsByCust = new Map();
      for (const cm of campaigns) {
        const cid = String(cm.customerId);
        if (!campsByCust.has(cid)) campsByCust.set(cid, []);
        campsByCust.get(cid).push(cm);
      }

      const postsByCust = new Map();
      const postById = new Map();
      for (const p of posts) {
        const pid = String(p._id);
        postById.set(pid, p);
        const cid = String(p.customerId);
        if (!postsByCust.has(cid)) postsByCust.set(cid, []);
        postsByCust.get(cid).push(p);
      }

      // Build 7-day forecast strip (Today through +6 days)
      const scheduleCacheByCust = new Map();
      for (const c of customers) {
        const cid = String(c._id);
        scheduleCacheByCust.set(cid, computeCustomerEffectiveDates(walletByCust.get(cid), todayIso));
      }

      const forecast7d = [];
      for (let i = 0; i < 7; i++) {
        const fIso = addDaysToIso(todayIso, i);
        const fMeta = getDayMetaFromIso(fIso, todayIso);
        let count = 0;
        let totalBudget = 0;
        for (const c of customers) {
          if (c.status === 'suspended') continue;
          const sched = scheduleCacheByCust.get(String(c._id));
          if (sched && sched.effectiveScheduledSet.has(fIso)) {
            count += 1;
            totalBudget += sched.dailyBudget;
          }
        }
        forecast7d.push({
          ...fMeta,
          scheduledClientsCount: count,
          totalScheduledBudget: totalBudget,
        });
      }

      // Build rows for targetDateIso (plus option to include all funded clients if requested)
      const includeAll = String(req.query.includeAll || '') === '1';
      const rows = [];

      let totalScheduledBudget = 0;
      let totalBookedSettledBudget = 0;
      let campaignsRunningCount = 0;
      let campaignsDelayedCount = 0;
      let totalLeadsDeliveredOnDate = 0;
      let zeroLeadActiveClientsCount = 0;
      let totalActualAdSpendOnDate = 0;
      let totalTargetMarketingBudgetOnDate = 0;
      let pendingSpendEntriesCount = 0;
      let overSpentLossClientsCount = 0;

      for (const c of customers) {
        if (c.status === 'suspended') continue;
        const cid = String(c._id);
        const w = walletByCust.get(cid) || null;
        const sched = scheduleCacheByCust.get(cid);
        const isBookedOnDate = sched.bookedSet.has(targetDateIso) || (debitAmtByCust.get(cid) || 0) > 0;
        const isScheduledOnDate = isBookedOnDate || sched.effectiveScheduledSet.has(targetDateIso);

        if (!includeAll && !isScheduledOnDate) continue;

        const custCamps = campsByCust.get(cid) || [];
        const runningCamp = custCamps.find((x) => x.status === 'Running') || null;
        const primaryCamp = runningCamp || custCamps[0] || null;

        const custPosts = postsByCust.get(cid) || [];
        const approvedPosts = custPosts.filter(
          (p) => p.status === 'Approved' && Boolean(resolveEffectiveMediaUrl(p))
        );
        const pendingGraphicsPosts = custPosts.filter((p) =>
          ['Pending Graphics', 'Draft', 'In Progress', 'Changes Requested', 'Rejected'].includes(p.status)
        );
        const pendingReviewPosts = custPosts.filter((p) => p.status === 'Pending Verification');

        const activePost =
          (primaryCamp?.postId && postById.get(String(primaryCamp.postId))) ||
          approvedPosts[0] ||
          custPosts[0] ||
          null;

        const leadsSentToday = dateLeadsByCust.get(cid) || 0;
        const isCampaignLive = Boolean(runningCamp);
        const dailyBudget = sched.dailyBudget;
        const billedAmountOnDate =
          debitAmtByCust.get(cid) || (isBookedOnDate ? dailyBudget : 0);

        // Compute stage delays for this client
        const delayAlerts = [];
        if (targetDateIso === todayIso && isScheduledOnDate && !isCampaignLive) {
          delayAlerts.push({
            code: 'CAMPAIGN_OFF_TODAY',
            department: 'Marketing',
            severity: 'critical',
            label: 'Scheduled Today — Campaign OFF',
          });
        }
        if (isScheduledOnDate && custPosts.length === 0) {
          const baseRef = w?.lastScheduleUpdatedAt || c.registeredAt;
          const waitMins = diffMinutes(baseRef, realNow);
          if (targetDateIso === todayIso || waitMins >= 120) {
            delayAlerts.push({
              code: 'CREATIVE_BRIEF_MISSING',
              department: 'Marketing',
              severity: targetDateIso === todayIso ? 'critical' : 'warning',
              label:
                targetDateIso > todayIso
                  ? 'Upcoming Schedule — Needs Creative Brief'
                  : `No Creative Brief (${formatDurationShort(waitMins)})`,
            });
          }
        }
        for (const pg of pendingGraphicsPosts) {
          const waitMins = diffMinutes(pg.requestedAt || pg.createdAt, realNow);
          const threshold = pg.priority === 'Urgent' ? 120 : 240;
          if (waitMins >= threshold) {
            delayAlerts.push({
              code: 'GRAPHICS_TURNAROUND_DELAY',
              department: 'Graphics',
              severity: 'warning',
              label: `Graphics Waiting ${formatDurationShort(waitMins)}`,
            });
            break;
          }
        }
        for (const pr of pendingReviewPosts) {
          const waitMins = diffMinutes(pr.artworkUploadedAt || pr.submittedAt || pr.updatedAt, realNow);
          if (waitMins >= 60) {
            delayAlerts.push({
              code: 'MARKETING_REVIEW_DELAY',
              department: 'Marketing',
              severity: 'warning',
              label: `Artwork Unreviewed (${formatDurationShort(waitMins)})`,
            });
            break;
          }
        }
        if (targetDateIso === todayIso && (isBookedOnDate || isCampaignLive) && leadsSentToday === 0) {
          delayAlerts.push({
            code: 'ZERO_LEADS_TODAY',
            department: 'Sales',
            severity: isAfter2PmIst ? 'critical' : 'info',
            label: isAfter2PmIst ? '0 Leads Sent After 2 PM IST' : '0 Leads Dispatched Yet Today',
          });
        }
        if (targetDateIso > todayIso && isScheduledOnDate && approvedPosts.length === 0) {
          delayAlerts.push({
            code: 'ADVANCE_PREP_NEEDED',
            department: 'Marketing / Graphics',
            severity: 'warning',
            label: '0 Approved Creatives for Upcoming Date',
          });
        }

        if (isScheduledOnDate) {
          totalScheduledBudget += dailyBudget;
          if (isBookedOnDate) totalBookedSettledBudget += dailyBudget;
          if (isCampaignLive) campaignsRunningCount += 1;
          else campaignsDelayedCount += 1;
          totalLeadsDeliveredOnDate += leadsSentToday;
          if (leadsSentToday === 0) zeroLeadActiveClientsCount += 1;
        }

        // Default 50% Ad Spend Preset calculation (STRICTLY CONFIDENTIAL — Marketing & Super Admin ONLY)
        const ratioPct = Number(w?.defaultSpendRatioPct ?? 50);
        const spendDoc = spendByCust.get(cid) || null;
        const presetSpendAmount = Math.round((dailyBudget * ratioPct) / 100);
        const effectiveActualSpend = spendDoc
          ? Number(spendDoc.actualSpend || 0)
          : isScheduledOnDate
            ? presetSpendAmount
            : 0;

        const isSpendPresetRow = !spendDoc || Boolean(spendDoc.isPreset);
        if (isScheduledOnDate) {
          totalActualAdSpendOnDate += effectiveActualSpend;
          totalTargetMarketingBudgetOnDate += presetSpendAmount;
          if (targetDateIso <= todayIso && isSpendPresetRow) {
            pendingSpendEntriesCount += 1;
          }
          if (effectiveActualSpend > dailyBudget) {
            overSpentLossClientsCount += 1;
          }
        }

        const resolvedMarketingCode = normalizeMarketingCode(
          (runningCamp && runningCamp.marketingCode) ||
            c.marketingCode ||
            (w && w.marketingCode) ||
            ''
        );

        const rowObj = {
          id: cid,
          customerId: cid,
          username: c.username || '',
          companyName: c.companyName || c.contactPerson || 'Client Workspace',
          contactPerson: c.contactPerson || c.companyName || '',
          phone: c.phone || '',
          email: c.email || '',
          category: c.category || '',
          city: c.city || '',
          state: c.state || '',
          profileStatus: c.profileStatus || 'incomplete',
          kycPercent: Number(c.kycPercent || 0),
          currency: String(w?.currency || c.currency || 'INR').toUpperCase(),
          dailyBudget,
          walletBalance: sched.balance,
          runwayDays: sched.fundedRunwayDays,
          isScheduledOnDate,
          isBookedOnDate,
          adCampaignActive: Boolean(w?.adCampaignActive),
          scheduledDates: Array.from(sched.effectiveScheduledSet).sort(),
          bookedDates: Array.from(sched.bookedSet).sort(),
          lastScheduleUpdatedAt: w?.lastScheduleUpdatedAt || null,
          // Campaign & Creative closed-loop state
          campaignId: primaryCamp ? String(primaryCamp._id) : null,
          campaignName: primaryCamp ? (primaryCamp.campaignName || primaryCamp.name || '') : null,
          campaignStatus: runningCamp ? 'Running' : primaryCamp ? primaryCamp.status : 'Not Created',
          isCampaignLive,
          marketingCode: resolvedMarketingCode || null,
          approvedPostsCount: approvedPosts.length,
          pendingGraphicsCount: pendingGraphicsPosts.length,
          pendingReviewCount: pendingReviewPosts.length,
          activeCreativeId: activePost ? String(activePost._id) : null,
          activeCreativeTitle: activePost ? activePost.title : null,
          activeCreativeUrl: activePost ? resolveEffectiveMediaUrl(activePost) : '',
          activeCreativeMediaType: activePost ? activePost.mediaType || 'image' : 'image',
          activeCreativeStatus: activePost ? activePost.status : 'No Creative',
          // Lead fulfillment
          leadsDeliveredOnDate: leadsSentToday,
          totalLeadsLifetime: totalLeadsByCust.get(cid) || 0,
          lastLeadSentAt: lastLeadAtByCust.get(cid) || null,
          // Bottleneck / Delay alerts
          isDelayed: delayAlerts.some((d) => d.severity === 'critical' || d.severity === 'warning'),
          delayAlerts,
        };

        // Sales-scoped follow-up remarks
        if (isSales) {
          rowObj.salesRemarks = Array.isArray(c.salesRemarks) ? c.salesRemarks : [];
          rowObj.latestSalesRemark = c.latestSalesRemark || '';
          rowObj.latestSalesRemarkAt = c.latestSalesRemarkAt || null;
          rowObj.latestSalesRemarkBy = c.latestSalesRemarkBy || '';
          rowObj.nextFollowUpAt = c.nextFollowUpAt || null;
          rowObj.followUpStatus = c.followUpStatus || 'none';
        }

        // Marketing & Super Admin ONLY: Actual Ad Spend (50% preset default)
        if (isMarketing) {
          rowObj.actualAdSpend = effectiveActualSpend;
          rowObj.presetAdSpend = presetSpendAmount;
          rowObj.targetMarketingBudget = presetSpendAmount;
          rowObj.spendRatioPct = ratioPct;
          rowObj.isSpendPreset = isSpendPresetRow;
          rowObj.isOverTargetSpend = effectiveActualSpend > presetSpendAmount;
          rowObj.isLossOverClientBudget = effectiveActualSpend > dailyBudget;
          rowObj.spendPlatform = spendDoc?.platformChannel || 'Meta / Digital Ads';
          rowObj.spendUpdatedBy = spendDoc?.updatedBy || null;
          rowObj.spendUpdatedAt = spendDoc?.updatedAt || null;
        }

        // Super Admin ONLY: Net Margin & Profit
        if (isSuperAdmin) {
          const earnedBase = isBookedOnDate ? billedAmountOnDate || dailyBudget : dailyBudget;
          rowObj.clientBilledOnDate = billedAmountOnDate;
          rowObj.netProfitOnDate = earnedBase - effectiveActualSpend;
          rowObj.isOverSpentLoss = earnedBase - effectiveActualSpend < 0;
          rowObj.marginPctOnDate =
            earnedBase > 0 ? Math.round(((earnedBase - effectiveActualSpend) / earnedBase) * 1000) / 10 : 0;
        }

        rows.push(rowObj);
      }

      // Sort: Critical delays first, then Paid/Booked on date, then highest budget
      rows.sort((a, b) => {
        const aCrit = a.delayAlerts.some((d) => d.severity === 'critical') ? 1 : 0;
        const bCrit = b.delayAlerts.some((d) => d.severity === 'critical') ? 1 : 0;
        if (bCrit !== aCrit) return bCrit - aCrit;
        if (Number(b.isBookedOnDate) !== Number(a.isBookedOnDate)) {
          return Number(b.isBookedOnDate) - Number(a.isBookedOnDate);
        }
        return b.dailyBudget - a.dailyBudget;
      });

      const summaryPayload = {
        targetDateIso,
        todayIso,
        dayLabel: targetMeta.fullLabel,
        isToday: targetMeta.isToday,
        isTomorrow: targetMeta.isTomorrow,
        isDayAfter: targetMeta.isDayAfter,
        scheduledClientsCount: rows.filter((r) => r.isScheduledOnDate).length,
        tomorrowScheduledCount: forecast7d[1]?.scheduledClientsCount || 0,
        tomorrowScheduledBudget: forecast7d[1]?.totalScheduledBudget || 0,
        totalScheduledBudget,
        totalBookedSettledBudget,
        campaignsRunningCount,
        campaignsDelayedCount,
        totalLeadsDeliveredOnDate,
        zeroLeadActiveClientsCount,
      };

      if (isMarketing) {
        summaryPayload.totalActualAdSpendOnDate = totalActualAdSpendOnDate;
        summaryPayload.totalTargetMarketingBudgetOnDate = totalTargetMarketingBudgetOnDate;
        summaryPayload.pendingSpendEntriesCount = pendingSpendEntriesCount;
      }
      if (isSuperAdmin) {
        summaryPayload.estimatedNetMarginOnDate = totalScheduledBudget - totalActualAdSpendOnDate;
        summaryPayload.overSpentLossClientsCount = overSpentLossClientsCount;
      }

      return res.json({
        ok: true,
        summary: summaryPayload,
        forecast7d,
        clients: rows,
      });
    } catch (err) {
      console.error('[GET /api/ops/active-schedule]', err);
      return res.status(500).json({ ok: false, error: err.message });
    }
  }
);

// =============================================================================
// 2. PUT /api/ops/ad-spend & POST /api/ops/ad-spend/apply-presets
//    Marketing & Super Admin Actual Ad Spend Entry (50% Default Preset)
//    STRICTLY STAFF-ONLY — NEVER EXPOSED TO CLIENTS
// =============================================================================
operationsCycleRouter.put(
  '/ops/ad-spend',
  requireStaff(['marketing', 'super admin']),
  async (req, res) => {
    try {
      const {
        customerId,
        dateIso,
        actualSpend,
        platformChannel = 'Meta / Digital Ads',
        notes = '',
        useDefaultPreset = false,
      } = req.body || {};

      const cleanCustId = String(customerId || '').trim();
      if (!cleanCustId) {
        return res.status(400).json({ ok: false, error: 'customerId is required.' });
      }

      const todayIso = toIstIsoDate(getKolkataNow());
      const cleanDateIso = /^\d{4}-\d{2}-\d{2}$/.test(String(dateIso || '').trim())
        ? String(dateIso).trim()
        : todayIso;

      const wallet = await Wallet.findOne({ customerId: cleanCustId }).lean();
      if (!wallet) {
        return res.status(404).json({ ok: false, error: 'Customer wallet not found.' });
      }

      const dailyBudget = Number(wallet.dailyAdSpend || 300);
      const ratioPct = Number(wallet.defaultSpendRatioPct ?? 50);
      const computedSpend = useDefaultPreset
        ? Math.round((dailyBudget * ratioPct) / 100)
        : Math.max(0, Math.round(Number(actualSpend) * 100) / 100);

      if (!Number.isFinite(computedSpend) || computedSpend < 0) {
        return res.status(400).json({ ok: false, error: 'Please enter a valid spend amount (>= 0).' });
      }

      const { startUtc, endUtc } = istDayBoundsUtc(cleanDateIso);
      const debitTxs = await WalletTransaction.find({
        customerId: cleanCustId,
        txType: 'Debit',
        createdAt: { $gte: startUtc, $lte: endUtc },
      })
        .select('amount')
        .lean();
      const billedToday = debitTxs.reduce((s, t) => s + Number(t.amount || 0), 0) || dailyBudget;

      const actorName = String(req.auth?.fullName || req.auth?.username || 'Marketing Ops').trim();
      const actorRole = String(req.auth?.role || 'Marketing').trim();
      const docId = `${cleanCustId}_${cleanDateIso}`;
      const now = new Date();

      await DailyAdSpendLog.findOneAndUpdate(
        { _id: docId },
        {
          $set: {
            customerId: cleanCustId,
            dateIso: cleanDateIso,
            currency: String(wallet.currency || 'INR').toUpperCase(),
            clientBilledAmount: billedToday,
            actualSpend: computedSpend,
            isPreset: Boolean(useDefaultPreset),
            spendRatioPct: billedToday > 0 ? Math.round((computedSpend / billedToday) * 100) : ratioPct,
            platformChannel: String(platformChannel || 'Meta / Digital Ads').trim(),
            notes: String(notes || '').trim().slice(0, 500),
            updatedBy: actorName,
            updatedByRole: actorRole,
            updatedAt: now,
          },
          $setOnInsert: {
            createdAt: now,
          },
        },
        { upsert: true, new: true }
      );

      return res.json({
        ok: true,
        customerId: cleanCustId,
        dateIso: cleanDateIso,
        actualSpend: computedSpend,
        isPreset: Boolean(useDefaultPreset),
        updatedBy: actorName,
        updatedAt: now,
      });
    } catch (err) {
      console.error('[PUT /api/ops/ad-spend]', err);
      return res.status(500).json({ ok: false, error: err.message });
    }
  }
);

operationsCycleRouter.patch(
  '/superadmin/unit-finance/default-ratio',
  requireSuperAdmin,
  async (req, res) => {
    try {
      const { customerId, defaultSpendRatioPct = 50, applyToAll = false } = req.body || {};
      const cleanPct = Math.min(200, Math.max(0, Number(defaultSpendRatioPct)));
      if (!Number.isFinite(cleanPct)) {
        return res.status(400).json({ ok: false, error: 'Valid percentage (0–200) is required.' });
      }
      if (applyToAll) {
        const result = await Wallet.updateMany({}, { $set: { defaultSpendRatioPct: cleanPct } });
        return res.json({
          ok: true,
          updatedCount: result.modifiedCount || 0,
          defaultSpendRatioPct: cleanPct,
        });
      }
      if (!customerId) {
        return res.status(400).json({ ok: false, error: 'customerId is required.' });
      }
      await Wallet.updateOne({ customerId: String(customerId) }, { $set: { defaultSpendRatioPct: cleanPct } });
      return res.json({ ok: true, customerId, defaultSpendRatioPct: cleanPct });
    } catch (err) {
      console.error('[PATCH /api/superadmin/unit-finance/default-ratio]', err);
      return res.status(500).json({ ok: false, error: err.message });
    }
  }
);

// =============================================================================
// 3. GET /api/superadmin/unit-finance
//    Complete Unit-Economics, Per-User Actual Spend (50% Preset), Net Profit
//    & Exact Historical/Live Daily Wallet Liability (STRICTLY SUPER ADMIN)
// =============================================================================
operationsCycleRouter.get('/superadmin/unit-finance', requireSuperAdmin, async (req, res) => {
  try {
    const kolkataNow = getKolkataNow();
    const todayIso = toIstIsoDate(kolkataNow);
    const rawFrom = String(req.query.from || '').trim();
    const rawTo = String(req.query.to || '').trim();
    const fromIso = /^\d{4}-\d{2}-\d{2}$/.test(rawFrom) ? rawFrom : todayIso;
    const toIso = /^\d{4}-\d{2}-\d{2}$/.test(rawTo) ? rawTo : fromIso;

    const { startUtc } = istDayBoundsUtc(fromIso <= toIso ? fromIso : toIso);
    const { endUtc } = istDayBoundsUtc(toIso >= fromIso ? toIso : fromIso);
    const effectiveFromIso = fromIso <= toIso ? fromIso : toIso;
    const effectiveToIso = toIso >= fromIso ? toIso : fromIso;

    const [rawCustomers, wallets, rangeTxs, afterEndTxs, spendLogsInRange, leadsInRange, campaigns] =
      await Promise.all([
        Customer.find({ status: { $ne: 'deleted' } }).lean(),
        Wallet.find({}).lean(),
        WalletTransaction.find({ createdAt: { $gte: startUtc, $lte: endUtc } }).lean(),
        // Transactions strictly AFTER `endUtc` allow exact reconstruction of historical EOD wallet liability!
        WalletTransaction.find({ createdAt: { $gt: endUtc } })
          .select('customerId txType amount status')
          .lean(),
        DailyAdSpendLog.find({
          dateIso: { $gte: effectiveFromIso, $lte: effectiveToIso },
        }).lean(),
        Lead.find({
          $or: [
            { assignedAt: { $gte: startUtc, $lte: endUtc } },
            { createdAt: { $gte: startUtc, $lte: endUtc } },
          ],
        })
          .select('customerId assignedAt createdAt')
          .lean(),
        MarketingCampaign.find({}).sort({ updatedAt: -1 }).lean(),
      ]);

    const customers = rawCustomers.filter((c) => !isInternalTestAccount(c));
    const validCustIds = new Set(customers.map((c) => String(c._id)));
    const walletByCust = new Map(wallets.map((w) => [String(w.customerId), w]));

    // Reconstruct exact wallet balance as of `endUtc` (end of `effectiveToIso` IST):
    // CurrentBalance = BalanceAtEnd + CreditsAfterEnd - DebitsAfterEnd
    // => BalanceAtEnd = CurrentBalance - CreditsAfterEnd + DebitsAfterEnd
    const netChangeAfterEndByCust = new Map();
    for (const tx of afterEndTxs) {
      const cid = String(tx.customerId);
      if (!validCustIds.has(cid)) continue;
      const st = String(tx.status || '').toLowerCase();
      if (st.includes('fail') || st.includes('declin') || st.includes('reject')) continue;
      const amt = Number(tx.amount || 0);
      const delta = tx.txType === 'Credit' ? amt : -amt;
      netChangeAfterEndByCust.set(cid, (netChangeAfterEndByCust.get(cid) || 0) + delta);
    }

    // Index spend logs by `${customerId}|${dateIso}`
    const spendByCustAndDate = new Map();
    for (const sl of spendLogsInRange) {
      if (!validCustIds.has(String(sl.customerId))) continue;
      spendByCustAndDate.set(`${sl.customerId}|${sl.dateIso}`, sl);
    }

    // Group range credits & debits per customer and per customer-date
    const creditsInRangeByCust = new Map();
    const debitsInRangeByCust = new Map();
    const billedDatesByCust = new Map(); // cid -> Map(dateIso -> billedAmt)

    for (const tx of rangeTxs) {
      const cid = String(tx.customerId);
      if (!validCustIds.has(cid)) continue;
      const st = String(tx.status || '').toLowerCase();
      if (st.includes('fail') || st.includes('declin') || st.includes('reject')) continue;
      const amt = Number(tx.amount || 0);
      if (tx.txType === 'Credit') {
        creditsInRangeByCust.set(cid, (creditsInRangeByCust.get(cid) || 0) + amt);
      } else if (tx.txType === 'Debit') {
        debitsInRangeByCust.set(cid, (debitsInRangeByCust.get(cid) || 0) + amt);
        const bookMatch = String(tx.referenceUtr || '').match(/^BOOK-.*-(\d{4}-\d{2}-\d{2})-/);
        const serviceIso = bookMatch ? bookMatch[1] : toIstIsoDate(tx.createdAt);
        if (serviceIso && serviceIso >= effectiveFromIso && serviceIso <= effectiveToIso) {
          if (!billedDatesByCust.has(cid)) billedDatesByCust.set(cid, new Map());
          const m = billedDatesByCust.get(cid);
          m.set(serviceIso, (m.get(serviceIso) || 0) + amt);
        }
      }
    }

    const leadsCountByCust = new Map();
    const leadsDatesByCust = new Map(); // cid -> Set(dateIso)
    for (const l of leadsInRange) {
      const cid = String(l.customerId);
      if (!validCustIds.has(cid)) continue;
      leadsCountByCust.set(cid, (leadsCountByCust.get(cid) || 0) + 1);
      const lIso = toIstIsoDate(l.assignedAt || l.createdAt);
      if (lIso) {
        if (!leadsDatesByCust.has(cid)) leadsDatesByCust.set(cid, new Set());
        leadsDatesByCust.get(cid).add(lIso);
      }
    }

    const campByCust = new Map();
    for (const cm of campaigns) {
      const cid = String(cm.customerId);
      const prev = campByCust.get(cid);
      if (!prev || (cm.status === 'Running' && prev.status !== 'Running')) {
        campByCust.set(cid, cm);
      }
    }

    let liveTotalWalletLiability = 0;
    let closingWalletLiabilityOnDate = 0;
    let scheduledDeliveryObligationOnToDate = 0;
    let grossDepositsInRange = 0;
    let clientBilledRevenueInRange = 0;
    let actualPlatformSpendInRange = 0;
    let confirmedPlatformSpendInRange = 0;
    let estimatedPresetSpendInRange = 0;
    let totalLeadsInRange = 0;
    let presetSpendRowsCount = 0;
    let confirmedSpendRowsCount = 0;
    let overSpentLossUsersCount = 0;
    let totalOverSpendLossAmount = 0;
    const unfulfilledPaidDays = [];

    const userRows = [];

    for (const c of customers) {
      const cid = String(c._id);
      const w = walletByCust.get(cid) || null;
      const liveBal = Math.max(0, Number(w?.availableBalance || 0));
      const changeAfter = netChangeAfterEndByCust.get(cid) || 0;
      const historicalClosingBal = Math.max(0, Math.round((liveBal - changeAfter) * 100) / 100);

      const sched = computeCustomerEffectiveDates(w, todayIso);
      const isScheduledOnToDate =
        sched.bookedSet.has(effectiveToIso) || sched.effectiveScheduledSet.has(effectiveToIso);

      liveTotalWalletLiability += liveBal;
      closingWalletLiabilityOnDate += historicalClosingBal;
      if (isScheduledOnToDate && c.status !== 'suspended') {
        scheduledDeliveryObligationOnToDate += sched.dailyBudget;
      }

      const depositsInRange = creditsInRangeByCust.get(cid) || 0;
      const billedInRange = debitsInRangeByCust.get(cid) || 0;
      const billedDateMap = billedDatesByCust.get(cid) || new Map();

      // Calculate Actual Ad Spend across every active/billed day in [effectiveFromIso..effectiveToIso]
      // Rule from Founder: Default preset is 50% (or wallet.defaultSpendRatioPct) of client billed/daily budget!
      const ratioPct = Number(w?.defaultSpendRatioPct ?? 50);
      const visitedDates = new Set(billedDateMap.keys());
      // Include bookedDates falling inside [effectiveFromIso..effectiveToIso] (covers pre-booked slots deducted earlier!)
      for (const bIso of sched.bookedSet) {
        if (bIso >= effectiveFromIso && bIso <= effectiveToIso) {
          visitedDates.add(bIso);
        }
      }
      // Also include any date in range where Marketing explicitly logged spend even before auto-cut
      for (const sl of spendLogsInRange) {
        if (String(sl.customerId) === cid) visitedDates.add(sl.dateIso);
      }
      // If viewing a single date (e.g. Today) and client is scheduled today, project today's preset if not yet billed
      let projectedScheduledBilled = 0;
      if (effectiveFromIso === effectiveToIso && isScheduledOnToDate && visitedDates.size === 0) {
        visitedDates.add(effectiveToIso);
        projectedScheduledBilled = sched.dailyBudget;
      }

      let userActualSpend = 0;
      let userTargetBudget = 0;
      let userEarnedServiceBasis = 0;
      let userHasPreset = false;
      let userHasConfirmed = false;
      const userUnfulfilledDates = [];
      const custLeadDates = leadsDatesByCust.get(cid) || new Set();
      const camp = campByCust.get(cid) || null;
      const resolvedAmmCode = normalizeMarketingCode(
        camp?.marketingCode || c.marketingCode || w?.marketingCode || ''
      );

      for (const dIso of visitedDates) {
        const sl = spendByCustAndDate.get(`${cid}|${dIso}`);
        const dayBilled =
          billedDateMap.get(dIso) ||
          (sched.bookedSet.has(dIso) ? sched.dailyBudget : 0) ||
          projectedScheduledBilled ||
          sched.dailyBudget;
        userEarnedServiceBasis += dayBilled;
        const dayTarget = Math.round((dayBilled * ratioPct) / 100);
        userTargetBudget += dayTarget;

        if (sl) {
          const amt = Number(sl.actualSpend || 0);
          userActualSpend += amt;
          if (sl.isPreset) {
            userHasPreset = true;
            presetSpendRowsCount += 1;
            estimatedPresetSpendInRange += amt;
          } else {
            userHasConfirmed = true;
            confirmedSpendRowsCount += 1;
            confirmedPlatformSpendInRange += amt;
          }
        } else {
          userActualSpend += dayTarget;
          userHasPreset = true;
          presetSpendRowsCount += 1;
          estimatedPresetSpendInRange += dayTarget;
        }

        // Detect Unfulfilled Paid Day: Date already ended (or Today with Campaign OFF & 0 spend & 0 leads)
        const hasConfirmedNonZeroSpend = Boolean(sl && !sl.isPreset && Number(sl.actualSpend || 0) > 0);
        const hadLeadsOnDate = custLeadDates.has(dIso);
        const isPaidBookedSlot = sched.bookedSet.has(dIso) || (billedDateMap.get(dIso) || 0) > 0;
        if (
          isPaidBookedSlot &&
          !hasConfirmedNonZeroSpend &&
          !hadLeadsOnDate &&
          (dIso < todayIso || (dIso === todayIso && (!camp || camp.status !== 'Running')))
        ) {
          userUnfulfilledDates.push(dIso);
          unfulfilledPaidDays.push({
            customerId: cid,
            companyName: c.companyName || c.contactPerson || 'Client Account',
            marketingCode: resolvedAmmCode || null,
            dateIso: dIso,
            paidAmount: dayBilled,
            isPastDay: dIso < todayIso,
            campaignStatus: camp ? camp.status : 'Not Created',
          });
        }
      }

      const effectiveRevenueBasis =
        userEarnedServiceBasis > 0
          ? userEarnedServiceBasis
          : billedInRange > 0
            ? billedInRange
            : projectedScheduledBilled;
      const netProfit = effectiveRevenueBasis - userActualSpend;
      const isOverSpentLoss = visitedDates.size > 0 && netProfit < 0;
      const isOverTargetThinMargin =
        visitedDates.size > 0 && netProfit >= 0 && userActualSpend > userTargetBudget;

      if (isOverSpentLoss) {
        overSpentLossUsersCount += 1;
        totalOverSpendLossAmount += Math.abs(netProfit);
      }

      const marginPct =
        effectiveRevenueBasis > 0
          ? Math.round((netProfit / effectiveRevenueBasis) * 1000) / 10
          : 0;
      const leadsSent = leadsCountByCust.get(cid) || 0;
      const realCpl = leadsSent > 0 ? Math.round(userActualSpend / leadsSent) : null;
      const clientCpl = leadsSent > 0 ? Math.round(effectiveRevenueBasis / leadsSent) : null;

      grossDepositsInRange += depositsInRange;
      clientBilledRevenueInRange += effectiveRevenueBasis;
      actualPlatformSpendInRange += userActualSpend;
      totalLeadsInRange += leadsSent;

      const singleDayLog =
        effectiveFromIso === effectiveToIso
          ? spendByCustAndDate.get(`${cid}|${effectiveToIso}`) || null
          : null;

      userRows.push({
        id: cid,
        customerId: cid,
        marketingCode: resolvedAmmCode || null,
        username: c.username || '',
        companyName: c.companyName || c.contactPerson || 'Client Account',
        contactPerson: c.contactPerson || '',
        phone: c.phone || '',
        category: c.category || '',
        city: c.city || '',
        currency: String(w?.currency || c.currency || 'INR').toUpperCase(),
        dailyBudget: sched.dailyBudget,
        defaultSpendRatioPct: ratioPct,
        lifetimeDeposited: Number(w?.totalLifetimePaid || 0),
        depositsInRange,
        liveWalletLiability: liveBal,
        closingWalletLiabilityOnDate: historicalClosingBal,
        isScheduledOnToDate,
        bookedDatesCount: sched.bookedSet.size,
        activeDaysCountInRange: visitedDates.size,
        clientBilledInRange: billedInRange,
        projectedOrSettledRevenue: effectiveRevenueBasis,
        targetMarketingBudget: userTargetBudget,
        actualAdSpend: userActualSpend,
        isOverSpentLoss,
        isOverTargetThinMargin,
        overSpendAmount: isOverSpentLoss ? Math.abs(netProfit) : 0,
        unfulfilledPaidDates: userUnfulfilledDates,
        spendSource:
          visitedDates.size === 0
            ? 'inactive'
            : userHasConfirmed && !userHasPreset
              ? 'confirmed'
              : userHasConfirmed && userHasPreset
                ? 'mixed'
                : 'preset_50',
        singleDaySpendNotes: singleDayLog?.notes || '',
        netProfit,
        marginPct,
        leadsDelivered: leadsSent,
        realCpl,
        clientCpl,
        campaignStatus: camp ? camp.status : 'Not Created',
        campaignName: camp ? (camp.campaignName || camp.name || '') : '',
      });
    }

    // Sort: Over-spent loss rows first, then active/billed in range, then highest wallet liability
    userRows.sort((a, b) => {
      if (Number(b.isOverSpentLoss) !== Number(a.isOverSpentLoss)) {
        return Number(b.isOverSpentLoss) - Number(a.isOverSpentLoss);
      }
      if (b.projectedOrSettledRevenue !== a.projectedOrSettledRevenue) {
        return b.projectedOrSettledRevenue - a.projectedOrSettledRevenue;
      }
      return b.closingWalletLiabilityOnDate - a.closingWalletLiabilityOnDate;
    });

    const netGrossProfit = clientBilledRevenueInRange - actualPlatformSpendInRange;
    const netGrossMarginPct =
      clientBilledRevenueInRange > 0
        ? Math.round((netGrossProfit / clientBilledRevenueInRange) * 1000) / 10
        : 0;
    // Taxable base vs 18% GST inside gross deposits
    const depositsBaseExclGst = Math.round(grossDepositsInRange / 1.18);
    const depositsGstComponent = Math.max(0, grossDepositsInRange - depositsBaseExclGst);

    return res.json({
      ok: true,
      range: {
        fromIso: effectiveFromIso,
        toIso: effectiveToIso,
        todayIso,
        isSingleDay: effectiveFromIso === effectiveToIso,
      },
      summary: {
        liveTotalWalletLiability,
        closingWalletLiabilityOnDate,
        scheduledDeliveryObligationOnToDate,
        grossDepositsInRange,
        depositsBaseExclGst,
        depositsGstComponent,
        clientBilledRevenueInRange,
        actualPlatformSpendInRange,
        confirmedPlatformSpendInRange,
        estimatedPresetSpendInRange,
        netGrossProfit,
        netGrossMarginPct,
        overSpentLossUsersCount,
        totalOverSpendLossAmount,
        unfulfilledPaidDaysCount: unfulfilledPaidDays.length,
        totalLeadsInRange,
        avgOurRealCpl:
          totalLeadsInRange > 0 ? Math.round(actualPlatformSpendInRange / totalLeadsInRange) : null,
        avgClientPricePerLead:
          totalLeadsInRange > 0 ? Math.round(clientBilledRevenueInRange / totalLeadsInRange) : null,
        presetSpendRowsCount,
        confirmedSpendRowsCount,
      },
      unfulfilledPaidDays,
      users: userRows,
    });
  } catch (err) {
    console.error('[GET /api/superadmin/unit-finance]', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// =============================================================================
// 4. GET /api/ops/sla-bottlenecks
//    6-Stage End-to-End Business Cycle & Department Delay Bottleneck Tracker
// =============================================================================
operationsCycleRouter.get(
  '/ops/sla-bottlenecks',
  requireStaff(['super admin', 'sales', 'marketing', 'graphics']),
  async (req, res) => {
    try {
      const kolkataNow = getKolkataNow();
      const todayIso = toIstIsoDate(kolkataNow);
      const { startUtc, endUtc } = istDayBoundsUtc(todayIso);
      const realNow = new Date();
      const isAfter2PmIst = kolkataNow.getHours() >= 14;

      const [rawCustomers, wallets, posts, campaigns, todayLeads] = await Promise.all([
        Customer.find({ status: { $ne: 'deleted' } }).lean(),
        Wallet.find({}).lean(),
        MarketingPost.find({ isDeleted: { $ne: true } }).sort({ createdAt: -1 }).lean(),
        MarketingCampaign.find({}).sort({ updatedAt: -1 }).lean(),
        Lead.find({
          $or: [
            { assignedAt: { $gte: startUtc, $lte: endUtc } },
            { createdAt: { $gte: startUtc, $lte: endUtc } },
          ],
        })
          .select('customerId assignedAt createdAt')
          .lean(),
      ]);

      const customers = rawCustomers.filter((c) => !isInternalTestAccount(c));
      const custById = new Map(customers.map((c) => [String(c._id), c]));
      const walletByCust = new Map(wallets.map((w) => [String(w.customerId), w]));

      const todayLeadsByCust = new Map();
      for (const l of todayLeads) {
        const cid = String(l.customerId);
        todayLeadsByCust.set(cid, (todayLeadsByCust.get(cid) || 0) + 1);
      }

      const postsByCust = new Map();
      for (const p of posts) {
        const cid = String(p.customerId);
        if (!postsByCust.has(cid)) postsByCust.set(cid, []);
        postsByCust.get(cid).push(p);
      }

      const campsByCust = new Map();
      for (const cm of campaigns) {
        const cid = String(cm.customerId);
        if (!campsByCust.has(cid)) campsByCust.set(cid, []);
        campsByCust.get(cid).push(cm);
      }

      // Compute average Graphics & Marketing Review turnaround speeds
      const graphicsTurnarounds = [];
      const reviewTurnarounds = [];
      for (const p of posts) {
        const reqTime = p.requestedAt || p.createdAt;
        const upTime = p.artworkUploadedAt || p.submittedAt;
        if (reqTime && upTime && new Date(upTime) > new Date(reqTime)) {
          graphicsTurnarounds.push(diffMinutes(reqTime, new Date(upTime)));
        }
        if (upTime && p.approvedAt && new Date(p.approvedAt) > new Date(upTime)) {
          reviewTurnarounds.push(diffMinutes(upTime, new Date(p.approvedAt)));
        }
      }

      const avg = (arr) =>
        arr.length > 0 ? Math.round(arr.reduce((s, n) => s + n, 0) / arr.length) : null;

      const bottlenecks = [];

      for (const c of customers) {
        if (c.status === 'suspended') continue;
        const cid = String(c._id);
        const w = walletByCust.get(cid) || null;
        const sched = computeCustomerEffectiveDates(w, todayIso);
        const isScheduledToday =
          sched.bookedSet.has(todayIso) || sched.effectiveScheduledSet.has(todayIso);
        const isBookedToday = sched.bookedSet.has(todayIso);
        const isFunded = sched.balance >= sched.dailyBudget || isBookedToday;

        const custPosts = postsByCust.get(cid) || [];
        const custCamps = campsByCust.get(cid) || [];
        const runningCamp = custCamps.find((x) => x.status === 'Running') || null;
        const leadsToday = todayLeadsByCust.get(cid) || 0;

        // Stage 1: Sales Onboarding Follow-Up Delay (>24h registered, unfunded or incomplete, 0 remarks)
        const regMins = diffMinutes(c.registeredAt, realNow);
        const hasRemarks = Array.isArray(c.salesRemarks) && c.salesRemarks.length > 0;
        if (!isFunded && regMins >= 1440 && !hasRemarks) {
          bottlenecks.push({
            id: `sla_onb_${cid}`,
            stage: 1,
            stageName: '1. Onboarding Follow-Up',
            department: 'Sales',
            severity: 'warning',
            customerId: cid,
            companyName: c.companyName || c.contactPerson || 'Client',
            phone: c.phone || '',
            waitMinutes: regMins,
            waitFormatted: formatDurationShort(regMins),
            issue: 'Registered >24h with ₹0 wallet & 0 Sales follow-up remarks',
            actionHref: '/sales#customers',
          });
        }

        // Stage 2: Marketing Brief Delay (Funded / Scheduled, 0 creative posts > 2h)
        if ((isFunded || isScheduledToday) && custPosts.length === 0) {
          const refDate = w?.lastScheduleUpdatedAt || w?.updatedAt || c.registeredAt;
          const waitMins = diffMinutes(refDate, realNow);
          if (isScheduledToday || waitMins >= 120) {
            bottlenecks.push({
              id: `sla_brief_${cid}`,
              stage: 2,
              stageName: '2. Creative Brief Request',
              department: 'Marketing',
              severity: isScheduledToday ? 'critical' : 'warning',
              customerId: cid,
              companyName: c.companyName || c.contactPerson || 'Client',
              phone: c.phone || '',
              waitMinutes: waitMins,
              waitFormatted: formatDurationShort(waitMins),
              issue: isScheduledToday
                ? 'Scheduled TODAY — Marketing has not requested a creative brief yet'
                : `Funded client waiting ${formatDurationShort(waitMins)} for creative brief`,
              actionHref: '/marketing/create-post-ideas',
            });
          }
        }

        // Stage 3: Graphics Design Delay (>4h normal, >2h urgent)
        for (const p of custPosts) {
          if (['Pending Graphics', 'Draft', 'In Progress', 'Changes Requested', 'Rejected'].includes(p.status) && !resolveEffectiveMediaUrl(p)) {
            const waitMins = diffMinutes(p.requestedAt || p.createdAt, realNow);
            const limitMins = p.priority === 'Urgent' ? 120 : 240;
            if (waitMins >= limitMins) {
              bottlenecks.push({
                id: `sla_gfx_${p._id}`,
                stage: 3,
                stageName: '3. Graphics Artwork Production',
                department: 'Graphics',
                severity: isScheduledToday || p.priority === 'Urgent' ? 'critical' : 'warning',
                customerId: cid,
                postId: String(p._id),
                companyName: c.companyName || c.contactPerson || 'Client',
                phone: c.phone || '',
                waitMinutes: waitMins,
                waitFormatted: formatDurationShort(waitMins),
                issue: `"${p.title}" waiting ${formatDurationShort(waitMins)} for Graphics upload (${p.status})`,
                actionHref: `/graphics/post-requests?requestId=${encodeURIComponent(p._id)}`,
              });
            }
          }

          // Stage 4: Marketing Verification Delay (>1h after Graphics uploaded)
          if (p.status === 'Pending Verification' && resolveEffectiveMediaUrl(p)) {
            const waitMins = diffMinutes(p.artworkUploadedAt || p.submittedAt || p.updatedAt, realNow);
            if (waitMins >= 60) {
              bottlenecks.push({
                id: `sla_rev_${p._id}`,
                stage: 4,
                stageName: '4. Creative Verification',
                department: 'Marketing',
                severity: isScheduledToday ? 'critical' : 'warning',
                customerId: cid,
                postId: String(p._id),
                companyName: c.companyName || c.contactPerson || 'Client',
                phone: c.phone || '',
                waitMinutes: waitMins,
                waitFormatted: formatDurationShort(waitMins),
                issue: `Graphics uploaded "${p.title}" ${formatDurationShort(waitMins)} ago — awaiting Marketing approval`,
                actionHref: '/marketing/verify-posts',
              });
            }
          }
        }

        // Stage 5: Campaign Launch Delay (Scheduled Today, Campaign NOT Running)
        if (isScheduledToday && !runningCamp) {
          const waitMins = diffMinutes(startUtc, realNow);
          bottlenecks.push({
            id: `sla_camp_${cid}`,
            stage: 5,
            stageName: '5. Live Campaign Activation',
            department: 'Marketing',
            severity: 'critical',
            customerId: cid,
            companyName: c.companyName || c.contactPerson || 'Client',
            phone: c.phone || '',
            waitMinutes: waitMins,
            waitFormatted: formatDurationShort(waitMins),
            issue: `Client scheduled for leads TODAY (₹${sched.dailyBudget}/d) — Campaign is NOT Running!`,
            actionHref: '/marketing/active-schedule',
          });
        }

        // Stage 6: Sales / Lead Fulfillment Delay (Paid/Running Today, 0 Leads Sent)
        if ((isBookedToday || (isScheduledToday && runningCamp)) && leadsToday === 0 && isAfter2PmIst) {
          const waitMins = diffMinutes(startUtc, realNow);
          bottlenecks.push({
            id: `sla_lead_${cid}`,
            stage: 6,
            stageName: '6. Buyer Lead Delivery',
            department: 'Sales',
            severity: 'critical',
            customerId: cid,
            companyName: c.companyName || c.contactPerson || 'Client',
            phone: c.phone || '',
            waitMinutes: waitMins,
            waitFormatted: formatDurationShort(waitMins),
            issue: `Active/Paid today (₹${sched.dailyBudget}) — 0 buyer leads delivered after 2:00 PM IST`,
            actionHref: '/sales#active-schedule',
          });
        }
      }

      bottlenecks.sort((a, b) => {
        if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1;
        return b.waitMinutes - a.waitMinutes;
      });

      const byDepartment = {
        Sales: bottlenecks.filter((b) => b.department === 'Sales').length,
        Marketing: bottlenecks.filter((b) => b.department === 'Marketing').length,
        Graphics: bottlenecks.filter((b) => b.department === 'Graphics').length,
      };

      const avgGraphicsMins = avg(graphicsTurnarounds);
      const avgReviewMins = avg(reviewTurnarounds);

      return res.json({
        ok: true,
        todayIso,
        summary: {
          totalBottlenecks: bottlenecks.length,
          criticalCount: bottlenecks.filter((b) => b.severity === 'critical').length,
          byDepartment,
          avgGraphicsTurnaroundMins: avgGraphicsMins,
          avgGraphicsTurnaroundLabel: avgGraphicsMins !== null ? formatDurationShort(avgGraphicsMins) : '—',
          avgMarketingReviewMins: avgReviewMins,
          avgMarketingReviewLabel: avgReviewMins !== null ? formatDurationShort(avgReviewMins) : '—',
        },
        bottlenecks,
      });
    } catch (err) {
      console.error('[GET /api/ops/sla-bottlenecks]', err);
      return res.status(500).json({ ok: false, error: err.message });
    }
  }
);

// =============================================================================
// 5. POST /api/wallets/unbook-date
//    Cancel a FUTURE pre-booked delivery date BEFORE that calendar day starts,
//    returning the pre-deducted daily budget (e.g. ₹300) atomically to wallet!
// =============================================================================
operationsCycleRouter.post(
  '/wallets/unbook-date',
  requireCustomerSelfOrStaff((req) => req.body?.customerId || req.body?.phone || req.body?.username),
  async (req, res) => {
    try {
      const { customerId, phone, dateIso } = req.body || {};
      const cleanDateIso = String(dateIso || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDateIso)) {
        return res.status(400).json({ ok: false, error: 'Valid YYYY-MM-DD dateIso is required.' });
      }

      const todayIso = toIstIsoDate(getKolkataNow());
      if (cleanDateIso <= todayIso) {
        return res.status(400).json({
          ok: false,
          error:
            cleanDateIso === todayIso
              ? "Today's active delivery slot is already in progress and cannot be refunded. You can pause or resume today anytime at ₹0 extra cost."
              : 'Past completed dates cannot be unbooked.',
        });
      }

      const cleanPhone = String(phone || customerId || '').replace(/\D/g, '').slice(-10);
      const cust = await Customer.findOne({
        $or: [
          ...(customerId ? [{ _id: String(customerId).trim() }] : []),
          ...(cleanPhone ? [{ phone: cleanPhone }] : []),
        ],
      }).lean();

      if (!cust) {
        return res.status(404).json({ ok: false, error: 'Customer account not found.' });
      }

      const outcome = await withMongoTransaction(async (session) => {
        const wallet = await Wallet.findOne({ customerId: cust._id }).session(session).lean();
        if (!wallet) {
          throw new Error('Customer wallet not found.');
        }

        const bookedList = Array.isArray(wallet.bookedDates)
          ? wallet.bookedDates.map((d) => String(d || '').trim())
          : [];
        if (!bookedList.includes(cleanDateIso)) {
          throw new Error(`Date ${cleanDateIso} is not currently pre-booked.`);
        }

        const refundAmt = Number(wallet.dailyAdSpend || (wallet.currency === 'USD' ? 10 : 300));
        const nextSpent = Math.max(0, Number(wallet.totalAdSpent || 0) - refundAmt);
        const now = new Date();

        const updatedWallet = await Wallet.findOneAndUpdate(
          { _id: wallet._id, bookedDates: cleanDateIso },
          {
            $inc: { availableBalance: refundAmt },
            $set: { totalAdSpent: nextSpent, lastScheduleUpdatedAt: now, updatedAt: now },
            $pull: { bookedDates: cleanDateIso, scheduledDates: cleanDateIso },
          },
          { new: true, session }
        ).lean();

        if (!updatedWallet) {
          throw new Error(`Date ${cleanDateIso} was already unbooked.`);
        }

        const newBal = Math.round((Number(updatedWallet.availableBalance || 0) + Number.EPSILON) * 100) / 100;
        const currencySymbol = String(wallet.currency || 'INR').toUpperCase() === 'USD' ? '$' : '₹';

        const [txDoc] = await WalletTransaction.create(
          [
            {
              _id: genId('tx_unbk'),
              customerId: cust._id,
              walletId: wallet._id,
              txType: 'Credit',
              amount: refundAmt,
              balanceAfter: newBal,
              referenceUtr: `UNBOOK-${cust._id}-${cleanDateIso}-${randomBytes(2).toString('hex')}`,
              description: `Cancelled Future Scheduled Slot (${cleanDateIso}) — Returned to Growth Wallet (+${currencySymbol}${refundAmt})`,
              paymentMethod: 'Schedule Slot Reversal',
              status: 'Verified ✓',
              currency: wallet.currency || 'INR',
              createdAt: now,
            },
          ],
          { session }
        );

        await recordOutboxEvent(session, {
          aggregateType: 'wallet',
          aggregateId: wallet._id,
          eventType: 'SCHEDULE_SLOT_UNBOOKED',
          payload: {
            customerId: cust._id,
            companyName: cust.companyName || '',
            marketingCode: cust.marketingCode || wallet.marketingCode || '',
            dateIso: cleanDateIso,
            refundedAmount: refundAmt,
            balanceAfter: newBal,
          },
        });

        return {
          refundedAmount: refundAmt,
          newBalance: newBal,
          bookedDates: updatedWallet.bookedDates || [],
          scheduledDates: updatedWallet.scheduledDates || [],
          txDoc,
        };
      });

      return res.json({
        ok: true,
        dateIso: cleanDateIso,
        refundedAmount: outcome.refundedAmount,
        walletBalance: outcome.newBalance,
        bookedDates: outcome.bookedDates,
        scheduledDates: outcome.scheduledDates,
        message: `Future delivery slot (${cleanDateIso}) cancelled and ₹${outcome.refundedAmount} returned to wallet.`,
      });
    } catch (err) {
      console.error('[POST /api/wallets/unbook-date]', err);
      return res.status(400).json({ ok: false, error: err.message });
    }
  }
);

// =============================================================================
// 6. POST /api/superadmin/unit-finance/rollover-day
//    Super Admin 1-Click Safeguard: When a client paid for a date (e.g. ₹300)
//    but Marketing failed to run ads (0 spend & 0 leads), refund/rollover ₹300
//    back to the client's Growth Wallet so they can book their next delivery day!
// =============================================================================
operationsCycleRouter.post(
  '/superadmin/unit-finance/rollover-day',
  requireSuperAdmin,
  async (req, res) => {
    try {
      const { customerId, dateIso, reason = 'Unfulfilled paid delivery day rollover credit' } = req.body || {};
      const cleanCustId = String(customerId || '').trim();
      const cleanDateIso = String(dateIso || '').trim();
      if (!cleanCustId || !/^\d{4}-\d{2}-\d{2}$/.test(cleanDateIso)) {
        return res.status(400).json({ ok: false, error: 'customerId and YYYY-MM-DD dateIso are required.' });
      }

      const cust = await Customer.findById(cleanCustId).lean();
      if (!cust) {
        return res.status(404).json({ ok: false, error: 'Customer not found.' });
      }

      const actorName = String(req.auth?.name || req.auth?.username || 'Super Admin').trim();
      const idempotentUtr = `ROLLOVER-${cleanCustId}-${cleanDateIso}`;
      const alreadyRolled = await WalletTransaction.exists({ referenceUtr: idempotentUtr });
      if (alreadyRolled) {
        return res.status(409).json({
          ok: false,
          error: `Paid slot ${cleanDateIso} was already rolled over / refunded to this customer's wallet.`,
        });
      }

      const outcome = await withMongoTransaction(async (session) => {
        const wallet = await Wallet.findOne({ customerId: cleanCustId }).session(session).lean();
        if (!wallet) throw new Error('Customer wallet not found.');
        const creditAmt = Number(wallet.dailyAdSpend || 300);
        const nextSpent = Math.max(0, Number(wallet.totalAdSpent || 0) - creditAmt);
        const now = new Date();

        const updatedWallet = await Wallet.findOneAndUpdate(
          { _id: wallet._id },
          {
            $inc: { availableBalance: creditAmt },
            $set: { totalAdSpent: nextSpent, updatedAt: now },
            $pull: { bookedDates: cleanDateIso, scheduledDates: cleanDateIso },
          },
          { new: true, session }
        ).lean();

        const newBal = Math.round((Number(updatedWallet.availableBalance || 0) + Number.EPSILON) * 100) / 100;

        await WalletTransaction.create(
          [
            {
              _id: genId('tx_roll'),
              customerId: cleanCustId,
              walletId: wallet._id,
              txType: 'Credit',
              amount: creditAmt,
              balanceAfter: newBal,
              referenceUtr: idempotentUtr,
              description: `Service Guarantee Rollover Credit for ${cleanDateIso} (+₹${creditAmt})`,
              paymentMethod: 'Service Credit Rollover',
              status: 'Verified ✓',
              currency: wallet.currency || 'INR',
              createdAt: now,
            },
          ],
          { session }
        );

        await SuperAdminAuditLog.create(
          [
            {
              _id: genId('audit'),
              actorId: req.auth?.sub || 'superadmin',
              actorName,
              actorRole: 'Super Admin',
              action: 'ROLLOVER_UNFULFILLED_PAID_DAY',
              targetType: 'wallet',
              targetId: cleanCustId,
              targetLabel: `${cust.companyName || cust.username} (${cust.marketingCode || ''})`,
              reason: String(reason),
              metadata: { dateIso: cleanDateIso, creditedAmount: creditAmt, newBalance: newBal },
              createdAt: now,
            },
          ],
          { session }
        );

        return { creditAmt, newBal };
      });

      return res.json({
        ok: true,
        customerId: cleanCustId,
        dateIso: cleanDateIso,
        creditedAmount: outcome.creditAmt,
        newBalance: outcome.newBal,
        message: `₹${outcome.creditAmt} rolled over back into ${cust.companyName}'s wallet for unfulfilled date ${cleanDateIso}.`,
      });
    } catch (err) {
      console.error('[POST /api/superadmin/unit-finance/rollover-day]', err);
      return res.status(500).json({ ok: false, error: err.message });
    }
  }
);

// =============================================================================
// 7. DIRECT CHATBOT -> `#AMM01` CUSTOMER DASHBOARD LEAD WEBHOOK API
//    - GET  /api/ops/chatbot-webhook-info   (Marketing & Super Admin integration details)
//    - POST /api/ops/chatbot-webhook-rotate (Super Admin rotate secret)
//    - POST /api/webhooks/chatbot/lead      (External Chatbot / WhatsApp Bot / ManyChat / Wati / n8n)
// =============================================================================
operationsCycleRouter.get(
  '/ops/chatbot-webhook-info',
  requireStaff(['marketing', 'super admin']),
  async (req, res) => {
    try {
      const { secret, source } = await getOrCreateChatbotWebhookSecret();
      const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      const host = req.headers['x-forwarded-host'] || req.get('host') || 'admafia.marketing';
      const baseOrigin = /localhost|127\.0\.0\.1/.test(String(host))
        ? `${proto}://${host}`
        : 'https://admafia.marketing';

      const customers = await Customer.find(
        { status: { $ne: 'deleted' } },
        { _id: 1, companyName: 1, contactPerson: 1, phone: 1, username: 1, marketingCode: 1, category: 1, city: 1 }
      )
        .sort({ marketingCode: 1, registeredAt: 1 })
        .lean();

      const directory = customers
        .filter((c) => !isInternalTestAccount(c))
        .map((c) => ({
          customerId: String(c._id),
          marketingCode: normalizeMarketingCode(c.marketingCode || ''),
          companyName: c.companyName || c.contactPerson || 'Client',
          phone: c.phone || '',
          username: c.username || '',
          category: c.category || '',
          city: c.city || '',
        }));

      return res.json({
        ok: true,
        webhookUrl: `${baseOrigin}/api/webhooks/chatbot/lead`,
        apiKey: secret,
        secretSource: source,
        samplePayload: {
          marketingCode: directory[0]?.marketingCode || '#AMM01',
          phone: '9876543210',
          name: 'Verified Buyer Enquiry',
          city: directory[0]?.city || 'Mumbai',
          requirement: 'Interested in product enquiry',
          source: 'Chatbot Automated Intake',
        },
        directory,
      });
    } catch (err) {
      console.error('[GET /api/ops/chatbot-webhook-info]', err);
      return res.status(500).json({ ok: false, error: err.message });
    }
  }
);

operationsCycleRouter.post(
  '/ops/chatbot-webhook-rotate',
  requireSuperAdmin,
  async (_req, res) => {
    try {
      const result = await rotateChatbotWebhookSecret();
      return res.json({ ok: true, ...result });
    } catch (err) {
      console.error('[POST /api/ops/chatbot-webhook-rotate]', err);
      return res.status(500).json({ ok: false, error: err.message });
    }
  }
);

operationsCycleRouter.post('/webhooks/chatbot/lead', attachOptionalAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const headerKey =
      req.headers['x-webhook-key'] ||
      req.headers['x-api-key'] ||
      (String(req.headers.authorization || '').startsWith('Bearer ')
        ? String(req.headers.authorization).slice(7).trim()
        : '');
    const candidateKey = String(headerKey || body.apiKey || req.query?.apiKey || '').trim();

    const isStaffSession =
      req.auth?.actorType === 'staff' &&
      ['marketing', 'super admin', 'sales'].some((d) =>
        String(req.auth?.department || req.auth?.role || '').toLowerCase().includes(d)
      );

    const isSecretValid = candidateKey ? await verifyChatbotWebhookSecret(candidateKey) : false;
    if (!isSecretValid && !isStaffSession) {
      return res.status(401).json({
        ok: false,
        code: 'INVALID_WEBHOOK_KEY',
        error: 'Unauthorized: Provide valid X-Webhook-Key header or apiKey.',
      });
    }

    // 1. Extract `#AMM01` from explicit field OR free-form message/campaign text
    const rawCodeCandidate =
      body.marketingCode ||
      body.code ||
      body.ammCode ||
      body.campaignCode ||
      body.tag ||
      extractMarketingCodeFromText(
        [body.message, body.text, body.adName, body.campaignName, body.utm_campaign, body.notes]
          .filter(Boolean)
          .join(' ')
      ) ||
      '';

    if (!rawCodeCandidate) {
      return res.status(400).json({
        ok: false,
        code: 'MISSING_MARKETING_CODE',
        error: 'Missing marketingCode (e.g. "#AMM01") in request body or message text.',
      });
    }

    const matchResult = await findCustomerByMarketingCode(rawCodeCandidate);
    if (!matchResult?.customer) {
      return res.status(404).json({
        ok: false,
        code: 'AMM_CODE_NOT_FOUND',
        error: `No active client account matched marketing code "${normalizeMarketingCode(rawCodeCandidate)}".`,
      });
    }

    const cust = matchResult.customer;
    const matchedCode = normalizeMarketingCode(matchResult.matchedCode);

    // 2. Extract 10-digit buyer mobile number(s) (supports single `phone`/`waId`/`from` or bulk `phones` array)
    const rawPhones = Array.isArray(body.phones) && body.phones.length > 0
      ? body.phones
      : [body.phone || body.mobile || body.waId || body.wa_id || body.from || body.sender || ''];

    const cleanBuyerPhones = [];
    for (const rp of rawPhones) {
      const digits = String(rp || '').replace(/\D/g, '');
      const ten =
        digits.length === 12 && digits.startsWith('91')
          ? digits.slice(2)
          : digits.length === 11 && digits.startsWith('0')
            ? digits.slice(1)
            : digits.slice(-10);
      if (ten.length === 10 && ['6', '7', '8', '9'].includes(ten[0])) {
        if (!cleanBuyerPhones.includes(ten)) cleanBuyerPhones.push(ten);
      }
    }

    if (cleanBuyerPhones.length === 0) {
      return res.status(400).json({
        ok: false,
        code: 'INVALID_BUYER_PHONE',
        error: 'Provide at least one valid 10-digit Indian mobile number (starting with 6-9) in `phone` or `phones`.',
      });
    }

    // 3. Deduplicate against existing leads already assigned to this `#AMM` client
    const existingDocs = await Lead.find(
      { customerId: cust._id, phone: { $in: cleanBuyerPhones } },
      { phone: 1, _id: 1 }
    ).lean();
    const existingPhoneSet = new Set(existingDocs.map((d) => String(d.phone)));

    const now = new Date();
    const createdLeads = [];
    const skippedDuplicates = [];

    for (const buyerDigits of cleanBuyerPhones) {
      if (existingPhoneSet.has(buyerDigits)) {
        skippedDuplicates.push(buyerDigits);
        continue;
      }

      const leadId = `lead_bot_${Date.now()}_${randomBytes(2).toString('hex')}`;
      const displayPhone = `+91 ${buyerDigits}`;
      const cleanName = String(body.name || body.buyerName || '').trim() || displayPhone;
      const cleanCity = String(body.city || '').trim() || cust.city || '';
      const cleanReq =
        String(body.requirement || body.message || '').trim() || 'Verified Business Enquiry';

      // Ensure zero strategy leakage in customer-visible `source` & `requirement`
      const safeReq = /meta ads|facebook|instagram|google ads/i.test(cleanReq)
        ? 'Verified Business Enquiry'
        : cleanReq;

      const created = await Lead.create({
        _id: leadId,
        masterLeadId: null,
        customerId: cust._id,
        customerPhone: cust.phone || '',
        customerUsername: cust.username || '',
        companyName: cust.companyName || '',
        category: cust.category || 'Business Enquiry',
        phone: buyerDigits,
        displayPhone,
        fullName: cleanName,
        email: String(body.email || '').trim(),
        city: cleanCity,
        requirement: safeReq,
        budget: String(body.budget || '').trim(),
        source: `Automated Intake (${matchedCode})`,
        priority: 'Urgent',
        status: 'new',
        isHot: true,
        isRead: false,
        notes: `Auto-routed via Chatbot API [${matchedCode}]`,
        assignedAt: now,
        updatedAt: now,
      });

      createdLeads.push({
        id: created._id,
        phone: buyerDigits,
        displayPhone,
        name: cleanName,
      });

      await recordOutboxEvent(null, {
        aggregateType: 'lead',
        aggregateId: leadId,
        eventType: 'LEAD_DISPATCHED',
        payload: {
          leadId,
          customerId: cust._id,
          buyerName: displayPhone,
          city: cleanCity,
          category: cust.category || 'Business Enquiry',
          marketingCode: matchedCode,
        },
      }).catch(() => {});
    }

    return res.status(createdLeads.length > 0 ? 201 : 200).json({
      ok: true,
      marketingCode: matchedCode,
      customerId: cust._id,
      companyName: cust.companyName || cust.contactPerson || '',
      addedCount: createdLeads.length,
      skippedDuplicates,
      leads: createdLeads,
      message:
        createdLeads.length > 0
          ? `Delivered ${createdLeads.length} lead(s) directly to ${cust.companyName} (${matchedCode}).`
          : `Lead already exists on ${cust.companyName} (${matchedCode}) — duplicate skipped safely.`,
    });
  } catch (err) {
    console.error('[POST /api/webhooks/chatbot/lead]', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// =============================================================================
// 8. GET /api/superadmin/playbook-pdf (Strictly Super Admin Confidential SOP PDF)
// =============================================================================
operationsCycleRouter.get('/superadmin/playbook-pdf', requireSuperAdmin, (_req, res) => {
  try {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const candidates = [
      path.resolve(dir, '..', 'assets', 'ADMAFIA_MASTER_OPERATIONS_AND_FINANCE_PLAYBOOK.pdf'),
      path.resolve(dir, '..', '..', 'docs', 'ADMAFIA_MASTER_OPERATIONS_AND_FINANCE_PLAYBOOK.pdf'),
    ];
    const found = candidates.find((p) => fs.existsSync(p));
    if (!found) {
      return res.status(404).json({ ok: false, error: 'Playbook PDF not found on server.' });
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="ADMAFIA_MASTER_OPERATIONS_AND_FINANCE_PLAYBOOK.pdf"'
    );
    return fs.createReadStream(found).pipe(res);
  } catch (err) {
    console.error('[GET /api/superadmin/playbook-pdf]', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

export default operationsCycleRouter;
