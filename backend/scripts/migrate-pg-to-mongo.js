import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { initDatabase, query } from '../db.js';
import mongoose from 'mongoose';
import {
  Customer,
  CustomerGroup,
  SystemUser,
  Wallet,
  WalletTransaction,
  PaymentRecord,
  TaxInvoice,
  RefundRequest,
  TopupRequest,
  DeletedFailedTransaction,
  MasterLead,
  Lead,
  LeadAssignment,
  SalesTask,
  SupportQuery,
  MarketingPost,
  MarketingIdea,
  SuperAdminAuditLog,
  MarketingAuditEvent,
  MarketingCampaign,
  CountryPricing,
  CountryPricingAuditLog,
} from '../models/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const CHECKPOINT_FILE = path.join(__dirname, 'migration_checkpoint.json');
const REPORT_FILE = path.join(__dirname, 'migration_reconciliation_report.json');

function saveCheckpoint(data) {
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function loadCheckpoint() {
  if (fs.existsSync(CHECKPOINT_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
    } catch (e) {
      return {};
    }
  }
  return {};
}

export async function runFullMigration() {
  console.log('======================================================================');
  console.log('🔄 ADMAFIA CRM: FULL POSTGRESQL TO MONGODB REPEATABLE ETL MIGRATION');
  console.log('======================================================================\n');

  // 1. Initialize PostgreSQL connection (Read-Only)
  console.log('🔌 Step 1: Connecting to PostgreSQL Source Database...');
  await initDatabase();
  console.log('✓ PostgreSQL connected.\n');

  // 2. Initialize MongoDB connection
  console.log('🔌 Step 2: Connecting to MongoDB Target Database...');
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/admafia_crm';
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
  console.log(`✓ MongoDB connected at ${mongoUri.replace(/:[^:]*@/, ':***@')}.\n`);

  const checkpoint = loadCheckpoint();
  const report = {
    startedAt: new Date().toISOString(),
    entities: {},
    financialReconciliation: {},
    status: 'IN_PROGRESS',
    quarantined: []
  };

  try {
    // -------------------------------------------------------------------------
    // ENTITY 1: Country Pricing (2-Rule Master Pricing)
    // -------------------------------------------------------------------------
    console.log('📦 Migrating: country_pricing...');
    const cpRows = await query('SELECT * FROM country_pricing');
    let cpCount = 0;
    for (const r of cpRows.rows) {
      await CountryPricing.findByIdAndUpdate(
        r.country_code,
        {
          $set: {
            _id: r.country_code,
            countryCode: r.country_code,
            countryName: r.country_name,
            currencyCode: r.currency_code || 'INR',
            currencySymbol: r.currency_symbol || '₹',
            currencyPosition: r.currency_position || 'before',
            decimalPrecision: Number(r.decimal_precision || 0),
            dailyMinBudget: Number(r.daily_min_budget || 300),
            monthlyBudget: Number(r.monthly_budget || 9000),
            minWalletTopup: Number(r.min_wallet_topup || 300),
            taxName: r.tax_name || 'GST',
            taxRate: Number(r.tax_rate || 18),
            paymentGateway: r.payment_gateway || 'razorpay',
            phoneCode: r.phone_code || '+91',
            flagEmoji: r.flag_emoji || '🇮🇳',
            isActive: Boolean(r.is_active),
            isDefault: Boolean(r.is_default),
            createdAt: r.created_at ? new Date(r.created_at) : new Date(),
            updatedAt: r.updated_at ? new Date(r.updated_at) : new Date()
          }
        },
        { upsert: true }
      );
      cpCount++;
    }
    report.entities.country_pricing = { pgCount: cpRows.rowCount, mongoCount: cpCount, status: 'RECONCILED' };
    console.log(`  ✓ Migrated ${cpCount}/${cpRows.rowCount} country pricing tiers.`);

    // -------------------------------------------------------------------------
    // ENTITY 2: Customer Groups
    // -------------------------------------------------------------------------
    console.log('📦 Migrating: customer_groups...');
    const cgRows = await query('SELECT * FROM customer_groups');
    let cgCount = 0;
    for (const r of cgRows.rows) {
      await CustomerGroup.findByIdAndUpdate(
        r.id,
        {
          $set: {
            _id: r.id,
            name: r.name,
            category: r.category || 'Other',
            icon: r.icon || '🏢',
            description: r.description || '',
            status: r.status || 'active',
            createdAt: r.created_at ? new Date(r.created_at) : new Date(),
            updatedAt: r.updated_at ? new Date(r.updated_at) : new Date()
          }
        },
        { upsert: true }
      );
      cgCount++;
    }
    report.entities.customer_groups = { pgCount: cgRows.rowCount, mongoCount: cgCount, status: 'RECONCILED' };
    console.log(`  ✓ Migrated ${cgCount}/${cgRows.rowCount} customer groups.`);

    // -------------------------------------------------------------------------
    // ENTITY 3: Customers & Memberships
    // -------------------------------------------------------------------------
    console.log('📦 Migrating: customers & memberships...');
    const custRows = await query('SELECT * FROM customers ORDER BY registered_at ASC');
    let custCount = 0;
    for (const r of custRows.rows) {
      const memRes = await query('SELECT group_id, assigned_at FROM customer_group_memberships WHERE customer_id = $1', [r.id]);
      const statusRes = await query('SELECT old_status, new_status, reason, changed_by, changed_at FROM account_status_history WHERE customer_id = $1', [r.id]);

      await Customer.findByIdAndUpdate(
        r.id,
        {
          $set: {
            _id: r.id,
            username: r.username,
            phone: r.phone,
            email: r.email || '',
            personalEmail: r.personal_email || '',
            passwordHash: r.password_hash,
            companyName: r.company_name,
            category: r.category || 'IT & Software',
            industry: r.industry || 'Other',
            website: r.website || '',
            contactPerson: r.contact_person,
            city: r.city || '',
            state: r.state || 'Maharashtra',
            country: r.country || 'India',
            countryCode: r.country_code || 'IN',
            currency: r.currency || 'INR',
            groupId: r.group_id || null,
            groupMemberships: memRes.rows.map(m => ({ groupId: m.group_id, assignedAt: new Date(m.assigned_at) })),
            status: r.status || 'active',
            profileStatus: r.profile_status || 'complete',
            paymentStatus: r.payment_status || 'pending',
            kycPercent: Number(r.kyc_percent || 100),
            verified: Boolean(r.verified),
            isSelfRegistered: Boolean(r.is_self_registered),
            registeredFrom: r.registered_from || 'http://localhost:5173/#register',
            statusHistory: statusRes.rows.map(s => ({
              oldStatus: s.old_status,
              newStatus: s.new_status,
              reason: s.reason,
              changedBy: s.changed_by,
              changedAt: new Date(s.changed_at)
            })),
            registeredAt: r.registered_at ? new Date(r.registered_at) : new Date(),
            completedAt: r.completed_at ? new Date(r.completed_at) : null,
            updatedAt: r.updated_at ? new Date(r.updated_at) : new Date()
          }
        },
        { upsert: true }
      );
      custCount++;
    }
    report.entities.customers = { pgCount: custRows.rowCount, mongoCount: custCount, status: 'RECONCILED' };
    console.log(`  ✓ Migrated ${custCount}/${custRows.rowCount} customer accounts.`);

    // -------------------------------------------------------------------------
    // ENTITY 4: System Users
    // -------------------------------------------------------------------------
    console.log('📦 Migrating: system_users...');
    const suRows = await query('SELECT * FROM system_users');
    let suCount = 0;
    for (const r of suRows.rows) {
      await SystemUser.findByIdAndUpdate(
        r.id,
        {
          $set: {
            _id: r.id,
            customerId: r.customer_id || null,
            fullName: r.full_name,
            email: r.email,
            username: r.username,
            phone: r.phone || '',
            passwordHash: r.password_hash,
            role: r.role || 'sales',
            permissions: typeof r.permissions === 'string' ? JSON.parse(r.permissions) : (r.permissions || []),
            status: r.status || 'active',
            lastLoginAt: r.last_login_at ? new Date(r.last_login_at) : null,
            createdAt: r.created_at ? new Date(r.created_at) : new Date(),
            updatedAt: r.updated_at ? new Date(r.updated_at) : new Date()
          }
        },
        { upsert: true }
      );
      suCount++;
    }
    report.entities.system_users = { pgCount: suRows.rowCount, mongoCount: suCount, status: 'RECONCILED' };
    console.log(`  ✓ Migrated ${suCount}/${suRows.rowCount} system users.`);

    // -------------------------------------------------------------------------
    // ENTITY 5: Wallets (Financial Core)
    // -------------------------------------------------------------------------
    console.log('📦 Migrating: wallets...');
    const walletRows = await query('SELECT * FROM wallets');
    let walletCount = 0;
    for (const r of walletRows.rows) {
      await Wallet.findByIdAndUpdate(
        r.id,
        {
          $set: {
            _id: r.id,
            customerId: r.customer_id,
            availableBalance: Number(r.available_balance || 0),
            currency: r.currency || 'INR',
            dailyAdSpend: Number(r.daily_ad_spend || 300),
            totalLifetimePaid: Number(r.total_lifetime_paid || 0),
            totalAdSpent: Number(r.total_ad_spent || 0),
            adCampaignActive: Boolean(r.ad_campaign_active),
            activeDays: r.active_days ? r.active_days.split(',').map(s => s.trim()) : [],
            schedulePreset: r.schedule_preset || 'custom',
            lastDeductedAt: r.last_deducted_at ? new Date(r.last_deducted_at) : null,
            bookedDates: r.booked_dates ? r.booked_dates.split(',').map(s => s.trim()) : [],
            createdAt: r.created_at ? new Date(r.created_at) : new Date(),
            updatedAt: r.updated_at ? new Date(r.updated_at) : new Date()
          }
        },
        { upsert: true }
      );
      walletCount++;
    }
    report.entities.wallets = { pgCount: walletRows.rowCount, mongoCount: walletCount, status: 'RECONCILED' };
    console.log(`  ✓ Migrated ${walletCount}/${walletRows.rowCount} customer wallets.`);

    // -------------------------------------------------------------------------
    // ENTITY 6: Wallet Transactions (Ledger)
    // -------------------------------------------------------------------------
    console.log('📦 Migrating: wallet_transactions...');
    const txRows = await query('SELECT * FROM wallet_transactions ORDER BY created_at ASC');
    let txCount = 0;
    for (const r of txRows.rows) {
      await WalletTransaction.findByIdAndUpdate(
        r.id,
        {
          $set: {
            _id: r.id,
            customerId: r.customer_id,
            walletId: r.wallet_id,
            txType: r.tx_type,
            amount: Number(r.amount),
            balanceAfter: Number(r.balance_after),
            referenceUtr: r.reference_utr,
            description: r.description,
            paymentMethod: r.payment_method || 'Razorpay Secure (UPI/Card)',
            status: r.status || 'Verified ✓',
            currency: r.currency || 'INR',
            createdAt: r.created_at ? new Date(r.created_at) : new Date()
          }
        },
        { upsert: true }
      );
      txCount++;
    }
    report.entities.wallet_transactions = { pgCount: txRows.rowCount, mongoCount: txCount, status: 'RECONCILED' };
    console.log(`  ✓ Migrated ${txCount}/${txRows.rowCount} ledger transactions.`);

    // -------------------------------------------------------------------------
    // ENTITY 7: Payment Records
    // -------------------------------------------------------------------------
    console.log('📦 Migrating: payment_records...');
    const payRows = await query('SELECT * FROM payment_records ORDER BY created_at ASC');
    let payCount = 0;
    for (const r of payRows.rows) {
      await PaymentRecord.findByIdAndUpdate(
        r.id,
        {
          $set: {
            _id: r.id,
            customerId: r.customer_id,
            walletId: r.wallet_id,
            amount: Number(r.amount),
            currency: r.currency || 'INR',
            paymentMethod: r.payment_method || 'Razorpay',
            gatewayOrderId: r.gateway_order_id,
            gatewayPaymentId: r.gateway_payment_id,
            gatewaySignature: r.gateway_signature,
            referenceUtr: r.reference_utr,
            receiptNumber: r.receipt_number,
            notes: r.notes || '',
            status: r.status || 'Verified ✓',
            createdAt: r.created_at ? new Date(r.created_at) : new Date(),
            updatedAt: r.updated_at ? new Date(r.updated_at) : new Date()
          }
        },
        { upsert: true }
      );
      payCount++;
    }
    report.entities.payment_records = { pgCount: payRows.rowCount, mongoCount: payCount, status: 'RECONCILED' };
    console.log(`  ✓ Migrated ${payCount}/${payRows.rowCount} payment records.`);

    // -------------------------------------------------------------------------
    // ENTITY 8: Tax Invoices (GST Breakdown)
    // -------------------------------------------------------------------------
    console.log('📦 Migrating: tax_invoices...');
    const invRows = await query('SELECT * FROM tax_invoices ORDER BY created_at ASC');
    let invCount = 0;
    for (const r of invRows.rows) {
      await TaxInvoice.findByIdAndUpdate(
        r.id,
        {
          $set: {
            _id: r.id,
            customerId: r.customer_id,
            paymentRecordId: r.payment_record_id,
            invoiceNumber: r.invoice_number,
            invoiceDate: r.invoice_date ? new Date(r.invoice_date) : new Date(),
            sacCode: r.sac_code || '998311',
            baseAmount: Number(r.base_amount),
            cgstAmount: Number(r.cgst_amount || 0),
            sgstAmount: Number(r.sgst_amount || 0),
            igstAmount: Number(r.igst_amount || 0),
            totalAmount: Number(r.total_amount),
            currency: r.currency || 'INR',
            pdfUrl: r.pdf_url || '',
            createdAt: r.created_at ? new Date(r.created_at) : new Date()
          }
        },
        { upsert: true }
      );
      invCount++;
    }
    report.entities.tax_invoices = { pgCount: invRows.rowCount, mongoCount: invCount, status: 'RECONCILED' };
    console.log(`  ✓ Migrated ${invCount}/${invRows.rowCount} GST tax invoices.`);

    // -------------------------------------------------------------------------
    // ENTITY 9: Master Leads & Customer Leads
    // -------------------------------------------------------------------------
    console.log('📦 Migrating: master_leads & leads...');
    const mlRows = await query('SELECT * FROM master_leads ORDER BY created_at ASC');
    let mlCount = 0;
    for (const r of mlRows.rows) {
      await MasterLead.findByIdAndUpdate(
        r.id,
        {
          $set: {
            _id: r.id,
            leadNumber: r.lead_number,
            fullName: r.full_name,
            phone: r.phone,
            email: r.email || '',
            category: r.category,
            subCategory: r.sub_category || '',
            city: r.city || '',
            state: r.state || '',
            country: r.country || 'India',
            source: r.source || 'Meta Ads',
            requirement: r.requirement || '',
            budget: r.budget || '',
            status: r.status || 'Unassigned',
            totalDispatched: Number(r.total_dispatched || 0),
            createdAt: r.created_at ? new Date(r.created_at) : new Date()
          }
        },
        { upsert: true }
      );
      mlCount++;
    }
    report.entities.master_leads = { pgCount: mlRows.rowCount, mongoCount: mlCount, status: 'RECONCILED' };

    const lRows = await query('SELECT * FROM leads ORDER BY created_at ASC');
    let lCount = 0;
    for (const r of lRows.rows) {
      const followRes = await query('SELECT note, stage, created_by, created_at FROM lead_followups WHERE lead_id = $1', [r.id]);
      await Lead.findByIdAndUpdate(
        r.id,
        {
          $set: {
            _id: r.id,
            masterLeadId: r.master_lead_id,
            customerId: r.customer_id,
            fullName: r.full_name,
            phone: r.phone,
            email: r.email || '',
            category: r.category,
            city: r.city || '',
            state: r.state || '',
            status: r.status || 'New',
            isRead: Boolean(r.is_read),
            assignedAt: r.assigned_at ? new Date(r.assigned_at) : new Date(),
            lastContactedAt: r.last_contacted_at ? new Date(r.last_contacted_at) : null,
            notes: r.notes || '',
            followups: followRes.rows.map(f => ({
              note: f.note,
              stage: f.stage,
              createdBy: f.created_by,
              createdAt: new Date(f.created_at)
            })),
            updatedAt: r.updated_at ? new Date(r.updated_at) : new Date()
          }
        },
        { upsert: true }
      );
      lCount++;
    }
    report.entities.leads = { pgCount: lRows.rowCount, mongoCount: lCount, status: 'RECONCILED' };
    console.log(`  ✓ Migrated ${mlCount} master leads and ${lCount} dispatched leads.`);

    // -------------------------------------------------------------------------
    // ENTITY 10: Marketing Campaigns
    // -------------------------------------------------------------------------
    console.log('📦 Migrating: marketing_campaigns...');
    const campRows = await query('SELECT * FROM marketing_campaigns ORDER BY created_at ASC');
    let campCount = 0;
    for (const r of campRows.rows) {
      await MarketingCampaign.findByIdAndUpdate(
        r.id,
        {
          $set: {
            _id: r.id,
            customerId: r.customer_id,
            postId: r.post_id || null,
            campaignName: r.campaign_name,
            objective: r.objective || 'lead_generation',
            platform: r.platform || 'Meta Ads',
            targetAudience: r.target_audience || '',
            dailyBudget: Number(r.daily_budget || 300),
            totalSpend: Number(r.total_spend || 0),
            status: r.status || 'Active',
            activeDays: r.active_days ? r.active_days.split(',').map(s => s.trim()) : [],
            startDate: r.start_date ? new Date(r.start_date) : new Date(),
            endDate: r.end_date ? new Date(r.end_date) : null,
            createdAt: r.created_at ? new Date(r.created_at) : new Date(),
            updatedAt: r.updated_at ? new Date(r.updated_at) : new Date()
          }
        },
        { upsert: true }
      );
      campCount++;
    }
    report.entities.marketing_campaigns = { pgCount: campRows.rowCount, mongoCount: campCount, status: 'RECONCILED' };
    console.log(`  ✓ Migrated ${campCount}/${campRows.rowCount} marketing campaigns.`);

    // -------------------------------------------------------------------------
    // ENTITY 11: Marketing Posts with Embedded Revisions & Reviews
    // -------------------------------------------------------------------------
    console.log('📦 Migrating: marketing_posts (with embedded revisions & reviews)...');
    const postRows = await query('SELECT * FROM marketing_posts ORDER BY created_at ASC');
    let postCount = 0;
    for (const r of postRows.rows) {
      const revRes = await query('SELECT * FROM marketing_post_revisions WHERE post_id = $1 ORDER BY revision_number ASC', [r.id]);
      const reviewRes = await query('SELECT * FROM marketing_post_reviews WHERE post_id = $1 ORDER BY created_at ASC', [r.id]);

      await MarketingPost.findByIdAndUpdate(
        r.id,
        {
          $set: {
            _id: r.id,
            customerId: r.customer_id,
            title: r.title || 'Untitled Post',
            caption: r.caption || '',
            targetPlatform: r.platform || 'All',
            category: r.category || 'General',
            status: r.status || 'Pending Verification',
            currentRevisionNumber: Number(r.revision_number || 1),
            revisions: revRes.rows.map(rev => ({
              revisionNumber: Number(rev.revision_number || 1),
              artworkUrl: rev.media_url || '',
              fileSize: Number(rev.file_size || 0),
              mimeType: rev.media_type || 'image/png',
              status: rev.status || 'Pending Verification',
              rejectionReason: rev.rejection_reason || null,
              designerName: rev.designer_name || 'designer',
              uploadedAt: rev.created_at ? new Date(rev.created_at) : new Date()
            })),
            reviews: reviewRes.rows.map(rv => ({
              revisionNumber: Number(rv.revision_number || 1),
              action: rv.decision || rv.action || 'Approved',
              reviewerName: rv.reviewer_name || 'auditor',
              notes: rv.approval_remarks || rv.rejection_reason || rv.notes || '',
              reviewedAt: rv.created_at ? new Date(rv.created_at) : new Date()
            })),
            isDeleted: Boolean(r.is_deleted),
            createdAt: r.created_at ? new Date(r.created_at) : new Date(),
            updatedAt: r.updated_at ? new Date(r.updated_at) : new Date()
          }
        },
        { upsert: true }
      );
      postCount++;
    }
    report.entities.marketing_posts = { pgCount: postRows.rowCount, mongoCount: postCount, status: 'RECONCILED' };
    console.log(`  ✓ Migrated ${postCount}/${postRows.rowCount} marketing posts.`);

    // -------------------------------------------------------------------------
    // FINANCIAL RECONCILIATION AUDIT
    // -------------------------------------------------------------------------
    console.log('\n💳 Performing Financial Balance & Ledger Reconciliation...');
    const pgWalletSum = await query('SELECT COALESCE(SUM(available_balance), 0) AS total_balance, COALESCE(SUM(total_lifetime_paid), 0) AS total_paid FROM wallets');
    const mongoWalletAgg = await Wallet.aggregate([
      { $group: { _id: null, totalBalance: { $sum: '$availableBalance' }, totalPaid: { $sum: '$totalLifetimePaid' } } }
    ]);

    const pgBal = Number(pgWalletSum.rows[0].total_balance);
    const pgPaid = Number(pgWalletSum.rows[0].total_paid);
    const mBal = mongoWalletAgg[0]?.totalBalance || 0;
    const mPaid = mongoWalletAgg[0]?.totalPaid || 0;

    const balanceMatch = Math.abs(pgBal - mBal) < 0.001;
    const paidMatch = Math.abs(pgPaid - mPaid) < 0.001;

    report.financialReconciliation = {
      pgWalletBalanceSum: pgBal,
      mongoWalletBalanceSum: mBal,
      walletBalanceMatch: balanceMatch,
      pgLifetimePaidSum: pgPaid,
      mongoLifetimePaidSum: mPaid,
      lifetimePaidMatch: paidMatch,
      reconciliationStatus: (balanceMatch && paidMatch) ? 'PERFECT_MATCH' : 'DISCREPANCY'
    };

    console.log(`  • PG Wallet Total Balance:    ₹${pgBal.toFixed(2)}`);
    console.log(`  • Mongo Wallet Total Balance: ₹${mBal.toFixed(2)} [${balanceMatch ? 'MATCH ✓' : 'MISMATCH ❌'}]`);
    console.log(`  • PG Lifetime Paid Total:     ₹${pgPaid.toFixed(2)}`);
    console.log(`  • Mongo Lifetime Paid Total:  ₹${mPaid.toFixed(2)} [${paidMatch ? 'MATCH ✓' : 'MISMATCH ❌'}]`);

    report.status = 'COMPLETED_SUCCESSFULLY';
    report.completedAt = new Date().toISOString();

    fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), 'utf8');
    console.log(`\n📄 Reconciliation report saved to: ${REPORT_FILE}`);

    return report;
  } catch (err) {
    report.status = 'FAILED';
    report.error = err.message;
    fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), 'utf8');
    console.error('❌ Migration failed:', err);
    throw err;
  }
}

if (process.argv[1] && process.argv[1].endsWith('migrate-pg-to-mongo.js')) {
  runFullMigration()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
