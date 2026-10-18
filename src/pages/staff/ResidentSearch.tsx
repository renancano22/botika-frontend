import { Fragment, useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
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

const SEARCH_ICON = 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.5-3.5';
const NAME_PATTERN = /^[\p{L}\s.'-]+$/u;
const status = (err: unknown) => (err as { response?: { status?: number } }).response?.status;
const SEARCH_DELAY_MS = 300; // wait until the staff pause typing, so not every key press calls the server
const cleanName = (v: string) => v.trim().replace(/\s+/g, ' ');

/** Shows the typed parts of the name in bold, e.g. "juan cr" → **Juan** Dela **Cr**uz. */
function Highlight({ text, query }: { text: string; query: string }) {
  const words = cleanName(query).split(' ').filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!words.length) return <>{text}</>;
  const parts = text.split(new RegExp(`(${words.join('|')})`, 'gi'));
  return <>{parts.map((part, i) => (i % 2 ? <mark key={i} className="rs-mark">{part}</mark> : <Fragment key={i}>{part}</Fragment>))}</>;
}

/**
 * "Forgot Resident ID or QR code?": find the resident by registered full name (optionally the barangay),
 * then the staff confirm the resident's identity in person before their record is opened for dispensing.
 */
export default function ResidentSearch({ onBack, onVerified }: { onBack: () => void; onVerified: (record: ResidentLookup) => void }) {
  const { data: barangays } = useApi<string[]>('/barangays');
  const [name, setName] = useState('');
  const [barangay, setBarangay] = useState('');
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [found, setFound] = useState<{ results: Match[]; total: number } | null>(null);
  const [picked, setPicked] = useState<Match | null>(null);

  // Only the newest search may show its results (an older, slower reply is ignored).
  const latest = useRef(0);
  const [searchedFor, setSearchedFor] = useState('');

  const runSearch = useCallback(async (rawName: string, brgy: string) => {
    const typed = cleanName(rawName);
    const id = ++latest.current;
    setError('');
    if (typed.length < 2) { setFound(null); setSearching(false); return; }
    if (!NAME_PATTERN.test(typed)) {
      setFound(null); setSearching(false);
      setError('The name can only have letters, spaces, periods, apostrophes and hyphens.');
      return;
    }
    setSearching(true);
    try {
      const res = await api.get<{ results: Match[]; total: number }>('/residents/search', { params: { name: typed, barangay: brgy || undefined } });
      if (id !== latest.current) return;
      setFound(res.data);
      setSearchedFor(typed);
    } catch (err) {
      if (id !== latest.current) return;
      setFound(null);
      const code = status(err);
      setError(code === 403 ? 'Only pharmacy staff and the administrator can search residents.'
        : code === 429 ? 'Too many searches in a short time. Wait a moment, then keep typing.'
        : errorMessage(err));
    } finally {
      if (id === latest.current) setSearching(false);
    }
  }, []);

  // Results update by themselves while the staff type (or change the barangay).
  useEffect(() => {
    const timer = window.setTimeout(() => runSearch(name, barangay), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [name, barangay, runSearch]);

  // Enter searches right away.
  const search = (e: FormEvent) => { e.preventDefault(); runSearch(name, barangay); };
  const typedLength = cleanName(name).length;

  const results = found?.results ?? [];
  const sameName = new Set(results.map((r) => r.name.toLowerCase())).size < results.length;

  return (
    <Card title="1. Find resident by name" actions={
      <button type="button" className="btn btn-ghost rs-back" onClick={onBack}>
        <Svg d={ICONS.back} size={16} width={2.4} /> Use Resident ID or QR code
      </button>
    }>
      <p className="muted small rs-intro">For residents who forgot their QR code and Resident ID. Start typing any part of the name they registered with — results appear as you type. Then confirm their identity before dispensing.</p>
      <form className="rs-form" onSubmit={search} noValidate>
        <label><span>Resident's name <span className="rs-req" aria-hidden="true">*</span></span>
          <span className="rs-input">
            <Svg d={SEARCH_ICON} size={18} />
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Type a first name, last name or part of it" maxLength={100} required autoFocus autoComplete="off" aria-describedby="rs-status" />
            {searching && <span className="rs-spinner" aria-hidden="true" />}
          </span>
        </label>
        <label><span>Barangay <span className="muted small">(optional)</span></span>
          <select value={barangay} onChange={(e) => setBarangay(e.target.value)}>
            <option value="">All barangays</option>
            {barangays?.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </label>
      </form>
      <p id="rs-status" className="sr-only" role="status" aria-live="polite">
        {searching ? 'Searching residents…' : found ? `${found.total} ${found.total === 1 ? 'resident matches' : 'residents match'}` : ''}
      </p>

      {error && <Message>{error}</Message>}
      {!error && typedLength < 2 && <p className="muted small rs-start">{typedLength === 1 ? 'Keep typing — at least 2 letters.' : 'Results will appear here as you type.'}</p>}
      {!found && searching && <p className="empty">Searching residents…</p>}

      {found && typedLength >= 2 && (results.length === 0 ? (
        <Empty>
          No registered resident matches "{searchedFor}"{barangay ? ` in ${barangay}` : ''}. Check the spelling, try only the first or last name
          {barangay ? ', or search all barangays' : ''}. If the resident is not registered, they can register first.
        </Empty>
      ) : (
        <div className={`rs-results-wrap ${searching ? 'is-updating' : ''}`}>
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
                  <strong><Highlight text={r.name} query={searchedFor} /></strong>
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

/** Selecting a name does not verify anyone: the staff check the resident's identity in person and confirm it. */
function VerifyIdentity({ resident, onClose, onVerified }: { resident: Match; onClose: () => void; onVerified: (record: ResidentLookup) => void }) {
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.post<ResidentLookup>(`/residents/${resident.resident_id}/verify`, { identity_confirmed: confirmed });
      onVerified(res.data);
    } catch (err) {
      const code = status(err);
      setError(code === 429 ? 'Too many attempts. Wait a minute, then try again.'
        : code === 404 ? 'This resident record no longer exists. Search again.'
        : errorMessage(err));
    } finally { setBusy(false); }
  };

  return (
    <Modal title="Confirm the resident's identity" onClose={() => !busy && onClose()}>
      <form onSubmit={verify}>
        <div className="rs-picked">
          <strong>{resident.name}</strong>
          <span className="small">Resident ID: {resident.qr_code}{resident.barangay ? ` · Brgy. ${resident.barangay}` : ''}</span>
        </div>
        <p className="small rs-warn">Selecting a name does not verify the resident. Confirm their identity before releasing any medicine.</p>
        <label className="rx-check">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} autoFocus />
          <span>I checked the resident's identity following the Botika ng Bayan's identity-verification procedure, and they are the person named above.</span>
        </label>
        {error && <Message>{error}</Message>}
        <div className="modal-actions">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn" disabled={busy || !confirmed}>{busy ? 'Verifying…' : 'Verify identity'}</button>
        </div>
      </form>
    </Modal>
  );
}
