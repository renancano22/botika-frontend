import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { api, errorMessage } from '../../api';
import { useAuth } from '../../auth';
import { useApi } from '../../hooks';
import { Avatar, Loading, Message, Modal, PasswordInput } from '../../components/ui';
import { Svg } from '../../components/RequestCards';
import type { User } from '../../types';
import { FIELD, passwordHasPersonalInfo } from '../../validation';
import { jumpTo, jumpToTop } from '../../scroll';
import BackButton from '../../components/BackButton';
import { LoadError, toast } from '../../components/feedback';
import AccessDenied from '../../components/AccessDenied';

interface ProfileData {
  user: User;
  barangay: string | null;
  address_line: string;
  /** only in the answer to "Save Changes" */
  password_changed?: boolean;
}

type Msg = { type: 'error' | 'success' | 'info'; text: string } | null;
/** Profile picture in the Edit Profile form: unchanged, a new picture (not saved yet) or removed (not saved yet). */
type PhotoChange = { kind: 'keep' } | { kind: 'new'; data: string } | { kind: 'remove' };

const EMPTY_PW = { current_password: '', password: '', password_confirmation: '' };

const ICON = {
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2zM6.5 6.5h1v1h-1zM16.5 6.5h1v1h-1zM6.5 16.5h1v1h-1z',
  print: 'M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z',
  back: 'M15 18l-6-6 6-6',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  zoom: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M21 21l-5-5M11 8v6M8 11h6',
  upload: 'M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  phone: 'M7 3h10v18H7zM11 18h2',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
  pin: 'M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12zM12 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
  home: 'M3 11l9-7 9 7M5 10v10h14V10',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  save: 'M5 3h11l3 3v15H5zM8 3v5h7V3M8 21v-7h8v7',
  check: 'M5 12l5 5L20 7',
  dot: 'M12 12h.01',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  key: 'M15 7a4 4 0 1 1-3.9 4.9L3 20v-3h3v-3h3l2.1-2.1A4 4 0 0 1 15 7zM16 9h.01',
};

/** One line of profile information: icon, label and value. */
function SummaryRow({ icon, label, children }: { icon: string; label: string; children: ReactNode }) {
  return (
    <div className="fb-sum">
      <Svg d={icon} size={18} />
      <span><small>{label}</small><b>{children}</b></span>
    </div>
  );
}

/** Shrinks and crops the chosen picture to a 256×256 JPEG so it uploads fast and stays small. */
function resizePhoto(file: File, size = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('no canvas')); return; }
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This file is not a picture.')); };
    img.src = url;
  });
}

const MONTHS = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'];
/** Registration date as "Oct. 5, 2026". */
const regDate = (v: string) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
};

/** One action in the profile picture menu (View / Change / Delete). */
interface PhotoAction { key: string; icon: string; label: string; onClick: () => void; danger?: boolean; disabled?: boolean }

/** "0917 123 4567" / "+63 917…" → "09171234567" (same as the server), to tell whether the number changed. */
const normalizePhone = (v: string) => {
  const d = v.replace(/\D/g, '');
  return d.startsWith('63') ? `0${d.slice(2)}` : d;
};

/**
 * Resident "My Profile" (view) and "Edit Profile" (?edit=1).
 * Nothing in Edit Profile is saved until the resident confirms it in the "Save changes?" dialog;
 * the information, an optional password change and the picture are then saved together in one request.
 */
