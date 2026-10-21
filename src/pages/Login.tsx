import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { SESSION_NOTICE_KEY } from '../api';
import { useAuth } from '../auth';
import { Message, PasswordInput } from '../components/ui';
import { toast, useFormErrors } from '../components/feedback';

export default function Login() {
  const { login: signIn } = useAuth();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const fe = useFormErrors(['login', 'password'], { summary: false });
  const [busy, setBusy] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // One short pop-up message (outside the card, it closes by itself): after logging out, after the session
  // expired, or after a new password was set on the Forgot Password page. Shown once, not again on refresh.
  useEffect(() => {
    let session = '';
    try {
      session = sessionStorage.getItem(SESSION_NOTICE_KEY) ?? '';
      sessionStorage.removeItem(SESSION_NOTICE_KEY);
    } catch { /* storage blocked */ }
    const notice = (location.state as { notice?: string } | null)?.notice;
    if (notice) {
      toast.success('Password changed', { description: notice });
      navigate(location.pathname, { replace: true, state: null });
    } else if (session === 'logged_out') {
      toast.success('Logged out', { description: 'You have safely logged out of BulanBotikaCare.' });
    } else if (session === 'expired') {
      toast.warning('Session expired', { description: 'For your security, you were logged out. Please log in again to continue.' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
