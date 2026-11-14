import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { initMongo } from '../mongo.js';
import {
  Customer,
  CustomerGroup,
  Wallet,
  WalletTransaction,
  PaymentRecord,
  TaxInvoice,
  PendingVerification,
  MarketingCampaign,
  MarketingPost,
  MarketingIdea,
  MarketingAuditEvent,
  Lead,
  LeadAssignment,
  SupportQuery,
  SalesTask,
  RefundRequest,
  TopupRequest,
  SuperAdminAuditLog,
} from '../models/index.js';
import { deleteCustomerCascade } from '../repositories/salesLedgerRepo.js';
import { ciExact } from '../repositories/tx.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Predefined test accounts from test runs & audit
const KNOWN_TEST_TARGETS = [
  { phone: '6359120081', username: 'ditya', name: 'Ditya' },
  { phone: '9714731623', username: 'Bhavana', name: 'Bhavana' },
  { phone: '7861801556', username: 'ankita', name: 'Registered Business (Ankita)' },
  { phone: '9724916167', username: 'harsh', name: 'Registered Business (Harsh)' },
];

async function listCustomers() {
  console.log('\n=== CURRENT REGISTERED CUSTOMERS IN MONGODB ===');
  const [customers, wallets] = await Promise.all([
    Customer.find({}).sort({ registeredAt: -1 }).lean(),
    Wallet.find({}).lean(),
  ]);

  if (customers.length === 0) {
    console.log('No customers found in the database.');
    return;
  }

  const walletByCust = new Map(wallets.map((w) => [w.customerId, w]));

  console.table(
    customers.map((c) => {
      const w = walletByCust.get(c._id);
      return {
        ID: c._id,
        Username: c.username,
        Phone: c.phone,
        Email: c.email,
        Company: c.companyName,
        Balance: `₹${Number(w?.availableBalance || 0).toLocaleString('en-IN')}`,
        Campaign: w?.adCampaignActive ? 'LIVE' : 'OFF',
        Registered: c.registeredAt ? new Date(c.registeredAt).toLocaleString('en-IN') : 'N/A',
      };
    })
  );
  console.log(`Total: ${customers.length} customer(s)\n`);
}

async function deleteCustomerByIdentifier(identifier) {
  const raw = String(identifier || '').trim();
  if (!raw) return { success: false, error: 'Empty identifier provided' };

  const cleanPhone = raw.replace(/\D/g, '').slice(-10);
  const orConditions = [{ _id: raw }, { username: ciExact(raw) }];
  if (cleanPhone) {
    orConditions.push({ phone: cleanPhone }, { _id: `cust_reg_${cleanPhone}` });
  }

  const custDoc = await Customer.findOne({ $or: orConditions }).lean();
  if (!custDoc) {
    return { success: false, notFound: true, identifier: raw };
  }

  const custId = custDoc._id;
  const custPhone = custDoc.phone;
  const cust = {
    id: custDoc._id,
    username: custDoc.username,
    phone: custDoc.phone,
    email: custDoc.email,
    company_name: custDoc.companyName,
    contact_person: custDoc.contactPerson,
  };

  // Collect counts of related entities for reporting prior to cascade deletion
  const [
    walletsCount,
    txCount,
    leadsCount,
    leadAssignCount,
    leadsWithFollowups,
    payCount,
    invCount,
    verCount,
    campCount,
    postCount,
    ideaCount,
    mktAuditCount,
    sqCount,
    taskCount,
    refCount,
    topupCount,
    grpCount,
  ] = await Promise.all([
    Wallet.countDocuments({ customerId: custId }),
    WalletTransaction.countDocuments({ customerId: custId }),
    Lead.countDocuments({ customerId: custId }),
    LeadAssignment.countDocuments({ customerId: custId }),
    Lead.find({ customerId: custId }, { followups: 1 }).lean(),
    PaymentRecord.countDocuments({ customerId: custId }),
    TaxInvoice.countDocuments({ customerId: custId }),
    PendingVerification.countDocuments({ customerId: custId }),
    MarketingCampaign.countDocuments({ customerId: custId }),
    MarketingPost.countDocuments({ customerId: custId }),
    MarketingIdea.countDocuments({ customerId: custId }),
    MarketingAuditEvent.countDocuments({ customerId: custId }),
    SupportQuery.countDocuments({ customerId: custId }),
    SalesTask.countDocuments({ customerId: custId }),
    RefundRequest.countDocuments({ customerId: custId }),
    TopupRequest.countDocuments({ customerId: custId }),
    CustomerGroup.countDocuments({ members: custId }),
  ]);

  const counts = {
    wallets: walletsCount,
    wallet_transactions: txCount,
    leads: leadsCount,
    lead_assignments: leadAssignCount,
    lead_followups: leadsWithFollowups.reduce((acc, l) => acc + (l.followups?.length || 0), 0),
    payment_records: payCount,
    tax_invoices: invCount,
    pending_verifications: verCount,
    marketing_campaigns: campCount,
    marketing_posts: postCount,
    marketing_ideas: ideaCount,
    marketing_audit_events: mktAuditCount,
    support_queries: sqCount,
    sales_tasks: taskCount,
    refund_requests: refCount,
    topup_requests: topupCount,
    account_status_history: custDoc.statusHistory?.length || 0,
    customer_group_memberships: Math.max(grpCount, custDoc.groupMemberships?.length || 0),
  };

  await deleteCustomerCascade(custId, custPhone);

  try {
    await SuperAdminAuditLog.create({
      _id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      actorId: 'cli_admin',
      actorName: 'Admin CLI',
      actorRole: 'Super Admin',
      actionType: 'CUSTOMER_DELETED',
      targetType: 'customer',
      targetId: custId,
      reason: 'Manual customer deletion via CLI script',
      details: { cust, deletedCounts: counts },
      createdAt: new Date(),
    });
  } catch {
    // Non-fatal
  }

  return {
    success: true,
    customer: cust,
    counts,
  };
}

async function main() {
  const args = process.argv.slice(2);

  await initMongo();

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
AdMafia Customer Data Deletion Utility (MongoDB)
================================================
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
    -> Shows all registered customers currently in MongoDB.
`);
    await mongoose.disconnect();
    process.exit(0);
  }

  if (args.includes('--list') || args.includes('-l')) {
    await listCustomers();
    await mongoose.disconnect();
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
    await mongoose.disconnect();
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
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('Fatal script error:', err);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
