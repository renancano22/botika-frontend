import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { CartesianGrid, LabelList, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, formatDate } from '../../api';
import { LoadError, toast } from '../../components/feedback';
import { useApi } from '../../hooks';
import { Badge, Card, Empty, Loading, Message, Modal } from '../../components/ui';
import { ICONS, quantityText, Svg, unitPlural } from '../../components/RequestCards';
import type { ForecastMethod, ForecastMethodResult, ForecastReport, ForecastResult, SeasonalReport } from '../../types';
import { jumpTo } from '../../scroll';
import { Pagination, useClientPages } from '../../components/Pagination';
import BackButton from '../../components/BackButton';

const WARN = 'M12 3 2 20h20zM12 10v4M12 17h.01';

/** Small coloured icon in a summary box (the same style as the dashboard boxes). */
function KpiIcon({ d }: { d: string }) {
  return <i className="da-kpi-icon"><Svg d={d} size={15} width={2.2} /></i>;
}

const METHODS: { key: ForecastMethod; label: string; hint: string }[] = [
  { key: 'moving_average', label: 'Moving Average', hint: 'Average of the last 3 months' },
  { key: 'linear_regression', label: 'Linear Regression', hint: 'Straight trend line through the monthly totals' },
  { key: 'exponential_smoothing', label: 'Time-Series Analysis', hint: 'Exponential smoothing (α = 0.3): recent months count more' },
];
const METHOD_LABEL = Object.fromEntries(METHODS.map((m) => [m.key, m.label])) as Record<ForecastMethod, string>;
const HISTORY_OPTIONS = [6, 12, 24];
const HORIZON_OPTIONS = [1, 3, 6];

