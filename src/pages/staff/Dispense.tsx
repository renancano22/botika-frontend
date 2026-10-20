import { useCallback, useState, type FormEvent } from 'react';
import { api, describeError, errorMessage, formatDate } from '../../api';
import { alertDialog, toast } from '../../components/feedback';
import { useApi } from '../../hooks';
import { Badge, Card, Empty, Message, Modal } from '../../components/ui';
import { PrescriptionViewer, requiresPrescription, RX_ICON, RxBadge } from '../../components/Prescription';
import { prescriptionStatus } from '../../components/RequestDetailParts';
import { ICONS, Svg, unitPlural } from '../../components/RequestCards';
import type { Medicine, MedicineRequest } from '../../types';
import { MAX_REQUEST_QUANTITY, quantityWarning } from '../../validation';
import QrScanner from './QrScanner';
import { jumpWhenReady } from '../../scroll';
import BackButton from '../../components/BackButton';
import ResidentSearch, { type ResidentLookup as Lookup } from './ResidentSearch';
import RegisterResident from './RegisterResident';
import { useAuth } from '../../auth';

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');
const ID_ICON = 'M3 6h18v12H3zM7 10h4M7 14h6M15 10h2';
const QR_ICON = 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM18 14h2M14 18h2';
const SEARCH_ICON = 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.5-3.5';
const RR_ICON = 'M15 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M8.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M19 8v6M16 11h6';

