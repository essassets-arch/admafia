import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import cp from 'child_process';
import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const { Pool, Client } = pg;

let activePool = null;
let pgliteInstance = null;
let dbMode = 'uninitialized'; // 'postgres-server' | 'pglite-postgres'

export const VW_SALES_CUSTOMER_ACCOUNTS_SQL = `
DROP VIEW IF EXISTS vw_sales_customer_accounts CASCADE;
CREATE OR REPLACE VIEW vw_sales_customer_accounts AS
SELECT
    c.id,
    c.username,
    c.company_name AS name,
    c.company_name,
    c.contact_person AS contact,
    c.contact_person,
    c.phone,
    c.email,
    c.personal_email,
    c.category,
    c.industry,
    c.website,
    c.city,
    c.state,
    c.country,
    COALESCE(c.country_code, 'IN') AS country_code,
    COALESCE(w.currency, c.currency, 'INR') AS currency,
    c.status,
    c.profile_status,
    c.payment_status,
    c.kyc_percent,
    c.verified,
    c.registered_from,
    c.registered_at,
    c.completed_at,
    COALESCE(w.available_balance, 0) AS balance,
    COALESCE(w.available_balance, 0) AS wallet_balance,
    COALESCE(w.daily_ad_spend, 300) AS daily_pacing,
    COALESCE(w.total_lifetime_paid, 0) AS amount_paid,
    COALESCE(w.total_ad_spent, 0) AS total_ad_spent,
    COALESCE(w.ad_campaign_active, FALSE) AS ad_campaign_active,
    COALESCE(w.active_days, '') AS active_days,
    COALESCE(w.schedule_preset, 'custom') AS schedule_preset,
    w.last_deducted_at,
    COALESCE(w.booked_dates, '') AS booked_dates,
    FLOOR(COALESCE(w.available_balance, 0) / GREATEST(COALESCE(w.daily_ad_spend, 300), 1))::INT AS runway_days,
    (SELECT COUNT(*) FROM leads l WHERE l.customer_id = c.id) AS total_leads_dispatched
FROM customers c
LEFT JOIN wallets w ON w.customer_id = c.id
ORDER BY c.registered_at DESC;
`;

/**
 * Ensures the target PostgreSQL database exists on the external server,
 * or falls back cleanly to persistent disk-backed PGlite PostgreSQL.
 */
