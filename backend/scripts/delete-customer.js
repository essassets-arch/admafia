import { initDatabase, query, withTransaction } from '../db.js';

// Predefined test accounts from test runs & audit
const KNOWN_TEST_TARGETS = [
  { phone: '6359120081', username: 'ditya', name: 'Ditya' },
  { phone: '9714731623', username: 'Bhavana', name: 'Bhavana' },
  { phone: '7861801556', username: 'ankita', name: 'Registered Business (Ankita)' },
  { phone: '9724916167', username: 'harsh', name: 'Registered Business (Harsh)' },
];

async function listCustomers() {
  console.log('\n=== CURRENT REGISTERED CUSTOMERS IN DATABASE ===');
  const res = await query(
    `SELECT c.id, c.username, c.phone, c.email, c.company_name, c.registered_at,
            COALESCE(w.available_balance, 0) AS balance,
            COALESCE(w.ad_campaign_active, false) AS campaign_active
     FROM customers c
     LEFT JOIN wallets w ON w.customer_id = c.id
     ORDER BY c.registered_at DESC`
  );

  if (res.rows.length === 0) {
    console.log('No customers found in the database.');
    return;
  }

  console.table(
    res.rows.map((r) => ({
      ID: r.id,
      Username: r.username,
      Phone: r.phone,
      Email: r.email,
      Company: r.company_name,
      Balance: `₹${Number(r.balance).toLocaleString('en-IN')}`,
      Campaign: r.campaign_active ? 'LIVE' : 'OFF',
      Registered: r.registered_at ? new Date(r.registered_at).toLocaleString('en-IN') : 'N/A',
    }))
  );
  console.log(`Total: ${res.rows.length} customer(s)\n`);
}

