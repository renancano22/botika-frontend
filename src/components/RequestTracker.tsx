import type { MedicineRequest } from '../types';
import { dateTime } from './RequestCards';
import { formatDate } from '../api';

/**
 * Pickup period of an approved medicine request: the pickup date is the approval date and the
 * resident must claim it within pickup_days (7) days, on or before the end of the deadline day.
 */
export function pickupPeriod(r: MedicineRequest): { pickup: string; deadline: string; days: number } | null {
  const deadline = r.pickup_deadline ?? r.claim_by;
  if (r.request_type !== 'medicine' || !r.reviewed_at || !deadline) return null;
  const day = (v: string) => { const d = new Date(v); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
  const days = r.pickup_days ?? Math.round((day(deadline) - day(r.reviewed_at)) / 86400000);
  return { pickup: formatDate(r.reviewed_at), deadline: formatDate(deadline), days };
}

type StepState = 'done' | 'current' | 'todo' | 'rejected' | 'cancelled';
interface Step { title: string; state: StepState; text: string; date?: string | null; tag?: string; k?: string }

/**
 * Request tracking timeline.
 *  medicine: Request Submitted → Under Review → Approved → Ready for Pickup → Dispensed / Completed
 *            (approving sets the medicine aside, so it is ready for pickup at the same time)
 *  restock : Request Submitted → Under Review → Approved → Medicine Available
 * Steps not reached yet are greyed out ("Pending"). Rejected/cancelled requests end with a ✕ step.
 */
function buildSteps(r: MedicineRequest, forResident: boolean): Step[] {
  const restock = r.request_type === 'restock';
  const your = forResident ? 'Your' : 'The';
  const p = pickupPeriod(r);

  const submitted: Step = { k: 'submitted', title: 'Request Submitted', state: 'done', date: r.request_date, text: `${your} request has been submitted successfully.` };
  const review: Step = { k: 'review', title: 'Under Review', state: 'done', text: `${restock ? 'The administrator' : 'The pharmacy staff'} reviewed ${forResident ? 'your' : 'the'} request.` };
  const approved: Step = {
    k: 'approved', title: 'Approved', state: 'done', date: r.reviewed_at,
    text: `${your} request has been approved${r.reviewer ? ` by ${r.reviewer.name}` : ''}${r.prescription_verified_at ? ' after checking the prescription' : ''}.`,
  };
  const ready: Step = {
    k: 'ready', title: 'Ready for Pickup', state: 'done', date: r.reviewed_at,
    text: p ? `The medicines were set aside at Botika ng Bayan. Pickup date: ${p.pickup} · Claim deadline: ${p.deadline}.` : 'The medicines were set aside at Botika ng Bayan.',
  };
  const completed: Step = { k: 'completed', title: 'Dispensed / Completed', state: 'todo', text: 'Pending' };
  const available: Step = { k: 'available', title: 'Medicine Available', state: 'todo', text: 'Pending' };
  const pending = (s: Step): Step => ({ ...s, state: 'todo', date: null, text: 'Pending' });

  switch (r.status) {
    case 'pending':
      return [submitted, { ...review, state: 'current', tag: 'Current', text: `${restock ? 'The administrator' : 'The pharmacy staff'} is reviewing ${forResident ? 'your' : 'the'} request${r.prescription ? ' and checking the prescription' : ''}.` },
        pending(approved), ...(restock ? [available] : [pending(ready), completed])];
    case 'approved':
      return restock
        ? [submitted, review, approved, { ...available, state: 'current', tag: 'Current', text: `Waiting for the medicine to arrive. ${forResident ? 'You' : 'The resident'} will get an SMS.` }]
        : [submitted, review, approved, {
          ...ready, state: 'current', tag: 'Current',
          text: forResident
            ? `Your medicines are ready for pickup since ${p?.pickup ?? '—'}. Bring your QR code / Resident ID and claim them on or before ${p?.deadline ?? '—'} (within ${p?.days ?? '—'} days). After the deadline, the medicine will no longer be given to you.`
            : `Waiting for the resident to claim the medicines on or before ${p?.deadline ?? '—'}.`,
        }, completed];
    case 'dispensed':
      return [submitted, review, approved, ready, {
        ...completed, state: 'done', date: r.dispensing?.dispensed_at, tag: 'Final status',
        text: `${forResident ? 'Your medicine was' : 'The medicines were'} released and recorded${r.dispensing?.dispenser ? ` by ${r.dispensing.dispenser.name}` : ' by the pharmacy staff'}.`,
      }];
    case 'fulfilled':
      return [submitted, review, approved, {
        ...available, state: 'done', date: r.fulfilled_at, tag: 'Final status',
        text: forResident ? 'The medicine is now in stock. You may now submit a medicine request.' : 'The medicine arrived and the resident was notified.',
      }];
    case 'rejected':
      return [submitted, review, {
        k: 'rejected', title: 'Rejected', state: 'rejected', date: r.reviewed_at, tag: 'Final status',
        text: r.remarks ? `Not approved. Reason: ${r.remarks}` : 'The request was not approved. No reason was recorded.',
      }];
    case 'cancelled': {
      const cancelled: Step = {
        k: 'cancelled', title: 'Request Cancelled', state: 'cancelled', date: r.cancelled_at, tag: 'Final status',
        text: r.cancelled_by
          ? (forResident ? 'This request was cancelled by you.' : `Cancelled by ${r.canceller?.name ?? 'the resident'}.`)
          : 'The request was cancelled before completion.',
      };
      if (!r.reviewed_at) return [submitted, cancelled];
      return restock ? [submitted, review, approved, cancelled] : [submitted, review, approved, ready, cancelled];
    }
    case 'expired':
      return [submitted, review, approved, ready, {
        k: 'expired', title: 'Request Expired', state: 'cancelled', date: r.cancelled_at, tag: 'Final status',
        text: `${p ? `Not claimed during the pickup period (${p.pickup} to ${p.deadline}), so` : 'Not claimed before the pickup deadline, so'} the request is no longer valid for pickup and the medicine went back to the stock.${forResident ? ' Please submit a new request if you still need the medicine.' : ''}`,
      }];
    default:
      return [submitted];
  }
}

const ICON_PATH: Record<Exclude<StepState, 'todo'>, string> = {
  done: 'M5 12.5l4.5 4.5L19 7.5',
  current: 'M12 7v5l3 2',
  rejected: 'M7 7l10 10M17 7 7 17',
  cancelled: 'M7 7l10 10M17 7 7 17',
};

/** Vertical "Request Tracking" timeline for one request. */
export default function RequestTracker({ request, forResident }: { request: MedicineRequest; forResident: boolean }) {
  const steps = buildSteps(request, forResident);
  return (
    <ol className="vtrack">
      {steps.map((s, i) => (
        <li key={i} className={`vstep st-${s.state} k-${s.k ?? 'submitted'}`} aria-current={s.state === 'current' ? 'step' : undefined}>
          <span className="step-dot" aria-hidden="true">
            {s.state === 'todo' ? i + 1 : (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                {s.state === 'current' && <circle cx="12" cy="12" r="8" strokeWidth="2" />}
                <path d={ICON_PATH[s.state]} />
              </svg>
            )}
          </span>
          <div className="vstep-body">
            <div className="vstep-title">
              <strong>{s.title}</strong>
              {s.tag && <span className="step-tag">{s.tag}</span>}
            </div>
            {s.date && <span className="vstep-date">{dateTime(s.date)}</span>}
            <p className="vstep-text">{s.text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export type Tone = 'info' | 'ok' | 'warn' | 'danger' | 'muted';

/** "Request Status" box shown under the timeline: what the status means and what to do next. */
export function statusSummary(r: MedicineRequest, forResident = true): { tone: Tone; title: string; text: string } {
  const restock = r.request_type === 'restock';
  const p = pickupPeriod(r);
  const reviewer = restock ? 'The administrator' : 'The pharmacy staff';
  switch (r.status) {
    case 'pending':
      return { tone: 'info', title: 'Under Review', text: `${reviewer} is reviewing this request. ${forResident ? 'You' : 'The resident'} will be notified once it is approved or not approved. No action is needed for now.` };
    case 'approved':
      return restock
        ? { tone: 'warn', title: 'Approved — Waiting for Stock', text: `${forResident ? 'You' : 'The resident'} will be notified as soon as the medicine is available at Botika ng Bayan. No action is needed for now.` }
        : { tone: 'ok', title: 'Ready for Pickup', text: p
          ? `Claim the medicine at Botika ng Bayan on or before ${p.deadline}, within ${p.days} days from the pickup date (${p.pickup}). After the deadline, the medicine will no longer be given and the request will no longer be valid for pickup.`
          : 'Claim the medicine at Botika ng Bayan before the pickup deadline.' };
    case 'dispensed':
      return { tone: 'ok', title: 'Completed', text: `The medicine was received${r.dispensing?.dispensed_at ? ` on ${formatDate(r.dispensing.dispensed_at)}` : ''}. This request is complete and is now part of ${forResident ? 'your' : 'the'} medicine history.` };
    case 'fulfilled':
      return { tone: 'ok', title: 'Medicine Available', text: forResident ? 'The medicine is now in stock. This restock request is complete — submit a medicine request to get it.' : 'The medicine is now in stock and the resident was notified.' };
    case 'rejected':
      return { tone: 'danger', title: 'Not Approved', text: `This request was not approved. ${r.remarks ? `Reason: ${r.remarks}` : 'No reason was recorded.'}${forResident ? ' You may submit a new request if you still need the medicine.' : ''}` };
    case 'expired':
      return { tone: 'danger', title: 'Expired — Not Claimed', text: `${p ? `The medicine was not claimed during the pickup period (${p.pickup} to ${p.deadline}).` : 'The medicine was not claimed before the pickup deadline.'} This request is no longer valid for pickup.${forResident ? ' Please submit a new request if you still need the medicine.' : ''}` };
    case 'cancelled':
      return { tone: 'danger', title: 'Cancelled', text: `This request was cancelled${r.cancelled_by && forResident ? ' by you' : ''}${r.cancelled_at ? ` on ${formatDate(r.cancelled_at)}` : ''} and is no longer active.${forResident ? ' You may submit a new request anytime.' : ''}` };
    default: return { tone: 'muted', title: r.status, text: '' };
  }
}
