import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from 'dotenv';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: join(__dirname, '..', '.env') });

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

async function check() {
  const studentId = '2020-0651';
  const userId = '17e174d0-f1a1-4f4f-93e6-5ac11c0fd161';
  
  // Check all attendance records where student_id = superadmin
  const ownAtt = await client.query('select * from public.attendance where student_id = $1 order by scanned_at desc', [studentId]);
  console.log('Own attendance (student_id):', ownAtt.rows.length, 'records');
  ownAtt.rows.forEach(r => console.log('  ', r.id, r.event_id, r.time_in_am, r.time_out_am, r.time_in_pm, r.time_out_pm));
  
  // Check scanned_by
  const scanned = await client.query('select * from public.attendance where scanned_by = $1 order by scanned_at desc', ['17e174d0-f1a1-4f4f-93e6-5ac11c0fd161']);
  console.log('\nScanned by you:', scanned.rows.length, 'records');
  
  // Check all attendance records for the superadmin user_id
  const byUserId = await client.query('select * from public.attendance where student_id = (select student_id from public.profiles where id = $1)', [userId]);
  console.log('\nBy user_id via profiles:', byUserId.rows.length, 'records');
  
  // Check total count in attendance table
  const total = await client.query('select count(*) from public.attendance');
  console.log('\nTotal attendance records in table:', total.rows[0].count);
  
  // Show all events
  const events = await client.query('select id, title from public.events');
  console.log('\nEvents:', events.rows);
}

await check();
await client.end();