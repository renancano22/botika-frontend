import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Message, PasswordInput } from './ui';
import { confirmSave, useFormErrors } from './feedback';
import type { User } from '../types';
import { FIELD, passwordHasPersonalInfo } from '../validation';

/**
 * Change own password with the current one (POST /account/password). Used at the first log-in with a
 * temporary password, and from the menu ("Change password") by the administrator and pharmacy staff.
 * The server checks everything again (password policy, wrong-password limit, expired temporary password).
 */
export default function ChangePasswordForm({ temporary, onDone, onCancel, submitLabel }: {
  temporary: boolean;
  onDone: (user: User) => void;
  onCancel?: () => void;
  submitLabel: string;
}) {
  const { user } = useAuth();
  const [form, setForm] = useState({ current_password: '', password: '', password_confirmation: '' });
  const fe = useFormErrors(['current_password', 'password', 'password_confirmation'], { summary: false });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => { setForm({ ...form, [k]: e.target.value }); fe.clear(k); };

  const current = temporary ? 'the temporary password' : 'your current password';
  const checks = [
    { ok: form.password.length >= 8, text: 'At least 8 characters' },
    { ok: /[A-Za-z]/.test(form.password) && /\d/.test(form.password), text: 'Has letters and numbers' },
    { ok: form.password !== '' && !passwordHasPersonalInfo(form.password, [user?.name, user?.email, user?.resident?.contact_no]), text: 'No name, email or "Botika" in it' },
    { ok: form.password !== '' && form.password !== form.current_password, text: `Different from ${current}` },
    { ok: form.password !== '' && form.password === form.password_confirmation, text: 'Both new passwords match' },
  ];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!(await confirmSave({
      title: 'Change your password?',
      message: 'Use your new password the next time you log in.',
      details: 'Other phones or computers logged in to your account will be logged out.',
    }))) return;
    fe.clear();
    setBusy(true);
    try {
      const res = await api.post<{ user: User }>('/account/password', form);
      setForm({ current_password: '', password: '', password_confirmation: '' });
      onDone(res.data.user);
    } catch (err) {
      fe.fromError(err);
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="cp-form">
      <Message>{fe.general}</Message>
      <label>{temporary ? 'Temporary password (from the administrator)' : 'Current password'}
        <PasswordInput value={form.current_password} onChange={set('current_password')} autoComplete="current-password" required autoFocus {...fe.invalid('current_password')} />
        {fe.error('current_password')}
      </label>
      <label>New password
        <PasswordInput value={form.password} onChange={set('password')} autoComplete="new-password" required {...FIELD.password} {...fe.invalid('password')} />
        {fe.error('password')}
      </label>
      <label>Confirm new password
        <PasswordInput value={form.password_confirmation} onChange={set('password_confirmation')} autoComplete="new-password" required {...fe.invalid('password_confirmation')} />
        {fe.error('password_confirmation')}
      </label>
      <ul className={`pf-pw-rules ${form.password || form.password_confirmation ? 'is-active' : ''}`} aria-label="Password requirements">
        {checks.map((c) => <li key={c.text} className={c.ok ? 'ok' : ''}>{c.text}</li>)}
      </ul>
      <div className={onCancel ? 'modal-actions' : undefined}>
        {onCancel && <button type="button" className="btn btn-outline" onClick={onCancel} disabled={busy}>Cancel</button>}
        <button className={`btn ${onCancel ? '' : 'btn-block'}`} disabled={busy || !checks.every((c) => c.ok)}>{busy ? 'Saving…' : submitLabel}</button>
      </div>
    </form>
  );
}
