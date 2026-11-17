import express from 'express';
import {
  Customer,
  Wallet,
  WalletTransaction,
  PaymentRecord,
  DailyAdSpendLog,
  Lead,
  MarketingCampaign,
  MarketingPost,
} from '../models/index.js';
import { requireStaff, requireSuperAdmin } from '../middleware/authMiddleware.js';

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

        if (isScheduledOnDate) {
          totalActualAdSpendOnDate += effectiveActualSpend;
        }

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
          lastScheduleUpdatedAt: w?.lastScheduleUpdatedAt || null,
          // Campaign & Creative closed-loop state
          campaignId: primaryCamp ? String(primaryCamp._id) : null,
          campaignName: primaryCamp ? (primaryCamp.campaignName || primaryCamp.name || '') : null,
          campaignStatus: runningCamp ? 'Running' : primaryCamp ? primaryCamp.status : 'Not Created',
          isCampaignLive,
          marketingCode:
            (runningCamp && runningCamp.marketingCode) ||
            c.marketingCode ||
            (w && w.marketingCode) ||
            null,
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
          rowObj.spendRatioPct = ratioPct;
          rowObj.isSpendPreset = !spendDoc || Boolean(spendDoc.isPreset);
          rowObj.spendPlatform = spendDoc?.platformChannel || 'Meta / Digital Ads';
          rowObj.spendUpdatedBy = spendDoc?.updatedBy || null;
          rowObj.spendUpdatedAt = spendDoc?.updatedAt || null;
        }

        // Super Admin ONLY: Net Margin & Profit
        if (isSuperAdmin) {
          const earnedBase = isBookedOnDate ? billedAmountOnDate || dailyBudget : dailyBudget;
          rowObj.clientBilledOnDate = billedAmountOnDate;
          rowObj.netProfitOnDate = earnedBase - effectiveActualSpend;
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
        totalScheduledBudget,
        totalBookedSettledBudget,
        campaignsRunningCount,
        campaignsDelayedCount,
        totalLeadsDeliveredOnDate,
        zeroLeadActiveClientsCount,
      };

      if (isMarketing) {
        summaryPayload.totalActualAdSpendOnDate = totalActualAdSpendOnDate;
      }
      if (isSuperAdmin) {
        summaryPayload.estimatedNetMarginOnDate = totalScheduledBudget - totalActualAdSpendOnDate;
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
        const dIso = toIstIsoDate(tx.createdAt);
        if (dIso) {
          if (!billedDatesByCust.has(cid)) billedDatesByCust.set(cid, new Map());
          const m = billedDatesByCust.get(cid);
          m.set(dIso, (m.get(dIso) || 0) + amt);
        }
      }
    }

    const leadsCountByCust = new Map();
    for (const l of leadsInRange) {
      const cid = String(l.customerId);
      if (!validCustIds.has(cid)) continue;
      leadsCountByCust.set(cid, (leadsCountByCust.get(cid) || 0) + 1);
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
    let totalLeadsInRange = 0;
    let presetSpendRowsCount = 0;
    let confirmedSpendRowsCount = 0;

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
      let userHasPreset = false;
      let userHasConfirmed = false;

      for (const dIso of visitedDates) {
        const sl = spendByCustAndDate.get(`${cid}|${dIso}`);
        const dayBilled = billedDateMap.get(dIso) || projectedScheduledBilled || sched.dailyBudget;
        if (sl) {
          userActualSpend += Number(sl.actualSpend || 0);
          if (sl.isPreset) {
            userHasPreset = true;
            presetSpendRowsCount += 1;
          } else {
            userHasConfirmed = true;
            confirmedSpendRowsCount += 1;
          }
        } else {
          userActualSpend += Math.round((dayBilled * ratioPct) / 100);
          userHasPreset = true;
          presetSpendRowsCount += 1;
        }
      }

      const effectiveRevenueBasis = billedInRange > 0 ? billedInRange : projectedScheduledBilled;
      const netProfit = effectiveRevenueBasis - userActualSpend;
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

      const camp = campByCust.get(cid) || null;
      const singleDayLog =
        effectiveFromIso === effectiveToIso
          ? spendByCustAndDate.get(`${cid}|${effectiveToIso}`) || null
          : null;

      userRows.push({
        id: cid,
        customerId: cid,
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
        activeDaysCountInRange: visitedDates.size,
        clientBilledInRange: billedInRange,
        projectedOrSettledRevenue: effectiveRevenueBasis,
        actualAdSpend: userActualSpend,
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

    // Sort: active/billed in range first, then highest wallet liability
    userRows.sort((a, b) => {
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
        netGrossProfit,
        netGrossMarginPct,
        totalLeadsInRange,
        avgOurRealCpl:
          totalLeadsInRange > 0 ? Math.round(actualPlatformSpendInRange / totalLeadsInRange) : null,
        avgClientPricePerLead:
          totalLeadsInRange > 0 ? Math.round(clientBilledRevenueInRange / totalLeadsInRange) : null,
        presetSpendRowsCount,
        confirmedSpendRowsCount,
      },
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

export default operationsCycleRouter;
