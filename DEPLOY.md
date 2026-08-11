# CODEX — Deployment & Setup Guide

## 1. Local development

```bash
# from the project root
npm install
```

Create `.env` (copy from `.env.example`):

| Variable | Where to get it |
|---|---|
| `SUPABASE_URL` | Supabase → Project Settings → API |
| `SUPABASE_ANON_KEY` | Supabase → Project Settings → API (public anon key) |
| `GROQ_API_KEY` | https://console.groq.com/keys |
| `SECRET_KEY` | generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

**Important:** for the browser to read them, Supabase values must also exist as
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The easiest way: define both
variants in `.env`.

```bash
npm run dev        # API on :3001, web on :5173
```

## 2. Supabase setup

1. Create a project at https://supabase.com
2. Open **SQL Editor** → paste the contents of `database/schema.sql` → **Run**.
   This creates tables, RLS policies, attendance RPCs, the identity lock
   trigger, and demo accounts.
3. **Authentication → Providers → Email**: decide on "Confirm email".
   - For a fast demo: turn it OFF.
   - For real use: keep it ON (recommended) and update the Site URL.
4. Demo accounts (from the seed):

   | Role | Email | Password |
   |---|---|---|
   | Admin | `admin@codex.org` | `CodexAdmin2026!` |
   | Moderator | `moderator@codex.org` | `CodexMod2026!` |
   | Student | `juan.delos@student.codex.org` | `Student2026!` |
   | Student | `maria.santos@student.codex.org` | `Student2026!` |

## 3. Deploy to Vercel

1. Push this folder to a GitHub repo.
2. In Vercel → **Add New Project** → import the repo.
3. Vercel auto-detects the setup from `vercel.json` (Vite client build +
   Express serverless function in `api/`). Framework preset: **Vite**.
4. Add **Environment Variables** (Production + Preview):
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `VITE_SUPABASE_URL` (same value)
   - `VITE_SUPABASE_ANON_KEY` (same value)
   - `GROQ_API_KEY`
   - `SECRET_KEY`
5. **Deploy**. Your site gets HTTPS automatically — required for the camera
   QR scanner to work on phones.

## 4. How the attendance flow works (end-to-end)

1. **Admin** creates an event (Control panel or Events → New event).
2. **Student** opens **My ID** → the app asks the API for a **signed** QR
   (`POST /api/id/sign`). The payload `{sid, name, iat}` is HMAC-SHA256 signed
   with `SECRET_KEY` and **expires in 5 minutes**.
3. **Moderator/Admin** opens the event → **Open scanner** → the phone camera
   scans the student's QR.
4. The scanner sends the QR to `POST /api/attendance/scan` with the
   moderator's session token. The server:
   - verifies the session (Supabase JWT),
   - checks the caller's role is moderator/admin,
   - **verifies the QR signature and expiry**,
   - records attendance via the RLS-protected `mark_attendance` RPC
     (duplicates rejected, BSIT-only enforced).
5. **Admin/Moderator** sees the full attendance log on the event page;
   **student** sees their own history on My ID.

**Manual fallback:** if a camera is unavailable, the scanner page accepts a
manual student ID — still role-checked server-side.

## 5. Security checklist (already built in)

- [x] Row Level Security on every table; attendance only via SECURITY DEFINER RPCs
- [x] Role/student-ID immutable after sign-up (trigger + RLS `with check`)
- [x] QR codes HMAC-signed + 5-minute expiry (anti-forgery, anti-replay)
- [x] GROQ key + `SECRET_KEY` never leave the server
- [x] Helmet security headers, HSTS, `X-Frame-Options: DENY`
- [x] Production Content-Security-Policy via Vercel headers
- [x] `Permissions-Policy: camera=(self)` — camera only for our own page
- [x] Rate limiting (120/min API, 12/min chat, 30/min staff endpoints)
- [x] Request body cap (16 KB), no CORS (strictly same-origin)
- [x] `X-Powered-By` removed, no stack traces leaked
- [x] Server-side input validation + prompt injection guards on chat
