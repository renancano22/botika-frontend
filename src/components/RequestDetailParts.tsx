import { formatDate } from '../api';
import type { MedicineRequest } from '../types';
import { statusSummary } from './RequestTracker';
import { dateTime, ICONS, quantityText, STATUS_COLOR_KEY, statusKey, StatusPill, Svg } from './RequestCards';

/** "Pickup schedule" row: approval means the medicines are ready at Botika ng Bayan until the claim deadline. */
export function pickupText(r: MedicineRequest): string {
  if (r.request_type === 'restock') return r.status === 'fulfilled' ? 'Medicine available — you may now request it' : 'Not applicable (restock request)';
  if (r.status === 'approved') return `Botika ng Bayan, Bulan · on or before ${formatDate(r.claim_by)}`;
  if (r.status === 'dispensed') return `Claimed on ${dateTime(r.dispensing?.dispensed_at ?? r.request_date)}`;
  if (r.status === 'pending') return 'Not yet available';
  if (r.status === 'expired') return `Deadline passed${r.cancelled_at ? ` (${formatDate(r.cancelled_at)})` : ''}`;
  return '—';
}

export function notesText(r: MedicineRequest): string {
  if (r.status === 'rejected') return r.remarks ? `Not approved: ${r.remarks}` : 'Not approved';
  if (r.status === 'expired') return 'Expired — not claimed before the pickup deadline';
  if (r.status === 'cancelled') return r.cancelled_by ? 'Cancelled by resident' : 'Cancelled';
  return r.remarks || 'None';
}

/** "Request Details" card: medicines, requested by, pickup schedule and notes. */
export function RequestSummaryCard({ r }: { r: MedicineRequest }) {
  return (
    <section className="detail-card">
      <div className={`detail-card-head k-${STATUS_COLOR_KEY[statusKey(r)]}`}>
        <div>
          <strong className="detail-id">Request #{r.request_id}</strong>
          <span className="muted small">{dateTime(r.request_date)}{r.request_type === 'restock' ? ' • Restock' : ''}</span>
        </div>
        <StatusPill request={r} />
      </div>
      <ul className="detail-meds">
        {r.items.map((i) => (
          <li key={i.request_item_id ?? i.medicine_id}>
            <span className={`req-icon req-icon-sm kicon k-${STATUS_COLOR_KEY[statusKey(r)]}`}>
              <Svg d={r.request_type === 'restock' ? ICONS.box : ICONS.pill} size={20} width={1.9} />
            </span>
            <span>
              <strong>{i.medicine.medicine_name}</strong>
              <span className="muted small">{quantityText(i.quantity, i.medicine.unit)}</span>
            </span>
          </li>
        ))}
      </ul>
      <dl className="detail-rows">
        <div><dt><Svg d={ICONS.user} size={18} /> Requested by</dt><dd>{r.resident?.name ?? '—'}</dd></div>
        <div><dt><Svg d={ICONS.calendar} size={18} /> Pickup schedule</dt><dd>{pickupText(r)}</dd></div>
        <div><dt><Svg d={ICONS.note} size={18} /> Notes</dt><dd>{notesText(r)}</dd></div>
      </dl>
    </section>
  );
}

export function StatusBox({ r }: { r: MedicineRequest }) {
  const s = statusSummary(r);
  return (
    <div className={`status-box k-${STATUS_COLOR_KEY[statusKey(r)]}`}>
      <span className="status-box-icon"><Svg d={ICONS.info} size={22} /></span>
      <div>
        <small>Request Status</small>
        <strong>{s.title}</strong>
        <p>{s.text}</p>
      </div>
    </div>
  );
}
