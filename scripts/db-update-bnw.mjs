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
  // Add event_end column if not exists
  await client.query(`
    alter table public.events
    add column if not exists event_end timestamptz;
  `);
  console.log('Added event_end column');
  
  // Update existing event with end time and created_by
  const result = await client.query(`
    update public.events
    set description = $1,
        location = $2,
        event_end = $3,
        created_by = $4
    where title = 'BUWAN NG WIKA'
    returning *
  `, [
    'Celebration of the Filipino language and culture. Join us for performances, contests, and cultural presentations!',
    'DOrSU Activity Center',
    '2026-08-26T23:30:00+00:00', // event ends 30 minutes after start for checkout logic
    '17e174d0-f1a1-4f4f-93e6-5ac11c0fd161' // superadmin user ID
  ]);
  
  if (result.rows.length > 0) {
    console.log('Event updated:', result.rows[0]);
  } else {
    console.log('Event not found');
  }
} catch (err) {
  console.error('Error:', err.message);
} finally {
  await client.end();
}