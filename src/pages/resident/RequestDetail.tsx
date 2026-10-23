import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api, errorMessage } from '../../api';
import { confirmAction, LoadError, toast } from '../../components/feedback';
import { useApi } from '../../hooks';
import BackButton from '../../components/BackButton';
import { Loading, Message, Modal } from '../../components/ui';
import RequestTracker from '../../components/RequestTracker';
import { ICONS, Svg } from '../../components/RequestCards';
import { PickupDeadlineBox, RequestSummaryCard, StatusBox } from '../../components/RequestDetailParts';
import { PrescriptionUpload, type PrescriptionFile } from '../../components/Prescription';
import type { MedicineRequest } from '../../types';
import { MAX_REQUEST_QUANTITY, quantityWarning } from '../../validation';
import { unitPlural } from '../../components/RequestCards';
import { useAuth } from '../../auth';

/** Resident: one request with its tracking timeline (opened from My Requests). */
export default function RequestDetail() {
  const { can } = useAuth();
  const { id } = useParams();
  const { data: r, errorInfo, loading, setData, reload } = useApi<MedicineRequest>(`/requests/${id}`, undefined, 30000);
  // Error inside the "Update request" / "Replace prescription" windows (what was entered is kept).
  const [msg, setMsg] = useState<{ type: 'error'; text: string } | null>(null);
  const [editing, setEditing] = useState<MedicineRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [newRx, setNewRx] = useState<PrescriptionFile | null>(null);
  const [replacingRx, setReplacingRx] = useState(false);
  // Opened right after submitting from the request form.
  const navState = useLocation().state as { submitted?: boolean; edit?: boolean } | null;
  const justSubmitted = navState?.submitted === true;
  // Opened from "Already in your request" on the medicines page: start editing right away.
  const autoEdited = useRef(false);
  useEffect(() => {
    if (navState?.edit && r?.status === 'pending' && !autoEdited.current) {
      autoEdited.current = true;
      setEditing(structuredClone(r));
    }
  }, [navState, r]);
  const editWarnings = editing?.items.map((i) => quantityWarning(i.quantity ?? 0, unitPlural(i.medicine.unit))) ?? [];

  const replacePrescription = async () => {
    if (!r || !newRx || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      setData((await api.post<MedicineRequest>(`/requests/${r.request_id}/prescription`, { prescription: { name: newRx.name, data: newRx.data } })).data);
      setReplacingRx(false);
      setNewRx(null);
      toast.success('Prescription saved', { description: 'The pharmacy staff will check it when they review your request.' });
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) });
    } finally { setBusy(false); }
  };

  const cancel = () => {
    if (!r) return;
    const reserved = r.status === 'approved' && r.request_type === 'medicine';
    return confirmAction({
      tone: 'danger',
      title: 'Cancel this request?',
      message: <>You are about to cancel <strong>Request No. {r.request_id}</strong> ({r.items.map((i) => i.medicine.medicine_name).join(', ')}).</>,
      details: <>
        {reserved && <p>The medicines set aside for you will be given back to the stock for other residents.</p>}
        <p>This cannot be undone. You can submit a new request anytime.</p>
      </>,
      confirmLabel: 'Yes, cancel request',
      cancelLabel: 'No, keep it',
      busyLabel: 'Cancelling…',
      onConfirm: async () => {
        setData((await api.post<MedicineRequest>(`/requests/${r.request_id}/cancel`)).data);
        toast.success('Request cancelled', { description: `Request No. ${r.request_id} was cancelled${reserved ? ' and the medicines were returned to the stock' : ''}.` });
      },
    });
  };

  const saveEdit = async () => {
    if (!editing || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const items = editing.items.map((i) => ({ medicine_id: i.medicine_id, quantity: i.quantity }));
      const res = await api.put<MedicineRequest>(`/requests/${editing.request_id}`, { items });
      setData((old) => old && { ...old, items: res.data.items });
      setEditing(null);
      toast.success('Request updated', { description: `The quantities in Request No. ${editing.request_id} were saved.` });
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) });
    } finally { setBusy(false); }
  };

  return (
    <div className="page page-narrow">
      <BackButton fallback="/requests" />
      <header className="detail-topbar">
        <h1>Request Details</h1>
      </header>

      {loading && !r ? <Loading /> : !r ? <LoadError error={errorInfo} onRetry={() => reload()} back={{ to: '/requests', label: 'Go to My Requests' }} /> : <>
        {justSubmitted && r.status === 'pending' && (
          <div className="submitted-banner">
            <span className="submitted-icon"><Svg d={ICONS.check} size={30} width={2.8} /></span>
            <div>
              <strong>Request Submitted!</strong>
              <p>Your request No. {r.request_id} has been sent to Botika ng Bayan. {r.request_type === 'restock' ? 'The administrator will review it.' : r.prescription ? 'The pharmacy staff will check your prescription and review your request.' : 'The pharmacy staff will review it.'} You will be notified once it is approved or not approved. No action is needed for now.</p>
            </div>
          </div>
        )}
        <RequestSummaryCard r={r} prescriptionAction={r.status === 'pending' && r.request_type === 'medicine' && can('requests.create') && (r.prescription || r.items.some((i) => i.medicine.requires_prescription)) ? (
          <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => { setNewRx(null); setMsg(null); setReplacingRx(true); }}>
            {r.prescription ? 'Replace' : 'Upload'}
          </button>
        ) : undefined} />
        <PickupDeadlineBox r={r} />

        <section>
          <h2 className="section-title">Request Tracking</h2>
          <div className="card"><RequestTracker request={r} forResident /></div>
        </section>

        <StatusBox r={r} />

        <div className="detail-actions">
          {/* Restock requests have no quantity to update (they can be cancelled). */}
          {r.status === 'pending' && r.request_type === 'medicine' && can('requests.create') && <button className="btn btn-outline btn-block" disabled={busy} onClick={() => { setMsg(null); setEditing(structuredClone(r)); }}>Update Request</button>}
          {(r.status === 'pending' || r.status === 'approved') && can('requests.cancel') && (
            <button className="btn btn-outline-danger btn-block" disabled={busy} onClick={cancel}>
              <Svg d={ICONS.trash} size={18} /> Cancel Request
            </button>
          )}
          {r.status === 'fulfilled' && can('requests.create') && <Link className="btn btn-block" to="/medicines">Request this medicine</Link>}
        </div>
      </>}

      {replacingRx && r && (
        <Modal title={r.prescription ? 'Replace prescription' : 'Upload prescription'} onClose={() => !busy && setReplacingRx(false)}>
          <p className="muted small">Upload a clear photo of your doctor's prescription. The pharmacy staff will check it before approving your request.</p>
          <PrescriptionUpload value={newRx} onChange={setNewRx} />
          {msg && <Message>{msg.text}</Message>}
          <div className="modal-actions">
            <button className="btn btn-outline" onClick={() => setReplacingRx(false)} disabled={busy}>Cancel</button>
            <button className="btn" disabled={busy || !newRx} onClick={replacePrescription}>{busy ? 'Uploading…' : 'Save prescription'}</button>
          </div>
        </Modal>
      )}

      {editing && (
        <Modal title={`Update request No. ${editing.request_id}`} onClose={() => setEditing(null)}>
          <p className="muted small">Change how many you need. Up to {MAX_REQUEST_QUANTITY} per medicine.</p>
          {editing.items.map((item, idx) => (
            <div className="cart-row" key={item.medicine_id}>
              <div><strong>{item.medicine.medicine_name}</strong><div className="muted small">{unitPlural(item.medicine.unit)}</div></div>
              <input type="number" min={1} max={MAX_REQUEST_QUANTITY} value={item.quantity === null || Number.isNaN(item.quantity) ? '' : item.quantity} onChange={(e) => {
                const items = editing.items.map((x, i) => (i === idx ? { ...x, quantity: e.target.value === '' ? NaN : Number(e.target.value) } : x));
                setEditing({ ...editing, items });
              }} aria-label={`Quantity of ${item.medicine.medicine_name}`} />
              <button className="btn-ghost" disabled={editing.items.length === 1}
                onClick={() => setEditing({ ...editing, items: editing.items.filter((_, i) => i !== idx) })} aria-label="Remove">✕</button>
              {editWarnings[idx] && <p className="field-warning walkin-warning">{editWarnings[idx]}</p>}
            </div>
          ))}
          {msg?.type === 'error' && <Message>{msg.text}</Message>}
          <div className="modal-actions">
            <button className="btn btn-outline" onClick={() => setEditing(null)}>Close</button>
            <button className="btn" disabled={busy || editWarnings.some(Boolean)} onClick={saveEdit}>Save changes</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
