import { Link } from 'react-router-dom';
import { useAuth } from '../../auth';
import { useApi } from '../../hooks';
import { Empty, Loading } from '../../components/ui';
import { ICONS, PickupCountdown, STATUS_COLOR_KEY, STATUS_LABEL, statusKey, Svg } from '../../components/RequestCards';
import { pickupPeriod } from '../../components/RequestTracker';
import { formatDate } from '../../api';
import type { MedicineRequest, Resident, SmsNotification } from '../../types';
import { LoadError } from '../../components/feedback';

/** Only the parts the resident may open are sent (User Permissions). */
interface ResidentDash {
  resident: Resident;
  sections: { requests: boolean; notifications: boolean; medicines: boolean };
  counts: { pending?: number; approved?: number; dispensed?: number; available_medicines?: number };
  recent_requests?: MedicineRequest[];
  recent_notifications?: SmsNotification[];
}

const REVIEW_ICON = 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 14l2 2 4-4';
const QR_ICON = 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM18 14h2M14 18h2';

/** "Paracetamol 500mg ×10, Amoxicillin 500mg ×21" (first two, then "+N more"). */
function itemsText(r: MedicineRequest): string {
  const parts = r.items.map((i) => (i.quantity === null ? i.medicine.medicine_name : `${i.medicine.medicine_name} ×${i.quantity}`));
  return parts.slice(0, 2).join(', ') + (parts.length > 2 ? ` +${parts.length - 2} more` : '');
}

/** Resident dashboard: the same layout as the administrator / staff dashboard (green header + summary panels). */
export default function ResidentDashboard() {
  const { data, errorInfo, loading, reload } = useApi<ResidentDash>('/dashboard', undefined, 30000);
  const { can } = useAuth();

  if (loading && !data) return <Loading />;
  if (!data) return <div className="page"><LoadError error={errorInfo} onRetry={() => reload()} /></div>;
  const { resident, counts } = data;
  const sec = data.sections ?? { requests: true, notifications: true, medicines: true };
  const pending = counts.pending ?? 0;
  const approved = counts.approved ?? 0;
  const dispensed = counts.dispensed ?? 0;
  const available = counts.available_medicines ?? 0;

  // Only what the resident may open (User Permissions).
  const activity = [
    ...(sec.requests ? [
      { to: '/requests?status=review', tone: 'review', icon: REVIEW_ICON, value: pending, label: 'Under review',
        hint: pending ? 'Being checked by the pharmacy' : 'Nothing under review', alert: false },
      { to: '/requests?status=claim', tone: 'ready', icon: ICONS.check, value: approved, label: 'Ready to claim',
        hint: approved ? 'Bring your QR code' : 'Nothing to claim', alert: approved > 0 },
      { to: '/requests?status=claimed', tone: 'completed', icon: ICONS.hand, value: dispensed, label: 'Claimed',
        hint: 'Medicines received', alert: false },
    ] : []),
    ...(sec.medicines ? [
      { to: '/medicines?availability=in_stock', tone: 'available', icon: ICONS.pill, value: available, label: 'Available now',
        hint: 'Medicines in stock', alert: false },
    ] : []),
  ];

  // The request to claim first (approved, nearest deadline): shown at the top so it is not missed.
  const toClaim = (data.recent_requests ?? []).filter((r) => statusKey(r) === 'claim')
    .sort((a, b) => (a.claim_by ?? '').localeCompare(b.claim_by ?? ''))[0];
  const claimPeriod = toClaim ? pickupPeriod(toClaim) : null;
  const requests = (data.recent_requests ?? []).slice(0, 4);

  return (
    <div className="page rd-page">
      <header className="page-head hero-head db-hero rd-hero">
        <div>
          <h1>Hello, {resident.name.split(' ')[0]}!</h1>
          <p className="muted">Check medicines, send requests and follow their status here.</p>
          <p className="db-people">
            <Link to="/profile" className="db-person"><Svg d={QR_ICON} size={16} /> Resident ID: {resident.qr_code}</Link>
          </p>
        </div>
        <div className="actions">
          {can('medicines.view') && <Link className="btn" to="/medicines">Check medicines</Link>}
        </div>
      </header>

      {sec.requests && toClaim && (
        <Link to={`/requests/${toClaim.request_id}`} className="rd-claim k-ready">
          <span className="rd-claim-icon"><Svg d={ICONS.check} size={22} width={2.6} /></span>
          <span className="rd-claim-text">
            <strong>Ready for pickup · Request No. {toClaim.request_id}</strong>
            <span>{itemsText(toClaim)}{claimPeriod ? ` · Claim on or before ${claimPeriod.deadline}` : ''}</span>
            <small>Bring your QR code / Resident ID and a valid ID or Barangay ID.</small>
          </span>
          <PickupCountdown claimBy={toClaim.claim_by} />
          <span className="rd-go" aria-hidden="true"><Svg d={ICONS.chevron} size={20} /></span>
        </Link>
      )}

      {activity.length > 0 && <section className="card db-panel" aria-labelledby="rd-act-title">
        <div className="db-panel-head">
          <h2 id="rd-act-title">My activity</h2>
          {sec.requests && <Link to="/requests" className="db-more">All requests <Svg d={ICONS.chevron} size={16} /></Link>}
        </div>
        <div className={`db-req db-req-n${activity.length}`}>
          {activity.map((m) => (
            <Link key={m.label} to={m.to} className={`db-req-item t-${m.tone} ${m.alert ? 'is-alert' : ''}`}>
              <span className="db-req-icon"><Svg d={m.icon} size={20} /></span>
              <span className="db-req-text">
                <span className="db-req-label">{m.label}</span>
                <strong className="db-req-value">{m.value}</strong>
                <span className="db-req-hint">{m.alert && <span className="db-dot" aria-hidden="true" />}{m.hint}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>}

      {sec.requests && <section className="card db-panel rd-panel rd-panel-wide" aria-labelledby="rd-req-title">
        <div className="db-panel-head">
          <h2 id="rd-req-title">My recent requests</h2>
          <Link to="/requests" className="db-more">See all <Svg d={ICONS.chevron} size={16} /></Link>
        </div>
        {!requests.length ? <Empty>No requests yet.</Empty> : (
          <ul className="rd-list">
            {requests.map((r) => {
              const key = statusKey(r);
              return (
                <li key={r.request_id}>
                  <Link to={`/requests/${r.request_id}`} className={`rd-row k-${STATUS_COLOR_KEY[key]}`}>
                    <span className="rd-row-icon kicon"><Svg d={r.request_type === 'restock' ? ICONS.box : ICONS.pill} size={18} /></span>
                    <span className="rd-row-text">
                      <span className="rd-row-top"><strong>Request No. {r.request_id}</strong><span className={`pill k-${STATUS_COLOR_KEY[key]}`}>{STATUS_LABEL[key]}</span></span>
                      <span className="rd-row-sub">{itemsText(r)}</span>
                      <small>{r.request_type === 'restock' ? 'Restock request' : 'Medicine request'} · {formatDate(r.request_date)}</small>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>}
    </div>
  );
}
