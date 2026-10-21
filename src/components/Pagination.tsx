import { useEffect, useMemo, useState } from 'react';
import { useApi } from '../hooks';
import type { PageMeta, Paged } from '../types';

/** Rows per page offered in every data table. */
export const PAGE_SIZES = [5, 10, 25, 50];
const DEFAULT_SIZE = 5; // every table starts with 5 rows per page

/** The value after the user stops typing for `ms` (so a search is not sent to the server on every key press). */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}

/** The "No." of a row: its position in the whole list (continues on the next pages), never a record ID. */
export const rowNo = (meta: PageMeta | undefined, index: number) => (meta?.from ?? 1) + index;

/** The rows-per-page choice is remembered per table on this device (it is only a display preference). */
function savedSize(table: string): number {
  try {
    const n = Number(localStorage.getItem(`botika_rows5_${table}`));
    return PAGE_SIZES.includes(n) ? n : DEFAULT_SIZE;
  } catch { return DEFAULT_SIZE; }
}
function saveSize(table: string, n: number) {
  try { localStorage.setItem(`botika_rows5_${table}`, String(n)); } catch { /* storage blocked: not remembered */ }
}

/**
 * One page of a list from the server (Laravel paginates; only that page is downloaded).
 * Changing a filter, the search or the sort goes back to page 1. `focus` asks the server for the page
 * that contains one record (e.g. a batch opened from an expiry alert); it is not part of the filters.
 */
export function usePagedApi<T, Extra extends object = object>(
  url: string,
  params: Record<string, unknown>,
  { table, refreshMs = 0, focus }: { table: string; refreshMs?: number; focus?: string | number | null },
) {
  const [perPage, setPerPageState] = useState(() => savedSize(table));
  const key = JSON.stringify(params);
  const [pg, setPg] = useState({ key, page: 1 });
  const page = pg.key === key ? pg.page : 1;
  const res = useApi<Paged<T> & Extra>(url, { ...params, page, per_page: perPage, ...(focus ? { focus } : {}) }, refreshMs);
  const meta = res.data?.meta;

  // The server opened the page with the focused record: stay on that page.
  useEffect(() => {
    if (focus && meta && res.current && meta.current_page !== page) setPg({ key, page: meta.current_page });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, meta, res.current]);

  return {
    ...res,
    /** The rows on screen belong to the current filters, page and focus (not the previous list still shown while loading). */
    ready: res.current,
    rows: res.data?.data ?? [],
    meta,
    setPage: (n: number) => setPg({ key, page: n }),
    setPerPage: (n: number) => { saveSize(table, n); setPerPageState(n); setPg({ key, page: 1 }); },
  };
}

/**
 * The same pages for a list that is already complete in the browser (a generated report, the forecast,
 * a resident's own requests). Changing `resetKey` (filters) goes back to page 1.
 */
export function useClientPages<T>(all: T[], resetKey: string, table: string) {
  const [perPage, setPerPageState] = useState(() => savedSize(table));
  const [pg, setPg] = useState({ key: resetKey, page: 1 });
  const total = all.length;
  const last = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(last, pg.key === resetKey ? pg.page : 1);
  const rows = useMemo(() => all.slice((page - 1) * perPage, page * perPage), [all, page, perPage]);
  const meta: PageMeta = {
    current_page: page, per_page: perPage, total, last_page: last,
    from: rows.length ? (page - 1) * perPage + 1 : null,
    to: rows.length ? (page - 1) * perPage + rows.length : null,
  };
  return {
    rows,
    meta,
    /** Is the row at this position of the whole list on the page shown? (Printing shows every row.) */
    onPage: (i: number) => i >= (page - 1) * perPage && i < page * perPage,
    setPage: (n: number) => setPg({ key: resetKey, page: n }),
    setPerPage: (n: number) => { saveSize(table, n); setPerPageState(n); setPg({ key: resetKey, page: 1 }); },
  };
}

/** Page numbers with gaps, e.g. 1 … 4 5 6 … 12. */
function pageList(current: number, last: number): (number | 'gap')[] {
  const pages = new Set([1, last, current - 1, current, current + 1].filter((p) => p >= 1 && p <= last));
  const sorted = [...pages].sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  sorted.forEach((p, i) => {
    if (i && p - sorted[i - 1] > 1) out.push('gap');
    out.push(p);
  });
  return out;
}

/**
 * Below a data table: "Showing 1–5 of 10 records", rows per page (5, 10, 25, 50) and
 * Previous / page numbers / Next.
 */
export function Pagination({ meta, onPage, onPerPage, noun = 'records', busy = false }: {
  meta: PageMeta | undefined;
  onPage: (page: number) => void;
  onPerPage: (size: number) => void;
  noun?: string;
  busy?: boolean;
}) {
  if (!meta || meta.total === 0) return null; // the table shows its own "nothing found" message
  const { current_page: page, last_page: last, total, from, to } = meta;
  const go = (n: number) => {
    if (n < 1 || n > last || n === page) return;
    onPage(n);
  };
  const one = noun.replace(/(ch|sh|x)es$/, '$1').replace(/s$/, '');

  return (
    <nav className={`pager no-print ${busy ? 'is-busy' : ''}`} aria-label="Pages">
      <p className="pager-info" aria-live="polite">
        {total === 0 ? `No ${noun}` : <>Showing <b>{from}–{to}</b> of <b>{total.toLocaleString('en-PH')}</b> {total === 1 ? one : noun}</>}
      </p>
      <label className="pager-size">
        <span>Rows per page</span>
        <select value={meta.per_page} onChange={(e) => onPerPage(Number(e.target.value))} aria-label="Rows per page">
          {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      {last > 1 && (
        <div className="pager-nav">
          <button type="button" className="pager-btn" onClick={() => go(page - 1)} disabled={page <= 1} aria-label="Previous page">
            <span aria-hidden="true">‹</span> <span className="pager-label">Previous</span>
          </button>
          <span className="pager-pages">
            {pageList(page, last).map((p, i) => p === 'gap'
              ? <span key={`gap-${i}`} className="pager-gap" aria-hidden="true">…</span>
              : (
                <button key={p} type="button" className={`pager-btn pager-num ${p === page ? 'active' : ''}`} onClick={() => go(p)}
                  aria-label={`Page ${p}`} aria-current={p === page ? 'page' : undefined}>{p}</button>
              ))}
          </span>
          <span className="pager-of">Page {page} of {last}</span>
          <button type="button" className="pager-btn" onClick={() => go(page + 1)} disabled={page >= last} aria-label="Next page">
            <span className="pager-label">Next</span> <span aria-hidden="true">›</span>
          </button>
        </div>
      )}
    </nav>
  );
}
