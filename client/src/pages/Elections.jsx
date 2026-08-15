import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Avatar from '../components/Avatar';
import {
  GavelIcon, PlusIcon, XIcon, CheckIcon, LockIcon, UnlockIcon,
  UsersIcon, TrophyIcon, SearchIcon, PencilIcon, TrashIcon, ArchiveIcon,
} from '../components/icons/Icons';

const POSITIONS = [
  'President', 'Vice President', 'Secretary', 'Treasurer', 'Auditor',
  'Public Relations Officer', 'Sergeant-at-Arms',
];

const CANDIDATE_SELECT =
  'id, election_id, user_id, position, platform, ' +
  'profiles!election_candidates_user_id_fkey(id, full_name, avatar_url, year_level, section, student_id, role)';

export default function Elections() {
  const { user, profile } = useAuth();
  const toast = useToast();
  const isAdmin = ['admin', 'superadmin'].includes(profile?.role);
  const [elections, setElections] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [myVotes, setMyVotes] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selections, setSelections] = useState({}); // electionId -> { position: candidateId }
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editFor, setEditFor] = useState(null); // election being edited
  const [addFor, setAddFor] = useState(null); // election id currently adding a candidate to
  const [tally, setTally] = useState({}); // electionId -> rows
  const [tallyBusy, setTallyBusy] = useState({});
  const [memberSearch, setMemberSearch] = useState('');

  const load = useCallback(async () => {
    const [e, c, v, m] = await Promise.all([
      supabase.from('elections').select('*').order('created_at', { ascending: false }),
      supabase.from('election_candidates').select(CANDIDATE_SELECT),
      user ? supabase.from('election_votes').select('election_id, position, candidate_id') : Promise.resolve({ data: [] }),
      isAdmin ? supabase.from('profiles').select('id, full_name, student_id, year_level, section').order('full_name', { ascending: true }) : Promise.resolve({ data: [] }),
    ]);
    if (e.error) toast.error('Elections error', e.error.message);
    else setElections(e.data || []);
    if (c.error) toast.error('Candidates error', c.error.message);
    else setCandidates(c.data || []);
    if (!v.error) setMyVotes(v.data || []);
    if (!m.error) setMembers(m.data || []);
    setLoading(false);
  }, [user, isAdmin, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const byElection = useMemo(() => {
    const map = {};
    for (const c of candidates) {
      (map[c.election_id] ||= []).push(c);
    }
    for (const list of Object.values(map)) {
      list.sort((a, b) => {
        const pa = POSITIONS.indexOf(a.position);
        const pb = POSITIONS.indexOf(b.position);
        return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb) || a.profiles?.full_name?.localeCompare(b.profiles?.full_name || '');
      });
    }
    return map;
  }, [candidates]);

  const votedFor = useMemo(() => {
    const map = {};
    for (const v of myVotes) {
      (map[v.election_id] ||= {})[v.position] = v.candidate_id;
    }
    return map;
  }, [myVotes]);

  const pick = (electionId, position, candidateId) => {
    setSelections((s) => {
      const cur = s[electionId] || {};
      return { ...s, [electionId]: { ...cur, [position]: candidateId } };
    });
  };

  const submitVotes = async (electionId) => {
    const chosen = selections[electionId] || {};
    const entries = Object.entries(chosen);
    if (entries.length === 0 || busy) return;
    setBusy(true);
    const rows = entries.map(([position, candidateId]) => ({
      election_id: electionId,
      voter_id: user.id,
      candidate_id: candidateId,
      position,
    }));
    const { error } = await supabase.from('election_votes').insert(rows);
    setBusy(false);
    if (error) return toast.error('Vote failed', error.message);
    toast.ok('Votes cast', 'Your ballot was recorded — thanks for voting!');
    setSelections((s) => ({ ...s, [electionId]: {} }));
    load();
  };

  const createElection = async (title, description) => {
    setBusy(true);
    const { error } = await supabase.from('elections').insert({
      title,
      description: description || null,
      created_by: user.id,
    });
    setBusy(false);
    if (error) return toast.error('Could not create', error.message);
    toast.ok('Election created', 'Add candidates, then open it to start voting.');
    setCreateOpen(false);
    load();
  };

  const saveElection = async (election, title, description) => {
    setBusy(true);
    const { error } = await supabase
      .from('elections')
      .update({ title, description: description || null })
      .eq('id', election.id);
    setBusy(false);
    if (error) return toast.error('Could not save', error.message);
    toast.ok('Election updated', 'Changes are live.');
    setEditFor(null);
    load();
  };

  const toggleOpen = async (election) => {
    setBusy(true);
    const { error } = await supabase
      .from('elections')
      .update({ open: !election.open })
      .eq('id', election.id);
    setBusy(false);
    if (error) return toast.error('Update failed', error.message);
    toast.ok(election.open ? 'Election closed' : 'Election opened', election.open ? 'Voting has ended.' : 'Members can now vote.');
    load();
  };

  const archiveElection = async (election) => {
    setBusy(true);
    const { error } = await supabase
      .from('elections')
      .update({ archived: !election.archived })
      .eq('id', election.id);
    setBusy(false);
    if (error) return toast.error('Update failed', error.message);
    toast.ok(election.archived ? 'Election restored' : 'Election archived', election.archived ? 'Back on the list.' : 'Hidden from members — restore it anytime.');
    load();
  };

  const deleteElection = async (election) => {
    if (!window.confirm(`Delete "${election.title}" permanently? Its candidates and every vote are removed too.`)) return;
    setBusy(true);
    const { error } = await supabase.from('elections').delete().eq('id', election.id);
    setBusy(false);
    if (error) return toast.error('Could not delete', error.message);
    toast.ok('Election deleted', 'Removed with its candidates and votes.');
    setTally((t) => {
      const next = { ...t };
      delete next[election.id];
      return next;
    });
    load();
  };

  const addCandidate = async (electionId, memberId, position, platform) => {
    if (!memberId || !position.trim()) return toast.error('Missing fields', 'Pick a member and enter a position.');
    setBusy(true);
    const { error } = await supabase.from('election_candidates').insert({
      election_id: electionId,
      user_id: memberId,
      position: position.trim().slice(0, 80),
      platform: platform.trim().slice(0, 500) || null,
    });
    setBusy(false);
    if (error) return toast.error('Could not add', error.message);
    toast.ok('Candidate added', 'They now appear on the ballot.');
    setAddFor(null);
    setMemberSearch('');
    load();
  };

  const removeCandidate = async (candidate) => {
    if (!window.confirm(`Remove ${candidate.profiles?.full_name || 'this candidate'} from the ballot?`)) return;
    const { error } = await supabase.from('election_candidates').delete().eq('id', candidate.id);
    if (error) return toast.error('Could not remove', error.message);
    toast.ok('Candidate removed', 'Removed from the ballot.');
    load();
  };

  const loadTally = async (electionId) => {
    setTallyBusy((t) => ({ ...t, [electionId]: true }));
    const { data, error } = await supabase.rpc('election_tally', { p_election_id: electionId });
    setTallyBusy((t) => ({ ...t, [electionId]: false }));
    if (error) return toast.error('Tally failed', error.message);
    setTally((t) => ({ ...t, [electionId]: data || [] }));
  };

  const openElections = elections.filter((e) => e.open && !e.archived);
  const closedElections = elections.filter((e) => !e.open && !e.archived);
  const archivedElections = elections.filter((e) => e.archived);
  const openFor = addFor ? elections.find((e) => e.id === addFor) : null;
  const availableMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    const used = new Set((byElection[addFor] || []).map((c) => c.user_id));
    return members.filter(
      (m) => !used.has(m.id) && (!q || [m.full_name, m.student_id, m.section, m.year_level].some((v) => v && String(v).toLowerCase().includes(q)))
    );
  }, [members, memberSearch, addFor, byElection]);

  if (!profile) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="events-head">
        <div>
          <h2 style={{ margin: 0, fontSize: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
            <GavelIcon width={20} height={20} style={{ color: 'var(--accent-2)' }} /> Officer elections
          </h2>
          <span className="ocr-label">digital ballots · one vote per position</span>
        </div>
        {isAdmin && (
          <button className="btn btn-accent" onClick={() => setCreateOpen(true)}>
            <PlusIcon width={16} height={16} /> New election
          </button>
        )}
      </div>

      {loading ? (
        <div className="panel" style={{ padding: 20 }}><div className="skeleton" style={{ height: 160 }} /></div>
      ) : elections.length === 0 ? (
        <div className="empty-state panel">
          <span className="ico"><GavelIcon width={26} height={26} /></span>
          <b>No elections yet</b>
          <p>Officers can create an election here and members vote with their CODEBYTERS account.</p>
        </div>
      ) : (
        <>
          <div className="section-title">open ballots</div>
          {openElections.length === 0 ? (
            <div className="empty-state panel">
              <span className="ico"><LockIcon width={24} height={24} /></span>
              <b>Nothing open right now</b>
              <p>Keep an eye on the feed — officers announce when voting opens.</p>
            </div>
          ) : (
            openElections.map((election) => (
              <ElectionBallot
                key={election.id}
                election={election}
                candidates={byElection[election.id] || []}
                myVotes={votedFor[election.id] || {}}
                selections={selections[election.id] || {}}
                onPick={pick}
                onSubmit={() => submitVotes(election.id)}
                busy={busy}
                isAdmin={isAdmin}
                onClose={() => toggleOpen(election)}
                onEdit={() => setEditFor(election)}
                onDelete={() => deleteElection(election)}
                onAddCandidate={() => setAddFor(election.id)}
              />
            ))
          )}

          <div className="section-title">past elections</div>
          {closedElections.length === 0 ? (
            <div className="empty-state panel">
              <span className="ico"><GavelIcon width={24} height={24} /></span>
              <b>No past elections</b>
              <p>Closed elections and their results show up here.</p>
            </div>
          ) : (
            closedElections.map((election) => (
              <div className="panel" key={election.id} style={{ padding: '18px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span className="chip"><LockIcon width={11} height={11} /> closed</span>
                  <b style={{ fontSize: 15 }}>{election.title}</b>
                  {election.description && <span className="ocr-label" style={{ flexBasis: '100%' }}>{election.description}</span>}
                  {isAdmin && (
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button className="btn btn-outline btn-sm" onClick={() => loadTally(election.id)} disabled={tallyBusy[election.id]}>
                        <TrophyIcon width={14} height={14} /> {tallyBusy[election.id] ? 'Counting…' : 'View tally'}
                      </button>
                      <button className="btn btn-outline btn-sm" onClick={() => toggleOpen(election)} disabled={busy}>
                        <UnlockIcon width={14} height={14} /> Reopen
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditFor(election)} disabled={busy}>
                        <PencilIcon width={14} height={14} /> Edit
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => archiveElection(election)} disabled={busy}>
                        <ArchiveIcon width={14} height={14} /> Archive
                      </button>
                      <button className="icon-btn" style={{ width: 30, height: 30, borderRadius: 8, color: 'var(--danger)' }} onClick={() => deleteElection(election)} disabled={busy} title="Delete election" aria-label="Delete election">
                        <TrashIcon width={13} height={13} />
                      </button>
                    </div>
                  )}
                </div>
                {tally[election.id] && <TallyTable rows={tally[election.id]} />}
              </div>
            ))
          )}

          {isAdmin && archivedElections.length > 0 && (
            <>
              <div className="section-title">archived</div>
              {archivedElections.map((election) => (
                <div className="panel" key={election.id} style={{ padding: '18px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span className="chip"><ArchiveIcon width={11} height={11} /> archived</span>
                    <b style={{ fontSize: 15 }}>{election.title}</b>
                    <span className="ocr-label">{election.description}</span>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                      <button className="btn btn-outline btn-sm" onClick={() => archiveElection(election)} disabled={busy}>
                        <UnlockIcon width={14} height={14} /> Restore
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => deleteElection(election)} disabled={busy}>
                        <TrashIcon width={14} height={14} /> Delete
                      </button>
                    </div>
                  </div>
                  {tally[election.id] && <TallyTable rows={tally[election.id]} />}
                </div>
              ))}
            </>
          )}
        </>
      )}

      {isAdmin && candidates.length > 0 && (
        <div className="panel" style={{ padding: '20px 22px' }}>
          <div className="section-title" style={{ marginTop: 0 }}>manage ballots</div>
          <div className="table-wrap">
            <table className="codex-table">
              <thead>
                <tr>
                  <th>election</th>
                  <th>candidate</th>
                  <th>position</th>
                  <th>remove</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontSize: 13 }}>{elections.find((e) => e.id === c.election_id)?.title || '—'}</td>
                    <td style={{ display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap' }}>
                      <Avatar name={c.profiles?.full_name} seed={c.profiles?.student_id || c.user_id} size={26} url={c.profiles?.avatar_url} />
                      <b>{c.profiles?.full_name || 'Member'}</b>
                    </td>
                    <td>{c.position}</td>
                    <td>
                      <button className="icon-btn" style={{ width: 30, height: 30, borderRadius: 8, color: 'var(--danger)' }} onClick={() => removeCandidate(c)} aria-label={`Remove ${c.profiles?.full_name || 'candidate'}`}>
                        <XIcon width={13} height={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {createOpen && (
        <ElectionFormModal
          onClose={() => setCreateOpen(false)}
          onSubmit={createElection}
          busy={busy}
        />
      )}

      {editFor && (
        <ElectionFormModal
          initial={editFor}
          onClose={() => setEditFor(null)}
          onSubmit={(title, description) => saveElection(editFor, title, description)}
          busy={busy}
        />
      )}

      {addFor && openFor && (
        <AddCandidateModal
          election={openFor}
          members={availableMembers}
          search={memberSearch}
          setSearch={setMemberSearch}
          onAdd={addCandidate}
          onClose={() => setAddFor(null)}
          busy={busy}
        />
      )}
    </div>
  );
}

function ElectionBallot({ election, candidates, myVotes, selections, onPick, onSubmit, busy, isAdmin, onClose, onEdit, onDelete, onAddCandidate }) {
  const positions = [...new Set(candidates.map((c) => c.position))];
  if (positions.length === 0) return null;
  const chosenCount = Object.keys(selections).length;
  const votedAll = positions.length > 0 && positions.every((p) => myVotes[p]);

  return (
    <div className="panel" style={{ padding: '20px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <span className="chip chip--ok"><UnlockIcon width={11} height={11} /> open</span>
        <b style={{ fontSize: 16 }}>{election.title}</b>
        {election.description && <span className="ocr-label" style={{ flexBasis: '100%' }}>{election.description}</span>}
        {isAdmin && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-outline btn-sm" onClick={onAddCandidate} disabled={busy}>
              <PlusIcon width={13} height={13} /> Candidate
            </button>
            <button className="btn btn-outline btn-sm" onClick={onClose} disabled={busy}>
              <LockIcon width={13} height={13} /> Close
            </button>
            <button className="btn btn-ghost btn-sm" onClick={onEdit} disabled={busy}>
              <PencilIcon width={13} height={13} /> Edit
            </button>
            <button className="icon-btn" style={{ width: 30, height: 30, borderRadius: 8, color: 'var(--danger)' }} onClick={onDelete} disabled={busy} title="Delete election" aria-label="Delete election">
              <TrashIcon width={13} height={13} />
            </button>
          </div>
        )}
      </div>

      {votedAll ? (
        <div className="empty-state" style={{ padding: 14 }}>
          <span className="ico"><CheckIcon width={24} height={24} /></span>
          <b>You've voted in this election</b>
          <p>Your ballot is sealed. Thanks for making your voice heard!</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {positions.map((position) => {
            const list = candidates.filter((c) => c.position === position);
            const already = myVotes[position];
            return (
              <div key={position}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <b style={{ fontSize: 13.5 }}>{position}</b>
                  {already && <span className="chip chip--ok"><CheckIcon width={11} height={11} /> voted</span>}
                </div>
                <div className="cand-grid">
                  {list.map((c) => {
                    const selected = selections[position] === c.id;
                    return (
                      <button
                        type="button"
                        key={c.id}
                        className={`cand-card panel${selected ? ' cand-card--on' : ''}${already ? ' cand-card--disabled' : ''}`}
                        disabled={Boolean(already)}
                        onClick={() => onPick(election.id, position, c.id)}
                        aria-pressed={selected}
                      >
                        <Avatar name={c.profiles?.full_name} seed={c.profiles?.student_id || c.user_id} size={44} ring url={c.profiles?.avatar_url} />
                        <b style={{ fontSize: 14 }}>{c.profiles?.full_name || 'Member'}</b>
                        <span className="ocr-label">{c.profiles?.year_level} · {c.profiles?.section}{c.profiles?.student_id ? ` · ${c.profiles.student_id}` : ''}</span>
                        {c.platform && <span className="cand-platform">{c.platform}</span>}
                        {already && c.id === already && <span className="cand-check"><CheckIcon width={14} height={14} /></span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button className="btn btn-accent" onClick={onSubmit} disabled={chosenCount === 0 || busy}>
              {busy ? 'Submitting…' : `Submit my ${chosenCount} vote${chosenCount === 1 ? '' : 's'}`}
            </button>
            <span className="ocr-label">votes are final — you can't change them after submitting</span>
          </div>
        </div>
      )}
    </div>
  );
}

function TallyTable({ rows }) {
  const positions = [...new Set(rows.map((r) => r.position))];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
      {positions.map((position) => {
        const list = rows.filter((r) => r.position === position).sort((a, b) => b.votes - a.votes);
        const max = Math.max(...list.map((r) => r.votes), 1);
        const [winner] = list;
        return (
          <div key={position}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <b style={{ fontSize: 13.5 }}>{position}</b>
              {winner?.votes > 0 && <span className="chip chip--ok"><TrophyIcon width={11} height={11} /> {winner.full_name}</span>}
            </div>
            {list.map((r) => (
              <div className="tally-row" key={r.candidate_id}>
                <span className="tally-name">{r.full_name} <span className="ocr-label">· {r.section || '—'}</span></span>
                <div className="tally-track">
                  <div className="tally-bar" style={{ width: `${(r.votes / max) * 100}%` }} />
                </div>
                <b className="tally-votes">{r.votes}</b>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function ElectionFormModal({ initial, onClose, onSubmit, busy }) {
  const [title, setTitle] = useState(initial?.title || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [error, setError] = useState('');

  const submit = (e) => {
    e.preventDefault();
    if (!title.trim()) return setError('Title is required.');
    onSubmit(title, description);
  };

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <h3><PlusIcon width={17} height={17} style={{ verticalAlign: -3, marginRight: 6, color: 'var(--accent-2)' }} />
            {initial ? 'Edit election' : 'New election'}
          </h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><XIcon width={16} height={16} /></button>
        </div>
        <form className="modal-body auth-form" onSubmit={submit}>
          <div className="field">
            <label htmlFor="elec-title">Election title</label>
            <input id="elec-title" className="input" placeholder="CODEBYTERS Officers 2026" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} autoFocus />
          </div>
          <div className="field">
            <label htmlFor="elec-desc">Description</label>
            <textarea id="elec-desc" className="textarea" placeholder="Who should lead the org next term?" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
          </div>
          {error && <div className="err-box"><span>!</span><span>{error}</span></div>}
          <button className="btn btn-accent btn-lg" disabled={busy}>{busy ? 'Saving…' : initial ? 'Save changes' : 'Create election'}</button>
        </form>
      </div>
    </div>
  );
}

function AddCandidateModal({ election, members, search, setSearch, onAdd, onClose, busy }) {
  const [memberId, setMemberId] = useState('');
  const [position, setPosition] = useState('');
  const [platform, setPlatform] = useState('');
  const [error, setError] = useState('');

  const submit = (e) => {
    e.preventDefault();
    setError('');
    if (!memberId) return setError('Pick a member.');
    if (!position.trim()) return setError('Enter a position.');
    onAdd(election.id, memberId, position, platform);
  };

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal--wide">
        <div className="modal-head">
          <h3><UsersIcon width={17} height={17} style={{ verticalAlign: -3, marginRight: 6, color: 'var(--accent-2)' }} />
            Add candidate — {election.title}
          </h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><XIcon width={16} height={16} /></button>
        </div>
        <div className="modal-body">
          <form className="auth-form" onSubmit={submit} style={{ marginBottom: 14 }}>
            <div className="field">
              <label htmlFor="cand-pos">Position</label>
              <input id="cand-pos" className="input" list="positions-list" placeholder="President" value={position} onChange={(e) => setPosition(e.target.value)} maxLength={80} />
              <datalist id="positions-list">
                {POSITIONS.map((p) => <option key={p} value={p} />)}
              </datalist>
            </div>
            <div className="field">
              <label htmlFor="cand-platform">Platform (optional)</label>
              <textarea id="cand-platform" className="textarea" placeholder="Their campaign pitch, shown on the ballot." value={platform} onChange={(e) => setPlatform(e.target.value)} maxLength={500} />
            </div>
            {error && <div className="err-box"><span>!</span><span>{error}</span></div>}
            <button className="btn btn-accent btn-lg" disabled={busy}>{busy ? 'Adding…' : 'Add to ballot'}</button>
          </form>

          <div className="search-box" style={{ marginBottom: 10 }}>
            <SearchIcon width={15} height={15} />
            <input placeholder="Search member by name, ID, section…" value={search} onChange={(e) => { setSearch(e.target.value); setMemberId(''); }} />
          </div>
          <div className="member-pick">
            {members.length === 0 ? (
              <div className="empty-state" style={{ padding: 16 }}>
                <span className="ico"><UsersIcon width={22} height={22} /></span>
                <b>{search ? 'No matches' : 'All members are already on this ballot'}</b>
              </div>
            ) : (
              members.map((m) => (
                <button
                  type="button"
                  key={m.id}
                  className={`member-pick-row${memberId === m.id ? ' member-pick-row--on' : ''}`}
                  onClick={() => setMemberId(m.id)}
                  aria-pressed={memberId === m.id}
                >
                  <Avatar name={m.full_name} seed={m.student_id || m.id} size={34} url={m.avatar_url} />
                  <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                    <b>{m.full_name}</b>
                    <span className="ocr-label" style={{ display: 'block' }}>{m.year_level} · {m.section}{m.student_id ? ` · ${m.student_id}` : ''}</span>
                  </span>
                  {memberId === m.id && <CheckIcon width={16} height={16} style={{ color: 'var(--accent)' }} />}
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
