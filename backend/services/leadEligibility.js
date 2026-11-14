/**
 * AdMafia Marketing CRM — Master Customer Lead Distribution Eligibility Service
 * 
 * Enforces authoritative, persistent PostgreSQL backend validation before counting
 * or distributing master leads to customer accounts.
 * 
 * Strict Eligibility Criteria:
 * 1. Account status is 'active' (not 'suspended' or 'inactive').
 * 2. Profile/KYC is complete (profile_status = 'complete' OR kyc_percent >= 100)
 *    AND payment is confirmed/verified (payment_status = 'paid' OR verified = true).
 * 3. Valid wallet associated with the customer account.
 * 4. Configured daily advertising spend satisfies the minimum ₹300.
 * 5. Available wallet balance is sufficient to fund the daily advertising spend
 *    (balance >= daily_ad_spend, or today's spend has already been successfully deducted/booked).
 * 6. Marketing is enabled (ad_campaign_active = true) AND the campaign can actually run
 *    today in Asia/Kolkata timezone (scheduled day or booked day).
 * 7. Customer matches the target group or category.
 * 8. Customer has not already received this master lead (deduplication).
 */

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
  
  // Check if today was already deducted or booked in PostgreSQL
  const bookedDatesStr = String(row.booked_dates || '');
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

/**
 * Unified recipient evaluator across groups and categories.
 * Queries PostgreSQL candidate pool and partitions into eligible and excluded.
 */
export async function getEvaluatedRecipients(dbQuery, { groupId = '', category = '', masterLeadId = null } = {}) {
  const dayInfo = getKolkataDayInfo();

  // 1. Fetch existing recipients for this master lead to enforce strict deduplication
  let existingRecipientIds = new Set();
  if (masterLeadId) {
    const existingRes = await dbQuery(
      'SELECT customer_id FROM lead_assignments WHERE master_lead_id = $1',
      [masterLeadId]
    );
    existingRecipientIds = new Set(existingRes.rows.map((r) => r.customer_id));
  }

  // 2. Query Candidate Pool with full relation joins
  const sql = `
    SELECT DISTINCT
      c.id, c.username, c.phone, c.email, c.company_name, c.contact_person,
      c.category, c.industry, c.city, c.state, c.status, c.profile_status,
      c.payment_status, c.kyc_percent, c.verified, c.group_id,
      w.id AS wallet_id,
      COALESCE(w.available_balance, 0) AS available_balance,
      COALESCE(w.daily_ad_spend, 300) AS daily_ad_spend,
      COALESCE(w.ad_campaign_active, FALSE) AS ad_campaign_active,
      COALESCE(w.active_days, '') AS active_days,
      w.last_deducted_at,
      COALESCE(w.booked_dates, '') AS booked_dates,
      cgm.group_id AS member_group_id,
      cg.id AS cg_id, cg.name AS cg_name, cg.category AS cg_category
    FROM customers c
    LEFT JOIN wallets w ON w.customer_id = c.id
    LEFT JOIN customer_group_memberships cgm ON cgm.customer_id = c.id
    LEFT JOIN customer_groups cg ON (cg.id = cgm.group_id OR cg.id = c.group_id)
    WHERE (
      ( $1 = '' AND $2 = '' )
      OR ( $1 <> '' AND (
        cgm.group_id = $1
        OR c.group_id = $1
        OR cg.id = $1
      ) )
      OR ( $2 <> '' AND (
        LOWER(c.category) = LOWER($2)
        OR LOWER(c.industry) = LOWER($2)
        OR LOWER(cg.category) = LOWER($2)
        OR LOWER(cg.name) = LOWER($2)
      ) )
    )
    ORDER BY c.company_name ASC
  `;

  const res = await dbQuery(sql, [groupId || '', category || '']);

  // Deduplicate rows in case of multi-group memberships
  const seenCustomers = new Map();
  for (const row of res.rows) {
    if (!seenCustomers.has(row.id)) {
      seenCustomers.set(row.id, row);
    }
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

  for (const row of seenCustomers.values()) {
    const evalResult = evaluateCustomerEligibility(row, {
      ...dayInfo,
      targetGroupId: groupId,
      targetCategory: category,
      existingRecipientIds,
    });

    const recipientObj = {
      customerId: row.id,
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
    totalCandidates: seenCustomers.size,
    skippedBreakdown,
  };
}

/**
 * Calculates authoritative eligible customer counts for all customer groups.
 */
export async function getGroupEligibilityCounts(dbQuery) {
  const groupsRes = await dbQuery(`
    SELECT cg.*,
      (SELECT COUNT(*) FROM master_leads ml WHERE ml.group_id = cg.id OR LOWER(ml.category) = LOWER(cg.category) OR LOWER(ml.category) = LOWER(cg.name)) AS leads_received,
      (SELECT COUNT(*) FROM lead_assignments la WHERE la.group_id = cg.id) AS leads_distributed
    FROM customer_groups cg
    ORDER BY cg.created_at ASC
  `);

  const groups = [];
  for (const g of groupsRes.rows) {
    const evalData = await getEvaluatedRecipients(dbQuery, {
      groupId: g.id,
      category: g.category || g.name,
    });

    groups.push({
      ...g,
      customer_count: evalData.eligibleCount,
      eligible_count: evalData.eligibleCount,
      total_members: evalData.totalCandidates,
      excluded_count: evalData.excludedCount,
      skipped_breakdown: evalData.skippedBreakdown,
      leads_received: Number(g.leads_received || 0),
      leads_distributed: Number(g.leads_distributed || 0),
    });
  }

  return groups;
}

/**
 * Calculates authoritative eligible customer counts for all categories.
 */
export async function getCategoryEligibilityCounts(dbQuery) {
  const groups = await getGroupEligibilityCounts(dbQuery);

  const custCatRes = await dbQuery(`
    SELECT DISTINCT category FROM customers WHERE category IS NOT NULL AND category != ''
  `);

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

  for (const row of custCatRes.rows) {
    const cat = row.category;
    if (!categoryMap.has(cat)) {
      const evalData = await getEvaluatedRecipients(dbQuery, { category: cat });
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
  }

  return {
    categories: Array.from(categoryMap.values()),
    groups,
  };
}
