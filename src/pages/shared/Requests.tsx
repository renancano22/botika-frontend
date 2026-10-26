import { Fragment, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, errorMessage, formatDate } from '../../api';
import { LoadError, toast } from '../../components/feedback';
import { useAuth } from '../../auth';
import { useApi } from '../../hooks';
import { Pagination, rowNo, useDebounced, usePagedApi } from '../../components/Pagination';
import { Badge, Card, Empty, Loading, Message, Modal } from '../../components/ui';
import RequestTracker from '../../components/RequestTracker';
import { PrescriptionViewer, requiresPrescription, RxBadge, RX_ICON } from '../../components/Prescription';
import { prescriptionStatus } from '../../components/RequestDetailParts';
import { PickupCountdown, Svg } from '../../components/RequestCards';
import type { MedicineRequest } from '../../types';
import BackButton from '../../components/BackButton';
import { Hl, HlId, rowHit } from '../../components/SearchHighlight';

/** Same short list as in the SMS: "Paracetamol 500mg x10, Amoxicillin x21 and 1 more" (restock requests: names only). */
const itemsSummary = (r: MedicineRequest) => {
  const parts = r.items.map((i) => `${i.medicine.medicine_name}${i.quantity === null ? '' : ` x${i.quantity}`}`);
  return parts.slice(0, 2).join(', ') + (parts.length > 2 ? ` and ${parts.length - 2} more` : '');
};
const itemsText = (r: MedicineRequest) => r.items.map((i) => `${i.medicine.medicine_name}${i.quantity === null ? '' : ` ×${i.quantity}`}`).join(', ');

/** Common reasons for not approving a request (shown in the Reject dropdown). Sent to the resident by SMS after "Reason:". */
const PRESCRIPTION_REASONS = [
  'No prescription was uploaded for a medicine that requires one.',
  'The prescription is unclear, incomplete or not valid.',
  'The prescription does not match the requested medicine or quantity.',
];
const MEDICINE_REASONS = [
  'Not enough stock of the requested medicine right now.',
  'The requested quantity is more than what can be given per request.',
  'You already have an active request for this medicine.',
  'This medicine was given to you recently. Please request again when your supply runs out.',
  'Please consult a doctor or the Rural Health Unit (RHU) first.',
  'Your resident information is incomplete or could not be verified.',
];
const RESTOCK_REASONS = [
  'This medicine is not supplied by Botika ng Bayan.',
  'A restock of this medicine is already scheduled.',
  'The supplier currently has no stock of this medicine.',
  'You already have a pending restock request for this medicine.',
  'The medicine is already available. You may now submit a medicine request.',
];
const OTHER = '__other__';

const reasonsFor = (r: MedicineRequest) => (r.request_type === 'restock'
  ? RESTOCK_REASONS
  : [...(requiresPrescription(r) ? PRESCRIPTION_REASONS : []), ...MEDICINE_REASONS]);

type RequestType = 'medicine' | 'restock' | '';

/** Status tabs for each request type (value '' = all statuses). */
function statusTabs(type: RequestType): [string, string][] {
  if (type === 'medicine') {
    return [['pending', 'Pending'], ['approved', 'Ready for pickup'], ['dispensed', 'Completed'], ['rejected', 'Rejected'],
      ['expired', 'Expired (not claimed)'], ['cancelled', 'Cancelled'], ['', 'All']];
  }
  if (type === 'restock') {
    return [['pending', 'Pending'], ['approved', 'Waiting for stock'], ['fulfilled', 'Fulfilled'], ['rejected', 'Rejected'], ['cancelled', 'Cancelled'], ['', 'All']];
  }
  return [['pending', 'Pending'], ['approved', 'Approved'], ['dispensed', 'Completed'], ['fulfilled', 'Fulfilled'], ['rejected', 'Rejected'],
    ['expired', 'Expired'], ['cancelled', 'Cancelled'], ['', 'All']];
}

