import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { initMongo, getMongoStatus, isMongoConnected } from './mongo.js';
import { withMongoTransaction } from './repositories/tx.js';
import {
  Customer,
  CustomerGroup,
  SystemUser,
  Wallet,
  PendingVerification,
  Lead,
  WalletTransaction,
  TaxInvoice,
  PaymentRecord,
  MasterLead,
  LeadAssignment,
  DeletedFailedTransaction,
  SecurityEventLog,
} from './models/index.js';
import { hashPassword, verifyPassword } from './utils/passwordCrypto.js';
import {
  evaluateCustomerProfileCompletion,
  sanitizeCustomerProfileFields,
} from './utils/profileCompletion.js';
import { consumeOtpVerificationToken } from './services/whatsappOtpService.js';
import { otpAuthRouter } from './routes/otpAuth.js';
import { notificationsRouter } from './routes/notifications.js';
import { superadminOpsRouter } from './routes/superadminOps.js';
import {
  attachOptionalAuth,
  requireAuth,
  requireStaff,
  requireSuperAdmin,
  requireCustomerSelfOrStaff,
  issueCustomerSession,
  issueStaffSession,
  clearAuthCookie,
} from './middleware/authMiddleware.js';
import {
  securityHeadersMiddleware,
  strictCorsMiddleware,
  mongoSanitizeMiddleware,
  createRateLimiter,
  getClientIp,
} from './middleware/securityMiddleware.js';
import { getRedisHealth } from './services/redisStore.js';
import { withDistributedCronLock } from './services/cronLock.js';
import {
  ciExact,
  customerIdentifierFilter,
  getCustomerViewRows,
  getCustomerViewRowById,
  getCustomerViewRowByIdentifier,
  leadsToRows,
  walletTxToRow,
  invoiceToRow,
  paymentToRow,
  loadSalesStateRows,
  findSystemUserRowByLogin,
  systemUserToRow,
} from './repositories/salesViewRepo.js';
import {
  SALES_FAILED_TX_FILTER,
  DISMISSED_TX_FILTER,
  asScalarString,
  loadTransactionRows,
  loadBalanceLogRows,
  loadFailedTransactionData,
  archiveFailedTransactions,
  deleteWalletTransactions,
  txIdOrUtrFilter,
  txIdsOrUtrsFilter,
  deletedHistoryFilter,
  listDeletedFailedTransactionRows,
  restoreDeletedFailedTransaction,
  findTopupCustomerFilter,
  utrAlreadyCredited,
  creditSalesTopup,
  findCustomerByIdOrPhone,
  applyCustomerProfile,
  applyCustomerRecordUpdate,
  applyWalletSettings,
  deleteCustomerCascade,
} from './repositories/salesLedgerRepo.js';
import {
  seedBaselineData,
  purgeLegacyTestLedgerRows,
  repairIncompleteCustomerProfiles,
} from './repositories/bootstrapRepo.js';
import { startOutboxWorker, recordOutboxEvent } from './services/outboxWorker.js';
import { getEvaluatedRecipients, getGroupEligibilityCounts, getCategoryEligibilityCounts } from './services/leadEligibility.js';
import { marketingRouter, processDailyAdSpendPacing } from './routes/marketing.js';
import { graphicsRouter } from './routes/graphics.js';
import { superadminRouter, logSuperAdminAudit } from './routes/superadmin.js';
import { countryPricingRouter, superadminCountryPricingRouter } from './routes/countryPricing.js';
import { resolveVisitorCountry, getPricingForCountryCode } from './services/countryDetection.js';
import { purgeSpecifiedTestUsers } from './scripts/purge-test-users.js';
import {
  findCustomerFlexible,
  getBillingCurrency,
  findCustomerByEmailExact,
  findCustomerByEmailCi,
  findCustomerByPhoneDigits,
  findPaymentCustomerByOrder,
  upsertDeclinedTransaction,
  insertCallbackFailureRow,
  recordFailedTransaction,
  creditWalletByUtr,
  processRazorpayRefund,
  deductWalletForDay,
} from './repositories/razorpayRepo.js';
import {
  listLeadRows,
  createDirectLeadRow,
  updateLeadAndSyncAssignment,
  listPaymentRecordRows,
  deletePaymentOrTestEntries,
  listTaxInvoiceRows,
  listPendingVerificationRows,
  listSupportQueryRows,
  createSupportQueryRow,
  updateSupportQueryRow,
  deleteSupportQueryById,
  createSalesTaskRow,
  createCustomerGroupRow,
  updateCustomerGroupRow,
  deleteCustomerGroupCascade,
  listGroupMembers,
  assignGroupMembers,
  removeGroupMember,
  findGroupById,
  resolveDistributionGroup,
  distributeMasterLeadAtomic,
  listDistributionHistory,
  getDistributionDetail,
  updateLeadAssignmentAndSync,
} from './repositories/leadsAndOpsRepo.js';

// Enterprise Crash-Protection: Prevent container exit on unhandled promise rejections or uncaught errors
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err.stack || err.message || err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason?.stack || reason?.message || reason);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const explicitProcessEnv = { ...process.env };
const backendEnvPath = path.join(__dirname, '.env');
const backendEnvLocalPath = path.join(__dirname, '.env.local');
const rootEnvPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(backendEnvPath)) {
  dotenv.config({ path: backendEnvPath });
}
if (process.env.NODE_ENV !== 'production' && fs.existsSync(backendEnvLocalPath)) {
  dotenv.config({ path: backendEnvLocalPath, override: true });
}
if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath, override: true });
}
Object.assign(process.env, explicitProcessEnv);

const app = express();
const PORT = Number(process.env.PORT || 5000);
let databaseReady = null;

// 1. Enterprise Defense-in-Depth Headers & Strict CORS Allowlist
app.use(securityHeadersMiddleware);
app.use(strictCorsMiddleware);

