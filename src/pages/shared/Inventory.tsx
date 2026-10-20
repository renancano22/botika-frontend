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

const STOCK_OUT_REASONS = ['Expired', 'Damaged', 'Lost', 'Returned to supplier', 'Other'];
const TX_LABEL: Record<StockTransaction['type'], string> = { stock_in: 'Stock-in', stock_out: 'Stock-out', dispensed: 'Dispensed' };

/** Inventory: stock-in batches, stock-out, real-time stock and expiration monitoring. */
export default function Inventory() {
  const [search, setSearch] = useState('');
  // ?expiry=near_expiry / expired (dashboard tiles, expiry alerts) opens the batches already filtered;
  // &batch=<id> (an expiry alert) also jumps to that batch and highlights it.
  const [expiry, setExpiry] = useState(() => new URLSearchParams(window.location.search).get('expiry') ?? '');
  const { data, errorInfo, loading, reload } = useApi<InventoryBatch[]>('/inventory', { search }, 30000);
  const { data: medicines } = useApi<Medicine[]>('/medicines');
  const batches = (data ?? []).filter((b) => !expiry || (b.expiry_status ?? 'ok') === expiry);
  const [stockIn, setStockIn] = useState<{ medicine_id: string; quantity: number; expiration_date: string } | null>(null);
  const openStockIn = (medicineId = '') => { fe.clear(); setStockIn({ medicine_id: medicineId, quantity: 1, expiration_date: '' }); };
  // ?stockin=<medicine id> (Medicine List → "Record stock") or ?stockin=new opens the stock-in form.
  const [params, setParams] = useSearchParams();
  const batchParam = params.get('batch');
  useEffect(() => {
    const e = params.get('expiry');
    if (e !== null) setExpiry(e);
    if (batchParam) setSearch(''); // make sure the batch is not hidden by an earlier search
  }, [params, batchParam]);
  useEffect(() => {
    if (!batchParam || !data) return;
    jumpWhenReady(`batch-${batchParam}`);
    const next = new URLSearchParams(params);
    next.delete('batch');
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchParam, data]);
  useEffect(() => {
    const id = params.get('stockin');
    if (id === null) return;
    openStockIn(id === 'new' ? '' : id);
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
  const tx = useApi<StockTransaction[]>('/inventory/transactions', { type: txType }, 30000);
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
        <button className="btn" onClick={() => openStockIn()}>+ Stock-in</button>
      </header>
      <LoadError error={errorInfo} onRetry={() => reload()} />

      <Card title="Stock batches" actions={
        <div className="filters">
          <select value={expiry} onChange={(e) => setExpiry(e.target.value)} aria-label="Expiry status">
            <option value="">All batches</option>
            <option value="near_expiry">Expiring within 1 month</option>
            <option value="expired">Expired</option>
            <option value="ok">Not expiring soon</option>
          </select>
          <input className="search" placeholder="Search medicine…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      }>
        {loading && !data ? <Loading /> : !data ? null : !data?.length ? <Empty>No stock yet. Record a stock-in.</Empty> : !batches.length ? <Empty>No batches with this expiry status.</Empty> : (
          <table>
            <thead><tr><th>Batch #</th><th>Medicine</th><th>Quantity</th><th>Expiration date</th><th>Expiry status</th><th>Last updated</th><th></th></tr></thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.inventory_id} id={`batch-${b.inventory_id}`} className={b.expiry_status === 'expired' ? 'row-danger' : b.expiry_status === 'near_expiry' ? 'row-warn' : ''}>
                  <td>{b.inventory_id}</td>
                  <td>{b.medicine.medicine_name}</td>
                  <td>{b.quantity} {b.medicine.unit}</td>
                  <td>{formatDate(b.expiration_date)}</td>
                  <td><Badge value={b.expiry_status ?? 'ok'} /></td>
                  <td>{formatDate(b.last_updated, true)}</td>
                  <td className="right"><button className="btn btn-outline btn-sm" onClick={() => { fe.clear(); setStockOut({ batch: b, quantity: b.quantity, reason: b.expiry_status === 'expired' ? 'Expired' : '', details: '' }); }}>Stock-out</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Stock transactions (stock-in / stock-out history)" actions={
        <select value={txType} onChange={(e) => setTxType(e.target.value)}>
          <option value="">All types</option>
          <option value="stock_in">Stock-in</option>
          <option value="stock_out">Stock-out</option>
          <option value="dispensed">Dispensed</option>
        </select>
      }>
        {tx.loading && !tx.data ? <Loading /> : !tx.data?.length ? <Empty>No transactions yet.</Empty> : (
          <table>
            <thead><tr><th>Date</th><th>Type</th><th>Medicine</th><th>Quantity</th><th>Batch #</th><th>Reason</th><th>By</th></tr></thead>
            <tbody>
              {tx.data.map((t) => (
                <tr key={t.transaction_id}>
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
