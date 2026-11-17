import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { useApi } from '../hooks';
import { Message, PasswordInput } from '../components/ui';
import { FieldError, LoadError, toast, useFormErrors } from '../components/feedback';
import { FIELD } from '../validation';
import { normalizeRegistration, registrationPasswordChecks, validateRegistration, type RegistrationForm } from '../registration';
import PasswordRequirements from '../components/PasswordRequirements';

export default function Register() {
  const { register } = useAuth();
  const { data: barangays, errorInfo: barangayError, reload: reloadBarangays } = useApi<string[]>('/barangays');
  const [form, setForm] = useState<RegistrationForm>({
    name: '', barangay: '', address_line: '', contact_no: '', email: '', password: '', password_confirmation: '',
  });
  const fe = useFormErrors(['name', 'barangay', 'address_line', 'contact_no', 'email', 'password', 'password_confirmation']);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [touched, setTouched] = useState<Partial<Record<keyof RegistrationForm, boolean>>>({});
  const validation = validateRegistration(form, barangays);
  const checks = registrationPasswordChecks(form);
  const problem = (key: keyof RegistrationForm) => fe.fields[key] || (touched[key] ? validation[key] : undefined);
  const fieldProps = (key: keyof RegistrationForm) => ({
    onBlur: () => setTouched((old) => ({ ...old, [key]: true })),
    'aria-invalid': problem(key) ? true as const : undefined,
    'aria-describedby': [key === 'name' ? 'register-name-help' : '', problem(key) ? `err-${key}` : ''].filter(Boolean).join(' ') || undefined,
  });
  const fieldError = (key: keyof RegistrationForm) => <FieldError message={problem(key)} id={`err-${key}`} />;
  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [k]: e.target.value });
    fe.clear(k);
    fe.setGeneral('');
    if (k === 'password') fe.clear('password_confirmation');
    if (k === 'name' || k === 'email' || k === 'contact_no') fe.clear('password');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting.current) return;
    fe.clear();
    setTouched(Object.fromEntries(Object.keys(form).map((key) => [key, true])));
    if (Object.keys(validation).length) {
      fe.setFieldErrors(validation as Record<string, string>);
      return;
    }
    submitting.current = true;
    setBusy(true);
    try {
      await register({ ...normalizeRegistration(form) });
      toast.success('Account created', { description: 'Welcome to BulanBotikaCare! You are now logged in.' });
    } catch (err) {
      fe.fromError(err);
    } finally {
      setBusy(false);
      submitting.current = false;
    }
  };

  return (
    <div className="auth-page auth-page--register">
      <div className="auth-shell auth-shell--register auth-shell--animated">
        <header className="auth-header">
          <h1 id="register-title">Resident Registration</h1>
          <p className="muted" id="register-intro">Create your resident account to request medicines and keep track of your requests.</p>
        </header>
      <form className="auth-card auth-card--focused register-card" onSubmit={submit} aria-labelledby="register-title" aria-describedby="register-intro" noValidate>
        <div className="register-card-heading">
          <p>Fields marked <span className="register-required">*</span> are required.</p>
        </div>
        <Message>{fe.general}</Message>
        <LoadError error={barangayError} onRetry={() => reloadBarangays()} />

        <fieldset className="register-fields" disabled={busy}>
        <section className="register-section" aria-labelledby="register-personal">
          <h2 id="register-personal"><span>01</span> Personal details</h2>
          <p className="register-section-hint">Check your name and barangay carefully. They are fixed after registration.</p>
          <div className="register-grid">
        <label className="register-full"><span>Full name <span className="register-required" aria-hidden="true">*</span></span>
          <input value={form.name} onChange={set('name')} autoComplete="name" placeholder="e.g. Juan Miguel Santos Cruz" required maxLength={100} {...FIELD.name} {...fieldProps('name')} />
          <span className="field-hint" id="register-name-help">Enter your first name, middle name (if any), and last name as shown on your ID. Write out your first and last names.</span>
          {fieldError('name')}
        </label>

        <label><span>Barangay <span className="register-required" aria-hidden="true">*</span></span>
          <select value={form.barangay} onChange={set('barangay')} required disabled={!barangays?.length} {...fieldProps('barangay')}>
            <option value="">{barangays ? 'Select your barangay…' : 'Loading barangays…'}</option>
            {barangays?.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          {fieldError('barangay')}
        </label>
        <label><span>Street / Purok <span className="register-optional">(optional)</span></span>
          <input value={form.address_line} onChange={set('address_line')} maxLength={120} placeholder="e.g. Purok 3, Rizal St." autoComplete="address-line1" {...fieldProps('address_line')} />
          {fieldError('address_line')}
        </label>
          </div>
        </section>

        <section className="register-section" aria-labelledby="register-contact">
          <h2 id="register-contact"><span>02</span> Contact information</h2>
          <div className="register-grid">
        <label><span>Mobile number <span className="register-required" aria-hidden="true">*</span></span>
          <input type="tel" inputMode="tel" value={form.contact_no} onChange={set('contact_no')} placeholder="09XXXXXXXXX" autoComplete="tel" required maxLength={24} {...fieldProps('contact_no')} />
          <span className="field-hint">Used for log in and SMS updates.</span>
          {fieldError('contact_no')}
        </label>
        <label><span>Gmail address <span className="register-optional">(optional)</span></span>
          <input type="email" value={form.email} onChange={set('email')} placeholder="name@gmail.com" autoComplete="email" maxLength={255} {...FIELD.gmail} {...fieldProps('email')} />
          {fieldError('email')}
          <span className="field-hint">You can also use this to log in.</span>
        </label>
          </div>
        </section>

        <section className="register-section" aria-labelledby="register-security">
          <h2 id="register-security"><span>03</span> Account security</h2>
          <div className="register-grid">
          <label><span>Password <span className="register-required" aria-hidden="true">*</span></span>
            <PasswordInput value={form.password} onChange={set('password')} autoComplete="new-password" required maxLength={100} {...FIELD.password} {...fieldProps('password')} />
            {fieldError('password')}
          </label>
          <label><span>Confirm password <span className="register-required" aria-hidden="true">*</span></span>
            <PasswordInput value={form.password_confirmation} onChange={set('password_confirmation')} autoComplete="new-password" required maxLength={100} {...fieldProps('password_confirmation')} />
            {fieldError('password_confirmation')}
          </label>
        <PasswordRequirements checks={checks} />
          </div>
        </section>
        </fieldset>

        <div className="register-actions">
        <p className="muted auth-footer"><span>Already registered?</span> <Link to="/login">Log in</Link></p>
        <button className="btn" disabled={busy || !barangays?.length} aria-busy={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
        </div>
      </form>
      </div>
    </div>
  );
}
