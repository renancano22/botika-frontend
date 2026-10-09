import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../../api';
import { useApi } from '../../hooks';
import { Badge, Empty, Loading, Message, Modal } from '../../components/ui';
import { ICONS, quantityText, Svg, unitPlural } from '../../components/RequestCards';
import type { Medicine } from '../../types';
import { MAX_REQUEST_QUANTITY, quantityWarning } from '../../validation';

type CartItem = { medicine: Medicine; quantity: number };

/** + / − buttons around a number field (easier to use on phones). */
function QtyStepper({ value, onChange, min = 1, max }: { value: number; onChange: (v: number) => void; min?: number; max: number }) {
  return (
    <div className="qty-stepper">
      <button type="button" onClick={() => onChange(Math.max(min, (value || 0) - 1))} disabled={value <= min} aria-label="Less">−</button>
      <input type="number" inputMode="numeric" min={min} max={max} value={Number.isNaN(value) ? '' : value}
        onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))} />
      <button type="button" onClick={() => onChange((value || 0) + 1)} disabled={value >= max} aria-label="More">+</button>
    </div>
  );
}

/**
 * Resident: check medicine availability, add medicines to a request and submit it,
 * or send a restock request for medicines that are out of stock / low.
 */
export default function ResidentMedicines() {
  const [search, setSearch] = useState('');
  const { data, error, loading } = useApi<Medicine[]>('/medicines', { search }, 30000);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [adding, setAdding] = useState<CartItem | null>(null);       // "Add to request" sheet
  const [cartOpen, setCartOpen] = useState(false);                   // request sheet on phones
  const [restockFor, setRestockFor] = useState<Medicine | null>(null);
  const [restockQty, setRestockQty] = useState(1);
  const [sheetError, setSheetError] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(id);
  }, [toast]);

  const inCart = (m: Medicine) => cart.find((c) => c.medicine.medicine_id === m.medicine_id);
  const cartWarnings = cart.map((c) => quantityWarning(c.quantity, unitPlural(c.medicine.unit), { available: c.medicine.available_stock }));
  const cartValid = cart.length > 0 && cartWarnings.every((w) => !w);

  const openAdd = (m: Medicine) => {
    setSheetError('');
    setAdding({ medicine: m, quantity: inCart(m)?.quantity ?? 1 });
  };

  const confirmAdd = () => {
    if (!adding) return;
    const exists = inCart(adding.medicine);
    setCart(exists
      ? cart.map((c) => (c.medicine.medicine_id === adding.medicine.medicine_id ? adding : c))
      : [...cart, adding]);
    setToast(`${adding.medicine.medicine_name} ${exists ? 'updated in' : 'added to'} your request`);
    setAdding(null);
  };

  const submitRequest = async () => {
    setBusy(true);
    setSheetError('');
    try {
      await api.post('/requests', { request_type: 'medicine', items: cart.map((c) => ({ medicine_id: c.medicine.medicine_id, quantity: c.quantity })) });
      setCart([]);
      setCartOpen(false);
      navigate('/requests');
    } catch (err) {
      setSheetError(errorMessage(err));
    } finally { setBusy(false); }
  };

  const submitRestock = async () => {
    if (!restockFor) return;
    setBusy(true);
    setSheetError('');
    try {
      await api.post('/requests', { request_type: 'restock', items: [{ medicine_id: restockFor.medicine_id, quantity: restockQty }] });
      setRestockFor(null);
      setToast('Restock request sent. You will get an SMS once the medicine is available.');
    } catch (err) {
      setSheetError(errorMessage(err));
    } finally { setBusy(false); }
  };

  const addWarning = adding ? quantityWarning(adding.quantity, unitPlural(adding.medicine.unit), { available: adding.medicine.available_stock }) : null;
  const restockWarning = restockFor ? quantityWarning(restockQty, unitPlural(restockFor.unit), { min: restockFor.available_stock + 1 }) : null;

  /** The list of medicines in the request with editable quantities (side card on computers, sheet on phones). */
  const cartList = (
    <>
      {cart.length === 0 ? <Empty>Tap “Add” on a medicine to include it in your request.</Empty> : (
        <ul className="cart-list">
          {cart.map((c, idx) => (
            <li key={c.medicine.medicine_id}>
              <div className="cart-line">
                <div className="cart-name">
                  <strong>{c.medicine.medicine_name}</strong>
                  <span className="muted small">{quantityText(c.medicine.available_stock, c.medicine.unit)} available</span>
                </div>
                <QtyStepper value={c.quantity} max={Math.min(c.medicine.available_stock, MAX_REQUEST_QUANTITY)}
                  onChange={(v) => setCart(cart.map((x, i) => (i === idx ? { ...x, quantity: v } : x)))} />
                <button className="icon-btn" onClick={() => setCart(cart.filter((_, i) => i !== idx))} aria-label={`Remove ${c.medicine.medicine_name}`}>
                  <Svg d={ICONS.trash} size={18} />
                </button>
              </div>
              {cartWarnings[idx] && <p className="field-warning">{cartWarnings[idx]}</p>}
            </li>
          ))}
        </ul>
      )}
      {sheetError && <Message>{sheetError}</Message>}
      {cart.length > 0 && (
        <button className="btn btn-block" disabled={busy || !cartValid} onClick={submitRequest}>
          {busy ? 'Submitting…' : `Submit request (${cart.length})`}
        </button>
      )}
    </>
  );

  return (
    <div className="page page-with-bar">
      <header className="page-head">
        <div>
          <h1>Check Medicine Availability</h1>
          <p className="muted">Add available medicines to your request. If a medicine is out of stock, send a restock request.</p>
        </div>
      </header>

      <div className="grid-main">
        <section>
          <div className="search-box">
            <Svg d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M21 21l-5-5" size={20} />
            <input type="search" placeholder="Search medicine or category…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {error && <Message>{error}</Message>}
          {loading && !data ? <Loading /> : !data?.length ? <div className="card"><Empty>No medicines found.</Empty></div> : (
            <div className="med-grid">
              {data.map((m) => {
                const added = inCart(m);
                return (
                  <article key={m.medicine_id} className={`med-card ${added ? 'med-added' : ''}`}>
                    <div className="med-top">
                      <span className="med-icon"><Svg d={ICONS.pill} size={22} width={1.9} /></span>
                      <div className="med-name">
                        <strong>{m.medicine_name}</strong>
                        <span className="muted small">{m.category}</span>
                      </div>
                      <Badge value={m.status} />
                    </div>
                    {m.description && <p className="muted small med-desc">{m.description}</p>}
                    <div className="med-bottom">
                      <span className="med-stock"><b>{m.available_stock}</b> {m.available_stock === 1 ? m.unit : unitPlural(m.unit)} available</span>
                      <div className="med-actions">
                        {/* Low stock: the resident may need more than what is left, so restock can be requested too. */}
                        {m.status !== 'available' && (
                          <button className="btn btn-outline btn-sm" onClick={() => { setSheetError(''); setRestockFor(m); setRestockQty(m.available_stock + 1); }}>Request restock</button>
                        )}
                        {m.status !== 'out_of_stock' && (
                          <button className={`btn btn-sm ${added ? 'btn-added' : ''}`} onClick={() => openAdd(m)}>
                            {added ? <><Svg d={ICONS.check} size={16} width={2.6} /> Added ({added.quantity})</> : '+ Add'}
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* Computers: the request stays visible beside the list. */}
        <section className="card cart-card">
          <div className="card-head"><h2>My medicine request</h2>{cart.length > 0 && <span className="pill k-review">{cart.length} item{cart.length > 1 ? 's' : ''}</span>}</div>
          {cartList}
        </section>
      </div>

      {/* Phones: a bar fixed at the bottom of the screen opens the request. */}
      {cart.length > 0 && (
        <button className="cart-bar" onClick={() => { setSheetError(''); setCartOpen(true); }}>
          <span className="cart-bar-count">{cart.length}</span>
          <span className="cart-bar-text">
            <strong>{cart.length} medicine{cart.length > 1 ? 's' : ''} in your request</strong>
            <small>Tap to review and submit</small>
          </span>
          <Svg d={ICONS.chevron} size={20} />
        </button>
      )}

      {toast && <div className="toast" role="status"><Svg d={ICONS.check} size={18} width={2.6} /> {toast}</div>}

      {cartOpen && (
        <Modal title="My medicine request" onClose={() => setCartOpen(false)}>
          {cartList}
        </Modal>
      )}

      {adding && (
        <Modal title={inCart(adding.medicine) ? 'Change quantity' : 'Add to request'} onClose={() => setAdding(null)}>
          <div className="sheet-med">
            <span className="med-icon"><Svg d={ICONS.pill} size={22} width={1.9} /></span>
            <div>
              <strong>{adding.medicine.medicine_name}</strong>
              <span className="muted small">{quantityText(adding.medicine.available_stock, adding.medicine.unit)} available</span>
            </div>
          </div>
          <label>How many {unitPlural(adding.medicine.unit)} do you need?
            <QtyStepper value={adding.quantity} max={Math.min(adding.medicine.available_stock, MAX_REQUEST_QUANTITY)}
              onChange={(v) => setAdding({ ...adding, quantity: v })} />
          </label>
          {addWarning && <p className="field-warning">{addWarning}</p>}
          <div className="modal-actions">
            <button className="btn btn-outline" onClick={() => setAdding(null)}>Cancel</button>
            <button className="btn" disabled={!!addWarning} onClick={confirmAdd}>{inCart(adding.medicine) ? 'Update' : 'Add to request'}</button>
          </div>
        </Modal>
      )}

      {restockFor && (
        <Modal title="Request restock" onClose={() => setRestockFor(null)}>
          <p>
            <strong>{restockFor.medicine_name}</strong>{' '}
            {restockFor.available_stock > 0 ? `has only ${quantityText(restockFor.available_stock, restockFor.unit)} left.` : 'is currently out of stock.'}{' '}
            The administrator will review your restock request and you will get an SMS once it is available.
          </p>
          <label>Quantity you need ({unitPlural(restockFor.unit)})
            <QtyStepper value={restockQty} min={restockFor.available_stock + 1} max={MAX_REQUEST_QUANTITY} onChange={setRestockQty} />
          </label>
          <p className="field-hint">Up to {MAX_REQUEST_QUANTITY} {unitPlural(restockFor.unit)} per request.</p>
          {restockWarning && <p className="field-warning">{restockWarning}</p>}
          {sheetError && <Message>{sheetError}</Message>}
          <div className="modal-actions">
            <button className="btn btn-outline" onClick={() => setRestockFor(null)}>Cancel</button>
            <button className="btn" disabled={busy || !!restockWarning} onClick={submitRestock}>{busy ? 'Sending…' : 'Send restock request'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
