import { useEffect, useState } from 'react';
import { Link, NavLink as RouterNavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { homeRouteForRole } from '../utils/roleHome';
import { navSectionsFor, ROLE_LABELS } from '../utils/navLinks';
import { Icon } from './Icon';

const TIER_LABELS: Record<number, string> = { 1: 'OPD', 2: 'OPD + Services', 3: 'OPD + IPD' };

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

// The signed-in layout: a persistent left sidebar on desktop, a top bar
// with a slide-in drawer on phones. Pages render in the main area.
export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, clinic, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the drawer whenever the route changes, so tapping a link doesn't
  // leave it covering the page that was just opened.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  if (!user) return <>{children}</>;

  const sections = navSectionsFor(user.role, clinic?.tier ?? 1);
  const home = homeRouteForRole(user.role);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const brand = (
    <Link to={home} className="flex items-center gap-3">
      {clinic?.logoUrl ? (
        <img src={clinic.logoUrl} alt="" className="h-9 w-9 rounded-lg object-cover" />
      ) : (
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal text-sm font-semibold text-white">
          {initials(clinic?.name ?? 'OHMS')}
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate font-semibold text-gray-900">{clinic?.name ?? 'OHMS Care'}</span>
        {clinic && (
          <span className="block text-xs text-gray-500">
            Tier {clinic.tier} · {TIER_LABELS[clinic.tier]}
          </span>
        )}
      </span>
    </Link>
  );

  const nav = (
    <nav aria-label="Main" className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {sections.map((section, i) => (
        <div key={section.title ?? i}>
          {section.title && (
            <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-gray-400">{section.title}</p>
          )}
          <ul className="space-y-0.5">
            {section.links.map((l) => (
              <li key={l.to}>
                <RouterNavLink
                  to={l.to}
                  // "/patients" shouldn't stay lit on "/patients/new".
                  end={l.to === '/' || l.to === '/admin' || l.to === '/patients'}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                      isActive ? 'bg-teal font-medium text-white' : 'text-gray-600 hover:bg-teal-light hover:text-teal'
                    }`
                  }
                >
                  <Icon name={l.icon} className="h-[18px] w-[18px] shrink-0" />
                  {l.label}
                </RouterNavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );

  const footer = (
    <div className="border-t border-gray-100 p-3">
      <div className="flex items-center gap-3 rounded-lg px-2 py-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold-light text-sm font-semibold text-gold">
          {initials(user.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-gray-900">{user.name}</span>
          <span className="block text-xs text-gray-500">{ROLE_LABELS[user.role]}</span>
        </span>
        <button
          type="button"
          onClick={handleLogout}
          aria-label="Log out"
          title="Log out"
          className="rounded-md p-2 text-gray-500 transition hover:bg-red-50 hover:text-red-600"
        >
          <Icon name="logout" className="h-[18px] w-[18px]" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:pl-64">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-gray-200 bg-white lg:flex">
        <div className="border-b border-gray-100 px-5 py-4">{brand}</div>
        {nav}
        {footer}
      </aside>

      {/* Phone/tablet top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 lg:hidden">
        {brand}
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
          aria-expanded={drawerOpen}
          aria-controls="mobile-nav"
          data-testid="mobile-menu-button"
          className="rounded-md border border-gray-200 p-2 text-teal"
        >
          <Icon name="menu" />
        </button>
      </header>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/30"
            onClick={() => setDrawerOpen(false)}
          />
          <aside id="mobile-nav" className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-4">
              {brand}
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
                className="rounded-md p-2 text-gray-500"
              >
                <Icon name="close" />
              </button>
            </div>
            {nav}
            {footer}
          </aside>
        </div>
      )}

      <main>{children}</main>
    </div>
  );
}
