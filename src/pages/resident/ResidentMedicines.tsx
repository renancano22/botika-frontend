import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../../api';
import { useApi } from '../../hooks';
import { Badge, Empty, Loading, Message, Modal } from '../../components/ui';
import { ICONS, quantityText, Svg, unitPlural } from '../../components/RequestCards';
import type { Medicine, MedicineRequest } from '../../types';
import { MAX_REQUEST_QUANTITY, quantityWarning } from '../../validation';
import { PrescriptionUpload, PrescriptionViewer, RX_ICON, RxBadge, type PrescriptionFile } from '../../components/Prescription';
import { jumpToTop } from '../../scroll';

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
/** Out of stock, or stock not recorded yet by the staff (availability not confirmed): it cannot be requested. */
const noStock = (m: Medicine) => m.status === 'out_of_stock' || m.status === 'unrecorded';
/** Residents see "Not yet available" for a medicine whose stock the staff have not recorded yet. */
const StockBadge = ({ m }: { m: Medicine }) => (m.status === 'unrecorded'
  ? <span className="badge badge-unrecorded">Not yet available</span>
  : <Badge value={m.status} />);

export default function ResidentMedicines() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [availability, setAvailability] = useState<'all' | 'in_stock' | 'out_of_stock'>(() => {
    const a = new URLSearchParams(window.location.search).get('availability'); // e.g. from the dashboard tiles
    return a === 'in_stock' || a === 'out_of_stock' ? a : 'all';
  });
  const { data, error, loading } = useApi<Medicine[]>('/medicines', { search, category }, 30000);
  const { data: categories } = useApi<string[]>('/medicines/categories');
  // The resident's open requests (pending, or approved and not finished yet): one per medicine at a time.
  //  - restock: they wait for the SMS;  - medicine: they edit that request instead of making a new one.
  const { data: myRequests, reload: reloadMine } = useApi<MedicineRequest[]>('/requests', undefined, 30000);
  const openRestock = new Map<number, number>(); // medicine_id → request_id
  const openMedicineReq = new Map<number, { requestId: number; status: string }>();
  (myRequests ?? []).filter((r) => r.status === 'pending' || r.status === 'approved').forEach((r) => r.items.forEach((i) => {
    if (r.request_type === 'restock' && !openRestock.has(i.medicine_id)) openRestock.set(i.medicine_id, r.request_id);
    if (r.request_type === 'medicine' && !openMedicineReq.has(i.medicine_id)) openMedicineReq.set(i.medicine_id, { requestId: r.request_id, status: r.status });
  }));
  const [alreadyRequested, setAlreadyRequested] = useState<{ medicine: Medicine; requestId: number } | null>(null);
  const [inRequest, setInRequest] = useState<{ medicine: Medicine; requestId: number; status: string } | null>(null);
  const shown = (data ?? []).filter((m) => availability === 'all'
    || (availability === 'out_of_stock' ? noStock(m) : !noStock(m)));
  const listTitle = `${availability === 'in_stock' ? 'Available' : availability === 'out_of_stock' ? 'Out of Stock' : 'All'} ${category || 'Medicines'}`;
  const [cart, setCart] = useState<CartItem[]>([]);
  const [adding, setAdding] = useState<CartItem | null>(null);       // "Add to request" sheet
  const [cartOpen, setCartOpen] = useState(false);                   // request sheet on phones
  const [restockFor, setRestockFor] = useState<Medicine | null>(null);
  const [restockQty, setRestockQty] = useState(1);
  const [sheetError, setSheetError] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [restockNote, setRestockNote] = useState('');
  const [details, setDetails] = useState<Medicine | null>(null);    // medicine details sheet
  const [prescription, setPrescription] = useState<PrescriptionFile | null>(null);
  const [viewRx, setViewRx] = useState(false);
  const navigate = useNavigate();

  // Steps: browse medicines → "Medicine Request Form" (quantities + reason) → review → submit.
  // The step is kept in the address (?step=form / ?step=review) so the phone's back button works.
  const [params, setParams] = useSearchParams();
  const step = params.get('step');
  const goStep = (s: 'form' | 'review' | null) => {
    setSheetError('');
    setCartOpen(false);
    setParams(s ? { step: s } : {});
    jumpToTop();
  };
  useEffect(() => {
    if (step && cart.length === 0) setParams({}, { replace: true }); // e.g. after refreshing the page
  }, [step, cart.length, setParams]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(id);
  }, [toast]);

  const inCart = (m: Medicine) => cart.find((c) => c.medicine.medicine_id === m.medicine_id);
  const cartWarnings = cart.map((c) => quantityWarning(c.quantity, unitPlural(c.medicine.unit), { available: c.medicine.available_stock }));
  const cartValid = cart.length > 0 && cartWarnings.every((w) => !w);
  // Medicines that need a doctor's prescription: the request must include a photo/PDF of it.
  const rxItems = cart.filter((c) => c.medicine.requires_prescription);
  const needsRx = rxItems.length > 0;

  const openAdd = (m: Medicine) => {
    setSheetError('');
    setDetails(null);
    // Already in one of the resident's open requests: go to that request instead of making a new one.
    const open = openMedicineReq.get(m.medicine_id);
    if (open && !inCart(m)) { setInRequest({ medicine: m, ...open }); return; }
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
      const res = await api.post<{ request_id: number }>('/requests', {
        request_type: 'medicine',
        note: note.trim() || null,
        items: cart.map((c) => ({ medicine_id: c.medicine.medicine_id, quantity: c.quantity })),
        ...(needsRx && prescription ? { prescription: { name: prescription.name, data: prescription.data } } : {}),
      });
      setCart([]);
      setNote('');
      setPrescription(null);
      reloadMine(true);
      setCartOpen(false);
      navigate(`/requests/${res.data.request_id}`, { replace: true, state: { submitted: true } });
    } catch (err) {
      setSheetError(errorMessage(err));
    } finally { setBusy(false); }
  };

  /** Opens the restock form, or tells the resident they already asked for this medicine. */
  const startRestock = (m: Medicine) => {
    setDetails(null);
    const requestId = openRestock.get(m.medicine_id);
    if (requestId) { setAlreadyRequested({ medicine: m, requestId }); return; }
    setSheetError('');
    setRestockNote('');
    setRestockFor(m);
    setRestockQty(m.available_stock + 1);
  };

  const submitRestock = async () => {
    if (!restockFor) return;
    setBusy(true);
    setSheetError('');
    try {
      await api.post('/requests', { request_type: 'restock', note: restockNote.trim() || null, items: [{ medicine_id: restockFor.medicine_id, quantity: restockQty }] });
      setRestockFor(null);
      reloadMine(true);
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
        <button className="btn btn-block" disabled={!cartValid} onClick={() => goStep('form')}>
          Continue to request form ({cart.length})
        </button>
      )}
    </>
  );

  if ((step === 'form' || step === 'review') && cart.length > 0) {
    const rxMissing = needsRx && !prescription;
    return (
      <div className="page page-narrow">
        <header className="page-head hero-head form-hero">
          <div>
            <button className="hero-back" onClick={() => navigate(-1)}><Svg d={ICONS.back} size={18} /> {step === 'review' ? 'Edit request' : 'View Medicines'}</button>
            <h1>{step === 'review' ? 'Review Your Request' : 'Medicine Request Form'}</h1>
            <p className="muted">{step === 'review' ? 'Please check the details before submitting.' : 'Enter the details of your medicine request.'}</p>
          </div>
        </header>

        <section className="card form-card">
          {cart.map((c, idx) => {
            const max = Math.min(c.medicine.available_stock, MAX_REQUEST_QUANTITY);
            return (
              <div className="form-med" key={c.medicine.medicine_id}>
                <div className="form-med-head">
                  <span className="form-med-tile"><Svg d={ICONS.pill} size={30} width={1.8} /></span>
                  <div className="form-med-name">
                    <strong>{c.medicine.medicine_name}</strong>
                    <span className="muted">{c.medicine.category} · {c.medicine.unit}</span>
                    <span className={`badge badge-${c.medicine.status}`}>{quantityText(c.medicine.available_stock, c.medicine.unit)} available</span>
                    {c.medicine.requires_prescription && <RxBadge small />}
                  </div>
                  {step === 'form' && cart.length > 1 && (
                    <button className="icon-btn" onClick={() => setCart(cart.filter((_, i) => i !== idx))} aria-label={`Remove ${c.medicine.medicine_name}`}>
                      <Svg d={ICONS.trash} size={18} />
                    </button>
                  )}
                </div>
                {step === 'form' ? (
                  <label>Requested Quantity
                    <select className="select-pill" value={c.quantity} onChange={(e) => setCart(cart.map((x, i) => (i === idx ? { ...x, quantity: Number(e.target.value) } : x)))}>
                      {Array.from({ length: Math.max(max, 1) }, (_, i) => i + 1).map((q) => (
                        <option key={q} value={q}>{quantityText(q, c.medicine.unit)}</option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <div className="review-row"><span>Requested quantity</span><strong>{quantityText(c.quantity, c.medicine.unit)}</strong></div>
                )}
                {cartWarnings[idx] && <p className="field-warning">{cartWarnings[idx]}</p>}
              </div>
            );
          })}

          {step === 'form' ? (
            <>
              <label><span>Reason for Request <span className="muted small">(optional)</span></span>
                <textarea rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder="Enter reason for requesting this medicine… e.g. for my child's fever, maintenance for high blood pressure" />
              </label>
              <p className="field-hint right">{note.length}/500</p>

              {needsRx && (
                <div className="rx-section">
                  <span className="rx-section-title"><Svg d={RX_ICON} size={18} width={2.4} /> Upload Prescription <span className="req-star">*</span></span>
                  <p className="muted small">
                    Required for {rxItems.map((c) => c.medicine.medicine_name).join(', ')}. Upload a clear photo of your doctor's prescription.
                  </p>
                  <PrescriptionUpload value={prescription} onChange={setPrescription} />
                  <p className="rx-note"><Svg d={ICONS.info} size={16} /> The prescription will be reviewed by the pharmacy staff before your request can be approved.</p>
                </div>
              )}

              <div className="info-box info-warn">
                <strong><Svg d={ICONS.info} size={18} /> Important reminder</strong>
                <p>Medicines are not suitable for everyone. Follow a doctor's or health worker's advice on whether to use them and how to take them.</p>
                {needsRx && <p><b>Bring the original prescription when you claim the medicine.</b></p>}
                <p>You can request up to {MAX_REQUEST_QUANTITY} of each medicine per request.</p>
              </div>

              {rxMissing && <p className="field-warning">Please upload your prescription to continue.</p>}
              <button className="btn btn-block btn-lg" disabled={!cartValid || rxMissing} onClick={() => goStep('review')}>Review Request</button>
              <button className="btn btn-outline btn-block" onClick={() => goStep(null)}>+ Add another medicine</button>
            </>
          ) : (
            <>
              <div className="review-note">
                <span className="muted small">Reason for request</span>
                <p>{note.trim() || 'No reason given.'}</p>
              </div>
              {needsRx && prescription && (
                <div className="rx-review-row">
                  <span className="rx-file-icon"><Svg d={RX_ICON} size={22} width={2.2} /></span>
                  <div className="rx-file-info">
                    <span className="muted small">Prescription</span>
                    <strong>{prescription.name}</strong>
                  </div>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setViewRx(true)}>View</button>
                </div>
              )}
              <div className="info-box info-ok">
                <strong><Svg d={ICONS.calendar} size={18} /> What happens next</strong>
                <p>The pharmacy staff will review your request{needsRx ? ' and check your prescription' : ''}. You will get an SMS once it is approved.</p>
                <p>Then claim your medicines at Botika ng Bayan, Bulan within 7 days. Bring your QR code / Resident ID.</p>
              </div>
              {sheetError && <Message>{sheetError}</Message>}
              <button className="btn btn-block btn-lg" disabled={busy || !cartValid || rxMissing} onClick={submitRequest}>
                {busy ? 'Submitting…' : 'Confirm & Submit Request'}
              </button>
              <button className="btn btn-outline btn-block" disabled={busy} onClick={() => navigate(-1)}>Edit request</button>
            </>
          )}
        </section>
        {viewRx && prescription && <PrescriptionViewer local={prescription} onClose={() => setViewRx(false)} />}
      </div>
    );
  }

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
          <div className="filter-panel">
            <div className="search-box search-soft">
              <Svg d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M21 21l-5-5" size={20} />
              <input type="search" placeholder="Search medicine name…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search medicine name" />
            </div>
            <span className="filter-label">Availability</span>
            <div className="chips" role="tablist" aria-label="Availability">
              {([['all', 'All'], ['in_stock', 'Available'], ['out_of_stock', 'Out of Stock']] as const).map(([key, label]) => (
                <button key={key} role="tab" aria-selected={availability === key} className={`chip ${availability === key ? 'active' : ''}`} onClick={() => setAvailability(key)}>{label}</button>
              ))}
            </div>
            <select className="select-pill" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
              <option value="">All Categories</option>
              {categories?.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="filter-foot">
              <h2>{listTitle}</h2>
              <span className="count-pill">{shown.length} item{shown.length === 1 ? '' : 's'}</span>
            </div>
          </div>
          {error && <Message>{error}</Message>}
          {loading && !data ? <Loading /> : !shown.length ? <div className="card"><Empty>No medicines match your search or filters.</Empty></div> : (
            <div className="med-grid">
              {shown.map((m) => {
                const added = inCart(m);
                return (
                  <article key={m.medicine_id} className={`med-card ${added ? 'med-added' : ''} ${m.requires_prescription ? 'med-rx' : ''}`}>
                    <button type="button" className="med-top med-open" onClick={() => setDetails(m)} aria-label={`${m.medicine_name} details`}>
                      <span className="med-icon"><Svg d={m.requires_prescription ? RX_ICON : ICONS.pill} size={22} width={1.9} /></span>
                      <span className="med-name">
                        <strong>{m.medicine_name}</strong>
                        <span className="muted small">{m.category}</span>
                        {m.requires_prescription && <RxBadge small />}
                      </span>
                      <StockBadge m={m} />
                    </button>
                    {m.description && <p className="muted small med-desc">{m.description}</p>}
                    <div className="med-bottom">
                      {m.status === 'unrecorded'
                        ? <span className="med-stock muted">Availability not yet confirmed</span>
                        : <span className="med-stock"><b>{m.available_stock}</b> {m.available_stock === 1 ? m.unit : unitPlural(m.unit)} available</span>}
                      <div className="med-actions">
                        {/* Low stock: the resident may need more than what is left, so restock can be requested too. */}
                        {m.status !== 'available' && (openRestock.has(m.medicine_id) ? (
                          <button className="btn btn-sm btn-added" onClick={() => startRestock(m)} title="You already asked for a restock of this medicine">
                            <Svg d={ICONS.check} size={16} width={2.6} /> Restock requested
                          </button>
                        ) : (
                          <button className="btn btn-outline btn-sm" onClick={() => startRestock(m)}>Request restock</button>
                        ))}
                        {!noStock(m) && (
                          openMedicineReq.has(m.medicine_id) && !added ? (
                            <button className="btn btn-sm btn-added" onClick={() => openAdd(m)} title="Already in one of your requests">
                              <Svg d={ICONS.note} size={16} width={2.2} /> In request No. {openMedicineReq.get(m.medicine_id)?.requestId}
                            </button>
                          ) : (
                            <button className={`btn btn-sm ${added ? 'btn-added' : ''}`} onClick={() => openAdd(m)}>
                              {added ? <><Svg d={ICONS.check} size={16} width={2.6} /> Added ({added.quantity})</> : '+ Add'}
                            </button>
                          )
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
            <small>Tap to continue to the request form</small>
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

      {details && (
        <Modal title="Medicine Details" onClose={() => setDetails(null)}>
          <div className="sheet-med">
            <span className="med-icon"><Svg d={details.requires_prescription ? RX_ICON : ICONS.pill} size={22} width={1.9} /></span>
            <div>
              <strong>{details.medicine_name}</strong>
              <span className="muted small">{details.category} · {details.unit}</span>
            </div>
          </div>
          {details.description && <p className="note-text">{details.description}</p>}
          {details.requires_prescription && (
            <div className="rx-box">
              <strong><Svg d={RX_ICON} size={18} width={2.4} /> Prescription Required</strong>
              <p>This medicine requires a valid prescription from a licensed doctor. Upload a photo of it with your request, and bring the original when you claim the medicine.</p>
            </div>
          )}
          <div className="review-row"><span>Available stock</span><strong>{details.status === 'unrecorded' ? 'Not yet confirmed' : quantityText(details.available_stock, details.unit)}</strong></div>
          <div className="modal-actions">
            <button className="btn btn-outline" onClick={() => setDetails(null)}>Close</button>
            {noStock(details) ? (
              <button className="btn" onClick={() => startRestock(details)}>{openRestock.has(details.medicine_id) ? 'Restock requested' : 'Request restock'}</button>
            ) : (
              <button className="btn" onClick={() => openAdd(details)}>
                {inCart(details) ? 'Change quantity'
                  : openMedicineReq.has(details.medicine_id) ? `In request No. ${openMedicineReq.get(details.medicine_id)?.requestId}`
                    : details.requires_prescription ? 'Request with Prescription' : 'Add to request'}
              </button>
            )}
          </div>
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
          {adding.medicine.requires_prescription && (
            <p className="rx-note"><Svg d={RX_ICON} size={16} width={2.4} /> You will upload your prescription in the request form.</p>
          )}
          <div className="modal-actions">
            <button className="btn btn-outline" onClick={() => setAdding(null)}>Cancel</button>
            <button className="btn" disabled={!!addWarning} onClick={confirmAdd}>{inCart(adding.medicine) ? 'Update' : 'Add to request'}</button>
          </div>
        </Modal>
      )}

      {inRequest && (
        <Modal title="Already in your request" onClose={() => setInRequest(null)}>
          <div className="sheet-med">
            <span className="med-icon"><Svg d={ICONS.pill} size={22} width={1.9} /></span>
            <div>
              <strong>{inRequest.medicine.medicine_name}</strong>
              <span className="muted small">Request No. {inRequest.requestId} · {inRequest.status === 'pending' ? 'Under review' : 'Ready for pickup'}</span>
            </div>
          </div>
          {inRequest.status === 'pending' ? (
            <p>
              You already requested <b>{inRequest.medicine.medicine_name}</b> in request No. {inRequest.requestId}, which is still under review.
              To change the quantity, edit that request instead of making a new one, so the same medicine stays in one request.
            </p>
          ) : (
            <p>
              <b>{inRequest.medicine.medicine_name}</b> is already approved for you in request No. {inRequest.requestId} and is ready for pickup.
              Please claim it at Botika ng Bayan first. If you need a different quantity, you can cancel that request and send a new one.
            </p>
          )}
          <div className="modal-actions">
            <button className="btn btn-outline" onClick={() => setInRequest(null)}>Close</button>
            <button className="btn" onClick={() => navigate(`/requests/${inRequest.requestId}`, { state: { edit: inRequest.status === 'pending' } })}>
              {inRequest.status === 'pending' ? `Edit request No. ${inRequest.requestId}` : `View request No. ${inRequest.requestId}`}
            </button>
          </div>
        </Modal>
      )}

      {alreadyRequested && (
        <Modal title="Restock already requested" onClose={() => setAlreadyRequested(null)}>
          <div className="info-box info-ok">
            <strong><Svg d={ICONS.check} size={18} width={2.4} /> You already submitted a restock request</strong>
            <p>
              You already asked for a restock of <b>{alreadyRequested.medicine.medicine_name}</b> (request No. {alreadyRequested.requestId}).
              We will notify you by SMS when the medicine is available.
            </p>
            <small>You can still request a restock of other medicines.</small>
          </div>
          <div className="modal-actions">
            <button className="btn btn-outline" onClick={() => setAlreadyRequested(null)}>Close</button>
            <button className="btn" onClick={() => navigate(`/requests/${alreadyRequested.requestId}`)}>View my request</button>
          </div>
        </Modal>
      )}

      {restockFor && (
        <Modal title="Request restock" onClose={() => setRestockFor(null)}>
          <p>
            <strong>{restockFor.medicine_name}</strong>{' '}
            {restockFor.status === 'unrecorded' ? 'is not yet available.'
              : restockFor.available_stock > 0 ? `has only ${quantityText(restockFor.available_stock, restockFor.unit)} left.` : 'is currently out of stock.'}{' '}
            The administrator will review your restock request and you will get an SMS once it is available.
          </p>
          <label>Quantity you need ({unitPlural(restockFor.unit)})
            <QtyStepper value={restockQty} min={restockFor.available_stock + 1} max={MAX_REQUEST_QUANTITY} onChange={setRestockQty} />
          </label>
          <p className="field-hint">Up to {MAX_REQUEST_QUANTITY} {unitPlural(restockFor.unit)} per request.</p>
          {restockWarning && <p className="field-warning">{restockWarning}</p>}
          <label>Note for the administrator (optional)
            <textarea rows={2} maxLength={500} value={restockNote} onChange={(e) => setRestockNote(e.target.value)}
              placeholder="e.g. I need this maintenance medicine every month." />
          </label>
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
