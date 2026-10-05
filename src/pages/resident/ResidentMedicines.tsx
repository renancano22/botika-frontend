import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../../api';
import { useApi } from '../../hooks';
import { Badge, Card, Empty, Loading, Message, Modal } from '../../components/ui';
import type { Medicine } from '../../types';

type CartItem = { medicine: Medicine; quantity: number };

/** Resident: view/search medicine availability, submit a medicine request or a restock request. */
export default function ResidentMedicines() {
  const [search, setSearch] = useState('');
  const { data, error, loading } = useApi<Medicine[]>('/medicines', { search }, 30000);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [restockFor, setRestockFor] = useState<Medicine | null>(null);
  const [restockQty, setRestockQty] = useState(1);
  const [msg, setMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const addToCart = (m: Medicine) => {
    if (cart.some((c) => c.medicine.medicine_id === m.medicine_id)) return;
    setCart([...cart, { medicine: m, quantity: 1 }]);
  };

  const submit = async (type: 'medicine' | 'restock', items: { medicine_id: number; quantity: number }[]) => {
    setBusy(true);
    setMsg(null);
    try {
      await api.post('/requests', { request_type: type, items });
      if (type === 'medicine') {
        setCart([]);
        navigate('/requests');
      } else {
        setRestockFor(null);
        setMsg({ type: 'success', text: 'Restock request sent. You will receive an SMS once the medicine is available.' });
      }
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Check Medicine Availability</h1>
          <p className="muted">Add available medicines to your request. If a medicine is out of stock, send a restock request.</p>
        </div>
      </header>
      {msg && <Message type={msg.type}>{msg.text}</Message>}

      <div className="grid-main">
        <Card title="Medicines" actions={<input className="search" placeholder="Search medicine or category…" value={search} onChange={(e) => setSearch(e.target.value)} />}>
          {error && <Message>{error}</Message>}
          {loading && !data ? <Loading /> : !data?.length ? <Empty>No medicines found.</Empty> : (
            <table>
              <thead><tr><th>Medicine</th><th>Category</th><th>Available</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {data.map((m) => (
                  <tr key={m.medicine_id}>
                    <td><strong>{m.medicine_name}</strong>{m.description && <div className="muted small">{m.description}</div>}</td>
                    <td>{m.category}</td>
                    <td>{m.available_stock} {m.unit}</td>
                    <td><Badge value={m.status} /></td>
                    <td className="right">
                      {m.status === 'out_of_stock'
                        ? <button className="btn btn-outline btn-sm" onClick={() => { setRestockFor(m); setRestockQty(1); }}>Request restock</button>
                        : <button className="btn btn-sm" onClick={() => addToCart(m)} disabled={cart.some((c) => c.medicine.medicine_id === m.medicine_id)}>Add</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="My medicine request">
          {cart.length === 0 ? <Empty>Add medicines from the list.</Empty> : (
            <>
              {cart.map((c, idx) => (
                <div className="cart-row" key={c.medicine.medicine_id}>
                  <div><strong>{c.medicine.medicine_name}</strong><div className="muted small">max {c.medicine.available_stock} {c.medicine.unit}</div></div>
                  <input type="number" min={1} max={c.medicine.available_stock} value={c.quantity}
                    onChange={(e) => setCart(cart.map((x, i) => (i === idx ? { ...x, quantity: Number(e.target.value) } : x)))} />
                  <button className="btn-ghost" onClick={() => setCart(cart.filter((_, i) => i !== idx))} aria-label="Remove">✕</button>
                </div>
              ))}
              <button className="btn btn-block" disabled={busy}
                onClick={() => submit('medicine', cart.map((c) => ({ medicine_id: c.medicine.medicine_id, quantity: c.quantity })))}>
                {busy ? 'Submitting…' : 'Submit request'}
              </button>
            </>
          )}
        </Card>
      </div>

      {restockFor && (
        <Modal title="Request restock" onClose={() => setRestockFor(null)}>
          <p><strong>{restockFor.medicine_name}</strong> is currently out of stock. The administrator will review your restock request and you will get an SMS once it is available.</p>
          <label>Quantity you need ({restockFor.unit})
            <input type="number" min={1} value={restockQty} onChange={(e) => setRestockQty(Number(e.target.value))} />
          </label>
          <div className="modal-actions">
            <button className="btn btn-outline" onClick={() => setRestockFor(null)}>Cancel</button>
            <button className="btn" disabled={busy} onClick={() => submit('restock', [{ medicine_id: restockFor.medicine_id, quantity: restockQty }])}>Send restock request</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