/** QR Code / Resident ID verification and medicine dispensing. */
export default function Dispense() {
  // User Permissions: dispensing and registering walk-in residents can be allowed separately.
  const { can } = useAuth();
  const canDispense = can('dispensing.dispense');
  const canRegister = can('residents.register');
  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(false);
  // 'search': the resident forgot their QR code and Resident ID, so they are found by name and verified another way.
  // 'register': a walk-in resident who is not registered yet (e.g. no cellphone) is registered by the staff.
  const [mode, setMode] = useState<'id' | 'search' | 'register'>('id');
  const [found, setFound] = useState<Lookup | null>(null);
  // Message under "Verify resident" (Resident ID not found, newly registered resident's ID).
  const [msg, setMsg] = useState<{ type: 'error' | 'success' | 'info'; title?: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [walkIn, setWalkIn] = useState<{ medicine_id: number; quantity: number }[]>([]);
  const { data: medicines, reload: reloadMedicines } = useApi<Medicine[]>('/medicines');
  // Prescription medicines: the staff confirm they checked the resident's original prescription before releasing.
  const [confirming, setConfirming] = useState<MedicineRequest | null>(null);
  const [rxChecked, setRxChecked] = useState(false);
  const [walkInRxChecked, setWalkInRxChecked] = useState(false);
  const [viewRxId, setViewRxId] = useState<number | null>(null);

  const lookup = useCallback(async (raw: string) => {
    const value = raw.trim().toUpperCase(); // Resident IDs look like BBC-000001
    if (!value) return;
    setScanning(false);
    setCode(value);
    setMsg(null);
    try {
      const res = await api.get<Lookup>('/residents/lookup', { params: { code: value } });
      setFound(res.data);
      jumpWhenReady('dispense-resident'); // go straight to the verified resident and their requests
      setWalkIn([]);
    } catch (err) {
      setFound(null);
      const notFound = (err as { response?: { status?: number } }).response?.status === 404;
      const info = describeError(err);
      setMsg({
        type: 'error',
        title: notFound ? 'Resident not found' : info.title,
        text: notFound
          ? `No resident is registered with Resident ID "${value}". Check the ID on the resident's QR code or My Profile page, or search by name.`
          : errorMessage(err),
      });
    }
  }, []);

  const openMode = (next: 'search' | 'register') => {
    setScanning(false);
    setFound(null); // nothing can be dispensed until the resident is verified / registered
    setMsg(null);
    setMode(next);
  };

  const registered = (record: Lookup) => {
    setFound(record);
    setCode(record.resident.qr_code);
    setWalkIn([]);
    setMode('id');
    setMsg({ type: 'success', title: 'Resident registered', text: `${record.resident.name} is registered with Resident ID ${record.resident.qr_code}. Write this ID down for the resident's next visit, then add the medicines given in Dispense Medicine.` });
    jumpWhenReady('dispense-resident');
  };

  const verifiedBySearch = (record: Lookup) => {
    setFound(record);
    setCode(record.resident.qr_code);
    setWalkIn([]);
    setMode('id');
    setMsg(null);
    toast.success('Resident verified', { description: `Identity of ${record.resident.name} (${record.resident.qr_code}) confirmed by staff.` });
    jumpWhenReady('dispense-resident');
  };

  // Clears the verified resident to serve the next one.
  const changeResident = () => {
    setFound(null);
    setCode('');
    setMsg(null);
    setWalkIn([]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const afterDispense = async (title: string, description: string) => {
    toast.success(title, { description });
    reloadMedicines(true);
    if (found) await lookup(found.resident.qr_code); // refresh the resident's requests and history
  };

  /**
   * The server did not answer in time: the medicine may or may not have been recorded, so it must not be
   * sent again blindly (it would be deducted twice).
   */
  const uncertain = () => alertDialog({
    tone: 'warning',
    title: 'Dispensing not confirmed',
    message: 'The connection was lost before the server confirmed the dispensing, so it may or may not have been recorded.',
    details: 'Check this resident\'s dispensing history below before trying again, so the medicine is not deducted twice.',
    buttonLabel: 'Check history',
  }).then(() => { if (found) lookup(found.resident.qr_code); });

  const dispenseRequest = async (r: MedicineRequest) => {
    if (!found || busy) return;
    setBusy(true);
    try {
      await api.post('/dispensing', { request_id: r.request_id, qr_code: found.resident.qr_code, prescription_checked: requiresPrescription(r) ? rxChecked : false });
      setConfirming(null);
      await afterDispense(`Request No. ${r.request_id} dispensed`,
        `The medicines were released to ${found.resident.name}. Inventory updated${found.resident.contact_no ? ' and SMS sent' : ''}.`);
    } catch (err) {
      // Releasing an approved request twice is refused by the server, so trying again is safe.
      toast.fromError(err, { title: `Request No. ${r.request_id} was not dispensed`, retry: () => dispenseRequest(r) });
    } finally { setBusy(false); }
  };

  const dispenseWalkIn = async (e: FormEvent) => {
    e.preventDefault();
    if (!found || busy) return;
    setBusy(true);
    try {
      await api.post('/dispensing/walk-in', { qr_code: found.resident.qr_code, items: walkIn, prescription_checked: walkInRx.length > 0 && walkInRxChecked });
      const count = walkIn.length;
      setWalkIn([]);
      setWalkInRxChecked(false);
      await afterDispense('Medicines dispensed',
        `${count} ${count === 1 ? 'medicine was' : 'medicines were'} released to ${found.resident.name}. Inventory updated${found.resident.contact_no ? ' and SMS sent' : ''}.`);
    } catch (err) {
      const info = describeError(err);
      if (info.kind === 'timeout') uncertain();
      else toast.fromError(err, { title: 'Medicines were not dispensed' }); // the list is kept so it can be sent again
    } finally { setBusy(false); }
  };

  // Medicines added here can only use stock that is not reserved for approved requests.
  const addMedicine = () => setWalkIn([...walkIn, { medicine_id: 0, quantity: 1 }]);
  const available = medicines?.filter((m) => (m.free_stock ?? m.available_stock) > 0) ?? [];
  const walkInTotal = walkIn.reduce((s, i) => s + (Number.isFinite(i.quantity) ? i.quantity : 0), 0);
  const walkInWarnings = walkIn.map((i) => {
    const m = medicines?.find((x) => x.medicine_id === i.medicine_id);
    return m ? quantityWarning(i.quantity, unitPlural(m.unit), { available: m.free_stock ?? m.available_stock }) : null;
  });
  const walkInRx = walkIn.map((i) => medicines?.find((m) => m.medicine_id === i.medicine_id)).filter((m): m is Medicine => !!m?.requires_prescription);

  return (
    <div className="page">
      {/* In the name search, the arrow returns to Resident ID / QR code; otherwise it is shown only when
          the page was opened from another page (Dispense is a main menu section). */}
      <BackButton fallback="/dashboard" linkedOnly={mode === 'id'} onClick={mode !== 'id' ? () => setMode('id') : undefined}
        label={mode !== 'id' ? 'Back to Resident ID or QR code' : 'Go back'} />
      <header className="page-head">
        <div>
          <div className="page-title">
            <h1>Dispense Medicine</h1>
          </div>
          <p className="muted">Scan the resident's QR code, type the Resident ID, or search by name to verify identity before dispensing.</p>
        </div>
      </header>

      {!canDispense ? (
        <>
          <Message type="info" title="Registration only">Your account can register walk-in residents. Dispensing medicines is not allowed for your account; ask the administrator if you need it.</Message>
          <RegisterResident onRegistered={registered} onVerified={verifiedBySearch} />
        </>
      ) : mode === 'search' ? <ResidentSearch onBack={() => setMode('id')} onVerified={verifiedBySearch} />
        : mode === 'register' && canRegister ? <RegisterResident onBack={() => setMode('id')} onRegistered={registered} onVerified={verifiedBySearch} /> : (
        <Card title="1. Verify resident">
          <form className="lookup dv-lookup" onSubmit={(e) => { e.preventDefault(); lookup(code); }}>
            <span className="dv-id-input">
              <Svg d={ID_ICON} size={18} />
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Resident ID, e.g. BBC-000001" aria-label="Resident ID" autoComplete="off" spellCheck={false} />
            </span>
            <button className="btn">Verify</button>
            <button type="button" className={`btn btn-outline dv-scan ${scanning ? 'is-on' : ''}`} onClick={() => setScanning(!scanning)}>
              <Svg d={QR_ICON} size={18} /> {scanning ? 'Stop camera' : 'Scan QR code'}
            </button>
          </form>
          {scanning && <QrScanner onScan={lookup} />}

          <div className="dv-alt">
            <span className="dv-alt-label">No QR code or Resident ID?</span>
            <div className="dv-alt-grid">
              <button type="button" className="dv-alt-tile" onClick={() => openMode('search')}>
                <span className="dv-alt-icon" aria-hidden="true"><Svg d={SEARCH_ICON} size={20} /></span>
                <span className="dv-alt-text">
                  <strong>Search resident by name</strong>
                  <small>Forgot their Resident ID or QR code</small>
                </span>
                <Svg d={ICONS.chevron} size={18} />
              </button>
              {canRegister && <button type="button" className="dv-alt-tile" onClick={() => openMode('register')}>
                <span className="dv-alt-icon" aria-hidden="true"><Svg d={RR_ICON} size={20} /></span>
                <span className="dv-alt-text">
                  <strong>Register resident</strong>
                  <small>Not registered yet, e.g. no cellphone</small>
                </span>
                <Svg d={ICONS.chevron} size={18} />
              </button>}
            </div>
          </div>
        </Card>
      )}

      <div id="dispense-msg">{msg && <Message type={msg.type} title={msg.title}>{msg.text}</Message>}</div>

      {found && canDispense && (
        <>
          <div id="dispense-resident" />
          <section className="card dv-resident" aria-label="Verified resident">
            <span className="dv-avatar" aria-hidden="true">{initials(found.resident.name)}</span>
            <div className="dv-who">
              <span className="dv-verified"><Svg d={ICONS.check} size={14} width={3} /> Resident verified</span>
              <h2>{found.resident.name}</h2>
              <div className="dv-meta">
                <span className="dv-chip"><small>Resident ID</small><strong>{found.resident.qr_code}</strong></span>
                <span className="dv-chip"><small>Address</small><strong>{found.resident.address}</strong></span>
                <span className="dv-chip"><small>Mobile</small><strong>{found.resident.contact_no || 'None (no SMS)'}</strong></span>
              </div>
            </div>
            <button type="button" className="btn btn-outline btn-sm dv-change" onClick={changeResident}>Change resident</button>
          </section>

          <Card title="Dispense Medicine">
            <form onSubmit={dispenseWalkIn} className="dv-walkin">
              <button type="button" className="btn btn-outline dv-add" onClick={addMedicine}>+ Add Medicine</button>
              {walkIn.length > 0 && (
                <>
                  <div className="dv-cart-head" aria-hidden="true"><span>Medicine</span><span>Qty</span><span /></div>
                  {walkIn.map((item, idx) => (
                    <div className="cart-row" key={idx}>
                      <select value={item.medicine_id} onChange={(e) => setWalkIn(walkIn.map((x, i) => (i === idx ? { ...x, medicine_id: Number(e.target.value) } : x)))} required aria-label={`Medicine ${idx + 1}`}>
                        <option value={0}>Select medicine…</option>
                        {available.map((m) => <option key={m.medicine_id} value={m.medicine_id}>{m.medicine_name} ({m.free_stock ?? m.available_stock} {m.unit} free)</option>)}
                      </select>
                      <input type="number" min={1} max={MAX_REQUEST_QUANTITY} value={item.quantity} onChange={(e) => setWalkIn(walkIn.map((x, i) => (i === idx ? { ...x, quantity: Number(e.target.value) } : x)))} aria-label={`Quantity ${idx + 1}`} />
                      <button type="button" className="btn-ghost dv-remove" onClick={() => setWalkIn(walkIn.filter((_, i) => i !== idx))} aria-label="Remove medicine" title="Remove"><Svg d={ICONS.x} size={18} /></button>
                      {walkInWarnings[idx] && <p className="field-warning walkin-warning">{walkInWarnings[idx]}</p>}
                    </div>
                  ))}
                  <p className="field-hint">Up to {MAX_REQUEST_QUANTITY} per medicine · Total: {walkInTotal}. Stock is taken from the earliest-expiring batch.</p>
                  {walkInRx.length > 0 && (
                    <div className="rx-box">
                      <strong><Svg d={RX_ICON} size={18} width={2.4} /> Prescription medicine</strong>
                      <p>{walkInRx.map((m) => m.medicine_name).join(', ')} can only be given with a doctor's prescription.</p>
                      <label className="rx-check">
                        <input type="checkbox" checked={walkInRxChecked} onChange={(e) => setWalkInRxChecked(e.target.checked)} />
                        <span>I checked the resident's original prescription: it is valid, written for this resident, and matches the medicine and quantity.</span>
                      </label>
                    </div>
                  )}
                  <div className="dv-actions">
                    <button type="button" className="btn btn-outline" onClick={() => { setWalkIn([]); setWalkInRxChecked(false); }} disabled={busy}>Clear</button>
                    <button className="btn" disabled={busy || walkIn.some((i) => !i.medicine_id) || walkInWarnings.some(Boolean) || (walkInRx.length > 0 && !walkInRxChecked)}>
                      {busy ? 'Dispensing…' : `Dispense (${walkIn.length})`}
                    </button>
                  </div>
                </>
              )}
            </form>
            {found.approved_requests.length === 0 && (
              <p className="dv-none"><Svg d={ICONS.info} size={16} /> No requests ready for pickup for this resident.</p>
            )}
            {found.approved_requests.length > 0 && (
              <div className="dv-approved">
                <h3 className="dv-sub">Approved requests ({found.approved_requests.length})</h3>
                <table>
                  <thead><tr><th>No.</th><th>Medicines</th><th>Approved</th><th></th></tr></thead>
                  <tbody>
                    {found.approved_requests.map((r) => (
                      <tr key={r.request_id}>
                        <td>{r.request_id}</td>
                        <td>
                          {r.items.map((i) => `${i.medicine.medicine_name} ×${i.quantity}`).join(', ')}
                          {requiresPrescription(r) && <div className="rx-cell"><RxBadge small /></div>}
                        </td>
                        <td>{formatDate(r.reviewed_at, true)}</td>
                        <td className="right">
                          <button className="btn btn-sm" disabled={busy}
                            onClick={() => (requiresPrescription(r) ? (setRxChecked(false), setConfirming(r)) : dispenseRequest(r))}>Dispense</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Dispensing history of this resident">
            {found.dispensing_history.length === 0 ? <Empty>No previous dispensing.</Empty> : (
              <table>
                <thead><tr><th>Date</th><th>Medicines</th><th>Dispensed by</th><th></th></tr></thead>
                <tbody>
                  {found.dispensing_history.map((d) => (
                    <tr key={d.dispensing_id}>
                      <td className="nowrap">{formatDate(d.dispensed_at, true)}</td>
                      <td>{d.items.map((i) => `${i.medicine.medicine_name} ×${i.quantity}`).join(', ')}</td>
                      <td>{d.dispenser?.name ?? '—'}</td>
                      <td><Badge value="dispensed" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}

      {confirming && (
        <Modal title={`Dispense request No. ${confirming.request_id}`} onClose={() => !busy && setConfirming(null)}>
          <p className="req-items">{confirming.items.map((i) => `${i.medicine.medicine_name} ×${i.quantity}`).join(', ')}</p>
          <div className="rx-box">
            <strong><Svg d={RX_ICON} size={18} width={2.4} /> Prescription medicine</strong>
            {confirming.prescription ? (
              <div className="rx-review-row">
                <div className="rx-file-info">
                  <span className="small">Uploaded copy</span>
                  <strong>{confirming.prescription.file_name}</strong>
                  <span className="small">{prescriptionStatus(confirming)}</span>
                </div>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setViewRxId(confirming.request_id)}>View</button>
              </div>
            ) : <p>No prescription copy was uploaded with this request.</p>}
            <label className="rx-check">
              <input type="checkbox" checked={rxChecked} onChange={(e) => setRxChecked(e.target.checked)} />
              <span>I checked the resident's original prescription: it is valid, written for this resident, and matches the uploaded copy and the medicines being released.</span>
            </label>
          </div>
          <div className="modal-actions">
            <button className="btn btn-outline" onClick={() => setConfirming(null)} disabled={busy}>Cancel</button>
            <button className="btn" disabled={busy || !rxChecked} onClick={() => dispenseRequest(confirming)}>{busy ? 'Dispensing…' : 'Dispense'}</button>
          </div>
        </Modal>
      )}
      {viewRxId && <PrescriptionViewer requestId={viewRxId} onClose={() => setViewRxId(null)} />}
    </div>
  );
}
