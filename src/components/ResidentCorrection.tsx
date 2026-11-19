import { useState } from 'react';
import { useApi } from '../hooks';
import { formatDate } from '../api';
import { LoadError } from './feedback';

export type CorrectionVerification = { identity_verified: boolean; verification_method: string; correction_reason: string };
export const emptyVerification = (): CorrectionVerification => ({ identity_verified: false, verification_method: '', correction_reason: '' });
export const correctionVerified = (value: CorrectionVerification) => {
  const reason = value.correction_reason.trim().replace(/\s+/gu, ' ');
  return value.identity_verified && ['valid_id', 'barangay_id'].includes(value.verification_method) && reason.length >= 10 && reason.length <= 500 && /\p{L}/u.test(reason);
};

export function ResidentCorrectionFields({ value, onChange, disabled, hasOnlineAccount = true }: { value: CorrectionVerification; onChange: (value: CorrectionVerification) => void; disabled?: boolean; hasOnlineAccount?: boolean }) {
  return <fieldset className="resident-correction-fields" disabled={disabled}>
    <legend>Verify this correction</legend>
    <p>Check the resident’s identity and confirm the correction they requested before saving. This confirmation and your reason will be recorded.</p>
    <label>ID checked<select aria-label="ID checked" required value={value.verification_method} onChange={(e) => onChange({ ...value, verification_method: e.target.value, identity_verified: false })}>
      <option value="">Select the ID you checked</option><option value="valid_id">Valid ID</option><option value="barangay_id">Barangay ID</option>
    </select></label>
    <label>Reason for correction<textarea aria-label="Reason for correction" value={value.correction_reason} minLength={10} maxLength={500} rows={3} required placeholder="For example: Corrected a misspelled surname after checking the resident’s ID." onChange={(e) => onChange({ ...value, correction_reason: e.target.value })} /></label>
    <label className="correction-confirm"><input type="checkbox" required checked={value.identity_verified} onChange={(e) => onChange({ ...value, identity_verified: e.target.checked })} /><span>I checked the resident’s ID and confirmed these changes were requested by the resident.</span></label>
    <small>{hasOnlineAccount ? 'The resident will receive an in-app notice.' : 'This resident has no online account. Explain the correction to them in person; it will also be recorded in the history.'} Do not enter ID numbers or upload ID copies here.</small>
  </fieldset>;
}

interface Correction { correction_id: number; actor_name: string; reason: string; verification_method: string; created_at: string; changes: Record<string, { from: string | null; to: string | null }> }
interface History { data: Correction[]; current_page: number; last_page: number }
const LABELS: Record<string, string> = { name: 'Full name', email: 'Email', barangay: 'Barangay' };

export function ResidentCorrectionHistory({ residentId }: { residentId: number }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const { data, loading, errorInfo, reload } = useApi<History>(open ? `/residents/${residentId}/corrections` : null, { page });
  return <section className="correction-history">
    <button type="button" className="link-button" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Hide correction history' : 'View correction history'}</button>
    {open && <div>
      <LoadError error={errorInfo} onRetry={() => reload()} />
      {loading ? <p className="muted small" role="status">Loading correction history…</p> : data && <>
        {!data.data.length && <p className="muted small">No corrections recorded yet. Changes made before this safeguard was introduced are not included.</p>}
        <ol>{data.data.map((entry) => <li key={entry.correction_id}>
          <strong>{entry.actor_name}</strong><time>{formatDate(entry.created_at, true)}</time>
          <span>Identity checked using {entry.verification_method === 'barangay_id' ? 'Barangay ID' : 'valid ID'}.</span>
          <p>{entry.reason}</p>
          <dl>{Object.entries(entry.changes).map(([field, change]) => <div key={field}><dt>{LABELS[field] ?? field}</dt><dd><span>{change.from || 'Not set'}</span><span aria-hidden="true"> → </span><strong>{change.to || 'Not set'}</strong></dd></div>)}</dl>
        </li>)}</ol>
        {data.last_page > 1 && <div className="correction-history-pages"><button type="button" className="btn btn-outline btn-sm" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>Previous</button><span>Page {data.current_page} of {data.last_page}</span><button type="button" className="btn btn-outline btn-sm" disabled={page >= data.last_page || loading} onClick={() => setPage(page + 1)}>Next</button></div>}
      </>}
    </div>}
  </section>;
}
