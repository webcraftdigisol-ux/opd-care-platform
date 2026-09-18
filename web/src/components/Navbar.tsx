import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const homeLink =
    user?.role === 'DOCTOR' ? '/doctor' : user?.role === 'ADMIN' ? '/admin' : '/';

  return (
    <nav className="flex items-center justify-between border-b border-teal-light bg-white px-6 py-3 shadow-sm">
      <Link to={homeLink} className="text-lg font-semibold text-teal">
        OPD <span className="text-gold">Care</span>
      </Link>
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
