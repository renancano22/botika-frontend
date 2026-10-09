import { useState } from 'react';
import { api, errorMessage, formatDate } from '../../api';
import { useAuth } from '../../auth';
import { useApi } from '../../hooks';
import { Badge, Card, Empty, Loading, Message, Modal } from '../../components/ui';
import RequestTracker from '../../components/RequestTracker';
import type { MedicineRequest } from '../../types';

const itemsText = (r: MedicineRequest) => r.items.map((i) => `${i.medicine.medicine_name} ×${i.quantity}`).join(', ');

const STATUSES = ['', 'pending', 'approved', 'rejected', 'dispensed', 'fulfilled', 'cancelled'];

/** Staff/admin: review medicine and restock requests. (Residents use My Requests.) */
export default function Requests() {
  const { user } = useAuth();
  const [type, setType] = useState<'medicine' | 'restock' | ''>('medicine');
  const [status, setStatus] = useState('pending');
  const { data, error, loading, reload } = useApi<MedicineRequest[]>('/requests', { type, status }, 30000);
  const [msg, setMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [rejecting, setRejecting] = useState<MedicineRequest | null>(null);
  const [remarks, setRemarks] = useState('');
  const [viewingId, setViewingId] = useState<number | null>(null);
  const viewing = data?.find((r) => r.request_id === viewingId) ?? null;

  const act = async (fn: () => Promise<unknown>, success: string) => {
    setMsg(null);
    try {
      await fn();
      setMsg({ type: 'success', text: success });
      reload(true);
      return true;
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) });
      return false;
    }
  };

  const canReview = (r: MedicineRequest) =>
    r.status === 'pending' && (r.request_type === 'medicine' || user?.role === 'admin');

  const reviewButtons = (r: MedicineRequest) => canReview(r) && <>
    <button className="btn btn-sm" onClick={() => act(() => api.post(`/requests/${r.request_id}/approve`), `Request #${r.request_id} approved. SMS sent to the resident.`)}>Approve</button>{' '}
    <button className="btn btn-danger btn-sm" onClick={() => { setRejecting(r); setRemarks(''); }}>Reject</button>
  </>;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Medicine & Restock Requests</h1>
          <p className="muted">Pharmacy staff review medicine requests. The administrator reviews restock requests. Residents are notified by SMS.</p>
        </div>
      </header>
      {msg && <Message type={msg.type}>{msg.text}</Message>}
      <Message>{error}</Message>

      <Card actions={
        <div className="filters">
          <select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="">All types</option>
            <option value="medicine">Medicine requests</option>
            <option value="restock">Restock requests</option>
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((s) => <option key={s} value={s}>{s ? s[0].toUpperCase() + s.slice(1) : 'All statuses'}</option>)}
          </select>
        </div>
      }>
        {loading && !data ? <Loading /> : !data?.length ? <Empty>No requests found.</Empty> : (
          <table>
            <thead>
              <tr><th>#</th><th>Date</th><th>Resident</th><th>Type</th><th>Medicines</th><th>Status</th><th>Remarks</th><th></th></tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.request_id}>
                  <td>{r.request_id}</td>
                  <td className="nowrap">{formatDate(r.request_date, true)}</td>
                  <td>{r.resident?.name}<div className="muted small">{r.resident?.qr_code}</div></td>
                  <td><Badge value={r.request_type} /></td>
                  <td>{itemsText(r)}</td>
                  <td>
                    <Badge value={r.status} />
                    {r.status === 'approved' && r.claim_by && <div className="muted small">claim by {formatDate(r.claim_by)}</div>}
                    {r.status !== 'approved' && r.reviewer && <div className="muted small">by {r.reviewer.name}</div>}
                  </td>
                  <td>{r.remarks}</td>
                  <td className="right nowrap">
                    <button className="btn btn-outline btn-sm" onClick={() => setViewingId(r.request_id)}>Details</button>{' '}
                    {reviewButtons(r)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {viewing && (
        <Modal title={`Request #${viewing.request_id}`} onClose={() => setViewingId(null)}>
          <div className="resident-info req-detail-info">
            <div><small className="muted">Resident</small><strong>{viewing.resident?.name}</strong></div>
            <div><small className="muted">Patient ID</small><strong>{viewing.resident?.qr_code}</strong></div>
            <div><small className="muted">Type</small><strong>{viewing.request_type === 'restock' ? 'Restock request' : 'Medicine request'}</strong></div>
          </div>
          <p className="req-items">{itemsText(viewing)}</p>
          <RequestTracker request={viewing} forResident={false} />
          <div className="modal-actions">
            {reviewButtons(viewing)}
            <button className="btn btn-outline" onClick={() => setViewingId(null)}>Close</button>
          </div>
        </Modal>
      )}

      {rejecting && (
        <Modal title={`Reject request #${rejecting.request_id}`} onClose={() => setRejecting(null)}>
          <label>Reason (sent to the resident by SMS)
            <textarea rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} required />
          </label>
          <div className="modal-actions">
            <button className="btn btn-outline" onClick={() => setRejecting(null)}>Cancel</button>
            <button className="btn btn-danger" disabled={!remarks.trim()} onClick={async () => {
              if (await act(() => api.post(`/requests/${rejecting.request_id}/reject`, { remarks }), `Request #${rejecting.request_id} rejected.`)) setRejecting(null);
            }}>Reject request</button>
          </div>
        </Modal>
      )}

    </div>
  );
}
