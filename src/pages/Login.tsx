import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../api';
import { useAuth } from '../auth';
import { Message, PasswordInput } from '../components/ui';

export default function Login() {
  const { login: signIn } = useAuth();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signIn(login, password);
    } catch (err) {
      setError(errorMessage(err));
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
        <Message>{error}</Message>
        <label>Email or mobile number
          <input value={login} onChange={(e) => setLogin(e.target.value)} placeholder="name@email.com or 09XXXXXXXXX" autoComplete="username" required autoFocus />
        </label>
        <label>Password<PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>
        <button className="btn" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
        <p className="muted center">Resident without an account? <Link to="/register">Register here</Link></p>
      </form>
    </div>
  );
}
