import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL || '';
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabaseReady = Boolean(url && anon);

export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  anon || 'placeholder-anon-key',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
);

export function signIn(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}

export function signUp(email, password) {
  return supabase.auth.signUp({ email, password });
}

export function signOut() {
  return supabase.auth.signOut();
}

function tokenExpiryMs(token) {
  try {
    const part = token.split('.')[1] || '';
    const pad = '='.repeat((4 - (part.length % 4)) % 4);
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/') + pad));
    return Number(json.exp) * 1000 || 0;
  } catch {
    return 0;
  }
}

// Returns a session whose access token is accepted by the serverless API.
// On a phone the cached token can silently expire while the app is
// backgrounded (PWA / throttled timers), which makes the API answer
// "Invalid session." — refresh the token before it is sent.
export async function getFreshSession() {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return null;
  if (tokenExpiryMs(session.access_token) < Date.now() + 30_000) {
    const { data: fresh, error } = await supabase.auth.refreshSession();
    if (error || !fresh.session) return null;
    return fresh.session;
  }
  return session;
}