async function deleteCustomerByIdentifier(identifier) {
  const raw = String(identifier || '').trim();
  if (!raw) return { success: false, error: 'Empty identifier provided' };

  const cleanPhone = raw.replace(/\D/g, '').slice(-10);

  // 1. Locate the customer
  const custRes = await query(
    `SELECT id, username, phone, email, company_name, contact_person
     FROM customers
     WHERE id = $1 
        OR (phone = $2 AND $2 <> '')
        OR LOWER(username) = LOWER($1)
        OR id = 'cust_reg_' || $2
     LIMIT 1`,
    [raw, cleanPhone]
  );

  if (custRes.rowCount === 0) {
    return { success: false, notFound: true, identifier: raw };
  }

  const cust = custRes.rows[0];
  const custId = cust.id;
  const custPhone = cust.phone;

  // 2. Cascade delete in a safe transaction
  return await withTransaction(async (txQuery) => {
    // Collect counts of related entities for reporting
    const counts = {};

    const countQueries = [
      ['wallets', 'SELECT COUNT(*) FROM wallets WHERE customer_id = $1'],
      ['wallet_transactions', 'SELECT COUNT(*) FROM wallet_transactions WHERE customer_id = $1'],
      ['leads', 'SELECT COUNT(*) FROM leads WHERE customer_id = $1'],
      ['lead_assignments', 'SELECT COUNT(*) FROM lead_assignments WHERE customer_id = $1'],
      ['lead_followups', 'SELECT COUNT(*) FROM lead_followups WHERE customer_id = $1'],
      ['payment_records', 'SELECT COUNT(*) FROM payment_records WHERE customer_id = $1'],
      ['tax_invoices', 'SELECT COUNT(*) FROM tax_invoices WHERE customer_id = $1'],
      ['pending_verifications', 'SELECT COUNT(*) FROM pending_verifications WHERE customer_id = $1'],
      ['marketing_campaigns', 'SELECT COUNT(*) FROM marketing_campaigns WHERE customer_id = $1'],
      ['marketing_posts', 'SELECT COUNT(*) FROM marketing_posts WHERE customer_id = $1'],
      ['marketing_ideas', 'SELECT COUNT(*) FROM marketing_ideas WHERE customer_id = $1'],
      ['marketing_audit_events', 'SELECT COUNT(*) FROM marketing_audit_events WHERE customer_id = $1'],
      ['support_queries', 'SELECT COUNT(*) FROM support_queries WHERE customer_id = $1'],
      ['sales_tasks', 'SELECT COUNT(*) FROM sales_tasks WHERE customer_id = $1'],
      ['refund_requests', 'SELECT COUNT(*) FROM refund_requests WHERE customer_id = $1'],
      ['topup_requests', 'SELECT COUNT(*) FROM topup_requests WHERE customer_id = $1'],
      ['account_status_history', 'SELECT COUNT(*) FROM account_status_history WHERE customer_id = $1'],
      ['customer_group_memberships', 'SELECT COUNT(*) FROM customer_group_memberships WHERE customer_id = $1'],
    ];

    for (const [key, sql] of countQueries) {
      try {
        const res = await txQuery(sql, [custId]);
        counts[key] = parseInt(res.rows[0].count, 10) || 0;
      } catch (e) {
        counts[key] = 0;
      }
    }

    // Explicit cascading cleanup for tables with or without ON DELETE CASCADE
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

    // Also remove by phone if registered under cust_reg_<phone> in case of detached records
    if (custPhone) {
      const altId = `cust_reg_${custPhone}`;
      if (altId !== custId) {
        await txQuery(`DELETE FROM wallets WHERE customer_id = $1`, [altId]);
        await txQuery(`DELETE FROM customers WHERE id = $1`, [altId]);
      }
    }

    // Delete primary customer record
    await txQuery(`DELETE FROM customers WHERE id = $1`, [custId]);

    // Log admin audit
    try {
      await txQuery(
        `INSERT INTO superadmin_audit_logs (id, actor_id, actor_name, actor_role, action_type, target_type, target_id, reason, details)
         VALUES ($1, 'cli_admin', 'Admin CLI', 'Super Admin', 'CUSTOMER_DELETED', 'customer', $2, 'Manual customer deletion via CLI script', $3)`,
        [
          `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          custId,
          JSON.stringify({ cust, deletedCounts: counts }),
        ]
      );
    } catch (e) {
      // Non-fatal if audit table is absent
    }

    return {
      success: true,
      customer: cust,
      counts,
    };
  });
}

async function main() {
  const args = process.argv.slice(2);

  await initDatabase();

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
AdMafia Customer Data Deletion Utility
======================================
Usage:
  node backend/scripts/delete-customer.js <phone|username|customer_id>
  node backend/scripts/delete-customer.js --list
  node backend/scripts/delete-customer.js --test-accounts
  node backend/scripts/delete-customer.js 6359120081 9714731623 7861801556 9724916167

Examples:
  node backend/scripts/delete-customer.js 6359120081
    -> Deletes user @ditya (6359120081) and all associated data.

  node backend/scripts/delete-customer.js --test-accounts
    -> Deletes all 4 test accounts:
       - 6359120081 (@ditya)
       - 9714731623 (@Bhavana)
       - 7861801556 (@ankita)
       - 9724916167 (@harsh)

  node backend/scripts/delete-customer.js --list
    -> Shows all registered customers currently in the database.
`);
    process.exit(0);
  }

  if (args.includes('--list') || args.includes('-l')) {
    await listCustomers();
    process.exit(0);
  }

  let targets = [];

  if (args.includes('--test-accounts') || args.includes('--all-test')) {
    targets = KNOWN_TEST_TARGETS.map((t) => t.phone);
    console.log(`\n[Target] Purging all ${targets.length} test accounts: ${targets.join(', ')}`);
  } else {
    targets = args.filter((a) => !a.startsWith('-'));
  }

  if (targets.length === 0) {
    console.error('No target phone numbers or identifiers provided.');
    process.exit(1);
  }

  console.log(`\n============================================================`);
  console.log(`AdMafia Customer Deletion Process: ${targets.length} target(s)`);
  console.log(`============================================================\n`);

  let totalDeleted = 0;

  for (const target of targets) {
    console.log(`Processing target: "${target}"...`);
    try {
      const result = await deleteCustomerByIdentifier(target);
      if (result.notFound) {
        console.warn(`  ⚠️  Customer "${target}" not found in database (may already be deleted).`);
      } else if (result.success) {
        const c = result.customer;
        console.log(`  ✅ Successfully deleted customer:`);
        console.log(`     - ID:        ${c.id}`);
        console.log(`     - Username:  @${c.username}`);
        console.log(`     - Name:      ${c.company_name || c.contact_person || 'N/A'}`);
        console.log(`     - Phone:     ${c.phone}`);
        console.log(`     - Email:     ${c.email || 'None'}`);
        console.log(`     - Associated Records Removed:`);
        for (const [entity, count] of Object.entries(result.counts)) {
          if (count > 0) {
            console.log(`       * ${entity}: ${count}`);
          }
        }
        totalDeleted++;
      } else {
        console.error(`  ❌ Failed to delete "${target}":`, result.error);
      }
    } catch (err) {
      console.error(`  ❌ Error processing "${target}":`, err.message);
    }
    console.log('');
  }

  console.log(`\nSummary: Successfully deleted ${totalDeleted} / ${targets.length} target(s).\n`);

  await listCustomers();
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal script error:', err);
  process.exit(1);
});
