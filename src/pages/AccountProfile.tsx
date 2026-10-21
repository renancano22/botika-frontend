import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api, formatDate, ROLE_LABEL } from '../api';
import { useAuth } from '../auth';
import { Avatar, Message, PasswordInput } from '../components/ui';
import { Svg } from '../components/RequestCards';
import BackButton from '../components/BackButton';
import { confirmAction, toast, useFormErrors } from '../components/feedback';
import type { User } from '../types';
import { FIELD, passwordHasPersonalInfo } from '../validation';
import { jumpToTop } from '../scroll';

const ICON = {
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
  shield: 'M12 3 4 6v6c0 5 3.4 8.3 8 9 4.6-.7 8-4 8-9V6z',
  key: 'M15 7a4 4 0 1 1-3.9 4.9L3 20v-3h3v-3h3l2.1-2.1A4 4 0 0 1 15 7zM16 9h.01',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  save: 'M5 3h11l3 3v15H5zM8 3v5h7V3M8 21v-7h8v7',
  check: 'M5 12l5 5L20 7',
  dot: 'M12 12h.01',
};

const EMPTY_PW = { current_password: '', password: '', password_confirmation: '' };

function SummaryRow({ icon, label, children }: { icon: string; label: string; children: ReactNode }) {
  return (
    <div className="fb-sum">
      <Svg d={icon} size={18} />
      <span><small>{label}</small><b>{children}</b></span>
    </div>
  );
}

/**
 * My Profile for the administrator and pharmacy staff (same design as the resident's):
 * view, and Edit Profile (?edit=1) with Personal Information and a Change Password section that is closed
 * by default. Saving uses the agreed password rules (current password, password policy, other devices
 * logged out). The email address is the username, so it is changed only by the administrator.
 */
