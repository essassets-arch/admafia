import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase, query, withTransaction, getDbStatus } from './db.js';
import { marketingRouter, processDailyAdSpendPacing } from './routes/marketing.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = Number(process.env.PORT || 5000);

app.use(cors());
app.use(express.json({ limit: '25mb' }));

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
    activeDays: typeof row.active_days === 'string'
      ? row.active_days.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
      : (Array.isArray(row.active_days) ? row.active_days : ['MON', 'TUE', 'WED', 'THU', 'FRI']),
    schedulePreset: row.schedule_preset || 'weekdays',
    balance,
    walletBalance: balance,
    dailyPacing,
    dailyAdSpend: dailyPacing,
    amountPaid,
    totalLifetimePaid: amountPaid,
    runwayDays: Number(row.runway_days ?? Math.floor(balance / Math.max(dailyPacing, 1))),
    totalLeadsDispatched: Number(row.total_leads_dispatched ?? 0),
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
    customerCount: Number(row.customer_count ?? 0),
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

    const custCheck = await query(
      `SELECT id, password_hash, status FROM customers
       WHERE LOWER(username) = $1 OR LOWER(email) = $1 OR phone = $2
       LIMIT 1`,
      [q, q.replace(/\D/g, '').slice(-10)]
    );

    if (custCheck.rowCount === 0) {
      return res.status(404).json({
        ok: false,
        error: 'No registered account found with these credentials. Please create a business account first.',
      });
    }

    const row = custCheck.rows[0];
    if (password && row.password_hash && row.password_hash !== password) {
      return res.status(401).json({ ok: false, error: 'Incorrect password for this account.' });
    }

    if (row.status === 'suspended') {
      return res.status(403).json({
        ok: false,
        error: 'Compliance Hold Notice: Your workspace has been suspended by the operations administrator.',
      });
    }

    const viewRes = await query('SELECT * FROM vw_sales_customer_accounts WHERE id = $1', [row.id]);
    const customer = mapCustomerRow(viewRes.rows[0], row.password_hash);

    const [leadsRes, txRes, invRes] = await Promise.all([
      query('SELECT * FROM leads WHERE customer_id = $1 ORDER BY created_at DESC', [row.id]),
      query('SELECT * FROM wallet_transactions WHERE customer_id = $1 ORDER BY created_at DESC', [row.id]),
      query('SELECT * FROM tax_invoices WHERE customer_id = $1 ORDER BY created_at DESC', [row.id]),
    ]);

    res.json({
      ok: true,
      customer,
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
      query('SELECT * FROM leads WHERE customer_id = $1 ORDER BY created_at DESC', [customer.id]),
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

app.patch('/api/customers/:id', async (req, res) => {
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

    await query(
      `UPDATE customers SET
        company_name = $1,
        website = $2,
        status = $3,
        profile_status = $4,
        payment_status = $5,
        kyc_percent = $6,
        verified = ($6 >= 100 OR $4 = 'complete'),
        updated_at = NOW()
      WHERE id = $7`,
      [nextCompany, nextWebsite, nextStatus, nextProfile, nextPayment, nextKyc, cust.id]
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
        const nextDays = updates.activeDays !== undefined
          ? (Array.isArray(updates.activeDays) ? updates.activeDays.join(',') : String(updates.activeDays))
          : (w.active_days || 'MON,TUE,WED,THU,FRI');
        const nextPreset = updates.schedulePreset || w.schedule_preset || 'weekdays';
        await query(
          `UPDATE wallets SET daily_ad_spend = $1, ad_campaign_active = $2, available_balance = $3, active_days = $4, schedule_preset = $5, updated_at = NOW() WHERE customer_id = $6`,
          [nextDaily, nextActive, nextBal, nextDays, nextPreset, cust.id]
        );
      }
    }

    const viewRes = await query('SELECT * FROM vw_sales_customer_accounts WHERE id = $1', [cust.id]);
    res.json({ ok: true, customer: mapCustomerRow(viewRes.rows[0]) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

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
app.post('/api/wallets/topup', async (req, res) => {
  try {
    const {
      customerId,
      phone,
      username,
      amount,
      referenceUtr,
      paymentMethod = 'Razorpay Secure (UPI/Card)',
      description,
    } = req.body || {};

    const cleanAmount = Number(amount || 0);
    if (cleanAmount < 300) {
      return res.status(400).json({ ok: false, error: 'Minimum wallet top-up amount is ₹300.' });
    }

    const cleanPhone = String(phone || customerId || '').replace(/\D/g, '').slice(-10);
    const custRes = await query(
      `SELECT * FROM customers
       WHERE id = $1 OR phone = $2 OR LOWER(username) = LOWER($3)
       LIMIT 1`,
      [customerId || '', cleanPhone, username || '']
    );

    if (custRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Customer account not found for wallet top-up.' });
    }

    const cust = custRes.rows[0];
    const utr = (referenceUtr || `rzp_${Date.now()}`).trim();

    // Update wallet balance
    const walUpdate = await query(
      `UPDATE wallets SET
        available_balance = available_balance + $1,
        total_lifetime_paid = total_lifetime_paid + $1,
        ad_campaign_active = TRUE,
        updated_at = NOW()
      WHERE customer_id = $2
      RETURNING *`,
      [cleanAmount, cust.id]
    );

    const newBalance = Number(walUpdate.rows[0]?.available_balance || cleanAmount);

    // Mark customer payment_status = 'paid'
    await query(
      `UPDATE customers SET payment_status = 'paid', updated_at = NOW() WHERE id = $1`,
      [cust.id]
    );

    // Insert Wallet Transaction
    const txId = `tx_${Date.now()}`;
    const txDesc =
      description ||
      `Ad Wallet Balance Top-Up (₹${cleanAmount.toLocaleString('en-IN')} Added)`;
    const txInsert = await query(
      `INSERT INTO wallet_transactions (
        id, customer_id, wallet_id, tx_type, amount, balance_after, reference_utr, description, payment_method, status
      ) VALUES ($1, $2, $3, 'Credit', $4, $5, $6, $7, $8, 'Verified ✓')
      ON CONFLICT (reference_utr) DO UPDATE SET balance_after = EXCLUDED.balance_after
      RETURNING *`,
      [txId, cust.id, walUpdate.rows[0]?.id || null, cleanAmount, newBalance, utr, txDesc, paymentMethod]
    );

    // Insert Payment Record for Sales Desk 05 (/sales#payments)
    const payId = `pay_${Date.now()}`;
    const receiptNo = `RCP-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
    const payInsert = await query(
      `INSERT INTO payment_records (
        id, receipt_number, customer_id, company_name, contact_person, phone, city,
        tx_type, amount, gst_amount, total_amount, payment_mode, utr_reference, status, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'topup', $8, 0, $8, $9, $10, 'paid', $11)
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

    // Insert Tax Invoice
    const invId = `inv_${Date.now()}`;
    const invoiceNo = `INV-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
    const baseAmt = Math.round(cleanAmount / 1.18);
    const cgstAmt = Math.round((cleanAmount - baseAmt) / 2);
    const sgstAmt = cleanAmount - baseAmt - cgstAmt;

    const invInsert = await query(
      `INSERT INTO tax_invoices (
        id, invoice_no, customer_id, payment_record_id, particulars, sac_code,
        base_amount, cgst_amount, sgst_amount, total_amount, payment_mode, status
      ) VALUES ($1, $2, $3, $4, $5, '998311', $6, $7, $8, $9, $10, 'Paid')
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

    // Sync Pending Verifications (Sales Desk 02)
    await query(
      `UPDATE pending_verifications SET
        amount = $1,
        utr_number = $2,
        payment_status = 'paid',
        queue_type = CASE WHEN profile_status = 'complete' THEN 'Completed' ELSE 'Profile Only Incomplete' END,
        verified_at = NOW()
      WHERE customer_id = $3`,
      [cleanAmount, utr, cust.id]
    );

    const viewRes = await query('SELECT * FROM vw_sales_customer_accounts WHERE id = $1', [cust.id]);

    res.status(201).json({
      ok: true,
      walletBalance: newBalance,
      customer: mapCustomerRow(viewRes.rows[0]),
      transaction: mapWalletTxRow(txInsert.rows[0]),
      paymentRecord: mapPaymentRecordRow(payInsert.rows[0]),
      invoice: mapInvoiceRow(invInsert.rows[0]),
    });
  } catch (err) {
    console.error('[POST /api/wallets/topup]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/wallets/deduct', async (req, res) => {
  try {
    const { customerId, phone, username, amount } = req.body || {};
    const cleanPhone = String(phone || customerId || '').replace(/\D/g, '').slice(-10);

    const custRes = await query(
      `SELECT * FROM customers WHERE id = $1 OR phone = $2 OR LOWER(username) = LOWER($3) LIMIT 1`,
      [customerId || '', cleanPhone, username || '']
    );
    if (custRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Customer not found' });
    }
    const cust = custRes.rows[0];
    const walRes = await query('SELECT * FROM wallets WHERE customer_id = $1', [cust.id]);
    const wallet = walRes.rows[0];
    const spendAmt = Math.max(300, Number(amount || wallet?.daily_ad_spend || 300));
    const currentBal = Number(wallet?.available_balance || 0);

    if (currentBal < spendAmt) {
      return res.status(400).json({
        ok: false,
        error: `Insufficient wallet balance (₹${currentBal}) for ₹${spendAmt} daily ad spend.`,
      });
    }

    const nextBal = currentBal - spendAmt;
    await query(
      `UPDATE wallets SET
        available_balance = $1,
        daily_ad_spend = $2,
        total_ad_spent = total_ad_spent + $2,
        ad_campaign_active = ($1 >= $2),
        last_deducted_at = NOW(),
        updated_at = NOW()
      WHERE customer_id = $3`,
      [nextBal, spendAmt, cust.id]
    );

    const txId = `tx_deb_${Date.now()}`;
    const refUtr = `AUTO-AD-${Date.now()}`;
    const txInsert = await query(
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

    const viewRes = await query('SELECT * FROM vw_sales_customer_accounts WHERE id = $1', [cust.id]);
    res.json({
      ok: true,
      walletBalance: nextBal,
      customer: mapCustomerRow(viewRes.rows[0]),
      transaction: mapWalletTxRow(txInsert.rows[0]),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
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
      [customerId || '', cleanCustPhone, customerUsername || targetCompany, targetCompany]
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
    const result = await query(`
      SELECT 
        cg.*,
        (
          SELECT COUNT(DISTINCT c.id) 
          FROM customers c
          LEFT JOIN customer_group_memberships cgm ON cgm.customer_id = c.id
          WHERE c.status = 'active'
            AND (
              cgm.group_id = cg.id 
              OR c.group_id = cg.id
              OR LOWER(c.category) = LOWER(cg.category)
              OR LOWER(c.category) = LOWER(cg.name)
            )
        ) AS customer_count,
        (SELECT COUNT(*) FROM master_leads ml WHERE ml.group_id = cg.id OR LOWER(ml.category) = LOWER(cg.category) OR LOWER(ml.category) = LOWER(cg.name)) AS leads_received,
        (SELECT COUNT(*) FROM lead_assignments la WHERE la.group_id = cg.id) AS leads_distributed
      FROM customer_groups cg
      ORDER BY cg.created_at ASC
    `);
    res.json({ ok: true, groups: result.rows.map(mapGroupRow) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// List all categories and customer groups with live eligible customer counts
app.get('/api/categories', async (req, res) => {
  try {
    const groupsRes = await query(`
      SELECT 
        cg.*,
        (
          SELECT COUNT(DISTINCT c.id) 
          FROM customers c
          LEFT JOIN customer_group_memberships cgm ON cgm.customer_id = c.id
          WHERE c.status = 'active'
            AND (
              cgm.group_id = cg.id 
              OR c.group_id = cg.id
              OR LOWER(c.category) = LOWER(cg.category)
              OR LOWER(c.category) = LOWER(cg.name)
            )
        ) AS customer_count,
        (SELECT COUNT(*) FROM master_leads ml WHERE ml.group_id = cg.id OR LOWER(ml.category) = LOWER(cg.category) OR LOWER(ml.category) = LOWER(cg.name)) AS leads_received,
        (SELECT COUNT(*) FROM lead_assignments la WHERE la.group_id = cg.id) AS leads_distributed
      FROM customer_groups cg
      ORDER BY cg.created_at ASC
    `);

    const custCatRes = await query(`
      SELECT DISTINCT category FROM customers WHERE category IS NOT NULL AND category != ''
    `);

    const categoryMap = new Map();

    for (const g of groupsRes.rows) {
      const catKey = g.category || g.name;
      if (!categoryMap.has(catKey)) {
        categoryMap.set(catKey, {
          category: catKey,
          name: g.name,
          groupId: g.id,
          icon: g.icon || '🏢',
          description: g.description || '',
          eligibleCount: Number(g.customer_count || 0),
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
        const countRes = await query(
          `SELECT COUNT(DISTINCT c.id) as count 
           FROM customers c 
           WHERE c.status = 'active' AND (LOWER(c.category) = LOWER($1) OR LOWER(c.industry) = LOWER($1))`,
          [cat]
        );
        categoryMap.set(cat, {
          category: cat,
          name: cat,
          groupId: null,
          icon: '🏢',
          description: `${cat} Industry Segment`,
          eligibleCount: Number(countRes.rows[0]?.count || 0),
          leadsReceived: 0,
          leadsDistributed: 0,
        });
      }
    }

    const categories = Array.from(categoryMap.values());
    res.json({
      ok: true,
      categories,
      groups: groupsRes.rows.map(mapGroupRow),
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

    if (!targetCat && !targetGroupId) {
      return res.status(400).json({ ok: false, error: 'Category or groupId parameter is required' });
    }

    const customersRes = await query(
      `SELECT DISTINCT 
         c.id, c.username, c.company_name, c.contact_person, c.phone, c.email,
         c.category, c.city, c.state, c.status, c.profile_status, c.payment_status,
         COALESCE(w.available_balance, 0) AS balance
       FROM customers c
       LEFT JOIN customer_group_memberships cgm ON cgm.customer_id = c.id
       LEFT JOIN customer_groups cg ON (cg.id = cgm.group_id OR cg.id = c.group_id)
       LEFT JOIN wallets w ON w.customer_id = c.id
       WHERE c.status = 'active'
         AND (
           ( $1 <> '' AND (
             LOWER(c.category) = LOWER($1)
             OR LOWER(c.industry) = LOWER($1)
             OR LOWER(cg.category) = LOWER($1)
             OR LOWER(cg.name) = LOWER($1)
           ) )
           OR ( $2 <> '' AND (
             cgm.group_id = $2
             OR c.group_id = $2
             OR cg.id = $2
           ) )
         )
       ORDER BY c.company_name ASC`,
      [targetCat, targetGroupId || '']
    );

    const recipients = customersRes.rows.map((r) => ({
      customerId: r.id,
      companyName: r.company_name,
      contactPerson: r.contact_person,
      phone: (r.phone || '').trim(),
      email: r.email || '',
      category: r.category || 'Other',
      city: r.city || '',
      balance: Number(r.balance || 0),
      notificationStatus: 'Ready to Dispatch',
    }));

    res.json({
      ok: true,
      category: targetCat,
      groupId: targetGroupId || null,
      eligibleCount: recipients.length,
      recipients,
    });
  } catch (err) {
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
    const grpRes = await query('SELECT * FROM customer_groups WHERE id = $1', [groupId]);
    if (grpRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Customer group not found' });
    }
    const group = grpRes.rows[0];

    const membersRes = await query(
      `SELECT 
         c.id, c.username, c.company_name, c.contact_person, c.phone, c.email,
         c.category, c.city, c.state, c.status, c.profile_status, c.payment_status,
         COALESCE(w.available_balance, 0) AS balance
       FROM customer_group_memberships cgm
       JOIN customers c ON c.id = cgm.customer_id
       LEFT JOIN wallets w ON w.customer_id = c.id
       WHERE cgm.group_id = $1
       ORDER BY c.company_name ASC`,
      [groupId]
    );

    const eligible = [];
    const excluded = [];

    for (const row of membersRes.rows) {
      const item = {
        customerId: row.id,
        companyName: row.company_name,
        contactPerson: row.contact_person,
        phone: (row.phone || '').trim(),
        email: row.email || '',
        category: row.category,
        city: row.city || '',
        status: row.status,
        balance: Number(row.balance || 0),
        notificationStatus: 'Ready to Dispatch',
      };
      if (row.status === 'active') {
        eligible.push(item);
      } else {
        excluded.push({ ...item, reason: `Account status is '${row.status}'` });
      }
    }

    res.json({
      ok: true,
      group: mapGroupRow(group),
      totalMembers: membersRes.rowCount,
      eligibleCount: eligible.length,
      excludedCount: excluded.length,
      eligibleRecipients: eligible,
      excludedRecipients: excluded,
    });
  } catch (err) {
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

    // Query active eligible customers for this category or group
    const eligibleRes = await query(
      `SELECT DISTINCT 
         c.id, c.username, c.company_name, c.contact_person, c.phone, c.email,
         c.category, c.city, c.state, c.status, c.profile_status, c.payment_status,
         COALESCE(w.available_balance, 0) AS balance
       FROM customers c
       LEFT JOIN customer_group_memberships cgm ON cgm.customer_id = c.id
       LEFT JOIN customer_groups cg ON (cg.id = cgm.group_id OR cg.id = c.group_id)
       LEFT JOIN wallets w ON w.customer_id = c.id
       WHERE c.status = 'active'
         AND (
           ( $1 <> '' AND (
             LOWER(c.category) = LOWER($1)
             OR LOWER(c.industry) = LOWER($1)
             OR LOWER(cg.category) = LOWER($1)
             OR LOWER(cg.name) = LOWER($1)
           ) )
           OR ( $2 <> '' AND (
             cgm.group_id = $2
             OR c.group_id = $2
             OR cg.id = $2
           ) )
         )
       ORDER BY c.company_name ASC`,
      [finalCategory, targetGroupId || '']
    );

    if (eligibleRes.rowCount === 0) {
      return res.status(400).json({
        ok: false,
        error: `No active eligible customers found in category "${finalCategory}". Assign or register customers before distributing leads.`,
      });
    }

    const eligibleCustomers = eligibleRes.rows;
    const masterLeadId = id || `mlead_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const displayPhone = `+91 ${cleanBuyerDigits}`;

    // Execute atomic transaction for lead creation & assignments
    const result = await withTransaction(async (txQuery) => {
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

      for (const cust of eligibleCustomers) {
        const custLeadId = `lead_${masterLeadId}_${cust.id}`.slice(0, 64);
        const assignId = `asgn_${masterLeadId}_${cust.id}`.slice(0, 64);

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
            cust.id,
            masterLeadId,
            cust.phone,
            cust.username,
            cust.company_name,
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
          [assignId, masterLeadId, cust.id, finalGroupId, custLeadId]
        );

        createdAssignments.push({
          id: assignId,
          customerId: cust.id,
          companyName: cust.company_name,
          contactPerson: cust.contact_person,
          phone: cust.phone,
          status: 'new',
          responseInterest: 'Pending',
          notificationStatus: 'Delivered',
        });
      }

      return {
        masterLead: savedMasterLead,
        assignments: createdAssignments,
      };
    });

    res.status(201).json({
      ok: true,
      message: `Lead "${title}" successfully distributed to all ${eligibleCustomers.length} active customer(s) in "${finalCategory}".`,
      masterLead: mapMasterLeadRow({
        ...result.masterLead,
        group_name: finalGroupName,
        recipients_count: eligibleCustomers.length,
        interested_count: 0,
      }),
      recipientsCount: eligibleCustomers.length,
      assignments: result.assignments,
    });
  } catch (err) {
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
// 7. PRODUCTION STATIC FRONTEND SERVING (When frontend/dist is built on VPS)
// =============================================================================
const frontendDistPath = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
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
