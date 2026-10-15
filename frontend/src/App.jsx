import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Bell, BarChart3, Building2, CalendarDays, Home, LayoutDashboard, ListOrdered, Settings as SettingsIcon, Siren, Stethoscope, Ticket, User, Users } from 'lucide-react';
import Shell from './layouts/Shell.jsx';
import Landing from './pages/Landing.jsx';
import Auth from './pages/Auth.jsx';
import { PatientHome, QueuePage, JoinQueue, Notifications, Profile } from './pages/Patient.jsx';
import { StaffDashboard, StaffQueues, StaffEmergency, StaffAnalytics } from './pages/Staff.jsx';
import SettingsPage from './pages/Settings.jsx';
import { Doctors, Departments, Patients, Appointments } from './pages/Manage.jsx';
import { useApp } from './context/Providers.jsx';

const patientLinks = [
  { to: '/app', label: 'Home', icon: Home, end: true }, { to: '/app/queue', label: 'Queue', icon: Ticket },
  { to: '/app/notifications', label: 'Alerts', icon: Bell }, { to: '/app/profile', label: 'Profile', icon: User },
  { to: '/app/settings', label: 'Settings', icon: SettingsIcon },
];
const staffLinks = [
  { to: '/staff', label: 'Dashboard', icon: LayoutDashboard, end: true }, { to: '/staff/queues', label: 'Queues', icon: ListOrdered },
  { to: '/staff/emergency', label: 'Emergency', icon: Siren }, { to: '/staff/analytics', label: 'Analytics', icon: BarChart3 },
];

const adminLinks = [
  { to: '/staff/appointments', label: 'Appts', icon: CalendarDays }, { to: '/staff/patients', label: 'Patients', icon: Users },
  { to: '/staff/doctors', label: 'Doctors', icon: Stethoscope }, { to: '/staff/departments', label: 'Depts', icon: Building2 },
];
function StaffShell() {
  const { user } = useApp();
  const settings = { to: '/staff/settings', label: 'Settings', icon: SettingsIcon };
  return <Shell links={[...staffLinks, ...(user.role === 'doctor' ? [] : adminLinks), settings]} />;
}

function Guard({ roles, children }) {
  const { user } = useApp();
  const loc = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (!roles.includes(user.role)) return <Navigate to={user.role === 'patient' ? '/app' : '/staff'} replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Auth mode="login" />} />
      <Route path="/register" element={<Auth mode="register" />} />
      <Route path="/app" element={<Guard roles={['patient']}><Shell links={patientLinks} /></Guard>}>
        <Route index element={<PatientHome />} />
        <Route path="join" element={<JoinQueue />} />
        <Route path="queue" element={<QueuePage />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="profile" element={<Profile />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="/staff" element={<Guard roles={['staff', 'admin', 'doctor']}><StaffShell /></Guard>}>
        <Route index element={<StaffDashboard />} />
        <Route path="queues" element={<StaffQueues />} />
        <Route path="emergency" element={<StaffEmergency />} />
        <Route path="analytics" element={<StaffAnalytics />} />
        <Route path="appointments" element={<Appointments />} />
        <Route path="patients" element={<Patients />} />
        <Route path="doctors" element={<Doctors />} />
        <Route path="departments" element={<Departments />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
