import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { notificationsChanged } from '../../api';
import { useApi } from '../../hooks';
import BackButton from '../../components/BackButton';
import { Loading, Message } from '../../components/ui';
import { cleanMessage, KIND, kindOf, titleOf, type Kind } from '../../components/Notifications';
import RequestTracker, { pickupPeriod } from '../../components/RequestTracker';
import { PickupDeadlineBox, RequestSummaryCard } from '../../components/RequestDetailParts';
import { dateTime, ICONS, Svg } from '../../components/RequestCards';
import type { MedicineRequest, SmsNotification } from '../../types';

interface Detail { notification: SmsNotification; request: MedicineRequest | null }

const TAG: Record<Kind, string> = {
  submitted: 'Under review', approved: 'Ready for pickup', reminder: 'Pickup reminder', expired: 'Expired',
  closure: 'Pharmacy closure', hours: 'Operating hours', distribution: 'Distribution', available: 'Available',
  dispensed: 'Dispensed / Completed', rejected: 'Not approved', cancelled: 'Cancelled', announcement: 'Announcement',
};

/** Heading of the notification: what happened, using the request number and dates of this request. */
function heroOf(kind: Kind, n: SmsNotification, r: MedicineRequest | null): { title: string; text: string; tag: string } {
  const no = n.request_id ? ` No. ${n.request_id}` : '';
  const type = r?.request_type ?? 'medicine';
  const reviewer = type === 'restock' ? 'the administrator' : 'the pharmacy staff';
  const p = r ? pickupPeriod(r) : null;
  const tag = TAG[kind];
  switch (kind) {
    case 'submitted':
      return { title: 'Request Submitted', text: `Your ${type} request${no} was submitted successfully and is now waiting for review by ${reviewer}.`, tag };
    case 'approved':
      return type === 'restock'
        ? { title: 'Restock Request Approved', text: `Your restock request${no} was approved. You will be notified once the medicine is available at Botika ng Bayan.`, tag: 'Waiting for stock' }
        : { title: 'Request Approved!', text: `Your medicine request${no} was approved and is ready for pickup at Botika ng Bayan${p ? ` from ${p.pickup}` : ''}.`, tag };
    case 'reminder':
      return { title: 'Pickup Reminder', text: `Your medicine for request${no} is still waiting for you at Botika ng Bayan.${p ? ` Claim it on or before ${p.deadline}.` : ''}`, tag };
    case 'expired':
      return { title: 'Request Expired', text: `Request${no} was not claimed${p ? ` by ${p.deadline}` : ' before the pickup deadline'}, so it is no longer valid for pickup.`, tag };
    case 'dispensed':
      return { title: 'Request Completed!', text: `You received the medicine for request${no}. Thank you for using BulanBotikaCare!`, tag };
    case 'rejected':
      return { title: 'Request Not Approved', text: `Your ${type} request${no} was not approved by ${reviewer}.`, tag };
    case 'cancelled':
      return { title: 'Request Cancelled', text: `Your ${type} request${no} was cancelled${r?.cancelled_by ? ' by you' : ''} and is no longer active.`, tag };
    case 'available':
      return { title: 'Medicine Now Available!', text: `The medicine from your restock request${no} is now in stock at Botika ng Bayan.`, tag };
    case 'closure':
      return { title: 'Temporary Pharmacy Closure', text: 'An important notice from Botika ng Bayan Bulan.', tag };
    case 'hours':
      return { title: 'Operating Hours Changed', text: 'Botika ng Bayan Bulan has changed its operating schedule.', tag };
    case 'distribution':
      return { title: 'Medicine Distribution', text: 'Information about medicine distribution activities.', tag };
    default:
      return { title: 'Announcement', text: 'A message from Botika ng Bayan Bulan.', tag };
  }
}

