import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const compiled = await build({ entryPoints: ['src/registration.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { validateRegistration, normalizeRegistration, registrationPasswordChecks, passwordRequirementChecks } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const barangays = ['Gate', 'Zone I Poblacion'];
const valid = { name: 'Ana Dela Peña', barangay: 'Gate', address_line: '', contact_no: '09171234567', email: '', password: 'Kalinga4821', password_confirmation: 'Kalinga4821' };

test('all required fields show errors; optional email and address stay optional', () => {
  const empty = Object.fromEntries(Object.keys(valid).map((key) => [key, '']));
  assert.deepEqual(Object.keys(validateRegistration(empty, barangays)).sort(), ['name', 'barangay', 'contact_no', 'password', 'password_confirmation'].sort());
  assert.deepEqual(validateRegistration(valid, barangays), {});
});

test('normalizes names, optional Gmail and mobile formats without changing passwords', () => {
  for (const contact_no of ['09171234567', '9171234567', '639171234567', '+63 917 123 4567', '(0917) 123-4567']) {
    const form = { ...valid, name: '  Ana   Dela Peña ', contact_no, email: ' ANA.CRZ@GMAIL.COM ' };
    assert.deepEqual(validateRegistration(form, barangays), {});
    assert.equal(normalizeRegistration(form).contact_no, valid.contact_no);
    assert.equal(normalizeRegistration(form).name, valid.name);
    assert.equal(normalizeRegistration(form).email, 'ana.crz@gmail.com');
  }
  assert.equal(normalizeRegistration({ ...valid, password: '  Kalinga4821  ' }).password, '  Kalinga4821  ');
});

test('full names require first and last names and support accents, middle initials, apostrophes and hyphens', () => {
  for (const name of ['  ', '...', " -.' ", 'A.', 'Ana123', '<script>']) assert.ok(validateRegistration({ ...valid, name }, barangays).name);
  for (const name of ['Ana', 'Santos', 'Ña', 'A. Cruz', 'Ana C.', 'Ana Jr.', 'Ana II', 'Ana Sr. Jr.', 'Ana . Cruz', 'Ana - Cruz']) {
    assert.ok(validateRegistration({ ...valid, name }, barangays).name, name);
  }
  for (const name of ["Ma. O'Neil-Cruz", 'Juan Dela Peña', 'Ana M. Cruz', 'Ana Maria Cruz', 'Ana Cruz', 'Ana Cruz Jr.', 'Ana Cruz III', 'Ña Peña', 'Ai Ng']) {
    assert.equal(validateRegistration({ ...valid, name }, barangays).name, undefined, name);
  }
});

test('invalid mobile text, incomplete numbers and multiple recipients are refused', () => {
  for (const contact_no of ['abc09171234567', '0917123456', '08171234567', '09171234567,09181234567', '09+171234567']) {
    assert.ok(validateRegistration({ ...valid, contact_no }, barangays).contact_no);
  }
});

test('barangay must be from a successfully loaded list', () => {
  for (const list of [null, []]) assert.ok(validateRegistration(valid, list).barangay);
  assert.ok(validateRegistration({ ...valid, barangay: 'Unknown' }, barangays).barangay);
});

test('optional email still rejects malformed or non-Gmail values', () => {
  for (const email of ['user@yahoo.com', 'user@@gmail.com', 'a..b@gmail.com', '.user@gmail.com', 'user.@gmail.com', 'a b@gmail.com']) {
    assert.ok(validateRegistration({ ...valid, email }, barangays).email);
  }
});

test('field length and address control character limits are enforced', () => {
  for (const [key, value] of [['name', 'a'.repeat(101)], ['email', 'a'.repeat(256)], ['address_line', 'a'.repeat(121)], ['address_line', 'Purok\n3']]) {
    assert.ok(validateRegistration({ ...valid, [key]: value }, barangays)[key]);
  }
});

test('passwords reject short, missing-letter, missing-number, common and personal values', () => {
  for (const password of ['Short12', '12345678', 'abcdefgh', 'Password123', 'Peña123456', '09171234567a', 'Botika9876', 'x'.repeat(101)]) {
    assert.ok(validateRegistration({ ...valid, password, password_confirmation: password }, barangays).password);
  }
  assert.ok(validateRegistration({ ...valid, email: 'ana.crz@gmail.com', password: 'ana.crz1234', password_confirmation: 'ana.crz1234' }, barangays).password);
});

test('confirmation and checklist react when the password changes', () => {
  assert.ok(registrationPasswordChecks(valid).every((check) => check.ok));
  const changed = { ...valid, password: 'Another4821' };
  assert.ok(validateRegistration(changed, barangays).password_confirmation);
  assert.equal(registrationPasswordChecks(changed).at(-1).ok, false);
});

test('reset checklist shares the password policy and checks the known login without claiming to know the account name', () => {
  const checks = (password, confirmation = password) => passwordRequirementChecks(password, confirmation, ['ana.crz@gmail.com'], 'No login details or Botika name');
  assert.ok(checks('Kalinga4821').every((check) => check.ok));
  assert.equal(checks('Password123')[2].ok, false);
  assert.equal(checks('ana.crz1234')[3].ok, false);
  assert.equal(checks('Botika1234')[3].ok, false);
  assert.equal(checks('Kalinga4821', 'Different4821')[4].ok, false);
  assert.equal(checks('Kalinga4821')[3].text, 'No login details or Botika name');
});
