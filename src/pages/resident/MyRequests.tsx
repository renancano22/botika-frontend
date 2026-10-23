import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth';
import { useApi, usePhone } from '../../hooks';
import { Pagination, useClientPages } from '../../components/Pagination';
import { Empty, Loading } from '../../components/ui';
import { RequestRow, STATUS_COLOR_KEY, STATUS_LABEL, statusKey, Svg, type StatusKey } from '../../components/RequestCards';
import StatusDropdown from '../../components/StatusDropdown';
import type { MedicineRequest } from '../../types';
import BackButton from '../../components/BackButton';
import { LoadError } from '../../components/feedback';

const FILTERS: ('all' | StatusKey)[] = ['all', 'review', 'claim', 'stock', 'claimed', 'available', 'cancelled', 'expired', 'rejected'];

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

/** Resident: list of their requests with search and status filters. Tapping one opens its status timeline. */
export default function MyRequests() {
  const { user, can } = useAuth();
  const { data, errorInfo, loading, reload } = useApi<MedicineRequest[]>('/requests', undefined, 30000);
  // ?status=review / claim / claimed … opens the list already filtered (e.g. from the dashboard tiles).
  // '' = no status chosen yet (shows "Select status", lists everything); 'all' = "All requests" chosen.
  const [filter, setFilter] = useState<'' | 'all' | StatusKey>(() => {
    const s = new URLSearchParams(window.location.search).get('status');
    return (FILTERS as string[]).includes(s ?? '') ? (s as 'all' | StatusKey) : '';
  });
  const [search, setSearch] = useState('');
  const [, setParams] = useSearchParams();
  const changeFilter = (f: '' | 'all' | StatusKey) => {
    setFilter(f);
    setParams(f ? { status: f } : {}, { replace: true }); // keep the choice in the address (Back / refresh)
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: data?.length ?? 0 };
    data?.forEach((r) => { const k = statusKey(r); c[k] = (c[k] ?? 0) + 1; });
    return c;
  }, [data]);

  const term = search.trim().toLowerCase().replace(/^(request\s*)?(no\.?|#)\s*(?=\d)/, ''); // "41", "#41", "No. 41", "Request No. 41"
  const phone = usePhone();
  const shown = (data ?? []).filter((r) =>
    (filter === '' || filter === 'all' || statusKey(r) === filter)
    && (!term || String(r.request_id) === term || r.items.some((i) => i.medicine.medicine_name.toLowerCase().includes(term))));

  // All of the resident's requests are kept, newest first: on a phone all in one list, on a computer a page at a time.
  const pages = useClientPages(shown, `${filter}|${term}`, 'my-requests');
  const list = phone ? shown : pages.rows;

  return (
    <div className="page">
      <BackButton linkedOnly />
      <header className="page-head hero-head">
        <div>
          <div className="page-title"><h1>{greeting()}, {user?.name.split(' ')[0]}!</h1></div>
          <p className="muted">Here are your medicine requests.</p>
        </div>
        {can('medicines.view') && can('requests.create') && <Link className="btn" to="/medicines">+ New request</Link>}
      </header>
      <LoadError error={errorInfo} onRetry={() => reload()} />

      <div className="req-toolbar">
        <div className="search-box">
          <Svg d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M21 21l-5-5" size={20} />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by medicine name or request number…" />
        </div>
        <StatusDropdown
          value={filter}
          onChange={(v) => changeFilter(v as 'all' | StatusKey)}
          options={FILTERS.map((f) => ({
            value: f,
            label: f === 'all' ? 'All requests' : STATUS_LABEL[f],
            count: counts[f] ?? 0,
            k: f === 'all' ? undefined : STATUS_COLOR_KEY[f],
          }))}
        />
      </div>

      <section>
        <div className="section-head">
          <h2 className="section-title">My Requests</h2>
          <span className="muted small">
            {shown.length} {shown.length === 1 ? 'request' : 'requests'}{filter !== '' && filter !== 'all' && <> · {STATUS_LABEL[filter]} <button type="button" className="link-button" onClick={() => changeFilter('')}>Show all</button></>}
          </span>
        </div>
        {loading && !data ? <Loading /> : !data ? null : shown.length === 0 ? (
          <div className="card"><Empty>{data?.length ? 'No requests match your search or filter.' : 'You have no requests yet. Tap "+ New request" to request medicines.'}</Empty></div>
        ) : (
          <>
            <div className="req-rows">
              {list.map((r) => <RequestRow key={r.request_id} request={r} />)}
            </div>
            {!phone && <Pagination meta={pages.meta} onPage={pages.setPage} onPerPage={pages.setPerPage} noun="requests" />}
          </>
        )}
      </section>
    </div>
  );
}
