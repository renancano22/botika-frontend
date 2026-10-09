import { useState, type FormEvent } from 'react';
import { api, errorMessage, formatDate } from '../../api';
import { useApi } from '../../hooks';
import { Badge, Card, Empty, Loading, Message } from '../../components/ui';
import type { SmsNotification } from '../../types';

const CATEGORIES = [
  { value: 'general', label: 'General announcement' },
  { value: 'closure', label: 'Temporary pharmacy closure' },
  { value: 'hours', label: 'Change in operating hours' },
  { value: 'distribution', label: 'Medicine distribution' },
];

/** Admin: send SMS announcements to residents and view the SMS notification log. */
export default function Announcements() {
  const { data, error, loading, reload } = useApi<SmsNotification[]>('/notifications', undefined, 30000);
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState('general');
  const [result, setResult] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!confirm('Send this SMS to all registered residents?')) return;
    setBusy(true);
    try {
      const res = await api.post('/notifications/announce', { message, category });
      const r = res.data as { total: number; sent: number; failed: number; logged: number };
      setResult({ type: 'success', text: `Processed ${r.total} resident(s): ${r.sent} sent, ${r.failed} failed, ${r.logged} logged only (no SMS API key).` });
      setMessage('');
      reload(true);
    } catch (err) {
      setResult({ type: 'error', text: errorMessage(err) });
    } finally { setBusy(false); }
  };

  return (
    <div className="page">
      <header className="page-head"><h1>SMS Notifications</h1></header>

      <Card title="Send announcement to residents">
        <form onSubmit={send}>
          {result && <Message type={result.type}>{result.text}</Message>}
          <label>Type of announcement
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </label>
          <label>Message ({message.length}/300)
            <textarea rows={3} maxLength={300} value={message} onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. Free maintenance medicines for senior citizens are now available at Botika ng Bayan." required />
          </label>
          <button className="btn" disabled={busy || !message.trim()}>{busy ? 'Sending…' : 'Send SMS'}</button>
        </form>
      </Card>

      <Message>{error}</Message>
      <Card title="SMS log">
        {loading && !data ? <Loading /> : !data?.length ? <Empty>No SMS sent yet.</Empty> : (
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
