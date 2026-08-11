import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { CheckIcon, RssIcon, CalendarIcon, IdIcon, BotIcon, EyeIcon, EyeOffIcon } from '../components/icons/Icons';

const YEARS = ['1st Year', '2nd Year', '3rd Year', '4th Year'];

// Supabase rate-limits auth endpoints per IP (default 30/hour). Since the
// window is opaque from the client, back off 10 minutes per 429 and cap at
// one hour so students stop hammering the endpoint while it's exhausted.
const COOLDOWN_MS = 10 * 60 * 1000;
const COOLDOWN_CAP_MS = 60 * 60 * 1000;
const fmtCountdown = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function Auth() {
  const { login, register } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [tab, setTab] = useState('login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needsVerify, setNeedsVerify] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const cooldownLeft = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

  const extendCooldown = () => {
    setNow(Date.now());
    setCooldownUntil((c) => Math.min(Math.max(c || 0, Date.now()) + COOLDOWN_MS, Date.now() + COOLDOWN_CAP_MS));
  };

  useEffect(() => {
    if (cooldownUntil <= 0) return;
    const t = setInterval(() => {
      if (Date.now() >= cooldownUntil) clearInterval(t);
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(t);
  }, [cooldownUntil]);

  const [form, setForm] = useState({
    email: '',
    password: '',
    fullName: '',
    studentId: '',
    yearLevel: YEARS[1],
    section: '',
  });

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (tab === 'login') {
        const { error } = await login(form.email.trim(), form.password);
        if (error) throw error;
        toast.ok('Welcome back', 'Session established. Opening the terminal…');
        navigate((location.state && location.state.from) || '/app/feed', { replace: true });
      } else {
        if (!form.fullName.trim() || !form.studentId.trim() || !form.section.trim()) {
          throw new Error('Fill in your full name, student ID and section.');
        }
        const { error } = await register({
          email: form.email.trim(),
          password: form.password,
          studentId: form.studentId.trim(),
          fullName: form.fullName.trim(),
          yearLevel: form.yearLevel,
          section: form.section.trim(),
        });
        if (error) {
          if (error.message?.toLowerCase().includes('confirm')) {
            setNeedsVerify(true);
            toast.info('Check your inbox', 'Supabase sent you a confirmation link.');
          } else {
            throw error;
          }
        } else {
          toast.ok('Account created', 'Welcome to the CODEBYTERS community!');
          navigate('/app/feed', { replace: true });
        }
      }
    } catch (err) {
      if (err.status === 429) {
        extendCooldown();
        setError('');
      } else {
        setError(err.message || 'Something went wrong.');
        if (err.code === 'invalid_credentials') setError('Wrong email or password.');
      }
    } finally {
      setBusy(false);
    }
  };

  if (needsVerify) {
    return (
      <div className="ver-mask grid-bg">
        <div className="ver-card panel" style={{ padding: 34, borderRadius: 'var(--r-xl)' }}>
          <div className="icon"><CheckIcon width={30} height={30} /></div>
          <h3>One last step</h3>
          <p>
            We sent a confirmation link to <b>{form.email}</b>. Open it, then come back and log in.
            (Tip: if email confirmation is enabled in your Supabase project, new sign-ups need this
            before their profile activates.)
          </p>
          <button className="btn btn-accent btn-sm" onClick={() => { setNeedsVerify(false); setTab('login'); }}>
            Got it — back to login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      <aside className="auth-left">
        <div className="blob" style={{ width: 380, height: 380, top: -100, left: -100, background: 'rgba(14,208,182,0.2)' }} />
        <div className="brand">
          <img src="/assets/codebyterts-logo.gif" alt="CODEBYTERS logo" />
          <span className="brand-name">CODEBYTERS</span>
        </div>

        <div className="auth-pitch grid-bg-dark">
          <div className="ocr-label ocr-label--light" style={{ marginBottom: 14 }}>community · identity · knowledge</div>
          <h2>Your student life,<br />digitized.</h2>
          <p>
            Sign in to unlock the full CODEX experience — your digital ID, org event
            attendance, member feed, and the AI assistant that never sleeps.
          </p>
          <ul className="auth-points">
            <li>
              <span className="pt"><IdIcon width={14} height={14} /></span>
              One QR ID for every CODEBYTERS event
            </li>
            <li>
              <span className="pt"><RssIcon width={14} height={14} /></span>
              Daily learning fuel from Hacker News &amp; GitHub
            </li>
            <li>
              <span className="pt"><CalendarIcon width={14} height={14} /></span>
              Org announcements &amp; event schedules
            </li>
            <li>
              <span className="pt"><BotIcon width={14} height={14} /></span>
              CODEX AI — tutor, helper, study buddy
            </li>
          </ul>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative', zIndex: 2 }}>
          <img src="/assets/dorsu-logo.png" alt="DOrSU" style={{ width: 40, height: 40, objectFit: 'contain' }} />
          <div className="ocr-label ocr-label--light" style={{ fontSize: 9, lineHeight: 1.8 }}>
            davao oriental state university<br />bachelor of science in information technology
          </div>
        </div>
      </aside>

      <main className="auth-right grid-bg">
        <div className="auth-card">
          <div className="logo-row">
            <img src="/assets/codebyterts-logo.gif" alt="CODEBYTERS" />
            <span>CODEX</span>
          </div>

          <div className="auth-tabs">
            <button className={`auth-tab${tab === 'login' ? ' auth-tab--on' : ''}`} onClick={() => { setTab('login'); setError(''); }}>Log in</button>
            <button className={`auth-tab${tab === 'signup' ? ' auth-tab--on' : ''}`} onClick={() => { setTab('signup'); setError(''); }}>Create account</button>
          </div>

          {tab === 'signup' && (
            <div className="auth-tips">
              <b>Sign-up tips</b>
              <ul>
                <li>Use a real student ID — each ID can only register once.</li>
                <li>If asked to confirm your email, click the link we send (check spam).</li>
                <li>Campus Wi-Fi shares one sign-up limit — wait if the form asks you to.</li>
              </ul>
            </div>
          )}

          <form className="panel" style={{ padding: 26 }} onSubmit={handleSubmit}>
            <div className="auth-form">
              {tab === 'signup' && (
                <>
                  <div className="field">
                    <label htmlFor="fullName">Full name</label>
                    <input id="fullName" className="input" placeholder="Juan Dela Cruz" value={form.fullName} onChange={set('fullName')} autoComplete="name" />
                  </div>
                  <div className="auth-grid2">
                    <div className="field">
                      <label htmlFor="studentId">Student ID</label>
                      <input id="studentId" className="input" placeholder="2024-1001" value={form.studentId} onChange={set('studentId')} autoComplete="off" />
                    </div>
                    <div className="field">
                      <label htmlFor="section">Section</label>
                      <input id="section" className="input" placeholder="A / B / C" value={form.section} onChange={set('section')} autoComplete="off" />
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor="yearLevel">Year level</label>
                    <select id="yearLevel" className="select" value={form.yearLevel} onChange={set('yearLevel')}>
                      {YEARS.map((y) => <option key={y}>{y}</option>)}
                    </select>
                  </div>
                </>
              )}
              <div className="field">
                <label htmlFor="email">DOrSU email</label>
                <input id="email" className="input" type="email" placeholder="you@student.codex.org" value={form.email} onChange={set('email')} autoComplete="email" required />
              </div>
              <div className="field">
                <label htmlFor="password">Password</label>
                <div className="pwd-wrap">
                  <input id="password" className="input pwd-input" type={showPwd ? 'text' : 'password'} placeholder="••••••••••" value={form.password} onChange={set('password')} autoComplete={tab === 'login' ? 'current-password' : 'new-password'} required minLength={6} />
                  <button
                    type="button"
                    className="pwd-toggle"
                    onClick={() => setShowPwd((s) => !s)}
                    aria-label={showPwd ? 'Hide password' : 'Show password'}
                    title={showPwd ? 'Hide password' : 'Show password'}
                  >
                    {showPwd ? <EyeOffIcon width={18} height={18} /> : <EyeIcon width={18} height={18} />}
                  </button>
                </div>
              </div>

              {cooldownLeft > 0 && (
                <div className="rate-note">
                  <span style={{ flexShrink: 0 }}>!</span>
                  <span>
                    Supabase is rate-limiting this network — {tab === 'login' ? 'logins' : 'sign-ups'} are paused.
                    Try again in <b>{fmtCountdown(cooldownLeft)}</b>, or use mobile data / a different network.
                  </span>
                </div>
              )}

              {error && (
                <div className="err-box">
                  <span style={{ flexShrink: 0 }}>!</span>
                  <span>{error}</span>
                </div>
              )}

              <button type="submit" className="btn btn-accent btn-lg auth-submit" disabled={busy || cooldownLeft > 0}>
                {busy
                  ? (tab === 'login' ? 'Authenticating…' : 'Creating account…')
                  : cooldownLeft > 0
                    ? `Try again in ${fmtCountdown(cooldownLeft)}`
                    : tab === 'login' ? 'Log in' : 'Join CODEBYTERS'}
              </button>
            </div>
          </form>

          <div className="auth-note">
            <img src="/assets/dorsu-logo.png" alt="DOrSU" />
            Reserved for the students of <b>Davao Oriental State University</b> · BSIT program
          </div>
        </div>
      </main>
    </div>
  );
}
