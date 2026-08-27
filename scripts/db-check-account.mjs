import 'dotenv/config';
import pg from 'pg';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const email = 'regene.pacio@dorsu.edu.ph';
  
  // Check auth.users
  const auth = await client.query('select id, email, email_confirmed_at, created_at from auth.users where email = $1', [email]);
  console.log('auth.users:', auth.rows[0] || 'NOT FOUND');
  
  // Check profiles
  const profile = await client.query('select id, student_id, full_name, role, year_level, section from public.profiles where id in (select id from auth.users where email = $1)', [email]);
  console.log('profiles:', profile.rows[0] || 'NOT FOUND');
  
  // Check auth.identities
  if (auth.rows[0]) {
    const ident = await client.query('select id, user_id, provider, provider_id from auth.identities where user_id = $1', [auth.rows[0].id]);
    console.log('auth.identities:', ident.rows[0] || 'NOT FOUND');
  }
  
  // Check attendance records
  const attendance = await client.query('select * from public.attendance where student_id = (select student_id from public.profiles where id in (select id from auth.users where email = $1)) order by time_in desc limit 5', [email]);
  console.log('attendance:', attendance.rows);
  
} catch (err) {
  console.error('Error:', err.message);
} finally {
  await client.end();
}