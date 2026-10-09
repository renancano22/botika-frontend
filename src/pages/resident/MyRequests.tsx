import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth';
import { useApi } from '../../hooks';
import { Empty, Loading, Message } from '../../components/ui';
import { RequestRow, STATUS_LABEL, statusKey, Svg, type StatusKey } from '../../components/RequestCards';
import type { MedicineRequest } from '../../types';

const FILTERS: ('all' | StatusKey)[] = ['all', 'review', 'claim', 'stock', 'claimed', 'available', 'cancelled', 'expired', 'rejected'];

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

/** Resident: list of their requests with search and status filters. Tapping one opens its status timeline. */
export default function MyRequests() {
  const { user } = useAuth();
  const { data, error, loading } = useApi<MedicineRequest[]>('/requests', undefined, 30000);
  const [filter, setFilter] = useState<'all' | StatusKey>('all');
  const [search, setSearch] = useState('');

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: data?.length ?? 0 };
    data?.forEach((r) => { const k = statusKey(r); c[k] = (c[k] ?? 0) + 1; });
    return c;
  }, [data]);

  const term = search.trim().toLowerCase().replace(/^#/, '');
  const shown = (data ?? []).filter((r) =>
    (filter === 'all' || statusKey(r) === filter)
    && (!term || String(r.request_id) === term || r.items.some((i) => i.medicine.medicine_name.toLowerCase().includes(term))));

  return (
    <div className="page">
      <header className="page-head hero-head">
        <div>
          <h1>{greeting()}, {user?.name.split(' ')[0]}!</h1>
          <p className="muted">Here are your medicine requests.</p>
        </div>
        <Link className="btn" to="/medicines">+ New request</Link>
      </header>
      <Message>{error}</Message>

      <div className="search-box">
        <Svg d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M21 21l-5-5" size={20} />
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by medicine name or request number…" />
      </div>

      <div className="chips" role="tablist" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <button key={f} role="tab" aria-selected={filter === f} className={`chip ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
            {f === 'all' ? 'All' : STATUS_LABEL[f]}
            <span className="chip-count">{counts[f] ?? 0}</span>
          </button>
        ))}
      </div>

      <section>
        <h2 className="section-title">My Requests</h2>
        {loading && !data ? <Loading /> : shown.length === 0 ? (
          <div className="card"><Empty>{data?.length ? 'No requests match your search or filter.' : 'You have no requests yet. Tap "+ New request" to request medicines.'}</Empty></div>
        ) : (
          <div className="req-rows">
            {shown.map((r) => <RequestRow key={r.request_id} request={r} />)}
          </div>
        )}
      </section>
    </div>
  );
}
