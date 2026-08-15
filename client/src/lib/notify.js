import { apiFetch } from './supabase';

/**
 * Fire a web push through the API. `to: 'all'` broadcasts to every
 * subscribed member (admins only); `to: <userId>` notifies one member.
 * Best-effort: if the server has no VAPID keys configured the request
 * is a silent no-op, so callers never need to handle errors.
 */
export async function sendPush({ to, title, body, url }) {
  try {
    const res = await apiFetch('/api/push/send', {
      method: 'POST',
      body: { to, title, body, url },
    });
    const j = await res.json().catch(() => ({}));
    return { ok: res.ok, ...j };
  } catch {
    return { ok: false };
  }
}
