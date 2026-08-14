import { getFreshSession, supabase } from './supabase';

export async function fetchFeedHn() {
  const res = await fetch('/api/feed/hackernews');
  if (!res.ok) throw new Error('HN feed unavailable');
  return res.json();
}

export async function fetchFeedGitHub() {
  const res = await fetch('/api/feed/github');
  if (!res.ok) throw new Error('GitHub feed unavailable');
  return res.json();
}

export async function chatStream(messages, onDelta, signal) {
  // The chat endpoint requires a valid session (GROQ usage costs money) —
  // send the access token and refresh it once if the server rejects it.
  const session = await getFreshSession();
  if (!session) throw new Error('Session expired — log in again.');

  const send = (token) =>
    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ messages }),
      signal,
    });

  let res = await send(session.access_token);
  if (res.status === 401) {
    const { data: fresh, error } = await supabase.auth.refreshSession();
    if (!error && fresh?.session) res = await send(fresh.session.access_token);
  }

  if (!res.ok) {
    let detail = 'The assistant is unreachable.';
    try {
      const j = await res.json();
      detail = j.error || detail;
    } catch { /* ignore */ }
    throw new Error(detail);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const data = line.replace(/^data:\s*/, '').trim();
      if (!data) continue;
      try {
        const payload = JSON.parse(data);
        if (payload.delta) onDelta(payload.delta);
        if (payload.error) throw new Error(payload.error);
      } catch (err) {
        if (err instanceof SyntaxError) continue;
        throw err;
      }
    }
  }
}
