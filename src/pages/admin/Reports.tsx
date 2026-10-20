import { useState } from 'react';
import { api, errorMessage } from '../../api';
import { useApi } from '../../hooks';
import { toast } from '../../components/feedback';
import { Empty, Loading, Message } from '../../components/ui';
import { Svg } from '../../components/RequestCards';
import { jumpTo } from '../../scroll';
import BackButton from '../../components/BackButton';

const TYPES: Record<string, string> = {
  usage: 'Medicine Usage',
  inventory: 'Inventory Status',
  dispensing: 'Dispensing Records',
  most_requested: 'Most Requested Medicines',
  transactions: 'Inventory Transactions (Stock-in / Stock-out)',
  shortages: 'Medicine Shortages',
};

/** What each report contains (shown under the report type). */
const DESCRIPTIONS: Record<string, string> = {
  usage: 'How much of each medicine was dispensed to residents in the period.',
  inventory: 'Current stock, reorder level and stock status of every medicine, as of today.',
  dispensing: 'Every release of medicine to a resident in the period: who received it, what, and who dispensed it.',
  most_requested: 'The medicines residents asked for most in the period.',
  transactions: 'Every stock-in and stock-out (expired, damaged, dispensed, etc.) in the period.',
  shortages: 'Medicines that are low or out of stock, with the number of restock requests in the period.',
};

const ICON = {
  report: 'M14 3H6v18h12V7zM14 3v4h4M9 12h6M9 16h6',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  print: 'M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2',
};

interface ReportData {
  type: string;
  title: string;
  date_range: string;
  generated_at: string;
  generated_by: string;
  rows: Record<string, string | number | null>[];
}

interface ReportLog { report_id: number; report_type: string; date_range: string; generated_at: string; generator?: { name: string } }

