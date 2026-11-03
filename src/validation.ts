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
  medicineName: {
    pattern: "[\\p{L}\\p{N}][\\p{L}\\p{N} .,'\\(\\)\\/+\\-]{1,149}",
    title: "Letters, numbers, spaces and . , ' ( ) / + - only (at least 2 characters).",
  },
  strength: {
    pattern: '[0-9][\\p{L}\\p{N} .,\\/%+\\-]{0,49}',
    title: 'Start with a number, e.g. 500mg, 100mg/5ml or 1%.',
  },
  unit: {
    pattern: '[\\p{L}][\\p{L} \\-]{0,49}',
    title: 'Letters only, e.g. tablet, capsule, bottle.',
  },
};

/** Largest quantity for one stock-in (same as the backend). */
export const MAX_STOCK_IN = 100000;

/** Latest expiration date accepted for a stock-in: 10 years from today (YYYY-MM-DD). */
export function maxExpiry(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Tomorrow's date as YYYY-MM-DD (for expiration date fields, which must be in the future). */
export function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Most a resident can ask for of one medicine in an online medicine request (same as the backend setting).
 *  Restock requests have no quantity. */
export const MAX_REQUEST_QUANTITY = 10;
/** Walk-in releases: 1 to this many of each medicine (keep in sync with botika.max_walk_in_quantity in the backend). */
export const MAX_WALK_IN_QUANTITY = 100;

/**
 * Checks a requested quantity and returns a warning to show under the field, or null when it is fine.
 * `available` limits medicine requests; `min` is used by restock requests (must be more than what is left).
 */
/** max: most per medicine (default: the limit of an online request; walk-in uses MAX_WALK_IN_QUANTITY). */
export function quantityWarning(quantity: number, unit: string, opts: { available?: number; min?: number; max?: number } = {}): string | null {
  const min = opts.min ?? 1;
  const max = opts.max ?? MAX_REQUEST_QUANTITY;
  const walkIn = opts.max !== undefined && opts.max !== MAX_REQUEST_QUANTITY;
  if (!Number.isFinite(quantity) || !Number.isInteger(quantity)) return 'Enter a whole number.';
  if (quantity < min) return min > 1 ? `Enter more than ${min - 1} ${unit} (that much is still available).` : 'Enter at least 1.';
  if (quantity > max) return walkIn ? `At most ${max} ${unit} can be given per medicine.` : `You can request at most ${max} ${unit} per medicine.`;
  if (opts.available !== undefined && quantity > opts.available) {
    return walkIn ? `Only ${opts.available} ${unit} can be given right now (stock not set aside for approved requests).`
      : `Only ${opts.available} ${unit} available right now. Lower the quantity, or send a restock request for more.`;
  }
  return null;
}

/** Words about the system that must not be in a password (the backend refuses the same). */
const SYSTEM_WORDS = ['botika', 'bulan', 'sorsogon', 'bayan', 'pharmacy'];

/**
 * True when the password contains the person's own details (name parts, the part of the email before "@",
 * the mobile number — 4+ characters) or the name of the Botika. Mirrors the backend's NotGuessablePassword
 * rule so the checklist matches; the backend also refuses very common passwords.
 */
export function passwordHasPersonalInfo(password: string, details: (string | null | undefined)[]): boolean {
  const pw = password.toLowerCase();
  const words = details.flatMap((d) => {
    const v = (d ?? '').trim().toLowerCase();
    if (!v) return [];
    if (v.includes('@')) return [v.split('@')[0]];
    if (/^\+?\d[\d\s-]*$/.test(v)) return [v.replace(/\D/g, '')];
    return v.split(/[\s.'-]+/);
  }).filter((w) => w.length >= 4);
  return [...SYSTEM_WORDS, ...words].some((w) => pw.includes(w));
}
