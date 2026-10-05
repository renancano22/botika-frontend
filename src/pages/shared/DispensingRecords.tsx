import { useState } from 'react';
import { formatDate } from '../../api';
import { useAuth } from '../../auth';
import { useApi } from '../../hooks';
import { Card, Empty, Loading, Message } from '../../components/ui';
import type { Dispensing } from '../../types';

/** Monitoring of medicine distribution and patient dispensing records (Objective 3.2). */
export default function DispensingRecords() {
  const { user } = useAuth();
  const isResident = user?.role === 'resident';
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const { data, error, loading } = useApi<Dispensing[]>('/dispensing', { from, to }, 30000);

  return (
    <div className="page">
      <header className="page-head"><h1>{isResident ? 'My Medicine History' : 'Dispensing Records'}</h1></header>
      <Message>{error}</Message>
      <Card actions={
        <div className="filters">
          <label className="inline">From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="inline">To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
      }>
        {loading && !data ? <Loading /> : !data?.length ? <Empty>No dispensing records.</Empty> : (
          <table>
            <thead>
              <tr><th>#</th><th>Date & time</th>{!isResident && <th>Resident (Patient ID)</th>}<th>Medicines</th><th>Request #</th><th>Dispensed by</th></tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.dispensing_id}>
                  <td>{d.dispensing_id}</td>
                  <td className="nowrap">{formatDate(d.dispensed_at, true)}</td>
                  {!isResident && <td>{d.request?.resident?.name}<div className="muted small">{d.request?.resident?.qr_code}</div></td>}
                  <td>{d.items.map((i) => `${i.medicine.medicine_name} ×${i.quantity}`).join(', ')}</td>
                  <td>{d.request_id}</td>
                  <td>{d.dispenser?.name ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
