import { Navigate } from 'react-router-dom';

// Deliberately not the clinic ProtectedRoute -- it checks useAuth()'s clinic
// session, which has nothing to do with a platform-admin session (see
// api/platformClient.ts). This just checks that a platform token exists;
// platformClient's own 401 interceptor handles an invalid/expired one by
// redirecting here anyway.
export function PlatformProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('opd_platform_token');
  if (!token) return <Navigate to="/platform/login" replace />;
  return <>{children}</>;
}
