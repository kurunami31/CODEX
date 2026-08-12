import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatEventDate } from '../lib/format';
import { isStaff as checkStaff } from '../lib/roles';
import {
  XIcon, FlashIcon, CameraIcon, QrIcon, CheckIcon, AlertIcon,
  ChevronLeftIcon, CalendarIcon,
} from '../components/icons/Icons';

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
  const [result, setResult] = useState(null); // { status, student, qrHolder }
  const [scanError, setScanError] = useState('');
  const [busy, setBusy] = useState(false);

  const scannerRef = useRef(null);
  const busyRef = useRef(false);

  const isStaff = checkStaff(profile?.role);

  useEffect(() => {
    if (!isStaff) navigate('/app/feed', { replace: true });
  }, [isStaff, navigate]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('events').select('id, title, event_date').order('event_date', { ascending: true });
      setEvents(data || []);
      if (eventId && eventId !== '0') {
        const found = (data || []).find((e) => e.id === eventId);
        if (found) setActiveEvent(found);
      }
    })();
  }, [eventId]);

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
    const scanner = new Html5Qrcode('qr-reader');
    scannerRef.current = scanner;
    try {
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 260, height: 260 } },
        (decoded) => handleScan(decoded),
        () => { /* decode misses are expected while aiming */ }
      );
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
    if (busyRef.current) return;
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
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Session expired — log in again.');
      const res = await fetch('/api/attendance/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ eventId: activeEvent.id, qr }),
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
      busyRef.current = false;
    }
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
    // Manual entry cannot carry a signature, so it goes straight to the
    // RLS-protected RPC — moderator role is enforced server-side.
    setBusy(true);
    const { data, error: err } = await supabase.rpc('mark_attendance', {
      p_event_id: activeEvent.id,
      p_student_id: sid,
    });
    setBusy(false);
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
        <span className="t cursor-blink">qr attendance · v2</span>
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
              return (
                <button key={ev.id} className="btn btn-dark" style={{ justifyContent: 'flex-start', padding: '14px 16px', textAlign: 'left' }} onClick={() => setActiveEvent(ev)}>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ color: '#eafffa', fontWeight: 600 }}>{ev.title}</span>
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

            <div className="scan-window" id="qr-reader" />
            <div className="scan-frame">
              <span className="corner c-tl" /><span className="corner c-tr" />
              <span className="corner c-bl" /><span className="corner c-br" />
              <span className="scan-line" />
            </div>

            <p className="scan-hint">
              {scannerState === 'starting' && 'waking the camera…'}
              {scannerState === 'scanning' && 'point at the student’s ID — hold steady'}
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
              {scannerState === 'error' || scannerState === 'idle' ? (
                <button className="btn btn-accent" onClick={startScanner}>
                  <CameraIcon width={16} height={16} /> Start camera
                </button>
              ) : null}
            </div>

            <div className="scan-manual">
              <input
                className="input"
                placeholder="Manual entry — student ID (e.g. 2024-1001)"
                value={manualId}
                onChange={(e) => setManualId(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && manualSubmit()}
              />
              <button className="btn btn-accent" onClick={manualSubmit} disabled={busy}>
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
          {result && (
            <>
              <div className="res-head">
                <span className="avatar avatar--ring-teal" style={{ width: 44, height: 44, fontSize: 15 }}>
                  {result.student?.full_name?.split(/\s+/).slice(0, 2).map((w) => w[0]).join('') || '?'}
                </span>
                <div>
                  <b>{result.student?.full_name}</b>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {result.status === 'present' ? 'marked present · ' : 'already recorded · '}
                    {result.student?.course}
                  </div>
                </div>
                <span className={`chip ${result.status === 'present' ? 'chip--ok' : 'chip--warn'}`} style={{ marginLeft: 'auto' }}>
                  <CheckIcon width={12} height={12} /> {result.status}
                </span>
              </div>
              <div className="res-grid">
                <div><div className="k">id no.</div><div className="v" style={{ fontFamily: 'var(--f-ocr)' }}>{result.student?.student_id}</div></div>
                <div><div className="k">year / section</div><div className="v">{result.student?.year_level} · {result.student?.section}</div></div>
                <div><div className="k">verified</div><div className="v">HMAC signature ✓</div></div>
                <div><div className="k">qr type</div><div className="v">{result.qrType === 'presence' ? 'live presence ✓' : 'year ID'}</div></div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-accent" style={{ flex: 1 }} onClick={() => { setResult(null); setScanError(''); }} disabled={busy}>
                  <QrIcon width={16} height={16} /> Scan next
                </button>
                <button className="btn btn-outline" onClick={stopScanner}>Pause camera</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
