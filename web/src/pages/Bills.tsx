import { useEffect, useState } from 'react';

/* ---------- Types ---------- */

type Cadence = 'monthly' | 'annual' | 'weekly' | 'biweekly' | 'quarterly' | 'once';
type Method  = 'debit' | 'credit' | 'cash' | 'ach';
type BillType = 'bill' | 'subscription';

type BillPost = {
  name: string;
  amount: number;                 // dollars in UI
  cadence: Cadence;
  type: BillType;
  due_day?: number | null;
  start_date?: string | null;     // YYYY-MM-DD or null
  end_date?: string | null;       // YYYY-MM-DD or null
  method?: Method | null;
  notes?: string | null;
};

type BillRow = {
  id: string;
  user_id: string;
  name: string;
  amount_cents: number;
  cadence: Cadence;
  type: BillType;
  due_day: number | null;
  start_date: string | null;      // may be ISO from API; we only display name/amount here
  end_date: string | null;
  payment_method: Method | null;
  notes: string | null;
};

/* ---------- Component ---------- */

export default function Bills() {
  const [rows, setRows] = useState<BillRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [bill, setBill] = useState<BillPost>({
    name: '',
    amount: 0,
    cadence: 'monthly',
    type: 'bill',
    due_day: undefined,
    start_date: null,
    end_date: null,
    method: 'ach',
    notes: ''
  });

  async function load() {
    setLoading(true);
    setErr(null);
    try {
        const userId = localStorage.getItem('userId')!;
        const r = await fetch('/api/bills?type=all&userId=${userId}', { credentials: 'include' });
        if (!r.ok) throw new Error(`Load failed: ${r.status}`);
        const data: BillRow[] = await r.json();
        setRows(data);
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to load bills');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function sanitizeForPost(b: BillPost) {
    // normalize strings
    const name = (b.name ?? '').trim();
    const notes = (b.notes ?? '').trim();
    // clamp/round money to 2 decimals
    const amount = Number.isFinite(b.amount) ? Math.max(0, Math.round(b.amount * 100) / 100) : 0;
    const amount_cents = Math.round(amount * 100);
    // convert empty → null
    const due_day = b.due_day === undefined || b.due_day === null || b.due_day === 0 ? null : b.due_day;
    const start_date = b.start_date && b.start_date.trim() !== '' ? b.start_date : null;
    const end_date   = b.end_date   && b.end_date.trim()   !== '' ? b.end_date   : null;
    const method     = b.method ?? null;

    return { name, amount_cents, cadence: b.cadence, type: b.type, due_day, start_date, end_date, payment_method: b.method ?? null, notes: notes || null };
  }

  async function addBill() {
    setErr(null);
    const payload = sanitizeForPost(bill);
    try {
      const r = await fetch('/api/bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const msg = await r.text();
        throw new Error(msg || `Add failed: ${r.status}`);
      }
      // reset a few fields, keep cadence/method for convenience
      setBill(b => ({ ...b, name: '', amount: 0, due_day: undefined, notes: '' }));
      await load();
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to add bill');
    }
  }

  async function remove(id: string) {
    setErr(null);
    // optimistic UI (optional)
    const prev = rows;
    setRows(rs => rs.filter(r => r.id !== id));
    try {
      const r = await fetch(`/api/bills/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!r.ok) throw new Error(`Delete failed: ${r.status}`);
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to delete bill');
      setRows(prev); // rollback
    }
  }

  return (
    <>
      <h3>Bills (recurring)</h3>

      <div className="card" style={{ marginBottom: 12 }}>
        {err && <div className="error" style={{ marginBottom: 8 }}>{err}</div>}

        <div className="row">
          <label>Name</label>
          <input
            className="input"
            value={bill.name}
            onChange={e => setBill({ ...bill, name: e.target.value })}
          />
        </div>

        <div className="row">
          <label>Amount</label>
          <input
            className="input"
            type="number"
            step="0.01"
            inputMode="decimal"
            value={bill.amount || ''}
            onChange={e => setBill({ ...bill, amount: Number(e.target.value) })}
          />
        </div>

        <div className="row">
          <label>Cadence</label>
          <select
            className="select"
            value={bill.cadence}
            onChange={e => setBill({ ...bill, cadence: e.target.value as Cadence })}
          >
            <option>monthly</option>
            <option>annual</option>
            <option>biweekly</option>
            <option>weekly</option>
            <option>quarterly</option>
            <option>once</option>
          </select>
        </div>

        <div className="row">
            <label>Type</label>
            <select
                className="select"
                value={bill.type}
                onChange={e => setBill({ ...bill, type: e.target.value as 'bill' | 'subscription' })}
            >
                <option value="bill">bill</option>
                <option value="subscription">subscription</option>
            </select>
        </div>


        <div className="row">
          <label>Due day (1–31, optional)</label>
          <input
            className="input"
            type="number"
            min={1}
            max={31}
            value={bill.due_day ?? ''}
            onChange={e =>
              setBill({
                ...bill,
                due_day: e.target.value ? Number(e.target.value) : undefined,
              })
            }
          />
        </div>

        {/* Optional: method + dates */}
        <div className="row">
          <label>Method</label>
          <select
            className="select"
            value={bill.method ?? ''}
            onChange={e => setBill({ ...bill, method: (e.target.value || null) as Method | null })}
          >
            <option value="">(none)</option>
            <option value="ach">ach</option>
            <option value="debit">debit</option>
            <option value="credit">credit</option>
            <option value="cash">cash</option>
          </select>
        </div>

        <div className="row">
          <label>Start date (YYYY-MM-DD)</label>
          <input
            className="input"
            type="date"
            value={bill.start_date ?? ''}
            onChange={e => setBill({ ...bill, start_date: e.target.value || null })}
          />
        </div>

        <div className="row">
          <label>End date (YYYY-MM-DD)</label>
          <input
            className="input"
            type="date"
            value={bill.end_date ?? ''}
            onChange={e => setBill({ ...bill, end_date: e.target.value || null })}
          />
        </div>

        <div className="row">
          <label>Notes</label>
          <input
            className="input"
            value={bill.notes ?? ''}
            onChange={e => setBill({ ...bill, notes: e.target.value })}
          />
        </div>

        <button className="btn btn-primary" onClick={addBill} disabled={loading}>
          {loading ? 'Saving…' : 'Add Bill'}
        </button>
      </div>

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
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{r.cadence}</td>
                  <td style={{ textAlign: 'right' }}>${(r.amount_cents / 100).toFixed(2)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn" onClick={() => remove(r.id)}>Delete</button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && !loading && (
                <tr><td colSpan={4} style={{ padding: 12, opacity: 0.7 }}>No bills yet.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
