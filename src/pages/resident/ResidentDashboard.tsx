import { Link } from 'react-router-dom';
import { useApi } from '../../hooks';
import { Empty, Loading } from '../../components/ui';
import { NotificationItem } from '../../components/Notifications';
import { ICONS, RequestRow, Svg } from '../../components/RequestCards';
import type { MedicineRequest, Resident, SmsNotification } from '../../types';
import { LoadError } from '../../components/feedback';

interface ResidentDash {
  resident: Resident;
  counts: { pending: number; approved: number; dispensed: number; available_medicines: number };
  recent_requests: MedicineRequest[];
  recent_notifications: SmsNotification[];
}

const REVIEW_ICON = 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 14l2 2 4-4';
const QR_ICON = 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM18 14h2M14 18h2';

/** Resident dashboard: the same layout as the administrator / staff dashboard (green header + summary panels). */
export default function ResidentDashboard() {
  const { data, errorInfo, loading, reload } = useApi<ResidentDash>('/dashboard', undefined, 30000);

  if (loading && !data) return <Loading />;
  if (!data) return <div className="page"><LoadError error={errorInfo} onRetry={() => reload()} /></div>;
  const { resident, counts } = data;

  const activity = [
    { to: '/requests?status=review', tone: 'review', icon: REVIEW_ICON, value: counts.pending, label: 'Under review',
      hint: counts.pending ? 'Being checked by the pharmacy' : 'Nothing under review', alert: false },
    { to: '/requests?status=claim', tone: 'ready', icon: ICONS.check, value: counts.approved, label: 'Ready to claim',
      hint: counts.approved ? 'Bring your QR code' : 'Nothing to claim', alert: counts.approved > 0 },
    { to: '/requests?status=claimed', tone: 'completed', icon: ICONS.hand, value: counts.dispensed, label: 'Claimed',
      hint: 'Medicines received', alert: false },
    { to: '/medicines?availability=in_stock', tone: 'available', icon: ICONS.pill, value: counts.available_medicines, label: 'Available now',
      hint: 'Medicines in stock', alert: false },
  ];

  return (
    <div className="page">
      <header className="page-head hero-head db-hero">
        <div>
          <h1>Hello, {resident.name.split(' ')[0]}!</h1>
          <p className="muted">Check medicines, send requests and follow their status here.</p>
          <p className="db-people">
            <Link to="/profile" className="db-person"><Svg d={QR_ICON} size={16} /> Resident ID: {resident.qr_code}</Link>
          </p>
        </div>
        <div className="actions">
          <Link className="btn" to="/medicines">Check medicines</Link>
        </div>
      </header>

      <section className="card db-panel" aria-labelledby="rd-act-title">
        <div className="db-panel-head">
          <h2 id="rd-act-title">My activity</h2>
          <Link to="/requests" className="db-more">All requests <Svg d={ICONS.chevron} size={16} /></Link>
        </div>
        <div className="db-req">
          {activity.map((m) => (
            <Link key={m.label} to={m.to} className={`db-req-item t-${m.tone} ${m.alert ? 'is-alert' : ''}`}>
              <span className="db-req-label"><span className="db-req-icon"><Svg d={m.icon} size={18} /></span>{m.label}</span>
              <strong className="db-req-value">{m.value}</strong>
              <span className="db-req-hint">{m.alert && <span className="db-dot" aria-hidden="true" />}{m.hint}</span>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid-2">
        <section className="card db-panel" aria-labelledby="rd-req-title">
          <div className="db-panel-head">
            <h2 id="rd-req-title">My recent requests</h2>
            <Link to="/requests" className="db-more">See all <Svg d={ICONS.chevron} size={16} /></Link>
          </div>
          {data.recent_requests.length === 0 ? <Empty>No requests yet.</Empty> : (
            <div className="req-rows">
              {data.recent_requests.map((r) => <RequestRow key={r.request_id} request={r} />)}
            </div>
          )}
        </section>
        <section className="card db-panel" aria-labelledby="rd-notif-title">
          <div className="db-panel-head">
            <h2 id="rd-notif-title">Latest notifications</h2>
            <Link to="/notifications" className="db-more">See all <Svg d={ICONS.chevron} size={16} /></Link>
          </div>
          {data.recent_notifications.length === 0 ? <Empty>No notifications yet.</Empty> : (
            <ul className="notif-list">
              {data.recent_notifications.map((n) => <NotificationItem key={n.notification_id} n={n} compact />)}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
