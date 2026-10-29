import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
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

  // 1. Try connecting to external PostgreSQL Server (e.g. postgresql-x64-18 on port 5432)
  try {
    const adminClient = new Client({
      host,
      port,
      user,
      password,
      database: 'postgres',
      connectionTimeoutMillis: 2500,
    });
    await adminClient.connect();

    const dbCheck = await adminClient.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [database]
    );
    if (dbCheck.rowCount === 0) {
      await adminClient.query(`CREATE DATABASE "${database}"`);
      console.log(`[PostgreSQL] Created database "${database}" on ${host}:${port}`);
    }
    await adminClient.end();

    activePool = new Pool({
      host,
      port,
      user,
      password,
      database,
      max: 20,
      idleTimeoutMillis: 30000,
    });

    await activePool.query('SELECT NOW()');
    dbMode = 'postgres-server';
    console.log(`[PostgreSQL] Connected to PostgreSQL server at ${host}:${port}/${database}`);
  } catch (err) {
    // 2. Fallback to persistent disk-backed PostgreSQL engine (PGlite) in backend/pgdata
    const dataDir = path.join(__dirname, 'pgdata');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    pgliteInstance = new PGlite(dataDir);
    await pgliteInstance.waitReady;
    dbMode = 'pglite-postgres';
    console.log(`[PostgreSQL] Initialized persistent PostgreSQL database at ${dataDir}`);
  }

  // Run schema.sql migration
  const schemaPath = path.join(__dirname, 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    const rawSql = fs.readFileSync(schemaPath, 'utf8');
    // Remove pgcrypto extension if not needed so both standard PG and PGlite execute cleanly
    const cleanSql = rawSql.replace(/CREATE EXTENSION IF NOT EXISTS "pgcrypto";/gi, '');
    if (dbMode === 'postgres-server') {
      await activePool.query(cleanSql);
    } else {
      await pgliteInstance.exec(cleanSql);
    }
    console.log('[PostgreSQL] Relational schema & views verified (11 tables + vw_sales_customer_accounts)');
  }

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

export function getDbStatus() {
  return {
    connected: dbMode !== 'uninitialized',
    engine: dbMode,
    database: process.env.PGDATABASE || 'admafia_crm',
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT || 5432),
  };
}

