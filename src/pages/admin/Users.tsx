import { useState, type FormEvent } from 'react';
import { api, formatDate, ROLE_LABEL } from '../../api';
import { useAuth } from '../../auth';
import { Pagination, rowNo, useDebounced, usePagedApi } from '../../components/Pagination';
import { Hl } from '../../components/SearchHighlight';
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
import { useApi } from '../../hooks';
import { alertDialog, ChangeList, confirmAction, confirmSave, LoadError, toast, useFormErrors } from '../../components/feedback';

type Form = { name: string; email: string; role: Role; barangay: string };
/** The barangay in a stored address ("Purok 2, Gate, Bulan, Sorsogon" → "Gate"), or '' when not from the list. */
const barangayOf = (address: string | null | undefined, list: string[] | null | undefined) =>
  (address && list?.find((b) => address === `${b}, Bulan, Sorsogon` || address.endsWith(`, ${b}, Bulan, Sorsogon`))) || '';
/** A row of User Accounts: an account, or a resident registered at the counter without an account (user_id null). */
type AccountRow = Omit<User, 'user_id'> & { user_id: number | null; has_account?: boolean; has_history?: boolean };
interface TemporaryPasswordResponse { user: User; temporary_password: string }
/** Reset Password: staff/admin get the temporary password shown once; residents get it by SMS and email instead. */
type ResetResponse = TemporaryPasswordResponse | { user: User; sent_to: { sms: string | null; email: string | null } };

