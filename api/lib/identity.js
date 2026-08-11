import crypto from 'node:crypto';
import { env, ID_SIGN_TTL_MS } from './env.js';

// Every QR code is signed with an HMAC derived from the server-only
// SECRET_KEY. A forged or reused QR (other than the rightful owner's
// fresh one) fails signature verification before any attendance is
// recorded. The key never leaves the server.

function signer() {
  const secret = env('SECRET_KEY');
  if (!secret) throw new Error('SECRET_KEY is not configured — add it to .env (see .env.example)');
  return crypto.createHmac('sha256', secret);
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function un64url(s) {
  return Buffer.from(s, 'base64url').toString('utf8');
}

// Payload: { sid: student_id, n: full_name, iat: epoch_ms }
export function signIdentity(payload) {
  const body = b64url(JSON.stringify(payload));
  const sig = signer().update(body).digest('base64url');
  return { payload: body, sig };
}

export function verifyIdentity(payloadB64, sigB64) {
  const expected = signer().update(payloadB64).digest('base64url');
  const a = Buffer.from(expected);
  const b = Buffer.from(sigB64);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { error: 'Invalid QR signature — this QR was not issued by CODEX.' };
  }
  let payload;
  try {
    payload = JSON.parse(un64url(payloadB64));
  } catch {
    return { error: 'Malformed QR payload.' };
  }
  if (!payload.sid || typeof payload.sid !== 'string') {
    return { error: 'QR payload is missing the student ID.' };
  }
  if (typeof payload.iat !== 'number' || Date.now() - payload.iat > ID_SIGN_TTL_MS) {
    return { error: 'QR has expired — ask the student to refresh their ID.' };
  }
  if (payload.iat > Date.now() + 60_000) {
    return { error: 'QR timestamp is invalid.' };
  }
  return { payload };
}
