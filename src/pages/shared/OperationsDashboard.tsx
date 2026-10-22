import { useState, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatDate } from '../../api';
import { useAuth } from '../../auth';
import { useApi } from '../../hooks';
import { Badge, Card, Empty, Loading } from '../../components/ui';
import type { MedicineRequest } from '../../types';
import { ICONS, PickupCountdown, Svg } from '../../components/RequestCards';
import { LoadError } from '../../components/feedback';

interface Sections { requests: boolean; stock: boolean; dispensing: boolean }

/** One medicine in "Most requested medicines" (counted by the server, see DashboardController). */
interface TopMedicine {
  medicine_id: number; medicine_name: string; unit: string | null;
  requests: number; quantity_requested: number; quantity_dispensed: number; restock_requests: number;
  available_stock: number; status: string | null;
}

interface Analytics {
  period: { from: string; to: string; group: 'day' | 'month' };
  records_since: string | null;
  requests: {
    total: number; walk_in: number; demand: number; quantity_requested: number;
    by_status: Record<'pending' | 'approved' | 'dispensed' | 'rejected' | 'cancelled' | 'expired', number>;
    restock: { total: number; pending: number };
  } | null;
  dispensing: { releases: number; quantity: number; residents: number } | null;
  trend: { period: string; requests: number; releases: number; quantity: number }[];
  top_medicines: TopMedicine[];
}

interface OpsDashboard {
  sections: Sections;
  counts: Record<string, number>;
  ready_for_pickup?: MedicineRequest[];
  analytics?: Analytics;
}

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);
const ICON = {
  review: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 14l2 2 4-4',
  restock: 'M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8M16.5 5.5 7.5 10.5',
  users: 'M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 20v-2a4 4 0 0 0-3-3.9M16 2.1a4 4 0 0 1 0 7.8',
  staff: 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21v-2a6 6 0 0 1 12 0v2M19 8v6M16 11h6',
  question: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17h.01',
  alert: 'M12 3 2 20h20zM12 10v4M12 17h.01',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
};

