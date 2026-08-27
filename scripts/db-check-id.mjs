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
  // Check who has student_id 2023-1562
  const existing = await client.query('select id, student_id, full_name from public.profiles where student_id = $1', ['2023-1562']);
  console.log('Current owner of 2023-1562:', existing.rows[0]);
  
  // Check Regene's current ID
  const regene = await client.query('select id, student_id, full_name from public.profiles where full_name = $1', ['Regene Pacio']);
  console.log('Regene current:', regene.rows[0]);
  
  // Check if there's another user with a similar ID that might be the real owner
  const similar = await client.query('select id, student_id, full_name from public.profiles where student_id like $1', ['2023-1562%']);
  console.log('Similar IDs:', similar.rows);
  
} catch (err) {
  console.error('Error:', err.message);
} finally {
  await client.end();
}