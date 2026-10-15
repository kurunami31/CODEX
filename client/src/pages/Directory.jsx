import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, apiFetch } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Avatar from '../components/Avatar';
import IdCardModal from '../components/IdCardModal';
import { roleLabel } from '../lib/roles';
import { IdIcon, SearchIcon, UsersIcon, CheckIcon, WalletIcon, ShieldIcon } from '../components/icons/Icons';

const HIDDEN_ROLES = ['admin', 'superadmin'];

/**
 * Staff member directory (moderators + admins + superadmins). Officers can
 * look up any member's digital ID here — except the IDs of admins and
 * superadmins, which are private.
 */
export default function Directory() {
  const { profile } = useAuth();
  const toast = useToast();
  const isSuper = profile?.role === 'superadmin';
  const [members, setMembers] = useState([]);
  const [search, setSearch] = useState('');
  const [viewing, setViewing] = useState(null);
  const [loading, setLoading] = useState(true);
  // Onboarding chores: anyone who signed up but hasn't confirmed their email.
  // Moderators help clear this list so Supabase's confirmation-email limits
  // never leave a member unable to log in.
  const canConfirm = ['moderator', 'admin', 'superadmin'].includes(profile?.role);
  const [pending, setPending] = useState([]);
  const [pendingBusy, setPendingBusy] = useState(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_members');
    if (error) toast.error('Directory error', error.message);
    else setMembers((data || []).filter((m) => !HIDDEN_ROLES.includes(m.role)));
    setLoading(false);
  }, [toast]);

  const loadPending = useCallback(async () => {
    if (!canConfirm) return;
    try {
      const res = await apiFetch('/api/admin/users/pending', { method: 'GET' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not load pending sign-ups.');
      setPending(body.users || []);
    } catch { /* non-fatal — the directory still works */ }
  }, [canConfirm]);

  useEffect(() => {
    load();
    loadPending();
  }, [load, loadPending]);

  const confirmPending = async (u) => {
    setPendingBusy(u.id);
    try {
      const res = await apiFetch(`/api/admin/users/${u.id}/confirm`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Confirm failed.');
      toast.ok('Registration confirmed', `${u.full_name || u.email} can log in now.`);
      setPending((list) => list.filter((x) => x.id !== u.id));
    } catch (err) {
      toast.error('Confirm failed', err.message);
    } finally {
      setPendingBusy(null);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) =>
      [m.full_name, m.student_id, m.section, m.year_level, m.role].some((v) => v && String(v).toLowerCase().includes(q))
    );
  }, [members, search]);

  const viewingMember = members.find((m) => m.id === viewing) || null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <IdIcon width={20} height={20} style={{ color: 'var(--accent-2)' }} /> Member directory
        </h2>
        <span className="ocr-label">
          staff tool · view digital ids — officers&apos; own ids are private
        </span>
      </div>

      {canConfirm && pending.length > 0 && (
        <div className="panel" style={{ padding: '18px 20px', borderColor: 'var(--warn)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
            <CheckIcon width={17} height={17} style={{ color: 'var(--warn)' }} />
            <b style={{ fontSize: 15 }}>Pending sign-ups</b>
            <span className="chip chip--warn" style={{ marginLeft: 'auto' }}>{pending.length} to confirm</span>
          </div>
          <p className="ocr-label" style={{ margin: '0 0 12px' }}>
            signed up but never confirmed their email — confirm one to let them log in right away
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pending.map((u) => (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <Avatar name={u.full_name} seed={u.student_id || u.id} size={28} url={u.avatar_url} />
                <div style={{ minWidth: 0 }}>
                  <b style={{ fontSize: 13.5 }}>{u.full_name || '—'}</b>
                  <div className="ocr-label" style={{ fontSize: 9.5 }}>
                    {u.email}{u.student_id ? ` · ${u.student_id}` : ''}{u.year_level ? ` · ${u.year_level}` : ''}
                  </div>
                </div>
                <button
                  className="btn btn-accent btn-sm"
                  style={{ marginLeft: 'auto' }}
                  onClick={() => confirmPending(u)}
                  disabled={pendingBusy === u.id}
                  title="Confirm this registration so they can log in"
                  aria-label={`Confirm ${u.full_name || u.email}`}
                >
                  <CheckIcon width={13} height={13} /> {pendingBusy === u.id ? 'Confirming…' : 'Confirm'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="panel" style={{ padding: '20px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <UsersIcon width={18} height={18} style={{ color: 'var(--accent-2)' }} />
          <b style={{ fontSize: 15 }}>Members</b>
          <span className="chip chip--teal" style={{ marginLeft: 'auto' }}>{members.length} members</span>
          <div className="search-box" style={{ maxWidth: 260, width: '100%' }}>
            <SearchIcon width={15} height={15} />
            <input placeholder="Search name, ID, section…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        {loading ? (
          <div className="skeleton" style={{ height: 60 }} />
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <span className="ico"><IdIcon width={24} height={24} /></span>
            <b>{members.length === 0 ? 'No members yet' : 'No matches'}</b>
            <p>{members.length === 0 ? 'Members appear here once they sign up or are enrolled.' : 'Try a different search.'}</p>
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
                  {isSuper && <th>membership</th>}
                  <th>digital id</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap' }}>
                        <Avatar name={m.full_name} seed={m.student_id || m.id} size={30} url={m.avatar_url} />
                        <b>{m.full_name || '—'}</b>
                      </div>
                    </td>
                    <td style={{ fontFamily: 'var(--f-ocr)', fontSize: 12 }}>{m.student_id || '—'}</td>
                    <td>{m.year_level} · {m.section}</td>
                    <td><span className={`role-pill role-pill--${m.role || 'student'}`}>{roleLabel(m.role, m.position)}</span></td>
                    {isSuper && (
                      <td>
                        {m.membership_paid ? (
                          <span className="chip chip--ok"><CheckIcon width={11} height={11} /> paid</span>
                        ) : (
                          <span className="chip chip--warn"><WalletIcon width={11} height={11} /> unpaid</span>
                        )}
                      </td>
                    )}
                    <td>
                      <button className="btn btn-outline btn-sm" onClick={() => setViewing(m.id)}>
                        <IdIcon width={14} height={14} /> View ID
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {profile && !HIDDEN_ROLES.includes(profile.role) && (
          <p className="ocr-label" style={{ margin: '14px 0 0', display: 'flex', alignItems: 'center', gap: 6 }}>
            <ShieldIcon width={13} height={13} /> you can look up your own ID from <b>My ID</b> in the sidebar.
          </p>
        )}
      </div>

      {viewingMember && <IdCardModal member={viewingMember} onClose={() => setViewing(null)} />}
    </div>
  );
}
