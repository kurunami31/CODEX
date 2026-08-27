import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from 'dotenv';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: join(__dirname, '..', '.env') });

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

async function restore() {
try {
  // Check if event exists
  const existing = await client.query("select * from public.events where title = 'BUWAN NG WIKA'");
  
  if (existing.rows.length > 0) {
    console.log('Event already exists:', existing.rows[0]);
  } else {
    // Get superadmin user ID for created_by
    const adminRes = await client.query("select id from auth.users where email = 'dms.prime3101@gmail.com'");
    
    if (adminRes.rows.length === 0) {
      console.log('Admin user not found');
      return;
    }
    
    const adminId = adminRes.rows[0].id;
    
    // Create the event with end time for checkout logic
    const eventDate = new Date('2026-08-26T23:00:00+00:00'); // August 26, 2026
    const eventEnd = new Date('2026-08-26T23:30:00+00:00'); // End time 30 minutes later
    
    const result = await client.query(`
      insert into public.events (title, description, location, event_date, event_end, created_by)
      values ($1, $2, $3, $4, $5, $6)
      returning *
    `, [
      'BUWAN NG WIKA',
      'Celebration of the Filipino language and culture. Join us for performances, contests, and cultural presentations!',
      'DOrSU Activity Center',
      '2026-08-26T23:00:00+00:00',
      '2026-08-26T23:30:00+00:00', // event ends 30 minutes after start for checkout logic
      '17e174d0-f1a1-4f4f-93e6-5ac11c0fd161' // superadmin user ID
    ]);
    
    console.log('Event created:', result.rows[0]);
  }
} catch (err) {
  console.error('Error:', err.message);
} finally {
  await client.end();
}
}

restore();