import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { ROLE_LABEL } from '../api';
import { useAuth } from '../auth';
import type { Role } from '../types';
import { Avatar } from './ui';
import { NAV_STATE } from './BackButton';
import { NotificationBell } from './Notifications';
import { ExpiryBell } from './ExpiryAlerts';

/* Simple line icons (drawn with SVG so no extra package is needed). */
const ICONS: Record<string, string> = {
  home: 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z',
  pill: 'M10.5 20.5a5 5 0 0 1-7-7l7-7a5 5 0 0 1 7 7zM8.5 8.5l7 7',
  box: 'M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  clipboard: 'M9 4h6v3H9zM7 5H5v16h14V5h-2M9 12h6M9 16h4',
  hand: 'M4 13h3l4 2h4a2 2 0 0 1 0 4H9m6-4 4-2a2 2 0 0 1 2 3l-6 5H4',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 3',
  chart: 'M3 21h18M6 17V11M11 17V7M16 17v-4M20 17V5',
  report: 'M14 3H6v18h12V7zM14 3v4h4M9 12h6M9 16h6',
  sms: 'M4 5h16v11H8l-4 4zM8 9h8M8 12h5',
  users: 'M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 20v-2a4 4 0 0 0-3-3.9M16 2.1a4 4 0 0 1 0 7.8',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M21 21l-5-5',
  bell: 'M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4',
  logout: 'M9 21H5V3h4M16 17l5-5-5-5M21 12H9',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  shield: 'M12 3 4 6v6c0 5 3.4 8.3 8 9 4.6-.7 8-4 8-9V6zM9 12l2 2 4-4',
  key: 'M15 7a4 4 0 1 1-3.9 4.9L3 20v-3h3v-3h3l2.1-2.1A4 4 0 0 1 15 7z',
};

