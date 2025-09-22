// src/pages/Subscriptions.tsx
import { useEffect, useMemo, useState } from 'react';
import { listBills, updateBill } from '../api';

type Cadence = 'monthly' | 'annual' | 'weekly' | 'biweekly' | 'quarterly' | 'once';
type Row = {
  id: string;
  name: string;
  amount_cents: number;
  cadence: Cadence;
  due_day: number | null;
  notes: string | null;
};

function dollars(cents: number) {
  return (cents / 100).toFixed(2);
}

// Normalize mixed cadences to monthly cents
function monthlyFrom(cents: number, cadence: Cadence) {
  switch (cadence) {
    case 'monthly':   return cents;
    case 'weekly':    return Math.round((cents * 52) / 12);
    case 'biweekly':  return Math.round((cents * 26) / 12);
    case 'quarterly': return Math.round(cents / 3);
    case 'annual':    return Math.round(cents / 12);
    case 'once':      return 0;
    default:          return cents;
  }
}

export default function Subscriptions() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const data: Row[] = await listBills('subscription'); // cookie-based auth
      setRows(data);
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to load subscriptions');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // Reclassify back to bill (optimistic)
  async function markAsBill(id: string) {
    setErr(null);
    setUpdatingId(id);
    const prev = rows;
    setRows(rs => rs.filter(r => r.id !== id)); // optimistic removal
    try {
      await updateBill(id, { type: 'bill' });
      // success: row is no longer a subscription, so we keep it removed
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to update');
      setRows(prev); // rollback on failure
    } finally {
      setUpdatingId(null);
    }
  }

  const monthlyTotal = useMemo(
    () => rows.reduce((sum, r) => sum + monthlyFrom(r.amount_cents, r.cadence), 0),
    [rows]
  );

  return (
    <>
      <h3>Subscriptions (auto-billed)</h3>

      {err && <div className="error" style={{ marginBottom: 8 }}>{err}</div>}

      <div className="card">
        {loading && rows.length === 0 ? (
          <div style={{ padding: 12 }}>Loading…</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Cadence</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th style={{ textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td>
                    <div>{r.name}</div>
                    {r.notes && <div style={{ opacity: 0.7, fontSize: 12 }}>{r.notes}</div>}
                  </td>
                  <td>{r.cadence}{r.due_day ? ` • due ${r.due_day}` : ''}</td>
                  <td style={{ textAlign: 'right' }}>${dollars(r.amount_cents)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="btn"
                      onClick={() => markAsBill(r.id)}
                      disabled={updatingId === r.id}
                    >
                      {updatingId === r.id ? 'Updating…' : 'Mark as bill'}
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && !loading && (
                <tr>
                  <td colSpan={4} style={{ padding: 12, opacity: 0.7 }}>
                    No subscriptions yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
        <div style={{ opacity: 0.7, fontSize: 12 }}>
          One-time items are excluded from monthly total; other cadences normalized.
        </div>
        <div><strong>Est. monthly total:</strong> ${dollars(monthlyTotal)}</div>
      </div>
    </>
  );
}
