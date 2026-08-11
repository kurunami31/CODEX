import { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Avatar from '../components/Avatar';
import { CameraIcon, IdIcon, ShieldIcon, MailIcon, LockIcon, CheckIcon } from '../components/icons/Icons';

const YEAR_LEVELS = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
const MAX_AVATAR_BYTES = 3 * 1024 * 1024;

export default function ProfileSettings() {
  const { profile, user, refreshProfile } = useAuth();
  const toast = useToast();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState(() => ({
    fullName: profile?.full_name || '',
    yearLevel: profile?.year_level || YEAR_LEVELS[0],
    section: profile?.section || '',
  }));

  if (!profile) return null;

  const pickAvatar = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const okTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (!okTypes.includes(file.type)) {
      return toast.error('Unsupported format', 'Use PNG, JPG, WEBP or GIF. (HEIC and other phone formats aren\u2019t accepted yet.)');
    }
    if (file.size > MAX_AVATAR_BYTES) return toast.error('File too large', 'Keep it under 3 MB.');
    const url = URL.createObjectURL(file);
    setPreview(url);
    uploadAvatar(file, url);
  };

  const uploadAvatar = async (file, previewUrl) => {
    setUploading(true);
    setError('');
    try {
      const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')).toLowerCase() : '.png';
      const path = `${user.id}/avatar${ext}`;
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, cacheControl: '31536000' });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
      const { error: dbErr } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id);
      if (dbErr) throw dbErr;
      URL.revokeObjectURL(previewUrl);
      setPreview('');
      refreshProfile();
      toast.ok('Photo updated', 'Your new profile picture is live.');
    } catch (err) {
      URL.revokeObjectURL(previewUrl);
      setPreview('');
      setError(err.message);
      toast.error('Photo not saved', err.message);
    } finally {
      setUploading(false);
    }
  };

  const removeAvatar = async () => {
    if (!profile.avatar_url) return;
    setUploading(true);
    try {
      const old = profile.avatar_url.split('/').slice(-2).join('/');
      await supabase.storage.from('avatars').remove([old]);
      const { error: dbErr } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', user.id);
      if (dbErr) throw dbErr;
      refreshProfile();
      toast.ok('Photo removed', 'Back to the classic initials look.');
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

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
        <div className="avatar-edit">
          <Avatar
            name={profile.full_name}
            seed={user.id}
            size={72}
            ring
            url={preview || profile.avatar_url}
          />
          <div className="avatar-edit-actions">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              <CameraIcon width={14} height={14} /> {uploading ? 'Uploading…' : (profile.avatar_url ? 'Change photo' : 'Add photo')}
            </button>
            {profile.avatar_url && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={removeAvatar} disabled={uploading}>
                Remove
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              style={{ display: 'none' }}
              onChange={pickAvatar}
            />
            <span className="ocr-label" style={{ marginTop: 6, display: 'block' }}>
              png, jpg, webp or gif · max 3 mb
            </span>
          </div>
        </div>

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