export default function Profile() {
  const { setUser, can } = useAuth();
  const canEdit = can('profile.edit');
  const { data, errorInfo, loading, setData, reload } = useApi<ProfileData>('/profile');
  const { data: barangays } = useApi<string[]>('/barangays');
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const editing = params.get('edit') === '1';

  const [form, setForm] = useState({ name: '', contact_no: '', email: '', barangay: '', address_line: '' });
  const [pw, setPw] = useState(EMPTY_PW);
  const [photo, setPhoto] = useState<PhotoChange>({ kind: 'keep' });
  const [formMsg, setFormMsg] = useState<Msg>(null);     // shown on Edit Profile
  const [notice, setNotice] = useState<Msg>(null);       // shown on My Profile (e.g. "updated")
  const [confirming, setConfirming] = useState(false);   // "Save changes?" dialog
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);                       // blocks a second submit while saving
  const [preparingPhoto, setPreparingPhoto] = useState(false);
  const [preview, setPreview] = useState(false);         // enlarged profile picture
  const [showQr, setShowQr] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const formTop = useRef<HTMLDivElement>(null);
  const [pwOpen, setPwOpen] = useState(false);           // Change Password: closed by default
  const [photoMenu, setPhotoMenu] = useState(false);     // camera button menu
  const photoBox = useRef<HTMLDivElement>(null);
  const viewFileInput = useRef<HTMLInputElement>(null);
  const [newPhoto, setNewPhoto] = useState<string | null>(null);  // My Profile: chosen picture waiting for "Save Picture"
  const [confirmDelete, setConfirmDelete] = useState(false);       // My Profile: "Delete profile picture?"
  const [photoSaving, setPhotoSaving] = useState(false);

  // Opening Edit Profile (or after loading) starts from the saved information; password fields always start blank.
  useEffect(() => {
    if (!data) return;
    setForm({
      name: data.user.name,
      contact_no: data.user.resident?.contact_no ?? '',
      email: data.user.email ?? '',
      barangay: data.barangay ?? '',
      address_line: data.address_line,
    });
    setPw(EMPTY_PW);
    setPhoto({ kind: 'keep' });
    setFormMsg(null);
    setPwOpen(false);
    setPhotoMenu(false);
  }, [data, editing]);

  // Close the picture menu when tapping elsewhere or pressing Esc.
  useEffect(() => {
    if (!photoMenu) return;
    const close = (e: MouseEvent | TouchEvent) => { if (!photoBox.current?.contains(e.target as Node)) setPhotoMenu(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setPhotoMenu(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
      document.removeEventListener('keydown', esc);
    };
  }, [photoMenu]);

  // Esc closes the confirmation dialog (not while saving).
  useEffect(() => {
    if (!confirming) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !savingRef.current) setConfirming(false); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [confirming]);

  const resident = data?.user.resident ?? null;
  const wantsPassword = !!(pw.current_password || pw.password || pw.password_confirmation);
  const pwChecks = [
    { ok: pw.password.length >= 8, text: 'At least 8 characters' },
    { ok: /[A-Za-z]/.test(pw.password), text: 'At least one letter' },
    { ok: /[0-9]/.test(pw.password), text: 'At least one number' },
    { ok: pw.password !== '' && !passwordHasPersonalInfo(pw.password, [form.name, form.email, form.contact_no, data?.user.name, data?.user.email]), text: 'No name, email, mobile number or "Botika"' },
    { ok: pw.password !== '' && pw.password === pw.password_confirmation, text: 'New password and confirmation match' },
  ];

  // What will change (listed in the confirmation dialog).
  const changes = useMemo(() => {
    if (!data || !resident) return [];
    const list: string[] = [];
    if (form.name.trim().replace(/\s+/g, ' ') !== data.user.name) list.push('Full name');
    if (normalizePhone(form.contact_no) !== resident.contact_no) list.push('Mobile number');
    if (form.email.trim().toLowerCase() !== (data.user.email ?? '')) list.push('Gmail address');
    if (form.barangay !== (data.barangay ?? '')) list.push('Barangay');
    if (form.address_line.trim().replace(/\s+/g, ' ') !== data.address_line) list.push('House no. / Street / Purok');
    if (photo.kind === 'new') list.push('Profile picture (new picture)');
    if (photo.kind === 'remove') list.push('Profile picture (removed)');
    return list;
  }, [data, resident, form, photo]);

  /** Closing Change Password means "keep my current password": the fields are cleared. */
  const togglePassword = () => {
    if (pwOpen) setPw(EMPTY_PW);
    setPwOpen(!pwOpen);
  };

  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });
  const setPwField = (k: keyof typeof pw) => (e: ChangeEvent<HTMLInputElement>) => setPw({ ...pw, [k]: e.target.value });

  const openEdit = () => {
    setNotice(null);
    setParams({ edit: '1' }, { state: { fromProfile: true } });
    jumpToTop();
  };
  /** Back to My Profile without saving (Cancel, or after saving). */
  const closeEdit = () => {
    if ((location.state as { fromProfile?: boolean } | null)?.fromProfile) navigate(-1);
    else setParams({}, { replace: true });
    jumpToTop();
  };

  const choosePhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // lets the same file be chosen again later
    if (!file) return;
    setPreparingPhoto(true);
    try {
      setPhoto({ kind: 'new', data: await resizePhoto(file) });
      setFormMsg(null);
    } catch (err) {
      setFormMsg({ type: 'error', text: err instanceof Error ? err.message : 'This picture could not be used.' });
    } finally { setPreparingPhoto(false); }
  };

  /** My Profile → Change Profile Picture: the picture is shown for confirmation before it is saved. */
  const chooseNewPhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPreparingPhoto(true);
    setNotice(null);
    try {
      setNewPhoto(await resizePhoto(file));
    } catch (err) {
      setNotice({ type: 'error', text: err instanceof Error ? err.message : 'This picture could not be used.' });
    } finally { setPreparingPhoto(false); }
  };

  /** Saves (new picture) or deletes the profile picture after the resident confirms. */
  const savePhoto = async (action: 'change' | 'delete') => {
    if (savingRef.current) return;
    savingRef.current = true;
    setPhotoSaving(true);
    try {
      const res = action === 'change'
        ? (await api.post<ProfileData>('/profile/photo', { photo: newPhoto })).data
        : (await api.delete<ProfileData>('/profile/photo')).data;
      setData(res);
      setUser(res.user); // updates the picture in the top bar and menu
      toast.success(action === 'change' ? 'Profile picture updated' : 'Profile picture deleted', {
        description: action === 'change' ? 'Your new picture is now shown on your profile.' : 'Your profile now shows your initial instead of a picture.',
      });
    } catch (err) {
      toast.fromError(err, { title: action === 'change' ? 'Your picture was not changed' : 'Your picture was not deleted' });
    } finally {
      setNewPhoto(null);
      setConfirmDelete(false);
      savingRef.current = false;
      setPhotoSaving(false);
    }
  };

  /** Profile picture with a camera button; tapping either opens View / Change / Delete. */
  const photoControl = (src: string | null | undefined, name: string, actions: PhotoAction[], disabled = false) => (
    <div className="fb-avatar-wrap" ref={photoBox}>
      <button type="button" className="fb-avatar" onClick={() => setPhotoMenu((o) => !o)} disabled={disabled}
        aria-haspopup="menu" aria-expanded={photoMenu} aria-label="Profile picture options" title="Profile picture options">
        <Avatar name={name} photo={src} size={128} />
      </button>
      <button type="button" className="fb-camera" onClick={() => setPhotoMenu((o) => !o)} disabled={disabled}
        aria-haspopup="menu" aria-expanded={photoMenu} aria-label="Profile picture options" title="Profile picture options">
        <Svg d={ICON.camera} size={19} width={2.2} />
      </button>
      {photoMenu && (
        <div className="pf-menu fb-photo-menu" role="menu">
          {actions.map((a) => (
            <button key={a.key} type="button" role="menuitem" className={a.danger ? 'pf-menu-danger' : ''} disabled={a.disabled}
              onClick={() => { setPhotoMenu(false); a.onClick(); }}>
              <Svg d={a.icon} size={18} /> {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const showFormError = (text: string) => {
    setFormMsg({ type: 'error', text });
    requestAnimationFrame(() => jumpTo(formTop.current, { highlight: false }));
  };

  /** "Save Changes": check the form, then ask for confirmation. Nothing is sent to the server here. */
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (savingRef.current) return;
    setFormMsg(null);
    if (wantsPassword) {
      if (!pw.current_password) return showFormError('Enter your current password to change your password, or clear the password fields to keep it.');
      if (!pw.password) return showFormError('Enter a new password, or clear the password fields to keep your current password.');
      if (!pwChecks.every((c) => c.ok)) return showFormError('The new password does not meet the requirements below the password fields.');
      if (pw.password === pw.current_password) return showFormError('The new password must be different from your current password.');
    }
    if (changes.length === 0 && !wantsPassword && pwOpen) {
      // Change Password is open but empty: say what to do instead of "nothing to save".
      return showFormError('To change your password, enter your current password and a new password. Or tap "Don\'t change" to keep your current password.');
    }
    if (changes.length === 0 && !wantsPassword) {
      toast.info('Nothing to save', { description: 'You have not made any changes. Edit your information, picture or password, then save.' });
      return;
    }
    setConfirming(true);
  };

  /** "Confirm and Save": the only place where the profile is saved. */
  const confirmSave = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const body: Record<string, unknown> = { ...form };
      if (wantsPassword) Object.assign(body, pw);
      if (photo.kind === 'new') body.photo = photo.data;
      if (photo.kind === 'remove') body.remove_photo = true;
      const res = (await api.put<ProfileData>('/profile', body)).data;
      setConfirming(false);
      setData(res);
      setUser(res.user); // updates the name and picture in the top bar and menu
      toast.success('Profile updated', { description: res.password_changed ? 'Your profile and password were updated. Use your new password the next time you log in.' : 'Your changes were saved.' });
      closeEdit();
    } catch (err) {
      setConfirming(false);
      showFormError(`Your changes were not saved. ${errorMessage(err)}`);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  if (loading && !data) return <Loading />;
  if (!data || !resident) return <div className="page"><LoadError error={errorInfo} onRetry={() => reload()} /></div>;
  if (editing && !canEdit) return <AccessDenied feature="profile.edit" />;
  const { user } = data;
  const editPhoto = photo.kind === 'new' ? photo.data : photo.kind === 'remove' ? null : resident.photo;

  /** Enlarged profile picture (My Profile, and Edit Profile where it can be a new picture not saved yet). */
  const previewModal = (src: string | null | undefined, note?: string) => (
    <Modal title="Profile Picture" onClose={() => setPreview(false)}>
      <div className="pf-preview">
        {src
          ? <img src={src} alt={`Profile picture of ${user.name}`} />
          : (
            <>
              <Avatar name={user.name} size={160} />
              <p className="muted small">No profile picture yet. You can add one in Edit Profile.</p>
            </>
          )}
        <strong>{user.name}</strong>
        {note && <p className="muted small">{note}</p>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={() => setPreview(false)}>Close</button>
        </div>
      </div>
    </Modal>
  );

  // ------------------------------------------------------------------ Edit Profile
  if (editing) {
    // Shown only while a picture change is waiting to be saved.
    const photoStatus = preparingPhoto ? 'Preparing picture…'
      : photo.kind === 'new' ? 'New picture chosen — it will be saved when you confirm your changes.'
        : photo.kind === 'remove' ? 'Picture will be removed when you confirm your changes.' : '';
    return (
      <div className="page pf-page fb-edit">
        <BackButton onClick={closeEdit} label="Back to My Profile" />
        <header className="fb-top">
          <div>
            <h1>Edit Profile</h1>
          </div>
        </header>

        <div ref={formTop}><Message type={formMsg?.type}>{formMsg?.text}</Message></div>

        <form onSubmit={submit} className="fb-form">
          {/* Profile picture on a BulanBotikaCare banner, with a camera button to change it */}
          <section className="card fb-sec fb-photo-sec">
            {photoControl(editPhoto, form.name || user.name, [
              { key: 'view', icon: ICON.eye, label: 'View Profile Picture', onClick: () => setPreview(true) },
              { key: 'change', icon: ICON.camera, label: 'Change Profile Picture', onClick: () => fileInput.current?.click() },
              ...(photo.kind !== 'keep'
                ? [{ key: 'keep', icon: ICON.undo, label: 'Keep Current Picture', onClick: () => setPhoto({ kind: 'keep' }) }]
                : []),
              { key: 'delete', icon: ICON.trash, label: 'Delete Profile Picture', danger: true, disabled: !resident.photo || photo.kind === 'remove',
                onClick: () => setPhoto({ kind: 'remove' }) },
            ], preparingPhoto || saving)}
            <input ref={fileInput} type="file" accept="image/*" hidden onChange={choosePhoto} />
            <div className="fb-who">
              <strong>{form.name.trim() || user.name}</strong>
              <small className="fb-rid">Resident ID: {resident.qr_code}</small>
              <small>Registered {regDate(user.created_at)}</small>
            </div>
            {photoStatus && <p className="fb-photo-status is-pending">{photoStatus}</p>}
          </section>

          <section className="card fb-sec">
            <div className="fb-sec-head">
              <h2><span className="fb-sec-icon"><Svg d={ICON.user} size={17} /></span>Personal Information</h2>
            </div>
            <div className="fb-sec-body pf-fields">
              <label className="pf-field-wide">Full Name
                <input value={form.name} onChange={set('name')} autoComplete="name" required maxLength={100} {...FIELD.name} />
              </label>
              <label><span>Contact Number <span className="pf-optional">(for log in and SMS)</span></span>
                <input type="tel" inputMode="tel" value={form.contact_no} onChange={set('contact_no')} placeholder="09XXXXXXXXX" required maxLength={16} {...FIELD.mobile} />
              </label>
              <label><span>Email Address <span className="pf-optional">(Gmail, optional)</span></span>
                <input type="email" value={form.email} onChange={set('email')} placeholder="name@gmail.com" autoComplete="email" maxLength={255} {...FIELD.gmail} />
              </label>
              <label>Barangay
                <select value={form.barangay} onChange={set('barangay')} required>
                  <option value="">{barangays ? 'Select your barangay…' : 'Loading barangays…'}</option>
                  {barangays?.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </label>
              <label><span>House Number / Street / Purok <span className="pf-optional">(optional)</span></span>
                <input value={form.address_line} onChange={set('address_line')} maxLength={120} placeholder="e.g. Purok 3, Rizal St." />
              </label>
            </div>
          </section>

          {/* Optional and closed by default; closing it keeps the current password (the fields are cleared). */}
          <section className={`card fb-sec fb-pw-sec ${pwOpen ? 'is-open' : ''}`}>
            <div className="fb-sec-head">
              <h2><span className="fb-sec-icon"><Svg d={ICON.key} size={17} /></span>Change Password <span className="fb-optional-pill">Optional</span></h2>
              <button type="button" className="fb-sec-link" onClick={togglePassword} aria-expanded={pwOpen}>{pwOpen ? "Don't change" : 'Change'}</button>
            </div>
            {!pwOpen ? (
              <p className="fb-sec-summary fb-pw-closed">Leave this closed to keep your current password.</p>
            ) : (
              <div className="fb-sec-body">
                <label>Current Password
                  <PasswordInput value={pw.current_password} onChange={setPwField('current_password')} autoComplete="current-password" maxLength={100} autoFocus />
                </label>
                <label>New Password
                  <PasswordInput value={pw.password} onChange={setPwField('password')} autoComplete="new-password" maxLength={100} />
                </label>
                <label>Confirm New Password
                  <PasswordInput value={pw.password_confirmation} onChange={setPwField('password_confirmation')} autoComplete="new-password" maxLength={100} />
                </label>
                <ul className={`pf-pw-rules ${pw.password || pw.password_confirmation ? 'is-active' : ''}`} aria-label="Password requirements">
                  {pwChecks.map((c) => (
                    <li key={c.text} className={c.ok ? 'ok' : ''}>
                      <Svg d={c.ok ? ICON.check : ICON.dot} size={14} width={c.ok ? 3 : 6} /> {c.text}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <p className="fb-fixed-note muted small">Your Resident ID and registration date cannot be changed.</p>

          <div className="fb-actions">
            <button className="btn btn-lg" disabled={saving || preparingPhoto}><Svg d={ICON.save} size={18} /> {saving ? 'Saving…' : 'Save Changes'}</button>
            <button type="button" className="btn btn-outline btn-lg" onClick={closeEdit} disabled={saving}>Cancel</button>
          </div>
        </form>

        {preview && previewModal(editPhoto, photo.kind === 'new' ? 'New picture — not saved yet.' : undefined)}

        {confirming && (
          <div className="modal-backdrop" onMouseDown={() => !savingRef.current && setConfirming(false)}>
            <div className="modal confirm-modal pf-confirm" role="dialog" aria-modal="true" aria-labelledby="pf-confirm-title" onMouseDown={(e) => e.stopPropagation()}>
              <span className="confirm-icon pf-confirm-icon"><Svg d={ICON.save} size={28} /></span>
              <h2 id="pf-confirm-title">Save changes to your profile?</h2>
              {changes.length > 0 && (
                <>
                  <p>Your profile information will be updated with these changes:</p>
                  <ul className="pf-confirm-list">{changes.map((c) => <li key={c}><Svg d={ICON.check} size={14} width={3} /> {c}</li>)}</ul>
                </>
              )}
              {wantsPassword && (
                <p className="pf-confirm-pw">
                  <Svg d={ICON.lock} size={16} />
                  <span>Your <b>password will also be changed</b>. Use the new password the next time you log in. Other phones or computers logged in to your account will be logged out.</span>
                </p>
              )}
              <p className="muted small">Nothing is saved until you tap Confirm and Save.</p>
              <div className="confirm-actions">
                <button type="button" className="btn btn-outline" onClick={() => setConfirming(false)} disabled={saving}>Cancel</button>
                <button type="button" className="btn" onClick={confirmSave} disabled={saving}>{saving ? 'Saving…' : 'Confirm and Save'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ------------------------------------------------------------------ My Profile
  return (
    <div className="page pf-page fb-page">
      <BackButton linkedOnly />
      <header className="fb-top no-print">
        <div>
          <h1>My Profile</h1>
        </div>
      </header>
      <div className="no-print"><Message type={notice?.type}>{notice?.text}</Message></div>

      <div className="fb-form fb-view no-print">
        <section className="card fb-sec fb-photo-sec">
          {photoControl(resident.photo, user.name, [
            { key: 'view', icon: ICON.eye, label: 'View Profile Picture', onClick: () => setPreview(true) },
            ...(canEdit ? [
              { key: 'change', icon: ICON.camera, label: 'Change Profile Picture', onClick: () => viewFileInput.current?.click() },
              { key: 'delete', icon: ICON.trash, label: 'Delete Profile Picture', danger: true, disabled: !resident.photo, onClick: () => setConfirmDelete(true) },
            ] : []),
          ], preparingPhoto || photoSaving)}
          {/* gallery or camera (the phone offers both for image/*) */}
          <input ref={viewFileInput} type="file" accept="image/*" hidden onChange={chooseNewPhoto} />
          {preparingPhoto && <p className="fb-photo-status">Preparing picture…</p>}
          <div className="fb-who">
            <strong>{user.name}</strong>
            <small className="fb-rid">Resident ID: {resident.qr_code}</small>
            <small>Registered {regDate(user.created_at)}</small>
          </div>
          <button type="button" className="btn pf-qr-btn fb-qr-btn" onClick={() => setShowQr(true)}>
            <Svg d={ICON.qr} size={18} width={2} /> View My QR Code
          </button>
        </section>

        <section className="card fb-sec">
          <div className="fb-sec-head"><h2><span className="fb-sec-icon"><Svg d={ICON.user} size={17} /></span>Name</h2></div>
          <div className="fb-sec-summary"><SummaryRow icon={ICON.user} label="Full name">{user.name}</SummaryRow></div>
        </section>

        <section className="card fb-sec">
          <div className="fb-sec-head"><h2><span className="fb-sec-icon"><Svg d={ICON.phone} size={17} /></span>Contact Information</h2></div>
          <div className="fb-sec-summary">
            <SummaryRow icon={ICON.phone} label="Contact number">{resident.contact_no}</SummaryRow>
            <SummaryRow icon={ICON.mail} label="Email address">{user.email || <span className="muted">Not added</span>}</SummaryRow>
          </div>
        </section>

        <section className="card fb-sec">
          <div className="fb-sec-head"><h2><span className="fb-sec-icon"><Svg d={ICON.pin} size={17} /></span>Address</h2></div>
          <div className="fb-sec-summary">
            <SummaryRow icon={ICON.pin} label="Barangay">{data.barangay ? `${data.barangay}, Bulan, Sorsogon` : <span className="muted">Not set</span>}</SummaryRow>
            <SummaryRow icon={ICON.home} label="House no. / Street / Purok">{data.address_line || <span className="muted">Not added</span>}</SummaryRow>
          </div>
        </section>

        {canEdit && (
          <div className="fb-actions">
            <button type="button" className="btn btn-lg" onClick={openEdit}><Svg d={ICON.edit} size={18} /> Edit Profile</button>
          </div>
        )}
      </div>

      {/* Printed copy (only on paper): QR code, Resident ID, name and address. */}
      <div className="print-only pf-qr-print">
        <QRCodeSVG value={resident.qr_code} size={200} marginSize={2} />
        <div className="patient-id">{resident.qr_code}</div>
        <p>{user.name} · {resident.address}</p>
        <p>Show this QR code to the pharmacy staff when claiming your medicines.</p>
      </div>

      {preview && previewModal(resident.photo)}

      {newPhoto && (
        <div className="modal-backdrop" onMouseDown={() => !savingRef.current && setNewPhoto(null)}>
          <div className="modal confirm-modal pf-confirm" role="dialog" aria-modal="true" aria-labelledby="pf-photo-title" onMouseDown={(e) => e.stopPropagation()}>
            <img className="pf-new-photo" src={newPhoto} alt="New profile picture" />
            <h2 id="pf-photo-title">Change profile picture?</h2>
            <p>This picture will replace your current profile picture.</p>
            <div className="confirm-actions">
              <button type="button" className="btn btn-outline" onClick={() => setNewPhoto(null)} disabled={photoSaving}>Cancel</button>
              <button type="button" className="btn" onClick={() => savePhoto('change')} disabled={photoSaving}>{photoSaving ? 'Saving…' : 'Save Picture'}</button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="modal-backdrop" onMouseDown={() => !savingRef.current && setConfirmDelete(false)}>
          <div className="modal confirm-modal pf-confirm" role="dialog" aria-modal="true" aria-labelledby="pf-del-title" onMouseDown={(e) => e.stopPropagation()}>
            <span className="confirm-icon"><Svg d={ICON.trash} size={28} /></span>
            <h2 id="pf-del-title">Delete profile picture?</h2>
            <p>Your picture will be removed and the default profile avatar will be shown instead.</p>
            <div className="confirm-actions">
              <button type="button" className="btn btn-outline" onClick={() => setConfirmDelete(false)} disabled={photoSaving}>Cancel</button>
              <button type="button" className="btn btn-danger" onClick={() => savePhoto('delete')} disabled={photoSaving}>{photoSaving ? 'Deleting…' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}

      {showQr && (
        <Modal title="My QR Code" onClose={() => setShowQr(false)}>
          <div className="pf-qr-modal">
            <div className="pf-qr-frame">
              <QRCodeSVG value={resident.qr_code} size={240} marginSize={2} level="M" />
            </div>
            <small className="muted">Resident ID</small>
            <div className="patient-id">{resident.qr_code}</div>
            <p className="muted small">{user.name}</p>
            <p className="pf-qr-hint">Show this QR code to the pharmacy staff when claiming your medicines.</p>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => window.print()}><Svg d={ICON.print} size={18} /> Print</button>
              <button className="btn" onClick={() => setShowQr(false)}>Close</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
