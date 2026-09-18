import { Navigate, Route, Routes } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { ProtectedRoute } from './components/ProtectedRoute';
import { useAuth } from './context/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { PatientDashboard } from './pages/PatientDashboard';
import { BookAppointmentPage } from './pages/BookAppointmentPage';
import { PatientRecordsPage } from './pages/PatientRecordsPage';
import { DoctorDashboard } from './pages/DoctorDashboard';
import { ConsultationPage } from './pages/ConsultationPage';
import { AdminDashboard } from './pages/AdminDashboard';
import { AdminDoctorsPage } from './pages/AdminDoctorsPage';
import { AdminWalkInPage } from './pages/AdminWalkInPage';

function HomeRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'DOCTOR') return <Navigate to="/doctor" replace />;
  if (user.role === 'ADMIN') return <Navigate to="/admin" replace />;
  return <PatientDashboard />;
}

export default function App() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

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

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
