import { useState, type FormEvent } from 'react';
import { api, formatDate, ROLE_LABEL } from '../../api';
import { useAuth } from '../../auth';
import { Pagination, rowNo, useDebounced, usePagedApi } from '../../components/Pagination';
import { Badge, Card, Empty, Loading, Message, Modal } from '../../components/ui';
import type { Role, User } from '../../types';
import { FIELD } from '../../validation';
import { Link } from 'react-router-dom';
import { Svg } from '../../components/RequestCards';

const UF_ICON = {
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  key: 'M15 7a4 4 0 1 1-3.9 4.9L3 20v-3h3v-3h3l2.1-2.1A4 4 0 0 1 15 7zM16 9h.01',
};
import BackButton from '../../components/BackButton';
import { alertDialog, confirmAction, LoadError, toast, useFormErrors } from '../../components/feedback';

type Form = { name: string; email: string; role: Role };
interface TemporaryPasswordResponse { user: User; temporary_password: string }
/** Reset Password: staff/admin get the temporary password shown once; residents get it by SMS and email instead. */
type ResetResponse = TemporaryPasswordResponse | { user: User; sent_to: { sms: string | null; email: string | null } };

/** Resident accounts: where the new temporary password was sent (the administrator never sees it). */
function showPasswordSent(u: User, sentTo: { sms: string | null; email: string | null }) {
  const expires = u.temp_password_expires_at ? formatDate(u.temp_password_expires_at, true) : null;
  const first = u.name.split(' ')[0];
  return alertDialog({
    tone: 'success',
    title: 'Password reset',
    message: <>A new temporary password was sent to <strong>{u.name}</strong>. They were logged out on all devices.</>,
    details: (
      <div className="temp-login">
        {sentTo.sms && <div><span>Sent by SMS to</span><strong>{sentTo.sms}</strong></div>}
        {sentTo.email && <div><span>Sent by email to</span><strong>{sentTo.email}</strong></div>}
        {u.email && !sentTo.email && <p className="temp-login-warn">The email to {u.email} could not be sent, so the password was sent by SMS only.</p>}
        {u.resident?.contact_no && !sentTo.sms && <p className="temp-login-warn">The SMS to {u.resident.contact_no} could not be sent, so the password was sent by email only.</p>}
        <p>
          The password is sent only to {first}, and is not shown to you. {first} must change it the first time they log in.
          {expires && <> It stops working on <strong>{expires}</strong> if it is not used.</>}
        </p>
      </div>
    ),
    buttonLabel: 'Done',
  });
}

/**
 * Shows a temporary password made by the server, once. It is kept only inside this dialog: after the
 * dialog is closed it is gone (not kept in the page, the list or the browser storage) and cannot be shown again.
 */
function showTemporaryPassword(res: TemporaryPasswordResponse, created: boolean) {
  const { user: u, temporary_password: password } = res;
  const expires = u.temp_password_expires_at ? formatDate(u.temp_password_expires_at, true) : null;
  return alertDialog({
    tone: 'success',
    title: created ? 'Account created' : 'Password reset',
    message: created
      ? <>{u.name} can now log in as <strong>{ROLE_LABEL[u.role]}</strong> with these details:</>
      : <>A new temporary password was generated for <strong>{u.name}</strong>. They were logged out on all devices.</>,
    details: (
      <div className="temp-login">
        <div><span>Email (username)</span><strong>{u.email ?? u.resident?.contact_no ?? '—'}</strong></div>
        <div><span>Temporary password</span><strong className="temp-login-pw">{password}</strong></div>
        <p>
          Give these details to {u.name.split(' ')[0]} privately (in person, or in a private message — never in a group chat).
          The system will ask them to change this temporary password the first time they log in.
          {expires && <> It stops working on <strong>{expires}</strong> if it is not used.</>}
        </p>
        <p className="temp-login-warn">
          This password is shown only once. After you close this window it cannot be viewed again. If it is lost,
          open <strong>Edit → Reset Password</strong> to generate a new temporary password — the old one is never shown.
        </p>
      </div>
    ),
    buttonLabel: 'Done',
  });
}

