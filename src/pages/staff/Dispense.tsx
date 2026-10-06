import { useCallback, useState, type FormEvent } from 'react';
import { api, errorMessage, formatDate } from '../../api';
import { useApi } from '../../hooks';
import { Badge, Card, Empty, Message } from '../../components/ui';
import type { Dispensing, Medicine, MedicineRequest, Resident } from '../../types';
import QrScanner from './QrScanner';

interface Lookup {
  resident: Resident;
  approved_requests: MedicineRequest[];
  dispensing_history: Dispensing[];
}

/** QR Code / Patient ID verification and medicine dispensing. */
export default function Dispense() {
  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [found, setFound] = useState<Lookup | null>(null);
  const [msg, setMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [walkIn, setWalkIn] = useState<{ medicine_id: number; quantity: number }[]>([]);
  const { data: medicines, reload: reloadMedicines } = useApi<Medicine[]>('/medicines');

  const lookup = useCallback(async (raw: string) => {
    const value = raw.trim().toUpperCase(); // Patient IDs look like BBC-000001
    if (!value) return;
    setScanning(false);
    setCode(value);
    setMsg(null);
    try {
      const res = await api.get<Lookup>('/residents/lookup', { params: { code: value } });
      setFound(res.data);
      setWalkIn([]);
    } catch (err) {
      setFound(null);
      const notFound = (err as { response?: { status?: number } }).response?.status === 404;
      setMsg({
        type: 'error',
        text: notFound
          ? `No resident found with Patient ID "${value}". Check the ID on the resident's dashboard (My QR code / Patient ID).`
          : errorMessage(err),
      });
    }
  }, []);

  const afterDispense = async (text: string) => {
    setMsg({ type: 'success', text });
    reloadMedicines(true);
    if (found) await lookup(found.resident.qr_code);
    setMsg({ type: 'success', text });
  };

  const dispenseRequest = async (r: MedicineRequest) => {
    if (!found) return;
    setBusy(true);
    try {
      await api.post('/dispensing', { request_id: r.request_id, qr_code: found.resident.qr_code });
      await afterDispense(`Request #${r.request_id} dispensed. Inventory updated and SMS sent.`);
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) });
    } finally { setBusy(false); }
  };

  const dispenseWalkIn = async (e: FormEvent) => {
    e.preventDefault();
    if (!found) return;
    setBusy(true);
    try {
      await api.post('/dispensing/walk-in', { qr_code: found.resident.qr_code, items: walkIn });
      setWalkIn([]);
      await afterDispense('Walk-in dispensing recorded. Inventory updated and SMS sent.');
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) });
    } finally { setBusy(false); }
  };

  // Walk-ins can only use stock that is not reserved for approved requests.
  const available = medicines?.filter((m) => (m.free_stock ?? m.available_stock) > 0) ?? [];

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Dispense Medicine</h1>
          <p className="muted">Scan the resident's QR code or type the Patient ID to verify identity before dispensing.</p>
        </div>
      </header>

      <Card title="1. Verify resident">
        <form className="lookup" onSubmit={(e) => { e.preventDefault(); lookup(code); }}>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Patient ID, e.g. BBC-000001" />
          <button className="btn">Verify</button>
          <button type="button" className="btn btn-outline" onClick={() => setScanning(!scanning)}>{scanning ? 'Stop camera' : 'Scan QR code'}</button>
        </form>
        {scanning && <QrScanner onScan={lookup} />}
      </Card>

      {msg && <Message type={msg.type}>{msg.text}</Message>}

      {found && (
        <>
          <Card title="Resident verified ✓">
            <div className="resident-info">
              <div><small className="muted">Name</small><strong>{found.resident.name}</strong></div>
              <div><small className="muted">Patient ID</small><strong>{found.resident.qr_code}</strong></div>
              <div><small className="muted">Address</small><strong>{found.resident.address}</strong></div>
              <div><small className="muted">Mobile</small><strong>{found.resident.contact_no}</strong></div>
            </div>
          </Card>

          <div className="grid-2">
            <Card title="2a. Approved requests to dispense">
              {found.approved_requests.length === 0 ? <Empty>No approved requests for this resident.</Empty> : (
                <table>
                  <thead><tr><th>#</th><th>Medicines</th><th>Approved</th><th></th></tr></thead>
                  <tbody>
                    {found.approved_requests.map((r) => (
                      <tr key={r.request_id}>
                        <td>{r.request_id}</td>
                        <td>{r.items.map((i) => `${i.medicine.medicine_name} ×${i.quantity}`).join(', ')}</td>
                        <td>{formatDate(r.reviewed_at, true)}</td>
                        <td className="right"><button className="btn btn-sm" disabled={busy} onClick={() => dispenseRequest(r)}>Dispense</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            <Card title="2b. Walk-in dispensing">
              <form onSubmit={dispenseWalkIn}>
                {walkIn.map((item, idx) => (
                  <div className="cart-row" key={idx}>
                    <select value={item.medicine_id} onChange={(e) => setWalkIn(walkIn.map((x, i) => (i === idx ? { ...x, medicine_id: Number(e.target.value) } : x)))} required>
                      <option value={0}>Select medicine…</option>
                      {available.map((m) => <option key={m.medicine_id} value={m.medicine_id}>{m.medicine_name} ({m.free_stock ?? m.available_stock} {m.unit} free)</option>)}
                    </select>
                    <input type="number" min={1} value={item.quantity} onChange={(e) => setWalkIn(walkIn.map((x, i) => (i === idx ? { ...x, quantity: Number(e.target.value) } : x)))} />
                    <button type="button" className="btn-ghost" onClick={() => setWalkIn(walkIn.filter((_, i) => i !== idx))} aria-label="Remove">✕</button>
                  </div>
                ))}
                <div className="modal-actions">
                  <button type="button" className="btn btn-outline" onClick={() => setWalkIn([...walkIn, { medicine_id: 0, quantity: 1 }])}>+ Add medicine</button>
                  <button className="btn" disabled={busy || walkIn.length === 0 || walkIn.some((i) => !i.medicine_id)}>Dispense</button>
                </div>
              </form>
            </Card>
          </div>

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
    </div>
  );
}
