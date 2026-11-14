import { spawn } from 'child_process';
import { createHmac } from 'crypto';
import assert from 'assert';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.join(__dirname, '..');
const SERVER_PATH = path.join(BACKEND_DIR, 'server.js');

const TEST_PORT = 5059;
const BASE = `http://127.0.0.1:${TEST_PORT}`;
const TEST_DB_NAME = 'admafia_crm_test';
const TEST_MONGO_URI = `mongodb://127.0.0.1:27017/${TEST_DB_NAME}?directConnection=true`;
const TEST_WEBHOOK_SECRET = 'test_rzp_webhook_secret_2026';

async function req(method, urlPath, body = null, extraHeaders = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'x-admin-role': 'Super Admin',
    'x-admin-name': 'Super Admin',
    'x-admin-id': 'superadmin',
    'X-Real-IP': '49.36.128.1',
    ...extraHeaders,
  };
  const rawBody = body !== null ? JSON.stringify(body) : undefined;
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers,
    body: rawBody,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { _raw: text };
  }
  return { status: res.status, json };
}

async function waitForServer(getLogs, maxWaitMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) {
        const j = await r.json();
        if (j?.ok && j?.db?.connected) return j;
      }
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('Server failed to become healthy on ' + BASE + '\nServer logs:\n' + getLogs());
}

