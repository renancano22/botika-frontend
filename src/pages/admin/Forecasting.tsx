import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { CartesianGrid, LabelList, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, formatDate } from '../../api';
import { LoadError, toast } from '../../components/feedback';
import { useApi } from '../../hooks';
import { Empty, Loading, Modal } from '../../components/ui';
import { ICONS, quantityText, Svg, unitPlural } from '../../components/RequestCards';
import type { ForecastMethod, ForecastMethodResult, ForecastReport, ForecastResult } from '../../types';
import { jumpTo } from '../../scroll';
import { Pagination, useClientPages } from '../../components/Pagination';
import BackButton from '../../components/BackButton';

const METHODS: { key: ForecastMethod; label: string; hint: string }[] = [
  { key: 'moving_average', label: 'Moving Average', hint: 'Average of the last 3 months' },
  { key: 'linear_regression', label: 'Linear Regression', hint: 'Straight trend line through the monthly totals' },
  { key: 'exponential_smoothing', label: 'Time-Series Analysis', hint: 'Exponential smoothing (α = 0.3): recent months count more' },
];
const METHOD_LABEL = Object.fromEntries(METHODS.map((m) => [m.key, m.label])) as Record<ForecastMethod, string>;
const HISTORY_OPTIONS = [6, 12, 24];
const HORIZON_OPTIONS = [1, 3, 6];

const ICON = {
  bars: 'M6 20v-8M12 20V5M18 20v-11',
  trend: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4',
  alert: 'M12 3 2 20h20zM12 10v4M12 17h.01',
  filter: 'M3 5h18l-7 8v6l-4 2v-8z',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
};

