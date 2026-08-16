import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { supabase, apiFetch } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatEventDate, isUpcoming, timeAgo } from '../lib/format';
import { isStaff as checkStaff } from '../lib/roles';
import Avatar from '../components/Avatar';
import {
  ChevronLeftIcon, ClockIcon, MapPinIcon, CameraIcon, QrIcon, CheckIcon,
  UsersIcon, IdIcon, AlertIcon, CommentIcon, XIcon,
} from '../components/icons/Icons';

export default function EventDetail() {
  const { id } = useParams();
  const { profile, user } = useAuth();
  const toast = useToast();
  const [event, setEvent] = useState(null);
  const [attendees, setAttendees] = useState([]);
  const [myAttendance, setMyAttendance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showQr, setShowQr] = useState(false);
  const [rsvps, setRsvps] = useState([]);
  const [rsvpBusy, setRsvpBusy] = useState(false);
  const [comments, setComments] = useState(null);
  const [commentText, setCommentText] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);

  const isStaff = checkStaff(profile?.role);

  const loadComments = async (eventId) => {
    const { data, error } = await supabase
      .from('event_comments')
      .select('id, content, created_at, profiles!event_comments_author_id_fkey(id, full_name, role, avatar_url)')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true });
    if (error) toast.error('Comments error', error.message);
    else setComments(data || []);
  };

  const postComment = async () => {
    const text = commentText.trim();
    if (!text || commentBusy || !user || !event) return;
    setCommentBusy(true);
    const { error } = await supabase
      .from('event_comments')
      .insert({ event_id: event.id, author_id: user.id, content: text.slice(0, 500) });
    setCommentBusy(false);
    if (error) return toast.error('Could not post', error.message);
    setCommentText('');
    await loadComments(event.id);
  };

  const deleteComment = async (comment) => {
    const { error } = await supabase.from('event_comments').delete().eq('id', comment.id);
    if (error) return toast.error('Could not delete', error.message);
    await loadComments(event.id);
  };

  const loadRsvps = async () => {
    const { data, error } = await supabase.from('rsvps').select('event_id, user_id');
    if (!error && data) setRsvps(data);
  };

  const toggleRsvp = async () => {
    if (!user || rsvpBusy || !event) return;
    const mine = rsvps.some((r) => r.event_id === event.id && r.user_id === user.id);
    setRsvpBusy(true);
    const { error } = mine
      ? await supabase.from('rsvps').delete().eq('event_id', event.id).eq('user_id', user.id)
      : await supabase.from('rsvps').insert({ event_id: event.id, user_id: user.id });
    setRsvpBusy(false);
    if (error) return toast.error('RSVP failed', error.message);
    await loadRsvps();
    toast.ok(mine ? 'RSVP cancelled' : 'You\'re going!', mine ? 'See you next time.' : 'We\'ll see you at the event.');
  };

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('events').select('*').eq('id', id).maybeSingle();
      if (error || !data) {
        toast.error('Event not found', error?.message);
        setLoading(false);
        return;
      }
      setEvent(data);

      if (isStaff) {
        const { data: rows } = await supabase.rpc('event_attendance', { p_event_id: id });
        if (rows) setAttendees(rows);
      } else {
        const { data: mine } = await supabase.from('attendance').select('scanned_at').eq('event_id', id);
        setMyAttendance(mine?.length ? mine[0] : null);
      }
      loadRsvps();
      loadComments(id);
      setLoading(false);
    })();
  }, [id, isStaff]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="panel" style={{ padding: 22 }}><div className="skeleton" style={{ height: 110 }} /></div>
        <div className="panel" style={{ padding: 22 }}><div className="skeleton" style={{ height: 60 }} /></div>
      </div>
    );
  }

  if (!event) return null;

  const d = formatEventDate(event.event_date);
  const upcoming = isUpcoming(event.event_date);
  const rsvpCount = rsvps.filter((r) => r.event_id === event.id).length;
  const rsvped = rsvps.some((r) => r.event_id === event.id && r.user_id === user?.id);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Link to="/app/events" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}>
        <ChevronLeftIcon width={16} height={16} /> All events
      </Link>

      <article className="panel" style={{ padding: '22px 24px', position: 'relative', overflow: 'hidden' }}>
        <div className="blob" style={{ width: 260, height: 260, top: -110, right: -70, background: 'var(--accent-glow-soft)' }} />
        <div className="date-block" style={{ marginBottom: 16 }}>
          <b>{d.dayNum}</b>
          <span>{d.month}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', position: 'relative' }}>
          <h2 style={{ margin: 0, fontSize: 21 }}>{event.title}</h2>
          <span className={`chip ${upcoming ? 'chip--teal' : ''}`}>{upcoming ? 'upcoming' : 'past'}</span>
        </div>
        <div className="event-meta" style={{ marginTop: 10 }}>
          <span><ClockIcon width={14} height={14} />{d.day} · {d.time}</span>
          <span><MapPinIcon width={14} height={14} />{event.location || 'TBA'}</span>
        </div>
        {event.description && (
          <p style={{ margin: '16px 0 0', fontSize: 14.5, lineHeight: 1.7, color: 'var(--ink-soft)', position: 'relative' }}>
            {event.description}
          </p>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap', position: 'relative' }}>
          {isStaff ? (
            <>
              <Link to={`/app/scanner/${event.id}`} className="btn btn-primary btn-lg">
                <CameraIcon width={17} height={17} /> Open scanner
              </Link>
              {attendees.length > 0 && (
                <button className="btn btn-outline btn-lg" onClick={() => document.getElementById('attendance-list')?.scrollIntoView({ behavior: 'smooth' })}>
                  <UsersIcon width={17} height={17} /> {attendees.length} attended
                </button>
              )}
              {rsvpCount > 0 && (
                <span className="chip chip--teal" style={{ alignSelf: 'center' }}>
                  <UsersIcon width={12} height={12} /> {rsvpCount} going
                </span>
              )}
            </>
          ) : (
            <>
              <button className="btn btn-accent btn-lg" onClick={() => setShowQr(true)}>
                <QrIcon width={17} height={17} /> Show my QR
              </button>
              {upcoming && (
                <button
                  className={`btn btn-lg ${rsvped ? 'btn-accent' : 'btn-outline'}`}
                  onClick={toggleRsvp}
                  disabled={rsvpBusy}
                >
                  <CheckIcon width={17} height={17} /> {rsvped ? 'Going ✓' : 'RSVP'} {rsvpCount > 0 && `· ${rsvpCount}`}
                </button>
              )}
              {myAttendance ? (
                <span className="chip chip--ok" style={{ alignSelf: 'center' }}>
                  <CheckIcon width={12} height={12} /> present · {timeAgo(myAttendance.scanned_at)}
                </span>
              ) : (
                <span className="chip" style={{ alignSelf: 'center' }}>not scanned yet</span>
              )}
            </>
          )}
        </div>
      </article>

      <div className="panel" style={{ padding: '20px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <CommentIcon width={18} height={18} style={{ color: 'var(--accent-2)' }} />
          <b style={{ fontSize: 15 }}>Discussion · Q&amp;A</b>
          {comments !== null && (
            <span className="chip chip--teal" style={{ marginLeft: 'auto' }}>{comments.length} comment{comments.length === 1 ? '' : 's'}</span>
          )}
        </div>

        <div className="post-comments">
          {comments === null ? (
            <div className="skeleton" style={{ height: 44 }} />
          ) : comments.length === 0 ? (
            <div className="post-comments-empty">No questions yet — ask about the event here.</div>
          ) : (
            comments.map((c) => (
              <div className="comment" key={c.id}>
                <Avatar name={c.profiles?.full_name} seed={c.profiles?.id} size={34} url={c.profiles?.avatar_url} />
                <div className="comment-body">
                  <div className="comment-meta">
                    <b>{c.profiles?.full_name || 'Member'}</b>
                    <span>{timeAgo(c.created_at)}</span>
                    {c.profiles?.role === 'admin' || c.profiles?.role === 'superadmin' ? (
                      <span className="chip chip--teal" style={{ padding: '1px 7px' }}>officer</span>
                    ) : c.profiles?.role === 'moderator' ? (
                      <span className="chip" style={{ padding: '1px 7px' }}>mod</span>
                    ) : null}
                  </div>
                  <p>{c.content}</p>
                  {(c.profiles?.id === user?.id || profile?.role === 'superadmin') && (
                    <div className="comment-actions">
                      <button className="comment-act comment-act--danger" onClick={() => deleteComment(c)}>Delete</button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {user && (
          <div className="comment-form" style={{ marginTop: 12 }}>
            <input
              className="input"
              placeholder="Ask a question about this event…"
              value={commentText}
              maxLength={500}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') postComment();
              }}
            />
            <button className="btn btn-accent btn-sm" onClick={postComment} disabled={!commentText.trim() || commentBusy}>
              {commentBusy ? '…' : 'Post'}
            </button>
          </div>
        )}
      </div>

      {isStaff && (
        <div id="attendance-list" className="panel" style={{ padding: '20px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <UsersIcon width={18} height={18} style={{ color: 'var(--accent-2)' }} />
            <b style={{ fontSize: 15 }}>Attendance log</b>
            <span className="chip chip--teal" style={{ marginLeft: 'auto' }}>{attendees.length} present</span>
          </div>

          {attendees.length === 0 ? (
            <div className="empty-state">
              <span className="ico"><IdIcon width={24} height={24} /></span>
              <b>No one checked in yet</b>
              <p>Hand your phone to the scanning station — or open the scanner and point at student IDs.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="codex-table">
                <thead>
                  <tr>
                    <th>student</th>
                    <th>id no.</th>
                    <th>year / section</th>
                    <th>scanned at</th>
                    <th>scanned by</th>
                  </tr>
                </thead>
                <tbody>
                  {attendees.map((a) => (
                    <tr key={a.student_id}>
<td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap' }}>
                        <Avatar name={a.full_name} seed={a.student_id} size={30} url={a.avatar_url} />
                        {a.full_name}
                      </div>
                    </td>
                      <td style={{ fontFamily: 'var(--f-ocr)', fontSize: 12 }}>{a.student_id}</td>
                      <td>{a.year_level} · {a.section}</td>
                      <td>{timeAgo(a.scanned_at)}</td>
                      <td>{a.scanned_by_name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showQr && !isStaff && (
        <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && setShowQr(false)}>
          <div className="modal">
            <div className="modal-head">
              <h3><QrIcon width={18} height={18} style={{ verticalAlign: -3, marginRight: 6, color: 'var(--accent-2)' }} />Attendance QR</h3>
              <button className="icon-btn" onClick={() => setShowQr(false)} aria-label="Close"><XIcon width={16} height={16} /></button>
            </div>
            <div className="modal-body" style={{ textAlign: 'center' }}>
              <p style={{ marginTop: 0, fontSize: 13.5, color: 'var(--ink-soft)' }}>
                Show this to the <b>moderator</b> for <b>{event.title}</b>. It stays valid for the academic year.
              </p>
              <div style={{ display: 'inline-block', border: '2px solid var(--deep)', borderRadius: 16, padding: 10, background: '#fff' }}>
                <LiveQr />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16, color: 'var(--muted)' }}>
                <AlertIcon width={14} height={14} style={{ color: 'var(--warn)' }} />
                <span className="ocr-label" style={{ fontSize: 9.5 }}>signed &amp; valid for the academic year</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LiveQr() {
  const [dataUrl, setDataUrl] = useState('');
  const [error, setError] = useState('');

  const sign = async () => {
    try {
      const res = await apiFetch('/api/id/sign');
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Could not sign QR');
      }
      const { payload, sig } = await res.json();
      const url = await QRCode.toDataURL(JSON.stringify({ p: payload, s: sig }), {
        width: 232,
        margin: 1,
        color: { dark: '#0b2b3a', light: '#ffffff' },
      });
      setDataUrl(url);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    sign();
  }, []);

  if (error) {
    return <div className="err-box" style={{ width: 232 }}><span>!</span><span>{error}</span></div>;
  }
  if (!dataUrl) {
    return <div className="skeleton" style={{ width: 232, height: 232 }} />;
  }
  return <img src={dataUrl} width={232} height={232} alt="Attendance QR code" style={{ borderRadius: 8 }} />;
}