const ICON = {
  trend: 'M3 17l6-6 4 4 8-8M15 7h6v6',
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

/** Chart colours: the same greens as the Dashboard charts (actual = solid, forecast = dashed). */
const ACTUAL = '#228b39';
const FORECAST = '#14532d';

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
  return <circle key={`a-${index}`} cx={cx} cy={cy} r={inProgress ? 5 : 4} fill={inProgress ? '#fff' : ACTUAL} stroke={ACTUAL} strokeWidth={inProgress ? 2.5 : 1} />;
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

/** Restock priority with the same badges as the stock statuses (Medicine List, Dashboard). */
function PriorityBadge({ priority, recorded = true }: { priority: ForecastResult['priority']; recorded?: boolean }) {
  if (!recorded) return <Badge value="unrecorded" />;
  if (!priority) return <span className="badge badge-available">Enough stock</span>;
  return <span className={`badge ${priority === 'high' ? 'badge-out_of_stock' : 'badge-low_stock'}`}>{priority === 'high' ? 'High' : 'Medium'}</span>;
}

/** Ranked list with numbers and bars (top barangays / top medicines). */
function RankList({ items, empty, unit }: { items: { name: string; total: number }[]; empty: string; unit: string }) {
  if (!items.length) return <Empty>{empty}</Empty>;
  const max = Math.max(...items.map((i) => i.total), 1);
  return (
    <ol className="rank-list">
      {items.map((item, i) => (
        <li key={item.name} title={`${item.name}: ${item.total} ${unit}`}>
          <span className={`rank-no${i < 3 ? ` rank-medal rank-${i + 1}` : ''}`}>{i + 1}</span>
          <span className="rank-name">{item.name}</span>
          <strong className="rank-total">{item.total}</strong>
          <span className="rank-bar"><span style={{ width: `${(item.total / max) * 100}%` }} /></span>
        </li>
      ))}
    </ol>
  );
}

/** "20 tablets" / "2.5 tablets" for an average per month. */
const perMonthText = (n: number, unit: string) => (Number.isInteger(n) ? quantityText(n, unit) : `${n} ${unitPlural(unit)}`);

/**
 * Seasonal Demand: the medicines given out most in the rainy season (June–November) and the dry season
 * (December–May), with the expected quantity per month and for a whole season, from the dispensing records.
 * For information only: the suggested restock comes from the forecast above.
 */
function SeasonalDemand() {
  const { data, errorInfo, loading, reload } = useApi<SeasonalReport>('/forecasts/seasonal');
  const [picked, setPicked] = useState<'rainy' | 'dry' | null>(null);
  const key = picked ?? data?.current ?? 'rainy';
  const season = data?.seasons.find((x) => x.key === key);
  const other = data?.seasons.find((x) => x.key !== key);
  const pages = useClientPages(season?.medicines ?? [], key, 'seasonal');

  const head = (
    <div className="chips" role="tablist" aria-label="Season">
      {(data?.seasons ?? []).map((x) => (
        <button key={x.key} role="tab" aria-selected={key === x.key} className={`chip ${key === x.key ? 'active' : ''}`} onClick={() => setPicked(x.key)}>
          {x.label}<span className="chip-count">{x.is_current ? 'Now' : 'Next'}</span>
        </button>
      ))}
    </div>
  );

  if (loading && !data) return <Card title="Seasonal Demand"><Loading /></Card>;
  if (!data || !season || !other) return <Card title="Seasonal Demand"><LoadError error={errorInfo} onRetry={() => reload()} /></Card>;

  const used = season.months_used;
  const top = season.medicines[0];
  const basis = !used.length ? 'No records yet'
    : season.partial ? `${monthText(used[0])} so far`
    : used.length === 1 ? monthText(used[0]) : `${monthText(used[0])} – ${monthText(used[used.length - 1])}`;
  const name = season.label.toLowerCase();

  return (
    <Card title="Seasonal Demand" actions={head}>
      <p className="fc-season-when">
        <strong>{season.label}</strong> <span className="muted">({season.months_label})</span> ·{' '}
        {season.is_current ? <>now, until {dayText(season.ends)}</> : <>next, from {dayText(season.starts)} to {dayText(season.ends)}</>}
      </p>
      {!season.medicines.length ? (
        <Empty>
          {used.length
            ? `No medicines were given out in the ${name} months recorded so far.`
            : `No dispensing records from a ${name} yet. The expected demand appears once medicines are given out in this season.`}
        </Empty>
      ) : (
        <>
          <div className="da-kpis fc-season-kpis">
            <div className="da-kpi t-available"><small><KpiIcon d={ICONS.pill} />Most given out</small><strong className="fc-season-top">{top.medicine_name}</strong><span>{perMonthText(top.avg_per_month, top.unit)} / month</span></div>
            <div className="da-kpi t-ready"><small><KpiIcon d={ICONS.box} />Medicines given out</small><strong>{season.medicines.length}</strong><span>different medicines this season</span></div>
            <div className="da-kpi t-review"><small><KpiIcon d={ICONS.calendar} />Records used</small><strong>{season.partial ? '—' : monthsText(used.length)}</strong><span>{basis}</span></div>
          </div>
          {season.provisional && (
            <Message type="info">
              {season.partial
                ? <>Provisional: there is no complete {name} month in the records yet, so this is based on {monthText(used[0])} so far.</>
                : <>Provisional: based on {monthsText(used.length).toLowerCase()} of {name} records. It becomes more reliable after a whole season (6 months) is recorded.</>}
            </Message>
          )}
          <div className="fc-table-wrap">
            <table className="fc-table">
              <thead>
                <tr>
                  <th className="col-no">No.</th><th>Medicine</th><th className="right">Expected per month</th><th className="right">Expected for the season<br /><small>(6 months)</small></th>
                  <th className="right">Times given out</th><th className="right">Residents</th><th>Compared with the {other.label.toLowerCase()}</th>
                </tr>
              </thead>
              <tbody>
                {pages.rows.map((m, i) => (
                  <tr key={m.medicine_id}>
                    <td className="col-no">{(pages.meta.from ?? 1) + i}</td>
                    <td><strong>{m.medicine_name}</strong><div className="muted small">{m.unit}</div></td>
                    <td className="right">{perMonthText(m.avg_per_month, m.unit)}</td>
                    <td className="right"><strong>{quantityText(m.expected_season, m.unit)}</strong></td>
                    <td className="right">{m.times_dispensed}</td>
                    <td className="right">{m.residents}</td>
                    <td>
                      {m.other_avg_per_month === null ? <span className="muted small">No {other.label.toLowerCase()} records yet</span>
                        : m.only_this_season ? <span className="season-change up">Only in the {name}</span>
                        : m.change_percent === 0 ? <span className="season-change">About the same</span>
                        : <span className={`season-change ${(m.change_percent ?? 0) > 0 ? 'up' : 'down'}`}>
                            {(m.change_percent ?? 0) > 0 ? '▲' : '▼'} {Math.abs(m.change_percent ?? 0)}% {(m.change_percent ?? 0) > 0 ? 'more' : 'less'}
                          </span>}
                      {m.other_avg_per_month !== null && !m.only_this_season && <div className="muted small">{perMonthText(m.other_avg_per_month, m.unit)} / month in the {other.label.toLowerCase()}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination meta={pages.meta} onPage={pages.setPage} onPerPage={pages.setPerPage} noun="medicines" />
        </>
      )}
      <p className="muted small fc-season-foot">
        Based on the dispensing records of past {name} months (complete months only). Expected per month = average given out per month in those months;
        expected for the season = that average × 6 months. For information only: the suggested restock uses the forecast above.
      </p>
    </Card>
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
  const chartRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);

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

  const generateButton = () => (
    <button className="btn" onClick={generate} disabled={busy || !data}>
      <Svg d={ICON.trend} size={18} /> {busy ? 'Generating…' : 'Generate Forecast'}
    </button>
  );

  const since = data ? monthText(data.history_keys[0] ?? '') : '';
  const horizonText = data ? `Next ${monthsText(data.horizon)}` : '';
  const shownMethod = data ? (method ?? data.method) : null;
  // Phones: the chart is narrow, so the labels inside it (quantities, "No records yet") are left out; the tooltip still shows them.
  const narrow = typeof window !== 'undefined' && window.innerWidth < 640;

  return (
    <div className="page fc-page">
      <BackButton linkedOnly />
      <header className="page-head hero-head db-hero fc-hero">
        <div>
          <div className="page-title"><h1>Demand Forecasting</h1></div>
          <p className="muted">Predicted medicine needs from the dispensing records, with restocking recommendations.</p>
          {data && (
            <p className="fc-last-gen">
              <Svg d={ICONS.check} size={15} width={2.4} />
              {data.last_generated ? (
                <span>
                  Forecast last generated on <b>{formatDate(data.last_generated.generated_at, true)}</b>
                  {data.last_generated.generated_by && <> by <b>{data.last_generated.generated_by}</b></>}
                  {' · '}{METHOD_LABEL[data.last_generated.method] ?? data.last_generated.method}
                  {' · '}{periodText(data.last_generated.period_start === data.last_generated.period_end
                    ? [data.last_generated.period_start] : [data.last_generated.period_start, data.last_generated.period_end])}
                  {' · '}based on the last {monthsText(data.last_generated.history_months).toLowerCase()}
                </span>
              ) : <span>Not generated yet. Click Generate Forecast to save this forecast.</span>}
            </p>
          )}
        </div>
        <div className="actions">{generateButton()}</div>
      </header>
      <LoadError error={errorInfo} onRetry={() => reload()} />

      {loading && !data ? <Loading /> : !data ? null : !results.length ? <Card><Empty>No medicines to forecast yet. Add medicines first.</Empty></Card> : (
        <div className={`fc-body ${loading ? 'tbl-updating' : ''}`}>
          <Card title="Forecast settings">
            <div className="fc-filters">
              <label className="fc-field"><span>Historical data</span>
                <select value={months ?? data.history_months} onChange={(e) => setMonths(Number(e.target.value))}>
                  {HISTORY_OPTIONS.map((m) => <option key={m} value={m}>Last {monthsText(m)}</option>)}
                </select>
              </label>
              <label className="fc-field"><span>Forecast period</span>
                <select value={horizon ?? data.horizon} onChange={(e) => setHorizon(Number(e.target.value))}>
                  {HORIZON_OPTIONS.map((h) => <option key={h} value={h}>Next {monthsText(h)}</option>)}
                </select>
              </label>
              <label className="fc-field"><span>Medicine</span>
                <select value={medicineId ?? ''} onChange={(e) => setMedicineId(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">All medicines</option>
                  {results.map((r) => <option key={r.medicine_id} value={r.medicine_id}>{r.medicine_name}</option>)}
                </select>
              </label>
              <label className="fc-field"><span>Forecasting method</span>
                <select value={shownMethod ?? ''} onChange={(e) => setMethod(e.target.value as ForecastMethod)}>
                  {METHODS.map((m) => {
                    const mi = data.methods_info[m.key];
                    return (
                      <option key={m.key} value={m.key} disabled={!mi.available}>
                        {m.label}{hasHistory && data.best_method === m.key ? ' (most accurate)' : ''}{!mi.available ? ` (needs ${mi.min_months} months)` : ''}
                      </option>
                    );
                  })}
                </select>
              </label>
            </div>
            {shownMethod && (
              <p className="muted small fc-method-hint">
                <b>{METHOD_LABEL[shownMethod]}</b>: {METHODS.find((m) => m.key === shownMethod)?.hint}
                {hasHistory && data.method_error[shownMethod] !== null && <> · average error ±{data.method_error[shownMethod]} per month</>}
                {methodInfo?.available && provisional && data.data_start && <> · <span className="badge badge-low_stock">Provisional</span></>}
                <br />
                {hasHistory
                  ? `"Most accurate" = the method whose past forecasts came closest to what was actually given out (average error over the ${data.medicines_with_records} ${data.medicines_with_records === 1 ? 'medicine' : 'medicines'} with dispensing records).`
                  : 'The most accurate method will be shown once there are at least 4 months of dispensing records to test the methods on.'}
                {unavailable.length > 0 && ` ${unavailable.map((m) => m.label).join(' and ')} ${unavailable.length === 1 ? 'needs' : 'need'} more complete months of records (there ${basisCount === 1 ? 'is' : 'are'} ${basisCount}).`}
              </p>
            )}
          </Card>

          <div className="da-kpis fc-kpis">
            <button type="button" className="da-kpi da-kpi-link t-ready" onClick={() => go('all', tableRef)}>
              <small><KpiIcon d={ICONS.pill} />Medicines analyzed</small><strong>{data.summary.medicines_analyzed}</strong><span>all medicines in the list</span>
            </button>
            <button type="button" className="da-kpi da-kpi-link t-danger" onClick={() => go('high', tableRef)}>
              <small><KpiIcon d={WARN} />Potential stockouts</small><strong>{data.summary.potential_stockouts}</strong><span>would run out in the forecast period</span>
            </button>
            <button type="button" className="da-kpi da-kpi-link t-restock" onClick={() => go('restock', tableRef)}>
              <small><KpiIcon d={ICONS.box} />Restock recommendations</small><strong>{data.summary.restock_recommendations}</strong><span>medicines need restocking</span>
            </button>
            <button type="button" className="da-kpi da-kpi-link t-available" onClick={() => go(null, chartRef)}>
              <small><KpiIcon d={ICONS.calendar} />Forecast period</small><strong className="fc-kpi-period">{periodText(data.forecast_keys)}</strong><span>{horizonText.toLowerCase()}</span>
            </button>
          </div>

          <div className="grid-2">
            <Card title="Barangays with Most Medicine Requests">
              <RankList items={data.top_barangays.map((b) => ({ name: b.barangay, total: b.total }))} empty="No approved medicine requests in this period yet." unit="approved requests" />
              <p className="muted small fc-note">Based on approved medicine requests since {since}.</p>
            </Card>
            <Card title="Most Frequently Requested Medicines">
              <RankList items={data.top_medicines.map((m) => ({ name: m.medicine_name, total: m.total }))} empty="No medicine requests in this period yet." unit="requests" />
              <p className="muted small fc-note">Based on medicine requests (pending, approved and completed) since {since}.</p>
            </Card>
          </div>

          <div ref={chartRef}>
            <Card title={`Predicted Medicine Demand${selectedMedicine ? `: ${selectedMedicine.medicine_name}` : ''}`} actions={
              <span className="fc-legend">
                <span><i className="lg-actual" /> Actual demand</span>
                <span><i className="lg-forecast" /> {provisional ? 'Provisional forecast' : 'Forecast demand'}</span>
              </span>
            }>
              {story && story.past === 0 ? (
                <div className="fc-nodata">
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
                  <p>As the pharmacy staff dispense medicines, this chart fills in: the solid line shows what was given out each month, and the dashed line shows what is expected next.</p>
                  {data.history_months < 24 && <p className="muted small">Tip: choose a longer period in Forecast settings (e.g. Last 24 Months) if older records exist.</p>}
                </div>
              ) : story && (
                <>
                  <div className="da-kpis fc-story">
                    <div className="da-kpi t-available"><small><KpiIcon d={ICONS.pill} />Given out, last {monthsText(data.history_months).toLowerCase()}</small><strong>{story.past.toLocaleString('en-PH')}</strong><span>{unitLabel}</span></div>
                    <div className="da-kpi t-ready"><small><KpiIcon d={ICONS.clock} />Average per month</small><strong>{story.avg.toLocaleString('en-PH')}</strong><span>{unitLabel} / month · {basisText}</span></div>
                    <div className="da-kpi t-forecast">
                      <small><KpiIcon d={ICON.trend} />Expected, {periodText(data.forecast_keys)}</small>
                      <strong>{story.next.toLocaleString('en-PH')}</strong>
                      <span>about {story.perMonth} / month{' '}
                        {provisional
                          ? <em className="trend trend-prov">Provisional</em>
                          : story.change !== null && (Math.abs(story.change) < 0.05
                            ? <em className="trend trend-flat">≈ same as the average</em>
                            : <em className={`trend ${story.change > 0 ? 'trend-up' : 'trend-down'}`}>{story.change > 0 ? '▲' : '▼'} {Math.round(Math.abs(story.change) * 100)}% {story.change > 0 ? 'more' : 'less'} than the average</em>)}
                      </span>
                    </div>
                  </div>
                  {(provisional || unavailable.length > 0) && (
                    <Message type="warning" title={`Not enough history for a reliable forecast: only ${monthsLower(basisCount)} of dispensing records${data.basis.partial ? `, and ${monthText(basisMonths[0])} is not finished yet` : ` (${periodText(basisMonths)})`}.`}>
                      <p className="fc-msg-p">
                        {data.basis.partial && `Records so far: ${data.first_record_date ? dayText(data.first_record_date) : monthText(basisMonths[0])} to ${dayText(data.today)}. Because the month is not over, the real monthly demand may be higher. `}
                        {basisCount < 3
                          ? `This is not enough to tell whether demand is going up or down. The forecast below is provisional: it assumes the coming months will be like ${basisText}.`
                          : `The forecast below is provisional: ${METHOD_LABEL[data.method]} is reliable after ${methodInfo?.recommended_months} complete months of records.`}
                        {unavailable.map((m) => ` ${m.label} is not available yet: it needs at least ${data.methods_info[m.key].min_months} complete months of records.${m.key === 'linear_regression' ? ' Two months always fit a straight line exactly, so they cannot show a real trend.' : ''}`).join('')}
                        {' '}No records are made up.
                      </p>
                    </Message>
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
                            label={narrow ? undefined : { value: 'No records yet', position: 'insideTop', fontSize: 11, fill: '#7a8a86' }} />
                        )}
                        {chartData.length > 1 && (
                          <ReferenceArea x1={data.history_keys[data.history_keys.length - 1]} x2={data.forecast_keys[data.forecast_keys.length - 1]} fill="#eff9f1" fillOpacity={0.9} />
                        )}
                        <ReferenceLine x={data.history_keys[data.history_keys.length - 1]} stroke="#94a3b8" strokeDasharray="4 4"
                          label={narrow ? undefined : { value: 'Forecast starts →', position: 'insideTopRight', fontSize: 11, fill: FORECAST, offset: 6 }} />
                        <XAxis dataKey="key" tick={<MonthTick />} height={42} interval="preserveStartEnd" tickLine={false} axisLine={{ stroke: '#cbd5d1' }} />
                        <YAxis allowDecimals={false} fontSize={12} tickLine={false} axisLine={false} width={52}
                          label={{ value: `Quantity (${unitLabel})`, angle: -90, position: 'insideLeft', style: { fontSize: 12, fill: '#5f6f6b', textAnchor: 'middle' } }} />
                        <Tooltip content={<ChartTip unit={unitLabel} forecastKeys={data.forecast_keys} currentMonth={data.current_month}
                          dataStart={data.data_start} today={data.today} currentUsed={currentUsed} provisional={provisional} />} />
                        <Line dataKey="actual" name="Given out (actual)" stroke={ACTUAL} strokeWidth={2.5} activeDot={{ r: 6 }} isAnimationActive={false}
                          dot={({ cx, cy, index, payload }: { cx?: number; cy?: number; index?: number; payload?: { key: string } }) => (
                            <ActualDot key={`a-${index}`} cx={cx} cy={cy} index={index} payload={payload} currentMonth={data.current_month} />
                          )} />
                        <Line dataKey="forecast" name="Expected (forecast)" stroke={FORECAST} strokeWidth={2.5} strokeDasharray="6 5" dot={{ r: 4, fill: FORECAST }} activeDot={{ r: 6 }} isAnimationActive={false}>
                          {!narrow && <LabelList dataKey="forecastLabel" position="top" fontSize={12} fontWeight={700} fill={FORECAST} />}
                        </Line>
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="fc-periods">
                    <span style={{ flex: Math.max(data.history_keys.length - 1, 1) }}>Past months (actual, this month so far)</span>
                    <span className="fc-period-forecast" style={{ flex: data.forecast_keys.length }}>{provisional ? 'Forecast period (provisional)' : 'Forecast period'}</span>
                  </div>
                  <MethodExplanation method={data.method} result={methodResult} unit={unitLabel} forecast={forecastList} basisMonths={basisMonths}
                    partial={data.basis.partial} currentMonth={data.current_month} today={data.today} provisional={provisional} allMedicines={!selectedMedicine} />
                </>
              )}
              <details className="da-rules fc-howto">
                <summary>How to read this chart</summary>
                <ul>
                  <li><b>Solid line, actual demand:</b> how many {unitLabel} were given out (dispensed) each month, from the dispensing records. The hollow dot is this month so far: it can still go up, so it is only used for the forecast while there is no complete month yet.</li>
                  <li><b>Dashed line, forecast demand:</b> how many are expected to be needed each coming month, calculated from the solid line with the method chosen in Forecast settings. The numbers above the dots are the expected quantities.</li>
                  <li><b>Light green area, forecast period:</b> the coming months being predicted, starting next month.</li>
                  <li><b>Grey area, no records yet:</b> months before the first dispensing record. They are not counted as 0. A month after that with nothing given out is a real 0.</li>
                  {!selectedMedicine && <li>The chart adds up <b>all medicines</b>. Choose one medicine in Forecast settings to see its own demand.</li>}
                </ul>
              </details>
            </Card>
          </div>

          <div ref={tableRef}>
            <Card title="Restocking Recommendations" actions={!selectedMedicine && (
              <div className="chips" role="tablist" aria-label="Show">
                {([['restock', 'Needs restock', data.summary.restock_recommendations], ['high', 'Will run out', data.summary.potential_stockouts], ['all', 'All medicines', data.summary.medicines_analyzed]] as const).map(([key, label, count]) => (
                  <button key={key} role="tab" aria-selected={tableFilter === key} className={`chip ${tableFilter === key ? 'active' : ''}`} onClick={() => setTableFilter(key)}>
                    {label}<span className="chip-count">{count}</span>
                  </button>
                ))}
              </div>
            )}>
              {tableRows.length === 0 ? (
                <Empty>{tableFilter === 'high' ? 'No medicine is expected to run out in the forecast period.' : 'All medicines have enough stock for the forecast period.'}</Empty>
              ) : (
                <div className="fc-table-wrap">
                  <table className="fc-table">
                    <thead>
                      <tr>
                        <th className="col-no">No.</th><th>Medicine</th><th className="right">Current stock</th><th className="right">Waiting requests<br /><small>(as of now)</small></th>
                        <th className="right">Predicted demand<br /><small>({horizonText})</small></th><th className="right">Suggested restock</th><th>Priority</th><th className="right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fcPages.rows.map((r, i) => (
                        <tr key={r.medicine_id} className="clickable" onClick={() => setDetails(r)}>
                          <td className="col-no">{(fcPages.meta.from ?? 1) + i}</td>
                          <td><strong>{r.medicine_name}</strong><div className="muted small">{r.unit}</div></td>
                          <td className="right">
                            {r.stock_recorded === false ? <span className="mi-missing">Not recorded</span> : r.available_stock}
                            {r.reserved_stock > 0 && <div className="muted small">{r.reserved_stock} set aside</div>}
                          </td>
                          <td className="right">
                            {r.waiting_demand}
                            {r.restock_requests > 0 && <div className="muted small">+ {r.restock_requests} restock request{r.restock_requests === 1 ? '' : 's'} waiting</div>}
                          </td>
                          <td className="right">{r.predicted_demand}</td>
                          <td className="right"><strong>{r.recommended_restock}</strong></td>
                          <td><PriorityBadge priority={r.priority} recorded={r.stock_recorded !== false} /></td>
                          <td className="right"><button type="button" className="btn btn-outline btn-sm" onClick={(e) => { e.stopPropagation(); setDetails(r); }}>Details</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Pagination meta={fcPages.meta} onPage={fcPages.setPage} onPerPage={fcPages.setPerPage} noun="medicines" />
              <div className="fc-foot">
                <p className="muted small">
                  Forecasts are estimates based on historical dispensing records. The suggested restock also counts the quantities in pending medicine
                  requests and the stock set aside for approved requests. Restock requests have no quantity: medicines residents are waiting for are
                  marked High priority while out of stock. Review recommendations before restocking.
                  {' '}Method: {METHOD_LABEL[data.method]} · {data.last_generated ? `last generated ${formatDate(data.last_generated.generated_at, true)}` : 'not generated yet'}.
                </p>
                <button className="btn btn-outline" onClick={exportReport} disabled={!tableRows.length}><Svg d={ICON.download} size={18} /> Export report</button>
              </div>
            </Card>
          </div>

          <SeasonalDemand />
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
