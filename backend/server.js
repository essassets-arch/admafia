import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase, query, getDbStatus } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = Number(process.env.PORT || 5000);

app.use(cors());
app.use(express.json({ limit: '5mb' }));

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
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
      : 'Today',
  };
}

function mapLeadRow(row) {
  const cleanPhone = (row.buyer_phone || '').trim();
  const displayPhone = row.display_phone || (cleanPhone ? `+91 ${cleanPhone}` : '');
  return {
    id: row.id,
    customerId: row.customer_id,
    customerPhone: (row.customer_phone || '').trim(),
    customerUsername: row.customer_username,
    company: row.company_name,
    assignedCompany: row.company_name,
    customerCompanyName: row.company_name,
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
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
      : 'Today',
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
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : 'Just now',
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
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })
      : new Date().toLocaleDateString('en-IN'),
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
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
      : 'Today',
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
        (SELECT COUNT(*) FROM payment_records) AS payments_count
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
    const [custRes, leadsRes, payRes, pvRes, qRes, tRes, grpRes] = await Promise.all([
      query('SELECT * FROM vw_sales_customer_accounts ORDER BY registered_at DESC'),
      query('SELECT * FROM leads ORDER BY created_at DESC'),
      query('SELECT * FROM payment_records ORDER BY paid_at DESC'),
      query('SELECT * FROM pending_verifications ORDER BY submitted_at DESC'),
      query('SELECT * FROM support_queries ORDER BY created_at DESC'),
      query('SELECT * FROM sales_tasks ORDER BY created_at DESC'),
      query('SELECT * FROM customer_groups ORDER BY created_at ASC'),
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
          ? new Date(r.submitted_at).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })
          : 'Today',
      })),
      queries: qRes.rows,
      tasks: tRes.rows,
      groups: grpRes.rows,
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
    const initialDeposit = Math.max(0, Number(deposit) || 0);
    const payStatus = initialDeposit >= 300 ? 'paid' : 'pending';

    await query(
      `INSERT INTO customers (
        id, username, phone, email, password_hash,
        company_name, category, contact_person, city, state,
        status, profile_status, payment_status, kyc_percent, verified
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active', 'incomplete', $11, 25, FALSE)
      ON CONFLICT (phone) DO UPDATE SET
        username = EXCLUDED.username,
        email = EXCLUDED.email,
        password_hash = EXCLUDED.password_hash,
        company_name = EXCLUDED.company_name,
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
      ON CONFLICT (customer_id) DO NOTHING`,
      [walId, custId, initialDeposit, initialDeposit >= 300]
    );

    await query(
      `INSERT INTO pending_verifications (
        id, customer_id, company_name, contact_person, phone,
        amount, payment_status, profile_status, queue_type
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'incomplete', $8)
      ON CONFLICT (customer_id) DO NOTHING`,
      [
        pvId,
        custId,
        formattedName,
        contactName,
        cleanPhone,
        initialDeposit,
        payStatus,
        initialDeposit >= 300 ? 'Profile Pending' : 'Both Incomplete',
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

    if (updates.dailyAdSpend !== undefined || updates.adCampaignActive !== undefined || updates.balance !== undefined) {
      const walRes = await query('SELECT * FROM wallets WHERE customer_id = $1', [cust.id]);
      if (walRes.rowCount > 0) {
        const w = walRes.rows[0];
        const nextDaily = updates.dailyAdSpend !== undefined ? Math.max(300, Number(updates.dailyAdSpend)) : Number(w.daily_ad_spend);
        const nextActive = updates.adCampaignActive !== undefined ? Boolean(updates.adCampaignActive) : Boolean(w.ad_campaign_active);
        const nextBal = updates.balance !== undefined ? Math.max(0, Number(updates.balance)) : Number(w.available_balance);
        await query(
          `UPDATE wallets SET daily_ad_spend = $1, ad_campaign_active = $2, available_balance = $3, updated_at = NOW() WHERE customer_id = $4`,
          [nextDaily, nextActive, nextBal, cust.id]
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
    res.json({ ok: true, verifications: result.rows });
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

app.listen(PORT, () => {
  initDatabase()
    .then((info) => {
      console.log(`🚀 Growthline CRM Backend API listening on http://localhost:${PORT} (DB mode: ${info.mode})`);
    })
    .catch((err) => {
      console.error('Failed to initialize PostgreSQL database:', err);
    });
});
