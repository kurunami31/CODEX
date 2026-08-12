import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { configBanner } from './lib/env.js';
import feedRouter from './routes/feed.js';
import chatRouter from './routes/chat.js';
import attendanceRouter from './routes/attendance.js';
import adminRouter from './routes/admin.js';

const app = express();

app.disable('x-powered-by');

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
app.use(helmet.hsts({ maxAge: 31536000, preload: true }));
app.use(helmet.permittedCrossDomainPolicies({ permittedPolicies: 'none' }));

// ── No CORS: the API is strictly same-origin (Vite dev proxy / Vercel).
//    Cross-origin callers are rejected by the browser and never reach us.

// ── Request hardening ────────────────────────────────────────────
app.use(express.json({ limit: '16kb', strict: true }));

// Health check stays reachable even before env vars are configured.
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'codex-api' });
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

// Attendance/ID endpoints: sensitive, so per-IP limits are low.
const staffLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
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
