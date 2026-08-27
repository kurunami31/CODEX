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
  // Turn off maintenance mode
  const result = await client.query(`
    update public.app_settings
    set value = '{"enabled": false, "message": ""}',
        updated_at = now()
    where key = 'maintenance'
    returning *
  `);
  
  if (result.rows.length > 0) {
    console.log('Maintenance mode turned OFF:', result.rows[0]);
  } else {
    // Insert if doesn't exist
    const insert = await client.query(`
      insert into public.app_settings (key, value)
      values ('maintenance', '{"enabled": false, "message": ""}')
      on conflict (key) do update set value = EXCLUDED.value, updated_at = now()
      returning *
    `);
    console.log('Maintenance mode set to OFF:', insert.rows[0]);
  }
  
} catch (err) {
  console.error('Error:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}