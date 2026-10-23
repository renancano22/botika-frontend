/**
 * Quantity fields: a leading zero is removed as soon as a number is typed, in every number field of the system
 * ("01" → "1", "05000" → "5000"), so the user never has to go back and delete it. A single "0" and decimals
 * such as "0.5" are kept.
 *
 * It runs before React reads the field and uses the browser's own value setter, so React sees the cleaned value
 * as the change (the field's onChange receives "1", not "01").
 */
const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

export function removeLeadingZeros(value: string): string {
  return value.replace(/^(-?)0+(?=\d)/, '$1');
}

document.addEventListener('input', (e) => {
  const field = e.target;
  if (!(field instanceof HTMLInputElement) || field.type !== 'number' || !setValue) return;
  const cleaned = removeLeadingZeros(field.value);
  if (cleaned !== field.value) setValue.call(field, cleaned);
}, true);
