import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, errorMessage, formatDate } from '../../api';
import { useApi } from '../../hooks';
import { Empty, Loading, Message, Modal } from '../../components/ui';
import { ICONS, quantityText, Svg, unitPlural } from '../../components/RequestCards';
import type { ForecastMethod, ForecastReport, ForecastResult } from '../../types';

const METHODS: { key: ForecastMethod; label: string; hint: string }[] = [
  { key: 'moving_average', label: 'Moving Average', hint: 'Average of the last 3 months' },
  { key: 'linear_regression', label: 'Linear Regression', hint: 'Follows the upward or downward trend' },
  { key: 'exponential_smoothing', label: 'Time-Series Analysis', hint: 'Exponential smoothing: recent months count more' },
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

function PriorityBadge({ priority }: { priority: ForecastResult['priority'] }) {
  if (!priority) return <span className="prio prio-ok"><Svg d={ICONS.check} size={14} width={2.6} /> Enough stock</span>;
  return (
    <span className={`prio prio-${priority}`}>
      <Svg d={ICONS.info} size={14} width={2.4} /> {priority === 'high' ? 'High' : 'Medium'}
    </span>
  );
}

/** Ranked list with medal numbers and bars (top barangays / top medicines). */
function RankList({ items, empty }: { items: { name: string; total: number }[]; empty: string }) {
  if (!items.length) return <Empty>{empty}</Empty>;
  const max = Math.max(...items.map((i) => i.total), 1);
  return (
    <ol className="rank-list">
      {items.map((item, i) => (
        <li key={item.name}>
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
  const { data, error, loading, setData } = useApi<ForecastReport>('/forecasts', params);

  const [medicineId, setMedicineId] = useState<number | null>(null);
  const [tableFilter, setTableFilter] = useState<TableFilter>('restock');
  const [details, setDetails] = useState<ForecastResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [toast, setToast] = useState('');
  const chartRef = useRef<HTMLElement>(null);
  const tableRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(''), 3000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const results = data?.results ?? [];
  const selectedMedicine = medicineId ? results.find((r) => r.medicine_id === medicineId) ?? null : null;
  const chartRows = selectedMedicine ? [selectedMedicine] : results;
  const unitLabel = selectedMedicine ? unitPlural(selectedMedicine.unit) : 'units';

  // Actual monthly demand (dispensed) and the forecast, for all medicines together or the chosen one.
  const chartData = useMemo(() => {
    if (!data) return [];
    const points: { key: string; actual?: number; forecast?: number }[] = data.history_keys.map((k) => ({
      key: k, actual: chartRows.reduce((s, r) => s + (r.history[k] ?? 0), 0),
    }));
    const last = points[points.length - 1];
    if (last) last.forecast = last.actual; // the dashed forecast line starts at the last actual month
    data.forecast_keys.forEach((k) => {
      points.push({ key: k, forecast: round1(chartRows.reduce((s, r) => s + (r.forecast[k] ?? 0), 0)) });
    });
    return points;
  }, [data, chartRows]);

  const tableRows = useMemo(() => {
    if (selectedMedicine) return [selectedMedicine];
    const rows = tableFilter === 'all' ? results
      : tableFilter === 'high' ? results.filter((r) => r.priority === 'high')
        : results.filter((r) => r.recommended_restock > 0);
    return sortRows(rows);
  }, [results, tableFilter, selectedMedicine]);

  const go = (filter: TableFilter | null, ref: RefObject<HTMLElement>) => {
    if (filter) { setTableFilter(filter); setMedicineId(null); }
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const generate = async () => {
    if (!data) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.post<ForecastReport>('/forecasts/generate', { months: data.history_months, horizon: data.horizon, method: data.method });
      setData(res.data);
      setToast(`Forecast for ${periodText(res.data.forecast_keys)} generated and saved.`);
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) });
    } finally { setBusy(false); }
  };

  const exportReport = () => {
    if (!data) return;
    const head = ['Medicine', 'Category', 'Unit', 'Current Stock', `Predicted Demand (Next ${monthsText(data.horizon)})`, 'Suggested Restock', 'Priority', 'Forecasting Method', 'Forecast Period'];
    const rows = tableRows.map((r) => [r.medicine_name, r.category, r.unit, r.available_stock, r.predicted_demand, r.recommended_restock,
      r.priority === 'high' ? 'High' : r.priority === 'medium' ? 'Medium' : 'Enough stock', METHOD_LABEL[data.method], periodText(data.forecast_keys)]);
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
      {msg && <Message type={msg.type}>{msg.text}</Message>}
      <Message>{error}</Message>

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
              <RankList items={data.top_barangays.map((b) => ({ name: b.barangay, total: b.total }))} empty="No approved medicine requests in this period yet." />
              <p className="fc-note"><Svg d={ICONS.info} size={16} /> Based on approved medicine requests since {since}.</p>
            </section>
            <section className="card fc-card">
              <div className="fc-card-head"><span className="fc-card-icon"><Svg d={ICONS.pill} size={20} /></span><h2>Most Frequently Requested Medicines</h2></div>
              <RankList items={data.top_medicines.map((m) => ({ name: m.medicine_name, total: m.total }))} empty="No medicine requests in this period yet." />
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
                  <span><i className="lg-forecast" /> Forecast Demand</span>
                </span>
              </div>
              <div className="fc-chart">
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData} margin={{ top: 10, right: 18, left: 6, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#e8eeec" />
                    {chartData.length > 1 && (
                      <ReferenceArea x1={data.history_keys[data.history_keys.length - 1]} x2={data.forecast_keys[data.forecast_keys.length - 1]} fill="#dbe7fd" fillOpacity={0.45} />
                    )}
                    <ReferenceLine x={data.history_keys[data.history_keys.length - 1]} stroke="#94a3b8" strokeDasharray="4 4" />
                    <XAxis dataKey="key" tick={<MonthTick />} height={42} interval="preserveStartEnd" tickLine={false} axisLine={{ stroke: '#cbd5d1' }} />
                    <YAxis allowDecimals={false} fontSize={12} tickLine={false} axisLine={false} width={52}
                      label={{ value: `Quantity (${unitLabel})`, angle: -90, position: 'insideLeft', style: { fontSize: 12, fill: '#5f6f6b', textAnchor: 'middle' } }} />
                    <Tooltip labelFormatter={(k) => monthText(String(k))} formatter={(v) => `${v} ${unitLabel}`} />
                    <Line dataKey="actual" name="Actual Demand" stroke="#0b7a63" strokeWidth={2.5} dot={{ r: 4, fill: '#0b7a63' }} isAnimationActive={false} />
                    <Line dataKey="forecast" name="Forecast Demand" stroke="#2563eb" strokeWidth={2.5} strokeDasharray="6 5" dot={{ r: 4, fill: '#2563eb' }} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="fc-periods">
                <span style={{ flex: Math.max(data.history_keys.length - 1, 1) }}>Historical (Actual Demand)</span>
                <span className="fc-period-forecast" style={{ flex: data.forecast_keys.length }}>Forecast Period</span>
              </div>
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
                {METHODS.map((m) => (
                  <label key={m.key} className={`fc-method ${(method ?? data.method) === m.key ? 'active' : ''}`}>
                    <input type="radio" name="method" checked={(method ?? data.method) === m.key} onChange={() => setMethod(m.key)} />
                    <span>
                      <strong>{m.label}</strong>
                      {data.best_method === m.key && <em className="fc-best">Most accurate</em>}
                      <small>{m.hint}{data.method_error[m.key] !== null ? ` · avg. error ±${data.method_error[m.key]}/month` : ''}</small>
                    </span>
                  </label>
                ))}
              </fieldset>
              <p className="fc-note">"Most accurate" = the method with the lowest error when tested on your past records.</p>
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
                      <tr><th>Medicine</th><th className="center">Current Stock</th><th className="center">Predicted Demand<br /><small>({horizonText})</small></th><th className="center">Suggested Restock</th><th>Priority</th><th aria-label="Details" /></tr>
                    </thead>
                    <tbody>
                      {tableRows.map((r) => (
                        <tr key={r.medicine_id} className="clickable" onClick={() => setDetails(r)}>
                          <td>
                            <span className="fc-med">
                              <span className="fc-med-icon"><Svg d={ICONS.pill} size={18} /></span>
                              <span><strong>{r.medicine_name}</strong><small className="muted">{r.unit}</small></span>
                            </span>
                          </td>
                          <td className="center">{r.available_stock}</td>
                          <td className="center">{r.predicted_demand}</td>
                          <td className="center"><strong>{r.recommended_restock}</strong></td>
                          <td><PriorityBadge priority={r.priority} /></td>
                          <td className="right"><Svg d={ICONS.chevron} size={18} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="fc-restock-actions">
                <button className="btn btn-outline" onClick={exportReport} disabled={!tableRows.length}><Svg d={ICON.download} size={18} /> Export Report</button>
                {generateButton()}
              </div>
            </div>
            <p className="fc-info"><Svg d={ICONS.info} size={16} /> Forecasts are estimates based on historical dispensing records. Review recommendations before restocking.
              {' '}Method: {METHOD_LABEL[data.method]} · last run {formatDate(data.generated_at, true)}.</p>
          </section>
        </div>
      )}

      {toast && <div className="toast" role="status"><Svg d={ICONS.check} size={18} width={2.6} /> {toast}</div>}

      {details && data && (
        <Modal title={details.medicine_name} onClose={() => setDetails(null)}>
          <p className="muted small fc-detail-sub">{details.category} · {details.unit}</p>
          <div className="fc-detail-grid">
            <div><small>Current stock</small><strong>{quantityText(details.available_stock, details.unit)}</strong></div>
            <div><small>Reorder level</small><strong>{details.reorder_level}</strong></div>
            <div><small>Predicted demand ({horizonText.toLowerCase()})</small><strong>{details.predicted_demand}</strong></div>
            <div><small>Suggested restock</small><strong>{details.recommended_restock}</strong></div>
          </div>
          <p className="muted small">
            Suggested restock = predicted demand ({details.predicted_demand}) + reorder level ({details.reorder_level}) − current stock ({details.available_stock})
            {details.recommended_restock === 0 ? ' → no restock needed.' : '.'}
          </p>
          <PriorityBadge priority={details.priority} />

          <h3 className="fc-detail-title">Monthly forecast ({METHOD_LABEL[data.method]})</h3>
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
                    <td>{m.label}{m.key === details.best_method && <em className="fc-best">Most accurate</em>}</td>
                    <td className="right">{Math.ceil(v.predicted_demand)}</td>
                    <td className="right">{v.mae === null ? 'Not enough data' : `±${v.mae}`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="muted small">Average error = how far each method's forecast was from the actual dispensed quantity when tested month by month on the past records.</p>
          <div className="modal-actions">
            <button className="btn btn-outline" onClick={() => setDetails(null)}>Close</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
