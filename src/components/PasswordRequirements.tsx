/** Shared live checklist for account creation and password recovery. */
export default function PasswordRequirements({ checks, id }: { checks: { ok: boolean; text: string }[]; id?: string }) {
  return <ul id={id} className="register-checks register-full" aria-label="Password requirements">
    {checks.map((check) => <li key={check.text} className={check.ok ? 'is-met' : ''} aria-label={`${check.ok ? 'Met' : 'Needed'}: ${check.text}`}>
      <span aria-hidden="true">{check.ok ? '✓' : '○'}</span>{check.text}
    </li>)}
  </ul>;
}
