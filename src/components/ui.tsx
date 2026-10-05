import type { ReactNode } from 'react';

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

export function Loading() {
  return <p className="empty">Loading…</p>;
}
