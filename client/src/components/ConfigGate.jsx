import { useAuth } from '../context/AuthContext';
import { AlertIcon, TerminalIcon, SparkIcon } from './icons/Icons';

export default function ConfigGate() {
  const { ready } = useAuth();

  if (ready) return null;

  return (
    <div className="ver-mask grid-bg">
      <div className="ver-card panel" style={{ padding: 34, borderRadius: 'var(--r-xl)' }}>
        <div className="icon"><AlertIcon width={30} height={30} /></div>
        <h3>Connection not configured</h3>
        <p>
          CODEX needs its environment variables to talk to Supabase.
          Create a <code>.env</code> file in the project root (copy{' '}
          <code>.env.example</code>) and add <code>VITE_SUPABASE_URL</code> and{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> (prefixed with <code>VITE_</code> — those are
          the ones the browser reads), then restart with <code>npm run dev</code>.
        </p>
        <div className="ocr-label" style={{ marginBottom: 14, textAlign: 'left', lineHeight: 2 }}>
          <TerminalIcon width={13} height={13} style={{ verticalAlign: -2, marginRight: 6 }} />
          tips: never put GROQ_API_KEY or SECRET_KEY in the client
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <SparkIcon width={16} height={16} style={{ color: 'var(--accent-2)' }} />
          <span className="ocr-label" style={{ fontSize: 9 }}>security: secrets live server-side only</span>
        </div>
      </div>
    </div>
  );
}
