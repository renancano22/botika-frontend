import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth';
import { Empty, Loading } from '../../components/ui';
import { isMixed, RequestNo, SourceTag, Svg, unitPlural } from '../../components/RequestCards';
import type { Dispensing } from '../../types';
import BackButton from '../../components/BackButton';
import { LoadError } from '../../components/feedback';
import { usePhone } from '../../hooks';
import { ALL_ROWS, Pagination, rowNo, useDebounced, usePagedApi } from '../../components/Pagination';
import { Hl, HlId, rowHit } from '../../components/SearchHighlight';

interface Summary { records: number; residents: number; total_quantity: number }

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
  const phone = usePhone();
  const allAtOnce = isResident && phone; // residents on a phone: all their records, no pages
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
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const badRange = !!from && !!to && from > to;
  const searchTerm = useDebounced(search.trim());
  // One page at a time from the server; the search, dates and sort are applied to ALL records there.
  const list = usePagedApi<Dispensing, { summary: Summary }>('/dispensing',
    { ...(badRange ? { from: to, to: from } : { from, to }), search: searchTerm, sort }, { table: 'dispensing', refreshMs: 30000, fixedSize: allAtOnce ? ALL_ROWS : undefined });
  const { data, errorInfo, loading, reload, rows, meta } = list;

  const activePreset = PRESETS.find((p) => { const [f, t] = p.range(); return f === from && t === to; })?.key;
  const rangeText = from && to ? (from === to ? longDate(from) : `${longDate(from)} – ${longDate(to)}`)
    : from ? `From ${longDate(from)}` : to ? `Until ${longDate(to)}` : 'All dates';

  // Totals of every matching record (worked out by the server), not only of the page shown.
  const summary = data?.summary;
  const filtered = !!from || !!to || !!search.trim();

  return (
    <div className="page dr-page">
      <BackButton linkedOnly />
      <header className="page-head">
        <div>
          <div className="page-title"><h1>{isResident ? 'My Medicine History' : 'Dispensing Records'}</h1></div>
          <p className="muted">
            {isResident ? 'Medicines you received from Botika ng Bayan, newest first.' : 'Every release of medicine to a resident, newest first.'}
          </p>
        </div>
      </header>
      <LoadError error={errorInfo} onRetry={() => reload()} />

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
          <label className="dr-field dr-field-sort">
            <span>Sort</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as 'newest' | 'oldest')} aria-label="Sort">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
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
        <div><small>Records</small><strong>{summary?.records ?? '—'}</strong></div>
        {!isResident && <div><small>Residents served</small><strong>{summary?.residents ?? '—'}</strong></div>}
        <div><small>Total quantity given</small><strong>{summary?.total_quantity ?? '—'}</strong></div>
      </div>

      <section className="card dr-card">
        {loading && !data ? <Loading /> : !data ? null : rows.length === 0 ? (
          <Empty>{filtered ? 'No dispensing records match these filters. Try another date range or clear the filters.' : 'No dispensing records yet.'}</Empty>
        ) : (<>
          <table className={`dr-table ${loading ? 'tbl-updating' : ''}`}>
            <thead>
              <tr>
                <th className="col-no">No.</th>
                <th>Date &amp; time</th>
                {!isResident && <th>Resident</th>}
                <th>
                  {/* Two labels: the medicine names, and the quantity of each one (right side, above the quantities). */}
                  <span className="dr-meds-head"><span>Medicines given</span><span>Number of medicine</span></span>
                </th>
                <th className="center">Total qty</th>
                <th>Request</th>
                <th>Dispensed by</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d, i) => {
                const at = new Date(d.dispensed_at);
                const walkIn = d.request?.remarks === 'Walk-in';
                // Request claimed + medicines asked for in person in the same visit: one record, each medicine marked.
                const mixed = !walkIn && isMixed(d.items);
                return (
                  <tr key={d.dispensing_id} className={rowHit(searchTerm, d.request_id) || undefined}>
                    <td data-label="No." className="col-no">{rowNo(meta, i)}</td>
                    <td data-label="Date & time">
                      <strong className="dr-date">{at.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</strong>
                      <span className="muted small dr-time">{at.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })} · Record No. {d.dispensing_id}</span>
                    </td>
                    {!isResident && (
                      <td data-label="Resident">
                        <strong><Hl q={searchTerm}>{d.request?.resident?.name ?? '—'}</Hl></strong>
                        <span className="muted small dr-sub"><Hl q={searchTerm}>{d.request?.resident?.qr_code}</Hl></span>
                      </td>
                    )}
                    <td data-label="Medicines given">
                      <ul className="dr-meds">
                        {d.items.map((i, n) => (
                          <li key={i.dispensing_item_id}>
                            <span className="dr-med-icon dr-med-no" aria-label={`Medicine ${n + 1}`}>{n + 1}</span>
                            <span><Hl q={searchTerm}>{i.medicine.medicine_name}</Hl>{mixed && <> <SourceTag source={i.source} /></>}</span>
                            <b>{i.quantity} {i.quantity === 1 ? i.medicine.unit : unitPlural(i.medicine.unit)}</b>
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td data-label="Total qty" className="center"><span className="dr-total">{d.items.reduce((a, i) => a + i.quantity, 0)}</span></td>
                    <td data-label="Request">
                      <HlId q={searchTerm} id={d.request_id}><RequestNo id={d.request_id} /></HlId>
                      <span className={`dr-tag ${walkIn ? 'dr-tag-walkin' : ''}`}>{walkIn ? 'Walk-in' : 'Online request'}</span>
                      {mixed && <span className="dr-tag dr-tag-walkin">+ Walk-in</span>}
                    </td>
                    <td data-label="Dispensed by">{d.dispenser?.name ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>)}
        {/* Residents on a phone see all their records in one list (page buttons only if there are ever more than 100). */}
        {(!allAtOnce || (meta?.last_page ?? 1) > 1) && <Pagination meta={meta} onPage={list.setPage} onPerPage={allAtOnce ? undefined : list.setPerPage} busy={loading} />}
      </section>
    </div>
  );
}
