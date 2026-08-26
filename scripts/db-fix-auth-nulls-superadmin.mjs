import 'dotenv/config';
import pg from 'pg';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const r = await client.query(
    `update auth.users
       set confirmation_token = '', recovery_token = '',
           email_change_token_new = '', email_change = ''
     where email = 'dms.prime3101@gmail.com'
     returning email`
  );
  console.log('Fixed auth.users null strings:', r.rowCount > 0 ? 'yes' : 'no row');
} finally {
  await client.end();
}