import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { ProtectedRoute } from './components/ProtectedRoute';
import { useAuth } from './context/AuthContext';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { RegisterClinicPage } from './pages/RegisterClinicPage';
import { PatientDashboard } from './pages/PatientDashboard';
import { BookAppointmentPage } from './pages/BookAppointmentPage';
import { PatientRecordsPage } from './pages/PatientRecordsPage';
import { DoctorDashboard } from './pages/DoctorDashboard';
import { ConsultationPage } from './pages/ConsultationPage';
import { AdminDashboard } from './pages/AdminDashboard';
import { AdminDoctorsPage } from './pages/AdminDoctorsPage';
import { AdminWalkInPage } from './pages/AdminWalkInPage';
import { AdminStaffPage } from './pages/AdminStaffPage';
import { SubscriptionBillingPage } from './pages/SubscriptionBillingPage';
import { PharmacyCounterPage } from './pages/PharmacyCounterPage';
import { PharmacyInventoryPage } from './pages/PharmacyInventoryPage';
import { LabCounterPage } from './pages/LabCounterPage';
import { LabCatalogPage } from './pages/LabCatalogPage';
import { RadiologyCounterPage } from './pages/RadiologyCounterPage';
import { RadiologyCatalogPage } from './pages/RadiologyCatalogPage';
import { ReportsPage } from './pages/ReportsPage';
import { IpdWardsPage } from './pages/IpdWardsPage';
import { IpdAdmissionsPage } from './pages/IpdAdmissionsPage';
import { IpdAdmitPatientPage } from './pages/IpdAdmitPatientPage';
import { IpdAdmissionDetailPage } from './pages/IpdAdmissionDetailPage';
import { ReceptionDashboardPage } from './pages/ReceptionDashboardPage';
import { AdminNotificationsPage } from './pages/AdminNotificationsPage';
import { PlatformLoginPage } from './pages/PlatformLoginPage';
import { PlatformDashboardPage } from './pages/PlatformDashboardPage';
import { PlatformProtectedRoute } from './components/PlatformProtectedRoute';
import { homeRouteForRole } from './utils/roleHome';

function HomeRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'PATIENT') return <PatientDashboard />;
  return <Navigate to={homeRouteForRole(user.role)} replace />;
}

export default function App() {
  const location = useLocation();
  // The platform-admin section is a separate actor space from any clinic
  // (see api/platformClient.ts) -- it never shows the clinic Navbar, which
  // is meaningless outside a clinic session.
  const isPlatformRoute = location.pathname.startsWith('/platform');

  return (
    <div className="min-h-screen">
      {!isPlatformRoute && <Navbar />}
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/register-clinic" element={<RegisterClinicPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />

        <Route path="/platform/login" element={<PlatformLoginPage />} />
        <Route
          path="/platform"
          element={
            <PlatformProtectedRoute>
              <PlatformDashboardPage />
            </PlatformProtectedRoute>
          }
        />

        <Route path="/" element={<HomeRedirect />} />
        <Route
          path="/book"
          element={
            <ProtectedRoute roles={['PATIENT']}>
              <BookAppointmentPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/records"
          element={
            <ProtectedRoute roles={['PATIENT']}>
              <PatientRecordsPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/doctor"
          element={
            <ProtectedRoute roles={['DOCTOR']}>
              <DoctorDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/doctor/consult/:appointmentId"
          element={
            <ProtectedRoute roles={['DOCTOR']}>
              <ConsultationPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin"
          element={
            <ProtectedRoute roles={['ADMIN']}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/doctors"
          element={
            <ProtectedRoute roles={['ADMIN']}>
              <AdminDoctorsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/walk-in"
          element={
            <ProtectedRoute roles={['ADMIN', 'RECEPTIONIST']}>
              <AdminWalkInPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/staff"
          element={
            <ProtectedRoute roles={['ADMIN']}>
              <AdminStaffPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/notifications"
          element={
            <ProtectedRoute roles={['ADMIN']}>
              <AdminNotificationsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/billing"
          element={
            <ProtectedRoute roles={['ADMIN']}>
              <SubscriptionBillingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/pharmacy"
          element={
            <ProtectedRoute roles={['ADMIN', 'PHARMACIST']}>
              <PharmacyInventoryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/lab"
          element={
            <ProtectedRoute roles={['ADMIN', 'LAB_TECHNICIAN']}>
              <LabCatalogPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/radiology"
          element={
            <ProtectedRoute roles={['ADMIN', 'RADIOLOGY_TECHNICIAN']}>
              <RadiologyCatalogPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/reports"
          element={
            <ProtectedRoute roles={['ADMIN', 'DOCTOR']}>
              <ReportsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/ipd/wards"
          element={
            <ProtectedRoute roles={['ADMIN', 'DOCTOR', 'HEAD_NURSE']}>
              <IpdWardsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/ipd/admissions"
          element={
            <ProtectedRoute roles={['ADMIN', 'DOCTOR', 'NURSE', 'HEAD_NURSE']}>
              <IpdAdmissionsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/ipd/admit"
          element={
            <ProtectedRoute roles={['ADMIN', 'DOCTOR']}>
              <IpdAdmitPatientPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/ipd/admissions/:id"
          element={
            <ProtectedRoute roles={['ADMIN', 'DOCTOR', 'NURSE', 'HEAD_NURSE']}>
              <IpdAdmissionDetailPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/pharmacy"
          element={
            <ProtectedRoute roles={['PHARMACIST', 'ADMIN']}>
              <PharmacyCounterPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lab"
          element={
            <ProtectedRoute roles={['LAB_TECHNICIAN', 'ADMIN']}>
              <LabCounterPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/radiology"
          element={
            <ProtectedRoute roles={['RADIOLOGY_TECHNICIAN', 'ADMIN']}>
              <RadiologyCounterPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reception"
          element={
            <ProtectedRoute roles={['RECEPTIONIST', 'ADMIN']}>
              <ReceptionDashboardPage />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
