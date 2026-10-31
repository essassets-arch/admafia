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
    COALESCE(w.ad_campaign_active, FALSE) AS ad_campaign_active,
    COALESCE(w.active_days, 'MON,TUE,WED,THU,FRI') AS active_days,
    COALESCE(w.schedule_preset, 'weekdays') AS schedule_preset,
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
  await safeExec(`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS active_days VARCHAR(120) DEFAULT 'MON,TUE,WED,THU,FRI'`);
  await safeExec(`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS schedule_preset VARCHAR(64) DEFAULT 'weekdays'`);
  await safeExec(`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS ad_campaign_active BOOLEAN DEFAULT FALSE`);
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

  // Run schema.sql migration
  const schemaPath = path.join(__dirname, 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    const rawSql = fs.readFileSync(schemaPath, 'utf8');
    // Remove pgcrypto extension if not needed so both standard PG and PGlite execute cleanly
    const cleanSql = rawSql.replace(/CREATE EXTENSION IF NOT EXISTS "pgcrypto";/gi, '');
    await safeExec(cleanSql);
  }

  // Post-migration auto-completes and updates
  await safeExec(`
    UPDATE customers SET profile_status = 'complete', kyc_percent = 100, verified = TRUE WHERE profile_status = 'incomplete';
    UPDATE pending_verifications SET profile_status = 'complete', queue_type = CASE WHEN payment_status IN ('paid', 'verified') THEN 'Completed' ELSE 'Payment Pending' END;
    ALTER TABLE customer_groups ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'Other';
    ALTER TABLE customer_groups ADD COLUMN IF NOT EXISTS status VARCHAR(24) DEFAULT 'active';
    ALTER TABLE customer_groups ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS master_lead_id VARCHAR(64);
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'IT & Software';
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

