import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Avatar from '../components/Avatar';
import { drawIdCard } from '../lib/drawIdCard';
import { IdIcon, QrIcon, DownloadIcon, CheckIcon, AlertIcon, ClockIcon, CalendarIcon } from '../components/icons/Icons';

export default function MyId() {
  const { profile, user } = useAuth();
  const toast = useToast();
  const [qr, setQr] = useState('');
  const [qrError, setQrError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [expiresIn, setExpiresIn] = useState(300);
  const [myEvents, setMyEvents] = useState([]);

  const downloadId = async () => {
    if (downloading || !qr) return;
    setDownloading(true);
    try {
      // make sure display fonts (Nulshock / OCR A) are loaded before drawing
      await document.fonts.ready;
      const canvas = document.createElement('canvas');
      canvas.width = 856;
      canvas.height = 540;
      const ctx = canvas.getContext('2d');
      await drawIdCard(ctx, { profile, avatarUrl: profile?.avatar_url, qr });
      const a = document.createElement('a');
      a.download = `codex-id-${String(profile?.student_id || 'student').replace(/[^a-z0-9-]/gi, '')}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
      toast.ok('ID downloaded', 'The QR is scannable for a few minutes — re-download before each event.');
    } catch (err) {
      toast.error('Download failed', err?.message || 'Could not render your ID.');
    } finally {
      setDownloading(false);
    }
  };

  const signQr = useCallback(async () => {
    if (!profile) return;
    setRefreshing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Session expired — log in again.');
      const res = await fetch('/api/id/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Could not sign your ID.');
      }
      const { payload, sig } = await res.json();
      const url = await QRCode.toDataURL(JSON.stringify({ payload, sig }), {
        width: 480,
        margin: 1,
        color: { dark: '#0b2b3a', light: '#ffffff' },
        errorCorrectionLevel: 'H',
      });
      setQr(url);
      setQrError('');
      setExpiresIn(300);
    } catch (err) {
      setQrError(err.message);
    } finally {
      setRefreshing(false);
    }
  }, [profile]);

  useEffect(() => {
    signQr();
    const t = setInterval(signQr, 280000);
    return () => clearInterval(t);
  }, [signQr]);

  useEffect(() => {
    const t = setInterval(() => setExpiresIn((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('attendance')
        .select('event_id, scanned_at, events(title, event_date)')
        .order('scanned_at', { ascending: false });
      if (data) setMyEvents(data);
    })();
  }, []);

  if (!profile) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 20 }}>My digital ID</h2>
        <span className="ocr-label">your key to every codebyters event</span>
      </div>

      <div className="idcard-stage">
        <div className="idcard">
          <div className="idcard-head">
            <img src="/assets/dorsu-logo.png" alt="DOrSU" />
            <div className="idcard-org">
              <b>CODEBYTERS</b>
              <span>bsit student organization</span>
            </div>
          </div>
          <div className="idcard-strip">official student identity · bsit</div>
          <div className="idcard-main">
            <div className="idcard-photo">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt={`ID photo of ${profile.full_name}`} />
              ) : (
                <Avatar name={profile.full_name} seed={user.id} size={56} />
              )}
            </div>
            <div className="idcard-info">
              <div className="lbl">name</div>
              <div className="idcard-name">{profile.full_name}</div>
              <div className="lbl" style={{ marginTop: 8 }}>details</div>
              <div className="idcard-details">
                YEAR : {profile.year_level}<br />
                SEC  : {profile.section}<br />
                ID   : {profile.student_id}
              </div>
            </div>
            <div className="idcard-qr">
              {qr ? (
                <img src={qr} alt="Student QR code" />
              ) : qrError ? (
                <div style={{ width: 96, fontSize: 9, color: 'var(--danger)', textAlign: 'center', lineHeight: 1.4 }}>{qrError}</div>
              ) : (
                <div className="skeleton" style={{ width: 96, height: 96 }} />
              )}
              <span>scan me</span>
            </div>
          </div>
          <div className="idcard-foot">
            <span>davao oriental state university</span>
            <span className="code">est. 2018 · republic act 11033</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button className="btn btn-primary btn-sm" onClick={downloadId} disabled={downloading || !qr}>
            <DownloadIcon width={15} height={15} /> {downloading ? 'Rendering…' : 'Download ID'}
          </button>
          <button className="btn btn-accent btn-sm" onClick={signQr} disabled={refreshing}>
            <QrIcon width={15} height={15} /> {refreshing ? 'Refreshing…' : 'Refresh QR'}
          </button>
          {qr && (
            <span className="chip chip--teal">
              <ClockIcon width={12} height={12} /> expires in {Math.floor(expiresIn / 60)}:{String(expiresIn % 60).padStart(2, '0')}
            </span>
          )}
          {qr && (
            <span className="chip">
              <DownloadIcon width={12} height={12} /> saved QR is scannable for ~5 min — refresh before each event
            </span>
          )}
          <span className="chip">
            <AlertIcon width={12} height={12} style={{ color: 'var(--warn)' }} /> raise brightness for faster scans
          </span>
        </div>
      </div>

      <div className="section-title">
        <CalendarIcon width={14} height={14} /> my attendance history
      </div>

      {myEvents.length === 0 ? (
        <div className="empty-state panel">
          <span className="ico"><IdIcon width={24} height={24} /></span>
          <b>No attendance yet</b>
          <p>Go to an event, show your QR to a moderator, and it lands here instantly.</p>
        </div>
      ) : (
        <div className="event-list">
          {myEvents.map((m) => (
            <div className="event-card panel" key={m.event_id} style={{ alignItems: 'center' }}>
              <span className="chip chip--ok"><CheckIcon width={13} height={13} /> present</span>
              <div className="event-body">
                <b>{m.events?.title || 'Event'}</b>
                <div className="event-meta" style={{ marginTop: 4 }}>
                  <span><CalendarIcon width={14} height={14} />{m.events?.event_date ? new Date(m.events.event_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
