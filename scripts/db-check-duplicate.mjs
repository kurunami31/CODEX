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
  // Check all profiles for Regene
  const regeneProfiles = await client.query('select * from public.profiles where full_name = $1', ['Regene Pacio']);
  console.log('All Regene profiles:', regeneProfiles.rows);
  
  // Check all profiles with student_id starting with 2023-1562
  const similar = await client.query('select * from public.profiles where student_id like $1', ['2023-1562%']);
  console.log('All 2023-1562 profiles:', similar.rows);
  
} catch (err) {
  console.error('Error:', err.message);
} finally {
  await client.end();
}