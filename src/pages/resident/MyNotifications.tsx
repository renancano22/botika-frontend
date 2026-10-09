import { useState } from 'react';
import { useApi } from '../../hooks';
import { Empty, Loading, Message } from '../../components/ui';
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

  const readAll = async () => {
    await markAllRead();
    const now = new Date().toISOString();
    setData((list) => list?.map((x) => ({ ...x, read_at: x.read_at ?? now })) ?? null);
  };

  return (
    <div className="page page-narrow">
      <header className="page-head hero-head">
        <div>
          <h1>Notifications</h1>
          <p className="muted">Stay updated on your medicine requests. SMS messages sent to you are also kept here.</p>
        </div>
      </header>
      <Message>{error}</Message>

      <div className="section-head">
        <h2 className="section-title">Recent Notifications</h2>
        {unread > 0 && <button className="link-button" onClick={readAll}>Mark all as read</button>}
      </div>
      <div className="chips" role="tablist">
        <button role="tab" aria-selected={tab === 'all'} className={`chip ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>
          All <span className="chip-count">{data?.length ?? 0}</span>
        </button>
        <button role="tab" aria-selected={tab === 'unread'} className={`chip ${tab === 'unread' ? 'active' : ''}`} onClick={() => setTab('unread')}>
          Unread <span className="chip-count">{unread}</span>
        </button>
      </div>

      {loading && !data ? <Loading /> : !shown?.length ? (
        <div className="card"><Empty>{tab === 'unread' ? 'You have read all your notifications.' : 'No notifications yet.'}</Empty></div>
      ) : (
        <ul className="notif-list">
          {shown.map((n) => <NotificationItem key={n.notification_id} n={n} />)}
        </ul>
      )}
    </div>
  );
}
