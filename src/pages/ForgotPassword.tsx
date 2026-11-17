import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Message, PasswordInput } from '../components/ui';
import { confirmSave, useFormErrors } from '../components/feedback';
import { FIELD } from '../validation';
import { passwordRequirementChecks } from '../registration';
import PasswordRequirements from '../components/PasswordRequirements';

/**
 * Forgot password (for admin, staff and residents):
 *  step 1 - enter email or mobile number, a 6-digit code is sent by SMS or email
 *  step 2 - enter the code and a new password
 */
export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [login, setLogin] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [info, setInfo] = useState('');
  const fe = useFormErrors(['login', 'code', 'password', 'password_confirmation']);
  const [busy, setBusy] = useState(false);
  const mobile = login.trim().replace(/[\s()-]/g, '').replace(/^\+?63(?=9\d{9}$)/, '0');
  const checks = passwordRequirementChecks(password, confirm, [login, mobile], 'No login details or Botika name');

  const sendCode = async (e?: FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    setBusy(true);
    fe.clear();
    try {
      const res = await api.post<{ message: string }>('/forgot-password', { login });
      // Shown inside the card (a toast would cover the form on this page).
      setInfo(step === 2 ? `New code requested. ${res.data.message}` : res.data.message);
      setStep(2);
    } catch (err) {
      fe.fromError(err);
    } finally {
      setBusy(false);
    }
  };

  const reset = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    fe.clear();
    if (!checks[0].ok || !checks[1].ok) {
      fe.setFieldErrors({ password: 'Use 8–100 characters with at least one letter and one number.' });
      return;
    }
    if (!checks[2].ok || !checks[3].ok) {
      fe.setFieldErrors({ password: !checks[2].ok ? 'Choose a password that is not common.' : 'Do not include your login details or the name of the Botika.' });
      return;
    }
    if (password !== confirm) {
      fe.setFieldErrors({ password_confirmation: 'The two passwords do not match.' });
      return;
    }
    if (!(await confirmSave({
      title: 'Change your password?',
      message: 'Your old password will no longer work. Use the new password the next time you log in.',
      details: 'Phones or computers logged in to your account will be logged out.',
    }))) return;
    setBusy(true);
    try {
      await api.post('/reset-password', { login, code, password, password_confirmation: confirm });
      navigate('/login', { replace: true, state: { notice: 'Your password has been changed. You can now log in with your new password.' } });
    } catch (err) {
      fe.fromError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`auth-page ${step === 1 ? 'auth-page--compact' : 'auth-page--reset'}`}>
      <div className={`auth-shell auth-shell--animated${step === 2 ? ' auth-shell--reset' : ''}`} key={step}>
        <header className="auth-header">
          <h1 id="auth-title">{step === 1 ? 'Forgot password' : 'Reset password'}</h1>
          {step === 1
            ? <p className="muted">Enter your account's email or mobile number. We'll send a 6-digit code to reset your password.</p>
            : <Message type="info">{info}</Message>}
        </header>
      {step === 1 ? (
        <form className="auth-card auth-card--focused" onSubmit={sendCode} aria-labelledby="auth-title">
          <Message>{fe.general}</Message>
          <label>Email or mobile number
            <input value={login} onChange={(e) => { setLogin(e.target.value); fe.clear('login'); fe.setGeneral(''); }} placeholder="Email or mobile number" autoComplete="username" required {...fe.invalid('login')} />
            {fe.error('login')}
          </label>
          <button className="btn" disabled={busy}>{busy ? 'Sending code…' : 'Send code'}</button>
          <p className="muted auth-footer"><Link to="/login">Back to log in</Link></p>
        </form>
      ) : (
        <form className="auth-card auth-card--focused reset-card" onSubmit={reset} aria-labelledby="auth-title">
          <Message>{fe.general}</Message>
          <div className="register-grid">
          <label className="register-full">6-digit code
            <input value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); fe.clear('code'); fe.setGeneral(''); }}
              inputMode="numeric" autoComplete="one-time-code" placeholder="123456" required maxLength={6} {...FIELD.code} autoFocus {...fe.invalid('code')} />
            {fe.error('code')}
          </label>
          <label>New password
            <PasswordInput value={password} onChange={(e) => { setPassword(e.target.value); fe.clear('password'); fe.clear('password_confirmation'); fe.setGeneral(''); }} autoComplete="new-password" required maxLength={100} aria-describedby="reset-password-rules" {...FIELD.password} {...fe.invalid('password')} />
            {fe.error('password')}
          </label>
          <label>Confirm new password
            <PasswordInput value={confirm} onChange={(e) => { setConfirm(e.target.value); fe.clear('password_confirmation'); fe.setGeneral(''); }} autoComplete="new-password" required maxLength={100} aria-describedby="reset-password-rules" {...fe.invalid('password_confirmation')} />
            {fe.error('password_confirmation')}
          </label>
          <PasswordRequirements checks={checks} id="reset-password-rules" />
          <p className="field-hint register-full reset-personal-hint">Also avoid your registered name and other account details.</p>
          </div>
          <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button>
          <p className="muted auth-footer auth-footer--stacked">
            <span>Didn't get a code? <button type="button" className="link-button" onClick={() => sendCode()} disabled={busy}>Send again</button></span>
            <Link to="/login">Back to log in</Link>
          </p>
        </form>
      )}
      </div>
    </div>
  );
}
