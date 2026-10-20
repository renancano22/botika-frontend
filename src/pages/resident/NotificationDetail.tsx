import { useEffect, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { notificationsChanged } from '../../api';
import { useApi } from '../../hooks';
import BackButton from '../../components/BackButton';
import { Loading } from '../../components/ui';
import { cleanMessage, KIND, kindOf, titleOf, type Kind } from '../../components/Notifications';
import RequestTracker, { pickupPeriod } from '../../components/RequestTracker';
import { PickupDeadlineBox, RequestSummaryCard } from '../../components/RequestDetailParts';
import { dateTime, ICONS, Svg } from '../../components/RequestCards';
import type { MedicineRequest, SmsNotification } from '../../types';
import { LoadError } from '../../components/feedback';

interface Detail { notification: SmsNotification; request: MedicineRequest | null }

const PHONE = 'M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2';
const CHAT = 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.6A8 8 0 1 1 21 12z';

/** Highlights the important parts of a message: dates, request numbers, Resident IDs, statuses and "Reason:". */
const HIGHLIGHT = /(\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? \d{1,2}, \d{4}\b)|(\b[Rr]equest No\. ?\d+)|(\bBBC-\d+\b)|(\b(?:NOT APPROVED|APPROVED|COMPLETED|EXPIRED|CANCELLED)\b)|(\bReason:)/g;
function highlight(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(HIGHLIGHT)) {
    const i = m.index ?? 0;
    if (i > last) out.push(text.slice(last, i));
    const cls = m[1] ? 'hl-date' : m[4] ? 'hl-status' : 'hl-key';
    out.push(<mark key={i} className={cls}>{m[0]}</mark>);
    last = i + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

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
        : `Go to Botika ng Bayan on or before ${p?.deadline ?? 'the claim deadline'} and show your QR code / Resident ID (My Profile) together with a valid ID or Barangay ID. If you no longer need the medicine, please cancel the request so other residents can use it.`;
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
  const { data, errorInfo, loading, reload } = useApi<Detail>(`/notifications/${id}`);

  // Opening the notification marks it as read: update the bell count.
  useEffect(() => { if (data) notificationsChanged(); }, [data]);

  if (loading && !data) return <Loading />;
  if (!data) return <div className="page page-narrow"><LoadError error={errorInfo} onRetry={() => reload()} back={{ to: '/notifications', label: 'Go to Notifications' }} /></div>;

  const { notification: n, request: r } = data;
  const kind = kindOf(n);
  const hero = heroOf(kind, n, r);
  const advice = nextStep(r);

  return (
    <div className="page page-narrow">
      <BackButton fallback="/notifications" />
      <header className="detail-topbar">
        <h1>Notification Details</h1>
      </header>

      <section className={`notif-hero k-${kind}`}>
        <div className="notif-hero-top">
          <span className="hero-icon kicon"><Svg d={KIND[kind].icon} size={34} width={2} /></span>
          <span className="pill">{hero.tag}</span>
          <h2>{hero.title || titleOf(n)}</h2>
          <p>{hero.text}</p>
        </div>
        <div className="notif-hero-meta">
          {n.request_id && <span><Svg d={ICONS.note} size={15} /> Request No. <b>{n.request_id}</b></span>}
          <span><Svg d={ICONS.clock} size={15} /> {dateTime(n.sent_at)}</span>
        </div>
      </section>

      <section className={`notif-msg k-${kind}`}>
        <div className="notif-msg-head">
          <span className="notif-msg-icon kicon"><Svg d={n.channel === 'sms' ? PHONE : CHAT} size={18} /></span>
          <div>
            <strong>{n.channel === 'sms' ? 'SMS sent to your phone' : n.channel === 'none' ? 'Message (no mobile number on file)' : 'In-app message'}</strong>
            <small>From Botika ng Bayan Bulan · BulanBotikaCare</small>
          </div>
        </div>
        <p className="notif-bubble">{highlight(cleanMessage(n.message))}</p>
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
