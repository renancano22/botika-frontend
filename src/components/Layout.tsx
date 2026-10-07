import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
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

/**
 * Top bar with the menu inside a hamburger button (same on computers and phones).
 * The menu closes when a page is chosen, when clicking outside it, or with the Esc key.
 */
export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the menu after moving to another page.
  useEffect(() => { setOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;
  const items = NAV[user.role];
  const current = items.find((i) => location.pathname.startsWith(i.to));

  return (
    <div className="app">
      <header className="topbar">
        <NavLink to="/dashboard" className="brand topbar-brand">
          <span className="brand-mark">✚</span>
          <div>
            <strong>BulanBotikaCare</strong>
            <small>Botika ng Bayan · Bulan</small>
          </div>
        </NavLink>

        <div className="topbar-right" ref={menuRef}>
          {current && <span className="topbar-page">{current.label}</span>}
          <button
            className={`hamburger ${open ? 'is-open' : ''}`}
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="main-menu"
          >
            <span /><span /><span />
          </button>

          {open && (
            <div className="menu-panel" id="main-menu">
              <div className="menu-user">
                <span className="menu-avatar">{user.name.charAt(0).toUpperCase()}</span>
                <div>
                  <strong>{user.name}</strong>
                  <small>{ROLE_LABEL[user.role]}</small>
                </div>
              </div>
              <nav className="menu-list">
                {items.map((item) => (
                  <NavLink key={item.to} to={item.to} className={({ isActive }) => `menu-item ${isActive ? 'active' : ''}`}>
                    {item.label}
                  </NavLink>
                ))}
              </nav>
              <button className="menu-item menu-logout" onClick={logout}>Log out</button>
            </div>
          )}
        </div>
      </header>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
