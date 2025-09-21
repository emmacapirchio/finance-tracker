// src/components/RequireAuth.jsx
import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { me, logout } from '../api';

export default function RequireAuth({ children }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState(null);
  const location = useLocation();

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const u = await me();
        if (active) {
          setUser(u);
          setChecking(false);
        }
      } catch (err) {
        if (active) {
          console.error('Auth check failed:', err);
          setError(err);
          setChecking(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function handleLogout() {
    try {
      await logout();
    } finally {
      setUser(null);
    }
  }

  if (checking) return <div style={{ padding: 16 }}>Loading…</div>;

  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname }}
      />
    );
  }

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          padding: '8px 12px',
          background: '#f5f5f5',
          borderBottom: '1px solid #ddd',
        }}
      >
        <span style={{ marginRight: 12 }}>
          Signed in as <strong>{user.email || user.id}</strong>
        </span>
        <button className="btn" onClick={handleLogout}>
          Log out
        </button>
      </div>
      {error && (
        <div style={{ color: 'red', padding: '8px 12px' }}>
          Connection issue. Some actions may not work until refresh.
        </div>
      )}
      {children}
    </>
  );
}
