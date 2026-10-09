import type { ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
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
import Medicines from './pages/shared/Medicines';
import Inventory from './pages/shared/Inventory';
import Requests from './pages/shared/Requests';
import DispensingRecords from './pages/shared/DispensingRecords';

function Guard({ roles, children }: { roles: Role[]; children: ReactElement }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <p className="empty">Loading…</p>;

  const ALL: Role[] = ['admin', 'staff', 'resident'];
  const OPS: Role[] = ['admin', 'staff'];
  const role = user?.role;

  return (
    <Routes>
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
        <Route path="/dispensing" element={<DispensingRecords />} />
        <Route path="/notifications" element={role === 'admin' ? <Announcements /> : <Guard roles={['resident']}><MyNotifications /></Guard>} />

        <Route path="/profile" element={<Guard roles={['resident']}><Profile /></Guard>} />

        <Route path="/inventory" element={<Guard roles={OPS}><Inventory /></Guard>} />
        <Route path="/dispense" element={<Guard roles={OPS}><Dispense /></Guard>} />

        <Route path="/users" element={<Guard roles={['admin']}><Users /></Guard>} />
        <Route path="/reports" element={<Guard roles={['admin']}><Reports /></Guard>} />
        <Route path="/forecasting" element={<Guard roles={['admin']}><Forecasting /></Guard>} />
      </Route>

      <Route path="*" element={<Navigate to={user ? '/dashboard' : '/login'} replace />} />
    </Routes>
  );
}
