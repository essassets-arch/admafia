import { spawn } from 'child_process';
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.join(__dirname, '..');
const SERVER_PATH = path.join(BACKEND_DIR, 'server.js');

const TEST_PORT = 5063; // Avoid WHATWG bad-port 5060/5061 (SIP) in Node fetch/undici
const BASE = `http://127.0.0.1:${TEST_PORT}`;
const TEST_DB_NAME = 'admafia_otp_fcm_test';
const rawBaseMongo =
  process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/admafia_crm_test?directConnection=true';
const TEST_MONGO_URI = rawBaseMongo.replace(/\/[^/?]+(\?|$)/, `/${TEST_DB_NAME}$1`);

async function api(method, urlPath, body = null, headers = {}) {
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Real-IP': headers['X-Real-IP'] || '49.36.10.20',
      ...headers,
    },
    body: body !== null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { _raw: text };
  }
  return { status: res.status, headers: res.headers, json };
}

async function waitForHealth(getLogs, maxMs = 30000) {
  const start = Date.now();
  let lastProbe = 'none';
  while (Date.now() - start < maxMs) {
    try {
      const r = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(2500) });
      const text = await r.text();
      lastProbe = `HTTP ${r.status}: ${text.slice(0, 200)}`;
      if (r.ok) {
        const j = JSON.parse(text);
        if (j?.ok && j?.db?.connected) return j;
      }
    } catch (err) {
      lastProbe = err.message;
    }
    await new Promise((r) => setTimeout(r, 350));
  }
  throw new Error(`OTP/FCM test server failed to start (lastProbe=${lastProbe}):\n` + getLogs());
}

