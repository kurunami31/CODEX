import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { timeAgo } from '../lib/format';
import { roleLabel } from '../lib/roles';
import Avatar from '../components/Avatar';
import {
  ShieldIcon, CheckIcon, FlagIcon, SearchIcon, PlusIcon,
  XIcon, CertificateIcon, UsersIcon, RssIcon, AlertIcon,
} from '../components/icons/Icons';

const CERT_TYPES = ['membership', 'event', 'election'];

export default function Adviser() {
  const { profile } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState('posts');
  const [posts, setPosts] = useState([]);
  const [members, setMembers] = useState([]);
  const [endorsements, setEndorsements] = useState([]);
  const [events, setEvents] = useState([]);
  const [search, setSearch] = useState('');
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [loadingEndorsements, setLoadingEndorsements] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showEndorse, setShowEndorse] = useState(false);

  const loadPosts = useCallback(async () => {
    setLoadingPosts(true);
    const { data, error } = await supabase.rpc('get_posts_with_authors');
    if (error) toast.error('Posts error', error.message);
    else setPosts(data || []);
    setLoadingPosts(false);
  }, [toast]);

  const loadMembers = useCallback(async () => {
    setLoadingMembers(true);
    const { data, error } = await supabase.rpc('get_members');
    if (error) toast.error('Members error', error.message);
    else setMembers(data || []);
    setLoadingMembers(false);
  }, [toast]);

  const loadEndorsements = useCallback(async () => {
    setLoadingEndorsements(true);
    const { data, error } = await supabase.rpc('get_endorsements');
    if (error) toast.error('Endorsements error', error.message);
    else setEndorsements(data || []);
    setLoadingEndorsements(false);
  }, [toast]);

  const loadEvents = useCallback(async () => {
    const { data, error } = await supabase.from('events').select('id, title, event_date').order('event_date', { ascending: false });
    if (!error) setEvents(data || []);
  }, []);

  useEffect(() => {
    loadPosts();
    loadMembers();
    loadEndorsements();
    loadEvents();
  }, [loadPosts, loadMembers, loadEndorsements, loadEvents]);

  const reviewPost = async (postId, status) => {
    setBusy(true);
    const { error } = await supabase.rpc('adviser_review_post', { p_post_id: postId, p_status: status });
    setBusy(false);
    if (error) return toast.error('Review failed', error.message);
    toast.ok('Post reviewed', `Post is now ${status}.`);
    loadPosts();
  };

  const endorseStudent = async (studentId, certType, eventId, notes) => {
    setBusy(true);
    const { error } = await supabase.rpc('endorse_certificate', {
      p_student_id: studentId,
      p_certificate_type: certType,
      p_event_id: eventId || null,
      p_notes: notes || null,
    });
    setBusy(false);
    if (error) return toast.error('Endorsement failed', error.message);
    toast.ok('Endorsed', `Certificate endorsement recorded for ${studentId}.`);
    loadEndorsements();
  };

  const revokeEndorsement = async (studentId, certType, eventId) => {
    setBusy(true);
    const { error } = await supabase.rpc('revoke_endorsement', {
      p_student_id: studentId,
      p_certificate_type: certType,
      p_event_id: eventId || null,
    });
    setBusy(false);
    if (error) return toast.error('Revoke failed', error.message);
    toast.ok('Revoked', 'Certificate endorsement removed.');
    loadEndorsements();
  };

  const filteredPosts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return posts;
    return posts.filter((p) =>
      [p.content, p.profiles?.full_name, p.status].some((v) => v && String(v).toLowerCase().includes(q))
    );
  }, [posts, search]);

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) =>
      [m.full_name, m.student_id, m.section, m.year_level].some((v) => v && String(v).toLowerCase().includes(q))
    );
  }, [members, search]);

  const pendingPosts = filteredPosts.filter((p) => p.status === 'pending');
  const flaggedPosts = filteredPosts.filter((p) => p.status === 'flagged');
  const allFiltered = filteredPosts;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="events-head">
        <div>
          <h2 style={{ margin: 0, fontSize: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
            <ShieldIcon width={20} height={20} style={{ color: 'var(--accent-2)' }} /> Adviser Panel
          </h2>
          <span className="ocr-label">adviser · post review &amp; certificate endorsement</span>
        </div>
      </div>

      <div className="panel" style={{ padding: '18px 20px', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {[
          { icon: <RssIcon width={15} height={15} />, k: 'total posts', v: posts.length },
          { icon: <AlertIcon width={15} height={15} />, k: 'pending review', v: posts.filter((p) => p.status === 'pending').length },
          { icon: <FlagIcon width={15} height={15} />, k: 'flagged', v: posts.filter((p) => p.status === 'flagged').length },
          { icon: <UsersIcon width={15} height={15} />, k: 'members', v: members.length },
          { icon: <CertificateIcon width={15} height={15} />, k: 'endorsements', v: endorsements.length },
          { icon: <ShieldIcon width={15} height={15} />, k: 'your role', v: roleLabel(profile?.role) },
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

      <div className="seg-tabs" role="tablist">
        {[
          { id: 'posts', label: 'Review Posts', icon: <RssIcon width={16} height={16} /> },
          { id: 'certificates', label: 'Certificates', icon: <CertificateIcon width={16} height={16} /> },
          { id: 'members', label: 'Members', icon: <UsersIcon width={16} height={16} /> },
        ].map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`seg-tab${tab === t.id ? ' seg-tab--on' : ''}`}
            onClick={() => { setTab(t.id); setSearch(''); }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className="toolbar-row">
        <div className="search-box" style={{ maxWidth: 340, flex: 1 }}>
          <SearchIcon width={16} height={16} />
          <input
            placeholder={tab === 'posts' ? 'Search posts, authors, status…' : 'Search members, endorsements…'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* ── POSTS TAB ─────────────────────────────────────────────── */}
      {tab === 'posts' && (
        loadingPosts ? (
          <div className="panel" style={{ padding: 20 }}><div className="skeleton" style={{ height: 120 }} /></div>
        ) : allFiltered.length === 0 ? (
          <div className="empty-state panel">
            <span className="ico"><RssIcon width={26} height={26} /></span>
            <b>No posts found</b>
            <p>Posts from members will appear here for your review.</p>
          </div>
        ) : (
          <div className="panel" style={{ padding: '8px 6px' }}>
            {allFiltered.map((p) => (
              <div key={p.id} className="super-row">
                <Avatar name={p.profiles?.full_name} seed={p.author_id} size={34} url={p.profiles?.avatar_url} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <b style={{ fontSize: 13 }}>{p.profiles?.full_name || 'deleted member'}</b>
                    <span className={`role-pill role-pill--${p.profiles?.role || 'student'}`}>{roleLabel(p.profiles?.role)}</span>
                    {p.profiles?.section && <span className="ocr-label" style={{ fontSize: 9 }}>section {p.profiles.section}</span>}
                    {p.profiles?.student_id && <span className="ocr-label" style={{ fontFamily: 'var(--f-ocr)', fontSize: 9 }}>ID {p.profiles.student_id}</span>}
                    <span className={`chip ${p.status === 'flagged' ? 'chip--warn' : p.status === 'pending' ? '' : 'chip--ok'}`} style={{ marginLeft: 4 }}>
                      {p.status || 'approved'}
                    </span>
                    <span className="ocr-label" style={{ fontSize: 9, marginLeft: 'auto' }}>{timeAgo(p.created_at)}</span>
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: 13.5, color: 'var(--ink-soft)', overflowWrap: 'anywhere' }}>{p.content}</p>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {p.status !== 'approved' && (
                    <button
                      className="icon-btn"
                      style={{ color: 'var(--ok)' }}
                      title="Approve post"
                      aria-label="Approve post"
                      onClick={() => reviewPost(p.id, 'approved')}
                      disabled={busy}
                    >
                      <CheckIcon width={14} height={14} />
                    </button>
                  )}
                  {p.status !== 'flagged' && (
                    <button
                      className="icon-btn"
                      style={{ color: 'var(--warn)' }}
                      title="Flag post"
                      aria-label="Flag post"
                      onClick={() => reviewPost(p.id, 'flagged')}
                      disabled={busy}
                    >
                      <FlagIcon width={14} height={14} />
                    </button>
                  )}
                  {p.status !== 'pending' && (
                    <button
                      className="icon-btn"
                      title="Set to pending"
                      aria-label="Set to pending"
                      onClick={() => reviewPost(p.id, 'pending')}
                      disabled={busy}
                    >
                      <AlertIcon width={14} height={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* ── CERTIFICATES TAB ───────────────────────────────────────── */}
      {tab === 'certificates' && (
        loadingEndorsements ? (
          <div className="panel" style={{ padding: 20 }}><div className="skeleton" style={{ height: 120 }} /></div>
        ) : (
          <>
            <div className="panel" style={{ padding: '20px 22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                <CertificateIcon width={18} height={18} style={{ color: 'var(--accent-2)' }} />
                <b style={{ fontSize: 15 }}>Certificate Endorsements</b>
                <span className="chip chip--teal" style={{ marginLeft: 'auto' }}>{endorsements.length} endorsed</span>
                <button className="btn btn-accent btn-sm" onClick={() => setShowEndorse(true)}>
                  <PlusIcon width={14} height={14} /> New endorsement
                </button>
              </div>

              {endorsements.length === 0 ? (
                <div className="empty-state">
                  <span className="ico"><CertificateIcon width={24} height={24} /></span>
                  <b>No endorsements yet</b>
                  <p>Endorse students for certificates to verify their participation.</p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="codex-table">
                    <thead>
                      <tr>
                        <th>student</th>
                        <th>section</th>
                        <th>type</th>
                        <th>endorsed</th>
                        <th>notes</th>
                        <th>revoke</th>
                      </tr>
                    </thead>
                    <tbody>
                      {endorsements.map((e) => (
                        <tr key={e.id}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap' }}>
                              <Avatar name={e.student_name} seed={e.student_id} size={28} />
                              <b>{e.student_name || e.student_id}</b>
                            </div>
                          </td>
                          <td>{e.year_level} · {e.section}</td>
                          <td><span className={`chip ${e.certificate_type === 'membership' ? 'chip--ok' : 'chip--teal'}`}>{e.certificate_type}</span></td>
                          <td style={{ whiteSpace: 'nowrap', color: 'var(--muted)', fontSize: 12 }}>{timeAgo(e.endorsed_at)}</td>
                          <td style={{ fontSize: 12, color: 'var(--ink-soft)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.notes || '—'}</td>
                          <td>
                            <button
                              className="icon-btn"
                              style={{ color: 'var(--danger)' }}
                              title="Revoke endorsement"
                              aria-label="Revoke endorsement"
                              onClick={() => revokeEndorsement(e.student_id, e.certificate_type, e.event_id)}
                              disabled={busy}
                            >
                              <XIcon width={14} height={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {showEndorse && (
              <EndorseModal
                members={members}
                events={events}
                onClose={() => setShowEndorse(false)}
                onEndorsed={() => { setShowEndorse(false); loadEndorsements(); }}
                busy={busy}
              />
            )}
          </>
        )
      )}

      {/* ── MEMBERS TAB ────────────────────────────────────────────── */}
      {tab === 'members' && (
        loadingMembers ? (
          <div className="panel" style={{ padding: 20 }}><div className="skeleton" style={{ height: 120 }} /></div>
        ) : filteredMembers.length === 0 ? (
          <div className="empty-state panel">
            <span className="ico"><UsersIcon width={26} height={26} /></span>
            <b>{members.length === 0 ? 'No members yet' : 'No matches'}</b>
            <p>{members.length === 0 ? 'Members will appear here once they sign up.' : 'Try a different search.'}</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="codex-table">
              <thead>
                <tr>
                  <th>member</th>
                  <th>id no.</th>
                  <th>year / section</th>
                  <th>role</th>
                  <th>membership</th>
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap' }}>
                        <Avatar name={m.full_name} seed={m.student_id || m.id} size={30} url={m.avatar_url} />
                        <b>{m.full_name || '—'}</b>
                      </div>
                    </td>
                    <td style={{ fontFamily: 'var(--f-ocr)', fontSize: 12 }}>{m.student_id || '—'}</td>
                    <td>{m.year_level} · {m.section}</td>
                    <td><span className={`role-pill role-pill--${m.role || 'student'}`}>{roleLabel(m.role)}</span></td>
                    <td>
                      {m.membership_paid ? (
                        <span className="chip chip--ok"><CheckIcon width={11} height={11} /> paid</span>
                      ) : (
                        <span className="chip chip--warn">unpaid</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}

function EndorseModal({ members, events, onClose, onEndorsed, busy }) {
  const toast = useToast();
  const [form, setForm] = useState({ student_id: '', certificate_type: 'membership', event_id: '', notes: '' });
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.student_id.trim()) return setError('Please select a student.');

    const { error: err } = await supabase.rpc('endorse_certificate', {
      p_student_id: form.student_id.trim(),
      p_certificate_type: form.certificate_type,
      p_event_id: form.event_id || null,
      p_notes: form.notes.trim() || null,
    });
    if (err) return setError(err.message);
    toast.ok('Endorsed', `Certificate endorsement recorded.`);
    onEndorsed();
  };

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <h3><CertificateIcon width={17} height={17} style={{ verticalAlign: -3, marginRight: 6, color: 'var(--accent-2)' }} />Endorse certificate</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><XIcon width={16} height={16} /></button>
        </div>
        <form className="modal-body auth-form" onSubmit={submit}>
          <div className="field">
            <label htmlFor="end-student">Student</label>
            <select id="end-student" className="input" value={form.student_id} onChange={(e) => setForm({ ...form, student_id: e.target.value })} required>
              <option value="">Select a student…</option>
              {members.map((m) => (
                <option key={m.id} value={m.student_id}>{m.full_name} ({m.student_id})</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="end-type">Certificate type</label>
            <select id="end-type" className="input" value={form.certificate_type} onChange={(e) => setForm({ ...form, certificate_type: e.target.value })}>
              {CERT_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
          </div>
          {form.certificate_type === 'event' && (
            <div className="field">
              <label htmlFor="end-event">Event</label>
              <select id="end-event" className="input" value={form.event_id} onChange={(e) => setForm({ ...form, event_id: e.target.value })}>
                <option value="">Select an event…</option>
                {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
              </select>
            </div>
          )}
          <div className="field">
            <label htmlFor="end-notes">Notes (optional)</label>
            <input id="end-notes" className="input" placeholder="Optional endorsement notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={200} />
          </div>
          {error && <div className="err-box"><span>!</span><span>{error}</span></div>}
          <button className="btn btn-accent btn-lg" disabled={busy}>{busy ? 'Saving…' : 'Endorse'}</button>
        </form>
      </div>
    </div>
  );
}