/** Staff/admin: review medicine and restock requests. (Residents use My Requests.) */
export default function Requests() {
  const { user, can } = useAuth();
  // The type and status are kept in the address (e.g. /requests?status=approved from the dashboard).
  const [params, setParams] = useSearchParams();
  const rawType = params.get('type') ?? 'medicine';
  const apiType: RequestType = rawType === 'medicine' || rawType === 'restock' ? rawType : '';
  const rawStatus = params.get('status') ?? 'pending';
  const apiStatus = rawStatus === 'all' ? '' : rawStatus;
  const setFilter = (next: { type?: RequestType; status?: string }) => {
    const t = next.type ?? apiType;
    const st = next.status ?? apiStatus;
    setParams({ type: t || 'all', status: st || 'all' }, { replace: true });
  };
  // Search, dates and sort apply to all requests (on the server); the list shows one page at a time.
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const term = useDebounced(search.trim());
  const badRange = !!from && !!to && from > to;
  const range = badRange ? { from: to, to: from } : { from, to };
  const list = usePagedApi<MedicineRequest>('/requests', { type: apiType, status: apiStatus, search: term, ...range, sort }, { table: 'requests', refreshMs: 30000 });
  const { data, errorInfo, loading, reload: reloadList, rows, meta } = list;
  const counts = useApi<Record<string, number>>('/requests/counts', { type: apiType, search: term, ...range }, 30000);
  const filtered = !!term || !!from || !!to;
  const reload = (silent = false) => { reloadList(silent); counts.reload(true); };
  // Request being approved or rejected right now: its buttons are disabled so it cannot be sent twice.
  const [actingId, setActingId] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState<MedicineRequest | null>(null);
  const [reason, setReason] = useState('');            // a reason from the list, or OTHER
  const [otherReason, setOtherReason] = useState('');  // typed by hand when "Other reason" is chosen
  const [rejectError, setRejectError] = useState('');
  const remarks = reason === OTHER ? otherReason.trim() : reason;
  const openReject = (r: MedicineRequest) => { setRejecting(r); setReason(''); setOtherReason(''); setRejectError(''); };
  const [rejectBusy, setRejectBusy] = useState(false);
  const [viewingId, setViewingId] = useState<number | null>(null);
  const viewing = rows.find((r) => r.request_id === viewingId) ?? null;
  const [rxChecked, setRxChecked] = useState(false);
  const [viewRxId, setViewRxId] = useState<number | null>(null);
  const openDetails = (r: MedicineRequest) => { setRxChecked(false); setViewingId(r.request_id); };

  const canReview = (r: MedicineRequest) =>
    r.status === 'pending' && can('requests.review') && (r.request_type === 'medicine' || user?.role === 'admin');

  const approve = async (r: MedicineRequest) => {
    if (actingId) return;
    const rx = requiresPrescription(r);
    setActingId(r.request_id);
    try {
      await api.post(`/requests/${r.request_id}/approve`, rx ? { prescription_verified: true } : {});
      toast.success(`Request No. ${r.request_id} approved`, {
        description: r.request_type === 'restock'
          ? `${r.resident?.name ?? 'The resident'} will be notified when the medicine is available.`
          : `${rx ? 'Prescription checked. ' : ''}The medicine is set aside and ${r.resident?.name ?? 'the resident'} was notified to claim it within 7 days.`,
      });
      setViewingId(null);
      reload(true);
    } catch (err) {
      toast.fromError(err, { title: `Request No. ${r.request_id} was not approved`, retry: () => approve(r) });
    } finally { setActingId(null); }
  };

  /** Prescription medicines: approving is only possible inside Details, after viewing and confirming the prescription. */
  const reviewButtons = (r: MedicineRequest, inDetails = false) => canReview(r) && <>
    {requiresPrescription(r) && !inDetails
      ? <button className="btn btn-sm" onClick={() => openDetails(r)}>Check & approve</button>
      : <button className="btn btn-sm" disabled={actingId !== null || (requiresPrescription(r) && (!rxChecked || !r.prescription))} onClick={() => approve(r)}>
        {actingId === r.request_id ? 'Approving…' : 'Approve'}
      </button>}{' '}
    <button className="btn btn-danger btn-sm" disabled={actingId !== null} onClick={() => openReject(r)}>Reject</button>
  </>;

  // On phones the status tabs are one swipeable row: keep the selected tab in view.
  const tabsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = tabsRef.current;
    const active = row?.querySelector<HTMLElement>('.chip.active');
    if (row && active && row.scrollWidth > row.clientWidth) row.scrollLeft = active.offsetLeft - row.offsetLeft - 12;
  }, [apiStatus, apiType]);

  return (
    <div className="page req-page">
      <BackButton linkedOnly />
      <header className="page-head">
        <div>
          <div className="page-title"><h1>Medicine & Restock Requests</h1></div>
          <p className="muted">Pharmacy staff review medicine requests. The administrator reviews restock requests. Residents are notified by SMS.</p>
        </div>
      </header>
      <LoadError error={errorInfo} onRetry={() => reload()} />

      <Card actions={
        <div className="filters">
          <select value={apiType} onChange={(e) => setFilter({ type: e.target.value as RequestType, status: 'pending' })} aria-label="Request type">
            <option value="">All types</option>
            <option value="medicine">Medicine requests</option>
            <option value="restock">Restock requests</option>
          </select>
        </div>
      }>
        <div className="chips status-tabs" role="tablist" aria-label="Status" ref={tabsRef}>
          {statusTabs(apiType).map(([value, label]) => (
            <button key={value || 'all'} role="tab" aria-selected={apiStatus === value} className={`chip ${apiStatus === value ? 'active' : ''}`}
              onClick={() => setFilter({ status: value })}>
              {label}<span className="chip-count">{counts.data?.[value || 'all'] ?? 0}</span>
            </button>
          ))}
        </div>
        {apiStatus === 'approved' && apiType !== 'restock' && (
          <p className="muted small tab-hint">Approved medicine requests waiting to be claimed. The medicines are set aside for these residents until the deadline; after that the request is cancelled automatically.</p>
        )}
        <div className="filters req-filters">
          <input type="search" className="search" placeholder="Search request no., resident, Resident ID or medicine…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search requests" />
          <label className="tbl-date">From <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label="From date" /></label>
          <label className="tbl-date">To <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="To date" /></label>
          <select value={sort} onChange={(e) => setSort(e.target.value as 'newest' | 'oldest')} aria-label="Sort">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
          {filtered && <button type="button" className="btn btn-outline btn-sm" onClick={() => { setSearch(''); setFrom(''); setTo(''); }}>Clear filters</button>}
        </div>
        {badRange && <p className="field-warning">The "From" date is after the "To" date, so the dates were swapped.</p>}
        {loading && !data ? <Loading /> : !data ? null : !rows.length ? <Empty>{filtered ? 'No requests match this search or date range.' : 'No requests found.'}</Empty> : (
          <div className={`req-table-wrap ${loading ? 'tbl-updating' : ''}`}>
          <table className="req-table">
            <thead>
              <tr><th className="col-no">No.</th><th>Request No.</th><th className="rq-date">Date</th><th className="rq-resident">Resident</th><th>Type</th><th className="rq-meds">Medicines</th><th className="rq-status">Status</th><th className="rq-note">Resident's note / Remarks</th><th className="right">Actions</th></tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.request_id} className={rowHit(term, r.request_id) || undefined}>
                  <td className="col-no">{rowNo(meta, i)}</td>
                  <td className="nowrap"><HlId q={term} id={r.request_id}>No. {r.request_id}</HlId></td>
                  <td className="nowrap rq-date">{formatDate(r.request_date, true)}</td>
                  <td className="rq-resident">
                    <Hl q={term}>{r.resident?.name}</Hl>
                    <div className="muted small nowrap"><Hl q={term}>{r.resident?.qr_code}</Hl></div>
                    {r.status === 'approved' && r.resident?.contact_no && <div className="muted small nowrap">{r.resident.contact_no}</div>}
                  </td>
                  <td><Badge value={r.request_type} /></td>
                  <td>
                    {r.items.map((it, n) => (
                      <Fragment key={it.request_item_id}>{n > 0 && ', '}<Hl q={term}>{it.medicine.medicine_name}</Hl>{it.quantity === null ? '' : ` ×${it.quantity}`}</Fragment>
                    ))}
                    {requiresPrescription(r) && (
                      <div className="rx-cell"><RxBadge small /> <span className={r.prescription_verified_at ? 'rx-ok small' : 'muted small'}>{r.prescription ? (r.prescription_verified_at ? 'checked' : 'uploaded') : 'not uploaded'}</span></div>
                    )}
                  </td>
                  <td>
                    <Badge value={r.status} />
                    {r.status === 'approved' && r.claim_by && (
                      <div className="muted small">Ready for pickup · claim by {formatDate(r.claim_by)} <PickupCountdown claimBy={r.claim_by} /></div>
                    )}
                    {/* The reviewer is the staff who approved or rejected it; only the resident can cancel a request. */}
                    {r.status === 'cancelled' && <div className="muted small">Cancelled by the resident{r.cancelled_at ? ` · ${formatDate(r.cancelled_at, true)}` : ''}</div>}
                    {r.reviewer && (
                      <div className="muted small">
                        {r.status === 'rejected' ? 'Rejected by' : r.status === 'pending' ? 'by' : r.status === 'cancelled' || r.status === 'expired' ? 'Earlier approved by' : 'Approved by'} {r.reviewer.name}
                        {r.reviewed_at && <> · {formatDate(r.reviewed_at, true)}</>}
                      </div>
                    )}
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
          </div>
        )}
        <Pagination meta={meta} onPage={list.setPage} onPerPage={list.setPerPage} noun="requests" busy={loading} />
      </Card>

      {viewing && (
        <Modal title={`Request No. ${viewing.request_id}`} onClose={() => setViewingId(null)}>
          <div className="resident-info req-detail-info">
            <div><small className="muted">Resident</small><strong>{viewing.resident?.name}</strong></div>
            <div><small className="muted">Resident ID</small><strong>{viewing.resident?.qr_code}</strong></div>
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
          <div className="modal-actions">
            {reviewButtons(viewing, true)}
            <button className="btn btn-outline" onClick={() => setViewingId(null)}>Close</button>
          </div>
        </Modal>
      )}

      {viewRxId && <PrescriptionViewer requestId={viewRxId} onClose={() => setViewRxId(null)} />}

      {rejecting && (
        <Modal title={`Reject request No. ${rejecting.request_id}`} onClose={() => setRejecting(null)}>
          <label>Reason (sent to the resident by SMS)
            <select className="select-pill" value={reason} onChange={(e) => { setReason(e.target.value); setRejectError(''); }} autoFocus>
              <option value="" disabled>Choose a reason…</option>
              {reasonsFor(rejecting).map((text) => <option key={text} value={text}>{text}</option>)}
              <option value={OTHER}>Other reason (type it)</option>
            </select>
          </label>
          {reason === OTHER && (
            <label>Type the reason
              <textarea rows={3} maxLength={200} value={otherReason} onChange={(e) => setOtherReason(e.target.value)}
                placeholder="Only if the reason is not in the list. Write it so the resident can understand it." autoFocus />
              <span className="field-hint right">{otherReason.length}/200</span>
            </label>
          )}
          {remarks && (
            <div className="reject-preview">
              <small>The resident will receive:</small>
              <p>BulanBotikaCare: Your {rejecting.request_type === 'restock' ? 'restock' : 'medicine'} request No. {rejecting.request_id} ({itemsSummary(rejecting)}) was NOT APPROVED. Reason: {remarks.replace(/\.+$/, '')}. You may submit a new request if you still need the medicine.</p>
            </div>
          )}
          {rejectError && <Message>{rejectError}</Message>}
          <div className="modal-actions">
            <button className="btn btn-outline" onClick={() => setRejecting(null)} disabled={rejectBusy}>Cancel</button>
            <button className="btn btn-danger" disabled={remarks.length < 3 || rejectBusy} onClick={async () => {
              if (rejectBusy) return;
              setRejectBusy(true);
              setRejectError('');
              try {
                await api.post(`/requests/${rejecting.request_id}/reject`, { remarks });
                toast.success(`Request No. ${rejecting.request_id} rejected`, { description: `${rejecting.resident?.name ?? 'The resident'} was notified with the reason.` });
                setRejecting(null);
                setViewingId(null);
                reload(true);
              } catch (err) {
                setRejectError(errorMessage(err));
              } finally { setRejectBusy(false); }
            }}>{rejectBusy ? 'Rejecting…' : 'Reject request'}</button>
          </div>
        </Modal>
      )}

    </div>
  );
}
