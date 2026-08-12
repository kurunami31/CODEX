import 'dotenv/config';

export function env(name) {
  return process.env[name] || '';
}

export function missingEnv(name) {
  return !process.env[name];
}

export function configBanner(req, res, next) {
  const missing = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'GROQ_API_KEY'].filter(missingEnv);
  if (missing.length > 0) {
    return res.status(500).json({
      error: `Server configuration incomplete. Missing env vars: ${missing.join(', ')}`,
      hint: 'Copy .env.example to .env and fill in the values (or set them in the Vercel dashboard).',
    });
  }
  next();
}

// Signed identity QRs are valid for the whole academic year (~366 days).
// They're re-issued once per school year by the org; the on-screen ID shows
// the same QR all year instead of rotating every few minutes.
export const ID_SIGN_TTL_MS = 366 * 24 * 60 * 60 * 1000;
