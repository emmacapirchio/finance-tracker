import { BrowserRouter, Routes, Route, NavLink, Outlet } from 'react-router-dom';
import dayjs from 'dayjs';
import Dashboard from './pages/Dashboard';
import Income from './pages/Income';
import Spending from './pages/Spending';
import Bills from './pages/Bills';
import Subscriptions from './pages/Subscriptions';
import Settings from './pages/Settings';
import AuthPage from './pages/Auth';
import RequireAuth from './components/RequireAuth';
import './styles.css';

function ShellLayout() {
  return (
    <div className="container">
      <header className="hstack" style={{ justifyContent:'space-between', marginBottom:16 }}>
        <h1 style={{ margin:0 }}>Finance Tracker</h1>
        <nav className="hstack" style={{ gap:8 }}>
          <NavLink className="btn" to="/">Dashboard</NavLink>
          <NavLink className="btn" to="/income">Income</NavLink>
          <NavLink className="btn" to="/spending">Spending</NavLink>
          <NavLink className="btn" to="/bills">Bills</NavLink>
          <NavLink className="btn" to="/subscriptions">Subscriptions</NavLink>
          <NavLink className="btn" to="/settings">Settings</NavLink>
        </nav>
      </header>
      <Outlet />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public login lives OUTSIDE the container so it can center full-width */}
        <Route path="/login" element={<AuthPage />} />

        {/* Protected app wrapped with header/container */}
        <Route element={<RequireAuth><ShellLayout /></RequireAuth>}>
          <Route path="/" element={<Dashboard initialMonth={dayjs().format('YYYY-MM')} />} />
          <Route path="/income" element={<Income />} />
          <Route path="/spending" element={<Spending />} />
          <Route path="/bills" element={<Bills />} />
          <Route path="/subscriptions" element={<Subscriptions />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
