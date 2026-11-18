import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api, errorMessage } from '../../api';
import { ChangeList, confirmAction, confirmSave, LoadError, toast } from '../../components/feedback';
import { useApi } from '../../hooks';
import BackButton from '../../components/BackButton';
import { Loading, Message, Modal } from '../../components/ui';
import RequestTracker from '../../components/RequestTracker';
import { ICONS, Svg } from '../../components/RequestCards';
import { PickupDeadlineBox, RequestSummaryCard, StatusBox } from '../../components/RequestDetailParts';
import PrescriptionsEditor from '../../components/PrescriptionsEditor';
import { prescriptionDraftsFromRequest, prescriptionPayload, validatePrescriptionDrafts, type PrescriptionDraft } from '../../medicineRequest';
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
  const [newRx, setNewRx] = useState<PrescriptionDraft[]>([]);
  const [rxUploading, setRxUploading] = useState(false);
  const savingRx = useRef(false);
  const rxMedicines = r?.items.filter((i) => i.medicine.requires_prescription).map((i) => i.medicine) ?? [];
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
  // What the edit changes (quantity changed / medicine removed); Save is only possible after a change.
  const editChanges = editing && r ? r.items.flatMap((old) => {
    const now = editing.items.find((i) => i.request_item_id === old.request_item_id);
    const unit = (q: number | null) => (q === null ? '' : `${q} ${q === 1 ? old.medicine.unit : unitPlural(old.medicine.unit)}`);
    if (!now) return [{ label: old.medicine.medicine_name, from: unit(old.quantity), to: 'removed' }];
    return now.quantity !== old.quantity ? [{ label: old.medicine.medicine_name, from: unit(old.quantity), to: unit(now.quantity) }] : [];
  }) : [];

  const replacePrescription = async () => {
    if (!r || busy || rxUploading || savingRx.current) return;
    const errors = validatePrescriptionDrafts(rxMedicines, newRx);
    if (Object.keys(errors).length) { setMsg({ type: 'error', text: errors.prescription }); return; }
    savingRx.current = true;
    setMsg(null);
    try {
      if (!(await confirmSave({
        title: 'Save these prescriptions?',
        message: <>Save {newRx.length} prescription file{newRx.length === 1 ? '' : 's'} and their medicine assignments for Request No. {r.request_id}?</>,
        details: 'Only the files listed here will be kept. Pharmacy staff will check every prescription before approval.',
      }))) return;
      setBusy(true);
      setData((await api.post<MedicineRequest>(`/requests/${r.request_id}/prescription`, { prescriptions: prescriptionPayload(newRx) })).data);
      setReplacingRx(false);
      setNewRx([]);
      toast.success('Prescriptions saved', { description: 'The pharmacy staff will check all files and their medicines.' });
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) });
    } finally { savingRx.current = false; setBusy(false); }
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
    if (!editing || busy || !r || !editChanges.length) return;
    if (!(await confirmSave({
      title: 'Save changes to this request?',
      message: <>You are about to update <strong>Request No. {r.request_id}</strong>.</>,
      details: <ChangeList rows={editChanges} />,
    }))) return;
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
              <p>Your request No. {r.request_id} has been sent to Botika ng Bayan. {r.request_type === 'restock' ? 'The administrator will review it.' : r.prescription ? 'The pharmacy staff will check all uploaded prescriptions and review your request.' : 'The pharmacy staff will review it.'} You will be notified once it is approved or not approved. No action is needed for now.</p>
            </div>
          </div>
        )}
        <RequestSummaryCard r={r} prescriptionAction={r.status === 'pending' && r.request_type === 'medicine' && can('requests.create') && (r.prescription || r.items.some((i) => i.medicine.requires_prescription)) ? (
          <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => { setNewRx(prescriptionDraftsFromRequest(r)); setMsg(null); setReplacingRx(true); }}>
            Manage prescriptions
          </button>
        ) : undefined} />
        <PickupDeadlineBox r={r} />

        <details className="notif-progress-disclosure">
          <summary><span><Svg d={ICONS.clock} size={18} /> Request progress</span><Svg d={ICONS.chevron} size={16} /></summary>
          <div className="notif-progress-body"><RequestTracker request={r} forResident /></div>
        </details>

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
        <Modal title="Manage prescriptions" onClose={() => !busy && !savingRx.current && setReplacingRx(false)}>
          <p className="muted small">Keep or replace existing files, add prescriptions from other doctors, and select the medicines each file covers.</p>
          <fieldset className="mr-fields" disabled={busy}>
            <PrescriptionsEditor medicines={rxMedicines} drafts={newRx} onChange={setNewRx} onBusyChange={setRxUploading} requestId={r.request_id} />
          </fieldset>
          {msg && <Message>{msg.text}</Message>}
          <div className="modal-actions">
            <button className="btn btn-outline" onClick={() => setReplacingRx(false)} disabled={busy}>Cancel</button>
            <button className="btn" disabled={busy || rxUploading || Object.keys(validatePrescriptionDrafts(rxMedicines, newRx)).length > 0} onClick={replacePrescription}>{busy ? 'Saving…' : 'Save prescriptions'}</button>
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
            {editChanges.length === 0 && <span className="no-change-hint">No changes yet.</span>}
            <button className="btn btn-outline" onClick={() => setEditing(null)}>Close</button>
            <button className="btn" disabled={busy || editWarnings.some(Boolean) || editChanges.length === 0} onClick={saveEdit}>Save changes</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
