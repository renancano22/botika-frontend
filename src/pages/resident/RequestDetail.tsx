import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../../api';
import { useApi } from '../../hooks';
import { Loading, Message, Modal } from '../../components/ui';
import RequestTracker from '../../components/RequestTracker';
import { ICONS, Svg } from '../../components/RequestCards';
import { RequestSummaryCard, StatusBox } from '../../components/RequestDetailParts';
import type { MedicineRequest } from '../../types';

/** Resident: one request with its tracking timeline (opened from My Requests). */
export default function RequestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: r, error, loading, setData } = useApi<MedicineRequest>(`/requests/${id}`, undefined, 30000);
  const [msg, setMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [editing, setEditing] = useState<MedicineRequest | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const cancel = async () => {
    if (!r) return;
    setBusy(true);
    setMsg(null);
    try {
      setData((await api.post<MedicineRequest>(`/requests/${r.request_id}/cancel`)).data);
      setMsg({ type: 'success', text: 'Your request has been cancelled.' });
      setConfirming(false);
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) });
      setConfirming(false);
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
      <header className="detail-topbar">
        <button className="icon-btn" onClick={() => navigate(-1)} aria-label="Back"><Svg d={ICONS.back} size={22} /></button>
        <h1>Request Details</h1>
      </header>

      {loading && !r ? <Loading /> : !r ? <Message>{error}</Message> : <>
        <RequestSummaryCard r={r} />
        <Message type={msg?.type}>{msg?.text}</Message>

        <section>
          <h2 className="section-title">Request Tracking</h2>
          <div className="card"><RequestTracker request={r} forResident /></div>
        </section>

        <StatusBox r={r} />

        <div className="detail-actions">
          {r.status === 'pending' && <button className="btn btn-outline btn-block" disabled={busy} onClick={() => setEditing(structuredClone(r))}>Update Request</button>}
          {(r.status === 'pending' || r.status === 'approved') && (
            <button className="btn btn-outline-danger btn-block" disabled={busy} onClick={() => setConfirming(true)}>
              <Svg d={ICONS.trash} size={18} /> Cancel Request
            </button>
          )}
          {r.status === 'fulfilled' && <Link className="btn btn-block" to="/medicines">Request this medicine</Link>}
          <Link className="btn btn-outline btn-block" to="/requests"><Svg d={ICONS.back} size={18} /> Back to My Requests</Link>
        </div>
      </>}

      {confirming && r && (
        <div className="modal-backdrop" onMouseDown={() => !busy && setConfirming(false)}>
          <div className="modal confirm-modal" role="dialog" aria-label="Cancel request" onMouseDown={(e) => e.stopPropagation()}>
            <button className="btn-ghost confirm-close" onClick={() => setConfirming(false)} aria-label="Close">✕</button>
            <span className="confirm-icon"><Svg d={ICONS.trash} size={30} /></span>
            <h2>Cancel Request</h2>
            <p>Are you sure you want to cancel this medicine request?</p>
            {r.status === 'approved' && <p className="muted small">The medicines set aside for you will be given back to the stock for other residents.</p>}
            <p className="muted small">This action cannot be undone.</p>
            <div className="confirm-actions">
              <button className="btn btn-outline" onClick={() => setConfirming(false)} disabled={busy}>No, keep it</button>
              <button className="btn btn-danger" onClick={cancel} disabled={busy}>{busy ? 'Cancelling…' : 'Yes, cancel'}</button>
            </div>
          </div>
        </div>
      )}

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
