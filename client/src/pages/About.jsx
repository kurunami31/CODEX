import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import {
  ChevronLeftIcon, TerminalIcon, MailIcon, ExternalIcon,
  UsersIcon, CalendarIcon, QrIcon, BotIcon, TrophyIcon, CertificateIcon,
  GavelIcon, HeartIcon, SparkIcon, BoxIcon, RssIcon,
} from '../components/icons/Icons';
import TiltCard from '../components/effects/TiltCard';
import SpotlightCard from '../components/effects/SpotlightCard';
import FadeIn from '../components/effects/FadeIn';
import AnimatedCounter from '../components/effects/AnimatedCounter';
import GlowBorder from '../components/effects/GlowBorder';
import Background3D from '../components/effects/Background3D';

export default function About() {
  const { profile } = useAuth();
  const location = useLocation();
  const isPublic = location.pathname === '/about';
  const [stats, setStats] = useState({ members: 0, events: 0, posts: 0 });

  useEffect(() => {
    (async () => {
      const [m, e, p] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('events').select('id', { count: 'exact', head: true }),
        supabase.from('posts').select('id', { count: 'exact', head: true }),
      ]);
      setStats({
        members: m.count || 0,
        events: e.count || 0,
        posts: p.count || 0,
      });
    })();
  }, []);

  const features = [
    { icon: <RssIcon width={16} height={16} />, label: 'Community Feed', desc: 'Share updates, resources, and learn together.' },
    { icon: <CalendarIcon width={16} height={16} />, label: 'Events & RSVP', desc: 'Browse org events and RSVP to stay committed.' },
    { icon: <QrIcon width={16} height={16} />, label: 'QR Attendance', desc: 'Scan-and-go check-in for AM/PM sessions.' },
    { icon: <BotIcon width={16} height={16} />, label: 'AI Assistant', desc: 'CODEX AI — your 24/7 coding & study buddy.' },
    { icon: <TrophyIcon width={16} height={16} />, label: 'Leaderboard', desc: 'Compete, climb ranks, and earn recognition.' },
    { icon: <CertificateIcon width={16} height={16} />, label: 'Certificates', desc: 'Track your event participation and endorsements.' },
    { icon: <GavelIcon width={16} height={16} />, label: 'Elections', desc: 'Vote for the next set of org officers.' },
    { icon: <UsersIcon width={16} height={16} />, label: 'Digital ID', desc: 'Your member ID with QR verification.' },
  ];

  return (
    <div style={isPublic ? { minHeight: '100vh', background: 'var(--bg)', display: 'flex', justifyContent: 'center', padding: '24px 16px' } : undefined}>
      {isPublic && <Background3D />}
      <div className={isPublic ? 'about-3d-wrap' : ''} style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', maxWidth: isPublic ? 560 : undefined }}>
        <Link to={isPublic ? '/welcome' : '/app/feed'} className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}>
          <ChevronLeftIcon width={16} height={16} /> {isPublic ? 'back to welcome' : 'back to feed'}
        </Link>

        {/* ── Hero ────────────────────────────────────────────── */}
        <FadeIn delay={0}>
          <TiltCard maxTilt={8} perspective={1000}>
            <SpotlightCard spotlightColor="rgba(14, 208, 182, 0.12)">
              <article className="panel" style={{ padding: '28px 24px', position: 'relative', overflow: 'hidden' }}>
                <div className="blob" style={{ width: 300, height: 300, top: -120, right: -80, background: 'var(--accent-glow-soft)' }} />
                <div className="grid-bg" style={{ position: 'absolute', inset: 0, opacity: 0.04 }} />
                <div style={{ position: 'relative', zIndex: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                    <BoxIcon width={28} height={28} style={{ color: 'var(--accent)' }} />
                    <h1 style={{ margin: 0, fontSize: 26, fontFamily: 'var(--f-display)' }}>CODEX</h1>
                  </div>
                  <p style={{ margin: '0 0 16px', fontSize: 14.5, lineHeight: 1.7, color: 'var(--ink-soft)', maxWidth: 540 }}>
                    The official community platform of <b>CODEBYTERS</b> — the Bachelor of Science in Information Technology (BSIT) student organization of Davao Oriental State University.
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span className="chip chip--teal"><HeartIcon width={12} height={12} /> built with passion</span>
                    <span className="chip chip--ok"><SparkIcon width={12} height={12} /> open source spirit</span>
                    <span className="chip"><TerminalIcon width={12} height={12} /> v1.0 — SY 2026–2027</span>
                  </div>
                </div>
              </article>
            </SpotlightCard>
          </TiltCard>
        </FadeIn>

        {/* ── Platform Stats ──────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          <FadeIn delay={0.1}>
            <GlowBorder glowColor="var(--accent)">
              <div className="panel" style={{ padding: '18px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontFamily: 'var(--f-display)', color: 'var(--accent)' }}>
                  <AnimatedCounter target={stats.members} duration={1200} className="anim-num" />
                </div>
                <span className="ocr-label">members</span>
              </div>
            </GlowBorder>
          </FadeIn>
          <FadeIn delay={0.2}>
            <GlowBorder glowColor="var(--accent)">
              <div className="panel" style={{ padding: '18px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontFamily: 'var(--f-display)', color: 'var(--accent)' }}>
                  <AnimatedCounter target={stats.events} duration={1200} className="anim-num" />
                </div>
                <span className="ocr-label">events hosted</span>
              </div>
            </GlowBorder>
          </FadeIn>
          <FadeIn delay={0.3}>
            <GlowBorder glowColor="var(--accent)">
              <div className="panel" style={{ padding: '18px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontFamily: 'var(--f-display)', color: 'var(--accent)' }}>
                  <AnimatedCounter target={stats.posts} duration={1200} className="anim-num" />
                </div>
                <span className="ocr-label">feed posts</span>
              </div>
            </GlowBorder>
          </FadeIn>
        </div>

        {/* ── What CODEX Offers ───────────────────────────────── */}
        <FadeIn delay={0.2}>
          <div className="panel" style={{ padding: '20px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <SparkIcon width={18} height={18} style={{ color: 'var(--accent-2)' }} />
              <b style={{ fontSize: 15 }}>what CODEX offers</b>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              {features.map((f, i) => (
                <FadeIn key={f.label} delay={0.05 * i}>
                  <TiltCard maxTilt={6} perspective={1200}>
                    <SpotlightCard spotlightColor="rgba(14, 208, 182, 0.1)">
                      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 'var(--r-md)', transition: 'background 0.2s ease' }}>
                        <span style={{ color: 'var(--accent)', marginTop: 2 }}>{f.icon}</span>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13.5 }}>{f.label}</div>
                          <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.5 }}>{f.desc}</div>
                        </div>
                      </div>
                    </SpotlightCard>
                  </TiltCard>
                </FadeIn>
              ))}
            </div>
          </div>
        </FadeIn>

        {/* ── About CODEBYTERS ────────────────────────────────── */}
        <FadeIn delay={0.3}>
          <TiltCard maxTilt={5} perspective={1200}>
            <SpotlightCard spotlightColor="rgba(26, 93, 120, 0.08)">
              <div className="panel" style={{ padding: '20px 22px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <UsersIcon width={18} height={18} style={{ color: 'var(--accent-2)' }} />
                  <b style={{ fontSize: 15 }}>about CODEBYTERS</b>
                </div>
                <p style={{ margin: '0 0 12px', fontSize: 14, lineHeight: 1.7, color: 'var(--ink-soft)' }}>
                  CODEBYTERS is the official BSIT student organization of <b>Davao Oriental State University (DOrSU)</b>.
                  We are a community of IT students who believe in <b>Innovate. Inspire. Impact.</b> — building real-world skills through collaboration, competitions, and community service.
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span className="chip chip--teal">BSIT · DOrSU</span>
                  <span className="chip chip--ok">Innovate. Inspire. Impact.</span>
                  <span className="chip">SY 2026–2027</span>
                </div>
              </div>
            </SpotlightCard>
          </TiltCard>
        </FadeIn>

        {/* ── Developed By ────────────────────────────────────── */}
        <FadeIn delay={0.35}>
          <TiltCard maxTilt={6} perspective={1000}>
            <SpotlightCard spotlightColor="rgba(14, 208, 182, 0.1)">
              <div className="panel" style={{ padding: '20px 22px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <TerminalIcon width={18} height={18} style={{ color: 'var(--accent-2)' }} />
                  <b style={{ fontSize: 15 }}>developed by</b>
                </div>

                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  {/* Photo */}
                  <div style={{ position: 'relative', flexShrink: 0 }} className="tilt-float">
                    <div
                      style={{
                        width: 160,
                        height: 160,
                        borderRadius: 'var(--r-lg)',
                        overflow: 'hidden',
                        border: '3px solid var(--accent)',
                        boxShadow: '0 0 24px var(--accent-glow-soft)',
                      }}
                    >
                      <img
                        src="/developer.jpg"
                        alt="Christopher Lyod B. Mercado"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => { e.target.style.display = 'none'; e.target.parentElement.innerHTML = '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:var(--bg-2);font-family:var(--f-display);font-size:48px;color:var(--accent)">CM</div>'; }}
                      />
                    </div>
                    <span
                      style={{
                        position: 'absolute',
                        bottom: -12,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        whiteSpace: 'nowrap',
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: '0.04em',
                        padding: '4px 14px',
                        borderRadius: 99,
                        background: 'var(--accent)',
                        color: '#fff',
                        boxShadow: '0 2px 8px rgba(14,208,182,0.4), 0 0 0 2px var(--bg)',
                      }}
                    >
                      V.P. I.C.T.
                    </span>
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <h3 style={{ margin: '0 0 4px', fontSize: 20 }}>Christopher Lyod B. Mercado</h3>
                    <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 12 }}>Just call me Chris!</div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px', fontSize: 13, marginBottom: 14 }}>
                      <span className="ocr-label">program</span>
                      <span><b>BSIT</b> — Bachelor of Science in Information Technology</span>
                      <span className="ocr-label">year</span>
                      <span><b>3rd Year</b> · SY 2026–2027</span>
                      <span className="ocr-label">major</span>
                      <span><b>Business Analytics</b></span>
                      <span className="ocr-label">university</span>
                      <span><b>Davao Oriental State University (DOrSU)</b></span>
                      <span className="ocr-label">role</span>
                      <span><b>Vice President for ICT</b> · CODEBYTERS</span>
                      <span className="ocr-label">student id</span>
                      <span style={{ fontFamily: 'var(--f-ocr)', fontSize: 12 }}>2020-0651</span>
                    </div>

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <a
                        href="https://kurunami31.github.io/Portfolio/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-accent btn-sm"
                      >
                        <ExternalIcon width={13} height={13} /> portfolio
                      </a>
                      <a
                        href="https://www.facebook.com/Christoph3101"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-outline btn-sm"
                      >
                        facebook
                      </a>
                      <a
                        href="mailto:dms.prime3101@gmail.com"
                        className="btn btn-outline btn-sm"
                      >
                        <MailIcon width={13} height={13} /> email
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </SpotlightCard>
          </TiltCard>
        </FadeIn>

        {/* ── Tech Stack ──────────────────────────────────────── */}
        <FadeIn delay={0.4}>
          <GlowBorder glowColor="var(--accent-2)">
            <div className="panel" style={{ padding: '20px 22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <BoxIcon width={18} height={18} style={{ color: 'var(--accent-2)' }} />
                <b style={{ fontSize: 15 }}>tech stack</b>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[
                  'React',
                  'React Router',
                  'Supabase (PostgreSQL + Auth + RLS)',
                  'Vercel',
                  'Groq AI (Qwen 3.6 27B)',
                  'Progressive Web App',
                  'QR Code (qrcode)',
                  'Service Worker',
                ].map((t) => (
                  <span key={t} className="chip">{t}</span>
                ))}
              </div>
            </div>
          </GlowBorder>
        </FadeIn>

        {/* ── Connect ─────────────────────────────────────────── */}
        <FadeIn delay={0.45}>
          <SpotlightCard spotlightColor="rgba(255, 100, 100, 0.08)">
            <div className="panel" style={{ padding: '20px 22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <HeartIcon width={18} height={18} style={{ color: 'var(--accent-2)' }} />
                <b style={{ fontSize: 15 }}>connect with us</b>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <a href="https://www.facebook.com/codebyters" target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm">
                  Facebook · @codebyters
                </a>
                <a href="mailto:codebyters@gmail.com" className="btn btn-outline btn-sm">
                  <MailIcon width={13} height={13} /> codebyters@gmail.com
                </a>
                <a href="https://twitter.com/codebyters" target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm">
                  X / Twitter · @codebyters
                </a>
              </div>
            </div>
          </SpotlightCard>
        </FadeIn>

        {/* ── Footer ──────────────────────────────────────────── */}
        <FadeIn delay={0.5}>
          <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
            {isPublic ? (
              <Link to="/auth" className="btn btn-accent btn-sm" style={{ marginTop: 8 }}>
                Get started
              </Link>
            ) : (
              <span className="ocr-label" style={{ color: 'var(--muted)' }}>
                CODEX v1.0 · CODEBYTERS · DOrSU · SY 2026–2027
              </span>
            )}
          </div>
        </FadeIn>
      </div>
    </div>
  );
}
