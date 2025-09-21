import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { me, logout } from '../api';

export default function RequireAuth({ children }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const loc = useLocation();

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const u = await me();
        if (on) {
          setUser(u);
          setChecking(false);
        }
      } catch {
        if (on) setChecking(false);
      }
    })();
    return () => { on = false; };
  }, []);

  async function handleLogout() {
    await logout();
    setUser(null);
  }

  if (checking) return <div style={{ padding: 16 }}>Loading…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;

  return (
    <>
      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        padding: '8px 12px',
        background: '#f5f5f5',
        borderBottom: '1px solid #ddd'
      }}>
        <span style={{ marginRight: 12 }}>Signed in as <strong>{user.email || user.id}</strong></span>
        <button className="btn" onClick={handleLogout}>Log out</button>
      </div>
      {children}
    </>
  );
}
