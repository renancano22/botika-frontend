import { useState, type FormEvent } from 'react';
import { api, errorMessage } from '../../api';
import { useAuth } from '../../auth';
import { useApi } from '../../hooks';
import { Badge, Card, Empty, Loading, Message, Modal } from '../../components/ui';
import type { Medicine } from '../../types';

const EMPTY = { medicine_name: '', category: '', unit: '', description: '', reorder_level: 20 };
type Form = typeof EMPTY;

/** Manage Medicine Records: create, read/search, update, delete (delete is admin only). */
export default function Medicines() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const { data, error, loading, reload } = useApi<Medicine[]>('/medicines', { search });
  const { data: categories } = useApi<string[]>('/medicines/categories');
  const [editing, setEditing] = useState<Medicine | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [formError, setFormError] = useState('');
  const [pageError, setPageError] = useState('');

  const open = (m?: Medicine) => {
    setEditing(m ?? null);
    setFormError('');
    setForm(m ? {
      medicine_name: m.medicine_name, category: m.category, unit: m.unit,
      description: m.description ?? '', reorder_level: m.reorder_level ?? 20,
    } : EMPTY);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (editing) await api.put(`/medicines/${editing.medicine_id}`, form);
      else await api.post('/medicines', form);
      setForm(null);
      reload();
    } catch (err) {
      setFormError(errorMessage(err));
    }
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
        <h1>Medicine Records</h1>
        <button className="btn" onClick={() => open()}>+ Add medicine</button>
      </header>
      <Message>{pageError || error}</Message>

      <Card actions={<input className="search" placeholder="Search name or category…" value={search} onChange={(e) => setSearch(e.target.value)} />}>
        {loading && !data ? <Loading /> : !data?.length ? <Empty>No medicines yet.</Empty> : (
          <table>
            <thead><tr><th>Medicine</th><th>Category</th><th>Unit</th><th>Available</th><th>Reorder level</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {data.map((m) => (
                <tr key={m.medicine_id}>
                  <td><strong>{m.medicine_name}</strong>{m.description && <div className="muted small">{m.description}</div>}</td>
                  <td>{m.category}</td><td>{m.unit}</td>
                  <td>{m.available_stock}{!!m.reserved_stock && <div className="muted small">{m.reserved_stock} reserved · {m.free_stock} free</div>}</td>
                  <td>{m.reorder_level}</td>
                  <td><Badge value={m.status} /></td>
                  <td className="right nowrap">
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
            <label>Medicine name (generic name & strength)<input value={form.medicine_name} onChange={(e) => setForm({ ...form, medicine_name: e.target.value })} required /></label>
            <div className="row">
              <label>Category
                <input list="categories" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required />
                <datalist id="categories">{categories?.map((c) => <option key={c} value={c} />)}</datalist>
              </label>
              <label>Unit<input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="tablet, capsule, bottle…" required /></label>
            </div>
            <label>Reorder level (alert when stock is at or below)
              <input type="number" min={0} value={form.reorder_level} onChange={(e) => setForm({ ...form, reorder_level: Number(e.target.value) })} required />
            </label>
            <label>Description<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} /></label>
            <div className="modal-actions">
              <button type="button" className="btn btn-outline" onClick={() => setForm(null)}>Cancel</button>
              <button className="btn">Save</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
