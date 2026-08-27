import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: join(__dirname, '..', '.env') });

async function verify() {
  const S = process.env.SUPABASE_URL;
  const K = process.env.SUPABASE_ANON_KEY;
  const l = await (await fetch(S + '/auth/v1/token?grant_type=password', {
    method: 'POST', headers: { apikey: K, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'itadviser@dorsu.edu.ph', password: 'codeadviser26' })
  })).json();
  
  const r = await fetch(S + '/rest/v1/rpc/event_attendance', {
    method: 'POST', headers: { apikey: K, Authorization: 'Bearer ' + l.access_token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_event_id: 'af5bbb7a-54ae-4d8b-bbea-aa0ef78dbd99' })
  });
  const data = await r.json();
  console.log('Rows:', data.length);
  if (data.length > 0) {
    const sample = data[0];
    console.log('time_in_am:', sample.time_in_am);
    console.log('time_out_am:', sample.time_out_am);
    console.log('time_in_pm:', sample.time_in_pm);
    console.log('time_out_pm:', sample.time_out_pm);
  }
}

verify();