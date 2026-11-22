import type { MedicineRequest } from '../types';
import { storedPrescriptions } from '../medicineRequest';

export type ItemReviews = Record<number, { decision: '' | 'approved' | 'rejected'; reason: string }>;

export function reviewActionLabel(request: MedicineRequest, reviews: ItemReviews): string {
  const decisions = request.items.map((item) => reviews[item.request_item_id]?.decision);
  if (decisions.every((decision) => decision === 'rejected')) return 'Reject medicines';
  if (decisions.includes('approved') && decisions.includes('rejected')) return 'Approve selected';
  return request.items.length === 1 ? 'Approve' : 'Approve medicines';
}

export function reviewProblem(r: MedicineRequest, reviews: ItemReviews, checked: number[]): string {
  const files = storedPrescriptions(r).filter((f) => checked.includes(f.prescription_id));
  for (const item of r.items) {
    const review = reviews[item.request_item_id];
    if (!review?.decision) return 'Choose Approve or Reject for every medicine.';
    if (review.decision === 'rejected') {
      if (review.reason.trim().length < 3 || !/\p{L}/u.test(review.reason)) return 'Give a reason for each rejected medicine (3–255 characters).';
    } else if (item.medicine.requires_prescription && !files.some((f) => (f.medicine_ids ?? []).includes(item.medicine_id))) {
      return `Check a valid prescription covering ${item.medicine.medicine_name}, or reject this medicine.`;
    }
  }
  return '';
}

export default function MedicineReview({ request, reviews, onChange, disabled }: {
  request: MedicineRequest; reviews: ItemReviews; onChange: (reviews: ItemReviews) => void; disabled: boolean;
}) {
  return <section className="medicine-review" aria-label="Review each medicine">
    <h3>Review each medicine</h3>
    <p className="muted small">Approve the medicines that meet the requirements and give a reason for each rejected medicine. Only approved medicines will be reserved for pickup.</p>
    {request.items.map((item) => {
      const value = reviews[item.request_item_id] ?? { decision: '', reason: '' };
      const update = (next: Partial<typeof value>) => onChange({ ...reviews, [item.request_item_id]: { ...value, ...next } });
      return <fieldset key={item.request_item_id} disabled={disabled}>
        <legend>{item.medicine.medicine_name} ×{item.quantity}</legend>
        <label>Decision
          <select aria-label={`Decision for ${item.medicine.medicine_name}`} value={value.decision} onChange={(e) => update({ decision: e.target.value as typeof value.decision })}>
            <option value="">Choose a decision…</option><option value="approved">Approve</option><option value="rejected">Reject</option>
          </select>
        </label>
        {value.decision === 'rejected' && <label>Rejection reason
          <textarea aria-label={`Reason for rejecting ${item.medicine.medicine_name}`} rows={2} maxLength={255} value={value.reason} onChange={(e) => update({ reason: e.target.value })} placeholder="Explain what needs to be corrected, such as an unclear or mismatched prescription." />
        </label>}
      </fieldset>;
    })}
  </section>;
}