export async function initDatabase() {
  if (dbMode !== 'uninitialized') {
    return { mode: dbMode };
  }

  const host = process.env.PGHOST || 'localhost';
  const port = Number(process.env.PGPORT || 5432);
  const user = process.env.PGUSER || 'postgres';
  const password = process.env.PGPASSWORD || 'postgres';
  const database = process.env.PGDATABASE || 'admafia_crm';

  const isDockerOrDedicatedPg = Boolean(
    process.env.PGHOST &&
    process.env.PGHOST !== 'localhost' &&
    process.env.PGHOST !== '127.0.0.1'
  );

  const maxRetries = isDockerOrDedicatedPg ? 15 : 2;
  const retryDelayMs = 2000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // 1. Try connecting directly to the specified database (e.g. admafia_crm)
      const pool = new Pool({
        host,
        port,
        user,
        password,
        database,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 3000,
      });

      await pool.query('SELECT 1');
      activePool = pool;
      dbMode = 'postgres-server';
      console.log(`[PostgreSQL] Connected directly to PostgreSQL server at ${host}:${port}/${database} (attempt ${attempt})`);
      break;
    } catch (connErr) {
      // If host is 'db' but cannot be resolved via DNS (e.g. running on host outside Docker network), try 127.0.0.1
      if ((connErr.code === 'EAI_AGAIN' || connErr.code === 'ENOTFOUND') && host === 'db') {
        try {
          console.log(`[PostgreSQL] Hostname "db" cannot be resolved (running on host outside Docker). Attempting 127.0.0.1:${port}...`);
          const hostPool = new Pool({
            host: '127.0.0.1',
            port,
            user,
            password,
            database,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 3000,
          });
          await hostPool.query('SELECT 1');
          activePool = hostPool;
          dbMode = 'postgres-server';
          console.log(`[PostgreSQL] Connected directly to PostgreSQL server at 127.0.0.1:${port}/${database}`);
          break;
        } catch (hostErr) {
          // Continue with standard retry logic
        }
      }

      // If database does not exist (error 3D000) and we are in local dev, attempt creation via default DB
      if (connErr.code === '3D000' && !isDockerOrDedicatedPg) {
        try {
          console.log(`[PostgreSQL] Database "${database}" not found. Creating via admin client...`);
          const adminClient = new Client({
            host,
            port,
            user,
            password,
            database: 'postgres',
            connectionTimeoutMillis: 3000,
          });
          await adminClient.connect();
          await adminClient.query(`CREATE DATABASE "${database}"`);
          await adminClient.end();
          console.log(`[PostgreSQL] Database "${database}" created successfully.`);

          activePool = new Pool({ host, port, user, password, database, max: 20, idleTimeoutMillis: 30000 });
          await activePool.query('SELECT 1');
          dbMode = 'postgres-server';
          break;
        } catch (adminErr) {
          console.warn('[PostgreSQL] Could not create database via admin client:', adminErr.message);
        }
      }

      if (attempt < maxRetries) {
        console.warn(`[PostgreSQL] Connection attempt ${attempt}/${maxRetries} to ${host}:${port}/${database} failed (${connErr.message}). Retrying in ${retryDelayMs / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      } else {
        if (isDockerOrDedicatedPg) {
          console.error(`[PostgreSQL FATAL] Could not connect to PostgreSQL server at ${host}:${port}/${database} after ${maxRetries} attempts.`);
          throw connErr;
        } else {
          console.warn(`[PostgreSQL] Local PostgreSQL server at ${host}:${port}/${database} unavailable (${connErr.message}). Falling back to embedded PGlite...`);
        }
      }
    }
  }

  // Fallback to PGlite only for local dev when external PG is not available
  if (dbMode !== 'postgres-server') {
    const dataDir = path.join(__dirname, 'pgdata');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    } else {
      try {
        const files = fs.readdirSync(dataDir);
        for (const file of files) {
          if (file === 'postmaster.pid' || file.startsWith('.s.PGSQL') || file.includes('lock')) {
            try { fs.unlinkSync(path.join(dataDir, file)); } catch (e) {}
          }
        }
      } catch (e) {}
    }
    try {
      pgliteInstance = new PGlite(dataDir);
      await pgliteInstance.waitReady;
    } catch (pgInitErr) {
      console.warn('[PostgreSQL] PGlite failed to resume from existing data directory, auto-recovering:', pgInitErr.message);
      try {
        if (process.platform === 'win32') {
          cp.execSync(`powershell -Command "Remove-Item -Path '${dataDir}' -Recurse -Force"`, { stdio: 'ignore' });
        } else {
          fs.rmSync(dataDir, { recursive: true, force: true });
        }
      } catch (rmErr) {}
      pgliteInstance = new PGlite(dataDir);
      await pgliteInstance.waitReady;
    }
    dbMode = 'pglite-postgres';
    console.log(`[PostgreSQL] Initialized persistent PostgreSQL database at ${dataDir}`);
  }

  const safeExec = async (sql) => {
    try {
      if (dbMode === 'postgres-server') {
        await activePool.query(sql);
      } else {
        await pgliteInstance.exec(sql);
      }
    } catch (e) {
      // Ignored if column already exists or relation doesn't exist yet
    }
  };

  // Pre-upgrade existing tables if present before schema indexes run
  await safeExec(`DROP VIEW IF EXISTS vw_sales_customer_accounts CASCADE`);
  await safeExec(`ALTER TABLE customer_groups ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'Other'`);
  await safeExec(`ALTER TABLE customer_groups ADD COLUMN IF NOT EXISTS status VARCHAR(24) DEFAULT 'active'`);
  await safeExec(`ALTER TABLE customer_groups ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`);
  await safeExec(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS master_lead_id VARCHAR(64)`);
  await safeExec(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'IT & Software'`);
  await safeExec(`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS active_days VARCHAR(120) DEFAULT ''`);
  await safeExec(`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS schedule_preset VARCHAR(64) DEFAULT 'custom'`);
  await safeExec(`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS ad_campaign_active BOOLEAN DEFAULT FALSE`);
  await safeExec(`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS booked_dates TEXT DEFAULT ''`);
  await safeExec(`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS last_deducted_at TIMESTAMPTZ`);
  await safeExec(`ALTER TABLE marketing_posts ADD COLUMN IF NOT EXISTS creative_format VARCHAR(64) DEFAULT 'Instagram / Facebook Post'`);
  await safeExec(`ALTER TABLE marketing_posts ADD COLUMN IF NOT EXISTS designer_notes TEXT DEFAULT ''`);
  await safeExec(`ALTER TABLE marketing_posts ADD COLUMN IF NOT EXISTS designer_name VARCHAR(140) DEFAULT 'Graphics Designer'`);
  await safeExec(`ALTER TABLE marketing_posts ADD COLUMN IF NOT EXISTS creative_instructions TEXT DEFAULT ''`);
  await safeExec(`ALTER TABLE marketing_posts ADD COLUMN IF NOT EXISTS priority VARCHAR(40) DEFAULT 'Normal'`);
  await safeExec(`ALTER TABLE marketing_posts ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE`);
  await safeExec(`ALTER TABLE marketing_posts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`);
  await safeExec(`ALTER TABLE marketing_posts ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(140)`);
  await safeExec(`ALTER TABLE marketing_post_reviews ADD COLUMN IF NOT EXISTS revision_number INT NOT NULL DEFAULT 1`);
  await safeExec(`ALTER TABLE marketing_post_revisions ADD COLUMN IF NOT EXISTS correction_instructions TEXT DEFAULT ''`);
  await safeExec(`ALTER TABLE support_queries ADD COLUMN IF NOT EXISTS contact_name VARCHAR(140)`);
  await safeExec(`ALTER TABLE support_queries ADD COLUMN IF NOT EXISTS contact_email VARCHAR(160)`);
  await safeExec(`ALTER TABLE support_queries ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(32)`);
  await safeExec(`ALTER TABLE support_queries ADD COLUMN IF NOT EXISTS assigned_admin VARCHAR(140)`);
  await safeExec(`ALTER TABLE support_queries ADD COLUMN IF NOT EXISTS internal_notes TEXT`);
  await safeExec(`ALTER TABLE support_queries ADD COLUMN IF NOT EXISTS last_replied_at TIMESTAMPTZ`);
  await safeExec(`ALTER TABLE support_queries ADD COLUMN IF NOT EXISTS last_replied_by VARCHAR(140)`);

  await safeExec(`
    CREATE TABLE IF NOT EXISTS deleted_failed_transactions (
      id VARCHAR(64) PRIMARY KEY,
      original_id VARCHAR(64),
      customer_id VARCHAR(64),
      customer_name VARCHAR(180),
      company_name VARCHAR(180),
      contact_person VARCHAR(140),
      phone VARCHAR(30),
      email VARCHAR(180),
      city VARCHAR(100),
      state VARCHAR(100),
      category VARCHAR(100),
      amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
      reference_utr VARCHAR(120),
      description TEXT,
      payment_method VARCHAR(100),
      failure_reason TEXT,
      original_created_at TIMESTAMPTZ,
      deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_by VARCHAR(100) DEFAULT 'Sales Admin'
    )
  `);
  await safeExec(`CREATE INDEX IF NOT EXISTS idx_del_failed_tx_deleted_at ON deleted_failed_transactions(deleted_at DESC)`);

  // Run schema.sql migration
  const schemaPath = path.join(__dirname, 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    const rawSql = fs.readFileSync(schemaPath, 'utf8');
    // Remove pgcrypto extension if not needed so both standard PG and PGlite execute cleanly
    const cleanSql = rawSql.replace(/CREATE EXTENSION IF NOT EXISTS "pgcrypto";/gi, '');
    await safeExec(cleanSql);
  }

  const kolkataDow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })).getDay();
  const kolkataToday = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][kolkataDow];

  // Post-migration auto-completes and updates
  await safeExec(`
    UPDATE customers SET profile_status = 'complete', kyc_percent = 100, verified = TRUE WHERE profile_status = 'incomplete';
    UPDATE pending_verifications SET profile_status = 'complete', queue_type = CASE WHEN payment_status IN ('paid', 'verified') THEN 'Completed' ELSE 'Payment Pending' END;
    UPDATE wallets SET active_days = '${kolkataToday}' WHERE active_days = 'MON,TUE,WED,THU,FRI' OR active_days IS NULL OR active_days = '';
    UPDATE customers SET 
      contact_person = CASE WHEN contact_person = 'Registered Business' OR contact_person IS NULL OR contact_person = '' THEN INITCAP(username) ELSE contact_person END,
      company_name = CASE WHEN company_name = 'Registered Business' OR company_name IS NULL OR company_name = '' THEN INITCAP(username) || ' Enterprises' ELSE company_name END
    WHERE company_name = 'Registered Business' OR contact_person = 'Registered Business';
    ALTER TABLE customer_groups ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'Other';
    ALTER TABLE customer_groups ADD COLUMN IF NOT EXISTS status VARCHAR(24) DEFAULT 'active';
    ALTER TABLE customer_groups ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS master_lead_id VARCHAR(64);
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'IT & Software';

    CREATE TABLE IF NOT EXISTS marketing_ideas (
      id VARCHAR(64) PRIMARY KEY,
      customer_id VARCHAR(64) NOT NULL,
      title VARCHAR(255) NOT NULL,
      objective VARCHAR(100) NOT NULL DEFAULT 'Lead Generation',
      concept TEXT NOT NULL,
      target_audience TEXT DEFAULT '',
      caption_suggestions TEXT DEFAULT '',
      call_to_action VARCHAR(255) DEFAULT '',
      hashtags TEXT DEFAULT '',
      creative_brief TEXT DEFAULT '',
      platform VARCHAR(64) NOT NULL DEFAULT 'Meta Ads (Facebook & Instagram)',
      language VARCHAR(64) NOT NULL DEFAULT 'English / Hinglish',
      campaign_period VARCHAR(100) DEFAULT '',
      constraints TEXT DEFAULT '',
      status VARCHAR(32) NOT NULL DEFAULT 'Saved',
      created_by VARCHAR(140) NOT NULL DEFAULT 'Marketing Executive',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_marketing_ideas_customer ON marketing_ideas(customer_id, status);

    CREATE TABLE IF NOT EXISTS marketing_posts (
      id VARCHAR(64) PRIMARY KEY,
      customer_id VARCHAR(64) NOT NULL,
      idea_id VARCHAR(64),
      title VARCHAR(255) NOT NULL,
      platform VARCHAR(64) NOT NULL DEFAULT 'Meta Ads (Facebook & Instagram)',
      caption TEXT NOT NULL,
      hashtags TEXT DEFAULT '',
      call_to_action VARCHAR(255) DEFAULT '',
      media_url TEXT DEFAULT '',
      media_type VARCHAR(64) DEFAULT 'image',
      language VARCHAR(64) NOT NULL DEFAULT 'English / Hinglish',
      campaign_association VARCHAR(255) DEFAULT '',
      intended_publish_at TIMESTAMPTZ,
      status VARCHAR(40) NOT NULL DEFAULT 'Draft',
      submitted_by VARCHAR(140),
      submitted_at TIMESTAMPTZ,
      revision_number INT NOT NULL DEFAULT 1,
      creative_format VARCHAR(64) DEFAULT 'Instagram / Facebook Post',
      designer_notes TEXT DEFAULT '',
      designer_name VARCHAR(140) DEFAULT 'Graphics Designer',
      creative_instructions TEXT DEFAULT '',
      priority VARCHAR(40) DEFAULT 'Normal',
      is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
      deleted_at TIMESTAMPTZ,
      deleted_by VARCHAR(140),
      created_by VARCHAR(140) NOT NULL DEFAULT 'Marketing Content Team',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_marketing_posts_customer ON marketing_posts(customer_id, status);

    CREATE TABLE IF NOT EXISTS marketing_post_revisions (
      id VARCHAR(64) PRIMARY KEY,
      post_id VARCHAR(64) NOT NULL,
      revision_number INT NOT NULL DEFAULT 1,
      media_url TEXT NOT NULL,
      media_type VARCHAR(64) DEFAULT 'image',
      creative_format VARCHAR(64) DEFAULT 'Instagram / Facebook Post',
      designer_notes TEXT DEFAULT '',
      uploaded_by VARCHAR(140) NOT NULL DEFAULT 'Graphics Designer',
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      review_status VARCHAR(40) DEFAULT 'Pending Verification',
      reviewer_name VARCHAR(140),
      review_remarks TEXT DEFAULT '',
      rejection_reason TEXT DEFAULT '',
      correction_instructions TEXT DEFAULT '',
      reviewed_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS marketing_post_reviews (
      id VARCHAR(64) PRIMARY KEY,
      post_id VARCHAR(64) NOT NULL,
      revision_number INT NOT NULL DEFAULT 1,
      reviewer_name VARCHAR(140) NOT NULL,
      reviewer_role VARCHAR(100) NOT NULL DEFAULT 'Marketing Reviewer',
      decision VARCHAR(40) NOT NULL,
      remarks TEXT DEFAULT '',
      rejection_reason TEXT DEFAULT '',
      correction_instructions TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS marketing_campaigns (
      id VARCHAR(64) PRIMARY KEY,
      customer_id VARCHAR(64) NOT NULL,
      name VARCHAR(255) NOT NULL,
      objective VARCHAR(100) NOT NULL,
      post_id VARCHAR(64),
      platform VARCHAR(64) NOT NULL DEFAULT 'Meta Ads (Facebook & Instagram)',
      target_audience TEXT DEFAULT '',
      start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      end_date TIMESTAMPTZ,
      daily_budget NUMERIC(10, 2) NOT NULL DEFAULT 300.00,
      total_budget NUMERIC(12, 2) DEFAULT 0.00,
      schedule_settings TEXT DEFAULT '{}',
      status VARCHAR(40) NOT NULL DEFAULT 'Draft',
      external_platform_status VARCHAR(64) NOT NULL DEFAULT 'Not Connected',
      external_campaign_id VARCHAR(120),
      created_by VARCHAR(140) NOT NULL DEFAULT 'Marketing Manager',
      last_action VARCHAR(100) DEFAULT 'Created',
      last_actor VARCHAR(140) DEFAULT 'Marketing Manager',
      last_action_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS marketing_audit_events (
      id VARCHAR(64) PRIMARY KEY,
      customer_id VARCHAR(64),
      entity_type VARCHAR(64) NOT NULL,
      entity_id VARCHAR(64) NOT NULL,
      action VARCHAR(100) NOT NULL,
      actor VARCHAR(140) NOT NULL,
      details TEXT DEFAULT '{}',
      ip_address VARCHAR(64) DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE marketing_ideas DROP CONSTRAINT IF EXISTS marketing_ideas_objective_check;
    ALTER TABLE marketing_ideas DROP CONSTRAINT IF EXISTS marketing_ideas_status_check;
    ALTER TABLE marketing_posts DROP CONSTRAINT IF EXISTS marketing_posts_status_check;
    ALTER TABLE marketing_campaigns DROP CONSTRAINT IF EXISTS marketing_campaigns_status_check;
    ALTER TABLE marketing_campaigns DROP CONSTRAINT IF EXISTS marketing_campaigns_daily_budget_check;

    ALTER TABLE marketing_posts ADD COLUMN IF NOT EXISTS creative_format VARCHAR(64) DEFAULT 'Instagram / Facebook Post';
    ALTER TABLE marketing_posts ADD COLUMN IF NOT EXISTS designer_notes TEXT DEFAULT '';
    ALTER TABLE marketing_posts ADD COLUMN IF NOT EXISTS designer_name VARCHAR(140) DEFAULT 'Graphics Designer';
    ALTER TABLE marketing_posts ADD COLUMN IF NOT EXISTS creative_instructions TEXT DEFAULT '';
    ALTER TABLE marketing_posts ADD COLUMN IF NOT EXISTS priority VARCHAR(40) DEFAULT 'Normal';
    ALTER TABLE marketing_posts ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE marketing_posts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    ALTER TABLE marketing_posts ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(140);
    ALTER TABLE marketing_post_reviews ADD COLUMN IF NOT EXISTS revision_number INT NOT NULL DEFAULT 1;
    ALTER TABLE marketing_post_revisions ADD COLUMN IF NOT EXISTS correction_instructions TEXT DEFAULT '';
    ALTER TABLE support_queries ADD COLUMN IF NOT EXISTS contact_name VARCHAR(140) DEFAULT '';
    ALTER TABLE support_queries ADD COLUMN IF NOT EXISTS contact_email VARCHAR(160) DEFAULT '';
    ALTER TABLE support_queries ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(32) DEFAULT '';
    ALTER TABLE support_queries ADD COLUMN IF NOT EXISTS assigned_admin VARCHAR(140) DEFAULT '';
    ALTER TABLE support_queries ADD COLUMN IF NOT EXISTS internal_notes TEXT DEFAULT '';
    ALTER TABLE support_queries ADD COLUMN IF NOT EXISTS last_replied_at TIMESTAMPTZ;
    ALTER TABLE support_queries ADD COLUMN IF NOT EXISTS last_replied_by VARCHAR(140) DEFAULT '';
    ALTER TABLE support_queries DROP CONSTRAINT IF EXISTS support_queries_status_check;
    ALTER TABLE support_queries DROP CONSTRAINT IF EXISTS support_queries_priority_check;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS marketing_code VARCHAR(120) DEFAULT NULL;
    ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS marketing_code VARCHAR(120) DEFAULT NULL;
    ALTER TABLE wallets ADD COLUMN IF NOT EXISTS marketing_code VARCHAR(120) DEFAULT NULL;
  `);

  // Ensure system_users table and department credentials exist
  await safeExec(`
    CREATE TABLE IF NOT EXISTS system_users (
      id VARCHAR(64) PRIMARY KEY,
      customer_id VARCHAR(64) REFERENCES customers(id) ON DELETE SET NULL,
      full_name VARCHAR(140) NOT NULL,
      email VARCHAR(160) NOT NULL UNIQUE,
      username VARCHAR(80) NOT NULL UNIQUE,
      phone VARCHAR(32),
      password_hash TEXT NOT NULL,
      role VARCHAR(60) NOT NULL DEFAULT 'Super Admin',
      department VARCHAR(64) NOT NULL DEFAULT 'Super Admin',
      permissions TEXT NOT NULL DEFAULT '["all"]',
      status VARCHAR(24) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'inactive')),
      last_login_at TIMESTAMPTZ,
      created_by VARCHAR(140) DEFAULT 'system',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE system_users DROP CONSTRAINT IF EXISTS system_users_role_check;
    ALTER TABLE system_users ADD COLUMN IF NOT EXISTS department VARCHAR(64) DEFAULT 'Super Admin';

    INSERT INTO system_users (id, full_name, email, username, phone, password_hash, role, department, permissions, status)
    VALUES
      ('user_superadmin_01', 'AdMafia Executive Super Admin', 'admin@admafia.marketing', 'superadmin', '9999999999', 'SuperAdmin@2026!', 'Super Admin', 'Super Admin', '["all"]', 'active'),
      ('user_marketing_01', 'Senior Marketing Campaign Director', 'marketing@admafia.marketing', 'marketing', '9888888888', 'Marketing@2026!', 'Marketing Manager', 'Marketing', '["marketing:all", "campaigns:manage", "ideas:create", "posts:verify"]', 'active'),
      ('user_graphics_01', 'Lead Creative & Graphics Designer', 'graphics@admafia.marketing', 'graphics', '9777777777', 'Graphics@2026!', 'Senior Graphics Designer', 'Graphics', '["graphics:all", "artworks:upload", "requests:manage"]', 'active'),
      ('user_sales_01', 'Principal Sales & Accounts Executive', 'sales@admafia.marketing', 'sales', '9666666666', 'Sales@2026!', 'Sales Executive', 'Sales', '["sales:all", "leads:call", "deals:manage", "groups:edit"]', 'active')
    ON CONFLICT (username) DO UPDATE SET
      password_hash = EXCLUDED.password_hash,
      role = EXCLUDED.role,
      department = EXCLUDED.department,
      status = 'active';

    -- Country Pricing & Dynamic Localization Master
    CREATE TABLE IF NOT EXISTS country_pricing (
      id VARCHAR(64) PRIMARY KEY,
      country_code VARCHAR(4) NOT NULL UNIQUE,
      country_name VARCHAR(100) NOT NULL,
      currency_code VARCHAR(10) NOT NULL,
      currency_symbol VARCHAR(10) NOT NULL,
      currency_position VARCHAR(10) NOT NULL DEFAULT 'before',
      decimal_precision INT NOT NULL DEFAULT 2,
      daily_min_budget NUMERIC(12, 2) NOT NULL,
      monthly_budget NUMERIC(12, 2) NOT NULL,
      min_wallet_topup NUMERIC(12, 2) NOT NULL,
      tax_name VARCHAR(50) DEFAULT 'VAT/GST',
      tax_rate NUMERIC(5, 2) DEFAULT 0.00,
      payment_gateway VARCHAR(50) DEFAULT 'razorpay',
      phone_code VARCHAR(10) DEFAULT '+91',
      flag_emoji VARCHAR(10) DEFAULT '🌐',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      is_default BOOLEAN NOT NULL DEFAULT FALSE,
      effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_country_pricing_code ON country_pricing(country_code);
    CREATE INDEX IF NOT EXISTS idx_country_pricing_active ON country_pricing(is_active);

    CREATE TABLE IF NOT EXISTS country_pricing_audit_logs (
      id VARCHAR(64) PRIMARY KEY,
      country_code VARCHAR(4) NOT NULL,
      country_name VARCHAR(100) NOT NULL,
      old_pricing JSONB,
      new_pricing JSONB,
      changed_by VARCHAR(100) DEFAULT 'Super Admin',
      change_reason TEXT,
      effective_date DATE DEFAULT CURRENT_DATE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_cp_audit_code ON country_pricing_audit_logs(country_code);
    CREATE INDEX IF NOT EXISTS idx_cp_audit_created ON country_pricing_audit_logs(created_at DESC);

    ALTER TABLE customers ADD COLUMN IF NOT EXISTS country_code VARCHAR(4) DEFAULT 'IN';
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'INR';
    ALTER TABLE customers ALTER COLUMN phone TYPE VARCHAR(32);
    ALTER TABLE customers DROP CONSTRAINT IF EXISTS chk_customers_phone_10digits;

    ALTER TABLE wallets ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'INR';
    ALTER TABLE wallets DROP CONSTRAINT IF EXISTS wallets_daily_ad_spend_check;

    ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'INR';
    ALTER TABLE payment_records ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'INR';
    ALTER TABLE payment_records DROP CONSTRAINT IF EXISTS payment_records_amount_check;
    ALTER TABLE tax_invoices ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'INR';

    -- Initial authoritative country pricing records
    INSERT INTO country_pricing (
      id, country_code, country_name, currency_code, currency_symbol,
      currency_position, decimal_precision, daily_min_budget, monthly_budget,
      min_wallet_topup, tax_name, tax_rate, payment_gateway, phone_code,
      flag_emoji, is_active, is_default, effective_date
    ) VALUES
      ('cp_in', 'IN', 'India', 'INR', '₹', 'before', 0, 300.00, 9000.00, 300.00, 'GST', 18.00, 'razorpay', '+91', '🇮🇳', TRUE, TRUE, CURRENT_DATE),
      ('cp_ae', 'AE', 'United Arab Emirates', 'AED', 'AED ', 'before', 2, 10.00, 300.00, 10.00, 'VAT', 5.00, 'international', '+971', '🇦🇪', TRUE, FALSE, CURRENT_DATE),
      ('cp_us', 'US', 'United States', 'USD', '$', 'before', 2, 10.00, 300.00, 10.00, 'Sales Tax', 0.00, 'international', '+1', '🇺🇸', TRUE, FALSE, CURRENT_DATE),
      ('cp_gb', 'GB', 'United Kingdom', 'GBP', '£', 'before', 2, 10.00, 300.00, 10.00, 'VAT', 20.00, 'international', '+44', '🇬🇧', TRUE, FALSE, CURRENT_DATE),
      ('cp_sa', 'SA', 'Saudi Arabia', 'SAR', 'SAR ', 'before', 2, 10.00, 300.00, 10.00, 'VAT', 15.00, 'international', '+966', '🇸🇦', TRUE, FALSE, CURRENT_DATE)
    ON CONFLICT (country_code) DO UPDATE SET
      country_name = EXCLUDED.country_name,
      currency_code = EXCLUDED.currency_code,
      currency_symbol = EXCLUDED.currency_symbol,
      currency_position = EXCLUDED.currency_position,
      daily_min_budget = EXCLUDED.daily_min_budget,
      monthly_budget = EXCLUDED.monthly_budget,
      min_wallet_topup = EXCLUDED.min_wallet_topup,
      tax_name = EXCLUDED.tax_name,
      tax_rate = EXCLUDED.tax_rate,
      phone_code = EXCLUDED.phone_code,
      flag_emoji = EXCLUDED.flag_emoji,
      is_active = EXCLUDED.is_active,
      is_default = EXCLUDED.is_default,
      updated_at = NOW();
  `);

  // Ensure unified view vw_sales_customer_accounts is always compiled and live
  await safeExec(VW_SALES_CUSTOMER_ACCOUNTS_SQL);

  console.log('[PostgreSQL] Relational schema & views verified (14 tables + vw_sales_customer_accounts)');

  return { mode: dbMode };
}

/**
 * Execute parameterized SQL query ($1, $2, ...) against PostgreSQL
 * Includes auto-recovery for relational views if dropped or out of sync.
 */
export async function query(text, params = []) {
  if (dbMode === 'uninitialized') {
    await initDatabase();
  }

  try {
    if (dbMode === 'postgres-server') {
      return await activePool.query(text, params);
    }
    const res = await pgliteInstance.query(text, params);
    const rows = res.rows || [];
    return {
      rows,
      rowCount: rows.length > 0 ? rows.length : (res.affectedRows || 0),
    };
  } catch (err) {
    if (err && err.message && err.message.includes('vw_sales_customer_accounts') && err.message.includes('does not exist')) {
      console.warn('[PostgreSQL] Auto-recovering missing view vw_sales_customer_accounts on the fly...');
      try {
        if (dbMode === 'postgres-server') {
          await activePool.query(VW_SALES_CUSTOMER_ACCOUNTS_SQL);
          return await activePool.query(text, params);
        } else {
          await pgliteInstance.exec(VW_SALES_CUSTOMER_ACCOUNTS_SQL);
          const res = await pgliteInstance.query(text, params);
          const rows = res.rows || [];
          return {
            rows,
            rowCount: rows.length > 0 ? rows.length : (res.affectedRows || 0),
          };
        }
      } catch (recoveryErr) {
        console.error('[PostgreSQL] View auto-recovery failed:', recoveryErr.message);
      }
    }
    throw err;
  }
}

/**
 * Execute a block inside an atomic database transaction.
 * Rolls back automatically on any error, and commits on completion.
 */
export async function withTransaction(callback) {
  if (dbMode === 'uninitialized') {
    await initDatabase();
  }
  if (dbMode === 'postgres-server') {
    const client = await activePool.connect();
    try {
      await client.query('BEGIN');
      const txQuery = async (text, params = []) => {
        const res = await client.query(text, params);
        return {
          rows: res.rows || [],
          rowCount: res.rowCount !== undefined ? res.rowCount : (res.rows ? res.rows.length : 0),
        };
      };
      const result = await callback(txQuery);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch {}
      throw err;
    } finally {
      client.release();
    }
  } else {
    return pgliteInstance.transaction(async (tx) => {
      const txQuery = async (text, params = []) => {
        const res = await tx.query(text, params);
        const rows = res.rows || [];
        return {
          rows,
          rowCount: rows.length > 0 ? rows.length : (res.affectedRows || 0),
        };
      };
      return callback(txQuery);
    });
  }
}

export function getDbStatus() {
  return {
    connected: dbMode !== 'uninitialized',
    engine: dbMode,
    database: process.env.PGDATABASE || 'admafia_crm',
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT || 5432),
  };
}

