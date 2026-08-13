import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, apiFetch, getFreshSession } from '../lib/supabase';import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { timeAgo } from '../lib/format';
import { roleLabel } from '../lib/roles';
import Avatar from '../components/Avatar';
import {
  CrownIcon, UsersIcon, RssIcon, QrIcon, PlusIcon, XIcon, PencilIcon, TrashIcon,
  SearchIcon, AlertIcon, CheckIcon, WalletIcon, WrenchIcon,
} from '../components/icons/Icons';

const YEARS = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
const COURSES = ['BSIT', 'BSEM', 'BSAB', 'other'];
const ROLES = ['student', 'moderator', 'admin', 'superadmin'];

const TABS = [
  { id: 'students', label: 'Students', icon: <UsersIcon width={16} height={16} /> },
  { id: 'posts', label: 'Posts', icon: <RssIcon width={16} height={16} /> },
  { id: 'attendance', label: 'Attendance', icon: <QrIcon width={16} height={16} /> },
];

export default function SuperAdmin() {
  const { profile } = useAuth();
  const toast = useToast();

  const [tab, setTab] = useState('students');
  const [students, setStudents] = useState([]);
  const [posts, setPosts] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [events, setEvents] = useState([]);
  const [scanners, setScanners] = useState({});

  const [loadingStudents, setLoadingStudents] = useState(true);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [loadingAttendance, setLoadingAttendance] = useState(true);

  const [search, setSearch] = useState('');
  const [eventFilter, setEventFilter] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const firstRun = useRef(true);

  const token = async () => (await getFreshSession())?.access_token;

  const [maint, setMaint] = useState({ enabled: false, message: '' });
  const [maintLoaded, setMaintLoaded] = useState(false);
  const [maintBusy, setMaintBusy] = useState(false);

  const loadMaint = useCallback(async () => {
    try {
      const res = await fetch('/api/status');
      if (!res.ok) return;
      const j = await res.json();
      setMaint({ enabled: Boolean(j.maintenance?.enabled), message: j.maintenance?.message || '' });
    } finally {
      setMaintLoaded(true);
    }
  }, []);

  const saveMaint = async () => {
    setMaintBusy(true);
    try {
      const res = await apiFetch('/api/admin/maintenance', {
        body: { enabled: maint.enabled, message: maint.message || null },
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Could not save maintenance mode.');
      toast.ok(j.enabled ? 'Maintenance ON' : 'Maintenance OFF', j.enabled ? 'Everyone now sees the maintenance page.' : 'The app is live again.');
    } catch (err) {
      toast.error('Maintenance error', err.message);
    } finally {
      setMaintBusy(false);
    }
  };

  useEffect(() => {
    loadMaint();
  }, [loadMaint]);

  const loadStudents = useCallback(async () => {
    setLoadingStudents(true);
    try {
      const t = await token();
      const res = await fetch('/api/admin/users', { headers: { Authorization: `Bearer ${t}` } });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not list students.');
      setStudents(body.users || []);
    } catch (err) {
      toast.error('Students error', err.message);
    } finally {
      setLoadingStudents(false);
    }
  }, [toast]);

  const loadPosts = useCallback(async () => {
    setLoadingPosts(true);
    const { data, error } = await supabase
      .from('posts')
      .select('id, content, created_at, archived, author_id, profiles!posts_author_id_fkey(id, full_name, role, avatar_url, student_id)')
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) toast.error('Posts error', error.message);
    else setPosts(data || []);
    setLoadingPosts(false);
  }, [toast]);

  const loadAttendance = useCallback(async () => {
    setLoadingAttendance(true);
    const { data, error } = await supabase
      .from('attendance')
      .select('id, event_id, student_id, scanned_at, scanned_by, profiles!attendance_student_id_fkey(full_name, year_level, section, avatar_url), events!attendance_event_id_fkey(id, title)')
      .order('scanned_at', { ascending: false })
      .limit(500);
    if (error) toast.error('Attendance error', error.message);
    else setAttendance(data || []);
    setLoadingAttendance(false);
  }, [toast]);

  const loadEvents = useCallback(async () => {
    const { data, error } = await supabase.from('events').select('id, title').order('event_date', { ascending: false });
    if (!error) setEvents(data || []);
  }, []);

  const loadScanners = useCallback(async () => {
    const { data, error } = await supabase.from('profiles').select('id, full_name');
    if (!error) setScanners(Object.fromEntries((data || []).map((p) => [p.id, p.full_name])));
  }, []);

  useEffect(() => {
    // Load everything up front so the stat chips are truthful on first paint.
    loadStudents();
    loadEvents();
    loadScanners();
    loadPosts();
    loadAttendance();
  }, [loadStudents, loadEvents, loadScanners, loadPosts, loadAttendance]);

  useEffect(() => {
    // Skip the mount run (already loaded above); refresh only on tab switches.
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (tab === 'posts') loadPosts();
    if (tab === 'attendance') loadAttendance();
  }, [tab, loadPosts, loadAttendance]);

  const deleteStudent = async (s) => {
    if (!window.confirm(`Delete ${s.full_name || s.email}?\n\nTheir posts, likes and attendance records are removed permanently.`)) return;
    setBusy(true);
    const { error } = await supabase.rpc('superadmin_delete_user', { p_user_id: s.id });
    setBusy(false);
    if (error) return toast.error('Delete failed', error.message);
    toast.ok('Account deleted', `${s.full_name || s.email} was removed.`);
    loadStudents();
  };

  const setMembership = async (s, paid) => {
    if (!paid && !window.confirm(`Revoke ${s.full_name || s.email}'s confirmed membership?`)) return;
    setBusy(true);
    const { error } = await supabase.rpc('confirm_membership', { p_user_id: s.id, p_paid: paid });
    setBusy(false);
    if (error) return toast.error('Membership error', error.message);
    toast.ok(paid ? 'Dues confirmed' : 'Dues revoked', `${s.full_name || 'Member'} is now marked as ${paid ? 'paid' : 'unpaid'}.`);
    loadStudents();
  };

  const deletePost = async (p) => {
    if (!window.confirm('Delete this post permanently?')) return;
    const { error } = await supabase.from('posts').delete().eq('id', p.id);
    if (error) return toast.error('Delete failed', error.message);
    toast.ok('Post deleted', 'Removed from the community feed.');
    setPosts((prev) => prev.filter((x) => x.id !== p.id));
  };

  const deleteAttendance = async (a) => {
    if (!window.confirm(`Remove ${a.profiles?.full_name || a.student_id}'s attendance record for "${a.events?.title || 'this event'}"?`)) return;
    const { error } = await supabase.from('attendance').delete().eq('id', a.id);
    if (error) return toast.error('Delete failed', error.message);
    toast.ok('Record removed', 'The scan was deleted from the log.');
    setAttendance((prev) => prev.filter((x) => x.id !== a.id));
  };

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) =>
      [s.full_name, s.student_id, s.email, s.section, s.role].some((v) => v && String(v).toLowerCase().includes(q))
    );
  }, [students, search]);

  const filteredPosts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return posts;
    return posts.filter((p) =>
      [p.content, p.profiles?.full_name, p.profiles?.student_id].some((v) => v && String(v).toLowerCase().includes(q))
    );
  }, [posts, search]);

  const filteredAttendance = useMemo(() => {
    const q = search.trim().toLowerCase();
    return attendance.filter((a) => {
      if (eventFilter && a.event_id !== eventFilter) return false;
      if (!q) return true;
      return [a.profiles?.full_name, a.student_id, a.events?.title].some((v) => v && String(v).toLowerCase().includes(q));
    });
  }, [attendance, search, eventFilter]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="events-head">
        <div>
          <h2 style={{ margin: 0, fontSize: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
            <CrownIcon width={20} height={20} style={{ color: 'var(--warn)' }} /> Root access
          </h2>
          <span className="ocr-label">super admin · full authority</span>
        </div>
        {tab === 'students' && (
          <button className="btn btn-accent" onClick={() => setShowCreate(true)}>
            <PlusIcon width={16} height={16} /> Add student
          </button>
        )}
      </div>

      <div className="panel" style={{ padding: '18px 20px', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {[
          { icon: <UsersIcon width={15} height={15} />, k: 'members', v: students.length },
          { icon: <WalletIcon width={15} height={15} />, k: 'dues paid', v: students.filter((s) => s.membership_paid).length },
          { icon: <RssIcon width={15} height={15} />, k: 'posts', v: posts.length },
          { icon: <QrIcon width={15} height={15} />, k: 'attendance records', v: attendance.length },
          { icon: <CrownIcon width={15} height={15} />, k: 'your role', v: roleLabel(profile?.role) },
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

      <div className="panel" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
              <WrenchIcon width={15} height={15} style={{ color: 'var(--warn)' }} /> Maintenance mode
            </h3>
            <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 4, display: 'block', maxWidth: 480, lineHeight: 1.45 }}>
              Shows a maintenance page to everyone except super admins, so you can still get in, verify fixes, and flip it back off.
            </span>
          </div>
          {maintLoaded && (
            <span className={`chip ${maint.enabled ? 'chip--warn' : 'chip--ok'}`}>
              {maint.enabled ? 'MAINTENANCE ON' : 'LIVE'}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            type="checkbox"
            checked={maint.enabled}
            onChange={(e) => setMaint({ ...maint, enabled: e.target.checked })}
            style={{ width: 22, height: 22, accentColor: 'var(--accent-2)', cursor: 'pointer' }}
            id="maint-toggle"
          />
          <label htmlFor="maint-toggle" style={{ fontSize: 14, cursor: 'pointer' }}>Block the app for everyone</label>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            className="input"
            style={{ flex: 1, minWidth: 220 }}
            placeholder="Optional message, e.g. We'll be back at 5 PM — fixing the ID QR."
            value={maint.message}
            maxLength={200}
            onChange={(e) => setMaint({ ...maint, message: e.target.value })}
          />
          <button className="btn btn-accent" onClick={saveMaint} disabled={maintBusy}>
            {maintBusy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div className="seg-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`seg-tab${tab === t.id ? ' seg-tab--on' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className="toolbar-row">
        <div className="search-box" style={{ maxWidth: 340, flex: 1 }}>
          <SearchIcon width={16} height={16} />
          <input
            placeholder={tab === 'students' ? 'Search name, ID, email, role…' : tab === 'posts' ? 'Search posts or authors…' : 'Search student, event…'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {tab === 'attendance' && (
          <select className="input" style={{ maxWidth: 260 }} value={eventFilter} onChange={(e) => setEventFilter(e.target.value)} aria-label="Filter by event">
            <option value="">All events</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>{ev.title}</option>
            ))}
          </select>
        )}
      </div>

      {/* ── STUDENTS ─────────────────────────────────────────────── */}
      {tab === 'students' && (
        loadingStudents ? (
          <div className="panel" style={{ padding: 20 }}><div className="skeleton" style={{ height: 120 }} /></div>
        ) : filteredStudents.length === 0 ? (
          <div className="empty-state panel">
            <span className="ico"><UsersIcon width={26} height={26} /></span>
            <b>{students.length === 0 ? 'No members yet' : 'No matches'}</b>
            <p>{students.length === 0 ? 'Enroll the first student, or wait for sign-ups.' : 'Try a different search.'}</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="codex-table">
              <thead>
                <tr>
                  <th>member</th>
                  <th>email</th>
                  <th>id no.</th>
                  <th>year / section</th>
                  <th>role</th>
                  <th>membership</th>
                  <th>joined</th>
                  <th>actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((s) => (
                  <tr key={s.id}>
                    <td style={{ display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap' }}>
                      <Avatar name={s.full_name} seed={s.student_id || s.id} size={30} url={s.avatar_url} />
                      <b>{s.full_name || '—'}</b>
                    </td>
                    <td>
                      <span style={{ fontSize: 13 }}>{s.email}</span>
                      {!s.email_confirmed && <span className="chip chip--warn" style={{ marginLeft: 6 }}>unconfirmed</span>}
                    </td>
                    <td style={{ fontFamily: 'var(--f-ocr)', fontSize: 12 }}>{s.student_id || '—'}</td>
                    <td>{s.year_level} · {s.section}</td>
                    <td><span className={`role-pill role-pill--${s.role || 'student'}`}>{roleLabel(s.role)}</span></td>
                    <td>
                      {s.membership_paid ? (
                        <span className="chip chip--ok" title={s.membership_paid_at ? `Confirmed ${timeAgo(s.membership_paid_at)}` : 'Confirmed'}>
                          <CheckIcon width={11} height={11} /> paid
                        </span>
                      ) : (
                        <span className="chip chip--warn"><WalletIcon width={11} height={11} /> unpaid</span>
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', color: 'var(--muted)', fontSize: 12 }}>{s.created_at ? timeAgo(s.created_at) : '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {s.membership_paid ? (
                          <button
                            className="icon-btn"
                            style={{ color: 'var(--warn)' }}
                            title="Revoke membership confirmation"
                            aria-label={`Revoke ${s.full_name || s.email} membership`}
                            onClick={() => setMembership(s, false)}
                            disabled={busy}
                          >
                            <XIcon width={14} height={14} />
                          </button>
                        ) : (
                          <button
                            className="icon-btn"
                            style={{ color: 'var(--ok)' }}
                            title="Confirm membership fee"
                            aria-label={`Confirm ${s.full_name || s.email} membership`}
                            onClick={() => setMembership(s, true)}
                            disabled={busy}
                          >
                            <CheckIcon width={14} height={14} />
                          </button>
                        )}
                        <button className="icon-btn" title="Edit member" aria-label={`Edit ${s.full_name || s.email}`} onClick={() => setEditing(s)}>
                          <PencilIcon width={14} height={14} />
                        </button>
                        <button
                          className="icon-btn"
                          style={{ color: 'var(--danger)' }}
                          title="Delete account"
                          aria-label={`Delete ${s.full_name || s.email}`}
                          onClick={() => deleteStudent(s)}
                          disabled={busy}
                        >
                          <TrashIcon width={14} height={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ── POSTS ────────────────────────────────────────────────── */}
      {tab === 'posts' && (
        loadingPosts ? (
          <div className="panel" style={{ padding: 20 }}><div className="skeleton" style={{ height: 120 }} /></div>
        ) : filteredPosts.length === 0 ? (
          <div className="empty-state panel">
            <span className="ico"><RssIcon width={26} height={26} /></span>
            <b>{posts.length === 0 ? 'No posts yet' : 'No matches'}</b>
            <p>{posts.length === 0 ? 'Posts will appear here as members share them.' : 'Try a different search.'}</p>
          </div>
        ) : (
          <div className="panel" style={{ padding: '8px 6px' }}>
            {filteredPosts.map((p) => (
              <div key={p.id} className="super-row">
                <Avatar name={p.profiles?.full_name} seed={p.profiles?.student_id || p.author_id} size={34} url={p.profiles?.avatar_url} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <b style={{ fontSize: 13 }}>{p.profiles?.full_name || 'deleted member'}</b>
                    <span className={`role-pill role-pill--${p.profiles?.role || 'student'}`}>{roleLabel(p.profiles?.role)}</span>
                    {p.archived && <span className="chip chip--warn">archived</span>}
                    <span className="ocr-label" style={{ fontSize: 9, marginLeft: 'auto' }}>{timeAgo(p.created_at)}</span>
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: 13.5, color: 'var(--ink-soft)', overflowWrap: 'anywhere' }}>{p.content}</p>
                </div>
                <button
                  className="icon-btn"
                  style={{ color: 'var(--danger)' }}
                  title="Delete post"
                  aria-label="Delete post"
                  onClick={() => deletePost(p)}
                >
                  <TrashIcon width={15} height={15} />
                </button>
              </div>
            ))}
          </div>
        )
      )}

      {/* ── ATTENDANCE ───────────────────────────────────────────── */}
      {tab === 'attendance' && (
        loadingAttendance ? (
          <div className="panel" style={{ padding: 20 }}><div className="skeleton" style={{ height: 120 }} /></div>
        ) : filteredAttendance.length === 0 ? (
          <div className="empty-state panel">
            <span className="ico"><QrIcon width={26} height={26} /></span>
            <b>{attendance.length === 0 ? 'No attendance records' : 'No matches'}</b>
            <p>{attendance.length === 0 ? 'Scans will appear here as moderators admit students.' : 'Try a different search or filter.'}</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="codex-table">
              <thead>
                <tr>
                  <th>student</th>
                  <th>id no.</th>
                  <th>event</th>
                  <th>year / section</th>
                  <th>scanned at</th>
                  <th>scanned by</th>
                  <th>remove</th>
                </tr>
              </thead>
              <tbody>
                {filteredAttendance.map((a) => (
                  <tr key={a.id}>
                    <td style={{ display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap' }}>
                      <Avatar name={a.profiles?.full_name} seed={a.student_id} size={30} url={a.profiles?.avatar_url} />
                      {a.profiles?.full_name || 'deleted member'}
                    </td>
                    <td style={{ fontFamily: 'var(--f-ocr)', fontSize: 12 }}>{a.student_id}</td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.events?.title || 'deleted event'}</td>
                    <td>{a.profiles?.year_level} · {a.profiles?.section}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{timeAgo(a.scanned_at)}</td>
                    <td>{scanners[a.scanned_by] || '—'}</td>
                    <td>
                      <button
                        className="icon-btn"
                        style={{ color: 'var(--danger)' }}
                        title="Remove record"
                        aria-label="Remove attendance record"
                        onClick={() => deleteAttendance(a)}
                      >
                        <TrashIcon width={14} height={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <AlertIcon width={14} height={14} style={{ color: 'var(--warn)' }} />
        <span className="ocr-label" style={{ fontSize: 9.5 }}>
          super admin only — role changes are locked to this role; student IDs can never be rewritten
        </span>
      </div>

      {showCreate && (
        <StudentModal
          mode="create"
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); loadStudents(); }}
        />
      )}
      {editing && (
        <StudentModal
          mode="edit"
          student={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); loadStudents(); }}
        />
      )}
    </div>
  );
}

function StudentModal({ mode, student, onClose, onSaved }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(() =>
    student
      ? {
          full_name: student.full_name || '',
          student_id: student.student_id || '',
          year_level: student.year_level || YEARS[0],
          section: student.section || '',
          course: student.course || 'BSIT',
          role: student.role || 'student',
          email: student.email || '',
          password: '',
        }
      : { full_name: '', student_id: '', year_level: YEARS[0], section: '', course: 'BSIT', role: 'student', email: '', password: '' }
  );

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.full_name.trim()) return setError('Full name is required.');
    if (!form.student_id.trim()) return setError('Student ID is required.');
    if (!form.section.trim()) return setError('Section is required.');

    setBusy(true);
    if (mode === 'create') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
        setBusy(false);
        return setError('A valid email address is required.');
      }
      if (form.password.length < 8) {
        setBusy(false);
        return setError('Password must be at least 8 characters.');
      }
      try {
        const t = (await getFreshSession())?.access_token;
        const res = await fetch('/api/admin/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
          body: JSON.stringify({
            email: form.email,
            password: form.password,
            full_name: form.full_name.trim(),
            student_id: form.student_id.trim(),
            year_level: form.year_level,
            section: form.section.trim(),
            course: form.course,
            role: form.role,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'Could not create the account.');
        toast.ok('Student enrolled', `${form.full_name.trim()} can now log in.`);
        onSaved();
      } catch (err) {
        setError(err.message);
      } finally {
        setBusy(false);
      }
      return;
    }

    const { error: err } = await supabase
      .from('profiles')
      .update({
        full_name: form.full_name.trim(),
        year_level: form.year_level,
        section: form.section.trim(),
        course: form.course,
        role: form.role,
      })
      .eq('id', student.id);
    setBusy(false);
    if (err) return setError(err.message);
    toast.ok('Member updated', roleLabel(form.role) === 'student' ? 'Profile saved.' : `Role is now ${roleLabel(form.role)}.`);
    onSaved();
  };

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <h3>
            <UsersIcon width={17} height={17} style={{ verticalAlign: -3, marginRight: 6, color: 'var(--accent-2)' }} />
            {mode === 'create' ? 'Enroll student' : 'Edit member'}
          </h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><XIcon width={16} height={16} /></button>
        </div>
        <form className="modal-body auth-form" onSubmit={submit}>
          {mode === 'create' && (
            <>
              <div className="field">
                <label htmlFor="sa-email">Email</label>
                <input id="sa-email" className="input" type="email" placeholder="juan.delos@student.codex.org" value={form.email} onChange={set('email')} autoComplete="off" />
              </div>
              <div className="field">
                <label htmlFor="sa-pass">Password</label>
                <input id="sa-pass" className="input" type="text" placeholder="min 8 characters — share securely" value={form.password} onChange={set('password')} autoComplete="new-password" />
              </div>
            </>
          )}
          <div className="field">
            <label htmlFor="sa-name">Full name</label>
            <input id="sa-name" className="input" placeholder="Juan Dela Cruz" value={form.full_name} onChange={set('full_name')} />
          </div>
          <div className="field">
            <label htmlFor="sa-sid">Student ID {mode === 'edit' && <span style={{ opacity: 0.6 }}>— locked</span>}</label>
            <input id="sa-sid" className="input" placeholder="2024-1001" value={form.student_id} onChange={set('student_id')} disabled={mode === 'edit'} style={mode === 'edit' ? { opacity: 0.6 } : undefined} />
          </div>
          <div className="auth-grid2">
            <div className="field">
              <label htmlFor="sa-year">Year level</label>
              <select id="sa-year" className="input" value={form.year_level} onChange={set('year_level')}>
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="sa-sec">Section</label>
              <input id="sa-sec" className="input" placeholder="A" value={form.section} onChange={set('section')} />
            </div>
          </div>
          <div className="auth-grid2">
            <div className="field">
              <label htmlFor="sa-course">Course</label>
              <select id="sa-course" className="input" value={form.course} onChange={set('course')}>
                {COURSES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="sa-role">Role</label>
              <select id="sa-role" className="input" value={form.role} onChange={set('role')}>
                {ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
              </select>
            </div>
          </div>
          {error && <div className="err-box"><span>!</span><span>{error}</span></div>}
          <button className="btn btn-accent btn-lg" disabled={busy}>
            {busy ? 'Saving…' : mode === 'create' ? 'Create account' : 'Save changes'}
          </button>
        </form>
      </div>
    </div>
  );
}
