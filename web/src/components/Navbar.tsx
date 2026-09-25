import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { homeRouteForRole } from '../utils/roleHome';
import { navLinksFor } from '../utils/navLinks';

export function Navbar() {
  const { user, clinic, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the mobile menu whenever the route changes, so tapping a link
  // doesn't leave it covering the page that was just opened.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const homeLink = user ? homeRouteForRole(user.role) : '/';
  const links = user ? navLinksFor(user.role, clinic?.tier ?? 1) : [];

  return (
    <nav className="border-b border-teal-light bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-3">
        <div className="flex items-center gap-6">
          <Link to={homeLink} className="text-lg font-semibold text-teal">
            {clinic?.name ?? 'OPD'} <span className="text-gold">Care</span>
          </Link>
          {links.length > 0 && (
            <div className="hidden gap-4 text-sm text-gray-600 sm:flex">
              {links.map((l) => (
                <Link key={l.to} to={l.to} className="hover:text-teal">
                  {l.label}
                </Link>
              ))}
            </div>
          )}
        </div>
        {user && (
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden text-gray-600 sm:inline">
              {user.name} <span className="text-gray-400">· {user.role}</span>
            </span>
            <button
              onClick={handleLogout}
              className="hidden rounded-md border border-teal px-3 py-1.5 text-teal transition hover:bg-teal hover:text-white sm:block"
            >
              Log out
            </button>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              data-testid="mobile-menu-button"
              className="rounded-md border border-teal-light p-2 text-teal sm:hidden"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
              </svg>
            </button>
          </div>
        )}
      </div>
      {user && menuOpen && (
        <div id="mobile-nav" className="border-t border-teal-light px-6 pb-4 pt-2 sm:hidden">
          <p className="py-2 text-sm text-gray-600">
            {user.name} <span className="text-gray-400">· {user.role}</span>
          </p>
          <Link to={homeLink} className="block rounded-md px-2 py-2.5 text-gray-700 hover:bg-teal-light hover:text-teal">
            Home
          </Link>
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="block rounded-md px-2 py-2.5 text-gray-700 hover:bg-teal-light hover:text-teal"
            >
              {l.label}
            </Link>
          ))}
          <button
            onClick={handleLogout}
            className="mt-2 w-full rounded-md border border-teal px-3 py-2 text-teal transition hover:bg-teal hover:text-white"
          >
            Log out
          </button>
        </div>
      )}
    </nav>
  );
}
