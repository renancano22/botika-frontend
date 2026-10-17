import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatDate } from '../../api';
import { useAuth } from '../../auth';
import { useApi } from '../../hooks';
import { Badge, Card, Empty, Loading, Message } from '../../components/ui';
import type { Alerts, MedicineRequest } from '../../types';
import { ExpiryBanner, expiryText } from '../../components/ExpiryAlerts';
import { ICONS, PickupCountdown, Svg } from '../../components/RequestCards';
import BackButton from '../../components/BackButton';

interface OpsDashboard {
  counts: Record<string, number>;
  alerts: Alerts;
  recent_requests: MedicineRequest[];
  ready_for_pickup: MedicineRequest[];
  monthly_dispensing: { month: string; quantity: number }[];
  top_medicines?: { medicine_name: string; total: number }[];
}

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);
const ICON = {
  review: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 14l2 2 4-4',
  restock: 'M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8M16.5 5.5 7.5 10.5',
  users: 'M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 20v-2a4 4 0 0 0-3-3.9M16 2.1a4 4 0 0 1 0 7.8',
  staff: 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21v-2a6 6 0 0 1 12 0v2M19 8v6M16 11h6',
  question: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17h.01',
  alert: 'M12 3 2 20h20zM12 10v4M12 17h.01',
};
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
          <div className="page-title"><BackButton light onlyWithHistory /><h1>{isAdmin ? 'Administrator Dashboard' : 'Pharmacy Staff Dashboard'}</h1></div>
          <p className="muted">Live overview · updates every 30 seconds</p>
          <People residents={c.residents} staff={c.staff ?? 0} links={isAdmin} />
        </div>
        <div className="actions">
          <Link className="btn" to="/dispense">Dispense medicine</Link>
          {isAdmin && <Link className="btn btn-outline" to="/forecasting">Demand forecast</Link>}
        </div>
      </header>

      <ExpiryBanner alerts={data.alerts} />

      <RequestsPanel c={c} today={today} />
      <StockOverview c={c} />

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
        <Card title="Stock alerts" actions={<Link to="/medicines">Open Medicine List</Link>}>
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

/** People overview, inside the dashboard header: registered residents and active pharmacy staff. */
function People({ residents, staff, links }: { residents: number; staff: number; links: boolean }) {
  const items = [
    { to: '/users?role=resident', icon: ICON.users, text: `${residents.toLocaleString('en-PH')} registered ${plural(residents, 'resident')}` },
    { to: '/users?role=staff', icon: ICON.staff, text: `${staff} active pharmacy staff` },
  ];
  return (
    <p className="db-people">
      {items.map((p) => (links
        ? <Link key={p.to} to={p.to} className="db-person"><Svg d={p.icon} size={16} /> {p.text}</Link>
        : <span key={p.to} className="db-person"><Svg d={p.icon} size={16} /> {p.text}</span>))}
    </p>
  );
}

/** Requests & Dispensing: one summary panel with four sections (tap a section to open it). */
function RequestsPanel({ c, today }: { c: Record<string, number>; today: string }) {
  const items = [
    { to: '/requests?type=medicine&status=pending', icon: ICON.review, value: c.pending_requests, label: 'Pending requests',
      hint: c.pending_requests ? 'Waiting for review' : 'All reviewed', alert: c.pending_requests > 0 },
    { to: '/requests?type=medicine&status=approved', icon: ICONS.check, value: c.approved_to_dispense, label: 'Ready for pickup',
      hint: c.approved_to_dispense ? 'Waiting to be claimed' : 'None waiting', alert: false },
    { to: `/dispensing?from=${today}&to=${today}`, icon: ICONS.hand, value: c.dispensed_today, label: 'Dispensed today',
      hint: `${plural(c.dispensed_today, 'release')} today`, alert: false },
    { to: '/requests?type=restock&status=pending', icon: ICON.restock, value: c.pending_restock, label: 'Pending restock',
      hint: c.pending_restock ? 'Needs admin review' : 'None waiting', alert: c.pending_restock > 0 },
  ];
  return (
    <section className="card db-panel" aria-labelledby="db-req-title">
      <div className="db-panel-head">
        <h2 id="db-req-title">Requests &amp; Dispensing</h2>
        <Link to="/requests" className="db-more">All requests <Svg d={ICONS.chevron} size={16} /></Link>
      </div>
      <div className="db-req">
        {items.map((m) => (
          <Link key={m.label} to={m.to} className={`db-req-item ${m.alert ? 'is-alert' : ''}`}>
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
function StockOverview({ c }: { c: Record<string, number> }) {
  const unrecorded = c.unrecorded ?? 0;
  const available = Math.max(0, c.medicines - c.low_stock - c.out_of_stock - unrecorded);
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
        <h2 id="db-stock-title">Medicine Stock Overview</h2>
        <Link to="/medicines" className="db-more">Medicine List <Svg d={ICONS.chevron} size={16} /></Link>
      </div>
      <div className="db-stock">
        <div className="db-stock-main">
          <Link to="/medicines" className="db-total">
            <strong>{c.medicines}</strong>
            <span>All medicines</span>
          </Link>
          {c.medicines > 0 && (
            <div className="db-bar" role="img" aria-label={`Stock status of ${c.medicines} medicines: ${summary}`}>
              {segments.filter((s) => s.value > 0).map((s) => (
                <Link key={s.key} to={s.to} className={`db-seg tone-${s.key}`} style={{ flexGrow: s.value }}
                  title={`${s.label}: ${s.value} ${plural(s.value, 'medicine')} (${pct(s.value)}%)`} aria-hidden="true" tabIndex={-1} />
              ))}
            </div>
          )}
          <ul className="db-legend">
            {segments.map((s) => (
              <li key={s.key}>
                <Link to={s.to} className={`db-legend-item tone-${s.key}`}>
                  <span className="db-swatch" aria-hidden="true"><Svg d={s.icon} size={13} width={2.6} /></span>
                  <span className="db-legend-label">{s.label}</span>
                  <strong>{s.value}</strong>
                  <span className="db-legend-pct">{pct(s.value)}%</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="db-expiry">
          <h3>Batch expiry</h3>
          <Link to="/inventory?expiry=near_expiry" className={`db-exp-row tone-low ${c.near_expiry ? 'is-alert' : ''}`}>
            <span className="db-exp-icon"><Svg d={ICONS.clock} size={20} /></span>
            <span className="db-exp-text"><span>Expiring in 1 month</span><small>{c.near_expiry ? 'Dispense these first' : 'Nothing expiring soon'}</small></span>
            <strong>{c.near_expiry}</strong>
          </Link>
          <Link to="/inventory?expiry=expired" className={`db-exp-row tone-out ${c.expired ? 'is-alert' : ''}`}>
            <span className="db-exp-icon"><Svg d={ICONS.x} size={20} /></span>
            <span className="db-exp-text"><span>Expired batches</span><small>{c.expired ? 'Remove from stock' : 'No expired stock'}</small></span>
            <strong>{c.expired}</strong>
          </Link>
        </div>
      </div>
    </section>
  );
}
