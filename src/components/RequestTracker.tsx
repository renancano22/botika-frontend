import type { MedicineRequest } from '../types';
import { formatDate } from '../api';

type StepState = 'done' | 'current' | 'todo' | 'rejected' | 'cancelled';
interface Step { label: string; state: StepState; date?: string | null; note?: string }

/**
 * Steps of a request:
 *  medicine: Submitted → Under review → Approved (ready to claim) → Claimed
 *  restock : Submitted → Under review → Approved (waiting for stock) → Available
 * A rejected or cancelled request ends with a red/grey ✕ step where it stopped.
 */
function buildSteps(r: MedicineRequest): Step[] {
  const restock = r.request_type === 'restock';
  const by = r.reviewer ? `by ${r.reviewer.name}` : undefined;
  const steps: Step[] = [{ label: 'Submitted', state: 'done', date: r.request_date }];
  const reviewed: Step = { label: 'Under review', state: 'done' };
  const approved: Step = { label: 'Approved', state: 'done', date: r.reviewed_at, note: by };
  const last: Step = { label: restock ? 'Available' : 'Claimed', state: 'todo' };

  switch (r.status) {
    case 'pending':
      steps.push({ ...reviewed, state: 'current' }, { ...approved, state: 'todo', date: null, note: undefined }, last);
      break;
    case 'approved':
      steps.push(reviewed, approved, {
        ...last,
        state: 'current',
        note: restock ? 'Waiting for stock' : r.claim_by ? `Claim by ${formatDate(r.claim_by)}` : undefined,
      });
      break;
    case 'dispensed':
      steps.push(reviewed, approved, { ...last, state: 'done', date: r.dispensing?.dispensed_at, note: r.dispensing?.dispenser ? `by ${r.dispensing.dispenser.name}` : undefined });
      break;
    case 'fulfilled':
      steps.push(reviewed, approved, { ...last, state: 'done', date: r.fulfilled_at });
      break;
    case 'rejected':
      steps.push(reviewed, { label: 'Rejected', state: 'rejected', date: r.reviewed_at, note: by });
      break;
    case 'cancelled': {
      const cancelled: Step = {
        label: 'Cancelled', state: 'cancelled', date: r.cancelled_at,
        note: r.cancelled_at && !r.cancelled_by ? 'Not claimed in time' : undefined,
      };
      // Cancelled after it was approved, or while still under review.
      if (r.reviewed_at) steps.push(reviewed, approved, cancelled);
      else steps.push(cancelled);
      break;
    }
  }
  return steps;
}

type Tone = 'info' | 'ok' | 'warn' | 'danger' | 'muted';

/** The message box under the steps, written for the resident or for staff/admin. */
function statusInfo(r: MedicineRequest, forResident: boolean): { tone: Tone; title: string; text: string } {
  const restock = r.request_type === 'restock';
  const who = r.resident?.name ?? 'the resident';

  switch (r.status) {
    case 'pending':
      return {
        tone: 'info', title: 'Under review',
        text: restock
          ? (forResident ? 'The administrator will review your restock request. You will get an SMS about the result.' : 'Waiting for the administrator to approve or reject this restock request.')
          : (forResident ? 'The pharmacy staff will check your request. You will get an SMS once it is approved.' : 'Waiting for the pharmacy staff to approve or reject this request.'),
      };
    case 'approved':
      if (restock) {
        return {
          tone: 'warn', title: 'Approved — waiting for stock',
          text: forResident ? 'You will get an SMS as soon as the medicine arrives.' : `${who} will get an SMS when the medicine arrives.`,
        };
      }
      return {
        tone: 'ok', title: 'Approved — ready to claim',
        text: forResident
          ? `Bring your QR code / Patient ID (${r.resident?.qr_code ?? 'see My Profile'}) to Botika ng Bayan and claim your medicines on or before ${formatDate(r.claim_by)}. After that, the request is cancelled automatically.`
          : `The medicines are set aside for ${who}. They must be claimed on or before ${formatDate(r.claim_by)}, or the request is cancelled automatically.`,
      };
    case 'dispensed':
      return {
        tone: 'ok', title: forResident ? 'Claimed' : 'Dispensed',
        text: `Medicines ${forResident ? 'received' : 'dispensed'} on ${formatDate(r.dispensing?.dispensed_at, true)}${r.dispensing?.dispenser ? ` (released by ${r.dispensing.dispenser.name})` : ''}.`,
      };
    case 'fulfilled':
      return {
        tone: 'ok', title: 'Now available',
        text: forResident ? 'The medicine is now in stock. You may now submit a medicine request.' : `The medicine arrived${r.fulfilled_at ? ` on ${formatDate(r.fulfilled_at, true)}` : ''} and ${who} was notified by SMS.`,
      };
    case 'rejected':
      return { tone: 'danger', title: 'Not approved', text: r.remarks ? `Reason: ${r.remarks}` : 'This request was not approved.' };
    case 'cancelled':
      if (!r.cancelled_at) return { tone: 'muted', title: 'Cancelled', text: 'This request was cancelled.' };
      if (!r.cancelled_by) {
        return { tone: 'muted', title: 'Cancelled automatically', text: `Cancelled on ${formatDate(r.cancelled_at, true)} because the medicines were not claimed in time.${forResident ? ' You may submit a new request anytime.' : ''}` };
      }
      return {
        tone: 'muted', title: 'Cancelled',
        text: forResident ? `You cancelled this request on ${formatDate(r.cancelled_at, true)}.` : `Cancelled by ${r.canceller?.name ?? who} on ${formatDate(r.cancelled_at, true)}.`,
      };
    default:
      return { tone: 'muted', title: r.status, text: '' };
  }
}

const ICON_PATH: Record<StepState, string> = {
  done: 'M5 12.5l4.5 4.5L19 7.5',
  current: 'M12 7v5l3 2',
  todo: '',
  rejected: 'M7 7l10 10M17 7 7 17',
  cancelled: 'M7 7l10 10M17 7 7 17',
};

function shortDate(value: string) {
  const d = new Date(value);
  return {
    day: d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }),
    time: d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }),
  };
}

/** Step tracker + status message for one request. */
export default function RequestTracker({ request, forResident }: { request: MedicineRequest; forResident: boolean }) {
  const steps = buildSteps(request);
  const info = statusInfo(request, forResident);

  return (
    <div className="tracker-wrap">
      <ol className="tracker" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((s, i) => {
          const when = s.date ? shortDate(s.date) : null;
          return (
            <li key={i} className={`step step-${s.state}`} aria-current={s.state === 'current' ? 'step' : undefined}>
              <span className="step-dot" aria-hidden="true">
                {s.state === 'todo' ? i + 1 : (
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                    {s.state === 'current' && <circle cx="12" cy="12" r="8" strokeWidth="2" />}
                    <path d={ICON_PATH[s.state]} />
                  </svg>
                )}
              </span>
              <span className="step-label">{s.label}</span>
              {when && <span className="step-date">{when.day}<br />{when.time}</span>}
              {s.note && <span className="step-note">{s.note}</span>}
            </li>
          );
        })}
      </ol>
      <div className={`status-box status-${info.tone}`}>
        <strong>{info.title}</strong>
        {info.text && <p>{info.text}</p>}
      </div>
    </div>
  );
}
