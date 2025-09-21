// src/pages/Dashboard.tsx
import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { listIncome, listTxns, getSummary, getForecast } from '../api';

export default function Dashboard({ initialMonth }: { initialMonth: string }) {
  const [month, setMonth] = useState(initialMonth);
  const [incomeRows, setIncomeRows] = useState<any[]>([]);
  const [txnRows, setTxnRows] = useState<any[]>([]);
  const [summary, setSummary] = useState<{income:number; spending:number; net:number} | null>(null);
  const [forecast, setForecast] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const [inc, tx, sum, f] = await Promise.all([
        listIncome(month),
        listTxns(month),
        getSummary(month),     // <-- use axios helper that targets :4000
        getForecast(month),
      ]);
      setIncomeRows(inc);
      setTxnRows(tx);
      setSummary(sum);
      setForecast(f);
    })();
  }, [month]);

  return (
    <>
      <div className="hstack toolbar" style={{ marginBottom: 16 }}>
        <label>Month</label>
        <input className="input" type="month" value={month} onChange={e => setMonth(e.target.value)} />
      </div>

      <div className="hstack" style={{ gap: 12, marginBottom: 12, flexWrap:'wrap' }}>
        <span className="kpi">Income: <strong>${(summary?.income ?? 0).toFixed(2)}</strong></span>
        <span className="kpi">Spending: <strong>${(summary?.spending ?? 0).toFixed(2)}</strong></span>
        <span className="kpi">Net: <strong>${(summary?.net ?? 0).toFixed(2)}</strong></span>
      </div>

      <section className="grid-2">
        <div className="card">
          <h3>Recent income</h3>
          <ul>
            {incomeRows.slice(-5).reverse().map(r => (
              <li key={r.id}>
                {dayjs(r.date).format('YYYY-MM-DD')} — ${(r.amount_cents/100).toFixed(2)} — {r.source}
              </li>
            ))}
          </ul>
        </div>
        <div className="card">
          <h3>Recent spending</h3>
          <ul>
            {txnRows.slice(-5).reverse().map(r => (
              <li key={r.id}>
                {dayjs(r.date).format('YYYY-MM-DD')} — ${(r.amount_cents/100).toFixed(2)} — {r.merchant_name || r.merchant_id}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section-title">
        <h3>Forecast to Dec 2027</h3>
        <div className="card" style={{ maxHeight: 260, overflow: 'auto' }}>
          <table>
            <thead><tr><th>Month</th><th style={{textAlign:'right'}}>Net</th><th style={{textAlign:'right'}}>Projected savings</th></tr></thead>
            <tbody>
              {forecast.map(r => (
                <tr key={r.month_key}>
                  <td>{r.month_key}</td>
                  <td style={{textAlign:'right'}}>${(r.net_change_cents/100).toFixed(2)}</td>
                  <td style={{textAlign:'right', fontWeight:600}}>${(r.savings_cents/100).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
