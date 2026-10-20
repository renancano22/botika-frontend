import { useEffect, useState, type InputHTMLAttributes, type ReactNode } from 'react';

export function StatCard({ label, value, tone = 'default', hint }: {
  label: string; value: number | string; tone?: 'default' | 'warn' | 'danger' | 'ok'; hint?: string;
}) {
  return (
    <div className={`stat stat-${tone}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

const BADGE_LABEL: Record<string, string> = {
  available: 'Available', low_stock: 'Low stock', out_of_stock: 'Out of stock', unrecorded: 'Not recorded',
  near_expiry: 'Near expiry', expired: 'Expired', ok: 'OK',
  pending: 'Pending', approved: 'Approved', rejected: 'Rejected', dispensed: 'Dispensed',
  fulfilled: 'Fulfilled', cancelled: 'Cancelled', app: 'In-app only', sent: 'Sent', failed: 'Failed', logged: 'Logged (no SMS key)',
  medicine: 'Medicine', restock: 'Restock', admin: 'Administrator', staff: 'Pharmacy Staff', resident: 'Resident',
};

export function Badge({ value }: { value: string }) {
  return <span className={`badge badge-${value}`}>{BADGE_LABEL[value] ?? value}</span>;
}

export function Card({ title, actions, children }: { title?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      {(title || actions) && (
        <div className="card-head">
          {title && <h2>{title}</h2>}
          {actions && <div className="card-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  // Escape closes the window (pages ignore it while something is being saved).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="card-head">
          <h2>{title}</h2>
          <button className="btn-ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const MSG_ICON = {
  error: 'M12 8v5M12 16.5v.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  success: 'M20 6 9 17l-5-5',
  info: 'M12 16v-5M12 8v.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  warning: 'M12 9v4M12 17v.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
};

/** Message inside a page or form (errors are announced to screen readers right away). */
export function Message({ type = 'error', title, children }: { type?: 'error' | 'success' | 'info' | 'warning'; title?: string; children: ReactNode }) {
  if (!children) return null;
  return (
    <div className={`msg msg-${type}`} role={type === 'error' ? 'alert' : 'status'}>
      <svg className="msg-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={MSG_ICON[type]} />
      </svg>
      <div className="msg-text">{title && <strong>{title}</strong>}{children}</div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

/** Password box with an eye button to show or hide what was typed. */
export function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="password-field">
      <input {...props} type={visible ? 'text' : 'password'} />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        title={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? (
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
            <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </span>
  );
}

export function Loading({ text = 'Loading…' }: { text?: string }) {
  return <p className="empty loading" role="status"><span className="spinner" aria-hidden="true" /> {text}</p>;
}

/** Round profile picture, or the first letter of the name when there is no picture. */
export function Avatar({ name, photo, size = 38 }: { name: string; photo?: string | null; size?: number }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) };
  return photo
    ? <img className="avatar" src={photo} alt="" style={style} />
    : <span className="avatar avatar-letter" style={style} aria-hidden="true">{name.trim().charAt(0).toUpperCase() || '?'}</span>;
}
