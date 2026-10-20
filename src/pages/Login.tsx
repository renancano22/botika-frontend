import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { SESSION_NOTICE_KEY } from '../api';
import { useAuth } from '../auth';
import { Message, PasswordInput } from '../components/ui';
import { useFormErrors } from '../components/feedback';

export default function Login() {
  const { login: signIn } = useAuth();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const fe = useFormErrors(['login', 'password'], { summary: false });
  const [busy, setBusy] = useState(false);
  // Message passed from the Forgot Password page after a successful reset.
  const notice = (useLocation().state as { notice?: string } | null)?.notice ?? '';
  // Shown once after the session expired (the user was logged out automatically).
  const [expired] = useState(() => {
    try { return sessionStorage.getItem(SESSION_NOTICE_KEY) === 'expired'; } catch { return false; }
  });
  useEffect(() => {
    try { sessionStorage.removeItem(SESSION_NOTICE_KEY); } catch { /* storage blocked */ }
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    fe.clear();
    try {
      await signIn(login, password);
    } catch (err) {
      fe.fromError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <div className="brand brand-center">
          <span className="brand-mark">✚</span>
          <div><strong>BulanBotikaCare</strong><small>Botika ng Bayan · Bulan, Sorsogon</small></div>
        </div>
        <h1>Log in</h1>
        <Message type="success">{notice}</Message>
        {expired && !notice && <Message type="warning" title="Session expired">For your security, you were logged out. Please log in again to continue.</Message>}
        <Message>{fe.general}</Message>
        <label>Email or mobile number
          <input value={login} onChange={(e) => { setLogin(e.target.value); fe.clear('login'); }} placeholder="name@gmail.com or 09XXXXXXXXX" autoComplete="username" required autoFocus {...fe.invalid('login')} />
          {fe.error('login')}
        </label>
        <label>Password
          <PasswordInput value={password} onChange={(e) => { setPassword(e.target.value); fe.clear('password'); }} autoComplete="current-password" required {...fe.invalid('password')} />
          {fe.error('password')}
        </label>
        <Link to="/forgot-password" className="forgot-link">Forgot password?</Link>
        <button className="btn" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
        <p className="muted center">Resident without an account? <Link to="/register">Register here</Link></p>
      </form>
    </div>
  );
}
