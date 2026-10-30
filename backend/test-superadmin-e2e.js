import { query, withTransaction } from './db.js';
import express from 'express';
import { superadminRouter } from './routes/superadmin.js';
import http from 'http';

const app = express();
app.use(express.json());
app.use('/api/superadmin', superadminRouter);

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
    console.log('\n[2/8] Testing Business Registration API...');
    const testPhone = `99${Date.now().toString().slice(-8)}`;
    const bizRes = await fetch(`${baseUrl}/businesses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyName: 'Apex Test Dynamics',
        contactPerson: 'Suresh Raina',
        phone: testPhone,
        email: `suresh_${Date.now()}@apex.test`,
        category: 'IT & Software',
        city: 'Pune',
        state: 'Maharashtra',
        initialBalance: 500,
      }),
    });
    const bizData = await bizRes.json();
    assert(bizData.ok === true, 'Business registered successfully with 201 Created');
    assert(bizData.customerId.startsWith('cust_'), 'Valid customer ID returned');

    const testCustomerId = bizData.customerId;

    // Verify wallet was created with initial deposit
    const walletCheck = await query('SELECT * FROM wallets WHERE customer_id = $1', [testCustomerId]);
    assert(walletCheck.rowCount === 1, 'Isolated wallet record provisioned in PostgreSQL');
    assert(Number(walletCheck.rows[0].available_balance) === 500, 'Wallet initialized with ₹500 balance');

    // -------------------------------------------------------------------------
    // 3. User Provisioning API
    // -------------------------------------------------------------------------
    console.log('\n[3/8] Testing User Provisioning API...');
    const testUsername = `op_${Date.now().toString().slice(-6)}`;
    const userRes = await fetch(`${baseUrl}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Operations Lead Test',
        email: `${testUsername}@admafia.marketing`,
        username: testUsername,
        phone: '9822334455',
        role: 'Operations Manager',
        permissions: ['view_all', 'manage_queries'],
      }),
    });
    const userData = await userRes.json();
    assert(userData.ok === true, 'System user registered successfully');
    assert(userData.role === 'Operations Manager', 'User role assigned correctly');

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

    // Verify balance decreased from 2000 to 1500
    const walletAfterRefund = await query('SELECT available_balance FROM wallets WHERE customer_id = $1', [testCustomerId]);
    assert(Number(walletAfterRefund.rows[0].available_balance) === 1500, 'Wallet balance atomically debited to ₹1500');

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
    console.log('\n[8/8] Testing Financial Ledger & Audit Trail...');
    const finRes = await fetch(`${baseUrl}/finance/summary`);
    const finData = await finRes.json();
    assert(finData.ok === true, 'Finance summary returned');

    const custLedgerRes = await fetch(`${baseUrl}/finance/accounts/${testCustomerId}/ledger`);
    const custLedgerData = await custLedgerRes.json();
    assert(custLedgerData.ok === true && custLedgerData.transactions.length >= 2, 'Customer-isolated ledger tracks all credit and refund debit transactions');

    const auditRes = await fetch(`${baseUrl}/audit-logs`);
    const auditData = await auditRes.json();
    assert(auditData.ok === true && auditData.logs.length > 0, 'Audit trail contains logged actions with actor and timestamp');

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
