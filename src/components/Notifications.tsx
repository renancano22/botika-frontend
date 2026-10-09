import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api, NOTIFICATIONS_CHANGED, notificationsChanged } from '../api';
import { ICONS, Svg } from './RequestCards';
import type { SmsNotification } from '../types';

const BELL = 'M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4';

export function BellIcon({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={BELL} />
    </svg>
  );
}

/** Marks one notification as read and tells the bell to update its count. */
export async function markRead(n: SmsNotification): Promise<SmsNotification> {
  if (n.read_at) return n;
  const res = await api.post<SmsNotification>(`/notifications/${n.notification_id}/read`);
  notificationsChanged();
  return res.data;
}

export async function markAllRead(): Promise<void> {
  await api.post('/notifications/read-all');
  notificationsChanged();
}

/** Where a notification leads: request updates open that request; announcements open the notifications list. */
function target(n: SmsNotification, compact: boolean): string | null {
  if (n.request_id) return `/requests/${n.request_id}`;
  return compact ? '/notifications' : null;
}

type Kind = 'approved' | 'rejected' | 'dispensed' | 'cancelled' | 'available' | 'announcement';

/** Older notifications have no type saved, so it is worked out from the message. */
function kindOf(n: SmsNotification): Kind {
  if (n.type) return n.type as Kind;
  const m = n.message.toLowerCase();
  if (!n.request_id) return 'announcement';
  if (m.includes('not approved')) return 'rejected';
  if (m.includes('approved')) return 'approved';
  if (m.includes('dispensed')) return 'dispensed';
  if (m.includes('cancelled')) return 'cancelled';
  if (m.includes('available')) return 'available';
  return 'announcement';
}

const KIND_ICON: Record<Kind, string> = {
  approved: ICONS.check,
  rejected: ICONS.x,
  dispensed: ICONS.hand,
  cancelled: ICONS.x,
  available: ICONS.box,
  announcement: ICONS.megaphone,
};

function dateTime(value: string): string {
  const d = new Date(value);
  return `${d.toLocaleDateString('en-PH', { dateStyle: 'medium' })} • ${d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}`;
}

/**
 * One notification card: a coloured icon for its kind, the message, the date and an arrow.
 * Unread ones are white with bold text and a dot; read ones are greyed out.
 * Tapping it marks it as read and opens what it is about (e.g. the approved request).
 */
export function NotificationItem({ n, onRead, compact = false }: {
  n: SmsNotification; onRead: (n: SmsNotification) => void; compact?: boolean;
}) {
  const navigate = useNavigate();
  const unread = !n.read_at;
  const goTo = target(n, compact);
  const kind = kindOf(n);
  const read = async () => { if (unread) onRead(await markRead(n)); };
  const open = async () => {
    try { await read(); } catch { /* still open it */ }
    if (goTo) navigate(goTo);
  };

  return (
    <li className={`notif ${unread ? 'notif-unread' : 'notif-read'}`}>
      <button type="button" className={`notif-body ${goTo ? 'notif-link' : ''}`} onClick={open}
        aria-label={goTo ? 'Open notification' : unread ? 'Mark as read' : undefined}>
        <span className={`notif-icon kind-${kind}`} aria-hidden="true"><Svg d={KIND_ICON[kind]} size={20} width={2.2} /></span>
        <span className="notif-text">
          <span className="notif-message">{n.message.replace(/^BulanBotikaCare:\s*/, '')}</span>
          <span className="notif-meta">{dateTime(n.sent_at)}</span>
          {unread && !compact && !goTo && (
            <span className="notif-mark">Tap to mark as read</span>
          )}
        </span>
        {unread && <span className="notif-dot" aria-label="Unread" />}
        {goTo && <span className="notif-arrow" aria-hidden="true"><Svg d={ICONS.chevron} size={18} /></span>}
      </button>
    </li>
  );
}

/** Keeps the number of unread notifications up to date (every 30 seconds and after changes). */
export function useUnreadCount() {
  const [count, setCount] = useState(0);
  const load = useCallback(async () => {
    try {
      const res = await api.get<{ unread: number }>('/notifications/unread-count');
      setCount(res.data.unread);
    } catch { /* keep the last count */ }
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(load, 30000);
    window.addEventListener(NOTIFICATIONS_CHANGED, load);
    return () => {
      window.clearInterval(id);
      window.removeEventListener(NOTIFICATIONS_CHANGED, load);
    };
  }, [load]);

  return count;
}

/** Bell button in the top bar with a red unread badge; it opens a small list of the latest notifications. */
export function NotificationBell() {
  const unread = useUnreadCount();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<SmsNotification[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();

  useEffect(() => { setOpen(false); }, [location.pathname, location.search]);

  useEffect(() => {
    if (!open) return;
    api.get<SmsNotification[]>('/notifications').then((res) => setItems(res.data.slice(0, 8))).catch(() => setItems([]));
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
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

  const replace = (n: SmsNotification) => setItems((list) => list?.map((x) => (x.notification_id === n.notification_id ? n : x)) ?? null);
  const readAll = async () => {
    await markAllRead();
    const now = new Date().toISOString();
    setItems((list) => list?.map((x) => ({ ...x, read_at: x.read_at ?? now })) ?? null);
  };

  return (
    <div className="bell" ref={ref}>
      <button
        type="button"
        className="topbar-icon"
        onClick={() => setOpen(!open)}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
      >
        <BellIcon />
        {unread > 0 && <span className="bell-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>

      {open && (
        <div className="bell-panel" role="dialog" aria-label="Notifications">
          <div className="bell-head">
            <strong>Notifications</strong>
            {unread > 0 && <button type="button" className="link-button" onClick={readAll}>Mark all as read</button>}
          </div>
          {items === null ? <p className="empty">Loading…</p> : items.length === 0 ? <p className="empty">No notifications yet.</p> : (
            <ul className="notif-list">
              {items.map((n) => <NotificationItem key={n.notification_id} n={n} onRead={replace} compact />)}
            </ul>
          )}
          <Link to="/notifications" className="bell-all">See all notifications</Link>
        </div>
      )}
    </div>
  );
}
