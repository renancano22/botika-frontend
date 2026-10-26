import { useState, type FormEvent } from 'react';
import { api, describeError, formatDate } from '../../api';
import { Pagination, rowNo, useDebounced, usePagedApi } from '../../components/Pagination';
import { Hl } from '../../components/SearchHighlight';
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
  // SMS log: one page at a time, newest first; the search, status and dates apply to the whole log.
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const badRange = !!from && !!to && from > to;
  const term = useDebounced(search.trim()); // what the log was searched for (marked in the rows)
  const log = usePagedApi<SmsNotification>('/notifications',
    { search: term, status, ...(badRange ? { from: to, to: from } : { from, to }), sort }, { table: 'sms-log', refreshMs: 30000 });
  const { data, errorInfo, loading, reload, rows, meta } = log;
  const filtered = !!search.trim() || !!status || !!from || !!to;
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
      <Card title="SMS log" actions={
        <div className="filters">
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option value="">All statuses</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
            <option value="logged">Logged (no SMS key)</option>
            <option value="app">In-app only</option>
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as 'newest' | 'oldest')} aria-label="Sort">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
          <input type="search" className="search" placeholder="Search resident, mobile or message…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      }>
        <div className="filters tbl-dates">
          <label className="tbl-date">From <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label="From date" /></label>
          <label className="tbl-date">To <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="To date" /></label>
          {filtered && <button type="button" className="btn btn-outline btn-sm" onClick={() => { setSearch(''); setStatus(''); setFrom(''); setTo(''); }}>Clear filters</button>}
        </div>
        {badRange && <p className="field-warning">The "From" date is after the "To" date, so the dates were swapped.</p>}
        {loading && !data ? <Loading /> : !data ? null : !rows.length ? <Empty>{filtered ? 'No messages match these filters.' : 'No SMS sent yet.'}</Empty> : (
          <table className={loading ? 'tbl-updating' : ''}>
            <thead><tr><th className="col-no">No.</th><th>Date</th><th>Resident</th><th>Mobile</th><th>Message</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((n, i) => (
                <tr key={n.notification_id}>
                  <td className="col-no">{rowNo(meta, i)}</td>
                  <td className="nowrap">{formatDate(n.sent_at, true)}</td>
                  <td><Hl q={term}>{n.resident?.name}</Hl>{n.resident?.qr_code && <div className="muted small nowrap">{n.resident.qr_code}</div>}</td>
                  <td>{n.resident?.contact_no ? <Hl q={term}>{n.resident.contact_no}</Hl> : '—'}</td>
                  <td><Hl q={term}>{n.message}</Hl>{n.request_id && <div className="muted small">Request No. {n.request_id}</div>}</td>
                  <td><Badge value={n.channel === 'app' ? 'app' : n.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination meta={meta} onPage={log.setPage} onPerPage={log.setPerPage} noun="messages" busy={loading} />
      </Card>
    </div>
  );
}
