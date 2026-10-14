import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatDate } from '../../api';
import { useAuth } from '../../auth';
import { useApi } from '../../hooks';
import { Badge, Card, Empty, Loading, Message } from '../../components/ui';
import ActivityTile from '../../components/ActivityTile';
import type { Alerts, MedicineRequest } from '../../types';
import { ExpiryBanner, expiryText } from '../../components/ExpiryAlerts';
import { PickupCountdown } from '../../components/RequestCards';

interface OpsDashboard {
  counts: Record<string, number>;
  alerts: Alerts;
  recent_requests: MedicineRequest[];
  ready_for_pickup: MedicineRequest[];
  monthly_dispensing: { month: string; quantity: number }[];
  top_medicines?: { medicine_name: string; total: number }[];
}

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);
const monthLabel = (m: string) => new Date(`${m}-01`).toLocaleDateString('en-PH', { month: 'short', year: '2-digit' });

/** Dashboard for the administrator and pharmacy staff. Refreshes every 30 seconds. */
export default function OperationsDashboard() {
  const { user } = useAuth();
  const { data, error, loading } = useApi<OpsDashboard>('/dashboard', undefined, 30000);
  const isAdmin = user?.role === 'admin';

  if (loading && !data) return <Loading />;
  if (!data) return <Message>{error}</Message>;
  const c = data.counts;
  const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time

  return (
    <div className="page">
      <header className="page-head hero-head">
        <div>
          <h1>{isAdmin ? 'Administrator Dashboard' : 'Pharmacy Staff Dashboard'}</h1>
          <p className="muted">Live overview · updates every 30 seconds</p>
        </div>
        <div className="actions">
          <Link className="btn" to="/dispense">Dispense medicine</Link>
          {isAdmin && <Link className="btn btn-outline" to="/forecasting">Demand forecast</Link>}
        </div>
      </header>

      <ExpiryBanner alerts={data.alerts} />

      <section className="card act-card">
        <h2>Requests &amp; dispensing</h2>
        <div className="act-grid act-grid-ops">
          <ActivityTile to="/requests?type=medicine&status=pending" k="review" value={c.pending_requests} unit={plural(c.pending_requests, 'request')} label="Pending requests" alert={c.pending_requests > 0} />
          <ActivityTile to="/requests?type=medicine&status=approved" k="ready" value={c.approved_to_dispense} unit={plural(c.approved_to_dispense, 'request')} label="Ready for pickup" />
          <ActivityTile to={`/dispensing?from=${today}&to=${today}`} k="completed" value={c.dispensed_today} unit="today" label="Dispensed today" />
          <ActivityTile to="/requests?type=restock&status=pending" k="submitted" value={c.pending_restock} unit={plural(c.pending_restock, 'request')} label="Pending restock" alert={c.pending_restock > 0} />
        </div>
        <h2>Stock</h2>
        <div className="act-grid act-grid-ops">
          <ActivityTile to="/medicines?status=low_stock" k="reminder" value={c.low_stock} unit={plural(c.low_stock, 'medicine')} label="Low stock" alert={c.low_stock > 0} />
          <ActivityTile to="/medicines?status=out_of_stock" k="rejected" value={c.out_of_stock} unit={plural(c.out_of_stock, 'medicine')} label="Out of stock" alert={c.out_of_stock > 0} />
          <ActivityTile to="/inventory?expiry=near_expiry" k="expired" value={c.near_expiry} unit={plural(c.near_expiry, 'batch', 'batches')} label="Expiring in 1 month" alert={c.near_expiry > 0} />
          <ActivityTile to="/inventory?expiry=expired" k="rejected" value={c.expired} unit={plural(c.expired, 'batch', 'batches')} label="Expired batches" alert={c.expired > 0}
            hint={c.expired ? 'Remove from stock' : undefined} />
          <ActivityTile to="/medicines" k="available" value={c.medicines} unit={plural(c.medicines, 'medicine')} label="All medicines" />
        </div>
        {isAdmin && <>
          <h2>People</h2>
          <div className="act-grid act-grid-ops">
            <ActivityTile to="/users?role=resident" k="hours" value={c.residents} unit={plural(c.residents, 'resident')} label="Registered residents" />
            <ActivityTile to="/users?role=staff" k="announcement" value={c.staff ?? 0} unit="active" label="Pharmacy staff" />
          </div>
        </>}
      </section>

      <ReadyForPickup requests={data.ready_for_pickup ?? []} total={c.approved_to_dispense} />

      <div className="grid-2">
        <Card title="Medicines dispensed per month">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data.monthly_dispensing.map((m) => ({ ...m, label: monthLabel(m.month) }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" fontSize={12} />
              <YAxis fontSize={12} allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="quantity" name="Quantity" stroke="#228b39" strokeWidth={2} />
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
                  <Bar dataKey="total" name="Quantity" fill="#228b39" />
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

        <Card title="Expiration alerts (within 1 month)">
          {data.alerts.expired.length + data.alerts.near_expiry.length === 0 ? <Empty>No medicine will expire within 1 month.</Empty> : (
            <table>
              <thead><tr><th>Medicine</th><th>Qty</th><th>Expires</th><th>Status</th></tr></thead>
              <tbody>
                {[...data.alerts.expired, ...data.alerts.near_expiry].map((b) => {
                  const expired = data.alerts.expired.includes(b);
                  return (
                    <tr key={b.inventory_id}>
                      <td>{b.medicine.medicine_name}</td><td>{b.quantity}</td><td>{formatDate(b.expiration_date)}<div className="muted small">{expiryText(b).replace(/ \(.*\)$/, '')}</div></td>
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

/** Approved medicine requests waiting to be claimed: whose they are, what, and until when. */
function ReadyForPickup({ requests, total }: { requests: MedicineRequest[]; total: number }) {
  return (
    <Card title={`Ready for pickup (${total})`} actions={<Link to="/requests?status=approved">View all approved requests</Link>}>
      {requests.length === 0 ? <Empty>No approved requests are waiting to be claimed.</Empty> : (
        <table>
          <thead><tr><th>No.</th><th>Resident</th><th>Medicines</th><th>Approved</th><th>Claim by</th></tr></thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.request_id}>
                <td>{r.request_id}</td>
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

function PendingRequests({ requests }: { requests: MedicineRequest[] }) {
  return (
    <Card title="Pending requests" actions={<Link to="/requests">Review requests</Link>}>
      {requests.length === 0 ? <Empty>No pending requests.</Empty> : (
        <table>
          <thead><tr><th>No.</th><th>Type</th><th>Resident</th><th>Medicines</th><th>Date</th></tr></thead>
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