/** Manage User Accounts: create, view, edit, deactivate, reset password (Fig. 4.4). */
export default function Users() {
  const { user: me } = useAuth();
  const [role, setRole] = useState(() => new URLSearchParams(window.location.search).get('role') ?? ''); // ?role=resident / staff from the dashboard
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('name');
  const list = usePagedApi<User>('/users', { role, search: useDebounced(search.trim()), status, sort }, { table: 'users' });
  const { data, errorInfo, loading, reload, rows, meta } = list;
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const fe = useFormErrors(['name', 'email', 'role']);
  const [busy, setBusy] = useState(false);

  // Passwords are never part of this form: they are generated by the server (new account, Reset password)
  // or changed by the user themselves. An existing password is never shown, retrieved or pre-filled.
  const [resetOpen, setResetOpen] = useState(false); // Edit → Reset Password: closed by default
  const open = (u?: User) => {
    setEditing(u ?? null);
    setResetOpen(false);
    fe.clear();
    setForm(u ? { name: u.name, email: u.email ?? '', role: u.role } : { name: '', email: '', role: 'staff' });
  };

  // The administrator's own password is changed with "Change password" in the menu (asks for the current one).
  const editingSelf = !!editing && editing.user_id === me?.user_id;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!form || busy) return;
    fe.clear();
    setBusy(true);
    try {
      if (editing) {
        await api.put<User>(`/users/${editing.user_id}`, form);
        toast.success('Account updated', { description: `The changes to ${form.name}'s account were saved.` });
        setForm(null);
        reload(true);
      } else {
        const res = await api.post<TemporaryPasswordResponse>('/users', form);
        setForm(null);
        reload(true);
        showTemporaryPassword(res.data, true);
      }
    } catch (err) { fe.fromError(err); }
    finally { setBusy(false); }
  };

  /** Lost or forgotten password: replace it with a new temporary password (the old one is never shown). */
  const resetPassword = async (u: User) => {
    const done: { res?: ResetResponse } = {};
    const resident = u.role === 'resident';
    const ok = await confirmAction({
      tone: 'warning',
      title: 'Reset password?',
      message: resident
        ? <>A new temporary password will be sent to <strong>{u.name}</strong>
            {u.resident?.contact_no && <> by SMS to <strong>{u.resident.contact_no}</strong></>}
            {u.resident?.contact_no && u.email && ' and'}
            {u.email && <> by email to <strong>{u.email}</strong></>}. It will not be shown to you.</>
        : <>A new temporary password will be generated for <strong>{u.name}</strong> and shown to you once.</>,
      details: <>
        <p>Their current password is not shown and will stop working. They will be logged out on all devices and must change the new password at their next log-in.</p>
      </>,
      confirmLabel: 'Reset password',
      busyLabel: 'Resetting…',
      onConfirm: async () => {
        done.res = (await api.post<ResetResponse>(`/users/${u.user_id}/reset-password`)).data;
      },
    });
    if (ok && done.res) {
      reload(true);
      setResetOpen(false);
      setEditing(done.res.user); // the edit window shows the new status (temporary password)
      if ('sent_to' in done.res) showPasswordSent(done.res.user, done.res.sent_to);
      else showTemporaryPassword(done.res, false);
    }
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
          <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role">
            <option value="">All roles</option>
            <option value="admin">Administrators</option>
            <option value="staff">Pharmacy staff</option>
            <option value="resident">Residents</option>
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Account status">
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Deactivated</option>
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
            <option value="name">Name (A–Z)</option>
            <option value="newest">Newest accounts first</option>
            <option value="oldest">Oldest accounts first</option>
          </select>
          <input className="search" placeholder="Search name, email, mobile or Resident ID…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      }>
        {loading && !data ? <Loading /> : !data ? null : !rows.length ? <Empty>No users found.</Empty> : (
          <table className={loading ? 'tbl-updating' : ''}>
            <thead><tr><th className="col-no">No.</th><th>Name</th><th>Email</th><th>Role</th><th>Resident ID / Mobile</th><th>Status</th><th>Created</th><th className="right">Actions</th></tr></thead>
            <tbody>
              {rows.map((u, i) => (
                <tr key={u.user_id} className={u.is_active ? '' : 'row-muted'}>
                  <td className="col-no">{rowNo(meta, i)}</td>
                  <td>{u.name}</td><td>{u.email ?? '—'}</td><td><Badge value={u.role} /></td>
                  <td>{u.resident ? `${u.resident.qr_code} · ${u.resident.contact_no}` : '—'}</td>
                  <td>
                    {u.is_active ? 'Active' : 'Deactivated'}
                    {u.must_change_password && (
                      u.temp_password_expires_at && new Date(u.temp_password_expires_at) < new Date()
                        ? <div><span className="temp-badge temp-badge-expired" title="The temporary password was not used in time. Open Edit → Reset Password to generate a new one.">Temporary password expired</span></div>
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
        <Pagination meta={meta} onPage={list.setPage} onPerPage={list.setPerPage} noun="accounts" busy={loading} />
      </Card>

      {form && (
        <Modal title={editing ? 'Edit user' : 'Create staff account'} onClose={() => setForm(null)}>
          <form onSubmit={save} className="uf-form">
            <Message>{fe.general}</Message>
            <section className="card fb-sec">
              <div className="fb-sec-head">
                <h2><span className="fb-sec-icon"><Svg d={UF_ICON.user} size={17} /></span>Personal Information</h2>
              </div>
              <div className="fb-sec-body pf-fields">
                <label className="pf-field-wide">Full Name
                  <input {...FIELD.name} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={100} required {...fe.invalid('name')} />{fe.error('name')}
                </label>
                <label><span>Email Address <span className="pf-optional">{editing?.role === 'resident' ? '(Gmail, optional)' : '(Gmail, used to log in)'}</span></span>
                  <input type="email" {...FIELD.gmail} placeholder="name@gmail.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required={editing?.role !== 'resident'} {...fe.invalid('email')} />{fe.error('email')}
                </label>
                <label>Role
                  <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })} disabled={editing?.role === 'resident' || editingSelf} {...fe.invalid('role')}>
                    <option value="staff">Pharmacy Staff</option>
                    <option value="admin">Administrator</option>
                    {editing?.role === 'resident' && <option value="resident">Resident</option>}
                  </select>{fe.error('role')}
                </label>
              </div>
            </section>

            {!editing ? (
              <section className="card fb-sec">
                <div className="fb-sec-head">
                  <h2><span className="fb-sec-icon"><Svg d={UF_ICON.key} size={17} /></span>Temporary Password</h2>
                </div>
                <p className="fb-sec-summary">After you save, the system generates a secure temporary password and shows it to you once. The staff member must change it the first time they log in.</p>
              </section>
            ) : editingSelf ? (
              <section className="card fb-sec">
                <div className="fb-sec-head">
                  <h2><span className="fb-sec-icon"><Svg d={UF_ICON.key} size={17} /></span>Password</h2>
                  <Link to="/profile?edit=1" className="fb-sec-link">My Profile</Link>
                </div>
                <p className="fb-sec-summary fb-pw-closed">Change your own password in My Profile → Edit Profile (your current password is needed).</p>
              </section>
            ) : (
              /* Closed by default. Passwords are never shown: a reset replaces it with a new temporary password. */
              <section className={`card fb-sec fb-pw-sec ${resetOpen ? 'is-open' : ''}`}>
                <div className="fb-sec-head">
                  <h2><span className="fb-sec-icon"><Svg d={UF_ICON.key} size={17} /></span>Reset Password <span className="fb-optional-pill">Optional</span></h2>
                  <button type="button" className="fb-sec-link" onClick={() => setResetOpen(!resetOpen)} aria-expanded={resetOpen} disabled={!editing.is_active}>
                    {resetOpen ? "Don't reset" : 'Reset'}
                  </button>
                </div>
                {!resetOpen ? (
                  <p className="fb-sec-summary fb-pw-closed">
                    {editing.is_active ? 'Leave this closed to keep the current password. Passwords are never shown.' : 'Activate this account first to reset its password.'}
                  </p>
                ) : (
                  <div className="fb-sec-body uf-reset">
                    <ul>
                      {editing.role === 'resident'
                        ? <li>A new temporary password is generated by the system and sent only to {editing.name.split(' ')[0]} by <strong>SMS</strong>{editing.email ? <> and <strong>email</strong></> : null}. It is not shown to you.</li>
                        : <li>A new temporary password is generated by the system and shown to you <strong>once</strong>.</li>}
                      <li>{editing.name.split(' ')[0]}&apos;s current password is not shown and stops working.</li>
                      <li>They are logged out on all devices and must change the new password at their next log-in.</li>
                    </ul>
                    <button type="button" className="btn btn-warning" onClick={() => resetPassword(editing)} disabled={busy}>
                      <Svg d={UF_ICON.key} size={16} /> {editing.role === 'resident' ? 'Send new temporary password' : 'Generate new temporary password'}
                    </button>
                  </div>
                )}
              </section>
            )}

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
