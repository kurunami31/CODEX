import { Router } from 'express';
import { supabaseFor } from '../lib/supabase.js';
import { signIdentity, verifyIdentity, PRESENCE_TTL_MS } from '../lib/identity.js';
import { ID_SIGN_TTL_MS } from '../lib/env.js';

const router = Router();

function bearer(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
}

// POST /api/id/sign — issues a short-lived signed QR payload for the
// authenticated student. Requires a valid Supabase session token.
router.post('/id/sign', async (req, res) => {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Missing session token.' });

  const sb = supabaseFor(token);
  const { data: { user }, error: authError } = await sb.auth.getUser();
  if (authError || !user) return res.status(401).json({ error: 'Invalid session.' });

  const { data: profile, error } = await sb.rpc('get_my_profile');

  if (error) return res.status(500).json({ error: 'Could not load your profile.' });
  if (!profile || !profile.student_id) return res.status(404).json({ error: 'Profile not found. Did you complete sign-up?' });

  const { payload, sig } = signIdentity({
    sid: profile.student_id,
    n: profile.full_name,
    iat: Date.now(),
  });

  res.set('Cache-Control', 'no-store');
  res.json({ payload, sig, ttlMs: ID_SIGN_TTL_MS });
});

// POST /api/id/presence — issues a SHORT-LIVED signed 'presence' QR
// (90 seconds). It proves the student is physically present: unlike the
// yearly ID QR, this one cannot be reused from a photo or screenshot.
router.post('/id/presence', async (req, res) => {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Missing session token.' });

  const sb = supabaseFor(token);
  const { data: { user }, error: authError } = await sb.auth.getUser();
  if (authError || !user) return res.status(401).json({ error: 'Invalid session.' });

  const { data: profile, error } = await sb.rpc('get_my_profile');

  if (error) return res.status(500).json({ error: 'Could not load your profile.' });
  if (!profile || !profile.student_id) return res.status(404).json({ error: 'Profile not found. Did you complete sign-up?' });

  const { payload, sig } = signIdentity({
    sid: profile.student_id,
    n: profile.full_name,
    iat: Date.now(),
    t: 'presence',
  });

  res.set('Cache-Control', 'no-store');
  res.json({ payload, sig, ttlMs: PRESENCE_TTL_MS });
});

// POST /api/attendance/scan — moderator/admin only. Verifies the QR
// signature + expiry, then records attendance through the RLS-protected
// RPC using the SCANNER's own token (audited as scanned_by).
router.post('/attendance/scan', async (req, res) => {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Missing session token.' });

  const { eventId, qr, phase } = req.body || {};
  if (typeof eventId !== 'string' || !eventId) return res.status(400).json({ error: 'eventId is required.' });
  if (typeof eventId !== 'string' || eventId.length > 64) return res.status(400).json({ error: 'Invalid eventId.' });

  // The scan phase is explicit: AM/PM × Time In / Time Out, so the RPC stamps
  // exactly one attendance column. A phase is expected, but older cached
  // clients that predate the picker send none — that is resolved below.
  const VALID_PHASES = ['time_in_am', 'time_out_am', 'time_in_pm', 'time_out_pm'];
  if (phase !== undefined && !VALID_PHASES.includes(phase)) {
    return res.status(400).json({ error: 'phase must be one of ' + VALID_PHASES.join(', ') });
  }

  // Accept both the canonical { payload, sig } and the compact { p, s }
  // shapes that the ID card has shipped over time.
  const payloadB64 = qr?.payload ?? qr?.p;
  const sigB64 = qr?.sig ?? qr?.s;
  if (typeof payloadB64 !== 'string' || !payloadB64 || typeof sigB64 !== 'string' || !sigB64) {
    return res.status(400).json({ error: 'QR payload and signature are required.' });
  }

  const sb = supabaseFor(token);
  const { data: { user }, error: authError } = await sb.auth.getUser();
  if (authError || !user) return res.status(401).json({ error: 'Invalid session.' });

  // The attendance RPC itself enforces moderator/admin; check here too so
  // we fail fast and keep invalid scans out of the RPC layer.
  const { data: profile } = await sb.rpc('get_my_profile');
  if (!profile || !['admin', 'moderator', 'superadmin', 'adviser'].includes(profile.role)) {
    return res.status(403).json({ error: 'Only moderators and admins can record attendance.' });
  }

  const verified = verifyIdentity(payloadB64, sigB64);
  if (verified.error) return res.status(400).json({ error: verified.error });
  const { sid, n, t } = verified.payload;

  // Resolve the phase. Backward-compat fallback for clients without the
  // picker: choose the session that is open right now (else the upcoming one)
  // and record a check-in.
  let phaseToUse = phase;
  if (!phaseToUse) {
    const { data: ev } = await sb
      .from('events')
      .select('am_start, am_end, pm_start, pm_end')
      .eq('id', eventId)
      .maybeSingle();
    const now = Date.now();
    const open = (s, e) => s && e && now >= new Date(s).getTime() && now <= new Date(e).getTime();
    const amOpen = open(ev?.am_start, ev?.am_end);
    const pmOpen = open(ev?.pm_start, ev?.pm_end);
    if (amOpen && !pmOpen) phaseToUse = 'time_in_am';
    else if (pmOpen && !amOpen) phaseToUse = 'time_in_pm';
    else if (ev?.pm_start && now >= new Date(ev.pm_start).getTime()) phaseToUse = 'time_in_pm';
    else phaseToUse = 'time_in_am';
  }

  const { data, error } = await sb.rpc('mark_attendance', {
    p_event_id: eventId,
    p_student_id: sid,
    p_phase: phaseToUse,
  });

  if (error) {
    const msg = error.message || 'Attendance could not be recorded.';
    const status = /insufficient/i.test(msg) ? 403 : /not found/i.test(msg) ? 404 : 400;
    return res.status(status).json({ error: msg, studentName: n });
  }

  res.set('Cache-Control', 'no-store');
  res.json({ ...data, qrHolder: n, qrType: t === 'presence' ? 'presence' : 'id' });
});

export default router;
