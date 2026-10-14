// Applies a SQL migration file to the database in DATABASE_URL (from .env).
// Local/DBA tool only — never bundled into the client or the Vercel function.
//
//   node scripts/db-run-migration.mjs database/migrations/002_scan_lock_and_phases.sql
//
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/db-run-migration.mjs <path-to.sql>');
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set (check .env)');
  process.exit(1);
}

const sql = readFileSync(file, 'utf8');
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  console.log(`connected — applying ${file} …`);
  await client.query(sql);
  console.log('migration applied ✔');
} catch (err) {
  console.error('migration failed:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
