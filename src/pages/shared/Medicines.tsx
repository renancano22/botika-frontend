import { useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, errorMessage, formatDate } from '../../api';
import { useAuth } from '../../auth';
import { useApi } from '../../hooks';
import { Badge, Card, Empty, Loading, Message, Modal } from '../../components/ui';
import { unitPlural } from '../../components/RequestCards';
import type { Medicine } from '../../types';
import { RxBadge } from '../../components/Prescription';

const EMPTY = { generic_name: '', strength: '', dosage_form: '', category: '', unit: '', description: '', reorder_level: 20, requires_prescription: false };
type Form = typeof EMPTY;

/** "Amoxicillin 500mg Capsule" — the same name the server builds. */
const displayName = (f: Form) => [f.generic_name, f.strength, f.dosage_form].map((v) => v.trim()).filter(Boolean).join(' ');
const qty = (n: number, unit: string) => `${n} ${n === 1 ? unit : unitPlural(unit)}`;

/**
 * Medicine List (admin & staff): the Botika ng Bayan medicine list with generic name, category,
 * strength, dosage form, stock, expiration dates of its batches, stock status and last update.
 * Medicines whose stock was never recorded are shown as "Not recorded" until staff record a stock-in
 * or confirm there is no stock. Delete is admin only.
 */
