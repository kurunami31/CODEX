import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

export const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Per-request client bound to a specific user's access token.
// All server-side data access MUST go through the requester's own
// credentials so Supabase Row Level Security applies to every query.
export function supabaseFor(token) {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: `Bearer ${token}` },
    },
  });
}
