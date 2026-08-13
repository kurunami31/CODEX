import 'dotenv/config';
import pg from 'pg';

const url = process.env.DATABASE_URL;
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
const { rows } = await client.query(`
  select u.email, p.id, p.full_name, p.student_id, p.role, p.membership_paid
  from auth.users u join public.profiles p on p.id = u.id
  order by u.email
`);
for (const r of rows) console.log(`${r.email} | ${r.full_name} | ${r.student_id} | ${r.role} | paid=${r.membership_paid} | ${r.id}`);
await client.end();