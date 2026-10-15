import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { api, errorMessage, formatDate } from '../../api';
import { useAuth } from '../../auth';
import { useApi } from '../../hooks';
import { Avatar, Card, Loading, Message, Modal, PasswordInput } from '../../components/ui';
import { Svg } from '../../components/RequestCards';
import type { User } from '../../types';
import { FIELD } from '../../validation';
import { jumpTo, jumpToTop } from '../../scroll';

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
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4',
  save: 'M5 3h11l3 3v15H5zM8 3v5h7V3M8 21v-7h8v7',
  check: 'M5 12l5 5L20 7',
  dot: 'M12 12h.01',
};

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

/** "0917 123 4567" / "+63 917…" → "09171234567" (same as the server), to tell whether the number changed. */
const normalizePhone = (v: string) => {
  const d = v.replace(/\D/g, '');
  return d.startsWith('63') ? `0${d.slice(2)}` : d;
};

/** One line of personal information: icon, label and value. */
function InfoRow({ icon, label, children }: { icon: string; label: string; children: ReactNode }) {
  return (
    <div className="pf-info-row">
      <span className="pf-info-icon"><Svg d={icon} size={18} /></span>
      <div><dt>{label}</dt><dd>{children}</dd></div>
    </div>
  );
}

/**
 * Resident "My Profile" (view) and "Edit Profile" (?edit=1).
 * Nothing in Edit Profile is saved until the resident confirms it in the "Save changes?" dialog;
 * the information, an optional password change and the picture are then saved together in one request.
 */
