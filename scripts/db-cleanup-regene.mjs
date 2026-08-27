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
  // Delete the duplicate Regene profile (the one with 2023-1562-REGENE)
  const deleted = await client.query(`
    delete from public.profiles 
    where id = '5df868e5-ab02-47f5-8025-4c948c9bbc06'
    returning id, student_id, full_name
  `);
  console.log('Deleted duplicate:', deleted.rows[0]);
  
  // Also delete the auth.identity for the duplicate (regene.pacio@dorsu.edu.ph)
  await client.query(`delete from auth.identities where user_id = '5df868e5-ab02-47f5-8025-4c948c9bbc06'`);
  console.log('Deleted duplicate identity');
  
  // Optionally delete the auth.users entry for the duplicate (regene.pacio@dorsu.edu.ph)
  // but keep the main one (pacioregene3@gmail.com)
  await client.query(`delete from auth.users where id = '5df868e5-ab02-47f5-8025-4c948c9bbc06'`);
  console.log('Deleted duplicate auth user');
  
  // Verify Regene's main profile
  const regene = await client.query('select id, student_id, full_name, email from auth.users u join public.profiles p on p.id = u.id where u.email = $1', ['pacioregene3@gmail.com']);
  console.log('Regene main profile:', regene.rows[0]);
  
} catch (err) {
  console.error('Error:', err.message);
} finally {
  await client.end();
}