async function main() {
  console.log('=== PHASE 3/4 E2E MONGODB-ONLY CUTOVER VERIFICATION ===');

  // 1. Connect to local test DB ONLY (strict guard against live 27018 / admafia_crm)
  const conn = await mongoose.createConnection(TEST_MONGO_URI).asPromise();
  assert.strictEqual(conn.host, '127.0.0.1', 'Must connect to 127.0.0.1');
  assert.strictEqual(conn.port, 27017, 'Must connect to local port 27017 (NEVER 27018)');
  assert.strictEqual(conn.name, TEST_DB_NAME, 'Must only touch admafia_crm_test');
  await conn.dropDatabase();
  console.log('[1] Cleanly dropped local test DB:', TEST_DB_NAME);

  // 2. Spawn backend/server.js WITHOUT any PG* or DATABASE_URL env vars
  const cleanEnv = { ...process.env };
  for (const k of Object.keys(cleanEnv)) {
    if (k.startsWith('PG') || k.startsWith('POSTGRES') || k === 'DATABASE_URL') {
      delete cleanEnv[k];
    }
  }
  cleanEnv.PORT = String(TEST_PORT);
  cleanEnv.MONGO_URI = TEST_MONGO_URI;
  cleanEnv.RAZORPAY_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
  cleanEnv.TRUST_PROXY_HEADERS = 'true';
  cleanEnv.NODE_ENV = 'test';

  let serverLogs = '';
  const serverProc = spawn(process.execPath, [SERVER_PATH], {
    cwd: BACKEND_DIR,
    env: cleanEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProc.stdout.on('data', (d) => {
    serverLogs += d.toString();
  });
  serverProc.stderr.on('data', (d) => {
    serverLogs += d.toString();
  });

  const results = [];
  const check = (name, cond, detail = '') => {
    if (!cond) {
      throw new Error(`ASSERTION FAILED [${name}]: ${detail}`);
    }
    results.push(name);
    console.log(`  ✓ ${name}`);
  };

  try {
    const health = await waitForServer(() => serverLogs, 15000);
    await new Promise((r) => setTimeout(r, 1200));

    check(
      'Health endpoint reports MongoDB connected',
      health.ok === true && health.db?.connected === true && health.db?.database === TEST_DB_NAME,
      JSON.stringify(health)
    );
    check(
      'Zero PostgreSQL / PGlite attempts in startup logs',
      !/postgres|pglite|5432/i.test(serverLogs),
      serverLogs
    );

    const cpDetect = await req('GET', '/api/public/country-detection');
    check(
      'GET /api/public/country-detection returns 200',
      cpDetect.status === 200 && cpDetect.json.ok === true,
      JSON.stringify(cpDetect.json)
    );

    const cpPricing = await req('GET', '/api/public/pricing');
    check(
      'GET /api/public/pricing returns active pricing rules',
      cpPricing.status === 200 && Array.isArray(cpPricing.json.pricing) && cpPricing.json.pricing.length >= 2,
      JSON.stringify(cpPricing.json)
    );

    const reg1 = await req('POST', '/api/auth/register', {
      companyName: 'Alpha Tech Solutions',
      contactPerson: 'Rahul Sharma',
      username: 'alphatech',
      phone: '9123456701',
      email: 'rahul@alphatech.in',
      password: 'Password@123',
      category: 'IT & Software',
      city: 'Mumbai',
      state: 'Maharashtra',
    });
    check(
      'POST /api/auth/register creates customer (201)',
      reg1.status === 201 && reg1.json.ok === true,
      JSON.stringify(reg1.json)
    );
    const custId = reg1.json.customer.id;

    const dbCustCount = await conn.collection('customers').countDocuments({ _id: custId });
    const dbWalCount = await conn.collection('wallets').countDocuments({ customerId: custId });
    const dbPvCount = await conn.collection('pending_verifications').countDocuments({ customerId: custId });
    check(
      'Customer + Wallet + PendingVerification persisted in MongoDB in real time',
      dbCustCount === 1 && dbWalCount === 1 && dbPvCount === 1,
      `cust=${dbCustCount}, wal=${dbWalCount}, pv=${dbPvCount}`
    );

    const regDup = await req('POST', '/api/auth/register', {
      companyName: 'Dup Co',
      contactPerson: 'Dup',
      username: 'alphatech',
      phone: '9123456702',
      password: 'Password@123',
    });
    check('Duplicate username on different phone rejected (409)', regDup.status === 409, JSON.stringify(regDup.json));

    const loginCust = await req('POST', '/api/auth/login', { identifier: '9123456701', password: 'Password@123' });
    check(
      'POST /api/auth/login authenticates customer',
      loginCust.status === 200 && loginCust.json.ok === true,
      JSON.stringify(loginCust.json)
    );

    const loginAdmin = await req('POST', '/api/auth/admin-login', { username: 'sales', password: 'Sales@2026!' });
    check(
      'POST /api/auth/admin-login authenticates seeded admin',
      loginAdmin.status === 200 && loginAdmin.json.ok === true,
      JSON.stringify(loginAdmin.json)
    );

    const listCusts = await req('GET', '/api/customers');
    check(
      'GET /api/customers includes new customer immediately',
      listCusts.status === 200 && listCusts.json.customers.some((c) => c.id === custId),
      JSON.stringify(listCusts.json)
    );

    const salesTopup = await req('POST', '/api/sales/wallet/topup', {
      customerId: custId,
      amount: 2400,
      referenceUtr: 'UTR_REALTIME_2400',
      paymentMethod: 'UPI Direct',
      notes: 'Real-time topup test',
    });
    check(
      'POST /api/sales/wallet/topup credits ₹2400 atomically',
      (salesTopup.status === 200 || salesTopup.status === 201) &&
        salesTopup.json.ok === true &&
        Number(salesTopup.json.newBalance ?? salesTopup.json.walletBalance) === 2400,
      JSON.stringify(salesTopup.json)
    );

    const dbPayAfterSales = await conn.collection('payment_records').countDocuments({ referenceUtr: 'UTR_REALTIME_2400' });
    check('Payment record immediately visible in MongoDB payment_records', dbPayAfterSales === 1, `count=${dbPayAfterSales}`);

    const salesTopupDup = await req('POST', '/api/sales/wallet/topup', {
      customerId: custId,
      amount: 2400,
      referenceUtr: 'UTR_REALTIME_2400',
      paymentMethod: 'UPI Direct',
    });
    check('Duplicate Sales UTR blocked (409) without double credit', salesTopupDup.status === 409, JSON.stringify(salesTopupDup.json));

    const webhookBody = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_RZP_LIVE_TEST_999',
            amount: 118000,
            currency: 'INR',
            status: 'captured',
            method: 'upi',
            contact: '+919123456701',
            notes: { customer_id: custId, customer_phone: '9123456701', customer_username: 'alphatech' },
          },
        },
      },
    };
    const webhookSig = createHmac('sha256', TEST_WEBHOOK_SECRET).update(JSON.stringify(webhookBody)).digest('hex');

    const wh1 = await req('POST', '/api/payments/razorpay/webhook', webhookBody, { 'x-razorpay-signature': webhookSig });
    check(
      'POST /api/payments/razorpay/webhook verifies HMAC & acknowledges 200',
      wh1.status === 200 && wh1.json.ok === true,
      JSON.stringify(wh1.json)
    );
    await new Promise((r) => setTimeout(r, 600));

    const walAfterWh1 = await conn.collection('wallets').findOne({ customerId: custId });
    const invAfterWh1 = await conn.collection('tax_invoices').findOne({ customerId: custId });
    check(
      'Webhook creditCustomerWallet increments balance to ₹3580 & creates GST invoice (998311)',
      Number(walAfterWh1?.availableBalance) === 3580 && invAfterWh1?.sacCode === '998311',
      JSON.stringify({ walAfterWh1, invAfterWh1 })
    );

    const wh2 = await req('POST', '/api/payments/razorpay/webhook', webhookBody, { 'x-razorpay-signature': webhookSig });
    await new Promise((r) => setTimeout(r, 600));
    const walAfterWh2 = await conn.collection('wallets').findOne({ customerId: custId });
    check(
      'Duplicate Razorpay webhook delivery is 100% idempotent (balance stays ₹3580)',
      wh2.status === 200 && Number(walAfterWh2?.availableBalance) === 3580,
      `balance=${walAfterWh2?.availableBalance}`
    );

    const listPayments = await req('GET', '/api/payments');
    check(
      'GET /api/payments returns both real-time payment records (2 total)',
      listPayments.status === 200 && listPayments.json.payments.length === 2,
      `len=${listPayments.json.payments?.length}`
    );

    const listInvoices = await req('GET', `/api/invoices?customerId=${encodeURIComponent(custId)}`);
    check(
      'GET /api/invoices returns GST tax invoice',
      listInvoices.status === 200 && listInvoices.json.invoices.length >= 1,
      JSON.stringify(listInvoices.json)
    );

    const failRec = await req('POST', '/api/wallets/failed-transaction', {
      customerId: custId,
      amount: 500,
      referenceUtr: 'FAIL_UTR_001',
      failureReason: 'Bank server timeout',
    });
    check(
      'POST /api/wallets/failed-transaction records declined tx',
      failRec.status === 200 && failRec.json.ok === true,
      JSON.stringify(failRec.json)
    );
    const failTxId = failRec.json.transaction.id;

    const failList1 = await req('GET', '/api/sales/failed-transactions');
    check(
      'GET /api/sales/failed-transactions lists declined tx',
      failList1.status === 200 && failList1.json.failedTransactions.some((t) => t.id === failTxId),
      JSON.stringify(failList1.json)
    );

    const archiveFail = await req('DELETE', `/api/sales/failed-transactions/${encodeURIComponent(failTxId)}`);
    check(
      'DELETE /api/sales/failed-transactions/:id archives tx',
      archiveFail.status === 200 && archiveFail.json.ok === true,
      JSON.stringify(archiveFail.json)
    );

    const delHist = await req('GET', '/api/sales/failed-transactions/history');
    const archivedItem = delHist.json.history?.find((d) => d.originalId === failTxId || d.ref === 'FAIL_UTR_001');
    check('Deleted failed tx appears in history', delHist.status === 200 && Boolean(archivedItem), JSON.stringify(delHist.json));

    const restoreFail = await req('POST', '/api/sales/failed-transactions/history/restore', { id: archivedItem.id });
    check(
      'POST /api/sales/failed-transactions/history/restore restores tx',
      restoreFail.status === 200 && restoreFail.json.ok === true,
      JSON.stringify(restoreFail.json)
    );

    const deduct1 = await req('POST', '/api/wallets/deduct', { customerId: custId, amount: 500 });
    check(
      'POST /api/wallets/deduct deducts ₹500 (balance -> ₹3080) & activates campaign',
      deduct1.status === 200 && deduct1.json.alreadyDeducted === false && deduct1.json.walletBalance === 3080,
      JSON.stringify(deduct1.json)
    );

    const deduct2 = await req('POST', '/api/wallets/deduct', { customerId: custId, amount: 500 });
    check(
      'Second POST /api/wallets/deduct same day is idempotent (balance stays ₹3080)',
      deduct2.status === 200 && deduct2.json.alreadyDeducted === true && deduct2.json.walletBalance === 3080,
      JSON.stringify(deduct2.json)
    );

    const grpCreate = await req('POST', '/api/groups', {
      name: 'Enterprise IT Buyers',
      category: 'IT & Software',
      icon: '💻',
      description: 'Verified IT & SaaS leads',
    });
    check('POST /api/groups creates customer group (201)', grpCreate.status === 201 && grpCreate.json.ok === true, JSON.stringify(grpCreate.json));
    const groupId = grpCreate.json.group.id;

    const grpDup = await req('POST', '/api/groups', { name: 'Enterprise IT Buyers', category: 'IT & Software' });
    check('Duplicate group name returns 409', grpDup.status === 409, JSON.stringify(grpDup.json));

    const grpAssign = await req('POST', `/api/groups/${encodeURIComponent(groupId)}/members`, { customerIds: [custId] });
    check('POST /api/groups/:id/members assigns customer', grpAssign.status === 200 && grpAssign.json.assignedCount === 1, JSON.stringify(grpAssign.json));

    const grpPreview = await req('GET', `/api/groups/${encodeURIComponent(groupId)}/preview-recipients`);
    check(
      'GET /api/groups/:id/preview-recipients evaluates 1 eligible customer',
      grpPreview.status === 200 && grpPreview.json.eligibleCount === 1,
      JSON.stringify(grpPreview.json)
    );

    const dist1 = await req('POST', '/api/leads/distribute', {
      id: 'mlead_test_001',
      groupId,
      category: 'IT & Software',
      title: 'ERP Development Requirement',
      buyerName: 'Vikram Mehta',
      buyerPhone: '9876543210',
      city: 'Pune',
      budget: '₹5L – ₹10L',
    });
    check(
      'POST /api/leads/distribute dispatches lead atomically to 1 eligible customer',
      dist1.status === 201 && dist1.json.recipientsCount === 1,
      JSON.stringify(dist1.json)
    );

    const distDup = await req('POST', '/api/leads/distribute', {
      id: 'mlead_test_001',
      groupId,
      category: 'IT & Software',
      title: 'ERP Development Requirement',
      buyerName: 'Vikram Mehta',
      buyerPhone: '9876543210',
    });
    check(
      'Re-distributing same masterLeadId blocks duplicate delivery (400)',
      distDup.status === 400 && distDup.json.skippedBreakdown?.duplicateLead === 1,
      JSON.stringify(distDup.json)
    );

    const custLeads = await req('GET', `/api/leads?username=alphatech`);
    check(
      'GET /api/leads?username=alphatech returns dispatched lead',
      custLeads.status === 200 && custLeads.json.leads.length === 1,
      JSON.stringify(custLeads.json)
    );

    const leadPatch = await req('PATCH', `/api/leads/${encodeURIComponent(custLeads.json.leads[0].id)}`, {
      status: 'Interested',
      read: true,
      notes: 'Spoke with buyer, sending proposal',
    });
    check(
      'PATCH /api/leads/:id updates lead & syncs assignment',
      leadPatch.status === 200 && leadPatch.json.lead.status === 'Interested',
      JSON.stringify(leadPatch.json)
    );

    const distDetail = await req('GET', '/api/leads/distribution-history/mlead_test_001');
    check(
      'GET /api/leads/distribution-history/:id reflects synced Interested count',
      distDetail.status === 200 && distDetail.json.distribution.interestedCount === 1,
      JSON.stringify(distDetail.json)
    );

    const qCreate = await req('POST', '/api/queries', {
      customerId: custId,
      companyName: 'Alpha Tech Solutions',
      contactPhone: '9123456701',
      subject: 'Need GST invoice copy',
    });
    check('POST /api/queries creates support ticket (201)', qCreate.status === 201 && qCreate.json.ok === true, JSON.stringify(qCreate.json));
    const qId = qCreate.json.query.id;

    const qPatch = await req('PATCH', `/api/queries/${encodeURIComponent(qId)}`, {
      status: 'resolved',
      internalNotes: 'Sent on email',
    });
    check('PATCH /api/queries/:id resolves ticket', qPatch.status === 200 && qPatch.json.query.status === 'resolved', JSON.stringify(qPatch.json));

    const tCreate = await req('POST', '/api/tasks', {
      customerId: custId,
      company: 'Alpha Tech Solutions',
      phone: '9123456701',
      taskType: 'Onboarding Call',
    });
    check('POST /api/tasks creates sales task (201)', tCreate.status === 201 && tCreate.json.ok === true, JSON.stringify(tCreate.json));

    const verifs = await req('GET', '/api/verifications');
    check('GET /api/verifications returns verification queue', verifs.status === 200 && Array.isArray(verifs.json.verifications), JSON.stringify(verifs.json));

    const mktSum = await req('GET', '/api/marketing/summary');
    check('GET /api/marketing/summary returns 200', mktSum.status === 200 && mktSum.json.ok === true, JSON.stringify(mktSum.json));

    const mktCusts = await req('GET', '/api/marketing/customers');
    check('GET /api/marketing/customers returns customer list', mktCusts.status === 200 && mktCusts.json.customers.length >= 1, JSON.stringify(mktCusts.json));

    const mktIdea = await req('POST', '/api/marketing/ideas', {
      customerId: custId,
      title: 'Diwali B2B Lead Gen Campaign',
      objective: 'Lead Generation',
      concept: 'Carousel showcasing ROI metrics',
    });
    check('POST /api/marketing/ideas creates marketing idea', (mktIdea.status === 200 || mktIdea.status === 201) && mktIdea.json.ok === true, JSON.stringify(mktIdea.json));

    const mktPost = await req('POST', '/api/marketing/posts', {
      customerId: custId,
      title: 'Alpha Tech Hero Creative',
      caption: 'Scale your enterprise IT stack',
      platform: 'Instagram',
    });
    check('POST /api/marketing/posts creates post request for Graphics', (mktPost.status === 200 || mktPost.status === 201) && mktPost.json.ok === true, JSON.stringify(mktPost.json));

    const gfxSum = await req('GET', '/api/graphics/summary');
    check('GET /api/graphics/summary returns 200', gfxSum.status === 200 && gfxSum.json.ok === true, JSON.stringify(gfxSum.json));

    const gfxReqs = await req('GET', '/api/graphics/requests');
    check('GET /api/graphics/requests sees newly created post', gfxReqs.status === 200 && gfxReqs.json.requests.length >= 1, JSON.stringify(gfxReqs.json));

    const saDash = await req('GET', '/api/superadmin/dashboard/summary');
    check('GET /api/superadmin/dashboard/summary returns live MongoDB KPIs', saDash.status === 200 && saDash.json.ok === true, JSON.stringify(saDash.json));

    const saFin = await req('GET', '/api/superadmin/finance/summary');
    check('GET /api/superadmin/finance/summary reconciles balances', saFin.status === 200 && saFin.json.ok === true, JSON.stringify(saFin.json));

    const saUsers = await req('GET', '/api/superadmin/users');
    check('GET /api/superadmin/users lists seeded system_users', saUsers.status === 200 && saUsers.json.users.length >= 4, JSON.stringify(saUsers.json));

    const saCp = await req('GET', '/api/superadmin/country-pricing');
    check('GET /api/superadmin/country-pricing aggregates customer stats', saCp.status === 200 && saCp.json.ok === true, JSON.stringify(saCp.json));

    const fullState = await req('GET', '/api/state');
    check(
      'GET /api/state returns full CRM state payload',
      fullState.status === 200 && fullState.json.ok === true && fullState.json.customers.length === 1,
      JSON.stringify({ ok: fullState.json.ok, custs: fullState.json.customers?.length })
    );

    check(
      'Zero UNCAUGHT EXCEPTION or UNHANDLED REJECTION in server logs',
      !/UNCAUGHT EXCEPTION|UNHANDLED REJECTION/i.test(serverLogs),
      serverLogs
    );

    console.log(`\n🎉 ALL ${results.length}/${results.length} E2E CHECKS PASSED AGAINST 100% MONGODB (ZERO POSTGRESQL)!`);
  } finally {
    serverProc.kill('SIGTERM');
    await conn.dropDatabase().catch(() => {});
    await conn.close().catch(() => {});
    console.log('[Cleanup] Dropped test database admafia_crm_test and stopped test server.');
  }
}

main().catch((err) => {
  console.error('\n❌ E2E VERIFICATION FAILED:', err.message);
  process.exit(1);
});
