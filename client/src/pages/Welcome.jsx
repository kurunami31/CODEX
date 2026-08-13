import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ChevronRightIcon, RssIcon, CalendarIcon, IdIcon, BotIcon } from '../components/icons/Icons';

export default function Welcome() {
  const { session } = useAuth();

  return (
    <div className="welcome scanlines">
      <div className="blob" style={{ width: 420, height: 420, top: -120, right: -80, background: 'rgba(14,208,182,0.22)' }} />
      <div className="blob" style={{ width: 380, height: 380, bottom: 40, left: -140, background: 'rgba(26,93,120,0.55)' }} />

      <nav className="welcome-nav">
        <div className="brand">
          <img src="/assets/codebyterts-logo.gif" alt="CODEBYTERS logo" />
          <span className="brand-name">CODEBYTERS</span>
        </div>
        <div className="brand-sub ocr-label ocr-label--light welcome-org">
          dorsu · faculty of computing · engineering &amp; technology · b.s.i.t.
        </div>
      </nav>

      <main className="welcome-hero grid-bg-dark">
        <img className="welcome-logo" src="/assets/bot.gif" alt="CODEBYTERS mascot" />
        <div className="welcome-tag cursor-blink">welcome to the community platform of</div>
        <h1 className="welcome-title">CODEX</h1>
        <p className="welcome-desc">
          One terminal for the CODEBYTERS squad — attend org events with a scan, keep up with
          members, learn from live feeds, and get help from the in-house AI assistant.
          Built for BSIT students, by BSIT students.
        </p>
        <div className="welcome-cta">
          <Link to={session ? '/app/feed' : '/auth'} className="btn btn-accent btn-lg">
            {session ? 'Open the terminal' : 'Get started'}
            <ChevronRightIcon width={18} height={18} />
          </Link>
          <Link to={session ? '/app/events' : '/auth'} className="btn btn-dark btn-lg">
            View events
          </Link>
        </div>
        <div className="welcome-stats">
          <div className="stat"><b>4</b><span>org chapters</span></div>
          <div className="stat"><b>QR</b><span>attendance system</span></div>
          <div className="stat"><b>24/7</b><span>ai assistant</span></div>
        </div>
      </main>

      <section className="welcome-gallery">
        <div className="gallery-item">
          <img src="/assets/community-1.jpg" alt="CODEBYTERS community" />
        </div>
        <div className="gallery-item">
          <img src="/assets/community-2.jpg" alt="CODEBYTERS event" />
        </div>
        <div className="gallery-item" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10, background: 'rgba(14,208,182,0.07)', border: '1px solid rgba(14,208,182,0.25)' }}>
          <div className="ocr-label ocr-label--light" style={{ padding: '0 16px' }}>what&apos;s inside</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '6px 16px 18px' }}>
            {[
              { icon: <RssIcon width={18} height={18} />, label: 'Live learning feeds — HN + GitHub' },
              { icon: <CalendarIcon width={18} height={18} />, label: 'Org events & QR attendance' },
              { icon: <IdIcon width={18} height={18} />, label: 'Digital student ID for BSIT' },
              { icon: <BotIcon width={18} height={18} />, label: 'AI assistant, always online' },
            ].map((f) => (
              <div key={f.label} style={{ display: 'flex', gap: 10, alignItems: 'center', color: 'rgba(234,255,250,0.85)', fontSize: 14 }}>
                <span style={{ color: 'var(--accent)', display: 'grid', placeItems: 'center' }}>{f.icon}</span>
                {f.label}
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="welcome-foot">
        <img src="/assets/dorsu-logo.png" alt="Davao Oriental State University" />
        <span>davao oriental state university · codebyters student organization · mati city</span>
        <a className="welcome-fb" href="https://www.facebook.com/codebyters" target="_blank" rel="noopener noreferrer">follow us · facebook.com/codebyters</a>
      </footer>
    </div>
  );
}
