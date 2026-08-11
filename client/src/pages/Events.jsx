import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatEventDate, isUpcoming } from '../lib/format';
import {
  CalendarIcon, MapPinIcon, ClockIcon, PlusIcon, XIcon, ChevronRightIcon,
  CameraIcon, QrIcon, CheckIcon, TerminalIcon, AlertIcon,
} from '../components/icons/Icons';

export default function Events() {
  const { profile } = useAuth();
  const toast = useToast();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [myAttendance, setMyAttendance] = useState(new Map());

  const isAdmin = profile?.role === 'admin';
  const isStaff = profile?.role === 'admin' || profile?.role === 'moderator';

  const loadEvents = async () => {
    const { data, error } = await supabase
      .from('events')
      .select('id, title, description, location, event_date, created_at')
      .order('event_date', { ascending: true });
    if (error) toast.error('Events error', error.message);
    else setEvents(data || []);
    setLoading(false);
  };

  const loadMyAttendance = async () => {
    const { data, error } = await supabase.from('attendance').select('event_id');
    if (!error && data) {
      const m = new Map(data.map((a) => [a.event_id, true]));
      setMyAttendance(m);
    }
  };

  useEffect(() => {
    loadEvents();
    if (!isStaff) loadMyAttendance();
  }, [isStaff]);

  const onCreated = () => {
    setShowCreate(false);
    loadEvents();
  };

  return (
    <>
      <div className="events-head">
        <div>
          <h2 style={{ margin: 0, fontSize: 20 }}>Org events</h2>
          <span className="ocr-label">scan in · learn · belong</span>
        </div>
        {isAdmin && (
          <button className="btn btn-accent" onClick={() => setShowCreate(true)}>
            <PlusIcon width={16} height={16} /> New event
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="panel" style={{ padding: 20 }}><div className="skeleton" style={{ height: 80 }} /></div>
          <div className="panel" style={{ padding: 20 }}><div className="skeleton" style={{ height: 80 }} /></div>
        </div>
      ) : events.length === 0 ? (
        <div className="empty-state panel">
          <span className="ico"><CalendarIcon width={26} height={26} /></span>
          <b>No events yet</b>
          <p>{isAdmin ? 'Create the first CODEBYTERS event to get things rolling.' : 'Check back soon — the officers are cooking something up.'}</p>
        </div>
      ) : (
        <div className="event-list">
          {events.map((ev) => {
            const d = formatEventDate(ev.event_date);
            const upcoming = isUpcoming(ev.event_date);
            const attended = myAttendance.get(ev.id);
            return (
              <article className="event-card panel" key={ev.id}>
                <div className="date-block">
                  <b>{d.dayNum}</b>
                  <span>{d.month}</span>
                </div>
                <div className="event-body">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                    <h3>{ev.title}</h3>
                    <span className={`chip ${upcoming ? 'chip--teal' : 'chip'}`}>{upcoming ? 'upcoming' : 'past'}</span>
                    {attended && <span className="chip chip--ok"><CheckIcon width={11} height={11} /> attended</span>}
                  </div>
                  <p>{ev.description || 'No description yet.'}</p>
                  <div className="event-meta">
                    <span><ClockIcon width={14} height={14} />{d.day} · {d.time}</span>
                    <span><MapPinIcon width={14} height={14} />{ev.location || 'TBA'}</span>
                  </div>
                </div>
                <div className="event-actions">
                  <Link to={`/app/events/${ev.id}`} className="btn btn-outline btn-sm">
                    Details <ChevronRightIcon width={14} height={14} />
                  </Link>
                  {isStaff && (
                    <Link to={`/app/scanner/${ev.id}`} className="btn btn-primary btn-sm">
                      <CameraIcon width={14} height={14} /> Scan
                    </Link>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="section-title">
        <TerminalIcon width={14} height={14} /> how attendance works
      </div>
      <div className="panel" style={{ padding: '18px 20px', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {[
          { icon: <QrIcon width={16} height={16} />, title: '1 · Your ID', desc: 'Open “My ID” — your signed QR lives there.' },
          { icon: <CameraIcon width={16} height={16} />, title: '2 · Get scanned', desc: 'A moderator scans it with their phone at the venue.' },
          { icon: <CheckIcon width={16} height={16} />, title: '3 · Verified', desc: 'Attendance is recorded instantly and safe from forgery.' },
        ].map((s) => (
          <div key={s.title} style={{ display: 'flex', gap: 11, alignItems: 'flex-start', flex: '1 1 200px' }}>
            <span className="chip chip--teal" style={{ width: 34, height: 34, justifyContent: 'center' }}>{s.icon}</span>
            <div>
              <b style={{ fontSize: 13.5 }}>{s.title}</b>
              <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 3, lineHeight: 1.55 }}>{s.desc}</div>
            </div>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%', marginTop: 4 }}>
          <AlertIcon width={14} height={14} style={{ color: 'var(--warn)' }} />
          <span className="ocr-label" style={{ fontSize: 9.5 }}>QR codes are HMAC-signed &amp; expire after 5 minutes</span>
        </div>
      </div>

      {showCreate && <CreateEventModal onClose={() => setShowCreate(false)} onCreated={onCreated} />}
    </>
  );
}

function CreateEventModal({ onClose, onCreated }) {
  const { user } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    title: '',
    description: '',
    location: '',
    date: '',
    time: '09:00',
  });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.title.trim() || !form.date) return setError('Title and date are required.');
    const event_date = new Date(`${form.date}T${form.time}:00`).toISOString();
    setBusy(true);
    const { error: err } = await supabase.from('events').insert({
      title: form.title.trim().slice(0, 120),
      description: form.description.trim().slice(0, 1000) || null,
      location: form.location.trim().slice(0, 160) || null,
      event_date,
      created_by: user.id,
    });
    setBusy(false);
    if (err) return setError(err.message);
    toast.ok('Event created', 'Attendance will be open at the venue.');
    onCreated();
  };

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <h3><CalendarIcon width={18} height={18} style={{ verticalAlign: -3, marginRight: 6, color: 'var(--accent-2)' }} />Create event</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><XIcon width={16} height={16} /></button>
        </div>
        <form className="modal-body auth-form" onSubmit={submit}>
          <div className="field">
            <label htmlFor="ev-title">Event title</label>
            <input id="ev-title" className="input" placeholder="CODEBYTERS General Assembly" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={120} />
          </div>
          <div className="field">
            <label htmlFor="ev-desc">Description</label>
            <textarea id="ev-desc" className="textarea" placeholder="What's this event about?" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={1000} />
          </div>
          <div className="field">
            <label htmlFor="ev-loc">Location</label>
            <input id="ev-loc" className="input" placeholder="DOrSU ICT Building — AVR" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} maxLength={160} />
          </div>
          <div className="auth-grid2">
            <div className="field">
              <label htmlFor="ev-date">Date</label>
              <input id="ev-date" className="input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
            </div>
            <div className="field">
              <label htmlFor="ev-time">Time</label>
              <input id="ev-time" className="input" type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} required />
            </div>
          </div>
          {error && <div className="err-box"><span>!</span><span>{error}</span></div>}
          <button className="btn btn-accent btn-lg" disabled={busy}>
            {busy ? 'Creating…' : 'Publish event'}
          </button>
        </form>
      </div>
    </div>
  );
}
