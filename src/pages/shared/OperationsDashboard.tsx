import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatDate } from '../../api';
import { useAuth } from '../../auth';
import { useApi } from '../../hooks';
import { Badge, Card, Empty, Loading, Message, StatCard } from '../../components/ui';
import type { Alerts, MedicineRequest } from '../../types';

interface OpsDashboard {
  counts: Record<string, number>;
  alerts: Alerts;
  recent_requests: MedicineRequest[];
  monthly_dispensing: { month: string; quantity: number }[];
  top_medicines?: { medicine_name: string; total: number }[];
}

const monthLabel = (m: string) => new Date(`${m}-01`).toLocaleDateString('en-PH', { month: 'short', year: '2-digit' });

/** Dashboard for the administrator and pharmacy staff. Refreshes every 30 seconds. */
export default function OperationsDashboard() {
  const { user } = useAuth();
  const { data, error, loading } = useApi<OpsDashboard>('/dashboard', undefined, 30000);
  const isAdmin = user?.role === 'admin';

  if (loading && !data) return <Loading />;
  if (!data) return <Message>{error}</Message>;
  const c = data.counts;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>{isAdmin ? 'Administrator Dashboard' : 'Pharmacy Staff Dashboard'}</h1>
          <p className="muted">Live overview · updates every 30 seconds</p>
        </div>
        <div className="actions">
          <Link className="btn" to="/dispense">Dispense medicine</Link>
          {isAdmin && <Link className="btn btn-outline" to="/forecasting">Demand forecast</Link>}
        </div>
      </header>

      <div className="stats">
        <StatCard label="Pending medicine requests" value={c.pending_requests} tone={c.pending_requests ? 'warn' : 'default'} />
        <StatCard label="Approved, waiting to dispense" value={c.approved_to_dispense} />
        <StatCard label="Dispensed today" value={c.dispensed_today} tone="ok" />
        <StatCard label="Pending restock requests" value={c.pending_restock} tone={c.pending_restock ? 'warn' : 'default'} />
        <StatCard label="Low stock" value={c.low_stock} tone={c.low_stock ? 'warn' : 'default'} />
        <StatCard label="Out of stock" value={c.out_of_stock} tone={c.out_of_stock ? 'danger' : 'default'} />
        <StatCard label="Batches near expiry" value={c.near_expiry} tone={c.near_expiry ? 'warn' : 'default'} />
        <StatCard label="Expired batches" value={c.expired} tone={c.expired ? 'danger' : 'default'} hint={c.expired ? 'Remove from stock' : undefined} />
        <StatCard label="Medicines" value={c.medicines} />
        <StatCard label="Registered residents" value={c.residents} />
        {isAdmin && <StatCard label="Active staff" value={c.staff ?? 0} />}
      </div>

      <div className="grid-2">
        <Card title="Medicines dispensed per month">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data.monthly_dispensing.map((m) => ({ ...m, label: monthLabel(m.month) }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" fontSize={12} />
              <YAxis fontSize={12} allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="quantity" name="Quantity" stroke="#0f766e" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {isAdmin ? (
          <Card title="Top dispensed medicines (last 30 days)">
            {data.top_medicines?.length ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.top_medicines} layout="vertical" margin={{ left: 40 }}>
                  <XAxis type="number" fontSize={12} allowDecimals={false} />
                  <YAxis type="category" dataKey="medicine_name" width={140} fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="total" name="Quantity" fill="#0f766e" />
                </BarChart>
              </ResponsiveContainer>
            ) : <Empty>No dispensing in the last 30 days.</Empty>}
          </Card>
        ) : (
          <PendingRequests requests={data.recent_requests} />
        )}
      </div>

      <div className="grid-2">
        <Card title="Stock alerts" actions={<Link to="/inventory">Open inventory</Link>}>
          {data.alerts.low_stock.length === 0 ? <Empty>All medicines are above their reorder level.</Empty> : (
            <table>
              <thead><tr><th>Medicine</th><th>Available</th><th>Reorder level</th><th>Status</th></tr></thead>
              <tbody>
                {data.alerts.low_stock.map((m) => (
                  <tr key={m.medicine_id}>
                    <td>{m.medicine_name}</td><td>{m.available_stock} {m.unit}</td><td>{m.reorder_level}</td><td><Badge value={m.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Expiration alerts">
          {data.alerts.expired.length + data.alerts.near_expiry.length === 0 ? <Empty>No batches near expiry.</Empty> : (
            <table>
              <thead><tr><th>Medicine</th><th>Qty</th><th>Expires</th><th>Status</th></tr></thead>
              <tbody>
                {[...data.alerts.expired, ...data.alerts.near_expiry].map((b) => {
                  const expired = data.alerts.expired.includes(b);
                  return (
                    <tr key={b.inventory_id}>
                      <td>{b.medicine.medicine_name}</td><td>{b.quantity}</td><td>{formatDate(b.expiration_date)}</td>
                      <td><Badge value={expired ? 'expired' : 'near_expiry'} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      {isAdmin && <PendingRequests requests={data.recent_requests} />}
    </div>
  );
}

function PendingRequests({ requests }: { requests: MedicineRequest[] }) {
  return (
    <Card title="Pending requests" actions={<Link to="/requests">Review requests</Link>}>
      {requests.length === 0 ? <Empty>No pending requests.</Empty> : (
        <table>
          <thead><tr><th>#</th><th>Type</th><th>Resident</th><th>Medicines</th><th>Date</th></tr></thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.request_id}>
                <td>{r.request_id}</td><td><Badge value={r.request_type} /></td><td>{r.resident?.name}</td>
                <td>{r.items.map((i) => `${i.medicine.medicine_name} ×${i.quantity}`).join(', ')}</td>
                <td>{formatDate(r.request_date, true)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
