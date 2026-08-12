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
   This creates tables, RLS policies, attendance RPCs and the identity lock
   trigger. **No demo accounts are seeded anymore** (they used to reserve
   student IDs like `2024-1001` and block real sign-ups). Fresh databases
   also start with **zero events** — an admin creates those from the app.
   Note: `client/check-avatar.mjs` / `client/check-posts.mjs` still expect
   the old demo credentials; against a fresh DB they need a real account.
3. **Authentication → Providers → Email**: decide on "Confirm email".
   - **OFF** → instant sign-ups (student fills the form and is in).
   - **ON** (recommended for real use) → verified sign-ups. The app shows a
     "check your inbox" screen and completes the student's profile
     automatically after they confirm. Update the Site URL to your domain.
4. If your database was created with the **old** schema (demo accounts
   seeded), remove them once in the SQL Editor so real students can use
   those IDs:

   ```sql
   delete from public.profiles
    where student_id in ('ADM-0001','MOD-0001','2024-1001','2024-1002');
   delete from auth.users
    where id in ('aaaaaaaa-0000-4000-8000-000000000001',
                 'aaaaaaaa-0000-4000-8000-000000000002',
                 'aaaaaaaa-0000-4000-8000-000000000003',
                 'aaaaaaaa-0000-4000-8000-000000000004');
   ```

## 2.5. Going live — account creation checklist

If new sign-ups fail, check in this order:

1. **Supabase rate limits (the #1 cause).** Supabase caps `/auth/v1/signup`
   at **30 requests per hour per IP**. Students on campus Wi-Fi share one
   public IP, so a batch of sign-ups can collectively trip it — the form
   shows "Too many sign-up attempts…" with a countdown (HTTP 429).
   → Project Settings → **Authentication → Rate Limits** → raise **Signup**
   (and **Login**) to e.g. 300/hour. Higher caps may require a paid plan.
   The Management API cannot change this; it's dashboard-only.
2. **Email confirmation** — see step 3 above. If "One last step — check your
   inbox" appears, the student must click the link (check spam). Re-entering
   the same email later says "User already registered".
3. **Duplicate student ID** — student IDs are unique per account. If the
   error says "already registered to another account", the ID is taken
   (possibly by an old demo row — see step 4 above).
4. **Email rate limit** — Supabase also limits confirmation emails to a
   single address (~4/hour). Retrying the same address repeatedly shows
   "Email rate limit exceeded"; wait about an hour.

## 2.6. Super admin — full control role

The `superadmin` role manages everything: every member (edit details, change
roles, delete accounts), every post (moderate), and every attendance record.
Admins keep their existing event + attendance powers; **only a superadmin can
change roles**, and student IDs can never be rewritten — even by one.

1. After the schema has run, promote an existing account in the SQL Editor
   (runs as postgres, so the role-lock trigger permits it):

   ```sql
   update public.profiles p set role = 'superadmin'
   from auth.users u
   where p.id = u.id and u.email = 'you@yourdomain.com';
   ```

2. Log in with that account → the sidebar now shows **Super Admin** (Root
   access). From there you can:
   - **Students** — search all members, see emails, enroll new students
     (email + password), edit details, change roles, delete accounts.
   - **Posts** — browse every post and delete any of them.
   - **Attendance** — see the full log across events and remove mistaken scans.
3. Enrolling students and seeing emails uses the **service-role key** — it must
   exist as `SUPABASE_SERVICE_ROLE_KEY` in the server env (Vercel) or `.env`
   locally. The key never reaches the browser; the API verifies the caller is
   a superadmin before using it.

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
   - `SUPABASE_SERVICE_ROLE_KEY` (only needed for the Super Admin features;
     get it from Supabase → Project Settings → API → `service_role` key)
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
- [x] Student ID immutable after sign-up (trigger + RLS `with check`); roles
      changeable only by a superadmin (trigger-enforced)
- [x] QR codes HMAC-signed + 5-minute expiry (anti-forgery, anti-replay)
- [x] GROQ key + `SECRET_KEY` never leave the server
- [x] Helmet security headers, HSTS, `X-Frame-Options: DENY`
- [x] Production Content-Security-Policy via Vercel headers
- [x] `Permissions-Policy: camera=(self)` — camera only for our own page
- [x] Rate limiting (120/min API, 12/min chat, 30/min staff endpoints)
- [x] Request body cap (16 KB), no CORS (strictly same-origin)
- [x] `X-Powered-By` removed, no stack traces leaked
- [x] Server-side input validation + prompt injection guards on chat
