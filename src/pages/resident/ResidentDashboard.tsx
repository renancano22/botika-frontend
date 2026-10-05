import { QRCodeSVG } from 'qrcode.react';
import { Link } from 'react-router-dom';
import { formatDate } from '../../api';
import { useApi } from '../../hooks';
import { Badge, Card, Empty, Loading, Message, StatCard } from '../../components/ui';
import type { MedicineRequest, Resident, SmsNotification } from '../../types';

interface ResidentDash {
  resident: Resident;
  counts: { pending: number; approved: number; dispensed: number; available_medicines: number };
  recent_requests: MedicineRequest[];
  recent_notifications: SmsNotification[];
}

export default function ResidentDashboard() {
  const { data, error, loading } = useApi<ResidentDash>('/dashboard', undefined, 30000);

  if (loading && !data) return <Loading />;
  if (!data) return <Message>{error}</Message>;
  const { resident, counts } = data;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Hello, {resident.name.split(' ')[0]}!</h1>
          <p className="muted">Check medicines, send requests and follow their status here.</p>
        </div>
        <Link className="btn" to="/medicines">Check medicines</Link>
      </header>

      <div className="grid-2 grid-qr">
        <Card title="My QR code / Patient ID">
          <div className="qr-card">
            <QRCodeSVG value={resident.qr_code} size={160} marginSize={2} />
            <div>
              <div className="patient-id">{resident.qr_code}</div>
              <p className="muted">Show this QR code at Botika ng Bayan when you claim your medicines.</p>
              <p className="muted small">{resident.address} · {resident.contact_no}</p>
              <button className="btn btn-outline" onClick={() => window.print()}>Print</button>
            </div>
          </div>
        </Card>
        <div className="stats stats-2">
          <StatCard label="Pending requests" value={counts.pending} tone={counts.pending ? 'warn' : 'default'} />
          <StatCard label="Approved — ready to claim" value={counts.approved} tone={counts.approved ? 'ok' : 'default'} />
          <StatCard label="Claimed requests" value={counts.dispensed} />
          <StatCard label="Medicines available now" value={counts.available_medicines} />
        </div>
      </div>

      <div className="grid-2">
        <Card title="My recent requests" actions={<Link to="/requests">See all</Link>}>
          {data.recent_requests.length === 0 ? <Empty>No requests yet.</Empty> : (
            <table>
              <thead><tr><th>#</th><th>Medicines</th><th>Type</th><th>Status</th></tr></thead>
              <tbody>
                {data.recent_requests.map((r) => (
                  <tr key={r.request_id}>
                    <td>{r.request_id}</td>
                    <td>{r.items.map((i) => `${i.medicine.medicine_name} ×${i.quantity}`).join(', ')}</td>
                    <td><Badge value={r.request_type} /></td>
                    <td><Badge value={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card title="Latest notifications" actions={<Link to="/notifications">See all</Link>}>
          {data.recent_notifications.length === 0 ? <Empty>No notifications yet.</Empty> : (
            <ul className="list">
              {data.recent_notifications.map((n) => (
                <li key={n.notification_id}>
                  <p>{n.message}</p>
                  <small className="muted">{formatDate(n.sent_at, true)}</small>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
