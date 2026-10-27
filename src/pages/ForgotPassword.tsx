import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Message, PasswordInput } from '../components/ui';
import { confirmSave, useFormErrors } from '../components/feedback';
import { FIELD } from '../validation';

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
    <div className="auth-page">
      {step === 1 ? (
        <form className="auth-card" onSubmit={sendCode}>
          <h1>Forgot password</h1>
          <p className="muted">Enter the email or mobile number of your account. We'll send you a 6-digit code to reset your password.</p>
          <Message>{fe.general}</Message>
          <label>Email or mobile number
            <input value={login} onChange={(e) => { setLogin(e.target.value); fe.clear('login'); }} placeholder="name@gmail.com or 09XXXXXXXXX" autoComplete="username" required autoFocus {...fe.invalid('login')} />
            {fe.error('login')}
          </label>
          <button className="btn" disabled={busy}>{busy ? 'Sending code…' : 'Send code'}</button>
          <p className="muted center"><Link to="/login">Back to log in</Link></p>
        </form>
      ) : (
        <form className="auth-card" onSubmit={reset}>
          <h1>Reset password</h1>
          <Message type="info">{info}</Message>
          <Message>{fe.general}</Message>
          <label>6-digit code
            <input value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); fe.clear('code'); }}
              inputMode="numeric" autoComplete="one-time-code" placeholder="123456" required maxLength={6} {...FIELD.code} autoFocus {...fe.invalid('code')} />
            {fe.error('code')}
          </label>
          <label>New password
            <PasswordInput value={password} onChange={(e) => { setPassword(e.target.value); fe.clear('password'); }} autoComplete="new-password" required {...FIELD.password} {...fe.invalid('password')} />
            {fe.error('password')}
          </label>
          <label>Confirm new password
            <PasswordInput value={confirm} onChange={(e) => { setConfirm(e.target.value); fe.clear('password_confirmation'); }} autoComplete="new-password" required {...fe.invalid('password_confirmation')} />
            {fe.error('password_confirmation')}
          </label>
          <p className="field-hint">At least 8 characters with letters and numbers. Avoid common passwords and your name, email or mobile number.</p>
          <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button>
          <p className="muted center">
            Didn't get a code? <button type="button" className="link-button" onClick={() => sendCode()} disabled={busy}>Send again</button>
            {' · '}<Link to="/login">Back to log in</Link>
          </p>
        </form>
      )}
    </div>
  );
}
