import { useState, type FormEvent } from 'react';
import { api, formatDate, ROLE_LABEL } from '../../api';
import { useAuth } from '../../auth';
import { useApi } from '../../hooks';
import { Badge, Card, Empty, Loading, Message, Modal, PasswordInput } from '../../components/ui';
import type { Role, User } from '../../types';
import { FIELD } from '../../validation';
import BackButton from '../../components/BackButton';
import { alertDialog, confirmAction, LoadError, toast, useFormErrors } from '../../components/feedback';

type Form = { name: string; email: string; password: string; password_confirmation: string; role: Role };

/** A temporary default password that is easy to read aloud: no 0/O, 1/l/I. At least one letter and one number. */
function generatePassword(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const pick = (set: string) => set[crypto.getRandomValues(new Uint32Array(1))[0] % set.length];
  const chars = [...Array.from({ length: 8 }, () => pick(letters)), ...Array.from({ length: 4 }, () => pick(digits))];
  // Shuffle so the numbers are not always at the end.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/** Manage User Accounts: create, view, edit, deactivate (Fig. 4.4). */
export default function Users() {
  const { user: me } = useAuth();
  const [role, setRole] = useState(() => new URLSearchParams(window.location.search).get('role') ?? ''); // ?role=resident / staff from the dashboard
  const [search, setSearch] = useState('');
  const { data, errorInfo, loading, reload } = useApi<User[]>('/users', { role, search });
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const fe = useFormErrors(['name', 'email', 'password', 'password_confirmation', 'role']);
  const [busy, setBusy] = useState(false);

  const open = (u?: User) => {
    setEditing(u ?? null);
    fe.clear();
    setForm(u ? { name: u.name, email: u.email ?? '', password: '', password_confirmation: '', role: u.role }
      : { name: '', email: '', password: '', password_confirmation: '', role: 'staff' });
  };

  // The administrator's own password is changed with "Change password" in the menu (asks for the current one).
  const editingSelf = !!editing && editing.user_id === me?.user_id;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!form || busy) return;
    fe.clear();
    if ((form.password || form.password_confirmation) && form.password !== form.password_confirmation) {
      fe.setFieldErrors({ password_confirmation: 'The password and its confirmation do not match.' });
      return;
    }
    setBusy(true);
    try {
      const res = editing ? await api.put<User>(`/users/${editing.user_id}`, form) : await api.post<User>('/users', form);
      const sent = form;
      const expires = res.data.temp_password_expires_at ? formatDate(res.data.temp_password_expires_at, true) : null;
      setForm(null);
      reload(true);
      if (!editing) {
        // Show the login details once, so the administrator can give them to the new staff member.
        alertDialog({
          tone: 'success',
          title: 'Account created',
          message: <>{sent.name} can now log in as <strong>{ROLE_LABEL[sent.role]}</strong> with these details:</>,
          details: (
            <div className="temp-login">
              <div><span>Email (username)</span><strong>{sent.email}</strong></div>
              <div><span>Temporary password</span><strong className="temp-login-pw">{sent.password}</strong></div>
              <p>
                Give these details to {sent.name.split(' ')[0]} privately (in person, or in a private message — never in a group chat).
                The system will ask them to change this temporary password the first time they log in.
                {expires && <> It stops working on <strong>{expires}</strong> if it is not used.</>}
              </p>
              <p className="temp-login-warn">This password is shown only once and cannot be viewed again. If it is lost, set a new one with Edit.</p>
            </div>
          ),
          buttonLabel: 'Done',
        });
      } else if (sent.password) {
        toast.success('Temporary password set', {
          description: `${sent.name} was logged out and must change the new password at their next log-in${expires ? ` (before ${expires})` : ''}.`,
          duration: 8000,
        });
      } else {
        toast.success('Account updated', { description: `The changes to ${sent.name}'s account were saved.` });
      }
    } catch (err) { fe.fromError(err); }
    finally { setBusy(false); }
  };

  const toggle = (u: User) => confirmAction({
    tone: u.is_active ? 'danger' : 'primary',
    title: u.is_active ? 'Deactivate this account?' : 'Activate this account?',
    message: <><strong>{u.name}</strong> ({ROLE_LABEL[u.role]})</>,
    details: u.is_active
      ? 'They will no longer be able to log in until the account is activated again. Their records are kept.'
      : 'They will be able to log in again.',
    confirmLabel: u.is_active ? 'Deactivate' : 'Activate',
    busyLabel: 'Saving…',
    onConfirm: async () => {
      await api.post(`/users/${u.user_id}/toggle-active`);
      toast.success(u.is_active ? 'Account deactivated' : 'Account activated', {
        description: u.is_active ? `${u.name} can no longer log in.` : `${u.name} can log in again.`,
      });
      reload(true);
    },
  });

  return (
    <div className="page">
      <BackButton linkedOnly />
      <header className="page-head">
        <div className="page-title"><h1>User Accounts</h1></div>
        <button className="btn" onClick={() => open()}>+ Create staff account</button>
      </header>
      <LoadError error={errorInfo} onRetry={() => reload()} />

      <Card actions={
        <div className="filters">
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">All roles</option>
            <option value="admin">Administrators</option>
            <option value="staff">Pharmacy staff</option>
            <option value="resident">Residents</option>
          </select>
          <input className="search" placeholder="Search name, email, mobile or Resident ID…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      }>
        {loading && !data ? <Loading /> : !data ? null : !data?.length ? <Empty>No users found.</Empty> : (
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Resident ID / Mobile</th><th>Status</th><th>Created</th><th></th></tr></thead>
            <tbody>
              {data.map((u) => (
                <tr key={u.user_id} className={u.is_active ? '' : 'row-muted'}>
                  <td>{u.name}</td><td>{u.email ?? '—'}</td><td><Badge value={u.role} /></td>
                  <td>{u.resident ? `${u.resident.qr_code} · ${u.resident.contact_no}` : '—'}</td>
                  <td>
                    {u.is_active ? 'Active' : 'Deactivated'}
                    {u.must_change_password && (
                      u.temp_password_expires_at && new Date(u.temp_password_expires_at) < new Date()
                        ? <div><span className="temp-badge temp-badge-expired" title="The temporary password was not used in time. Use Edit to set a new one.">Temporary password expired</span></div>
                        : <div><span className="temp-badge" title="This account still uses the temporary password given by the administrator. The user must change it at the next log-in.">
                          Temporary password{u.temp_password_expires_at ? ` · until ${formatDate(u.temp_password_expires_at)}` : ''}
                        </span></div>
                    )}
                  </td>
                  <td>{formatDate(u.created_at)}</td>
                  <td className="right nowrap">
                    <button className="btn btn-outline btn-sm" onClick={() => open(u)}>Edit</button>{' '}
                    {u.user_id !== me?.user_id && (
                      <button className={`btn btn-sm ${u.is_active ? 'btn-danger' : ''}`} onClick={() => toggle(u)}>{u.is_active ? 'Deactivate' : 'Activate'}</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {form && (
        <Modal title={editing ? 'Edit user' : 'Create staff account'} onClose={() => setForm(null)}>
          <form onSubmit={save}>
            <Message>{fe.general}</Message>
            <label>Full name<input {...FIELD.name} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={100} required {...fe.invalid('name')} />{fe.error('name')}</label>
            <label>{editing ? 'Gmail address' : 'Gmail address (used as the username to log in)'}{editing?.role === 'resident' && ' (optional)'}
              <input type="email" {...FIELD.gmail} placeholder="name@gmail.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required={editing?.role !== 'resident'} {...fe.invalid('email')} />{fe.error('email')}
            </label>
            {!editing && (
              <div className="temp-pw-note">
                <strong>Default password (temporary)</strong>
                <span>Set a default password for the new account. The staff member must change it the first time they log in.</span>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => {
                  const pw = generatePassword();
                  setForm({ ...form, password: pw, password_confirmation: pw });
                  fe.clear('password'); fe.clear('password_confirmation');
                }}>Generate a password</button>
              </div>
            )}
            {editingSelf ? (
              <p className="field-hint">To change your own password, use <strong>Change password</strong> in the menu (your current password is needed).</p>
            ) : <>
            <label>{editing ? 'New password (leave blank to keep)' : 'Default password'}
              <PasswordInput {...FIELD.password} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" required={!editing} {...fe.invalid('password')} />{fe.error('password')}
            </label>
            <label>{editing ? 'Confirm new password' : 'Confirm default password'}
              <PasswordInput value={form.password_confirmation} onChange={(e) => setForm({ ...form, password_confirmation: e.target.value })}
                autoComplete="new-password" required={!editing || !!form.password} placeholder={editing ? 'Type the new password again' : 'Type the default password again'} {...fe.invalid('password_confirmation')} />
              {fe.error('password_confirmation')}
            </label>
            <p className="field-hint">
              At least 8 characters with letters and numbers, not a common password, and without the person's name or email.
              {editing && ' A new password set here is temporary: the user is logged out and must change it at their next log-in.'}
            </p>
            </>}
            <label>Role
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })} disabled={editing?.role === 'resident'} {...fe.invalid('role')}>
                <option value="staff">Pharmacy Staff</option>
                <option value="admin">Administrator</option>
                {editing?.role === 'resident' && <option value="resident">Resident</option>}
              </select>{fe.error('role')}
            </label>
            <div className="modal-actions">
              <button type="button" className="btn btn-outline" onClick={() => setForm(null)}>Cancel</button>
              <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
