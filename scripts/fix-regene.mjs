import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from 'dotenv';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: join(__dirname, '..', '.env') });

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

async function fixRegene() {
  const email = 'regene.pacio@dorsu.edu.ph';
  const password = 'regene2026';
  
  // Check if user exists in auth.users
  const authRes = await client.query('select id, email, email_confirmed_at from auth.users where email = $1', [email]);
  
  if (authRes.rows.length === 0) {
    console.log('User not found in auth.users - creating new account');
    
    // Create auth user
    const ins = await client.query(`
      insert into auth.users
        (instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, confirmation_sent_at, raw_app_meta_data, raw_user_meta_data,
         created_at, updated_at)
      values
        ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
         $1, crypt($2, gen_salt('bf')), now(), now(),
         '{"provider":"email","providers":["email"]}'::jsonb,
         '{"full_name":"Regene Pacio"}'::jsonb,
         now(), now())
      returning id
    `, [email, password]);
    
    const userId = ins.rows[0].id;
    console.log('Created auth user:', userId);
    
    // Create identity
    const uid = String(userId);
    await client.query(`
      insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), '${String(userId)}'::uuid, '${String(userId)}', 'email',
              jsonb_build_object('sub', '${String(userId)}', 'email', '${email}'), now(), now(), now())
    `);
    console.log('Created identity');
    
    // Ensure profile constraints allow student
    await client.query(`
      alter table public.profiles drop constraint if exists profiles_year_level_check;
      alter table public.profiles 
      add constraint profiles_year_level_check 
      check (year_level is null OR year_level in ('1st Year','2nd Year','3rd Year','4th Year'));
    `);
    
    await client.query(`
      alter table public.profiles alter column year_level drop not null;
      alter table public.profiles alter column section drop not null;
    `);
    
    // Create profile with unique student_id
    await client.query(`
      insert into public.profiles (id, student_id, full_name, year_level, section, course, role)
      values ($1, '2023-1562-REGENE', 'Regene Pacio', '4th Year', 'B', 'BSIT', 'student')
    `, [userId]);
    
    console.log('Created profile for Regene Pacio');
    
    // Fix auth null strings
    await client.query(`
      update auth.users
      set confirmation_token = '', recovery_token = '',
          email_change_token_new = '', email_change = ''
      where email = $1
    `, [email]);
    
    console.log('Fixed auth null strings');
    console.log('Account created successfully with password:', password);
    
  } else {
    const userId = authRes.rows[0].id;
    console.log('User exists in auth:', userId);
    
    // Check if profile exists
    const profileRes = await client.query('select * from public.profiles where id = $1', [userId]);
    
    if (profileRes.rows.length === 0) {
      console.log('Profile missing - creating profile');
      await client.query(`
        insert into public.profiles (id, student_id, full_name, year_level, section, course, role)
        values ($1, '2023-1562-REGENE', 'Regene Pacio', '4th Year', 'B', 'BSIT', 'student')
      `, [userId]);
      console.log('Created profile');
    } else {
      console.log('Profile exists:', profileRes.rows[0]);
    }
    
    // Fix password and auth nulls - password is text, userId is uuid
    await client.query(`
      update auth.users
      set encrypted_password = crypt($1, gen_salt('bf')),
          confirmation_token = '', recovery_token = '',
          email_change_token_new = '', email_change = '',
          email_confirmed_at = now()
      where id = $2
    `, ['regene2026', authRes.rows[0].id]);
    
    console.log('Updated password and fixed auth nulls');
    console.log('Account fixed with password: regene2026');
  }
  
  console.log('\nAccount ready - Email: regene.pacio@dorsu.edu.ph Password: regene2026');
}

await fixRegene();
await client.end();