import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api, NOTIFICATIONS_CHANGED, notificationsChanged, timeAgo } from '../api';
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

export type Kind = 'submitted' | 'approved' | 'reminder' | 'rejected' | 'dispensed' | 'cancelled' | 'expired' | 'available'
  | 'announcement' | 'closure' | 'hours' | 'distribution';

/** Older notifications have no type saved, so it is worked out from the message. */
export function kindOf(n: SmsNotification): Kind {
  if (n.type) return n.type as Kind;
  const m = n.message.toLowerCase();
  if (!n.request_id) return 'announcement';
  if (m.includes('submitted')) return 'submitted';
  if (m.includes('reminder')) return 'reminder';
  if (m.includes('expired') || m.includes('not claimed')) return 'expired';
  if (m.includes('not approved')) return 'rejected';
  if (m.includes('approved')) return 'approved';
  if (m.includes('dispensed')) return 'dispensed';
  if (m.includes('cancelled')) return 'cancelled';
  if (m.includes('available')) return 'available';
  return 'announcement';
}

/** Title and icon for each kind of notification. */
export const KIND: Record<Kind, { title: string; icon: string }> = {
  submitted: { title: 'Request Submitted', icon: ICONS.note },
  approved: { title: 'Approved — Ready for Pickup', icon: ICONS.check },
  reminder: { title: 'Pickup Deadline Reminder', icon: ICONS.clock },
  available: { title: 'Requested Medicine Is Back in Stock', icon: ICONS.box },
  dispensed: { title: 'Request Completed', icon: ICONS.hand },
  rejected: { title: 'Request Rejected', icon: ICONS.x },
  cancelled: { title: 'Request Cancelled', icon: ICONS.ban },
  expired: { title: 'Request Expired', icon: ICONS.clock },
  announcement: { title: 'Announcement', icon: ICONS.megaphone },
  closure: { title: 'Temporary Pharmacy Closure', icon: ICONS.ban },
  hours: { title: 'Operating Hours Changed', icon: ICONS.clock },
  distribution: { title: 'Medicine Distribution', icon: ICONS.megaphone },
};

/** Title shown on the card (a restock approval is not ready for pickup yet). */
export function titleOf(n: SmsNotification): string {
  const kind = kindOf(n);
  if (kind === 'approved' && /restock/i.test(n.message)) return 'Restock Request Approved';
  return KIND[kind].title;
}

/** Removes the "BulanBotikaCare:" / "BulanBotikaCare (Pharmacy Closure):" prefix used in SMS. */
export function cleanMessage(message: string): string {
  return message.replace(/^BulanBotikaCare(\s*\([^)]*\))?:\s*/, '');
}

/**
 * One notification card: coloured icon, title, message, time and "View details".
 * Unread ones are tinted with a dot; read ones are greyed out.
 * Tapping opens the notification details (and marks it as read).
 */
export function NotificationItem({ n, compact = false }: { n: SmsNotification; compact?: boolean }) {
  const navigate = useNavigate();
  const unread = !n.read_at;
  const kind = kindOf(n);

  return (
    <li className={`notif k-${kind} ${unread ? 'notif-unread' : 'notif-read'}`}>
      <button type="button" className="notif-body notif-link" onClick={() => navigate(`/notifications/${n.notification_id}`)}>
        <span className="notif-icon kicon" aria-hidden="true"><Svg d={KIND[kind].icon} size={20} width={2.2} /></span>
        <span className="notif-text">
          <span className="notif-title">{titleOf(n)}{unread && <span className="notif-dot" aria-label="Unread" />}</span>
          <span className="notif-message">{cleanMessage(n.message)}</span>
          <span className="notif-meta">{timeAgo(n.sent_at)}</span>
          {!compact && <span className="notif-view">View details →</span>}
        </span>
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
              {items.map((n) => <NotificationItem key={n.notification_id} n={n} compact />)}
            </ul>
          )}
          <Link to="/notifications" className="bell-all">See all notifications</Link>
        </div>
      )}
    </div>
  );
}
