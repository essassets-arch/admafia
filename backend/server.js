import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { initDatabase, query, withTransaction, getDbStatus } from './db.js';
import { initMongo, getMongoStatus, isMongoConnected } from './mongo.js';
import { migrateHistoricalMarketingData } from './services/marketingStorage.js';
import { startOutboxWorker } from './services/outboxWorker.js';
import { getEvaluatedRecipients, getGroupEligibilityCounts, getCategoryEligibilityCounts } from './services/leadEligibility.js';
import { marketingRouter, processDailyAdSpendPacing } from './routes/marketing.js';
import { graphicsRouter } from './routes/graphics.js';
import { superadminRouter, logSuperAdminAudit } from './routes/superadmin.js';
import { countryPricingRouter, superadminCountryPricingRouter } from './routes/countryPricing.js';
import { resolveVisitorCountry, getPricingForCountryCode } from './services/countryDetection.js';
import { purgeSpecifiedTestUsers } from './scripts/purge-test-users.js';
import { creditWalletAtomic, createOrUpdateCustomerMongo } from './repositories/mongoRepository.js';

// Enterprise Crash-Protection: Prevent container exit on unhandled promise rejections or uncaught errors
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err.stack || err.message || err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason?.stack || reason?.message || reason);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const backendEnvPath = path.join(__dirname, '.env');
const rootEnvPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(backendEnvPath)) {
  dotenv.config({ path: backendEnvPath });
}
if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath, override: true });
}

const app = express();
const PORT = Number(process.env.PORT || 5000);
let databaseReady = null;

app.use(cors());
app.use(express.json({
  limit: '25mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  },
}));

const razorpayKeyId = (process.env.RAZORPAY_KEY_ID || '').trim();
const razorpayKeySecret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
const razorpayWebhookSecret = (process.env.RAZORPAY_WEBHOOK_SECRET || razorpayKeySecret).trim();
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
  const isGeneric = (str) =>
    !str ||
    str.trim().toLowerCase() === 'registered business' ||
    str.trim().toLowerCase() === 'corporate workspace' ||
    str.trim().toLowerCase() === 'workspace';

  const cleanUsername = (row.username || '').replace(/^@/, '').trim();
  const fallbackName = cleanUsername
    ? cleanUsername.charAt(0).toUpperCase() + cleanUsername.slice(1)
    : 'Client Member';

  const resolvedCompany = !isGeneric(row.company_name) ? row.company_name : (!isGeneric(row.name) ? row.name : fallbackName);
  const resolvedContact = !isGeneric(row.contact_person) ? row.contact_person : (!isGeneric(row.contact) ? row.contact : fallbackName);

  const balance = Number(row.balance ?? row.wallet_balance ?? 0);
  const dailyPacing = Number(row.daily_pacing ?? 300);
  const amountPaid = Number(row.amount_paid ?? 0);
  return {
    id: row.id,
    username: cleanUsername,
    name: resolvedCompany,
    companyName: resolvedCompany,
    contact: resolvedContact,
    contactPerson: resolvedContact,
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
    countryCode: String(row.country_code || 'IN').toUpperCase(),
    currency: String(row.currency || 'INR').toUpperCase(),
    currencySymbol: row.currency === 'USD' ? '$' : row.currency === 'AED' ? 'AED ' : row.currency === 'GBP' ? '£' : row.currency === 'SAR' ? 'SAR ' : '₹',
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
    currency: String(row.currency || 'INR').toUpperCase(),
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
    currency: String(row.currency || 'INR').toUpperCase(),
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
  const isGeneric = (str) =>
    !str ||
    str.trim().toLowerCase() === 'registered business' ||
    str.trim().toLowerCase() === 'corporate workspace' ||
    str.trim().toLowerCase() === 'workspace';

  const cleanUsername = (row.username || '').replace(/^@/, '').trim();
  const fallback = cleanUsername
    ? cleanUsername.charAt(0).toUpperCase() + cleanUsername.slice(1)
    : (row.phone ? `Customer ${String(row.phone).slice(-4)}` : 'Client Account');

  const resolvedCompany = !isGeneric(row.company_name) ? row.company_name : (!isGeneric(row.cust_company) ? row.cust_company : fallback);
  const resolvedContact = !isGeneric(row.contact_person) ? row.contact_person : (!isGeneric(row.cust_contact) ? row.cust_contact : fallback);

  const receiptVal =
    row.receipt_number ||
    row.receiptNumber ||
    row.receiptNo ||
    (row.id ? `RCP-2026-${String(row.id).replace(/\D/g, '').slice(-4).padStart(4, '1001')}` : `RCP-2026-${Math.floor(1000 + Math.random() * 9000)}`);
  return {
    id: row.id,
    receiptNo: receiptVal,
    receiptNumber: receiptVal,
    receipt_number: receiptVal,
    invoiceNumber: row.invoice_number || receiptVal,
    invoice_number: row.invoice_number || receiptVal,
    customerId: row.customer_id,
    company: resolvedCompany,
    contact: resolvedContact,
    phone: (row.phone || '').trim(),
    city: row.city || 'India',
    type: row.tx_type || 'topup',
    amount: Number(row.amount || 0),
    currency: String(row.currency || 'INR').toUpperCase(),
    gstAmount: Number(row.gst_amount || 0),
    totalAmount: Number(row.total_amount || 0),
    mode: row.payment_mode,
    paymentMode: row.payment_mode || row.mode || 'Razorpay Secure (UPI/Card)',
    utr: row.utr_reference || row.utr,
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

function mapQueryRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    customerId: row.customer_id,
    customer_id: row.customer_id,
    company: row.company_name,
    companyName: row.company_name,
    contactName: row.contact_name || '',
    contactEmail: row.contact_email || '',
    contactPhone: (row.contact_phone || '').trim(),
    category: row.category || 'Campaign Pacing',
    subject: row.subject || 'Customer Support Inquiry',
    priority: row.priority || 'Normal',
    assignedAdmin: row.assigned_admin || '',
    internalNotes: row.internal_notes || '',
    slaBreached: Boolean(row.sla_breached),
    hoursOpen: Number(row.hours_open || 0),
    status: (row.status || 'open').toLowerCase(),
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
    resolvedAt: row.resolved_at
      ? new Date(row.resolved_at).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
      : null,
  };
}

function mapFailedTxRow(row) {
  if (!row) return null;
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
    createdAt: row.created_at || new Date(),
    createdAtRaw: row.created_at || new Date(),
  };
}

