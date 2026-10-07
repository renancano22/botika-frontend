import { useState, type FormEvent } from 'react';
import { api, errorMessage, formatDate } from '../../api';
import { useAuth } from '../../auth';
import { useApi } from '../../hooks';
import { Badge, Card, Empty, Loading, Message, Modal, PasswordInput } from '../../components/ui';
import type { Role, User } from '../../types';

type Form = { name: string; email: string; password: string; role: Role };

/** Manage User Accounts: create, view, edit, deactivate (Fig. 4.4). */
export default function Users() {
  const { user: me } = useAuth();
  const [role, setRole] = useState('');
  const [search, setSearch] = useState('');
  const { data, error, loading, reload } = useApi<User[]>('/users', { role, search });
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [formError, setFormError] = useState('');
  const [pageError, setPageError] = useState('');

  const open = (u?: User) => {
    setEditing(u ?? null);
    setFormError('');
    setForm(u ? { name: u.name, email: u.email ?? '', password: '', role: u.role } : { name: '', email: '', password: '', role: 'staff' });
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (editing) await api.put(`/users/${editing.user_id}`, form);
      else await api.post('/users', form);
      setForm(null);
      reload();
    } catch (err) { setFormError(errorMessage(err)); }
  };

  const toggle = async (u: User) => {
    if (!confirm(`${u.is_active ? 'Deactivate' : 'Activate'} ${u.name}?`)) return;
    try { await api.post(`/users/${u.user_id}/toggle-active`); reload(); } catch (err) { setPageError(errorMessage(err)); }
  };

  return (
    <div className="page">
      <header className="page-head">
        <h1>User Accounts</h1>
        <button className="btn" onClick={() => open()}>+ Create staff / admin account</button>
      </header>
      <Message>{pageError || error}</Message>

      <Card actions={
        <div className="filters">
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">All roles</option>
            <option value="admin">Administrators</option>
            <option value="staff">Pharmacy staff</option>
            <option value="resident">Residents</option>
          </select>
          <input className="search" placeholder="Search name, email, mobile or Patient ID…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      }>
        {loading && !data ? <Loading /> : !data?.length ? <Empty>No users found.</Empty> : (
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Patient ID / Mobile</th><th>Status</th><th>Created</th><th></th></tr></thead>
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
            <Message>{formError}</Message>
            <label>Full name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
            <label>Email{editing?.role === 'resident' && ' (optional)'}
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required={editing?.role !== 'resident'} />
            </label>
            <label>{editing ? 'New password (leave blank to keep)' : 'Password'}
              <PasswordInput minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" required={!editing} />
            </label>
            <label>Role
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })} disabled={editing?.role === 'resident'}>
                <option value="staff">Pharmacy Staff</option>
                <option value="admin">Administrator</option>
                {editing?.role === 'resident' && <option value="resident">Resident</option>}
              </select>
            </label>
            <div className="modal-actions">
              <button type="button" className="btn btn-outline" onClick={() => setForm(null)}>Cancel</button>
              <button className="btn">Save</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
