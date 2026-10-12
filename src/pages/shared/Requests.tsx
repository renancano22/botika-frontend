import { useState } from 'react';
import { api, errorMessage, formatDate } from '../../api';
import { useAuth } from '../../auth';
import { useApi } from '../../hooks';
import { Badge, Card, Empty, Loading, Message, Modal } from '../../components/ui';
import RequestTracker from '../../components/RequestTracker';
import { PrescriptionViewer, requiresPrescription, RxBadge, RX_ICON } from '../../components/Prescription';
import { prescriptionStatus } from '../../components/RequestDetailParts';
import { Svg } from '../../components/RequestCards';
import type { MedicineRequest } from '../../types';

const itemsText = (r: MedicineRequest) => r.items.map((i) => `${i.medicine.medicine_name} ×${i.quantity}`).join(', ');

const STATUSES = ['', 'pending', 'approved', 'rejected', 'dispensed', 'fulfilled', 'cancelled', 'expired'];

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
  const [rxChecked, setRxChecked] = useState(false);
  const [viewRxId, setViewRxId] = useState<number | null>(null);
  const openDetails = (r: MedicineRequest) => { setRxChecked(false); setMsg(null); setViewingId(r.request_id); };

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

  const approve = async (r: MedicineRequest) => {
    const rx = requiresPrescription(r);
    if (await act(() => api.post(`/requests/${r.request_id}/approve`, rx ? { prescription_verified: true } : {}),
      `Request #${r.request_id} approved${rx ? ' (prescription checked)' : ''}. SMS sent to the resident.`)) setViewingId(null);
  };

  /** Prescription medicines: approving is only possible inside Details, after viewing and confirming the prescription. */
  const reviewButtons = (r: MedicineRequest, inDetails = false) => canReview(r) && <>
    {requiresPrescription(r) && !inDetails
      ? <button className="btn btn-sm" onClick={() => openDetails(r)}>Check & approve</button>
      : <button className="btn btn-sm" disabled={requiresPrescription(r) && (!rxChecked || !r.prescription)} onClick={() => approve(r)}>Approve</button>}{' '}
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
              <tr><th>#</th><th>Date</th><th>Resident</th><th>Type</th><th>Medicines</th><th>Status</th><th>Resident's note / Remarks</th><th></th></tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.request_id}>
                  <td>{r.request_id}</td>
                  <td className="nowrap">{formatDate(r.request_date, true)}</td>
                  <td>{r.resident?.name}<div className="muted small">{r.resident?.qr_code}</div></td>
                  <td><Badge value={r.request_type} /></td>
                  <td>
                    {itemsText(r)}
                    {requiresPrescription(r) && (
                      <div className="rx-cell"><RxBadge small /> <span className={r.prescription_verified_at ? 'rx-ok small' : 'muted small'}>{r.prescription ? (r.prescription_verified_at ? 'checked' : 'uploaded') : 'not uploaded'}</span></div>
                    )}
                  </td>
                  <td>
                    <Badge value={r.status} />
                    {r.status === 'approved' && r.claim_by && <div className="muted small">claim by {formatDate(r.claim_by)}</div>}
                    {r.status !== 'approved' && r.reviewer && <div className="muted small">by {r.reviewer.name}</div>}
                  </td>
                  <td>
                    {r.resident_note && <div className="note-text">“{r.resident_note}”</div>}
                    {r.remarks && <div className="muted small">Remarks: {r.remarks}</div>}
                  </td>
                  <td className="right nowrap">
                    <button className="btn btn-outline btn-sm" onClick={() => openDetails(r)}>Details</button>{' '}
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
          {viewing.resident_note && (
            <div className="review-note"><span className="muted small">Resident's reason for request</span><p>{viewing.resident_note}</p></div>
          )}
          {(requiresPrescription(viewing) || viewing.prescription) && (
            <div className="rx-box">
              <strong><Svg d={RX_ICON} size={18} width={2.4} /> Prescription</strong>
              {viewing.prescription ? (
                <div className="rx-review-row">
                  <div className="rx-file-info">
                    <strong>{viewing.prescription.file_name}</strong>
                    <span className="small">{prescriptionStatus(viewing)}</span>
                  </div>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setViewRxId(viewing.request_id)}>View</button>
                </div>
              ) : (
                <p>No prescription was uploaded. Ask the resident to upload it in their request, or reject the request.</p>
              )}
              {canReview(viewing) && viewing.prescription && (
                <label className="checkbox-row rx-check">
                  <input type="checkbox" checked={rxChecked} onChange={(e) => setRxChecked(e.target.checked)} />
                  <span>I checked the prescription: it is valid, signed by a licensed doctor, written for this resident, and matches the requested medicine and quantity.</span>
                </label>
              )}
            </div>
          )}
          <RequestTracker request={viewing} forResident={false} />
          {msg?.type === 'error' && <Message>{msg.text}</Message>}
          <div className="modal-actions">
            {reviewButtons(viewing, true)}
            <button className="btn btn-outline" onClick={() => setViewingId(null)}>Close</button>
          </div>
        </Modal>
      )}

      {viewRxId && <PrescriptionViewer requestId={viewRxId} onClose={() => setViewRxId(null)} />}

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
