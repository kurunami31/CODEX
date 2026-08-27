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
  const email = 'dms.prime3101@gmail.com';
  
  // Get user ID
  const userRes = await client.query('select id from auth.users where email = $1', [email]);
  if (userRes.rows.length === 0) {
    console.log('User not found');
    return;
  }
  
  const userId = userRes.rows[0].id;
  console.log('Found user:', userId, email);
  
  // Get student_id from profiles
  const profileRes = await client.query('select student_id from public.profiles where id = $1', [userId]);
  if (profileRes.rows.length === 0) {
    console.log('Profile not found');
    return;
  }
  
  const studentId = profileRes.rows[0].student_id;
  console.log('Profile student_id:', studentId);
  
  // Check all attendance records for this student
  const attRes = await client.query('select * from public.attendance where student_id = $1', [studentId]);
  console.log('Attendance records for', studentId, ':', attRes.rows);
  
  // Also check by user_id in case scanned_by matches
  const attByScanner = await client.query('select * from public.attendance where scanned_by = $1', [userId]);
  console.log('Attendance records scanned by user:', attByScanner.rows);
  
} catch (err) {
  console.error('Error:', err.message);
} finally {
  await client.end();
}