import { useEffect, useState } from 'react';
import { changePassword, getAssumptions, updateAssumptions } from '../api';

export default function Settings() {
  // password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // assumptions form
  const [currentSavings, setCurrentSavings] = useState(0);
  const [asOfDate, setAsOfDate] = useState('');
  const [apr, setApr] = useState('');
  const [inflation, setInflation] = useState('');

  const [savingPwd, setSavingPwd] = useState(false);
  const [savingAssump, setSavingAssump] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (async () => {
      const a = await getAssumptions();
      if (a) {
        setCurrentSavings((a.current_savings_cents || 0) / 100);
        setAsOfDate(a.as_of_date?.slice(0,10) || '');
        setApr(a.savings_apr != null ? String(a.savings_apr) : '');
        setInflation(a.inflation_pct != null ? String(a.inflation_pct) : '');
      } else {
        // sensible defaults
        const today = new Date().toISOString().slice(0,10);
        setAsOfDate(today);
      }
    })();
  }, []);

  function flash(text) {
    setMsg(text);
    setTimeout(() => setMsg(''), 2500);
  }

  return (
    <div className="container">
      <h2 style={{ marginBottom: 12 }}>Settings</h2>
      {msg && <div className="kpi" style={{ display:'block', marginBottom:12 }}>{msg}</div>}

      {/* Change password */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Change password</h3>
        <p style={{ color: 'var(--muted)', marginTop: 4 }}>
          If your account was created during testing, current password may be empty—leave it blank to set one.
        </p>
        <div className="row">
          <label>Current password</label>
          <input className="input" type="password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} />
        </div>
        <div className="row">
          <label>New password</label>
          <input className="input" type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} />
        </div>
        <button
          className="btn btn-primary"
          disabled={savingPwd || newPassword.length < 6}
          onClick={async ()=>{
            try{
              setSavingPwd(true);
              await changePassword(currentPassword || undefined, newPassword);
              setCurrentPassword(''); setNewPassword('');
              flash('Password updated.');
            }catch(e){ alert(e?.message || 'Failed to update password'); }
            finally{ setSavingPwd(false); }
          }}
        >
          {savingPwd ? 'Saving…' : 'Update Password'}
        </button>
      </div>

      {/* Current savings / assumptions */}
      <div className="card">
        <h3>Current savings and assumptions</h3>
        <div className="row">
          <label>Current savings (USD)</label>
          <input className="input" type="number" step="0.01" value={currentSavings}
                 onChange={e=>setCurrentSavings(Number(e.target.value))} />
        </div>
        <div className="row">
          <label>As of date (YYYY-MM-DD)</label>
          <input className="input" type="date" value={asOfDate} onChange={e=>setAsOfDate(e.target.value)} />
        </div>
        <div className="row">
          <label>Savings APR (%) — optional</label>
          <input className="input" type="number" step="0.01" value={apr} onChange={e=>setApr(e.target.value)} />
        </div>
        <div className="row">
          <label>Inflation (%) — optional</label>
          <input className="input" type="number" step="0.01" value={inflation} onChange={e=>setInflation(e.target.value)} />
        </div>
        <button
          className="btn btn-primary"
          disabled={savingAssump || !asOfDate || !(currentSavings >= 0)}
          onClick={async ()=>{
            try{
              setSavingAssump(true);
              await updateAssumptions({
                currentSavings,
                asOfDate,
                apr: apr === '' ? undefined : Number(apr),
                inflation: inflation === '' ? undefined : Number(inflation),
              });
              flash('Assumptions saved.');
            }catch(e){ alert(e?.message || 'Failed to save assumptions'); }
            finally{ setSavingAssump(false); }
          }}
        >
          {savingAssump ? 'Saving…' : 'Save Assumptions'}
        </button>
      </div>
    </div>
  );
}