export default function Medicines() {
  const { user } = useAuth();
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
  const { data, error, loading, reload } = useApi<Medicine[]>('/medicines', { search }, 30000);
  const { data: categories } = useApi<string[]>('/medicines/categories');
  const { data: forms } = useApi<Record<string, string>>('/medicines/dosage-forms');
  const shown = useMemo(() => (data ?? []).filter((m) => (!status || m.status === status) && (!category || m.category === category)), [data, status, category]);
  const unrecorded = (data ?? []).filter((m) => m.status === 'unrecorded').length;

  const [editing, setEditing] = useState<Medicine | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [formError, setFormError] = useState('');
  const [pageError, setPageError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const open = (m?: Medicine) => {
    setEditing(m ?? null);
    setFormError('');
    setForm(m ? {
      generic_name: m.generic_name ?? m.medicine_name, strength: m.strength ?? '', dosage_form: m.dosage_form ?? '',
      category: m.category, unit: m.unit, description: m.description ?? '', reorder_level: m.reorder_level ?? 20,
      requires_prescription: !!m.requires_prescription,
    } : { ...EMPTY, category: category || '' });
  };

  /** Choosing a dosage form fills in the unit it is counted in (tablet, bottle, tube…). */
  const chooseForm = (dosage_form: string) => form && setForm({ ...form, dosage_form, unit: forms?.[dosage_form] ?? form.unit });

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!form || busy) return;
    setBusy(true);
    try {
      if (editing) await api.put(`/medicines/${editing.medicine_id}`, form);
      else await api.post('/medicines', form);
      setNotice(`${displayName(form)} ${editing ? 'updated' : 'added'}.`);
      setForm(null);
      reload();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally { setBusy(false); }
  };

  const confirmNoStock = async (m: Medicine) => {
    if (!confirm(`Confirm that there is no stock of ${m.medicine_name} right now? It will be shown as "Out of stock" and residents can request a restock.`)) return;
    try {
      await api.post(`/medicines/${m.medicine_id}/confirm-no-stock`);
      setNotice(`${m.medicine_name} marked as out of stock.`);
      reload();
    } catch (err) { setPageError(errorMessage(err)); }
  };

  const remove = async (m: Medicine) => {
    if (!confirm(`Delete ${m.medicine_name}? This also removes its records.`)) return;
    try {
      await api.delete(`/medicines/${m.medicine_id}`);
      reload();
    } catch (err) {
      setPageError(errorMessage(err));
    }
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Medicine List</h1>
          <p className="muted">Botika ng Bayan medicine list, stock on hand, batches and expiration dates.</p>
        </div>
        <div className="mi-head-actions">
          <Link className="btn btn-outline" to="/inventory?stockin=new">+ Stock-in</Link>
          <button className="btn" onClick={() => open()}>+ Add medicine</button>
        </div>
      </header>
      <Message type="success">{notice}</Message>
      <Message>{pageError || error}</Message>

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
        {loading && !data ? <Loading /> : !data?.length ? <Empty>No medicines yet.</Empty> : !shown.length ? <Empty>No medicines match these filters.</Empty> : (
          <table className="mi-table">
            <thead>
              <tr>
                <th>Medicine ID</th><th>Generic Name</th><th>Category</th><th>Strength</th><th>Dosage Form</th>
                <th>Quantity in Stock</th><th>Expiration Date</th><th>Stock Status</th><th>Date Last Updated</th><th></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((m) => (
                <tr key={m.medicine_id} className={m.status === 'unrecorded' ? 'mi-unrecorded' : ''}>
                  <td className="nowrap mi-code">{m.medicine_code}</td>
                  <td>
                    <strong>{m.generic_name ?? m.medicine_name}</strong>
                    {m.requires_prescription && <div><RxBadge small /></div>}
                    {m.description && <div className="muted small">{m.description}</div>}
                  </td>
                  <td>{m.category}</td>
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
                  <td className="right nowrap">
                    {m.status === 'unrecorded' && (
                      <>
                        <Link className="btn btn-sm" to={`/inventory?stockin=${m.medicine_id}`}>Record stock</Link>{' '}
                        <button className="btn btn-outline btn-sm" onClick={() => confirmNoStock(m)}>No stock</button>{' '}
                      </>
                    )}
                    <button className="btn btn-outline btn-sm" onClick={() => open(m)}>Edit</button>{' '}
                    {user?.role === 'admin' && <button className="btn btn-danger btn-sm" onClick={() => remove(m)}>Delete</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {form && (
        <Modal title={editing ? 'Edit medicine' : 'Add medicine'} onClose={() => setForm(null)}>
          <form onSubmit={save}>
            <Message>{formError}</Message>
            <label>Generic name
              <input value={form.generic_name} onChange={(e) => setForm({ ...form, generic_name: e.target.value })} placeholder="e.g. Amoxicillin" required maxLength={150} />
            </label>
            <div className="row">
              <label>Strength
                <input value={form.strength} onChange={(e) => setForm({ ...form, strength: e.target.value })} placeholder="e.g. 500mg or 100mg/5ml" maxLength={50} />
              </label>
              <label>Dosage form
                <select value={form.dosage_form} onChange={(e) => chooseForm(e.target.value)}>
                  <option value="">Not specified</option>
                  {Object.keys(forms ?? {}).map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </label>
            </div>
            <div className="row">
              <label>Category
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required>
                  <option value="">Select category…</option>
                  {categories?.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label>Counted per (unit)
                <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="tablet, capsule, bottle, tube…" required maxLength={50} />
              </label>
            </div>
            {displayName(form) && <p className="mi-preview">Shown to residents and in records as <strong>{displayName(form)}</strong></p>}
            <label>Reorder level (alert when stock is at or below)
              <input type="number" min={0} value={form.reorder_level} onChange={(e) => setForm({ ...form, reorder_level: Number(e.target.value) })} required />
            </label>
            <label>Description<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} /></label>
            <label className="rx-check">
              <input type="checkbox" checked={form.requires_prescription} onChange={(e) => setForm({ ...form, requires_prescription: e.target.checked })} />
              <span><strong>Requires prescription</strong> — residents must upload a doctor's prescription, and staff must check it before approving and dispensing.</span>
            </label>
            <p className="field-hint">Stock and expiration dates are recorded in Stock &amp; Batches → Stock-in.</p>
            <div className="modal-actions">
              <button type="button" className="btn btn-outline" onClick={() => setForm(null)}>Cancel</button>
              <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
