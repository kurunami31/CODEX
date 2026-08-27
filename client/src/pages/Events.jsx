import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatEventDate, isUpcoming } from '../lib/format';
import { isStaff as checkStaff, isAdmin as checkAdmin } from '../lib/roles';
import {
  CalendarIcon, MapPinIcon, ClockIcon, PlusIcon, XIcon, ChevronRightIcon,
  CameraIcon, QrIcon, CheckIcon, TerminalIcon, AlertIcon, UsersIcon,
  PencilIcon,
} from '../components/icons/Icons';

export default function Events() {
  const { profile, user } = useAuth();
  const toast = useToast();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editEvent, setEditEvent] = useState(null);
  const [myAttendance, setMyAttendance] = useState(new Map());
  const [rsvps, setRsvps] = useState([]); // [{ event_id, user_id }]
  const [rsvpBusy, setRsvpBusy] = useState(false);

  const isAdmin = checkAdmin(profile?.role);
  const isStaff = checkStaff(profile?.role);

  const loadEvents = async () => {
    const { data, error } = await supabase
      .from('events')
      .select('id, title, description, location, event_date, created_at, created_by, event_end')
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

  const loadRsvps = async () => {
    const { data, error } = await supabase.from('rsvps').select('event_id, user_id');
    if (!error && data) setRsvps(data);
  };

  const toggleRsvp = async (eventId) => {
    if (!user || rsvpBusy) return;
    const mine = rsvps.some((r) => r.event_id === eventId && r.user_id === user.id);
    setRsvpBusy(true);
    const { error } = mine
      ? await supabase.from('rsvps').delete().eq('event_id', eventId).eq('user_id', user.id)
      : await supabase.from('rsvps').insert({ event_id: eventId, user_id: user.id });
    setRsvpBusy(false);
    if (error) return toast.error('RSVP failed', error.message);
    await loadRsvps();
    toast.ok(mine ? 'RSVP cancelled' : 'You\'re going!', mine ? 'See you next time.' : 'We\'ll see you at the event.');
  };

  useEffect(() => {
    loadEvents();
    loadRsvps();
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
            const rsvpCount = rsvps.filter((r) => r.event_id === ev.id).length;
            const rsvped = rsvps.some((r) => r.event_id === ev.id && r.user_id === user?.id);
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
                  {rsvpCount > 0 && (
                    <div className="rsvp-count">
                      <UsersIcon width={13} height={13} /> {rsvpCount} going
                    </div>
                  )}
                </div>
                <div className="event-actions">
                  <Link to={`/app/events/${ev.id}`} className="btn btn-outline btn-sm">
                    Details <ChevronRightIcon width={14} height={14} />
                  </Link>
                  {!isStaff && (
                    <button
                      className={`btn btn-sm ${rsvped ? 'btn-accent' : 'btn-ghost'}`}
                      onClick={() => toggleRsvp(ev.id)}
                      disabled={rsvpBusy || !upcoming}
                      title={upcoming ? (rsvped ? 'Cancel RSVP' : 'Mark as going') : 'RSVP closed for past events'}
                    >
                      <CheckIcon width={14} height={14} /> {rsvped ? 'Going' : 'RSVP'}
                    </button>
                  )}
                  {isStaff && (
                    <Link to={`/app/scanner/${ev.id}`} className="btn btn-primary btn-sm">
                      <CameraIcon width={14} height={14} /> Scan
                    </Link>
                  )}
                  {(isAdmin || ev.created_by === user?.id) && (
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => setEditEvent(ev)}
                      title="Edit event"
                    >
                      <PencilIcon width={14} height={14} /> Edit
                    </button>
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
          <span className="ocr-label" style={{ fontSize: 9.5 }}>QR codes are HMAC-signed &amp; valid for the academic year</span>
        </div>
      </div>

      {showCreate && <CreateEventModal onClose={() => setShowCreate(false)} onCreated={onCreated} />}
      {editEvent && <EditEventModal event={editEvent} onClose={() => setEditEvent(null)} onSaved={() => { setEditEvent(null); loadEvents(); }} />}
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
    endDate: '',
    endTime: '17:00',
    // AM/PM windows
    amStart: '08:00',
    amEnd: '12:00',
    pmStart: '13:00',
    pmEnd: '17:00',
  });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.title.trim() || !form.date) return setError('Title and date are required.');
    if (!form.amStart || !form.amEnd || !form.pmStart || !form.pmEnd) return setError('All attendance windows (AM/PM) are required.');
    const event_date = new Date(`${form.date}T${form.time}:00`).toISOString();
    setBusy(true);
    const { error: err } = await supabase.from('events').insert({
      title: form.title.trim().slice(0, 120),
      description: form.description.trim().slice(0, 1000) || null,
      location: form.location.trim().slice(0, 160) || null,
      event_date,
      am_start: `${form.date}T${form.amStart}:00`,
      am_end: `${form.date}T${form.amEnd}:00`,
      pm_start: `${form.date}T${form.pmStart}:00`,
      pm_end: `${form.date}T${form.pmEnd}:00`,
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
              <label htmlFor="ev-time">Event start time</label>
              <input id="ev-time" className="input" type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} required />
            </div>
          </div>
          <div className="panel" style={{ marginTop: 16, padding: 16, border: '1px solid var(--line)', borderRadius: 'var(--r-md)' }}>
            <h4 style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--accent-2)' }}>Attendance Windows (Morning & Afternoon)</h4>
            <div className="auth-grid2">
              <div className="field">
                <label htmlFor="ev-am-start">Morning time in</label>
                <input id="ev-am-start" className="input" type="time" value={form.amStart} onChange={(e) => setForm({ ...form, amStart: e.target.value })} required />
              </div>
              <div className="field">
                <label htmlFor="ev-am-end">Morning time out</label>
                <input id="ev-am-end" className="input" type="time" value={form.amEnd} onChange={(e) => setForm({ ...form, amEnd: e.target.value })} required />
              </div>
            </div>
            <div className="auth-grid2">
              <div className="field">
                <label htmlFor="ev-pm-start">Afternoon time in</label>
                <input id="ev-pm-start" className="input" type="time" value={form.pmStart} onChange={(e) => setForm({ ...form, pmStart: e.target.value })} required />
              </div>
              <div className="field">
                <label htmlFor="ev-pm-end">Afternoon time out</label>
                <input id="ev-pm-end" className="input" type="time" value={form.pmEnd} onChange={(e) => setForm({ ...form, pmEnd: e.target.value })} required />
              </div>
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

function EditEventModal({ event, onClose, onSaved }) {
  const { user } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    title: event.title,
    description: event.description || '',
    location: event.location || '',
    date: event.event_date ? event.event_date.split('T')[0] : '',
    time: event.event_date ? event.event_date.split('T')[1].slice(0, 5) : '09:00',
    endDate: event.event_end ? event.event_end.split('T')[0] : '',
    endTime: event.event_end ? event.event_end.split('T')[1].slice(0, 5) : '',
    amStart: event.am_start ? event.am_start.split('T')[1].slice(0, 5) : '08:00',
    amEnd: event.am_end ? event.am_end.split('T')[1].slice(0, 5) : '12:00',
    pmStart: event.pm_start ? event.pm_start.split('T')[1].slice(0, 5) : '13:00',
    pmEnd: event.pm_end ? event.pm_end.split('T')[1].slice(0, 5) : '17:00',
  });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.title.trim() || !form.date) return setError('Title and date are required.');
    if (!form.endDate) return setError('End date is required.');
    if (!form.amStart || !form.amEnd || !form.pmStart || !form.pmEnd) return setError('All attendance windows (AM/PM) are required.');
    const event_date = new Date(`${form.date}T${form.time}:00`).toISOString();
    const event_end = new Date(`${form.endDate}T${form.endTime}:00`).toISOString();
    if (event_end <= event_date) return setError('End date/time must be after start date/time.');
    setBusy(true);
    const { error: err } = await supabase.from('events').update({
      title: form.title.trim().slice(0, 120),
      description: form.description.trim().slice(0, 1000) || null,
      location: form.location.trim().slice(0, 160) || null,
      event_date,
      event_end,
      am_start: `${form.date}T${form.amStart}:00`,
      am_end: `${form.date}T${form.amEnd}:00`,
      pm_start: `${form.date}T${form.pmStart}:00`,
      pm_end: `${form.date}T${form.pmEnd}:00`,
    }).eq('id', event.id);
    setBusy(false);
    if (err) return setError(err.message);
    toast.ok('Event updated', 'Changes saved.');
    onSaved();
  };

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <h3><CalendarIcon width={18} height={18} style={{ verticalAlign: -3, marginRight: 6, color: 'var(--accent-2)' }} />Edit event</h3>
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
              <label htmlFor="ev-date">Start date</label>
              <input id="ev-date" className="input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
            </div>
            <div className="field">
              <label htmlFor="ev-time">Start time</label>
              <input id="ev-time" className="input" type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} required />
            </div>
          </div>
          <div className="auth-grid2">
            <div className="field">
              <label htmlFor="ev-end-date">End date</label>
              <input id="ev-end-date" className="input" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} required />
            </div>
            <div className="field">
              <label htmlFor="ev-end-time">End time</label>
              <input id="ev-end-time" className="input" type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} required />
            </div>
          </div>
          <div className="panel" style={{ marginTop: 16, padding: 16, border: '1px solid var(--line)', borderRadius: 'var(--r-md)' }}>
            <h4 style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--accent-2)' }}>Attendance Windows (Morning & Afternoon)</h4>
            <div className="auth-grid2">
              <div className="field">
                <label htmlFor="ev-am-start">Morning time in</label>
                <input id="ev-am-start" className="input" type="time" value={form.amStart} onChange={(e) => setForm({ ...form, amStart: e.target.value })} required />
              </div>
              <div className="field">
                <label htmlFor="ev-am-end">Morning time out</label>
                <input id="ev-am-end" className="input" type="time" value={form.amEnd} onChange={(e) => setForm({ ...form, amEnd: e.target.value })} required />
              </div>
            </div>
            <div className="auth-grid2">
              <div className="field">
                <label htmlFor="ev-pm-start">Afternoon time in</label>
                <input id="ev-pm-start" className="input" type="time" value={form.pmStart} onChange={(e) => setForm({ ...form, pmStart: e.target.value })} required />
              </div>
              <div className="field">
                <label htmlFor="ev-pm-end">Afternoon time out</label>
                <input id="ev-pm-end" className="input" type="time" value={form.pmEnd} onChange={(e) => setForm({ ...form, pmEnd: e.target.value })} required />
              </div>
            </div>
          </div>
          {error && <div className="err-box"><span>!</span><span>{error}</span></div>}
          <button className="btn btn-accent btn-lg" disabled={busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      </div>
    </div>
  );
}
