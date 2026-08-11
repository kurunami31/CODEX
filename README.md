# CODEX — CODEBYTERS Community Platform

The official web platform of **CODEBYTERS**, the BSIT student organization of
**Davao Oriental State University**. A Facebook-inspired community with a
retro-tech identity — member feed, org events, QR attendance, and an AI
assistant — built to be fully usable from a smartphone browser.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite · custom SVG icon set · no UI framework |
| Backend | Express (single serverless function on Vercel) |
| Database & Auth | Supabase (Postgres + RLS + email/password) |
| QR | `qrcode` (generate) · `html5-qrcode` (smartphone camera scan) |
| AI Assistant | GROQ (LLM proxied server-side, streamed via SSE) |
| Learning feeds | Hacker News RSS (`rss-parser`) + GitHub REST API (CDN-cached) |

## Features

- **Loading → Welcome → Auth** flow with the organization's own GIFs, the
  ByteBounce display font, and DOrSU branding.
- **Community feed** — member posts with likes + interleaved learning cards
  (Hacker News front page, GitHub trending repos).
- **Events** — admin-published org events with schedules and locations.
- **QR attendance** — each student gets a digital ID card (Nulshock name,
  OCR A Extended details) with a **cryptographically signed, 5-minute QR**.
  Moderators scan it with their smartphone camera (rear-camera default,
  torch toggle, haptic feedback, manual fallback). Admins see the full
  BSIT-only attendance log.
- **CODEX AI** — GROQ-powered floating assistant tuned for BSIT students.
- **Mobile-first** — bottom navigation, full-screen scanner, safe-area aware.

## Design

- Palette: `#FFFFFF` · `#0ED0B6` · `#1A5D78`
- Fonts (bundled locally): **ByteBounce** (welcome), **Nulshock** (ID name),
  **OCR A Extended** (ID details / terminal labels), **Inter** (body)
- Assets from `client/public/assets/` (org logo, loading GIF, mascot, DOrSU seal)

## Getting started

```bash
npm install
# fill in .env (see .env.example) — Supabase, GROQ, SECRET_KEY
npm run dev
```

Full setup, deployment and the security model: **[DEPLOY.md](DEPLOY.md)**

## Project layout

```
api/            Express app (Vercel serverless function)
  lib/          supabase (per-request JWT), identity (QR HMAC), groq, cache
  routes/       feed (HN RSS + GitHub), chat (GROQ SSE), attendance (sign/scan)
client/         Vite React SPA
  src/pages/    Loading, Welcome, Auth, Feed, Events, EventDetail, MyId,
                ScannerPage, Admin, AppShell
  src/components/ icons (custom), ChatAssistant, Avatar, ConfigGate
database/       schema.sql (tables, RLS, RPCs, seed accounts)
server/         local dev runner
```
