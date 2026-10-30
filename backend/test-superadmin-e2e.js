import { query, withTransaction } from './db.js';
import express from 'express';
import { superadminRouter } from './routes/superadmin.js';
import http from 'http';

const app = express();
app.use(express.json());
app.use('/api/superadmin', superadminRouter);

// Mount /api/auth/login in test harness to verify Customer Dashboard login authentication
app.post('/api/auth/login', async (req, res) => {
  try {
    const { identifier, username, password } = req.body || {};
    const q = String(identifier || username || '').trim().toLowerCase();
    if (!q) {
      return res.status(400).json({ ok: false, error: 'Username, mobile number, or email is required.' });
    }

    const cleanPhone = q.replace(/\D/g, '').slice(-10);

    // 1. Check customers table
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
      // 2. Check system_users table
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
          error: 'No registered account found with these credentials.',
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
        role: uRow.role,
      };

      if (uRow.customer_id) {
        targetCustomerId = uRow.customer_id;
      }
    }

    if (password && expectedPasswordHash && expectedPasswordHash !== password) {
      return res.status(401).json({ ok: false, error: 'Incorrect password for this account.' });
    }

    if (accountStatus === 'suspended' || accountStatus === 'blocked') {
      return res.status(403).json({ ok: false, error: 'Workspace suspended.' });
    }

    const custRes = await query('SELECT id, company_name, phone, email, username FROM customers WHERE id = $1', [targetCustomerId]);
    res.json({
      ok: true,
      customer: custRes.rows[0] || { id: targetCustomerId },
      user: authUser || null,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

async function runSuperAdminE2ETests() {
  console.log('===============================================================');
  console.log('🧪 RUNNING SUPER ADMIN CONTROL CENTER END-TO-END TESTS');
  console.log('===============================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/superadmin`;

  try {
    // -------------------------------------------------------------------------
    // 1. Dashboard Summary
    // -------------------------------------------------------------------------
    console.log('\n[1/8] Testing Dashboard Summary API...');
    const sumRes = await fetch(`${baseUrl}/dashboard/summary`);
    const sumData = await sumRes.json();
    assert(sumData.ok === true, 'Dashboard summary endpoint responds with ok: true');
    assert(typeof sumData.summary.totalBusinesses === 'number', 'Summary contains totalBusinesses');
    assert(typeof sumData.summary.totalWalletLiability === 'number', 'Summary contains totalWalletLiability calculated from wallets');
    assert(Array.isArray(sumData.recentTransactions), 'Summary returns recent transactions list');
    assert(Array.isArray(sumData.recentAuditActions), 'Summary returns recent audit actions list');

    // -------------------------------------------------------------------------
    // 2. Business Registration API
    // -------------------------------------------------------------------------
    console.log('\n[2/9] Testing Business Registration API...');
    const testPhone = `99${Date.now().toString().slice(-8)}`;
    const testEmail = `suresh_${Date.now()}@apex.test`;
    const bizRes = await fetch(`${baseUrl}/businesses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyName: 'Apex Test Dynamics',
        contactPerson: 'Suresh Raina',
        phone: testPhone,
        email: testEmail,
        password: 'BizPassword@123!',
        category: 'IT & Software',
        city: 'Pune',
        state: 'Maharashtra',
        initialBalance: 500,
      }),
    });
    const bizData = await bizRes.json();
    assert(bizData.ok === true, 'Business registered successfully with 201 Created');
    assert(bizData.customerId.startsWith('cust_'), 'Valid customer ID returned');
    assert(bizData.password === 'BizPassword@123!', 'Created business contains portal password');

    const testCustomerId = bizData.customerId;
    const testBizUsername = bizData.username;

    // Verify wallet was created with initial deposit
    const walletCheck = await query('SELECT * FROM wallets WHERE customer_id = $1', [testCustomerId]);
    assert(walletCheck.rowCount === 1, 'Isolated wallet record provisioned in PostgreSQL');
    assert(Number(walletCheck.rows[0].available_balance) === 500, 'Wallet initialized with ₹500 balance');

    // -------------------------------------------------------------------------
    // 3. User Provisioning API
    // -------------------------------------------------------------------------
    console.log('\n[3/9] Testing User Provisioning API...');
    const testUsername = `op_${Date.now().toString().slice(-6)}`;
    const userRes = await fetch(`${baseUrl}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Operations Lead Test',
        email: `${testUsername}@admafia.marketing`,
        username: testUsername,
        phone: '9822334455',
        password: 'UserPassword@123!',
        role: 'Business Manager',
        customerId: testCustomerId,
        permissions: ['view_all', 'manage_queries'],
      }),
    });
    const userData = await userRes.json();
    assert(userData.ok === true, 'System user registered successfully');
    assert(userData.role === 'Business Manager', 'User role assigned correctly');
    assert(userData.password === 'UserPassword@123!', 'User created with portal login password');

    // -------------------------------------------------------------------------
    // 4. Check Queries Lifecycle API
    // -------------------------------------------------------------------------
    console.log('\n[4/8] Testing Queries Management Lifecycle API...');
    // Create query
    const createQueryRes = await fetch(`${baseUrl}/queries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId: testCustomerId,
        subject: 'Campaign Optimization Inquiry',
        category: 'Campaign Assistance',
        priority: 'High',
        message: 'Need help optimizing Meta audience demographics.',
      }),
    });
    const queryData = await createQueryRes.json();
    assert(queryData.ok === true, 'Support query created with status Open');
    const testQueryId = queryData.queryId;

    // Post Admin Reply
    const replyRes = await fetch(`${baseUrl}/queries/${testQueryId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Audience location updated to Pune Tier 1 demographics.',
        isInternal: false,
        status: 'In Progress',
        adminName: 'Super Admin',
      }),
    });
    const replyData = await replyRes.json();
    assert(replyData.ok === true, 'Admin reply recorded in conversation thread');

    // Update status to Resolved
    const statusRes = await fetch(`${baseUrl}/queries/${testQueryId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'Resolved',
        internalNotes: 'Client confirmed demographic targeting is working properly.',
        adminName: 'Super Admin',
      }),
    });
    const statusData = await statusRes.json();
    assert(statusData.ok === true, 'Query status transitioned to Resolved');

    // -------------------------------------------------------------------------
    // 5. Account Top-Up & Atomic Wallet Credit
    // -------------------------------------------------------------------------
    console.log('\n[5/8] Testing Top-Up Request & Atomic Ledger Credit...');
    const testUtr = `UTR_${Date.now()}`;
    const topupReqRes = await fetch(`${baseUrl}/topups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId: testCustomerId,
        amount: 1500,
        referenceUtr: testUtr,
        paymentMode: 'IMPS',
      }),
    });
    const topupReqData = await topupReqRes.json();
    assert(topupReqData.ok === true, 'Top-up request submitted with Pending status');
    const testTopupId = topupReqData.topupId;

    // Approve Top-Up
    const approveTopupRes = await fetch(`${baseUrl}/topups/${testTopupId}/approve`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adminName: 'Super Admin',
        reviewNotes: 'Verified against bank current account statement',
      }),
    });
    const approveTopupData = await approveTopupRes.json();
    assert(approveTopupData.ok === true, 'Top-up approved atomically');

    // Verify balance increased from 500 to 2000
    const walletAfterTopup = await query('SELECT available_balance FROM wallets WHERE customer_id = $1', [testCustomerId]);
    assert(Number(walletAfterTopup.rows[0].available_balance) === 2000, 'Wallet balance atomically updated to ₹2000');

    // Test direct Super Admin customer top-up (manual-credit)
    const directTopupUtr = `DIR_UTR_${Date.now()}`;
    const directTopupRes = await fetch(`${baseUrl}/topups/manual-credit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId: testCustomerId,
        amount: 1500,
        referenceUtr: directTopupUtr,
        paymentMode: 'IMPS/NEFT Direct',
        description: 'Super Admin direct top-up test',
        adminName: 'Super Admin Master',
      }),
    });
    const directTopupData = await directTopupRes.json();
    assert(directTopupRes.status === 200 && directTopupData.ok === true, 'Direct customer top-up succeeds with 200 OK');
    assert(Number(directTopupData.newBalance) === 3500, 'Direct customer top-up updates balance from ₹2000 to ₹3500');

    // Verify customer portal reflects new balance and transaction
    const custView = await query('SELECT * FROM vw_sales_customer_accounts WHERE id = $1', [testCustomerId]);
    assert(Number(custView.rows[0].wallet_balance) === 3500, 'Customer portal view reflects live ₹3500 balance');
    assert(custView.rows[0].payment_status === 'paid', 'Customer payment status marked paid');

    const custTx = await query('SELECT * FROM wallet_transactions WHERE customer_id = $1 AND reference_utr = $2', [testCustomerId, directTopupUtr]);
    assert(custTx.rowCount === 1 && custTx.rows[0].status === 'Verified ✓', 'Transaction recorded with Verified ✓ in customer ledger');

    const paymentRec = await query('SELECT * FROM payment_records WHERE customer_id = $1 AND utr_reference = $2', [testCustomerId, directTopupUtr]);
    assert(paymentRec.rowCount === 1 && paymentRec.rows[0].status === 'paid', 'Payment receipt created for customer accounting');

    // Test duplicate UTR rejection
    const dupUtrRes = await fetch(`${baseUrl}/topups/manual-credit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId: testCustomerId,
        amount: 500,
        referenceUtr: testUtr, // duplicate!
        description: 'Testing duplicate rejection',
      }),
    });
    assert(dupUtrRes.status === 409, 'Duplicate UTR deposit strictly blocked with HTTP 409 Conflict');

    // -------------------------------------------------------------------------
    // 6. Check Refunds & Atomic Wallet Deduction
    // -------------------------------------------------------------------------
    console.log('\n[6/8] Testing Refund Queue & Atomic Wallet Deduction...');
    
    // Test paid customers list for refunds
    const paidCustRes = await fetch(`${baseUrl}/refunds/paid-customers`);
    const paidCustData = await paidCustRes.json();
    assert(paidCustData.ok === true, 'Paid customers endpoint responds with ok: true');
    assert(Array.isArray(paidCustData.paidCustomers), 'Paid customers array returned');
    assert(typeof paidCustData.summary.totalPaidCustomers === 'number', 'Summary contains totalPaidCustomers');
    assert(typeof paidCustData.summary.totalRefundableBalance === 'number', 'Summary contains totalRefundableBalance');

    const refundReqRes = await fetch(`${baseUrl}/refunds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId: testCustomerId,
        amount: 500,
        reason: 'Client requested surplus budget withdrawal',
        originalTxRef: testUtr,
      }),
    });
    const refundReqData = await refundReqRes.json();
    assert(refundReqData.ok === true, 'Refund request logged with Pending status');
    const testRefundId = refundReqData.refundId;

    // Approve Refund
    const approveRefundRes = await fetch(`${baseUrl}/refunds/${testRefundId}/review`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'Approved',
        reviewNotes: 'Processed via IMPS bank reversal',
        providerRef: `REV_${Date.now()}`,
        adminName: 'Super Admin',
      }),
    });
    const approveRefundData = await approveRefundRes.json();
    assert(approveRefundData.ok === true, 'Refund approved and wallet debited');

    // Concurrency Safeguard: Attempting to re-approve the already processed refund must return 409 Conflict
    const reApproveRes = await fetch(`${baseUrl}/refunds/${testRefundId}/review`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Approved', adminName: 'Second Admin' }),
    });
    assert(reApproveRes.status === 409, 'Concurrent / duplicate refund approval strictly blocked with HTTP 409 Conflict');

    // Verify balance decreased from 3500 to 3000 (after 500 refund)
    const walletAfterRefund = await query('SELECT available_balance FROM wallets WHERE customer_id = $1', [testCustomerId]);
    assert(Number(walletAfterRefund.rows[0].available_balance) === 3000, 'Wallet balance atomically debited to ₹3000');

    // Test Refund Reconciliation Ledger
    const reconRes = await fetch(`${baseUrl}/refunds/reconciliation`);
    const reconData = await reconRes.json();
    assert(reconData.ok === true, 'Refund reconciliation ledger returned');
    assert(Array.isArray(reconData.records), 'Reconciliation trace records returned');
    assert(typeof reconData.summary.total_customer_deposits !== 'undefined', 'Reconciliation global financial summary calculated');

    // Test Reconciliation CSV Export
    const reconExportRes = await fetch(`${baseUrl}/refunds/reconciliation/export`);
    assert(reconExportRes.status === 200, 'Refund reconciliation CSV export responds 200 OK');
    assert(reconExportRes.headers.get('content-type')?.includes('text/csv'), 'Reconciliation export returns text/csv');

    // -------------------------------------------------------------------------
    // 7. Account Block / Activate & Governance
    // -------------------------------------------------------------------------
    console.log('\n[7/8] Testing Account Block / Activate Governance...');
    // Missing reason should be rejected
    const noReasonRes = await fetch(`${baseUrl}/accounts/${testCustomerId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountType: 'business',
        status: 'suspended',
        reason: '',
      }),
    });
    assert(noReasonRes.status === 400, 'Status change without mandatory reason rejected with HTTP 400');

    // Suspend with valid reason
    const suspendRes = await fetch(`${baseUrl}/accounts/${testCustomerId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountType: 'business',
        status: 'suspended',
        reason: 'Temporary policy verification audit required',
        adminName: 'Super Admin',
      }),
    });
    const suspendData = await suspendRes.json();
    assert(suspendData.ok === true, 'Account suspended with reason logged in history');

    // Verify status in customers table
    const custStatusCheck = await query('SELECT status FROM customers WHERE id = $1', [testCustomerId]);
    assert(custStatusCheck.rows[0].status === 'suspended', 'Customer status set to suspended');

    // Verify history audit record
    const historyRes = await fetch(`${baseUrl}/accounts/${testCustomerId}/history`);
    const historyData = await historyRes.json();
    assert(historyData.ok === true && historyData.history.length > 0, 'Account status history trail preserved');

    // Reactivate
    const reactivateRes = await fetch(`${baseUrl}/accounts/${testCustomerId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountType: 'business',
        status: 'active',
        reason: 'Verification completed and approved',
        adminName: 'Super Admin',
      }),
    });
    const reactivateData = await reactivateRes.json();
    assert(reactivateData.ok === true, 'Account successfully reactivated');

    // -------------------------------------------------------------------------
    // 8. Finance Ledger & Audit Trail
    // -------------------------------------------------------------------------
    console.log('\n[8/9] Testing Financial Ledger & Audit Trail...');
    const finRes = await fetch(`${baseUrl}/finance/summary`);
    const finData = await finRes.json();
    assert(finData.ok === true, 'Finance summary returned');

    const custLedgerRes = await fetch(`${baseUrl}/finance/accounts/${testCustomerId}/ledger`);
    const custLedgerData = await custLedgerRes.json();
    assert(custLedgerData.ok === true && custLedgerData.transactions.length >= 2, 'Customer-isolated ledger tracks all credit and refund debit transactions');

    const auditRes = await fetch(`${baseUrl}/audit-logs`);
    const auditData = await auditRes.json();
    assert(auditData.ok === true && auditData.logs.length > 0, 'Audit trail contains logged actions with actor and timestamp');

    // -------------------------------------------------------------------------
    // 9. Customer Dashboard Login Authentication & Password Governance
    // -------------------------------------------------------------------------
    console.log('\n[9/9] Testing Customer Dashboard Login & Password Governance...');
    const authUrl = `http://127.0.0.1:${port}/api/auth/login`;

    // A. Business Login by 10-digit mobile number + password
    const loginByPhone = await fetch(authUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: testPhone, password: 'BizPassword@123!' }),
    });
    const loginByPhoneData = await loginByPhone.json();
    assert(loginByPhone.status === 200 && loginByPhoneData.ok === true, 'Business logs into Customer Dashboard by 10-digit mobile');
    assert(loginByPhoneData.customer.id === testCustomerId, 'Customer Dashboard loads authoritative workspace');

    // B. Business Login by email + password
    const loginByEmail = await fetch(authUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: testEmail, password: 'BizPassword@123!' }),
    });
    const loginByEmailData = await loginByEmail.json();
    assert(loginByEmail.status === 200 && loginByEmailData.ok === true, 'Business logs into Customer Dashboard by email');

    // C. Business Login by username + password
    const loginByUsername = await fetch(authUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: testBizUsername, password: 'BizPassword@123!' }),
    });
    const loginByUsernameData = await loginByUsername.json();
    assert(loginByUsername.status === 200 && loginByUsernameData.ok === true, 'Business logs into Customer Dashboard by username');

    // D. Bad password rejected with HTTP 401
    const badPasswordRes = await fetch(authUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: testPhone, password: 'WrongPassword999!' }),
    });
    assert(badPasswordRes.status === 401, 'Invalid password strictly rejected with HTTP 401');

    // E. Scoped System User login by username + password
    const userLoginRes = await fetch(authUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: testUsername, password: 'UserPassword@123!' }),
    });
    const userLoginData = await userLoginRes.json();
    assert(userLoginRes.status === 200 && userLoginData.ok === true, 'Scoped system user logs into Customer Dashboard');
    assert(userLoginData.customer.id === testCustomerId, 'User login loads scoped customer workspace');
    assert(userLoginData.user.username === testUsername, 'Authenticated user context attached');

    // F. Reset Account Password via Super Admin API
    const resetAccountRes = await fetch(`${baseUrl}/accounts/${testCustomerId}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword: 'NewBizPassword@999!' }),
    });
    const resetAccountData = await resetAccountRes.json();
    assert(resetAccountRes.status === 200 && resetAccountData.ok === true, 'Super Admin successfully resets customer password');

    // Verify old password fails
    const oldPwdFail = await fetch(authUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: testPhone, password: 'BizPassword@123!' }),
    });
    assert(oldPwdFail.status === 401, 'Old customer password no longer accepted');

    // Verify new password succeeds
    const newPwdSuccess = await fetch(authUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: testPhone, password: 'NewBizPassword@999!' }),
    });
    assert(newPwdSuccess.status === 200, 'New customer password logs into dashboard successfully');

    // G. Reset User Password via Super Admin API
    const userRow = await query('SELECT id FROM system_users WHERE username = $1', [testUsername]);
    const resetUserRes = await fetch(`${baseUrl}/users/${userRow.rows[0].id}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword: 'NewUserPassword@999!' }),
    });
    const resetUserData = await resetUserRes.json();
    assert(resetUserRes.status === 200 && resetUserData.ok === true, 'Super Admin successfully resets user password');

    // Clean up test customer and user to keep database clean
    await query('DELETE FROM support_query_messages WHERE query_id = $1', [testQueryId]);
    await query('DELETE FROM support_queries WHERE id = $1', [testQueryId]);
    await query('DELETE FROM refund_requests WHERE id = $1', [testRefundId]);
    await query('DELETE FROM topup_requests WHERE id = $1', [testTopupId]);
    await query('DELETE FROM wallet_transactions WHERE customer_id = $1', [testCustomerId]);
    await query('DELETE FROM wallets WHERE customer_id = $1', [testCustomerId]);
    await query('DELETE FROM account_status_history WHERE customer_id = $1', [testCustomerId]);
    await query('DELETE FROM customers WHERE id = $1', [testCustomerId]);
    await query('DELETE FROM system_users WHERE username = $1', [testUsername]);

    console.log('\n===============================================================');
    console.log(`🎯 SUPER ADMIN TEST SUMMARY: ${passed} PASSED | ${failed} FAILED`);
    console.log('===============================================================');

    server.close();
    if (failed > 0) process.exit(1);
    process.exit(0);
  } catch (err) {
    console.error('Fatal Test Execution Error:', err);
    server.close();
    process.exit(1);
  }
}

runSuperAdminE2ETests();
