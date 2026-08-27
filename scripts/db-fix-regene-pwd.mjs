import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from 'dotenv';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: join(__dirname, '..', '.env') });

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

async function fix() {
  const email = 'pacioregene3@gmail.com';
  const password = 'regene2026';
  
  const authRes = await client.query('select id from auth.users where email = $1', [email]);
  
  if (authRes.rows.length === 0) {
    console.log('User not found');
    return;
  }
  
  const userId = authRes.rows[0].id;
  console.log('User ID:', userId);
  
  const r = await client.query(`
    update auth.users
    set encrypted_password = crypt($1, gen_salt('bf')),
        confirmation_token = '', recovery_token = '',
        email_change_token_new = '', email_change = '',
        email_confirmed_at = now()
    where id = $2
    returning id, email
  `, [password, userId]);
  
  console.log('Updated:', r.rows[0]);
  console.log('Password set to: regene2026');
}

await fix();
await client.end();