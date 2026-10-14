import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase, apiFetch } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatEventDate, formatTime } from '../lib/format';
import { isStaff as checkStaff } from '../lib/roles';
import {
  XIcon, FlashIcon, CameraIcon, QrIcon, CheckIcon, AlertIcon,
  ChevronLeftIcon, CalendarIcon, LockIcon, UnlockIcon,
} from '../components/icons/Icons';

// The four explicit scan actions. Each stamps exactly one attendance column,
// so "time in" and "time out" are separate operations.
const PHASES = [
  { key: 'time_in_am', label: 'AM In', session: 'am' },
  { key: 'time_out_am', label: 'AM Out', session: 'am' },
  { key: 'time_in_pm', label: 'PM In', session: 'pm' },
  { key: 'time_out_pm', label: 'PM Out', session: 'pm' },
];
const PHASE_LABEL = {
  time_in_am: 'AM time in', time_out_am: 'AM time out',
  time_in_pm: 'PM time in', time_out_pm: 'PM time out',
};
const isAmPhase = (key) => key === 'time_in_am' || key === 'time_out_am';
const LOCK_STATES = ['auto', 'open', 'locked'];

// Session state for an event: combines the manual lock with the automatic
// AM/PM window. `open` decides whether a scan button is usable.
function sessionInfo(ev, isAm) {
  const lock = (isAm ? ev?.scan_am : ev?.scan_pm) || 'auto';
  if (lock === 'locked') return { lock, open: false, label: 'locked' };
  if (lock === 'open') return { lock, open: true, label: 'open (override)' };
  const start = isAm ? ev?.am_start : ev?.pm_start;
  const end = isAm ? ev?.am_end : ev?.pm_end;
  if (!start || !end) return { lock, open: false, label: 'no window set' };
  const now = Date.now();
  if (now < new Date(start).getTime()) return { lock, open: false, label: 'not started yet' };
  if (now > new Date(end).getTime()) return { lock, open: false, label: 'session ended' };
  if (ev?.event_end && now > new Date(ev.event_end).getTime()) return { lock, open: false, label: 'event ended' };
  return { lock, open: true, label: 'open' };
}

