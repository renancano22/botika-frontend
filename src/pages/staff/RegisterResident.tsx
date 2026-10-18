import { useState, type FormEvent } from 'react';
import { api, errorMessage } from '../../api';
import { useApi } from '../../hooks';
import { Card, Message } from '../../components/ui';
import { ICONS, Svg } from '../../components/RequestCards';
import { FIELD } from '../../validation';
import { VerifyIdentity, type Match, type ResidentLookup } from './ResidentSearch';

const EMPTY = { name: '', barangay: '', address_line: '', contact_no: '' };

/**
 * Walk-in resident who is not registered yet (e.g. no cellphone): the staff register them here
 * so the medicines given can be recorded (walk-in dispensing) and taken out of the inventory.
 */
export default function RegisterResident({ onBack, onRegistered, onVerified }: {
  onBack: () => void;
  onRegistered: (record: ResidentLookup) => void;
  onVerified: (record: ResidentLookup) => void;
}) {
  const { data: barangays } = useApi<string[]>('/barangays');
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [matches, setMatches] = useState<Match[] | null>(null); // same name already registered in the barangay
  const [picked, setPicked] = useState<Match | null>(null);
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => { setForm({ ...form, [k]: e.target.value }); setMatches(null); };

  const save = async (confirmNew = false) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.post<ResidentLookup>('/residents', { ...form, confirm_new: confirmNew });
      onRegistered(res.data);
    } catch (err) {
      const e = err as { response?: { status?: number; data?: { matches?: Match[] } } };
      if (e.response?.status === 409 && e.response.data?.matches) setMatches(e.response.data.matches);
      else setError(errorMessage(err));
    } finally { setBusy(false); }
  };
  const submit = (e: FormEvent) => { e.preventDefault(); save(false); };

  return (
    <Card title="1. Register walk-in resident" actions={
      <button type="button" className="btn btn-ghost rs-back" onClick={onBack}>
        <Svg d={ICONS.back} size={16} width={2.4} /> Use Resident ID or QR code
      </button>
    }>
      <p className="muted small rs-intro">For a resident who is not registered yet, for example because they have no cellphone. After saving, record the medicines you give in <strong>Walk-in dispensing</strong> so the inventory is updated.</p>
      <form className="rr-form" onSubmit={submit}>
        <label>Full name
          <input value={form.name} onChange={set('name')} placeholder="e.g. Juan Dela Cruz" required maxLength={100} autoFocus autoComplete="off" spellCheck={false} {...FIELD.name} />
        </label>
        <label>Barangay
          <select value={form.barangay} onChange={set('barangay')} required>
            <option value="">Select barangay…</option>
            {barangays?.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </label>
        <label><span>House no. / Street / Purok <span className="muted small">(optional)</span></span>
          <input value={form.address_line} onChange={set('address_line')} placeholder="e.g. Purok 3, Rizal St." maxLength={120} autoComplete="off" />
        </label>
        <label><span>Mobile number <span className="muted small">(optional)</span></span>
          <input type="tel" inputMode="tel" value={form.contact_no} onChange={set('contact_no')} placeholder="Leave blank if none" maxLength={16} autoComplete="off" {...FIELD.mobile} />
          <span className="field-hint">Without a mobile number, no SMS is sent; tell the resident in person.</span>
        </label>
        {error && <Message>{error}</Message>}
        {!matches && (
          <div className="rr-actions">
            <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Register resident'}</button>
          </div>
        )}
      </form>

      {matches && (
        <div className="rr-dupe" role="alert">
          <strong>{matches.length === 1 ? 'A resident with this name is already registered in this barangay.' : 'Residents with this name are already registered in this barangay.'}</strong>
          <span className="small">If it is the same person, select them instead of registering again.</span>
          <ul className="rs-results">
            {matches.map((r) => (
              <li key={r.resident_id} className="rs-card">
                <span className="rs-avatar" aria-hidden="true"><Svg d={ICONS.user} size={20} /></span>
                <span className="rs-info">
                  <strong>{r.name}</strong>
                  <span className="small">Resident ID: <b className="nowrap">{r.qr_code}</b></span>
                  <span className="small muted">{r.barangay ? `Brgy. ${r.barangay}` : 'Barangay not recorded'}</span>
                </span>
                <button type="button" className="btn btn-sm" onClick={() => setPicked(r)}>Select resident</button>
              </li>
            ))}
          </ul>
          <div className="rr-actions">
            <button type="button" className="btn btn-outline" disabled={busy} onClick={() => save(true)}>{busy ? 'Saving…' : 'No, register as a new resident'}</button>
          </div>
        </div>
      )}

      {picked && <VerifyIdentity resident={picked} onClose={() => setPicked(null)} onVerified={onVerified} />}
    </Card>
  );
}
