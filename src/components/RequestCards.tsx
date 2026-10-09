import { Link } from 'react-router-dom';
import type { MedicineRequest } from '../types';

/** Small line icons used on request and notification cards. */
export const ICONS = {
  pill: 'M10.5 20.5a5 5 0 0 1-7-7l7-7a5 5 0 0 1 7 7zM8.5 8.5l7 7',
  box: 'M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  x: 'M7 7l10 10M17 7 7 17',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  hand: 'M4 13h3l4 2h4a2 2 0 0 1 0 4H9m6-4 4-2a2 2 0 0 1 2 3l-6 5H4',
  megaphone: 'M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1zM15 9a3 3 0 0 1 0 6M18 6a7 7 0 0 1 0 12',
  chevron: 'M9 6l6 6-6 6',
};

export function Svg({ d, size = 20, width = 2 }: { d: string; size?: number; width?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={width}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export type StatusKey = 'review' | 'claim' | 'stock' | 'claimed' | 'available' | 'cancelled' | 'rejected';

/** The status a resident sees, e.g. an approved medicine request is "Ready to claim". */
export function statusKey(r: MedicineRequest): StatusKey {
  switch (r.status) {
    case 'pending': return 'review';
    case 'approved': return r.request_type === 'restock' ? 'stock' : 'claim';
    case 'dispensed': return 'claimed';
    case 'fulfilled': return 'available';
    case 'rejected': return 'rejected';
    default: return 'cancelled';
  }
}

export const STATUS_LABEL: Record<StatusKey, string> = {
  review: 'Under review',
  claim: 'Ready to claim',
  stock: 'Waiting for stock',
  claimed: 'Claimed',
  available: 'Available',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
};

export function StatusPill({ request }: { request: MedicineRequest }) {
  const key = statusKey(request);
  return <span className={`pill pill-${key}`}>{STATUS_LABEL[key]}</span>;
}

/** "20 tablets" */
export function quantityText(quantity: number, unit: string): string {
  return `${quantity} ${unit}${quantity > 1 && !/s$/i.test(unit) ? 's' : ''}`;
}

function dateTime(value: string): string {
  const d = new Date(value);
  return `${d.toLocaleDateString('en-PH', { dateStyle: 'medium' })} • ${d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}`;
}

/** One request in a list: icon, request number, date, medicine and quantity, status and an arrow. */
export function RequestRow({ request: r }: { request: MedicineRequest }) {
  const first = r.items[0];
  const more = r.items.length - 1;
  return (
    <Link to={`/requests/${r.request_id}`} className="req-row">
      <span className={`req-icon ${r.request_type === 'restock' ? 'req-icon-restock' : ''}`}>
        <Svg d={r.request_type === 'restock' ? ICONS.box : ICONS.pill} size={24} width={1.9} />
      </span>
      <span className="req-row-main">
        <span className="req-row-top">
          <strong>Request #{r.request_id}</strong>
          <StatusPill request={r} />
        </span>
        <span className="req-row-date">{dateTime(r.request_date)}{r.request_type === 'restock' ? ' • Restock' : ''}</span>
        {first && (
          <span className="req-row-med">
            {first.medicine.medicine_name}{more > 0 && <span className="muted"> +{more} more</span>}
          </span>
        )}
        {first && <span className="req-row-qty">{quantityText(first.quantity, first.medicine.unit)}</span>}
      </span>
      <span className="req-row-arrow"><Svg d={ICONS.chevron} size={20} /></span>
    </Link>
  );
}
