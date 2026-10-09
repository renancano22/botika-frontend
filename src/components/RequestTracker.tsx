import type { MedicineRequest } from '../types';
import { dateTime } from './RequestCards';
import { formatDate } from '../api';

type StepState = 'done' | 'current' | 'todo' | 'rejected' | 'cancelled';
interface Step { title: string; state: StepState; text: string; date?: string | null; tag?: string }

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

  const submitted: Step = { title: 'Request Submitted', state: 'done', date: r.request_date, text: `${your} request has been submitted successfully.` };
  const review: Step = { title: 'Under Review', state: 'done', text: `${restock ? 'The administrator' : 'The pharmacy staff'} reviewed ${forResident ? 'your' : 'the'} request.` };
  const approved: Step = {
    title: 'Approved', state: 'done', date: r.reviewed_at,
    text: `${your} request has been approved${r.reviewer ? ` by ${r.reviewer.name}` : ''}.`,
  };
  const ready: Step = {
    title: 'Ready for Pickup', state: 'done', date: r.reviewed_at,
    text: `The medicines are set aside at Botika ng Bayan${r.claim_by ? ` until ${formatDate(r.claim_by)}` : ''}.`,
  };
  const completed: Step = { title: 'Dispensed / Completed', state: 'todo', text: 'Pending' };
  const available: Step = { title: 'Medicine Available', state: 'todo', text: 'Pending' };
  const pending = (s: Step): Step => ({ ...s, state: 'todo', date: null, text: 'Pending' });

  switch (r.status) {
    case 'pending':
      return [submitted, { ...review, state: 'current', tag: 'Current', text: `${restock ? 'The administrator' : 'The pharmacy staff'} is reviewing ${forResident ? 'your' : 'the'} request.` },
        pending(approved), ...(restock ? [available] : [pending(ready), completed])];
    case 'approved':
      return restock
        ? [submitted, review, approved, { ...available, state: 'current', tag: 'Current', text: `Waiting for the medicine to arrive. ${forResident ? 'You' : 'The resident'} will get an SMS.` }]
        : [submitted, review, approved, {
          ...ready, state: 'current', tag: 'Current',
          text: forResident
            ? `Your medicines are ready. Bring your QR code / Patient ID and claim them on or before ${formatDate(r.claim_by)}.`
            : `Waiting for the resident to claim the medicines on or before ${formatDate(r.claim_by)}.`,
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
        title: 'Rejected', state: 'rejected', date: r.reviewed_at, tag: 'Final status',
        text: r.remarks ? `Reason: ${r.remarks}` : 'The request was not approved.',
      }];
    case 'cancelled': {
      const cancelled: Step = {
        title: 'Request Cancelled', state: 'cancelled', date: r.cancelled_at, tag: 'Final status',
        text: r.cancelled_by
          ? (forResident ? 'This request was cancelled by you.' : `Cancelled by ${r.canceller?.name ?? 'the resident'}.`)
          : 'The request was cancelled before completion.',
      };
      if (!r.reviewed_at) return [submitted, cancelled];
      return restock ? [submitted, review, approved, cancelled] : [submitted, review, approved, ready, cancelled];
    }
    case 'expired':
      return [submitted, review, approved, ready, {
        title: 'Request Expired', state: 'cancelled', date: r.cancelled_at, tag: 'Final status',
        text: `The pickup deadline passed without collection. ${forResident ? 'Please submit a new request if you still need the medicine.' : 'The set-aside medicine went back to the stock.'}`,
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
        <li key={i} className={`vstep st-${s.state}`} aria-current={s.state === 'current' ? 'step' : undefined}>
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
              {s.tag && <span className={`step-tag ${s.state === 'current' ? 'tag-current' : `tag-${s.state}`}`}>{s.tag}</span>}
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

/** "Request Status" box shown under the timeline. */
export function statusSummary(r: MedicineRequest, forResident = true): { tone: Tone; title: string; text: string } {
  const restock = r.request_type === 'restock';
  switch (r.status) {
    case 'pending': return { tone: 'info', title: 'Under Review', text: 'This request is waiting for approval. You will get an SMS once it is reviewed.' };
    case 'approved':
      return restock
        ? { tone: 'warn', title: 'Approved — Waiting for Stock', text: 'You will get an SMS as soon as the medicine arrives.' }
        : { tone: 'ok', title: 'Ready for Pickup', text: `Claim your medicines at Botika ng Bayan on or before ${formatDate(r.claim_by)}, or the request will be cancelled automatically.` };
    case 'dispensed': return { tone: 'ok', title: 'Completed', text: 'This request is now part of your medicine history.' };
    case 'fulfilled': return { tone: 'ok', title: 'Medicine Available', text: 'The medicine is now in stock. You may now submit a medicine request.' };
    case 'rejected': return { tone: 'danger', title: 'Rejected', text: 'This request was not approved.' };
    case 'expired': return { tone: 'danger', title: 'Expired', text: forResident ? 'The pickup deadline passed. This request can no longer be claimed; please submit a new request if you still need the medicine.' : 'The pickup deadline passed without collection.' };
    case 'cancelled': return { tone: 'danger', title: 'Cancelled', text: forResident ? 'This medicine request is no longer active.' : 'This request is no longer active.' };
    default: return { tone: 'muted', title: r.status, text: '' };
  }
}
