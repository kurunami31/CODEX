import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

export const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Service-role client — bypasses RLS. Used ONLY by the super-admin routes
// to manage auth.users (emails / account creation), which RLS can never
// reach from the client. Never expose SUPABASE_SERVICE_ROLE_KEY to the app.
export function supabaseAdmin() {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

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