function mapDeletedFailedTxRow(row) {
  if (!row) return null;
  const cleanPhone = String(row.phone || row.customer_id || '').replace(/\D/g, '').slice(-10);
  const rawContact = String(row.contact_person || '').trim();
  const isGenericContact = !rawContact || rawContact.toLowerCase() === 'registered business' || rawContact.toLowerCase() === 'account admin';
  const properContact = (!isGenericContact ? rawContact : '') || (cleanPhone ? `Customer ${cleanPhone.slice(-4)}` : 'Client Admin');
  const rawCompany = String(row.company_name || row.customer_name || '').trim();
  const isGenericCompany = !rawCompany || rawCompany.toLowerCase() === 'registered business' || rawCompany.toLowerCase() === 'corporate workspace';
  const properCompany = (!isGenericCompany ? rawCompany : '') || properContact || 'Client Account';

  return {
    id: row.id,
    originalId: row.original_id || row.id,
    customerId: row.customer_id,
    customerName: properCompany,
    companyName: properCompany,
    contactPerson: properContact,
    phone: cleanPhone || row.phone || '',
    email: row.email || '',
    city: row.city || '',
    state: row.state || 'Maharashtra',
    category: row.category || 'IT & Software',
    amount: Number(row.amount || 0),
    ref: row.reference_utr || row.id,
    desc: row.description || '',
    method: row.payment_method || 'Razorpay Gateway',
    status: 'Deleted Record',
    failureReason: row.failure_reason || row.description || 'Payment declined by bank or user cancelled',
    originalDate: row.original_created_at
      ? new Date(row.original_created_at).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
      : 'Previous Session',
    deletedAt: row.deleted_at
      ? new Date(row.deleted_at).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
      : 'Just now',
    deletedAtRaw: row.deleted_at,
    deletedBy: row.deleted_by || 'Sales Admin',
  };
}
function mapTransactionItem(row, fallbackCustomers = []) {
  if (!row) return null;
  const isGeneric = (str) =>
    !str ||
    str.trim().toLowerCase() === 'registered business' ||
    str.trim().toLowerCase() === 'corporate workspace' ||
    str.trim().toLowerCase() === 'workspace' ||
    str.trim().toLowerCase() === 'customer' ||
    str.trim().toLowerCase() === 'client member' ||
    str.trim().toLowerCase() === 'account admin';

  const cleanPhone = String(row.phone || row.cust_phone || row.customer_id || '').replace(/\D/g, '').slice(-10);
  const matchedCust = fallbackCustomers.find(
    (c) => c.id === row.customer_id || (cleanPhone && c.phone && String(c.phone).includes(cleanPhone))
  );

  const rawUser = String(row.username || matchedCust?.username || '').replace(/^@/, '').trim();
  const capUser = rawUser ? rawUser.charAt(0).toUpperCase() + rawUser.slice(1) : '';

  const rawCompany = String(row.company_name || row.cust_company || matchedCust?.companyName || matchedCust?.name || '').trim();
  const rawContact = String(row.contact_person || row.cust_contact || matchedCust?.contactPerson || matchedCust?.contact || '').trim();

  const properCompany = !isGeneric(rawCompany) ? rawCompany : (capUser || (cleanPhone ? 'Customer ' + cleanPhone.slice(-4) : 'Client Account'));
  const properContact = !isGeneric(rawContact) ? rawContact : (capUser || properCompany);

  const rawStatus = String(row.status || '').toLowerCase();
  let normalizedStatus = 'verified';
  let statusBadge = 'Verified ✓';

  if (
    rawStatus.includes('fail') ||
    rawStatus.includes('declin') ||
    rawStatus.includes('cancel') ||
    rawStatus.includes('reject') ||
    rawStatus.includes('dismiss')
  ) {
    normalizedStatus = 'failed';
    statusBadge = 'Payment Declined ✗';
  } else if (rawStatus.includes('refund')) {
    normalizedStatus = 'refunded';
    statusBadge = 'Refunded ↺';
  } else if (rawStatus.includes('pend') || rawStatus.includes('await') || rawStatus === 'pending') {
    normalizedStatus = 'pending';
    statusBadge = 'Pending ⏳';
  } else {
    normalizedStatus = 'verified';
    statusBadge = 'Settled ✓';
  }

  const rawType = String(row.tx_type || row.type || '').toLowerCase();
  let normalizedType = 'topup';
  let typeLabel = 'Wallet Top-Up';

  if (rawType.includes('debit') || String(row.description || '').toLowerCase().includes('auto-debit') || String(row.description || '').toLowerCase().includes('daily burn')) {
    normalizedType = 'daily_burn';
    typeLabel = 'Daily Ad Spend Auto-Debit';
  } else if (rawType.includes('reg') || String(row.description || '').toLowerCase().includes('registration')) {
    normalizedType = 'registration';
    typeLabel = 'Registration Package';
  } else if (rawType.includes('invoice')) {
    normalizedType = 'invoice';
    typeLabel = 'Invoice Settlement';
  } else if (rawType.includes('refund') || normalizedStatus === 'refunded') {
    normalizedType = 'refund';
    typeLabel = 'Online Refund';
  }

  const receiptVal =
    row.receipt_number ||
    row.receiptNumber ||
    row.receiptNo ||
    row.invoice_number ||
    row.invoiceNumber ||
    (row.id ? 'RCP-2026-' + String(row.id).replace(/\D/g, '').slice(-4).padStart(4, '0') : 'RCP-2026-1001');

  const rawDate = row.created_at || row.paid_at || new Date();
  const formattedDate = new Date(rawDate).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  return {
    id: row.id,
    ref: row.reference_utr || row.utr || row.utr_reference || row.id,
    receiptNo: receiptVal,
    receiptNumber: receiptVal,
    customerId: row.customer_id,
    company: properCompany,
    companyName: properCompany,
    contact: properContact,
    contactPerson: properContact,
    username: rawUser,
    phone: cleanPhone || (row.phone ? String(row.phone).trim() : ''),
    email: row.email || row.cust_email || matchedCust?.email || '',
    city: row.city || row.cust_city || matchedCust?.city || 'India',
    state: row.state || row.cust_state || matchedCust?.state || 'Maharashtra',
    category: row.category || row.cust_category || matchedCust?.category || 'IT & Software',
    amount: Number(row.amount || 0),
    gstAmount: Number(row.gst_amount || 0),
    totalAmount: Number(row.total_amount || row.amount || 0),
    balanceAfter: row.balance_after != null ? Number(row.balance_after) : null,
    status: normalizedStatus,
    statusBadge,
    rawStatus: row.status,
    type: normalizedType,
    typeLabel,
    paymentMode: row.payment_method || row.payment_mode || (normalizedStatus === 'failed' ? 'Razorpay Gateway (Declined)' : 'Razorpay Secure (UPI/Card)'),
    date: formattedDate,
    createdAt: rawDate,
    createdAtRaw: rawDate,
    description: row.description || row.notes || (normalizedStatus === 'failed' ? 'Payment declined by customer bank or user cancelled checkout' : 'Marketing Ad Wallet Top-Up'),
    failureReason: normalizedStatus === 'failed' ? (row.description || 'Payment declined by customer bank or user cancelled checkout') : null,
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
      mongo: getMongoStatus(),
      counts: counts.rows[0] || {},
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/state', async (req, res) => {
  try {
    const [custRes, leadsRes, payRes, pvRes, qRes, tRes, grpRes, mLeadsRes, failedRes, delFailedRes, allWtRes] = await Promise.all([
      query('SELECT * FROM vw_sales_customer_accounts ORDER BY registered_at DESC'),
      query('SELECT * FROM leads ORDER BY created_at DESC'),
      query(`
        SELECT 
          pr.*,
          c.username,
          c.company_name AS cust_company,
          c.contact_person AS cust_contact
        FROM payment_records pr
        LEFT JOIN customers c ON (
          pr.customer_id = c.id 
          OR pr.phone = c.phone 
          OR c.phone = RIGHT(REGEXP_REPLACE(pr.customer_id, '[^0-9]', '', 'g'), 10)
        )
        ORDER BY pr.paid_at DESC
      `),
      query(`
        SELECT 
          pv.*,
          c.username,
          c.company_name AS cust_company,
          c.contact_person AS cust_contact
        FROM pending_verifications pv
        LEFT JOIN customers c ON (
          pv.customer_id = c.id 
          OR pv.phone = c.phone 
          OR c.phone = RIGHT(REGEXP_REPLACE(pv.customer_id, '[^0-9]', '', 'g'), 10)
        )
        ORDER BY pv.submitted_at DESC
      `),
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
      query(`
        SELECT 
          wt.id, wt.customer_id, wt.amount, wt.reference_utr, wt.description, wt.payment_method, wt.status, wt.created_at,
          c.id AS matched_cust_id, c.username, c.company_name, c.contact_person, c.phone, c.email, c.city, c.state, c.country, c.category
        FROM wallet_transactions wt
        LEFT JOIN customers c ON (
          wt.customer_id = c.id 
          OR wt.customer_id = c.phone 
          OR c.phone = RIGHT(REGEXP_REPLACE(wt.customer_id, '[^0-9]', '', 'g'), 10)
        )
        WHERE LOWER(wt.status) LIKE '%fail%' 
           OR LOWER(wt.status) LIKE '%declin%'
           OR LOWER(wt.status) LIKE '%cancel%'
           OR LOWER(wt.status) LIKE '%dismiss%'
           OR LOWER(wt.status) LIKE '%reject%'
           OR LOWER(wt.tx_type) LIKE '%fail%'
           OR LOWER(wt.description) LIKE '%fail%'
           OR LOWER(wt.description) LIKE '%declin%'
           OR LOWER(wt.description) LIKE '%dismiss%'
           OR LOWER(wt.description) LIKE '%cancel%'
           OR LOWER(wt.payment_method) LIKE '%fail%'
           OR wt.reference_utr LIKE 'DISMISS-%'
           OR wt.reference_utr LIKE 'FAIL-%'
        ORDER BY wt.created_at DESC
      `),
      query('SELECT * FROM deleted_failed_transactions ORDER BY deleted_at DESC'),
      query(`
        SELECT 
          wt.*, 
          c.username, c.company_name, c.contact_person, c.phone, c.email, c.city, c.state, c.category,
          pr.receipt_number, pr.paid_at AS payment_paid_at, pr.payment_mode AS pr_payment_mode
        FROM wallet_transactions wt 
        LEFT JOIN customers c ON (
          wt.customer_id = c.id 
          OR wt.customer_id = c.phone 
          OR c.phone = RIGHT(REGEXP_REPLACE(wt.customer_id, '[^0-9]', '', 'g'), 10)
        )
        LEFT JOIN payment_records pr ON (
          wt.reference_utr = pr.utr_reference 
          OR wt.reference_utr = pr.receipt_number
          OR wt.id = pr.id
        )
        ORDER BY wt.created_at DESC
      `),
    ]);

    res.json({
      ok: true,
      customers: custRes.rows.map((r) => mapCustomerRow(r)),
      leads: leadsRes.rows.map(mapLeadRow),
      payments: payRes.rows.map(mapPaymentRecordRow),
      verifications: pvRes.rows.map((r) => {
        const isGeneric = (str) =>
          !str ||
          str.trim().toLowerCase() === 'registered business' ||
          str.trim().toLowerCase() === 'corporate workspace';
        const cleanUser = (r.username || '').replace(/^@/, '').trim();
        const fallback = cleanUser
          ? cleanUser.charAt(0).toUpperCase() + cleanUser.slice(1)
          : (r.phone ? `Customer ${String(r.phone).slice(-4)}` : 'Client Account');
        const resolvedComp = !isGeneric(r.company_name) ? r.company_name : (!isGeneric(r.cust_company) ? r.cust_company : fallback);
        const resolvedCont = !isGeneric(r.contact_person) ? r.contact_person : (!isGeneric(r.cust_contact) ? r.cust_contact : fallback);
        return {
          id: r.id,
          customerId: r.customer_id,
          company: resolvedComp,
          contact: resolvedCont,
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
        };
      }),
      queries: qRes.rows.map(mapQueryRow),
      tasks: tRes.rows,
      groups: grpRes.rows.map(mapGroupRow),
      masterLeads: mLeadsRes.rows.map(mapMasterLeadRow),
      failedTransactions: failedRes.rows.map(mapFailedTxRow),
      deletedFailedTransactions: delFailedRes.rows.map(mapDeletedFailedTxRow),
      allTransactions: (() => {
        const customers = custRes.rows.map(r => mapCustomerRow(r));
        const seenRefs = new Set();
        const seenIds = new Set();
        const list = [];
        for (const r of allWtRes.rows) {
          const it = mapTransactionItem(r, customers);
          if (it) {
            if (it.ref) seenRefs.add(it.ref);
            if (it.id) seenIds.add(it.id);
            list.push(it);
          }
        }
        for (const r of payRes.rows) {
          const ref = r.utr_reference || r.utr || r.receipt_number;
          if (ref && seenRefs.has(ref)) continue;
          if (r.id && seenIds.has(r.id)) continue;
          const it = mapTransactionItem({
            ...r,
            reference_utr: ref,
            payment_method: r.payment_mode,
            created_at: r.paid_at,
            tx_type: r.tx_type || 'Credit',
          }, customers);
          if (it) {
            if (it.ref) seenRefs.add(it.ref);
            if (it.id) seenIds.add(it.id);
            list.push(it);
          }
        }
        for (const f of failedRes.rows) {
          const fRef = f.reference_utr || f.gateway_reference || `FAIL-${f.id}`;
          if (seenRefs.has(fRef) || seenRefs.has(`FAIL-${f.id}`) || (f.id && seenIds.has(`tx_fail_${f.id}`))) continue;
          seenRefs.add(fRef);
          list.push({
            id: `tx_fail_${f.id}`,
            ref: fRef,
            receiptNo: `FAIL-${String(f.id).slice(-4)}`,
            receiptNumber: `FAIL-${String(f.id).slice(-4)}`,
            customerId: f.customer_id,
            company: f.customer_name || f.company_name || 'Client Account',
            companyName: f.customer_name || f.company_name || 'Client Account',
            contact: f.contact_person || f.customer_name || 'Authorized Lead',
            contactPerson: f.contact_person || f.customer_name || 'Authorized Lead',
            username: (f.username || f.customer_username || '').replace(/^@/, ''),
            phone: f.phone || f.customer_phone || '',
            email: f.email || '',
            city: f.city || 'India',
            state: f.state || 'Maharashtra',
            category: f.category || 'IT & Software',
            amount: Number(f.amount || 0),
            gstAmount: 0,
            totalAmount: Number(f.amount || 0),
            balanceAfter: null,
            status: 'failed',
            statusBadge: 'Payment Declined ✗',
            rawStatus: 'failed',
            type: 'topup',
            typeLabel: 'Wallet Top-Up (Declined)',
            paymentMode: f.payment_method || 'Razorpay Gateway (Declined)',
            date: new Date(f.created_at || new Date()).toLocaleString('en-IN', {
              timeZone: 'Asia/Kolkata',
              day: '2-digit',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              hour12: true,
            }),
            createdAt: f.created_at || new Date(),
            createdAtRaw: f.created_at || new Date(),
            description: f.error_reason || f.description || 'Payment declined by customer bank or user cancelled checkout',
            failureReason: f.error_reason || f.description || 'Payment declined by customer bank or user cancelled checkout',
          });
        }
        list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        return list;
      })(),
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
      state = '',
      country = 'India',
      countryCode = 'IN',
      currency = 'INR',
      category = 'IT & Software',
      deposit = 0,
      initialDeposit: reqInitialDeposit,
    } = req.body || {};
    void country;
    void countryCode;
    void currency;

    // New accounts use the server-detected IP pricing. Browser submitted country
    // and currency are not authoritative. Existing accounts retain their billing currency.
    const visitorPricing = await resolveVisitorCountry(req);
    if (!visitorPricing.country) {
      return res.status(400).json({ ok: false, error: 'We could not verify your location for billing. Please retry from a network with a public IP.' });
    }
    const detectedCountryCode = visitorPricing.detectedCode;
    const cleanCountryCode = detectedCountryCode;
    const rawPhone = String(phone || mobile || '').trim();
    const cleanDigits = rawPhone.replace(/\D/g, '');

    let cleanPhone = cleanDigits;
    if (cleanCountryCode === 'IN') {
      cleanPhone = cleanDigits.slice(-10);
      if (cleanPhone.length !== 10) {
        return res.status(400).json({ ok: false, error: 'Valid 10-digit mobile number is required for Indian registration.' });
      }
    } else {
      if (cleanDigits.length < 7 || cleanDigits.length > 15) {
        return res.status(400).json({ ok: false, error: 'Valid international phone number (7-15 digits) is required.' });
      }
    }

    // Determine country pricing, currency and daily starting budget
    const pricing = getPricingForCountryCode(cleanCountryCode);
    const dailyBudget = pricing.daily_min_budget;
    const registeredCurrency = pricing.currency_code;
    const registeredCountryName = pricing.country_name;

    const cleanUsername = (username || `user_${cleanPhone.slice(-4)}`).trim().replace(/^@/, '');
    const isGeneric = (str) =>
      !str ||
      str.trim().toLowerCase() === 'registered business' ||
      str.trim().toLowerCase() === 'corporate workspace';
    const fallbackFormatted = cleanUsername
      ? cleanUsername.charAt(0).toUpperCase() + cleanUsername.slice(1)
      : 'Client Member';
    const formattedName = !isGeneric(companyName) ? companyName.trim() : fallbackFormatted;
    const contactName = !isGeneric(contactPerson) ? contactPerson.trim() : formattedName;
    const custId = `cust_reg_${cleanPhone}`;
    const walId = `wal_${cleanPhone}`;
    const pvId = `pv_${cleanPhone}`;
    // Registration requests cannot assert successful payment. Only verified
    // server-side payment processing may add money to a wallet.
    const initialDeposit = 0;
    const payStatus = 'pending';

    // Proactively verify if username is already taken by another account
    try {
      const existingUserRes = await query(
        `SELECT id, username, phone FROM customers WHERE LOWER(username) = LOWER($1) LIMIT 1`,
        [cleanUsername]
      );
      if (existingUserRes.rows.length > 0) {
        const existing = existingUserRes.rows[0];
        const existingDigits = String(existing.phone || '').replace(/\D/g, '');
        if (existingDigits !== cleanPhone) {
          return res.status(409).json({
            ok: false,
            error: `The username "${cleanUsername}" is already taken. Please choose another username.`,
          });
        }
      }
    } catch (checkErr) {
      console.warn('[POST /api/auth/register] Username pre-check note:', checkErr.message);
    }

    await query(
      `INSERT INTO customers (
        id, username, phone, email, password_hash,
        company_name, category, contact_person, city, state, country, country_code, currency,
        status, profile_status, payment_status, kyc_percent, verified, completed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'active', 'complete', $14, 100, TRUE, NOW())
      ON CONFLICT (phone) DO UPDATE SET
        username = EXCLUDED.username,
        email = EXCLUDED.email,
        password_hash = EXCLUDED.password_hash,
        company_name = EXCLUDED.company_name,
        country = COALESCE(customers.country, EXCLUDED.country),
        country_code = COALESCE(customers.country_code, EXCLUDED.country_code),
        currency = COALESCE(customers.currency, EXCLUDED.currency),
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
        state || '',
        registeredCountryName,
        cleanCountryCode,
        registeredCurrency,
        payStatus,
      ]
    );

    // Real-Time Authoritative MongoDB Customer Registration Write
    try {
      if (!isMongoConnected()) {
        await initMongo().catch(() => {});
      }
      if (isMongoConnected()) {
        await createOrUpdateCustomerMongo({
          id: custId,
          username: cleanUsername,
          phone: cleanPhone,
          email: email.trim(),
          passwordHash: password,
          companyName: formattedName,
          contactPerson: contactName,
          category,
          city,
          state: state || '',
          country: registeredCountryName,
          countryCode: cleanCountryCode,
          currency: registeredCurrency,
          status: 'active',
          profileStatus: 'complete',
          paymentStatus: payStatus,
          kycPercent: 100,
          verified: true,
          dailyBudget,
        });
        console.log(`[MongoDB Real-Time] Customer ${custId} (${cleanUsername}) registered directly into MongoDB.`);
      }
    } catch (mRegErr) {
      console.warn('[MongoDB Real-Time Registration Warning]:', mRegErr.message);
    }

    await query(
      `INSERT INTO wallets (
        id, customer_id, available_balance, daily_ad_spend, total_lifetime_paid, ad_campaign_active, currency
      ) VALUES ($1, $2, $3, $4, $3, FALSE, $5)
      ON CONFLICT (customer_id) DO UPDATE SET
        available_balance = wallets.available_balance + EXCLUDED.available_balance,
        total_lifetime_paid = wallets.total_lifetime_paid + EXCLUDED.total_lifetime_paid,
        currency = COALESCE(wallets.currency, EXCLUDED.currency)`,
      [walId, custId, initialDeposit, dailyBudget, registeredCurrency]
    );

    if (initialDeposit > 0) {
      await query(
        `INSERT INTO wallet_transactions (
          id, customer_id, wallet_id, tx_type, amount, balance_after, reference_utr, description, payment_method, status, currency
        ) VALUES ($1, $2, $3, 'Credit', $4, $5, $6, $7, 'Direct Secure Payment', 'Verified ✓', $8)
        ON CONFLICT (reference_utr) DO UPDATE SET balance_after = EXCLUDED.balance_after`,
        [
          `tx_init_${cleanPhone}_${Date.now()}`,
          custId,
          walId,
          initialDeposit,
          initialDeposit,
          `INIT_${cleanPhone}`,
          'Initial Account Opening Ad Wallet Deposit',
          registeredCurrency,
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
        initialDeposit >= dailyBudget ? 'Completed' : 'Payment Pending',
      ]
    );

    const viewRes = await query('SELECT * FROM vw_sales_customer_accounts WHERE id = $1', [custId]);
    const customer = mapCustomerRow(viewRes.rows[0], password);

    res.status(201).json({ ok: true, customer });
  } catch (err) {
    console.error('[POST /api/auth/register]', err);
    const msg = String(err.message || '');
    const constraint = String(err.constraint || '');
    const code = String(err.code || '');

    if (
      code === '23505' ||
      msg.includes('unique constraint') ||
      msg.includes('duplicate key') ||
      msg.includes('uq_customers')
    ) {
      if (
        constraint === 'uq_customers_username' ||
        msg.includes('uq_customers_username') ||
        msg.toLowerCase().includes('username')
      ) {
        return res.status(409).json({
          ok: false,
          error: `The username "${cleanUsername || 'entered'}" is already registered. Please choose another username or sign in.`,
        });
      }
      if (
        constraint === 'customers_phone_key' ||
        constraint === 'uq_customers_phone' ||
        msg.includes('phone')
      ) {
        return res.status(409).json({
          ok: false,
          error: 'An account with this phone number already exists. Please sign in to your workspace.',
        });
      }
      return res.status(409).json({
        ok: false,
        error: 'An account with these details already exists. Please choose a different username or sign in.',
      });
    }

    if (code === '42703' && /wallets.*currency|currency.*wallets/i.test(msg)) {
      return res.status(503).json({
        ok: false,
        error: 'Registration is temporarily unavailable because the database schema is updating. Please retry in a moment.',
      });
    }

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
       WHERE LOWER(username) = $1 OR LOWER(email) = $1 OR phone = $2
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
         WHERE LOWER(username) = $1 OR LOWER(email) = $1 OR phone = $2
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

    const cleanInputPassword = String(password || '').trim();
    const cleanStoredPassword = String(expectedPasswordHash || '').trim();
    if (cleanInputPassword && cleanStoredPassword && cleanStoredPassword !== cleanInputPassword) {
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

// Sales Desk: Direct Client Wallet Top-Up (Assisted by Sales Executive)
app.post('/api/sales/wallet/topup', async (req, res) => {
  try {
    const {
      customerId,
      phone,
      amount,
      referenceUtr,
      paymentMethod = 'Instant UPI / GPay Transfer',
      salesPersonName = 'Sales Executive',
      salesPersonId = 'sales',
      notes = '',
    } = req.body || {};

    const creditAmount = parseFloat(amount);
    const cleanUtr = String(referenceUtr || '').trim();

    if (!customerId && !phone) {
      return res.status(400).json({ ok: false, error: 'Customer ID or phone number is required.' });
    }
    if (!cleanUtr) {
      return res.status(400).json({ ok: false, error: 'Transaction UTR reference number is required.' });
    }

    // 1. Check for duplicate UTR in wallet_transactions to prevent double crediting
    const dupCheck = await query(`SELECT id FROM wallet_transactions WHERE reference_utr = $1`, [cleanUtr]);
    if (dupCheck.rowCount > 0) {
      return res.status(409).json({
        ok: false,
        error: `Duplicate Reference: Payment UTR "${cleanUtr}" has already been credited in the ledger.`,
      });
    }

    // 2. Resolve customer
    const cleanPhone = String(phone || customerId || '').trim();
    const custRes = await query(
      `SELECT id, company_name, contact_person, phone, email, currency
       FROM customers
       WHERE id = $1 OR phone = $2 OR phone = $3
       LIMIT 1`,
      [customerId || '', cleanPhone, cleanPhone.replace(/\D/g, '').slice(-10)]
    );

    if (custRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Customer account not found for wallet top-up.' });
    }
    const customer = custRes.rows[0];
    const targetCustId = customer.id;
    const custCurrency = customer.currency || 'INR';
    const isUsd = custCurrency === 'USD';
    const minCreditAmount = isUsd ? 10 : 300;
    const minCreditSymbol = isUsd ? '$' : '₹';

    if (!creditAmount || creditAmount < minCreditAmount) {
      return res.status(400).json({ ok: false, error: `Minimum wallet credit amount is ${minCreditSymbol}${minCreditAmount}.` });
    }

    let recordedNewBalance = 0;
    let recordedOldBalance = 0;
    let walletId = null;
    let receiptNo = null;

    await withTransaction(async (tx) => {
      // 3. Upsert wallet balance atomically
      const defaultDailySpend = isUsd ? 10.00 : 300.00;
      const walRes = await tx(
        `INSERT INTO wallets (
          id, customer_id, available_balance, daily_ad_spend, total_lifetime_paid, ad_campaign_active, currency
        ) VALUES ($1, $2, $3, $4, $3, FALSE, $5)
        ON CONFLICT (customer_id) DO UPDATE SET
          available_balance = wallets.available_balance + EXCLUDED.available_balance,
          total_lifetime_paid = wallets.total_lifetime_paid + EXCLUDED.total_lifetime_paid,
          updated_at = NOW()
        RETURNING *`,
        [`wal_${Date.now()}`, targetCustId, creditAmount, defaultDailySpend, custCurrency]
      );

      walletId = walRes.rows[0]?.id;
      recordedNewBalance = Number(walRes.rows[0]?.available_balance || creditAmount);
      recordedOldBalance = Number((recordedNewBalance - creditAmount).toFixed(2));

      // 4. Update customer status
      await tx(
        `UPDATE customers
         SET payment_status = 'paid',
             updated_at = NOW()
         WHERE id = $1`,
        [targetCustId]
      );
      await tx(
        `UPDATE pending_verifications
         SET payment_status = 'paid',
             queue_type = 'Completed',
             verified_at = NOW()
         WHERE customer_id = $1`,
        [targetCustId]
      );

      // 5. Insert into wallet_transactions
      const txId = `tx_sales_${Date.now()}_${randomBytes(3).toString('hex')}`;
      const salesLabel = salesPersonName ? `${salesPersonName} (Sales Team)` : 'Sales Desk';
      const txDesc = `Ad Wallet Top-Up by Sales (${salesLabel})${notes ? ` - ${notes.trim()}` : ''}`;
      const cleanMethod = `Sales Deposit (${paymentMethod})`;

      await tx(
        `INSERT INTO wallet_transactions (
          id, customer_id, wallet_id, tx_type, amount, balance_after, reference_utr, description, payment_method, status, currency, created_at
        ) VALUES ($1, $2, $3, 'Credit', $4, $5, $6, $7, $8, 'Verified ✓', $9, NOW())`,
        [
          txId,
          targetCustId,
          walletId,
          creditAmount,
          recordedNewBalance,
          cleanUtr,
          txDesc,
          cleanMethod,
          custCurrency,
        ]
      );

      // 6. Insert into topup_requests for Super Admin Top-ups Queue & Verified History
      const topupId = `tp_sales_${Date.now()}_${randomBytes(3).toString('hex')}`;
      await tx(
        `INSERT INTO topup_requests (
          id, customer_id, wallet_id, amount, payment_method, reference_utr, notes, status, processed_by, processed_at, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'Approved', $8, NOW(), NOW(), NOW())
        ON CONFLICT (reference_utr) DO NOTHING`,
        [
          topupId,
          targetCustId,
          walletId,
          creditAmount,
          cleanMethod,
          cleanUtr,
          notes ? `Sales Top-Up: ${notes.trim()}` : `Manual Top-Up credited via Sales Desk by ${salesLabel}`,
          salesLabel,
        ]
      );

      // 7. Insert payment_records for billing / tax receipts
      receiptNo = `REC_${Date.now()}_${randomBytes(2).toString('hex').toUpperCase()}`;
      await tx(
        `INSERT INTO payment_records (
          id, receipt_number, customer_id, company_name, contact_person, phone, tx_type, amount, gst_amount, total_amount, payment_mode, utr_reference, status, currency, paid_at
        ) VALUES ($1, $2, $3, $4, $5, $6, 'topup', $7, 0.00, $7, $8, $9, 'paid', $10, NOW())`,
        [
          `pay_${Date.now()}_${randomBytes(3).toString('hex')}`,
          receiptNo,
          targetCustId,
          customer.company_name,
          customer.contact_person,
          customer.phone,
          creditAmount,
          cleanMethod,
          cleanUtr,
          custCurrency,
        ]
      );
    });

    // 8. Log audit trail for Super Admin
    await logSuperAdminAudit({
      actorId: salesPersonId || 'sales',
      actorName: `${salesPersonName || 'Sales Executive'} (Sales Team)`,
      actorRole: 'Sales',
      actionType: 'SALES_WALLET_TOPUP',
      targetType: 'wallet',
      targetId: targetCustId,
      reason: notes || 'Offline / Direct payment credited by sales person',
      details: {
        customerName: customer.company_name,
        customerPhone: customer.phone,
        amount: creditAmount,
        previousBalance: recordedOldBalance,
        newBalance: recordedNewBalance,
        referenceUtr: cleanUtr,
        paymentMethod,
        salesPersonName,
      },
    });

    // Real-Time Authoritative MongoDB Write
    try {
      if (!isMongoConnected()) {
        await initMongo().catch(() => {});
      }
      if (isMongoConnected()) {
        await creditWalletAtomic({
          customerId: targetCustId,
          amount: creditAmount,
          referenceUtr: cleanUtr,
          paymentMethod,
          description: `Direct Sales Top-Up: ${notes || 'Verified'}`,
          receiptNumber: receiptNo,
        });
        console.log(`[MongoDB Real-Time] Sales Top-Up of ₹${creditAmount} saved immediately to MongoDB for ${targetCustId}`);
      }
    } catch (mErr) {
      console.warn('[MongoDB Real-Time Sync Warning]:', mErr.message);
    }

    // 9. Fetch updated customer row from view
    const viewRes = await query('SELECT * FROM vw_sales_customer_accounts WHERE id = $1', [targetCustId]);
    const updatedCustomer = viewRes.rowCount > 0 ? mapCustomerRow(viewRes.rows[0]) : null;

    res.json({
      ok: true,
      customerId: targetCustId,
      companyName: customer.company_name,
      amount: creditAmount,
      previousBalance: recordedOldBalance,
      newBalance: recordedNewBalance,
      walletBalance: recordedNewBalance,
      referenceUtr: cleanUtr,
      customer: updatedCustomer,
      paymentRecord: { receiptNo },
      message: `${isUsd ? '$' : '₹'}${creditAmount.toLocaleString()} successfully credited to ${customer.company_name}'s wallet by ${salesPersonName}.`,
    });
  } catch (err) {
    console.error('[POST /api/sales/wallet/topup]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Sales Desk: Unified Master Transaction Logs (Verified, Failed, Pending, Top-Ups, Debits)
app.get('/api/sales/transactions', async (req, res) => {
  try {
    const [wtRes, prRes, custRes, delFailedRes] = await Promise.all([
      query(`
        SELECT 
          wt.id, wt.customer_id, wt.wallet_id, wt.tx_type, wt.amount, wt.balance_after,
          wt.reference_utr, wt.description, wt.payment_method, wt.status, wt.created_at,
          c.username, c.company_name, c.contact_person, c.phone, c.email, c.city, c.state, c.category,
          pr.receipt_number, pr.paid_at AS payment_paid_at, pr.payment_mode AS pr_payment_mode
        FROM wallet_transactions wt
        LEFT JOIN customers c ON (
          wt.customer_id = c.id 
          OR wt.customer_id = c.phone 
          OR c.phone = RIGHT(REGEXP_REPLACE(wt.customer_id, '[^0-9]', '', 'g'), 10)
        )
        LEFT JOIN payment_records pr ON (
          wt.reference_utr = pr.utr_reference 
          OR wt.reference_utr = pr.receipt_number
          OR wt.id = pr.id
        )
        ORDER BY wt.created_at DESC
      `),
      query(`
        SELECT 
          pr.*,
          c.username, c.company_name AS cust_company, c.contact_person AS cust_contact,
          c.phone AS cust_phone, c.email AS cust_email, c.city AS cust_city, c.state AS cust_state, c.category AS cust_category
        FROM payment_records pr
        LEFT JOIN customers c ON (
          pr.customer_id = c.id 
          OR pr.phone = c.phone 
          OR c.phone = RIGHT(REGEXP_REPLACE(pr.customer_id, '[^0-9]', '', 'g'), 10)
        )
        ORDER BY pr.paid_at DESC
      `),
      query('SELECT * FROM vw_sales_customer_accounts'),
      query('SELECT * FROM deleted_failed_transactions ORDER BY deleted_at DESC').catch(() => ({ rows: [] })),
    ]);

    const customers = custRes.rows.map((r) => mapCustomerRow(r));
    const seenRefs = new Set();
    const seenIds = new Set();
    const transactions = [];

    // 1. Process wallet_transactions (Authoritative ledger for credits, debits & declined attempts)
    for (const r of wtRes.rows) {
      const item = mapTransactionItem(r, customers);
      if (item) {
        if (item.ref) seenRefs.add(item.ref);
        if (item.id) seenIds.add(item.id);
        transactions.push(item);
      }
    }

    // 2. Process payment_records (deduplicating by reference / receipt / id)
    for (const r of prRes.rows) {
      const ref = r.utr_reference || r.utr || r.receipt_number;
      if (ref && seenRefs.has(ref)) continue;
      if (r.id && seenIds.has(r.id)) continue;
      const item = mapTransactionItem({
        ...r,
        reference_utr: ref,
        payment_method: r.payment_mode,
        created_at: r.paid_at,
        tx_type: r.tx_type || 'Credit',
      }, customers);
      if (item) {
        if (item.ref) seenRefs.add(item.ref);
        if (item.id) seenIds.add(item.id);
        transactions.push(item);
      }
    }

    // Sort newest first
    transactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Dynamic analytics metrics calculated from 100% real ledger rows
    let totalVolume = 0;
    let verifiedCount = 0;
    let verifiedVolume = 0;
    let debitCount = 0;
    let debitVolume = 0;
    let failedCount = 0;
    let failedVolume = 0;
    let pendingCount = 0;
    let pendingVolume = 0;
    let refundedCount = 0;
    let refundedVolume = 0;

    for (const t of transactions) {
      const amt = Number(t.amount || 0);
      if (t.status === 'verified' || t.status === 'paid' || t.status === 'settled') {
        if (t.type === 'daily_burn' || (t.typeLabel && t.typeLabel.toLowerCase().includes('debit'))) {
          debitCount++;
          debitVolume += amt;
        } else {
          verifiedCount++;
          verifiedVolume += amt;
          totalVolume += amt;
        }
      } else if (t.status === 'failed') {
        failedCount++;
        failedVolume += amt;
      } else if (t.status === 'pending') {
        pendingCount++;
        pendingVolume += amt;
      } else if (t.status === 'refunded') {
        refundedCount++;
        refundedVolume += amt;
      }
    }

    const settledTotal = verifiedCount + failedCount;
    const settlementRate = settledTotal > 0 ? Math.round((verifiedCount / settledTotal) * 100) : 100;

    res.json({
      ok: true,
      transactions,
      stats: {
        totalCount: transactions.length,
        totalVolume,
        verifiedCount,
        verifiedVolume,
        debitCount,
        debitVolume,
        failedCount,
        failedVolume,
        pendingCount,
        pendingVolume,
        refundedCount,
        refundedVolume,
        settlementRate,
      },
    });
  } catch (err) {
    console.error('[GET /api/sales/transactions]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Sales Desk: Customer Balance Audit Logs (Tracks Previous Balance, Transaction Amount, New Balance, and Full History)
app.get('/api/sales/balance-logs', async (req, res) => {
  try {
    const rawCustomerId = req.query.customerId;
    const customerId = (rawCustomerId && rawCustomerId !== 'undefined' && rawCustomerId !== 'null' && rawCustomerId !== 'all') ? String(rawCustomerId).trim() : null;
    const rawPhone = req.query.phone;
    const phone = (rawPhone && rawPhone !== 'undefined' && rawPhone !== 'null') ? String(rawPhone).trim() : null;
    const type = req.query.type;

    const [wtRes, prRes, custRes, walletsRes] = await Promise.all([
      query(`
        SELECT 
          wt.id,
          wt.customer_id,
          wt.wallet_id,
          wt.tx_type,
          wt.amount,
          wt.balance_after,
          wt.reference_utr,
          wt.description,
          wt.payment_method,
          wt.status,
          wt.created_at,
          c.username,
          c.company_name,
          c.contact_person,
          c.phone,
          c.email,
          c.city,
          c.state,
          c.category,
          w.available_balance AS current_wallet_balance,
          w.daily_ad_spend,
          w.total_lifetime_paid
        FROM wallet_transactions wt
        LEFT JOIN customers c ON (
          wt.customer_id = c.id 
          OR wt.customer_id = c.phone 
          OR c.phone = RIGHT(REGEXP_REPLACE(wt.customer_id, '[^0-9]', '', 'g'), 10)
        )
        LEFT JOIN wallets w ON (
          wt.customer_id = w.customer_id 
          OR c.id = w.customer_id
        )
        WHERE (
          LOWER(wt.status) NOT LIKE '%fail%' 
          AND LOWER(wt.status) NOT LIKE '%declin%'
          AND LOWER(wt.status) NOT LIKE '%cancel%'
          AND LOWER(wt.status) NOT LIKE '%dismiss%'
          AND LOWER(wt.status) NOT LIKE '%reject%'
        )
        ORDER BY wt.created_at DESC
      `),
      query(`
        SELECT 
          pr.*,
          c.username, c.company_name AS cust_company, c.contact_person AS cust_contact,
          c.phone AS cust_phone, c.email AS cust_email, c.city AS cust_city, c.state AS cust_state, c.category AS cust_category
        FROM payment_records pr
        LEFT JOIN customers c ON (
          pr.customer_id = c.id 
          OR pr.phone = c.phone 
          OR c.phone = RIGHT(REGEXP_REPLACE(pr.customer_id, '[^0-9]', '', 'g'), 10)
        )
        WHERE LOWER(pr.status) = 'paid' OR LOWER(pr.status) = 'settled' OR LOWER(pr.status) = 'verified'
        ORDER BY pr.paid_at DESC
      `),
      query('SELECT * FROM vw_sales_customer_accounts'),
      query('SELECT * FROM wallets'),
    ]);

    const customers = custRes.rows.map((r) => mapCustomerRow(r));
    const testUtrs = new Set(['aaggg', 'aa', 'pay_tvcjrvjjkphawp', 'pay_tvcfjhw56ixevu']);
    const testReceipts = new Set(['REC_1793882500916_D467', 'REC_1793881526162_E051', 'RCP-2026-5814', 'RCP-2026-9969']);

    const logs = [];
    const seenRefs = new Set();
    const seenIds = new Set();

    let totalCredits = 0;
    let totalDebits = 0;
    let totalCreditCount = 0;
    let totalDebitCount = 0;

    // 1. Process wallet_transactions (primary double-entry balance log)
    for (const row of wtRes.rows) {
      const ref = String(row.reference_utr || '').trim();
      const id = String(row.id || '').trim();

      if (testUtrs.has(ref) || testReceipts.has(ref) || testUtrs.has(ref.toLowerCase())) continue;
      if (id.startsWith('tx_reg_') || ref.startsWith('PAY-REG-')) continue;

      // Filter out synthetic/initial opening entries requested by user to be removed
      const rawDescLower = (row.description || '').toLowerCase();
      if (
        id.startsWith('tx_init_') ||
        rawDescLower.includes('initial account opening') ||
        rawDescLower.includes('prepaid ad account created')
      ) {
        continue;
      }

      const matchedCust = customers.find(
        (c) =>
          c.id === row.customer_id ||
          (c.phone && row.phone && c.phone.slice(-10) === String(row.phone).slice(-10))
      );

      const cleanPhone = String(row.phone || matchedCust?.phone || '').replace(/\D/g, '').slice(-10);
      const rawUser = (row.username || matchedCust?.username || '').replace(/^@/, '').trim();
      const capUser = rawUser ? rawUser.charAt(0).toUpperCase() + rawUser.slice(1) : null;
      const rawCompany = (row.company_name || matchedCust?.companyName || matchedCust?.name || '').trim();
      const rawContact = (row.contact_person || matchedCust?.contactPerson || matchedCust?.contact || '').trim();

      const properCompany = rawCompany && rawCompany.toLowerCase() !== 'corporate workspace'
        ? rawCompany
        : (capUser || (cleanPhone ? 'Customer ' + cleanPhone.slice(-4) : 'Client Account'));
      const properContact = rawContact && rawContact.toLowerCase() !== 'corporate workspace'
        ? rawContact
        : (capUser || properCompany);

      const rawType = String(row.tx_type || '').toLowerCase();
      const rawDesc = String(row.description || '').toLowerCase();
      const isDebit = rawType.includes('debit') || rawDesc.includes('auto-debit') || rawDesc.includes('burn');

      const amount = Number(row.amount || 0);
      const balanceAfter = row.balance_after != null ? Number(row.balance_after) : (isDebit ? 0 : amount);
      const balanceBefore = isDebit ? balanceAfter + amount : Math.max(0, balanceAfter - amount);

      // Filter by customer if requested in query
      if (customerId && row.customer_id !== customerId && matchedCust?.id !== customerId) continue;
      if (phone && cleanPhone !== String(phone).replace(/\D/g, '').slice(-10)) continue;
      if (type === 'credit' && isDebit) continue;
      if (type === 'debit' && !isDebit) continue;

      if (isDebit) {
        totalDebits += amount;
        totalDebitCount++;
      } else {
        totalCredits += amount;
        totalCreditCount++;
      }

      if (ref) seenRefs.add(ref);
      if (id) seenIds.add(id);

      const formattedDate = new Date(row.created_at).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });

      logs.push({
        id: row.id,
        ref: row.reference_utr || row.id,
        receiptNumber: row.reference_utr || row.id,
        customerId: row.customer_id,
        customerName: properCompany,
        companyName: properCompany,
        contactPerson: properContact,
        user: properCompany,
        userInitial: (properCompany || 'U').charAt(0).toUpperCase(),
        username: rawUser,
        phone: cleanPhone,
        email: row.email || matchedCust?.email || '',
        city: row.city || matchedCust?.city || 'India',
        state: row.state || matchedCust?.state || 'Maharashtra',
        category: row.category || matchedCust?.category || 'IT & Software',
        txType: isDebit ? 'debit' : 'credit',
        typeLabel: isDebit ? 'Daily Ad Spend Auto-Debit' : 'Ad Wallet Top-Up',
        amount,
        previousBalance: Number(balanceBefore.toFixed(2)),
        changedAmount: Number(amount.toFixed(2)),
        newBalance: Number(balanceAfter.toFixed(2)),
        balanceBefore: Number(balanceBefore.toFixed(2)),
        balanceAfter: Number(balanceAfter.toFixed(2)),
        balanceChangeFormatted: isDebit ? `-₹${amount.toFixed(2)}` : `+₹${amount.toFixed(2)}`,
        currentWalletBalance: row.current_wallet_balance != null ? Number(row.current_wallet_balance) : (matchedCust?.balance || 0),
        reason: row.description || (isDebit ? 'Ad Spend Daily Pacing' : 'Wallet Top-Up'),
        description: row.description || (isDebit ? 'Daily Ad Spend Pacing' : 'Wallet Top-Up'),
        updatedBy: 'Super Admin',
        paymentMethod: row.payment_method || (isDebit ? 'Daily Auto-Debit' : 'Razorpay Secure'),
        status: 'Settled ✓',
        createdAt: row.created_at,
        date: formattedDate,
      });
    }

    // 2. Include any verified payment_records not yet captured in wallet_transactions
    for (const pr of prRes.rows) {
      const ref = String(pr.utr_reference || pr.receipt_number || pr.id || '').trim();
      if (!ref || seenRefs.has(ref) || seenIds.has(pr.id)) continue;
      if (testUtrs.has(ref) || testReceipts.has(ref) || testUtrs.has(ref.toLowerCase())) continue;

      const matchedCust = customers.find(
        (c) =>
          c.id === pr.customer_id ||
          (c.phone && pr.phone && c.phone.slice(-10) === String(pr.phone).slice(-10))
      );

      const cleanPhone = String(pr.phone || pr.cust_phone || matchedCust?.phone || '').replace(/\D/g, '').slice(-10);
      const rawUser = (pr.username || matchedCust?.username || '').replace(/^@/, '').trim();
      const capUser = rawUser ? rawUser.charAt(0).toUpperCase() + rawUser.slice(1) : null;
      const rawCompany = (pr.company_name || pr.cust_company || matchedCust?.companyName || matchedCust?.name || '').trim();
      const rawContact = (pr.contact_person || pr.cust_contact || matchedCust?.contactPerson || matchedCust?.contact || '').trim();

      const properCompany = rawCompany && rawCompany.toLowerCase() !== 'corporate workspace'
        ? rawCompany
        : (capUser || (cleanPhone ? 'Customer ' + cleanPhone.slice(-4) : 'Client Account'));
      const properContact = rawContact && rawContact.toLowerCase() !== 'corporate workspace'
        ? rawContact
        : (capUser || properCompany);

      const amount = Number(pr.amount || 0);
      const balanceBefore = 0;
      const balanceAfter = amount;

      if (customerId && pr.customer_id !== customerId && matchedCust?.id !== customerId) continue;
      if (phone && cleanPhone !== String(phone).replace(/\D/g, '').slice(-10)) continue;
      if (type === 'debit') continue;

      totalCredits += amount;
      totalCreditCount++;

      seenRefs.add(ref);
      seenIds.add(pr.id);

      const formattedDate = new Date(pr.paid_at || pr.created_at || new Date()).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });

      logs.push({
        id: pr.id,
        ref: ref,
        receiptNumber: pr.receipt_number || ref,
        customerId: pr.customer_id,
        customerName: properCompany,
        companyName: properCompany,
        contactPerson: properContact,
        user: properCompany,
        userInitial: (properCompany || 'U').charAt(0).toUpperCase(),
        username: rawUser,
        phone: cleanPhone,
        email: pr.email || pr.cust_email || matchedCust?.email || '',
        city: pr.city || pr.cust_city || matchedCust?.city || 'India',
        state: pr.state || pr.cust_state || matchedCust?.state || 'Maharashtra',
        category: pr.category || pr.cust_category || matchedCust?.category || 'IT & Software',
        txType: 'credit',
        typeLabel: pr.type_label || 'Ad Wallet Top-Up',
        amount,
        previousBalance: Number(balanceBefore.toFixed(2)),
        changedAmount: Number(amount.toFixed(2)),
        newBalance: Number(balanceAfter.toFixed(2)),
        balanceBefore: Number(balanceBefore.toFixed(2)),
        balanceAfter: Number(balanceAfter.toFixed(2)),
        balanceChangeFormatted: `+₹${amount.toFixed(2)}`,
        currentWalletBalance: matchedCust?.balance || amount,
        reason: pr.notes || 'Verified Customer Payment Settlement',
        description: pr.notes || 'Verified Customer Payment Settlement',
        updatedBy: 'Super Admin',
        paymentMethod: pr.payment_mode || 'Razorpay UPI (Live)',
        status: 'Settled ✓',
        createdAt: pr.paid_at || pr.created_at || new Date(),
        date: formattedDate,
      });
    }

    // Sort newest logs first
    logs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // 3. Build deduplicated 1-row-per-customer balance audit list (Ensures every customer appears once, no duplicates)
    const customerLogsMap = new Map();
    const seenCustIds = new Set();

    // First, populate from all registered customer accounts
    for (const c of customers) {
      const cleanPhone = String(c.phone || '').replace(/\D/g, '').slice(-10);
      const name = c.companyName || c.name || c.username || 'Client Account';
      const wallet = walletsRes.rows.find((w) => w.customer_id === c.id || (w.phone && String(w.phone).slice(-10) === cleanPhone));
      const currBal = wallet ? Number(wallet.available_balance || 0) : Number(c.balance || 0);

      customerLogsMap.set(c.id, {
        id: `cust_bal_${c.id}`,
        customerId: c.id,
        user: name,
        customerName: name,
        companyName: name,
        contactPerson: c.contactPerson || c.contact || name,
        userInitial: (name || 'U').charAt(0).toUpperCase(),
        username: c.username || '',
        phone: cleanPhone,
        email: c.email || '',
        city: c.city || 'India',
        state: c.state || 'Maharashtra',
        category: c.category || 'IT & Software',
        txType: 'credit',
        amount: 0,
        previousBalance: Number(currBal.toFixed(2)),
        changedAmount: 0,
        newBalance: Number(currBal.toFixed(2)),
        balanceBefore: Number(currBal.toFixed(2)),
        balanceAfter: Number(currBal.toFixed(2)),
        currentWalletBalance: Number(currBal.toFixed(2)),
        reason: currBal > 0 ? `Current Wallet Balance (₹${currBal})` : 'Wallet Active (₹0.00)',
        description: currBal > 0 ? `Current Wallet Balance (₹${currBal})` : 'Wallet Active (₹0.00)',
        updatedBy: 'Super Admin',
        paymentMethod: 'Wallet Account',
        status: 'Active ✓',
        createdAt: c.createdAt || new Date().toISOString(),
        date: c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-US') : new Date().toLocaleDateString('en-US'),
      });
    }

    // Overlay with each customer's most recent transaction (so each customer has 1 row with their latest balance change)
    for (const log of logs) {
      const key = log.customerId || customers.find((c) => c.phone && log.phone && String(c.phone).slice(-10) === String(log.phone).slice(-10))?.id;
      if (!key) continue;

      if (!seenCustIds.has(key)) {
        seenCustIds.add(key);
        const base = customerLogsMap.get(key);
        customerLogsMap.set(key, {
          ...(base || {}),
          ...log,
          user: base?.user || log.user,
          phone: base?.phone || log.phone,
        });
      }
    }

    const customerLogs = Array.from(customerLogsMap.values());
    customerLogs.sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));

    const totalCirculatingBalance = walletsRes.rows.reduce(
      (sum, w) => sum + Math.max(0, Number(w.available_balance || 0)),
      0
    );

    res.json({
      ok: true,
      logs,
      customerLogs,
      stats: {
        totalLogs: logs.length,
        totalCustomers: customerLogs.length,
        totalCirculatingBalance,
        totalCredits: Number(totalCredits.toFixed(2)),
        totalDebits: Number(totalDebits.toFixed(2)),
        totalAmountAdded: Number(totalCredits.toFixed(2)),
        totalAmountRemoved: Number(totalDebits.toFixed(2)),
        totalCreditCount,
        totalDebitCount,
        activeWalletsCount: walletsRes.rows.filter((w) => Number(w.available_balance || 0) > 0).length,
      },
    });
  } catch (err) {
    console.error('[GET /api/sales/balance-logs]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});
// Sales Desk: Retrieve All Failed Transactions Across All Customers with Contact Numbers & Reason
app.get('/api/sales/failed-transactions', async (req, res) => {
  try {
    // 1. Fetch deleted/archived IDs & refs so dismissed/cleared records are not shown in active list
    const delRes = await query(
      'SELECT id, original_id, reference_utr, customer_id, phone FROM deleted_failed_transactions ORDER BY deleted_at DESC'
    ).catch(() => ({ rows: [] }));
    const deletedRefs = new Set();
    const deletedCustIds = new Set();
    for (const d of delRes.rows) {
      if (d.reference_utr) deletedRefs.add(d.reference_utr);
      if (d.original_id) deletedRefs.add(d.original_id);
      if (d.id) deletedRefs.add(d.id);
      if (d.customer_id) deletedCustIds.add(d.customer_id);
      const dp = String(d.phone || '').replace(/\D/g, '').slice(-10);
      if (dp) deletedCustIds.add(dp);
    }

    // 2. Query wallet_transactions for all recorded failed/declined entries
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
         OR LOWER(wt.status) LIKE '%declin%'
         OR LOWER(wt.status) LIKE '%cancel%'
         OR LOWER(wt.status) LIKE '%dismiss%'
         OR LOWER(wt.status) LIKE '%reject%'
         OR LOWER(wt.tx_type) LIKE '%fail%'
         OR LOWER(wt.description) LIKE '%fail%'
         OR LOWER(wt.description) LIKE '%declin%'
         OR LOWER(wt.description) LIKE '%dismiss%'
         OR LOWER(wt.description) LIKE '%cancel%'
         OR LOWER(wt.description) LIKE '%reject%'
         OR LOWER(wt.payment_method) LIKE '%fail%'
         OR wt.reference_utr LIKE 'DISMISS-%'
         OR wt.reference_utr LIKE 'FAIL-%'
      ORDER BY wt.created_at DESC
    `;
    const result = await query(querySql);
    const seenRefs = new Set();
    const seenCustIds = new Set();
    const list = [];

    for (const r of result.rows) {
      const ref = r.reference_utr || r.id;
      if (deletedRefs.has(ref) || deletedRefs.has(r.id)) continue;
      if (seenRefs.has(ref)) continue;
      seenRefs.add(ref);
      if (r.customer_id) seenCustIds.add(r.customer_id);
      const cleanP = String(r.phone || '').replace(/\D/g, '').slice(-10);
      if (cleanP) seenCustIds.add(cleanP);
      list.push(mapFailedTxRow(r));
    }

    // 3. Query real registered customers whose onboarding checkout is pending/abandoned/declined
    // (Real accounts registered on the website that started checkout but dropped off before paying)
    const unpaidCustSql = `
      SELECT 
        c.id, c.username, c.company_name, c.contact_person, c.phone, c.email, c.city, c.state, c.country, c.category,
        c.registered_at, c.payment_status,
        COALESCE(w.available_balance, 0) AS balance,
        COALESCE(w.daily_ad_spend, 300) AS daily_pacing
      FROM customers c
      LEFT JOIN wallets w ON w.customer_id = c.id
      WHERE (
        LOWER(COALESCE(c.payment_status, 'pending')) IN ('pending', 'failed', 'declined', 'unpaid', 'awaiting')
        OR COALESCE(w.available_balance, 0) = 0
      )
      AND NOT EXISTS (
        SELECT 1 FROM payment_records pr 
        WHERE (pr.customer_id = c.id OR pr.phone = RIGHT(REGEXP_REPLACE(c.phone, '[^0-9]', '', 'g'), 10))
          AND LOWER(pr.status) IN ('paid', 'verified', 'settled')
      )
      AND NOT EXISTS (
        SELECT 1 FROM wallet_transactions wt2
        WHERE (wt2.customer_id = c.id OR wt2.customer_id = c.phone)
          AND wt2.tx_type = 'Credit'
          AND LOWER(wt2.status) IN ('verified', 'settled', 'verified ✓', 'settled ✓', 'paid')
      )
      ORDER BY c.registered_at DESC
    `;
    const unpaidRes = await query(unpaidCustSql);
    for (const c of unpaidRes.rows) {
      const cleanP = String(c.phone || '').replace(/\D/g, '').slice(-10);
      if (deletedCustIds.has(c.id) || (cleanP && deletedCustIds.has(cleanP))) continue;
      const ref = `FAIL-REG-${cleanP || c.id}`;
      if (deletedRefs.has(ref) || seenRefs.has(ref)) continue;
      if (seenCustIds.has(c.id) || (cleanP && seenCustIds.has(cleanP))) continue;

      seenRefs.add(ref);
      seenCustIds.add(c.id);
      if (cleanP) seenCustIds.add(cleanP);

      const rawUser = String(c.username || '').trim();
      const capUser = rawUser ? rawUser.charAt(0).toUpperCase() + rawUser.slice(1) : '';
      const rawContact = String(c.contact_person || '').trim();
      const properContact = rawContact || capUser || (cleanP ? `Customer ${cleanP.slice(-4)}` : 'Client Admin');
      const rawCompany = String(c.company_name || '').trim();
      const properCompany = rawCompany || (capUser ? `${capUser} Enterprises` : '') || properContact;
      const planAmount = Number(c.daily_pacing || 300);

      list.push({
        id: `tx_fail_reg_${c.id}`,
        customerId: c.id,
        customerName: properCompany,
        companyName: properCompany,
        contactPerson: properContact,
        username: rawUser,
        phone: cleanP || c.phone || '',
        email: c.email || '',
        city: c.city || 'India',
        state: c.state || 'Maharashtra',
        category: c.category || 'IT & Software',
        amount: planAmount,
        ref: ref,
        desc: 'Registration payment incomplete: customer abandoned checkout before payment completion',
        method: 'Razorpay UPI / Online Gateway',
        status: 'Payment Declined ✕',
        failureReason: 'Checkout abandoned before bank authorization',
        date: c.registered_at
          ? new Date(c.registered_at).toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          })
          : 'Recently Failed',
        createdAt: c.registered_at || new Date(),
        createdAtRaw: c.registered_at || new Date(),
        isRegistrationDrop: true,
      });
    }

    list.sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));

    res.json({ ok: true, failedTransactions: list });
  } catch (err) {
    console.error('[GET /api/sales/failed-transactions]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Helper to safely archive failed transactions before deletion
async function archiveFailedTransactions({ whereClause = '', params = [], txSnapshot = null, deletedBy = 'Sales Admin' } = {}) {
  try {
    if (txSnapshot) {
      const s = txSnapshot;
      const cleanPhone = String(s.phone || s.customerId || '').replace(/\D/g, '').slice(-10);
      const properContact = String(s.contactPerson || s.contact || '').trim() || (cleanPhone ? `Customer ${cleanPhone.slice(-4)}` : 'Client Admin');
      const properCompany = String(s.companyName || s.customerName || s.company || '').trim() || properContact;
      const delId = `del_${s.id || s.ref || Date.now()}_${Math.floor(100 + Math.random() * 900)}`;

      await query(`
        INSERT INTO deleted_failed_transactions (
          id, original_id, customer_id, customer_name, company_name, contact_person,
          phone, email, city, state, category, amount, reference_utr, description,
          payment_method, failure_reason, original_created_at, deleted_at, deleted_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW(), $17)
        ON CONFLICT (id) DO NOTHING
      `, [
        delId,
        s.id || s.ref,
        s.customerId || null,
        properCompany,
        properCompany,
        properContact,
        cleanPhone,
        s.email || '',
        s.city || 'India',
        s.state || 'Maharashtra',
        s.category || 'IT & Software',
        Number(s.amount || 0),
        s.ref || s.id,
        s.desc || 'Failed wallet recharge',
        s.method || 'Razorpay Secure',
        s.failureReason || s.desc || 'Bank transaction declined',
        deletedBy,
      ]);
    }

    if (whereClause) {
      const selectSql = `
        SELECT 
          wt.id,
          wt.customer_id,
          wt.amount,
          wt.reference_utr,
          wt.description,
          wt.payment_method,
          wt.status,
          wt.created_at,
          c.username,
          c.company_name,
          c.contact_person,
          c.phone,
          c.email,
          c.city,
          c.state,
          c.category
        FROM wallet_transactions wt
        LEFT JOIN customers c ON (
          wt.customer_id = c.id 
          OR wt.customer_id = c.phone 
          OR c.phone = RIGHT(REGEXP_REPLACE(wt.customer_id, '[^0-9]', '', 'g'), 10)
        )
        WHERE ${whereClause}
      `;
      const recs = await query(selectSql, params);
      for (const r of recs.rows) {
        const delId = `del_${r.id || Date.now()}_${Math.floor(100 + Math.random() * 900)}`;
        const cleanPhone = String(r.phone || r.customer_id || '').replace(/\D/g, '').slice(-10);
        const properContact = String(r.contact_person || '').trim() || (cleanPhone ? `Customer ${cleanPhone.slice(-4)}` : 'Client Admin');
        const properCompany = String(r.company_name || '').trim() || properContact;
        await query(`
          INSERT INTO deleted_failed_transactions (
            id, original_id, customer_id, customer_name, company_name, contact_person,
            phone, email, city, state, category, amount, reference_utr, description,
            payment_method, failure_reason, original_created_at, deleted_at, deleted_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), $18)
          ON CONFLICT (id) DO NOTHING
        `, [
          delId,
          r.id,
          r.customer_id,
          properCompany,
          properCompany,
          properContact,
          cleanPhone,
          r.email || '',
          r.city || 'India',
          r.state || 'Maharashtra',
          r.category || 'IT & Software',
          Number(r.amount || 0),
          r.reference_utr,
          r.description || '',
          r.payment_method || 'Razorpay Secure',
          r.description || 'Payment declined by bank',
          r.created_at || new Date(),
          deletedBy,
        ]);
      }
    }
  } catch (err) {
    console.warn('[archiveFailedTransactions non-fatal]', err.message);
  }
}

// Sales Desk: Get Deleted Failed Transactions History (Desk 11 History Tab)
app.get('/api/sales/failed-transactions/history', async (req, res) => {
  try {
    const result = await query(`
      SELECT * FROM deleted_failed_transactions 
      ORDER BY deleted_at DESC
    `);
    res.json({ ok: true, history: result.rows.map(mapDeletedFailedTxRow) });
  } catch (err) {
    console.error('[GET /api/sales/failed-transactions/history]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Sales Desk: Restore a Deleted Failed Transaction back to active ledger
app.post('/api/sales/failed-transactions/history/restore', async (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ ok: false, error: 'Missing id to restore' });

    const findRes = await query(
      `SELECT * FROM deleted_failed_transactions WHERE id = $1 OR original_id = $1 OR reference_utr = $1 LIMIT 1`,
      [id]
    );

    if (findRes.rowCount > 0) {
      const row = findRes.rows[0];
      const targetCustId = row.customer_id || row.phone || 'cust_restored';
      const utr = row.reference_utr || `RESTORE-${Date.now()}`;
      const amount = Number(row.amount || 0);

      await query(`
        INSERT INTO wallet_transactions (
          id, customer_id, tx_type, amount, balance_after, reference_utr, description, payment_method, status, created_at
        ) VALUES ($1, $2, 'Credit', $3, 0, $4, $5, $6, 'Payment Declined ✕', COALESCE($7, NOW()))
        ON CONFLICT (reference_utr) DO UPDATE SET status = 'Payment Declined ✕'
      `, [
        row.original_id || `wt_res_${Date.now()}`,
        targetCustId,
        amount,
        utr,
        row.description || 'Restored failed payment attempt',
        row.payment_method || 'Razorpay Secure (Failed)',
        row.original_created_at || new Date(),
      ]);

      await query(`DELETE FROM deleted_failed_transactions WHERE id = $1`, [row.id]);
    }

    res.json({ ok: true, restored: true });
  } catch (err) {
    console.error('[POST /api/sales/failed-transactions/history/restore]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Sales Desk: Permanently Purge Deleted Failed Transactions History (single or all)
app.delete('/api/sales/failed-transactions/history/:id', async (req, res) => {
  try {
    const rawId = decodeURIComponent(req.params.id || '').trim();
    if (rawId === 'all' || rawId === 'clear-all') {
      const delRes = await query(`DELETE FROM deleted_failed_transactions RETURNING id`);
      return res.json({ ok: true, deletedCount: delRes.rowCount });
    }

    const delRes = await query(
      `DELETE FROM deleted_failed_transactions WHERE id = $1 OR original_id = $1 OR reference_utr = $1 RETURNING id`,
      [rawId]
    );
    res.json({ ok: true, deletedCount: delRes.rowCount });
  } catch (err) {
    console.error('[DELETE /api/sales/failed-transactions/history/:id]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Sales Desk: Delete / Remove a Failed Transaction (or 'all' / 'dismissed')
app.delete('/api/sales/failed-transactions/:id', async (req, res) => {
  try {
    const rawId = decodeURIComponent(req.params.id || '').trim();
    const { txSnapshot } = req.body || {};

    if (rawId === 'all' || rawId === 'clear-all') {
      await archiveFailedTransactions({
        whereClause: `
          LOWER(wt.status) LIKE '%fail%' 
          OR LOWER(wt.status) LIKE '%declin%'
          OR LOWER(wt.status) LIKE '%cancel%'
          OR LOWER(wt.status) LIKE '%dismiss%'
          OR LOWER(wt.status) LIKE '%reject%'
          OR LOWER(wt.tx_type) LIKE '%fail%'
          OR LOWER(wt.description) LIKE '%fail%'
          OR LOWER(wt.description) LIKE '%declin%'
          OR LOWER(wt.description) LIKE '%dismiss%'
          OR LOWER(wt.description) LIKE '%cancel%'
          OR LOWER(wt.description) LIKE '%reject%'
          OR LOWER(wt.payment_method) LIKE '%fail%'
          OR wt.reference_utr LIKE 'DISMISS-%'
          OR wt.reference_utr LIKE 'FAIL-%'
        `,
        txSnapshot,
      });

      const delRes = await query(`
        DELETE FROM wallet_transactions 
        WHERE LOWER(status) LIKE '%fail%' 
           OR LOWER(status) LIKE '%declin%'
           OR LOWER(status) LIKE '%cancel%'
           OR LOWER(status) LIKE '%dismiss%'
           OR LOWER(status) LIKE '%reject%'
           OR LOWER(tx_type) LIKE '%fail%'
           OR LOWER(description) LIKE '%fail%'
           OR LOWER(description) LIKE '%declin%'
           OR LOWER(description) LIKE '%dismiss%'
           OR LOWER(description) LIKE '%cancel%'
           OR LOWER(description) LIKE '%reject%'
           OR LOWER(payment_method) LIKE '%fail%'
           OR reference_utr LIKE 'DISMISS-%'
           OR reference_utr LIKE 'FAIL-%'
        RETURNING id
      `);
      return res.json({ ok: true, deletedCount: delRes.rowCount });
    }

    if (rawId === 'dismissed') {
      await archiveFailedTransactions({
        whereClause: `wt.reference_utr LIKE 'DISMISS-%'`,
        txSnapshot,
      });

      const delRes = await query(`
        DELETE FROM wallet_transactions 
        WHERE reference_utr LIKE 'DISMISS-%'
        RETURNING id
      `);
      return res.json({ ok: true, deletedCount: delRes.rowCount });
    }

    await archiveFailedTransactions({
      whereClause: `wt.id = $1 OR wt.reference_utr = $1`,
      params: [rawId],
      txSnapshot,
    });

    const delRes = await query(
      `DELETE FROM wallet_transactions WHERE id = $1 OR reference_utr = $1 RETURNING id`,
      [rawId]
    );
    res.json({ ok: true, deletedCount: delRes.rowCount });
  } catch (err) {
    console.error('[DELETE /api/sales/failed-transactions/:id]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete('/api/sales/failed-transactions', async (req, res) => {
  try {
    const { id, ids, type, txSnapshot } = req.body || req.query || {};
    if (type === 'all' || id === 'all') {
      await archiveFailedTransactions({
        whereClause: `
          LOWER(wt.status) LIKE '%fail%' 
          OR LOWER(wt.status) LIKE '%declin%'
          OR LOWER(wt.status) LIKE '%cancel%'
          OR LOWER(wt.status) LIKE '%dismiss%'
          OR LOWER(wt.status) LIKE '%reject%'
          OR LOWER(wt.tx_type) LIKE '%fail%'
          OR LOWER(wt.description) LIKE '%fail%'
          OR LOWER(wt.description) LIKE '%declin%'
          OR LOWER(wt.description) LIKE '%dismiss%'
          OR LOWER(wt.description) LIKE '%cancel%'
          OR LOWER(wt.description) LIKE '%reject%'
          OR LOWER(wt.payment_method) LIKE '%fail%'
          OR wt.reference_utr LIKE 'DISMISS-%'
          OR wt.reference_utr LIKE 'FAIL-%'
        `,
        txSnapshot,
      });

      const delRes = await query(`
        DELETE FROM wallet_transactions 
        WHERE LOWER(status) LIKE '%fail%' 
           OR LOWER(status) LIKE '%declin%'
           OR LOWER(status) LIKE '%cancel%'
           OR LOWER(status) LIKE '%dismiss%'
           OR LOWER(status) LIKE '%reject%'
           OR LOWER(tx_type) LIKE '%fail%'
           OR LOWER(description) LIKE '%fail%'
           OR LOWER(description) LIKE '%declin%'
           OR LOWER(description) LIKE '%dismiss%'
           OR LOWER(description) LIKE '%cancel%'
           OR LOWER(description) LIKE '%reject%'
           OR LOWER(payment_method) LIKE '%fail%'
           OR reference_utr LIKE 'DISMISS-%'
           OR reference_utr LIKE 'FAIL-%'
        RETURNING id
      `);
      return res.json({ ok: true, deletedCount: delRes.rowCount });
    }

    if (Array.isArray(ids) && ids.length > 0) {
      await archiveFailedTransactions({
        whereClause: `wt.id = ANY($1) OR wt.reference_utr = ANY($1)`,
        params: [ids],
        txSnapshot,
      });

      const delRes = await query(
        `DELETE FROM wallet_transactions WHERE id = ANY($1) OR reference_utr = ANY($1) RETURNING id`,
        [ids]
      );
      return res.json({ ok: true, deletedCount: delRes.rowCount });
    }

    if (id) {
      await archiveFailedTransactions({
        whereClause: `wt.id = $1 OR wt.reference_utr = $1`,
        params: [id],
        txSnapshot,
      });

      const delRes = await query(
        `DELETE FROM wallet_transactions WHERE id = $1 OR reference_utr = $1 RETURNING id`,
        [id]
      );
      return res.json({ ok: true, deletedCount: delRes.rowCount });
    }

    await archiveFailedTransactions({
      whereClause: `wt.reference_utr LIKE 'DISMISS-%'`,
      txSnapshot,
    });

    const delRes = await query(`
      DELETE FROM wallet_transactions 
      WHERE reference_utr LIKE 'DISMISS-%'
      RETURNING id
    `);
    res.json({ ok: true, deletedCount: delRes.rowCount });
  } catch (err) {
    console.error('[DELETE /api/sales/failed-transactions]', err);
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
      'SELECT id, phone, username FROM customers WHERE id = $1 OR phone = $2 LIMIT 1',
      [rawId, cleanPhone]
    );

    if (lookupRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Customer record not found' });
    }

    const custRow = lookupRes.rows[0];
    const custId = custRow.id;
    const cleanU = (custRow.username || '').replace(/^@/, '').trim();
    const fallbackU = cleanU ? cleanU.charAt(0).toUpperCase() + cleanU.slice(1) : 'Client Member';
    const isGeneric = (str) =>
      !str ||
      str.trim().toLowerCase() === 'registered business' ||
      str.trim().toLowerCase() === 'corporate workspace';

    const orgName = !isGeneric(companyName || name) ? (companyName || name).trim() : fallbackU;
    const personName = !isGeneric(contactPerson || contact) ? (contactPerson || contact).trim() : orgName;
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
    const rawUpdates = req.body || {};
    const updates = {
      ...rawUpdates,
      ...(rawUpdates.wallet || {}),
    };

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
        const walletCurrency = String(w.currency || 'INR').toUpperCase();
        const minimumDailySpend = walletCurrency === 'INR' ? 300 : walletCurrency === 'USD' ? 10 : null;
        if (minimumDailySpend === null) return res.status(409).json({ ok: false, error: 'Unsupported wallet currency.' });
        const nextDaily = updates.dailyAdSpend !== undefined ? Math.max(minimumDailySpend, Number(updates.dailyAdSpend)) : Number(w.daily_ad_spend);
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
      `SELECT id, username, phone, email, company_name, contact_person
       FROM customers
       WHERE id = $1 
          OR (phone = $2 AND $2 <> '')
          OR LOWER(username) = LOWER($1)
          OR id = 'cust_reg_' || $2
       LIMIT 1`,
      [rawId, cleanPhone]
    );
    if (lookupRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Customer not found' });
    }
    const cust = lookupRes.rows[0];
    const custId = cust.id;
    const custPhone = cust.phone;

    await withTransaction(async (txQuery) => {
      await txQuery(`DELETE FROM marketing_audit_events WHERE customer_id = $1`, [custId]);
      await txQuery(`DELETE FROM marketing_campaigns WHERE customer_id = $1`, [custId]);
      await txQuery(`DELETE FROM marketing_posts WHERE customer_id = $1`, [custId]);
      await txQuery(`DELETE FROM marketing_ideas WHERE customer_id = $1`, [custId]);
      await txQuery(`DELETE FROM pending_verifications WHERE customer_id = $1`, [custId]);
      await txQuery(`DELETE FROM wallet_transactions WHERE customer_id = $1`, [custId]);
      await txQuery(`DELETE FROM payment_records WHERE customer_id = $1`, [custId]);
      await txQuery(`DELETE FROM tax_invoices WHERE customer_id = $1`, [custId]);
      await txQuery(`DELETE FROM lead_followups WHERE customer_id = $1`, [custId]);
      await txQuery(`DELETE FROM lead_assignments WHERE customer_id = $1`, [custId]);
      await txQuery(`DELETE FROM leads WHERE customer_id = $1`, [custId]);
      await txQuery(`DELETE FROM support_query_messages WHERE query_id IN (SELECT id FROM support_queries WHERE customer_id = $1)`, [custId]);
      await txQuery(`DELETE FROM support_queries WHERE customer_id = $1`, [custId]);
      await txQuery(`DELETE FROM sales_tasks WHERE customer_id = $1`, [custId]);
      await txQuery(`DELETE FROM refund_requests WHERE customer_id = $1`, [custId]);
      await txQuery(`DELETE FROM topup_requests WHERE customer_id = $1`, [custId]);
      await txQuery(`DELETE FROM account_status_history WHERE customer_id = $1`, [custId]);
      await txQuery(`DELETE FROM customer_group_memberships WHERE customer_id = $1`, [custId]);
      await txQuery(`DELETE FROM wallets WHERE customer_id = $1`, [custId]);

      if (custPhone) {
        const altId = `cust_reg_${custPhone}`;
        if (altId !== custId) {
          await txQuery(`DELETE FROM wallets WHERE customer_id = $1`, [altId]);
          await txQuery(`DELETE FROM customers WHERE id = $1`, [altId]);
        }
      }

      await txQuery(`DELETE FROM customers WHERE id = $1`, [custId]);

      try {
        await txQuery(
          `INSERT INTO superadmin_audit_logs (id, actor_id, actor_name, actor_role, action_type, target_type, target_id, reason, details)
           VALUES ($1, 'api_admin', 'Admin API', 'Super Admin', 'CUSTOMER_DELETED', 'customer', $2, 'Customer deleted via admin API', $3)`,
          [
            `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            custId,
            JSON.stringify(cust),
          ]
        );
      } catch (e) { }
    });

    res.json({ ok: true, deleted: cust, deletedId: custId });
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
    const requestedCustomerId = String(req.body?.customerId || '');
    if (requestedCustomerId) {
      const billing = await query(
        `SELECT COALESCE(w.currency, c.currency, 'INR') AS currency
         FROM customers c LEFT JOIN wallets w ON w.customer_id = c.id WHERE c.id = $1 LIMIT 1`,
        [requestedCustomerId]
      );
      if (billing.rowCount && String(billing.rows[0].currency).toUpperCase() !== 'INR') {
        return res.status(400).json({ ok: false, error: 'Razorpay only supports INR wallets. Use the international USD gateway for this account.' });
      }
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
      ).catch(() => { });
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
    const billing = await query(
      `SELECT COALESCE(w.currency, c.currency, 'INR') AS currency
       FROM customers c LEFT JOIN wallets w ON w.customer_id = c.id WHERE c.id = $1 LIMIT 1`,
      [cust.id]
    );
    if (billing.rowCount && String(billing.rows[0].currency).toUpperCase() !== 'INR') {
      return res.status(400).json({ ok: false, error: 'Razorpay only supports INR wallets. International wallet payments are not enabled.' });
    }

    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amount * 100,
        currency: 'INR',
        receipt: `admafia_${Date.now()}_${randomBytes(3).toString('hex')}`,
        payment_capture: 1,
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
        ).catch(() => { });
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

    const billing = await query(
      `SELECT COALESCE(w.currency, c.currency, 'INR') AS currency
       FROM customers c LEFT JOIN wallets w ON w.customer_id = c.id WHERE c.id = $1 LIMIT 1`,
      [cust.id]
    );
    if (billing.rowCount && String(billing.rows[0].currency).toUpperCase() !== 'INR') {
      return res.status(400).json({ ok: false, error: 'Razorpay only supports INR wallets. International wallet payments are not enabled.' });
    }

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
  currency,
}) {
  const cleanAmount = Number(amount || 0);
  if (!Number.isFinite(cleanAmount) || cleanAmount <= 0) {
    throw new Error('Valid wallet top-up amount is required.');
  }

  const cleanPhone = String(phone || customerId || '').replace(/\D/g, '').slice(-10);
  const utr = String(referenceUtr || `rzp_${Date.now()}`).trim();

  return await withTransaction(async (txQuery) => {
    // 0. Concurrency Protection: Acquire PostgreSQL transaction-level advisory lock on this exact payment reference!
    // This serializes concurrent /verify calls and webhook deliveries for the same payment ID.
    await txQuery(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`credit_${utr}`]);

    // 1. Resolve customer
    let custRes = await txQuery(
      `SELECT * FROM customers
       WHERE id = $1 OR phone = $2 OR LOWER(username) = LOWER($3)
       LIMIT 1`,
      [customerId || '', cleanPhone, username || '']
    );

    if (custRes.rowCount === 0) {
      const fallbackId = customerId || `cust_${cleanPhone || Date.now()}`;
      const lockedCredentialHash = `$2b$12$${randomBytes(32).toString('hex')}!LOCKED`;
      await txQuery(
        `INSERT INTO customers (id, phone, username, contact_person, company_name, email, password_hash, status, payment_status, currency)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', 'paid', $8)
         ON CONFLICT (id) DO UPDATE SET phone = EXCLUDED.phone, payment_status = 'paid'`,
        [
          fallbackId,
          cleanPhone || '9999999999',
          username || cleanPhone || fallbackId,
          `Client ${cleanPhone || fallbackId}`,
          `Business ${cleanPhone || fallbackId}`,
          `${cleanPhone || fallbackId}@client.admafia.marketing`,
          lockedCredentialHash,
          currency || 'INR',
        ]
      );
      custRes = await txQuery(`SELECT * FROM customers WHERE id = $1 OR phone = $2 LIMIT 1`, [fallbackId, cleanPhone]);
      try {
        if (!isMongoConnected()) {
          await initMongo().catch(() => {});
        }
        if (isMongoConnected()) {
          await createOrUpdateCustomerMongo({
            id: fallbackId,
            phone: cleanPhone || '9999999999',
            username: username || cleanPhone || fallbackId,
            contactPerson: `Client ${cleanPhone || fallbackId}`,
            companyName: `Business ${cleanPhone || fallbackId}`,
            email: `${cleanPhone || fallbackId}@client.admafia.marketing`,
            passwordHash: lockedCredentialHash,
            currency: currency || 'INR',
            paymentStatus: 'paid',
          });
        }
      } catch (mFallbackErr) {
        console.warn('[MongoDB Fallback Cust Reg Warning]:', mFallbackErr.message);
      }
    }

    if (custRes.rowCount === 0) {
      throw new Error(`Customer account not found for wallet credit (ID: ${customerId || 'N/A'}, Phone: ${cleanPhone || 'N/A'}).`);
    }

    const cust = custRes.rows[0];
    const existingWallet = await txQuery(`SELECT currency FROM wallets WHERE customer_id = $1 LIMIT 1`, [cust.id]);
    const custCurrency = String(existingWallet.rows[0]?.currency || cust.currency || currency || 'INR').toUpperCase();
    const currencySymbol = custCurrency === 'USD' ? '$' : custCurrency === 'AED' ? 'AED ' : custCurrency === 'GBP' ? '£' : custCurrency === 'SAR' ? 'SAR ' : '₹';

    if (custCurrency === 'INR' && cleanAmount < 300) {
      throw new Error('Minimum wallet top-up amount is ₹300.');
    } else if (custCurrency !== 'INR' && cleanAmount < 10) {
      throw new Error(`Minimum wallet top-up amount is ${currencySymbol}10.`);
    }

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
    const defaultDailyMin = custCurrency === 'INR' ? 300.00 : 10.00;
    const walRes = await txQuery(
      `INSERT INTO wallets (
        id, customer_id, available_balance, daily_ad_spend, total_lifetime_paid, ad_campaign_active, currency
      ) VALUES ($1, $2, $3, $4, $3, FALSE, $5)
      ON CONFLICT (customer_id) DO UPDATE SET
        available_balance = wallets.available_balance + EXCLUDED.available_balance,
        total_lifetime_paid = wallets.total_lifetime_paid + EXCLUDED.total_lifetime_paid,
        currency = COALESCE(wallets.currency, EXCLUDED.currency),
        updated_at = NOW()
      RETURNING *`,
      [`wal_${Date.now()}`, cust.id, cleanAmount, defaultDailyMin, custCurrency]
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
    const txDesc = description || `Ad Wallet Balance Top-Up (${currencySymbol}${cleanAmount.toLocaleString()} Added)`;
    const txInsert = await txQuery(
      `INSERT INTO wallet_transactions (
        id, customer_id, wallet_id, tx_type, amount, balance_after, reference_utr, description, payment_method, status, currency
      ) VALUES ($1, $2, $3, 'Credit', $4, $5, $6, $7, $8, 'Verified ✓', $9)
      ON CONFLICT (reference_utr) DO UPDATE SET
        balance_after = EXCLUDED.balance_after,
        status = 'Verified ✓',
        description = EXCLUDED.description,
        payment_method = EXCLUDED.payment_method
      RETURNING *`,
      [txId, cust.id, walletId, cleanAmount, newBalance, utr, txDesc, paymentMethod, custCurrency]
    );

    // 6. Insert payment_records for Sales Desk (/sales#payments)
    const payId = `pay_${Date.now()}_${randomBytes(3).toString('hex')}`;
    const receiptNo = `RCP-${new Date().getFullYear()}-${Date.now()}-${randomBytes(3).toString('hex').toUpperCase()}`;
    const payInsert = await txQuery(
      `INSERT INTO payment_records (
        id, receipt_number, customer_id, company_name, contact_person, phone, city,
        tx_type, amount, gst_amount, total_amount, payment_mode, utr_reference, status, notes, currency
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'topup', $8, 0, $8, $9, $10, 'paid', $11, $12)
      ON CONFLICT (receipt_number) DO UPDATE SET total_amount = EXCLUDED.total_amount
      RETURNING *`,
      [
        payId,
        receiptNo,
        cust.id,
        cust.company_name,
        cust.contact_person,
        cust.phone,
        cust.city || cust.country || 'India',
        cleanAmount,
        paymentMethod,
        utr,
        `Wallet Top-Up (+${currencySymbol}${cleanAmount.toLocaleString()})`,
        custCurrency,
      ]
    );

    // 7. Insert tax invoice with SAC code breakdown
    const invId = `inv_${Date.now()}_${randomBytes(3).toString('hex')}`;
    const invoiceNo = `INV-${new Date().getFullYear()}-${Date.now()}-${randomBytes(3).toString('hex').toUpperCase()}`;
    const taxRate = custCurrency === 'INR' ? 1.18 : 1.0;
    const baseAmt = Math.round(cleanAmount / taxRate);
    const totalTax = cleanAmount - baseAmt;
    const cgstAmt = Math.round(totalTax / 2);
    const sgstAmt = totalTax - cgstAmt;

    const invInsert = await txQuery(
      `INSERT INTO tax_invoices (
        id, invoice_no, customer_id, payment_record_id, particulars, sac_code,
        base_amount, cgst_amount, sgst_amount, total_amount, payment_mode, status, currency
      ) VALUES ($1, $2, $3, $4, $5, '998311', $6, $7, $8, $9, $10, 'Paid', $11)
      ON CONFLICT (invoice_no) DO UPDATE SET total_amount = EXCLUDED.total_amount
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
        custCurrency,
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

    // Real-Time Authoritative MongoDB Write
    try {
      if (!isMongoConnected()) {
        await initMongo().catch(() => {});
      }
      if (isMongoConnected()) {
        await creditWalletAtomic({
          customerId: cust.id,
          amount: cleanAmount,
          referenceUtr: utr,
          paymentMethod,
          description: txDesc,
          receiptNumber: receiptNo,
        });
        console.log(`[MongoDB Real-Time] Credited ₹${cleanAmount} to customer ${cust.id} (UTR: ${utr}) saved to MongoDB`);
      }
    } catch (mErr) {
      console.warn('[MongoDB Real-Time Sync Warning]:', mErr.message);
    }

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
        } catch (e) { }
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
        ).catch(() => { });
      }
      return res.redirect(303, `${baseUrl}/app/lead?payment_status=failed&reason=${encodeURIComponent(failReason)}#app/wallet`);
    }

    // Verify payment directly with Razorpay API (Server-to-Server trusted evidence)
    const paymentResp = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: `Basic ${Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString('base64')}` },
    });
    const payment = await paymentResp.json();

    if (!paymentResp.ok || payment.status !== 'captured' || String(payment.currency || '').toUpperCase() !== 'INR') {
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
      } catch (e) { }
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

    const billingRes = await query(
      `SELECT COALESCE(w.currency, c.currency, 'INR') AS currency
       FROM customers c LEFT JOIN wallets w ON w.customer_id = c.id WHERE c.id = $1 LIMIT 1`,
      [targetCustId]
    );
    if (billingRes.rowCount && String(billingRes.rows[0].currency).toUpperCase() !== 'INR') {
      return res.redirect(303, `${baseUrl}/app/lead?payment_status=failed&payment_id=${encodeURIComponent(paymentId)}&reason=Razorpay+supports+INR+wallets+only#app/wallet`);
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
    if (!orderId || !paymentId || !signature) {
      return res.status(400).json({ ok: false, error: 'Missing Razorpay payment verification details.' });
    }

    // 1. Constant-time cryptographic signature verification
    const expected = createHmac('sha256', razorpayKeySecret).update(`${orderId}|${paymentId}`).digest();
    let received;
    try {
      received = Buffer.from(String(signature).trim(), 'hex');
    } catch {
      received = Buffer.alloc(0);
    }
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
      console.error('[Razorpay Verify] Signature mismatch for order:', orderId, 'payment:', paymentId);
      return res.status(400).json({ ok: false, error: 'Razorpay payment signature is invalid.' });
    }

    // 2. Fetch authoritative payment status directly from Razorpay API
    const paymentResponse = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: `Basic ${Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString('base64')}` },
    });
    let payment = await paymentResponse.json();

    if (!paymentResponse.ok || !payment.id) {
      console.error('[Razorpay Verify] Could not retrieve payment from Razorpay:', payment);
      return res.status(400).json({ ok: false, error: 'Could not verify payment with Razorpay gateway.' });
    }

    if (String(payment.currency || '').toUpperCase() !== 'INR') {
      return res.status(400).json({ ok: false, error: 'Razorpay payment currency must be INR.' });
    }

    if (payment.order_id !== orderId) {
      console.error(`[Razorpay Verify] Order mismatch. Expected ${orderId}, got ${payment.order_id}`);
      return res.status(400).json({ ok: false, error: 'Payment order ID mismatch.' });
    }

    // 3. Auto-Capture: If payment is authorized but not captured, safely capture it on Razorpay before crediting wallet
    if (payment.status === 'authorized') {
      console.log(`[Razorpay Verify] Payment ${paymentId} is authorized. Auto-capturing ₹${payment.amount / 100}...`);
      try {
        const captureResp = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}/capture`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString('base64')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            amount: payment.amount,
            currency: payment.currency || 'INR',
          }),
        });
        const captureData = await captureResp.json();
        if (captureResp.ok && captureData.status === 'captured') {
          console.log(`[Razorpay Verify] Payment ${paymentId} captured successfully.`);
          payment = captureData;
        } else {
          console.error('[Razorpay Verify] Auto-capture failed:', captureData);
          return res.status(400).json({
            ok: false,
            error: captureData.error?.description || 'Payment was authorized but could not be captured by Razorpay.',
          });
        }
      } catch (capErr) {
        console.error('[Razorpay Verify] Error during auto-capture:', capErr);
        return res.status(500).json({ ok: false, error: 'Failed to capture authorized payment with Razorpay.' });
      }
    }

    // 4. Confirm payment is strictly captured
    if (payment.status !== 'captured') {
      console.error(`[Razorpay Verify] Payment ${paymentId} status is '${payment.status}' (not captured).`);
      return res.status(400).json({
        ok: false,
        error: `Payment status is ${payment.status}. Payment must be captured before crediting wallet.`,
      });
    }

    const cleanAmount = Number(payment.amount || 0) / 100;
    if (cleanAmount < 300) {
      return res.status(400).json({ ok: false, error: 'Payment amount is below minimum ₹300.' });
    }

    const cleanPhone = String(phone || customerId || payment.contact || '').replace(/\D/g, '').slice(-10);
    const targetCustId = customerId || payment.notes?.customer_id || `cust_${cleanPhone || Date.now()}`;

    const billingRes = await query(
      `SELECT COALESCE(w.currency, c.currency, 'INR') AS currency
       FROM customers c LEFT JOIN wallets w ON w.customer_id = c.id WHERE c.id = $1 LIMIT 1`,
      [targetCustId]
    );
    if (billingRes.rowCount && String(billingRes.rows[0].currency).toUpperCase() !== 'INR') {
      return res.status(400).json({ ok: false, error: 'Razorpay cannot credit a non-INR wallet.' });
    }

    // 5. Credit wallet via atomic idempotent PostgreSQL transaction
    const result = await creditCustomerWallet({
      customerId: targetCustId,
      phone: cleanPhone,
      username: username || payment.notes?.customer_username,
      amount: cleanAmount,
      referenceUtr: paymentId,
      paymentMethod: payment.method ? `Razorpay ${payment.method.toUpperCase()}` : 'Razorpay Secure (UPI/Card)',
      description: `AdMafia wallet top-up (₹${cleanAmount.toLocaleString('en-IN')})`,
    });
    return res.status(200).json(result);
  } catch (err) {
    console.error('[Razorpay Verify Handler Error]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Helper: Multi-Secret Cryptographic Webhook Signature Validator
function verifyRazorpayWebhookSignature(rawPayload, signature, primarySecret, fallbackSecret) {
  if (!signature) return false;
  const secrets = [primarySecret, fallbackSecret].filter(Boolean);
  const cleanSig = String(signature).trim();

  for (const secret of secrets) {
    try {
      const digest = createHmac('sha256', secret).update(rawPayload).digest('hex');
      const sigBuf = Buffer.from(cleanSig);
      const digBuf = Buffer.from(digest);
      if (sigBuf.length === digBuf.length && timingSafeEqual(sigBuf, digBuf)) {
        return true;
      }
    } catch {
      // Continue to next secret candidate
    }
  }
  return false;
}

app.post('/api/payments/razorpay/webhook', async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    if (!signature) {
      console.warn('[Razorpay Webhook] Rejected: Missing x-razorpay-signature header.');
      return res.status(400).json({ ok: false, error: 'Missing webhook signature.' });
    }

    const rawPayload = req.rawBody || (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
    const isValid = verifyRazorpayWebhookSignature(rawPayload, signature, razorpayWebhookSecret, razorpayKeySecret);

    if (!isValid) {
      console.error('[Razorpay Webhook] Cryptographic signature mismatch. Check RAZORPAY_WEBHOOK_SECRET.');
      return res.status(400).json({ ok: false, error: 'Invalid webhook signature.' });
    }

    // CRITICAL: Acknowledge HTTP 200 OK immediately (< 10ms) to Razorpay!
    // Razorpay strictly enforces a 5-second timeout. Responding immediately guarantees 0 timeouts & 0 drop rate.
    res.status(200).json({ ok: true, status: 'received' });

    // Execute wallet credit & database reconciliation asynchronously in background
    const event = req.body?.event;
    console.log(`[Razorpay Webhook] Signature verified. Queued event for async processing: ${event}`);

    setImmediate(async () => {
      try {
        if (event === 'payment.captured' || event === 'payment.authorized') {
          let payment = req.body?.payload?.payment?.entity;
          const paymentId = payment?.id;
          let amount = Number(payment?.amount || 0) / 100;
          let customerId = payment?.notes?.customer_id;
          let cleanPhone = String(payment?.contact || payment?.notes?.customer_phone || '').replace(/\D/g, '').slice(-10);

          // Auto-capture authorized payments before crediting
          if (payment?.status === 'authorized') {
            try {
              const capResp = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}/capture`, {
                method: 'POST',
                headers: {
                  Authorization: `Basic ${Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString('base64')}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ amount: payment.amount, currency: payment.currency || 'INR' }),
              });
              if (capResp.ok) {
                payment = await capResp.json();
                amount = Number(payment.amount || 0) / 100;
              }
            } catch (capErr) {
              console.error('[Razorpay Webhook] Auto-capture call failed:', capErr.message);
            }
          }

          // Fallback Customer Resolution if notes were truncated or omitted
          if (!customerId && !cleanPhone && payment?.email) {
            try {
              const custByEmail = await query('SELECT id, phone FROM customers WHERE email = $1 LIMIT 1', [payment.email]);
              if (custByEmail.rowCount > 0) {
                customerId = custByEmail.rows[0].id;
                cleanPhone = custByEmail.rows[0].phone;
              }
            } catch (lookupErr) {
              console.warn('[Razorpay Webhook] Email lookup error:', lookupErr.message);
            }
          }

          if (payment?.order_id && (!customerId || !cleanPhone)) {
            try {
              const custByOrder = await query(
                `SELECT customer_id FROM payment_records WHERE order_id = $1 OR utr_reference = $1 LIMIT 1`,
                [payment.order_id]
              );
              if (custByOrder.rowCount > 0 && custByOrder.rows[0].customer_id) {
                customerId = custByOrder.rows[0].customer_id;
              }
            } catch { }
          }

          if (payment?.status === 'captured' && (customerId || cleanPhone) && amount >= 300) {
            await creditCustomerWallet({
              customerId,
              phone: cleanPhone,
              username: payment?.notes?.customer_username,
              amount,
              referenceUtr: paymentId,
              paymentMethod: payment.method ? `Razorpay ${payment.method.toUpperCase()}` : 'Razorpay Secure (UPI/Card)',
              description: `AdMafia wallet top-up (₹${amount.toLocaleString('en-IN')})`,
            });
            console.log(`[Razorpay Webhook] Successfully credited ₹${amount} for payment ${paymentId} (Customer: ${customerId || cleanPhone}).`);
          } else {
            console.warn(`[Razorpay Webhook] Skipped credit: status=${payment?.status}, amount=${amount}, customerId=${customerId}, phone=${cleanPhone}`);
          }
        } else if (event === 'order.paid') {
          const order = req.body?.payload?.order?.entity;
          const orderId = order?.id;
          const amount = Number(order?.amount_paid || order?.amount || 0) / 100;
          const customerId = order?.notes?.customer_id;
          const cleanPhone = String(order?.notes?.customer_phone || '').replace(/\D/g, '').slice(-10);

          if (orderId && amount >= 300) {
            try {
              const ordPaymentsResp = await fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(orderId)}/payments`, {
                headers: { Authorization: `Basic ${Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString('base64')}` },
              });
              const ordPayments = await ordPaymentsResp.json();
              const items = Array.isArray(ordPayments?.items) ? ordPayments.items : [];
              const capturedPayment = items.find((p) => p.status === 'captured') || items[0];
              const canonicalPaymentId = capturedPayment?.id || orderId;

              await creditCustomerWallet({
                customerId,
                phone: cleanPhone,
                username: order?.notes?.customer_username,
                amount,
                referenceUtr: canonicalPaymentId,
                paymentMethod: capturedPayment?.method ? `Razorpay ${capturedPayment.method.toUpperCase()}` : 'Razorpay Secure (Order)',
                description: `AdMafia wallet top-up (₹${amount.toLocaleString('en-IN')})`,
              });
              console.log(`[Razorpay Webhook] Successfully credited order ${orderId} (Payment: ${canonicalPaymentId}).`);
            } catch (ordErr) {
              console.error('[Razorpay Webhook] Order payments fetch error:', ordErr.message);
            }
          }
        } else if (event === 'refund.processed' || event === 'refund.created') {
          const refund = req.body?.payload?.refund?.entity;
          const payment = req.body?.payload?.payment?.entity;
          const refundId = refund?.id;
          const paymentId = refund?.payment_id || payment?.id;
          const refundAmt = Number(refund?.amount || 0) / 100;

          if (refundId && refundAmt > 0) {
            console.log(`[Razorpay Webhook] Processing refund: ${refundId} for payment: ${paymentId}, amount: ₹${refundAmt}`);
            await withTransaction(async (txQuery) => {
              await txQuery(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`refund_${refundId}`]);

              const existingRef = await txQuery(
                `SELECT id FROM wallet_transactions WHERE reference_utr = $1 LIMIT 1`,
                [refundId]
              );
              if (existingRef.rowCount > 0) {
                console.log(`[Razorpay Webhook] Refund ${refundId} already recorded.`);
                return;
              }

              const origTx = await txQuery(
                `SELECT customer_id, wallet_id FROM wallet_transactions WHERE reference_utr = $1 LIMIT 1`,
                [paymentId]
              );
              let targetCustId = origTx.rows[0]?.customer_id || payment?.notes?.customer_id;
              let targetWalletId = origTx.rows[0]?.wallet_id;

              if (!targetCustId && payment?.contact) {
                const cleanP = String(payment.contact).replace(/\D/g, '').slice(-10);
                const cRes = await txQuery(`SELECT id FROM customers WHERE phone = $1 LIMIT 1`, [cleanP]);
                targetCustId = cRes.rows[0]?.id;
              }

              if (targetCustId) {
                const walRes = await txQuery(
                  `UPDATE wallets SET
                    available_balance = GREATEST(0, available_balance - $1::NUMERIC),
                    total_lifetime_paid = GREATEST(0, total_lifetime_paid - $1::NUMERIC),
                    updated_at = NOW()
                   WHERE customer_id = $2
                   RETURNING id, available_balance`,
                  [refundAmt, targetCustId]
                );
                const updatedBal = Number(walRes.rows[0]?.available_balance || 0);
                const walId = walRes.rows[0]?.id || targetWalletId;

                await txQuery(
                  `INSERT INTO wallet_transactions (
                    id, customer_id, wallet_id, tx_type, amount, balance_after, reference_utr, description, payment_method, status
                  ) VALUES ($1, $2, $3, 'Debit', $4, $5, $6, $7, 'Razorpay Online Refund', 'Refunded ✓')
                  ON CONFLICT (reference_utr) DO NOTHING`,
                  [
                    `tx_rfnd_${Date.now()}_${randomBytes(3).toString('hex')}`,
                    targetCustId,
                    walId,
                    refundAmt,
                    updatedBal,
                    refundId,
                    `Online refund processed via Razorpay (Ref: ${paymentId})`,
                  ]
                );

                await txQuery(
                  `INSERT INTO refund_requests (
                    id, customer_id, wallet_id, original_tx_ref, amount, reason, status, provider_ref, reviewed_by, reviewed_at
                  ) VALUES ($1, $2, $3, $4, $5, $6, 'Completed', $7, 'Razorpay Webhook (Automated)', NOW())
                  ON CONFLICT (id) DO NOTHING`,
                  [
                    `rfnd_req_${Date.now()}_${randomBytes(3).toString('hex')}`,
                    targetCustId,
                    walId,
                    paymentId,
                    refundAmt,
                    `Razorpay automated webhook refund (${refund.notes?.reason || 'Customer requested / Bank reversal'})`,
                    refundId,
                  ]
                );

                await txQuery(
                  `UPDATE payment_records SET status = 'refunded', notes = notes || ' • Refunded via Razorpay (' || $1 || ')' WHERE utr_reference = $2`,
                  [refundId, paymentId]
                );

                await txQuery(
                  `UPDATE tax_invoices SET status = 'Refunded' WHERE particulars ILIKE '%' || $1 || '%' OR payment_mode ILIKE '%' || $1 || '%'`,
                  [paymentId]
                );

                console.log(`[Razorpay Webhook] Refund ${refundId} completed successfully for customer ${targetCustId}.`);
              }
            });
          }
        } else if (event === 'payment.failed') {
          const payment = req.body?.payload?.payment?.entity;
          let customerId = payment?.notes?.customer_id;
          const cleanPhone = String(payment?.contact || '').replace(/\D/g, '').slice(-10);

          if (!customerId && cleanPhone) {
            const custLookup = await query(
              `SELECT id FROM customers WHERE phone = $1 OR RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 10) = $1 LIMIT 1`,
              [cleanPhone]
            );
            if (custLookup.rows[0]) customerId = custLookup.rows[0].id;
          }
          if (!customerId && payment?.email) {
            const emailLookup = await query(
              `SELECT id FROM customers WHERE LOWER(email) = LOWER($1) LIMIT 1`,
              [payment.email.trim()]
            );
            if (emailLookup.rows[0]) customerId = emailLookup.rows[0].id;
          }

          if (customerId && payment?.id) {
            const failAmount = Number(payment.amount || 0) / 100;
            const walRes = await query('SELECT id, available_balance FROM wallets WHERE customer_id = $1 LIMIT 1', [customerId]);
            const walletId = walRes.rows[0]?.id || `wal_${customerId}`;
            const currentBal = Number(walRes.rows[0]?.available_balance || 0);

            await query(
              `INSERT INTO wallet_transactions (
                id, customer_id, wallet_id, tx_type, amount, balance_after, reference_utr, description, payment_method, status, created_at
              ) VALUES ($1, $2, $3, 'Credit', $4, $5, $6, $7, $8, 'Payment Declined ✕', NOW())
              ON CONFLICT (reference_utr) DO UPDATE SET 
                status = 'Payment Declined ✕',
                description = EXCLUDED.description`,
              [
                `tx_fail_${payment.id}`,
                customerId,
                walletId,
                failAmount > 0 ? failAmount : 300,
                currentBal,
                payment.id,
                `Online recharge failed: ${payment.error_description || payment.error_reason || 'Payment declined by bank'}`,
                payment.method ? `Razorpay ${payment.method.toUpperCase()}` : 'Razorpay Gateway',
              ]
            ).catch((err) => console.error('[Razorpay Webhook payment.failed]', err.message));
          }
        }
      } catch (bgErr) {
        console.error('[Razorpay Webhook Background Processing Error]:', bgErr);
      }
    });
  } catch (err) {
    console.error('[POST /api/payments/razorpay/webhook] Synchronous Handler Error:', err);
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
    const { customerId, phone, username, companyName, company, amount, referenceUtr, description, paymentMethod, failureReason } = req.body || {};
    const cleanPhone = String(phone || customerId || '').replace(/\D/g, '').slice(-10);

    let custRes = await query(
      `SELECT * FROM customers 
       WHERE id = $1 
          OR (phone IS NOT NULL AND phone != '' AND RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 10) = $2)
          OR (username IS NOT NULL AND username != '' AND LOWER(username) = LOWER($3))
       LIMIT 1`,
      [customerId || '', cleanPhone || '9999999999', username || '']
    );

    let cust = custRes.rows[0];
    if (!cust) {
      const newCustId = customerId || (cleanPhone ? `cust_${cleanPhone}` : `cust_${Date.now()}`);
      const newUsername = username || (cleanPhone ? `user_${cleanPhone}` : `client_${Date.now().toString().slice(-4)}`);
      const newComp = companyName || company || 'Client Account';
      const insCust = await query(`
        INSERT INTO customers (id, username, company_name, contact_person, phone, password_hash, registered_at)
        VALUES ($1, $2, $3, $4, $5, 'Client@AutoInit2026', NOW())
        ON CONFLICT (id) DO UPDATE SET phone = EXCLUDED.phone
        RETURNING *
      `, [newCustId, newUsername, newComp, newUsername, cleanPhone || '9999999999']);
      cust = insCust.rows[0];
    }

    const walRes = await query('SELECT id, available_balance FROM wallets WHERE customer_id = $1 LIMIT 1', [cust.id]);
    let walletId = walRes.rows[0]?.id;
    let currentBal = Number(walRes.rows[0]?.available_balance || 0);

    if (!walletId) {
      const newWalId = `wal_${cust.id}`;
      const walIns = await query(`
        INSERT INTO wallets (id, customer_id, available_balance)
        VALUES ($1, $2, 0)
        ON CONFLICT (customer_id) DO UPDATE SET customer_id = EXCLUDED.customer_id
        RETURNING id, available_balance
      `, [newWalId, cust.id]);
      walletId = walIns.rows[0]?.id || newWalId;
      currentBal = 0;
    }

    const cleanAmount = Number(amount || 0);
    const txId = `tx_fail_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const utr = (referenceUtr || `FAIL-${Date.now().toString().slice(-6)}`).trim();
    const reasonText = failureReason || 'Payment declined by bank or cancelled';
    const txDesc = description || `Wallet recharge attempt failed: ${reasonText}`;
    const meth = paymentMethod || 'Razorpay Gateway';

    const txInsert = await query(
      `INSERT INTO wallet_transactions (
        id, customer_id, wallet_id, tx_type, amount, balance_after, reference_utr, description, payment_method, status, created_at
      ) VALUES ($1, $2, $3, 'Credit', $4, $5, $6, $7, $8, 'Payment Declined ✕', NOW())
      ON CONFLICT (reference_utr) DO UPDATE SET 
        status = 'Payment Declined ✕',
        description = EXCLUDED.description
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
      const walletCurrency = String(wallet.currency || 'INR').toUpperCase();
      const currencySymbol = walletCurrency === 'USD' ? '$' : '₹';
      const minimumDailySpend = walletCurrency === 'INR' ? 300 : walletCurrency === 'USD' ? 10 : null;
      if (minimumDailySpend === null || String(cust.currency || walletCurrency).toUpperCase() !== walletCurrency) {
        throw Object.assign(new Error('Unsupported or mismatched customer and wallet currency.'), { statusCode: 409 });
      }
      const requestedSpend = amount === undefined || amount === null || amount === '' ? Number(wallet?.daily_ad_spend || minimumDailySpend) : Number(amount);
      if (!Number.isFinite(requestedSpend) || requestedSpend < minimumDailySpend) {
        throw Object.assign(new Error(`Daily spend minimum is ${walletCurrency === 'INR' ? '₹300' : '$10'}.`), { statusCode: 400 });
      }
      const spendAmt = requestedSpend;
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
        const err = new Error(`Insufficient wallet balance (${currencySymbol}${currentBal}) for ${currencySymbol}${spendAmt} daily ad spend.`);
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
      ).catch(() => { });

      const txId = `tx_deb_${Date.now()}`;
      const refUtr = `AUTO-AD-${Date.now()}`;
      const txInsert = await txQuery(
        `INSERT INTO wallet_transactions (
          id, customer_id, wallet_id, tx_type, amount, balance_after, reference_utr, description, payment_method, status, currency
        ) VALUES ($1, $2, $3, 'Debit', $4, $5, $6, $7, 'Daily Auto-Debit', 'Settled ✓', $8)
        RETURNING *`,
        [
          txId,
          cust.id,
          wallet.id,
          spendAmt,
          nextBal,
          refUtr,
          `Daily Meta Ads Campaign Spend Deduction (-${currencySymbol}${spendAmt}/day)`,
          walletCurrency,
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
    let existing = await query('SELECT * FROM leads WHERE id = $1', [leadId]);
    if (existing.rowCount === 0) {
      const cleanDigits = String(leadId).replace(/\D/g, '').slice(-10);
      if (cleanDigits.length === 10) {
        existing = await query('SELECT * FROM leads WHERE buyer_phone = $1 ORDER BY created_at DESC LIMIT 1', [cleanDigits]);
      }
    }
    if (existing.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Lead not found' });
    }
    const row = existing.rows[0];
    const targetLeadId = row.id;
    const nextStatus = status !== undefined ? status : row.status;
    const nextRead = read !== undefined ? Boolean(read) : is_read !== undefined ? Boolean(is_read) : Boolean(row.is_read);
    const nextNotes = notes !== undefined ? notes : row.notes;

    const updated = await query(
      `UPDATE leads SET status = $1, is_read = $2, notes = $3, updated_at = NOW() WHERE id = $4 RETURNING *`,
      [nextStatus, nextRead, nextNotes, targetLeadId]
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
        [nextStatus, nextRead, nextNotes, interest, targetLeadId, row.master_lead_id || '', row.customer_id || '']
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

// Delete payment record by ID, receipt number, or UTR (with wallet adjustment)
app.delete('/api/payments/:id', async (req, res) => {
  try {
    const rawId = decodeURIComponent(req.params.id || '').trim();
    if (!rawId) return res.status(400).json({ ok: false, error: 'Payment ID or Receipt Number required' });

    // 1. Support batch purging of test entries
    if (rawId === 'test-entries' || rawId === 'testing-data') {
      const testUtrs = ['aaggg', 'aa', 'pay_TvCjRvjJKpHawP', 'pay_TvCfjhW56ixevu'];
      const testReceipts = ['REC_1793882500916_D467', 'REC_1793881526162_E051', 'RCP-2026-5814', 'RCP-2026-9969'];
      const testPayIds = ['pay_1793882500916_18d1ec', 'pay_1793881526162_89c397', 'pay_1793600155814', 'pay_1793600029969'];
      const testTxIds = ['tx_sales_1793882500877_e9eea9', 'tx_sales_1793881526137_245853', 'tx_1793600155807', 'tx_1793600029957', 'tx_deb_1793600430780_cz2cl5'];

      await withTransaction(async (txQuery) => {
        await txQuery(
          `DELETE FROM payment_records 
           WHERE receipt_number = ANY($1::text[]) 
              OR utr_reference = ANY($2::text[])
              OR id = ANY($3::text[])`,
          [testReceipts, testUtrs, testPayIds]
        );

        await txQuery(
          `DELETE FROM wallet_transactions 
           WHERE reference_utr = ANY($1::text[])
              OR id = ANY($2::text[])`,
          [testUtrs, testTxIds]
        );

        await txQuery(
          `DELETE FROM tax_invoices 
           WHERE invoice_number = ANY($1::text[]) 
              OR utr = ANY($2::text[])`,
          [testReceipts, testUtrs]
        );

        await txQuery(
          `UPDATE wallets 
           SET available_balance = 0, total_lifetime_paid = 0 
           WHERE customer_id IN (
             SELECT id FROM customers WHERE phone IN ('7383198428', '8200792130')
           )`
        );

        await txQuery(
          `UPDATE customers 
           SET payment_status = 'pending', amount_paid = 0 
           WHERE phone IN ('7383198428', '8200792130')`
        );
      });

      return res.json({ ok: true, deleted: true, purgedTestEntries: true });
    }

    // 2. Individual payment record deletion
    const findRes = await query(
      `SELECT * FROM payment_records 
       WHERE id = $1 
          OR receipt_number = $1 
          OR utr_reference = $1
       LIMIT 1`,
      [rawId]
    );

    if (findRes.rowCount === 0) {
      // Check wallet_transactions
      const delWtOnly = await query(
        `DELETE FROM wallet_transactions 
         WHERE id = $1 
            OR reference_utr = $1 
         RETURNING *`,
        [rawId]
      );
      if (delWtOnly.rowCount > 0) {
        return res.json({ ok: true, deleted: true, from: 'wallet_transactions', count: delWtOnly.rowCount });
      }
      return res.status(404).json({ ok: false, error: 'Payment record not found' });
    }

    const payRow = findRes.rows[0];
    const receiptNo = payRow.receipt_number;
    const utrRef = payRow.utr_reference;
    const custId = payRow.customer_id;
    const payAmt = Number(payRow.amount || 0);

    await withTransaction(async (txQuery) => {
      // 1. Delete payment_records row
      await txQuery(`DELETE FROM payment_records WHERE id = $1`, [payRow.id]);

      // 2. Delete wallet_transactions credit
      await txQuery(
        `DELETE FROM wallet_transactions 
         WHERE (reference_utr = $1 OR reference_utr = $2 OR id = $3)
           AND (customer_id = $4 OR customer_id = $5)`,
        [utrRef, receiptNo, payRow.id, custId, payRow.phone]
      );

      // 3. Delete tax_invoices
      await txQuery(
        `DELETE FROM tax_invoices 
         WHERE (invoice_number = $1 OR payment_record_id = $2 OR utr = $3)`,
        [receiptNo, payRow.id, utrRef]
      );

      // 4. Adjust wallet balance
      if (custId && payAmt > 0) {
        await txQuery(
          `UPDATE wallets 
           SET available_balance = GREATEST(0, available_balance - $1),
               total_lifetime_paid = GREATEST(0, total_lifetime_paid - $1)
           WHERE customer_id = $2`,
          [payAmt, custId]
        );
      }
    });

    res.json({ ok: true, deleted: true, receiptNumber: receiptNo, utr: utrRef });
  } catch (err) {
    console.error('[DELETE /api/payments/:id]', err);
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

app.get('/api/queries', async (req, res) => {
  try {
    const { customerId } = req.query;
    let sql = 'SELECT * FROM support_queries';
    const params = [];
    if (customerId) {
      sql += ' WHERE customer_id = $1';
      params.push(customerId);
    }
    sql += ' ORDER BY created_at DESC';
    const result = await query(sql, params);
    res.json({ ok: true, queries: result.rows.map(mapQueryRow) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/queries', async (req, res) => {
  try {
    const {
      customerId = null,
      company = 'Client Account',
      companyName,
      contactName = '',
      contactEmail = '',
      contactPhone = '',
      category = 'Campaign Delivery & Pacing',
      subject = 'Customer Support Inquiry',
      priority = 'Normal',
      internalNotes = '',
      status = 'open',
    } = req.body || {};

    const id = `qry_${Date.now()}_${Math.floor(100 + Math.random() * 900)}`;
    const comp = companyName || company || 'Client Account';
    const cleanPhone = String(contactPhone).replace(/\D/g, '').slice(-10);

    const result = await query(
      `INSERT INTO support_queries (
        id, customer_id, company_name, contact_name, contact_email, contact_phone,
        category, subject, priority, internal_notes, status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      RETURNING *`,
      [
        id,
        customerId || null,
        comp,
        contactName || '',
        contactEmail || '',
        cleanPhone || '',
        category,
        subject,
        priority,
        internalNotes || '',
        status.toLowerCase(),
      ]
    );

    res.status(201).json({ ok: true, query: mapQueryRow(result.rows[0]) });
  } catch (err) {
    console.error('[POST /api/queries]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.patch('/api/queries/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, internalNotes, assignedAdmin } = req.body || {};
    const updates = [];
    const params = [id];
    let idx = 2;

    if (status) {
      updates.push(`status = $${idx++}`);
      params.push(status.toLowerCase());
      if (status.toLowerCase() === 'resolved') {
        updates.push(`resolved_at = NOW()`);
      } else {
        updates.push(`resolved_at = NULL`);
      }
    }
    if (internalNotes !== undefined) {
      updates.push(`internal_notes = $${idx++}`);
      params.push(internalNotes);
    }
    if (assignedAdmin !== undefined) {
      updates.push(`assigned_admin = $${idx++}`);
      params.push(assignedAdmin);
    }

    if (updates.length === 0) {
      const existing = await query('SELECT * FROM support_queries WHERE id = $1', [id]);
      return res.json({ ok: true, query: mapQueryRow(existing.rows[0]) });
    }

    const sql = `UPDATE support_queries SET ${updates.join(', ')} WHERE id = $1 RETURNING *`;
    const result = await query(sql, params);
    if (result.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Query not found' });
    }
    res.json({ ok: true, query: mapQueryRow(result.rows[0]) });
  } catch (err) {
    console.error('[PATCH /api/queries/:id]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete('/api/queries/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query('DELETE FROM support_queries WHERE id = $1 RETURNING id', [id]);
    res.json({ ok: true, deletedCount: result.rowCount });
  } catch (err) {
    console.error('[DELETE /api/queries/:id]', err);
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
// 6E. PUBLIC COUNTRY PRICING & LOCALIZATION API ROUTER (/api/public/*)
// =============================================================================
app.use('/api/public', countryPricingRouter);

// =============================================================================
// 6F. SUPER ADMIN COUNTRY PRICING CONFIGURATION ROUTER (/api/superadmin/country-pricing)
// =============================================================================
app.use('/api/superadmin/country-pricing', superadminCountryPricingRouter);

// =============================================================================
// 7. PRODUCTION STATIC FRONTEND SERVING (When frontend/dist is built on VPS)
// =============================================================================
const frontendDistPath = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(frontendDistPath)) {
  // Personalize the initial document on the server, before React is downloaded.
  // Both this HTML response and the country bootstrap are private/no-store so a
  // CDN or reverse proxy cannot reuse one visitor's prices for another.
  app.get(['/', '/index.html'], async (req, res, next) => {
    try {
      if (databaseReady) await databaseReady;
      const detection = await resolveVisitorCountry(req);
      const country = getPricingForCountryCode(detection.detectedCode);
      if (!country) {
        let html = await fs.promises.readFile(path.join(frontendDistPath, 'index.html'), 'utf8');
        const notice = '<div class="country-pricing-unavailable" role="status">We could not determine country pricing for your location.</div>';
        html = html.replace('<div id="root"></div>', `<div id="root">${notice}</div>`);
        res.set({ 'Cache-Control': 'private, no-store', 'CDN-Cache-Control': 'no-store', 'Surrogate-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8' });
        return res.status(503).send(html);
      }
      const dailyAmount = Number(country.daily_min_budget);
      const priceNumber = new Intl.NumberFormat('en-US', {
        maximumFractionDigits: Number(country.decimal_precision || 0),
      }).format(dailyAmount);
      const safeSymbol = String(country.currency_symbol || country.currency_code).replace(/[&<>"']/g, (char) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
      })[char]);
      const dailyRate = `${safeSymbol}${priceNumber}/Day`;
      const bootstrap = JSON.stringify(country).replace(/</g, '\\u003c');
      const { renderHomepage } = await import(pathToFileURL(path.join(frontendDistPath, 'server', 'entry-server.js')).href);
      const ssrHomepage = await renderHomepage(country);
      let html = await fs.promises.readFile(path.join(frontendDistPath, 'index.html'), 'utf8');
      html = html.replace('<div id="root"></div>', `<div id="root">${ssrHomepage}</div>`);
      html = html.replace('</head>', `<script>window.__ADMAFIA_COUNTRY__=${bootstrap};window.__ADMAFIA_SSR__=true;</script></head>`);
      res.set({
        'Cache-Control': 'private, no-store, no-cache, must-revalidate',
        'CDN-Cache-Control': 'no-store',
        'Surrogate-Control': 'no-store',
        'Vary': 'CF-IPCountry, CF-Connecting-IP, X-Forwarded-For',
        'Content-Type': 'text/html; charset=utf-8',
      });
      res.set('X-GeoIP-Country', detection.detectedCode);
      return res.status(200).send(html);
    } catch (error) {
      return next(error);
    }
  });

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
  databaseReady = initDatabase();
  databaseReady
    .then((info) => {
      console.log(`🚀 Growthline CRM Backend API listening on http://localhost:${PORT} (DB mode: ${info.mode})`);

      // Clean up dismissed test failed transactions
      query(`
        DELETE FROM wallet_transactions 
        WHERE reference_utr LIKE 'DISMISS-%' 
           OR id IN ('tx_fail_1793614599726_c2mx', 'tx_fail_1793614589017_m0gm', 'tx_fail_1793626722094_be89')
      `).then((delRes) => {
        if (delRes.rowCount > 0) {
          console.log(`[DB Cleanup] Purged ${delRes.rowCount} dismissed test failed transactions.`);
        }
      }).catch((err) => console.warn('[DB Cleanup Warning]', err.message));

      // Purge test payments & test wallet entries requested by admin
      const testUtrs = ['aaggg', 'aa', 'pay_TvCjRvjJKpHawP', 'pay_TvCfjhW56ixevu'];
      const testReceipts = ['REC_1793882500916_D467', 'REC_1793881526162_E051', 'RCP-2026-5814', 'RCP-2026-9969'];
      const testPayIds = ['pay_1793882500916_18d1ec', 'pay_1793881526162_89c397', 'pay_1793600155814', 'pay_1793600029969'];
      const testTxIds = ['tx_sales_1793882500877_e9eea9', 'tx_sales_1793881526137_245853', 'tx_1793600155807', 'tx_1793600029957', 'tx_deb_1793600430780_cz2cl5'];

      query(
        `DELETE FROM payment_records 
         WHERE receipt_number = ANY($1::text[]) 
            OR utr_reference = ANY($2::text[]) 
            OR id = ANY($3::text[])`,
        [testReceipts, testUtrs, testPayIds]
      ).catch(() => { });

      query(
        `DELETE FROM wallet_transactions 
         WHERE reference_utr = ANY($1::text[]) 
            OR id = ANY($2::text[])`,
        [testUtrs, testTxIds]
      ).catch(() => { });

      // Purge specified test accounts (@abc, @xxx) requested by admin
      purgeSpecifiedTestUsers().catch((err) => console.warn('[Purge Test Users Warning]', err.message));

      // Run daily ad spend pacing evaluation 3s after startup, then every 30 minutes
      // Initialize MongoDB for Creative Content & Telemetry
      initMongo()
        .then((mStatus) => {
          if (mStatus.connected) {
            migrateHistoricalMarketingData()
              .then((etlRes) => {
                if (etlRes.ok) {
                  console.log(`[MongoDB ETL] Auto-sync verified (${etlRes.synced?.posts || 0} posts, ${etlRes.synced?.revisions || 0} revisions, ${etlRes.synced?.auditEvents || 0} audit events)`);
                }
              })
              .catch((etlErr) => console.warn('[MongoDB ETL Warning]:', etlErr.message));
          }
          // Start background transactional outbox relay worker
          startOutboxWorker(2500);
        })
        .catch((mErr) => {
          console.warn('[MongoDB Warning]:', mErr.message);
          startOutboxWorker(5000);
        });

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
