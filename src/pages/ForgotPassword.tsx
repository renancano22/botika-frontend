import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { Message, PasswordInput } from '../components/ui';
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
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const sendCode = async (e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api.post<{ message: string }>('/forgot-password', { login });
      setInfo(res.data.message);
      setStep(2);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const reset = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.post('/reset-password', { login, code, password, password_confirmation: confirm });
      navigate('/login', { replace: true, state: { notice: 'Your password has been changed. You can now log in.' } });
    } catch (err) {
      setError(errorMessage(err));
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
          <Message>{error}</Message>
          <label>Email or mobile number
            <input value={login} onChange={(e) => setLogin(e.target.value)} placeholder="name@gmail.com or 09XXXXXXXXX" autoComplete="username" required autoFocus />
          </label>
          <button className="btn" disabled={busy}>{busy ? 'Sending code…' : 'Send code'}</button>
          <p className="muted center"><Link to="/login">Back to log in</Link></p>
        </form>
      ) : (
        <form className="auth-card" onSubmit={reset}>
          <h1>Reset password</h1>
          <Message type="info">{info}</Message>
          <Message>{error}</Message>
          <label>6-digit code
            <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric" autoComplete="one-time-code" placeholder="123456" required maxLength={6} {...FIELD.code} autoFocus />
          </label>
          <label>New password
            <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required {...FIELD.password} />
          </label>
          <label>Confirm new password
            <PasswordInput value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
          </label>
          <p className="field-hint">At least 8 characters, with at least one letter and one number.</p>
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
