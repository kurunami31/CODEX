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

const PITCH_POINTS = [
  { icon: IdIcon, text: 'One QR ID for every CODEBYTERS event' },
  { icon: RssIcon, text: 'Daily learning fuel from Hacker News & GitHub' },
  { icon: CalendarIcon, text: 'Org announcements & event schedules' },
  { icon: BotIcon, text: 'CODEX AI — tutor, helper, study buddy' },
];

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

  const switchTab = (next) => {
    if (tab === next || busy) return;
    setTab(next);
    setError('');
  };

  const handleSubmit = async (e, mode) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') {
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

  const passwordField = (idPrefix) => (
    <div className="field">
      <label htmlFor={`${idPrefix}-password`}>Password</label>
      <div className="pwd-wrap">
        <input id={`${idPrefix}-password`} className="input pwd-input" type={showPwd ? 'text' : 'password'} placeholder="••••••••••" value={form.password} onChange={set('password')} autoComplete={tab === 'login' ? 'current-password' : 'new-password'} required minLength={6} />
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
  );

  const feedback = (mode) => (
    <>
      {cooldownLeft > 0 && tab === mode && (
        <div className="rate-note">
          <span style={{ flexShrink: 0 }}>!</span>
          <span>
            Supabase is rate-limiting this network — {mode === 'login' ? 'logins' : 'sign-ups'} are paused.
            Try again in <b>{fmtCountdown(cooldownLeft)}</b>, or use mobile data / a different network.
          </span>
        </div>
      )}

      {error && tab === mode && (
        <div className="err-box">
          <span style={{ flexShrink: 0 }}>!</span>
          <span>{error}</span>
        </div>
      )}
    </>
  );

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
    <div className="auth-wrap grid-bg">
      <main className="auth-slider-stage">
        <div className="blob" style={{ width: 380, height: 380, top: -130, left: -110, background: 'rgba(14, 208, 182, 0.32)' }} />
        <div className="blob" style={{ width: 340, height: 340, bottom: -110, right: -100, background: 'rgba(26, 93, 120, 0.7)' }} />
        <div className="blob" style={{ width: 260, height: 260, top: 40, right: -80, background: 'rgba(14, 208, 182, 0.2)' }} />
        <div className="auth-title">CODEX</div>

        <div className={`auth-slider${tab === 'signup' ? ' auth-slider--signup' : ''}`}>
          <div className="auth-slider-forms">
            <section className="auth-slider-panel auth-slider-panel--login">
              <div className="auth-slide-inner">
                <img className="auth-form-bot" src="/assets/bot.gif" alt="CODEBYTERS mascot" />
                <h1 className="auth-slide-title">Log in</h1>
                <p className="auth-slide-sub">Good to see you again — pick up where you left off.</p>
                <form className="auth-slide-form" onSubmit={(e) => handleSubmit(e, 'login')}>
                  <div className="field">
                    <label htmlFor="login-email">DOrSU email</label>
                    <input id="login-email" className="input" type="email" placeholder="you@student.codex.org" value={form.email} onChange={set('email')} autoComplete="email" required />
                  </div>
                  {passwordField('login')}
                  {feedback('login')}
                  <button type="submit" className="btn btn-accent btn-lg auth-submit" disabled={busy || cooldownLeft > 0}>
                    {busy ? 'Authenticating…' : cooldownLeft > 0 ? `Try again in ${fmtCountdown(cooldownLeft)}` : 'Log in'}
                  </button>
                  <button type="button" className="auth-slide-switch" onClick={() => switchTab('signup')}>
                    No account yet? <b>Create one</b> →
                  </button>
                </form>
              </div>
            </section>

            <section className="auth-slider-panel auth-slider-panel--signup">
              <div className="auth-slide-inner">
                <img className="auth-form-bot" src="/assets/bot.gif" alt="CODEBYTERS mascot" />
                <h1 className="auth-slide-title">Create account</h1>
                <p className="auth-slide-sub">Join the community and get your digital ID.</p>
                <form className="auth-slide-form" onSubmit={(e) => handleSubmit(e, 'signup')}>
                  <div className="field">
                    <label htmlFor="signup-fullName">Full name</label>
                    <input id="signup-fullName" className="input" placeholder="Juan Dela Cruz" value={form.fullName} onChange={set('fullName')} autoComplete="name" />
                  </div>
                  <div className="auth-grid2">
                    <div className="field">
                      <label htmlFor="signup-studentId">Student ID</label>
                      <input id="signup-studentId" className="input" placeholder="2024-1001" value={form.studentId} onChange={set('studentId')} autoComplete="off" />
                    </div>
                    <div className="field">
                      <label htmlFor="signup-section">Section</label>
                      <input id="signup-section" className="input" placeholder="A / B / C" value={form.section} onChange={set('section')} autoComplete="off" />
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor="signup-yearLevel">Year level</label>
                    <select id="signup-yearLevel" className="select" value={form.yearLevel} onChange={set('yearLevel')}>
                      {YEARS.map((y) => <option key={y}>{y}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="signup-email">DOrSU email</label>
                    <input id="signup-email" className="input" type="email" placeholder="you@student.codex.org" value={form.email} onChange={set('email')} autoComplete="email" required />
                  </div>
                  {passwordField('signup')}
                  {feedback('signup')}
                  <button type="submit" className="btn btn-accent btn-lg auth-submit" disabled={busy || cooldownLeft > 0}>
                    {busy ? 'Creating account…' : cooldownLeft > 0 ? `Try again in ${fmtCountdown(cooldownLeft)}` : 'Join CODEBYTERS'}
                  </button>
                  <button type="button" className="auth-slide-switch" onClick={() => switchTab('login')}>
                    Already have an account? <b>Log in</b>
                  </button>
                </form>
              </div>
            </section>
          </div>

          <div className="auth-slider-overlay">
            <div className="auth-slider-overlay-inner">
              <section className="auth-overlay-panel auth-overlay-panel--signup scanlines">
                <div className="auth-overlay-inner">
                  <div className="blob" style={{ width: 300, height: 300, top: -90, left: -80, background: 'rgba(14,208,182,0.2)' }} />
                  <div className="auth-overlay-brand">
                    <img src="/assets/codebyterts-logo.gif" alt="CODEBYTERS logo" />
                    <span>CODEBYTERS</span>
                  </div>

                  <div className="auth-overlay-body">
                    <div className="ocr-label ocr-label--light" style={{ marginBottom: 12 }}>community · identity · knowledge</div>
                    <h2>New to the org?<br />Create your account.</h2>
                    <p>
                      Join the CODEBYTERS community — unlock your digital ID, org event
                      attendance, member feed, and the AI assistant that never sleeps.
                    </p>
                    <ul className="auth-points">
                      {PITCH_POINTS.map(({ icon: Icon, text }) => (
                        <li key={text}>
                          <span className="pt"><Icon width={13} height={13} /></span>
                          {text}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="auth-overlay-foot">
                    <button className="btn btn-accent" onClick={() => switchTab('signup')}>
                      Sign up <span aria-hidden>→</span>
                    </button>
                    <div className="auth-overlay-dorsu">
                      <img src="/assets/dorsu-logo.png" alt="DOrSU" />
                      <span className="ocr-label ocr-label--light" style={{ fontSize: 9, lineHeight: 1.8 }}>
                        davao oriental state university<br />bachelor of science in information technology
                      </span>
                    </div>
                  </div>
                </div>
              </section>

              <section className="auth-overlay-panel auth-overlay-panel--login scanlines">
                <div className="auth-overlay-inner">
                  <div className="blob" style={{ width: 300, height: 300, top: -90, left: -80, background: 'rgba(14,208,182,0.2)' }} />
                  <div className="auth-overlay-brand">
                    <img src="/assets/codebyterts-logo.gif" alt="CODEBYTERS logo" />
                    <span>CODEBYTERS</span>
                  </div>

                  <div className="auth-overlay-body">
                    <div className="ocr-label ocr-label--light" style={{ marginBottom: 12 }}>community · identity · knowledge</div>
                    <h2>Welcome back.<br />Your ID missed you.</h2>
                    <p>
                      Sign in to unlock the full CODEX experience — your digital ID, org event
                      attendance, member feed, and the AI assistant that never sleeps.
                    </p>
                    <ul className="auth-points">
                      {PITCH_POINTS.map(({ icon: Icon, text }) => (
                        <li key={text}>
                          <span className="pt"><Icon width={13} height={13} /></span>
                          {text}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="auth-overlay-foot">
                    <button className="btn btn-accent" onClick={() => switchTab('login')}>
                      <span aria-hidden>←</span> Log in
                    </button>
                    <div className="auth-overlay-dorsu">
                      <img src="/assets/dorsu-logo.png" alt="DOrSU" />
                      <span className="ocr-label ocr-label--light" style={{ fontSize: 9, lineHeight: 1.8 }}>
                        davao oriental state university<br />bachelor of science in information technology
                      </span>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>

        <div className="auth-note">
          <img src="/assets/dorsu-logo.png" alt="DOrSU" />
          Reserved for the students of <b>Davao Oriental State University</b> · BSIT program
        </div>
      </main>
    </div>
  );
}
