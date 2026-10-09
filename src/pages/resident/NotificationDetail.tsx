import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { formatDate, notificationsChanged } from '../../api';
import { useApi } from '../../hooks';
import { Loading, Message } from '../../components/ui';
import { cleanMessage, KIND, kindOf, titleOf, type Kind } from '../../components/Notifications';
import RequestTracker from '../../components/RequestTracker';
import { RequestSummaryCard } from '../../components/RequestDetailParts';
import { dateTime, ICONS, Svg } from '../../components/RequestCards';
import type { MedicineRequest, SmsNotification } from '../../types';

interface Detail { notification: SmsNotification; request: MedicineRequest | null }

const HERO: Record<Kind, { title: string; text: string; tag: string }> = {
  submitted: { title: 'Request Submitted', text: 'Your request has been received and is now under review.', tag: 'Under review' },
  approved: { title: 'Request Approved!', text: 'Your medicine request has been approved and is ready for pickup.', tag: 'Ready for pickup' },
  reminder: { title: 'Pickup Deadline Reminder', text: 'Please claim your medicines before the pickup deadline.', tag: 'Reminder' },
  expired: { title: 'Request Expired', text: 'The pickup deadline passed without collection, so this request can no longer be claimed.', tag: 'Expired' },
  closure: { title: 'Temporary Pharmacy Closure', text: 'An important notice from Botika ng Bayan Bulan.', tag: 'Pharmacy closure' },
  hours: { title: 'Operating Hours Changed', text: 'Botika ng Bayan Bulan has changed its operating schedule.', tag: 'Operating hours' },
  distribution: { title: 'Medicine Distribution', text: 'Information about medicine distribution activities.', tag: 'Distribution' },
  available: { title: 'Medicine Back in Stock!', text: 'The medicine you asked for is now in stock at Botika ng Bayan.', tag: 'Available' },
  dispensed: { title: 'Request Completed!', text: 'Your medicine has been successfully dispensed. Thank you for using BulanBotikaCare!', tag: 'Dispensed / Completed' },
  rejected: { title: 'Request Rejected', text: 'Unfortunately, your medicine request was not approved by the pharmacy staff.', tag: 'Rejected' },
  cancelled: { title: 'Request Cancelled', text: 'This medicine request has been cancelled and is no longer active.', tag: 'Cancelled' },
  announcement: { title: 'Announcement', text: 'A message from Botika ng Bayan Bulan.', tag: 'Announcement' },
};

/** Box with the key information for this kind of notification. */
function InfoBox({ kind, r }: { kind: Kind; r: MedicineRequest }) {
  if (kind === 'rejected' && r.status === 'rejected') {
    return (
      <div className="info-box info-danger">
        <strong><Svg d={ICONS.info} size={18} /> Reason for Rejection</strong>
        <p>{r.remarks || 'No reason was given.'}</p>
        {r.reviewer && <small>Reviewed by: {r.reviewer.name}</small>}
      </div>
    );
  }
  if (r.status === 'cancelled') {
    return (
      <div className="info-box info-warn">
        <strong><Svg d={ICONS.info} size={18} /> Cancellation Information</strong>
        <p>Cancelled by: {r.cancelled_by ? 'You (resident)' : '—'}</p>
        {r.cancelled_at && <small>Cancellation date: {dateTime(r.cancelled_at)}</small>}
      </div>
    );
  }
  if (r.status === 'expired') {
    return (
      <div className="info-box info-danger">
        <strong><Svg d={ICONS.clock} size={18} /> Expiration Details</strong>
        <p>The medicines were not claimed before the pickup deadline, so the request expired and the medicines were returned to the stock.</p>
        {r.cancelled_at && <small>Expired on: {dateTime(r.cancelled_at)}</small>}
      </div>
    );
  }
  if (r.status === 'approved' && r.request_type === 'medicine') {
    return (
      <div className="info-box info-ok">
        <strong><Svg d={ICONS.calendar} size={18} /> Pickup Schedule</strong>
        <p><Svg d={ICONS.pin} size={16} /> Botika ng Bayan, Bulan, Sorsogon</p>
        <p><Svg d={ICONS.clock} size={16} /> Claim on or before <b>{formatDate(r.claim_by)}</b></p>
        <small>Bring your QR code / Patient ID ({r.resident?.qr_code}) for verification.</small>
      </div>
    );
  }
  if (r.status === 'dispensed') {
    return (
      <div className="info-box info-ok">
        <strong><Svg d={ICONS.check} size={18} /> Successfully Completed</strong>
        <p>Released on {dateTime(r.dispensing?.dispensed_at ?? r.request_date)}. This request is now part of your medicine history.</p>
      </div>
    );
  }
  return null;
}