/** "2026-10" → "Oct 2026" */
const monthText = (key: string) => new Date(`${key.slice(0, 7)}-01T00:00:00`).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' });
const periodText = (keys: string[]) => (keys.length ? (keys.length === 1 ? monthText(keys[0]) : `${monthText(keys[0])} – ${monthText(keys[keys.length - 1])}`) : '—');
const round1 = (n: number) => Math.round(n * 10) / 10;
const monthsText = (n: number) => `${n} Month${n === 1 ? '' : 's'}`;
const monthsLower = (n: number) => `${n} month${n === 1 ? '' : 's'}`;
/** "2026-10-14" → "Oct 14, 2026" */
const dayText = (v: string) => new Date(`${v}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
const num = (n: number) => round1(n).toLocaleString('en-PH');

const PRIORITY_ORDER = { high: 0, medium: 1 } as const;
const sortRows = (rows: ForecastResult[]) => [...rows].sort((a, b) =>
  (a.priority ? PRIORITY_ORDER[a.priority] : 2) - (b.priority ? PRIORITY_ORDER[b.priority] : 2)
  || b.recommended_restock - a.recommended_restock
  || a.medicine_name.localeCompare(b.medicine_name));

type TableFilter = 'restock' | 'high' | 'all';

/** Two-line month label under the chart: "Oct" / "2026". */
function MonthTick({ x = 0, y = 0, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  const [month, year] = monthText(payload?.value ?? '').split(' ');
  return (
    <g transform={`translate(${x},${y})`}>
      <text textAnchor="middle" fill="#5f6f6b" fontSize={12}>
        <tspan x={0} dy={14}>{month}</tspan>
        <tspan x={0} dy={14}>{year}</tspan>
      </text>
    </g>
  );
}

/** Hover box: "Sep 2026 · Given out: 12 tablets" or "Oct 2026 · Expected: about 13 tablets". */
function ChartTip({ active, payload, label, unit, forecastKeys, currentMonth, dataStart, today, currentUsed, provisional }: {
  active?: boolean; payload?: { dataKey?: string | number; value?: number | string }[]; label?: string | number;
  unit: string; forecastKeys: string[]; currentMonth: string; dataStart: string | null; today: string; currentUsed: boolean; provisional: boolean;
}) {
  if (!active || label === undefined) return null;
  const key = String(label);
  const isForecast = forecastKeys.includes(key);
  if (!isForecast && (!dataStart || key < dataStart)) {
    return (
      <div className="fc-tip">
        <strong>{monthText(key)}</strong>
        <span>No dispensing records yet</span>
        <small>Before records began — not counted as 0</small>
      </div>
    );
  }
  const value = payload?.find((p) => p.dataKey === (isForecast ? 'forecast' : 'actual'))?.value;
  if (value === undefined) return null;
  const inProgress = key === currentMonth;
  return (
    <div className="fc-tip">
      <strong>{monthText(key)}{inProgress ? ` (so far, up to ${dayText(today)})` : ''}</strong>
      {isForecast
        ? <span><i className="lg-forecast" /> Expected: about <b>{num(Number(value))}</b> {unit}</span>
        : <span><i className="lg-actual" /> Given out: <b>{value}</b> {unit}</span>}
      <small>{isForecast
        ? `${provisional ? 'Provisional forecast' : 'Forecast'} — not yet happened`
        : inProgress
          ? (currentUsed ? 'Month not finished — used as a provisional basis' : 'Month not finished — not used in the forecast yet')
          : 'Actual — from dispensing records'}</small>
    </div>
  );
}

/** Actual-demand dot: hollow for this month (still in progress). */
function ActualDot({ cx, cy, index, payload, currentMonth }: { cx?: number; cy?: number; index?: number; payload?: { key: string }; currentMonth: string }) {
  if (cx == null || cy == null) return <g key={`a-${index}`} />;
  const inProgress = payload?.key === currentMonth;
  return <circle key={`a-${index}`} cx={cx} cy={cy} r={inProgress ? 5 : 4} fill={inProgress ? '#fff' : '#228b39'} stroke="#228b39" strokeWidth={inProgress ? 2.5 : 1} />;
}

/** "How this forecast was calculated", with the selected method's own numbers. */
function MethodExplanation({ method, result, unit, forecast, basisMonths, partial, currentMonth, today, provisional, allMedicines }: {
  method: ForecastMethod; result: ForecastMethodResult | null; unit: string; forecast: { key: string; value: number }[];
  basisMonths: string[]; partial: boolean; currentMonth: string; today: string; provisional: boolean; allMedicines: boolean;
}) {
  if (!result) return null;
  const c = result.calculation;
  const n = basisMonths.length;
  let body: ReactNode;
  if (method === 'moving_average') {
    const k = c.window ?? 0;
    const values = c.values ?? [];
    body = (
      <>
        <p>Average of the last {k === 1 ? 'month' : `${k} months`} of records:</p>
        <p className="fc-calc-formula">
          {(c.months ?? []).map((m, i) => <span key={m}>{monthText(m)}: <b>{num(values[i])}</b></span>)}
        </p>
        <p className="fc-calc-formula"><span>({values.map(num).join(' + ')}) ÷ {k} = <b>{num(c.average ?? 0)} {unit}</b> per month</span></p>
        {k < 3 && <p>Only {monthsLower(k)} of records {k === 1 ? 'is' : 'are'} available, so the average uses {k} instead of 3.</p>}
        <p>This average is the forecast for every month in the forecast period.</p>
      </>
    );
  } else if (method === 'linear_regression') {
    const slope = c.slope ?? 0;
    body = (
      <>
        <p>A straight trend line was fitted through the monthly quantities of {periodText(c.months ?? [])} ({monthsLower(n)}).</p>
        <p className="fc-calc-formula">
          {(c.months ?? []).map((m, i) => <span key={m}>{monthText(m)}: <b>{num((c.values ?? [])[i])}</b></span>)}
        </p>
        <p>
          {c.trend === 'flat'
            ? <>The line is almost flat (it changes by {num(slope)} {unit} per month), so demand has been <b>steady</b>.</>
            : <>The line {slope > 0 ? 'rises' : 'falls'} by about <b>{num(Math.abs(slope))} {unit} per month</b> ({slope > 0 ? 'upward' : 'downward'} trend).</>}
          {' '}Each coming month continues the line.
          {provisional && ` This trend is provisional: it is based on only ${monthsLower(n)} (6 or more are recommended).`}
        </p>
        {c.below_zero && <p>Where the line drops below 0, the forecast is set to 0.</p>}
      </>
    );
  } else {
    const steps = c.steps ?? [];
    body = steps.length <= 1 ? (
      <p>With only 1 month of records there is nothing to smooth yet, so the level equals {steps[0] ? monthText(steps[0].month) : 'that month'}'s
        quantity: <b>{num(c.level ?? 0)} {unit}</b>. This is the forecast for every month in the forecast period.</p>
    ) : (
      <>
        <p>Each month's smoothed level = {c.alpha} × that month's quantity + {round1(1 - (c.alpha ?? 0))} × the previous level, starting from the first month.</p>
        <p className="fc-calc-formula">
          {steps.map((st) => <span key={st.month}>{monthText(st.month)}: {num(st.actual)} → level <b>{num(st.level)}</b></span>)}
        </p>
        <p>The final level, <b>{num(c.level ?? 0)} {unit}</b>, is the forecast for every month in the forecast period.</p>
      </>
    );
  }
  return (
    <div className="fc-calc">
      <strong className="fc-calc-title"><Svg d={ICONS.info} size={16} /> How this forecast was calculated ({METHOD_LABEL[method]}{provisional ? ', provisional' : ''})</strong>
      <p className="muted small">
        Learned from: {partial ? `${monthText(basisMonths[0])} so far (up to ${dayText(today)})` : `${periodText(basisMonths)} (${monthsLower(n)}, complete)`}.
        {!partial && basisMonths.length > 0 && ` ${monthText(currentMonth)} is not finished yet, so it is shown on the chart but not used until it ends.`}
        {allMedicines && ' All medicines added together; each medicine is also forecast on its own for the restocking table.'}
      </p>
      {body}
      <p className="fc-calc-formula fc-calc-result">
        {forecast.map((f) => <span key={f.key}>{monthText(f.key)}: <b>{num(f.value)}</b></span>)}
      </p>
    </div>
  );
}

function PriorityBadge({ priority, recorded = true }: { priority: ForecastResult['priority']; recorded?: boolean }) {
  if (!recorded) return <span className="badge badge-unrecorded">Stock not recorded</span>;
  if (!priority) return <span className="prio prio-ok"><Svg d={ICONS.check} size={14} width={2.6} /> Enough stock</span>;
  return (
    <span className={`prio prio-${priority}`}>
      <Svg d={ICONS.info} size={14} width={2.4} /> {priority === 'high' ? 'High' : 'Medium'}
    </span>
  );
}

/** Ranked list with medal numbers and bars (top barangays / top medicines). */
function RankList({ items, empty, unit }: { items: { name: string; total: number }[]; empty: string; unit: string }) {
  if (!items.length) return <Empty>{empty}</Empty>;
  const max = Math.max(...items.map((i) => i.total), 1);
  return (
    <ol className="rank-list">
      {items.map((item, i) => (
        <li key={item.name} title={`${item.name}: ${item.total} ${unit}`}>
          <span className={`rank-no ${i < 3 ? `rank-medal rank-${i + 1}` : ''}`}>{i + 1}</span>
          <span className="rank-name">{item.name}</span>
          <strong className="rank-total">{item.total}</strong>
          <span className="rank-bar"><span style={{ width: `${(item.total / max) * 100}%` }} /></span>
        </li>
      ))}
    </ol>
  );
}

/** Demand forecasting from historical dispensing data (Objective 3.5). */
export default function Forecasting() {
  // null = let the server use its default (history: config, horizon: 3, method: the most accurate one)
  const [months, setMonths] = useState<number | null>(null);
  const [horizon, setHorizon] = useState<number | null>(null);
  const [method, setMethod] = useState<ForecastMethod | null>(null);
  const params = useMemo(() => {
    const p: Record<string, string | number> = {};
    if (months) p.months = months;
    if (horizon) p.horizon = horizon;
    if (method) p.method = method;
    return p;
  }, [months, horizon, method]);
  const { data, errorInfo, loading, setData, reload } = useApi<ForecastReport>('/forecasts', params);

  const [medicineId, setMedicineId] = useState<number | null>(null);
  const [tableFilter, setTableFilter] = useState<TableFilter>('restock');
  const [details, setDetails] = useState<ForecastResult | null>(null);
  const [busy, setBusy] = useState(false);
  const chartRef = useRef<HTMLElement>(null);
  const tableRef = useRef<HTMLElement>(null);

  // A method that cannot forecast with the records available is replaced by the default on the server.
  useEffect(() => {
    if (data && method && data.requested_method === method && data.method !== method) setMethod(null);
  }, [data, method]);


  const results = data?.results ?? [];
  const selectedMedicine = medicineId ? results.find((r) => r.medicine_id === medicineId) ?? null : null;
  const chartRows = selectedMedicine ? [selectedMedicine] : results;
  const unitLabel = selectedMedicine ? unitPlural(selectedMedicine.unit) : 'units';
  const methodInfo = data?.methods_info[data.method];
  const provisional = !!methodInfo?.provisional;
  const basisMonths = data?.basis.months ?? [];
  const basisCount = basisMonths.length;
  // This month is used only while there is no complete month yet (then it is the provisional basis).
  const currentUsed = !!data?.basis.partial;

  // Actual monthly demand (dispensed) and the forecast, for all medicines together or the chosen one.
  const chartData = useMemo(() => {
    if (!data) return [];
    // Months before the first dispensing record have no data (no green dot), they are not "0 given out".
    const points: { key: string; actual?: number; forecast?: number; forecastLabel?: number }[] = data.history_keys.map((k) => ({
      key: k, actual: data.data_start && k >= data.data_start ? chartRows.reduce((s, r) => s + (r.history[k] ?? 0), 0) : undefined,
    }));
    const last = points[points.length - 1];
    // The dashed forecast line starts at the last actual month only when the forecast was learned from it.
    if (last && data.basis.partial) last.forecast = last.actual;
    data.forecast_keys.forEach((k) => {
      const value = round1(chartRows.reduce((s, r) => s + (r.forecast[k] ?? 0), 0));
      points.push({ key: k, forecast: value, forecastLabel: Math.round(value) });
    });
    return points;
  }, [data, chartRows]);

  // Plain-language summary of the chart: what was given out before and what is expected next.
  const story = useMemo(() => {
    if (!data) return null;
    const past = chartRows.reduce((s, r) => s + Object.values(r.history).reduce((a, b) => a + b, 0), 0);
    const months = data.basis.months;
    const basisTotal = months.reduce((s, k) => s + chartRows.reduce((a, r) => a + (r.history[k] ?? 0), 0), 0);
    const avg = basisTotal / Math.max(months.length, 1); // per month, over the months the methods learned from
    const next = chartRows.reduce((s, r) => s + Object.values(r.forecast).reduce((a, b) => a + b, 0), 0);
    const perMonth = next / Math.max(data.horizon, 1);
    // Compared with the average only when there are enough complete months to say so.
    const change = !provisional && avg > 0 ? (perMonth - avg) / avg : null;
    return { past, avg: round1(avg), next: Math.round(next), perMonth: round1(perMonth), change };
  }, [data, chartRows, provisional]);
  // The selected method's numbers: one medicine's own, or all medicines added together.
  const methodResult = data ? (selectedMedicine ? selectedMedicine.methods[data.method] : data.overall.methods[data.method]) : null;
  const forecastList = data ? data.forecast_keys.map((k) => ({ key: k, value: chartRows.reduce((s, r) => s + (r.forecast[k] ?? 0), 0) })) : [];
  const unavailable = data ? METHODS.filter((m) => !data.methods_info[m.key].available) : [];
  const basisText = data ? (data.basis.partial
    ? `${monthText(basisMonths[0])} so far`
    : basisCount === 1 ? monthText(basisMonths[0]) : `${monthsLower(basisCount)}, ${periodText(basisMonths)}`) : '';
  // Any medicine dispensed at all in the chosen period? (Without records there is nothing to learn from.)
  // The "Most accurate" check needs enough months of records to test the methods on.
  const hasHistory = !!data && data.method_error[data.best_method] !== null && results.some((r) => Object.values(r.history).some((v) => v > 0));

  const tableRows = useMemo(() => {
    if (selectedMedicine) return [selectedMedicine];
    const rows = tableFilter === 'all' ? results
      : tableFilter === 'high' ? results.filter((r) => r.priority === 'high')
        : results.filter((r) => r.recommended_restock > 0);
    return sortRows(rows);
  }, [results, tableFilter, selectedMedicine]);

  // The restocking table is shown a page at a time (the export still has every row).
  const fcPages = useClientPages(tableRows, `${tableFilter}|${selectedMedicine?.medicine_id ?? ''}|${data?.generated_at ?? ''}`, 'forecast');

  const go = (filter: TableFilter | null, ref: RefObject<HTMLElement>) => {
    if (filter) { setTableFilter(filter); setMedicineId(null); }
    // Wait one frame so the new filter is shown, then jump straight there (no long scroll).
    requestAnimationFrame(() => jumpTo(ref.current));
  };

  const generate = async () => {
    if (!data || busy) return;
    setBusy(true);
    try {
      const res = await api.post<ForecastReport>('/forecasts/generate', { months: data.history_months, horizon: data.horizon, method: data.method });
      setData(res.data);
      toast.success('Forecast generated', { description: `The forecast for ${periodText(res.data.forecast_keys)} was generated and saved.` });
    } catch (err) {
      toast.fromError(err, { title: 'Forecast was not generated', retry: generate });
    } finally { setBusy(false); }
  };

  const exportReport = () => {
    if (!data) return;
    const head = ['Medicine', 'Category', 'Unit', 'Current Stock', 'Set Aside (Approved Requests)', 'Pending Requests', 'Restock Requests Waiting',
      `Predicted Demand (Next ${monthsText(data.horizon)})`, 'Reorder Level', 'Suggested Restock', 'Priority', 'Forecasting Method', 'Forecast Period', 'Based On'];
    const status = !data.data_start ? 'No dispensing records yet'
      : `${basisText}${provisional ? ' (provisional)' : ''}`;
    const rows = tableRows.map((r) => [r.medicine_name, r.category, r.unit, r.stock_recorded === false ? 'Not recorded' : r.available_stock,
      r.reserved_stock, r.pending_requests, r.restock_requests, r.predicted_demand, r.reorder_level, r.recommended_restock,
      r.stock_recorded === false ? 'Stock not recorded' : r.priority === 'high' ? 'High' : r.priority === 'medium' ? 'Medium' : 'Enough stock', METHOD_LABEL[data.method], periodText(data.forecast_keys), status]);
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [head, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `restocking_recommendations_${data.forecast_keys[0]}_to_${data.forecast_keys[data.forecast_keys.length - 1]}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const generateButton = (extra = '') => (
    <button className={`btn ${extra}`} onClick={generate} disabled={busy || !data}>
      <Svg d={ICON.trend} size={18} /> {busy ? 'Generating…' : 'Generate Forecast'}
    </button>
  );

  const since = data ? monthText(data.history_keys[0] ?? '') : '';
  const horizonText = data ? `Next ${monthsText(data.horizon)}` : '';

  return (
    <div className="page fc-page">
      <BackButton linkedOnly />
      <header className="page-head fc-head">
        <div className="fc-title">
          <span className="fc-title-icon"><Svg d={ICON.bars} size={26} width={2.6} /></span>
          <div>
            <h1>Demand Forecasting</h1>
            <p className="muted">Analyze historical data to predict medicine needs and identify key trends.</p>
          </div>
        </div>
        <div className="fc-head-actions">
          <label className="fc-select" aria-label="Historical data">
            <Svg d={ICONS.calendar} size={18} />
            <select value={months ?? data?.history_months ?? ''} onChange={(e) => setMonths(Number(e.target.value))} disabled={!data}>
              {HISTORY_OPTIONS.map((m) => <option key={m} value={m}>Last {monthsText(m)}</option>)}
            </select>
          </label>
          {generateButton()}
        </div>
      </header>
      <LoadError error={errorInfo} onRetry={() => reload()} />

      {loading && !data ? <Loading /> : !data ? null : !results.length ? <div className="card"><Empty>No medicines to forecast yet. Add medicines first.</Empty></div> : (
        <div className={`fc-body ${loading ? 'is-updating' : ''}`}>
          <div className="fc-stats">
            <button className="fc-stat k-available" onClick={() => go('all', tableRef)}>
              <span className="fc-stat-icon kicon"><Svg d={ICONS.pill} size={24} /></span>
              <span className="fc-stat-text"><small>Medicines Analyzed</small><strong>{data.summary.medicines_analyzed}</strong><span>total medicines</span></span>
              <Svg d={ICONS.chevron} size={18} />
            </button>
            <button className="fc-stat k-rejected" onClick={() => go('high', tableRef)}>
              <span className="fc-stat-icon kicon"><Svg d={ICON.alert} size={24} /></span>
              <span className="fc-stat-text"><small>Potential Stockouts</small><strong>{data.summary.potential_stockouts}</strong><span>within forecast period</span></span>
              <Svg d={ICONS.chevron} size={18} />
            </button>
            <button className="fc-stat k-approved" onClick={() => go('restock', tableRef)}>
              <span className="fc-stat-icon kicon"><Svg d={ICONS.box} size={24} /></span>
              <span className="fc-stat-text"><small>Restock Recommendations</small><strong>{data.summary.restock_recommendations}</strong><span>medicines need restocking</span></span>
              <Svg d={ICONS.chevron} size={18} />
            </button>
            <button className="fc-stat k-submitted" onClick={() => go(null, chartRef)}>
              <span className="fc-stat-icon kicon"><Svg d={ICONS.calendar} size={24} /></span>
              <span className="fc-stat-text"><small>Forecast Period</small><strong className="fc-stat-period">{periodText(data.forecast_keys)}</strong><span>{horizonText.toLowerCase()}</span></span>
              <Svg d={ICONS.chevron} size={18} />
            </button>
          </div>

          <div className="fc-two">
            <section className="card fc-card">
              <div className="fc-card-head"><span className="fc-card-icon"><Svg d={ICON.trophy} size={20} /></span><h2>Barangay with Most Medicine Requests</h2></div>
              <RankList items={data.top_barangays.map((b) => ({ name: b.barangay, total: b.total }))} empty="No approved medicine requests in this period yet." unit="approved requests" />
              <p className="fc-note"><Svg d={ICONS.info} size={16} /> Based on approved medicine requests since {since}.</p>
            </section>
            <section className="card fc-card">
              <div className="fc-card-head"><span className="fc-card-icon"><Svg d={ICONS.pill} size={20} /></span><h2>Most Frequently Requested Medicines</h2></div>
              <RankList items={data.top_medicines.map((m) => ({ name: m.medicine_name, total: m.total }))} empty="No medicine requests in this period yet." unit="requests" />
              <p className="fc-note"><Svg d={ICONS.info} size={16} /> Based on medicine requests (approved and pending) since {since}.</p>
            </section>
          </div>

          <div className="fc-main">
            <section className="card fc-card" ref={chartRef}>
              <div className="fc-card-head fc-chart-head">
                <span className="fc-card-icon"><Svg d={ICON.trend} size={20} /></span>
                <h2>Predicted Medicine Demand{selectedMedicine ? `: ${selectedMedicine.medicine_name}` : ''}</h2>
                <span className="fc-legend">
                  <span><i className="lg-actual" /> Actual Demand</span>
                  <span><i className="lg-forecast" /> {provisional ? 'Provisional Forecast' : 'Forecast Demand'}</span>
                </span>
              </div>
              {story && story.past === 0 ? (
                <div className="fc-nodata">
                  <span className="fc-nodata-icon"><Svg d={ICON.bars} size={30} /></span>
                  <strong>{data.data_start ? `Nothing given out yet${selectedMedicine ? `: ${selectedMedicine.medicine_name}` : ''}` : 'No dispensing records yet'}</strong>
                  {data.data_start ? (
                    <p>
                      {selectedMedicine ? selectedMedicine.medicine_name : 'No medicine'} was not given out from {monthText(data.data_start)} (when records began in this period)
                      to {monthText(data.current_month)}. This is a recorded 0, so its expected demand is 0 for now.
                    </p>
                  ) : (
                    <p>
                      The forecast learns from the medicines actually given out (dispensed) each month from {since} to {monthText(data.current_month)} (this month).
                      There are no records in this period yet, so there is nothing to forecast from and the predicted demand is 0.
                    </p>
                  )}
                  <p>As the pharmacy staff dispense medicines, this chart fills in: the <b className="txt-actual">green line</b> shows what was given out each month, and the <b className="txt-forecast">blue dashed line</b> shows what is expected next.</p>
                  {data.history_months < 24 && <p className="muted small">Tip: choose a longer period (e.g. Last 24 Months) at the top if older records exist.</p>}
                </div>
              ) : story && (
                <>
                  <div className="fc-story">
                    <div><small>Given out in the last {monthsText(data.history_months).toLowerCase()}</small><strong>{story.past}</strong><span>{unitLabel}</span></div>
                    <div><small>Average per month</small><strong>{story.avg}</strong><span>{unitLabel} / month · {basisText}</span></div>
                    <div className="fc-story-next">
                      <small>Expected in {periodText(data.forecast_keys)}</small>
                      <strong>{story.next}</strong>
                      <span>about {story.perMonth} / month
                        {provisional
                          ? <em className="trend trend-prov">Provisional</em>
                          : story.change !== null && (Math.abs(story.change) < 0.05
                            ? <em className="trend trend-flat">≈ same as the average</em>
                            : <em className={`trend ${story.change > 0 ? 'trend-up' : 'trend-down'}`}>{story.change > 0 ? '▲' : '▼'} {Math.round(Math.abs(story.change) * 100)}% {story.change > 0 ? 'more' : 'less'} than the average</em>)}
                      </span>
                    </div>
                  </div>
                  {(provisional || unavailable.length > 0) && (
                    <div className="fc-limited" role="note">
                      <Svg d={ICON.alert} size={16} />
                      <div>
                        <strong>
                          Not enough history for a reliable forecast: only {monthsLower(basisCount)} of dispensing records
                          {data.basis.partial ? `, and ${monthText(basisMonths[0])} is not finished yet` : ` (${periodText(basisMonths)})`}.
                        </strong>
                        <p>
                          {data.basis.partial && `Records so far: ${data.first_record_date ? dayText(data.first_record_date) : monthText(basisMonths[0])} to ${dayText(data.today)}. Because the month is not over, the real monthly demand may be higher. `}
                          {basisCount < 3
                            ? `This is not enough to tell whether demand is going up or down. The forecast below is provisional: it assumes the coming months will be like ${basisText}.`
                            : `The forecast below is provisional: ${METHOD_LABEL[data.method]} is reliable after ${methodInfo?.recommended_months} complete months of records.`}
                        </p>
                        {unavailable.length > 0 && (
                          <ul>
                            {unavailable.map((m) => (
                              <li key={m.key}><b>{m.label}</b> is not available yet: it needs at least {data.methods_info[m.key].min_months} complete months of records (there {basisCount === 1 ? 'is' : 'are'} {basisCount}).
                                {m.key === 'linear_regression' && ' Two months always fit a straight line exactly, so they cannot show a real trend.'}</li>
                            ))}
                          </ul>
                        )}
                        <p className="small">No records are made up: the forecast becomes reliable after 3 complete months of records (6 for Linear Regression).</p>
                      </div>
                    </div>
                  )}
                  <p className="fc-sentence">
                    {selectedMedicine ? selectedMedicine.medicine_name : 'All medicines together'}: Botika ng Bayan gave out an average of <b>{story.avg} {unitLabel}</b> per month
                    ({basisText}). Using <b>{METHOD_LABEL[data.method]}</b>, about <b>{story.perMonth} {unitLabel}</b> per month
                    are expected for {periodText(data.forecast_keys)}{provisional ? ' (provisional estimate)' : ''}.
                  </p>
                  <div className="fc-chart">
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={chartData} margin={{ top: 24, right: 18, left: 6, bottom: 0 }}>
                        <CartesianGrid vertical={false} stroke="#e8eeec" />
                        {data.data_start && data.data_start > data.history_keys[0] && (
                          <ReferenceArea x1={data.history_keys[0]} x2={data.data_start} fill="#eef1f0" fillOpacity={0.8}
                            label={{ value: 'No records yet', position: 'insideTop', fontSize: 11, fill: '#7a8a86' }} />
                        )}
                        {chartData.length > 1 && (
                          <ReferenceArea x1={data.history_keys[data.history_keys.length - 1]} x2={data.forecast_keys[data.forecast_keys.length - 1]} fill="#dbe7fd" fillOpacity={0.45} />
                        )}
                        <ReferenceLine x={data.history_keys[data.history_keys.length - 1]} stroke="#94a3b8" strokeDasharray="4 4"
                          label={{ value: 'Forecast starts →', position: 'insideTopRight', fontSize: 11, fill: '#2563eb', offset: 6 }} />
                        <XAxis dataKey="key" tick={<MonthTick />} height={42} interval="preserveStartEnd" tickLine={false} axisLine={{ stroke: '#cbd5d1' }} />
                        <YAxis allowDecimals={false} fontSize={12} tickLine={false} axisLine={false} width={52}
                          label={{ value: `Quantity (${unitLabel})`, angle: -90, position: 'insideLeft', style: { fontSize: 12, fill: '#5f6f6b', textAnchor: 'middle' } }} />
                        <Tooltip content={<ChartTip unit={unitLabel} forecastKeys={data.forecast_keys} currentMonth={data.current_month}
                          dataStart={data.data_start} today={data.today} currentUsed={currentUsed} provisional={provisional} />} />
                        <Line dataKey="actual" name="Given out (actual)" stroke="#228b39" strokeWidth={2.5} activeDot={{ r: 6 }} isAnimationActive={false}
                          dot={({ cx, cy, index, payload }: { cx?: number; cy?: number; index?: number; payload?: { key: string } }) => (
                            <ActualDot key={`a-${index}`} cx={cx} cy={cy} index={index} payload={payload} currentMonth={data.current_month} />
                          )} />
                        <Line dataKey="forecast" name="Expected (forecast)" stroke="#2563eb" strokeWidth={2.5} strokeDasharray="6 5" dot={{ r: 4, fill: '#2563eb' }} activeDot={{ r: 6 }} isAnimationActive={false}>
                          <LabelList dataKey="forecastLabel" position="top" fontSize={12} fontWeight={700} fill="#1e3a8a" />
                        </Line>
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="fc-periods">
                    <span style={{ flex: Math.max(data.history_keys.length - 1, 1) }}>Past months (actual, this month so far)</span>
                    <span className="fc-period-forecast" style={{ flex: data.forecast_keys.length }}>{provisional ? 'Forecast Period (provisional)' : 'Forecast Period'}</span>
                  </div>
                  <MethodExplanation method={data.method} result={methodResult} unit={unitLabel} forecast={forecastList} basisMonths={basisMonths}
                    partial={data.basis.partial} currentMonth={data.current_month} today={data.today} provisional={provisional} allMedicines={!selectedMedicine} />
                </>
              )}
              <details className="fc-howto">
                <summary><Svg d={ICONS.info} size={16} /> How to read this chart</summary>
                <ul>
                  <li><i className="lg-actual" /> <span><b>Green line — Actual Demand:</b> how many {unitLabel} were given out (dispensed) each month, taken from the dispensing records. The hollow green dot is this month so far: it can still go up, so it is only used for the forecast while there is no complete month yet.</span></li>
                  <li><i className="lg-forecast" /> <span><b>Blue dashed line — Forecast Demand:</b> how many are expected to be needed each coming month, calculated from the green line with the method chosen in Filter &amp; Settings. The numbers above the blue dots are the expected quantities.</span></li>
                  <li><i className="lg-area" /> <span><b>Shaded area — Forecast Period:</b> the coming months being predicted, starting next month.</span></li>
                  <li><i className="lg-norec" /> <span><b>Grey area — No records yet:</b> months before the first dispensing record. They are not counted as 0. A month after that with nothing given out is a real 0.</span></li>
                  {!selectedMedicine && <li><i className="lg-tip" /> <span>The chart adds up <b>all medicines</b>. Choose one medicine in Filter &amp; Settings to see its own demand.</span></li>}
                </ul>
              </details>
            </section>

            <section className="card fc-card fc-settings">
              <div className="fc-card-head"><span className="fc-card-icon"><Svg d={ICON.filter} size={20} /></span><h2>Filter &amp; Settings</h2></div>
              <label>Medicine
                <select className="select-pill" value={medicineId ?? ''} onChange={(e) => setMedicineId(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">All Medicines</option>
                  {results.map((r) => <option key={r.medicine_id} value={r.medicine_id}>{r.medicine_name}</option>)}
                </select>
              </label>
              <label>Forecast Period
                <select className="select-pill" value={horizon ?? data.horizon} onChange={(e) => setHorizon(Number(e.target.value))}>
                  {HORIZON_OPTIONS.map((h) => <option key={h} value={h}>Next {monthsText(h)}</option>)}
                </select>
              </label>
              <fieldset className="fc-methods">
                <legend>Forecasting Method</legend>
                {METHODS.map((m) => {
                  const mi = data.methods_info[m.key];
                  return (
                    <label key={m.key} className={`fc-method ${(method ?? data.method) === m.key ? 'active' : ''} ${mi.available ? '' : 'is-disabled'}`}>
                      <input type="radio" name="method" checked={(method ?? data.method) === m.key} disabled={!mi.available} onChange={() => setMethod(m.key)} />
                      <span>
                        <strong>{m.label}</strong>
                        {hasHistory && data.best_method === m.key && <em className="fc-best">Most accurate</em>}
                        {mi.available && mi.provisional && data.data_start && <em className="fc-prov">Provisional</em>}
                        <small>{m.hint}{hasHistory && data.method_error[m.key] !== null ? ` · avg. error ±${data.method_error[m.key]}/month` : ''}</small>
                        {!mi.available && (
                          <small className="fc-method-need">Needs at least {mi.min_months} complete months of records (has {basisCount}).</small>
                        )}
                      </span>
                    </label>
                  );
                })}
              </fieldset>
              <p className="fc-note">{hasHistory
                ? `"Most accurate" = the method whose past forecasts came closest to what was actually given out. Average error over the ${data.medicines_with_records} ${data.medicines_with_records === 1 ? 'medicine' : 'medicines'} with dispensing records.`
                : 'The most accurate method will be shown once there are at least 4 months of dispensing records to test the methods on.'}</p>
            </section>
          </div>

          <section className="card fc-card" ref={tableRef}>
            <div className="fc-card-head">
              <span className="fc-card-icon"><Svg d={ICONS.box} size={20} /></span>
              <h2>Restocking Recommendations</h2>
              {!selectedMedicine && (
                <div className="chips fc-chips" role="tablist" aria-label="Show">
                  {([['restock', 'Needs restock', data.summary.restock_recommendations], ['high', 'Will run out', data.summary.potential_stockouts], ['all', 'All medicines', data.summary.medicines_analyzed]] as const).map(([key, label, count]) => (
                    <button key={key} role="tab" aria-selected={tableFilter === key} className={`chip ${tableFilter === key ? 'active' : ''}`} onClick={() => setTableFilter(key)}>
                      {label}<span className="chip-count">{count}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="fc-restock">
              <div className="fc-table-wrap">
                {tableRows.length === 0 ? (
                  <Empty>{tableFilter === 'high' ? 'No medicine is expected to run out in the forecast period.' : 'All medicines have enough stock for the forecast period.'}</Empty>
                ) : (
                  <table className="fc-table">
                    <thead>
                      <tr><th className="col-no">No.</th><th>Medicine</th><th className="center">Current Stock</th><th className="center">Waiting Requests<br /><small>(as of now)</small></th><th className="center">Predicted Demand<br /><small>({horizonText})</small></th><th className="center">Suggested Restock</th><th>Priority</th><th aria-label="Details" /></tr>
                    </thead>
                    <tbody>
                      {fcPages.rows.map((r, i) => (
                        <tr key={r.medicine_id} className="clickable" onClick={() => setDetails(r)}>
                          <td className="col-no">{(fcPages.meta.from ?? 1) + i}</td>
                          <td>
                            <span className="fc-med">
                              <span className="fc-med-icon"><Svg d={ICONS.pill} size={18} /></span>
                              <span><strong>{r.medicine_name}</strong><small className="muted">{r.unit}</small></span>
                            </span>
                          </td>
                          <td className="center">
                            {r.stock_recorded === false ? <span className="mi-missing">Not recorded</span> : r.available_stock}
                            {r.reserved_stock > 0 && <small className="muted fc-sub">{r.reserved_stock} set aside</small>}
                          </td>
                          <td className="center">
                            {r.waiting_demand}
                            {r.restock_requests > 0 && <small className="muted fc-sub">{r.restock_requests} in restock requests</small>}
                          </td>
                          <td className="center">{r.predicted_demand}</td>
                          <td className="center"><strong>{r.recommended_restock}</strong></td>
                          <td><PriorityBadge priority={r.priority} recorded={r.stock_recorded !== false} /></td>
                          <td className="right"><Svg d={ICONS.chevron} size={18} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <Pagination meta={fcPages.meta} onPage={fcPages.setPage} onPerPage={fcPages.setPerPage} noun="medicines" />
              <div className="fc-restock-actions">
                <button className="btn btn-outline" onClick={exportReport} disabled={!tableRows.length}><Svg d={ICON.download} size={18} /> Export Report</button>
                {generateButton()}
              </div>
            </div>
            <p className="fc-info"><Svg d={ICONS.info} size={16} /> Forecasts are estimates based on historical dispensing records. The suggested restock also counts the requests still waiting (pending medicine requests and restock requests) and the stock set aside for approved requests. Review recommendations before restocking.
              {' '}Method: {METHOD_LABEL[data.method]} · last run {formatDate(data.generated_at, true)}.</p>
          </section>
        </div>
      )}


      {details && data && (
        <Modal title={details.medicine_name} onClose={() => setDetails(null)}>
          <p className="muted small fc-detail-sub">{details.category} · {details.unit}</p>
          <div className="fc-detail-grid">
            <div><small>Current stock</small><strong>{details.stock_recorded === false ? 'Not recorded' : quantityText(details.available_stock, details.unit)}</strong></div>
            <div><small>Reorder level</small><strong>{details.reorder_level}</strong></div>
            <div><small>Predicted demand ({horizonText.toLowerCase()})</small><strong>{details.predicted_demand}</strong></div>
            <div><small>Suggested restock</small><strong>{details.recommended_restock}</strong></div>
          </div>
          {details.stock_recorded === false ? (
            <p className="muted small">The stock of this medicine was never recorded, so no restock can be worked out. Record a stock-in or confirm there is no stock first.</p>
          ) : (
            <div className="fc-calc" aria-label="How the suggested restock is calculated">
              <h3 className="fc-detail-title">How the suggested restock is calculated</h3>
              <table>
                <tbody>
                  <tr><td>Predicted demand, {horizonText.toLowerCase()} <small className="muted">(from dispensing records)</small></td><td className="right">{details.predicted_demand}</td></tr>
                  <tr><td>+ Pending medicine requests <small className="muted">(not reviewed yet)</small></td><td className="right">{details.pending_requests}</td></tr>
                  <tr><td>+ Restock requests waiting <small className="muted">(residents who asked while it was out of stock)</small></td><td className="right">{details.restock_requests}</td></tr>
                  <tr><td>+ Reorder level <small className="muted">(stock to keep on hand)</small></td><td className="right">{details.reorder_level}</td></tr>
                  <tr><td>− Free stock <small className="muted">({details.available_stock} not expired{details.reserved_stock ? ` − ${details.reserved_stock} set aside for approved requests` : ''})</small></td><td className="right">{details.free_stock}</td></tr>
                  <tr className="fc-calc-total"><td>Suggested restock {details.recommended_restock === 0 && <small className="muted">(the stock is enough)</small>}</td><td className="right">{details.recommended_restock}</td></tr>
                </tbody>
              </table>
            </div>
          )}
          <PriorityBadge priority={details.priority} recorded={details.stock_recorded !== false} />

          <h3 className="fc-detail-title">Monthly forecast ({METHOD_LABEL[data.method]}{provisional ? ', provisional' : ''})</h3>
          <table>
            <thead><tr><th>Month</th><th className="right">Forecast</th></tr></thead>
            <tbody>
              {data.forecast_keys.map((k) => <tr key={k}><td>{monthText(k)}</td><td className="right">{details.forecast[k]} {details.unit}</td></tr>)}
            </tbody>
          </table>

          <h3 className="fc-detail-title">Compare methods</h3>
          <table>
            <thead><tr><th>Method</th><th className="right">{horizonText}</th><th className="right">Avg. error</th></tr></thead>
            <tbody>
              {METHODS.map((m) => {
                const v = details.methods[m.key];
                return (
                  <tr key={m.key} className={m.key === data.method ? 'row-selected' : ''}>
                    <td>{m.label}{hasHistory && m.key === details.best_method && <em className="fc-best">Most accurate</em>}</td>
                    <td className="right">{v ? `${Math.ceil(v.predicted_demand)}${data.methods_info[m.key].provisional ? ' (provisional)' : ''}` : `Needs ${data.methods_info[m.key].min_months} months`}</td>
                    <td className="right">{v?.mae == null ? 'Not enough data' : `±${v.mae}`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="muted small">Average error = how far each method's forecast was from the actual dispensed quantity of this medicine when tested month by month on its past records.</p>
          <div className="modal-actions">
            <button className="btn btn-outline" onClick={() => setDetails(null)}>Close</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
