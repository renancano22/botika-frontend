import { useState, type FormEvent } from 'react';
import { api, describeError, formatDate } from '../../api';
import { useApi } from '../../hooks';
import { Badge, Card, Empty, Loading, Message } from '../../components/ui';
import type { SmsNotification } from '../../types';
import BackButton from '../../components/BackButton';
import { confirmAction, LoadError, toast, useFormErrors } from '../../components/feedback';

const CATEGORIES = [
  { value: 'general', label: 'General announcement' },
  { value: 'closure', label: 'Temporary pharmacy closure' },
  { value: 'hours', label: 'Change in operating hours' },
  { value: 'distribution', label: 'Medicine distribution' },
];

/** Admin: send SMS announcements to residents and view the SMS notification log. */
export default function Announcements() {
  const { data, errorInfo, loading, reload } = useApi<SmsNotification[]>('/notifications', undefined, 30000);
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState('general');
  const fe = useFormErrors(['message', 'category']);
  const [busy, setBusy] = useState(false);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    fe.clear();
    const label = CATEGORIES.find((c) => c.value === category)?.label ?? 'Announcement';
    await confirmAction({
      tone: 'warning',
      title: 'Send this SMS to all residents?',
      message: <>This <strong>{label.toLowerCase()}</strong> will be sent by SMS to every registered resident with a mobile number.</>,
      details: <q className="dlg-quote">{message.trim()}</q>,
      confirmLabel: 'Send SMS',
      busyLabel: 'Sending…',
      onConfirm: async () => {
        setBusy(true);
        try {
          const res = await api.post('/notifications/announce', { message, category });
          const r = res.data as { total: number; sent: number; failed: number; logged: number };
          if (r.failed > 0) {
            toast.warning('Announcement sent with problems', { description: `${r.sent} of ${r.total} SMS sent. ${r.failed} could not be delivered${r.logged ? `, ${r.logged} saved in the log only` : ''}.` });
          } else {
            toast.success('Announcement sent', { description: `Sent to ${r.sent} resident${r.sent === 1 ? '' : 's'}${r.logged ? ` (${r.logged} saved in the log only, no SMS sent)` : ''}.` });
          }
          setMessage('');
          reload(true);
        } catch (err) {
          // Field problems are shown on the form; the dialog closes so the message can be fixed.
          if (describeError(err).kind === 'validation') { fe.fromError(err); return; }
          throw err;
        } finally { setBusy(false); }
      },
    });
  };

  return (
    <div className="page">
      <BackButton linkedOnly />
      <header className="page-head"><div className="page-title"><h1>SMS Notifications</h1></div></header>

      <Card title="Send announcement to residents">
        <form onSubmit={send}>
          <Message>{fe.general}</Message>
          <label>Type of announcement
            <select value={category} onChange={(e) => setCategory(e.target.value)} {...fe.invalid('category')}>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>{fe.error('category')}
          </label>
          <label>Message ({message.length}/300)
            <textarea rows={3} minLength={5} maxLength={300} value={message} onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. Free maintenance medicines for senior citizens are now available at Botika ng Bayan." required {...fe.invalid('message')} />{fe.error('message')}
          </label>
          <button className="btn" disabled={busy || message.trim().length < 5}>{busy ? 'Sending…' : 'Send SMS'}</button>
        </form>
      </Card>

      <LoadError error={errorInfo} onRetry={() => reload()} />
      <Card title="SMS log">
        {loading && !data ? <Loading /> : !data ? null : !data?.length ? <Empty>No SMS sent yet.</Empty> : (
          <table>
            <thead><tr><th>Date</th><th>Resident</th><th>Mobile</th><th>Message</th><th>Status</th></tr></thead>
            <tbody>
              {data.map((n) => (
                <tr key={n.notification_id}>
                  <td className="nowrap">{formatDate(n.sent_at, true)}</td>
                  <td>{n.resident?.name}</td><td>{n.resident?.contact_no}</td>
                  <td>{n.message}</td><td><Badge value={n.channel === 'app' ? 'app' : n.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
