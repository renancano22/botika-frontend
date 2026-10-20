import { useEffect, type ReactElement } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { LoadError, toast } from './components/feedback';
import { useAuth } from './auth';
import Layout from './components/Layout';
import type { Role } from './types';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import AdminDashboard from './pages/admin/AdminDashboard';
import Users from './pages/admin/Users';
import Reports from './pages/admin/Reports';
import Forecasting from './pages/admin/Forecasting';
import Announcements from './pages/admin/Announcements';
import StaffDashboard from './pages/staff/StaffDashboard';
import Dispense from './pages/staff/Dispense';
import ResidentDashboard from './pages/resident/ResidentDashboard';
import ResidentMedicines from './pages/resident/ResidentMedicines';
import MyNotifications from './pages/resident/MyNotifications';
import Profile from './pages/resident/Profile';
import MyRequests from './pages/resident/MyRequests';
import RequestDetail from './pages/resident/RequestDetail';
import NotificationDetail from './pages/resident/NotificationDetail';
import Medicines from './pages/shared/Medicines';
import Inventory from './pages/shared/Inventory';
import Requests from './pages/shared/Requests';
import DispensingRecords from './pages/shared/DispensingRecords';

/** A page the user's role cannot open: explain it, then go to the dashboard. */
function NoAccess() {
  useEffect(() => {
    toast.warning('Access denied', { description: 'You do not have permission to open that page, so you were taken to your dashboard.' });
  }, []);
  return <Navigate to="/dashboard" replace />;
}

function Guard({ roles, children }: { roles: Role[]; children: ReactElement }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <NoAccess />;
  return children;
}

/** Address that does not exist in the system. */
function NotFound() {
  return (
    <div className="page page-narrow">
      <div className="card status-page">
        <span className="status-page-code">404</span>
        <h1>Page not found</h1>
        <p className="muted">The page you are looking for does not exist or may have been moved. Check the address, or go back to your dashboard.</p>
        <Link className="btn" to="/dashboard">Go to dashboard</Link>
      </div>
    </div>
  );
}

export default function App() {
  const { user, loading, connectionError, retry } = useAuth();
  if (loading) return <div className="app-loading" role="status"><span className="spinner spinner-lg" aria-hidden="true" /> Loading BulanBotikaCare…</div>;
  if (connectionError) {
    return (
      <div className="auth-page">
        <div className="auth-card status-page">
          <LoadError error={connectionError} onRetry={retry} compact />
        </div>
      </div>
    );
  }

  const ALL: Role[] = ['admin', 'staff', 'resident'];
  const OPS: Role[] = ['admin', 'staff'];
  const role = user?.role;

  return (
    <Routes>
      <Route path="/" element={<Navigate to={user ? '/dashboard' : '/login'} replace />} />
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to="/dashboard" replace /> : <Register />} />
      <Route path="/forgot-password" element={user ? <Navigate to="/dashboard" replace /> : <ForgotPassword />} />

      <Route element={<Guard roles={ALL}><Layout /></Guard>}>
        <Route path="/dashboard" element={
          role === 'admin' ? <AdminDashboard /> : role === 'staff' ? <StaffDashboard /> : <ResidentDashboard />
        } />
        <Route path="/medicines" element={role === 'resident' ? <ResidentMedicines /> : <Medicines />} />
        <Route path="/requests" element={role === 'resident' ? <MyRequests /> : <Requests />} />
        <Route path="/requests/:id" element={<Guard roles={['resident']}><RequestDetail /></Guard>} />
        <Route path="/notifications/:id" element={<Guard roles={['resident']}><NotificationDetail /></Guard>} />
        <Route path="/dispensing" element={<DispensingRecords />} />
        <Route path="/notifications" element={role === 'admin' ? <Announcements /> : <Guard roles={['resident']}><MyNotifications /></Guard>} />

        <Route path="/profile" element={<Guard roles={['resident']}><Profile /></Guard>} />

        <Route path="/inventory" element={<Guard roles={OPS}><Inventory /></Guard>} />
        <Route path="/dispense" element={<Guard roles={OPS}><Dispense /></Guard>} />

        <Route path="/users" element={<Guard roles={['admin']}><Users /></Guard>} />
        <Route path="/reports" element={<Guard roles={['admin']}><Reports /></Guard>} />
        <Route path="/forecasting" element={<Guard roles={['admin']}><Forecasting /></Guard>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
