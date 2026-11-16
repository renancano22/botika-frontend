import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const compiled = await build({ entryPoints: ['src/medicineRequest.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { validateMedicineRequest: validate, medicineRequestErrors, MAX_PRESCRIPTION_BYTES } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const medicine = { medicine_id: 1, medicine_name: 'Paracetamol', category: 'Pain relief', unit: 'tablet', available_stock: 10, status: 'available' };
const item = (changes = {}) => ({ medicine, quantity: 1, ...changes });
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jpa0AAAAASUVORK5CYII=';
const prescription = { name: 'prescription.png', type: 'image/png', size: Buffer.from(png, 'base64').length, data: `data:image/png;base64,${png}` };
const rx = item({ medicine: { ...medicine, requires_prescription: true } });

test('non-prescription medicine accepts a valid quantity and optional reason', () => {
  assert.deepEqual(validate([item()], '', null), {});
  assert.deepEqual(validate([item({ quantity: 10 })], 'As advised\nby my doctor.', null), {});
});
test('empty, oversized, duplicate or invalid medicine lists are refused', () => {
  assert.ok(validate([], '', null).items);
  assert.ok(validate(Array.from({ length: 6 }, (_, i) => item({ medicine: { ...medicine, medicine_id: i + 1 } })), '', null).items);
  assert.ok(validate([item(), item()], '', null)['items.1.quantity']);
  assert.ok(validate([item({ medicine: { ...medicine, medicine_id: -1 } })], '', null)['items.0.quantity']);
});
test('five distinct medicines are allowed and a sixth is refused', () => {
  const items = Array.from({ length: 6 }, (_, i) => item({ medicine: { ...medicine, medicine_id: i + 1 }, quantity: 10 }));
  assert.deepEqual(validate(items.slice(0, 5), '', null), {});
  assert.equal(validate(items, '', null).items, 'One request can have at most 5 medicines.');
});
test('quantities must be whole, positive, within stock and within the request limit', () => {
  for (const quantity of [0, -1, NaN, Infinity, 1.5, 11]) assert.ok(validate([item({ quantity })], '', null)['items.0.quantity']);
  assert.ok(validate([item({ medicine: { ...medicine, available_stock: 2 }, quantity: 3 })], '', null)['items.0.quantity']);
});
test('stock changes and already-open requests block review', () => {
  for (const status of ['out_of_stock', 'unrecorded']) assert.ok(validate([item({ medicine: { ...medicine, status } })], '', null)['items.0.quantity']);
  assert.ok(validate([item({ medicine: { ...medicine, available_stock: 0 } })], '', null)['items.0.quantity']);
  assert.ok(validate([item()], '', null, new Set([1]))['items.0.quantity']);
});
test('reason accepts 500 characters and ordinary newlines but refuses excess and controls', () => {
  assert.equal(validate([item()], 'x'.repeat(500), null).note, undefined);
  assert.ok(validate([item()], 'x'.repeat(501), null).note);
  assert.ok(validate([item()], 'reason\u0000text', null).note);
});
test('prescription medicines require a valid supported nonempty upload', () => {
  assert.ok(validate([rx], '', null).prescription);
  assert.deepEqual(validate([rx], '', prescription), {});
  for (const changes of [{ name: '' }, { name: 'x'.repeat(201) }, { size: 0 }, { size: MAX_PRESCRIPTION_BYTES + 1 },
    { type: 'text/plain' }, { data: 'data:image/png;base64,' }, { data: 'data:image/png;base64,####' }, { size: 1 }]) {
    assert.ok(validate([rx], '', { ...prescription, ...changes }).prescription);
  }
});
test('server errors retain row indexes and map nested prescription errors', () => {
  assert.deepEqual(medicineRequestErrors({ response: { data: { errors: { 'items.1.quantity': ['Only 2 available.'],
    'prescription.data': ['Invalid file.'], open_request_id: '5' } } } }), { 'items.1.quantity': 'Only 2 available.', prescription: 'Invalid file.' });
  assert.deepEqual(medicineRequestErrors(new Error('offline')), {});
});
