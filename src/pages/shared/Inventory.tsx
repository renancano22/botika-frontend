import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, formatDate } from '../../api';
import { useApi } from '../../hooks';
import { Badge, Card, Empty, Loading, Message, Modal } from '../../components/ui';
import type { InventoryBatch, Medicine, StockTransaction } from '../../types';
import { MAX_STOCK_IN, maxExpiry, tomorrow } from '../../validation';
import { unitPlural } from '../../components/RequestCards';
import { jumpWhenReady } from '../../scroll';
import BackButton from '../../components/BackButton';
import { LoadError, toast, useFormErrors } from '../../components/feedback';
import { useAuth } from '../../auth';
import { Pagination, rowNo, useDebounced, usePagedApi } from '../../components/Pagination';

const STOCK_OUT_REASONS = ['Expired', 'Damaged', 'Lost', 'Returned to supplier', 'Other'];
const TX_LABEL: Record<StockTransaction['type'], string> = { stock_in: 'Stock-in', stock_out: 'Stock-out', dispensed: 'Dispensed' };

/** Inventory: stock-in batches, stock-out, real-time stock and expiration monitoring. */
export default function Inventory() {
  const { can } = useAuth();
  const canManage = can('inventory.manage');
  const [search, setSearch] = useState('');
  // ?expiry=near_expiry / expired (dashboard tiles, expiry alerts) opens the batches already filtered;
  // &batch=<id> (an expiry alert) also jumps to that batch and highlights it.
  const [expiry, setExpiry] = useState(() => new URLSearchParams(window.location.search).get('expiry') ?? '');
  const [batchSort, setBatchSort] = useState('expiry');
  // A batch opened from an expiry alert: the server returns the page that contains it.
  const [focus, setFocus] = useState<string | null>(() => new URLSearchParams(window.location.search).get('batch'));
  const batchList = usePagedApi<InventoryBatch>('/inventory', { search: useDebounced(search.trim()), expiry, sort: batchSort },
    { table: 'batches', refreshMs: 30000, focus });
  const { data, errorInfo, loading, reload, rows: batches, meta: batchMeta } = batchList;
  const { data: medicines } = useApi<Medicine[]>('/medicines');
  const [stockIn, setStockIn] = useState<{ medicine_id: string; quantity: number; expiration_date: string } | null>(null);
  const openStockIn = (medicineId = '') => { fe.clear(); setStockIn({ medicine_id: medicineId, quantity: 1, expiration_date: '' }); };
  // ?stockin=<medicine id> (Medicine List → "Record stock") or ?stockin=new opens the stock-in form.
  const [params, setParams] = useSearchParams();
  const batchParam = params.get('batch');
  useEffect(() => {
    const e = params.get('expiry');
    if (e !== null) setExpiry(e);
    if (batchParam) { setSearch(''); setFocus(batchParam); } // make sure the batch is not hidden by an earlier search
  }, [params, batchParam]);
  useEffect(() => {
    if (!focus || !batchList.ready) return;
    if (batches.some((b) => String(b.inventory_id) === focus)) jumpWhenReady(`batch-${focus}`);
    setFocus(null);
    if (batchParam) {
      const next = new URLSearchParams(params);
      next.delete('batch');
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, batchList.ready, batches]);
  useEffect(() => {
    const id = params.get('stockin');
    if (id === null) return;
    if (canManage) openStockIn(id === 'new' ? '' : id);
    const next = new URLSearchParams(params);
    next.delete('stockin');
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);
  // Medicines grouped by category for the stock-in list.
  const grouped = useMemo(() => {
    const g = new Map<string, Medicine[]>();
    (medicines ?? []).forEach((m) => g.set(m.category, [...(g.get(m.category) ?? []), m]));
    return [...g.entries()];
  }, [medicines]);
  const chosen = medicines?.find((m) => String(m.medicine_id) === stockIn?.medicine_id);
  const [stockOut, setStockOut] = useState<{ batch: InventoryBatch; quantity: number; reason: string; details: string } | null>(null);
  const [txType, setTxType] = useState('');
  const [txSearch, setTxSearch] = useState('');
  const [txFrom, setTxFrom] = useState('');
  const [txTo, setTxTo] = useState('');
  const [txSort, setTxSort] = useState<'newest' | 'oldest'>('newest');
  const txBadRange = !!txFrom && !!txTo && txFrom > txTo;
  const tx = usePagedApi<StockTransaction>('/inventory/transactions',
    { type: txType, search: useDebounced(txSearch.trim()), ...(txBadRange ? { from: txTo, to: txFrom } : { from: txFrom, to: txTo }), sort: txSort },
    { table: 'transactions', refreshMs: 30000 });
  const txFiltered = !!txType || !!txSearch.trim() || !!txFrom || !!txTo;
  const fe = useFormErrors(['medicine_id', 'quantity', 'expiration_date', 'reason']);
  // While a stock-in / stock-out is being saved its button is disabled, so a double click cannot save it twice.
  const [saving, setSaving] = useState(false);

  const submitIn = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    fe.clear();
    try {
      await api.post('/inventory/stock-in', stockIn);
      toast.success('Stock-in recorded', {
        description: `${stockIn?.quantity} ${chosen ? (stockIn?.quantity === 1 ? chosen.unit : unitPlural(chosen.unit)) : 'items'} of ${chosen?.medicine_name ?? 'the medicine'} added as a new batch.`,
      });
      setStockIn(null);
      reload(true);
      tx.reload(true);
    } catch (err) { fe.fromError(err); }
    finally { setSaving(false); }
  };

  const submitOut = async (e: FormEvent) => {
    e.preventDefault();
    if (!stockOut || saving) return;
    setSaving(true);
    try {
      const details = stockOut.details.trim();
      const reason = stockOut.reason === 'Other' ? details : details ? `${stockOut.reason} - ${details}` : stockOut.reason;
      await api.post(`/inventory/${stockOut.batch.inventory_id}/stock-out`, { quantity: stockOut.quantity, reason });
      toast.success('Stock-out recorded', { description: `${stockOut.quantity} removed from batch #${stockOut.batch.inventory_id} (${stockOut.batch.medicine.medicine_name}).` });
      setStockOut(null);
      reload(true);
      tx.reload(true);
    } catch (err) { fe.fromError(err); }
    finally { setSaving(false); }
  };

  return (
    <div className="page">
      <BackButton linkedOnly />
      <header className="page-head">
        <div>
          <div className="page-title"><h1>Stock &amp; Batches</h1></div>
          <p className="muted">Each stock-in is saved as a batch with its own expiration date. Dispensing uses the earliest-expiring batch first and never uses expired batches.</p>
        </div>
        {canManage && <button className="btn" onClick={() => openStockIn()}>+ Stock-in</button>}
      </header>
      <LoadError error={errorInfo} onRetry={() => reload()} />

      <Card title="Stock batches" actions={
        <div className="filters">
          <select value={expiry} onChange={(e) => setExpiry(e.target.value)} aria-label="Expiry status">
            <option value="">All batches with stock</option>
            <option value="near_expiry">Expiring within 1 month</option>
            <option value="expired">Expired</option>
            <option value="ok">Not expiring soon</option>
            <option value="empty">Used up (0 left)</option>
          </select>
          <select value={batchSort} onChange={(e) => setBatchSort(e.target.value)} aria-label="Sort batches">
            <option value="expiry">Expiring soonest first</option>
            <option value="expiry_desc">Expiring latest first</option>
            <option value="newest">Newest batches first</option>
          </select>
          <input type="search" className="search" placeholder="Search medicine or batch #…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      }>
        {loading && !data ? <Loading /> : !data ? null : !batches.length ? (
          <Empty>{search.trim() ? 'No batches match this search.' : expiry === 'empty' ? 'No used-up batches yet.' : expiry ? 'No batches with this expiry status.' : 'No stock yet. Record a stock-in.'}</Empty>
        ) : (
          <table className={loading ? 'tbl-updating' : ''}>
            <thead><tr><th className="col-no">No.</th><th>Batch #</th><th>Medicine</th><th>Quantity</th><th>Expiration date</th><th>Expiry status</th><th>Last updated</th><th></th></tr></thead>
            <tbody>
              {batches.map((b, i) => (
                <tr key={b.inventory_id} id={`batch-${b.inventory_id}`} className={b.expiry_status === 'expired' ? 'row-danger' : b.expiry_status === 'near_expiry' ? 'row-warn' : ''}>
                  <td className="col-no">{rowNo(batchMeta, i)}</td>
                  <td>{b.inventory_id}</td>
                  <td>{b.medicine.medicine_name}</td>
                  <td>{b.quantity} {b.medicine.unit}</td>
                  <td>{formatDate(b.expiration_date)}</td>
                  <td><Badge value={b.expiry_status ?? 'ok'} /></td>
                  <td>{formatDate(b.last_updated, true)}</td>
                  <td className="right">{canManage && b.quantity > 0 && <button className="btn btn-outline btn-sm" onClick={() => { fe.clear(); setStockOut({ batch: b, quantity: b.quantity, reason: b.expiry_status === 'expired' ? 'Expired' : '', details: '' }); }}>Stock-out</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination meta={batchMeta} onPage={batchList.setPage} onPerPage={batchList.setPerPage} noun="batches" busy={loading} />
      </Card>

      <Card title="Stock transactions (stock-in / stock-out history)" actions={
        <div className="filters">
          <select value={txType} onChange={(e) => setTxType(e.target.value)} aria-label="Transaction type">
            <option value="">All types</option>
            <option value="stock_in">Stock-in</option>
            <option value="stock_out">Stock-out</option>
            <option value="dispensed">Dispensed</option>
          </select>
          <select value={txSort} onChange={(e) => setTxSort(e.target.value as 'newest' | 'oldest')} aria-label="Sort transactions">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
          <input type="search" className="search" placeholder="Search medicine or batch #…" value={txSearch} onChange={(e) => setTxSearch(e.target.value)} />
        </div>
      }>
        <div className="filters tbl-dates">
          <label className="tbl-date">From <input type="date" value={txFrom} max={txTo || undefined} onChange={(e) => setTxFrom(e.target.value)} aria-label="From date" /></label>
          <label className="tbl-date">To <input type="date" value={txTo} min={txFrom || undefined} onChange={(e) => setTxTo(e.target.value)} aria-label="To date" /></label>
          {txFiltered && <button type="button" className="btn btn-outline btn-sm" onClick={() => { setTxType(''); setTxSearch(''); setTxFrom(''); setTxTo(''); }}>Clear filters</button>}
        </div>
        {txBadRange && <p className="field-warning">The "From" date is after the "To" date, so the dates were swapped.</p>}
        {tx.loading && !tx.data ? <Loading /> : !tx.rows.length ? <Empty>{txFiltered ? 'No transactions match these filters.' : 'No transactions yet.'}</Empty> : (
          <table className={tx.loading ? 'tbl-updating' : ''}>
            <thead><tr><th className="col-no">No.</th><th>Date</th><th>Type</th><th>Medicine</th><th>Quantity</th><th>Batch #</th><th>Reason</th><th>By</th></tr></thead>
            <tbody>
              {tx.rows.map((t, i) => (
                <tr key={t.transaction_id}>
                  <td className="col-no">{rowNo(tx.meta, i)}</td>
                  <td className="nowrap">{formatDate(t.created_at, true)}</td>
                  <td><span className={`badge badge-tx-${t.type}`}>{TX_LABEL[t.type]}</span></td>
                  <td>{t.medicine?.medicine_name}</td>
                  <td>{t.type === 'stock_in' ? '+' : '−'}{t.quantity} {t.medicine?.unit}</td>
                  <td>{t.inventory_id ?? '—'}</td>
                  <td>{t.reason_text ?? t.reason ?? '—'}</td>
                  <td>{t.performer?.name ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination meta={tx.meta} onPage={tx.setPage} onPerPage={tx.setPerPage} noun="transactions" busy={tx.loading} />
      </Card>

      {stockIn && (
        <Modal title="Stock-in (new batch)" onClose={() => setStockIn(null)}>
          <form onSubmit={submitIn}>
            <Message>{fe.general}</Message>
            <label>Medicine
              <select value={stockIn.medicine_id} onChange={(e) => setStockIn({ ...stockIn, medicine_id: e.target.value })} required {...fe.invalid('medicine_id')}>
                <option value="">Select medicine…</option>
                {grouped.map(([cat, list]) => (
                  <optgroup key={cat} label={cat}>
                    {list.map((m) => <option key={m.medicine_id} value={m.medicine_id}>{m.medicine_name} ({m.unit}){m.status === 'unrecorded' ? ' — not recorded yet' : ''}</option>)}
                  </optgroup>
                ))}
              </select>{fe.error('medicine_id')}
            </label>
            {chosen?.status === 'unrecorded' && <p className="field-hint">This is the first stock record for this medicine. After saving it is no longer marked "Not recorded".</p>}
            <div className="row">
              <label>Quantity<input type="number" min={1} max={MAX_STOCK_IN} step={1} value={stockIn.quantity} onChange={(e) => setStockIn({ ...stockIn, quantity: Number(e.target.value) })} required {...fe.invalid('quantity')} />{fe.error('quantity')}</label>
              <label>Expiration date<input type="date" min={tomorrow()} max={maxExpiry()} value={stockIn.expiration_date} onChange={(e) => setStockIn({ ...stockIn, expiration_date: e.target.value })} required {...fe.invalid('expiration_date')} />{fe.error('expiration_date')}</label>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-outline" onClick={() => setStockIn(null)}>Cancel</button>
              <button className="btn" disabled={saving}>{saving ? 'Saving…' : 'Save stock-in'}</button>
            </div>
          </form>
        </Modal>
      )}

      {stockOut && (
        <Modal title="Stock-out" onClose={() => setStockOut(null)}>
          <form onSubmit={submitOut}>
            <Message>{fe.general}</Message>
            <p>Remove items from batch #{stockOut.batch.inventory_id} — <strong>{stockOut.batch.medicine.medicine_name}</strong>, expires {formatDate(stockOut.batch.expiration_date)} ({stockOut.batch.quantity} left). Use this for expired, damaged or lost items.</p>
            <label>Quantity to remove
              <input type="number" min={1} max={stockOut.batch.quantity} step={1} value={stockOut.quantity} onChange={(e) => setStockOut({ ...stockOut, quantity: Number(e.target.value) })} required {...fe.invalid('quantity')} />{fe.error('quantity')}
            </label>
            <div className="row">
              <label>Reason
                <select value={stockOut.reason} onChange={(e) => setStockOut({ ...stockOut, reason: e.target.value })} required {...fe.invalid('reason')}>
                  <option value="">Select reason…</option>
                  {STOCK_OUT_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>{fe.error('reason')}
              </label>
              <label>Details {stockOut.reason === 'Other' ? '(required)' : '(optional)'}
                <input value={stockOut.details} onChange={(e) => setStockOut({ ...stockOut, details: e.target.value })}
                  placeholder="e.g. broken bottles during delivery" required={stockOut.reason === 'Other'} minLength={stockOut.reason === 'Other' ? 3 : undefined} maxLength={200} />
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-outline" onClick={() => setStockOut(null)}>Cancel</button>
              <button className="btn btn-danger" disabled={saving}>{saving ? 'Saving…' : 'Record stock-out'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
