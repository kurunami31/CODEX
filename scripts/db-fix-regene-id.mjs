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
  // Update Regene Pacio's student_id to remove the -REGENE suffix
  await client.query('alter table public.profiles disable trigger trg_profiles_lock_identity');
  
  const r = await client.query(`
    update public.profiles 
    set student_id = '2023-1562' 
    where full_name = 'Regene Pacio'
    returning id, student_id, full_name, role
  `);
  
  await client.query('alter table public.profiles enable trigger trg_profiles_lock_identity');
  
  console.log('Updated:', r.rows[0]);
} catch (err) {
  console.error('Error:', err.message);
} finally {
  await client.end();
}