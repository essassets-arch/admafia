import { initDatabase, query, withTransaction } from '../db.js';

const TARGET_USERS = [
  { username: 'abc', phone: '7383198428', email: 'aviralshukla2612@gmail.com', name: 'Abc' },
  { username: 'xxx', phone: '1111111111', email: '', name: 'Xxx' },
];

export async function purgeSpecifiedTestUsers() {
  console.log('[Purge Script] Initializing database check...');
  try {
    await initDatabase();
  } catch (err) {
    console.warn('[Purge Script] DB init warning (may already be initialized):', err.message);
  }

  console.log('[Purge Script] Scanning for test users (@abc, @xxx)...');

  for (const target of TARGET_USERS) {
    const cleanPhone = String(target.phone || '').replace(/\D/g, '').slice(-10);

    const custFind = await query(
      `SELECT id, username, phone, email, company_name, contact_person
       FROM customers 
       WHERE LOWER(username) = LOWER($1)
          OR (phone = $2 AND $2 <> '')
          OR id = 'cust_reg_' || $2
          OR ($3 <> '' AND LOWER(email) = LOWER($3))
          OR LOWER(company_name) = LOWER($4)`,
      [target.username, cleanPhone, target.email, target.name]
    ).catch((err) => {
      console.warn(`[Purge Script] Lookup error for ${target.username}:`, err.message);
      return { rows: [] };
    });

    if (!custFind.rows || custFind.rows.length === 0) {
      console.log(`[Purge Script] User @${target.username} (${cleanPhone}) already absent from database.`);
    } else {
      for (const cust of custFind.rows) {
        const custId = cust.id;
        const custPhone = cust.phone;
        console.log(`[Purge Script] 🗑️ Permanently deleting customer record: @${cust.username} (ID: ${custId}, Phone: ${custPhone})`);

        await withTransaction(async (tx) => {
          await tx(`DELETE FROM marketing_audit_events WHERE customer_id = $1`, [custId]);
          await tx(`DELETE FROM marketing_campaigns WHERE customer_id = $1`, [custId]);
          await tx(`DELETE FROM marketing_posts WHERE customer_id = $1`, [custId]);
          await tx(`DELETE FROM marketing_ideas WHERE customer_id = $1`, [custId]);
          await tx(`DELETE FROM pending_verifications WHERE customer_id = $1 OR phone = $2`, [custId, custPhone]);
          await tx(`DELETE FROM wallet_transactions WHERE customer_id = $1 OR customer_id = $2`, [custId, `cust_reg_${custPhone}`]);
          await tx(`DELETE FROM payment_records WHERE customer_id = $1 OR customer_phone = $2`, [custId, custPhone]);
          await tx(`DELETE FROM tax_invoices WHERE customer_id = $1`, [custId]);
          await tx(`DELETE FROM lead_followups WHERE customer_id = $1`, [custId]);
          await tx(`DELETE FROM lead_assignments WHERE customer_id = $1`, [custId]);
          await tx(`DELETE FROM leads WHERE customer_id = $1 OR customer_phone = $2`, [custId, custPhone]);
          await tx(`DELETE FROM support_query_messages WHERE query_id IN (SELECT id FROM support_queries WHERE customer_id = $1)`, [custId]);
          await tx(`DELETE FROM support_queries WHERE customer_id = $1`, [custId]);
          await tx(`DELETE FROM sales_tasks WHERE customer_id = $1`, [custId]);
          await tx(`DELETE FROM refund_requests WHERE customer_id = $1`, [custId]);
          await tx(`DELETE FROM topup_requests WHERE customer_id = $1`, [custId]);
          await tx(`DELETE FROM account_status_history WHERE customer_id = $1`, [custId]);
          await tx(`DELETE FROM customer_group_memberships WHERE customer_id = $1`, [custId]);
          await tx(`DELETE FROM wallets WHERE customer_id = $1 OR customer_id = $2`, [custId, `cust_reg_${custPhone}`]);

          if (custPhone) {
            const altId = `cust_reg_${custPhone}`;
            if (altId !== custId) {
              await tx(`DELETE FROM wallets WHERE customer_id = $1`, [altId]);
              await tx(`DELETE FROM customers WHERE id = $1`, [altId]);
            }
          }

          await tx(`DELETE FROM customers WHERE id = $1`, [custId]);

          try {
            await tx(
              `INSERT INTO superadmin_audit_logs (id, actor_id, actor_name, actor_role, action_type, target_type, target_id, reason, details)
               VALUES ($1, 'system_purge', 'System Purge Script', 'Super Admin', 'CUSTOMER_DELETED', 'customer', $2, 'Purged test user account', $3)`,
              [
                `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                custId,
                JSON.stringify(cust),
              ]
            );
          } catch (_) {}
        });

        console.log(`[Purge Script] ✅ Successfully purged @${cust.username} and all cascaded data.`);
      }
    }
  }

  // Also clean up any orphan records by phone or username across all tables
  const orphanPhones = ['7383198428', '1111111111'];
  const orphanCustIds = ['cust_reg_7383198428', 'cust_reg_1111111111'];

  await query(`DELETE FROM payment_records WHERE customer_phone = ANY($1::text[])`, [orphanPhones]).catch(() => {});
  await query(`DELETE FROM pending_verifications WHERE phone = ANY($1::text[])`, [orphanPhones]).catch(() => {});
  await query(`DELETE FROM leads WHERE customer_phone = ANY($1::text[])`, [orphanPhones]).catch(() => {});
  await query(`DELETE FROM wallet_transactions WHERE customer_id = ANY($1::text[])`, [orphanCustIds]).catch(() => {});
  await query(`DELETE FROM wallets WHERE customer_id = ANY($1::text[])`, [orphanCustIds]).catch(() => {});
  await query(`DELETE FROM topup_requests WHERE customer_id = ANY($1::text[])`, [orphanCustIds]).catch(() => {});
  await query(`DELETE FROM customers WHERE phone = ANY($1::text[]) OR LOWER(username) IN ('abc', 'xxx')`, [orphanPhones]).catch(() => {});

  console.log('[Purge Script] Purge complete.');
}

// Execute directly if run as main
if (process.argv[1]?.endsWith('purge-test-users.js')) {
  purgeSpecifiedTestUsers()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Purge Script] Failed:', err);
      process.exit(1);
    });
}
