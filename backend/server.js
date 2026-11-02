import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { initDatabase, query, withTransaction, getDbStatus } from './db.js';
import { getEvaluatedRecipients, getGroupEligibilityCounts, getCategoryEligibilityCounts } from './services/leadEligibility.js';
import { marketingRouter, processDailyAdSpendPacing } from './routes/marketing.js';
import { graphicsRouter } from './routes/graphics.js';
import { superadminRouter } from './routes/superadmin.js';

// Enterprise Crash-Protection: Prevent container exit on unhandled promise rejections or uncaught errors
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err.stack || err.message || err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason?.stack || reason?.message || reason);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = Number(process.env.PORT || 5000);

app.use(cors());
app.use(express.json({
  limit: '25mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  },
}));

const razorpayKeyId = process.env.RAZORPAY_KEY_ID || 'rzp_live_TuUlRUHnVlWd5i';
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET || 'ItZeWawXWwTt98Dx60n47Sza';
const walletCreditToken = randomBytes(32).toString('hex');

function getRazorpayConfigInfo() {
  const isConfigured = Boolean(razorpayKeyId && razorpayKeySecret);
  const isLive = Boolean(razorpayKeyId && razorpayKeyId.startsWith('rzp_live_'));
  return {
    configured: isConfigured,
    keyId: razorpayKeyId || '',
    mode: isLive ? 'LIVE MODE' : 'TEST MODE',
    isLive,
    currency: 'INR',
    minAmount: 300,
    maxAmount: 1000000,
  };
}

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Helper: Format DB customer row from vw_sales_customer_accounts to frontend shape
function mapCustomerRow(row, passwordPlain = '••••••••••••') {
  if (!row) return null;
  const balance = Number(row.balance ?? row.wallet_balance ?? 0);
  const dailyPacing = Number(row.daily_pacing ?? 300);
  const amountPaid = Number(row.amount_paid ?? 0);
  return {
    id: row.id,
    username: row.username,
    name: row.company_name || row.name || row.username,
    companyName: row.company_name || row.name || row.username,
    contact: row.contact_person || row.contact || row.username,
    contactPerson: row.contact_person || row.contact || row.username,
    phone: (row.phone || '').trim(),
    email: row.email || '',
    personalEmail: row.personal_email || '',
    password: passwordPlain,
    passwordMasked: '••••••••••••',
    category: row.category || 'IT & Software',
    industry: row.industry || 'Other',
    website: row.website || '',
    domain: row.website || '',
    city: row.city || '',
    state: row.state || 'Maharashtra',
    country: row.country || 'India',
    status: row.status || 'active',
    profileStatus: row.profile_status || 'incomplete',
    profile_status: row.profile_status || 'incomplete',
    paymentStatus: row.payment_status || (balance > 0 ? 'paid' : 'pending'),
    payment_status: row.payment_status || (balance > 0 ? 'paid' : 'pending'),
    kycPercent: Number(row.kyc_percent ?? (row.profile_status === 'complete' ? 100 : 25)),
    verified: Boolean(row.verified || row.profile_status === 'complete'),
    adCampaignActive: Boolean(row.ad_campaign_active),
    activeDays: (() => {
      const kDow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })).getDay();
      const kToday = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][kDow];
      let rawList = [];
      if (typeof row.active_days === 'string') {
        rawList = row.active_days.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
      } else if (Array.isArray(row.active_days)) {
        rawList = row.active_days.map((s) => String(s).trim().toUpperCase()).filter(Boolean);
      }
      // If legacy 5 weekdays default or empty, default strictly to today's day
      if (rawList.length === 5 && rawList.includes('MON') && rawList.includes('TUE') && rawList.includes('WED') && rawList.includes('THU') && rawList.includes('FRI')) {
        return [kToday];
      }
      return rawList.length > 0 ? rawList : [kToday];
    })(),
    schedulePreset: row.schedule_preset || 'weekdays',
    balance,
    walletBalance: balance,
    dailyPacing,
    dailyAdSpend: dailyPacing,
    amountPaid,
    totalLifetimePaid: amountPaid,
    totalAdSpent: Number(row.total_ad_spent ?? 0),
    runwayDays: Number(row.runway_days ?? Math.floor(balance / Math.max(dailyPacing, 1))),
    totalLeadsDispatched: Number(row.total_leads_dispatched ?? 0),
    lastDeductedAt: row.last_deducted_at || null,
    isDeductedToday: Boolean(
      row.last_deducted_at &&
      new Date(row.last_deducted_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) ===
      new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    ),
    bookedDates: (() => {
      const kToday = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      const bSet = new Set(
        (row.booked_dates || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      );
      if (
        row.last_deducted_at &&
        new Date(row.last_deducted_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) === kToday
      ) {
        bSet.add(kToday);
      }
      return Array.from(bSet);
    })(),
    lockedDays: (() => {
      const kNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      const kToday = kNow.toLocaleDateString('en-CA');
      const bSet = new Set(
        (row.booked_dates || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      );
      const isDed = Boolean(
        row.last_deducted_at &&
        new Date(row.last_deducted_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) === kToday
      );
      if (isDed) bSet.add(kToday);

      const lSet = new Set();
      const dow = kNow.getDay();
      const dToMon = dow === 0 ? -6 : 1 - dow;
      const mon = new Date(kNow);
      mon.setDate(kNow.getDate() + dToMon);
      mon.setHours(0, 0, 0, 0);

      const codes = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
      for (let i = 0; i < 7; i++) {
        const cur = new Date(mon);
        cur.setDate(mon.getDate() + i);
        const iso = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
        if (bSet.has(iso)) lSet.add(codes[i]);
      }
      return Array.from(lSet);
    })(),
    bookedDays: (() => {
      const kNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      const kToday = kNow.toLocaleDateString('en-CA');
      const bSet = new Set(
        (row.booked_dates || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      );
      const isDed = Boolean(
        row.last_deducted_at &&
        new Date(row.last_deducted_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) === kToday
      );
      if (isDed) bSet.add(kToday);

      const lSet = new Set();
      const dow = kNow.getDay();
      const dToMon = dow === 0 ? -6 : 1 - dow;
      const mon = new Date(kNow);
      mon.setDate(kNow.getDate() + dToMon);
      mon.setHours(0, 0, 0, 0);

      const codes = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
      for (let i = 0; i < 7; i++) {
        const cur = new Date(mon);
        cur.setDate(mon.getDate() + i);
        const iso = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
        if (bSet.has(iso)) lSet.add(codes[i]);
      }
      return Array.from(lSet);
    })(),
    isSelfRegistered: true,
    registeredFrom: row.registered_from || 'http://localhost:5173/#register',
    registeredAt: row.registered_at
      ? new Date(row.registered_at).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
      : 'Today',
    registeredAtRaw: row.registered_at,
    registered_at_raw: row.registered_at,
  };
}

function mapLeadRow(row) {
  const cleanPhone = (row.buyer_phone || '').trim();
  const displayPhone = row.display_phone || (cleanPhone ? `+91 ${cleanPhone}` : '');
  return {
    id: row.id,
    customerId: row.customer_id,
    masterLeadId: row.master_lead_id || null,
    customerPhone: (row.customer_phone || '').trim(),
    customerUsername: row.customer_username,
    company: row.company_name,
    assignedCompany: row.company_name,
    customerCompanyName: row.company_name,
    category: row.category || 'Other',
    phone: cleanPhone,
    displayPhone,
    maskedPhone: displayPhone,
    name: row.buyer_name || displayPhone,
    email: row.buyer_email || '',
    city: row.city || '',
    requirement: row.requirement || 'Inbound Meta Ads Campaign Enquiry',
    budget: row.budget || '₹1.5L – ₹3.5L',
    source: row.source || 'Direct Intake',
    priority: row.priority || 'Urgent',
    status: row.status || 'new',
    isHot: Boolean(row.is_hot),
    read: Boolean(row.is_read),
    unmasked: true,
    notes: row.notes || '',
    dateGroup: 'today',
    createdAt: row.created_at
      ? new Date(row.created_at).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
      : 'Today',
    createdAtRaw: row.created_at,
    created_at_raw: row.created_at,
  };
}

function mapWalletTxRow(row) {
  return {
    id: row.id,
    customerId: row.customer_id,
    type: row.tx_type,
    amount: Number(row.amount || 0),
    balance: Number(row.balance_after || 0),
    balanceAfter: Number(row.balance_after || 0),
    ref: row.reference_utr,
    desc: row.description,
    method: row.payment_method,
    status: row.status || 'Verified ✓',
    date: row.created_at
      ? new Date(row.created_at).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
      : 'Just now',
    createdAtRaw: row.created_at,
  };
}

function mapInvoiceRow(row) {
  return {
    id: row.id,
    invoiceNo: row.invoice_no,
    customerId: row.customer_id,
    particulars: row.particulars,
    sacCode: row.sac_code || '998311',
    baseAmount: Number(row.base_amount || 0),
    cgst: Number(row.cgst_amount || 0),
    sgst: Number(row.sgst_amount || 0),
    totalAmount: Number(row.total_amount || 0),
    paymentMode: row.payment_mode,
    status: row.status || 'Paid',
    date: row.issued_date
      ? new Date(row.issued_date).toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
      : new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }),
  };
}

function mapPaymentRecordRow(row) {
  return {
    id: row.id,
    receiptNo: row.receipt_number,
    customerId: row.customer_id,
    company: row.company_name,
    contact: row.contact_person,
    phone: (row.phone || '').trim(),
    city: row.city || 'India',
    type: row.tx_type || 'topup',
    amount: Number(row.amount || 0),
    gstAmount: Number(row.gst_amount || 0),
    totalAmount: Number(row.total_amount || 0),
    mode: row.payment_mode,
    utr: row.utr_reference,
    status: row.status || 'paid',
    daysOverdue: Number(row.days_overdue || 0),
    notes: row.notes || '',
    date: row.paid_at
      ? new Date(row.paid_at).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
      : 'Today',
    paidAtRaw: row.paid_at,
    paid_at_raw: row.paid_at,
  };
}

function mapGroupRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    category: row.category || 'Other',
    icon: row.icon || '🏢',
    description: row.description || '',
    status: row.status || 'active',
    customerCount: Number(row.customer_count ?? row.eligible_count ?? 0),
    eligibleCount: Number(row.eligible_count ?? row.customer_count ?? 0),
    totalMembers: Number(row.total_members ?? 0),
    excludedCount: Number(row.excluded_count ?? 0),
    skippedBreakdown: row.skipped_breakdown || null,
    leadsReceived: Number(row.leads_received ?? 0),
    leadsDistributed: Number(row.leads_distributed ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMasterLeadRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    category: row.category,
    groupId: row.group_id,
    groupName: row.group_name || '',
    groupIcon: row.group_icon || '🏢',
    buyerName: row.buyer_name,
    buyerPhone: (row.buyer_phone || '').trim(),
    displayPhone: `+91 ${(row.buyer_phone || '').trim()}`,
    buyerEmail: row.buyer_email || '',
    city: row.city || '',
    requirement: row.requirement,
    budget: row.budget || '₹1.5L – ₹3.5L',
    location: row.location || '',
    priority: row.priority || 'Urgent',
    source: row.source || 'Direct Intake',
    deadlineDate: row.deadline_date,
    createdBy: row.created_by,
    totalRecipients: Number(row.recipients_count ?? 0),
    interestedCount: Number(row.interested_count ?? 0),
    convertedCount: Number(row.converted_count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// =============================================================================
// 1. HEALTH & FULL SYSTEM STATE
// =============================================================================
app.get('/api/health', async (req, res) => {
  try {
    const counts = await query(`
      SELECT
        (SELECT COUNT(*) FROM customers) AS customers_count,
        (SELECT COUNT(*) FROM leads) AS leads_count,
        (SELECT COUNT(*) FROM wallets) AS wallets_count,
        (SELECT COUNT(*) FROM payment_records) AS payments_count,
        (SELECT COUNT(*) FROM customer_groups) AS groups_count,
        (SELECT COUNT(*) FROM master_leads) AS master_leads_count,
        (SELECT COUNT(*) FROM lead_assignments) AS lead_assignments_count
    `);
    res.json({
      ok: true,
      db: getDbStatus(),
      counts: counts.rows[0] || {},
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/state', async (req, res) => {
  try {
    const [custRes, leadsRes, payRes, pvRes, qRes, tRes, grpRes, mLeadsRes] = await Promise.all([
      query('SELECT * FROM vw_sales_customer_accounts ORDER BY registered_at DESC'),
      query('SELECT * FROM leads ORDER BY created_at DESC'),
      query('SELECT * FROM payment_records ORDER BY paid_at DESC'),
      query('SELECT * FROM pending_verifications ORDER BY submitted_at DESC'),
      query('SELECT * FROM support_queries ORDER BY created_at DESC'),
      query('SELECT * FROM sales_tasks ORDER BY created_at DESC'),
      query(`
        SELECT 
          cg.*,
          (SELECT COUNT(*) FROM customer_group_memberships cgm WHERE cgm.group_id = cg.id) AS customer_count,
          (SELECT COUNT(*) FROM master_leads ml WHERE ml.group_id = cg.id) AS leads_received,
          (SELECT COUNT(*) FROM lead_assignments la WHERE la.group_id = cg.id) AS leads_distributed
        FROM customer_groups cg
        ORDER BY cg.created_at ASC
      `),
      query(`
        SELECT 
          ml.*, 
          cg.name AS group_name,
          cg.icon AS group_icon,
          (SELECT COUNT(*) FROM lead_assignments la WHERE la.master_lead_id = ml.id) AS recipients_count,
          (SELECT COUNT(*) FROM lead_assignments la WHERE la.master_lead_id = ml.id AND la.response_interest = 'Interested') AS interested_count,
          (SELECT COUNT(*) FROM lead_assignments la WHERE la.master_lead_id = ml.id AND la.status IN ('Converted', 'Won')) AS converted_count
        FROM master_leads ml
        LEFT JOIN customer_groups cg ON cg.id = ml.group_id
        ORDER BY ml.created_at DESC
      `),
    ]);

    res.json({
      ok: true,
      customers: custRes.rows.map((r) => mapCustomerRow(r)),
      leads: leadsRes.rows.map(mapLeadRow),
      payments: payRes.rows.map(mapPaymentRecordRow),
      verifications: pvRes.rows.map((r) => ({
        id: r.id,
        customerId: r.customer_id,
        company: r.company_name,
        contact: r.contact_person,
        phone: (r.phone || '').trim(),
        packageTier: r.package_tier,
        amount: Number(r.amount || 0),
        dailyRate: Number(r.daily_rate || 300),
        utrNumber: r.utr_number,
        paymentStatus: r.payment_status,
        profileStatus: r.profile_status,
        queueType: r.queue_type,
        submittedAt: r.submitted_at
          ? new Date(r.submitted_at).toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          })
          : 'Today',
        submittedAtRaw: r.submitted_at,
        submitted_at_raw: r.submitted_at,
      })),
      queries: qRes.rows,
      tasks: tRes.rows,
      groups: grpRes.rows.map(mapGroupRow),
      masterLeads: mLeadsRes.rows.map(mapMasterLeadRow),
    });
  } catch (err) {
    console.error('[GET /api/state]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// =============================================================================
// 2. AUTHENTICATION & CUSTOMER REGISTRATION (/api/auth/register & /api/auth/login)
// =============================================================================
app.post('/api/auth/register', async (req, res) => {
  try {
    const {
      username,
      phone,
      mobile,
      email = '',
      password = 'Password123!',
      companyName,
      contactPerson,
      city = '',
      state = 'Maharashtra',
      category = 'IT & Software',
      deposit = 0,
      initialDeposit: reqInitialDeposit,
    } = req.body || {};

    const cleanPhone = String(phone || mobile || '').replace(/\D/g, '').slice(-10);
    if (cleanPhone.length !== 10) {
      return res.status(400).json({ ok: false, error: 'Valid 10-digit mobile number is required.' });
    }
    const cleanUsername = (username || `user_${cleanPhone.slice(-4)}`).trim();
    const formattedName =
      (companyName || '').trim() ||
      cleanUsername
        .replace(/[._-]+/g, ' ')
        .replace(/\b\w/g, (l) => l.toUpperCase());
    const contactName = (contactPerson || '').trim() || formattedName;
    const custId = `cust_reg_${cleanPhone}`;
    const walId = `wal_${cleanPhone}`;
    const pvId = `pv_${cleanPhone}`;
    const initialDeposit = Math.max(0, Number(deposit || reqInitialDeposit) || 0);
    const payStatus = initialDeposit >= 300 ? 'paid' : 'pending';

    await query(
      `INSERT INTO customers (
        id, username, phone, email, password_hash,
        company_name, category, contact_person, city, state,
        status, profile_status, payment_status, kyc_percent, verified, completed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active', 'complete', $11, 100, TRUE, NOW())
      ON CONFLICT (phone) DO UPDATE SET
        username = EXCLUDED.username,
        email = EXCLUDED.email,
        password_hash = EXCLUDED.password_hash,
        company_name = EXCLUDED.company_name,
        profile_status = 'complete',
        kyc_percent = 100,
        verified = TRUE,
        completed_at = COALESCE(customers.completed_at, NOW()),
        updated_at = NOW()`,
      [
        custId,
        cleanUsername,
        cleanPhone,
        email.trim(),
        password,
        formattedName,
        category,
        contactName,
        city,
        state,
        payStatus,
      ]
    );

    await query(
      `INSERT INTO wallets (
        id, customer_id, available_balance, daily_ad_spend, total_lifetime_paid, ad_campaign_active
      ) VALUES ($1, $2, $3, 300.00, $3, $4)
      ON CONFLICT (customer_id) DO UPDATE SET
        available_balance = wallets.available_balance + EXCLUDED.available_balance,
        total_lifetime_paid = wallets.total_lifetime_paid + EXCLUDED.total_lifetime_paid,
        ad_campaign_active = CASE WHEN (wallets.available_balance + EXCLUDED.available_balance) >= 300 THEN TRUE ELSE wallets.ad_campaign_active END`,
      [walId, custId, initialDeposit, initialDeposit >= 300]
    );

    if (initialDeposit > 0) {
      await query(
        `INSERT INTO wallet_transactions (
          id, customer_id, wallet_id, tx_type, amount, balance_after, reference_utr, description, payment_method, status
        ) VALUES ($1, $2, $3, 'Credit', $4, $5, $6, $7, 'Razorpay Secure (UPI/Card)', 'Verified ✓')
        ON CONFLICT (reference_utr) DO UPDATE SET balance_after = EXCLUDED.balance_after`,
        [
          `tx_init_${cleanPhone}_${Date.now()}`,
          custId,
          walId,
          initialDeposit,
          initialDeposit,
          `INIT_${cleanPhone}`,
          'Initial Account Opening Ad Wallet Deposit',
        ]
      );
    }

    await query(
      `INSERT INTO pending_verifications (
        id, customer_id, company_name, contact_person, phone,
        amount, payment_status, profile_status, queue_type
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'complete', $8)
      ON CONFLICT (customer_id) DO UPDATE SET
        profile_status = 'complete',
        queue_type = EXCLUDED.queue_type`,
      [
        pvId,
        custId,
        formattedName,
        contactName,
        cleanPhone,
        initialDeposit,
        payStatus,
        initialDeposit >= 300 ? 'Completed' : 'Payment Pending',
      ]
    );

    const viewRes = await query('SELECT * FROM vw_sales_customer_accounts WHERE id = $1', [custId]);
    const customer = mapCustomerRow(viewRes.rows[0], password);

    res.status(201).json({ ok: true, customer });
  } catch (err) {
    console.error('[POST /api/auth/register]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { identifier, username, password } = req.body || {};
    const q = String(identifier || username || '').trim().toLowerCase();
    if (!q) {
      return res.status(400).json({ ok: false, error: 'Username, mobile number, or email is required.' });
    }

    const cleanPhone = q.replace(/\D/g, '').slice(-10);

    // 1. Check customers table (Business Account login by username, email, or 10-digit mobile)
    const custCheck = await query(
      `SELECT id, password_hash, status FROM customers
       WHERE LOWER(username) = $1 OR LOWER(email) = $1 OR (length($2) = 10 AND phone = $2)
       LIMIT 1`,
      [q, cleanPhone]
    );

    let targetCustomerId = null;
    let expectedPasswordHash = null;
    let accountStatus = null;
    let authUser = null;

    if (custCheck.rowCount > 0) {
      const row = custCheck.rows[0];
      targetCustomerId = row.id;
      expectedPasswordHash = row.password_hash;
      accountStatus = row.status;
    } else {
      // 2. Check system_users table (User login created by Super Admin)
      const userCheck = await query(
        `SELECT id, customer_id, full_name, email, username, phone, password_hash, role, permissions, status
         FROM system_users
         WHERE LOWER(username) = $1 OR LOWER(email) = $1 OR (length($2) = 10 AND phone = $2)
         LIMIT 1`,
        [q, cleanPhone]
      );

      if (userCheck.rowCount === 0) {
        return res.status(404).json({
          ok: false,
          error: 'No registered account found with these credentials. Please check your username, mobile number, or email.',
        });
      }

      const uRow = userCheck.rows[0];
      expectedPasswordHash = uRow.password_hash;
      accountStatus = uRow.status;
      authUser = {
        id: uRow.id,
        fullName: uRow.full_name,
        email: uRow.email,
        username: uRow.username,
        phone: uRow.phone,
        role: uRow.role,
        permissions: uRow.permissions,
        customerId: uRow.customer_id,
      };

      if (uRow.customer_id) {
        targetCustomerId = uRow.customer_id;
      } else {
        // Platform user opening customer dashboard: bind to primary customer workspace
        const defaultCust = await query(`SELECT id FROM customers WHERE status = 'active' ORDER BY registered_at ASC LIMIT 1`);
        if (defaultCust.rowCount > 0) {
          targetCustomerId = defaultCust.rows[0].id;
        }
      }
    }

    if (password && expectedPasswordHash && expectedPasswordHash !== password) {
      return res.status(401).json({ ok: false, error: 'Incorrect password for this account.' });
    }

    if (accountStatus === 'suspended' || accountStatus === 'blocked') {
      return res.status(403).json({
        ok: false,
        error: 'Compliance Hold Notice: Your workspace has been suspended by the operations administrator.',
      });
    }

    if (authUser?.id) {
      await query(`UPDATE system_users SET last_login_at = NOW() WHERE id = $1`, [authUser.id]).catch(() => { });
    }

    if (!targetCustomerId) {
      return res.status(404).json({
        ok: false,
        error: 'No associated customer workspace found for this user.',
      });
    }

    const viewRes = await query('SELECT * FROM vw_sales_customer_accounts WHERE id = $1', [targetCustomerId]);
    if (viewRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Customer workspace record not found.' });
    }

    const customer = mapCustomerRow(viewRes.rows[0], expectedPasswordHash);
    if (authUser) {
      customer.authUser = authUser;
    }

    const [leadsRes, txRes, invRes] = await Promise.all([
      query('SELECT * FROM leads WHERE customer_id = $1 ORDER BY created_at DESC', [targetCustomerId]),
      query('SELECT * FROM wallet_transactions WHERE customer_id = $1 ORDER BY created_at DESC', [targetCustomerId]),
      query('SELECT * FROM tax_invoices WHERE customer_id = $1 ORDER BY created_at DESC', [targetCustomerId]),
    ]);

    res.json({
      ok: true,
      customer,
      user: authUser || null,
      leads: leadsRes.rows.map(mapLeadRow),
      transactions: txRes.rows.map(mapWalletTxRow),
      invoices: invRes.rows.map(mapInvoiceRow),
    });
  } catch (err) {
    console.error('[POST /api/auth/login]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// =============================================================================
// 2B. DEPARTMENT ADMIN & STAFF AUTHENTICATION (/api/auth/admin-login)
// =============================================================================
app.get('/api/auth/admin-departments', (req, res) => {
  res.json({
    ok: true,
    departments: [
      {
        id: 'superadmin',
        name: 'Super Admin Control Center',
        icon: '👑',
        path: '/superadmin',
        roleBadge: 'Super Admin',
        color: '#7c3aed',
        defaultUser: {
          username: 'superadmin',
          email: 'admin@admafia.marketing',
          password: 'SuperAdmin@2026!',
          role: 'Super Admin',
          title: 'Founders, Platform Owners & Finance Directors',
        },
        desks: [
          'Dashboard',
          'Check Queries',
          'Manage Finance',
          'Check Refunds',
          'Account Top-Up',
          'Account Block / Activate',
          'Add User / Business',
        ],
      },
      {
        id: 'marketing',
        name: 'Marketing Department',
        icon: '✨',
        path: '/marketing',
        roleBadge: 'Marketing Manager',
        color: '#ec4899',
        defaultUser: {
          username: 'marketing',
          email: 'marketing@admafia.marketing',
          password: 'Marketing@2026!',
          role: 'Marketing Manager',
          title: 'Marketing Managers, Planners & Media Buyers',
        },
        desks: [
          'Marketing Overview',
          'Customers Desk',
          'Build Ideas Desk',
          'Create Post Ideas',
          'Verify Posts Desk',
          'Customer Marketing Control',
        ],
      },
      {
        id: 'graphics',
        name: 'Graphics Department',
        icon: '🎨',
        path: '/graphics',
        roleBadge: 'Senior Graphics Designer',
        color: '#06b6d4',
        defaultUser: {
          username: 'graphics',
          email: 'graphics@admafia.marketing',
          password: 'Graphics@2026!',
          role: 'Senior Graphics Designer',
          title: 'Graphic Designers & Creative Artists',
        },
        desks: [
          'Post Requests Queue',
          'Upload Post / Creative',
          'Approved Posts',
          'Rejected Posts / Revisions',
        ],
      },
      {
        id: 'sales',
        name: 'Sales Department',
        icon: '💼',
        path: '/sales',
        roleBadge: 'Sales Executive',
        color: '#10b981',
        defaultUser: {
          username: 'sales',
          email: 'sales@admafia.marketing',
          password: 'Sales@2026!',
          role: 'Sales Executive',
          title: 'Sales Executives, Telecallers & Closers',
        },
        desks: [
          'Sales Executive Dashboard',
          'Customer Groups Desk',
          'Lead Qualification & Follow-up Desks',
        ],
      },
    ],
  });
});

app.post('/api/auth/admin-login', async (req, res) => {
  try {
    const { identifier, username, password } = req.body || {};
    const q = String(identifier || username || '').trim().toLowerCase();
    if (!q) {
      return res.status(400).json({ ok: false, error: 'Username, employee email, or mobile number is required.' });
    }
    if (!password) {
      return res.status(400).json({ ok: false, error: 'Password is required.' });
    }

    const cleanPhone = q.replace(/\D/g, '').slice(-10);

    const userCheck = await query(
      `SELECT id, customer_id, full_name, email, username, phone, password_hash, role, COALESCE(department, '') as department, permissions, status
       FROM system_users
       WHERE LOWER(username) = $1 OR LOWER(email) = $1 OR (length($2) = 10 AND phone = $2)
       LIMIT 1`,
      [q, cleanPhone]
    );

    if (userCheck.rowCount === 0) {
      return res.status(404).json({
        ok: false,
        error: 'No administrator or department account found matching these credentials. Please check your username, email, or mobile number.',
      });
    }

    const uRow = userCheck.rows[0];

    if (uRow.password_hash !== password) {
      return res.status(401).json({ ok: false, error: 'Incorrect password for this administrator account.' });
    }

    if (uRow.status === 'suspended' || uRow.status === 'inactive') {
      return res.status(403).json({
        ok: false,
        error: 'Access Suspended: This department administrator account has been deactivated or suspended.',
      });
    }

    await query(`UPDATE system_users SET last_login_at = NOW() WHERE id = $1`, [uRow.id]).catch(() => { });

    // Determine target department and landing route
    let department = uRow.department;
    let targetUrl = '/superadmin';
    const role = uRow.role || '';
    const rLower = role.toLowerCase();
    const dLower = (department || '').toLowerCase();

    if (dLower === 'marketing' || rLower.includes('marketing') || rLower.includes('campaign')) {
      department = 'Marketing';
      targetUrl = '/marketing';
    } else if (dLower === 'graphics' || rLower.includes('graphic') || rLower.includes('creative') || rLower.includes('designer')) {
      department = 'Graphics';
      targetUrl = '/graphics';
    } else if (dLower === 'sales' || rLower.includes('sales') || rLower.includes('telecaller')) {
      department = 'Sales';
      targetUrl = '/sales';
    } else if (rLower.includes('client') || rLower.includes('business') || rLower === 'staff') {
      department = 'Customer Portal';
      targetUrl = '/portal';
    } else {
      department = 'Super Admin';
      targetUrl = '/superadmin';
    }

    let parsedPermissions = [];
    try {
      parsedPermissions = typeof uRow.permissions === 'string' ? JSON.parse(uRow.permissions) : (uRow.permissions || []);
    } catch (e) {
      parsedPermissions = [uRow.permissions];
    }

    const token = `adm_token_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    res.json({
      ok: true,
      token,
      targetUrl,
      department,
      user: {
        id: uRow.id,
        fullName: uRow.full_name,
        username: uRow.username,
        email: uRow.email,
        phone: uRow.phone,
        role: uRow.role,
        department,
        permissions: parsedPermissions,
        customerId: uRow.customer_id,
      },
    });
  } catch (err) {
    console.error('[POST /api/auth/admin-login]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/auth/admin-session', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '').trim();
    const userId = req.headers['x-admin-id'] || req.query.userId;

    if (!userId && !token) {
      return res.status(401).json({ ok: false, error: 'No active session token provided.' });
    }

    let userCheck;
    if (userId) {
      userCheck = await query(`SELECT id, full_name, email, username, phone, role, COALESCE(department, '') as department, permissions, status FROM system_users WHERE id = $1 LIMIT 1`, [userId]);
    } else {
      userCheck = await query(`SELECT id, full_name, email, username, phone, role, COALESCE(department, '') as department, permissions, status FROM system_users WHERE status = 'active' ORDER BY last_login_at DESC NULLS LAST LIMIT 1`);
    }

    if (userCheck.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Session user record not found.' });
    }

    const u = userCheck.rows[0];
    res.json({
      ok: true,
      user: {
        id: u.id,
        fullName: u.full_name,
        email: u.email,
        username: u.username,
        phone: u.phone,
        role: u.role,
        department: u.department || 'Super Admin',
        status: u.status,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// =============================================================================
// 3. CUSTOMERS & ISOLATED WORKSPACE DATA (/api/customers)
// =============================================================================
app.get('/api/customers', async (req, res) => {
  try {
    const result = await query('SELECT * FROM vw_sales_customer_accounts ORDER BY registered_at DESC');
    res.json({ ok: true, customers: result.rows.map((r) => mapCustomerRow(r)) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/customers/:identifier', async (req, res) => {
  try {
    const rawId = String(req.params.identifier || '').trim();
    const cleanPhone = rawId.replace(/\D/g, '').slice(-10);

    const viewRes = await query(
      `SELECT * FROM vw_sales_customer_accounts
       WHERE id = $1 OR phone = $2 OR LOWER(username) = LOWER($1)
       LIMIT 1`,
      [rawId, cleanPhone]
    );

    if (viewRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Customer not found' });
    }

    const customer = mapCustomerRow(viewRes.rows[0]);
    const [leadsRes, txRes, invRes] = await Promise.all([
      query(
        `SELECT * FROM leads 
         WHERE customer_id = $1 
            OR (customer_phone <> '' AND customer_phone = $2)
         ORDER BY created_at DESC`,
        [customer.id, customer.phone]
      ),
      query('SELECT * FROM wallet_transactions WHERE customer_id = $1 ORDER BY created_at DESC', [customer.id]),
      query('SELECT * FROM tax_invoices WHERE customer_id = $1 ORDER BY created_at DESC', [customer.id]),
    ]);

    res.json({
      ok: true,
      customer,
      leads: leadsRes.rows.map(mapLeadRow),
      transactions: txRes.rows.map(mapWalletTxRow),
      invoices: invRes.rows.map(mapInvoiceRow),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Admin Lookup: Direct Customer Password & Credentials Retrieval
app.get('/api/admin/customer-password/:identifier', async (req, res) => {
  try {
    const rawId = String(req.params.identifier || '').trim();
    const cleanPhone = rawId.replace(/\D/g, '').slice(-10);

    const lookupRes = await query(
      `SELECT id, username, phone, email, password_hash, company_name, contact_person
       FROM customers
       WHERE id = $1 OR phone = $2 OR LOWER(username) = LOWER($1)
       LIMIT 1`,
      [rawId, cleanPhone]
    );

    if (lookupRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Customer not found' });
    }

    const cust = lookupRes.rows[0];
    res.json({
      ok: true,
      id: cust.id,
      name: cust.company_name || cust.contact_person,
      username: cust.username,
      phone: cust.phone,
      email: cust.email,
      password: cust.password_hash || 'Password123!',
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Sales Desk: Retrieve All Failed Transactions Across All Customers with Contact Numbers & Reason
app.get('/api/sales/failed-transactions', async (req, res) => {
  try {
    const querySql = `
      SELECT 
        wt.id,
        wt.customer_id,
        wt.amount,
        wt.reference_utr,
        wt.description,
        wt.payment_method,
        wt.status,
        wt.created_at,
        c.id AS matched_cust_id,
        c.username,
        c.company_name,
        c.contact_person,
        c.phone,
        c.email,
        c.city,
        c.state,
        c.country,
        c.category
      FROM wallet_transactions wt
      LEFT JOIN customers c ON (
        wt.customer_id = c.id 
        OR wt.customer_id = c.phone 
        OR c.phone = RIGHT(REGEXP_REPLACE(wt.customer_id, '[^0-9]', '', 'g'), 10)
      )
      WHERE LOWER(wt.status) LIKE '%fail%' 
         OR LOWER(wt.tx_type) LIKE '%fail%'
         OR LOWER(wt.description) LIKE '%fail%'
         OR LOWER(wt.payment_method) LIKE '%fail%'
      ORDER BY wt.created_at DESC
    `;
    const result = await query(querySql);
    const mapped = result.rows.map((row) => {
      const cleanPhone = String(row.phone || row.customer_id || '').replace(/\D/g, '').slice(-10);
      const rawUser = String(row.username || '').trim();
      const capUser = rawUser ? rawUser.charAt(0).toUpperCase() + rawUser.slice(1) : '';

      const rawContact = String(row.contact_person || '').trim();
      const isGenericContact = !rawContact || rawContact.toLowerCase() === 'registered business' || rawContact.toLowerCase() === 'account admin';
      const properContact = (!isGenericContact ? rawContact : '') || capUser || (cleanPhone ? `Customer ${cleanPhone.slice(-4)}` : 'Client Admin');

      const rawCompany = String(row.company_name || '').trim();
      const isGenericCompany = !rawCompany || rawCompany.toLowerCase() === 'registered business' || rawCompany.toLowerCase() === 'corporate workspace';
      const properCompany = (!isGenericCompany ? rawCompany : '') || (capUser ? `${capUser} Enterprises` : '') || properContact;

      return {
        id: row.id,
        customerId: row.customer_id,
        customerName: properCompany,
        companyName: properCompany,
        contactPerson: properContact,
        username: rawUser,
        phone: cleanPhone || row.phone || '',
        email: row.email || '',
        city: row.city || '',
        state: row.state || 'Maharashtra',
        category: row.category || 'IT & Software',
        amount: Number(row.amount || 0),
        ref: row.reference_utr,
        desc: row.description,
        method: row.payment_method,
        status: row.status || 'Failed ✕',
        failureReason: row.description || 'Bank transaction declined by customer',
        date: row.created_at
          ? new Date(row.created_at).toLocaleString('en-IN', {
              timeZone: 'Asia/Kolkata',
              day: '2-digit',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              hour12: true,
            })
          : 'Recently Failed',
      };
    });
    res.json({ ok: true, failedTransactions: mapped });
  } catch (err) {
    console.error('[GET /api/sales/failed-transactions]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.put('/api/customers/:id/profile', async (req, res) => {
  try {
    const rawId = req.params.id;
    const {
      companyName,
      name,
      category = 'IT & Software',
      industry = 'Other',
      website = '',
      domain = '',
      contactPerson,
      contact,
      email = '',
      personalEmail = '',
      phone,
      city = '',
      state = 'Maharashtra',
      country = 'India',
    } = req.body || {};

    const cleanPhone = String(phone || rawId).replace(/\D/g, '').slice(-10);
    const lookupRes = await query(
      'SELECT id, phone FROM customers WHERE id = $1 OR phone = $2 LIMIT 1',
      [rawId, cleanPhone]
    );

    if (lookupRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Customer record not found' });
    }

    const custId = lookupRes.rows[0].id;
    const orgName = (companyName || name || '').trim() || 'Registered Business';
    const personName = (contactPerson || contact || '').trim() || orgName;
    const siteUrl = (website || domain || '').trim();

    await query(
      `UPDATE customers SET
        company_name = $1,
        category = $2,
        industry = $3,
        website = $4,
        contact_person = $5,
        email = $6,
        personal_email = $7,
        city = $8,
        state = $9,
        country = $10,
        profile_status = 'complete',
        kyc_percent = 100,
        verified = TRUE,
        completed_at = COALESCE(completed_at, NOW()),
        updated_at = NOW()
      WHERE id = $11`,
      [orgName, category, industry, siteUrl, personName, email, personalEmail, city, state, country, custId]
    );

    await query(
      `UPDATE pending_verifications SET
        company_name = $1,
        contact_person = $2,
        profile_status = 'complete',
        queue_type = CASE WHEN payment_status IN ('paid', 'verified') THEN 'Completed' ELSE 'Payment Pending' END
      WHERE customer_id = $3`,
      [orgName, personName, custId]
    );

    const viewRes = await query('SELECT * FROM vw_sales_customer_accounts WHERE id = $1', [custId]);
    res.json({ ok: true, customer: mapCustomerRow(viewRes.rows[0]) });
  } catch (err) {
    console.error('[PUT /api/customers/:id/profile]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

const handleUpdateCustomerRecord = async (req, res) => {
  try {
    const rawId = req.params.id;
    const cleanPhone = rawId.replace(/\D/g, '').slice(-10);
    const lookupRes = await query(
      'SELECT * FROM customers WHERE id = $1 OR phone = $2 LIMIT 1',
      [rawId, cleanPhone]
    );
    if (lookupRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Customer not found' });
    }
    const cust = lookupRes.rows[0];
    const updates = req.body || {};

    const nextStatus = updates.status || cust.status;
    const nextProfile = updates.profileStatus || updates.profile_status || cust.profile_status;
    const nextPayment = updates.paymentStatus || updates.payment_status || cust.payment_status;
    const nextKyc = updates.kycPercent !== undefined ? Number(updates.kycPercent) : Number(cust.kyc_percent);
    const nextCompany = updates.companyName || updates.name || cust.company_name;
    const nextWebsite = updates.website ?? updates.domain ?? cust.website;
    const nextPassword = (updates.password || updates.passwordPlain || updates.passwordHash || '').trim() || cust.password_hash;

    await query(
      `UPDATE customers SET
        company_name = $1,
        website = $2,
        status = $3,
        profile_status = $4,
        payment_status = $5,
        kyc_percent = $6,
        verified = (kyc_percent >= 100 OR profile_status = 'complete'),
        password_hash = $7,
        updated_at = NOW()
      WHERE id = $8`,
      [nextCompany, nextWebsite, nextStatus, nextProfile, nextPayment, nextKyc, nextPassword, cust.id]
    );

    if (
      updates.dailyAdSpend !== undefined ||
      updates.adCampaignActive !== undefined ||
      updates.balance !== undefined ||
      updates.activeDays !== undefined ||
      updates.schedulePreset !== undefined
    ) {
      const walRes = await query('SELECT * FROM wallets WHERE customer_id = $1', [cust.id]);
      if (walRes.rowCount > 0) {
        const w = walRes.rows[0];
        const nextDaily = updates.dailyAdSpend !== undefined ? Math.max(300, Number(updates.dailyAdSpend)) : Number(w.daily_ad_spend);
        const nextActive = updates.adCampaignActive !== undefined ? Boolean(updates.adCampaignActive) : Boolean(w.ad_campaign_active);
        const nextBal = updates.balance !== undefined ? Math.max(0, Number(updates.balance)) : Number(w.available_balance);

        // Security / Financial Safety Rule: Enforce that booked days cannot be removed via direct API call
        const kolkataNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
        const todayCode = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][kolkataNow.getDay()];
        const isDeductedToday = Boolean(
          w.last_deducted_at &&
          new Date(w.last_deducted_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) ===
          kolkataNow.toLocaleDateString('en-CA')
        );

        let finalDaysArray = updates.activeDays !== undefined
          ? (Array.isArray(updates.activeDays)
              ? updates.activeDays.map(d => String(d).trim().toUpperCase()).filter(Boolean)
              : String(updates.activeDays).split(',').map(d => d.trim().toUpperCase()).filter(Boolean))
          : (w.active_days ? w.active_days.split(',').map(d => d.trim().toUpperCase()).filter(Boolean) : [todayCode]);
        if (finalDaysArray.length === 5 && finalDaysArray.includes('MON') && finalDaysArray.includes('TUE') && finalDaysArray.includes('WED') && finalDaysArray.includes('THU') && finalDaysArray.includes('FRI')) {
          finalDaysArray = [todayCode];
        }

        const bookedDatesList = (w.booked_dates || '').split(',').map((s) => s.trim()).filter(Boolean);
        if (isDeductedToday) {
          bookedDatesList.push(kolkataNow.toLocaleDateString('en-CA'));
        }

        const dayOfWeek = kolkataNow.getDay();
        const distToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const monday = new Date(kolkataNow);
        monday.setDate(kolkataNow.getDate() + distToMonday);
        monday.setHours(0, 0, 0, 0);

        const weekDayCodes = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
        for (let i = 0; i < 7; i++) {
          const cur = new Date(monday);
          cur.setDate(monday.getDate() + i);
          const iso = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
          if (bookedDatesList.includes(iso)) {
            const lockedCode = weekDayCodes[i];
            if (!finalDaysArray.includes(lockedCode)) {
              finalDaysArray.push(lockedCode);
            }
          }
        }

        const nextDays = finalDaysArray.join(',');
        const nextPreset = updates.schedulePreset || w.schedule_preset || 'weekdays';
        await query(
          `UPDATE wallets SET daily_ad_spend = $1::NUMERIC, ad_campaign_active = $2::BOOLEAN, available_balance = $3::NUMERIC, active_days = $4::VARCHAR, schedule_preset = $5::VARCHAR, updated_at = NOW() WHERE customer_id = $6`,
          [nextDaily, nextActive, nextBal, String(nextDays), String(nextPreset), cust.id]
        );
      }
    }

    const viewRes = await query('SELECT * FROM vw_sales_customer_accounts WHERE id = $1', [cust.id]);
    res.json({
      ok: true,
      customer: mapCustomerRow(viewRes.rows[0], nextPassword),
      loginPassword: nextPassword,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
};

app.patch('/api/customers/:id', handleUpdateCustomerRecord);
app.put('/api/customers/:id', handleUpdateCustomerRecord);

app.delete('/api/customers/:identifier', async (req, res) => {
  try {
    const rawId = String(req.params.identifier || '').trim();
    const cleanPhone = rawId.replace(/\D/g, '').slice(-10);
    const lookupRes = await query(
      'SELECT id FROM customers WHERE id = $1 OR phone = $2 OR LOWER(username) = LOWER($1) LIMIT 1',
      [rawId, cleanPhone]
    );
    if (lookupRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Customer not found' });
    }
    const custId = lookupRes.rows[0].id;
    await query('DELETE FROM customers WHERE id = $1', [custId]);
    res.json({ ok: true, deletedId: custId });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// =============================================================================
// 4. WALLET TOP-UP, DAILY AD SPEND DEDUCTION & INVOICES (/api/wallets)
// =============================================================================
app.post('/api/payments/razorpay/order', async (req, res) => {
  try {
    if (!razorpayKeyId || !razorpayKeySecret) {
      return res.status(503).json({ ok: false, error: 'Razorpay is not configured on the server.' });
    }
    const amount = Number(req.body?.amount);
    if (!Number.isSafeInteger(amount) || amount < 300 || amount > 1000000) {
      return res.status(400).json({ ok: false, error: 'Enter an amount from ₹300 to ₹10,00,000.' });
    }
    const cleanPhone = String(req.body?.phone || req.body?.customerId || '').replace(/\D/g, '').slice(-10);
    let customer = await query(
      `SELECT id, phone, username, contact_person, email, company_name FROM customers
       WHERE id = $1 OR phone = $2 OR LOWER(username) = LOWER($3) LIMIT 1`,
      [req.body?.customerId || '', cleanPhone, req.body?.username || '']
    );

    if (!customer.rowCount) {
      const fallbackPhone = cleanPhone || '9999999999';
      const newCustId = req.body?.customerId && !String(req.body.customerId).startsWith('rzp_') ? req.body.customerId : `cust_${Date.now()}`;
      const newName = req.body?.contactPerson || req.body?.username || `Client ${fallbackPhone.slice(-4)}`;
      await query(
        `INSERT INTO customers (id, phone, username, contact_person, company_name, email, status, payment_status)
         VALUES ($1, $2, $3, $4, $5, $6, 'active', 'pending')
         ON CONFLICT DO NOTHING`,
        [newCustId, fallbackPhone, req.body?.username || fallbackPhone, newName, req.body?.companyName || newName, req.body?.email || `${fallbackPhone}@client.admafia.marketing`]
      ).catch(() => {});
      customer = await query(
        `SELECT id, phone, username, contact_person, email, company_name FROM customers
         WHERE id = $1 OR phone = $2 OR LOWER(username) = LOWER($3) LIMIT 1`,
        [newCustId, fallbackPhone, req.body?.username || '']
      );
    }

    const cust = customer.rowCount ? customer.rows[0] : {
      id: req.body?.customerId || `cust_${Date.now()}`,
      phone: cleanPhone || '9999999999',
      username: req.body?.username || 'client',
      contact_person: req.body?.contactPerson || 'Client',
      company_name: 'AdMafia Client',
      email: `${cleanPhone || 'client'}@admafia.marketing`,
    };

    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amount * 100,
        currency: 'INR',
        receipt: `admafia_${Date.now()}`,
        notes: {
          customer_id: String(cust.id),
          customer_phone: cleanPhone || String(cust.phone || ''),
          customer_username: String(cust.username || ''),
        },
      }),
    });
    const order = await response.json();
    if (!response.ok || !order.id) {
      console.error('[Razorpay] Order creation failed:', order.error?.description || response.status);
      return res.status(502).json({ ok: false, error: order.error?.description || 'Could not start Razorpay checkout. Please try again.' });
    }
    res.status(201).json({
      ok: true,
      keyId: razorpayKeyId,
      orderId: order.id,
      amount: order.amount,
      amountRupees: amount,
      currency: order.currency,
      customer: cust,
      mode: razorpayKeyId.startsWith('rzp_live_') ? 'LIVE MODE' : 'TEST MODE',
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Public gateway config for UI (never leaks secrets)
app.get('/api/payments/razorpay/config', (req, res) => {
  res.json({
    ok: true,
    ...getRazorpayConfigInfo(),
  });
});

app.post('/api/payments/razorpay/payment-link', async (req, res) => {
  try {
    if (!razorpayKeyId || !razorpayKeySecret) {
      return res.status(503).json({ ok: false, error: 'Razorpay is not configured on the server.' });
    }
    const amount = Number(req.body?.amount);
    if (!Number.isSafeInteger(amount) || amount < 300 || amount > 1000000) {
      return res.status(400).json({ ok: false, error: 'Enter an amount from ₹300 to ₹10,00,000.' });
    }
    const cleanPhone = String(req.body?.phone || req.body?.customerId || '').replace(/\D/g, '').slice(-10);
    let customer = await query(
      `SELECT id, phone, username, contact_person, email, company_name FROM customers
       WHERE id = $1 OR phone = $2 OR LOWER(username) = LOWER($3) LIMIT 1`,
      [req.body?.customerId || '', cleanPhone, req.body?.username || '']
    );
    if (!customer.rowCount) {
      if (cleanPhone || req.body?.username) {
        const newCustId = req.body?.customerId && !String(req.body.customerId).startsWith('rzp_') ? req.body.customerId : `cust_${Date.now()}`;
        const newPhone = cleanPhone || '9999999999';
        const newName = req.body?.contactPerson || req.body?.username || `Client ${newPhone.slice(-4)}`;
        await query(
          `INSERT INTO customers (id, phone, username, contact_person, company_name, email, status, payment_status)
           VALUES ($1, $2, $3, $4, $5, $6, 'active', 'pending')
           ON CONFLICT DO NOTHING`,
          [newCustId, newPhone, req.body?.username || newPhone, newName, req.body?.companyName || newName, req.body?.email || `${newPhone}@client.admafia.marketing`]
        ).catch(() => {});
        customer = await query(
          `SELECT id, phone, username, contact_person, email, company_name FROM customers
           WHERE id = $1 OR phone = $2 OR LOWER(username) = LOWER($3) LIMIT 1`,
          [newCustId, newPhone, req.body?.username || '']
        );
      }
    }
    if (!customer.rowCount) {
      return res.status(404).json({ ok: false, error: 'Customer account not found.' });
    }
    const cust = customer.rows[0];

    const hostHeader = req.get('x-forwarded-host') || req.get('host') || 'admafia.marketing';
    const protoHeader = req.get('x-forwarded-proto') || (hostHeader.includes('localhost') ? 'http' : 'https');
    const baseUrl = `${protoHeader}://${hostHeader}`;
    const callbackUrl = `${baseUrl}/api/payments/razorpay/callback`;

    const response = await fetch('https://api.razorpay.com/v1/payment_links', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amount * 100,
        currency: 'INR',
        accept_partial: false,
        reference_id: `plink_ref_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        description: `AdMafia Instant Wallet Top-Up (₹${amount.toLocaleString('en-IN')})`,
        customer: {
          name: cust.contact_person || cust.company_name || cust.username || 'Customer',
          contact: cleanPhone || cust.phone || '9999999999',
          email: cust.email || 'support@admafia.marketing',
        },
        notify: { sms: false, email: false },
        reminder_enable: false,
        notes: {
          customer_id: String(cust.id),
          customer_phone: cleanPhone || String(cust.phone || ''),
          customer_username: String(cust.username || ''),
        },
        callback_url: callbackUrl,
        callback_method: 'get',
      }),
    });

    const plink = await response.json();
    if (!response.ok || !plink.id || !plink.short_url) {
      console.error('[Razorpay Payment Link] Creation failed:', plink.error?.description || response.status);
      return res.status(502).json({
        ok: false,
        error: plink.error?.description || 'Could not generate Razorpay payment link. Please try again.',
      });
    }

    res.status(201).json({
      ok: true,
      paymentLinkId: plink.id,
      paymentUrl: plink.short_url,
      short_url: plink.short_url,
      url: plink.short_url,
      amount,
      currency: plink.currency || 'INR',
      keyId: razorpayKeyId,
      mode: razorpayKeyId.startsWith('rzp_live_') ? 'LIVE MODE' : 'TEST MODE',
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Authoritative Atomic Wallet Crediting Engine
export async function creditCustomerWallet({
  customerId,
  phone,
  username,
  amount,
  referenceUtr,
  paymentMethod = 'Razorpay Secure (UPI/Card)',
  description,
}) {
  const cleanAmount = Number(amount || 0);
  if (!Number.isSafeInteger(cleanAmount) || cleanAmount < 300) {
    throw new Error('Minimum wallet top-up amount is ₹300.');
  }

  const cleanPhone = String(phone || customerId || '').replace(/\D/g, '').slice(-10);
  const utr = String(referenceUtr || `rzp_${Date.now()}`).trim();

  return await withTransaction(async (txQuery) => {
    // 1. Resolve customer
    let custRes = await txQuery(
      `SELECT * FROM customers
       WHERE id = $1 OR phone = $2 OR LOWER(username) = LOWER($3)
       LIMIT 1`,
      [customerId || '', cleanPhone, username || '']
    );

    if (custRes.rowCount === 0) {
      const fallbackId = customerId || `cust_${cleanPhone || Date.now()}`;
      await txQuery(
        `INSERT INTO customers (id, phone, username, contact_person, company_name, email, status, payment_status)
         VALUES ($1, $2, $3, $4, $5, $6, 'active', 'paid')
         ON CONFLICT (id) DO NOTHING`,
        [fallbackId, cleanPhone || '9999999999', username || cleanPhone || fallbackId, `Client ${cleanPhone || fallbackId}`, `Business ${cleanPhone || fallbackId}`, `${cleanPhone || fallbackId}@client.admafia.marketing`]
      );
      custRes = await txQuery(`SELECT * FROM customers WHERE id = $1 OR phone = $2 LIMIT 1`, [fallbackId, cleanPhone]);
    }

    if (custRes.rowCount === 0) {
      throw new Error(`Customer account not found for wallet credit (ID: ${customerId || 'N/A'}, Phone: ${cleanPhone || 'N/A'}).`);
    }

    const cust = custRes.rows[0];

    // 2. Check for duplicate credit idempotency using row lock
    const existingTx = await txQuery(
      `SELECT id, amount, balance_after, status, reference_utr
       FROM wallet_transactions
       WHERE reference_utr = $1 FOR UPDATE LIMIT 1`,
      [utr]
    );

    if (existingTx.rowCount > 0 && String(existingTx.rows[0].status).includes('Verified')) {
      const walRes = await txQuery('SELECT available_balance FROM wallets WHERE customer_id = $1 LIMIT 1', [cust.id]);
      const viewRes = await txQuery('SELECT * FROM vw_sales_customer_accounts WHERE id = $1', [cust.id]);
      return {
        ok: true,
        alreadyCredited: true,
        customerId: cust.id,
        walletBalance: Number(walRes.rows[0]?.available_balance || 0),
        customer: mapCustomerRow(viewRes.rows[0]),
        transaction: mapWalletTxRow(existingTx.rows[0]),
        message: 'Payment already credited idempotently.',
      };
    }

    // 3. Upsert wallet balance atomically
    const walRes = await txQuery(
      `INSERT INTO wallets (
        id, customer_id, available_balance, daily_ad_spend, total_lifetime_paid, ad_campaign_active
      ) VALUES ($1, $2, $3, 300.00, $3, TRUE)
      ON CONFLICT (customer_id) DO UPDATE SET
        available_balance = wallets.available_balance + EXCLUDED.available_balance,
        total_lifetime_paid = wallets.total_lifetime_paid + EXCLUDED.total_lifetime_paid,
        ad_campaign_active = TRUE,
        updated_at = NOW()
      RETURNING *`,
      [`wal_${Date.now()}`, cust.id, cleanAmount]
    );

    const newBalance = Number(walRes.rows[0]?.available_balance || cleanAmount);
    const walletId = walRes.rows[0]?.id || null;

    // 4. Mark customer payment_status = 'paid'
    await txQuery(
      `UPDATE customers SET payment_status = 'paid', updated_at = NOW() WHERE id = $1`,
      [cust.id]
    );

    // 5. Insert or update wallet transaction with 'Verified ✓'
    const txId = `tx_${Date.now()}`;
    const txDesc = description || `Ad Wallet Balance Top-Up (₹${cleanAmount.toLocaleString('en-IN')} Added)`;
    const txInsert = await txQuery(
      `INSERT INTO wallet_transactions (
        id, customer_id, wallet_id, tx_type, amount, balance_after, reference_utr, description, payment_method, status
      ) VALUES ($1, $2, $3, 'Credit', $4, $5, $6, $7, $8, 'Verified ✓')
      ON CONFLICT (reference_utr) DO UPDATE SET
        balance_after = EXCLUDED.balance_after,
        status = 'Verified ✓',
        description = EXCLUDED.description,
        payment_method = EXCLUDED.payment_method
      RETURNING *`,
      [txId, cust.id, walletId, cleanAmount, newBalance, utr, txDesc, paymentMethod]
    );

    // 6. Insert payment_records for Sales Desk (/sales#payments)
    const payId = `pay_${Date.now()}`;
    const receiptNo = `RCP-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
    const payInsert = await txQuery(
      `INSERT INTO payment_records (
        id, receipt_number, customer_id, company_name, contact_person, phone, city,
        tx_type, amount, gst_amount, total_amount, payment_mode, utr_reference, status, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'topup', $8, 0, $8, $9, $10, 'paid', $11)
      ON CONFLICT DO NOTHING
      RETURNING *`,
      [
        payId,
        receiptNo,
        cust.id,
        cust.company_name,
        cust.contact_person,
        cust.phone,
        cust.city || 'India',
        cleanAmount,
        paymentMethod,
        utr,
        `Wallet Top-Up (+₹${cleanAmount.toLocaleString('en-IN')})`,
      ]
    );

    // 7. Insert tax invoice with SAC code breakdown
    const invId = `inv_${Date.now()}`;
    const invoiceNo = `INV-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
    const baseAmt = Math.round(cleanAmount / 1.18);
    const cgstAmt = Math.round((cleanAmount - baseAmt) / 2);
    const sgstAmt = cleanAmount - baseAmt - cgstAmt;

    const invInsert = await txQuery(
      `INSERT INTO tax_invoices (
        id, invoice_no, customer_id, payment_record_id, particulars, sac_code,
        base_amount, cgst_amount, sgst_amount, total_amount, payment_mode, status
      ) VALUES ($1, $2, $3, $4, $5, '998311', $6, $7, $8, $9, $10, 'Paid')
      ON CONFLICT DO NOTHING
      RETURNING *`,
      [
        invId,
        invoiceNo,
        cust.id,
        payId,
        'Meta Ads Campaign Ad Spend Budget Credit',
        baseAmt,
        cgstAmt,
        sgstAmt,
        cleanAmount,
        `${paymentMethod} (Ref: ${utr})`,
      ]
    );

    // 8. Sync Pending Verifications (Sales Desk 02)
    await txQuery(
      `UPDATE pending_verifications SET
        amount = $1,
        utr_number = $2,
        payment_status = 'paid',
        queue_type = CASE WHEN profile_status = 'complete' THEN 'Completed' ELSE 'Profile Only Incomplete' END,
        verified_at = NOW()
      WHERE customer_id = $3`,
      [cleanAmount, utr, cust.id]
    );

    const viewRes = await txQuery('SELECT * FROM vw_sales_customer_accounts WHERE id = $1', [cust.id]);

    return {
      ok: true,
      alreadyCredited: false,
      walletBalance: newBalance,
      customer: mapCustomerRow(viewRes.rows[0]),
      transaction: mapWalletTxRow(txInsert.rows[0]),
      paymentRecord: payInsert.rowCount ? mapPaymentRecordRow(payInsert.rows[0]) : null,
      invoice: invInsert.rowCount ? mapInvoiceRow(invInsert.rows[0]) : null,
      message: `₹${cleanAmount.toLocaleString('en-IN')} successfully credited to wallet.`,
    };
  });
}

app.get('/api/payments/razorpay/callback', async (req, res) => {
  const hostHeader = req.get('x-forwarded-host') || req.get('host') || 'admafia.marketing';
  const protoHeader = req.get('x-forwarded-proto') || (hostHeader.includes('localhost') ? 'http' : 'https');
  const baseUrl = `${protoHeader}://${hostHeader}`;

  try {
    const {
      razorpay_payment_id,
      razorpay_payment_link_id,
      razorpay_payment_link_reference_id,
      razorpay_payment_link_status,
      razorpay_signature,
    } = req.query || {};

    const paymentId = String(razorpay_payment_id || '').trim();
    const paymentLinkId = String(razorpay_payment_link_id || '').trim();
    const linkRefId = String(razorpay_payment_link_reference_id || '').trim();
    const status = String(razorpay_payment_link_status || '').toLowerCase().trim();
    const signature = String(razorpay_signature || '').trim();

    // Verify Payment Link HMAC SHA-256 signature if signature params are present
    if (signature && paymentLinkId && linkRefId && status && paymentId) {
      const payload = `${paymentLinkId}|${linkRefId}|${status}|${paymentId}`;
      const expected = createHmac('sha256', razorpayKeySecret).update(payload).digest('hex');
      let valid = false;
      try {
        valid = timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
      } catch {
        valid = false;
      }
      if (!valid) {
        console.warn('[Razorpay Callback] Invalid Payment Link HMAC signature:', signature);
        return res.redirect(303, `${baseUrl}/app/lead?payment_status=failed&reason=Invalid+payment+signature#app/wallet`);
      }
    }

    if (status !== 'paid' || !paymentId) {
      const failReason = status === 'cancelled' ? 'Payment Cancelled' : (status === 'failed' ? 'Transaction Failed' : 'Payment cancelled or declined');
      let customerId = null;
      if (paymentLinkId) {
        try {
          const plinkResp = await fetch(`https://api.razorpay.com/v1/payment_links/${encodeURIComponent(paymentLinkId)}`, {
            headers: { Authorization: `Basic ${Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString('base64')}` },
          });
          const plinkData = await plinkResp.json();
          customerId = plinkData?.notes?.customer_id;
        } catch (e) {}
      }
      if (customerId) {
        await query(
          `INSERT INTO wallet_transactions (
            id, customer_id, tx_type, amount, balance_after, reference_utr, description, payment_method, status
          ) VALUES ($1, $2, 'Credit', 0, 0, $3, $4, 'Razorpay Secure (Failed)', 'Failed ✕')
          ON CONFLICT (reference_utr) DO NOTHING`,
          [
            `tx_fail_${Date.now()}`,
            customerId,
            paymentId || `FAIL_${Date.now()}`,
            `Online recharge ${failReason.toLowerCase()}`,
          ]
        ).catch(() => {});
      }
      return res.redirect(303, `${baseUrl}/app/lead?payment_status=failed&reason=${encodeURIComponent(failReason)}#app/wallet`);
    }

    // Verify payment directly with Razorpay API (Server-to-Server trusted evidence)
    const paymentResp = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: `Basic ${Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString('base64')}` },
    });
    const payment = await paymentResp.json();

    if (!paymentResp.ok || payment.status !== 'captured') {
      console.warn('[Razorpay Callback] Payment not captured:', paymentId, payment.status);
      return res.redirect(303, `${baseUrl}/app/lead?payment_status=failed&payment_id=${paymentId}&reason=Payment+not+captured#app/wallet`);
    }

    const cleanAmount = Number(payment.amount || 0) / 100;
    if (cleanAmount < 300) {
      return res.redirect(303, `${baseUrl}/app/lead?payment_status=failed&payment_id=${paymentId}&reason=Amount+below+minimum#app/wallet`);
    }

    // Resolve customer identity from payment notes or contact
    let customerId = payment.notes?.customer_id;
    let custPhone = String(payment.contact || '').replace(/\D/g, '').slice(-10);

    if (paymentLinkId) {
      try {
        const plinkResp = await fetch(`https://api.razorpay.com/v1/payment_links/${encodeURIComponent(paymentLinkId)}`, {
          headers: { Authorization: `Basic ${Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString('base64')}` },
        });
        const plinkData = await plinkResp.json();
        if (plinkData?.notes?.customer_id) {
          customerId = customerId || plinkData.notes.customer_id;
        }
        if (plinkData?.notes?.customer_phone) {
          custPhone = custPhone || plinkData.notes.customer_phone;
        }
      } catch (e) {}
    }

    let targetCustId = null;
    const custRes = await query(
      `SELECT id FROM customers WHERE id = $1 OR phone = $2 LIMIT 1`,
      [customerId || '', custPhone]
    );

    if (custRes.rowCount > 0) {
      targetCustId = custRes.rows[0].id;
    } else {
      targetCustId = customerId || `cust_${custPhone || Date.now()}`;
    }

    // Credit the wallet idempotently via atomic database transaction
    await creditCustomerWallet({
      customerId: targetCustId,
      amount: cleanAmount,
      referenceUtr: paymentId,
      paymentMethod: payment.method ? `Razorpay ${payment.method.toUpperCase()}` : 'Razorpay Secure (UPI/Card)',
      description: `AdMafia wallet top-up (₹${cleanAmount.toLocaleString('en-IN')})`,
    });

    return res.redirect(
      303,
      `${baseUrl}/app/lead?payment_status=success&payment_id=${encodeURIComponent(paymentId)}&amount=${cleanAmount}#app/wallet`
    );
  } catch (err) {
    console.error('[Razorpay Callback Error]', err);
    return res.redirect(303, `${baseUrl}/app/lead?payment_status=failed&reason=${encodeURIComponent(err.message)}#app/wallet`);
  }
});

app.post('/api/payments/razorpay/verify', async (req, res) => {
  try {
    if (!razorpayKeySecret) return res.status(503).json({ ok: false, error: 'Razorpay is not configured on the server.' });
    const { orderId, paymentId, signature, customerId, phone, username, amount } = req.body || {};
    if (!orderId || !paymentId || !signature) return res.status(400).json({ ok: false, error: 'Missing Razorpay payment verification details.' });
    const expected = createHmac('sha256', razorpayKeySecret).update(`${orderId}|${paymentId}`).digest();
    let received;
    try { received = Buffer.from(signature, 'hex'); } catch { received = Buffer.alloc(0); }
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
      return res.status(400).json({ ok: false, error: 'Razorpay payment signature is invalid.' });
    }
    const paymentResponse = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: `Basic ${Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString('base64')}` },
    });
    const payment = await paymentResponse.json();
    if (!paymentResponse.ok || payment.order_id !== orderId || payment.status !== 'captured' || payment.amount !== Number(amount) * 100) {
      return res.status(400).json({ ok: false, error: 'Payment is not captured for this amount.' });
    }
    const cleanPhone = String(phone || customerId || payment.contact || '').replace(/\D/g, '').slice(-10);
    const targetCustId = customerId || payment.notes?.customer_id || `cust_${cleanPhone || Date.now()}`;

    const result = await creditCustomerWallet({
      customerId: targetCustId,
      phone: cleanPhone,
      username: username || payment.notes?.customer_username,
      amount: Number(amount),
      referenceUtr: paymentId,
      paymentMethod: payment.method ? `Razorpay ${payment.method.toUpperCase()}` : 'Razorpay Secure (UPI/Card)',
      description: `AdMafia wallet top-up (₹${Number(amount).toLocaleString('en-IN')})`,
    });
    return res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/payments/razorpay/webhook', async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || razorpayKeySecret;
    if (!signature || !secret) {
      return res.status(400).json({ ok: false, error: 'Missing webhook signature or secret.' });
    }
    const rawPayload = req.rawBody || (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
    const shasum = createHmac('sha256', secret);
    shasum.update(rawPayload);
    const digest = shasum.digest('hex');
    let valid = false;
    try {
      valid = timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
    } catch {
      valid = false;
    }
    if (!valid) {
      return res.status(400).json({ ok: false, error: 'Invalid webhook signature.' });
    }

    const event = req.body?.event;
    if (event === 'payment.captured') {
      const payment = req.body?.payload?.payment?.entity;
      const paymentId = payment?.id;
      const amount = Number(payment?.amount || 0) / 100;
      const customerId = payment?.notes?.customer_id;

      if (customerId && amount >= 300) {
        await creditCustomerWallet({
          customerId,
          amount,
          referenceUtr: paymentId,
          paymentMethod: payment.method ? `Razorpay ${payment.method.toUpperCase()}` : 'Razorpay Secure (UPI/Card)',
          description: `AdMafia wallet top-up (₹${amount.toLocaleString('en-IN')})`,
        }).catch((e) => console.error('[Razorpay Webhook Top-Up]', e));
      }
    } else if (event === 'payment.failed') {
      const payment = req.body?.payload?.payment?.entity;
      const customerId = payment?.notes?.customer_id;
      if (customerId && payment?.id) {
        const failAmount = Number(payment.amount || 0) / 100;
        await query(
          `INSERT INTO wallet_transactions (
            id, customer_id, tx_type, amount, balance_after, reference_utr, description, payment_method, status
          ) VALUES ($1, $2, 'Credit', $3, 0, $4, $5, 'Razorpay Secure (Failed)', 'Failed ✕')
          ON CONFLICT (reference_utr) DO NOTHING`,
          [
            `tx_fail_${Date.now()}`,
            customerId,
            failAmount,
            payment.id,
            `Online recharge failed: ${payment.error_description || payment.error_reason || 'Payment declined'}`,
          ]
        ).catch(() => {});
      }
    }
    res.json({ ok: true, status: 'processed' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/wallets/topup', async (req, res) => {
  if (req.get('X-Internal-Wallet-Credit') !== walletCreditToken) {
    return res.status(410).json({ ok: false, error: 'Direct wallet credits are disabled. Use a verified payment flow.' });
  }
  try {
    const result = await creditCustomerWallet(req.body);
    res.status(result.alreadyCredited ? 200 : 201).json(result);
  } catch (err) {
    console.error('[POST /api/wallets/topup]', err);
    res.status(err.message.includes('not found') ? 404 : 400).json({ ok: false, error: err.message });
  }
});

// Record failed / declined payment attempts into customer wallet transaction ledger
app.post('/api/wallets/failed-transaction', async (req, res) => {
  try {
    const { customerId, phone, username, amount, referenceUtr, description, paymentMethod, failureReason } = req.body || {};
    const cleanPhone = String(phone || customerId || '').replace(/\D/g, '').slice(-10);
    const custRes = await query(
      `SELECT * FROM customers WHERE id = $1 OR phone = $2 OR LOWER(username) = LOWER($3) LIMIT 1`,
      [customerId || '', cleanPhone, username || '']
    );
    if (!custRes.rowCount) {
      return res.status(404).json({ ok: false, error: 'Customer not found' });
    }
    const cust = custRes.rows[0];
    const walRes = await query('SELECT id, available_balance FROM wallets WHERE customer_id = $1 LIMIT 1', [cust.id]);
    const walletId = walRes.rows[0]?.id || null;
    const currentBal = Number(walRes.rows[0]?.available_balance || 0);
    const cleanAmount = Number(amount || 0);
    const txId = `tx_fail_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const utr = (referenceUtr || `FAIL-${Date.now().toString().slice(-6)}`).trim();
    const reasonText = failureReason || 'Payment declined by bank or cancelled';
    const txDesc = description || `Wallet recharge attempt failed: ${reasonText}`;
    const meth = paymentMethod || 'Razorpay Gateway';

    const txInsert = await query(
      `INSERT INTO wallet_transactions (
        id, customer_id, wallet_id, tx_type, amount, balance_after, reference_utr, description, payment_method, status
      ) VALUES ($1, $2, $3, 'Credit', $4, $5, $6, $7, $8, 'Failed ✕')
      RETURNING *`,
      [txId, cust.id, walletId, cleanAmount > 0 ? cleanAmount : 300, currentBal, utr, txDesc, meth]
    );

    res.json({
      ok: true,
      transaction: mapWalletTxRow(txInsert.rows[0]),
    });
  } catch (err) {
    console.error('[POST /api/wallets/failed-transaction]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/wallets/deduct', async (req, res) => {
  try {
    const { customerId, phone, username, amount, activeDays, force, manual } = req.body || {};
    const cleanPhone = String(phone || customerId || '').replace(/\D/g, '').slice(-10);

    const custRes = await query(
      `SELECT * FROM customers WHERE id = $1 OR phone = $2 OR LOWER(username) = LOWER($3) LIMIT 1`,
      [customerId || '', cleanPhone, username || '']
    );
    if (custRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Customer not found' });
    }
    const cust = custRes.rows[0];

    const result = await withTransaction(async (txQuery) => {
      const walRes = await txQuery('SELECT * FROM wallets WHERE customer_id = $1 FOR UPDATE', [cust.id]);
      if (walRes.rowCount === 0) {
        throw new Error('Wallet not found');
      }
      const wallet = walRes.rows[0];
      const spendAmt = Math.max(300, Number(amount || wallet?.daily_ad_spend || 300));
      const currentBal = Number(wallet?.available_balance || 0);

      const kolkataNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      const todayDayCode = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][kolkataNow.getDay()];
      const kolkataTodayStr = kolkataNow.toLocaleDateString('en-CA');

      // Financial Safety & Idempotency: Check if ad spend was already deducted for today in Asia/Kolkata
      const isAlreadyDeductedToday = Boolean(
        wallet?.last_deducted_at &&
        new Date(wallet.last_deducted_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) === kolkataTodayStr
      );

      const bookedDatesSet = new Set(
        (wallet?.booked_dates || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      );
      bookedDatesSet.add(kolkataTodayStr);
      const nextBookedDates = Array.from(bookedDatesSet).join(',');

      let finalActiveDays = wallet?.active_days || todayDayCode;
      const daySet = new Set(
        (Array.isArray(activeDays) && activeDays.length > 0 ? activeDays : finalActiveDays.split(','))
          .map((d) => String(d).trim().toUpperCase())
          .filter(Boolean)
      );
      daySet.add(todayDayCode);
      finalActiveDays = Array.from(daySet).join(',');

      if (isAlreadyDeductedToday && !force && !manual) {
        // Idempotent: Do not double-deduct wallet balance!
        await txQuery(
          `UPDATE wallets SET
            daily_ad_spend = $1::NUMERIC,
            ad_campaign_active = TRUE,
            active_days = $2::VARCHAR,
            booked_dates = $4::TEXT,
            updated_at = NOW()
          WHERE customer_id = $3`,
          [spendAmt, finalActiveDays, cust.id, nextBookedDates]
        );

        return {
          alreadyDeducted: true,
          balance: currentBal,
          walletBalance: currentBal,
          deducted: 0,
          dailyAdSpend: spendAmt,
          activeDays: Array.from(daySet),
          isDeductedToday: true,
          lastDeductedAt: wallet.last_deducted_at,
          message: "Today's ad budget is already booked and running. No duplicate deduction made.",
        };
      }

      if (currentBal < spendAmt) {
        const err = new Error(`Insufficient wallet balance (₹${currentBal}) for ₹${spendAmt} daily ad spend.`);
        err.statusCode = 400;
        throw err;
      }

      const nextBal = currentBal - spendAmt;

      await txQuery(
        `UPDATE wallets SET
          available_balance = $1::NUMERIC,
          daily_ad_spend = $2::NUMERIC,
          total_ad_spent = total_ad_spent + $2::NUMERIC,
          ad_campaign_active = TRUE,
          active_days = $4::VARCHAR,
          last_deducted_at = NOW(),
          booked_dates = $5::TEXT,
          updated_at = NOW()
        WHERE customer_id = $3`,
        [nextBal, spendAmt, cust.id, String(finalActiveDays), nextBookedDates]
      );

      // Also activate or update marketing campaigns if existing
      await txQuery(
        `UPDATE marketing_campaigns SET
          status = 'Running',
          external_platform_status = 'Active',
          daily_budget = $1,
          last_action = 'Campaign Live: Daily Spend Deducted',
          last_actor = 'Customer Self-Service Portal',
          last_action_at = NOW(),
          updated_at = NOW()
        WHERE customer_id = $2`,
        [spendAmt, cust.id]
      ).catch(() => {});

      const txId = `tx_deb_${Date.now()}`;
      const refUtr = `AUTO-AD-${Date.now()}`;
      const txInsert = await txQuery(
        `INSERT INTO wallet_transactions (
          id, customer_id, wallet_id, tx_type, amount, balance_after, reference_utr, description, payment_method, status
        ) VALUES ($1, $2, $3, 'Debit', $4, $5, $6, $7, 'Daily Auto-Debit', 'Settled ✓')
        RETURNING *`,
        [
          txId,
          cust.id,
          wallet.id,
          spendAmt,
          nextBal,
          refUtr,
          `Daily Meta Ads Campaign Spend Deduction (-₹${spendAmt}/day)`,
        ]
      );

      return {
        alreadyDeducted: false,
        balance: nextBal,
        walletBalance: nextBal,
        deducted: spendAmt,
        dailyAdSpend: spendAmt,
        activeDays: Array.from(daySet),
        isDeductedToday: true,
        transaction: mapWalletTxRow(txInsert.rows[0]),
      };
    });

    const viewRes = await query('SELECT * FROM vw_sales_customer_accounts WHERE id = $1', [cust.id]);
    res.json({
      ok: true,
      ...result,
      customer: mapCustomerRow(viewRes.rows[0]),
    });
  } catch (err) {
    const status = err.statusCode || (err.message && err.message.includes('Insufficient wallet balance') ? 400 : 500);
    res.status(status).json({ ok: false, error: err.message });
  }
});

// =============================================================================
// 5. LEADS PIPELINE (Strict Per-Account Isolation + Sales Desk 03 Dispatch)
// =============================================================================
app.get('/api/leads', async (req, res) => {
  try {
    const { customerId, phone, username } = req.query;
    if (customerId || phone || username) {
      const cleanPhone = String(phone || '').replace(/\D/g, '').slice(-10);
      const result = await query(
        `SELECT * FROM leads
         WHERE customer_id = $1
            OR ($2 <> '' AND customer_phone = $2)
            OR ($3 <> '' AND LOWER(customer_username) = LOWER($3))
         ORDER BY created_at DESC`,
        [customerId || '', cleanPhone, username || '']
      );
      return res.json({ ok: true, leads: result.rows.map(mapLeadRow) });
    }

    const allRes = await query('SELECT * FROM leads ORDER BY created_at DESC');
    res.json({ ok: true, leads: allRes.rows.map(mapLeadRow) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/leads', async (req, res) => {
  try {
    const {
      customerId,
      customerPhone,
      customerUsername,
      company,
      assignedCompany,
      phone,
      name,
      city = '',
      requirement = 'Inbound Meta Ads Campaign Enquiry',
      budget = '₹1.5L – ₹3.5L',
      source = 'Direct Intake',
      priority = 'Urgent',
      notes = '',
    } = req.body || {};

    const buyerDigits = String(phone || name || '').replace(/\D/g, '').slice(-10);
    if (buyerDigits.length !== 10 || !['6', '7', '8', '9'].includes(buyerDigits[0])) {
      return res.status(400).json({
        ok: false,
        error: 'Buyer phone number must be a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.',
      });
    }

    const targetCompany = (company || assignedCompany || '').trim();
    const cleanCustPhone = String(customerPhone || '').replace(/\D/g, '').slice(-10);

    // Match the registered customer in PostgreSQL
    const custRes = await query(
      `SELECT * FROM customers
       WHERE id = $1
          OR ($2 <> '' AND phone = $2)
          OR ($3 <> '' AND LOWER(username) = LOWER($3))
          OR ($4 <> '' AND LOWER(company_name) = LOWER($4))
       ORDER BY registered_at DESC
       LIMIT 1`,
      [customerId || '', cleanCustPhone, customerUsername || '', targetCompany]
    );

    if (custRes.rowCount === 0) {
      return res.status(404).json({
        ok: false,
        error: `No registered customer account found matching "${targetCompany}". Register the customer first.`,
      });
    }

    const cust = custRes.rows[0];
    const leadId = req.body.id || `lead_${Date.now()}`;
    const displayPhone = `+91 ${buyerDigits}`;

    const insertRes = await query(
      `INSERT INTO leads (
        id, customer_id, customer_phone, customer_username, company_name,
        buyer_phone, display_phone, buyer_name, buyer_email, city,
        requirement, budget, source, priority, status, is_hot, is_read, notes
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13, $14, 'new', TRUE, FALSE, $15
      )
      RETURNING *`,
      [
        leadId,
        cust.id,
        cust.phone,
        cust.username,
        cust.company_name,
        buyerDigits,
        displayPhone,
        name || displayPhone,
        `lead_${buyerDigits.slice(-4)}@example.com`,
        city || cust.city || '',
        requirement,
        budget,
        source,
        priority,
        notes || `Direct intake for ${cust.company_name}`,
      ]
    );

    res.status(201).json({ ok: true, lead: mapLeadRow(insertRes.rows[0]) });
  } catch (err) {
    console.error('[POST /api/leads]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.patch('/api/leads/:id', async (req, res) => {
  try {
    const leadId = req.params.id;
    const { status, read, is_read, notes } = req.body || {};
    const existing = await query('SELECT * FROM leads WHERE id = $1', [leadId]);
    if (existing.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Lead not found' });
    }
    const row = existing.rows[0];
    const nextStatus = status !== undefined ? status : row.status;
    const nextRead = read !== undefined ? Boolean(read) : is_read !== undefined ? Boolean(is_read) : Boolean(row.is_read);
    const nextNotes = notes !== undefined ? notes : row.notes;

    const updated = await query(
      `UPDATE leads SET status = $1, is_read = $2, notes = $3, updated_at = NOW() WHERE id = $4 RETURNING *`,
      [nextStatus, nextRead, nextNotes, leadId]
    );

    // Sync corresponding lead_assignments record if distributed
    let interest = null;
    if (nextStatus === 'Interested') interest = 'Interested';
    else if (nextStatus === 'In Follow-up' || nextStatus === 'Callback') interest = 'In Follow-up';
    else if (nextStatus === 'Converted' || nextStatus === 'Won') interest = 'Converted';
    else if (nextStatus === 'Dropped' || nextStatus === 'Not Interested') interest = 'Not Interested';

    try {
      await query(
        `UPDATE lead_assignments 
         SET status = $1,
             is_read = $2,
             response_notes = $3,
             response_interest = COALESCE($4, response_interest),
             responded_at = NOW()
         WHERE customer_lead_id = $5 OR (master_lead_id = $6 AND customer_id = $7)`,
        [nextStatus, nextRead, nextNotes, interest, leadId, row.master_lead_id || '', row.customer_id || '']
      );
    } catch (assignErr) {
      console.warn('[lead_assignments sync warning]', assignErr.message);
    }

    res.json({ ok: true, lead: mapLeadRow(updated.rows[0]) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// =============================================================================
// 6. PAYMENTS, INVOICES, VERIFICATIONS, QUERIES, TASKS & GROUPS
// =============================================================================
app.get('/api/payments', async (req, res) => {
  try {
    const result = await query('SELECT * FROM payment_records ORDER BY paid_at DESC');
    res.json({ ok: true, payments: result.rows.map(mapPaymentRecordRow) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/invoices', async (req, res) => {
  try {
    const { customerId } = req.query;
    if (customerId) {
      const result = await query('SELECT * FROM tax_invoices WHERE customer_id = $1 ORDER BY created_at DESC', [customerId]);
      return res.json({ ok: true, invoices: result.rows.map(mapInvoiceRow) });
    }
    const result = await query('SELECT * FROM tax_invoices ORDER BY created_at DESC');
    res.json({ ok: true, invoices: result.rows.map(mapInvoiceRow) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/verifications', async (req, res) => {
  try {
    const result = await query('SELECT * FROM pending_verifications ORDER BY submitted_at DESC');
    const verifications = result.rows.map((r) => ({
      ...r,
      customerId: r.customer_id,
      company: r.company_name,
      contact: r.contact_person,
      phone: (r.phone || '').trim(),
      packageTier: r.package_tier,
      amount: Number(r.amount || 0),
      dailyRate: Number(r.daily_rate || 300),
      utrNumber: r.utr_number,
      paymentStatus: r.payment_status,
      profileStatus: r.profile_status,
      queueType: r.queue_type,
      submittedAt: r.submitted_at
        ? new Date(r.submitted_at).toLocaleString('en-IN', {
          timeZone: 'Asia/Kolkata',
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        })
        : 'Today',
      submittedAtRaw: r.submitted_at,
      submitted_at_raw: r.submitted_at,
    }));
    res.json({ ok: true, verifications });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/queries', async (req, res) => {
  try {
    const { customerId = null, company = 'Client Account', category = 'Campaign Pacing', subject, priority = 'normal' } = req.body || {};
    const id = `qry_${Date.now()}`;
    const result = await query(
      `INSERT INTO support_queries (id, customer_id, company_name, category, subject, priority, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'open') RETURNING *`,
      [id, customerId, company, category, subject || 'Customer Support Inquiry', priority]
    );
    res.status(201).json({ ok: true, query: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/tasks', async (req, res) => {
  try {
    const {
      customerId = null,
      company = 'Client Account',
      contact = '',
      phone = '9876543210',
      taskType = 'Follow-up Call',
      priority = 'High',
      dueStatus = 'today',
      dueTime = 'Today, 04:00 PM',
      notes = '',
    } = req.body || {};
    const id = `tsk_${Date.now()}`;
    const cleanPhone = String(phone).replace(/\D/g, '').slice(-10).padEnd(10, '0');
    const result = await query(
      `INSERT INTO sales_tasks (id, customer_id, company_name, contact_person, phone, task_type, priority, due_status, due_time, notes, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending') RETURNING *`,
      [id, customerId, company, contact || company, cleanPhone, taskType, priority, dueStatus, dueTime, notes]
    );
    res.status(201).json({ ok: true, task: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// =============================================================================
// 7. CUSTOMER GROUPS & CATEGORY-BASED LEAD DISTRIBUTION
// =============================================================================

// List all Customer Groups with dynamic counts
app.get('/api/groups', async (req, res) => {
  try {
    const groups = await getGroupEligibilityCounts(query);
    res.json({ ok: true, groups: groups.map(mapGroupRow) });
  } catch (err) {
    console.error('[GET /api/groups]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// List all categories and customer groups with live eligible customer counts
app.get('/api/categories', async (req, res) => {
  try {
    const { categories, groups } = await getCategoryEligibilityCounts(query);
    res.json({
      ok: true,
      categories,
      groups: groups.map(mapGroupRow),
    });
  } catch (err) {
    console.error('[GET /api/categories]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Preview eligible recipients by category or group
app.get('/api/categories/preview', async (req, res) => {
  try {
    const targetCat = (req.query.category || '').trim();
    const targetGroupId = (req.query.groupId || '').trim();
    const masterLeadId = (req.query.masterLeadId || '').trim() || null;

    if (!targetCat && !targetGroupId) {
      return res.status(400).json({ ok: false, error: 'Category or groupId parameter is required' });
    }

    const evalData = await getEvaluatedRecipients(query, {
      category: targetCat,
      groupId: targetGroupId,
      masterLeadId,
    });

    res.json({
      ok: true,
      category: targetCat,
      groupId: targetGroupId || null,
      eligibleCount: evalData.eligibleCount,
      excludedCount: evalData.excludedCount,
      totalCandidates: evalData.totalCandidates,
      recipients: evalData.eligible,
      excludedRecipients: evalData.excluded,
      skippedBreakdown: evalData.skippedBreakdown,
    });
  } catch (err) {
    console.error('[GET /api/categories/preview]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Create a new Customer Group
app.post('/api/groups', async (req, res) => {
  try {
    const { name, category = 'Other', icon = '🏢', description = '', status = 'active' } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ ok: false, error: 'Group name is required' });
    }
    const cleanName = name.trim();
    const id = req.body.id || `grp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const result = await query(
      `INSERT INTO customer_groups (id, name, category, icon, description, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING *`,
      [id, cleanName, category || 'Other', icon || '🏢', description || '', status || 'active']
    );
    const row = result.rows[0];
    res.status(201).json({ ok: true, group: mapGroupRow({ ...row, customer_count: 0, leads_received: 0, leads_distributed: 0 }) });
  } catch (err) {
    if (err.message && (err.message.includes('unique') || err.message.includes('duplicate'))) {
      return res.status(409).json({ ok: false, error: 'A customer group with this name already exists.' });
    }
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update an existing Customer Group
app.put('/api/groups/:id', async (req, res) => {
  try {
    const groupId = req.params.id;
    const { name, category, icon, description, status } = req.body || {};
    const existing = await query('SELECT * FROM customer_groups WHERE id = $1', [groupId]);
    if (existing.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Customer group not found' });
    }
    const curr = existing.rows[0];
    const nextName = name !== undefined ? name.trim() : curr.name;
    const nextCategory = category !== undefined ? category : curr.category;
    const nextIcon = icon !== undefined ? icon : curr.icon;
    const nextDesc = description !== undefined ? description : curr.description;
    const nextStatus = status !== undefined ? status : curr.status;

    const result = await query(
      `UPDATE customer_groups
       SET name = $1, category = $2, icon = $3, description = $4, status = $5, updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [nextName, nextCategory, nextIcon, nextDesc, nextStatus, groupId]
    );

    const counts = await query(`
      SELECT 
        (SELECT COUNT(*) FROM customer_group_memberships WHERE group_id = $1) AS customer_count,
        (SELECT COUNT(*) FROM master_leads WHERE group_id = $1) AS leads_received,
        (SELECT COUNT(*) FROM lead_assignments WHERE group_id = $1) AS leads_distributed
    `, [groupId]);

    res.json({ ok: true, group: mapGroupRow({ ...result.rows[0], ...counts.rows[0] }) });
  } catch (err) {
    if (err.message && (err.message.includes('unique') || err.message.includes('duplicate'))) {
      return res.status(409).json({ ok: false, error: 'A customer group with this name already exists.' });
    }
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Delete a Customer Group
app.delete('/api/groups/:id', async (req, res) => {
  try {
    const groupId = req.params.id;
    await query('DELETE FROM customer_groups WHERE id = $1', [groupId]);
    res.json({ ok: true, message: 'Group deleted successfully' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// List members of a Customer Group
app.get('/api/groups/:id/members', async (req, res) => {
  try {
    const groupId = req.params.id;
    const membersRes = await query(
      `SELECT 
         c.id, c.username, c.company_name, c.contact_person, c.phone, c.email,
         c.category, c.city, c.state, c.status, c.profile_status, c.payment_status,
         COALESCE(w.available_balance, 0) AS balance,
         cgm.assigned_at
       FROM customer_group_memberships cgm
       JOIN customers c ON c.id = cgm.customer_id
       LEFT JOIN wallets w ON w.customer_id = c.id
       WHERE cgm.group_id = $1
       ORDER BY cgm.assigned_at DESC`,
      [groupId]
    );

    res.json({
      ok: true,
      members: membersRes.rows.map((r) => ({
        id: r.id,
        customerId: r.id,
        username: r.username,
        companyName: r.company_name,
        contactPerson: r.contact_person,
        phone: (r.phone || '').trim(),
        email: r.email || '',
        category: r.category || 'Other',
        city: r.city || '',
        state: r.state || '',
        status: r.status,
        balance: Number(r.balance || 0),
        assignedAt: r.assigned_at,
      })),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Assign customers to a Customer Group (Batch assignment)
app.post('/api/groups/:id/members', async (req, res) => {
  try {
    const groupId = req.params.id;
    const { customerIds = [] } = req.body || {};
    if (!Array.isArray(customerIds) || customerIds.length === 0) {
      return res.status(400).json({ ok: false, error: 'customerIds array is required' });
    }

    // Verify group exists
    const grpRes = await query('SELECT * FROM customer_groups WHERE id = $1', [groupId]);
    if (grpRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Customer group not found' });
    }

    let assignedCount = 0;
    for (const cId of customerIds) {
      const memId = `cgm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const insRes = await query(
        `INSERT INTO customer_group_memberships (id, group_id, customer_id, assigned_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (group_id, customer_id) DO NOTHING`,
        [memId, groupId, cId]
      );
      if (insRes.rowCount > 0) assignedCount++;
      if (grpRes.rows[0].category) {
        await query('UPDATE customers SET group_id = $1, category = $2 WHERE id = $3', [groupId, grpRes.rows[0].category, cId]);
      }
    }

    const updatedMembers = await query(
      `SELECT c.id, c.company_name, c.phone, c.status
       FROM customer_group_memberships cgm
       JOIN customers c ON c.id = cgm.customer_id
       WHERE cgm.group_id = $1`,
      [groupId]
    );

    res.json({
      ok: true,
      message: `Successfully assigned ${assignedCount} customer(s) to ${grpRes.rows[0].name}.`,
      assignedCount,
      totalGroupMembers: updatedMembers.rowCount,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Remove customer from a Customer Group
app.delete('/api/groups/:id/members/:customerId', async (req, res) => {
  try {
    const { id: groupId, customerId } = req.params;
    await query(
      'DELETE FROM customer_group_memberships WHERE group_id = $1 AND customer_id = $2',
      [groupId, customerId]
    );
    res.json({ ok: true, message: 'Customer removed from group successfully' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Preview distribution recipients for a group
app.get('/api/groups/:id/preview-recipients', async (req, res) => {
  try {
    const groupId = req.params.id;
    const masterLeadId = (req.query.masterLeadId || '').trim() || null;
    const grpRes = await query('SELECT * FROM customer_groups WHERE id = $1', [groupId]);
    if (grpRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Customer group not found' });
    }
    const group = grpRes.rows[0];

    const evalData = await getEvaluatedRecipients(query, {
      groupId,
      category: group.category || group.name,
      masterLeadId,
    });

    res.json({
      ok: true,
      group: mapGroupRow(group),
      totalMembers: evalData.totalCandidates,
      eligibleCount: evalData.eligibleCount,
      excludedCount: evalData.excludedCount,
      eligibleRecipients: evalData.eligible,
      excludedRecipients: evalData.excluded,
      skippedBreakdown: evalData.skippedBreakdown,
    });
  } catch (err) {
    console.error('[GET /api/groups/:id/preview-recipients]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// CORE ACTION: Distribute One Lead to All Customers in Target Category or Group
app.post('/api/leads/distribute', async (req, res) => {
  try {
    const {
      groupId,
      category,
      targetCategory,
      title,
      description = '',
      requirement,
      budget = '₹1.5L – ₹3.5L',
      location = '',
      priority = 'Normal',
      source = 'Category Lead Distribution',
      deadlineDate = null,
      buyerName,
      buyerPhone,
      phone,
      contactNumber,
      buyerEmail = '',
      city = '',
      id,
    } = req.body || {};

    const targetCat = (category || targetCategory || '').trim();
    const targetGroupId = (groupId || '').trim();

    if (!targetCat && !targetGroupId) {
      return res.status(400).json({ ok: false, error: 'Target category or customer group is required.' });
    }

    const rawPhone = buyerPhone || phone || contactNumber || '';
    const cleanBuyerDigits = String(rawPhone || '9876543210').replace(/\D/g, '').slice(-10);
    if (cleanBuyerDigits.length !== 10 || !['6', '7', '8', '9'].includes(cleanBuyerDigits[0])) {
      return res.status(400).json({
        ok: false,
        error: 'Contact number must be a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.',
      });
    }

    // Resolve target group and final category name
    let matchedGroup = null;
    if (targetGroupId) {
      const grpRes = await query('SELECT * FROM customer_groups WHERE id = $1', [targetGroupId]);
      if (grpRes.rowCount > 0) {
        matchedGroup = grpRes.rows[0];
      }
    }
    if (!matchedGroup && targetCat) {
      const grpRes = await query(
        'SELECT * FROM customer_groups WHERE LOWER(category) = LOWER($1) OR LOWER(name) = LOWER($1) LIMIT 1',
        [targetCat]
      );
      if (grpRes.rowCount > 0) {
        matchedGroup = grpRes.rows[0];
      }
    }

    const finalCategory = targetCat || (matchedGroup ? (matchedGroup.category || matchedGroup.name) : 'Other');
    const finalGroupId = matchedGroup ? matchedGroup.id : (targetGroupId || null);
    const finalGroupName = matchedGroup ? matchedGroup.name : finalCategory;

    const leadTitle = (title || '').trim() || `${finalCategory} Buyer Requirement`;
    const reqText = (requirement || description || '').trim() || `Inbound customer requirement for ${finalCategory} products and commercial services.`;
    const bName = (buyerName || '').trim() || 'Verified Buyer';
    const masterLeadId = id || `mlead_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const displayPhone = `+91 ${cleanBuyerDigits}`;

    // Preliminary authoritative evaluation before opening transaction
    const initialEval = await getEvaluatedRecipients(query, {
      groupId: finalGroupId,
      category: finalCategory,
      masterLeadId,
    });

    if (initialEval.eligibleCount === 0) {
      return res.status(400).json({
        ok: false,
        error: 'No Eligible Customers',
        message: 'No customers in this group currently meet the wallet balance and marketing eligibility requirements. Please review their wallet balances and campaign status.',
        eligibleCount: 0,
        skippedCount: initialEval.excludedCount,
        skippedBreakdown: initialEval.skippedBreakdown,
      });
    }

    // Execute atomic transaction for lead creation & assignments (NO wallet deductions whatsoever)
    const result = await withTransaction(async (txQuery) => {
      // Re-evaluate within transaction isolation to prevent race conditions
      const txEvalData = await getEvaluatedRecipients(txQuery, {
        groupId: finalGroupId,
        category: finalCategory,
        masterLeadId,
      });

      if (txEvalData.eligibleCount === 0) {
        const err = new Error('No Eligible Customers');
        err.statusCode = 400;
        err.skippedCount = txEvalData.excludedCount;
        err.skippedBreakdown = txEvalData.skippedBreakdown;
        throw err;
      }

      // 1. Insert Master Lead
      const mLeadInsert = await txQuery(
        `INSERT INTO master_leads (
           id, title, description, category, group_id, buyer_name, buyer_phone,
           buyer_email, city, requirement, budget, location, priority, source,
           deadline_date, created_by, created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7,
           $8, $9, $10, $11, $12, $13, $14,
           $15, 'Admin Operations', NOW(), NOW()
         )
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title,
           requirement = EXCLUDED.requirement,
           updated_at = NOW()
         RETURNING *`,
        [
          masterLeadId,
          leadTitle,
          description || reqText,
          finalCategory,
          finalGroupId,
          bName || displayPhone,
          cleanBuyerDigits,
          buyerEmail || `lead_${cleanBuyerDigits.slice(-4)}@example.com`,
          city || location || '',
          reqText,
          budget || '₹1.5L – ₹3.5L',
          location || city || '',
          priority || 'Normal',
          source || 'Category Lead Distribution',
          deadlineDate || null,
        ]
      );

      const savedMasterLead = mLeadInsert.rows[0];
      const createdAssignments = [];

      // 2. Dispatch ONLY to strictly eligible customers
      for (const cust of txEvalData.eligible) {
        const custLeadId = `lead_${masterLeadId}_${cust.customerId}`.slice(0, 64);
        const assignId = `asgn_${masterLeadId}_${cust.customerId}`.slice(0, 64);

        // Insert / update customer-specific lead so it displays in their individual CRM /app/lead
        await txQuery(
          `INSERT INTO leads (
             id, customer_id, master_lead_id, customer_phone, customer_username,
             company_name, category, buyer_phone, display_phone, buyer_name, buyer_email,
             city, requirement, budget, source, priority, status, is_hot, is_read, notes,
             created_at, updated_at
           ) VALUES (
             $1, $2, $3, $4, $5,
             $6, $7, $8, $9, $10, $11,
             $12, $13, $14, $15, $16, 'new', TRUE, FALSE, $17,
             NOW(), NOW()
           )
           ON CONFLICT (id) DO UPDATE SET updated_at = NOW()`,
          [
            custLeadId,
            cust.customerId,
            masterLeadId,
            cust.phone,
            cust.username || cust.phone,
            cust.companyName,
            finalCategory,
            cleanBuyerDigits,
            displayPhone,
            bName || displayPhone,
            buyerEmail || `lead_${cleanBuyerDigits.slice(-4)}@example.com`,
            city || cust.city || '',
            reqText,
            budget || '₹1.5L – ₹3.5L',
            source || 'Category Lead Distribution',
            priority || 'Normal',
            description || `Category lead dispatched for ${finalGroupName}`,
          ]
        );

        // Insert / update assignment record with idempotency
        await txQuery(
          `INSERT INTO lead_assignments (
             id, master_lead_id, customer_id, group_id, customer_lead_id,
             status, response_interest, response_notes, is_read, notification_status,
             assigned_at
           ) VALUES (
             $1, $2, $3, $4, $5,
             'new', 'Pending', '', FALSE, 'Delivered',
             NOW()
           )
           ON CONFLICT (master_lead_id, customer_id) DO UPDATE SET assigned_at = NOW()`,
          [assignId, masterLeadId, cust.customerId, finalGroupId, custLeadId]
        );

        createdAssignments.push({
          id: assignId,
          customerId: cust.customerId,
          companyName: cust.companyName,
          contactPerson: cust.contactPerson,
          phone: cust.phone,
          status: 'new',
          responseInterest: 'Pending',
          notificationStatus: 'Delivered',
        });
      }

      return {
        masterLead: savedMasterLead,
        assignments: createdAssignments,
        excludedCount: txEvalData.excludedCount,
        skippedBreakdown: txEvalData.skippedBreakdown,
      };
    });

    res.status(201).json({
      ok: true,
      message: `Lead "${leadTitle}" successfully distributed to ${result.assignments.length} eligible customer(s) in "${finalCategory}".`,
      masterLead: mapMasterLeadRow({
        ...result.masterLead,
        group_name: finalGroupName,
        recipients_count: result.assignments.length,
        interested_count: 0,
      }),
      recipientsCount: result.assignments.length,
      assignments: result.assignments,
      skippedCount: result.excludedCount,
      skippedBreakdown: result.skippedBreakdown,
    });
  } catch (err) {
    if (err.statusCode === 400 || err.message === 'No Eligible Customers') {
      return res.status(400).json({
        ok: false,
        error: 'No Eligible Customers',
        message: 'No customers in this group currently meet the wallet balance and marketing eligibility requirements. Please review their wallet balances and campaign status.',
        eligibleCount: 0,
        skippedCount: err.skippedCount || 0,
        skippedBreakdown: err.skippedBreakdown || {},
      });
    }
    console.error('[POST /api/leads/distribute]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Lead Distribution History & Tracking
app.get('/api/leads/distribution-history', async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        ml.*,
        cg.name AS group_name,
        cg.icon AS group_icon,
        (SELECT COUNT(*) FROM lead_assignments la WHERE la.master_lead_id = ml.id) AS recipients_count,
        (SELECT COUNT(*) FROM lead_assignments la WHERE la.master_lead_id = ml.id AND la.response_interest = 'Interested') AS interested_count,
        (SELECT COUNT(*) FROM lead_assignments la WHERE la.master_lead_id = ml.id AND la.status IN ('Converted', 'Won')) AS converted_count
      FROM master_leads ml
      LEFT JOIN customer_groups cg ON cg.id = ml.group_id
      ORDER BY ml.created_at DESC
    `);

    res.json({
      ok: true,
      history: result.rows.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        category: r.category,
        groupId: r.group_id,
        groupName: r.group_name || 'All Groups',
        groupIcon: r.group_icon || '🏢',
        buyerName: r.buyer_name,
        buyerPhone: r.buyer_phone,
        displayPhone: `+91 ${r.buyer_phone}`,
        city: r.city,
        priority: r.priority,
        source: r.source,
        budget: r.budget,
        requirement: r.requirement,
        createdBy: r.created_by,
        totalRecipients: Number(r.recipients_count || 0),
        interestedCount: Number(r.interested_count || 0),
        convertedCount: Number(r.converted_count || 0),
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Inspect a specific distribution's recipient-level status
app.get('/api/leads/distribution-history/:id', async (req, res) => {
  try {
    const masterLeadId = req.params.id;
    const mLeadRes = await query(
      `SELECT ml.*, cg.name AS group_name
       FROM master_leads ml
       LEFT JOIN customer_groups cg ON cg.id = ml.group_id
       WHERE ml.id = $1`,
      [masterLeadId]
    );

    if (mLeadRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Master lead distribution not found' });
    }

    const assignmentsRes = await query(
      `SELECT 
         la.*,
         c.company_name, c.contact_person, c.phone AS customer_phone, c.email AS customer_email,
         c.city AS customer_city, c.status AS customer_status
       FROM lead_assignments la
       JOIN customers c ON c.id = la.customer_id
       WHERE la.master_lead_id = $1
       ORDER BY la.assigned_at ASC`,
      [masterLeadId]
    );

    res.json({
      ok: true,
      distribution: mapMasterLeadRow(mLeadRes.rows[0]),
      recipients: assignmentsRes.rows.map((r) => ({
        id: r.id,
        customerId: r.customer_id,
        companyName: r.company_name,
        contactPerson: r.contact_person,
        phone: (r.customer_phone || '').trim(),
        email: r.customer_email || '',
        city: r.customer_city || '',
        status: r.status,
        responseInterest: r.response_interest,
        responseNotes: r.response_notes,
        isRead: Boolean(r.is_read),
        notificationStatus: r.notification_status,
        assignedAt: r.assigned_at,
        respondedAt: r.responded_at,
      })),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update recipient status / response (from customer or admin)
app.patch('/api/lead-assignments/:id', async (req, res) => {
  try {
    const assignmentId = req.params.id;
    const { status, responseInterest, responseNotes, isRead } = req.body || {};

    const existing = await query('SELECT * FROM lead_assignments WHERE id = $1', [assignmentId]);
    if (existing.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Lead assignment not found' });
    }
    const curr = existing.rows[0];

    const nextStatus = status !== undefined ? status : curr.status;
    const nextInterest = responseInterest !== undefined ? responseInterest : curr.response_interest;
    const nextNotes = responseNotes !== undefined ? responseNotes : curr.response_notes;
    const nextRead = isRead !== undefined ? Boolean(isRead) : curr.is_read;

    const updated = await query(
      `UPDATE lead_assignments
       SET status = $1, response_interest = $2, response_notes = $3, is_read = $4,
           responded_at = CASE WHEN $2 <> 'Pending' THEN NOW() ELSE responded_at END
       WHERE id = $5
       RETURNING *`,
      [nextStatus, nextInterest, nextNotes, nextRead, assignmentId]
    );

    // Also sync the customer's corresponding leads record
    if (curr.customer_lead_id) {
      await query(
        `UPDATE leads SET status = $1, is_read = $2, notes = $3, updated_at = NOW() WHERE id = $4`,
        [nextStatus, nextRead, nextNotes, curr.customer_lead_id]
      );
    }

    res.json({ ok: true, assignment: updated.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// =============================================================================
// 6B. MARKETING DEPARTMENT API ROUTER (/api/marketing/*)
// =============================================================================
app.use('/api/marketing', marketingRouter);

// =============================================================================
// 6C. GRAPHICS DEPARTMENT API ROUTER (/api/graphics/*)
// =============================================================================
app.use('/api/graphics', graphicsRouter);

// =============================================================================
// 6D. SUPER ADMIN CONTROL CENTER API ROUTER (/api/superadmin/*)
// =============================================================================
app.use('/api/superadmin', superadminRouter);

// =============================================================================
// 7. PRODUCTION STATIC FRONTEND SERVING (When frontend/dist is built on VPS)
// =============================================================================
const frontendDistPath = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    }
  }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  initDatabase()
    .then((info) => {
      console.log(`🚀 Growthline CRM Backend API listening on http://localhost:${PORT} (DB mode: ${info.mode})`);
      // Run daily ad spend pacing evaluation 3s after startup, then every 30 minutes
      setTimeout(() => {
        processDailyAdSpendPacing()
          .then((res) => console.log(`[Daily Ad Spend Pacing] Initial run completed (${res.processedCount || 0} deducted, ${res.autoPausedCount || 0} paused)`))
          .catch((err) => console.warn('[Daily Ad Spend Pacing] Initial run warning:', err.message));
      }, 3000);

      setInterval(() => {
        processDailyAdSpendPacing()
          .then((res) => {
            if (res.processedCount > 0 || res.autoPausedCount > 0) {
              console.log(`[Daily Ad Spend Pacing] Auto-run completed (${res.processedCount} deducted, ${res.autoPausedCount} paused)`);
            }
          })
          .catch((err) => console.warn('[Daily Ad Spend Pacing] Auto-run warning:', err.message));
      }, 30 * 60 * 1000);
    })
    .catch((err) => {
      console.error('Failed to initialize PostgreSQL database:', err);
    });
});

export { app };
