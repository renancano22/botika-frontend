import { useState, type FormEvent } from 'react';
import { api, formatDate, ROLE_LABEL } from '../../api';
import { useAuth } from '../../auth';
import { useApi } from '../../hooks';
import { Badge, Card, Empty, Loading, Message, Modal, PasswordInput } from '../../components/ui';
import type { Role, User } from '../../types';
import { FIELD } from '../../validation';
import BackButton from '../../components/BackButton';
import { confirmAction, LoadError, toast, useFormErrors } from '../../components/feedback';

type Form = { name: string; email: string; password: string; password_confirmation: string; role: Role };

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
      if (editing) await api.put(`/users/${editing.user_id}`, form);
      else await api.post('/users', form);
      toast.success(editing ? 'Account updated' : 'Account created', {
        description: editing ? `The changes to ${form.name}'s account were saved.` : `${form.name} can now log in as ${ROLE_LABEL[form.role]}.`,
      });
      setForm(null);
      reload(true);
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
        <button className="btn" onClick={() => open()}>+ Create staff / admin account</button>
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
                  <td>{u.is_active ? 'Active' : 'Deactivated'}</td>
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
        <Modal title={editing ? 'Edit user' : 'Create account'} onClose={() => setForm(null)}>
          <form onSubmit={save}>
            <Message>{fe.general}</Message>
            <label>Full name<input {...FIELD.name} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={100} required {...fe.invalid('name')} />{fe.error('name')}</label>
            <label>Gmail address{editing?.role === 'resident' && ' (optional)'}
              <input type="email" {...FIELD.gmail} placeholder="name@gmail.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required={editing?.role !== 'resident'} {...fe.invalid('email')} />{fe.error('email')}
            </label>
            <label>{editing ? 'New password (leave blank to keep)' : 'Password'}
              <PasswordInput {...FIELD.password} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" required={!editing} {...fe.invalid('password')} />{fe.error('password')}
            </label>
            <label>{editing ? 'Confirm new password' : 'Confirm password'}
              <PasswordInput value={form.password_confirmation} onChange={(e) => setForm({ ...form, password_confirmation: e.target.value })}
                autoComplete="new-password" required={!editing || !!form.password} placeholder={editing ? 'Type the new password again' : 'Type the password again'} {...fe.invalid('password_confirmation')} />
              {fe.error('password_confirmation')}
            </label>
            <p className="field-hint">At least 8 characters, with letters and numbers.</p>
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
