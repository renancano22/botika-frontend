import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, errorMessage, formatDate } from '../../api';
import { useApi } from '../../hooks';
import { Loading, Message, Modal } from '../../components/ui';
import RequestTracker from '../../components/RequestTracker';
import { ICONS, quantityText, StatusPill, Svg } from '../../components/RequestCards';
import type { MedicineRequest } from '../../types';

/** Resident: one request with its status timeline (opened from My Requests or from a notification). */
export default function RequestDetail() {
  const { id } = useParams();
  const { data: r, error, loading, setData } = useApi<MedicineRequest>(`/requests/${id}`, undefined, 30000);
  const [msg, setMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [editing, setEditing] = useState<MedicineRequest | null>(null);
  const [busy, setBusy] = useState(false);

  const cancel = async () => {
    if (!r) return;
    const question = r.status === 'approved' && r.request_type === 'medicine'
      ? `Cancel request #${r.request_id}? The medicines set aside for you will be given back to the stock for other residents.`
      : `Cancel request #${r.request_id}?`;
    if (!confirm(question)) return;
    setBusy(true);
    setMsg(null);
    try {
      setData((await api.post<MedicineRequest>(`/requests/${r.request_id}/cancel`)).data);
      setMsg({ type: 'success', text: 'Your request has been cancelled.' });
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) });
    } finally { setBusy(false); }
  };

  const saveEdit = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      const items = editing.items.map((i) => ({ medicine_id: i.medicine_id, quantity: i.quantity }));
      const res = await api.put<MedicineRequest>(`/requests/${editing.request_id}`, { items });
      setData((old) => old && { ...old, items: res.data.items });
      setEditing(null);
      setMsg({ type: 'success', text: 'Your request has been updated.' });
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) });
    } finally { setBusy(false); }
  };

  return (
    <div className="page page-narrow">
      <Link to="/requests" className="back-link"><Svg d="M15 6l-6 6 6 6" size={18} /> My Requests</Link>

      {loading && !r ? <Loading /> : !r ? <Message>{error}</Message> : <>
        <section className="card req-detail">
          <div className="req-detail-head">
            <span className={`req-icon ${r.request_type === 'restock' ? 'req-icon-restock' : ''}`}>
              <Svg d={r.request_type === 'restock' ? ICONS.box : ICONS.pill} size={24} width={1.9} />
            </span>
            <div className="req-detail-title">
              <h1>Request #{r.request_id}</h1>
              <span className="muted small">{r.request_type === 'restock' ? 'Restock request' : 'Medicine request'} · {formatDate(r.request_date, true)}</span>
            </div>
            <StatusPill request={r} />
          </div>

          <ul className="req-detail-items">
            {r.items.map((i) => (
              <li key={i.request_item_id ?? i.medicine_id}>
                <span>{i.medicine.medicine_name}</span>
                <strong>{quantityText(i.quantity, i.medicine.unit)}</strong>
              </li>
            ))}
          </ul>

          <Message type={msg?.type}>{msg?.text}</Message>

          <h2 className="section-title">Request status</h2>
          <RequestTracker request={r} forResident />

          {(r.status === 'pending' || r.status === 'approved' || r.status === 'fulfilled') && (
            <div className="req-actions">
              {r.status === 'pending' && <button className="btn btn-outline" disabled={busy} onClick={() => setEditing(structuredClone(r))}>Update request</button>}
              {(r.status === 'pending' || r.status === 'approved') && <button className="btn btn-danger" disabled={busy} onClick={cancel}>Cancel request</button>}
              {r.status === 'fulfilled' && <Link className="btn" to="/medicines">Request this medicine</Link>}
            </div>
          )}
        </section>
      </>}

      {editing && (
        <Modal title={`Update request #${editing.request_id}`} onClose={() => setEditing(null)}>
          {editing.items.map((item, idx) => (
            <div className="cart-row" key={item.medicine_id}>
              <div><strong>{item.medicine.medicine_name}</strong></div>
              <input type="number" min={1} value={item.quantity} onChange={(e) => {
                const items = editing.items.map((x, i) => (i === idx ? { ...x, quantity: Number(e.target.value) } : x));
                setEditing({ ...editing, items });
              }} />
              <button className="btn-ghost" disabled={editing.items.length === 1}
                onClick={() => setEditing({ ...editing, items: editing.items.filter((_, i) => i !== idx) })} aria-label="Remove">✕</button>
            </div>
          ))}
          <div className="modal-actions">
            <button className="btn btn-outline" onClick={() => setEditing(null)}>Close</button>
            <button className="btn" disabled={busy} onClick={saveEdit}>Save changes</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
