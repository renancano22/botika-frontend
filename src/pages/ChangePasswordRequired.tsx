import { ROLE_LABEL } from '../api';
import { useAuth } from '../auth';
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
    <div className="auth-page cp-required-page">
      <div className="auth-card auth-card--focused cp-card cp-required-card">
        <header className="cp-heading">
        <span className="cp-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={KEY} /></svg>
        </span>
        <h1 id="temporary-password-title">Create your own password</h1>
        <p className="muted cp-who">{user.name}<span>{ROLE_LABEL[user.role]}</span></p>
        </header>
        <p className="cp-intro">Replace the temporary password from your administrator to secure your account and continue.</p>
        <ChangePasswordForm temporary submitLabel="Save and continue" onDone={(u) => {
          toast.success('Password changed', { description: 'Your new password is saved. Welcome to BulanBotikaCare!' });
          setUser(u); // the system opens normally now
        }} />
        <p className="muted auth-footer">Not you? <button type="button" className="link-button" onClick={logout}>Log out</button></p>
      </div>
    </div>
  );
}
