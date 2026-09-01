import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import {
  ChevronLeftIcon, TerminalIcon, GithubIcon, MailIcon, ExternalIcon,
  UsersIcon, CalendarIcon, QrIcon, BotIcon, TrophyIcon, CertificateIcon,
  GavelIcon, HeartIcon, SparkIcon, BoxIcon, RssIcon,
} from '../components/icons/Icons';

export default function About() {
  const { profile } = useAuth();
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Link to="/app/feed" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}>
        <ChevronLeftIcon width={16} height={16} /> back to feed
      </Link>

      {/* ── Hero ────────────────────────────────────────────── */}
      <article className="panel" style={{ padding: '28px 24px', position: 'relative', overflow: 'hidden' }}>
        <div className="blob" style={{ width: 300, height: 300, top: -120, right: -80, background: 'var(--accent-glow-soft)' }} />
        <div className="grid-bg" style={{ position: 'absolute', inset: 0, opacity: 0.04 }} />
        <div style={{ position: 'relative' }}>
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
            <span className="chip"><TerminalIcon width={12} height={12} /> v1.0 — SY 2025–2026</span>
          </div>
        </div>
      </article>

      {/* ── Platform Stats ──────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        <div className="panel" style={{ padding: '18px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontFamily: 'var(--f-display)', color: 'var(--accent)' }}>{stats.members}</div>
          <span className="ocr-label">members</span>
        </div>
        <div className="panel" style={{ padding: '18px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontFamily: 'var(--f-display)', color: 'var(--accent)' }}>{stats.events}</div>
          <span className="ocr-label">events hosted</span>
        </div>
        <div className="panel" style={{ padding: '18px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontFamily: 'var(--f-display)', color: 'var(--accent)' }}>{stats.posts}</div>
          <span className="ocr-label">feed posts</span>
        </div>
      </div>

      {/* ── What CODEX Offers ───────────────────────────────── */}
      <div className="panel" style={{ padding: '20px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <SparkIcon width={18} height={18} style={{ color: 'var(--accent-2)' }} />
          <b style={{ fontSize: 15 }}>what CODEX offers</b>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          {[
            { icon: <RssIcon width={16} height={16} />, label: 'Community Feed', desc: 'Share updates, resources, and learn together.' },
            { icon: <CalendarIcon width={16} height={16} />, label: 'Events & RSVP', desc: 'Browse org events and RSVP to stay committed.' },
            { icon: <QrIcon width={16} height={16} />, label: 'QR Attendance', desc: 'Scan-and-go check-in for AM/PM sessions.' },
            { icon: <BotIcon width={16} height={16} />, label: 'AI Assistant', desc: 'CODEX AI — your 24/7 coding & study buddy.' },
            { icon: <TrophyIcon width={16} height={16} />, label: 'Leaderboard', desc: 'Compete, climb ranks, and earn recognition.' },
            { icon: <CertificateIcon width={16} height={16} />, label: 'Certificates', desc: 'Track your event participation and endorsements.' },
            { icon: <GavelIcon width={16} height={16} />, label: 'Elections', desc: 'Vote for the next set of org officers.' },
            { icon: <UsersIcon width={16} height={16} />, label: 'Digital ID', desc: 'Your member ID with QR verification.' },
          ].map((f) => (
            <div key={f.label} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ color: 'var(--accent)', marginTop: 2 }}>{f.icon}</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{f.label}</div>
                <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.5 }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── About CODEBYTERS ────────────────────────────────── */}
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
          <span className="chip">SY 2025–2026</span>
        </div>
      </div>

      {/* ── Developed By ────────────────────────────────────── */}
      <div className="panel" style={{ padding: '20px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <TerminalIcon width={18} height={18} style={{ color: 'var(--accent-2)' }} />
          <b style={{ fontSize: 15 }}>developed by</b>
        </div>

        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {/* Photo */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
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
              className="chip chip--teal"
              style={{
                position: 'absolute',
                bottom: -8,
                left: '50%',
                transform: 'translateX(-50%)',
                whiteSpace: 'nowrap',
                fontSize: 10,
                padding: '2px 10px',
                boxShadow: 'var(--sh-sm)',
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
              <span><b>3rd Year</b> · SY 2025–2026</span>
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
                href="https://www.facebook.com/kurunami31"
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

      {/* ── Tech Stack ──────────────────────────────────────── */}
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

      {/* ── Connect ─────────────────────────────────────────── */}
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
          <a href="https://github.com/kurunami31/CODEX" target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm">
            <GithubIcon width={13} height={13} /> GitHub
          </a>
        </div>
      </div>

      {/* ── Footer ──────────────────────────────────────────── */}
      <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
        <span className="ocr-label" style={{ color: 'var(--muted)' }}>
          CODEX v1.0 · CODEBYTERS · DOrSU · SY 2025–2026
        </span>
      </div>
    </div>
  );
}
