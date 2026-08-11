import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatEventDate, isUpcoming, timeAgo } from '../lib/format';
import Avatar from '../components/Avatar';
import {
  ShieldIcon, CalendarIcon, UsersIcon, CameraIcon, PlusIcon, XIcon,
  AlertIcon, CheckIcon, QrIcon,
} from '../components/icons/Icons';

export default function Admin() {
  const toast = useToast();
  const [events, setEvents] = useState([]);
  const [selected, setSelected] = useState(null);
  const [attendees, setAttendees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadEvents = useCallback(async () => {
    const { data, error } = await supabase
      .from('events')
      .select('id, title, description, location, event_date')
      .order('event_date', { ascending: false });
    if (error) toast.error('Events error', error.message);
    else setEvents(data || []);
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const selectEvent = async (ev) => {
    setSelected(ev);
    setAttendees([]);
    const { data, error } = await supabase.rpc('event_attendance', { p_event_id: ev.id });
    if (error) toast.error('Could not load attendance', error.message);
    else setAttendees(data || []);
  };

  const removeEvent = async (ev) => {
    if (!window.confirm(`Delete "${ev.title}" and all its attendance records?`)) return;
    setBusy(true);
    const { error } = await supabase.rpc('delete_event', { p_event_id: ev.id });
    setBusy(false);
    if (error) return toast.error('Delete failed', error.message);
    toast.ok('Event deleted', 'Attendance records were removed with it.');
    if (selected?.id === ev.id) {
      setSelected(null);
      setAttendees([]);
    }
    loadEvents();
  };

  const role = (r) => (r === 'admin' ? 'Administrator' : r === 'moderator' ? 'Moderator' : 'Student');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="events-head">
        <div>
          <h2 style={{ margin: 0, fontSize: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
            <ShieldIcon width={20} height={20} style={{ color: 'var(--warn)' }} /> Control panel
          </h2>
          <span className="ocr-label">admin · full authority</span>
        </div>
        <button className="btn btn-accent" onClick={() => setShowCreate(true)}>
          <PlusIcon width={16} height={16} /> New event
        </button>
      </div>

      <div className="panel" style={{ padding: '18px 20px', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {[
          { icon: <CalendarIcon width={15} height={15} />, k: 'events', v: events.length },
          { icon: <UsersIcon width={15} height={15} />, k: 'attendance records', v: attendees.length },
          { icon: <QrIcon width={15} height={15} />, k: 'qr signing', v: 'HMAC v2' },
          { icon: <AlertIcon width={15} height={15} />, k: 'your role', v: role('admin') },
        ].map((s) => (
          <div key={s.k} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'var(--bg)', borderRadius: 'var(--r-md)', border: '1px solid var(--line)' }}>
            <span style={{ color: 'var(--accent-2)' }}>{s.icon}</span>
            <div>
              <b style={{ fontSize: 16, display: 'block' }}>{s.v}</b>
              <span className="ocr-label" style={{ fontSize: 8.5 }}>{s.k}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="section-title">manage events &amp; attendance</div>

      {loading ? (
        <div className="panel" style={{ padding: 20 }}><div className="skeleton" style={{ height: 100 }} /></div>
      ) : events.length === 0 ? (
        <div className="empty-state panel">
          <span className="ico"><CalendarIcon width={26} height={26} /></span>
          <b>No events</b>
          <p>Create an event and its attendance log will appear here.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="codex-table">
            <thead>
              <tr>
                <th>event</th>
                <th>schedule</th>
                <th>status</th>
                <th>scan</th>
                <th>actions</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => {
                const d = formatEventDate(ev.event_date);
                const up = isUpcoming(ev.event_date);
                const isSel = selected?.id === ev.id;
                return (
                  <tr key={ev.id} style={{ cursor: 'pointer' }} onClick={() => selectEvent(ev)}>
                    <td>
                      <b>{ev.title}</b>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{ev.location || 'TBA'}</div>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{d.day} · {d.time}</td>
                    <td>
                      <span className={`chip ${up ? 'chip--teal' : ''}`}>{up ? 'upcoming' : 'past'}</span>
                      {isSel && <span className="chip chip--ok" style={{ marginLeft: 6 }}>viewing</span>}
                    </td>
                    <td>
                      <Link to={`/app/scanner/${ev.id}`} className="btn btn-primary btn-sm" onClick={(e) => e.stopPropagation()}>
                        <CameraIcon width={14} height={14} /> Scan
                      </Link>
                    </td>
                    <td>
                      <button
                        className="icon-btn"
                        style={{ width: 32, height: 32, borderRadius: 9, color: 'var(--danger)' }}
                        onClick={(e) => { e.stopPropagation(); removeEvent(ev); }}
                        disabled={busy}
                        title="Delete event"
                        aria-label="Delete event"
                      >
                        <XIcon width={14} height={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="panel" style={{ padding: '20px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            <UsersIcon width={18} height={18} style={{ color: 'var(--accent-2)' }} />
            <b style={{ fontSize: 15 }}>Attendance — {selected.title}</b>
            <span className="chip chip--teal" style={{ marginLeft: 'auto' }}>{attendees.length} present</span>
          </div>

          {attendees.length === 0 ? (
            <div className="empty-state">
              <span className="ico"><QrIcon width={24} height={24} /></span>
              <b>No scans recorded</b>
              <p>Open the scanner and start admitting students.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="codex-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>student</th>
                    <th>id no.</th>
                    <th>year / section</th>
                    <th>scanned at</th>
                    <th>scanned by</th>
                    <th>verify</th>
                  </tr>
                </thead>
                <tbody>
                  {attendees.map((a, i) => (
                    <tr key={a.student_id}>
                      <td style={{ fontFamily: 'var(--f-ocr)', fontSize: 11, color: 'var(--muted)' }}>{String(i + 1).padStart(2, '0')}</td>
                      <td style={{ display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap' }}>
                        <Avatar name={a.full_name} seed={a.student_id} size={28} url={a.avatar_url} />
                        {a.full_name}
                      </td>
                      <td style={{ fontFamily: 'var(--f-ocr)', fontSize: 12 }}>{a.student_id}</td>
                      <td>{a.year_level} · {a.section}</td>
                      <td>{timeAgo(a.scanned_at)}</td>
                      <td>{a.scanned_by_name || '—'}</td>
                      <td>
                        <span className="chip chip--ok"><CheckIcon width={11} height={11} /> BSIT</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showCreate && <CreateEventModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); loadEvents(); }} />}
    </div>
  );
}

function CreateEventModal({ onClose, onCreated }) {
  const { user } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ title: '', description: '', location: '', date: '', time: '09:00' });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.title.trim() || !form.date) return setError('Title and date are required.');
    setBusy(true);
    const { error: err } = await supabase.from('events').insert({
      title: form.title.trim().slice(0, 120),
      description: form.description.trim().slice(0, 1000) || null,
      location: form.location.trim().slice(0, 160) || null,
      event_date: new Date(`${form.date}T${form.time}:00`).toISOString(),
      created_by: user.id,
    });
    setBusy(false);
    if (err) return setError(err.message);
    toast.ok('Event created', 'It is now scannable at the venue.');
    onCreated();
  };

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <h3><PlusIcon width={17} height={17} style={{ verticalAlign: -3, marginRight: 6, color: 'var(--accent-2)' }} />Create event</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><XIcon width={16} height={16} /></button>
        </div>
        <form className="modal-body auth-form" onSubmit={submit}>
          <div className="field">
            <label htmlFor="adm-title">Event title</label>
            <input id="adm-title" className="input" placeholder="CODEBYTERS General Assembly" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={120} />
          </div>
          <div className="field">
            <label htmlFor="adm-desc">Description</label>
            <textarea id="adm-desc" className="textarea" placeholder="What's this event about?" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={1000} />
          </div>
          <div className="field">
            <label htmlFor="adm-loc">Location</label>
            <input id="adm-loc" className="input" placeholder="DOrSU ICT Building — AVR" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} maxLength={160} />
          </div>
          <div className="auth-grid2">
            <div className="field">
              <label htmlFor="adm-date">Date</label>
              <input id="adm-date" className="input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
            </div>
            <div className="field">
              <label htmlFor="adm-time">Time</label>
              <input id="adm-time" className="input" type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} required />
            </div>
          </div>
          {error && <div className="err-box"><span>!</span><span>{error}</span></div>}
          <button className="btn btn-accent btn-lg" disabled={busy}>{busy ? 'Creating…' : 'Publish event'}</button>
        </form>
      </div>
    </div>
  );
}
