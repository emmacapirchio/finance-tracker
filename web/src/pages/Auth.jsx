// src/pages/Auth.jsx
import { useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { login, register } from '../api';

export default function AuthPage() {
  const nav = useNavigate();
  const loc = useLocation();
  const from = (loc.state && loc.state.from) || '/';

  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      if (mode === 'login') await login(email, password);
      else await register(email, password);
      nav(from, { replace: true });
    } catch (err) {
      setError(err?.message || 'Failed');
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100vw',               // <-- force full viewport width
        display: 'grid',
        placeItems: 'center',         // <-- perfect centering
        padding: 24,
        background: '#eaf2ff',
      }}
    >
      <div className="card" style={{ width: 380, padding: 24, margin: 0 }}>
        <h2 style={{ textAlign: 'center', marginBottom: 16 }}>
          {mode === 'login' ? 'Log In' : 'Create Account'}
        </h2>
        {error && <div className="error" style={{ marginBottom: 12, textAlign: 'center' }}>{error}</div>}

        <form onSubmit={onSubmit}>
          <div className="row">
            <label>Email</label>
            <input className="input" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="row">
            <label>Password</label>
            <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} />
          </div>

          <button className="btn btn-primary" style={{ width: '100%', marginTop: 12 }} type="submit">
            {mode === 'login' ? 'Log in' : 'Register'}
          </button>
        </form>

        <div style={{ marginTop: 12, textAlign: 'center' }}>
          <button className="btn" type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? 'Need an account?' : 'Already have an account? Log in'}
          </button>
        </div>

        <div style={{ marginTop: 8, textAlign: 'center' }}>
          <Link className="btn" to="/">Cancel</Link>
        </div>
      </div>
    </div>
  );
}
