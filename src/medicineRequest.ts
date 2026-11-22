import type { Medicine, MedicineRequest, PrescriptionInfo } from './types';
import type { PrescriptionFile } from './components/Prescription';
import { quantityWarning } from './validation';

export const MAX_REQUEST_ITEMS = 5;
export const MAX_REQUEST_NOTE = 500;
export const MAX_PRESCRIPTION_BYTES = 4 * 1024 * 1024;
export const MAX_PRESCRIPTION_FILES = 5;
export const MAX_PRESCRIPTION_TOTAL_BYTES = 8 * 1024 * 1024;
export interface PrescriptionDraft { key: string; file: PrescriptionFile | null; medicine_ids: number[]; existing?: PrescriptionInfo }
export type RequestCartItem = { medicine: Medicine; quantity: number };

/** The resident form presets tablets/capsules, including catalog entries measured in pieces. */
export function automaticRequestQuantity(medicine: { unit: string; dosage_form?: string | null; medicine_name?: string }): number | null {
  const form = medicine.dosage_form || medicine.medicine_name || '';
  return /\b(?:tablets?|capsules?)\b/i.test(`${form} ${medicine.unit}`) ? 10 : null;
}

export function requestItemPayload(medicine: { medicine_id: number; unit: string; dosage_form?: string | null; medicine_name?: string }, quantity: number | null) {
  return { medicine_id: medicine.medicine_id, quantity: automaticRequestQuantity(medicine) ?? quantity };
}

export function residentQuantityWarning(medicine: { unit: string; dosage_form?: string | null; medicine_name?: string; available_stock?: number }, quantity: number): string | null {
  const automatic = automaticRequestQuantity(medicine);
  if (automatic !== null && medicine.available_stock !== undefined && medicine.available_stock < automatic) {
    return `The automatic quantity is ${automatic}, but only ${medicine.available_stock} are available. Remove this medicine and check again after restocking.`;
  }
  return quantityWarning(quantity, medicine.unit, { available: medicine.available_stock });
}

export function validateMedicineRequest(items: RequestCartItem[], note: string, prescription: PrescriptionFile | PrescriptionDraft[] | null,
  openMedicineIds: ReadonlySet<number> = new Set()): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!items.length) errors.items = 'Add at least one medicine.';
  else if (items.length > MAX_REQUEST_ITEMS) errors.items = `One request can have at most ${MAX_REQUEST_ITEMS} medicines.`;
  const seen = new Set<number>();
  items.forEach(({ medicine: m, quantity }, i) => {
    const key = `items.${i}.quantity`;
    if (!Number.isInteger(m.medicine_id) || m.medicine_id < 1) errors[key] = 'Choose a valid medicine.';
    else if (seen.has(m.medicine_id)) errors[key] = 'This medicine is already in your request.';
    else if (openMedicineIds.has(m.medicine_id)) errors[key] = 'This medicine is already in an open request. Edit that request instead.';
    else if (!Number.isFinite(m.available_stock) || m.available_stock < 1 || m.status === 'out_of_stock' || m.status === 'unrecorded') {
      errors[key] = 'This medicine is no longer available. Remove it or ask for a restock.';
    } else {
      const warning = residentQuantityWarning(m, quantity);
      if (warning) errors[key] = warning;
    }
    seen.add(m.medicine_id);
  });
  if (note.length > MAX_REQUEST_NOTE) errors.note = `Keep your reason to ${MAX_REQUEST_NOTE} characters or fewer.`;
  else if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(note)) errors.note = 'Remove unsupported control characters from your reason.';
  if (items.some((item) => item.medicine.requires_prescription)) {
    if (Array.isArray(prescription)) Object.assign(errors, validatePrescriptionDrafts(items.filter((i) => i.medicine.requires_prescription).map((i) => i.medicine), prescription));
    else {
      const issue = validatePrescriptionFile(prescription);
      if (issue) errors.prescription = issue;
    }
  }
  return errors;
}

export function validatePrescriptionFile(prescription: PrescriptionFile | null): string | undefined {
    if (!prescription) return 'Upload a clear photo or PDF of your prescription to continue.';
    if (!prescription.name.trim() || prescription.name.length > 200) return 'Use a prescription filename of 1–200 characters.';
    if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(prescription.type)
      || !prescription.data.startsWith(`data:${prescription.type};base64,`)) return 'Choose a JPG, PNG, WebP or PDF file.';
    else if (!Number.isFinite(prescription.size) || prescription.size <= 0 || prescription.size > MAX_PRESCRIPTION_BYTES) {
      return 'Choose a nonempty prescription file no larger than 4 MB.';
    } else {
      const encoded = prescription.data.slice(prescription.data.indexOf(',') + 1);
      const bytes = encoded.length * 3 / 4 - (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0);
      if (!encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || bytes !== prescription.size) {
        return 'The prescription file is empty or corrupted. Choose it again.';
      }
    }
}

