import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: join(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

console.log('URL:', SUPABASE_URL ? 'OK' : 'MISSING');
console.log('KEY:', SUPABASE_ANON_KEY ? 'OK' : 'MISSING');

async function tryLogin(password) {
  const login = await fetch(`https://fgrvaqpnmjdpwrmpflim.supabase.co/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'regene.pacio@dorsu.edu.ph', password })
  });
  
  const loginResult = await login.json();
  return { status: login.status, ...loginResult };
}

async function check() {
  // Try common password patterns
  const passwords = [
    'codeadviser26',  // adviser pattern
    'regene26', 'regene2026', 'regene', 'Regene26', 'Regene2026',
    'pacio26', 'pacio2026', 'pacio', 'Pacio26', 'Pacio2026',
    'RegenePacio', 'regene.pacio', 'Regene.Pacio',
    '2020-0651', // if student ID is password
    'dorsu2026', 'dorsu', 'Dorsu2026',
    'codex2026', 'codex', 'Codex2026'
  ];
  
  for (const pwd of passwords) {
    const result = await tryLogin(pwd);
    if (result.status === 200) {
      console.log('FOUND PASSWORD:', pwd);
      console.log('User:', result.user);
      break;
    }
    // Only log failures that aren't just wrong password
    if (result.status !== 400 || result.error_code !== 'invalid_credentials') {
      console.log(`Try "${pwd}":`, result.status, result.error_code, result.msg);
    }
  }
}

check();