import { useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, formatDate } from '../../api';
import { useAuth } from '../../auth';
import { useApi } from '../../hooks';
import { Badge, Card, Empty, Loading, Message, Modal } from '../../components/ui';
import { unitPlural } from '../../components/RequestCards';
import type { Medicine } from '../../types';
import { RxBadge } from '../../components/Prescription';
import BackButton from '../../components/BackButton';
import { FIELD } from '../../validation';
import { ChangeList, confirmAction, confirmSave, LoadError, toast, useFormErrors } from '../../components/feedback';
import { Pagination, rowNo, useDebounced, usePagedApi } from '../../components/Pagination';
import { Hl } from '../../components/SearchHighlight';

const EMPTY = { generic_name: '', strength: '', dosage_form: '', category: '', unit: '', reorder_level: 20, requires_prescription: false };
type Form = typeof EMPTY;

/** "Amoxicillin 500mg Capsule" — the same name the server builds. */
const displayName = (f: Form) => [f.generic_name, f.strength, f.dosage_form].map((v) => v.trim()).filter(Boolean).join(' ');
const qty = (n: number, unit: string) => `${n} ${n === 1 ? unit : unitPlural(unit)}`;

/** A registered medicine that is the same as the one being added (duplicate medicine detection). */
interface Duplicate { medicine_id: number; medicine_code: string; medicine_name: string; exact: boolean }
/** GET /medicines/check: is it already registered, and does the category fit the medicine? */
interface MedicineCheck { duplicate: Duplicate | null; duplicate_message: string | null; categories: string[] | null; category_message: string | null }

/**
 * Medicine List (admin & staff): the Botika ng Bayan medicine list with generic name, category,
 * strength, dosage form, stock, expiration dates of its batches, stock status and last update.
 * Medicines whose stock was never recorded are shown as "Not recorded" until staff record a stock-in
 * or confirm there is no stock. Delete is admin only.
 */
