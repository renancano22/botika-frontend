import type { MedicineRequest } from '../types';
import { formatDate } from '../api';

type StepState = 'done' | 'current' | 'todo' | 'rejected' | 'cancelled';
interface Step { title: string; state: StepState; text: string; date?: string | null }

/**
 * Vertical timeline of a request:
 *  medicine: Submitted → Under review → Approved → Claimed
 *  restock : Submitted → Under review → Approved → Medicine available
 * Steps not reached yet are shown greyed out. A rejected or cancelled request ends with a ✕ step.
 */
function buildSteps(r: MedicineRequest, forResident: boolean): Step[] {
  const restock = r.request_type === 'restock';
  const reviewerRole = restock ? 'the administrator' : 'the pharmacy staff';
  const reviewer = r.reviewer?.name ?? reviewerRole;
  const you = forResident ? 'you' : (r.resident?.name ?? 'the resident');

  const submitted: Step = {
    title: 'Request submitted', state: 'done', date: r.request_date,
    text: restock ? 'Restock request submitted successfully.' : 'Medicine request submitted successfully.',
  };
  const review: Step = { title: 'Under review', state: 'done', text: `Checked by ${reviewerRole}.` };
  const approved: Step = {
    title: 'Approved', state: 'done', date: r.reviewed_at,
    text: restock ? `Approved by ${reviewer}.` : `Approved by ${reviewer}. The medicines are set aside for ${you}.`,
  };
  const last: Step = restock
    ? { title: 'Medicine available', state: 'todo', text: `${forResident ? 'You' : 'The resident'} will get an SMS when the medicine arrives.` }
    : { title: 'Claimed', state: 'todo', text: forResident ? 'Show your QR code at Botika ng Bayan to claim your medicines.' : 'The resident shows their QR code at Botika ng Bayan to claim the medicines.' };

  switch (r.status) {
    case 'pending':
      return [
        submitted,
        { ...review, state: 'current', text: `${restock ? 'The administrator is' : 'The pharmacy staff is'} checking ${forResident ? 'your' : 'this'} request.` },
        { ...approved, state: 'todo', date: null, text: forResident ? 'You will get an SMS once it is approved.' : 'The resident gets an SMS once it is approved.' },
        last,
      ];
    case 'approved':
      return [submitted, review, approved, restock
        ? { ...last, state: 'current', text: 'Waiting for the medicine to arrive.' }
        : { ...last, state: 'current', text: `${forResident ? 'Claim your medicines' : 'Must be claimed'} on or before ${formatDate(r.claim_by)}, or the request is cancelled automatically.` }];
    case 'dispensed':
      return [submitted, review, approved, {
        ...last, state: 'done', date: r.dispensing?.dispensed_at,
        text: `Medicines ${forResident ? 'received' : 'dispensed'}${r.dispensing?.dispenser ? ` (released by ${r.dispensing.dispenser.name})` : ''}.`,
      }];
    case 'fulfilled':
      return [submitted, review, approved, {
        ...last, state: 'done', date: r.fulfilled_at,
        text: forResident ? 'The medicine is now in stock. You may now submit a medicine request.' : 'The medicine arrived and the resident was notified by SMS.',
      }];
    case 'rejected':
      return [submitted, review, {
        title: 'Not approved', state: 'rejected', date: r.reviewed_at,
        text: `Rejected by ${reviewer}.${r.remarks ? ` Reason: ${r.remarks}` : ''}`,
      }];
    case 'cancelled': {
      const auto = !!r.cancelled_at && !r.cancelled_by;
      const cancelled: Step = {
        title: 'Request cancelled', state: 'cancelled', date: r.cancelled_at,
        text: auto
          ? 'Cancelled automatically because the medicines were not claimed in time.'
          : r.cancelled_by
            ? (forResident ? 'You cancelled this request.' : `Cancelled by ${r.canceller?.name ?? 'the resident'}.`)
            : 'This request was cancelled.',
      };
      // Cancelled after approval keeps the approval step; otherwise it stopped while under review.
      return r.reviewed_at ? [submitted, review, approved, cancelled] : [submitted, cancelled];
    }
    default:
      return [submitted];
  }
}

type Tone = 'info' | 'ok' | 'warn' | 'danger' | 'muted';

/** One-line summary box under the timeline. */
function summary(r: MedicineRequest, forResident: boolean): { tone: Tone; title: string; text: string } {
  const restock = r.request_type === 'restock';
  switch (r.status) {
    case 'pending': return { tone: 'info', title: 'Status: Under review', text: 'This request is waiting for approval.' };
    case 'approved':
      return restock
        ? { tone: 'warn', title: 'Status: Approved — waiting for stock', text: 'An SMS is sent once the medicine arrives.' }
        : { tone: 'ok', title: 'Status: Ready to claim', text: forResident
          ? `Bring your QR code / Patient ID (${r.resident?.qr_code ?? 'see My Profile'}) on or before ${formatDate(r.claim_by)}.`
          : `Set aside until ${formatDate(r.claim_by)}.` };
    case 'dispensed': return { tone: 'ok', title: `Status: ${forResident ? 'Claimed' : 'Dispensed'}`, text: 'This request is complete.' };
    case 'fulfilled': return { tone: 'ok', title: 'Status: Medicine available', text: 'This restock request is complete.' };
    case 'rejected': return { tone: 'danger', title: 'Status: Not approved', text: r.remarks ? `Reason: ${r.remarks}` : 'This request was not approved.' };
    case 'cancelled': return { tone: 'muted', title: 'Status: Cancelled', text: forResident && !restock ? 'This request is no longer active. You may submit a new request anytime.' : 'This request is no longer active.' };
    default: return { tone: 'muted', title: r.status, text: '' };
  }
}

const ICON_PATH: Record<Exclude<StepState, 'todo'>, string> = {
  done: 'M5 12.5l4.5 4.5L19 7.5',
  current: 'M12 7v5l3 2',
  rejected: 'M7 7l10 10M17 7 7 17',
  cancelled: 'M7 7l10 10M17 7 7 17',
};

/** Vertical status timeline + summary for one request. */
export default function RequestTracker({ request, forResident }: { request: MedicineRequest; forResident: boolean }) {
  const steps = buildSteps(request, forResident);
  const info = summary(request, forResident);

  return (
    <div className="tracker-wrap">
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
                {s.date && <span className="vstep-date">{formatDate(s.date, true)}</span>}
              </div>
              <p className="vstep-text">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className={`status-box status-${info.tone}`}>
        <strong>{info.title}</strong>
        {info.text && <p>{info.text}</p>}
      </div>
    </div>
  );
}
