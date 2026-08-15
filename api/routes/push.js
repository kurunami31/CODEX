import { Router } from 'express';
import webpush from 'web-push';
import { supabaseFor, supabaseAdmin } from '../lib/supabase.js';
import { env } from '../lib/env.js';

const router = Router();

function bearer(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
}

const vapidPublic = env('VAPID_PUBLIC_KEY');
const vapidPrivate = env('VAPID_PRIVATE_KEY');
const vapidSubject = env('VAPID_SUBJECT') || 'mailto:dorsucodex2026@gmail.com';
const pushEnabled = Boolean(vapidPublic && vapidPrivate);
if (pushEnabled) {
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
}

const NOTIFY_ICON = '/assets/codebyterts-logo.gif';

async function deliver(subscription, title, body, url) {
  const payload = JSON.stringify({ title, body, url, icon: NOTIFY_ICON, badge: NOTIFY_ICON });
  try {
    await webpush.sendNotification(subscription, payload);
    return 'sent';
  } catch (err) {
    // 404/410 mean the device dropped the subscription — safe to purge.
    return err?.statusCode === 404 || err?.statusCode === 410 ? 'gone' : 'failed';
  }
}

// GET /api/push/key — exposes the VAPID public key to the client so it can
// subscribe. When push is not configured the app silently skips it.
router.get('/push/key', (_req, res) => {
  res.json({ enabled: pushEnabled, key: pushEnabled ? vapidPublic : null });
});

// POST /api/push/send — sends a web push. `to: 'all'` (staff only) broadcasts
// to every subscribed member; `to: <userId>` notifies one member. Best-effort:
// dead subscriptions are cleaned up, failures never fail the request.
router.post('/push/send', async (req, res) => {
  if (!pushEnabled) return res.json({ enabled: false, sent: 0, skipped: true });

  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Missing session token.' });

  const sb = supabaseFor(token);
  const { data: { user }, error: authError } = await sb.auth.getUser();
  if (authError || !user) return res.status(401).json({ error: 'Invalid session.' });

  const { to, title, body, url } = req.body || {};
  if (typeof title !== 'string' || !title.trim() || title.length > 200) {
    return res.status(400).json({ error: 'title is required.' });
  }
  if (typeof body !== 'string' || !body.trim() || body.length > 500) {
    return res.status(400).json({ error: 'body is required.' });
  }
  const cleanUrl = typeof url === 'string' && url.startsWith('/') ? url.slice(0, 300) : '/app/feed';

  const { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = profile?.role;

  let query = sb.from('push_subscriptions').select('endpoint, keys');
  if (to === 'all') {
    if (!['admin', 'superadmin'].includes(role)) {
      return res.status(403).json({ error: 'Only admins can broadcast.' });
    }
  } else {
    if (typeof to !== 'string' || to.length > 64) return res.status(400).json({ error: 'Invalid recipient.' });
    query = query.eq('user_id', to);
  }

  const { data: subs, error: qErr } = await query;
  if (qErr) return res.status(500).json({ error: 'Could not load subscriptions.' });

  let sent = 0;
  const gone = [];
  for (const s of subs || []) {
    const sub = { endpoint: s.endpoint, keys: s.keys };
    const result = await deliver(sub, title.trim(), body.trim(), cleanUrl);
    if (result === 'sent') sent += 1;
    else if (result === 'gone') gone.push(s.endpoint);
  }

  if (gone.length > 0) {
    await supabaseAdmin().from('push_subscriptions').delete().in('endpoint', gone);
  }

  res.json({ enabled: true, sent });
});

export default router;