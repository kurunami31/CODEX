import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { CertificateIcon, DownloadIcon, CalendarIcon, CheckIcon, XIcon, GavelIcon, TrophyIcon } from '../components/icons/Icons';

export default function Certificates() {
  const { profile, user } = useAuth();
  const toast = useToast();
  const [attendance, setAttendance] = useState([]);
  const [wins, setWins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null); // { type: 'membership' } | { type: 'event', title, date } | { type: 'election', title, position, date }
  const printRef = useRef(null);

  useEffect(() => {
    (async () => {
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
      if (att.error) toast.error('Certificates error', att.error.message);
      else setAttendance(att.data || []);
      if (!win.error) setWins(win.data || []);
      setLoading(false);
    })();
  }, [user, toast]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const print = () => {
    // Give the browser a tick so the certificate is fully laid out.
    requestAnimationFrame(() => window.print());
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
              <span className="chip chip--ok"><TrophyIcon width={13} height={13} /> elected</span>
              <div className="event-body">
                <b>{w.position}</b>
                <div className="event-meta" style={{ marginTop: 4 }}>
                  <span><CalendarIcon width={14} height={14} />{w.elections?.title || 'Officer election'}{w.elections?.ends_at ? ` · ${new Date(w.elections.ends_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}</span>
                </div>
              </div>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => setOpen({ type: 'election', title: w.elections?.title || 'Officer election', position: w.position, date: w.elections?.ends_at })}
              >
                <CertificateIcon width={14} height={14} /> Certificate
              </button>
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
              <span className="chip chip--ok"><CheckIcon width={13} height={13} /> present</span>
              <div className="event-body">
                <b>{a.events?.title || 'Event'}</b>
                <div className="event-meta" style={{ marginTop: 4 }}>
                  <span><CalendarIcon width={14} height={14} />{a.events?.event_date ? new Date(a.events.event_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</span>
                </div>
              </div>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => setOpen({ type: 'event', title: a.events?.title || 'CODEBYTERS Event', date: a.events?.event_date })}
              >
                <CertificateIcon width={14} height={14} /> Certificate
              </button>
            </div>
          ))}
        </div>
      )}

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
                  <div className="cert-top">
                    <img src="/assets/dorsu-logo.png" alt="DOrSU" className="cert-logo" />
                    <div>
                      <div className="cert-org">CODEBYTERS</div>
                      <div className="cert-org-sub">BSIT Student Organization · Davao Oriental State University</div>
                    </div>
                    <img src="/assets/codebyterts-logo.gif" alt="CODEBYTERS" className="cert-logo cert-logo--gif" />
                  </div>
                  <div className="cert-title">
                    {open.type === 'membership' ? 'CERTIFICATE OF MEMBERSHIP' : open.type === 'election' ? 'CERTIFICATE OF ELECTION' : 'CERTIFICATE OF PARTICIPATION'}
                  </div>
                  <div className="cert-awarded">this certifies that</div>
                  <div className="cert-name">{profile.full_name}</div>
                  <div className="cert-body">
                    {open.type === 'membership' ? (
                      <>is a <b>confirmed member</b> of CODEBYTERS, the BSIT Student Organization of Davao Oriental State University, in good standing for the academic year {new Date().getFullYear() - 1}–{new Date().getFullYear()}.</>
                    ) : open.type === 'election' ? (
                      <>has been <b>elected {open.position}</b> of <b>{open.title}</b> by the members of CODEBYTERS{open.date ? <> on <b>{new Date(open.date).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</b></> : null}.</>
                    ) : (
                      <>has actively participated in <b>{open.title}</b>{open.date ? <> held on <b>{new Date(open.date).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</b></> : null}.</>
                    )}
                  </div>
                  <div className="cert-foot">
                    <div className="cert-line">
                      <div className="cert-line-cap">student no.</div>
                      <b>{profile.student_id || '—'}</b>
                    </div>
                    <div className="cert-line">
                      <div className="cert-line-cap">issued</div>
                      <b>{certDate}</b>
                    </div>
                    <div className="cert-line">
                      <div className="cert-line-cap">org officer</div>
                      <b className="cert-sign">CODEBYTERS</b>
                    </div>
                  </div>
                  <div className="cert-code">cert-{open.type === 'membership' ? 'member' : open.type === 'election' ? 'elected' : 'event'}-{String(profile.student_id || user?.id || '').toLowerCase().replace(/[^a-z0-9]/gi, '')}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
                <button className="btn btn-accent" onClick={print}>
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
