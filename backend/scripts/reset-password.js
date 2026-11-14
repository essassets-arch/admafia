import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { initMongo } from '../mongo.js';
import { Customer } from '../models/index.js';
import { ciExact } from '../repositories/tx.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function resetPassword() {
  const identifier = process.argv[2] || '9503515149';
  const newPassword = process.argv[3] || 'Rajveer@2026$#';

  if (!identifier || !newPassword) {
    console.error('Usage: node scripts/reset-password.js <phone_or_username> <new_password>');
    process.exit(1);
  }

  await initMongo();

  const cleanPhone = identifier.replace(/\D/g, '').slice(-10);
  const orConditions = [{ username: ciExact(identifier) }, { email: ciExact(identifier) }];
  if (cleanPhone) {
    orConditions.unshift({ phone: cleanPhone });
  }

  const cust = await Customer.findOne({ $or: orConditions }).lean();

  if (!cust) {
    console.error(`[Error] Customer not found matching identifier: ${identifier}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  await Customer.updateOne(
    { _id: cust._id },
    { $set: { passwordHash: newPassword.trim(), updatedAt: new Date() } }
  );

  console.log('======================================================================');
  console.log('✅ PASSWORD RESET SUCCESSFUL');
  console.log('======================================================================');
  console.log(`👤 Customer:     ${cust.companyName} (${cust.username})`);
  console.log(`📱 Phone:        +91 ${cust.phone}`);
  console.log(`✉️ Email:        ${cust.email || 'N/A'}`);
  console.log(`🔑 New Password: ${newPassword}`);
  console.log('🌐 Login URL:    https://admafia.marketing/login');
  console.log('======================================================================');

  await mongoose.disconnect();
  process.exit(0);
}

resetPassword().catch(async (err) => {
  console.error('[Fatal Error]:', err.message);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
