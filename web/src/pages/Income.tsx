// src/pages/Income.tsx
import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { getCategories, addIncome, listIncome, deleteIncome } from '../api';

type IncomeForm = {
  date: string;
  amount: number;
  source: string;
  categoryId: string | null;
  notes?: string;
};

export default function Income() {
  const [month, setMonth] = useState(dayjs().format('YYYY-MM'));
  const [cats, setCats] = useState<any[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  // delete state
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const [form, setForm] = useState<IncomeForm>({
    date: dayjs().format('YYYY-MM-DD'),
    amount: 0,
    source: 'Job',
    categoryId: null,
    notes: ''
  });

  function showError(e: any) {
    console.error(e);
    const msg = e?.response?.data?.error
      ? (typeof e.response.data.error === 'string'
          ? e.response.data.error
          : JSON.stringify(e.response.data.error, null, 2))
      : e?.message || 'Unknown error';
    setErr(msg);
    setTimeout(() => setErr(''), 4000);
  }

  useEffect(() => {
    (async () => {
      setCats(await getCategories());
    })();
  }, []);

  useEffect(() => {
    (async () => {
      setRows(await listIncome(month));
    })();
  }, [month]);

  const totalIncome = rows.reduce((s, r) => s + r.amount_cents / 100, 0);
  const valid =
    form.amount > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(form.date) &&
    Boolean(form.source.trim());

  return (
    <>
      <div className="hstack toolbar" style={{ marginBottom: 16 }}>
        <label>Month</label>
        <input
          className="input"
          type="month"
          value={month}
          onChange={e => setMonth(e.target.value)}
        />
        <span className="kpi">Total: <strong>${totalIncome.toFixed(2)}</strong></span>
      </div>

      {err && <div className="alert">{err}</div>}

      {/* Add Income */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Add Income</h3>
        <div className="row">
          <label>Date</label>
          <input
            className="input"
            type="date"
            value={form.date}
            onChange={e => setForm({ ...form, date: e.target.value })}
          />
        </div>

        <div className="row">
          <label>Amount</label>
          <input
            className="input"
            type="number"
            step="0.01"
            value={form.amount || ''}
            onChange={e => setForm({ ...form, amount: Number(e.target.value) })}
          />
        </div>

        <div className="row">
          <label>Source</label>
          <input
            className="input"
            value={form.source}
            onChange={e => setForm({ ...form, source: e.target.value })}
          />
        </div>

        <div className="row">
          <label>Category</label>
          <select
            className="select"
            value={form.categoryId || ''}
            onChange={e => setForm({ ...form, categoryId: e.target.value || null })}
          >
            <option value="">(none)</option>
            {cats
              .filter(c => c.kind === 'income')
              .map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
          </select>
        </div>

        <div className="row">
          <label>Notes (optional)</label>
          <textarea
            className="textarea"
            rows={3}
            value={form.notes || ''}
            onChange={e => setForm({ ...form, notes: e.target.value })}
          />
        </div>

        <button
          className="btn btn-primary"
          disabled={saving || !valid}
          onClick={async () => {
            try {
              setSaving(true);
              const payload: any = { ...form };
              if (!payload.categoryId) delete payload.categoryId; // don’t send null
              await addIncome(payload);
              setRows(await listIncome(month));
              setForm({ ...form, amount: 0, notes: '' });
            } catch (e) {
              showError(e);
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? 'Saving…' : 'Add Income'}
        </button>
      </div>

      {/* Income list */}
      <div className="card">
        <h3>Income for {month}</h3>
        <table style={{ tableLayout: 'fixed', width: '100%' }}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Source</th>
              <th>Category</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
              <th style={{ width: 1, whiteSpace: 'nowrap', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td>{dayjs(r.date).format('YYYY-MM-DD')}</td>
                <td>{r.source}</td>
                <td>{cats.find(c => c.id === r.category_id)?.name || '—'}</td>
                <td style={{ textAlign: 'right' }}>${(r.amount_cents / 100).toFixed(2)}</td>
                <td style={{ textAlign: 'right' }}>
                  <button
                    className="btn"
                    title="Delete"
                    aria-label="Delete income"
                    disabled={pendingDeleteId === r.id}
                    onClick={async () => {
                      if (!confirm('Delete this income item?')) return;
                      const id = r.id;
                      setPendingDeleteId(id);
                      const snapshot = rows;
                      // optimistic remove
                      setRows(prev => prev.filter(x => x.id !== id));
                      try {
                        await deleteIncome(id);
                      } catch (e) {
                        // rollback on failure
                        setRows(snapshot);
                        showError(e);
                      } finally {
                        setPendingDeleteId(null);
                      }
                    }}
                    style={{
                      padding: '4px 10px',
                      border: '1px solid #e2e8f0',
                      borderRadius: 6,
                      background: '#fff',
                      lineHeight: 1.1,
                      cursor: pendingDeleteId === r.id ? 'not-allowed' : 'pointer'
                    }}
                  >
                    🗑️ <span style={{ fontSize: 12, marginLeft: 4 }}>Delete</span>
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} style={{ color: '#58719d' }}>No income yet for this month.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
