import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { api, errorMessage, formatDate } from '../../api';
import { useAuth } from '../../auth';
import { useApi } from '../../hooks';
import { Avatar, Card, Loading, Message, PasswordInput } from '../../components/ui';
import type { User } from '../../types';
import { FIELD } from '../../validation';

interface ProfileData {
  user: User;
  barangay: string | null;
  address_line: string;
}

type Msg = { type: 'error' | 'success'; text: string } | null;

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

  // Fill the form when the profile loads.
  useEffect(() => {
    if (!data) return;
    setForm({
      name: data.user.name,
      contact_no: data.user.resident?.contact_no ?? '',
      email: data.user.email ?? '',
      barangay: data.barangay ?? '',
      address_line: data.address_line,
    });
  }, [data]);

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
      setInfoMsg({ type: 'success', text: 'Your information has been saved.' });
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
    if (!confirm('Remove your profile picture?')) return;
    setBusy('photo');
    setPhotoMsg(null);
    try {
      saved((await api.delete<ProfileData>('/profile/photo')).data);
    } catch (err) {
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
      <header className="page-head no-print">
        <h1>My Profile</h1>
      </header>

      <section className="card profile-head no-print">
        <Avatar name={user.name} photo={resident.photo} size={96} />
        <div className="profile-who">
          <h2>{user.name}</h2>
          <p className="muted">Patient ID {resident.qr_code} · Registered {formatDate(resident.created_at)}</p>
          <div className="actions">
            <button className="btn btn-outline btn-sm" onClick={() => fileInput.current?.click()} disabled={busy === 'photo'}>
              {busy === 'photo' ? 'Saving…' : resident.photo ? 'Change picture' : 'Add profile picture'}
            </button>
            {resident.photo && (
              <button className="btn btn-outline btn-sm" onClick={removePhoto} disabled={busy === 'photo'}>Remove</button>
            )}
          </div>
          <input ref={fileInput} type="file" accept="image/*" hidden onChange={choosePhoto} />
        </div>
      </section>
      <Message type={photoMsg?.type}>{photoMsg?.text}</Message>

      <div className="grid-2">
        <Card title="My QR code / Patient ID">
          <div className="qr-card">
            <QRCodeSVG value={resident.qr_code} size={160} marginSize={2} />
            <div>
              <div className="patient-id">{resident.qr_code}</div>
              <p className="muted">Show this QR code at Botika ng Bayan when you claim your medicines.</p>
              <p className="muted small">{user.name} · {resident.address}</p>
              <button className="btn btn-outline" onClick={() => window.print()}>Print</button>
            </div>
          </div>
        </Card>

        <div className="no-print">
          <Card title="My information">
            <form onSubmit={saveInfo}>
              <Message type={infoMsg?.type}>{infoMsg?.text}</Message>
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
              <button className="btn" disabled={busy === 'info'}>{busy === 'info' ? 'Saving…' : 'Save changes'}</button>
            </form>
          </Card>
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
    </div>
  );
}
