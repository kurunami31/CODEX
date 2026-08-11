import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { chatStream } from '../lib/api';
import { BotIcon, XIcon, SendIcon, SparkIcon, TerminalIcon } from './icons/Icons';

const SUGGESTIONS = [
  'How do I get my attendance recorded?',
  'Give me a study plan for web dev',
  'Explain SQL joins simply',
  'Tips for my first hackathon',
];

export default function ChatAssistant() {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState('');
  const bodyRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, typing, open]);

  const send = async (text) => {
    const content = (text ?? draft).trim();
    if (!content || typing) return;
    setDraft('');
    setError('');
    const history = [...messages, { role: 'user', content }];
    setMessages(history);
    setTyping(true);

    const controller = new AbortController();
    abortRef.current = controller;
    let acc = '';
    const botMsg = { role: 'assistant', content: '' };
    setMessages((m) => [...m, botMsg]);

    try {
      await chatStream(
        history.slice(-10),
        (delta) => {
          acc += delta;
          botMsg.content = acc;
          setMessages((m) => [...m.slice(0, -1), { ...botMsg }]);
        },
        controller.signal
      );
      if (!acc.trim()) {
        botMsg.content = 'The assistant came back empty. Try rephrasing your question.';
        setMessages((m) => [...m.slice(0, -1), { ...botMsg }]);
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      setMessages((m) => [
        ...m.slice(0, -1),
        { role: 'assistant', content: `⚠ ${err.message}` },
      ]);
    } finally {
      setTyping(false);
    }
  };

  return (
    <>
      <button
        className="chat-fab"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close AI assistant' : 'Open AI assistant'}
        style={{ display: open ? 'none' : 'grid' }}
      >
        <BotIcon width={26} height={26} />
        <span className="ping" />
      </button>

      {open && (
        <section className="chat-panel" aria-label="CODEX AI assistant">
          <header className="chat-head">
            <span className="bot-ico"><BotIcon width={20} height={20} /></span>
            <div>
              <b>CODEX AI</b>
              <span>powered by groq · always online</span>
            </div>
            <button className="icon-btn x" onClick={() => setOpen(false)} aria-label="Close assistant">
              <XIcon width={15} height={15} />
            </button>
          </header>

          <div className="chat-msgs" ref={bodyRef}>
            {messages.length === 0 && (
              <>
                <div className="msg msg--bot">
                  Hey <b>{profile?.full_name?.split(' ')[0] || 'there'}</b>! I'm CODEX AI, the org's
                  in-house study buddy. Ask me anything about programming, DOrSU org life,
                  or how this platform works. 🧠
                </div>
                <div className="chat-suggests">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => send(s)}>{s}</button>
                  ))}
                </div>
              </>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`msg msg--${m.role === 'user' ? 'user' : 'bot'}`}>{m.content}</div>
            ))}
            {typing && (
              <div className="typing-dots"><span /><span /><span /></div>
            )}
          </div>

          <div className="chat-input">
            <input
              placeholder="Ask CODEX AI anything…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              maxLength={800}
            />
            <button className="btn btn-accent send" onClick={() => send()} disabled={!draft.trim() || typing} aria-label="Send">
              <SendIcon width={17} height={17} />
            </button>
          </div>
        </section>
      )}
    </>
  );
}