export function validatePrescriptionDrafts(medicines: Pick<Medicine, 'medicine_id' | 'medicine_name'>[], drafts: PrescriptionDraft[]): Record<string, string> {
  const errors: Record<string, string> = {};
  const allowed = new Set(medicines.map((m) => m.medicine_id));
  const covered = new Set<number>();
  const attached = new Set<string>();
  let total = 0;
  if (!drafts.length || drafts.length > MAX_PRESCRIPTION_FILES) errors.prescription = `Attach 1–${MAX_PRESCRIPTION_FILES} prescriptions and select the medicines each one covers.`;
  drafts.forEach((draft, i) => {
    const issue = draft.file ? validatePrescriptionFile(draft.file) : draft.existing ? undefined : 'Upload a file for this prescription.';
    if (issue) errors[`prescriptions.${i}.file`] = issue;
    const identity = draft.file?.data ?? `existing:${draft.existing?.prescription_id}`;
    if (attached.has(identity)) errors[`prescriptions.${i}.file`] = 'This file is already attached. Select all medicines it covers instead.';
    attached.add(identity);
    total += draft.file?.size ?? draft.existing?.size ?? 0;
    if (!draft.medicine_ids.length || draft.medicine_ids.some((id) => !allowed.has(id)) || new Set(draft.medicine_ids).size !== draft.medicine_ids.length) {
      errors[`prescriptions.${i}.medicine_ids`] = 'Select the prescription medicines in this request that this file covers.';
    }
    if (!issue) draft.medicine_ids.forEach((id) => covered.add(id));
  });
  if (total > MAX_PRESCRIPTION_TOTAL_BYTES) errors.prescription = 'The combined prescription files must be 8 MB or smaller.';
  const missing = medicines.filter((m) => !covered.has(m.medicine_id));
  if (missing.length) errors.prescription ??= `A prescription is still needed for: ${missing.map((m) => m.medicine_name).join(', ')}.`;
  if (Object.keys(errors).length) errors.prescription ??= 'Please check each prescription file and its selected medicines.';
  return errors;
}

export function storedPrescriptions(request: Pick<MedicineRequest, 'prescriptions' | 'prescription'>): PrescriptionInfo[] {
  return request.prescriptions ?? (request.prescription ? [request.prescription] : []);
}

export function prescriptionPayload(drafts: PrescriptionDraft[]) {
  return drafts.map((draft) => ({ medicine_ids: draft.medicine_ids,
    ...(draft.file ? { name: draft.file.name, data: draft.file.data } : { existing_id: draft.existing?.prescription_id }) }));
}

/** Keep completed uploads only while at least one of their explicitly covered medicines remains. */
export function retainPrescriptionCoverage(drafts: PrescriptionDraft[], medicineIds: number[]): PrescriptionDraft[] {
  const allowed = new Set(medicineIds);
  return drafts.map((draft) => ({ ...draft, medicine_ids: draft.medicine_ids.filter((id) => allowed.has(id)) }))
    .filter((draft) => draft.medicine_ids.length > 0);
}

export function prescriptionDraftsFromRequest(request: MedicineRequest): PrescriptionDraft[] {
  const ids = request.items.filter((i) => i.medicine.requires_prescription).map((i) => i.medicine_id);
  return storedPrescriptions(request).map((file) => ({ key: `stored-${file.prescription_id}`, file: null, existing: file, medicine_ids: file.medicine_ids ?? ids }));
}

/** Preserve medicine indexes when displaying server-side field errors. */
export function medicineRequestErrors(error: unknown): Record<string, string> {
  const fields = (error as { response?: { data?: { errors?: Record<string, unknown> } } })?.response?.data?.errors;
  if (!fields || typeof fields !== 'object') return {};
  const result = Object.fromEntries(Object.entries(fields).filter(([key]) => key !== 'open_request_id')
    .map(([key, value]) => [key, Array.isArray(value) ? String(value[0]) : String(value)]));
  for (const [key, value] of Object.entries(result)) if (key.startsWith('prescription')) result.prescription ??= value;
  return result;
}
