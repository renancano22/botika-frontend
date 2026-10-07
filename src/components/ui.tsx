import { useState, type InputHTMLAttributes, type ReactNode } from 'react';

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
  available: 'Available', low_stock: 'Low stock', out_of_stock: 'Out of stock',
  near_expiry: 'Near expiry', expired: 'Expired', ok: 'OK',
  pending: 'Pending', approved: 'Approved', rejected: 'Rejected', dispensed: 'Dispensed',
  fulfilled: 'Fulfilled', cancelled: 'Cancelled', sent: 'Sent', failed: 'Failed', logged: 'Logged (no SMS key)',
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
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="card-head">
          <h2>{title}</h2>
          <button className="btn-ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Message({ type = 'error', children }: { type?: 'error' | 'success' | 'info'; children: ReactNode }) {
  if (!children) return null;
  return <div className={`msg msg-${type}`}>{children}</div>;
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

export function Loading() {
  return <p className="empty">Loading…</p>;
}
