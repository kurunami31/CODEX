import { useEffect } from 'react';
import Avatar from './Avatar';
import { roleLabel } from '../lib/roles';
import { useAuth } from '../context/AuthContext';
import { IdIcon, CheckIcon, XIcon } from './icons/Icons';

/**
 * Full-size digital ID card for a member, shown in a modal. Shared by the
 * admin control panel and the staff member directory.
 */
export default function IdCardModal({ member, onClose }) {
  const { profile } = useAuth();
  const isSuper = profile?.role === 'superadmin';
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal--narrow" style={{ width: 'min(520px, 100%)' }}>
        <div className="modal-head">
          <h3>
            <IdIcon width={17} height={17} style={{ verticalAlign: -3, marginRight: 6, color: 'var(--accent-2)' }} />
            Digital ID — {member.full_name || 'Member'}
          </h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><XIcon width={16} height={16} /></button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <div className="idcard">
            <div className="idcard-head">
              <img src="/assets/dorsu-logo.png" alt="DOrSU" />
              <div className="idcard-org">
                <b>CODEBYTERS</b>
                <span>bsit student organization</span>
              </div>
            </div>
            <div className="idcard-strip">official student identity · bsit</div>
            <div className="idcard-main">
              <div className="idcard-photo">
                {member.avatar_url ? (
                  <img src={member.avatar_url} alt={`ID photo of ${member.full_name}`} />
                ) : (
                  <Avatar name={member.full_name} seed={member.student_id || member.id} size={56} />
                )}
              </div>
              <div className="idcard-info">
                <div className="lbl">name</div>
                <div className="idcard-name">{member.full_name || 'Member'}</div>
                <div className="lbl" style={{ marginTop: 8 }}>details</div>
                <div className="idcard-details">
                  YEAR : {member.year_level || '—'}<br />
                  SEC  : {member.section || '—'}<br />
                  ID   : {member.student_id || '—'}
                </div>
              </div>
              <div className="idcard-qr">
                <div style={{ width: 88, height: 88, display: 'grid', placeItems: 'center', background: '#fff', border: '2px solid var(--deep)', borderRadius: 6 }}>
                  <CheckIcon width={40} height={40} style={{ color: 'var(--ok)' }} />
                </div>
                <span>verified member</span>
              </div>
            </div>
            <div className="idcard-foot">
              <span>davao oriental state university</span>
              <span className="code">dorsu</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
            <CheckIcon width={14} height={14} style={{ color: 'var(--ok)' }} />
            <span className="ocr-label" style={{ fontSize: 9 }}>
              registered {roleLabel(member.role, member.position)}
              {isSuper ? ` · ${member.membership_paid ? 'dues paid' : 'dues unpaid'}` : ''}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
