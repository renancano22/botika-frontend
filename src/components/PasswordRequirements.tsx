/** Shared live checklist for account creation and password recovery. */
export default function PasswordRequirements({ checks, id }: { checks: { ok: boolean | null; text: string; hint?: string }[]; id?: string }) {
  return <ul id={id} className="register-checks register-full" aria-label="Password requirements">
    {checks.map((check) => <li key={check.text} className={check.ok ? 'is-met' : ''} title={check.hint} aria-label={`${check.ok === null ? 'Checked on submit' : check.ok ? 'Met' : 'Needed'}: ${check.text}${check.hint ? `. ${check.hint}` : ''}`}>
      <span aria-hidden="true">{check.ok ? '✓' : '○'}</span>{check.text}
    </li>)}
  </ul>;
}
