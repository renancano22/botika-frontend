import { Fragment, type ReactNode } from 'react';

/**
 * Search highlighting for the tables and lists: what was searched for is marked in yellow in the rows that were
 * found, and a row whose number (batch #, Request No.) is the one searched for is highlighted as a whole.
 * It reads the search the same way the server does (Listing::search / Listing::number in the backend):
 *  - "#20", "No. 20", "Batch 20", "Request No. 20": only that number is searched for (no text is marked);
 *  - "20": the record with that number, and names or IDs that contain "20";
 *  - any other text: names, IDs, etc. that contain it.
 */
const NUMBER = /^\s*(?:(?:request|batch)\s*(?:no\.?|#)?|no\.?|#)\s*(\d{1,9})\s*$/i;

/** The number searched for ("#20", "Batch 20", or just "20"), or null. */
export function searchedNumber(q: string): number | null {
  const m = NUMBER.exec(q);
  if (m) return Number(m[1]);
  return /^\d{1,9}$/.test(q.trim()) ? Number(q.trim()) : null;
}

/** Is this record (batch #, Request No.) the one searched for? */
export function isSearchHit(q: string, id: number | null | undefined): boolean {
  return id !== null && id !== undefined && searchedNumber(q) === id;
}

/** Row class for the record searched for by its number ('' for the other rows). */
export const rowHit = (q: string, id: number | null | undefined) => (isSearchHit(q, id) ? 'row-hit' : '');

/** The searched text, in a text field ('' when a number like "#20" was searched for: only the number is looked up). */
function textTerm(q: string): string {
  return NUMBER.test(q) ? '' : q.trim();
}

/** Marks every place the searched text appears in this text. */
export function Hl({ q, children }: { q: string; children: string | number | null | undefined }) {
  const text = children === null || children === undefined ? '' : String(children);
  const term = textTerm(q);
  if (!term || !text) return <>{text}</>;
  const parts = text.split(new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return <>{parts.map((part, i) => (i % 2 ? <mark key={i} className="search-hit">{part}</mark> : <Fragment key={i}>{part}</Fragment>))}</>;
}

/** Marks a record number (batch #, Request No.) when it is the one searched for. */
export function HlId({ q, id, children }: { q: string; id: number | null | undefined; children: ReactNode }) {
  return isSearchHit(q, id) ? <mark className="search-hit search-hit-id">{children}</mark> : <>{children}</>;
}
