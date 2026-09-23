import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { homeRouteForRole } from '../utils/roleHome';

export function Navbar() {
  const { user, clinic, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const homeLink = user ? homeRouteForRole(user.role) : '/';

  const tierAllowsPharmacyLab = (clinic?.tier ?? 1) >= 2;
  const tierAllowsIpd = (clinic?.tier ?? 1) >= 3;

  return (
    <nav className="flex flex-wrap items-center justify-between gap-2 border-b border-teal-light bg-white px-6 py-3 shadow-sm">
      <div className="flex items-center gap-6">
        <Link to={homeLink} className="text-lg font-semibold text-teal">
          {clinic?.name ?? 'OPD'} <span className="text-gold">Care</span>
        </Link>
        {user?.role === 'ADMIN' && (
          <div className="hidden gap-4 text-sm text-gray-600 sm:flex">
            {tierAllowsPharmacyLab && (
              <>
                <Link to="/admin/pharmacy" className="hover:text-teal">
                  Pharmacy
                </Link>
                <Link to="/admin/lab" className="hover:text-teal">
                  Lab
                </Link>
                <Link to="/admin/radiology" className="hover:text-teal">
                  Radiology
                </Link>
              </>
            )}
            <Link to="/admin/staff" className="hover:text-teal">
              Staff
            </Link>
            {tierAllowsIpd && (
              <>
                <Link to="/admin/ipd/admissions" className="hover:text-teal">
                  In-Patients
                </Link>
                <Link to="/admin/ipd/wards" className="hover:text-teal">
                  Wards
                </Link>
              </>
            )}
            <Link to="/admin/reports" className="hover:text-teal">
              Reports
            </Link>
            <Link to="/admin/notifications" className="hover:text-teal">
              Notifications
            </Link>
            <Link to="/admin/billing" className="hover:text-teal">
              Billing
            </Link>
          </div>
        )}
        {user?.role === 'DOCTOR' && (
          <div className="hidden gap-4 text-sm text-gray-600 sm:flex">
            {tierAllowsIpd && (
              <Link to="/admin/ipd/admissions" className="hover:text-teal">
                In-Patients
              </Link>
            )}
            <Link to="/admin/reports" className="hover:text-teal">
              Reports
            </Link>
          </div>
        )}
        {user?.role === 'PHARMACIST' && (
          <div className="hidden gap-4 text-sm text-gray-600 sm:flex">
            <Link to="/pharmacy" className="hover:text-teal">
              Counter
            </Link>
            <Link to="/admin/pharmacy" className="hover:text-teal">
              Medicine Catalog
            </Link>
          </div>
        )}
        {user?.role === 'LAB_TECHNICIAN' && (
          <div className="hidden gap-4 text-sm text-gray-600 sm:flex">
            <Link to="/lab" className="hover:text-teal">
              Counter
            </Link>
            <Link to="/admin/lab" className="hover:text-teal">
              Test Catalog
            </Link>
          </div>
        )}
        {user?.role === 'RADIOLOGY_TECHNICIAN' && (
          <div className="hidden gap-4 text-sm text-gray-600 sm:flex">
            <Link to="/radiology" className="hover:text-teal">
              Counter
            </Link>
            <Link to="/admin/radiology" className="hover:text-teal">
              Test Catalog
            </Link>
          </div>
        )}
        {(user?.role === 'NURSE' || user?.role === 'HEAD_NURSE') && (
          <div className="hidden gap-4 text-sm text-gray-600 sm:flex">
            <Link to="/admin/ipd/admissions" className="hover:text-teal">
              In-Patients
            </Link>
            {user.role === 'HEAD_NURSE' && (
              <Link to="/admin/ipd/wards" className="hover:text-teal">
                Wards
              </Link>
            )}
          </div>
        )}
      </div>
      {user && (
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-600">
            {user.name} <span className="text-gray-400">· {user.role}</span>
          </span>
          <button
            onClick={handleLogout}
            className="rounded-md border border-teal px-3 py-1.5 text-teal transition hover:bg-teal hover:text-white"
          >
            Log out
          </button>
        </div>
      )}
    </nav>
  );
}
