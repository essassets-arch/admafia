import { initDatabase, query } from '../db.js';

async function resetPassword() {
  const identifier = process.argv[2] || '9503515149';
  const newPassword = process.argv[3] || 'Rajveer@2026$#';

  if (!identifier || !newPassword) {
    console.error('Usage: node scripts/reset-password.js <phone_or_username> <new_password>');
    process.exit(1);
  }

  await initDatabase();

  const cleanPhone = identifier.replace(/\D/g, '').slice(-10);

  const search = await query(`
    SELECT id, username, phone, email, company_name 
    FROM customers 
    WHERE phone = $1 OR LOWER(username) = LOWER($2) OR LOWER(email) = LOWER($2)
    LIMIT 1
  `, [cleanPhone, identifier]);

  if (search.rowCount === 0) {
    console.error(`[Error] Customer not found matching identifier: ${identifier}`);
    process.exit(1);
  }

  const cust = search.rows[0];

  await query(`
    UPDATE customers 
    SET password_hash = $1, updated_at = NOW() 
    WHERE id = $2
  `, [newPassword.trim(), cust.id]);

  console.log('======================================================================');
  console.log('✅ PASSWORD RESET SUCCESSFUL');
  console.log('======================================================================');
  console.log(`👤 Customer:    ${cust.company_name} (${cust.username})`);
  console.log(`📱 Phone:       +91 ${cust.phone}`);
  console.log(`✉️ Email:       ${cust.email || 'N/A'}`);
  console.log(`🔑 New Password: ${newPassword}`);
  console.log('🌐 Login URL:   https://admafia.marketing/login');
  console.log('======================================================================');

  process.exit(0);
}

resetPassword().catch(err => {
  console.error('[Fatal Error]:', err.message);
  process.exit(1);
});