/** Box with the key information for this kind of notification (dates, reason, who cancelled). */
function InfoBox({ kind, r }: { kind: Kind; r: MedicineRequest }) {
  if (r.status === 'rejected') {
    return (
      <div className="info-box info-danger">
        <strong><Svg d={ICONS.info} size={18} /> Reason for Not Approving</strong>
        <p>{r.remarks || 'No reason was recorded.'}</p>
        {r.reviewer && <small>Reviewed by: {r.reviewer.name}{r.reviewed_at ? ` · ${dateTime(r.reviewed_at)}` : ''}</small>}
      </div>
    );
  }
  if (r.status === 'cancelled') {
    return (
      <div className="info-box info-warn">
        <strong><Svg d={ICONS.info} size={18} /> Cancellation Information</strong>
        <p>Cancelled by: {r.cancelled_by ? 'You (resident)' : '—'}</p>
        {r.cancelled_at && <p>Cancelled on: {dateTime(r.cancelled_at)}</p>}
        {r.request_type === 'medicine' && r.reviewed_at && <small>The medicine set aside for you was returned to the stock.</small>}
      </div>
    );
  }
  if (r.status === 'expired') {
    const p = pickupPeriod(r);
    return (
      <div className="info-box info-danger">
        <strong><Svg d={ICONS.clock} size={18} /> Expiration Details</strong>
        {p && (
          <div className="pickup-dates">
            <div><span>Pickup date</span><b>{p.pickup}</b></div>
            <div className="pickup-deadline"><span>Claim deadline</span><b>{p.deadline}</b></div>
          </div>
        )}
        <p className="pickup-rule">The medicine was not claimed{p ? ` within ${p.days} days from the pickup date` : ' before the pickup deadline'}, so it will no longer be given and this request is no longer valid for pickup. The set-aside medicine was returned to the stock.</p>
      </div>
    );
  }
  if (r.status === 'approved' && r.request_type === 'medicine') {
    return <PickupDeadlineBox r={r} reminder={kind === 'reminder'} />;
  }
  if (r.status === 'dispensed') {
    return (
      <div className="info-box info-ok">
        <strong><Svg d={ICONS.check} size={18} /> Successfully Completed</strong>
        <p>Received on {dateTime(r.dispensing?.dispensed_at ?? r.request_date)}. This request is now part of your medicine history.</p>
      </div>
    );
  }
  return null;
}

/** "What should you do next?" for the resident, based on where the request stands now. */
function nextStep(r: MedicineRequest | null): string | null {
  if (!r) return null;
  const p = pickupPeriod(r);
  switch (r.status) {
    case 'pending':
      return 'No action is needed for now. Please wait for the review — you will be notified once your request is approved or not approved. You may still update or cancel it while it is under review.';
    case 'approved':
      return r.request_type === 'restock'
        ? 'No action is needed for now. You will be notified once the medicine is available. Then you can submit a medicine request to get it.'
        : `Go to Botika ng Bayan on or before ${p?.deadline ?? 'the claim deadline'} and show your QR code / Resident ID (My Profile). If you no longer need the medicine, please cancel the request so other residents can use it.`;
    case 'dispensed':
      return 'No further action is needed. You can view this request anytime in My Requests.';
    case 'fulfilled':
      return 'The medicine is now available. Submit a medicine request to get it.';
    case 'expired':
      return 'If you still need the medicine, check its availability and submit a new request. Next time, please claim your medicine on or before the deadline.';
    case 'rejected':
    case 'cancelled':
      return 'If you still need the medicine, you may check its availability and submit a new request anytime. If it is out of stock, you can submit a restock request.';
    default:
      return null;
  }
}

/** Resident: details of one notification (opened from the bell, the dashboard or the Notifications page). */
export default function NotificationDetail() {
  const { id } = useParams();
  const { data, error, loading } = useApi<Detail>(`/notifications/${id}`);

  // Opening the notification marks it as read: update the bell count.
  useEffect(() => { if (data) notificationsChanged(); }, [data]);

  if (loading && !data) return <Loading />;
  if (!data) return <Message>{error}</Message>;

  const { notification: n, request: r } = data;
  const kind = kindOf(n);
  const hero = heroOf(kind, n, r);
  const advice = nextStep(r);

  return (
    <div className="page page-narrow">
      <header className="detail-topbar">
        <BackButton fallback="/notifications" />
        <h1>Notification Details</h1>
      </header>

      <section className="hero card">
        <span className={`hero-icon kicon k-${kind}`}><Svg d={KIND[kind].icon} size={34} width={2} /></span>
        <h2>{hero.title || titleOf(n)}</h2>
        <p className="muted">{hero.text}</p>
        <span className={`pill k-${kind}`}>{hero.tag}</span>
        <small className="muted">{dateTime(n.sent_at)}</small>
      </section>

      <section className="card sms-card">
        <small className="muted">{n.channel === 'sms' ? 'Message sent to you (SMS)' : 'Message'}</small>
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
          <strong><Svg d={ICONS.bulb} size={18} /> What should you do next?</strong>
          <p>{advice}</p>
        </div>
      )}

      {r?.status === 'fulfilled' && (
        <div className="detail-actions">
          <Link className="btn btn-block" to="/medicines">Request this medicine</Link>
        </div>
      )}
    </div>
  );
}
