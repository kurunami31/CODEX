import 'dotenv/config';
import pg from 'pg';

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const { rows } = await c.query(`select p.full_name, p.role, p.avatar_url
  from public.profiles p order by p.full_name`);
console.table(rows);
await c.end();