export default function Profile() {
  const { setUser } = useAuth();
  const { data, error, loading, setData } = useApi<ProfileData>('/profile');
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
  }, [data, editing]);

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
    if (changes.length === 0 && !wantsPassword) {
      setFormMsg({ type: 'info', text: 'There are no changes to save.' });
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
      setNotice({ type: 'success', text: res.password_changed ? 'Your profile and password have been updated.' : 'Your profile has been updated.' });
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
  if (!data || !resident) return <Message>{error}</Message>;
  const { user } = data;
  const editPhoto = photo.kind === 'new' ? photo.data : photo.kind === 'remove' ? null : resident.photo;

  // ------------------------------------------------------------------ Edit Profile
  if (editing) {
    return (
      <div className="page pf-page pf-edit">
        <header className="page-head pf-head">
          <button type="button" className="pf-back" onClick={closeEdit}><Svg d={ICON.back} size={18} width={2.4} /> Back to My Profile</button>
          <div>
            <h1>Edit Profile</h1>
            <p className="muted">Update your information, then tap Save Changes. Nothing is saved until you confirm.</p>
          </div>
        </header>

        <div ref={formTop}><Message type={formMsg?.type}>{formMsg?.text}</Message></div>

        <form onSubmit={submit} className="pf-edit-form">
          <section className="card pf-edit-photo">
            <Avatar name={form.name || user.name} photo={editPhoto} size={72} />
            <div className="pf-edit-photo-body">
              <strong>Profile Picture</strong>
              <small className="muted">
                {preparingPhoto ? 'Preparing picture…'
                  : photo.kind === 'new' ? 'New picture chosen. It will be saved when you confirm your changes.'
                    : photo.kind === 'remove' ? 'The picture will be removed when you confirm your changes.'
                      : 'JPG or PNG. It is shown in the top bar and on your profile.'}
              </small>
              <div className="pf-edit-photo-actions">
                <button type="button" className="btn btn-sm btn-outline" onClick={() => fileInput.current?.click()} disabled={preparingPhoto || saving}>
                  <Svg d={ICON.upload} size={15} /> {editPhoto ? 'Change Picture' : 'Add Picture'}
                </button>
                {photo.kind !== 'keep' ? (
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => setPhoto({ kind: 'keep' })} disabled={saving}>
                    <Svg d={ICON.undo} size={15} /> Keep current picture
                  </button>
                ) : resident.photo && (
                  <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setPhoto({ kind: 'remove' })} disabled={saving}>
                    <Svg d={ICON.trash} size={15} /> Remove
                  </button>
                )}
              </div>
            </div>
            <input ref={fileInput} type="file" accept="image/*" hidden onChange={choosePhoto} />
          </section>

          <Card title="Personal Information">
            <div className="pf-fields">
              <label>Full Name
                <input value={form.name} onChange={set('name')} autoComplete="name" required maxLength={100} {...FIELD.name} />
              </label>
              <label>Mobile Number
                <input type="tel" inputMode="tel" value={form.contact_no} onChange={set('contact_no')} placeholder="09XXXXXXXXX" required maxLength={16} {...FIELD.mobile} />
              </label>
              <label><span>Gmail Address <span className="pf-optional">(optional)</span></span>
                <input type="email" value={form.email} onChange={set('email')} placeholder="name@gmail.com" autoComplete="email" maxLength={255} {...FIELD.gmail} />
              </label>
              <label>Barangay
                <select value={form.barangay} onChange={set('barangay')} required>
                  <option value="">{barangays ? 'Select your barangay…' : 'Loading barangays…'}</option>
                  {barangays?.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </label>
              <label className="pf-field-wide"><span>House Number / Street / Purok <span className="pf-optional">(optional)</span></span>
                <input value={form.address_line} onChange={set('address_line')} maxLength={120} placeholder="e.g. Purok 3, Rizal St." />
              </label>
            </div>
            <p className="field-hint pf-fixed-note">Your Patient ID and registration date cannot be changed.</p>
          </Card>

          <Card title="Change Password (optional)">
            <p className="pf-pw-note"><Svg d={ICON.lock} size={16} /> Leave these fields blank to keep your current password.</p>
            <div className="pf-fields">
              <label className="pf-field-wide">Current Password
                <PasswordInput value={pw.current_password} onChange={setPwField('current_password')} autoComplete="current-password" maxLength={100} />
              </label>
              <label>New Password
                <PasswordInput value={pw.password} onChange={setPwField('password')} autoComplete="new-password" maxLength={100} />
              </label>
              <label>Confirm New Password
                <PasswordInput value={pw.password_confirmation} onChange={setPwField('password_confirmation')} autoComplete="new-password" maxLength={100} />
              </label>
            </div>
            <ul className={`pf-pw-rules ${pw.password || pw.password_confirmation ? 'is-active' : ''}`} aria-label="Password requirements">
              {pwChecks.map((c) => (
                <li key={c.text} className={c.ok ? 'ok' : ''}>
                  <Svg d={c.ok ? ICON.check : ICON.dot} size={14} width={c.ok ? 3 : 6} /> {c.text}
                </li>
              ))}
            </ul>
          </Card>

          <div className="pf-form-actions pf-edit-actions">
            <button type="button" className="btn btn-outline" onClick={closeEdit} disabled={saving}>Cancel</button>
            <button className="btn" disabled={saving || preparingPhoto}>{saving ? 'Saving…' : 'Save Changes'}</button>
          </div>
        </form>

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
    <div className="page pf-page">
      <header className="page-head pf-head no-print">
        <Link to="/dashboard" className="pf-back"><Svg d={ICON.back} size={18} width={2.4} /> Back to Dashboard</Link>
        <div>
          <h1>My Profile</h1>
          <p className="muted">Your personal and account information at Botika ng Bayan.</p>
        </div>
      </header>
      <div className="no-print"><Message type={notice?.type}>{notice?.text}</Message></div>

      <section className="card profile-head no-print">
        <button type="button" className="pf-photo-btn" onClick={() => setPreview(true)} aria-label="View profile picture" title="View profile picture">
          <Avatar name={user.name} photo={resident.photo} size={96} />
          <span className="pf-photo-badge" aria-hidden="true"><Svg d={ICON.zoom} size={16} width={2.2} /></span>
        </button>
        <div className="profile-who">
          <h2>{user.name}</h2>
          <p className="muted">Patient ID <b className="pf-id">{resident.qr_code}</b></p>
          <p className="muted">Registered {formatDate(user.created_at)}</p>
        </div>
      </section>

      <div className="grid-2 pf-grid no-print">
        <Card title="Personal Information">
          <dl className="pf-info">
            <InfoRow icon={ICON.phone} label="Mobile number">{resident.contact_no}</InfoRow>
            <InfoRow icon={ICON.mail} label="Gmail address">{user.email || <span className="muted">Not added</span>}</InfoRow>
            <InfoRow icon={ICON.pin} label="Barangay">{data.barangay ? `${data.barangay}, Bulan, Sorsogon` : <span className="muted">Not set</span>}</InfoRow>
            <InfoRow icon={ICON.home} label="House no. / Street / Purok">{data.address_line || <span className="muted">Not added</span>}</InfoRow>
          </dl>
        </Card>

        <section className="card pf-qr-card">
          <div className="pf-qr-icon"><Svg d={ICON.qr} size={34} width={1.8} /></div>
          <h2>My QR Code / Patient ID</h2>
          <div className="pf-qr-id">{resident.qr_code}</div>
          <p className="muted">Your personal QR code is used to verify your identity when claiming medicines at Botika ng Bayan.</p>
          <button type="button" className="btn btn-lg pf-qr-btn" onClick={() => setShowQr(true)}>
            <Svg d={ICON.qr} size={18} width={2} /> View My QR Code
          </button>
        </section>
      </div>

      <section className="card pf-pw-card no-print">
        <span className="pf-pw-icon"><Svg d={ICON.shield} size={22} /></span>
        <div>
          <h2>Password</h2>
          <p className="pf-pw-dots" aria-label="Password hidden">••••••••</p>
          <p className="muted small">Your password is securely protected. It is stored encrypted and is never shown to anyone. You can change it in Edit Profile.</p>
        </div>
      </section>

      {/* Printed copy (only on paper): QR code, Patient ID, name and address. */}
      <div className="print-only pf-qr-print">
        <QRCodeSVG value={resident.qr_code} size={200} marginSize={2} />
        <div className="patient-id">{resident.qr_code}</div>
        <p>{user.name} · {resident.address}</p>
        <p>Show this QR code to the pharmacy staff when claiming your medicines.</p>
      </div>

      <div className="pf-bottom no-print">
        <button type="button" className="btn btn-lg pf-edit-btn" onClick={openEdit}><Svg d={ICON.edit} size={18} /> Edit Profile</button>
      </div>

      {preview && (
        <Modal title="Profile Picture" onClose={() => setPreview(false)}>
          <div className="pf-preview">
            {resident.photo
              ? <img src={resident.photo} alt={`Profile picture of ${user.name}`} />
              : (
                <>
                  <Avatar name={user.name} size={160} />
                  <p className="muted small">No profile picture yet. You can add one in Edit Profile.</p>
                </>
              )}
            <strong>{user.name}</strong>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setPreview(false)}>Close</button>
            </div>
          </div>
        </Modal>
      )}

      {showQr && (
        <Modal title="My QR Code" onClose={() => setShowQr(false)}>
          <div className="pf-qr-modal">
            <div className="pf-qr-frame">
              <QRCodeSVG value={resident.qr_code} size={240} marginSize={2} level="M" />
            </div>
            <small className="muted">Patient ID</small>
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
