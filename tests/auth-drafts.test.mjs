import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const compiled = await build({ entryPoints: ['src/authDrafts.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const drafts = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const now = 1800000000000;
const storage = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
};
const form = { name: 'Ana Maria Santos Cruz', barangay: 'Gate', address_line: 'Purok 3', contact_no: '09171234567', email: 'sample@gmail.com', password: 'NeverStore4821', password_confirmation: 'NeverStore4821', code: '654321', verified: true };

test('registration restores only the permitted details and never persists credentials', () => {
  const tab = storage();
  drafts.saveRegistrationDraft(form, tab, now);
  const raw = tab.getItem(drafts.REGISTRATION_DRAFT_KEY);
  for (const secret of ['password', 'NeverStore4821', '654321', 'verified']) assert.ok(!raw.includes(secret));
  assert.deepEqual(drafts.readRegistrationDraft(tab, now + 1), { restored: true, details: {
    name: form.name, barangay: form.barangay, address_line: form.address_line, contact_no: form.contact_no, email: form.email,
  } });
});

test('reset restores the login and unexpired progress without storing code or password', () => {
  const tab = storage();
  drafts.saveResetDraft('sample@gmail.com', now, tab, now);
  assert.deepEqual(drafts.readResetDraft(tab, now + 1000), { login: 'sample@gmail.com', requestedAt: now, expired: false });
  assert.deepEqual(Object.keys(JSON.parse(tab.getItem(drafts.RESET_DRAFT_KEY)).data), ['login', 'requestedAt']);
  assert.deepEqual(drafts.readResetDraft(tab, now + 10 * 60000), { login: 'sample@gmail.com', requestedAt: null, expired: true });
});

test('drafts expire after thirty minutes and do not leak into another tab storage', () => {
  const tab = storage(), other = storage();
  drafts.saveRegistrationDraft(form, tab, now);
  drafts.saveResetDraft('sample@gmail.com', now, tab, now);
  assert.equal(drafts.readRegistrationDraft(other, now).restored, false);
  assert.equal(drafts.readRegistrationDraft(tab, now + 30 * 60000).restored, false);
  assert.equal(drafts.readResetDraft(tab, now + 30 * 60000).login, '');
  assert.equal(tab.getItem(drafts.REGISTRATION_DRAFT_KEY), null);
  assert.equal(tab.getItem(drafts.RESET_DRAFT_KEY), null);
});

test('corrupt or future drafts are ignored and restored fields are type checked and bounded', () => {
  const tab = storage();
  for (const value of ['invalid', 'null', '{}', JSON.stringify({ version: 1, updatedAt: now + 1000, data: form })]) {
    tab.setItem(drafts.REGISTRATION_DRAFT_KEY, value);
    assert.equal(drafts.readRegistrationDraft(tab, now).restored, false);
  }
  tab.setItem(drafts.REGISTRATION_DRAFT_KEY, JSON.stringify({ version: 1, updatedAt: now, data: { name: 'a'.repeat(200), email: ['invalid'], password: 'NeverStore4821' } }));
  const restored = drafts.readRegistrationDraft(tab, now);
  assert.equal(restored.details.name.length, 100);
  assert.equal(restored.details.email, '');
  assert.equal(restored.details.password, undefined);
});

test('clear actions and blank drafts remove only the corresponding saved details', () => {
  const tab = storage();
  tab.setItem('unrelated', 'keep');
  drafts.saveRegistrationDraft(form, tab, now);
  drafts.saveResetDraft('sample@gmail.com', now, tab, now);
  drafts.clearRegistrationDraft(tab);
  assert.equal(drafts.readRegistrationDraft(tab, now).restored, false);
  assert.equal(drafts.readResetDraft(tab, now).login, 'sample@gmail.com');
  drafts.clearAuthDrafts(tab);
  assert.equal(drafts.readResetDraft(tab, now).login, '');
  assert.equal(tab.getItem('unrelated'), 'keep');
  drafts.saveRegistrationDraft(form, tab, now);
  drafts.saveRegistrationDraft({ name: '', barangay: '', address_line: '', contact_no: '', email: '' }, tab, now);
  assert.equal(tab.getItem(drafts.REGISTRATION_DRAFT_KEY), null);
});

test('blocked browser storage never prevents the forms from working', () => {
  const blocked = { getItem() { throw Error('Disabled'); }, setItem() { throw Error('Disabled'); }, removeItem() { throw Error('Disabled'); } };
  assert.equal(drafts.readRegistrationDraft(blocked, now).restored, false);
  assert.equal(drafts.readResetDraft(blocked, now).login, '');
  assert.doesNotThrow(() => drafts.saveRegistrationDraft(form, blocked, now));
  assert.doesNotThrow(() => drafts.saveResetDraft('sample@gmail.com', now, blocked, now));
  assert.doesNotThrow(() => drafts.clearAuthDrafts(blocked));
});