/** "What can you do?" tips for the resident. */
function tip(kind: Kind, r: MedicineRequest | null): string | null {
  if (!r) return null;
  if (r.status === 'approved' && r.request_type === 'medicine') return 'Visit Botika ng Bayan before the deadline and show your QR code (My Profile). If you no longer need the medicines, cancel the request so others can use them.';
  if (r.status === 'expired') return 'Check medicine availability again and submit a new request if you still need the medicine. Next time, claim your medicines before the deadline.';
  if (kind === 'rejected' || kind === 'cancelled') return 'You may check medicine availability again and submit a new request anytime. If the medicine is out of stock, you can submit a restock request.';
  if (r.status === 'fulfilled') return 'The medicine is now available. Submit a medicine request to get it.';
  return null;
}

/** Resident: details of one notification (opened from the bell, the dashboard or the Notifications page). */
export default function NotificationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, error, loading } = useApi<Detail>(`/notifications/${id}`);

  // Opening the notification marks it as read: update the bell count.
  useEffect(() => { if (data) notificationsChanged(); }, [data]);

  if (loading && !data) return <Loading />;
  if (!data) return <Message>{error}</Message>;

  const { notification: n, request: r } = data;
  const kind = kindOf(n);
  const hero = kind === 'approved' && r?.request_type === 'restock'
    ? { title: 'Restock Request Approved', text: 'You will get an SMS as soon as the medicine arrives.', tag: 'Waiting for stock' }
    : HERO[kind];
  const advice = tip(kind, r);

  return (
    <div className="page page-narrow">
      <header className="detail-topbar">
        <button className="icon-btn" onClick={() => navigate(-1)} aria-label="Back"><Svg d={ICONS.back} size={22} /></button>
        <h1>Notification Details</h1>
      </header>

      <section className="hero card">
        <span className={`hero-icon kind-soft-${kind}`}><Svg d={KIND[kind].icon} size={34} width={2} /></span>
        <h2>{hero.title || titleOf(n)}</h2>
        <p className="muted">{hero.text}</p>
        <span className={`pill pill-kind-${kind}`}>{hero.tag}</span>
        <small className="muted">{dateTime(n.sent_at)}</small>
      </section>

      <section className="card sms-card">
        <small className="muted">Message sent to you (SMS)</small>
        <p>{cleanMessage(n.message)}</p>
      </section>

      {r && <>
        <section>
          <h2 className="section-title">Request Details</h2>
          <RequestSummaryCard r={r} />
        </section>
        <InfoBox kind={kind} r={r} />
        <section>
          <h2 className="section-title">Request Progress</h2>
          <div className="card"><RequestTracker request={r} forResident /></div>
        </section>
      </>}

      {advice && (
        <div className="info-box info-tip">
          <strong><Svg d={ICONS.bulb} size={18} /> What can you do?</strong>
          <p>{advice}</p>
        </div>
      )}

      <div className="detail-actions">
        {r?.status === 'fulfilled' && <Link className="btn btn-block" to="/medicines">Request this medicine</Link>}
        {r && <Link className="btn btn-outline btn-block" to={`/requests/${r.request_id}`}>Open request #{r.request_id}</Link>}
        <Link className="btn btn-outline btn-block" to={r ? '/requests' : '/notifications'}>
          <Svg d={ICONS.back} size={18} /> Back to {r ? 'My Requests' : 'Notifications'}
        </Link>
      </div>
    </div>
  );
}
