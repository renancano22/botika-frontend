import { Link } from 'react-router-dom';
import { useApi } from '../../hooks';
import { Card, Empty, Loading, Message } from '../../components/ui';
import { NotificationItem } from '../../components/Notifications';
import { ICONS, RequestRow, Svg } from '../../components/RequestCards';
import ActivityTile from '../../components/ActivityTile';
import type { MedicineRequest, MonthlyUsage, Resident, SmsNotification } from '../../types';

interface ResidentDash {
  resident: Resident;
  counts: { pending: number; approved: number; dispensed: number; available_medicines: number };
  recent_requests: MedicineRequest[];
  recent_notifications: SmsNotification[];
  monthly?: MonthlyUsage;
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

      <section className="card act-card">
        <h2>My activity</h2>
        <div className="act-grid">
          <ActivityTile to="/requests?status=review" k="review" value={counts.pending} unit={counts.pending === 1 ? 'request' : 'requests'} label="Under review" />
          <ActivityTile to="/requests?status=claim" k="ready" value={counts.approved} unit={counts.approved === 1 ? 'request' : 'requests'} label="Ready to claim"
            hint={counts.approved ? 'Bring your QR code' : undefined} />
          <ActivityTile to="/requests?status=claimed" k="completed" value={counts.dispensed} unit={counts.dispensed === 1 ? 'request' : 'requests'} label="Claimed" />
          <ActivityTile to="/medicines?availability=in_stock" k="available" value={counts.available_medicines} unit="medicines" label="Available now" />
          {data.monthly && (
            <ActivityTile to="/medicines" k="submitted" value={data.monthly.remaining} unit={`of ${data.monthly.limit} medicines`} label="Left this month" />
          )}
          <Link to="/requests" className="act-tile act-more">
            <span className="act-more-icon"><Svg d={ICONS.chevron} size={18} width={2.4} /></span>
            <span>View all requests</span>
          </Link>
        </div>
      </section>

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