export default function AccountProfile() {
  const { user, setUser } = useAuth();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const editing = params.get('edit') === '1';

  const [name, setName] = useState('');
  const [pw, setPw] = useState(EMPTY_PW);
  const [pwOpen, setPwOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const fe = useFormErrors(['name', 'current_password', 'password', 'password_confirmation']);

  // Every time Edit Profile opens it starts from the saved name, with the password closed and empty.
  useEffect(() => {
    setName(user?.name ?? '');
    setPw(EMPTY_PW);
    setPwOpen(false);
    fe.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, user?.user_id]);

  if (!user) return null;
  const isAdmin = user.role === 'admin';

  const openEdit = () => { setParams({ edit: '1' }, { state: { fromProfile: true } }); jumpToTop(); };
  const closeEdit = () => {
    if ((location.state as { fromProfile?: boolean } | null)?.fromProfile) navigate(-1);
    else setParams({}, { replace: true });
    jumpToTop();
  };

  const wantsPassword = pwOpen && !!(pw.current_password || pw.password || pw.password_confirmation);
  const pwChecks = [
    { ok: pw.password.length >= 8, text: 'At least 8 characters' },
    { ok: /[A-Za-z]/.test(pw.password) && /\d/.test(pw.password), text: 'Has letters and numbers' },
    { ok: pw.password !== '' && !passwordHasPersonalInfo(pw.password, [name, user.name, user.email]), text: 'No name, email or "Botika"' },
    { ok: pw.password !== '' && pw.password !== pw.current_password, text: 'Different from your current password' },
    { ok: pw.password !== '' && pw.password === pw.password_confirmation, text: 'New password and confirmation match' },
  ];
  const setPwField = (k: keyof typeof pw) => (e: { target: { value: string } }) => { setPw({ ...pw, [k]: e.target.value }); fe.clear(k); };
  const togglePassword = () => {
    if (pwOpen) setPw(EMPTY_PW); // closing keeps the current password
    setPwOpen(!pwOpen);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    fe.clear();
    const cleanName = name.trim().replace(/\s+/g, ' ');
    if (wantsPassword) {
      if (!pw.current_password) return fe.setFieldErrors({ current_password: 'Enter your current password to change your password.' });
      if (!pwChecks.every((c) => c.ok)) return fe.setFieldErrors({ password: 'The new password does not meet the requirements below.' });
    }
    if (pwOpen && !wantsPassword && cleanName === user.name) {
      // Change Password is open but empty: say what to do instead of "nothing to save".
      return fe.setFieldErrors({ current_password: 'Enter your current password and a new password, or tap "Don\'t change" to keep your current password.' });
    }
    if (cleanName === user.name && !wantsPassword) {
      toast.info('Nothing to save', { description: 'You have not made any changes. Edit your name or change your password, then save.' });
      return;
    }

    const changes = [...(cleanName !== user.name ? ['Full name'] : []), ...(wantsPassword ? ['Password'] : [])];
    await confirmAction({
      title: 'Save changes to your profile?',
      message: <>These will be updated: <strong>{changes.join(' and ')}</strong>.</>,
      details: wantsPassword ? 'Use your new password the next time you log in. Other phones or computers logged in to your account will be logged out.' : undefined,
      confirmLabel: 'Confirm and Save',
      busyLabel: 'Saving…',
      onConfirm: async () => {
        setSaving(true);
        try {
          const body: Record<string, string> = { name: cleanName };
          if (wantsPassword) Object.assign(body, pw);
          const res = await api.put<{ user: User; password_changed: boolean }>('/account', body);
          setUser(res.data.user);
          toast.success('Profile updated', {
            description: res.data.password_changed ? 'Your profile and password were updated. Other devices were logged out.' : 'Your changes were saved.',
          });
          closeEdit();
        } catch (err) {
          fe.fromError(err); // shown next to the fields; nothing was saved
        } finally { setSaving(false); }
      },
    });
  };

  // ------------------------------------------------------------------ Edit Profile
  if (editing) {
    return (
      <div className="page pf-page fb-edit">
        <BackButton onClick={closeEdit} label="Back to My Profile" />
        <header className="fb-top"><div><h1>Edit Profile</h1></div></header>
        <Message>{fe.general}</Message>

        <form onSubmit={submit} className="fb-form">
          <section className="card fb-sec">
            <div className="fb-sec-head">
              <h2><span className="fb-sec-icon"><Svg d={ICON.user} size={17} /></span>Personal Information</h2>
            </div>
            <div className="fb-sec-body pf-fields">
              <label className="pf-field-wide">Full Name
                <input value={name} onChange={(e) => { setName(e.target.value); fe.clear('name'); }} autoComplete="name" required maxLength={100} {...FIELD.name} {...fe.invalid('name')} />
                {fe.error('name')}
              </label>
              <label><span>Email Address <span className="pf-optional">(your username)</span></span>
                <input value={user.email ?? ''} readOnly disabled />
                <span className="field-hint">{isAdmin ? 'Change it in User Accounts.' : 'Ask the administrator to change it.'}</span>
              </label>
              <label>Role
                <input value={ROLE_LABEL[user.role]} readOnly disabled />
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
                  <PasswordInput value={pw.current_password} onChange={setPwField('current_password')} autoComplete="current-password" maxLength={100} autoFocus {...fe.invalid('current_password')} />
                  {fe.error('current_password')}
                </label>
                <label>New Password
                  <PasswordInput value={pw.password} onChange={setPwField('password')} autoComplete="new-password" maxLength={100} {...fe.invalid('password')} />
                  {fe.error('password')}
                </label>
                <label>Confirm New Password
                  <PasswordInput value={pw.password_confirmation} onChange={setPwField('password_confirmation')} autoComplete="new-password" maxLength={100} {...fe.invalid('password_confirmation')} />
                  {fe.error('password_confirmation')}
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

          <p className="fb-fixed-note muted small">Your email address, role and account creation date cannot be changed here.</p>

          <div className="fb-actions">
            <button className="btn btn-lg" disabled={saving}><Svg d={ICON.save} size={18} /> {saving ? 'Saving…' : 'Save Changes'}</button>
            <button type="button" className="btn btn-outline btn-lg" onClick={closeEdit} disabled={saving}>Cancel</button>
          </div>
        </form>
      </div>
    );
  }

  // ------------------------------------------------------------------ My Profile
  return (
    <div className="page pf-page fb-page">
      <BackButton linkedOnly />
      <header className="fb-top"><div><h1>My Profile</h1></div></header>

      <div className="fb-form fb-view">
        <section className="card fb-sec fb-photo-sec">
          <div className="fb-avatar-wrap"><span className="fb-avatar"><Avatar name={user.name} size={128} /></span></div>
          <div className="fb-who">
            <strong>{user.name}</strong>
            <small className="fb-rid">{ROLE_LABEL[user.role]}</small>
            <small>Account created {formatDate(user.created_at)}</small>
          </div>
        </section>

        <section className="card fb-sec">
          <div className="fb-sec-head"><h2><span className="fb-sec-icon"><Svg d={ICON.user} size={17} /></span>Personal Information</h2></div>
          <div className="fb-sec-summary">
            <SummaryRow icon={ICON.user} label="Full name">{user.name}</SummaryRow>
            <SummaryRow icon={ICON.mail} label="Email address (username)">{user.email || <span className="muted">Not added</span>}</SummaryRow>
            <SummaryRow icon={ICON.shield} label="Role">{ROLE_LABEL[user.role]}</SummaryRow>
          </div>
        </section>

        <div className="fb-actions">
          <button type="button" className="btn btn-lg" onClick={openEdit}><Svg d={ICON.edit} size={18} /> Edit Profile</button>
        </div>
      </div>
    </div>
  );
}
