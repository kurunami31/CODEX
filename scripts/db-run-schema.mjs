// One-time maintenance script: applies database/schema.sql to the
// database in DATABASE_URL (from .env). Local/DBA tool only — it is
// never bundled into the client or the Vercel function.
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set (check .env)');
    process.exit(1);
  }

  const sql = readFileSync(join(__dirname, '..', 'database', 'schema.sql'), 'utf8');
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();
    console.log('connected, applying schema…');
    await client.query(sql);
    const { rows } = await client.query(`
      select (select count(*) from public.profiles)  as profiles,
             (select count(*) from public.events)    as events,
             (select count(*) from public.attendance) as attendance,
             (select count(*) from public.posts)     as posts
    `);
    console.log('schema applied — table row counts:', rows[0]);
  } catch (err) {
    console.error('schema run failed:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
