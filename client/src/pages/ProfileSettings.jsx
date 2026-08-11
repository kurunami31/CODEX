import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { IdIcon, ShieldIcon, MailIcon, LockIcon, CheckIcon } from '../components/icons/Icons';

const YEAR_LEVELS = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
const COURSES = ['BSIT', 'BSEM', 'BSAB', 'other'];

export default function ProfileSettings() {
  const { profile, user, refreshProfile } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(() => ({
    fullName: profile?.full_name || '',
    yearLevel: profile?.year_level || YEAR_LEVELS[0],
    section: profile?.section || '',
    course: profile?.course || 'BSIT',
  }));

  if (!profile) return null;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.fullName.trim()) return setError('Name is required.');
    if (!form.section.trim()) return setError('Section is required.');
    setBusy(true);
    const { error: err } = await supabase
      .from('profiles')
      .update({
        full_name: form.fullName.trim().slice(0, 120),
        year_level: form.yearLevel,
        section: form.section.trim().slice(0, 20),
        course: form.course,
      })
      .eq('id', user.id);
    setBusy(false);
    if (err) return setError(err.message);
    toast.ok('Profile updated', 'Your details are saved.');
    refreshProfile();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 640 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 20 }}>Profile settings</h2>
        <span className="ocr-label">keep your community details up to date</span>
      </div>

      <div className="panel" style={{ padding: 22 }}>
        <form className="auth-form" onSubmit={submit}>
          <div className="field">
            <label htmlFor="ps-name">Full name</label>
            <input
              id="ps-name"
              className="input"
              placeholder="Juan Dela Cruz"
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              maxLength={120}
            />
          </div>

          <div className="auth-grid2">
            <div className="field">
              <label htmlFor="ps-year">Year level</label>
              <select
                id="ps-year"
                className="select"
                value={form.yearLevel}
                onChange={(e) => setForm({ ...form, yearLevel: e.target.value })}
              >
                {YEAR_LEVELS.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="ps-section">Section</label>
              <input
                id="ps-section"
                className="input"
                placeholder="BSIT-2A"
                value={form.section}
                onChange={(e) => setForm({ ...form, section: e.target.value })}
                maxLength={20}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="ps-course">Course</label>
            <select
              id="ps-course"
              className="select"
              value={form.course}
              onChange={(e) => setForm({ ...form, course: e.target.value })}
            >
              {COURSES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {error && <div className="err-box"><span>!</span><span>{error}</span></div>}
          <button className="btn btn-accent btn-lg" disabled={busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      </div>

      <div className="section-title">
        <LockIcon width={14} height={14} /> locked fields
      </div>
      <div className="panel" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="settings-row">
          <span className="settings-key"><IdIcon width={15} height={15} /> Student ID</span>
          <span className="settings-val">{profile.student_id}</span>
          <span className="chip">locked</span>
        </div>
        <div className="settings-row">
          <span className="settings-key"><MailIcon width={15} height={15} /> Email</span>
          <span className="settings-val">{user.email}</span>
          <span className="chip">locked</span>
        </div>
        <div className="settings-row">
          <span className="settings-key"><ShieldIcon width={15} height={15} /> Role</span>
          <span className="settings-val">{profile.role}</span>
          <span className="chip">locked</span>
        </div>
        <p className="ocr-label" style={{ margin: 0 }}>
          <CheckIcon width={12} height={12} style={{ verticalAlign: -2 }} /> locked fields are assigned by the org —
          contact an officer if something is wrong.
        </p>
      </div>
    </div>
  );
}
