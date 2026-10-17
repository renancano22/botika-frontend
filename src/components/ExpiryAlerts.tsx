import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api, formatDate } from '../api';
import type { Alerts, InventoryBatch } from '../types';
import { ICONS, quantityText, Svg } from './RequestCards';

/** Whole days from today until the expiration date (0 = expires today, negative = already expired). */
export function daysUntil(date: string): number {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((new Date(y, m - 1, d).getTime() - start.getTime()) / 86400000);
}

export function expiryText(b: InventoryBatch): string {
  const days = daysUntil(b.expiration_date);
  if (days < 0) return `expired on ${formatDate(b.expiration_date)}`;
  if (days === 0) return 'expires today';
  return `expires in ${days} day${days === 1 ? '' : 's'} (${formatDate(b.expiration_date)})`;
}

/** Near-expiry and expired batches for admin and staff, refreshed every minute. */
export function useStockAlerts() {
  const [alerts, setAlerts] = useState<Alerts | null>(null);
  const load = useCallback(async () => {
    try { setAlerts((await api.get<Alerts>('/inventory/alerts')).data); } catch { /* keep the last result */ }
  }, []);
  useEffect(() => {
    load();
    const id = window.setInterval(load, 60000);
    return () => window.clearInterval(id);
  }, [load]);
  return alerts;
}

/** One alert; tapping it opens that exact batch in Stock & Batches (filtered and highlighted). */
function BatchLine({ b, expired, onOpen }: { b: InventoryBatch; expired: boolean; onOpen?: () => void }) {
  return (
    <li>
      <Link to={`/inventory?expiry=${expired ? 'expired' : 'near_expiry'}&batch=${b.inventory_id}`} onClick={onOpen}
        className={`expiry-item expiry-link ${expired ? 'k-rejected' : 'k-reminder'}`} title="View this batch in Stock & Batches">
        <span className="expiry-icon kicon"><Svg d={expired ? ICONS.x : ICONS.clock} size={18} width={2.2} /></span>
        <span className="expiry-text">
          <strong>{b.medicine.medicine_name}</strong>
          <span>{quantityText(b.quantity, b.medicine.unit)} · batch #{b.inventory_id}</span>
          <span className="expiry-when">{expiryText(b)}</span>
        </span>
        <span className="expiry-go" aria-hidden="true"><Svg d={ICONS.chevron} size={18} width={2.4} /></span>
      </Link>
    </li>
  );
}

/**
 * Top-bar warning bell for admin and staff: shows how many batches expire within 1 month
 * (or have already expired) and lists them.
 */
export function ExpiryBell() {
  const alerts = useStockAlerts();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const near = alerts?.near_expiry ?? [];
  const expired = alerts?.expired ?? [];
  const count = near.length + expired.length;

  useEffect(() => { setOpen(false); }, [location.pathname, location.search]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="bell" ref={ref}>
      <button type="button" className="topbar-icon" onClick={() => setOpen(!open)} aria-expanded={open}
        aria-label={count ? `Expiry alerts, ${count} batches` : 'Expiry alerts'} title="Expiry alerts">
        <Svg d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4" size={22} width={1.8} />
        {count > 0 && <span className="bell-badge">{count > 99 ? '99+' : count}</span>}
      </button>
      {open && (
        <div className="bell-panel" role="dialog" aria-label="Expiry alerts">
          <div className="bell-head"><strong>Expiry alerts</strong></div>
          {!alerts ? <p className="empty">Loading…</p> : count === 0 ? (
            <p className="empty">No medicine will expire within 1 month.</p>
          ) : (
            <ul className="expiry-list">
              {expired.map((b) => <BatchLine key={b.inventory_id} b={b} expired onOpen={() => setOpen(false)} />)}
              {near.map((b) => <BatchLine key={b.inventory_id} b={b} expired={false} onOpen={() => setOpen(false)} />)}
            </ul>
          )}
          <Link to="/inventory" className="bell-all" onClick={() => setOpen(false)}>Open Stock &amp; Batches</Link>
        </div>
      )}
    </div>
  );
}

/** Warning banner on the admin/staff dashboard when batches will expire within 1 month. */
export function ExpiryBanner({ alerts }: { alerts: Alerts }) {
  const near = alerts.near_expiry;
  const expired = alerts.expired;
  if (near.length + expired.length === 0) return null;
  const shown = [...expired, ...near].slice(0, 4);

  return (
    <section className={`expiry-banner ${expired.length ? 'k-rejected' : 'k-reminder'}`} role="alert">
      <div className="expiry-banner-head">
        <span className="expiry-banner-icon kicon"><Svg d={ICONS.clock} size={24} width={2.2} /></span>
        <div>
          <strong>
            {near.length > 0 && `${near.length} batch${near.length === 1 ? '' : 'es'} will expire within 1 month`}
            {near.length > 0 && expired.length > 0 && ' · '}
            {expired.length > 0 && `${expired.length} expired batch${expired.length === 1 ? '' : 'es'} still in stock`}
          </strong>
          <p>Dispense these first or remove expired items from stock.</p>
        </div>
      </div>
      <ul className="expiry-list">
        {shown.map((b) => <BatchLine key={b.inventory_id} b={b} expired={expired.includes(b)} />)}
      </ul>
      <div className="expiry-banner-foot">
        {near.length + expired.length > shown.length && <span className="muted small">+{near.length + expired.length - shown.length} more</span>}
        <Link to="/inventory" className="btn btn-sm">View in Stock &amp; Batches</Link>
      </div>
    </section>
  );
}
