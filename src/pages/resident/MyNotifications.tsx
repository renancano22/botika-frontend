import { useState } from 'react';
import { useApi } from '../../hooks';
import { Card, Empty, Loading, Message } from '../../components/ui';
import { markAllRead, NotificationItem } from '../../components/Notifications';
import type { SmsNotification } from '../../types';

/**
 * Resident notifications: every SMS sent to them (request updates and the administrator's
 * announcements) is kept here as history. Unread ones are highlighted.
 */
export default function MyNotifications() {
  const { data, error, loading, setData } = useApi<SmsNotification[]>('/notifications', undefined, 30000);
  const [tab, setTab] = useState<'all' | 'unread'>('all');

  const unread = data?.filter((n) => !n.read_at).length ?? 0;
  const shown = tab === 'unread' ? data?.filter((n) => !n.read_at) : data;

  const replace = (n: SmsNotification) => setData((list) => list?.map((x) => (x.notification_id === n.notification_id ? n : x)) ?? null);
  const readAll = async () => {
    await markAllRead();
    const now = new Date().toISOString();
    setData((list) => list?.map((x) => ({ ...x, read_at: x.read_at ?? now })) ?? null);
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Notifications</h1>
          <p className="muted">Text messages (SMS) sent to you by Botika ng Bayan are also kept here.</p>
        </div>
        {unread > 0 && <button className="btn btn-outline" onClick={readAll}>Mark all as read</button>}
      </header>
      <Message>{error}</Message>
      <Card>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'all'} className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>All</button>
          <button role="tab" aria-selected={tab === 'unread'} className={tab === 'unread' ? 'active' : ''} onClick={() => setTab('unread')}>
            Unread{unread > 0 && <span className="tab-count">{unread}</span>}
          </button>
        </div>
        {loading && !data ? <Loading /> : !shown?.length ? (
          <Empty>{tab === 'unread' ? 'You have read all your notifications.' : 'No notifications yet.'}</Empty>
        ) : (
          <ul className="notif-list">
            {shown.map((n) => <NotificationItem key={n.notification_id} n={n} onRead={replace} />)}
          </ul>
        )}
      </Card>
    </div>
  );
}
