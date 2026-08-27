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
  const superadminId = '17e174d0-f1a1-4f4f-93e6-5ac11c0fd161';
  
  // 1. Check all profiles for this user
  const profiles = await client.query('select * from public.profiles where id = $1', ['17e174d0-f1a1-4f4f-93e6-5ac11c0fd161']);
  console.log('Profiles for superadmin:', profiles.rows);
  
  // 2. Check all auth.users for this email
  const authUsers = await client.query("select id, email from auth.users where email = 'dms.prime3101@gmail.com'");
  console.log('\nAuth users:', authUsers.rows);
  
  // 3. Check all profiles with email dms.prime3101@gmail.com (if column exists)
  // Check if email column exists in profiles
  const cols = await client.query("select column_name from information_schema.columns where table_name = 'profiles' and table_schema = 'public'");
  console.log('\nProfiles columns:', cols.rows.map(r => r.column_name));
  
  // 3. Check all attendance where student_id matches ANY profile of this user
  const profileIds = await client.query('select id, student_id from public.profiles where id = $1', ['17e174d0-f1a1-4f4f-93e6-5ac11c0fd161']);
  console.log('\nProfile IDs:', profileIds.rows);
  
  // 4. Check all attendance for ALL student_ids associated with this user
  const allProfileStudentIds = await client.query('select student_id from public.profiles where id = $1', ['17e174d0-f1a1-4f4f-93e6-5ac11c0fd161']);
  for (const p of allProfileStudentIds.rows) {
    const att = await client.query('select * from public.attendance where student_id = $1', [p.student_id]);
    console.log(`\nAttendance for student_id ${p.student_id}:`, att.rows.length, 'records');
    att.rows.forEach(r => console.log('  ', r.id, r.event_id, r.scanned_at, r.time_in_am, r.time_out_am, r.time_in_pm, r.time_out_pm));
  }
  
  // 5. Check if there are multiple profiles for the same user
  const allProfiles = await client.query('select * from public.profiles where id = $1', ['17e174d0-f1a1-4f4f-93e6-5ac11c0fd161']);
  console.log('\nAll profiles for user:', allProfiles.rows.length);
  
  // 5. Check if there's a different user_id for the same email
  const allAuth = await client.query("select id, email from auth.users where email = 'dms.prime3101@gmail.com'");
  console.log('\nAll auth users with that email:', allAuth.rows);
  
  // 6. Check all profiles where email might be stored
  const withEmail = await client.query("select * from public.profiles where full_name ILIKE '%dms%' OR full_name ILIKE '%prime%' OR full_name ILIKE '%christopher%'");
  console.log('\nProfiles with similar names:', withEmail.rows);
  
  // 6. Check all profiles for this auth user id
  const allProfilesForUser = await client.query('select * from public.profiles where id = $1', ['17e174d0-f1a1-4f4f-93e6-5ac11c0fd161']);
  console.log('\nAll profiles for auth user:', allProfilesForUser.rows);
  
  // 7. Check attendance table for any record with this user_id in any column
  const allCols = await client.query("select column_name from information_schema.columns where table_name = 'attendance' and table_schema = 'public'");
  console.log('\nAttendance columns:', allCols.rows.map(r => r.column_name));
  
  // Check all attendance records where scanned_by = this user
  const scannedByMe = await client.query('select * from public.attendance where scanned_by = $1', ['17e174d0-f1a1-4f4f-93e6-5ac11c0fd161']);
  console.log('\nRecords scanned by me:', scannedByMe.rows.length);
  
  // Check all attendance for events I created
  const eventsICreated = await client.query('select id from public.events where created_by = $1', ['17e174d0-f1a1-4f4f-93e6-5ac11c0fd161']);
  console.log('\nEvents I created:', eventsICreated.rows);
  
  if (eventsICreated.rows.length > 0) {
    for (const ev of eventsICreated.rows) {
      const att = await client.query('select * from public.attendance where event_id = $1', [ev.id]);
      console.log(`Event ${ev.id} attendance:`, att.rows.length, 'records');
    }
  }
}

try {
  await check();
} catch (err) {
  console.error('Error:', err.message);
} finally {
  await client.end();
}