import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatEventDate, isUpcoming, timeAgo } from '../lib/format';
import { roleLabel } from '../lib/roles';
import Avatar from '../components/Avatar';
import {
  ShieldIcon, CalendarIcon, UsersIcon, CameraIcon, PlusIcon, XIcon,
  AlertIcon, CheckIcon, QrIcon, DownloadIcon, WalletIcon,
} from '../components/icons/Icons';

export default function Admin() {
  const toast = useToast();
  const { profile } = useAuth();
  const [events, setEvents] = useState([]);
  const [selected, setSelected] = useState(null);
  const [attendees, setAttendees] = useState([]);
  const [stats, setStats] = useState([]); // [{ event_id, title, event_date, present }]
  const [unpaid, setUnpaid] = useState([]);
  const [confirmingId, setConfirmingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  const loadEvents = useCallback(async () => {
    const { data, error } = await supabase
      .from('events')
      .select('id, title, description, location, event_date')
      .order('event_date', { ascending: false });
    if (error) toast.error('Events error', error.message);
    else setEvents(data || []);
    setLoading(false);
  }, [toast]);

  const loadStats = useCallback(async () => {
    const { data, error } = await supabase.rpc('attendance_counts');
    if (!error && data) setStats(data);
  }, []);

  const loadUnpaid = useCallback(async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, student_id, year_level, section, created_at')
      .eq('membership_paid', false)
      .order('created_at', { ascending: true });
    if (error) toast.error('Membership error', error.message);
    else setUnpaid(data || []);
  }, [toast]);

  useEffect(() => {
    loadEvents();
    loadStats();
    loadUnpaid();
  }, [loadEvents, loadStats, loadUnpaid]);

  const confirmDues = async (p) => {
    setConfirmingId(p.id);
    const { error } = await supabase.rpc('confirm_membership', { p_user_id: p.id, p_paid: true });
    setConfirmingId(null);
    if (error) return toast.error('Could not confirm', error.message);
    toast.ok('Payment confirmed', `${p.full_name} is now marked as paid.`);
    loadUnpaid();
  };

  const selectEvent = async (ev) => {
    setSelected(ev);
    setAttendees([]);
    const { data, error } = await supabase.rpc('event_attendance', { p_event_id: ev.id });
    if (error) toast.error('Could not load attendance', error.message);
    else setAttendees(data || []);
  };

  const breakdown = useCallback((rows) => {
    const byYear = new Map();
    const bySection = new Map();
    for (const a of rows) {
      const y = a.year_level || '—';
      byYear.set(y, (byYear.get(y) || 0) + 1);
      const s = `${a.year_level || '—'} · ${a.section || '—'}`;
      bySection.set(s, (bySection.get(s) || 0) + 1);
    }
    const sort = (m) => [...m.entries()].sort((x, y) => y[1] - x[1]);
    return { byYear: sort(byYear), bySection: sort(bySection) };
  }, []);

  const exportCsv = async () => {
    if (!selected || attendees.length === 0) return;
    setExporting(true);
    try {
      // RFC 4180: quote every field, escape embedded quotes by doubling them.
      const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const header = ['#', 'Student ID', 'Full Name', 'Year Level', 'Section', 'Scanned At', 'Scanned By'];
      const rows = attendees.map((a, i) => [
        i + 1,
        a.student_id,
        a.full_name,
        a.year_level || '',
        a.section || '',
        new Date(a.scanned_at).toLocaleString(),
        a.scanned_by_name || '',
      ]);
      const csv = [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance-${selected.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.ok('CSV exported', `${attendees.length} records downloaded.`);
    } catch (err) {
      toast.error('Export failed', err.message);
    } finally {
      setExporting(false);
    }
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
          { icon: <WalletIcon width={15} height={15} />, k: 'dues unpaid', v: unpaid.length },
          { icon: <QrIcon width={15} height={15} />, k: 'qr signing', v: 'HMAC v2' },
          { icon: <AlertIcon width={15} height={15} />, k: 'your role', v: roleLabel(profile?.role) },
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

      <div className="section-title">membership dues</div>
      <div className="panel" style={{ padding: '20px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <WalletIcon width={18} height={18} style={{ color: 'var(--warn)' }} />
          <b style={{ fontSize: 15 }}>Awaiting payment confirmation</b>
          <span className="chip chip--warn" style={{ marginLeft: 'auto' }}>{unpaid.length} unpaid</span>
        </div>
        {unpaid.length === 0 ? (
          <div className="empty-state">
            <span className="ico"><CheckIcon width={24} height={24} /></span>
            <b>All dues collected</b>
            <p>Every member's membership fee is confirmed. Nice work.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="codex-table">
              <thead>
                <tr>
                  <th>member</th>
                  <th>id no.</th>
                  <th>year / section</th>
                  <th>joined</th>
                  <th>confirm</th>
                </tr>
              </thead>
              <tbody>
                {unpaid.map((p) => (
                  <tr key={p.id}>
                    <td style={{ display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap' }}>
                      <Avatar name={p.full_name} seed={p.student_id} size={28} url={p.avatar_url} />
                      <b>{p.full_name}</b>
                    </td>
                    <td style={{ fontFamily: 'var(--f-ocr)', fontSize: 12 }}>{p.student_id}</td>
                    <td>{p.year_level} · {p.section}</td>
                    <td style={{ whiteSpace: 'nowrap', color: 'var(--muted)', fontSize: 12 }}>{timeAgo(p.created_at)}</td>
                    <td>
                      <button
                        className="btn btn-accent btn-sm"
                        onClick={() => confirmDues(p)}
                        disabled={confirmingId === p.id}
                      >
                        <CheckIcon width={14} height={14} />
                        {confirmingId === p.id ? 'Confirming…' : 'Confirm payment'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="section-title">attendance analytics</div>
      <div className="panel" style={{ padding: '20px 22px' }}>
        {stats.length === 0 ? (
          <div className="empty-state">
            <span className="ico"><UsersIcon width={24} height={24} /></span>
            <b>No attendance data yet</b>
            <p>Once students start scanning in, per-event charts appear here.</p>
          </div>
        ) : (
          <div className="chart">
            {stats.map((s) => (
              <div className="chart-bar-row" key={s.event_id} title={`${s.title}: ${s.present} present`}>
                <span className="chart-bar-label">{s.title}</span>
                <div className="chart-bar-track">
                  <div
                    className="chart-bar"
                    style={{ width: `${Math.max(4, (s.present / Math.max(...stats.map((x) => x.present), 1)) * 100)}%` }}
                  >
                    <b>{s.present}</b>
                  </div>
                </div>
                <span className="ocr-label" style={{ fontSize: 9, width: 92, textAlign: 'right' }}>{formatEventDate(s.event_date).day}</span>
              </div>
            ))}
          </div>
        )}
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
            <>
              <div className="breakdown">
                {breakdown(attendees).byYear.length > 0 && (
                  <div className="breakdown-col">
                    <div className="ocr-label" style={{ marginBottom: 8 }}>by year level</div>
                    {breakdown(attendees).byYear.map(([k, v]) => (
                      <div className="breakdown-row" key={k}>
                        <span>{k}</span>
                        <b>{v}</b>
                      </div>
                    ))}
                  </div>
                )}
                {breakdown(attendees).bySection.length > 0 && (
                  <div className="breakdown-col">
                    <div className="ocr-label" style={{ marginBottom: 8 }}>by section</div>
                    {breakdown(attendees).bySection.map(([k, v]) => (
                      <div className="breakdown-row" key={k}>
                        <span>{k}</span>
                        <b>{v}</b>
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
              <button className="btn btn-outline btn-sm" onClick={exportCsv} disabled={exporting} style={{ marginTop: 14 }}>
                <DownloadIcon width={14} height={14} /> {exporting ? 'Exporting…' : 'Download CSV'}
              </button>
            </>
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
