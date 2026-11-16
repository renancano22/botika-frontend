import { passwordHasPersonalInfo } from './validation';

export interface RegistrationForm {
  name: string;
  barangay: string;
  address_line: string;
  contact_no: string;
  email: string;
  password: string;
  password_confirmation: string;
}

/** Keep the common-password list aligned with backend NotGuessablePassword. */
const COMMON = new Set([
  'password1', 'password12', 'password123', 'password1234', 'passw0rd', 'pass1234', 'pass12345',
  'qwerty12', 'qwerty123', 'qwerty1234', 'qwe12345', 'abc12345', 'abcd1234', 'abc123456', 'a1b2c3d4',
  '1q2w3e4r', '1qaz2wsx', 'zaq12wsx', 'q1w2e3r4', 'asdf1234', 'test1234', 'admin123', 'admin1234',
  'welcome1', 'welcome123', 'letmein1', 'iloveyou1', 'iloveyou2', 'iloveyou143', 'mahalkita1', 'iloveu143',
  'changeme1', 'default1', 'temp1234', 'trustno1', 'sunshine1', 'princess1', 'football1', 'baseball1',
  'monkey123', 'dragon123', 'master123', 'superman1', 'batman123', 'michael1', 'charlie1',
  'pilipinas1', 'philippines1', 'user1234', 'login123', 'secret12',
]);

export function normalizeRegistration(form: RegistrationForm): RegistrationForm {
  const mobile = form.contact_no.trim().replace(/[\s()-]/g, '');
  const contact_no = /^(?:\+?63)9\d{9}$/.test(mobile) ? `0${mobile.replace(/^\+?63/, '')}`
    : /^9\d{9}$/.test(mobile) ? `0${mobile}` : mobile;
  return { ...form, name: form.name.trim().replace(/\s+/g, ' '), barangay: form.barangay.trim(),
    address_line: form.address_line.trim(), email: form.email.trim().toLowerCase(), contact_no };
}

export function registrationPasswordChecks(form: RegistrationForm) {
  const f = normalizeRegistration(form);
  return [
    { ok: f.password.length >= 8 && f.password.length <= 100, text: '8–100 characters' },
    { ok: /[A-Za-z]/.test(f.password) && /[0-9]/.test(f.password), text: 'At least one letter and one number' },
    { ok: !!f.password && !COMMON.has(f.password.toLowerCase()), text: 'Not a common password' },
    { ok: !!f.password && !passwordHasPersonalInfo(f.password, [f.name, f.email, f.contact_no]), text: 'No name, email, mobile number or Botika name' },
    { ok: !!f.password && f.password === f.password_confirmation, text: 'Passwords match' },
  ];
}

export function validateRegistration(form: RegistrationForm, barangays: readonly string[] | null): Partial<Record<keyof RegistrationForm, string>> {
  const f = normalizeRegistration(form);
  const errors: Partial<Record<keyof RegistrationForm, string>> = {};
  if (!f.name) errors.name = 'Enter your full name.';
  else if (f.name.length > 100 || !/^[\p{L} .'\-]+$/u.test(f.name) || (f.name.match(/\p{L}/gu)?.length ?? 0) < 2) {
    errors.name = 'Use 2–100 characters with at least two letters. Spaces, periods, hyphens and apostrophes are allowed.';
  }
  if (!barangays?.length) errors.barangay = 'The barangay list is unavailable. Please reload it and try again.';
  else if (!barangays.includes(f.barangay)) errors.barangay = 'Choose a barangay of Bulan from the list.';
  if (f.address_line.length > 120 || /[\u0000-\u001f\u007f]/.test(f.address_line)) errors.address_line = 'Use at most 120 characters without line breaks or control characters.';
  if (!f.contact_no) errors.contact_no = 'Enter your mobile number.';
  else if (form.contact_no.length > 24 || !/^09\d{9}$/.test(f.contact_no)) errors.contact_no = 'Enter a valid Philippine mobile number, e.g. 09171234567 or +63 917 123 4567.';
  if (f.email && (f.email.length > 255 || !/^[A-Za-z0-9_%+\-]+(?:\.[A-Za-z0-9_%+\-]+)*@gmail\.com$/.test(f.email))) {
    errors.email = 'Enter a valid Gmail address, e.g. name@gmail.com, or leave it blank.';
  }
  const checks = registrationPasswordChecks(f);
  if (!f.password) errors.password = 'Create a password.';
  else if (!checks[0].ok || !checks[1].ok) errors.password = 'Use 8–100 characters with at least one letter and one number.';
  else if (!checks[2].ok) errors.password = 'This password is too common. Choose a different one.';
  else if (!checks[3].ok) errors.password = 'Do not include your name, email, mobile number or the name of the Botika.';
  if (!f.password_confirmation) errors.password_confirmation = 'Confirm your password.';
  else if (!checks[4].ok) errors.password_confirmation = 'The two passwords do not match.';
  return errors;
}