/** YYYY-MM-DD in local time. */
const ymd = (d: Date) => d.toLocaleDateString('en-CA');
const shiftDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
const niceDate = (v: string) => new Date(`${v}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
const niceDateTime = (v: string) => {
  const d = new Date(v.replace(' ', 'T'));
  return {
    date: d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }),
    time: d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }),
  };
};
/** "2026-09-13 to 2026-10-13" → "Sep 13, 2026 – Oct 13, 2026"; "As of 2026-10-13" → "As of Oct 13, 2026". */
function periodText(range: string): string {
  const m = range.match(/^(\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})$/);
  if (m) return m[1] === m[2] ? niceDate(m[1]) : `${niceDate(m[1])} – ${niceDate(m[2])}`;
  const a = range.match(/^As of (\d{4}-\d{2}-\d{2})$/);
  return a ? `As of ${niceDate(a[1])}` : range;
}
/** Dates inside report cells (YYYY-MM-DD or YYYY-MM-DD HH:MM:SS) shown the same way everywhere. */
function cellText(v: string | number | null): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'number') return v.toLocaleString('en-PH');
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return niceDate(v);
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(v)) { const t = niceDateTime(v); return `${t.date}, ${t.time}`; }
  return v.replace(/_/g, ' ');
}

const heading = (key: string) => key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bId\b/g, 'ID');

function toCsv(rows: ReportData['rows']): string {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [cols.map(heading).map(esc).join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\r\n');
}

const PRESETS: { label: string; range: () => [string, string] }[] = [
  { label: 'Last 7 days', range: () => [shiftDays(-6), ymd(new Date())] },
  { label: 'Last 30 days', range: () => [shiftDays(-30), ymd(new Date())] },
  { label: 'This month', range: () => { const d = new Date(); return [ymd(new Date(d.getFullYear(), d.getMonth(), 1)), ymd(d)]; } },
  { label: 'Last month', range: () => { const d = new Date(); return [ymd(new Date(d.getFullYear(), d.getMonth() - 1, 1)), ymd(new Date(d.getFullYear(), d.getMonth(), 0))]; } },
];

/** Generation of reports for medicine usage and inventory status (Objective 3.4). */
export default function Reports() {
  const [type, setType] = useState('usage');
  const [from, setFrom] = useState(shiftDays(-30));
  const [to, setTo] = useState(ymd(new Date()));
  const [report, setReport] = useState<ReportData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const history = useApi<ReportLog[]>('/reports');

  const needsDates = type !== 'inventory';
  const badRange = needsDates && (!from || !to || from > to);

  const generate = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.get<ReportData>(`/reports/${type}`, { params: needsDates ? { from, to } : {} });
      setReport(res.data);
      history.reload(true);
      toast.success('Report generated', { description: `${TYPES[type] ?? 'The report'} is ready below. You can print or download it.` });
      requestAnimationFrame(() => jumpTo('report-result'));
    } catch (err) {
      setError(errorMessage(err));
    } finally { setBusy(false); }
  };

  /** "Use again": puts an old report's type and period back into the form. */
  const reuse = (log: ReportLog) => {
    setType(TYPES[log.report_type] ? log.report_type : 'usage');
    const m = log.date_range.match(/^(\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})$/);
    if (m) { setFrom(m[1]); setTo(m[2]); }
    requestAnimationFrame(() => jumpTo('report-form'));
  };

  const download = () => {
    if (!report) return;
    const blob = new Blob(['﻿' + toCsv(report.rows)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${report.type}_${report.date_range.replace(/\s+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const cols = report?.rows.length ? Object.keys(report.rows[0]) : [];
  const numericCols = new Set(cols.filter((c) => report?.rows.every((r) => r[c] === null || typeof r[c] === 'number')));
  const generated = report ? niceDateTime(report.generated_at) : null;

  return (
    <div className="page rp-page">
      <BackButton linkedOnly />
      <header className="page-head no-print">
        <div>
          <div className="page-title"><h1>Reports</h1></div>
          <p className="muted">Generate, download and print reports on medicine usage, dispensing and inventory.</p>
        </div>
      </header>

      <section className="card rp-form no-print" id="report-form">
        <div className="rp-card-head">
          <span className="rp-card-icon"><Svg d={ICON.report} size={20} /></span>
          <div><h2>Generate Report</h2><p className="muted small">Choose the report and the period it should cover.</p></div>
        </div>

        <div className="rp-grid">
          <label className="rp-field rp-type">
            <span>Report type</span>
            <select className="select-pill" value={type} onChange={(e) => setType(e.target.value)}>
              {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <small className="rp-desc">{DESCRIPTIONS[type]}</small>
          </label>

          {needsDates ? (
            <div className="rp-period">
              <div className="rp-presets" role="group" aria-label="Quick period">
                {PRESETS.map((p) => {
                  const [f, t] = p.range();
                  return (
                    <button key={p.label} type="button" className={`chip ${f === from && t === to ? 'active' : ''}`} onClick={() => { setFrom(f); setTo(t); }}>
                      {p.label}
                    </button>
                  );
                })}
              </div>
              <div className="rp-dates">
                <label className="rp-field">
                  <span>From date</span>
                  <span className="dr-input">
                    <Svg d={ICON.calendar} size={18} />
                    <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
                  </span>
                </label>
                <label className="rp-field">
                  <span>To date</span>
                  <span className="dr-input">
                    <Svg d={ICON.calendar} size={18} />
                    <input type="date" value={to} min={from || undefined} max={ymd(new Date())} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
                  </span>
                </label>
              </div>
            </div>
          ) : (
            <div className="rp-asof"><Svg d={ICON.calendar} size={18} /> This report shows the stock <b>as of today</b> ({niceDate(ymd(new Date()))}), so no dates are needed.</div>
          )}
        </div>

        {badRange && <p className="field-warning">Choose both dates, with the "From" date on or before the "To" date.</p>}
        <Message>{error}</Message>

        <div className="rp-actions">
          {needsDates && !badRange && <span className="muted small">Period: <b>{periodText(`${from} to ${to}`)}</b></span>}
          <button className="btn btn-lg rp-generate" onClick={generate} disabled={busy || badRange}>
            <Svg d={ICON.report} size={18} /> {busy ? 'Generating…' : 'Generate Report'}
          </button>
        </div>
      </section>

      {report && (
        <section className="card rp-result" id="report-result">
          <div className="print-only"><h2>BulanBotikaCare — Botika ng Bayan, Bulan, Sorsogon</h2></div>
          <div className="rp-result-head">
            <div>
              <h2>{report.title}</h2>
              <div className="rp-meta">
                <span><small>Period</small>{periodText(report.date_range)}</span>
                <span><small>Generated</small>{generated?.date}, {generated?.time}</span>
                <span><small>Prepared by</small>{report.generated_by}</span>
                <span><small>Rows</small>{report.rows.length}</span>
              </div>
            </div>
            <div className="no-print rp-result-actions">
              <button className="btn btn-outline" onClick={download} disabled={!report.rows.length}><Svg d={ICON.download} size={18} /> Download CSV</button>
              <button className="btn btn-outline" onClick={() => window.print()}><Svg d={ICON.print} size={18} /> Print</button>
            </div>
          </div>
          {!report.rows.length ? <Empty>No data for this period. Try a longer period.</Empty> : (
            <div className="rp-table-wrap">
              <table className="rp-table">
                <thead><tr>{cols.map((c) => <th key={c} className={numericCols.has(c) ? 'right' : ''}>{heading(c)}</th>)}</tr></thead>
                <tbody>
                  {report.rows.map((r, i) => (
                    <tr key={i}>{cols.map((c) => <td key={c} className={numericCols.has(c) ? 'right num' : ''}>{cellText(r[c])}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <section className="card rp-history no-print">
        <div className="rp-card-head">
          <span className="rp-card-icon"><Svg d={ICON.history} size={20} /></span>
          <div><h2>Report History</h2><p className="muted small">Reports generated by the administrator, newest first.</p></div>
        </div>
        {history.loading && !history.data ? <Loading /> : !history.data?.length ? <Empty>No reports generated yet.</Empty> : (
          <table className="rp-table rp-history-table">
            <thead><tr><th>No.</th><th>Report</th><th>Period covered</th><th>Generated on</th><th>Generated by</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {history.data.map((r) => {
                const g = niceDateTime(r.generated_at);
                return (
                  <tr key={r.report_id}>
                    <td data-label="No."><span className="rp-no">No. {r.report_id}</span></td>
                    <td data-label="Report"><strong>{TYPES[r.report_type] ?? heading(r.report_type)}</strong></td>
                    <td data-label="Period covered">{periodText(r.date_range)}</td>
                    <td data-label="Generated on"><span className="rp-date">{g.date}</span><span className="muted small">{g.time}</span></td>
                    <td data-label="Generated by">{r.generator?.name ?? '—'}</td>
                    <td className="right"><button className="btn btn-outline btn-sm" onClick={() => reuse(r)}>Use again</button></td>
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
