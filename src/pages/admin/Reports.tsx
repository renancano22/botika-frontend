import { useState } from 'react';
import { api, errorMessage, formatDate } from '../../api';
import { useApi } from '../../hooks';
import { Card, Empty, Loading, Message } from '../../components/ui';

const TYPES: Record<string, string> = {
  usage: 'Medicine Usage',
  inventory: 'Inventory Status',
  dispensing: 'Dispensing Records',
  most_requested: 'Most Requested Medicines',
  transactions: 'Inventory Transactions (Stock-in / Stock-out)',
  shortages: 'Medicine Shortages',
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

const heading = (key: string) => key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function toCsv(rows: ReportData['rows']): string {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [cols.map(heading).map(esc).join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\r\n');
}

/** Generation of reports for medicine usage and inventory status (Objective 3.4). */
export default function Reports() {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [type, setType] = useState('usage');
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [report, setReport] = useState<ReportData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const history = useApi<ReportLog[]>('/reports');

  const generate = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await api.get<ReportData>(`/reports/${type}`, { params: { from, to } });
      setReport(res.data);
      history.reload(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally { setBusy(false); }
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

  return (
    <div className="page">
      <header className="page-head no-print"><h1>Reports</h1></header>

      <Card title="Generate report">
        <div className="filters no-print">
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {type !== 'inventory' && <>
            <label className="inline">From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="inline">To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          </>}
          <button className="btn" onClick={generate} disabled={busy}>{busy ? 'Generating…' : 'Generate'}</button>
        </div>
        <Message>{error}</Message>
      </Card>

      {report && (
        <Card title={report.title} actions={
          <div className="no-print actions">
            <button className="btn btn-outline btn-sm" onClick={download} disabled={!report.rows.length}>Download CSV</button>
            <button className="btn btn-outline btn-sm" onClick={() => window.print()}>Print</button>
          </div>
        }>
          <div className="print-only"><h2>BulanBotikaCare — Botika ng Bayan, Bulan, Sorsogon</h2><h3>{report.title}</h3></div>
          <p className="muted">Period: {report.date_range} · Generated {formatDate(report.generated_at, true)} by {report.generated_by}</p>
          {!report.rows.length ? <Empty>No data for this period.</Empty> : (
            <table>
              <thead><tr>{cols.map((c) => <th key={c}>{heading(c)}</th>)}</tr></thead>
              <tbody>
                {report.rows.map((r, i) => (
                  <tr key={i}>{cols.map((c) => <td key={c}>{String(r[c] ?? '—').replace(/_/g, ' ')}</td>)}</tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      <div className="no-print">
        <Card title="Report history">
          {history.loading && !history.data ? <Loading /> : !history.data?.length ? <Empty>No reports generated yet.</Empty> : (
            <table>
              <thead><tr><th>#</th><th>Report</th><th>Period</th><th>Generated</th><th>By</th></tr></thead>
              <tbody>
                {history.data.map((r) => (
                  <tr key={r.report_id}>
                    <td>{r.report_id}</td><td>{TYPES[r.report_type] ?? r.report_type}</td><td>{r.date_range}</td>
                    <td>{formatDate(r.generated_at, true)}</td><td>{r.generator?.name ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
