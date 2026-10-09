import { Link } from 'react-router-dom';
import { useApi } from '../../hooks';
import { Card, Empty, Loading, Message, StatCard } from '../../components/ui';
import { NotificationItem } from '../../components/Notifications';
import { RequestRow } from '../../components/RequestCards';
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
      <header className="page-head hero-head">
        <div>
          <h1>Hello, {resident.name.split(' ')[0]}!</h1>
          <p className="muted">Check medicines, send requests and follow their status here.</p>
        </div>
        <Link className="btn" to="/medicines">Check medicines</Link>
      </header>

      <div className="stats">
        <StatCard label="Pending requests" value={counts.pending} tone={counts.pending ? 'warn' : 'default'} />
        <StatCard label="Approved — ready to claim" value={counts.approved} tone={counts.approved ? 'ok' : 'default'}
          hint={counts.approved ? 'Bring your QR code (My Profile)' : undefined} />
        <StatCard label="Claimed requests" value={counts.dispensed} />
        <StatCard label="Medicines available now" value={counts.available_medicines} />
      </div>

      <div className="grid-2">
        <Card title="My recent requests" actions={<Link to="/requests">See all</Link>}>
          {data.recent_requests.length === 0 ? <Empty>No requests yet.</Empty> : (
            <div className="req-rows">
              {data.recent_requests.map((r) => <RequestRow key={r.request_id} request={r} />)}
            </div>
          )}
        </Card>
        <Card title="Latest notifications" actions={<Link to="/notifications">See all</Link>}>
          {data.recent_notifications.length === 0 ? <Empty>No notifications yet.</Empty> : (
            <ul className="notif-list">
              {data.recent_notifications.map((n) => <NotificationItem key={n.notification_id} n={n} compact />)}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
