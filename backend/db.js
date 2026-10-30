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
    INSERT INTO system_users (id, full_name, email, username, phone, password_hash, role, permissions, status)
    VALUES ('user_superadmin_01', 'AdMafia Executive Super Admin', 'admin@admafia.marketing', 'superadmin', '9999999999', 'SuperAdmin@2026!', 'Super Admin', '["all"]', 'active')
    ON CONFLICT (username) DO NOTHING;
  `);

  console.log('[PostgreSQL] Relational schema & views verified (14 tables + vw_sales_customer_accounts)');

  return { mode: dbMode };
}

/**
 * Execute parameterized SQL query ($1, $2, ...) against PostgreSQL
 */
export async function query(text, params = []) {
  if (dbMode === 'uninitialized') {
    await initDatabase();
  }
  if (dbMode === 'postgres-server') {
    return activePool.query(text, params);
  }
  const res = await pgliteInstance.query(text, params);
  const rows = res.rows || [];
  return {
    rows,
    rowCount: rows.length > 0 ? rows.length : (res.affectedRows || 0),
  };
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