function Icon({ name }: { name: string }) {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

/** perm: shown only when the user has that permission (Admin → User Permissions). */
type Item = { to: string; label: string; icon: string; perm?: string };
type Section = { title?: string; items: Item[] };

const NAV: Record<Role, Section[]> = {
  admin: [
    { items: [{ to: '/dashboard', label: 'Dashboard', icon: 'home' }] },
    { title: 'Inventory', items: [
      { to: '/medicines', label: 'Medicine List', icon: 'pill' },
      { to: '/inventory', label: 'Stock & Batches', icon: 'box' },
    ] },
    { title: 'Distribution', items: [
      { to: '/requests', label: 'Requests', icon: 'clipboard' },
      { to: '/dispense', label: 'Dispense', icon: 'hand' },
      { to: '/dispensing', label: 'Dispensing Records', icon: 'history' },
    ] },
    { title: 'Analytics', items: [
      { to: '/forecasting', label: 'Demand Forecasting', icon: 'chart' },
      { to: '/reports', label: 'Reports', icon: 'report' },
    ] },
    { title: 'Administration', items: [
      { to: '/notifications', label: 'SMS Notifications', icon: 'sms' },
      { to: '/users', label: 'User Accounts', icon: 'users' },
      { to: '/permissions', label: 'User Permissions', icon: 'shield' },
    ] },
  ],
  staff: [
    { items: [{ to: '/dashboard', label: 'Dashboard', icon: 'home' }] },
    { title: 'Distribution', items: [
      { to: '/dispense', label: 'Dispense', icon: 'hand', perm: 'dispensing.dispense|residents.register' },
      { to: '/requests', label: 'Requests', icon: 'clipboard', perm: 'requests.view' },
      { to: '/dispensing', label: 'Dispensing Records', icon: 'history', perm: 'dispensing.records' },
    ] },
    { title: 'Inventory', items: [
      { to: '/inventory', label: 'Stock & Batches', icon: 'box', perm: 'inventory.view|inventory.manage' },
      { to: '/medicines', label: 'Medicine List', icon: 'pill', perm: 'medicines.view' },
    ] },
  ],
  resident: [
    { items: [{ to: '/dashboard', label: 'Dashboard', icon: 'home' }] },
    { title: 'Medicines', items: [
      { to: '/medicines', label: 'Check Medicines', icon: 'search', perm: 'medicines.view' },
      { to: '/requests', label: 'My Requests', icon: 'clipboard', perm: 'requests.view' },
      { to: '/dispensing', label: 'My Medicine History', icon: 'history', perm: 'history.view' },
    ] },
    { title: 'Account', items: [
      { to: '/notifications', label: 'Notifications', icon: 'bell', perm: 'notifications.view' },
      { to: '/profile', label: 'My Profile', icon: 'user' },
    ] },
  ],
};

/**
 * Top bar with a hamburger button on the left. Tapping it slides the menu in from the left
 * (same on computers and phones). The menu closes when a page is chosen, when tapping the
 * dimmed area, with the ✕ button, or with the Esc key.
 */
export default function Layout() {
  const { user, logout, can } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  // Close the menu after moving to another page.
  useEffect(() => { setOpen(false); }, [location.pathname]);

  // Esc closes the menu; the page behind it doesn't scroll while it is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!user) return null;
  // Menu items the administrator turned off in User Permissions are not shown.
  const sections = NAV[user.role]
    .map((s) => ({ ...s, items: s.items.filter((i) => !i.perm || can(i.perm)) }))
    .filter((s) => s.items.length > 0);

  return (
    <div className="app">
      <header className="topbar">
        <button
          className="hamburger"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          aria-controls="side-menu"
        >
          <span /><span /><span />
        </button>
        <NavLink to="/dashboard" state={NAV_STATE} className="brand topbar-brand">
          <span className="brand-mark">✚</span>
          <div>
            <strong>BulanBotikaCare</strong>
            <small>Botika ng Bayan · Bulan</small>
          </div>
        </NavLink>
        <div className="topbar-actions">
          {user.role !== 'resident' && can('inventory.view|inventory.manage') && <ExpiryBell />}
          {user.role === 'resident' && can('notifications.view') && <NotificationBell />}
          {/* Everyone: the picture or initial opens My Profile. */}
          <Link to="/profile" state={NAV_STATE} className={`topbar-profile ${location.pathname === '/profile' ? 'is-current' : ''}`} aria-label="Open my profile" title="My profile"
              aria-current={location.pathname === '/profile' ? 'page' : undefined}>
            <Avatar name={user.name} photo={user.resident?.photo ?? user.photo} size={36} />
          </Link>
        </div>
      </header>

      <div className={`drawer-overlay ${open ? 'is-open' : ''}`} onClick={() => setOpen(false)} aria-hidden="true" />
      <aside id="side-menu" className={`drawer ${open ? 'is-open' : ''}`} aria-hidden={!open} aria-label="Main menu">
        <div className="drawer-head">
          {/* The picture and name open My Profile (all roles). */}
          <Link to="/profile" state={NAV_STATE} className="drawer-profile" tabIndex={open ? 0 : -1} aria-label="Open my profile" title="My profile">
            <Avatar name={user.name} photo={user.resident?.photo ?? user.photo} size={38} />
            <span className="drawer-user">
              <strong>{user.name}</strong>
              <small>{user.role === 'resident' ? 'View my profile' : `${ROLE_LABEL[user.role]} · View my profile`}</small>
            </span>
          </Link>
          <button className="drawer-close" onClick={() => setOpen(false)} aria-label="Close menu" tabIndex={open ? 0 : -1}>✕</button>
        </div>

        <nav className="drawer-nav">
          {sections.map((section, i) => (
            <div className="drawer-section" key={section.title ?? i}>
              {section.title && <div className="drawer-title">{section.title}</div>}
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  state={NAV_STATE}
                  tabIndex={open ? 0 : -1}
                  className={({ isActive }) => `drawer-item ${isActive ? 'active' : ''}`}
                >
                  <Icon name={item.icon} />
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <button className="drawer-logout" onClick={logout} tabIndex={open ? 0 : -1}>
          <Icon name="logout" /> Log out
        </button>
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
