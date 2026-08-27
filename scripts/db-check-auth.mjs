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
  // Check auth.users for these profiles
  const regene1 = await client.query('select id, email from auth.users where id = $1', ['519dfb1e-a69a-4218-904e-627dcb21a01f']);
  const regene2 = await client.query('select id, email from auth.users where id = $1', ['5df868e5-ab02-47f5-8025-4c948c9bbc06']);
  const alJames = await client.query('select id, email from auth.users where id = $1', ['70b98a4c-b5c2-4a6b-9ea1-6ed1c057c80a']);
  
  console.log('Regene profile 1 (2025-0407) auth:', regene1.rows[0]);
  console.log('Regene profile 2 (2023-1562-REGENE) auth:', regene2.rows[0]);
  console.log('Al James Lopez auth:', alJames.rows[0]);
  
} catch (err) {
  console.error('Error:', err.message);
} finally {
  await client.end();
}