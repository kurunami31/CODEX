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
  // Verify Regene's main profile
  const regene = await client.query(`
    select p.id, p.student_id, p.full_name, u.email as auth_email
    from public.profiles p
    join auth.users u on u.id = p.id
    where u.email = 'pacioregene3@gmail.com'
  `);
  console.log('Regene main profile:', regene.rows[0]);
  
  // Check for any remaining duplicates
  const duplicates = await client.query(`select id, student_id, full_name from public.profiles where full_name = 'Regene Pacio'`);
  console.log('All Regene profiles:', duplicates.rows);
  
} catch (err) {
  console.error('Error:', err.message);
} finally {
  await client.end();
}