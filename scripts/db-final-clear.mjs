import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from 'dotenv';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: join(__dirname, '..', '.env') });

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

async function clear() {
  const studentId = '2020-0651';
  
  const delRes = await client.query('delete from public.attendance where student_id = $1', [studentId]);
  console.log('Attendance records deleted:', delRes.rowCount);
  
  // Verify
  const check = await client.query('select * from public.attendance where student_id = $1', [studentId]);
  console.log('Remaining records:', check.rows.length);
}

await clear();
await client.end();