// src/pages/Spending.tsx
import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import {
  getCategories,
  getMerchants,
  addTxn,
  listTxns,
  deleteTransaction,     // <-- add
  restoreTransaction     // <-- add
} from '../api';

type SpendForm = {
  date: string;
  amount: number;
  merchantId: string | null;
  merchantName: string;
  categoryId: string | null;
  method: 'debit' | 'credit' | 'cash' | 'ach';
  notes?: string;
};

export default function Spending() {
  const [month, setMonth] = useState(dayjs().format('YYYY-MM'));
  const [cats, setCats] = useState<any[]>([]);
  const [merchants, setMerchants] = useState<any[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [newMerchant, setNewMerchant] = useState('');

  // for delete/undo UI
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [lastDeleted, setLastDeleted] = useState<any | null>(null);

  const [form, setForm] = useState<SpendForm>({
    date: dayjs().format('YYYY-MM-DD'),
    amount: 0,
    merchantId: null,
    merchantName: '',
    categoryId: null,
    method: 'debit',
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
      setMerchants(await getMerchants());
    })();
  }, []);

  async function refreshMonth() {
    setRows(await listTxns(month));
  }

  useEffect(() => {
    (async () => {
      await refreshMonth();
    })();
  }, [month]);

  const totalSpend = rows.reduce((s, r) => s + r.amount_cents / 100, 0);

  // ✅ Only require date, amount, method
  const valid =
    form.amount > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(form.date) &&
    ['debit', 'credit', 'cash', 'ach'].includes(form.method);

  // helpful util: strip empty optionals before POST
  function cleanPayload<T extends Record<string, any>>(obj: T): Record<string, any> {
    const out: Record<string, any> = { ...obj };
    if (!out.merchantId) delete out.merchantId;
    if (!out.merchantName || !String(out.merchantName).trim()) delete out.merchantName;
    if (!out.categoryId) delete out.categoryId;
    if (!out.notes || !String(out.notes).trim()) delete out.notes;
    return out;
  }


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
        <span className="kpi">Total: <strong>${totalSpend.toFixed(2)}</strong></span>
      </div>

      {err && <div className="alert">{err}</div>}

      {/* Undo banner */}
      {lastDeleted && (
        <div className="alert" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Transaction deleted.</span>
          <button
            className="btn"
            onClick={async () => {
              try {
                await restoreTransaction(lastDeleted.id);
                setRows(prev => [lastDeleted, ...prev].sort((a,b) => a.date.localeCompare(b.date)));
                setLastDeleted(null);
              } catch (e) {
                showError(e);
              }
            }}
          >
            Undo
          </button>
        </div>
      )}

      {/* Add Spending */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Add Spending</h3>

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
          <label>Merchant (select)</label>
          <select
            className="select"
            value={form.merchantId || ''}
            onChange={e =>
              setForm({
                ...form,
                merchantId: e.target.value || null,
                merchantName: '' // clear free-text if selecting
              })
            }
          >
            <option value="">(or type one below)</option>
            {merchants.map((m: any) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>

        <div className="inline-add" style={{ marginTop: 6 }}>
          <input
            className="input"
            placeholder="New merchant name"
            value={newMerchant}
            onChange={e => setNewMerchant(e.target.value)}
          />
          <button
            className="btn"
            onClick={async () => {
              try {
                const name = newMerchant.trim();
                if (!name) return;
                await fetch('/api/merchants', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ name })
                });
                setMerchants(await getMerchants());
                setNewMerchant('');
              } catch (e) { showError(e); }
            }}
          >
            Add
          </button>
        </div>

        <div className="row">
          <label>Or Merchant Name (free text)</label>
          <input
            className="input"
            value={form.merchantName}
            onChange={e => setForm({ ...form, merchantName: e.target.value })}
            placeholder="e.g., Target, Amazon, Gas, etc."
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
              .filter(c => c.kind === 'spend')
              .map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
          </select>
        </div>

        <div className="row">
          <label>Method</label>
          <select
            className="select"
            value={form.method}
            onChange={e => setForm({ ...form, method: e.target.value as SpendForm['method'] })}
          >
            <option>debit</option>
            <option>credit</option>
            <option>cash</option>
            <option>ach</option>
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
              const payload = cleanPayload({ ...form });
              await addTxn(payload);
              await refreshMonth();
              setForm({ ...form, amount: 0, merchantName: '', notes: '' });
            } catch (e) {
              showError(e);
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? 'Saving…' : 'Add Spending'}
        </button>
      </div>

      {/* Spending list */}
      <div className="card">
        <h3>Spending for {month}</h3>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Merchant</th>
              <th>Category</th>
              <th>Method</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
              <th /> {/* actions */}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const merchantName =
                r.merchant_name ||
                merchants.find((m: any) => m.id === r.merchant_id)?.name ||
                '—';
              const categoryName =
                cats.find(c => c.id === r.category_id)?.name || '—';
              return (
                <tr key={r.id}>
                  <td>{dayjs(r.date).format('YYYY-MM-DD')}</td>
                  <td>{merchantName}</td>
                  <td>{categoryName}</td>
                  <td>{r.method}</td>
                  <td style={{ textAlign: 'right' }}>${(r.amount_cents / 100).toFixed(2)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="btn"
                      title="Delete"
                      aria-label="Delete transaction"
                      disabled={pendingId === r.id}
                      onClick={async () => {
                        if (!confirm('Delete this transaction?')) return;
                        setPendingId(r.id);
                        setLastDeleted(r);                        // keep for Undo
                        setRows(prev => prev.filter(x => x.id !== r.id)); // optimistic

                        try {
                          await deleteTransaction(r.id);
                          // keep lastDeleted available for undo
                        } catch (e) {
                          // rollback
                          setRows(prev => [r, ...prev].sort((a,b) => a.date.localeCompare(b.date)));
                          setLastDeleted(null);
                          showError(e);
                        } finally {
                          setPendingId(null);
                        }
                      }}
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} style={{ color: '#58719d' }}>No spending yet for this month.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
