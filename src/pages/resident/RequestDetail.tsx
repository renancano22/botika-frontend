import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api, errorMessage } from '../../api';
import { useApi, useGoBack } from '../../hooks';
import { Loading, Message, Modal } from '../../components/ui';
import RequestTracker from '../../components/RequestTracker';
import { ICONS, Svg } from '../../components/RequestCards';
import { RequestSummaryCard, StatusBox } from '../../components/RequestDetailParts';
import { PrescriptionUpload, type PrescriptionFile } from '../../components/Prescription';
import type { MedicineRequest } from '../../types';

/** Resident: one request with its tracking timeline (opened from My Requests). */
export default function RequestDetail() {
  const { id } = useParams();
  const goBack = useGoBack('/requests');
  const { data: r, error, loading, setData } = useApi<MedicineRequest>(`/requests/${id}`, undefined, 30000);
  const [msg, setMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [editing, setEditing] = useState<MedicineRequest | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newRx, setNewRx] = useState<PrescriptionFile | null>(null);
  const [replacingRx, setReplacingRx] = useState(false);
  // Opened right after submitting from the request form.
  const justSubmitted = (useLocation().state as { submitted?: boolean } | null)?.submitted === true;

  const replacePrescription = async () => {
    if (!r || !newRx) return;
    setBusy(true);
    setMsg(null);
    try {
      setData((await api.post<MedicineRequest>(`/requests/${r.request_id}/prescription`, { prescription: { name: newRx.name, data: newRx.data } })).data);
      setReplacingRx(false);
      setNewRx(null);
      setMsg({ type: 'success', text: 'Your prescription has been updated.' });
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) });
    } finally { setBusy(false); }
  };

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
        <button className="icon-btn" onClick={goBack} aria-label="Back"><Svg d={ICONS.back} size={22} /></button>
        <h1>Request Details</h1>
      </header>

      {loading && !r ? <Loading /> : !r ? <Message>{error}</Message> : <>
        {justSubmitted && r.status === 'pending' && (
          <div className="submitted-banner">
            <span className="submitted-icon"><Svg d={ICONS.check} size={30} width={2.8} /></span>
            <div>
              <strong>Request Submitted!</strong>
              <p>Your request #{r.request_id} has been sent to Botika ng Bayan. {r.prescription ? 'The pharmacy staff will check your prescription and review your request.' : 'The pharmacy staff will review it.'} You will get an SMS once it is approved.</p>
            </div>
          </div>
        )}
        <RequestSummaryCard r={r} prescriptionAction={r.status === 'pending' && r.request_type === 'medicine' && (r.prescription || r.items.some((i) => i.medicine.requires_prescription)) ? (
          <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => { setNewRx(null); setReplacingRx(true); }}>
            {r.prescription ? 'Replace' : 'Upload'}
          </button>
        ) : undefined} />
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

      {replacingRx && r && (
        <Modal title={r.prescription ? 'Replace prescription' : 'Upload prescription'} onClose={() => !busy && setReplacingRx(false)}>
          <p className="muted small">Upload a clear photo of your doctor's prescription. The pharmacy staff will check it before approving your request.</p>
          <PrescriptionUpload value={newRx} onChange={setNewRx} />
          <div className="modal-actions">
            <button className="btn btn-outline" onClick={() => setReplacingRx(false)} disabled={busy}>Cancel</button>
            <button className="btn" disabled={busy || !newRx} onClick={replacePrescription}>{busy ? 'Uploading…' : 'Save prescription'}</button>
          </div>
        </Modal>
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
