import { Router } from 'express';
import { supabaseFor } from '../lib/supabase.js';
import { groq, SYSTEM_PROMPT, DEFAULT_MODEL } from '../lib/groq.js';

const router = Router();

const MAX_MESSAGES = 12;

// Per-user quota (in-memory, best-effort on serverless): on top of the
// per-IP limiter in api/index.js, cap how many completions a single
// account can start per minute so a scripted/hijacked session can't drain
// the GROQ budget on its own.
const USER_CHAT_LIMIT = 20; // completions per minute per user
const USER_CHAT_WINDOW_MS = 60 * 1000;
const userChatHits = new Map();

function consumeChatQuota(userId) {
  const now = Date.now();
  let hits = userChatHits.get(userId);
  if (!hits) {
    hits = [];
    userChatHits.set(userId, hits);
  }
  while (hits.length && now - hits[0] > USER_CHAT_WINDOW_MS) hits.shift();
  if (hits.length >= USER_CHAT_LIMIT) return false;
  hits.push(now);
  // Keep the map from growing forever with stale users.
  if (userChatHits.size > 10_000) {
    for (const [id, arr] of userChatHits) {
      while (arr.length && now - arr[0] > USER_CHAT_WINDOW_MS) arr.shift();
      if (arr.length === 0) userChatHits.delete(id);
    }
  }
  return true;
}

function bearer(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
}

router.post('/', async (req, res) => {
  // The assistant is a member feature and every completion costs money, so
  // reject unauthenticated callers before streaming anything to GROQ.
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Missing session token.' });

  const sb = supabaseFor(token);
  const { data: { user }, error: authError } = await sb.auth.getUser();
  if (authError || !user) return res.status(401).json({ error: 'Invalid session.' });

  if (!consumeChatQuota(user.id)) {
    return res.status(429).json({ error: 'Chat quota reached for this minute — try again shortly.' });
  }

  const { messages } = req.body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required.' });
  }

  const history = messages
    .filter((m) => m && (m.content || '').trim())
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content).slice(0, 4000) }));

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  try {
    const stream = await groq.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...history],
      temperature: 0.7,
      max_tokens: 900,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) send({ delta });
    }
    send({ done: true });
  } catch (err) {
    send({ error: err.message || 'The assistant is unreachable right now.' });
  }
  res.end();
});

router.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'codex-api' });
});

export default router;
