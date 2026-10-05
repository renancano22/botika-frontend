import { NavLink, Outlet } from 'react-router-dom';
import { ROLE_LABEL } from '../api';
import { useAuth } from '../auth';
import type { Role } from '../types';

const NAV: Record<Role, { to: string; label: string }[]> = {
  admin: [
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/medicines', label: 'Medicines' },
    { to: '/inventory', label: 'Inventory' },
    { to: '/requests', label: 'Requests' },
    { to: '/dispense', label: 'Dispense' },
    { to: '/dispensing', label: 'Dispensing Records' },
    { to: '/forecasting', label: 'Demand Forecasting' },
    { to: '/reports', label: 'Reports' },
    { to: '/notifications', label: 'SMS Notifications' },
    { to: '/users', label: 'User Accounts' },
  ],
  staff: [
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/dispense', label: 'Dispense' },
    { to: '/requests', label: 'Requests' },
    { to: '/inventory', label: 'Inventory' },
    { to: '/medicines', label: 'Medicines' },
    { to: '/dispensing', label: 'Dispensing Records' },
  ],
  resident: [
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/medicines', label: 'Check Medicines' },
    { to: '/requests', label: 'My Requests' },
    { to: '/dispensing', label: 'My Medicine History' },
    { to: '/notifications', label: 'Notifications' },
  ],
};

export default function Layout() {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">✚</span>
          <div>
            <strong>BulanBotikaCare</strong>
            <small>Botika ng Bayan · Bulan</small>
          </div>
        </div>
        <nav>
          {NAV[user.role].map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'active' : '')}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-user">
          <div>
            <strong>{user.name}</strong>
            <small>{ROLE_LABEL[user.role]}</small>
          </div>
          <button className="btn-ghost" onClick={logout}>Log out</button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
