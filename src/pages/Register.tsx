import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../api';
import { useAuth } from '../auth';
import { Message } from '../components/ui';

export default function Register() {
  const { register } = useAuth();
  const [form, setForm] = useState({
    name: '', address: '', contact_no: '', email: '', password: '', password_confirmation: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await register(form);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <h1>Resident Registration</h1>
        <p className="muted">Create an account to check medicine availability, submit requests and receive SMS updates.</p>
        <Message>{error}</Message>
        <label>Full name<input value={form.name} onChange={set('name')} required /></label>
        <label>Address (Barangay / Zone)<input value={form.address} onChange={set('address')} required /></label>
        <label>Mobile number (for log in and SMS updates)<input type="tel" value={form.contact_no} onChange={set('contact_no')} placeholder="09XXXXXXXXX" required /></label>
        <label>Email (optional — you can also log in with it)<input type="email" value={form.email} onChange={set('email')} /></label>
        <div className="row">
          <label>Password<input type="password" value={form.password} onChange={set('password')} minLength={8} required /></label>
          <label>Confirm password<input type="password" value={form.password_confirmation} onChange={set('password_confirmation')} minLength={8} required /></label>
        </div>
        <button className="btn" disabled={busy}>{busy ? 'Creating account…' : 'Register'}</button>
        <p className="muted center">Already registered? <Link to="/login">Log in</Link></p>
      </form>
    </div>
  );
}
