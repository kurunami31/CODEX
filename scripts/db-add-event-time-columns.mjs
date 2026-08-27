import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from 'dotenv';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: join(__dirname, '..', '.env') });

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  // Add AM/PM time columns to events table
  await client.query(`
    alter table public.events
      add column if not exists am_start timestamptz,
      add column if not exists am_end timestamptz,
      add column if not exists pm_start timestamptz,
      add column if not exists pm_end timestamptz;
  `);
  console.log('Added AM/PM time columns to events table');
  
  // Update existing BUWAN NG WIKA event with AM/PM times
  const result = await client.query(`
    update public.events
    set am_start = $1,
        am_end = $2,
        pm_start = $3,
        pm_end = $4
    where title = 'BUWAN NG WIKA'
    returning *
  `, [
    '2026-08-26T08:00:00+00:00', // 8:00 AM
    '2026-08-26T12:00:00+00:00', // 12:00 PM
    '2026-08-26T13:00:00+00:00', // 1:00 PM
    '2026-08-26T17:00:00+00:00'  // 5:00 PM
  ]);
  
  console.log('Updated BUWAN NG WIKA with AM/PM times:', result.rows[0]);
  
} catch (err) {
  console.error('Error:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}