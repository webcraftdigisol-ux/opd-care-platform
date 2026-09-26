import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from './components/AppShell';
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
import { DepartmentHomePage } from './pages/DepartmentHomePage';
import { PharmacyPatientPage } from './pages/PharmacyPatientPage';
import { PharmacySettingsPage } from './pages/PharmacySettingsPage';
import { TestPatientPage } from './pages/TestPatientPage';
import { TestSettingsPage } from './pages/TestSettingsPage';
import { ReceiptPage } from './pages/ReceiptPage';
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
import { FindPatientPage } from './pages/FindPatientPage';
import { PatientFormPage } from './pages/PatientFormPage';
import { PatientProfilePage } from './pages/PatientProfilePage';
import { VisitSummaryPage } from './pages/VisitSummaryPage';
import { CataloguePage } from './pages/CataloguePage';
import { ClinicSettingsPage } from './pages/ClinicSettingsPage';
import { AppointmentsPage } from './pages/AppointmentsPage';

const PATIENT_STAFF = ['ADMIN', 'DOCTOR', 'RECEPTIONIST', 'PHARMACIST', 'LAB_TECHNICIAN', 'RADIOLOGY_TECHNICIAN', 'NURSE', 'HEAD_NURSE'] as const;
const PATIENT_EDITORS = ['ADMIN', 'DOCTOR', 'RECEPTIONIST'] as const;

function HomeRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'PATIENT') return <PatientDashboard />;
  return <Navigate to={homeRouteForRole(user.role)} replace />;
}

export default function App() {
  const location = useLocation();
  // The platform-admin section is a separate actor space from any clinic
  // (see api/platformClient.ts), and the sign-in pages come before one --
  // neither shows the clinic sidebar.
  // The printable visit summary and receipts are pages of their own too.
  const bare =
    location.pathname.startsWith('/platform') ||
    /^\/visits\/[^/]+\/print$/.test(location.pathname) ||
    /^\/receipts\//.test(location.pathname) ||
    ['/login', '/register', '/register-clinic', '/forgot-password'].includes(location.pathname);

  const routes = (
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
          path="/patients"
          element={
            <ProtectedRoute roles={[...PATIENT_STAFF]}>
              <FindPatientPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/patients/new"
          element={
            <ProtectedRoute roles={[...PATIENT_EDITORS]}>
              <PatientFormPage key="new" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/patients/:id"
          element={
            <ProtectedRoute roles={[...PATIENT_STAFF]}>
              <PatientProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/patients/:id/edit"
          element={
            <ProtectedRoute roles={[...PATIENT_EDITORS]}>
              <PatientFormPage key="edit" />
            </ProtectedRoute>
          }
        />

        <Route
          path="/visits/:appointmentId/print"
          element={
            <ProtectedRoute roles={['ADMIN', 'DOCTOR', 'PATIENT', 'PHARMACIST', 'LAB_TECHNICIAN', 'RADIOLOGY_TECHNICIAN', 'NURSE', 'HEAD_NURSE']}>
              <VisitSummaryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/appointments"
          element={
            <ProtectedRoute roles={['ADMIN', 'RECEPTIONIST', 'DOCTOR']}>
              <AppointmentsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/catalogue"
          element={
            <ProtectedRoute roles={['ADMIN', 'DOCTOR']}>
              <CataloguePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/settings"
          element={
            <ProtectedRoute roles={['ADMIN']}>
              <ClinicSettingsPage />
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
          path="/admin/reports"
          element={
            <ProtectedRoute roles={['ADMIN', 'DOCTOR', 'PHARMACIST', 'LAB_TECHNICIAN', 'RADIOLOGY_TECHNICIAN']}>
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
              <DepartmentHomePage dept="PHARMACY" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/pharmacy/patients/:patientId"
          element={
            <ProtectedRoute roles={['PHARMACIST', 'ADMIN']}>
              <PharmacyPatientPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/pharmacy/settings"
          element={
            <ProtectedRoute roles={['PHARMACIST', 'ADMIN']}>
              <PharmacySettingsPage />
            </ProtectedRoute>
          }
        />
        <Route path="/admin/pharmacy" element={<Navigate to="/pharmacy/settings" replace />} />
        <Route
          path="/lab"
          element={
            <ProtectedRoute roles={['LAB_TECHNICIAN', 'ADMIN']}>
              <DepartmentHomePage key="LAB" dept="LAB" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lab/patients/:patientId"
          element={
            <ProtectedRoute roles={['LAB_TECHNICIAN', 'ADMIN']}>
              <TestPatientPage key="lab" dept="lab" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lab/settings"
          element={
            <ProtectedRoute roles={['LAB_TECHNICIAN', 'ADMIN']}>
              <TestSettingsPage key="lab" dept="lab" />
            </ProtectedRoute>
          }
        />
        <Route path="/admin/lab" element={<Navigate to="/lab/settings" replace />} />
        <Route
          path="/radiology"
          element={
            <ProtectedRoute roles={['RADIOLOGY_TECHNICIAN', 'ADMIN']}>
              <DepartmentHomePage key="RADIOLOGY" dept="RADIOLOGY" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/radiology/patients/:patientId"
          element={
            <ProtectedRoute roles={['RADIOLOGY_TECHNICIAN', 'ADMIN']}>
              <TestPatientPage key="radiology" dept="radiology" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/radiology/settings"
          element={
            <ProtectedRoute roles={['RADIOLOGY_TECHNICIAN', 'ADMIN']}>
              <TestSettingsPage key="radiology" dept="radiology" />
            </ProtectedRoute>
          }
        />
        <Route path="/admin/radiology" element={<Navigate to="/radiology/settings" replace />} />
        <Route
          path="/receipts/:dept/:billId"
          element={
            <ProtectedRoute roles={['ADMIN', 'RECEPTIONIST', 'PHARMACIST', 'LAB_TECHNICIAN', 'RADIOLOGY_TECHNICIAN']}>
              <ReceiptPage />
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
  );

  return <div className="min-h-screen">{bare ? routes : <AppShell>{routes}</AppShell>}</div>;
}
