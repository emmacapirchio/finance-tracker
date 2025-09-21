import { useEffect, useMemo, useState } from 'react';

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

// normalize mixed cadences to monthly
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

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const userId = localStorage.getItem('userId');
      const url = `/api/subscriptions${userId ? `?userId=${userId}` : ''}`;
      const r = await fetch(url, { credentials: 'include' });
      if (!r.ok) throw new Error(`Load failed: ${r.status}`);
      setRows(await r.json());
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to load subscriptions');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // optional: reclassify back to bill
  async function markAsBill(id: string) {
    setErr(null);
    const prev = rows;
    setRows(rs => rs.filter(r => r.id !== id)); // optimistic
    try {
      const r = await fetch(`/api/bills/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ type: 'bill' }),
      });
      if (!r.ok) throw new Error(`Update failed: ${r.status}`);
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to update');
      setRows(prev); // rollback
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
                    <button className="btn" onClick={() => markAsBill(r.id)}>Mark as bill</button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && !loading && (
                <tr><td colSpan={4} style={{ padding: 12, opacity: 0.7 }}>No subscriptions yet.</td></tr>
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
