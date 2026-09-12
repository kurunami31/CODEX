import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { CertificateIcon, DownloadIcon, CalendarIcon, CheckIcon, XIcon, GavelIcon, TrophyIcon, TrashIcon, PencilIcon } from '../components/icons/Icons';

export default function Certificates() {
  const { profile, user } = useAuth();
  const toast = useToast();
  const [attendance, setAttendance] = useState([]);
  const [wins, setWins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);
  const [myStudentId, setMyStudentId] = useState(null);
  const printRef = useRef(null);
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null); // { type: 'event'|'election', id, title }

  const loadCertificates = async () => {
    const [att, win] = await Promise.all([
      supabase.from('attendance').select('event_id, scanned_at, events(title, event_date)').order('scanned_at', { ascending: false }),
      user
        ? supabase
            .from('election_candidates')
            .select('id, position, created_at, elections!election_candidates_election_id_fkey(id, title, ends_at)')
            .eq('user_id', user.id)
            .eq('winner', true)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [] }),
    ]);
    if (!att.error) setAttendance(att.data || []);
    if (!win.error) setWins(win.data || []);
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc('get_my_profile');
      if (data?.student_id) setMyStudentId(data.student_id);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      await loadCertificates();
      setLoading(false);
    })();
  }, [user, toast]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const toggleSelect = (key) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const allKeys = [
      ...attendance.map((a) => `att-${a.event_id}`),
      ...wins.map((w) => `win-${w.id}`),
    ];
    setSelected((prev) => {
      if (prev.size === allKeys.length) return new Set();
      return new Set(allKeys);
    });
  };

  const allItems = [
    ...attendance.map((a) => ({ key: `att-${a.event_id}`, type: 'att', id: a.event_id, title: a.events?.title || 'Event' })),
    ...wins.map((w) => ({ key: `win-${w.id}`, type: 'win', id: w.id, title: w.position })),
  ];
  const allSelected = allItems.length > 0 && selected.size === allItems.length;

  const deleteOne = async (key) => {
    const item = allItems.find((i) => i.key === key);
    if (!item) return;
    if (!window.confirm(`Delete "${item.title}" certificate?`)) return;
    setBusy(true);
    if (item.type === 'att') {
      const { error } = await supabase.from('attendance').delete().eq('event_id', item.id);
      if (error) { toast.error('Delete failed', error.message); setBusy(false); return; }
    } else {
      const { error } = await supabase.from('election_candidates').delete().eq('id', item.id);
      if (error) { toast.error('Delete failed', error.message); setBusy(false); return; }
    }
    toast.ok('Certificate deleted', `"${item.title}" was removed.`);
    setSelected((prev) => { const n = new Set(prev); n.delete(key); return n; });
    await loadCertificates();
    setBusy(false);
  };

  const batchDelete = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (!window.confirm(`Delete ${ids.length} selected certificate${ids.length > 1 ? 's' : ''}?`)) return;
    setBusy(true);
    let ok = 0, fail = 0;
    for (const key of ids) {
      const item = allItems.find((i) => i.key === key);
      if (!item) continue;
      if (item.type === 'att') {
        const { error } = await supabase.from('attendance').delete().eq('event_id', item.id);
        error ? fail++ : ok++;
      } else {
        const { error } = await supabase.from('election_candidates').delete().eq('id', item.id);
        error ? fail++ : ok++;
      }
    }
    setBusy(false);
    setSelected(new Set());
    if (fail > 0) toast.error('Batch delete', `${ok} deleted, ${fail} failed.`);
    else toast.ok('Batch delete', `${ok} certificate${ok > 1 ? 's' : ''} removed.`);
    await loadCertificates();
  };

  const saveEdit = async () => {
    if (!editing) return;
    setBusy(true);
    if (editing.type === 'event') {
      const { error } = await supabase.from('events').update({ title: editing.title }).eq('id', editing.id);
      if (error) { toast.error('Edit failed', error.message); setBusy(false); return; }
    } else {
      const { error } = await supabase.from('elections').update({ title: editing.title }).eq('id', editing.id);
      if (error) { toast.error('Edit failed', error.message); setBusy(false); return; }
    }
    toast.ok('Updated', 'Certificate title updated.');
    setEditing(null);
    setBusy(false);
    await loadCertificates();
  };

  const printCert = () => {
    const el = printRef.current;
    if (!el) return;
    const frameHtml = el.querySelector('.cert-frame').outerHTML;
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:none;z-index:99999;';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument;
    doc.open();
    doc.write(`<!DOCTYPE html><html><head><style>
      @page{size:297mm 210mm;margin:0}
      *{margin:0;padding:0;box-sizing:border-box}
      html,body{width:297mm;height:210mm;overflow:hidden;background:#fff;font-family:Georgia,'Times New Roman',serif}
      .cert-frame{width:100%;height:100%;display:flex;flex-direction:column;background:#fdfbf5}
      .cert-border-outer{flex:1;border:3px solid #1a5c3a;border-radius:4px;padding:6px;display:flex;flex-direction:column}
      .cert-border-inner{flex:1;border:1px solid #c9a84c;border-radius:2px;position:relative;display:flex;flex-direction:column;overflow:hidden}
      .cert-corner{position:absolute;width:28px;height:28px;z-index:2}
      .cert-corner::before,.cert-corner::after{content:'';position:absolute;background:#c9a84c}
      .cert-corner::before{width:100%;height:2px}.cert-corner::after{width:2px;height:100%}
      .cert-corner--tl{top:6px;left:6px}.cert-corner--tl::before{top:0;left:0}.cert-corner--tl::after{top:0;left:0}
      .cert-corner--tr{top:6px;right:6px}.cert-corner--tr::before{top:0;right:0}.cert-corner--tr::after{top:0;right:0}
      .cert-corner--bl{bottom:6px;left:6px}.cert-corner--bl::before{bottom:0;left:0}.cert-corner--bl::after{bottom:0;left:0}
      .cert-corner--br{bottom:6px;right:6px}.cert-corner--br::before{bottom:0;right:0}.cert-corner--br::after{bottom:0;right:0}
      .cert-watermark{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:260px;opacity:0.08;pointer-events:none;z-index:0;user-select:none}
      .cert-content{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:20px 32px 14px;text-align:center;color:#1a2f38;gap:0}
      .cert-header{display:flex;align-items:center;justify-content:center;gap:20px;margin-bottom:4px}
      .cert-logo{width:64px;height:64px;object-fit:contain;flex-shrink:0}
      .cert-logo--right{border-radius:8px}
      .cert-header-text{text-align:center}
      .cert-header-uni{font-weight:700;font-size:18px;letter-spacing:0.06em;color:#1a5c3a}
      .cert-header-addr{font-size:11px;letter-spacing:0.1em;color:#6b7c84;margin-top:1px}
      .cert-header-prog{font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#6b7c84;margin-top:1px}
      .cert-divider{display:flex;align-items:center;gap:8px;width:60%;margin:6px 0}
      .cert-divider-line{flex:1;height:1px;background:linear-gradient(90deg,transparent,#c9a84c,transparent)}
      .cert-divider-diamond{width:6px;height:6px;background:#c9a84c;transform:rotate(45deg);flex-shrink:0}
      .cert-title{font-size:28px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#1a5c3a;margin:2px 0 6px}
      .cert-awarded{font-style:italic;font-size:14px;color:#6b7c84;letter-spacing:0.12em;text-transform:lowercase;margin-bottom:2px}
      .cert-name{font-size:36px;font-weight:700;color:#0b2b3a;letter-spacing:0.03em;margin:0;padding:0 20px;line-height:1.2}
      .cert-name-underline{width:360px;max-width:80%;height:1px;background:#1a2f38;margin:2px auto 8px}
      .cert-body{max-width:600px;font-size:14px;line-height:1.65;color:#3a4f58;margin:0 auto 10px}
      .cert-issued-line{font-style:italic;font-size:13px;color:#3a4f58;margin:4px 0 6px}
      .cert-footer{width:100%;display:flex;flex-direction:column;align-items:center;gap:0}
      .cert-footer-org{display:flex;flex-direction:column;align-items:center;gap:0;margin-bottom:6px}
      .cert-footer-org-name{font-weight:700;font-size:16px;letter-spacing:0.12em;color:#1a5c3a}
      .cert-footer-org-sub{font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:#7c8c94}
      .cert-footer-bottom{width:100%;display:flex;justify-content:center;align-items:center;gap:24px;padding-top:6px;border-top:1px solid #d6ddd8;font-size:11px;color:#7c8c94;letter-spacing:0.08em}
    </style></head><body>${frameHtml}</body></html>`);
    doc.close();
    iframe.contentWindow.onload = () => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => iframe.remove(), 1000);
    };
  };

  if (!profile) return null;

  const membershipOk = profile.membership_paid;
  const certDate = new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <CertificateIcon width={20} height={20} style={{ color: 'var(--accent-2)' }} /> Certificates
        </h2>
        <span className="ocr-label">proof of membership &amp; event participation</span>
      </div>

      {(attendance.length > 0 || wins.length > 0) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleSelectAll}
            style={{ accentColor: 'var(--accent)', width: 16, height: 16, cursor: 'pointer' }}
            aria-label="Select all certificates"
          />
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{selected.size > 0 ? `${selected.size} selected` : `${allItems.length} certificates`}</span>
          {selected.size > 0 && (
            <button className="btn btn-sm" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={batchDelete} disabled={busy}>
              <TrashIcon width={13} height={13} /> Delete {selected.size}
            </button>
          )}
        </div>
      )}

      <div className="section-title">official documents</div>

      <div className="panel" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="cert-card" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span className={`chip ${membershipOk ? 'chip--ok' : 'chip--warn'}`} style={{ marginLeft: 0 }}>
            {membershipOk ? <CheckIcon width={12} height={12} /> : null} {membershipOk ? 'dues paid' : 'dues unpaid'}
          </span>
          <div style={{ flex: 1, minWidth: 200 }}>
            <b style={{ fontSize: 15 }}>Membership certificate</b>
            <div className="ocr-label" style={{ display: 'block', marginTop: 2 }}>
              {membershipOk
                ? 'Certifies your active CODEBYTERS membership for the academic year.'
                : 'Available once an officer confirms your dues payment.'}
            </div>
          </div>
          <button
            className="btn btn-primary btn-sm"
            disabled={!membershipOk}
            onClick={() => setOpen({ type: 'membership' })}
          >
            <DownloadIcon width={14} height={14} /> {membershipOk ? 'View & print' : 'Locked'}
          </button>
        </div>
      </div>

      <div className="section-title">election certificates</div>

      {loading ? (
        <div className="panel" style={{ padding: 20 }}><div className="skeleton" style={{ height: 80 }} /></div>
      ) : wins.length === 0 ? (
        <div className="empty-state panel">
          <span className="ico"><GavelIcon width={26} height={26} /></span>
          <b>No election certificates yet</b>
          <p>Win an officer election and your Certificate of Election lands here.</p>
        </div>
      ) : (
        <div className="event-list">
          {wins.map((w) => (
            <div className="event-card panel" key={w.id} style={{ alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={selected.has(`win-${w.id}`)}
                onChange={() => toggleSelect(`win-${w.id}`)}
                style={{ accentColor: 'var(--accent)', width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }}
                aria-label={`Select ${w.position} certificate`}
              />
              <span className="chip chip--ok"><TrophyIcon width={13} height={13} /> elected</span>
              <div className="event-body">
                <b>{w.position}</b>
                <div className="event-meta" style={{ marginTop: 4 }}>
                  <span><CalendarIcon width={14} height={14} />{w.elections?.title || 'Officer election'}{w.elections?.ends_at ? ` · ${new Date(w.elections.ends_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button
                  className="icon-btn"
                  title="Edit title"
                  aria-label={`Edit ${w.position} certificate`}
                  onClick={() => setEditing({ type: 'election', id: w.elections?.id, title: w.elections?.title || '' })}
                >
                  <PencilIcon width={14} height={14} />
                </button>
                <button
                  className="icon-btn"
                  style={{ color: 'var(--danger)' }}
                  title="Delete certificate"
                  aria-label={`Delete ${w.position} certificate`}
                  onClick={() => deleteOne(`win-${w.id}`)}
                  disabled={busy}
                >
                  <TrashIcon width={14} height={14} />
                </button>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => setOpen({ type: 'election', title: w.elections?.title || 'Officer election', position: w.position, date: w.elections?.ends_at })}
                >
                  <CertificateIcon width={14} height={14} /> Certificate
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="section-title">event participation</div>

      {loading ? (
        <div className="panel" style={{ padding: 20 }}><div className="skeleton" style={{ height: 120 }} /></div>
      ) : attendance.length === 0 ? (
        <div className="empty-state panel">
          <span className="ico"><CertificateIcon width={26} height={26} /></span>
          <b>No event certificates yet</b>
          <p>Every event you attend earns you a certificate of participation.</p>
        </div>
      ) : (
        <div className="event-list">
          {attendance.map((a) => (
            <div className="event-card panel" key={a.event_id} style={{ alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={selected.has(`att-${a.event_id}`)}
                onChange={() => toggleSelect(`att-${a.event_id}`)}
                style={{ accentColor: 'var(--accent)', width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }}
                aria-label={`Select ${a.events?.title} certificate`}
              />
              <span className="chip chip--ok"><CheckIcon width={13} height={13} /> present</span>
              <div className="event-body">
                <b>{a.events?.title || 'Event'}</b>
                <div className="event-meta" style={{ marginTop: 4 }}>
                  <span><CalendarIcon width={14} height={14} />{a.events?.event_date ? new Date(a.events.event_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button
                  className="icon-btn"
                  title="Edit title"
                  aria-label={`Edit ${a.events?.title} certificate`}
                  onClick={() => setEditing({ type: 'event', id: a.event_id, title: a.events?.title || '' })}
                >
                  <PencilIcon width={14} height={14} />
                </button>
                <button
                  className="icon-btn"
                  style={{ color: 'var(--danger)' }}
                  title="Delete certificate"
                  aria-label={`Delete ${a.events?.title} certificate`}
                  onClick={() => deleteOne(`att-${a.event_id}`)}
                  disabled={busy}
                >
                  <TrashIcon width={14} height={14} />
                </button>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => setOpen({ type: 'event', title: a.events?.title || 'CODEBYTERS Event', date: a.events?.event_date, venue: a.events?.location })}
                >
                  <CertificateIcon width={14} height={14} /> Certificate
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── EDIT TITLE MODAL ─────────────────────────────────── */}
      {editing && (
        <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && setEditing(null)}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-head">
              <h3><PencilIcon width={17} height={17} style={{ verticalAlign: -3, marginRight: 6, color: 'var(--accent)' }} />Edit certificate title</h3>
              <button className="icon-btn" onClick={() => setEditing(null)} aria-label="Close"><XIcon width={16} height={16} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="field">
                <label>Title</label>
                <input
                  className="input"
                  value={editing.title}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  maxLength={120}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-outline btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                <button className="btn btn-accent btn-sm" onClick={saveEdit} disabled={busy || !editing.title.trim()}>
                  {busy ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── VIEW CERTIFICATE MODAL ───────────────────────────── */}
      {open && (
        <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && setOpen(null)}>
          <div className="modal modal--wide">
            <div className="modal-head">
              <h3><CertificateIcon width={17} height={17} style={{ verticalAlign: -3, marginRight: 6, color: 'var(--accent-2)' }} />
                {open.type === 'membership' ? 'Membership certificate' : open.type === 'election' ? 'Election certificate' : 'Event certificate'}
              </h3>
              <button className="icon-btn" onClick={() => setOpen(null)} aria-label="Close"><XIcon width={16} height={16} /></button>
            </div>
            <div className="modal-body">
              <div className="cert-print" ref={printRef}>
                <div className="cert-frame">
                  <div className="cert-border-outer">
                    <div className="cert-border-inner">
                      {/* corner ornaments */}
                      <div className="cert-corner cert-corner--tl" />
                      <div className="cert-corner cert-corner--tr" />
                      <div className="cert-corner cert-corner--bl" />
                      <div className="cert-corner cert-corner--br" />

                      {/* ghost watermark */}
                      <img src="/assets/cb-logo.png" alt="" className="cert-watermark" />

                      <div className="cert-content">
                        {/* header: logos + university name */}
                        <div className="cert-header">
                          <img src="/assets/dorsu-logo.png" alt="DOrSU" className="cert-logo" />
                          <div className="cert-header-text">
                            <div className="cert-header-uni">Davao Oriental State University</div>
                            <div className="cert-header-addr">Guang-Guang, Dahican, Mati City</div>
                            <div className="cert-header-prog">Information Technology Program</div>
                          </div>
                          <img src="/assets/it-logo.png" alt="CODEBYTERS" className="cert-logo cert-logo--right" />
                        </div>

                        {/* ornamental divider */}
                        <div className="cert-divider">
                          <span className="cert-divider-line" />
                          <span className="cert-divider-diamond" />
                          <span className="cert-divider-line" />
                        </div>

                        {/* certificate title */}
                        <div className="cert-title">
                          {open.type === 'membership' ? 'Certificate of Membership' : open.type === 'election' ? 'Certificate of Election' : 'Certificate of Participation'}
                        </div>

                        {/* "this is to certify that" */}
                        <div className="cert-awarded">This is to certify that</div>

                        {/* recipient name with underline */}
                        <div className="cert-name">{profile.full_name}</div>
                        <div className="cert-name-underline" />

                        {/* body text */}
                        <div className="cert-body">
                          {open.type === 'membership' ? (
                            <>is a <b>confirmed member</b> of CODEBYTERS, the BSIT Student Organization of Davao Oriental State University, in good standing for the academic year {new Date().getFullYear() - 1}–{new Date().getFullYear()}.</>
                          ) : open.type === 'election' ? (
                            <>has been <b>elected {open.position}</b> of <b>{open.title}</b> by the members of CODEBYTERS{open.date ? <> on <b>{new Date(open.date).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</b></> : null}.</>
                          ) : (
                            <>
                              was present and attended <b>{open.title}</b> organized and conducted by CODEBYTERS{open.date ? <> on <b>{new Date(open.date).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</b></> : null}{open.venue ? <> at <b>{open.venue}</b></> : null}.
                              <br /><br />
                              The above-named individual has duly attended and participated in the aforementioned event. This certification is issued as formal recognition and confirmation of their attendance and participation in the said activity.
                              <br /><br />
                              This certificate is issued upon the request of the concerned individual for documentation, verification, and whatever legitimate purpose it may serve.
                            </>
                          )}
                        </div>

                        {/* issued this [day] of [month, year] */}
                        {open.type === 'event' && (
                          <div className="cert-issued-line">
                            Issued this <b>{open.date ? new Date(open.date).toLocaleDateString(undefined, { day: 'numeric' }) : '___'}</b> day of <b>{open.date ? new Date(open.date).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : '__________'}</b>.
                          </div>
                        )}

                        {/* footer: org name + line + student no + date */}
                        <div className="cert-footer">
                          <div className="cert-footer-org">
                            <div className="cert-footer-org-name">CODEBYTERS</div>
                            <div className="cert-footer-org-sub">BSIT Organization</div>
                          </div>
                          <div className="cert-footer-bottom">
                            <span>Student No. <b>{myStudentId || '—'}</b></span>
                            <span>{certDate}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
                <button className="btn btn-accent" onClick={printCert}>
                  <DownloadIcon width={15} height={15} /> Print / Save as PDF
                </button>
                <span className="ocr-label">tip: choose “Save as PDF” as the printer destination</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