/** YYYY-MM-DD in local time. */
const ymd = (d: Date) => d.toLocaleDateString('en-CA');
const monthsBack = (n: number) => { const d = new Date(); return ymd(new Date(d.getFullYear(), d.getMonth() - n, 1)); };
const daysBack = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); };
const niceDate = (v: string) => new Date(`${v}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
/** Trend labels: "Oct 6" for days, "Oct 2026" for months. */
const periodLabel = (p: string, group: 'day' | 'month') => (group === 'day'
  ? new Date(`${p}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
  : new Date(`${p}-01T00:00:00`).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' }));

/** Period of the demand analysis. "6m" sends no dates: the server's default (the last 6 months). */
type Preset = '30d' | '3m' | '6m' | '12m' | 'custom';
const PRESETS: { key: Exclude<Preset, 'custom'>; label: string; range: () => { from?: string; to?: string } }[] = [
  { key: '30d', label: 'Last 30 days', range: () => ({ from: daysBack(29), to: ymd(new Date()) }) },
  { key: '3m', label: 'Last 3 months', range: () => ({ from: monthsBack(2), to: ymd(new Date()) }) },
  { key: '6m', label: 'Last 6 months', range: () => ({}) },
  { key: '12m', label: 'Last 12 months', range: () => ({ from: monthsBack(11), to: ymd(new Date()) }) },
];

/** Dashboard for the administrator and pharmacy staff. Refreshes every 30 seconds. */
/** A link only when the user may open that page (User Permissions); otherwise the same content without a link. */
function MaybeLink({ to, allowed, className, children, ...rest }: { to: string; allowed: boolean; className?: string; children: ReactNode } & Omit<LinkProps, 'to'>) {
  return allowed ? <Link to={to} className={className} {...rest}>{children}</Link> : <span className={`${className ?? ''} is-static`}>{children}</span>;
}

export default function OperationsDashboard() {
  const { user, can } = useAuth();
  const canMedicines = can('medicines.view');
  const canInventory = can('inventory.view|inventory.manage');
  const isAdmin = user?.role === 'admin';
  const [preset, setPreset] = useState<Preset>('6m');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const badRange = preset === 'custom' && !!custom.from && !!custom.to && custom.from > custom.to;
  const range = preset === 'custom'
    ? (badRange ? { from: custom.to, to: custom.from } : { from: custom.from || undefined, to: custom.to || undefined })
    : PRESETS.find((p) => p.key === preset)!.range();
  const { data, errorInfo, loading, reload } = useApi<OpsDashboard>('/dashboard', range, 30000);

  if (loading && !data) return <Loading />;
  if (!data) return <div className="page"><LoadError error={errorInfo} onRetry={() => reload()} /></div>;
  const c = data.counts;
  const sec = data.sections;
  const today = ymd(new Date());

  return (
    <div className="page">
      <header className="page-head hero-head db-hero">
        <div>
          <h1>{isAdmin ? 'Administrator Dashboard' : 'Pharmacy Staff Dashboard'}</h1>
          <p className="muted">Live overview from the BulanBotikaCare records · updates every 30 seconds</p>
          {isAdmin && <People residents={c.residents} staff={c.staff ?? 0} />}
        </div>
        <div className="actions">
          {can('dispensing.dispense|residents.register') && <Link className="btn" to="/dispense">Dispense medicine</Link>}
          {isAdmin && <Link className="btn btn-outline" to="/forecasting">Demand forecast</Link>}
        </div>
      </header>
      {/* A failed refresh keeps the last numbers on screen and says so. */}
      <LoadError error={errorInfo} onRetry={() => reload()} />


      {(sec.requests || sec.dispensing) && <RequestsPanel c={c} today={today} sections={sec} isAdmin={isAdmin} />}
      {sec.stock && <StockOverview c={c} canMedicines={canMedicines} canInventory={canInventory} />}

      {sec.requests && <ReadyForPickup requests={data.ready_for_pickup ?? []} total={c.approved_to_dispense} />}

      {isAdmin && data.analytics && (
        <DemandAnalysis a={data.analytics} preset={preset} custom={custom} badRange={badRange} busy={loading} isAdmin={isAdmin}
          onPreset={(p) => setPreset(p)} onCustom={(next) => { setCustom(next); setPreset('custom'); }} />
      )}

    </div>
  );
}

/**
 * Demand Analysis: medicine requests and dispensing within a period, the request trend and the most
 * requested medicines (the same records the Demand Forecasting module uses). Every number comes from the server.
 */
function DemandAnalysis({ a, preset, custom, badRange, busy, isAdmin, onPreset, onCustom }: {
  a: Analytics; preset: Preset; custom: { from: string; to: string }; badRange: boolean; busy: boolean; isAdmin: boolean;
  onPreset: (p: Preset) => void; onCustom: (r: { from: string; to: string }) => void;
}) {
  const { period, requests: r, dispensing: d } = a;
  const periodText = period.from === period.to ? niceDate(period.from) : `${niceDate(period.from)} – ${niceDate(period.to)}`;
  const nothing = (r?.total ?? 0) === 0 && (d?.releases ?? 0) === 0 && (r?.restock.total ?? 0) === 0;
  const chart = a.trend.map((t) => ({ ...t, label: periodLabel(t.period, period.group) }));
  const fromInput = preset === 'custom' ? custom.from : period.from;
  const toInput = preset === 'custom' ? custom.to : period.to;

  return (
    <section className={`card db-panel da-panel ${busy ? 'tbl-updating' : ''}`} aria-labelledby="da-title">
      <div className="db-panel-head da-head">
        <div>
          <h2 id="da-title">Demand Analysis</h2>
          <p className="muted small da-sub">Medicine requests and dispensing · <b>{periodText}</b> · grouped by {period.group === 'day' ? 'day' : 'month'}</p>
        </div>
        {isAdmin && <Link to="/forecasting" className="db-more">Demand Forecasting <Svg d={ICONS.chevron} size={16} /></Link>}
      </div>

      <div className="da-filters" role="group" aria-label="Period">
        <div className="chips">
          {PRESETS.map((p) => (
            <button key={p.key} type="button" className={`chip ${preset === p.key ? 'active' : ''}`} onClick={() => onPreset(p.key)}>{p.label}</button>
          ))}
        </div>
        <div className="da-dates">
          <label className="tbl-date">From <input type="date" value={fromInput} max={toInput || undefined} onChange={(e) => onCustom({ from: e.target.value, to: toInput })} aria-label="From date" /></label>
          <label className="tbl-date">To <input type="date" value={toInput} min={fromInput || undefined} onChange={(e) => onCustom({ from: fromInput, to: e.target.value })} aria-label="To date" /></label>
        </div>
      </div>
      {badRange && <p className="field-warning">The "From" date is after the "To" date, so the dates were swapped.</p>}

      {nothing ? (
        <Empty>
          No medicine requests or dispensing records from {periodText}.
          {a.records_since ? ` Records start on ${niceDate(a.records_since)}.` : ' No requests or dispensing have been recorded yet.'}
        </Empty>
      ) : (<>
        <div className="da-kpis">
          {r && (
            <div className="da-kpi">
              <small>Medicine requests</small>
              <strong>{r.total.toLocaleString('en-PH')}</strong>
              <span>{(r.total - r.walk_in).toLocaleString('en-PH')} online · {r.walk_in.toLocaleString('en-PH')} walk-in</span>
            </div>
          )}
          {r && (
            <div className="da-kpi">
              <small>Quantity requested</small>
              <strong>{r.quantity_requested.toLocaleString('en-PH')}</strong>
              <span>from {r.demand} active or completed {plural(r.demand, 'request')}</span>
            </div>
          )}
          {d && (
            <div className="da-kpi">
              <small>Quantity dispensed</small>
              <strong>{d.quantity.toLocaleString('en-PH')}</strong>
              <span>{d.releases} {plural(d.releases, 'release')} · {d.residents} {plural(d.residents, 'resident')}</span>
            </div>
          )}
          {r && (
            <div className="da-kpi">
              <small>Restock requests</small>
              <strong>{r.restock.total.toLocaleString('en-PH')}</strong>
              <span>{r.restock.pending ? `${r.restock.pending} waiting for review` : 'Out-of-stock medicines asked for'}</span>
            </div>
          )}
        </div>

        <div className="da-charts">
          <div className="da-chart">
            <h3>{r && d ? 'Requests submitted and releases dispensed' : r ? 'Requests submitted' : 'Releases dispensed'}</h3>
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={chart} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="label" fontSize={11} interval="preserveStartEnd" minTickGap={12} />
                <YAxis fontSize={11} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {r && <Bar dataKey="requests" name="Requests submitted" fill="#8fc79d" radius={[3, 3, 0, 0]} />}
                {d && <Bar dataKey="releases" name="Releases dispensed" fill="#228b39" radius={[3, 3, 0, 0]} />}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <h3 className="da-table-title">Most requested medicines</h3>
        {a.top_medicines.length === 0 ? <Empty>No medicine was requested or dispensed in this period.</Empty> : (
          <div className="da-table-wrap">
            <table className="da-table">
              <thead>
                <tr>
                  <th className="col-no">No.</th><th>Medicine</th>
                  {r && <th className="right">Requests</th>}
                  {r && <th className="right">Qty requested</th>}
                  {d && <th className="right">Qty dispensed</th>}
                  {r && <th className="right">Restock requests</th>}
                  <th>Current stock</th>
                </tr>
              </thead>
              <tbody>
                {a.top_medicines.map((m, i) => (
                  <tr key={m.medicine_id}>
                    <td className="col-no">{i + 1}</td>
                    <td><strong>{m.medicine_name}</strong></td>
                    {r && <td className="right num">{m.requests}</td>}
                    {r && <td className="right num">{m.quantity_requested}</td>}
                    {d && <td className="right num">{m.quantity_dispensed}</td>}
                    {r && <td className="right num">{m.restock_requests}</td>}
                    <td className="nowrap">
                      {m.status === 'unrecorded' ? <Badge value="unrecorded" /> : <>{m.available_stock} {m.unit ? (m.available_stock === 1 ? m.unit : `${m.unit}s`) : ''} {m.status && m.status !== 'available' && <Badge value={m.status} />}</>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>)}

      <details className="da-rules">
        <summary>How these numbers are counted</summary>
        <ul>
          <li><b>Medicine requests</b>: each request is counted once (even with several medicines), on the date it was submitted, with its current status. Walk-in releases are recorded as requests and shown separately.</li>
          <li><b>Quantity requested</b>: requests that are pending, ready for pickup or completed. Rejected, cancelled and expired (not claimed) requests are not counted as demand — the same rule as Demand Forecasting.</li>
          <li><b>Quantity dispensed</b>: medicines actually given out, on the date they were given. These are the records Demand Forecasting uses.</li>
          <li><b>Restock requests</b>: requests for out-of-stock medicines (cancelled ones are not counted).</li>
          <li><b>Current stock</b>: the quantity in batches that have not expired, as of now.</li>
        </ul>
      </details>
    </section>
  );
}

/** Approved medicine requests waiting to be claimed: whose they are, what, and until when. */
function ReadyForPickup({ requests, total }: { requests: MedicineRequest[]; total: number }) {
  return (
    <Card title={`Ready for pickup (${total})`} actions={<Link to="/requests?status=approved">View all approved requests</Link>}>
      {requests.length === 0 ? <Empty>No approved requests are waiting to be claimed.</Empty> : (
        <table>
          <thead><tr><th>Request No.</th><th>Resident</th><th>Medicines</th><th>Approved</th><th>Claim by</th></tr></thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.request_id}>
                <td className="nowrap">No. {r.request_id}</td>
                <td>
                  <strong>{r.resident?.name}</strong>
                  <div className="muted small">{r.resident?.qr_code}{r.resident?.contact_no ? ` · ${r.resident.contact_no}` : ''}</div>
                </td>
                <td>{r.items.map((i) => `${i.medicine.medicine_name} ×${i.quantity}`).join(', ')}</td>
                <td className="nowrap">{formatDate(r.reviewed_at, true)}{r.reviewer && <div className="muted small">by {r.reviewer.name}</div>}</td>
                <td className="nowrap">{formatDate(r.claim_by)}<div><PickupCountdown claimBy={r.claim_by} /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {total > requests.length && <p className="muted small">Showing the {requests.length} with the nearest deadline. <Link to="/requests?status=approved">See all {total}</Link></p>}
    </Card>
  );
}

/** People overview, inside the dashboard header: registered residents and active pharmacy staff. */
function People({ residents, staff }: { residents: number; staff: number }) {
  const items = [
    { to: '/users?role=resident', icon: ICON.users, text: `${residents.toLocaleString('en-PH')} registered ${plural(residents, 'resident')}` },
    { to: '/users?role=staff', icon: ICON.staff, text: `${staff} active pharmacy staff` },
  ];
  return (
    <p className="db-people">
      {items.map((p) => <Link key={p.to} to={p.to} className="db-person"><Svg d={p.icon} size={16} /> {p.text}</Link>)}
    </p>
  );
}

/** Requests & Dispensing: one summary panel with four sections (tap a section to open it). */
function RequestsPanel({ c, today, sections, isAdmin }: { c: Record<string, number>; today: string; sections: Sections; isAdmin: boolean }) {
  const all = [
    { to: '/requests?type=medicine&status=pending', tone: 'review', icon: ICON.review, value: c.pending_requests, label: 'Pending requests',
      hint: c.pending_requests ? 'Waiting for review' : 'All reviewed', alert: c.pending_requests > 0 },
    { to: '/requests?type=medicine&status=approved', tone: 'ready', icon: ICONS.check, value: c.approved_to_dispense, label: 'Ready for pickup',
      hint: c.approved_to_dispense ? 'Waiting to be claimed' : 'None waiting', alert: false },
    { to: `/dispensing?from=${today}&to=${today}`, tone: 'completed', icon: ICONS.hand, value: c.dispensed_today, label: 'Dispensed today',
      hint: `${plural(c.dispensed_today, 'release')} today`, alert: false },
    { to: '/requests?type=restock&status=pending', tone: 'restock', icon: ICON.restock, value: c.pending_restock, label: 'Pending restock',
      hint: c.pending_restock ? 'Needs admin review' : 'None waiting', alert: c.pending_restock > 0 },
  ];
  // Only what this user may open (User Permissions): request numbers need Requests, "Dispensed today" needs Dispensing Records.
  const items = all.filter((m) => (m.label === 'Dispensed today' ? sections.dispensing : sections.requests))
    .filter((m) => isAdmin || m.label !== 'Pending restock'); // restock requests are reviewed by the administrator
  return (
    <section className="card db-panel" aria-labelledby="db-req-title">
      <div className="db-panel-head">
        <h2 id="db-req-title">Requests &amp; Dispensing <span className="muted small db-asof">as of now</span></h2>
        {sections.requests && <Link to="/requests" className="db-more">All requests <Svg d={ICONS.chevron} size={16} /></Link>}
      </div>
      <div className={`db-req db-req-n${items.length}`}>
        {items.map((m) => (
          <Link key={m.label} to={m.to} className={`db-req-item t-${m.tone} ${m.alert ? 'is-alert' : ''}`}>
            <span className="db-req-label"><span className="db-req-icon"><Svg d={m.icon} size={18} /></span>{m.label}</span>
            <strong className="db-req-value">{m.value}</strong>
            <span className="db-req-hint">{m.alert && <span className="db-dot" aria-hidden="true" />}{m.hint}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/**
 * Medicine Stock Overview: all medicines split by stock status (one bar, labelled legend with counts),
 * plus batch expiry. Orange = low stock / expiring, red = out of stock / expired, grey = not recorded.
 */
function StockOverview({ c, canMedicines, canInventory }: { c: Record<string, number>; canMedicines: boolean; canInventory: boolean }) {
  const unrecorded = c.unrecorded ?? 0;
  const available = c.available ?? 0; // counted by the server (each medicine once, by its non-expired stock)
  const segments = [
    { key: 'available', label: 'Available', value: available, icon: ICONS.check, to: '/medicines?status=available' },
    { key: 'low', label: 'Low stock', value: c.low_stock, icon: ICON.alert, to: '/medicines?status=low_stock' },
    { key: 'unrecorded', label: 'Stock not recorded', value: unrecorded, icon: ICON.question, to: '/medicines?status=unrecorded' },
    { key: 'out', label: 'Out of stock', value: c.out_of_stock, icon: ICONS.x, to: '/medicines?status=out_of_stock' },
  ];
  const pct = (n: number) => (c.medicines ? Math.round((n / c.medicines) * 100) : 0);
  const summary = segments.map((s) => `${s.label} ${s.value}`).join(', ');

  return (
    <section className="card db-panel" aria-labelledby="db-stock-title">
      <div className="db-panel-head">
        <h2 id="db-stock-title">Medicine Stock Overview <span className="muted small db-asof">as of now</span></h2>
        {canMedicines && <Link to="/medicines" className="db-more">Medicine List <Svg d={ICONS.chevron} size={16} /></Link>}
      </div>
      <div className="db-stock">
        <div className="db-stock-main">
          <MaybeLink to="/medicines" allowed={canMedicines} className="db-total">
            <strong>{c.medicines}</strong>
            <span>All medicines</span>
          </MaybeLink>
          {c.medicines > 0 && (
            <div className="db-bar" role="img" aria-label={`Stock status of ${c.medicines} medicines: ${summary}`}>
              {segments.filter((s) => s.value > 0).map((s) => (
                <span key={s.key} className={`db-seg tone-${s.key}`} style={{ flexGrow: s.value }}
                  title={`${s.label}: ${s.value} ${plural(s.value, 'medicine')} (${pct(s.value)}%)`} aria-hidden="true" />
              ))}
            </div>
          )}
          <ul className="db-legend">
            {segments.map((s) => (
              <li key={s.key}>
                <MaybeLink to={s.to} allowed={canMedicines} className={`db-legend-item tone-${s.key}`}>
                  <span className="db-swatch" aria-hidden="true"><Svg d={s.icon} size={13} width={2.6} /></span>
                  <span className="db-legend-label">{s.label}</span>
                  <strong>{s.value}</strong>
                  <span className="db-legend-pct">{pct(s.value)}%</span>
                </MaybeLink>
              </li>
            ))}
          </ul>
        </div>
        <div className="db-expiry">
          <h3>Batch expiry</h3>
          <MaybeLink to="/inventory?expiry=near_expiry" allowed={canInventory} className={`db-exp-row tone-low ${c.near_expiry ? 'is-alert' : ''}`}>
            <span className="db-exp-icon"><Svg d={ICONS.clock} size={20} /></span>
            <span className="db-exp-text"><span>Expiring in 1 month</span><small>{c.near_expiry ? 'Dispense these first' : 'Nothing expiring soon'}</small></span>
            <strong>{c.near_expiry}</strong>
          </MaybeLink>
          <MaybeLink to="/inventory?expiry=expired" allowed={canInventory} className={`db-exp-row tone-out ${c.expired ? 'is-alert' : ''}`}>
            <span className="db-exp-icon"><Svg d={ICONS.x} size={20} /></span>
            <span className="db-exp-text"><span>Expired batches</span><small>{c.expired ? 'Remove from stock' : 'No expired stock'}</small></span>
            <strong>{c.expired}</strong>
          </MaybeLink>
        </div>
      </div>
    </section>
  );
}
