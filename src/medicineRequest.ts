import type { Medicine } from './types';
import type { PrescriptionFile } from './components/Prescription';
import { quantityWarning } from './validation';

export const MAX_REQUEST_ITEMS = 20;
export const MAX_REQUEST_NOTE = 500;
export const MAX_PRESCRIPTION_BYTES = 4 * 1024 * 1024;
export type RequestCartItem = { medicine: Medicine; quantity: number };

export function validateMedicineRequest(items: RequestCartItem[], note: string, prescription: PrescriptionFile | null,
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
      const warning = quantityWarning(quantity, m.unit, { available: m.available_stock });
      if (warning) errors[key] = warning;
    }
    seen.add(m.medicine_id);
  });
  if (note.length > MAX_REQUEST_NOTE) errors.note = `Keep your reason to ${MAX_REQUEST_NOTE} characters or fewer.`;
  else if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(note)) errors.note = 'Remove unsupported control characters from your reason.';
  if (items.some((item) => item.medicine.requires_prescription)) {
    if (!prescription) errors.prescription = 'Upload a clear photo or PDF of your prescription to continue.';
    else if (!prescription.name.trim() || prescription.name.length > 200) errors.prescription = 'Use a prescription filename of 1–200 characters.';
    else if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(prescription.type)
      || !prescription.data.startsWith(`data:${prescription.type};base64,`)) errors.prescription = 'Choose a JPG, PNG, WebP or PDF file.';
    else if (!Number.isFinite(prescription.size) || prescription.size <= 0 || prescription.size > MAX_PRESCRIPTION_BYTES) {
      errors.prescription = 'Choose a nonempty prescription file no larger than 4 MB.';
    } else {
      const encoded = prescription.data.slice(prescription.data.indexOf(',') + 1);
      const bytes = encoded.length * 3 / 4 - (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0);
      if (!encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || bytes !== prescription.size) {
        errors.prescription = 'The prescription file is empty or corrupted. Choose it again.';
      }
    }
  }
  return errors;
}

/** Preserve medicine indexes when displaying server-side field errors. */
export function medicineRequestErrors(error: unknown): Record<string, string> {
  const fields = (error as { response?: { data?: { errors?: Record<string, unknown> } } })?.response?.data?.errors;
  if (!fields || typeof fields !== 'object') return {};
  return Object.fromEntries(Object.entries(fields).filter(([key]) => key !== 'open_request_id')
    .map(([key, value]) => [key.startsWith('prescription') ? 'prescription' : key, Array.isArray(value) ? String(value[0]) : String(value)]));
}
