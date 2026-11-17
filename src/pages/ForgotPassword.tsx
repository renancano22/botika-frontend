import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Message, PasswordInput } from '../components/ui';
import { confirmSave, useFormErrors } from '../components/feedback';
import { FIELD } from '../validation';
import { passwordRequirementChecks } from '../registration';
import PasswordRequirements from '../components/PasswordRequirements';
import { clearResetDraft, readResetDraft, saveResetDraft } from '../authDrafts';

/**
 * Forgot password (for admin, staff and residents):
 *  step 1 - enter email or mobile number, a 6-digit code is sent by SMS or email
 *  step 2 - enter the code and a new password
 */
export default function ForgotPassword() {
  const navigate = useNavigate();
  const [draft] = useState(() => readResetDraft());
  const [step, setStep] = useState<1 | 2>(draft.requestedAt !== null ? 2 : 1);
  const [login, setLogin] = useState(draft.login);
  const [requestedAt, setRequestedAt] = useState<number | null>(draft.requestedAt);
  useEffect(() => { saveResetDraft(login, requestedAt); }, [login, requestedAt]);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [info, setInfo] = useState(draft.requestedAt !== null
    ? 'Your reset progress was restored. Re-enter the code already sent and your new password. Codes expire 10 minutes after they are requested.' : '');
  const fe = useFormErrors(['login', 'code', 'password', 'password_confirmation']);
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState<{ key: string; expiresAt: number } | null>(null);
  const [checking, setChecking] = useState(false);
  const [policyFailed, setPolicyFailed] = useState(false);
  const [blockedCode, setBlockedCode] = useState<string | null>(null);
  const [checkError, setCheckError] = useState('');
  const [retryCheck, setRetryCheck] = useState(0);
  const mobile = login.trim().replace(/[\s()-]/g, '').replace(/^\+?63(?=9\d{9}$)/, '0');
  const checks = passwordRequirementChecks(password, confirm, [login, mobile]);
  const candidateKey = JSON.stringify([login, code, password, confirm]);
  const codeIdentity = JSON.stringify([login, code]);
  const latestKey = useRef(candidateKey);
  latestKey.current = candidateKey;
  const locallyValid = checks.every((check) => check.ok);
  const serverVerified = verified?.key === candidateKey && verified.expiresAt > Date.now();
  const displayedChecks = checks.map((check, index) => index === 3 && check.ok
    ? { ...check, ok: serverVerified ? true : policyFailed ? false : null,
      hint: 'Your reset code is required to verify that the password does not contain your registered details.' }
    : check);

  useEffect(() => {
    setVerified(null);
    setPolicyFailed(false);
    setCheckError('');
    if (step !== 2 || !locallyValid || !/^\d{6}$/.test(code) || blockedCode === codeIdentity) {
      setChecking(false);
      return;
    }
    let active = true;
    const controller = new AbortController();
    setChecking(true);
    const timer = window.setTimeout(async () => {
      try {
        const { data } = await api.post<{ valid: boolean; code_expires_at: string }>('/reset-password/check',
          { login, code, password, password_confirmation: confirm }, { signal: controller.signal });
        if (!active || latestKey.current !== candidateKey) return;
        const expiresAt = Date.parse(data.code_expires_at);
        if (data.valid !== true || !Number.isFinite(expiresAt)) throw new Error('Password check could not be completed.');
        if (expiresAt <= Date.now()) {
          setBlockedCode(codeIdentity);
          fe.setFieldErrors({ code: 'This code has expired. Please request a new one.' });
          return;
        }
        setVerified({ key: candidateKey, expiresAt });
        fe.clear('password'); fe.clear('password_confirmation'); fe.clear('code'); fe.setGeneral('');
      } catch (err) {
        if (!active || controller.signal.aborted || latestKey.current !== candidateKey) return;
        const fields = (err as { response?: { data?: { errors?: Record<string, string[]> } } }).response?.data?.errors;
        if (fields) {
          if (fields.code) setBlockedCode(codeIdentity);
          setPolicyFailed(!!fields.password);
          fe.fromError(err);
        } else setCheckError('Unable to check your password right now. Please try again.');
      } finally { if (active) setChecking(false); }
    }, 650);
    return () => { active = false; window.clearTimeout(timer); controller.abort(); };
  }, [step, candidateKey, locallyValid, blockedCode, retryCheck]); // Each result applies only to the exact current inputs.

  useEffect(() => {
    if (!verified) return;
    const timer = window.setTimeout(() => {
      setVerified(null); setBlockedCode(codeIdentity);
      fe.setFieldErrors({ code: 'This code has expired. Please request a new one.' });
    }, Math.max(0, verified.expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [verified]);

  const canSave = locallyValid && serverVerified && !checking && !busy;

  const sendCode = async (e?: FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    if (step === 2) { setCode(''); setVerified(null); setBlockedCode(null); }
    setBusy(true);
    fe.clear();
    try {
      const res = await api.post<{ message: string }>('/forgot-password', { login });
      setRequestedAt(Date.now());
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
    if (!canSave) {
      fe.setGeneral('Wait until all password requirements are checked before saving.');
      return;
    }
    const payload = { login, code, password, password_confirmation: confirm };
    if (!(await confirmSave({
      title: 'Change your password?',
      message: 'Your old password will no longer work. Use the new password the next time you log in.',
      details: 'Phones or computers logged in to your account will be logged out.',
    }))) return;
    if (latestKey.current !== candidateKey || !verified || verified.expiresAt <= Date.now()) {
      fe.setGeneral('Your details changed or the code expired. Please wait for the checks to finish.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/reset-password', payload);
      clearResetDraft();
      navigate('/login', { replace: true, state: { notice: 'Your password has been changed. You can now log in with your new password.' } });
    } catch (err) {
      setVerified(null);
      const fields = (err as { response?: { data?: { errors?: Record<string, string[]> } } }).response?.data?.errors;
      if (fields?.code) setBlockedCode(codeIdentity);
      setPolicyFailed(!!fields?.password);
      if (!fields) setCheckError('Please check your password again before retrying the change.');
      fe.fromError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`auth-page ${step === 1 ? 'auth-page--compact' : 'auth-page--reset'}`}>
      <div className={`auth-shell auth-shell--animated${step === 2 ? ' auth-shell--register auth-shell--reset' : ''}`} key={step}>
        <header className="auth-header">
          <h1 id="auth-title">{step === 1 ? 'Forgot password' : 'Reset password'}</h1>
          {step === 1
            ? <p className="muted">Enter your account's email or mobile number. We'll send a 6-digit code to reset your password.</p>
            : <p className="muted" role="status">{info}</p>}
        </header>
      {step === 1 ? (
        <form className="auth-card auth-card--focused" onSubmit={sendCode} aria-labelledby="auth-title">
          <Message>{fe.general}</Message>
          {draft.expired && <p className="field-hint" role="status">Your previous code has expired. Request a new code to continue.</p>}
          <label>Email or mobile number
            <input value={login} onChange={(e) => { setLogin(e.target.value); fe.clear('login'); fe.setGeneral(''); }} placeholder="Email or mobile number" autoComplete="username" required {...fe.invalid('login')} />
            {fe.error('login')}
          </label>
          <button className="btn" disabled={busy}>{busy ? 'Sending code…' : 'Send code'}</button>
          <p className="muted auth-footer"><Link to="/login">Back to log in</Link></p>
        </form>
      ) : (
        <form className="auth-card auth-card--focused register-card reset-card" onSubmit={reset} aria-labelledby="auth-title">
          <Message>{fe.general}</Message>
          <fieldset className="register-fields" disabled={busy}>
          <section className="register-section" aria-label="Verification code">
          <div className="register-grid">
          <label className="register-full"><span>6-digit code <span className="register-required" aria-hidden="true">*</span></span>
            <input value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setBlockedCode(null); fe.clear('code'); fe.setGeneral(''); }}
              inputMode="numeric" autoComplete="one-time-code" placeholder="123456" required maxLength={6} {...FIELD.code} {...fe.invalid('code')} />
            {fe.error('code')}
          </label>
          </div>
          </section>
          <section className="register-section" aria-label="Account security">
          <div className="register-grid">
          <label><span>New password <span className="register-required" aria-hidden="true">*</span></span>
            <PasswordInput value={password} onChange={(e) => { setPassword(e.target.value); fe.clear('password'); fe.clear('password_confirmation'); fe.setGeneral(''); }} autoComplete="new-password" required maxLength={100} aria-describedby="reset-password-rules" {...FIELD.password} {...fe.invalid('password')} />
            {fe.error('password')}
          </label>
          <label><span>Confirm new password <span className="register-required" aria-hidden="true">*</span></span>
            <PasswordInput value={confirm} onChange={(e) => { setConfirm(e.target.value); fe.clear('password_confirmation'); fe.setGeneral(''); }} autoComplete="new-password" required maxLength={100} aria-describedby="reset-password-rules" {...fe.invalid('password_confirmation')} />
            {fe.error('password_confirmation')}
          </label>
          <PasswordRequirements checks={displayedChecks} id="reset-password-rules" />
          {checking && <p className="field-hint register-full reset-check-status" role="status">Checking all password requirements…</p>}
          {locallyValid && code.length !== 6 && <p className="field-hint register-full reset-check-status">Enter the 6-digit code to finish checking your password.</p>}
          {checkError && <p className="field-hint register-full reset-check-status" role="status">{checkError} <button type="button" className="link-button" onClick={() => setRetryCheck((old) => old + 1)}>Check again</button></p>}
          </div>
          </section>
          </fieldset>
          <div className="register-actions">
          <p className="muted auth-footer auth-footer--stacked">
            <span>Didn't get a code? <button type="button" className="link-button" onClick={() => sendCode()} disabled={busy}>Send again</button></span>
            <Link to="/login">Back to log in</Link>
          </p>
          <button className="btn" disabled={!canSave}>{busy ? 'Saving…' : checking ? 'Checking password…' : 'Change password'}</button>
          </div>
        </form>
      )}
      </div>
    </div>
  );
}
