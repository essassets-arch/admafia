/**
 * AdMafia Marketing CRM — Master Customer Lead Distribution Eligibility Service (MongoDB)
 *
 * Enforces authoritative backend validation before counting or distributing
 * master leads to customer accounts.
 */

import {
  Customer,
  CustomerGroup,
  Wallet,
  MasterLead,
  LeadAssignment,
} from '../models/index.js';

export function getKolkataDayInfo() {
  const kolkataStr = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
  const now = new Date(kolkataStr);
  const dayOfWeek = now.getDay(); // 0: SUN, 1: MON, ..., 6: SAT
  const dayCodes = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const todayCode = dayCodes[dayOfWeek];
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const todayIso = `${y}-${m}-${d}`;
  return { now, dayOfWeek, todayCode, todayIso };
}

/**
 * Authoritative customer eligibility evaluator.
 * Accepts a customer row joined with wallet information and options.
 */
export function evaluateCustomerEligibility(row, options = {}) {
  const dayInfo = options.todayCode ? options : getKolkataDayInfo();
  const todayCode = dayInfo.todayCode;
  const todayIso = dayInfo.todayIso;

  const reasons = [];

  // 1. Account Status
  const status = (row.status || '').toLowerCase().trim();
  if (status !== 'active') {
    reasons.push('Account inactive or suspended');
  }

  // 2. Profile / KYC Verification
  const isProfileComplete = (
    row.profile_status === 'complete' ||
    Number(row.kyc_percent ?? 0) >= 100
  );
  const isPaymentVerified = (
    row.payment_status === 'paid' ||
    row.payment_status === 'verified' ||
    row.verified === true
  );
  if (!isProfileComplete || !isPaymentVerified) {
    reasons.push('Profile/KYC incomplete');
  }

  // 3. Valid Wallet Configuration
  const hasWallet = Boolean(row.wallet_id || row.walletId || row.has_wallet);
  if (!hasWallet) {
    reasons.push('Missing or invalid wallet configuration');
  }

  // 4. Daily Advertising Spend Minimum (>= ₹300 or >= $10)
  const currency = row.currency || 'INR';
  const minSpend = currency === 'USD' ? 10 : 300;
  const dailySpend = Number(row.daily_ad_spend ?? row.dailyAdSpend ?? minSpend);
  if (dailySpend < minSpend) {
    reasons.push(`Daily advertising spend below minimum ${currency === 'USD' ? '$10' : '₹300'}`);
  }

  // 5. Available Wallet Balance Sufficiency
  const balance = Number(row.available_balance ?? row.walletBalance ?? row.balance ?? 0);

  const bookedDatesStr = Array.isArray(row.booked_dates)
    ? row.booked_dates.join(',')
    : String(row.booked_dates || '');
  let isTodayBooked = bookedDatesStr.includes(todayIso);

  let isDeductedToday = isTodayBooked || Boolean(row.is_deducted_today || row.isDeductedToday);
  if (!isDeductedToday && row.last_deducted_at) {
    try {
      const lastDedKolkata = new Date(new Date(row.last_deducted_at).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      const ly = lastDedKolkata.getFullYear();
      const lm = String(lastDedKolkata.getMonth() + 1).padStart(2, '0');
      const ld = String(lastDedKolkata.getDate()).padStart(2, '0');
      if (`${ly}-${lm}-${ld}` === todayIso) {
        isDeductedToday = true;
        isTodayBooked = true;
      }
    } catch (_) {}
  }

  const isBalanceSufficient = (balance >= dailySpend) || isDeductedToday;
  if (!isBalanceSufficient) {
    reasons.push('Insufficient wallet balance');
  }

  // 6. Marketing Campaign Enabled & Actually Able to Run Today
  const isCampaignActive = Boolean(row.ad_campaign_active ?? row.adCampaignActive);
  const activeDaysRaw = row.active_days ?? row.activeDays ?? todayCode;
  const rawList = (Array.isArray(activeDaysRaw) ? activeDaysRaw : String(activeDaysRaw).split(','))
    .map((s) => String(s).trim().toUpperCase()).filter(Boolean);
  const isLegacy = rawList.length === 5 && rawList.includes('MON') && rawList.includes('FRI');
  const activeDaysList = isLegacy || rawList.length === 0 ? [todayCode] : rawList;

  const isScheduledToday = activeDaysList.includes('ALL') || activeDaysList.includes(todayCode);
  const canCampaignRun = isCampaignActive && (isScheduledToday || isTodayBooked);

  if (!canCampaignRun) {
    reasons.push('Marketing campaign inactive or unable to start');
  }

  // 7. Group / Category Match Verification (if target passed in options)
  if (options.targetGroupId || options.targetCategory) {
    const targetGId = String(options.targetGroupId || '').trim();
    const targetCat = String(options.targetCategory || '').trim().toLowerCase();

    let matches = false;
    if (targetGId) {
      if (
        row.group_id === targetGId ||
        row.member_group_id === targetGId ||
        row.cg_id === targetGId ||
        (row.cg_name && targetCat && row.cg_name.toLowerCase() === targetCat)
      ) {
        matches = true;
      }
    }

    if (!matches && targetCat) {
      const custCat = String(row.category || '').toLowerCase();
      const custInd = String(row.industry || '').toLowerCase();
      const groupCat = String(row.cg_category || '').toLowerCase();
      const groupName = String(row.cg_name || '').toLowerCase();

      if (
        custCat === targetCat ||
        custInd === targetCat ||
        groupCat === targetCat ||
        groupName === targetCat
      ) {
        matches = true;
      }
    }

    if (!matches) {
      reasons.push('Customer does not match the selected group');
    }
  }

  // 8. Duplicate Lead Check (if masterLeadId provided)
  if (options.existingRecipientIds && (options.existingRecipientIds.has(row.id) || options.existingRecipientIds.has(row.customer_id))) {
    reasons.push('Duplicate lead already received');
  }

  return {
    customerId: row.id || row.customer_id,
    username: row.username || '',
    companyName: row.company_name || row.name,
    contactPerson: row.contact_person || row.contact,
    phone: (row.phone || '').trim(),
    email: row.email || '',
    category: row.category || 'Other',
    city: row.city || '',
    balance,
    dailyAdSpend: dailySpend,
    isDeductedToday,
    isEligible: reasons.length === 0,
    reasons,
    primaryReason: reasons[0] || null,
  };
}

function resolveOptions(firstArg, secondArg) {
  if (secondArg && typeof secondArg === 'object') return secondArg;
  if (firstArg && typeof firstArg === 'object') return firstArg;
  return {};
}

/**
 * Unified recipient evaluator across groups and categories (MongoDB).
 * Accepts either `({ groupId, category, masterLeadId, session })` or legacy `(_, opts)`.
 */
export async function getEvaluatedRecipients(firstArg = {}, secondArg = null) {
  const { groupId = '', category = '', masterLeadId = null, session = null } = resolveOptions(firstArg, secondArg);
  const dayInfo = getKolkataDayInfo();
  const cleanGroupId = String(groupId || '').trim();
  const cleanCategory = String(category || '').trim();
  const catLower = cleanCategory.toLowerCase();

  const [existingDocs, customers, wallets, groups] = await Promise.all([
    masterLeadId
      ? LeadAssignment.find({ masterLeadId }, { customerId: 1 }).session(session).lean()
      : Promise.resolve([]),
    Customer.find({}).sort({ companyName: 1 }).session(session).lean(),
    Wallet.find({}).session(session).lean(),
    CustomerGroup.find({}).session(session).lean(),
  ]);

  const existingRecipientIds = new Set(existingDocs.map((r) => r.customerId));
  const walletByCust = new Map(wallets.map((w) => [w.customerId, w]));
  const groupById = new Map(groups.map((g) => [g._id, g]));

  // Build reverse index from CustomerGroup.members[] -> Set<groupId> per customer
  const extraGroupsByCust = new Map();
  for (const g of groups) {
    for (const cid of g.members || []) {
      if (!extraGroupsByCust.has(cid)) extraGroupsByCust.set(cid, new Set());
      extraGroupsByCust.get(cid).add(g._id);
    }
  }

  const candidateRows = [];
  for (const c of customers) {
    const memberGroupIds = new Set(extraGroupsByCust.get(c._id) || []);
    if (c.groupId) memberGroupIds.add(c.groupId);
    for (const gm of c.groupMemberships || []) {
      if (gm?.groupId) memberGroupIds.add(gm.groupId);
    }
    const custGroups = Array.from(memberGroupIds).map((gid) => groupById.get(gid)).filter(Boolean);

    // Filter candidate pool identically to the legacy SQL WHERE clause
    let inPool = !cleanGroupId && !cleanCategory;
    if (!inPool && cleanGroupId && memberGroupIds.has(cleanGroupId)) {
      inPool = true;
    }
    if (!inPool && catLower) {
      if (
        String(c.category || '').toLowerCase() === catLower ||
        String(c.industry || '').toLowerCase() === catLower ||
        custGroups.some(
          (g) =>
            String(g.category || '').toLowerCase() === catLower ||
            String(g.name || '').toLowerCase() === catLower
        )
      ) {
        inPool = true;
      }
    }
    if (!inPool) continue;

    const matchedCg =
      custGroups.find(
        (g) =>
          (cleanGroupId && g._id === cleanGroupId) ||
          (catLower &&
            (String(g.category || '').toLowerCase() === catLower ||
              String(g.name || '').toLowerCase() === catLower))
      ) ||
      custGroups[0] ||
      null;

    const w = walletByCust.get(c._id);
    candidateRows.push({
      id: c._id,
      username: c.username,
      phone: c.phone,
      email: c.email,
      company_name: c.companyName,
      contact_person: c.contactPerson,
      category: c.category,
      industry: c.industry,
      city: c.city,
      state: c.state,
      currency: w?.currency || c.currency || 'INR',
      status: c.status,
      profile_status: c.profileStatus,
      payment_status: c.paymentStatus,
      kyc_percent: c.kycPercent,
      verified: c.verified,
      group_id: c.groupId,
      wallet_id: w?._id || null,
      available_balance: Number(w?.availableBalance ?? 0),
      daily_ad_spend: Number(w?.dailyAdSpend ?? 300),
      ad_campaign_active: Boolean(w?.adCampaignActive),
      active_days: Array.isArray(w?.activeDays) ? w.activeDays.join(',') : (w?.activeDays || ''),
      last_deducted_at: w?.lastDeductedAt ?? null,
      booked_dates: Array.isArray(w?.bookedDates) ? w.bookedDates.join(',') : (w?.bookedDates || ''),
      member_group_id: matchedCg?._id || (cleanGroupId && memberGroupIds.has(cleanGroupId) ? cleanGroupId : null),
      cg_id: matchedCg?._id || null,
      cg_name: matchedCg?.name || null,
      cg_category: matchedCg?.category || null,
    });
  }

  const eligible = [];
  const excluded = [];
  const skippedBreakdown = {
    insufficientBalance: 0,
    marketingInactive: 0,
    accountInactive: 0,
    kycIncomplete: 0,
    groupMismatch: 0,
    duplicateLead: 0,
    missingWallet: 0,
  };

  for (const row of candidateRows) {
    const evalResult = evaluateCustomerEligibility(row, {
      ...dayInfo,
      targetGroupId: cleanGroupId,
      targetCategory: cleanCategory,
      existingRecipientIds,
    });

    const recipientObj = {
      customerId: row.id,
      username: row.username || '',
      companyName: row.company_name,
      contactPerson: row.contact_person,
      phone: (row.phone || '').trim(),
      email: row.email || '',
      category: row.category || 'Other',
      city: row.city || '',
      status: row.status,
      balance: evalResult.balance,
      dailyAdSpend: evalResult.dailyAdSpend,
      isEligible: evalResult.isEligible,
      reasons: evalResult.reasons,
      reason: evalResult.primaryReason,
      notificationStatus: evalResult.isEligible ? 'Ready to Dispatch' : 'Ineligible',
    };

    if (evalResult.isEligible) {
      eligible.push(recipientObj);
    } else {
      excluded.push(recipientObj);
      for (const r of evalResult.reasons) {
        if (r.includes('Insufficient wallet balance')) skippedBreakdown.insufficientBalance++;
        else if (r.includes('Marketing campaign inactive')) skippedBreakdown.marketingInactive++;
        else if (r.includes('Account inactive')) skippedBreakdown.accountInactive++;
        else if (r.includes('Profile/KYC incomplete')) skippedBreakdown.kycIncomplete++;
        else if (r.includes('does not match')) skippedBreakdown.groupMismatch++;
        else if (r.includes('Duplicate lead')) skippedBreakdown.duplicateLead++;
        else if (r.includes('wallet configuration')) skippedBreakdown.missingWallet++;
      }
    }
  }

  return {
    eligible,
    excluded,
    eligibleCount: eligible.length,
    excludedCount: excluded.length,
    totalCandidates: candidateRows.length,
    skippedBreakdown,
  };
}

/**
 * Calculates authoritative eligible customer counts for all customer groups.
 */
export async function getGroupEligibilityCounts() {
  const [groupDocs, masterLeads, assignAgg] = await Promise.all([
    CustomerGroup.find({}).sort({ createdAt: 1 }).lean(),
    MasterLead.find({}, { groupId: 1, category: 1 }).lean(),
    LeadAssignment.aggregate([
      { $match: { groupId: { $ne: null } } },
      { $group: { _id: '$groupId', n: { $sum: 1 } } },
    ]),
  ]);

  const assignCountByGroup = new Map(assignAgg.map((a) => [a._id, a.n]));
  const groups = [];

  for (const g of groupDocs) {
    const gCatLower = String(g.category || '').toLowerCase();
    const gNameLower = String(g.name || '').toLowerCase();
    const leadsReceived = masterLeads.filter((ml) => {
      const mlCat = String(ml.category || '').toLowerCase();
      return (
        ml.groupId === g._id ||
        (mlCat && (mlCat === gCatLower || mlCat === gNameLower))
      );
    }).length;

    const evalData = await getEvaluatedRecipients({
      groupId: g._id,
      category: g.category || g.name,
    });

    groups.push({
      id: g._id,
      name: g.name,
      category: g.category,
      icon: g.icon,
      description: g.description,
      status: g.status,
      created_at: g.createdAt,
      updated_at: g.updatedAt,
      customer_count: evalData.eligibleCount,
      eligible_count: evalData.eligibleCount,
      total_members: evalData.totalCandidates,
      excluded_count: evalData.excludedCount,
      skipped_breakdown: evalData.skippedBreakdown,
      leads_received: leadsReceived,
      leads_distributed: Number(assignCountByGroup.get(g._id) || 0),
    });
  }

  return groups;
}

/**
 * Calculates authoritative eligible customer counts for all categories.
 */
export async function getCategoryEligibilityCounts() {
  const [groups, distinctCategories] = await Promise.all([
    getGroupEligibilityCounts(),
    Customer.distinct('category', { category: { $nin: [null, ''] } }),
  ]);

  const categoryMap = new Map();

  for (const g of groups) {
    const catKey = g.category || g.name;
    if (!categoryMap.has(catKey)) {
      categoryMap.set(catKey, {
        category: catKey,
        name: g.name,
        groupId: g.id,
        icon: g.icon || '🏢',
        description: g.description || '',
        eligibleCount: Number(g.customer_count || 0),
        totalMembers: Number(g.total_members || 0),
        leadsReceived: Number(g.leads_received || 0),
        leadsDistributed: Number(g.leads_distributed || 0),
      });
    } else {
      const existing = categoryMap.get(catKey);
      existing.eligibleCount = Math.max(existing.eligibleCount, Number(g.customer_count || 0));
    }
  }

  for (const cat of distinctCategories) {
    if (!cat || categoryMap.has(cat)) continue;
    const evalData = await getEvaluatedRecipients({ category: cat });
    categoryMap.set(cat, {
      category: cat,
      name: cat,
      groupId: null,
      icon: '🏢',
      description: `${cat} Industry Segment`,
      eligibleCount: evalData.eligibleCount,
      totalMembers: evalData.totalCandidates,
      leadsReceived: 0,
      leadsDistributed: 0,
    });
  }

  return {
    categories: Array.from(categoryMap.values()),
    groups,
  };
}
