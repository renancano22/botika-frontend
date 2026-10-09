/**
 * Browser-side checks for form fields (the backend checks the same rules again).
 * Used as <input pattern=... title=...>: the browser shows the title text when the value doesn't match.
 */
export const FIELD = {
  name: {
    pattern: "[\\p{L} .'\\-]{2,100}",
    title: "Use letters only (spaces, periods, hyphens and apostrophes are allowed), e.g. Juan Dela Cruz.",
  },
  gmail: {
    pattern: '[A-Za-z0-9._%+\\-]+@[Gg][Mm][Aa][Ii][Ll]\\.[Cc][Oo][Mm]',
    title: 'Use a Gmail address ending in @gmail.com, e.g. juan.delacruz@gmail.com.',
  },
  mobile: {
    pattern: '(\\+63[ \\-]?|0)9[0-9]{2}[ \\-]?[0-9]{3}[ \\-]?[0-9]{4}',
    title: 'Enter an 11-digit mobile number starting with 09, e.g. 09171234567.',
  },
  password: {
    pattern: '(?=.*[A-Za-z])(?=.*[0-9]).{8,100}',
    title: 'At least 8 characters with at least one letter and one number.',
  },
  code: {
    pattern: '[0-9]{6}',
    title: 'Enter the 6-digit code.',
  },
};

/** Tomorrow's date as YYYY-MM-DD (for expiration date fields, which must be in the future). */
export function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Most a resident can ask for of one medicine in a single request (same as the backend setting). */
export const MAX_REQUEST_QUANTITY = 1000;

/**
 * Checks a requested quantity and returns a warning to show under the field, or null when it is fine.
 * `available` limits medicine requests; `min` is used by restock requests (must be more than what is left).
 */
export function quantityWarning(quantity: number, unit: string, opts: { available?: number; min?: number } = {}): string | null {
  const min = opts.min ?? 1;
  if (!Number.isFinite(quantity) || !Number.isInteger(quantity)) return 'Enter a whole number.';
  if (quantity < min) return min > 1 ? `Enter more than ${min - 1} ${unit} (that much is still available).` : 'Enter at least 1.';
  if (quantity > MAX_REQUEST_QUANTITY) return `You can request at most ${MAX_REQUEST_QUANTITY} ${unit} per medicine.`;
  if (opts.available !== undefined && quantity > opts.available) return `Only ${opts.available} ${unit} available right now. Lower the quantity, or send a restock request for more.`;
  return null;
}