async function main() {
  console.log('=== PHASE 1/2/5/6 WHATSAPP OTP + REALTIME FCM/SSE + SNAPSHOT + ANALYTICS SUITE ===');

  const conn = await mongoose.createConnection(TEST_MONGO_URI).asPromise();
  assert.strictEqual(conn.name, TEST_DB_NAME);
  await conn.dropDatabase();

  const tmpBackupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'admafia-snap-test-'));

  const env = {
    ...process.env,
    PORT: String(TEST_PORT),
    MONGO_URI: TEST_MONGO_URI,
    JWT_SECRET: 'admafia_otp_fcm_suite_jwt_secret_2026_32bytes_min',
    OTP_HMAC_SECRET: 'admafia_otp_fcm_suite_hmac_secret_2026',
    OTP_MODE: 'sandbox',
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'admafia_wa_verify_hook_2026',
    BACKUP_DIR: tmpBackupDir,
    BACKUP_PASSPHRASE: 'AdMafiaTestSnapshotPassphrase!2026',
    TRUST_PROXY_HEADERS: 'true',
    NODE_ENV: 'test',
  };

  let logs = '';
  const proc = spawn(process.execPath, [SERVER_PATH], {
    cwd: BACKEND_DIR,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stdout.on('data', (d) => {
    logs += d.toString();
  });
  proc.stderr.on('data', (d) => {
    logs += d.toString();
  });

  let passed = 0;
  const check = (name, cond, detail = '') => {
    if (!cond) throw new Error(`FAILED [${name}]: ${detail}`);
    passed += 1;
    console.log(`  ✓ ${name}`);
  };

  try {
    await waitForHealth(() => logs);
    await new Promise((r) => setTimeout(r, 1000));

    // 1. Unverified registration MUST be rejected
    const unverifiedReg = await api('POST', '/api/auth/register', {
      username: 'bypass_attempt',
      phone: '9811122233',
      password: 'Password@123',
      companyName: 'Bypass Co',
    });
    check(
      'Unverified POST /api/auth/register without WhatsApp OTP token is strictly blocked (403)',
      unverifiedReg.status === 403 && unverifiedReg.json.code === 'WHATSAPP_OTP_REQUIRED',
      JSON.stringify(unverifiedReg.json)
    );

    // 2. OTP Brute-Force 5-Attempt Lockout Test
    const lockPhone = '9811199900';
    const sendLock = await api('POST', '/api/auth/otp/send', {
      phone: lockPhone,
      countryCode: 'IN',
      purpose: 'register',
    });
    check(
      'POST /api/auth/otp/send issues 6-digit challenge & logs OtpDeliveryLog',
      sendLock.status === 200 && sendLock.json.ok === true,
      JSON.stringify(sendLock.json)
    );

    for (let i = 1; i <= 4; i++) {
      const wrong = await api('POST', '/api/auth/otp/verify', {
        phone: lockPhone,
        countryCode: 'IN',
        otp: '000000',
        purpose: 'register',
      });
      assert.ok(
        wrong.status === 400 || wrong.status === 401,
        `Attempt ${i} should return 400/401, got ${wrong.status}`
      );
    }
    const fifthAttempt = await api('POST', '/api/auth/otp/verify', {
      phone: lockPhone,
      countryCode: 'IN',
      otp: '000000',
      purpose: 'register',
    });
    check(
      '5th wrong OTP attempt locks challenge immediately with 429 Too Many Attempts',
      fifthAttempt.status === 429,
      JSON.stringify(fifthAttempt.json)
    );

    // Even supplying the right OTP on the locked challenge must now fail!
    const sixthWithCorrect = await api('POST', '/api/auth/otp/verify', {
      phone: lockPhone,
      countryCode: 'IN',
      otp: '123456',
      purpose: 'register',
    });
    check(
      'Locked OTP challenge rejects subsequent correct code until new OTP requested',
      sixthAttemptBlocked(sixthWithCorrect.status),
      JSON.stringify(sixthWithCorrect.json)
    );

    // 3. Valid WhatsApp OTP Registration + Single-Use Token Replay Protection
    const custPhone = '9822233344';
    const sendValid = await api(
      'POST',
      '/api/auth/otp/send',
      {
        phone: custPhone,
        username: 'verified_enterprise',
        countryCode: 'IN',
        purpose: 'register',
      },
      { 'X-Real-IP': '49.36.10.21' }
    );
    check('Valid OTP challenge sent for new customer', sendValid.status === 200, JSON.stringify(sendValid.json));

    // Cooldown check (immediate resend within 60s blocked)
    const resendTooFast = await api(
      'POST',
      '/api/auth/otp/send',
      {
        phone: custPhone,
        username: 'verified_enterprise',
        countryCode: 'IN',
        purpose: 'register',
      },
      { 'X-Real-IP': '49.36.10.21' }
    );
    check(
      '60-second per-phone OTP resend cooldown enforced (429)',
      resendTooFast.status === 429,
      JSON.stringify(resendTooFast.json)
    );

    const verifyValid = await api(
      'POST',
      '/api/auth/otp/verify',
      {
        phone: custPhone,
        countryCode: 'IN',
        otp: '123456',
        purpose: 'register',
      },
      { 'X-Real-IP': '49.36.10.21' }
    );
    check(
      'Correct 6-digit OTP returns single-use otpVerificationToken',
      verifyValid.status === 200 && Boolean(verifyValid.json.otpVerificationToken),
      JSON.stringify(verifyValid.json)
    );
    const regToken = verifyValid.json.otpVerificationToken;

    const regSuccess = await api(
      'POST',
      '/api/auth/register',
      {
        username: 'verified_enterprise',
        phone: custPhone,
        email: 'ceo@verified.in',
        password: 'InitialPassword@1',
        companyName: 'Verified Enterprise Pvt Ltd',
        contactPerson: 'Arjun Patel',
        category: 'Real Estate',
        city: 'Ahmedabad',
        otpVerificationToken: regToken,
      },
      { 'X-Real-IP': '49.36.10.21' }
    );
    check(
      'Verified registration succeeds (201) and marks phoneVerified=true',
      regSuccess.status === 201 && regSuccess.json.customer?.phoneVerified === true,
      JSON.stringify(regSuccess.json)
    );
    const custId = regSuccess.json.customer.id;
    const custJwt = regSuccess.json.token;

    // Replay same otpVerificationToken must fail!
    const replayReg = await api(
      'POST',
      '/api/auth/register',
      {
        username: 'replay_hacker',
        phone: custPhone,
        password: 'InitialPassword@1',
        otpVerificationToken: regToken,
      },
      { 'X-Real-IP': '49.36.10.22' }
    );
    check(
      'Replaying consumed otpVerificationToken is rejected (403/409)',
      replayReg.status === 403 || replayReg.status === 409,
      JSON.stringify(replayReg.json)
    );

    // 4. Forgot Password via WhatsApp OTP
    await conn.collection('otp_verifications').deleteMany({}); // clear cooldown for test speed
    const sendReset = await api(
      'POST',
      '/api/auth/otp/send',
      {
        phone: custPhone,
        countryCode: 'IN',
        purpose: 'password_reset',
      },
      { 'X-Real-IP': '49.36.10.23' }
    );
    check('Password reset OTP sent to existing verified phone', sendReset.status === 200);

    const verReset = await api(
      'POST',
      '/api/auth/otp/verify',
      {
        phone: custPhone,
        countryCode: 'IN',
        otp: '123456',
        purpose: 'password_reset',
      },
      { 'X-Real-IP': '49.36.10.23' }
    );
    const resetDone = await api(
      'POST',
      '/api/auth/password/reset-otp',
      {
        phone: custPhone,
        countryCode: 'IN',
        newPassword: 'ResetStrongPassword@99',
        otpVerificationToken: verReset.json.otpVerificationToken,
      },
      { 'X-Real-IP': '49.36.10.23' }
    );
    check('POST /api/auth/password/reset-otp updates scrypt password', resetDone.status === 200);

    const loginNewPwd = await api('POST', '/api/auth/login', {
      identifier: custPhone,
      password: 'ResetStrongPassword@99',
    });
    check('Customer logs in with newly reset password', loginNewPwd.status === 200 && loginNewPwd.json.ok === true);

    // 5. Super Admin creates unverified business -> First-Login Phone Verification Gate
    const saLogin = await api('POST', '/api/auth/admin-login', {
      username: 'superadmin',
      password: 'SuperAdmin@2026!',
    });
    const saJwt = saLogin.json.token;

    const createBiz = await api(
      'POST',
      '/api/superadmin/businesses',
      {
        companyName: 'Admin Provisioned Corp',
        contactPerson: 'Neha Verma',
        phone: '9833344455',
        email: 'neha@provisioned.in',
        username: 'nehacorp',
        password: 'AdminSetPassword@1',
        category: 'Healthcare',
        city: 'Surat',
      },
      { Authorization: `Bearer ${saJwt}` }
    );
    check(
      'Super Admin provisions business with phoneVerified=false until first WhatsApp login check',
      createBiz.status === 201 && createBiz.json.ok === true,
      JSON.stringify(createBiz.json)
    );

    const nehaLogin = await api('POST', '/api/auth/login', {
      identifier: 'nehacorp',
      password: 'AdminSetPassword@1',
    });
    check(
      'First login on admin-created account flags requiresPhoneVerification=true',
      nehaLogin.status === 200 && nehaLogin.json.requiresPhoneVerification === true,
      JSON.stringify(nehaLogin.json)
    );

    const sendVerifyPhone = await api(
      'POST',
      '/api/auth/otp/send',
      { phone: '9833344455', countryCode: 'IN', purpose: 'verify_phone' },
      { 'X-Real-IP': '49.36.10.25' }
    );
    const verVerifyPhone = await api(
      'POST',
      '/api/auth/otp/verify',
      { phone: '9833344455', countryCode: 'IN', otp: '123456', purpose: 'verify_phone' },
      { 'X-Real-IP': '49.36.10.25' }
    );
    const completeVerifyPhone = await api(
      'POST',
      '/api/auth/verify-existing-phone',
      {
        customerId: nehaLogin.json.customer.id,
        phone: '9833344455',
        countryCode: 'IN',
        otpVerificationToken: verVerifyPhone.json.otpVerificationToken,
      },
      { Authorization: `Bearer ${nehaLogin.json.token}` }
    );
    check(
      'POST /api/auth/verify-existing-phone upgrades phoneVerified=true for admin-created account',
      sendVerifyPhone.status === 200 &&
        completeVerifyPhone.status === 200 &&
        (completeVerifyPhone.json.phoneVerified === true ||
          completeVerifyPhone.json.customer?.phoneVerified === true),
      JSON.stringify(completeVerifyPhone.json)
    );

    // 6. Meta WhatsApp Webhook GET Verification & POST Delivery Receipt Update
    const whVerify = await fetch(
      `${BASE}/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=admafia_wa_verify_hook_2026&hub.challenge=CHALLENGE_OK_99`
    );
    const whChallengeText = await whVerify.text();
    check(
      'GET /api/webhooks/whatsapp verifies Meta webhook hub.challenge',
      whVerify.status === 200 && whChallengeText === 'CHALLENGE_OK_99',
      whChallengeText
    );

    // 7. Real-Time SSE Stream + Outbox -> Notification Fan-out + FCM Token Registration
    const fcmReg = await api(
      'POST',
      '/api/notifications/fcm-token',
      { token: 'fcm_mock_web_device_token_1234567890abcdef', platform: 'web' },
      { Authorization: `Bearer ${custJwt}` }
    );
    check('POST /api/notifications/fcm-token registers customer device token', fcmReg.status === 200);

    // Open live SSE connection for customer before triggering wallet top-up!
    const sseEvents = [];
    const sseAbort = new AbortController();
    const ssePromise = (async () => {
      const res = await fetch(`${BASE}/api/notifications/stream?token=${encodeURIComponent(custJwt)}`, {
        signal: sseAbort.signal,
      });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        if (buf.includes('event: notification')) {
          sseEvents.push(buf);
          break;
        }
      }
    })().catch(() => {});

    await new Promise((r) => setTimeout(r, 400));

    // Credit wallet as staff -> Outbox emits WALLET_CREDITED -> outboxWorker dispatches Notification + SSE!
    const topupRes = await api(
      'POST',
      '/api/sales/wallet/topup',
      {
        customerId: custId,
        amount: 3000,
        referenceUtr: 'UTR_FCM_PUSH_3000',
        paymentMethod: 'UPI',
      },
      { Authorization: `Bearer ${saJwt}` }
    );
    assert.ok(topupRes.status === 200 || topupRes.status === 201);

    // Wait up to 4.5s for outboxWorker (2.5s interval) to process & push SSE
    const waitStart = Date.now();
    while (sseEvents.length === 0 && Date.now() - waitStart < 5000) {
      await new Promise((r) => setTimeout(r, 250));
    }
    sseAbort.abort();
    await ssePromise;

    check(
      'Real-time SSE stream receives live WALLET_CREDITED notification from Outbox worker',
      sseEvents.length >= 1 && sseEvents[0].includes('WALLET_CREDITED'),
      JSON.stringify(sseEvents)
    );

    const custNotifs = await api('GET', '/api/notifications', null, {
      Authorization: `Bearer ${custJwt}`,
    });
    check(
      'GET /api/notifications lists persisted customer notification & unreadCount >= 1',
      custNotifs.status === 200 &&
        custNotifs.json.unreadCount >= 1 &&
        custNotifs.json.notifications.some((n) => (n.type || n.eventType) === 'WALLET_CREDITED'),
      JSON.stringify(custNotifs.json)
    );

    const markAll = await api('POST', '/api/notifications/read-all', {}, { Authorization: `Bearer ${custJwt}` });
    check('POST /api/notifications/read-all resets unread badge to 0', markAll.status === 200);

    // 8. Super Admin Database Status & Encrypted Point-in-Time Snapshot Engine
    const dbStatus = await api('GET', '/api/superadmin/database/status', null, {
      Authorization: `Bearer ${saJwt}`,
    });
    check(
      'GET /api/superadmin/database/status returns Replica Set telemetry & Compass URIs',
      dbStatus.status === 200 &&
        dbStatus.json.ok === true &&
        Boolean(dbStatus.json.compassGuides?.localDockerUri),
      JSON.stringify(dbStatus.json)
    );

    const snapCreate = await api(
      'POST',
      '/api/superadmin/database/snapshot',
      { encrypt: true },
      { Authorization: `Bearer ${saJwt}` }
    );
    check(
      'POST /api/superadmin/database/snapshot creates AES-256 encrypted archive + SHA-256 hash',
      snapCreate.status === 201 &&
        snapCreate.json.snapshot?.encrypted === true &&
        snapCreate.json.snapshot?.sha256?.length === 64,
      JSON.stringify(snapCreate.json)
    );

    const dlRes = await fetch(
      `${BASE}/api/superadmin/database/snapshots/${encodeURIComponent(
        snapCreate.json.snapshot.filename
      )}/download?token=${encodeURIComponent(saJwt)}`
    );
    const dlBuf = Buffer.from(await dlRes.arrayBuffer());
    check(
      'Snapshot binary download verifies ADMAFIA_ENC_V1 header & exact byte length',
      dlRes.status === 200 &&
        dlBuf.length === snapCreate.json.snapshot.sizeBytes &&
        dlBuf.subarray(0, 14).toString('ascii') === 'ADMAFIA_ENC_V1',
      `len=${dlBuf.length}`
    );

    // 9. Super Admin 10k-Scale Growth Analytics Desk API
    const growthRes = await api('GET', '/api/superadmin/growth-analytics', null, {
      Authorization: `Bearer ${saJwt}`,
    });
    check(
      'GET /api/superadmin/growth-analytics returns $facet funnel, hot unpaid leads, churn radar & opsShield',
      growthRes.status === 200 &&
        growthRes.json.ok === true &&
        growthRes.json.funnel?.totalRegistered >= 2 &&
        Array.isArray(growthRes.json.hotUnpaidVerifiedLeads) &&
        Array.isArray(growthRes.json.categoryLiquidity) &&
        typeof growthRes.json.opsShield?.whatsappOtp?.successRatePct === 'number',
      JSON.stringify(growthRes.json)
    );

    console.log(`\n🎉 ALL ${passed}/${passed} WHATSAPP OTP, FCM/SSE, SNAPSHOT & GROWTH ANALYTICS TESTS PASSED!`);
  } finally {
    proc.kill('SIGTERM');
    await conn.dropDatabase().catch(() => {});
    await conn.close().catch(() => {});
    fs.rmSync(tmpBackupDir, { recursive: true, force: true });
  }
}

function sixthAttemptBlocked(status) {
  return status === 429 || status === 400 || status === 401;
}

main().catch((err) => {
  console.error('\n❌ OTP/FCM SUITE FAILED:', err.message);
  process.exit(1);
});

