import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../api';
import { useAuth } from '../auth';
import { useApi } from '../hooks';
import { Message, PasswordInput } from '../components/ui';
import { FIELD } from '../validation';

export default function Register() {
  const { register } = useAuth();
  const { data: barangays } = useApi<string[]>('/barangays');
  const [form, setForm] = useState({
    name: '', barangay: '', address_line: '', contact_no: '', email: '', password: '', password_confirmation: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (form.password !== form.password_confirmation) {
      setError('The two passwords do not match.');
      return;
    }
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

        <label>Full name
          <input value={form.name} onChange={set('name')} autoComplete="name" required maxLength={100} {...FIELD.name} />
        </label>

        <label>Barangay (Bulan, Sorsogon)
          <select value={form.barangay} onChange={set('barangay')} required>
            <option value="">{barangays ? 'Select your barangay…' : 'Loading barangays…'}</option>
            {barangays?.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </label>
        <label>House no. / Street / Purok (optional)
          <input value={form.address_line} onChange={set('address_line')} maxLength={120} placeholder="e.g. Purok 3, Rizal St." />
        </label>

        <label>Mobile number (for log in and SMS updates)
          <input type="tel" inputMode="tel" value={form.contact_no} onChange={set('contact_no')} placeholder="09XXXXXXXXX" required maxLength={16} {...FIELD.mobile} />
        </label>
        <label>Gmail address (optional — you can also log in with it)
          <input type="email" value={form.email} onChange={set('email')} placeholder="name@gmail.com" autoComplete="email" maxLength={255} {...FIELD.gmail} />
        </label>

        <div className="row">
          <label>Password
            <PasswordInput value={form.password} onChange={set('password')} autoComplete="new-password" required {...FIELD.password} />
          </label>
          <label>Confirm password
            <PasswordInput value={form.password_confirmation} onChange={set('password_confirmation')} autoComplete="new-password" required />
          </label>
        </div>
        <p className="field-hint">Password: at least 8 characters, with at least one letter and one number.</p>

        <button className="btn" disabled={busy}>{busy ? 'Creating account…' : 'Register'}</button>
        <p className="muted center">Already registered? <Link to="/login">Log in</Link></p>
      </form>
    </div>
  );
}
