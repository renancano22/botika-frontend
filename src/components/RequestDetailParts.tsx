import { useState, type ReactNode } from 'react';
import { formatDate } from '../api';
import type { MedicineRequest } from '../types';
import { pickupPeriod, statusSummary } from './RequestTracker';
import { dateTime, ICONS, PickupCountdown, quantityText, RequestNo, STATUS_COLOR_KEY, statusKey, StatusPill, Svg } from './RequestCards';
import { PrescriptionViewer, requiresPrescription, RX_ICON, RxBadge } from './Prescription';

/** "Pickup schedule" row: approval means the medicines are ready at Botika ng Bayan until the claim deadline. */
export function pickupText(r: MedicineRequest): string {
  if (r.request_type === 'restock') return r.status === 'fulfilled' ? 'Medicine available — you may now request it' : 'Not applicable (restock request)';
  const p = pickupPeriod(r);
  if (r.status === 'approved' && p) return `Botika ng Bayan, Bulan · Pickup date: ${p.pickup} · Claim on or before: ${p.deadline}`;
  if (r.status === 'dispensed') return `Claimed on ${dateTime(r.dispensing?.dispensed_at ?? r.request_date)}`;
  if (r.status === 'pending') return 'Not yet available — waiting for approval';
  if (r.status === 'expired') return p ? `Not claimed — pickup period was ${p.pickup} to ${p.deadline}` : 'Not claimed before the deadline';
  return '—';
}

/**
 * Highlighted pickup date and claim deadline of an approved medicine request, with the 7-day rule.
 * Shown in the resident's notification details and on the request tracking page.
 */
export function PickupDeadlineBox({ r, reminder = false }: { r: MedicineRequest; reminder?: boolean }) {
  const p = pickupPeriod(r);
  if (!p || r.status !== 'approved') return null;
  return (
    <div className={`info-box pickup-box ${reminder ? 'info-warn' : 'info-ok'}`}>
      <strong><Svg d={ICONS.calendar} size={18} /> {reminder ? 'Pickup Reminder' : 'Pickup Schedule'}</strong>
      <p><Svg d={ICONS.pin} size={16} /> Botika ng Bayan, Bulan, Sorsogon</p>
      <div className="pickup-dates">
        <div><span>Pickup date</span><b>{p.pickup}</b></div>
        <div className="pickup-deadline"><span>Claim deadline</span><b>{p.deadline}</b><PickupCountdown claimBy={r.claim_by} /></div>
      </div>
      <p className="pickup-rule">
        You must claim your medicine within {p.days} days from the pickup date. If you do not claim it on or before <b>{p.deadline}</b>,
        the medicine will no longer be given to you and this request will no longer be valid for pickup.
      </p>
      <small>When claiming, bring your Resident ID / QR code{r.resident?.qr_code ? ` (${r.resident.qr_code})` : ''} and a <b>valid ID or Barangay ID</b> for verification.</small>
    </div>
  );
}

export function notesText(r: MedicineRequest): string {
  if (r.status === 'rejected') return r.remarks ? `Not approved: ${r.remarks}` : 'Not approved';
  if (r.status === 'expired') return 'Expired — not claimed before the pickup deadline';
  if (r.status === 'cancelled') return r.cancelled_by ? 'Cancelled by resident' : 'Cancelled';
  return r.remarks || 'None';
}

/** Where the prescription check stands, e.g. "Checked by Ana Cruz". */
export function prescriptionStatus(r: MedicineRequest): string {
  if (!r.prescription) return 'Not uploaded';
  if (r.prescription_verified_at) return `Checked by ${r.prescription_verifier?.name ?? 'the pharmacy staff'} · ${formatDate(r.prescription_verified_at)}`;
  if (r.status === 'pending') return 'Waiting for the pharmacy staff to check it';
  return 'Uploaded';
}

/** "Request Details" card: medicines, requested by, pickup schedule and notes. */
export function RequestSummaryCard({ r, prescriptionAction }: { r: MedicineRequest; prescriptionAction?: ReactNode }) {
  const [viewRx, setViewRx] = useState(false);
  const rx = requiresPrescription(r) || !!r.prescription;
  return (
    <section className="detail-card">
      <div className={`detail-card-head k-${STATUS_COLOR_KEY[statusKey(r)]}`}>
        <div>
          <RequestNo id={r.request_id} className="detail-id" />
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
              {i.medicine.requires_prescription && r.request_type === 'medicine' && <RxBadge small />}
            </span>
          </li>
        ))}
      </ul>
      <dl className="detail-rows">
        <div><dt><Svg d={ICONS.user} size={18} /> Requested by</dt><dd>{r.resident?.name ?? '—'}</dd></div>
        <div><dt><Svg d={ICONS.calendar} size={18} /> Pickup schedule</dt><dd>{pickupText(r)}</dd></div>
        <div><dt><Svg d={ICONS.note} size={18} /> Reason for request</dt><dd className="note-text">{r.resident_note || 'None'}</dd></div>
        {rx && (
          <div>
            <dt><Svg d={RX_ICON} size={18} width={2.2} /> Prescription</dt>
            <dd className="rx-dd">
              <span>
                {r.prescription && <strong className="rx-name">{r.prescription.file_name}</strong>}
                <span className={r.prescription_verified_at ? 'rx-ok' : 'muted small'}>{prescriptionStatus(r)}</span>
              </span>
              <span className="rx-dd-actions">
                {r.prescription && <button type="button" className="btn btn-outline btn-sm" onClick={() => setViewRx(true)}>View</button>}
                {prescriptionAction}
              </span>
            </dd>
          </div>
        )}
        <div><dt><Svg d={ICONS.info} size={18} /> Pharmacy notes</dt><dd>{notesText(r)}</dd></div>
      </dl>
      {viewRx && <PrescriptionViewer requestId={r.request_id} onClose={() => setViewRx(false)} />}
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
