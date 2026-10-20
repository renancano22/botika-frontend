import { useState, type FormEvent } from 'react';
import { api } from '../../api';
import { useFormErrors } from '../../components/feedback';
import { useApi } from '../../hooks';
import { Card, Message } from '../../components/ui';
import { ICONS, Svg } from '../../components/RequestCards';
import { FIELD } from '../../validation';
import { VerifyIdentity, type Match, type ResidentLookup } from './ResidentSearch';

const QR_ICON = 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM18 14h2M14 18h2';

const EMPTY = { name: '', barangay: '', address_line: '', contact_no: '' };

/**
 * Walk-in resident who is not registered yet (e.g. no cellphone): the staff register them here
 * so the medicines given can be recorded (walk-in dispensing) and taken out of the inventory.
 */
export default function RegisterResident({ onBack, onRegistered, onVerified }: {
  /** Back to Resident ID / QR code (not shown when the staff can only register residents). */
  onBack?: () => void;
  onRegistered: (record: ResidentLookup) => void;
  onVerified: (record: ResidentLookup) => void;
}) {
  const { data: barangays } = useApi<string[]>('/barangays');
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const fe = useFormErrors(['name', 'barangay', 'address_line', 'contact_no']);
  // Already registered in the barangay: the same name (blocked = cannot be registered again) or a similar name.
  const [matches, setMatches] = useState<{ list: Match[]; blocked: boolean; message: string } | null>(null);
  const [picked, setPicked] = useState<Match | null>(null);
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => { setForm({ ...form, [k]: e.target.value }); setMatches(null); fe.clear(k); };

  const save = async (confirmNew = false) => {
    if (busy) return;
    setBusy(true);
    fe.clear();
    try {
      const res = await api.post<ResidentLookup>('/residents', { ...form, confirm_new: confirmNew });
      onRegistered(res.data);
    } catch (err) {
      const e = err as { response?: { status?: number; data?: { matches?: Match[]; blocked?: boolean; message?: string } } };
      const d = e.response?.data;
      if (e.response?.status === 409 && d?.matches) setMatches({ list: d.matches, blocked: !!d.blocked, message: d.message ?? '' });
      else fe.fromError(err);
    } finally { setBusy(false); }
  };
  const submit = (e: FormEvent) => { e.preventDefault(); save(false); };

  return (
    <Card title="1. Register resident" actions={onBack && (
      <button type="button" className="btn btn-outline btn-sm rs-back" onClick={onBack}>
        <Svg d={QR_ICON} size={16} /> Use Resident ID / QR code
      </button>
    )}>
      <p className="muted small rs-intro">For a resident who is not registered yet, for example because they have no cellphone. After saving, add the medicines you give in <strong>Dispense Medicine</strong> so the inventory is updated.</p>
      <form className="rr-form" onSubmit={submit}>
        <label>Full name
          <input value={form.name} onChange={set('name')} placeholder="e.g. Juan Dela Cruz" required maxLength={100} autoFocus autoComplete="off" spellCheck={false} {...FIELD.name} {...fe.invalid('name')} />{fe.error('name')}
        </label>
        <label>Barangay
          <select value={form.barangay} onChange={set('barangay')} required {...fe.invalid('barangay')}>
            <option value="">Select barangay…</option>
            {barangays?.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>{fe.error('barangay')}
        </label>
        <label><span>House no. / Street / Purok <span className="muted small">(optional)</span></span>
          <input value={form.address_line} onChange={set('address_line')} placeholder="e.g. Purok 3, Rizal St." maxLength={120} autoComplete="off" {...fe.invalid('address_line')} />{fe.error('address_line')}
        </label>
        <label><span>Mobile number <span className="muted small">(optional)</span></span>
          <input type="tel" inputMode="tel" value={form.contact_no} onChange={set('contact_no')} placeholder="Leave blank if none" maxLength={16} autoComplete="off" {...FIELD.mobile} {...fe.invalid('contact_no')} />{fe.error('contact_no')}
          <span className="field-hint">Without a mobile number, no SMS is sent; tell the resident in person.</span>
        </label>
        <Message>{fe.general}</Message>
        {!matches && (
          <div className="rr-actions">
            <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Register resident'}</button>
          </div>
        )}
      </form>

      {matches && (
        <div className="rr-dupe" role="alert">
          {matches.blocked ? (
            <>
              <strong>Already registered — this resident cannot be registered again.</strong>
              <span className="small">Select them below. If this is a different person with exactly the same name, add their middle name or suffix (e.g. Jr., Sr.) to tell them apart.</span>
            </>
          ) : (
            <>
              <strong>{matches.list.length === 1 ? 'A resident with a similar name is already registered in this barangay.' : 'Residents with a similar name are already registered in this barangay.'}</strong>
              <span className="small">If it is the same person, select them instead of registering again.</span>
            </>
          )}
          <ul className="rs-results">
            {matches.list.map((r) => (
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
          {!matches.blocked && (
            <div className="rr-actions">
              <button type="button" className="btn btn-outline" disabled={busy} onClick={() => save(true)}>{busy ? 'Saving…' : 'Different person — register as new'}</button>
            </div>
          )}
        </div>
      )}

      {picked && <VerifyIdentity resident={picked} onClose={() => setPicked(null)} onVerified={onVerified} />}
    </Card>
  );
}
