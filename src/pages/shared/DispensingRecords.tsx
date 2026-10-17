import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth';
import { useApi } from '../../hooks';
import { Empty, Loading, Message } from '../../components/ui';
import { ICONS, RequestNo, Svg, unitPlural } from '../../components/RequestCards';
import type { Dispensing } from '../../types';
import BackButton from '../../components/BackButton';

/** YYYY-MM-DD in local time. */
const ymd = (d: Date) => d.toLocaleDateString('en-CA');
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); };
const monthStart = () => { const d = new Date(); return ymd(new Date(d.getFullYear(), d.getMonth(), 1)); };
const longDate = (v: string) => new Date(`${v}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });

type Preset = 'today' | 'week' | 'month' | 'all';
const PRESETS: { key: Preset; label: string; range: () => [string, string] }[] = [
  { key: 'today', label: 'Today', range: () => [ymd(new Date()), ymd(new Date())] },
  { key: 'week', label: 'Last 7 days', range: () => [daysAgo(6), ymd(new Date())] },
  { key: 'month', label: 'This month', range: () => [monthStart(), ymd(new Date())] },
  { key: 'all', label: 'All dates', range: () => ['', ''] },
];

const CALENDAR = 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4';
const SEARCH = 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M21 21l-5-5';

/** Monitoring of medicine distribution and patient dispensing records (Objective 3.2). */
export default function DispensingRecords() {
  const { user } = useAuth();
  const isResident = user?.role === 'resident';
  // ?from=YYYY-MM-DD&to=YYYY-MM-DD (e.g. "Dispensed today" on the dashboard) opens the records already filtered.
  const [params, setParams] = useSearchParams();
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const setRange = (f: string, t: string) => {
    const next: Record<string, string> = {};
    if (f) next.from = f;
    if (t) next.to = t;
    setParams(next, { replace: true });
  };
  const [search, setSearch] = useState('');
  const badRange = !!from && !!to && from > to;
  const { data, error, loading } = useApi<Dispensing[]>('/dispensing', badRange ? { from: to, to: from } : { from, to }, 30000);

  const activePreset = PRESETS.find((p) => { const [f, t] = p.range(); return f === from && t === to; })?.key;
  const rangeText = from && to ? (from === to ? longDate(from) : `${longDate(from)} – ${longDate(to)}`)
    : from ? `From ${longDate(from)}` : to ? `Until ${longDate(to)}` : 'All dates';

  const term = search.trim().toLowerCase().replace(/^(request\s*)?(no\.?|#)\s*(?=\d)/, '');
  const rows = useMemo(() => (data ?? []).filter((d) => !term
    || String(d.request_id) === term
    || d.request?.resident?.name.toLowerCase().includes(term)
    || d.request?.resident?.qr_code.toLowerCase().includes(term)
    || d.items.some((i) => i.medicine.medicine_name.toLowerCase().includes(term))), [data, term]);

  const totalQty = rows.reduce((s, d) => s + d.items.reduce((a, i) => a + i.quantity, 0), 0);
  const residents = new Set(rows.map((d) => d.request?.resident_id)).size;
  const filtered = !!from || !!to || !!term;

  return (
    <div className="page dr-page">
      <header className="page-head">
        <div>
          <div className="page-title"><BackButton linkedOnly /><h1>{isResident ? 'My Medicine History' : 'Dispensing Records'}</h1></div>
          <p className="muted">
            {isResident ? 'Medicines you received from Botika ng Bayan, newest first.' : 'Every release of medicine to a resident, newest first.'}
          </p>
        </div>
      </header>
      <Message>{error}</Message>

      <section className="card dr-filters" aria-label="Filters">
        <div className="dr-presets" role="group" aria-label="Quick date range">
          {PRESETS.map((p) => (
            <button key={p.key} type="button" className={`chip ${activePreset === p.key ? 'active' : ''}`} onClick={() => setRange(...p.range())}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="dr-fields">
          <label className="dr-field">
            <span>From</span>
            <span className="dr-input">
              <Svg d={CALENDAR} size={18} />
              <input type="date" value={from} max={to || undefined} onChange={(e) => setRange(e.target.value, to)} aria-label="From date" />
            </span>
          </label>
          <label className="dr-field">
            <span>To</span>
            <span className="dr-input">
              <Svg d={CALENDAR} size={18} />
              <input type="date" value={to} min={from || undefined} onChange={(e) => setRange(from, e.target.value)} aria-label="To date" />
            </span>
          </label>
          <label className="dr-field dr-field-search">
            <span>Search</span>
            <span className="dr-input">
              <Svg d={SEARCH} size={18} />
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder={isResident ? 'Medicine or request no.' : 'Name, Resident ID, medicine or request no.'} />
            </span>
          </label>
          {/* Always shown so it is easy to find; inactive when there is nothing to clear. */}
          <button type="button" className="btn btn-outline dr-clear" disabled={!filtered} onClick={() => { setSearch(''); setRange('', ''); }}>
            Clear filters
          </button>
        </div>
        {badRange && <p className="field-warning">The "From" date is after the "To" date, so the dates were swapped.</p>}
      </section>

      <div className="dr-summary">
        <div><small>Showing</small><strong>{rangeText}</strong></div>
        <div><small>Records</small><strong>{rows.length}</strong></div>
        {!isResident && <div><small>Residents served</small><strong>{residents}</strong></div>}
        <div><small>Total quantity given</small><strong>{totalQty}</strong></div>
      </div>

      <section className="card dr-card">
        {loading && !data ? <Loading /> : rows.length === 0 ? (
          <Empty>{filtered ? 'No dispensing records match these filters. Try another date range or clear the filters.' : 'No dispensing records yet.'}</Empty>
        ) : (
          <table className="dr-table">
            <thead>
              <tr>
                <th>Date &amp; time</th>
                {!isResident && <th>Resident</th>}
                <th>Medicines given</th>
                <th className="center">Total qty</th>
                <th>Request</th>
                <th>Dispensed by</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => {
                const at = new Date(d.dispensed_at);
                const walkIn = d.request?.remarks === 'Walk-in';
                return (
                  <tr key={d.dispensing_id}>
                    <td data-label="Date & time">
                      <strong className="dr-date">{at.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</strong>
                      <span className="muted small dr-time">{at.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })} · Record No. {d.dispensing_id}</span>
                    </td>
                    {!isResident && (
                      <td data-label="Resident">
                        <strong>{d.request?.resident?.name ?? '—'}</strong>
                        <span className="muted small dr-sub">{d.request?.resident?.qr_code}</span>
                      </td>
                    )}
                    <td data-label="Medicines given">
                      <ul className="dr-meds">
                        {d.items.map((i) => (
                          <li key={i.dispensing_item_id}>
                            <span className="dr-med-icon"><Svg d={ICONS.pill} size={14} width={2.2} /></span>
                            <span>{i.medicine.medicine_name}</span>
                            <b>{i.quantity} {i.quantity === 1 ? i.medicine.unit : unitPlural(i.medicine.unit)}</b>
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td data-label="Total qty" className="center"><span className="dr-total">{d.items.reduce((a, i) => a + i.quantity, 0)}</span></td>
                    <td data-label="Request">
                      <RequestNo id={d.request_id} />
                      <span className={`dr-tag ${walkIn ? 'dr-tag-walkin' : ''}`}>{walkIn ? 'Walk-in' : 'Online request'}</span>
                    </td>
                    <td data-label="Dispensed by">{d.dispenser?.name ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
