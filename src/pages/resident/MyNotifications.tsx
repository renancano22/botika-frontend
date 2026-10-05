import { formatDate } from '../../api';
import { useApi } from '../../hooks';
import { Card, Empty, Loading, Message } from '../../components/ui';
import type { SmsNotification } from '../../types';

export default function MyNotifications() {
  const { data, error, loading } = useApi<SmsNotification[]>('/notifications', undefined, 30000);

  return (
    <div className="page">
      <header className="page-head"><h1>Notifications</h1></header>
      <Message>{error}</Message>
      <Card>
        {loading && !data ? <Loading /> : !data?.length ? <Empty>No notifications yet.</Empty> : (
          <ul className="list">
            {data.map((n) => (
              <li key={n.notification_id}>
                <p>{n.message}</p>
                <small className="muted">SMS · {formatDate(n.sent_at, true)}</small>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
