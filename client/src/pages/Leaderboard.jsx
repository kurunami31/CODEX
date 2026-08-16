import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Avatar from '../components/Avatar';
import { roleLabel } from '../lib/roles';
import { TrophyIcon, StarIcon, CheckIcon, AlertIcon } from '../components/icons/Icons';

const MEDALS = ['gold', 'silver', 'bronze'];

export default function Leaderboard() {
  const { user, profile } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [myRank, setMyRank] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_members');
    if (error) return toast.error('Leaderboard error', error.message);
    const all = (data || []).filter((m) => m.points != null);
    setRows(all.slice().sort((a, b) => b.points - a.points || String(a.full_name).localeCompare(b.full_name)).slice(0, 50));

    if (user && profile) {
      const above = all.filter((m) => m.points > (profile.points ?? 0)).length;
      setMyRank(above + 1);
    }
    setLoading(false);
  }, [user, profile, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const mine = rows.find((r) => r.id === user?.id);
  const podium = rows.slice(0, 3);
  const rest = rows.slice(3);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <TrophyIcon width={20} height={20} style={{ color: 'var(--warn)' }} /> Leaderboard
        </h2>
        <span className="ocr-label">org points · posts +5 · events attended +10</span>
      </div>

      <div className="panel" style={{ padding: '18px 20px', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="chip chip--teal"><StarIcon width={12} height={12} /> +5 per post</span>
        <span className="chip chip--ok"><CheckIcon width={12} height={12} /> +10 per event</span>
        {profile && (
          <span className="chip" style={{ marginLeft: 'auto' }}>
            you: <b>{profile.points ?? 0}</b> pts{mine ? ` · rank #${rows.indexOf(mine) + 1}` : myRank ? ` · rank #${myRank}` : ''}
          </span>
        )}
      </div>

      {loading ? (
        <div className="panel" style={{ padding: 20 }}><div className="skeleton" style={{ height: 200 }} /></div>
      ) : rows.length === 0 ? (
        <div className="empty-state panel">
          <span className="ico"><TrophyIcon width={26} height={26} /></span>
          <b>No points yet</b>
          <p>Post on the feed (+5) and show up to events (+10) to start climbing.</p>
        </div>
      ) : (
        <>
          {podium.length > 0 && (
            <div className="podium">
              {podium.map((p, i) => (
                <div key={p.id} className={`podium-card panel podium-card--${MEDALS[i]}`}>
                  <div className="podium-rank">
                    <span className="podium-medal">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
                    <b>#{i + 1}</b>
                  </div>
                  <Avatar name={p.full_name} seed={p.student_id || p.id} size={64} ring url={p.avatar_url} />
                  <b className="podium-name">{p.full_name || 'Member'}</b>
                  <span className="ocr-label">{p.year_level} · {p.section}</span>
                  <span className="podium-points"><TrophyIcon width={14} height={14} />{p.points} pts</span>
                  {p.id === user?.id && <span className="chip chip--teal">that's you</span>}
                </div>
              ))}
            </div>
          )}

          {rest.length > 0 && (
            <div className="panel" style={{ padding: '20px 22px' }}>
              <div className="section-title" style={{ marginTop: 0 }}>the rest of the pack</div>
              <div className="table-wrap">
                <table className="codex-table">
                  <thead>
                    <tr>
                      <th>rank</th>
                      <th>member</th>
                      <th>id no.</th>
                      <th>year / section</th>
                      <th>role</th>
                      <th>points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rest.map((p, i) => (
                      <tr key={p.id} className={p.id === user?.id ? 'row-me' : ''}>
                        <td style={{ fontFamily: 'var(--f-ocr)', fontSize: 12, color: 'var(--muted)' }}>#{i + 4}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap' }}>
                            <Avatar name={p.full_name} seed={p.student_id || p.id} size={28} url={p.avatar_url} />
                            <b>{p.full_name || '—'}</b>
                          </div>
                        </td>
                        <td style={{ fontFamily: 'var(--f-ocr)', fontSize: 12 }}>{p.student_id || '—'}</td>
                        <td>{p.year_level} · {p.section}</td>
                        <td><span className={`role-pill role-pill--${p.role || 'student'}`}>{roleLabel(p.role)}</span></td>
                        <td><b>{p.points}</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!mine && myRank && myRank > 50 && (
            <div className="panel" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <AlertIcon width={16} height={16} style={{ color: 'var(--warn)' }} />
              <span style={{ fontSize: 13.5 }}>You're ranked <b>#{myRank}</b> with <b>{profile?.points ?? 0}</b> pts — keep posting and attending to crack the top 50.</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