export default function ScannerPage() {
  const { eventId } = useParams();
  const { profile } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [events, setEvents] = useState([]);
  const [activeEvent, setActiveEvent] = useState(null);
  const [scannerState, setScannerState] = useState('idle'); // idle | starting | scanning | error
  const [error, setError] = useState('');
  const [torchOn, setTorchOn] = useState(false);
  const [manualId, setManualId] = useState('');
  const [result, setResult] = useState(null);
  const [scanError, setScanError] = useState('');
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('time_in_am');
  const [lockBusy, setLockBusy] = useState(false);
  const [, setTick] = useState(0); // periodic re-render so window state stays fresh

  const scannerRef = useRef(null);
  const busyRef = useRef(false);
  const cooldownRef = useRef(false);
  const lastDecodedRef = useRef({ text: '', time: 0 });
  const phaseRef = useRef(phase);
  const activeEventRef = useRef(activeEvent);
  phaseRef.current = phase;
  activeEventRef.current = activeEvent;

  const isStaff = checkStaff(profile?.role);

  useEffect(() => {
    if (!isStaff) navigate('/app/feed', { replace: true });
  }, [isStaff, navigate]);

  const loadEvents = async () => {
    const { data } = await supabase.from('events').select('*').order('event_date', { ascending: true });
    setEvents(data || []);
    if (eventId && eventId !== '0') {
      const found = (data || []).find((e) => e.id === eventId);
      if (found) setActiveEvent(found);
    }
  };

  useEffect(() => {
    loadEvents();
  }, [eventId]);

  // Re-evaluate the windows every 30s so "not started" flips to "open" on its own.
  useEffect(() => {
    if (!activeEvent) return;
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, [activeEvent]);

  const amInfo = sessionInfo(activeEvent, true);
  const pmInfo = sessionInfo(activeEvent, false);
  const infoFor = (key) => (isAmPhase(key) ? amInfo : pmInfo);
  const canScan = !!activeEvent && infoFor(phase).open;

  // Keep the selected phase on an open session when the current one closes.
  useEffect(() => {
    if (!activeEvent) return;
    if (!infoFor(phase).open) {
      const next = PHASES.find((p) => infoFor(p.key).open);
      if (next) setPhase(next.key);
    }
  }, [activeEvent, amInfo.open, pmInfo.open]); // eslint-disable-line react-hooks/exhaustive-deps

  const setLock = async (isAm, state) => {
    const ev = activeEventRef.current;
    if (!ev || lockBusy) return;
    setLockBusy(true);
    const { error: err } = await supabase.rpc('set_event_scan_lock', {
      p_event_id: ev.id,
      p_session: isAm ? 'am' : 'pm',
      p_state: state,
    });
    setLockBusy(false);
    if (err) return toast.error('Lock update failed', err.message);
    const patch = { [isAm ? 'scan_am' : 'scan_pm']: state };
    setActiveEvent((e) => ({ ...e, ...patch }));
    setEvents((list) => list.map((e) => (e.id === ev.id ? { ...e, ...patch } : e)));
    toast.ok('Scan window updated', `${isAm ? 'AM' : 'PM'} session set to “${state}”.`);
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
      } catch { /* already stopped */ }
      scannerRef.current = null;
    }
    setScannerState('idle');
  };

  const startScanner = async () => {
    if (!activeEvent || scannerRef.current) return;
    setScannerState('starting');
    setError('');
    setScanError('');
    setResult(null);
    // Brief cooldown so the same QR that was just in frame isn't
    // re-scanned the instant the camera resumes.
    cooldownRef.current = true;
    setTimeout(() => { cooldownRef.current = false; }, 1500);
    const scanner = new Html5Qrcode('qr-reader');
    scannerRef.current = scanner;
    try {
      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 15,
          qrbox: (vw, vh) => {
            const size = Math.floor(Math.min(vw, vh) * 0.75);
            return { width: Math.max(size, 160), height: Math.max(size, 160) };
          },
        },
        (decoded) => handleScan(decoded),
        () => { /* decode misses are expected while aiming */ }
      );
      // The browser mirrors FRONT-facing camera streams by default
      // (selfie style) — on a PC the scanner uses the laptop webcam
      // (front-facing), so the preview looks flipped/inverse. Rear
      // cameras are never mirrored. Undo the flip only when the
      // resolved track is front-facing.
      const video = document.querySelector('#qr-reader video');
      const track = video?.srcObject?.getVideoTracks?.()[0];
      if (video && track?.getSettings?.().facingMode === 'user') {
        video.style.transform = 'scaleX(-1)';
        video.style.webkitTransform = 'scaleX(-1)';
      }
      setScannerState('scanning');
    } catch (err) {
      const msg = String(err?.message || '');
      if (/NotAllowed|Permission|permission/i.test(msg)) {
        setError('Camera permission denied. Enable camera access in your browser settings, or use manual entry below.');
      } else if (/NotFound/i.test(msg)) {
        setError('No camera found on this device. Use manual entry below.');
      } else if (/NotReadable|in use/i.test(msg)) {
        setError('Camera is in use by another app. Close it and retry.');
      } else {
        setError('Could not start the camera: ' + msg);
      }
      setScannerState('error');
    }
  };

  const handleScan = async (decoded) => {
    if (busyRef.current || cooldownRef.current) return;

    // Guard: never send a scan for a locked / closed session.
    const ph = phaseRef.current;
    if (!sessionInfo(activeEventRef.current, isAmPhase(ph)).open) {
      setScanError(`${PHASE_LABEL[ph]} is not open right now.`);
      return;
    }

    // Dedup: ignore the exact same QR payload within 5 seconds
    const now = Date.now();
    if (decoded === lastDecodedRef.current.text && now - lastDecodedRef.current.time < 5000) {
      return;
    }
    lastDecodedRef.current = { text: decoded, time: now };
    busyRef.current = true;

    let parsed;
    try {
      parsed = JSON.parse(decoded);
    } catch {
      toast.error('Invalid QR', 'That code is not a CODEX identity QR.');
      busyRef.current = false;
      return;
    }
    // Normalize the compact { p, s } shape (used by the ID card) to the
    // canonical { payload, sig } the API verifies.
    const qr = {
      payload: parsed.payload ?? parsed.p,
      sig: parsed.sig ?? parsed.s,
    };
    if (!qr.payload || !qr.sig) {
      toast.error('Invalid QR', 'Missing signature fields.');
      busyRef.current = false;
      return;
    }

    setBusy(true);
    try {
      const res = await apiFetch('/api/attendance/scan', {
        body: { eventId: activeEventRef.current.id, qr, phase: ph },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Scan rejected.');
      if (navigator.vibrate) navigator.vibrate([90, 40, 90]);
      setResult(body);
      setScanError('');
    } catch (err) {
      setScanError(err.message);
      setResult(null);
      if (navigator.vibrate) navigator.vibrate(180);
    } finally {
      setBusy(false);
      // busyRef stays TRUE — blocks further scans until "Scan next" is clicked.
      // This prevents the same QR from being re-decoded at 15 fps while the
      // result panel is visible, which previously flooded the API and made
      // the scanner appear broken.
    }
  };

  const handleScanNext = () => {
    setResult(null);
    setScanError('');
    busyRef.current = false;
    // Cooldown: prevents re-scanning the same QR that's still in frame
    cooldownRef.current = true;
    setTimeout(() => { cooldownRef.current = false; }, 2000);
  };

  const toggleTorch = async () => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    try {
      const caps = scanner.getRunningTrackCapabilities?.() || {};
      const next = !torchOn;
      if (!caps.torch) {
        toast.info('Torch', 'Your device does not support the flash light.');
        return;
      }
      await scanner.applyVideoConstraints({ advanced: [{ torch: next }] });
      setTorchOn(next);
    } catch {
      toast.info('Torch', 'Could not toggle the flash on this device.');
    }
  };

  const manualSubmit = async () => {
    const sid = manualId.trim().toUpperCase();
    if (!sid) return;
    if (!activeEvent) {
      toast.error('Pick an event first', 'Choose the event above before recording attendance.');
      return;
    }
    if (!canScan) {
      setScanError(`${PHASE_LABEL[phase]} is not open right now.`);
      return;
    }
    // Manual entry cannot carry a signature, so it goes straight to the
    // RLS-protected RPC — moderator role is enforced server-side.
    busyRef.current = true;
    setBusy(true);
    const { data, error: err } = await supabase.rpc('mark_attendance', {
      p_event_id: activeEvent.id,
      p_student_id: sid,
      p_phase: phase,
    });
    setBusy(false);
    busyRef.current = false;
    if (err) {
      setScanError(err.message);
      setResult(null);
      return;
    }
    setResult(data);
    setScanError('');
    setManualId('');
  };

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
    };
  }, []);

  return (
    <div className="scanner-screen">
      <div className="scanner-top">
        <button className="btn btn-dark btn-sm" onClick={() => navigate(-1)}>
          <ChevronLeftIcon width={15} height={15} /> Back
        </button>
        <span className="t cursor-blink">qr attendance · v3</span>
        <button className="icon-btn" style={{ background: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.16)', color: '#eafffa' }} onClick={() => navigate(-1)} aria-label="Close scanner">
          <XIcon width={16} height={16} />
        </button>
      </div>

      <div className="scanner-stage grid-bg-dark">
        {!activeEvent ? (
          <div style={{ width: 'min(380px, 92vw)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <CalendarIcon width={18} height={18} style={{ color: 'var(--accent)' }} />
              <b style={{ fontSize: 16, color: '#eafffa' }}>Pick an event to scan for</b>
            </div>
            {events.map((ev) => {
              const d = formatEventDate(ev.event_date);
              const lockedAny = ev.scan_am === 'locked' || ev.scan_pm === 'locked';
              return (
                <button key={ev.id} className="btn btn-dark" style={{ justifyContent: 'flex-start', padding: '14px 16px', textAlign: 'left' }} onClick={() => setActiveEvent(ev)}>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ color: '#eafffa', fontWeight: 600 }}>
                      {lockedAny && <LockIcon width={12} height={12} style={{ marginRight: 6, verticalAlign: -2 }} />}
                      {ev.title}
                    </span>
                    <span className="ocr-label ocr-label--light" style={{ fontSize: 9 }}>{d.day} · {d.time}</span>
                  </span>
                </button>
              );
            })}
            {events.length === 0 && <p className="scan-hint">No events found — create one from the admin panel first.</p>}
          </div>
        ) : (
          <>
            <div style={{ textAlign: 'center' }}>
              <div className="ocr-label ocr-label--light">scanning for</div>
              <b style={{ color: '#eafffa', fontSize: 15 }}>{activeEvent.title}</b>
            </div>

            {/* ── scan action: 4 explicit phases ── */}
            <div className="scan-phase">
              <div className="ocr-label ocr-label--light">scan action</div>
              <div className="scan-phase-grid">
                {PHASES.map((p) => {
                  const info = infoFor(p.key);
                  const active = phase === p.key;
                  return (
                    <button
                      key={p.key}
                      className={`btn btn-sm ${active ? 'btn-accent' : 'btn-dark'}`}
                      disabled={!info.open}
                      title={info.open ? `${PHASE_LABEL[p.key]} — open` : `${PHASE_LABEL[p.key]} — ${info.label}`}
                      onClick={() => setPhase(p.key)}
                    >
                      {!info.open && <LockIcon width={12} height={12} />} {p.label}
                    </button>
                  );
                })}
              </div>
              <div className="scan-phase-status">
                <span className={amInfo.open ? 'is-open' : 'is-locked'}>
                  {amInfo.open ? <UnlockIcon width={11} height={11} /> : <LockIcon width={11} height={11} />} AM · {amInfo.label}
                </span>
                <span className={pmInfo.open ? 'is-open' : 'is-locked'}>
                  {pmInfo.open ? <UnlockIcon width={11} height={11} /> : <LockIcon width={11} height={11} />} PM · {pmInfo.label}
                </span>
              </div>
            </div>

            {/* ── staff controls: lock / open / auto per session ── */}
            <div className="scan-locks">
              {[{ isAm: true, label: 'AM' }, { isAm: false, label: 'PM' }].map(({ isAm, label }) => {
                const cur = (isAm ? activeEvent.scan_am : activeEvent.scan_pm) || 'auto';
                return (
                  <div key={label} className="scan-lock-row">
                    <span className="scan-lock-label">{label}</span>
                    {LOCK_STATES.map((s) => (
                      <button
                        key={s}
                        className={`btn btn-sm ${cur === s ? 'btn-accent' : 'btn-dark'}`}
                        disabled={lockBusy}
                        onClick={() => setLock(isAm, s)}
                        title={s === 'auto' ? 'follow the event window' : s === 'open' ? 'force open (override the window)' : 'force closed'}
                      >
                        {s === 'locked' ? <LockIcon width={11} height={11} /> : s === 'open' ? <UnlockIcon width={11} height={11} /> : null} {s}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>

            <div className="scan-window" id="qr-reader" />
            <div className="scan-frame">
              <span className="corner c-tl" /><span className="corner c-tr" />
              <span className="corner c-bl" /><span className="corner c-br" />
              <span className="scan-line" />
            </div>

            <p className="scan-hint">
              {!canScan && <><LockIcon width={12} height={12} style={{ verticalAlign: -2 }} /> {PHASE_LABEL[phase]} is not open — pick another action or unlock it above.</>}
              {canScan && scannerState === 'starting' && 'waking the camera…'}
              {canScan && scannerState === 'scanning' && `recording ${PHASE_LABEL[phase]} — point at the student’s ID`}
              {scannerState === 'error' && error}
            </p>

            {error && (
              <div style={{ width: 'min(360px, 90vw)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="err-box"><AlertIcon width={15} height={15} /><span>{error}</span></div>
                <button className="btn btn-dark" onClick={startScanner}><CameraIcon width={15} height={15} /> Retry camera</button>
              </div>
            )}

            <div className="scanner-actions">
              {scannerState === 'scanning' && (
                <button className="btn btn-dark" onClick={toggleTorch} aria-pressed={torchOn}>
                  <FlashIcon width={16} height={16} /> {torchOn ? 'Flash on' : 'Flash off'}
                </button>
              )}
              {(scannerState === 'error' || scannerState === 'idle') && (
                <button className="btn btn-accent" onClick={startScanner} disabled={!canScan}>
                  <CameraIcon width={16} height={16} /> Start camera
                </button>
              )}
            </div>

            <div className="scan-manual">
              <input
                className="input"
                placeholder="Manual entry — student ID (e.g. 2024-1001)"
                value={manualId}
                onChange={(e) => setManualId(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && manualSubmit()}
              />
              <button className="btn btn-accent" onClick={manualSubmit} disabled={busy || !canScan}>
                <CheckIcon width={16} height={16} />
              </button>
            </div>
          </>
        )}
      </div>

      {(result || scanError) && activeEvent && (
        <div className="scan-result">
          {scanError && (
            <div className="err-box" style={{ marginBottom: 12 }}><AlertIcon width={15} height={15} /><span>{scanError}</span></div>
          )}
          {!result && (
            <button className="btn btn-accent" style={{ width: '100%' }} onClick={handleScanNext}>
              <QrIcon width={16} height={16} /> Scan next
            </button>
          )}
          {result && (
            <>
              <div className="res-head">
                <span className="avatar avatar--ring-teal" style={{ width: 44, height: 44, fontSize: 15 }}>
                  {result.student?.full_name?.split(/\s+/).slice(0, 2).map((w) => w[0]).join('') || '?'}
                </span>
                <div>
                  <b>{result.student?.full_name}</b>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {result.phase ? PHASE_LABEL[result.phase] : result.status}
                    {result.phase && result[result.phase] && <span style={{ marginLeft: 8 }}>{formatTime(result[result.phase])}</span>}
                    <span style={{ marginLeft: 8, color: 'var(--muted)' }}>{result.student?.course}</span>
                  </div>
                </div>
                <span className={`chip ${result.phase?.includes('_out') ? 'chip--warn' : 'chip--ok'}`} style={{ marginLeft: 'auto' }}>
                  <CheckIcon width={12} height={12} /> {result.session || ''} {result.phase?.includes('_out') ? 'out' : 'in'}
                </span>
              </div>
              <div className="res-grid">
                <div><div className="k">id no.</div><div className="v" style={{ fontFamily: 'var(--f-ocr)' }}>{result.student?.student_id}</div></div>
                <div><div className="k">year / section</div><div className="v">{result.student?.year_level} · {result.student?.section}</div></div>
                <div><div className="k">session</div><div className="v">{result.session || '—'}</div></div>
                <div><div className="k">action</div><div className="v">{result.phase ? PHASE_LABEL[result.phase] : '—'}</div></div>
                <div><div className="k">time</div><div className="v">{result.phase && result[result.phase] ? formatTime(result[result.phase]) : <span style={{ color: 'var(--warn)' }}>—</span>}</div></div>
                <div><div className="k">qr type</div><div className="v">{result.qrType === 'presence' ? 'live presence ✓' : 'year ID'}</div></div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-accent" style={{ flex: 1 }} onClick={handleScanNext} disabled={busy}>
                  <QrIcon width={16} height={16} /> Scan next
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
