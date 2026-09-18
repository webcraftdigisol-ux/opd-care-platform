import { Navigate, Route, Routes } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { ProtectedRoute } from './components/ProtectedRoute';
import { useAuth } from './context/AuthContext';
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
import { PharmacyCounterPage } from './pages/PharmacyCounterPage';
import { PharmacyInventoryPage } from './pages/PharmacyInventoryPage';
import { LabCounterPage } from './pages/LabCounterPage';
import { LabCatalogPage } from './pages/LabCatalogPage';
import { ReportsPage } from './pages/ReportsPage';
import { IpdWardsPage } from './pages/IpdWardsPage';
import { IpdAdmissionsPage } from './pages/IpdAdmissionsPage';
import { IpdAdmitPatientPage } from './pages/IpdAdmitPatientPage';
import { IpdAdmissionDetailPage } from './pages/IpdAdmissionDetailPage';

function HomeRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'DOCTOR') return <Navigate to="/doctor" replace />;
  if (user.role === 'ADMIN') return <Navigate to="/admin" replace />;
  if (user.role === 'PHARMACIST') return <Navigate to="/pharmacy" replace />;
  if (user.role === 'LAB_TECHNICIAN') return <Navigate to="/lab" replace />;
  return <PatientDashboard />;
}

export default function App() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/register-clinic" element={<RegisterClinicPage />} />

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
            <ProtectedRoute roles={['ADMIN']}>
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
          path="/admin/pharmacy"
          element={
            <ProtectedRoute roles={['ADMIN']}>
              <PharmacyInventoryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/lab"
          element={
            <ProtectedRoute roles={['ADMIN']}>
              <LabCatalogPage />
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
            <ProtectedRoute roles={['ADMIN', 'DOCTOR']}>
              <IpdWardsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/ipd/admissions"
          element={
            <ProtectedRoute roles={['ADMIN', 'DOCTOR']}>
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
            <ProtectedRoute roles={['ADMIN', 'DOCTOR']}>
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

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
