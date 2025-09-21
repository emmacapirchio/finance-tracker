// src/AuthGate.jsx
import { useEffect, useState } from 'react';
import { me, login, register, logout } from './api';

export default function AuthGate({ children }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('test@example.com');
  const [password, setPassword] = useState('testing1');
  const [error, setError] = useState('');

  async function refresh() {
    setChecking(true);
    try {
      const u = await me(); // returns {id,email,username} or 401 handled by api.ts
      setUser(u);
    } catch {
      setUser(null);
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      if (mode === 'login') await login(email, password);
      else await register(email, password);
      await refresh();
    } catch (err) {
      setError(err.message || 'Failed');
    }
  }

  async function onLogout() {
    await logout();
    setUser(null);
  }

  if (checking) return <div style={{ padding: 16 }}>Loading…</div>;

  if (!user) {
    return (
      <div className="card" style={{ maxWidth: 420, margin: '24px auto' }}>
        <h3 style={{ marginBottom: 12 }}>{mode === 'login' ? 'Log in' : 'Register'}</h3>
        {error && <div className="error" style={{ marginBottom: 8 }}>{error}</div>}
        <form onSubmit={onSubmit}>
          <div className="row">
            <label>Email</label>
            <input className="input" value={email} onChange={e=>setEmail(e.target.value)} />
          </div>
          <div className="row">
            <label>Password</label>
            <input className="input" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
          </div>
          <button className="btn btn-primary" type="submit">
            {mode === 'login' ? 'Log in' : 'Create account'}
          </button>
          <button
            type="button"
            className="btn"
            style={{ marginLeft: 8 }}
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
          >
            {mode === 'login' ? 'Need an account?' : 'Have an account? Log in'}
          </button>
        </form>
        <p style={{ opacity: 0.7, marginTop: 8 }}>
          Uses HTTP-only cookie <code>fin_auth</code>.
        </p>
      </div>
    );
  }

  // Authenticated header w/ logout
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px' }}>
        <div>Signed in as <strong>{user.email || user.id}</strong></div>
        <button className="btn" onClick={onLogout}>Log out</button>
      </div>
      {children}
    </>
  );
}
