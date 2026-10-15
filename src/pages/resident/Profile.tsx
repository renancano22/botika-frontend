import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { api, errorMessage, formatDate } from '../../api';
import { useAuth } from '../../auth';
import { useApi } from '../../hooks';
import { Avatar, Card, Loading, Message, Modal, PasswordInput } from '../../components/ui';
import { Svg } from '../../components/RequestCards';
import type { User } from '../../types';
import { FIELD } from '../../validation';
import { jumpTo } from '../../scroll';

interface ProfileData {
  user: User;
  barangay: string | null;
  address_line: string;
}

type Msg = { type: 'error' | 'success'; text: string } | null;

const ICON = {
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  upload: 'M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2zM6.5 6.5h1v1h-1zM16.5 6.5h1v1h-1zM6.5 16.5h1v1h-1z',
  print: 'M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z',
  back: 'M15 18l-6-6 6-6',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  id: 'M3 5h18v14H3zM7 9h4M7 13h6M15 9h3v6h-3z',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
  phone: 'M7 3h10v18H7zM11 18h2',
  pin: 'M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12zM12 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
  home: 'M3 11l9-7 9 7M5 10v10h14V10',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
};

/** One line of the personal and account information: icon, label and value. */
function InfoRow({ icon, label, children }: { icon: string; label: string; children: ReactNode }) {
  return (
    <div className="pf-info-row">
      <span className="pf-info-icon"><Svg d={icon} size={18} /></span>
      <div><dt>{label}</dt><dd>{children}</dd></div>
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

/** Resident "My Profile": QR code / Patient ID, profile picture, personal information and password. */
export default function Profile() {
  const { setUser } = useAuth();
  const { data, error, loading, setData } = useApi<ProfileData>('/profile');
  const { data: barangays } = useApi<string[]>('/barangays');

  const [form, setForm] = useState({ name: '', contact_no: '', email: '', barangay: '', address_line: '' });
  const [infoMsg, setInfoMsg] = useState<Msg>(null);
  const [photoMsg, setPhotoMsg] = useState<Msg>(null);
  const [pw, setPw] = useState({ current_password: '', password: '', password_confirmation: '' });
  const [pwMsg, setPwMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState<'' | 'info' | 'photo' | 'password'>('');
  const fileInput = useRef<HTMLInputElement>(null);
  const [photoMenu, setPhotoMenu] = useState(false);       // small menu under the profile picture
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [editing, setEditing] = useState(false);        // personal information: view or edit
  const photoBox = useRef<HTMLDivElement>(null);
  const infoCard = useRef<HTMLDivElement>(null);

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

  const fillForm = (d: ProfileData) => setForm({
    name: d.user.name,
    contact_no: d.user.resident?.contact_no ?? '',
    email: d.user.email ?? '',
    barangay: d.barangay ?? '',
    address_line: d.address_line,
  });

  // Fill the form when the profile loads.
  useEffect(() => { if (data) fillForm(data); }, [data]);

  const startEdit = () => {
    if (data) fillForm(data);
    setInfoMsg(null);
    setEditing(true);
    requestAnimationFrame(() => jumpTo(infoCard.current, { highlight: false }));
  };
  const cancelEdit = () => {
    if (data) fillForm(data); // discard unsaved changes
    setInfoMsg(null);
    setEditing(false);
  };

  const saved = (res: ProfileData) => {
    setData(res);
    setUser(res.user); // updates the name and picture in the top bar and menu
  };

  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  const saveInfo = async (e: FormEvent) => {
    e.preventDefault();
    setBusy('info');
    setInfoMsg(null);
    try {
      saved((await api.put<ProfileData>('/profile', form)).data);
      setEditing(false);
      setInfoMsg({ type: 'success', text: 'Your profile has been updated.' });
    } catch (err) {
      setInfoMsg({ type: 'error', text: errorMessage(err) });
    } finally { setBusy(''); }
  };

  const choosePhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // lets the same file be chosen again later
    if (!file) return;
    setBusy('photo');
    setPhotoMsg(null);
    try {
      const photo = await resizePhoto(file);
      saved((await api.post<ProfileData>('/profile/photo', { photo })).data);
      setPhotoMsg({ type: 'success', text: 'Profile picture updated.' });
    } catch (err) {
      setPhotoMsg({ type: 'error', text: err instanceof Error && !('response' in err) ? err.message : errorMessage(err) });
    } finally { setBusy(''); }
  };

  const removePhoto = async () => {
    setBusy('photo');
    setPhotoMsg(null);
    try {
      saved((await api.delete<ProfileData>('/profile/photo')).data);
      setConfirmRemove(false);
      setPhotoMsg({ type: 'success', text: 'Profile picture removed.' });
    } catch (err) {
      setConfirmRemove(false);
      setPhotoMsg({ type: 'error', text: errorMessage(err) });
    } finally { setBusy(''); }
  };

  const savePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (pw.password !== pw.password_confirmation) {
      setPwMsg({ type: 'error', text: 'The two new passwords do not match.' });
      return;
    }
    setBusy('password');
    setPwMsg(null);
    try {
      await api.put('/profile/password', pw);
      setPw({ current_password: '', password: '', password_confirmation: '' });
      setPwMsg({ type: 'success', text: 'Your password has been changed.' });
    } catch (err) {
      setPwMsg({ type: 'error', text: errorMessage(err) });
    } finally { setBusy(''); }
  };

  if (loading && !data) return <Loading />;
  if (!data) return <Message>{error}</Message>;
  const { user } = data;
  const resident = user.resident!;

  return (
    <div className="page">
      <header className="page-head pf-head no-print">
        <Link to="/dashboard" className="pf-back"><Svg d={ICON.back} size={18} width={2.4} /> Back to Dashboard</Link>
        <div>
          <h1>My Profile</h1>
          <p className="muted">Your personal and account information at Botika ng Bayan.</p>
        </div>
      </header>

      <section className="card profile-head no-print">
        <div className="pf-photo" ref={photoBox}>
          <button type="button" className="pf-photo-btn" onClick={() => setPhotoMenu((o) => !o)} disabled={busy === 'photo'}
            aria-haspopup="menu" aria-expanded={photoMenu} aria-label="Profile picture options" title="Change or remove your profile picture">
            <Avatar name={user.name} photo={resident.photo} size={96} />
            <span className="pf-photo-badge" aria-hidden="true"><Svg d={ICON.camera} size={16} width={2.2} /></span>
            {busy === 'photo' && <span className="pf-photo-busy">Saving…</span>}
          </button>
          {photoMenu && (
            <div className="pf-menu" role="menu">
              <button type="button" role="menuitem" onClick={() => { setPhotoMenu(false); fileInput.current?.click(); }}>
                <Svg d={ICON.upload} size={18} /> {resident.photo ? 'Change Profile Picture' : 'Add Profile Picture'}
              </button>
              <button type="button" role="menuitem" className="pf-menu-danger" disabled={!resident.photo}
                onClick={() => { setPhotoMenu(false); setConfirmRemove(true); }}>
                <Svg d={ICON.trash} size={18} /> Remove Profile Picture
              </button>
            </div>
          )}
          <input ref={fileInput} type="file" accept="image/*" hidden onChange={choosePhoto} />
        </div>
        <div className="profile-who">
          <h2>{user.name}</h2>
          <p className="muted">Patient ID <b>{resident.qr_code}</b> · Member since {formatDate(user.created_at)}</p>
          {!editing && (
            <div className="actions">
              <button type="button" className="btn btn-outline pf-edit-btn" onClick={startEdit}><Svg d={ICON.edit} size={17} /> Edit Profile</button>
            </div>
          )}
        </div>
      </section>
      <Message type={photoMsg?.type}>{photoMsg?.text}</Message>

      <div className="grid-2 pf-grid">
        <div className="no-print" ref={infoCard}>
          <Card title={editing ? 'Edit Profile' : 'Personal & Account Information'}>
            <Message type={infoMsg?.type}>{infoMsg?.text}</Message>
            {!editing ? (
              <dl className="pf-info">
                <InfoRow icon={ICON.user} label="Full name">{user.name}</InfoRow>
                <InfoRow icon={ICON.id} label="Patient ID"><span className="pf-info-id">{resident.qr_code}</span></InfoRow>
                <InfoRow icon={ICON.mail} label="Email address">{user.email || <span className="muted">Not added</span>}</InfoRow>
                <InfoRow icon={ICON.phone} label="Contact number">{resident.contact_no}</InfoRow>
                <InfoRow icon={ICON.pin} label="Barangay">{data.barangay ? `${data.barangay}, Bulan, Sorsogon` : <span className="muted">Not set</span>}</InfoRow>
                <InfoRow icon={ICON.home} label="House no. / Street / Purok">{data.address_line || <span className="muted">Not added</span>}</InfoRow>
                <InfoRow icon={ICON.calendar} label="Account created">{formatDate(user.created_at)}</InfoRow>
              </dl>
            ) : (
              <form onSubmit={saveInfo}>
                <label>Full name
                  <input value={form.name} onChange={set('name')} autoComplete="name" required maxLength={100} {...FIELD.name} />
                </label>
                <label>Mobile number (for log in and SMS updates)
                  <input type="tel" inputMode="tel" value={form.contact_no} onChange={set('contact_no')} placeholder="09XXXXXXXXX" required maxLength={16} {...FIELD.mobile} />
                </label>
                <label>Gmail address (optional)
                  <input type="email" value={form.email} onChange={set('email')} placeholder="name@gmail.com" autoComplete="email" maxLength={255} {...FIELD.gmail} />
                </label>
                <label>Barangay (Bulan, Sorsogon)
                  <select value={form.barangay} onChange={set('barangay')} required>
                    <option value="">{barangays ? 'Select your barangay…' : 'Loading barangays…'}</option>
                    {barangays?.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </label>
                <label>House no. / Street / Purok (optional)
                  <input value={form.address_line} onChange={set('address_line')} maxLength={120} placeholder="e.g. Purok 3, Rizal St." />
                </label>
                <p className="field-hint">Your Patient ID and account creation date cannot be changed.</p>
                <div className="pf-form-actions">
                  <button type="button" className="btn btn-outline" onClick={cancelEdit} disabled={busy === 'info'}>Cancel</button>
                  <button className="btn" disabled={busy === 'info'}>{busy === 'info' ? 'Saving…' : 'Save changes'}</button>
                </div>
              </form>
            )}
          </Card>
        </div>

        <section className="card pf-qr-card no-print">
          <div className="pf-qr-icon"><Svg d={ICON.qr} size={34} width={1.8} /></div>
          <h2>My QR Code / Patient ID</h2>
          <div className="pf-qr-id">{resident.qr_code}</div>
          <p className="muted">Your personal QR code is used to verify your identity when claiming medicines at Botika ng Bayan.</p>
          <button type="button" className="btn btn-lg pf-qr-btn" onClick={() => setShowQr(true)}>
            <Svg d={ICON.qr} size={18} width={2} /> View My QR Code
          </button>
        </section>

        {/* Printed copy (only on paper): QR code, Patient ID, name and address. */}
        <div className="print-only pf-qr-print">
          <QRCodeSVG value={resident.qr_code} size={200} marginSize={2} />
          <div className="patient-id">{resident.qr_code}</div>
          <p>{user.name} · {resident.address}</p>
          <p>Show this QR code to the pharmacy staff when claiming your medicines.</p>
        </div>
      </div>

      <div className="no-print">
        <Card title="Change password">
          <form onSubmit={savePassword} className="narrow-form">
            <Message type={pwMsg?.type}>{pwMsg?.text}</Message>
            <label>Current password
              <PasswordInput value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} autoComplete="current-password" required />
            </label>
            <div className="row">
              <label>New password
                <PasswordInput value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} autoComplete="new-password" required {...FIELD.password} />
              </label>
              <label>Confirm new password
                <PasswordInput value={pw.password_confirmation} onChange={(e) => setPw({ ...pw, password_confirmation: e.target.value })} autoComplete="new-password" required />
              </label>
            </div>
            <p className="field-hint">At least 8 characters, with at least one letter and one number.</p>
            <button className="btn" disabled={busy === 'password'}>{busy === 'password' ? 'Saving…' : 'Change password'}</button>
          </form>
        </Card>
      </div>

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

      {confirmRemove && (
        <div className="modal-backdrop" onMouseDown={() => busy !== 'photo' && setConfirmRemove(false)}>
          <div className="modal confirm-modal" role="dialog" aria-label="Remove profile picture" onMouseDown={(e) => e.stopPropagation()}>
            <button className="btn-ghost confirm-close" onClick={() => setConfirmRemove(false)} aria-label="Close">✕</button>
            <span className="confirm-icon"><Svg d={ICON.trash} size={30} /></span>
            <h2>Remove Profile Picture?</h2>
            <p>Your picture will be removed and the default avatar will be shown instead.</p>
            <div className="confirm-actions">
              <button className="btn btn-outline" onClick={() => setConfirmRemove(false)} disabled={busy === 'photo'}>Cancel</button>
              <button className="btn btn-danger" onClick={removePhoto} disabled={busy === 'photo'}>{busy === 'photo' ? 'Removing…' : 'Remove'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
