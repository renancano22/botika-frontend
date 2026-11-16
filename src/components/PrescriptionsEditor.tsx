import { useEffect, useRef, useState } from 'react';
import type { Medicine } from '../types';
import { MAX_PRESCRIPTION_FILES, validatePrescriptionDrafts, type PrescriptionDraft } from '../medicineRequest';
import { FieldError } from './feedback';
import { PrescriptionUpload, PrescriptionViewer, type PrescriptionFile } from './Prescription';

let draftId = 0;
export default function PrescriptionsEditor({ medicines, drafts, onChange, onBusyChange, readOnly = false, requestId }: {
  medicines: Pick<Medicine, 'medicine_id' | 'medicine_name'>[];
  drafts: PrescriptionDraft[];
  onChange?: (drafts: PrescriptionDraft[]) => void;
  onBusyChange?: (busy: boolean) => void;
  readOnly?: boolean;
  requestId?: number;
}) {
  const busyRows = useRef(new Set<string>());
  const busyCallback = useRef(onBusyChange);
  busyCallback.current = onBusyChange;
  useEffect(() => () => busyCallback.current?.(false), []);
  const [viewing, setViewing] = useState<{ local?: PrescriptionFile; id?: number } | null>(null);
  const errors = validatePrescriptionDrafts(medicines, drafts);
  const update = (index: number, draft: PrescriptionDraft) => onChange?.(drafts.map((old, i) => i === index ? draft : old));
  const reportBusy = (key: string, busy: boolean) => {
    if (busy) busyRows.current.add(key); else busyRows.current.delete(key);
    busyCallback.current?.(busyRows.current.size > 0);
  };
  return (
    <div className="prescriptions-editor">
      {!readOnly && <p className="field-hint">Add a separate file for each prescription. One file can cover several medicines. Up to 5 files, 4 MB each, 8 MB combined.</p>}
      {drafts.map((draft, i) => (
        <section className="prescription-entry" key={draft.key} aria-label={`Prescription ${i + 1}`}>
          <div className="prescription-entry-head">
            <strong>Prescription {i + 1}</strong>
            {!readOnly && <button type="button" className="link-button" onClick={() => onChange?.(drafts.filter((_, index) => index !== i))}>Remove</button>}
          </div>
          {draft.existing && !draft.file && <div className="rx-review-row">
            <strong className="prescription-file-name">{draft.existing.file_name}</strong>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setViewing({ id: draft.existing!.prescription_id })}>View</button>
          </div>}
          {readOnly ? (draft.file && <div className="rx-review-row">
            <strong className="prescription-file-name">{draft.file.name}</strong>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setViewing({ local: draft.file! })}>View</button>
          </div>) : <PrescriptionUpload value={draft.file} onBusyChange={(busy) => reportBusy(draft.key, busy)}
            onChange={(file) => update(i, { ...draft, file, existing: file ? undefined : draft.existing })} />}
          {!readOnly && <FieldError message={errors[`prescriptions.${i}.file`]} />}
          <fieldset className="prescription-coverage">
            <legend>{readOnly ? 'Medicines covered' : 'Which medicines are on this prescription?'}</legend>
            {medicines.filter((m) => !readOnly || draft.medicine_ids.includes(m.medicine_id)).map((m) => readOnly
              ? <span className="prescription-covered" key={m.medicine_id}>{m.medicine_name}</span>
              : <label className="checkbox-row" key={m.medicine_id}>
                <input type="checkbox" checked={draft.medicine_ids.includes(m.medicine_id)} onChange={(e) => update(i, { ...draft,
                  medicine_ids: e.target.checked ? [...draft.medicine_ids, m.medicine_id] : draft.medicine_ids.filter((id) => id !== m.medicine_id) })} />
                <span>{m.medicine_name}</span>
              </label>)}
          </fieldset>
          {!readOnly && <FieldError message={errors[`prescriptions.${i}.medicine_ids`]} />}
        </section>
      ))}
      {!readOnly && <button type="button" className="btn btn-outline" disabled={drafts.length >= MAX_PRESCRIPTION_FILES}
        onClick={() => onChange?.([...drafts, { key: `new-${++draftId}`, file: null, medicine_ids: medicines.length === 1 ? [medicines[0].medicine_id] : [] }])}>
        + Add prescription
      </button>}
      {viewing && <PrescriptionViewer local={viewing.local} requestId={viewing.local ? undefined : requestId} initialPrescriptionId={viewing.id} onClose={() => setViewing(null)} />}
    </div>
  );
}
