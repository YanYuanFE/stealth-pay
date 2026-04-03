import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import Landing from './pages/Landing';
import EmployerSetup from './pages/employer/Setup';
import EmployerDashboard from './pages/employer/Dashboard';
import EmployerEmployees from './pages/employer/Employees';
import EmployerRunPayroll from './pages/employer/RunPayroll';
import EmployerHistory from './pages/employer/History';
import EmployerFund from './pages/employer/Fund';
import EmployeePortal from './pages/employee/Portal';
import EmployeeSetup from './pages/employee/Setup';
import AuditorPortal from './pages/auditor/Portal';
import Layout from './components/layout/Layout';

export default function App() {
  return (
    <>
    <Toaster position="top-right" richColors closeButton />
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route element={<Layout />}>
        <Route path="/employer" element={<Navigate to="/employer/dashboard" replace />} />
        <Route path="/employer/setup" element={<EmployerSetup />} />
        <Route path="/employer/dashboard" element={<EmployerDashboard />} />
        <Route path="/employer/employees" element={<EmployerEmployees />} />
        <Route path="/employer/payroll" element={<EmployerRunPayroll />} />
        <Route path="/employer/history" element={<EmployerHistory />} />
        <Route path="/employer/fund" element={<EmployerFund />} />
        <Route path="/employee" element={<Navigate to="/employee/portal" replace />} />
        <Route path="/employee/portal" element={<EmployeePortal />} />
        <Route path="/employee/setup" element={<EmployeeSetup />} />
        <Route path="/auditor/portal" element={<AuditorPortal />} />
      </Route>
    </Routes>
    </>
  );
}
