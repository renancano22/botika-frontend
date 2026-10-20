import { ROLE_LABEL } from '../api';
import { useAuth } from '../auth';
import { Message } from '../components/ui';
import { toast } from '../components/feedback';
import ChangePasswordForm from '../components/ChangePasswordForm';

const KEY = 'M15 7a4 4 0 1 1-3.9 4.9L3 20v-3h3v-3h3l2.1-2.1A4 4 0 0 1 15 7zM16 9h.01';

/**
 * First log-in with a temporary default password (account created, or password reset, by the administrator):
 * the user must choose their own password before they can use any other part of BulanBotikaCare.
 */
export default function ChangePasswordRequired() {
  const { user, setUser, logout } = useAuth();
  if (!user) return null;
  return (
    <div className="auth-page">
      <div className="auth-card cp-card">
        <div className="brand brand-center">
          <span className="brand-mark">✚</span>
          <div><strong>BulanBotikaCare</strong><small>Botika ng Bayan · Bulan, Sorsogon</small></div>
        </div>
        <span className="cp-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={KEY} /></svg>
        </span>
        <h1>Change your temporary password</h1>
        <p className="muted cp-who">{user.name} · {ROLE_LABEL[user.role]}{user.email ? ` · ${user.email}` : ''}</p>
        <Message type="warning" title="You are using a temporary password">
          Your account was set up by the administrator with a temporary password. Create your own password to continue.
          Keep it private — no one from the Botika will ever ask for it.
        </Message>
        <ChangePasswordForm temporary submitLabel="Change password and continue" onDone={(u) => {
          toast.success('Password changed', { description: 'Your new password is saved. Welcome to BulanBotikaCare!' });
          setUser(u); // the system opens normally now
        }} />
        <p className="muted center">Not you? <button type="button" className="link-button" onClick={logout}>Log out</button></p>
      </div>
    </div>
  );
}
