import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, describeError, timeAgo, type ErrorInfo } from '../api';
import { BellIcon } from './Notifications';
import { ICONS, Svg } from './RequestCards';
import { LoadError, toast } from './feedback';
import type { StaffNotification } from '../types';

/** Icon and colour for each kind of staff notification. */
const KIND: Record<string, { icon: string; tone: string }> = {
  new_request: { icon: ICONS.pill, tone: 'review' },
  new_restock: { icon: ICONS.box, tone: 'submitted' },
  request_cancelled: { icon: ICONS.ban, tone: 'cancelled' },
};

/**
 * Administrator / pharmacy staff: notifications (the bell) about residents' requests: a new medicine request to
 * review, a new restock request (administrator), a request cancelled by the resident. These are not the expiry
 * alerts (warning triangle), which are about stock problems.
 */
export function StaffNotificationBell() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<StaffNotification[] | null>(null);
  const [failed, setFailed] = useState<ErrorInfo | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();

  const loadCount = useCallback(async () => {
    try { setUnread((await api.get<{ unread: number }>('/staff-notifications/unread-count')).data.unread); } catch { /* keep the last count */ }
  }, []);
  useEffect(() => {
    loadCount();
    const id = window.setInterval(loadCount, 30000);
    return () => window.clearInterval(id);
  }, [loadCount]);

  useEffect(() => { setOpen(false); }, [location.pathname, location.search]);
  useEffect(() => {
    if (!open) return;
    setFailed(null);
    api.get<{ data: StaffNotification[]; unread: number }>('/staff-notifications')
      .then((res) => { setItems(res.data.data); setUnread(res.data.unread); })
      .catch((err) => setFailed(describeError(err)));
    const onDown = (e: MouseEvent | TouchEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  /** Opens the request it is about, and marks the notification as read. */
  const openItem = (n: StaffNotification) => {
    if (!n.read_at) {
      setItems((list) => list?.map((x) => (x.staff_notification_id === n.staff_notification_id ? { ...x, read_at: new Date().toISOString() } : x)) ?? null);
      setUnread((c) => Math.max(0, c - 1));
      api.post(`/staff-notifications/${n.staff_notification_id}/read`).catch(() => loadCount());
    }
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  const readAll = async () => {
    try {
      await api.post('/staff-notifications/read-all');
      const now = new Date().toISOString();
      setItems((list) => list?.map((x) => ({ ...x, read_at: x.read_at ?? now })) ?? null);
      setUnread(0);
    } catch (err) {
      toast.fromError(err, { title: 'Notifications were not marked as read', retry: readAll });
    }
  };

  return (
    <div className="bell" ref={ref}>
      <button type="button" className="topbar-icon" onClick={() => setOpen(!open)} aria-expanded={open}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} title="Notifications">
        <BellIcon />
        {unread > 0 && <span className="bell-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="bell-panel" role="dialog" aria-label="Notifications">
          <div className="bell-head">
            <strong>Notifications</strong>
            {unread > 0 && <button type="button" className="link-button" onClick={readAll}>Mark all as read</button>}
          </div>
          {failed ? <LoadError error={failed} compact /> : items === null ? <p className="empty">Loading…</p>
            : items.length === 0 ? <p className="empty">No notifications yet. New and cancelled requests from residents appear here.</p> : (
              <ul className="snotif-list">
                {items.map((n) => {
                  const kind = KIND[n.type] ?? KIND.new_request;
                  return (
                    <li key={n.staff_notification_id}>
                      <button type="button" className={`snotif k-${kind.tone} ${n.read_at ? 'is-read' : 'is-unread'}`} onClick={() => openItem(n)}>
                        <span className="snotif-icon"><Svg d={kind.icon} size={18} /></span>
                        <span className="snotif-text">
                          <strong>{n.title}</strong>
                          <span>{n.message}</span>
                          <small>{timeAgo(n.created_at)}</small>
                        </span>
                        {!n.read_at && <span className="snotif-dot" aria-label="Unread" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
        </div>
      )}
    </div>
  );
}