export default function Medicines() {
  const { user, can } = useAuth();
  const canManage = can('medicines.manage');
  const canStock = can('inventory.manage');
  // The Actions column is shown only when the user has at least one action (Edit, Delete, Record stock).
  const showActions = canManage || canStock || user?.role === 'admin';
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  // ?status=low_stock / out_of_stock / unrecorded (from the dashboard tiles) opens the list already filtered.
  const status = params.get('status') ?? '';
  const category = params.get('category') ?? '';
  const setFilter = (key: 'status' | 'category', value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  };
  // One page at a time; the search, category and stock status are applied to the whole list on the server.
  const term = useDebounced(search.trim()); // what the list was searched for (marked in the rows)
  const list = usePagedApi<Medicine, { unrecorded: number }>('/medicines', { search: term, category, status },
    { table: 'medicines', refreshMs: 30000 });
  const { data, errorInfo, loading, reload, rows: shown, meta } = list;
  const { data: categories } = useApi<string[]>('/medicines/categories');
  const { data: forms } = useApi<Record<string, string>>('/medicines/dosage-forms');
  const unrecorded = data?.unrecorded ?? 0;
  const filtered = !!search.trim() || !!category || !!status;

  const [editing, setEditing] = useState<Medicine | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  // Edit medicine: the values when the form was opened, so Save is only possible after something was changed.
  const [original, setOriginal] = useState<Form | null>(null);
  const fe = useFormErrors(['generic_name', 'strength', 'dosage_form', 'category', 'unit', 'reorder_level', 'requires_prescription']);
  const [busy, setBusy] = useState(false);
  const [savedDuplicate, setSavedDuplicate] = useState<{ duplicate: Duplicate; message: string } | null>(null);

  // While typing in Add / Edit medicine: the server checks for the same medicine and the right category.
  const checkKey = useDebounced(form ? JSON.stringify({
    generic_name: form.generic_name.trim(), strength: form.strength.trim(), dosage_form: form.dosage_form, category: form.category,
    ...(editing ? { ignore: editing.medicine_id } : {}),
  }) : '', 400);
  const checkParams = useMemo(() => (checkKey ? JSON.parse(checkKey) as Record<string, string> : null), [checkKey]);
  const canCheck = !!form && canManage && (checkParams?.generic_name.length ?? 0) >= 2;
  const { data: check } = useApi<MedicineCheck>(canCheck ? '/medicines/check' : null, checkParams ?? undefined);
  // Editing without changing the medicine itself (name, strength, form) is never treated as a duplicate.
  const identityChanged = !editing || !form
    || form.generic_name.trim() !== (editing.generic_name ?? editing.medicine_name) || form.strength.trim() !== (editing.strength ?? '')
    || form.dosage_form !== (editing.dosage_form ?? '');
  const live = canCheck && check ? check : null;
  const duplicate = (identityChanged && live?.duplicate && live.duplicate_message ? { duplicate: live.duplicate, message: live.duplicate_message } : null) ?? savedDuplicate;
  const categoryWarning = live && form?.category ? live.category_message : null;
  const same = (f: Form) => JSON.stringify([f.generic_name.trim(), f.strength.trim(), f.dosage_form, f.category, f.unit, Number(f.reorder_level), f.requires_prescription]);
  const unchanged = !!editing && !!form && !!original && same(form) === same(original);

  const open = (m?: Medicine) => {
    setEditing(m ?? null);
    setSavedDuplicate(null);
    fe.clear();
    const start = m ? {
      generic_name: m.generic_name ?? m.medicine_name, strength: m.strength ?? '', dosage_form: m.dosage_form ?? '',
      category: m.category, unit: m.unit, reorder_level: m.reorder_level ?? 20,
      requires_prescription: !!m.requires_prescription,
    } : { ...EMPTY, category: category || '' };
    setForm(start);
    setOriginal(m ? start : null);
  };

  /** Choosing a dosage form fills in the unit it is counted in (tablet, bottle, tube…). */
  const chooseForm = (dosage_form: string) => form && setForm({ ...form, dosage_form, unit: forms?.[dosage_form] ?? form.unit });

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!form || busy || unchanged) return; // nothing was changed: nothing to save
    // Are you sure? Edit: what will change; Add: the new medicine.
    const yesNo = (v: boolean) => (v ? 'Yes' : 'No');
    const rows = editing && original ? ([
      ['Generic name', original.generic_name.trim(), form.generic_name.trim()],
      ['Strength', original.strength.trim(), form.strength.trim()],
      ['Dosage form', original.dosage_form, form.dosage_form],
      ['Category', original.category, form.category],
      ['Counted per (unit)', original.unit, form.unit],
      ['Reorder level', String(original.reorder_level), String(form.reorder_level)],
      ['Requires prescription', yesNo(original.requires_prescription), yesNo(form.requires_prescription)],
    ] as const).filter(([, a, b]) => a !== b).map(([label, from, to]) => ({ label, from, to })) : [];
    const ok = await confirmSave(editing ? {
      title: 'Save changes to this medicine?',
      message: <>You are about to update <strong>{displayName(original ?? form)}</strong>.</>,
      details: <ChangeList rows={rows} />,
    } : {
      title: 'Add this medicine?',
      message: <><strong>{displayName(form)}</strong> ({form.category}, counted per {form.unit}) will be added to the medicine list.</>,
      confirmLabel: 'Confirm and Add',
    });
    if (!ok) return;
    setBusy(true);
    fe.clear();
    try {
      if (editing) await api.put(`/medicines/${editing.medicine_id}`, form);
      else await api.post('/medicines', form);
      toast.success(editing ? 'Medicine updated' : 'Medicine added', {
        description: editing ? `The changes to ${displayName(form)} were saved.` : `${displayName(form)} was added to the medicine list. Record its stock in Stock & Batches.`,
      });
      setForm(null);
      reload(true);
    } catch (err) {
      // Already registered: show the warning with the way to the existing medicine's stock-in.
      const body = (err as { response?: { data?: { duplicate?: Duplicate; message?: string } } }).response?.data;
      if (body?.duplicate && body.message) setSavedDuplicate({ duplicate: body.duplicate, message: body.message });
      else fe.fromError(err);
    } finally { setBusy(false); }
  };

  const confirmNoStock = (m: Medicine) => confirmAction({
    tone: 'warning',
    title: 'Confirm no stock?',
    message: <>Confirm that there is no stock of <strong>{m.medicine_name}</strong> right now.</>,
    details: 'It will be shown as "Out of stock" and residents can send a restock request.',
    confirmLabel: 'Yes, no stock',
    busyLabel: 'Saving…',
    onConfirm: async () => {
      await api.post(`/medicines/${m.medicine_id}/confirm-no-stock`);
      toast.success('Marked as out of stock', { description: `${m.medicine_name} is now shown as out of stock.` });
      reload(true);
    },
  });

  const remove = (m: Medicine) => confirmAction({
    tone: 'danger',
    title: 'Delete this medicine?',
    message: <>You are about to delete <strong>{m.medicine_name}</strong>.</>,
    details: 'This also removes its stock batches and records. This cannot be undone.',
    confirmLabel: 'Delete medicine',
    busyLabel: 'Deleting…',
    onConfirm: async () => {
      await api.delete(`/medicines/${m.medicine_id}`);
      toast.success('Medicine deleted', { description: `${m.medicine_name} was removed from the medicine list.` });
      reload(true);
    },
  });

  return (
    <div className="page">
      <BackButton linkedOnly />
      <header className="page-head">
        <div>
          <div className="page-title"><h1>Medicine List</h1></div>
          <p className="muted">Botika ng Bayan medicine list, stock on hand, batches and expiration dates.</p>
        </div>
        <div className="mi-head-actions">
          {canStock && <Link className="btn btn-outline" to="/inventory?stockin=new">+ Stock-in</Link>}
          {canManage && <button className="btn" onClick={() => open()}>+ Add medicine</button>}
        </div>
      </header>
      <LoadError error={errorInfo} onRetry={() => reload()} />

      {unrecorded > 0 && status !== 'unrecorded' && (
        <div className="mi-verify" role="note">
          <strong>{unrecorded} {unrecorded === 1 ? 'medicine has' : 'medicines have'} no recorded stock yet.</strong>
          <span>Count the stock and record a stock-in with its expiration date, or confirm that there is none. Until then residents see them as "Not yet available".</span>
          <button className="btn btn-outline btn-sm" onClick={() => setFilter('status', 'unrecorded')}>Show them</button>
        </div>
      )}

      <Card actions={
        <div className="filters">
          <select value={category} onChange={(e) => setFilter('category', e.target.value)} aria-label="Category">
            <option value="">All categories</option>
            {categories?.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={status} onChange={(e) => setFilter('status', e.target.value)} aria-label="Stock status">
            <option value="">All stock statuses</option>
            <option value="available">Available</option>
            <option value="low_stock">Low stock</option>
            <option value="out_of_stock">Out of stock</option>
            <option value="unrecorded">Not recorded (needs verification)</option>
          </select>
          <input className="search" placeholder="Search name or category…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      }>
        {loading && !data ? <Loading /> : !data ? null : !shown.length ? <Empty>{filtered ? 'No medicines match these filters.' : 'No medicines yet.'}</Empty> : (
          <table className={`mi-table ${loading ? 'tbl-updating' : ''}`}>
            <thead>
              <tr>
                <th className="col-no">No.</th><th>Medicine ID</th><th>Generic Name</th><th>Category</th><th>Strength</th><th>Dosage Form</th>
                <th>Quantity in Stock</th><th>Expiration Date</th><th>Stock Status</th><th>Date Last Updated</th>{showActions && <th className="right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {shown.map((m, i) => (
                <tr key={m.medicine_id} className={m.status === 'unrecorded' ? 'mi-unrecorded' : ''}>
                  <td className="col-no">{rowNo(meta, i)}</td>
                  <td className="nowrap mi-code">{m.medicine_code}</td>
                  <td>
                    <strong><Hl q={term}>{m.generic_name ?? m.medicine_name}</Hl></strong>
                    {m.requires_prescription && <div><RxBadge small /></div>}
                  </td>
                  <td><Hl q={term}>{m.category}</Hl></td>
                  <td>{m.strength || <span className="mi-missing">Not specified</span>}</td>
                  <td>{m.dosage_form || <span className="mi-missing">Not specified</span>}</td>
                  <td className="nowrap">
                    {m.status === 'unrecorded' ? <span className="mi-missing">Not recorded</span> : qty(m.available_stock, m.unit)}
                    {!!m.reserved_stock && <div className="muted small">{m.reserved_stock} reserved · {m.free_stock} free</div>}
                  </td>
                  <td className="nowrap">
                    {/* one line per stock batch: expiration date (quantity) */}
                    {m.batches?.length ? m.batches.map((b) => (
                      <div key={b.inventory_id} className={`mi-batch mi-exp-${b.expiry_status}`}>{formatDate(b.expiration_date)} <span className="muted small">({b.quantity})</span></div>
                    )) : '—'}
                  </td>
                  <td><Badge value={m.status} /></td>
                  <td className="nowrap">{m.last_updated ? formatDate(m.last_updated, true) : '—'}</td>
                  {showActions && <td className="right nowrap">
                    {m.status === 'unrecorded' && (
                      <>
                        {canStock && <><Link className="btn btn-sm" to={`/inventory?stockin=${m.medicine_id}`}>Record stock</Link>{' '}</>}
                        {canManage && <><button className="btn btn-outline btn-sm" onClick={() => confirmNoStock(m)}>No stock</button>{' '}</>}
                      </>
                    )}
                    {canManage && <><button className="btn btn-outline btn-sm" onClick={() => open(m)}>Edit</button>{' '}</>}
                    {user?.role === 'admin' && <button className="btn btn-danger btn-sm" onClick={() => remove(m)}>Delete</button>}
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination meta={meta} onPage={list.setPage} onPerPage={list.setPerPage} noun="medicines" busy={loading} />
      </Card>

      {form && (
        <Modal title={editing ? 'Edit medicine' : 'Add medicine'} onClose={() => setForm(null)}>
          <form onSubmit={save}>
            <Message>{fe.general}</Message>
            <label>Generic name
              <input value={form.generic_name} onChange={(e) => { setSavedDuplicate(null); setForm({ ...form, generic_name: e.target.value }); }} placeholder="e.g. Amoxicillin" required minLength={2} maxLength={150} {...FIELD.medicineName} {...fe.invalid('generic_name')} />{fe.error('generic_name')}
            </label>
            <div className="row">
              <label>Strength
                <input value={form.strength} onChange={(e) => { setSavedDuplicate(null); setForm({ ...form, strength: e.target.value }); }} placeholder="e.g. 500mg or 100mg/5ml" maxLength={50} {...FIELD.strength} {...fe.invalid('strength')} />{fe.error('strength')}
              </label>
              <label>Dosage form
                <select value={form.dosage_form} onChange={(e) => { setSavedDuplicate(null); chooseForm(e.target.value); }} {...fe.invalid('dosage_form')}>
                  <option value="">Not specified</option>
                  {Object.keys(forms ?? {}).map((f) => <option key={f} value={f}>{f}</option>)}
                </select>{fe.error('dosage_form')}
              </label>
            </div>
            <div className="row">
              <label>Category
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required {...fe.invalid('category')}>
                  <option value="">Select category…</option>
                  {categories?.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>{fe.error('category')}
                {categoryWarning && !fe.fields.category && <span className="field-warning" role="alert">{categoryWarning}</span>}
                {!form.category && live?.categories && <span className="field-hint">Classified as {live.categories.join(' or ')}</span>}
              </label>
              <label>Counted per (unit)
                <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="tablet, capsule, bottle, tube…" required maxLength={50} {...FIELD.unit} {...fe.invalid('unit')} />{fe.error('unit')}
              </label>
            </div>
            {displayName(form) && <p className="mi-preview">Shown to residents and in records as <strong>{displayName(form)}</strong></p>}
            {duplicate && (
              <div className="msg msg-warning mi-duplicate" role="alert">
                <div>
                  <strong>{duplicate.duplicate.exact ? 'This medicine is already registered' : 'This may be a medicine that is already registered'}</strong>
                  <p>{duplicate.message}</p>
                  {canStock && (
                    <Link className="btn btn-sm" to={`/inventory?stockin=${duplicate.duplicate.medicine_id}`} onClick={() => setForm(null)}>
                      Record stock-in for {duplicate.duplicate.medicine_code}
                    </Link>
                  )}
                </div>
              </div>
            )}
            <label>Reorder level (alert when stock is at or below)
              <input type="number" min={0} max={100000} step={1} value={form.reorder_level} onChange={(e) => setForm({ ...form, reorder_level: Number(e.target.value) })} required {...fe.invalid('reorder_level')} />{fe.error('reorder_level')}
            </label>
            <label className="rx-check">
              <input type="checkbox" checked={form.requires_prescription} onChange={(e) => setForm({ ...form, requires_prescription: e.target.checked })} />
              <span><strong>Requires prescription</strong> — residents must upload a doctor's prescription, and staff must check it before approving and dispensing.</span>
            </label>
            <p className="field-hint">Stock and expiration dates are recorded in Stock &amp; Batches → Stock-in.</p>
            <div className="modal-actions">
              {unchanged && <span className="no-change-hint">No changes yet. Edit a detail to save.</span>}
              <button type="button" className="btn btn-outline" onClick={() => setForm(null)}>Cancel</button>
              <button className="btn" disabled={busy || unchanged || !!duplicate || !!categoryWarning} title={unchanged ? 'Nothing was changed' : undefined}>{busy ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
