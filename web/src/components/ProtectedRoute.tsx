import { Navigate } from 'react-router-dom';
import type { Role } from '@opd/shared';
import { useAuth } from '../context/AuthContext';

export function ProtectedRoute({ roles, children }: { roles?: Role[]; children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="flex justify-center py-20 text-teal">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  // Admin can open every staff screen (in a small clinic the owner is also
  // the doctor, the desk, ...); only the patient's own pages are off limits.
  const adminOverride = user.role === 'ADMIN' && !roles?.includes('PATIENT');
  if (roles && !roles.includes(user.role) && !adminOverride) return <Navigate to="/" replace />;

  return <>{children}</>;
}
