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

// Authenticated call to the serverless API. If the server rejects the
// access token (401 — expired while the page was in the background, or
// the device clock is off), refresh the session locally and retry once
// before giving up.
export async function apiFetch(path, { method = 'POST', body } = {}) {
  const session = await getFreshSession();
  if (!session) throw new Error('Session expired — log in again.');

  const send = (token) =>
    fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  let res = await send(session.access_token);
  if (res.status === 401) {
    const { data: fresh, error } = await supabase.auth.refreshSession();
    if (!error && fresh?.session) res = await send(fresh.session.access_token);
    else {
      // The stored session is dead (revoked or corrupt) and cannot be
      // refreshed — clear it so the app lands back on the login screen
      // instead of failing every API call with a cryptic "Invalid session."
      await supabase.auth.signOut().catch(() => {});
      throw new Error('Session expired — log in again.');
    }
  }
  return res;
}
