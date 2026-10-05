import { useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatDate } from '../../api';
import { useApi } from '../../hooks';
import { Card, Empty, Loading, Message } from '../../components/ui';
import type { ForecastResult } from '../../types';

const METHOD_LABEL: Record<string, string> = {
  moving_average: 'Moving average (3 months)',
  linear_regression: 'Linear regression',
  exponential_smoothing: 'Time series (exponential smoothing)',
};

const monthLabel = (m: string) => new Date(`${m.slice(0, 7)}-01`).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' });

/** Demand forecasting from historical dispensing data (Objective 3.5). */
export default function Forecasting() {
  const { data, error, loading, reload } = useApi<{ generated_at: string; history_months: number; results: ForecastResult[] }>('/forecasts');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const selected = data?.results.find((r) => r.medicine_id === selectedId) ?? data?.results[0];

  const chartData = useMemo(() => {
    if (!selected) return [];
    const rows: Record<string, string | number | null>[] = Object.entries(selected.history).map(([m, qty]) => ({ label: monthLabel(m), actual: qty }));
    const last = rows[rows.length - 1];
    if (last) Object.keys(selected.methods).forEach((k) => { last[k] = last.actual; });
    rows.push({
      label: `${monthLabel(selected.forecast_date)} (forecast)`,
      actual: null,
      ...Object.fromEntries(Object.entries(selected.methods).map(([k, v]) => [k, v.predicted_demand])),
    });
    return rows;
  }, [selected]);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Demand Forecasting</h1>
          <p className="muted">
            Forecasts each medicine's demand for {data?.results[0] ? monthLabel(data.results[0].forecast_date) : 'the coming month'} from the
            past {data?.history_months ?? 12} months of dispensing records. The method with the lowest back-tested error (MAE) is used for the restocking recommendation.
          </p>
        </div>
        <button className="btn" onClick={() => reload()} disabled={loading}>{loading ? 'Running…' : 'Run forecast again'}</button>
      </header>
      <Message>{error}</Message>

      {loading && !data ? <Loading /> : !data?.results.length ? <Empty>No medicines to forecast yet.</Empty> : (
        <>
          <Card title="Restocking recommendations" actions={<span className="muted small">Generated {formatDate(data.generated_at, true)}</span>}>
            <table>
              <thead>
                <tr>
                  <th>Medicine</th><th>Available</th><th>Moving avg.</th><th>Linear reg.</th><th>Exp. smoothing</th>
                  <th>Best method</th><th>Predicted demand</th><th>Recommended restock</th>
                </tr>
              </thead>
              <tbody>
                {data.results.map((r) => (
                  <tr key={r.medicine_id} className={`clickable ${selected?.medicine_id === r.medicine_id ? 'row-selected' : ''}`} onClick={() => setSelectedId(r.medicine_id)}>
                    <td><strong>{r.medicine_name}</strong></td>
                    <td>{r.available_stock} {r.unit}</td>
                    <td>{r.methods.moving_average.predicted_demand}</td>
                    <td>{r.methods.linear_regression.predicted_demand}</td>
                    <td>{r.methods.exponential_smoothing.predicted_demand}</td>
                    <td>{METHOD_LABEL[r.best_method]}</td>
                    <td><strong>{r.predicted_demand}</strong></td>
                    <td>{r.recommended_restock > 0 ? <span className="badge badge-low_stock">Order {r.recommended_restock} {r.unit}</span> : <span className="badge badge-available">Enough stock</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {selected && (
            <Card title={`${selected.medicine_name}: monthly dispensing and forecast`}>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" fontSize={12} />
                  <YAxis fontSize={12} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Line dataKey="actual" name="Actual dispensed" stroke="#0f766e" strokeWidth={2} connectNulls={false} />
                  <Line dataKey="moving_average" name={METHOD_LABEL.moving_average} stroke="#2563eb" strokeDasharray="5 4" />
                  <Line dataKey="linear_regression" name={METHOD_LABEL.linear_regression} stroke="#d97706" strokeDasharray="5 4" />
                  <Line dataKey="exponential_smoothing" name={METHOD_LABEL.exponential_smoothing} stroke="#9333ea" strokeDasharray="5 4" />
                </LineChart>
              </ResponsiveContainer>
              <table>
                <thead><tr><th>Method</th><th>Forecast</th><th>Mean absolute error (back-test)</th></tr></thead>
                <tbody>
                  {Object.entries(selected.methods).map(([k, v]) => (
                    <tr key={k} className={k === selected.best_method ? 'row-selected' : ''}>
                      <td>{METHOD_LABEL[k]}{k === selected.best_method && ' ★'}</td>
                      <td>{v.predicted_demand} {selected.unit}</td>
                      <td>{v.mae === null ? 'Not enough data' : v.mae.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted small">
                Recommended restock = predicted demand ({selected.predicted_demand}) + reorder level ({selected.reorder_level}) − available stock ({selected.available_stock}).
              </p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
