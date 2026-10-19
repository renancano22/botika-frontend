import { Link } from 'react-router-dom';
import { formatDate } from '../api';
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
  back: 'M15 6l-6 6 6 6',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  note: 'M14 3H6v18h12V7zM14 3v4h4M9 12h6M9 16h4',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v5M12 8h.01',
  ban: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM5.6 5.6l12.8 12.8',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z',
  pin: 'M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
};

export function Svg({ d, size = 20, width = 2 }: { d: string; size?: number; width?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={width}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/** "Request No. 41" — the label in a lighter weight, the number in bold. */
export function RequestNo({ id, className = '' }: { id: number; className?: string }) {
  return (
    <span className={`req-no ${className}`}>
      <span className="req-no-label">Request No.</span>
      <span className="req-no-num">{id}</span>
    </span>
  );
}

/** Plain text form, e.g. for titles and messages: "Request No. 41". */
export const requestNoText = (id: number) => `Request No. ${id}`;

export type StatusKey = 'review' | 'claim' | 'stock' | 'claimed' | 'available' | 'cancelled' | 'expired' | 'rejected';

/** The status a resident sees, e.g. an approved medicine request is "Ready to claim". */
export function statusKey(r: MedicineRequest): StatusKey {
  switch (r.status) {
    case 'pending': return 'review';
    case 'approved': return r.request_type === 'restock' ? 'stock' : 'claim';
    case 'dispensed': return 'claimed';
    case 'fulfilled': return 'available';
    case 'rejected': return 'rejected';
    case 'expired': return 'expired';
    default: return 'cancelled';
  }
}

export const STATUS_LABEL: Record<StatusKey, string> = {
  review: 'Under review',
  claim: 'Ready for pickup',
  stock: 'Waiting for stock',
  claimed: 'Completed',
  available: 'Available',
  cancelled: 'Cancelled',
  expired: 'Expired',
  rejected: 'Rejected',
};

/** Colour of each status (from the agreed status colour palette). */
export const STATUS_COLOR_KEY: Record<StatusKey, string> = {
  review: 'review',
  claim: 'ready',
  stock: 'approved',
  claimed: 'completed',
  available: 'available',
  cancelled: 'cancelled',
  expired: 'expired',
  rejected: 'rejected',
};

export function StatusPill({ request }: { request: MedicineRequest }) {
  const key = statusKey(request);
  return <span className={`pill k-${STATUS_COLOR_KEY[key]}`}>{STATUS_LABEL[key]}</span>;
}

/** "tablet" → "tablets" (units already ending in s stay the same). */
export function unitPlural(unit: string): string {
  return /s$/i.test(unit) ? unit : `${unit}s`;
}

/** "20 tablets" */
export function quantityText(quantity: number, unit: string): string {
  return `${quantity} ${unit}${quantity > 1 && !/s$/i.test(unit) ? 's' : ''}`;
}

export function dateTime(value: string): string {
  const d = new Date(value);
  return `${d.toLocaleDateString('en-PH', { dateStyle: 'medium' })} • ${d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}`;
}

/** Short line under a request card: what the status means right now. */
function rowHint(r: MedicineRequest): string {
  switch (statusKey(r)) {
    case 'review': return 'Waiting for review';
    case 'claim': return `Claim by ${formatDate(r.claim_by)}`;
    case 'stock': return 'Waiting for the medicine to arrive';
    case 'claimed': return r.dispensing?.dispensed_at ? `Received on ${formatDate(r.dispensing.dispensed_at)}` : 'Medicine received';
    case 'available': return 'Medicine is now in stock';
    case 'rejected': return r.remarks ? `Reason: ${r.remarks}` : 'Not approved';
    case 'expired': return 'Not claimed before the deadline';
    default: return r.cancelled_at ? `Cancelled on ${formatDate(r.cancelled_at)}` : 'Cancelled';
  }
}

/**
 * One request in a list (card with a full border in the status colour): request number, date and status,
 * the medicines, then a short status line and "View details".
 */
export function RequestRow({ request: r }: { request: MedicineRequest }) {
  const colour = STATUS_COLOR_KEY[statusKey(r)];
  const restock = r.request_type === 'restock';
  const first = r.items[0];
  const more = r.items.length - 1;
  return (
    <Link to={`/requests/${r.request_id}`} className={`req-row k-${colour}`}>
      <span className="req-row-head">
        <span className="req-icon kicon">
          <Svg d={restock ? ICONS.box : ICONS.pill} size={22} width={1.9} />
        </span>
        <span className="req-row-title">
          <span className="req-row-title-top">
            <RequestNo id={r.request_id} />
            <StatusPill request={r} />
          </span>
          <span className="req-row-date">{dateTime(r.request_date)}</span>
        </span>
      </span>
      {first && (
        <span className="req-row-body">
          <span className="req-row-med">{first.medicine.medicine_name}{more > 0 && <span className="req-row-more">+{more} more</span>}</span>
          <span className="req-row-sub">
            <span className="req-type">{restock ? 'Restock request' : 'Medicine request'}</span>
            <span>{quantityText(first.quantity, first.medicine.unit)}</span>
          </span>
        </span>
      )}
      <span className="req-row-foot">
        <span className="req-row-hint">
          <span className="req-row-hint-text">{rowHint(r)}</span>
          {statusKey(r) === 'claim' && <PickupCountdown claimBy={r.claim_by} />}
        </span>
        <span className="req-row-view">View details <span className="req-row-arrow"><Svg d={ICONS.chevron} size={18} /></span></span>
      </span>
    </Link>
  );
}

/** Days left to claim an approved request: "3 days left", "Due tomorrow", "Last day today". */
export function pickupCountdown(claimBy: string | null | undefined): { text: string; urgent: boolean } | null {
  if (!claimBy) return null;
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(new Date(claimBy)) - day(new Date())) / 86400000);
  if (days < 0) return { text: 'Deadline passed', urgent: true };
  if (days === 0) return { text: 'Last day today', urgent: true };
  if (days === 1) return { text: 'Due tomorrow', urgent: true };
  return { text: `${days} days left`, urgent: false };
}

export function PickupCountdown({ claimBy }: { claimBy: string | null | undefined }) {
  const c = pickupCountdown(claimBy);
  if (!c) return null;
  return <span className={`countdown ${c.urgent ? 'countdown-urgent' : ''}`}>{c.text}</span>;
}