/** Resident accounts: where the new temporary password was sent (the administrator never sees it). */
function showPasswordSent(u: User, sentTo: { sms: string | null; email: string | null }, newAccount = false) {
  const expires = u.temp_password_expires_at ? formatDate(u.temp_password_expires_at, true) : null;
  const first = u.name.split(' ')[0];
  return alertDialog({
    tone: 'success',
    title: newAccount ? 'Online account created' : 'Password reset',
    message: newAccount
      ? <><strong>{u.name}</strong> ({u.resident?.qr_code}) can now log in with their mobile number{u.email ? ' or email' : ''}. Their Resident ID and history stay the same.</>
      : <>A new temporary password was sent to <strong>{u.name}</strong>. They were logged out on all devices.</>,
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
  const term = useDebounced(search.trim()); // what the list was searched for (marked in the rows)
  const list = usePagedApi<AccountRow>('/users', { role, search: term, status, sort }, { table: 'users' });
  const { data, errorInfo, loading, reload, rows, meta } = list;
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const { data: barangays } = useApi<string[]>('/barangays');
  const fe = useFormErrors(['name', 'email', 'role']);
  const [busy, setBusy] = useState(false);
  // "Create online account" for a resident registered at the counter (same record, Resident ID and history).
  const [accountFor, setAccountFor] = useState<AccountRow | null>(null);
  const [accountForm, setAccountForm] = useState({ contact_no: '', email: '' });
  const afe = useFormErrors(['contact_no', 'email']);
  // Correct the name / barangay of a resident registered at the counter, or delete such a record made by mistake.
  const [fixing, setFixing] = useState<AccountRow | null>(null);
  const [fixForm, setFixForm] = useState({ name: '', barangay: '' });
  const ffe = useFormErrors(['name', 'barangay']);
  const openFix = (r: AccountRow) => { ffe.clear(); setFixForm({ name: r.name, barangay: barangayOf(r.resident?.address, barangays) }); setFixing(r); };
  const fixChanges = fixing ? ([
    ['Name', fixing.name, fixForm.name.trim().replace(/\s+/g, ' ')],
    ['Barangay', barangayOf(fixing.resident?.address, barangays), fixForm.barangay],
  ] as const).filter(([, a, b]) => a !== b).map(([label, from, to]) => ({ label, from, to })) : [];
  const saveFix = async (e: FormEvent) => {
    e.preventDefault();
    if (!fixing?.resident || busy || !fixChanges.length) return;
    if (!(await confirmSave({
      title: 'Save the corrections?',
      message: <>Resident <strong>{fixing.resident.qr_code}</strong>. The Resident ID and history stay the same.</>,
      details: <ChangeList rows={fixChanges} />,
    }))) return;
    setBusy(true);
    ffe.clear();
    try {
      await api.put(`/residents/${fixing.resident.resident_id}`, fixForm);
      toast.success('Resident record corrected', { description: `${fixForm.name.trim()} (${fixing.resident.qr_code}) was updated.` });
      setFixing(null);
      reload(true);
    } catch (err) { ffe.fromError(err); }
    finally { setBusy(false); }
  };
  const removeResident = (r: AccountRow) => r.resident && confirmAction({
    tone: 'danger',
    title: 'Delete this resident record?',
    message: <>You are about to delete <strong>{r.name}</strong> ({r.resident.qr_code}, {r.resident.address}).</>,
    details: 'Use this only for a record made by mistake, such as a duplicate. It has no online account and no requests or dispensing records. This cannot be undone.',
    confirmLabel: 'Delete record',
    busyLabel: 'Deleting…',
    onConfirm: async () => {
      await api.delete(`/residents/${r.resident!.resident_id}`);
      toast.success('Resident record deleted', { description: `${r.name} (${r.resident!.qr_code}) was removed.` });
      reload(true);
    },
  });
  const openAccount = (r: AccountRow) => { afe.clear(); setAccountForm({ contact_no: r.resident?.contact_no ?? '', email: '' }); setAccountFor(r); };
  const createAccount = async (e: FormEvent) => {
    e.preventDefault();
    if (!accountFor?.resident || busy) return;
    const r = accountFor.resident;
    if (!(await confirmSave({
      title: 'Create an online account?',
      message: <><strong>{accountFor.name}</strong> ({r.qr_code}) will be able to log in with <strong>{accountForm.contact_no.trim()}</strong>{accountForm.email.trim() ? <> or <strong>{accountForm.email.trim()}</strong></> : ''}. The same resident record, Resident ID and history are kept.</>,
      details: 'A temporary password is sent only to the resident (SMS, and email if given). It is not shown to you, and they must change it at the first log-in.',
      confirmLabel: 'Confirm and Create',
    }))) return;
    setBusy(true);
    afe.clear();
    try {
      const res = await api.post<{ user: User; sent_to: { sms: string | null; email: string | null } }>(`/residents/${r.resident_id}/account`,
        { contact_no: accountForm.contact_no, email: accountForm.email.trim() || null });
      setAccountFor(null);
      reload(true);
      showPasswordSent(res.data.user, res.data.sent_to, true);
    } catch (err) { afe.fromError(err); }
    finally { setBusy(false); }
  };

  // Passwords are never part of this form: they are generated by the server (new account, Reset password)
  // or changed by the user themselves. An existing password is never shown, retrieved or pre-filled.
  const [resetOpen, setResetOpen] = useState(false); // Edit → Reset Password: closed by default
  const open = (u?: User) => {
    setEditing(u ?? null);
    setResetOpen(false);
    fe.clear();
    setForm(u ? { name: u.name, email: u.email ?? '', role: u.role, barangay: barangayOf(u.resident?.address, barangays) } : { name: '', email: '', role: 'staff', barangay: '' });
  };

  // The administrator's own password is changed with "Change password" in the menu (asks for the current one).
  const editingSelf = !!editing && editing.user_id === me?.user_id;

  // Edit: Save only after something was changed.
  const changes = editing && form ? ([
    ['Name', editing.name, form.name.trim()],
    ['Email', editing.email ?? '', form.email.trim().toLowerCase()],
    ['Role', ROLE_LABEL[editing.role], ROLE_LABEL[form.role]],
    ['Barangay', editing.role === 'resident' ? barangayOf(editing.resident?.address, barangays) : '', editing.role === 'resident' ? form.barangay : ''],
  ] as const).filter(([, a, b]) => a !== b).map(([label, from, to]) => ({ label, from, to })) : [];
  const unchanged = !!editing && changes.length === 0;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!form || busy || unchanged) return;
    if (!(await confirmSave(editing ? {
      title: 'Save changes to this account?',
      message: <>You are about to update the account of <strong>{editing.name}</strong>.</>,
      details: <ChangeList rows={changes} />,
    } : {
      title: 'Create this account?',
      message: <><strong>{form.name.trim()}</strong> ({form.email.trim()}) will get a <strong>{ROLE_LABEL[form.role]}</strong> account. A temporary password will be shown once, to give to them.</>,
      confirmLabel: 'Confirm and Create',
    }))) return;
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
            <option value="no_account">No online account</option>
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
            <option value="name">Name (A–Z)</option>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
          <input className="search" placeholder="Search name, email, mobile or Resident ID…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      }>
        {loading && !data ? <Loading /> : !data ? null : !rows.length ? <Empty>No users found.</Empty> : (
          <table className={loading ? 'tbl-updating' : ''}>
            <thead><tr><th className="col-no">No.</th><th>Name</th><th>Email</th><th>Role</th><th>Resident ID / Mobile / Address</th><th>Status</th><th>Created</th><th className="right">Actions</th></tr></thead>
            <tbody>
              {rows.map((u, i) => {
                const noAccount = u.user_id === null; // registered at the counter (Register resident): no log-in account
                return (
                <tr key={noAccount ? `r${u.resident?.resident_id}` : u.user_id} className={u.is_active ? '' : 'row-muted'}>
                  <td className="col-no">{rowNo(meta, i)}</td>
                  <td><Hl q={term}>{u.name}</Hl></td><td>{u.email ? <Hl q={term}>{u.email}</Hl> : '—'}</td><td><Badge value={u.role} /></td>
                  <td>
                    {u.resident ? <>
                      <Hl q={term}>{u.resident.qr_code}</Hl>{u.resident.contact_no && <> · <Hl q={term}>{u.resident.contact_no}</Hl></>}
                      {u.resident.address && <div className="muted small">{u.resident.address}</div>}
                    </> : '—'}
                  </td>
                  <td>
                    {noAccount ? (
                      <>No online account<div><span className="no-account-badge" title="Registered by the pharmacy staff at the counter (e.g. no cellphone). The resident has a Resident ID and QR code but cannot log in.">Registered at the counter</span></div></>
                    ) : u.is_active ? 'Active' : 'Deactivated'}
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
                    {noAccount ? <>
                      <button className="btn btn-outline btn-sm" onClick={() => openAccount(u)}>Create account</button>{' '}
                      <button className="btn btn-outline btn-sm" onClick={() => openFix(u)}>Edit</button>
                      {!u.has_history && <>{' '}<button className="btn btn-danger btn-sm" onClick={() => removeResident(u)} title="Only for a record made by mistake (no requests or dispensing records)">Delete</button></>}
                    </> : <>
                      <button className="btn btn-outline btn-sm" onClick={() => open(u as User)}>Edit</button>{' '}
                      {u.user_id !== me?.user_id && (
                        <button className={`btn btn-sm ${u.is_active ? 'btn-danger' : ''}`} onClick={() => toggle(u as User)}>{u.is_active ? 'Deactivate' : 'Activate'}</button>
                      )}
                    </>}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <Pagination meta={meta} onPage={list.setPage} onPerPage={list.setPerPage} noun="records" busy={loading} />
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
                {editing?.role === 'resident' && (
                  <label>Barangay <span className="pf-optional">(correct it if it is wrong)</span>
                    <select value={form.barangay} onChange={(e) => setForm({ ...form, barangay: e.target.value })} required>
                      <option value="">Select barangay…</option>
                      {barangays?.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </label>
                )}
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
              {unchanged && <span className="no-change-hint">No changes yet. Edit a detail to save.</span>}
              <button type="button" className="btn btn-outline" onClick={() => setForm(null)}>Cancel</button>
              <button className="btn" disabled={busy || unchanged} title={unchanged ? 'Nothing was changed' : undefined}>{busy ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </Modal>
      )}

      {fixing && (
        <Modal title="Correct resident record" onClose={() => !busy && setFixing(null)}>
          <form onSubmit={saveFix}>
            <p className="muted small">Resident ID <strong>{fixing.resident?.qr_code}</strong> · registered at the counter. Correct the name or barangay if they were entered wrong; the Resident ID and history stay the same.</p>
            <Message>{ffe.general}</Message>
            <label>Full name
              <input {...FIELD.name} value={fixForm.name} onChange={(e) => setFixForm({ ...fixForm, name: e.target.value })} maxLength={100} required {...ffe.invalid('name')} />{ffe.error('name')}
            </label>
            <label>Barangay
              <select value={fixForm.barangay} onChange={(e) => setFixForm({ ...fixForm, barangay: e.target.value })} required {...ffe.invalid('barangay')}>
                <option value="">Select barangay…</option>
                {barangays?.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>{ffe.error('barangay')}
            </label>
            <div className="modal-actions">
              {!fixChanges.length && <span className="no-change-hint">No changes yet.</span>}
              <button type="button" className="btn btn-outline" onClick={() => setFixing(null)} disabled={busy}>Cancel</button>
              <button className="btn" disabled={busy || !fixChanges.length}>{busy ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </Modal>
      )}

      {accountFor && (
        <Modal title="Create online account" onClose={() => !busy && setAccountFor(null)}>
          <form onSubmit={createAccount}>
            <p className="muted small">
              <strong>{accountFor.name}</strong> · Resident ID <strong>{accountFor.resident?.qr_code}</strong> · {accountFor.resident?.address}
              <br />Registered at the counter. The online account uses this same record, so the Resident ID and history stay the same.
            </p>
            <Message>{afe.general}</Message>
            <label>Mobile number (for log in and SMS)
              <input type="tel" inputMode="tel" {...FIELD.mobile} value={accountForm.contact_no} onChange={(e) => setAccountForm({ ...accountForm, contact_no: e.target.value })}
                placeholder="09XXXXXXXXX" required maxLength={16} {...afe.invalid('contact_no')} />{afe.error('contact_no')}
            </label>
            <label>Gmail address (optional)
              <input type="email" {...FIELD.gmail} value={accountForm.email} onChange={(e) => setAccountForm({ ...accountForm, email: e.target.value })}
                placeholder="name@gmail.com" maxLength={255} {...afe.invalid('email')} />{afe.error('email')}
            </label>
            <p className="field-hint">A temporary password is sent only to the resident by SMS (and email if given). They choose their own password at the first log-in.</p>
            <div className="modal-actions">
              <button type="button" className="btn btn-outline" onClick={() => setAccountFor(null)} disabled={busy}>Cancel</button>
              <button className="btn" disabled={busy || !accountForm.contact_no.trim()}>{busy ? 'Creating…' : 'Create account'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
