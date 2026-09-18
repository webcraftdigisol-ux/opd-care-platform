import { Navigate } from 'react-router-dom';
import type { Role } from '@opd/shared';
import { useAuth } from '../context/AuthContext';

export function ProtectedRoute({ roles, children }: { roles?: Role[]; children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="flex justify-center py-20 text-teal">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;

  return <>{children}</>;
}