// 2. Route-Scoped 20MB JSON Parser ONLY for Verified Creative Media Uploads; 512KB Everywhere Else
const mediaUploadJsonParser = express.json({ limit: '20mb' });
app.use('/api/marketing/media/upload', mediaUploadJsonParser);
app.use('/api/graphics', mediaUploadJsonParser);
app.use(
  express.json({
    limit: '512kb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

// 3. Recursive NoSQL Operator Sanitizer & Optional JWT Cookie/Bearer Hydration
app.use(mongoSanitizeMiddleware);
app.use(attachOptionalAuth);

// 4. Multi-Tier Distributed Rate Limiters (Redis-backed with automatic memory fallback)
const globalApiLimiter = createRateLimiter({ name: 'api_global', maxRequests: 300, windowSeconds: 60 });
const loginBruteForceLimiter = createRateLimiter({ name: 'auth_login', maxRequests: 10, windowSeconds: 300 });
app.use('/api', globalApiLimiter);

// 5. Universal WhatsApp OTP Auth & Real-Time Notifications Routers
app.use('/api', otpAuthRouter);
app.use('/api/notifications', notificationsRouter);

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

// Helper: Format customer view row (see repositories/salesViewRepo.js buildCustomerViewRow) to frontend shape
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
  const evalProf = evaluateCustomerProfileCompletion(row);
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
    password: '••••••••••••',
    passwordMasked: '••••••••••••',
    category: evalProf.sanitized.category,
    industry: evalProf.sanitized.industry,
    website: row.website || '',
    domain: row.website || '',
    city: evalProf.sanitized.city,
    state: evalProf.sanitized.state,
    country: row.country || 'India',
    countryCode: String(row.country_code || 'IN').toUpperCase(),
    currency: String(row.currency || 'INR').toUpperCase(),
    currencySymbol: row.currency === 'USD' ? '$' : row.currency === 'AED' ? 'AED ' : row.currency === 'GBP' ? '£' : row.currency === 'SAR' ? 'SAR ' : '₹',
    status: row.status || 'active',
    profileStatus: evalProf.profileStatus,
    profile_status: evalProf.profileStatus,
    paymentStatus: row.payment_status || (balance > 0 ? 'paid' : 'pending'),
    payment_status: row.payment_status || (balance > 0 ? 'paid' : 'pending'),
    kycPercent: evalProf.kycPercent,
    missingProfileFields: evalProf.missingFields,
    verified: evalProf.isComplete,
    phoneVerified: Boolean(row.phone_verified),
    phoneVerifiedAt: row.phone_verified_at || null,
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
    requirement:
      !row.requirement || /meta ads|facebook|instagram|google ads/i.test(String(row.requirement))
        ? 'Verified Business Enquiry'
        : row.requirement,
    budget: row.budget || '₹1.5L – ₹3.5L',
    source:
      !row.source || /meta ads|facebook|instagram|google ads/i.test(String(row.source))
        ? 'Verified Business Enquiry'
        : row.source,
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

function scrubCustomerVisibleDescription(raw, fallback = '') {
  const str = String(raw || '').trim();
  if (!str) return fallback;
  return str
    .replace(/Meta Ads Campaign Ad Spend Budget Credit/gi, 'Lead Generation & Growth Wallet Credit')
    .replace(/Daily Meta Ads? (?:Campaign )?Spend(?: Deduction)?/gi, 'Daily Lead Delivery Service Pacing')
    .replace(/Daily Meta Ad Spend\s*-\s*Per-Day Service/gi, 'Daily Lead Delivery Service Pacing')
    .replace(/\bAd Wallet\b/gi, 'Growth Wallet')
    .replace(/\bAdMafia\b/g, 'Ad Mafia');
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
    desc: scrubCustomerVisibleDescription(row.description),
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
    particulars: scrubCustomerVisibleDescription(row.particulars, 'Lead Generation & Growth Wallet Credit'),
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
    state: row.state || '',
    category: row.category || '',
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
    state: row.state || '',
    category: row.category || '',
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
    typeLabel = 'Daily Lead Delivery Pacing';
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
    city: row.city || row.cust_city || matchedCust?.city || '',
    state: row.state || row.cust_state || matchedCust?.state || '',
    category: row.category || row.cust_category || matchedCust?.category || '',
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
    description: scrubCustomerVisibleDescription(
      row.description || row.notes,
      normalizedStatus === 'failed' ? 'Payment declined by customer bank or user cancelled checkout' : 'Growth Wallet Top-Up'
    ),
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
    if (!isMongoConnected()) {
      throw new Error(`MongoDB is not connected${getMongoStatus().lastError ? `: ${getMongoStatus().lastError}` : ''}`);
    }
    const [
      customersCount, leadsCount, walletsCount, paymentsCount, groupsCount, masterLeadsCount, leadAssignmentsCount,
    ] = await Promise.all([
      Customer.countDocuments({}),
      Lead.countDocuments({}),
      Wallet.countDocuments({}),
      PaymentRecord.countDocuments({}),
      CustomerGroup.countDocuments({}),
      MasterLead.countDocuments({}),
      LeadAssignment.countDocuments({}),
    ]);
    const mongoStatus = getMongoStatus();
    const redisStatus = await getRedisHealth();
    res.json({
      ok: true,
      db: mongoStatus,
      mongo: mongoStatus,
      redis: redisStatus,
      counts: {
        customers_count: customersCount,
        leads_count: leadsCount,
        wallets_count: walletsCount,
        payments_count: paymentsCount,
        groups_count: groupsCount,
        master_leads_count: masterLeadsCount,
        lead_assignments_count: leadAssignmentsCount,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 10k-Scale Paginated Customer Self-Workspace Hydration (Replaces Unbounded Landing-Page /api/state)
app.get('/api/me/workspace', requireAuth, async (req, res) => {
  try {
    const targetCustomerId =
      req.auth.actorType === 'customer'
        ? String(req.auth.customerId || req.auth.sub)
        : String(req.query.customerId || req.auth.customerId || '');

    if (!targetCustomerId) {
      return res.status(400).json({ ok: false, error: 'No associated customer workspace ID.' });
    }

    const viewRow = await getCustomerViewRowByIdentifier(targetCustomerId);
    if (!viewRow) {
      return res.status(404).json({ ok: false, error: 'Customer workspace not found.' });
    }

    const customer = mapCustomerRow(viewRow);
    const leadsLimit = Math.min(200, Math.max(10, Number(req.query.leadsLimit || 60)));
    const txLimit = Math.min(200, Math.max(10, Number(req.query.txLimit || 60)));
    const leadsPage = Math.max(1, Number(req.query.leadsPage || 1));
    const txPage = Math.max(1, Number(req.query.txPage || 1));

    const leadFilter = [{ customerId: customer.id }];
    if (customer.phone) leadFilter.push({ customerPhone: customer.phone });

    const [leadDocs, leadsTotal, txDocs, transactionsTotal, invDocs] = await Promise.all([
      Lead.find({ $or: leadFilter })
        .sort({ assignedAt: -1 })
        .skip((leadsPage - 1) * leadsLimit)
        .limit(leadsLimit)
        .lean(),
      Lead.countDocuments({ $or: leadFilter }),
      WalletTransaction.find({ customerId: customer.id })
        .sort({ createdAt: -1 })
        .skip((txPage - 1) * txLimit)
        .limit(txLimit)
        .lean(),
      WalletTransaction.countDocuments({ customerId: customer.id }),
      TaxInvoice.find({ customerId: customer.id }).sort({ createdAt: -1 }).limit(100).lean(),
    ]);

    const custForLeads = [
      { _id: viewRow.id, username: viewRow.username, phone: viewRow.phone, companyName: viewRow.company_name },
    ];

    return res.json({
      ok: true,
      customer,
      leads: leadsToRows(leadDocs, custForLeads).map(mapLeadRow),
      leadsTotal,
      transactions: txDocs.map(walletTxToRow).map(mapWalletTxRow),
      transactionsTotal,
      invoices: invDocs.map(invoiceToRow).map(mapInvoiceRow),
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// CRIT-03 REMEDIATED: Full CRM state sync is strictly restricted to authenticated internal staff desks
app.get('/api/state', requireStaff(), async (req, res) => {
  try {
    // MongoDB: all collections loaded & converted to the legacy row shape (see repositories/salesViewRepo.js)
    const state = await loadSalesStateRows();

    res.json({
      ok: true,
      customers: state.customers.map((r) => mapCustomerRow(r)),
      leads: state.leads.map(mapLeadRow),
      payments: state.payments.map(mapPaymentRecordRow),
      verifications: state.verifications.map((r) => {
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
      queries: state.queries.map(mapQueryRow),
      tasks: state.tasks,
      groups: state.groups.map(mapGroupRow),
      masterLeads: state.masterLeads.map(mapMasterLeadRow),
      failedTransactions: state.failed.map(mapFailedTxRow),
      deletedFailedTransactions: state.deletedFailed.map(mapDeletedFailedTxRow),
      allTransactions: (() => {
        const customers = state.customers.map(r => mapCustomerRow(r));
        const seenRefs = new Set();
        const seenIds = new Set();
        const list = [];
        for (const r of state.allWalletTx) {
          const it = mapTransactionItem(r, customers);
          if (it) {
            if (it.ref) seenRefs.add(it.ref);
            if (it.id) seenIds.add(it.id);
            list.push(it);
          }
        }
        for (const r of state.payments) {
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
        for (const f of state.failed) {
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
            city: f.city || '',
            state: f.state || '',
            category: f.category || '',
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
app.post('/api/auth/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true, message: 'Signed out successfully.' });
});

app.post('/api/auth/register', async (req, res) => {
  let cleanUsername = '';
  try {
    const {
      username,
      phone,
      mobile,
      email = '',
      password,
      otpVerificationToken,
      companyName,
      contactPerson,
      city = '',
      state = '',
      country = 'India',
      countryCode = 'IN',
      currency = 'INR',
      category = '',
      deposit = 0,
      initialDeposit: reqInitialDeposit,
    } = req.body || {};
    void country;
    void countryCode;
    void currency;
    void deposit;
    void reqInitialDeposit;

    const rawPassword = String(password || '').trim();
    if (rawPassword.length < 6) {
      return res.status(400).json({
        ok: false,
        error: 'Password is required and must be at least 6 characters long.',
      });
    }

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
      cleanPhone = cleanDigits.length === 12 && cleanDigits.startsWith('91') ? cleanDigits.slice(2) : cleanDigits.slice(-10);
      if (cleanPhone.length !== 10 || !/^[6-9]\d{9}$/.test(cleanPhone)) {
        return res.status(400).json({ ok: false, error: 'Valid 10-digit mobile number is required for Indian registration.' });
      }
    } else {
      if (cleanDigits.length < 7 || cleanDigits.length > 15) {
        return res.status(400).json({ ok: false, error: 'Valid international phone number (7-15 digits) is required.' });
      }
    }

    // CRIT-06 REMEDIATED: Never overwrite an existing account by phone!
    const existingPhoneAccount = await Customer.exists({ phone: cleanPhone });
    if (existingPhoneAccount) {
      return res.status(409).json({
        ok: false,
        code: 'PHONE_ALREADY_EXISTS',
        error: 'An account with this WhatsApp number already exists. Please sign in to your workspace.',
      });
    }

    // Validate optional email format & username availability BEFORE consuming single-use OTP token
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (cleanEmail) {
      const strictEmailRegex =
        /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,24}$/;
      if (!strictEmailRegex.test(cleanEmail) || cleanEmail.includes('..')) {
        return res.status(400).json({
          ok: false,
          code: 'INVALID_EMAIL',
          error: 'Please enter a valid email address (for example, name@company.com) or leave it blank.',
        });
      }
    }

    cleanUsername = (username || `user_${cleanPhone.slice(-4)}`).trim().replace(/^@/, '');
    if (cleanUsername.length < 3) {
      return res.status(400).json({
        ok: false,
        error: 'Workspace username must be at least 3 characters long.',
      });
    }

    try {
      const existingUser = await Customer.findOne({ username: ciExact(cleanUsername) })
        .select('_id username phone')
        .lean();
      if (existingUser) {
        return res.status(409).json({
          ok: false,
          code: 'USERNAME_TAKEN',
          error: `The username "${cleanUsername}" is already taken. Please choose another username.`,
        });
      }
    } catch (checkErr) {
      console.warn('[POST /api/auth/register] Username pre-check note:', checkErr.message);
    }

    // MANDATORY UNIVERSAL WHATSAPP OTP GATE ("Every Single User")
    const otpVerified = await consumeOtpVerificationToken({
      token: otpVerificationToken,
      cleanPhone,
      purpose: 'register',
    });
    if (!otpVerified.valid) {
      return res.status(403).json({
        ok: false,
        code: 'WHATSAPP_OTP_REQUIRED',
        error: otpVerified.error,
      });
    }

    // Determine country pricing, currency and daily starting budget
    const pricing = getPricingForCountryCode(cleanCountryCode);
    const dailyBudget = pricing.daily_min_budget;
    const registeredCurrency = pricing.currency_code;
    const registeredCountryName = pricing.country_name;

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

    const storedPassword = await hashPassword(rawPassword);
    const now = new Date();
    const evalProf = evaluateCustomerProfileCompletion({
      phone: cleanPhone,
      contactPerson: contactName,
      companyName: formattedName,
      email: cleanEmail,
      category,
      city,
      state,
    });
    const queueType = initialDeposit >= dailyBudget ? 'Completed' : 'Payment Pending';

    // Strict new Customer creation + wallet + verification queue + real-time Outbox event in ONE MongoDB transaction
    const effectiveCustId = await withMongoTransaction(async (session) => {
      await Customer.create(
        [{
          _id: custId,
          username: cleanUsername,
          phone: cleanPhone,
          email: cleanEmail,
          passwordHash: storedPassword,
          companyName: formattedName,
          category: evalProf.sanitized.category,
          contactPerson: contactName,
          city: evalProf.sanitized.city,
          state: evalProf.sanitized.state,
          country: registeredCountryName,
          countryCode: cleanCountryCode,
          currency: registeredCurrency,
          status: 'active',
          profileStatus: evalProf.profileStatus,
          paymentStatus: payStatus,
          kycPercent: evalProf.kycPercent,
          verified: evalProf.isComplete,
          phoneVerified: true,
          phoneVerifiedAt: now,
          completedAt: evalProf.isComplete ? now : null,
        }],
        { session }
      );

      // Wallet (created once; registration never credits money - initialDeposit is always 0)
      await Wallet.updateOne(
        { customerId: custId },
        {
          $setOnInsert: {
            _id: walId,
            availableBalance: initialDeposit,
            totalLifetimePaid: initialDeposit,
            totalAdSpent: 0,
            adCampaignActive: false,
            dailyAdSpend: dailyBudget,
            currency: registeredCurrency,
            activeDays: [],
            schedulePreset: 'custom',
            bookedDates: [],
            lastDeductedAt: null,
            createdAt: now,
          },
          $set: { updatedAt: now },
        },
        { upsert: true, session, timestamps: false }
      );

      // Sales verification queue entry
      await PendingVerification.updateOne(
        { customerId: custId },
        {
          $set: {
            profileStatus: evalProf.profileStatus,
            queueType: !evalProf.isComplete ? 'Profile Incomplete' : queueType,
          },
          $setOnInsert: {
            _id: pvId,
            companyName: formattedName,
            contactPerson: contactName,
            phone: cleanPhone,
            amount: initialDeposit,
            paymentStatus: payStatus,
            packageTier: 'Self-Registered (Wallet Top-Up)',
            dailyRate: 300,
            utrNumber: 'Awaiting Payment',
            submittedAt: now,
            verifiedAt: null,
          },
        },
        { upsert: true, session }
      );

      await recordOutboxEvent(session, {
        aggregateType: 'customer',
        aggregateId: custId,
        eventType: 'NEW_CUSTOMER_REGISTERED',
        payload: {
          customerId: custId,
          companyName: formattedName,
          contactPerson: contactName,
          phone: cleanPhone,
          username: cleanUsername,
        },
      });

      return custId;
    });

    const viewRow = await getCustomerViewRowById(effectiveCustId);
    const customer = mapCustomerRow(viewRow);
    const token = issueCustomerSession(res, customer);

    res.status(201).json({ ok: true, token, customer });
  } catch (err) {
    console.error('[POST /api/auth/register]', err);
    const msg = String(err.message || '');
    const dupKeys = Object.keys(err.keyPattern || err.keyValue || {});

    if (err.code === 11000 || /E11000|duplicate key/i.test(msg)) {
      if (dupKeys.includes('username') || msg.toLowerCase().includes('username')) {
        return res.status(409).json({
          ok: false,
          error: `The username "${cleanUsername || 'entered'}" is already registered. Please choose another username or sign in.`,
        });
      }
      if (dupKeys.includes('phone') || msg.includes('phone')) {
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

    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/auth/login', loginBruteForceLimiter, async (req, res) => {
  try {
    const { identifier, username, password } = req.body || {};
    const q = String(identifier || username || '').trim().toLowerCase();
    if (!q) {
      return res.status(400).json({ ok: false, error: 'Username, mobile number, or email is required.' });
    }
    const cleanInputPassword = String(password || '').trim();
    if (!cleanInputPassword) {
      return res.status(400).json({ ok: false, error: 'Password is required to sign in.' });
    }

    const cleanPhone = q.replace(/\D/g, '').slice(-10);

    // 1. Check customers collection (Business Account login by username, email, or 10-digit mobile)
    const custOr = [{ username: ciExact(q) }, { email: ciExact(q) }];
    if (cleanPhone && cleanPhone.length === 10) custOr.push({ phone: cleanPhone });
    const custDoc = await Customer.findOne({ $or: custOr }).select('_id passwordHash status').lean();

    let targetCustomerId = null;
    let expectedPasswordHash = null;
    let accountStatus = null;
    let authUser = null;

    if (custDoc) {
      targetCustomerId = custDoc._id;
      expectedPasswordHash = custDoc.passwordHash;
      accountStatus = custDoc.status;
    } else {
      // 2. Check system_users collection (User login created by Super Admin)
      const uRow = await findSystemUserRowByLogin(q, cleanPhone);

      if (!uRow) {
        return res.status(404).json({
          ok: false,
          error: 'No registered account found with these credentials. Please check your username, mobile number, or email.',
        });
      }

      expectedPasswordHash = uRow.password_hash;
      accountStatus = uRow.status;
      authUser = {
        id: uRow.id,
        fullName: uRow.full_name,
        email: uRow.email,
        username: uRow.username,
        phone: uRow.phone,
        role: uRow.role,
        department: uRow.department || 'Customer Portal',
        permissions: Array.isArray(uRow.permissions) ? JSON.stringify(uRow.permissions) : uRow.permissions,
        customerId: uRow.customer_id,
      };

      if (uRow.customer_id) {
        targetCustomerId = uRow.customer_id;
      } else {
        // Platform user opening customer dashboard: bind to primary customer workspace
        const defaultCust = await Customer.findOne({ status: 'active' }).sort({ registeredAt: 1 }).select('_id').lean();
        if (defaultCust) {
          targetCustomerId = defaultCust._id;
        }
      }
    }

    // CRIT-05 REMEDIATED: Strict constant-time scrypt verification (empty password NEVER bypasses!)
    const pwdCheck = await verifyPassword(cleanInputPassword, expectedPasswordHash);
    if (!pwdCheck.match) {
      await SecurityEventLog.create({
        category: 'AUTH_FAILURE',
        ipAddress: getClientIp(req),
        path: '/api/auth/login',
        method: 'POST',
        detail: `Failed customer login for identifier "${q.slice(0, 32)}"`,
      }).catch(() => {});
      return res.status(401).json({ ok: false, error: 'Incorrect password for this account.' });
    }

    // Zero-downtime transparent auto-upgrade of legacy plaintext password to salted scrypt
    if (pwdCheck.needsUpgrade) {
      const upgradedHash = await hashPassword(cleanInputPassword);
      if (custDoc) {
        await Customer.updateOne({ _id: custDoc._id }, { $set: { passwordHash: upgradedHash } }, { timestamps: false }).catch(() => {});
      } else if (authUser?.id) {
        await SystemUser.updateOne({ _id: authUser.id }, { $set: { passwordHash: upgradedHash } }, { timestamps: false }).catch(() => {});
      }
    }

    if (accountStatus === 'suspended' || accountStatus === 'blocked') {
      return res.status(403).json({
        ok: false,
        error: 'Compliance Hold Notice: Your workspace has been suspended by the operations administrator.',
      });
    }

    if (authUser?.id) {
      await SystemUser.updateOne({ _id: authUser.id }, { $set: { lastLoginAt: new Date() } }, { timestamps: false }).catch(() => { });
    }

    if (!targetCustomerId) {
      return res.status(404).json({
        ok: false,
        error: 'No associated customer workspace found for this user.',
      });
    }

    const viewRow = await getCustomerViewRowById(targetCustomerId);
    if (!viewRow) {
      return res.status(404).json({ ok: false, error: 'Customer workspace record not found.' });
    }

    const customer = mapCustomerRow(viewRow);
    if (authUser) {
      customer.authUser = authUser;
    }

    const token = authUser
      ? issueStaffSession(res, { ...authUser, customerId: targetCustomerId })
      : issueCustomerSession(res, customer);

    const [leadDocs, txDocs, invDocs] = await Promise.all([
      Lead.find({ customerId: targetCustomerId }).sort({ assignedAt: -1 }).limit(100).lean(),
      WalletTransaction.find({ customerId: targetCustomerId }).sort({ createdAt: -1 }).limit(100).lean(),
      TaxInvoice.find({ customerId: targetCustomerId }).sort({ createdAt: -1 }).limit(100).lean(),
    ]);
    const custForLeads = [{ _id: viewRow.id, username: viewRow.username, phone: viewRow.phone, companyName: viewRow.company_name }];

    res.json({
      ok: true,
      token,
      customer,
      requiresPhoneVerification: !customer.phoneVerified && !authUser,
      user: authUser || null,
      leads: leadsToRows(leadDocs, custForLeads).map(mapLeadRow),
      transactions: txDocs.map(walletTxToRow).map(mapWalletTxRow),
      invoices: invDocs.map(invoiceToRow).map(mapInvoiceRow),
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
          role: 'Super Admin',
          title: 'Founders, Platform Owners & Finance Directors',
        },
        desks: [
          'Dashboard',
          'Growth & Funnel',
          'Database & Snapshots',
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

app.post('/api/auth/admin-login', loginBruteForceLimiter, async (req, res) => {
  try {
    const { identifier, username, password } = req.body || {};
    const q = String(identifier || username || '').trim().toLowerCase();
    if (!q) {
      return res.status(400).json({ ok: false, error: 'Username, employee email, or mobile number is required.' });
    }
    const cleanInputPassword = String(password || '').trim();
    if (!cleanInputPassword) {
      return res.status(400).json({ ok: false, error: 'Password is required.' });
    }

    const cleanPhone = q.replace(/\D/g, '').slice(-10);

    const uRow = await findSystemUserRowByLogin(q, cleanPhone, { requireTenDigitPhone: true });

    if (!uRow) {
      return res.status(404).json({
        ok: false,
        error: 'No administrator or department account found matching these credentials. Please check your username, email, or mobile number.',
      });
    }

    const pwdCheck = await verifyPassword(cleanInputPassword, uRow.password_hash);
    if (!pwdCheck.match) {
      await SecurityEventLog.create({
        category: 'AUTH_FAILURE',
        ipAddress: getClientIp(req),
        path: '/api/auth/admin-login',
        method: 'POST',
        detail: `Failed staff login for "${q.slice(0, 32)}"`,
      }).catch(() => {});
      return res.status(401).json({ ok: false, error: 'Incorrect password for this administrator account.' });
    }

    if (pwdCheck.needsUpgrade) {
      const upgraded = await hashPassword(cleanInputPassword);
      await SystemUser.updateOne({ _id: uRow.id }, { $set: { passwordHash: upgraded } }, { timestamps: false }).catch(() => {});
    }

    if (uRow.status === 'suspended' || uRow.status === 'inactive') {
      return res.status(403).json({
        ok: false,
        error: 'Access Suspended: This department administrator account has been deactivated or suspended.',
      });
    }

    await SystemUser.updateOne({ _id: uRow.id }, { $set: { lastLoginAt: new Date() } }, { timestamps: false }).catch(() => { });

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

    const userPayload = {
      id: uRow.id,
      fullName: uRow.full_name,
      username: uRow.username,
      email: uRow.email,
      phone: uRow.phone,
      role: uRow.role,
      department,
      permissions: parsedPermissions,
      customerId: uRow.customer_id,
    };

    const token = issueStaffSession(res, userPayload);

    res.json({
      ok: true,
      token,
      targetUrl,
      department,
      user: userPayload,
    });
  } catch (err) {
    console.error('[POST /api/auth/admin-login]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// CRIT-05 REMEDIATED: Strictly verify cryptographic JWT instead of returning arbitrary active admin
app.get('/api/auth/admin-session', requireStaff(), async (req, res) => {
  try {
    const userRow = systemUserToRow(await SystemUser.findById(String(req.auth.sub)).lean());

    if (!userRow || userRow.status === 'suspended' || userRow.status === 'inactive') {
      return res.status(401).json({ ok: false, error: 'Session user record is inactive or not found.' });
    }

    const u = userRow;
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
app.get('/api/customers', requireStaff(), async (req, res) => {
  try {
    const rows = await getCustomerViewRows({});
    res.json({ ok: true, customers: rows.map((r) => mapCustomerRow(r)) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/customers/:identifier', requireCustomerSelfOrStaff((req) => req.params.identifier), async (req, res) => {
  try {
    const rawId = String(req.params.identifier || '').trim();

    const viewRow = await getCustomerViewRowByIdentifier(rawId);

    if (!viewRow) {
      return res.status(404).json({ ok: false, error: 'Customer not found' });
    }

    const customer = mapCustomerRow(viewRow);
    const leadFilter = [{ customerId: customer.id }];
    if (customer.phone) leadFilter.push({ customerPhone: customer.phone });
    const [leadDocs, txDocs, invDocs] = await Promise.all([
      Lead.find({ $or: leadFilter }).sort({ assignedAt: -1 }).limit(200).lean(),
      WalletTransaction.find({ customerId: customer.id }).sort({ createdAt: -1 }).limit(200).lean(),
      TaxInvoice.find({ customerId: customer.id }).sort({ createdAt: -1 }).limit(100).lean(),
    ]);
    const custForLeads = [{ _id: viewRow.id, username: viewRow.username, phone: viewRow.phone, companyName: viewRow.company_name }];

    res.json({
      ok: true,
      customer,
      leads: leadsToRows(leadDocs, custForLeads).map(mapLeadRow),
      transactions: txDocs.map(walletTxToRow).map(mapWalletTxRow),
      invoices: invDocs.map(invoiceToRow).map(mapInvoiceRow),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// CRIT-02 REMEDIATED: Restricted strictly to Super Admin and NEVER leaks plaintext or password hashes
app.get('/api/admin/customer-password/:identifier', requireSuperAdmin, async (req, res) => {
  try {
    const rawId = String(req.params.identifier || '').trim();

    const cust = await Customer.findOne(customerIdentifierFilter(rawId))
      .select('_id username phone email companyName contactPerson phoneVerified')
      .lean();

    if (!cust) {
      return res.status(404).json({ ok: false, error: 'Customer not found' });
    }

    res.json({
      ok: true,
      id: cust._id,
      name: cust.companyName || cust.contactPerson,
      username: cust.username,
      phone: cust.phone,
      email: cust.email,
      phoneVerified: Boolean(cust.phoneVerified),
      password: '•••••••••••• (Protected by salted scrypt — use Reset Password)',
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Sales Desk: Direct Client Wallet Top-Up (Assisted by Sales Executive)
app.post('/api/sales/wallet/topup', requireStaff(['sales', 'super admin']), async (req, res) => {
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

    const parsedAmount = parseFloat(amount);
    // Money safety: reject NaN/Infinity and keep exactly 2 decimals (wallet columns were NUMERIC(12,2))
    const creditAmount = Number.isFinite(parsedAmount) ? Math.round((parsedAmount + Number.EPSILON) * 100) / 100 : NaN;
    const cleanUtr = String(referenceUtr || '').trim();

    if (!customerId && !phone) {
      return res.status(400).json({ ok: false, error: 'Customer ID or phone number is required.' });
    }
    if (!cleanUtr) {
      return res.status(400).json({ ok: false, error: 'Transaction UTR reference number is required.' });
    }

    // 1. Check for duplicate UTR in wallet_transactions to prevent double crediting
    if (await utrAlreadyCredited(cleanUtr)) {
      return res.status(409).json({
        ok: false,
        error: `Duplicate Reference: Payment UTR "${cleanUtr}" has already been credited in the ledger.`,
      });
    }

    // 2. Resolve customer
    const cleanPhone = String(phone || customerId || '').trim();
    const customer = await Customer.findOne(findTopupCustomerFilter(customerId, cleanPhone)).lean();

    if (!customer) {
      return res.status(404).json({ ok: false, error: 'Customer account not found for wallet top-up.' });
    }
    const targetCustId = customer._id;
    const custCurrency = customer.currency || 'INR';
    const isUsd = custCurrency === 'USD';
    const minCreditAmount = isUsd ? 10 : 300;
    const minCreditSymbol = isUsd ? '$' : '₹';

    if (!creditAmount || creditAmount < minCreditAmount) {
      return res.status(400).json({ ok: false, error: `Minimum wallet credit amount is ${minCreditSymbol}${minCreditAmount}.` });
    }

    // 3-7. Atomic wallet credit ($inc) + customer/verification status + ledger rows in ONE MongoDB transaction
    let credit;
    try {
      credit = await creditSalesTopup({
        customer,
        creditAmount,
        cleanUtr,
        paymentMethod: String(paymentMethod),
        salesPersonName,
        notes,
      });
    } catch (txErr) {
      if (txErr?.code === 'DUPLICATE_UTR') {
        return res.status(409).json({ ok: false, error: txErr.message });
      }
      throw txErr;
    }
    const recordedNewBalance = credit.newBalance;
    const recordedOldBalance = credit.oldBalance;
    const receiptNo = credit.receiptNo;

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
        customerName: customer.companyName,
        customerPhone: customer.phone,
        amount: creditAmount,
        previousBalance: recordedOldBalance,
        newBalance: recordedNewBalance,
        referenceUtr: cleanUtr,
        paymentMethod,
        salesPersonName,
      },
    });

    // 9. Fetch updated customer row (replaces vw_sales_customer_accounts)
    const viewRow = await getCustomerViewRowById(targetCustId);
    const updatedCustomer = viewRow ? mapCustomerRow(viewRow) : null;

    res.json({
      ok: true,
      customerId: targetCustId,
      companyName: customer.companyName,
      amount: creditAmount,
      previousBalance: recordedOldBalance,
      newBalance: recordedNewBalance,
      walletBalance: recordedNewBalance,
      referenceUtr: cleanUtr,
      customer: updatedCustomer,
      paymentRecord: { receiptNo },
      message: `${isUsd ? '$' : '₹'}${creditAmount.toLocaleString()} successfully credited to ${customer.companyName}'s wallet by ${salesPersonName}.`,
    });
  } catch (err) {
    console.error('[POST /api/sales/wallet/topup]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});


// Sales Desk: Unified Master Transaction Logs (Verified, Failed, Pending, Top-Ups, Debits)
app.get('/api/sales/transactions', requireStaff(['sales', 'super admin']), async (req, res) => {
  try {
    const { wtRows, prRows, customerRows } = await loadTransactionRows();

    const customers = customerRows.map((r) => mapCustomerRow(r));
    const seenRefs = new Set();
    const seenIds = new Set();
    const transactions = [];

    // 1. Process wallet_transactions (Authoritative ledger for credits, debits & declined attempts)
    for (const r of wtRows) {
      const item = mapTransactionItem(r, customers);
      if (item) {
        if (item.ref) seenRefs.add(item.ref);
        if (item.id) seenIds.add(item.id);
        transactions.push(item);
      }
    }

    // 2. Process payment_records (deduplicating by reference / receipt / id)
    for (const r of prRows) {
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
app.get('/api/sales/balance-logs', requireStaff(['sales', 'super admin']), async (req, res) => {
  try {
    const rawCustomerId = req.query.customerId;
    const customerId = (rawCustomerId && rawCustomerId !== 'undefined' && rawCustomerId !== 'null' && rawCustomerId !== 'all') ? String(rawCustomerId).trim() : null;
    const rawPhone = req.query.phone;
    const phone = (rawPhone && rawPhone !== 'undefined' && rawPhone !== 'null') ? String(rawPhone).trim() : null;
    const type = req.query.type;

    const { wtRows, prRows, customerRows, walletRows } = await loadBalanceLogRows();

    const customers = customerRows.map((r) => mapCustomerRow(r));
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
    for (const row of wtRows) {
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
        city: matchedCust?.city || row.city || '',
        state: matchedCust ? matchedCust.state : (row.city ? (row.state || '') : ''),
        category: matchedCust ? matchedCust.category : (row.category || ''),
        txType: isDebit ? 'debit' : 'credit',
        typeLabel: isDebit ? 'Daily Lead Delivery Pacing' : 'Growth Wallet Top-Up',
        amount,
        previousBalance: Number(balanceBefore.toFixed(2)),
        changedAmount: Number(amount.toFixed(2)),
        newBalance: Number(balanceAfter.toFixed(2)),
        balanceBefore: Number(balanceBefore.toFixed(2)),
        balanceAfter: Number(balanceAfter.toFixed(2)),
        balanceChangeFormatted: isDebit ? `-₹${amount.toFixed(2)}` : `+₹${amount.toFixed(2)}`,
        currentWalletBalance: row.current_wallet_balance != null ? Number(row.current_wallet_balance) : (matchedCust?.balance || 0),
        reason: row.description || (isDebit ? 'Daily Lead Delivery Pacing' : 'Growth Wallet Top-Up'),
        description: row.description || (isDebit ? 'Daily Lead Delivery Pacing' : 'Growth Wallet Top-Up'),
        updatedBy: 'Super Admin',
        paymentMethod: row.payment_method || (isDebit ? 'Daily Auto-Debit' : 'Razorpay Secure'),
        status: 'Settled ✓',
        createdAt: row.created_at,
        date: formattedDate,
      });
    }

    // 2. Include any verified payment_records not yet captured in wallet_transactions
    for (const pr of prRows) {
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
        city: matchedCust?.city || pr.city || pr.cust_city || '',
        state: matchedCust ? matchedCust.state : ((pr.city || pr.cust_city) ? (pr.state || pr.cust_state || '') : ''),
        category: matchedCust ? matchedCust.category : (pr.category || pr.cust_category || ''),
        txType: 'credit',
        typeLabel: pr.type_label || 'Growth Wallet Top-Up',
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
      const wallet = walletRows.find((w) => w.customer_id === c.id || (w.phone && String(w.phone).slice(-10) === cleanPhone));
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
        city: c.city || '',
        state: c.state || '',
        category: c.category || '',
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

    const totalCirculatingBalance = walletRows.reduce(
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
        activeWalletsCount: walletRows.filter((w) => Number(w.available_balance || 0) > 0).length,
      },
    });
  } catch (err) {
    console.error('[GET /api/sales/balance-logs]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});
// Sales Desk: Retrieve All Failed Transactions Across All Customers with Contact Numbers & Reason
app.get('/api/sales/failed-transactions', requireStaff(['sales', 'super admin']), async (req, res) => {
  try {
    // 1. Fetch deleted/archived IDs & refs so dismissed/cleared records are not shown in active list
    const { deletedRows, failedRows, unpaidRows } = await loadFailedTransactionData();
    const deletedRefs = new Set();
    const deletedCustIds = new Set();
    for (const d of deletedRows) {
      if (d.reference_utr) deletedRefs.add(d.reference_utr);
      if (d.original_id) deletedRefs.add(d.original_id);
      if (d.id) deletedRefs.add(d.id);
      if (d.customer_id) deletedCustIds.add(d.customer_id);
      const dp = String(d.phone || '').replace(/\D/g, '').slice(-10);
      if (dp) deletedCustIds.add(dp);
    }

    const seenRefs = new Set();
    const seenCustIds = new Set();
    const list = [];

    for (const r of failedRows) {
      const ref = r.reference_utr || r.id;
      if (deletedRefs.has(ref) || deletedRefs.has(r.id)) continue;
      if (seenRefs.has(ref)) continue;
      seenRefs.add(ref);
      if (r.customer_id) seenCustIds.add(r.customer_id);
      const cleanP = String(r.phone || '').replace(/\D/g, '').slice(-10);
      if (cleanP) seenCustIds.add(cleanP);
      list.push(mapFailedTxRow(r));
    }

    // 3. Registered customers whose onboarding checkout is pending/abandoned/declined (loaded above)
    for (const c of unpaidRows) {
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

      const sanitizedUnpaid = sanitizeCustomerProfileFields(c);
      list.push({
        id: `tx_fail_reg_${c.id}`,
        customerId: c.id,
        customerName: properCompany,
        companyName: properCompany,
        contactPerson: properContact,
        username: rawUser,
        phone: cleanP || c.phone || '',
        email: sanitizedUnpaid.email || '',
        city: sanitizedUnpaid.city || '',
        state: sanitizedUnpaid.state || '',
        category: sanitizedUnpaid.category || '',
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

// Sales Desk: Get Deleted Failed Transactions History (Desk 11 History Tab)
app.get('/api/sales/failed-transactions/history', requireStaff(['sales', 'super admin']), async (req, res) => {
  try {
    const rows = await listDeletedFailedTransactionRows();
    res.json({ ok: true, history: rows.map(mapDeletedFailedTxRow) });
  } catch (err) {
    console.error('[GET /api/sales/failed-transactions/history]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Sales Desk: Restore a Deleted Failed Transaction back to active ledger
app.post('/api/sales/failed-transactions/history/restore', requireStaff(['sales', 'super admin']), async (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ ok: false, error: 'Missing id to restore' });
    const cleanId = asScalarString(id);
    if (cleanId === null) return res.status(400).json({ ok: false, error: 'Invalid id to restore' });

    await restoreDeletedFailedTransaction(cleanId);

    res.json({ ok: true, restored: true });
  } catch (err) {
    console.error('[POST /api/sales/failed-transactions/history/restore]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Sales Desk: Permanently Purge Deleted Failed Transactions History (single or all)
app.delete('/api/sales/failed-transactions/history/:id', requireStaff(['sales', 'super admin']), async (req, res) => {
  try {
    const rawId = decodeURIComponent(req.params.id || '').trim();
    if (rawId === 'all' || rawId === 'clear-all') {
      const delRes = await DeletedFailedTransaction.deleteMany({});
      return res.json({ ok: true, deletedCount: delRes.deletedCount || 0 });
    }

    const delRes = await DeletedFailedTransaction.deleteMany(deletedHistoryFilter(rawId));
    res.json({ ok: true, deletedCount: delRes.deletedCount || 0 });
  } catch (err) {
    console.error('[DELETE /api/sales/failed-transactions/history/:id]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Archive matching failed wallet transactions into history, then remove them from the active ledger
async function archiveAndDeleteFailedTx(filter, txSnapshot) {
  await archiveFailedTransactions({ filter, txSnapshot });
  return deleteWalletTransactions(filter);
}

// Sales Desk: Delete / Remove a Failed Transaction (or 'all' / 'dismissed')
app.delete('/api/sales/failed-transactions/:id', requireStaff(['sales', 'super admin']), async (req, res) => {
  try {
    const rawId = decodeURIComponent(req.params.id || '').trim();
    const { txSnapshot } = req.body || {};

    if (rawId === 'all' || rawId === 'clear-all') {
      const deletedCount = await archiveAndDeleteFailedTx(SALES_FAILED_TX_FILTER, txSnapshot);
      return res.json({ ok: true, deletedCount });
    }

    if (rawId === 'dismissed') {
      const deletedCount = await archiveAndDeleteFailedTx(DISMISSED_TX_FILTER, txSnapshot);
      return res.json({ ok: true, deletedCount });
    }

    const deletedCount = await archiveAndDeleteFailedTx(txIdOrUtrFilter(rawId), txSnapshot);
    res.json({ ok: true, deletedCount });
  } catch (err) {
    console.error('[DELETE /api/sales/failed-transactions/:id]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete('/api/sales/failed-transactions', requireStaff(['sales', 'super admin']), async (req, res) => {
  try {
    const { id, ids, type, txSnapshot } = req.body || req.query || {};
    if (type === 'all' || id === 'all') {
      const deletedCount = await archiveAndDeleteFailedTx(SALES_FAILED_TX_FILTER, txSnapshot);
      return res.json({ ok: true, deletedCount });
    }

    if (Array.isArray(ids) && ids.length > 0) {
      const cleanIds = ids.map(asScalarString);
      if (cleanIds.some((v) => v === null)) {
        return res.status(400).json({ ok: false, error: 'Invalid transaction ids' });
      }
      const deletedCount = await archiveAndDeleteFailedTx(txIdsOrUtrsFilter(cleanIds), txSnapshot);
      return res.json({ ok: true, deletedCount });
    }

    if (id) {
      const cleanId = asScalarString(id);
      if (cleanId === null) {
        return res.status(400).json({ ok: false, error: 'Invalid transaction id' });
      }
      const deletedCount = await archiveAndDeleteFailedTx(txIdOrUtrFilter(cleanId), txSnapshot);
      return res.json({ ok: true, deletedCount });
    }

    const deletedCount = await archiveAndDeleteFailedTx(DISMISSED_TX_FILTER, txSnapshot);
    res.json({ ok: true, deletedCount });
  } catch (err) {
    console.error('[DELETE /api/sales/failed-transactions]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});


app.put('/api/customers/:id/profile', requireCustomerSelfOrStaff((req) => req.params.id), async (req, res) => {
  try {
    const rawId = req.params.id;
    const body = req.body || {};
    const {
      companyName,
      name,
      website,
      domain,
      contactPerson,
      contact,
      phone,
    } = body;

    const cleanPhone = String(phone || rawId).replace(/\D/g, '').slice(-10);
    const custRow = await findCustomerByIdOrPhone(rawId, cleanPhone);

    if (!custRow) {
      return res.status(404).json({ ok: false, error: 'Customer record not found' });
    }

    const baseSanitized = sanitizeCustomerProfileFields(custRow);
    const category = body.category !== undefined ? String(body.category || '').trim() : baseSanitized.category;
    const industry = body.industry !== undefined ? String(body.industry || '').trim() : baseSanitized.industry;
    const email = body.email !== undefined ? String(body.email || '').trim() : baseSanitized.email;
    const personalEmail = body.personalEmail !== undefined
      ? String(body.personalEmail || '').trim()
      : String(custRow.personalEmail || '').trim();
    const city = body.city !== undefined ? String(body.city || '').trim() : baseSanitized.city;
    const state = body.state !== undefined ? String(body.state || '').trim() : baseSanitized.state;
    const country = body.country !== undefined
      ? String(body.country || '').trim()
      : (String(custRow.country || '').trim() || 'India');

    const custId = custRow._id;
    const cleanU = (custRow.username || '').replace(/^@/, '').trim();
    const fallbackU = cleanU ? cleanU.charAt(0).toUpperCase() + cleanU.slice(1) : 'Client Member';
    const isGeneric = (str) =>
      !str ||
      str.trim().toLowerCase() === 'registered business' ||
      str.trim().toLowerCase() === 'corporate workspace';

    const candidateCompany = companyName ?? name ?? baseSanitized.companyName;
    const candidatePerson = contactPerson ?? contact ?? baseSanitized.contactPerson;
    const orgName = !isGeneric(candidateCompany) ? String(candidateCompany).trim() : fallbackU;
    const personName = !isGeneric(candidatePerson) ? String(candidatePerson).trim() : orgName;
    const siteUrl = String(website ?? domain ?? custRow.website ?? '').trim();

    await applyCustomerProfile(custId, custRow, {
      orgName,
      category,
      industry,
      website: siteUrl,
      personName,
      email,
      personalEmail,
      city,
      state,
      country,
    });

    const viewRow = await getCustomerViewRowById(custId);
    res.json({ ok: true, customer: mapCustomerRow(viewRow) });
  } catch (err) {
    console.error('[PUT /api/customers/:id/profile]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

const handleUpdateCustomerRecord = async (req, res) => {
  try {
    const rawId = req.params.id;
    const cleanPhone = rawId.replace(/\D/g, '').slice(-10);
    const cust = await findCustomerByIdOrPhone(rawId, cleanPhone);
    if (!cust) {
      return res.status(404).json({ ok: false, error: 'Customer not found' });
    }
    const rawUpdates = req.body || {};
    const updates = {
      ...rawUpdates,
      ...(rawUpdates.wallet || {}),
    };

    const isStaffActor = req.auth?.actorType === 'staff';
    const isSuperAdminActor =
      isStaffActor &&
      (String(req.auth?.department || '').toLowerCase().includes('super') ||
        String(req.auth?.role || '').toLowerCase().includes('super'));

    // CRIT-07 REMEDIATED: Customers can NEVER tamper with wallet balance, account status, or paymentStatus via PATCH!
    if (!isStaffActor && updates.balance !== undefined) {
      await SecurityEventLog.create({
        category: 'RBAC_DENIED',
        ipAddress: getClientIp(req),
        path: req.originalUrl || req.path,
        method: req.method,
        actorId: req.auth?.sub || cust._id,
        detail: `Blocked unauthorized wallet balance tamper attempt (${updates.balance}) on ${cust._id}`,
      }).catch(() => {});
      return res.status(403).json({
        ok: false,
        code: 'WALLET_TAMPER_BLOCKED',
        error: 'Security Violation: Wallet balances can only be credited through verified payment gateways.',
      });
    }

    const baseSanitized = sanitizeCustomerProfileFields(cust);
    const hasExplicitCategory = updates.category !== undefined;
    const hasExplicitIndustry = updates.industry !== undefined;
    const nextCompany = String(updates.companyName ?? updates.name ?? baseSanitized.companyName ?? cust.companyName ?? '').trim();
    const nextContactPerson = String(updates.contactPerson ?? updates.contact ?? baseSanitized.contactPerson ?? cust.contactPerson ?? '').trim();
    const nextEmail = String(updates.email ?? baseSanitized.email ?? '').trim();
    const nextPersonalEmail = updates.personalEmail !== undefined
      ? String(updates.personalEmail || '').trim()
      : String(cust.personalEmail || '').trim();
    const nextCategoryRaw = hasExplicitCategory ? String(updates.category || '').trim() : baseSanitized.category;
    const nextIndustryRaw = hasExplicitIndustry ? String(updates.industry || '').trim() : baseSanitized.industry;
    const nextCityRaw = updates.city !== undefined ? String(updates.city || '').trim() : baseSanitized.city;
    const nextStateRaw = updates.state !== undefined ? String(updates.state || '').trim() : baseSanitized.state;
    const nextCountry = updates.country !== undefined
      ? String(updates.country || '').trim()
      : (String(cust.country || '').trim() || 'India');
    const nextWebsite = String(updates.website ?? updates.domain ?? cust.website ?? '').trim();

    const evalProf = evaluateCustomerProfileCompletion({
      phone: cust.phone,
      contactPerson: nextContactPerson,
      companyName: nextCompany,
      email: nextEmail,
      category: nextCategoryRaw,
      industry: nextIndustryRaw,
      city: nextCityRaw,
      state: nextStateRaw,
      registeredAt: cust.registeredAt,
      completedAt: (hasExplicitCategory || hasExplicitIndustry)
        ? new Date(Date.now() + 10_000)
        : cust.completedAt,
    });

    const nextStatus = isStaffActor ? (updates.status || cust.status) : cust.status;
    const nextPayment = isStaffActor
      ? (updates.paymentStatus || updates.payment_status || cust.paymentStatus)
      : cust.paymentStatus;
    const nextProfile = evalProf.isComplete ? 'complete' : 'incomplete';
    const nextKyc = evalProf.isComplete ? 100 : evalProf.kycPercent;
    const nextVerified = evalProf.isComplete;
    const nextCompletedAt = evalProf.isComplete ? (cust.completedAt || new Date()) : null;
    const rawSubmittedPassword = (updates.password || updates.passwordPlain || updates.passwordHash || '').trim();
    const nextPassword = rawSubmittedPassword
      ? await hashPassword(rawSubmittedPassword)
      : cust.passwordHash;

    await applyCustomerRecordUpdate(cust._id, {
      company: nextCompany,
      contactPerson: nextContactPerson,
      email: nextEmail,
      personalEmail: nextPersonalEmail,
      category: evalProf.sanitized.category,
      industry: evalProf.sanitized.industry,
      city: evalProf.sanitized.city,
      state: evalProf.sanitized.state,
      country: nextCountry,
      website: nextWebsite,
      status: nextStatus,
      profile: nextProfile,
      payment: nextPayment,
      kyc: nextKyc,
      verified: nextVerified,
      completedAt: nextCompletedAt,
      password: nextPassword,
    });

    if (
      updates.dailyAdSpend !== undefined ||
      updates.adCampaignActive !== undefined ||
      updates.balance !== undefined ||
      updates.activeDays !== undefined ||
      updates.schedulePreset !== undefined
    ) {
      const w = await Wallet.findOne({ customerId: cust._id }).lean();
      if (w) {
        const walletCurrency = String(w.currency || 'INR').toUpperCase();
        const minimumDailySpend = walletCurrency === 'INR' ? 300 : walletCurrency === 'USD' ? 10 : null;
        if (minimumDailySpend === null) return res.status(409).json({ ok: false, error: 'Unsupported wallet currency.' });
        const nextDaily = updates.dailyAdSpend !== undefined ? Math.max(minimumDailySpend, Number(updates.dailyAdSpend)) : Number(w.dailyAdSpend);
        const nextActive = updates.adCampaignActive !== undefined ? Boolean(updates.adCampaignActive) : Boolean(w.adCampaignActive);
        // Balance override is STRICTLY restricted to Super Admin only
        const nextBal = isSuperAdminActor && updates.balance !== undefined ? Math.max(0, Number(updates.balance)) : undefined;
        if (!Number.isFinite(nextDaily) || (nextBal !== undefined && !Number.isFinite(nextBal))) {
          throw new Error('Invalid numeric value for wallet settings.');
        }

        // Security / Financial Safety Rule: Enforce that booked days cannot be removed via direct API call
        const kolkataNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
        const todayCode = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][kolkataNow.getDay()];
        const isDeductedToday = Boolean(
          w.lastDeductedAt &&
          new Date(w.lastDeductedAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) ===
          kolkataNow.toLocaleDateString('en-CA')
        );

        const toList = (v) => (Array.isArray(v) ? v : String(v || '').split(',')).map((s) => String(s).trim()).filter(Boolean);
        const storedDays = toList(w.activeDays).map((d) => d.toUpperCase());
        let finalDaysArray = updates.activeDays !== undefined
          ? (Array.isArray(updates.activeDays)
            ? updates.activeDays.map(d => String(d).trim().toUpperCase()).filter(Boolean)
            : String(updates.activeDays).split(',').map(d => d.trim().toUpperCase()).filter(Boolean))
          : (storedDays.length > 0 ? storedDays : [todayCode]);
        if (finalDaysArray.length === 5 && finalDaysArray.includes('MON') && finalDaysArray.includes('TUE') && finalDaysArray.includes('WED') && finalDaysArray.includes('THU') && finalDaysArray.includes('FRI')) {
          finalDaysArray = [todayCode];
        }

        const bookedDatesList = toList(w.bookedDates);
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

        const nextPreset = updates.schedulePreset || w.schedulePreset || 'weekdays';
        await applyWalletSettings(cust._id, {
          dailyAdSpend: nextDaily,
          adCampaignActive: nextActive,
          activeDays: finalDaysArray,
          schedulePreset: String(nextPreset),
          balance: nextBal,
        });
      }
    }

    const viewRow = await getCustomerViewRowById(cust._id);
    res.json({
      ok: true,
      customer: mapCustomerRow(viewRow),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
};

app.patch('/api/customers/:id', requireCustomerSelfOrStaff((req) => req.params.id), handleUpdateCustomerRecord);
app.put('/api/customers/:id', requireCustomerSelfOrStaff((req) => req.params.id), handleUpdateCustomerRecord);

app.delete('/api/customers/:identifier', requireStaff(['super admin', 'sales']), async (req, res) => {
  try {
    const rawId = String(req.params.identifier || '').trim();
    const cleanPhone = rawId.replace(/\D/g, '').slice(-10);
    const identFilter = customerIdentifierFilter(rawId);
    if (cleanPhone) identFilter.$or.push({ _id: `cust_reg_${cleanPhone}` });
    const found = await Customer.findOne(identFilter)
      .select('_id username phone email companyName contactPerson')
      .lean();
    if (!found) {
      return res.status(404).json({ ok: false, error: 'Customer not found' });
    }
    const cust = {
      id: found._id,
      username: found.username,
      phone: found.phone,
      email: found.email,
      company_name: found.companyName,
      contact_person: found.contactPerson,
    };
    const custId = cust.id;
    const custPhone = cust.phone;

    await deleteCustomerCascade(custId, custPhone);

    // Audit trail (best effort, never blocks the delete response)
    await logSuperAdminAudit({
      actorId: 'api_admin',
      actorName: 'Admin API',
      actorRole: 'Super Admin',
      actionType: 'CUSTOMER_DELETED',
      targetType: 'customer',
      targetId: custId,
      reason: 'Customer deleted via admin API',
      details: cust,
    });

    res.json({ ok: true, deleted: cust, deletedId: custId });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});


// =============================================================================
// 4. WALLET TOP-UP, DAILY AD SPEND DEDUCTION & INVOICES (/api/wallets)
// =============================================================================
function customerSummaryFromDoc(c) {
  if (!c) return null;
  return {
    id: c._id,
    phone: c.phone,
    username: c.username,
    contact_person: c.contactPerson,
    email: c.email,
    company_name: c.companyName,
  };
}

app.post('/api/payments/razorpay/order', requireAuth, async (req, res) => {
  try {
    if (!razorpayKeyId || !razorpayKeySecret) {
      return res.status(503).json({ ok: false, error: 'Razorpay is not configured on the server.' });
    }
    const requestedCustomerId = String(req.body?.customerId || '');
    if (requestedCustomerId) {
      const reqCurrency = await getBillingCurrency(requestedCustomerId);
      if (reqCurrency && reqCurrency !== 'INR') {
        return res.status(400).json({ ok: false, error: 'Razorpay only supports INR wallets. Use the international USD gateway for this account.' });
      }
    }
    const amount = Number(req.body?.amount);
    if (!Number.isSafeInteger(amount) || amount < 300 || amount > 1000000) {
      return res.status(400).json({ ok: false, error: 'Enter an amount from ₹300 to ₹10,00,000.' });
    }
    const cleanPhone = String(req.body?.phone || req.body?.customerId || '').replace(/\D/g, '').slice(-10);
    let custDoc = await findCustomerFlexible({
      id: req.body?.customerId || '',
      phone: cleanPhone,
      username: req.body?.username || '',
    });

    if (!custDoc) {
      const fallbackPhone = cleanPhone || '9999999999';
      const newCustId = req.body?.customerId && !String(req.body.customerId).startsWith('rzp_') ? String(req.body.customerId) : `cust_${Date.now()}`;
      const newName = req.body?.contactPerson || req.body?.username || `Client ${fallbackPhone.slice(-4)}`;
      await Customer.updateOne(
        { _id: newCustId },
        {
          $setOnInsert: {
            phone: fallbackPhone,
            username: req.body?.username || fallbackPhone,
            contactPerson: newName,
            companyName: req.body?.companyName || newName,
            email: req.body?.email || `${fallbackPhone}@client.admafia.marketing`,
            passwordHash: `$2b$12$${randomBytes(32).toString('hex')}!LOCKED`,
            status: 'active',
            paymentStatus: 'pending',
            registeredAt: new Date(),
          },
        },
        { upsert: true }
      ).catch(() => {});
      custDoc = await findCustomerFlexible({
        id: newCustId,
        phone: fallbackPhone,
        username: req.body?.username || '',
      });
    }

    const cust = custDoc
      ? customerSummaryFromDoc(custDoc)
      : {
          id: req.body?.customerId || `cust_${Date.now()}`,
          phone: cleanPhone || '9999999999',
          username: req.body?.username || 'client',
          contact_person: req.body?.contactPerson || 'Client',
          company_name: 'Ad Mafia Client',
          email: `${cleanPhone || 'client'}@admafia.marketing`,
        };
    const billingCurrency = await getBillingCurrency(cust.id);
    if (billingCurrency && billingCurrency !== 'INR') {
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

app.post('/api/payments/razorpay/payment-link', requireAuth, async (req, res) => {
  try {
    if (!razorpayKeyId || !razorpayKeySecret) {
      return res.status(503).json({ ok: false, error: 'Razorpay is not configured on the server.' });
    }
    const amount = Number(req.body?.amount);
    if (!Number.isSafeInteger(amount) || amount < 300 || amount > 1000000) {
      return res.status(400).json({ ok: false, error: 'Enter an amount from ₹300 to ₹10,00,000.' });
    }
    const cleanPhone = String(req.body?.phone || req.body?.customerId || '').replace(/\D/g, '').slice(-10);
    let custDoc = await findCustomerFlexible({
      id: req.body?.customerId || '',
      phone: cleanPhone,
      username: req.body?.username || '',
    });
    if (!custDoc && (cleanPhone || req.body?.username)) {
      const newCustId = req.body?.customerId && !String(req.body.customerId).startsWith('rzp_') ? String(req.body.customerId) : `cust_${Date.now()}`;
      const newPhone = cleanPhone || '9999999999';
      const newName = req.body?.contactPerson || req.body?.username || `Client ${newPhone.slice(-4)}`;
      await Customer.updateOne(
        { _id: newCustId },
        {
          $setOnInsert: {
            phone: newPhone,
            username: req.body?.username || newPhone,
            contactPerson: newName,
            companyName: req.body?.companyName || newName,
            email: req.body?.email || `${newPhone}@client.admafia.marketing`,
            passwordHash: `$2b$12$${randomBytes(32).toString('hex')}!LOCKED`,
            status: 'active',
            paymentStatus: 'pending',
            registeredAt: new Date(),
          },
        },
        { upsert: true }
      ).catch(() => {});
      custDoc = await findCustomerFlexible({
        id: newCustId,
        phone: newPhone,
        username: req.body?.username || '',
      });
    }
    if (!custDoc) {
      return res.status(404).json({ ok: false, error: 'Customer account not found.' });
    }
    const cust = customerSummaryFromDoc(custDoc);

    const billingCurrency = await getBillingCurrency(cust.id);
    if (billingCurrency && billingCurrency !== 'INR') {
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
        description: `Ad Mafia Instant Wallet Top-Up (₹${amount.toLocaleString('en-IN')})`,
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

// Authoritative Atomic Wallet Crediting Engine (MongoDB ACID Transaction + UTR Idempotency)
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
  const cleanAmount = Math.round((Number(amount || 0) + Number.EPSILON) * 100) / 100;
  const out = await creditWalletByUtr({
    customerId,
    phone,
    username,
    amount,
    referenceUtr,
    paymentMethod,
    description,
    currency,
  });

  const viewRow = await getCustomerViewRowById(out.customerId);

  if (out.alreadyCredited) {
    return {
      ok: true,
      alreadyCredited: true,
      customerId: out.customerId,
      walletBalance: out.walletBalance,
      customer: viewRow ? mapCustomerRow(viewRow) : null,
      transaction: out.transaction ? mapWalletTxRow(walletTxToRow(out.transaction)) : null,
      message: 'Payment already credited idempotently.',
    };
  }

  return {
    ok: true,
    alreadyCredited: false,
    walletBalance: out.walletBalance,
    customer: viewRow ? mapCustomerRow(viewRow) : null,
    transaction: out.transaction ? mapWalletTxRow(walletTxToRow(out.transaction)) : null,
    paymentRecord: out.paymentRecord ? mapPaymentRecordRow(paymentToRow(out.paymentRecord)) : null,
    invoice: out.invoice ? mapInvoiceRow(invoiceToRow(out.invoice)) : null,
    message: `₹${cleanAmount.toLocaleString('en-IN')} successfully credited to wallet.`,
  };
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
        await insertCallbackFailureRow({
          customerId,
          referenceUtr: paymentId || `FAIL_${Date.now()}`,
          description: `Online recharge ${failReason.toLowerCase()}`,
        }).catch(() => {});
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

    const existingCust = await findCustomerFlexible({ id: customerId || '', phone: custPhone });
    const targetCustId = existingCust ? existingCust._id : (customerId || `cust_${custPhone || Date.now()}`);

    const billingCurrency = await getBillingCurrency(targetCustId);
    if (billingCurrency && billingCurrency !== 'INR') {
      return res.redirect(303, `${baseUrl}/app/lead?payment_status=failed&payment_id=${encodeURIComponent(paymentId)}&reason=Razorpay+supports+INR+wallets+only#app/wallet`);
    }

    // Credit the wallet idempotently via atomic MongoDB transaction
    await creditCustomerWallet({
      customerId: targetCustId,
      amount: cleanAmount,
      referenceUtr: paymentId,
      paymentMethod: payment.method ? `Razorpay ${payment.method.toUpperCase()}` : 'Razorpay Secure (UPI/Card)',
      description: `Ad Mafia wallet top-up (₹${cleanAmount.toLocaleString('en-IN')})`,
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

app.post('/api/payments/razorpay/verify', requireAuth, async (req, res) => {
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

    const billingCurrency = await getBillingCurrency(targetCustId);
    if (billingCurrency && billingCurrency !== 'INR') {
      return res.status(400).json({ ok: false, error: 'Razorpay cannot credit a non-INR wallet.' });
    }

    // 5. Credit wallet via atomic idempotent MongoDB transaction
    const result = await creditCustomerWallet({
      customerId: targetCustId,
      phone: cleanPhone,
      username: username || payment.notes?.customer_username,
      amount: cleanAmount,
      referenceUtr: paymentId,
      paymentMethod: payment.method ? `Razorpay ${payment.method.toUpperCase()}` : 'Razorpay Secure (UPI/Card)',
      description: `Ad Mafia wallet top-up (₹${cleanAmount.toLocaleString('en-IN')})`,
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
              const custByEmail = await findCustomerByEmailExact(payment.email);
              if (custByEmail) {
                customerId = custByEmail._id;
                cleanPhone = custByEmail.phone;
              }
            } catch (lookupErr) {
              console.warn('[Razorpay Webhook] Email lookup error:', lookupErr.message);
            }
          }

          if (payment?.order_id && (!customerId || !cleanPhone)) {
            try {
              const custByOrder = await findPaymentCustomerByOrder(payment.order_id);
              if (custByOrder?.customerId) {
                customerId = custByOrder.customerId;
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
              description: `Ad Mafia wallet top-up (₹${amount.toLocaleString('en-IN')})`,
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
                description: `Ad Mafia wallet top-up (₹${amount.toLocaleString('en-IN')})`,
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
            const refundOutcome = await processRazorpayRefund({
              refund,
              payment,
              refundId,
              paymentId,
              refundAmt,
            });
            if (refundOutcome.status === 'already') {
              console.log(`[Razorpay Webhook] Refund ${refundId} already recorded.`);
            } else if (refundOutcome.status === 'refunded') {
              console.log(`[Razorpay Webhook] Refund ${refundId} completed successfully for customer ${refundOutcome.customerId}.`);
            }
          }
        } else if (event === 'payment.failed') {
          const payment = req.body?.payload?.payment?.entity;
          let customerId = payment?.notes?.customer_id;
          const cleanPhone = String(payment?.contact || '').replace(/\D/g, '').slice(-10);

          if (!customerId && cleanPhone) {
            const custLookup = await findCustomerByPhoneDigits(cleanPhone);
            if (custLookup) customerId = custLookup._id;
          }
          if (!customerId && payment?.email) {
            const emailLookup = await findCustomerByEmailCi(payment.email);
            if (emailLookup) customerId = emailLookup._id;
          }

          if (customerId && payment?.id) {
            const failAmount = Number(payment.amount || 0) / 100;
            const walDoc = await Wallet.findOne({ customerId }, { _id: 1, availableBalance: 1 }).lean();
            const walletId = walDoc?._id || `wal_${customerId}`;
            const currentBal = Number(walDoc?.availableBalance || 0);

            await upsertDeclinedTransaction({
              customerId,
              walletId,
              amount: failAmount > 0 ? failAmount : 300,
              balanceAfter: currentBal,
              referenceUtr: payment.id,
              description: `Online recharge failed: ${payment.error_description || payment.error_reason || 'Payment declined by bank'}`,
              paymentMethod: payment.method ? `Razorpay ${payment.method.toUpperCase()}` : 'Razorpay Gateway',
            }).catch((err) => console.error('[Razorpay Webhook payment.failed]', err.message));
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
app.post('/api/wallets/failed-transaction', requireAuth, async (req, res) => {
  try {
    const txDoc = await recordFailedTransaction(req.body || {});
    res.json({
      ok: true,
      transaction: txDoc ? mapWalletTxRow(walletTxToRow(txDoc)) : null,
    });
  } catch (err) {
    console.error('[POST /api/wallets/failed-transaction]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post(
  '/api/wallets/deduct',
  requireCustomerSelfOrStaff((req) => req.body?.customerId || req.body?.phone || req.body?.username),
  async (req, res) => {
  try {
    const { customerId, phone, username, amount, activeDays, force, manual } = req.body || {};
    const cleanPhone = String(phone || customerId || '').replace(/\D/g, '').slice(-10);

    const cust = await findCustomerFlexible({
      id: customerId || '',
      phone: cleanPhone,
      username: username || '',
    });
    if (!cust) {
      return res.status(404).json({ ok: false, error: 'Customer not found' });
    }

    const outcome = await deductWalletForDay({
      cust,
      amount,
      activeDays,
      force,
      manual,
    });

    const viewRow = await getCustomerViewRowById(cust._id);
    res.json({
      ok: true,
      ...outcome.result,
      ...(outcome.txDoc ? { transaction: mapWalletTxRow(walletTxToRow(outcome.txDoc)) } : {}),
      customer: viewRow ? mapCustomerRow(viewRow) : null,
    });
  } catch (err) {
    const status = err.statusCode || (err.message && err.message.includes('Insufficient wallet balance') ? 400 : 500);
    res.status(status).json({ ok: false, error: err.message });
  }
});

// =============================================================================
// 5. LEADS PIPELINE (Strict Per-Account Isolation + Sales Desk 03 Dispatch)
// =============================================================================
app.get('/api/leads', requireAuth, async (req, res) => {
  try {
    // Enforce strict tenant isolation when queried by a customer
    const scopedQuery =
      req.auth.actorType === 'customer'
        ? { ...req.query, customerId: req.auth.customerId || req.auth.sub }
        : req.query || {};
    const rows = await listLeadRows(scopedQuery);
    res.json({ ok: true, leads: rows.map(mapLeadRow) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/leads', requireAuth, async (req, res) => {
  try {
    const { phone, name } = req.body || {};
    const buyerDigits = String(phone || name || '').replace(/\D/g, '').slice(-10);
    if (buyerDigits.length !== 10 || !['6', '7', '8', '9'].includes(buyerDigits[0])) {
      return res.status(400).json({
        ok: false,
        error: 'Buyer phone number must be a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.',
      });
    }

    const scopedBody =
      req.auth.actorType === 'customer'
        ? { ...req.body, customerId: req.auth.customerId || req.auth.sub, customerPhone: req.auth.phone }
        : req.body || {};

    const out = await createDirectLeadRow(scopedBody);
    if (out.notFound) {
      return res.status(404).json({
        ok: false,
        error: `No registered customer account found matching "${out.targetCompany}". Register the customer first.`,
      });
    }

    res.status(201).json({ ok: true, lead: mapLeadRow(out.row) });
  } catch (err) {
    console.error('[POST /api/leads]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.patch('/api/leads/:id', requireAuth, async (req, res) => {
  try {
    if (req.auth.actorType === 'customer') {
      const targetLead = await Lead.findById(req.params.id).select('customerId customerPhone').lean();
      if (targetLead) {
        const selfId = String(req.auth.customerId || req.auth.sub);
        const selfPhone = String(req.auth.phone || '').slice(-10);
        if (targetLead.customerId !== selfId && (!selfPhone || targetLead.customerPhone !== selfPhone)) {
          return res.status(403).json({ ok: false, error: 'Access denied: lead belongs to another workspace.' });
        }
      }
    }
    const updatedRow = await updateLeadAndSyncAssignment(req.params.id, req.body || {});
    if (!updatedRow) {
      return res.status(404).json({ ok: false, error: 'Lead not found' });
    }
    res.json({ ok: true, lead: mapLeadRow(updatedRow) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// =============================================================================
// 6. PAYMENTS, INVOICES, VERIFICATIONS, QUERIES, TASKS & GROUPS
// =============================================================================
app.get('/api/payments', requireStaff(), async (req, res) => {
  try {
    const rows = await listPaymentRecordRows();
    res.json({ ok: true, payments: rows.map(mapPaymentRecordRow) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Delete payment record by ID, receipt number, or UTR (with wallet adjustment)
app.delete('/api/payments/:id', requireStaff(['super admin', 'sales']), async (req, res) => {
  try {
    const rawId = decodeURIComponent(req.params.id || '').trim();
    if (!rawId) return res.status(400).json({ ok: false, error: 'Payment ID or Receipt Number required' });

    const out = await deletePaymentOrTestEntries(rawId);
    return res.status(out.status).json(out.body);
  } catch (err) {
    console.error('[DELETE /api/payments/:id]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/invoices', requireAuth, async (req, res) => {
  try {
    const scopedCustId =
      req.auth.actorType === 'customer'
        ? (req.auth.customerId || req.auth.sub)
        : req.query?.customerId;
    const rows = await listTaxInvoiceRows(scopedCustId);
    res.json({ ok: true, invoices: rows.map(mapInvoiceRow) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/verifications', requireStaff(), async (req, res) => {
  try {
    const rows = await listPendingVerificationRows();
    const verifications = rows.map((r) => ({
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

app.get('/api/queries', requireAuth, async (req, res) => {
  try {
    const scopedCustId =
      req.auth.actorType === 'customer'
        ? (req.auth.customerId || req.auth.sub)
        : req.query?.customerId;
    const rows = await listSupportQueryRows(scopedCustId);
    res.json({ ok: true, queries: rows.map(mapQueryRow) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/queries', requireAuth, async (req, res) => {
  try {
    const scopedBody =
      req.auth.actorType === 'customer'
        ? { ...req.body, customerId: req.auth.customerId || req.auth.sub }
        : req.body || {};
    const row = await createSupportQueryRow(scopedBody);
    res.status(201).json({ ok: true, query: mapQueryRow(row) });
  } catch (err) {
    console.error('[POST /api/queries]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.patch('/api/queries/:id', requireStaff(), async (req, res) => {
  try {
    const out = await updateSupportQueryRow(req.params.id, req.body || {});
    if (out.notFound) {
      return res.status(404).json({ ok: false, error: 'Query not found' });
    }
    res.json({ ok: true, query: mapQueryRow(out.row) });
  } catch (err) {
    console.error('[PATCH /api/queries/:id]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete('/api/queries/:id', requireStaff(), async (req, res) => {
  try {
    const deletedCount = await deleteSupportQueryById(req.params.id);
    res.json({ ok: true, deletedCount });
  } catch (err) {
    console.error('[DELETE /api/queries/:id]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/tasks', requireStaff(), async (req, res) => {
  try {
    const task = await createSalesTaskRow(req.body || {});
    res.status(201).json({ ok: true, task });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// =============================================================================
// 7. CUSTOMER GROUPS & CATEGORY-BASED LEAD DISTRIBUTION
// =============================================================================

// List all Customer Groups with dynamic counts
app.get('/api/groups', requireStaff(), async (req, res) => {
  try {
    const groups = await getGroupEligibilityCounts();
    res.json({ ok: true, groups: groups.map(mapGroupRow) });
  } catch (err) {
    console.error('[GET /api/groups]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// List all categories and customer groups with live eligible customer counts
app.get('/api/categories', requireStaff(), async (req, res) => {
  try {
    const { categories, groups } = await getCategoryEligibilityCounts();
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
app.get('/api/categories/preview', requireStaff(), async (req, res) => {
  try {
    const targetCat = String(req.query.category || '').trim();
    const targetGroupId = String(req.query.groupId || '').trim();
    const masterLeadId = String(req.query.masterLeadId || '').trim() || null;

    if (!targetCat && !targetGroupId) {
      return res.status(400).json({ ok: false, error: 'Category or groupId parameter is required' });
    }

    const evalData = await getEvaluatedRecipients({
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
app.post('/api/groups', requireStaff(), async (req, res) => {
  try {
    const { name } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ ok: false, error: 'Group name is required' });
    }
    const row = await createCustomerGroupRow(req.body || {});
    res.status(201).json({ ok: true, group: mapGroupRow(row) });
  } catch (err) {
    if (err?.code === 11000 || (err.message && (err.message.includes('unique') || err.message.includes('duplicate')))) {
      return res.status(409).json({ ok: false, error: 'A customer group with this name already exists.' });
    }
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update an existing Customer Group
app.put('/api/groups/:id', requireStaff(), async (req, res) => {
  try {
    const row = await updateCustomerGroupRow(req.params.id, req.body || {});
    if (!row) {
      return res.status(404).json({ ok: false, error: 'Customer group not found' });
    }
    res.json({ ok: true, group: mapGroupRow(row) });
  } catch (err) {
    if (err?.code === 11000 || (err.message && (err.message.includes('unique') || err.message.includes('duplicate')))) {
      return res.status(409).json({ ok: false, error: 'A customer group with this name already exists.' });
    }
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Delete a Customer Group
app.delete('/api/groups/:id', requireStaff(), async (req, res) => {
  try {
    await deleteCustomerGroupCascade(req.params.id);
    res.json({ ok: true, message: 'Group deleted successfully' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// List members of a Customer Group
app.get('/api/groups/:id/members', requireStaff(), async (req, res) => {
  try {
    const members = await listGroupMembers(req.params.id);
    res.json({ ok: true, members });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Assign customers to a Customer Group (Batch assignment)
app.post('/api/groups/:id/members', requireStaff(), async (req, res) => {
  try {
    const { customerIds = [] } = req.body || {};
    if (!Array.isArray(customerIds) || customerIds.length === 0) {
      return res.status(400).json({ ok: false, error: 'customerIds array is required' });
    }

    const out = await assignGroupMembers(req.params.id, customerIds);
    if (!out) {
      return res.status(404).json({ ok: false, error: 'Customer group not found' });
    }

    res.json({
      ok: true,
      message: `Successfully assigned ${out.assignedCount} customer(s) to ${out.groupName}.`,
      assignedCount: out.assignedCount,
      totalGroupMembers: out.totalGroupMembers,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Remove customer from a Customer Group
app.delete('/api/groups/:id/members/:customerId', requireStaff(), async (req, res) => {
  try {
    await removeGroupMember(req.params.id, req.params.customerId);
    res.json({ ok: true, message: 'Customer removed from group successfully' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Preview distribution recipients for a group
app.get('/api/groups/:id/preview-recipients', requireStaff(), async (req, res) => {
  try {
    const groupId = req.params.id;
    const masterLeadId = String(req.query.masterLeadId || '').trim() || null;
    const group = await findGroupById(groupId);
    if (!group) {
      return res.status(404).json({ ok: false, error: 'Customer group not found' });
    }

    const evalData = await getEvaluatedRecipients({
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
app.post('/api/leads/distribute', requireStaff(['sales', 'marketing', 'super admin']), async (req, res) => {
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

    const targetCat = String(category || targetCategory || '').trim();
    const targetGroupId = String(groupId || '').trim();

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
    const matchedGroup = await resolveDistributionGroup({ targetGroupId, targetCat });

    const finalCategory = targetCat || (matchedGroup ? (matchedGroup.category || matchedGroup.name) : 'Other');
    const finalGroupId = matchedGroup ? matchedGroup.id : (targetGroupId || null);
    const finalGroupName = matchedGroup ? matchedGroup.name : finalCategory;

    const leadTitle = String(title || '').trim() || `${finalCategory} Buyer Requirement`;
    const reqText = String(requirement || description || '').trim() || `Inbound customer requirement for ${finalCategory} products and commercial services.`;
    const bName = String(buyerName || '').trim() || 'Verified Buyer';
    const masterLeadId = id || `mlead_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const displayPhone = `+91 ${cleanBuyerDigits}`;

    // Preliminary authoritative evaluation before opening transaction
    const initialEval = await getEvaluatedRecipients({
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

    // Execute atomic MongoDB transaction for lead creation & assignments (NO wallet deductions whatsoever)
    const result = await distributeMasterLeadAtomic({
      masterLeadId,
      leadTitle,
      description,
      finalCategory,
      finalGroupId,
      finalGroupName,
      bName,
      cleanBuyerDigits,
      displayPhone,
      buyerEmail,
      city,
      reqText,
      budget,
      location,
      priority,
      source,
      deadlineDate,
    });

    res.status(201).json({
      ok: true,
      message: `Lead "${leadTitle}" successfully distributed to ${result.assignments.length} eligible customer(s) in "${finalCategory}".`,
      masterLead: mapMasterLeadRow({
        ...result.masterLeadRow,
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
app.get('/api/leads/distribution-history', requireStaff(), async (req, res) => {
  try {
    const history = await listDistributionHistory();
    res.json({ ok: true, history });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Inspect a specific distribution's recipient-level status
app.get('/api/leads/distribution-history/:id', requireStaff(), async (req, res) => {
  try {
    const detail = await getDistributionDetail(req.params.id);
    if (!detail) {
      return res.status(404).json({ ok: false, error: 'Master lead distribution not found' });
    }
    res.json({
      ok: true,
      distribution: mapMasterLeadRow(detail.masterLeadRow),
      recipients: detail.recipients,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update recipient status / response (from customer or admin)
app.patch('/api/lead-assignments/:id', requireAuth, async (req, res) => {
  try {
    if (req.auth.actorType === 'customer') {
      const existingAsgn = await LeadAssignment.findById(req.params.id).select('customerId').lean();
      if (existingAsgn && existingAsgn.customerId !== (req.auth.customerId || req.auth.sub)) {
        return res.status(403).json({ ok: false, error: 'Access denied: assignment belongs to another workspace.' });
      }
    }
    const updated = await updateLeadAssignmentAndSync(req.params.id, req.body || {});
    if (!updated) {
      return res.status(404).json({ ok: false, error: 'Lead assignment not found' });
    }
    res.json({ ok: true, assignment: updated });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// =============================================================================
// 6B. MARKETING DEPARTMENT API ROUTER (/api/marketing/*)
// =============================================================================
app.use('/api/marketing', requireStaff(['marketing', 'graphics', 'super admin']), marketingRouter);

// =============================================================================
// 6C. GRAPHICS DEPARTMENT API ROUTER (/api/graphics/*)
// =============================================================================
app.use('/api/graphics', requireStaff(['graphics', 'marketing', 'super admin']), graphicsRouter);

// =============================================================================
// 6D. SUPER ADMIN CONTROL CENTER API ROUTER (/api/superadmin/*)
// =============================================================================
app.use('/api/superadmin', requireSuperAdmin, superadminOpsRouter);
app.use('/api/superadmin', requireSuperAdmin, superadminRouter);

// =============================================================================
// 6E. PUBLIC COUNTRY PRICING & LOCALIZATION API ROUTER (/api/public/*)
// =============================================================================
app.use('/api/public', countryPricingRouter);

// =============================================================================
// 6F. SUPER ADMIN COUNTRY PRICING CONFIGURATION ROUTER (/api/superadmin/country-pricing)
// =============================================================================
app.use('/api/superadmin/country-pricing', requireSuperAdmin, superadminCountryPricingRouter);

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
  // MongoDB is the ONLY database: connect first, then seed baseline data and start background jobs.
  databaseReady = initMongo().then((mStatus) => {
    if (!mStatus.connected) {
      throw new Error(mStatus.lastError || 'MongoDB is not connected');
    }
    return mStatus;
  });
  databaseReady
    .then((info) => {
      console.log(`🚀 Ad Mafia CRM Backend API listening on http://localhost:${PORT} (DB: MongoDB "${info.database}" @ ${info.host}:${info.port})`);

      // Seed default department admin accounts + two-rule country pricing (idempotent upserts)
      seedBaselineData()
        .then((seeded) => {
          console.log(`[Mongo Bootstrap] Baseline data verified (${seeded.systemUsers} system users, ${seeded.countryPricing} country pricing rules).`);
          for (const w of seeded.warnings) console.warn('[Mongo Bootstrap Warning]', w);
        })
        .catch((err) => console.warn('[Mongo Bootstrap Warning]', err.message));

      // Non-destructive startup repair for legacy self-registered accounts with fake 'Maharashtra' / 100% completion
      repairIncompleteCustomerProfiles()
        .then((repaired) => {
          if (repaired.repairedCount > 0) {
            console.log(`[Profile Repair] Reconciled ${repaired.repairedCount} incomplete customer profile(s) on startup.`);
          }
        })
        .catch((err) => console.warn('[Profile Repair Warning]', err.message));

      // Clean up dismissed test failed transactions & admin-requested test payment/ledger entries
      purgeLegacyTestLedgerRows()
        .then((purged) => {
          if (purged.dismissedPurged > 0) {
            console.log(`[DB Cleanup] Purged ${purged.dismissedPurged} dismissed test failed transactions.`);
          }
        })
        .catch((err) => console.warn('[DB Cleanup Warning]', err.message));

      // Purge specified test accounts (@abc, @xxx) requested by admin
      purgeSpecifiedTestUsers().catch((err) => console.warn('[Purge Test Users Warning]', err.message));

      // Start background transactional outbox relay worker
      startOutboxWorker(2500);

      // Run daily ad spend pacing evaluation 3s after startup, then every 30 minutes (protected by distributed MongoDB TTL lease lock)
      setTimeout(() => {
        withDistributedCronLock('daily_ad_spend_pacing', 10 * 60 * 1000, () => processDailyAdSpendPacing())
          .then((lockRes) => {
            if (!lockRes.skipped) {
              const res = lockRes.result || {};
              console.log(`[Daily Ad Spend Pacing] Initial run completed (${res.processedCount || 0} deducted, ${res.autoPausedCount || 0} paused)`);
            }
          })
          .catch((err) => console.warn('[Daily Ad Spend Pacing] Initial run warning:', err.message));
      }, 3000);

      setInterval(() => {
        withDistributedCronLock('daily_ad_spend_pacing', 10 * 60 * 1000, () => processDailyAdSpendPacing())
          .then((lockRes) => {
            if (!lockRes.skipped) {
              const res = lockRes.result || {};
              if (res.processedCount > 0 || res.autoPausedCount > 0) {
                console.log(`[Daily Ad Spend Pacing] Auto-run completed (${res.processedCount} deducted, ${res.autoPausedCount} paused)`);
              }
            }
          })
          .catch((err) => console.warn('[Daily Ad Spend Pacing] Auto-run warning:', err.message));
      }, 30 * 60 * 1000);
    })
    .catch((err) => {
      console.error('Failed to initialize MongoDB database:', err);
    });
});

export { app };
