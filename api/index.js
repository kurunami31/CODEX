import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { configBanner } from './lib/env.js';
import { supabase } from './lib/supabase.js';
import feedRouter from './routes/feed.js';
import chatRouter from './routes/chat.js';
import attendanceRouter from './routes/attendance.js';
import adminRouter from './routes/admin.js';
import pushRouter from './routes/push.js';

const app = express();

app.disable('x-powered-by');

// Vercel routes traffic through its edge proxy — trust the first hop so
// the rate limiters key on the real client IP instead of a single shared
// proxy IP (otherwise every visitor shares one 120/min bucket).
app.set('trust proxy', 1);

// ── Security headers ─────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: false, // HTML CSP is set by Vercel headers (see vercel.json)
    crossOriginEmbedderPolicy: false,
  })
);
app.use(helmet.hidePoweredBy());
app.use(helmet.noSniff());
app.use(helmet.frameguard({ action: 'deny' }));
app.use(helmet.referrerPolicy({ policy: 'strict-origin-when-cross-origin' }));
app.use(helmet.hsts({ maxAge: 63072000, includeSubDomains: true, preload: true }));
app.use(helmet.permittedCrossDomainPolicies({ permittedPolicies: 'none' }));

// ── No CORS: the API is strictly same-origin (Vite dev proxy / Vercel).
//    Cross-origin callers are rejected by the browser and never reach us.

// ── Request hardening ────────────────────────────────────────────
app.use(express.json({ limit: '16kb', strict: true }));

// Health check stays reachable even before env vars are configured.
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'codex-api' });
});

// Public status — lets the frontend show a maintenance page without
// touching Supabase credentials, and works for logged-out visitors.
app.get('/api/status', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value, updated_at')
      .eq('key', 'maintenance')
      .maybeSingle();
    if (error) throw error;
    const { count, error: countError } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true });
    if (countError) throw countError;
    const v = data?.value ?? {};
    res.set('Cache-Control', 'no-store');
    res.json({
      maintenance: {
        enabled: Boolean(v.enabled),
        message: typeof v.message === 'string' && v.message ? v.message : null,
        updatedAt: data?.updated_at || null,
      },
      members: count ?? 0,
    });
  } catch {
    res.status(500).json({ error: 'Could not read app status.' });
  }
});

// Generic API rate limit: 120 req / min / IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests — slow down a bit.' },
});

// Stricter chat limit: the GROQ backend costs money, so abuse gets cut off early.
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 12,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Chat quota reached for this minute. Try again shortly.' },
});

// Attendance/scan endpoints: sensitive, so per-IP limits are low.
// (The presence-QR signer is student-facing and rotates every 90s, so it
// gets headroom: ~40/min worst case, plus the yearly ID signer.)
const staffLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests — slow down a bit.' },
});

app.use(configBanner);

app.use('/api', apiLimiter);
app.use('/api/feed', feedRouter);
app.use('/api/chat', chatLimiter, chatRouter);
app.use('/api', staffLimiter, attendanceRouter);
app.use('/api/admin', staffLimiter, adminRouter);
app.use('/api', pushRouter);
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Central error handler — never leak stack traces to clients.
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON body.' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large.' });
  }
  res.status(500).json({ error: 'Internal server error.' });
});

export default app;
