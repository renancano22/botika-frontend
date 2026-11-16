import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const compiled = await build({ entryPoints: ['src/medicineRequest.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { validatePrescriptionDrafts: validate, prescriptionPayload, prescriptionDraftsFromRequest, storedPrescriptions, retainPrescriptionCoverage } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const medicines = [1, 2, 3].map((medicine_id) => ({ medicine_id, medicine_name: `Medicine ${medicine_id}` }));
const makeFile = (n) => { const content = Buffer.from(`%PDF-1.4\nPrescription ${n}`); return { name: `Doctor-${n}.pdf`, type: 'application/pdf', size: content.length, data: `data:application/pdf;base64,${content.toString('base64')}` }; };
const draft = (n, medicine_ids) => ({ key: String(n), medicine_ids, file: makeFile(n) });

test('one prescription can cover all three prescription medicines', () => assert.deepEqual(validate(medicines, [draft(1, [1, 2, 3])]), {}));
test('separate doctors can cover separate medicines, including shared prescriptions', () => {
  assert.deepEqual(validate(medicines, [draft(1, [1, 2]), draft(2, [3])]), {});
  assert.deepEqual(validate(medicines, medicines.map((m) => draft(m.medicine_id, [m.medicine_id]))), {});
});
test('every prescription medicine needs coverage and every file needs an assignment', () => {
  assert.match(validate(medicines, [draft(1, [1, 2])]).prescription, /Medicine 3/);
  assert.ok(validate(medicines, [draft(1, [])])['prescriptions.0.medicine_ids']);
  assert.ok(validate(medicines, [draft(1, [1, 2, 3, 99])])['prescriptions.0.medicine_ids']);
  assert.ok(validate(medicines, [draft(1, [1, 1, 2, 3])])['prescriptions.0.medicine_ids']);
});
test('duplicate files and excessive file count are refused', () => {
  assert.ok(validate(medicines, [draft(1, [1, 2]), draft(1, [3])])['prescriptions.1.file']);
  assert.ok(validate(medicines, Array.from({ length: 6 }, (_, i) => draft(i, [1, 2, 3]))).prescription);
});
test('combined size is checked for stored prescriptions too', () => {
  const files = medicines.map((m) => ({ key: String(m.medicine_id), file: null, medicine_ids: [m.medicine_id], existing: { prescription_id: m.medicine_id, size: 3 * 1024 * 1024 } }));
  assert.match(validate(medicines, files).prescription, /8 MB/);
});
test('incomplete uploads cannot satisfy coverage', () => {
  assert.ok(validate(medicines, [{ key: 'empty', file: null, medicine_ids: [1, 2, 3] }]).prescription);
});
test('existing single-file requests remain readable and get their original coverage', () => {
  const prescription = { prescription_id: 10, file_name: 'old.pdf', size: 123 };
  const request = { prescription, items: medicines.map((m) => ({ medicine_id: m.medicine_id, medicine: { ...m, requires_prescription: true } })) };
  assert.deepEqual(storedPrescriptions(request), [prescription]);
  const drafts = prescriptionDraftsFromRequest(request);
  assert.deepEqual(drafts[0].medicine_ids, [1, 2, 3]);
  assert.deepEqual(prescriptionPayload(drafts), [{ existing_id: 10, medicine_ids: [1, 2, 3] }]);
});
test('new payload contains each file and its explicit medicine IDs', () => {
  const files = [draft(1, [1, 2]), draft(2, [3])];
  assert.deepEqual(prescriptionPayload(files), files.map((p) => ({ name: p.file.name, data: p.file.data, medicine_ids: p.medicine_ids })));
});
test('adding a medicine preserves finished uploads without silently covering the new medicine', () => {
  const existing = [draft(1, [1, 2])];
  const kept = retainPrescriptionCoverage(existing, [1, 2, 3]);
  assert.deepEqual(kept, existing);
  assert.match(validate(medicines, kept).prescription, /Medicine 3/);
});
test('removing medicines prunes their assignments and removing or canceling all clears their files', () => {
  assert.deepEqual(retainPrescriptionCoverage([draft(1, [1, 2])], [2]), [draft(1, [2])]);
  assert.deepEqual(retainPrescriptionCoverage([draft(1, [1])], [3]), []);
  assert.deepEqual(retainPrescriptionCoverage([draft(1, [1, 2])], []), []);
});
