import { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Avatar from '../components/Avatar';
import CropModal from '../components/CropModal';
import { roleLabel } from '../lib/roles';
import { useFontScale, TEXT_SCALES } from '../context/FontScaleContext';
import { enablePush, disablePush, hasLocalSubscription, isSupported } from '../lib/push';
import { CameraIcon, IdIcon, ShieldIcon, MailIcon, LockIcon, CheckIcon, WalletIcon, ImageIcon, BellIcon, XIcon } from '../components/icons/Icons';

const YEAR_LEVELS = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
const MAX_AVATAR_BYTES = 3 * 1024 * 1024;

export default function ProfileSettings() {
  const { profile, user, refreshProfile } = useAuth();
  const { scaleId, setScale } = useFontScale();
  const toast = useToast();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState('');
  const [cropFile, setCropFile] = useState(null);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const receiptRef = useRef(null);
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(() => ({
    fullName: profile?.full_name || '',
    yearLevel: profile?.year_level || YEAR_LEVELS[0],
    section: profile?.section || '',
  }));
useEffect(() => {
    let alive = true;
    (async () => {
      const supported = isSupported();
      if (alive) setPushSupported(supported);
      if (supported) {
        const on = await hasLocalSubscription();
        if (alive) setPushOn(on);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Own student ID — the profiles column is revoked from students, so it
  // comes back through the get_my_profile() RPC instead of the context.
  const [myStudentId, setMyStudentId] = useState(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc('get_my_profile');
      if (data?.student_id) setMyStudentId(data.student_id);
    })();
  }, []);

  if (!profile) return null;

  const uploadReceipt = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || receiptBusy) return;
    const okTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (!okTypes.includes(file.type)) return toast.error('Unsupported format', 'Use PNG, JPG, WEBP or GIF.');
    if (file.size > 5 * 1024 * 1024) return toast.error('File too large', 'Keep it under 5 MB.');
    setReceiptBusy(true);
    try {
      const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')).toLowerCase() : '.png';
      const path = `receipts/${user.id}/receipt${ext}`;
      const { error: upErr } = await supabase.storage.from('post-images').upload(path, file, { upsert: true, cacheControl: '31536000' });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from('post-images').getPublicUrl(path);
      const { error: dbErr } = await supabase.from('profiles').update({ receipt_url: `${publicUrl}?v=${Date.now()}` }).eq('id', user.id);
      if (dbErr) throw dbErr;
      refreshProfile();
      toast.ok('Receipt uploaded', 'An officer will verify your payment.');
    } catch (err) {
      toast.error('Upload failed', err.message);
    } finally {
      setReceiptBusy(false);
    }
  };

  const removeReceipt = async () => {
    if (receiptBusy) return;
    setReceiptBusy(true);
    try {
      const filePath = new URL(profile.receipt_url).pathname.replace(/^\/storage\/v1\/object\/public\/post-images\//, '');
      await supabase.storage.from('post-images').remove([filePath]);
      const { error } = await supabase.from('profiles').update({ receipt_url: null }).eq('id', user.id);
      if (error) throw error;
      refreshProfile();
    } catch (err) {
      toast.error('Could not remove', err.message);
    } finally {
      setReceiptBusy(false);
    }
  };

  const togglePush = async () => {
    if (pushBusy) return;
    setPushBusy(true);
    if (pushOn) {
      await disablePush();
      setPushOn(false);
      toast.info('Notifications off', 'You won\'t get push alerts on this device.');
    } else {
      const res = await enablePush(user.id);
      if (res.ok) {
        setPushOn(true);
        toast.ok('Notifications on', 'We\'ll ping you about events and replies.');
      } else if (res.reason === 'denied') {
        toast.error('Permission denied', 'Allow notifications in your browser settings to enable this.');
      } else if (res.reason === 'not-configured') {
        toast.info('Coming soon', 'Push isn\'t configured on the server yet — no action needed.');
      } else if (res.reason !== 'unsupported') {
        toast.error('Could not subscribe', res.reason);
      }
    }
    setPushBusy(false);
  };

  const pickAvatar = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const okTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (!okTypes.includes(file.type)) {
      return toast.error('Unsupported format', 'Use PNG, JPG, WEBP or GIF. (HEIC and other phone formats aren\u2019t accepted yet.)');
    }
    if (file.size > MAX_AVATAR_BYTES) return toast.error('File too large', 'Keep it under 3 MB.');
    setCropFile(file); // open the crop tool first
  };

  const handleCropped = (file) => {
    const url = URL.createObjectURL(file);
    setPreview(url);
    setCropFile(null);
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
      const freshUrl = `${publicUrl}?v=${Date.now()}`;
      const { error: dbErr } = await supabase.from('profiles').update({ avatar_url: freshUrl }).eq('id', user.id);
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
      const filePath = new URL(profile.avatar_url).pathname.replace(/^\/storage\/v1\/object\/public\/avatars\//, '');
      await supabase.storage.from('avatars').remove([filePath]);
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
            size={110}
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
        <IdIcon width={14} height={14} /> digital id preview
      </div>
      <div className="panel" style={{ padding: 18 }}>
        <p className="ocr-label" style={{ margin: '0 0 14px' }}>
          this is how your photo appears on your official ID — updates live as you change it
        </p>
        <div className="idcard-mini-wrap">
          <div className="idcard idcard--mini">
            <div className="idcard-head">
              <img src="/assets/dorsu-logo.png" alt="DOrSU" />
              <div className="idcard-org">
                <b>CODEBYTERS</b>
                <span>bsit · dorsu</span>
              </div>
            </div>
            <div className="idcard-strip">official student identity · bsit</div>
            <div className="idcard-main">
              <div className="idcard-photo">
                {preview || profile.avatar_url ? (
                  <img src={preview || profile.avatar_url} alt={`ID photo of ${profile.full_name}`} />
                ) : (
                  <Avatar name={profile.full_name} seed={user.id} size={44} />
                )}
              </div>
              <div className="idcard-info">
                <div className="lbl">name</div>
                <div className="idcard-name">{profile.full_name}</div>
                <div className="lbl">details</div>
                <div className="idcard-details">
                  YEAR : {profile.year_level}<br />
                  SEC  : {profile.section}<br />
                  ID   : {myStudentId || '—'}
                </div>
              </div>
            </div>
            <div className="idcard-foot">
              <span>davao oriental state university</span>
              <span className="code">preview</span>
            </div>
          </div>
        </div>
      </div>

      <div className="section-title">
        <WalletIcon width={14} height={14} /> membership dues
      </div>
      <div className="panel" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="settings-row">
          <span className="settings-key"><CheckIcon width={15} height={15} /> Status</span>
          <span className="settings-val">
            {profile.membership_paid ? (
              <span className="chip chip--ok"><CheckIcon width={11} height={11} /> dues paid{profile.membership_paid_at ? ` · ${new Date(profile.membership_paid_at).toLocaleDateString()}` : ''}</span>
            ) : (
              <span className="chip chip--warn"><WalletIcon width={11} height={11} /> dues unpaid</span>
            )}
          </span>
        </div>

        {!profile.membership_paid && (
          <div className="receipt-box">
            {profile.receipt_url ? (
              <div className="receipt-row">
                <a href={profile.receipt_url} target="_blank" rel="noreferrer" className="receipt-thumb">
                  <img src={profile.receipt_url} alt="Payment receipt" />
                </a>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ fontSize: 14 }}>Receipt uploaded</b>
                  <span className="ocr-label" style={{ display: 'block' }}>waiting for an officer to confirm</span>
                </div>
                <button className="icon-btn" onClick={removeReceipt} disabled={receiptBusy} title="Remove receipt" aria-label="Remove receipt">
                  <XIcon width={15} height={15} />
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button className="btn btn-outline btn-sm" onClick={() => receiptRef.current?.click()} disabled={receiptBusy}>
                  <ImageIcon width={14} height={14} /> {receiptBusy ? 'Uploading…' : 'Upload payment proof'}
                </button>
                <input ref={receiptRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" style={{ display: 'none' }} onChange={uploadReceipt} />
                <span className="ocr-label">gcash / bank transfer screenshot · png, jpg, webp, gif · max 5 mb</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="section-title">
        <BellIcon width={14} height={14} /> notifications
      </div>
      <div className="panel" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="settings-row">
          <span className="settings-key"><BellIcon width={15} height={15} /> Push alerts</span>
          <button
            type="button"
            className={`switch${pushOn ? ' switch--on' : ''}`}
            onClick={togglePush}
            disabled={pushBusy || !pushSupported}
            aria-pressed={pushOn}
            aria-label="Toggle push notifications"
          >
            <span className="switch-knob" />
          </button>
        </div>
        <p className="ocr-label" style={{ margin: 0 }}>
          {pushOn
            ? <><CheckIcon width={12} height={12} style={{ verticalAlign: -2 }} /> this device is subscribed — event alerts and comment replies will ping you.</>
            : pushSupported
              ? 'Turn on to get notified about new events and replies on your posts.'
              : 'Push alerts aren\'t available in this browser.'}
        </p>
      </div>

      <div className="section-title">
        <MailIcon width={14} height={14} /> appearance
      </div>
      <div className="panel" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="text-size-row">
          <div className="text-size-info">
            <b>Text size</b>
            <span className="ocr-label">scales the whole app to your preference</span>
          </div>
          <div className="text-size-opts" role="radiogroup" aria-label="Text size">
            {TEXT_SCALES.map((s) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={scaleId === s.id}
                className={`text-size-opt${scaleId === s.id ? ' text-size-opt--on' : ''}`}
                onClick={() => setScale(s.id)}
                title={s.name}
              >
                <span style={{ fontSize: s.id === 'small' ? 14 : s.id === 'large' ? 22 : 18 }}>{s.label}</span>
              </button>
            ))}
          </div>
        </div>
        <p className="ocr-label" style={{ margin: 0 }}>
          <CheckIcon width={12} height={12} style={{ verticalAlign: -2 }} /> your choice is saved on this device.
        </p>
      </div>

      <div className="section-title">
        <LockIcon width={14} height={14} /> locked fields
      </div>
      <div className="panel" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="settings-row">
          <span className="settings-key"><IdIcon width={15} height={15} /> Student ID</span>
          <span className="settings-val">{myStudentId || '—'}</span>
          <span className="chip">locked</span>
        </div>
        <div className="settings-row">
          <span className="settings-key"><MailIcon width={15} height={15} /> Email</span>
          <span className="settings-val">{user.email}</span>
          <span className="chip">locked</span>
        </div>
        <div className="settings-row">
          <span className="settings-key"><ShieldIcon width={15} height={15} /> Role</span>
          <span className="settings-val">{roleLabel(profile.role)}</span>
          <span className="chip">locked</span>
        </div>
        <p className="ocr-label" style={{ margin: 0 }}>
          <CheckIcon width={12} height={12} style={{ verticalAlign: -2 }} /> locked fields are assigned by the org —
          contact an officer if something is wrong.
        </p>
      </div>

      {cropFile && (
        <CropModal
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onConfirm={handleCropped}
        />
      )}
    </div>
  );
}
