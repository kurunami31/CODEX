import { Router } from 'express';
import { supabaseFor } from '../lib/supabase.js';
import { groq, SYSTEM_PROMPT, DEFAULT_MODEL } from '../lib/groq.js';

const router = Router();

const MAX_MESSAGES = 12;

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
