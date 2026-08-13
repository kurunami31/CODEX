import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { supabase, apiFetch } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Avatar from '../components/Avatar';
import { drawIdCard } from '../lib/drawIdCard';
import { IdIcon, QrIcon, DownloadIcon, CheckIcon, AlertIcon, ClockIcon, CalendarIcon } from '../components/icons/Icons';

export default function MyId() {
  const { profile, user } = useAuth();
  const toast = useToast();
  const [qr, setQr] = useState(''); // yearly ID QR
  const [presenceQr, setPresenceQr] = useState(''); // 90s live presence QR
  const [presenceMode, setPresenceMode] = useState(false);
  const [presenceLeft, setPresenceLeft] = useState(90);
  const [qrError, setQrError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [presenceBusy, setPresenceBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [myEvents, setMyEvents] = useState([]);
  const presenceBusyRef = useRef(false);
  const presenceLeftRef = useRef(90);
  const signQrBusyRef = useRef(false);

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

      const filename = `codex-id-${String(profile?.student_id || 'student').replace(/[^a-z0-9-]/gi, '')}.png`;
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Could not render the PNG.');

      // Mobile: hand the file to the OS share sheet — "Save Image" works on
      // iOS Safari and Android Chrome, where <a download> often does nothing.
      if (typeof navigator.canShare === 'function') {
        const file = new File([blob], filename, { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ files: [file], title: 'CODEBYTERS digital ID', text: 'My CODEBYTERS digital ID' });
            toast.ok('ID saved', 'Saved via your device share sheet.');
            return;
          } catch (err) {
            if (err?.name === 'AbortError') return; // user dismissed the sheet — no toast
            // any other share failure falls through to the regular download
          }
        }
      }

      // Desktop / fallback: blob URL download (works where data: URLs don't).
      const url = URL.createObjectURL(blob);
      try {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
      toast.ok('ID downloaded', 'Your ID carries the same year-long QR — no need to re-download.');
    } catch (err) {
      toast.error('Download failed', err?.message || 'Could not render your ID.');
    } finally {
      setDownloading(false);
    }
  };

  // The year-long signed QR is cached in localStorage (keyed per student) so
  // the ID still renders offline / at the venue with weak signal — the payload
  // stays valid for the whole academic year, exactly like the on-screen card.
  const qrCacheKey = profile ? `codex_id_qr_${profile.student_id}` : null;

  const cachedQr = useCallback(() => {
    if (!qrCacheKey) return null;
    try {
      const raw = localStorage.getItem(qrCacheKey);
      if (!raw) return null;
      const { payload, sig, cachedAt } = JSON.parse(raw);
      // 366-day validity, matching ID_SIGN_TTL_MS on the server.
      if (!payload || !sig || Date.now() - cachedAt > 366 * 24 * 60 * 60 * 1000) return null;
      return { payload, sig };
    } catch {
      return null;
    }
  }, [qrCacheKey]);

  const renderQr = useCallback(async (payload, sig) => {
    const url = await QRCode.toDataURL(JSON.stringify({ payload, sig }), {
      width: 480,
      margin: 1,
      color: { dark: '#0b2b3a', light: '#ffffff' },
      errorCorrectionLevel: 'H',
    });
    return url;
  }, []);

  const signQr = useCallback(async () => {
    if (!profile || signQrBusyRef.current) return;
    signQrBusyRef.current = true;
    setRefreshing(true);
    try {
      const res = await apiFetch('/api/id/sign');
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Could not sign your ID.');
      }
      const { payload, sig } = await res.json();
      try {
        localStorage.setItem(qrCacheKey, JSON.stringify({ payload, sig, cachedAt: Date.now() }));
      } catch {
        /* storage full / unavailable — the QR still shows on screen */
      }
      setQr(await renderQr(payload, sig));
      setQrError('');
    } catch (err) {
      // Offline? Fall back to the cached year-long QR instead of failing.
      const cached = cachedQr();
      if (cached) {
        setQr(await renderQr(cached.payload, cached.sig));
        setQrError('');
        toast.info('Offline mode', 'Showing your saved ID QR — it is valid all year.');
      } else {
        setQrError(err.message);
      }
    } finally {
      signQrBusyRef.current = false;
      setRefreshing(false);
    }
  }, [profile, qrCacheKey, cachedQr, renderQr, toast]);

  // Sign once — the QR stays valid for the whole academic year, so there's
  // no periodic refresh. (Refresh is still available manually if ever needed.)
  useEffect(() => {
    signQr();
  }, [signQr]);

  // ── live presence QR (90s) ──────────────────────────────────────
  const signPresence = useCallback(async () => {
    if (!profile || presenceBusyRef.current) return;
    presenceBusyRef.current = true;
    setPresenceBusy(true);
    try {
      const res = await apiFetch('/api/id/presence');
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Could not start presence verification.');
      }
      const { payload, sig } = await res.json();
      const url = await QRCode.toDataURL(JSON.stringify({ payload, sig }), {
        width: 480,
        margin: 1,
        color: { dark: '#0b2b3a', light: '#ffffff' },
        errorCorrectionLevel: 'H',
      });
      setPresenceQr(url);
      presenceLeftRef.current = 90;
      setPresenceLeft(90);
    } catch (err) {
      toast.error('Presence failed', err.message);
      setPresenceMode(false);
      setPresenceQr('');
    } finally {
      presenceBusyRef.current = false;
      setPresenceBusy(false);
    }
  }, [profile, toast]);

  // While presence mode is active: sign immediately, then one 1s tick that
  // counts down and re-signs just before the QR would expire (at 0), so the
  // live QR is never shown dead at the refresh boundary.
  useEffect(() => {
    if (!presenceMode) return undefined;
    signPresence();
    const tick = setInterval(() => {
      presenceLeftRef.current -= 1;
      setPresenceLeft(presenceLeftRef.current);
      if (presenceLeftRef.current <= 0) {
        presenceLeftRef.current = 90;
        signPresence(); // re-sign before the previous QR expires
      }
    }, 1000);
    return () => {
      clearInterval(tick);
      presenceLeftRef.current = 90;
    };
  }, [presenceMode, signPresence]);

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
              {presenceMode ? (
                presenceQr ? (
                  <img src={presenceQr} alt="Live presence QR code" />
                ) : (
                  <div className="skeleton" style={{ width: 96, height: 96 }} />
                )
              ) : qr ? (
                <img src={qr} alt="Student QR code" />
              ) : qrError ? (
                <div style={{ width: 96, fontSize: 9, color: 'var(--danger)', textAlign: 'center', lineHeight: 1.4 }}>{qrError}</div>
              ) : (
                <div className="skeleton" style={{ width: 96, height: 96 }} />
              )}
              <span>{presenceMode ? 'live presence' : 'scan me'}</span>
            </div>
          </div>
          <div className="idcard-foot">
            <span>davao oriental state university</span>
            <span className="code">est. 2018 · republic act 11033</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
          {!presenceMode ? (
            <button className="btn btn-accent btn-sm" onClick={() => setPresenceMode(true)} disabled={!qr}>
              <ClockIcon width={15} height={15} /> Verify presence
            </button>
          ) : (
            <button className="btn btn-outline btn-sm" onClick={() => { setPresenceMode(false); setPresenceQr(''); }}>
              <CheckIcon width={15} height={15} /> Back to my ID
            </button>
          )}
          {!presenceMode && (
            <button className="btn btn-primary btn-sm" onClick={downloadId} disabled={downloading || !qr}>
              <DownloadIcon width={15} height={15} /> {downloading ? 'Rendering…' : 'Download ID'}
            </button>
          )}
          {!presenceMode && (
            <button className="btn btn-dark btn-sm" onClick={signQr} disabled={refreshing}>
              <QrIcon width={15} height={15} /> {refreshing ? 'Refreshing…' : 'Refresh QR'}
            </button>
          )}
          {presenceMode && presenceQr && (
            <span className="chip chip--warn">
              <ClockIcon width={12} height={12} /> live · refresh in 0:{String(presenceLeft).padStart(2, '0')}
            </span>
          )}
          {!presenceMode && qr && (
            <span className="chip chip--teal">
              <CheckIcon width={12} height={12} /> valid for the academic year
            </span>
          )}
          {!presenceMode && qr && (
            <span className="chip">
              <DownloadIcon width={12} height={12} /> same QR on screen and in your saved copy
            </span>
          )}
          <span className="chip">
            <AlertIcon width={12} height={12} style={{ color: 'var(--warn)' }} /> raise brightness for faster scans
          </span>
        </div>
        {presenceMode && (
          <p className="ocr-label" style={{ margin: 0, textAlign: 'center' }}>
            a 90-second live QR that proves you're here — auto-refreshes, can't be reused from a photo
          </p>
        )}
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
