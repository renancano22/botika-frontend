import { useState, type FormEvent } from 'react';
import { api, errorMessage } from '../../api';
import { useApi } from '../../hooks';
import { Card, Empty, Message, Modal } from '../../components/ui';
import { ICONS, Svg } from '../../components/RequestCards';
import type { Dispensing, MedicineRequest, Resident } from '../../types';

export interface ResidentLookup {
  resident: Resident;
  approved_requests: MedicineRequest[];
  dispensing_history: Dispensing[];
}

/** One search result: only what is needed to pick the right person (no mobile number or address). */
interface Match { resident_id: number; name: string; qr_code: string; barangay: string | null }

const NAME_PATTERN = /^[\p{L}\s.'-]+$/u;
const status = (err: unknown) => (err as { response?: { status?: number } }).response?.status;

/**
 * "Forgot Resident ID or QR code?": find the resident by registered full name (optionally the barangay),
 * then confirm their identity with their registered mobile number before their record is opened for dispensing.
 */
export default function ResidentSearch({ onBack, onVerified }: { onBack: () => void; onVerified: (record: ResidentLookup) => void }) {
  const { data: barangays } = useApi<string[]>('/barangays');
  const [name, setName] = useState('');
  const [barangay, setBarangay] = useState('');
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [found, setFound] = useState<{ results: Match[]; total: number } | null>(null);
  const [picked, setPicked] = useState<Match | null>(null);

  const search = async (e: FormEvent) => {
    e.preventDefault();
    const typed = name.trim().replace(/\s+/g, ' ');
    setError('');
    if (typed.length < 2) return setError("Type at least 2 letters of the resident's registered name.");
    if (!NAME_PATTERN.test(typed)) return setError('The name can only have letters, spaces, periods, apostrophes and hyphens.');
    setSearching(true);
    try {
      const res = await api.get<{ results: Match[]; total: number }>('/residents/search', { params: { name: typed, barangay: barangay || undefined } });
      setFound(res.data);
    } catch (err) {
      setFound(null);
      const code = status(err);
      setError(code === 403 ? 'Only pharmacy staff and the administrator can search residents.'
        : code === 429 ? 'Too many searches in a short time. Wait a minute, then try again.'
        : errorMessage(err));
    } finally { setSearching(false); }
  };

  const results = found?.results ?? [];
  const sameName = new Set(results.map((r) => r.name.toLowerCase())).size < results.length;

  return (
    <Card title="1. Find resident by name" actions={
      <button type="button" className="btn btn-ghost rs-back" onClick={onBack}>
        <Svg d={ICONS.back} size={16} width={2.4} /> Use Resident ID or QR code
      </button>
    }>
      <p className="muted small rs-intro">For residents who forgot their QR code and Resident ID. Search by the full name they registered with, then confirm their identity before dispensing.</p>
      <form className="rs-form" onSubmit={search} noValidate>
        <label><span>Resident's full name <span className="rs-req" aria-hidden="true">*</span></span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Juan Dela Cruz" maxLength={100} required autoFocus autoComplete="off" />
        </label>
        <label><span>Barangay <span className="muted small">(optional)</span></span>
          <select value={barangay} onChange={(e) => setBarangay(e.target.value)}>
            <option value="">All barangays</option>
            {barangays?.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </label>
        <button className="btn rs-submit" disabled={searching}>{searching ? 'Searching…' : 'Search resident'}</button>
      </form>

      {error && <Message>{error}</Message>}
      {searching && <p className="empty" role="status">Searching residents…</p>}

      {!searching && found && (results.length === 0 ? (
        <Empty>
          No registered resident matches "{name.trim()}"{barangay ? ` in ${barangay}` : ''}. Check the spelling, try only the first or last name
          {barangay ? ', or search all barangays' : ''}. If the resident is not registered, they can register first.
        </Empty>
      ) : (
        <div className="rs-results-wrap" aria-live="polite">
          <p className="muted small rs-count">
            {found.total > results.length
              ? `Showing ${results.length} of ${found.total} matches. Add the barangay or more of the name to narrow it down.`
              : `${found.total} ${found.total === 1 ? 'resident matches' : 'residents match'}.`}
            {sameName && ' Some residents have the same name — check the Resident ID and barangay with the resident.'}
          </p>
          <ul className="rs-results">
            {results.map((r) => (
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
        </div>
      ))}

      {picked && <VerifyIdentity resident={picked} onClose={() => setPicked(null)} onVerified={onVerified} />}
    </Card>
  );
}

/** Selecting a name does not verify anyone: the resident states their registered mobile number and the staff confirm the identity check. */
function VerifyIdentity({ resident, onClose, onVerified }: { resident: Match; onClose: () => void; onVerified: (record: ResidentLookup) => void }) {
  const [mobile, setMobile] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.post<ResidentLookup>(`/residents/${resident.resident_id}/verify`, { contact_no: mobile, identity_confirmed: confirmed });
      onVerified(res.data);
    } catch (err) {
      const code = status(err);
      setError(code === 429 ? 'Too many attempts. Wait a minute, then try again.'
        : code === 404 ? 'This resident record no longer exists. Search again.'
        : errorMessage(err));
    } finally { setBusy(false); }
  };

  const digits = mobile.replace(/\D/g, '');
  return (
    <Modal title="Confirm the resident's identity" onClose={() => !busy && onClose()}>
      <form onSubmit={verify}>
        <div className="rs-picked">
          <strong>{resident.name}</strong>
          <span className="small">Resident ID: {resident.qr_code}{resident.barangay ? ` · Brgy. ${resident.barangay}` : ''}</span>
        </div>
        <p className="small rs-warn">Selecting a name does not verify the resident. Confirm their identity before releasing any medicine.</p>
        <label>Registered mobile number
          <input type="tel" inputMode="numeric" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="09XXXXXXXXX" maxLength={20} autoFocus required autoComplete="off" />
          <span className="field-hint">Ask the resident to say the mobile number they registered with. Do not read a number to them.</span>
        </label>
        <label className="rx-check">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          <span>I checked the resident's identity following the Botika ng Bayan's identity-verification procedure, and they are the person named above.</span>
        </label>
        {error && <Message>{error}</Message>}
        <div className="modal-actions">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn" disabled={busy || digits.length < 10 || !confirmed}>{busy ? 'Verifying…' : 'Verify identity'}</button>
        </div>
      </form>
    </Modal>
  );
}
