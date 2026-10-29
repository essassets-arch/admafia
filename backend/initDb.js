import { initDatabase, query, getDbStatus } from './db.js';

async function run() {
  await initDatabase();
  const status = getDbStatus();
  const tables = await query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
  );
  console.log('Database Status:', status);
  console.log('Tables & Views:', tables.rows.map((r) => r.table_name));
  process.exit(0);
}

run().catch((err) => {
  console.error('DB Init Failed:', err);
  process.exit(1);
});
