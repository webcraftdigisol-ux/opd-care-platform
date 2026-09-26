import { Link, useLocation } from 'react-router-dom';
import type { Department } from '@opd/shared';
import { Icon } from './Icon';
import { DEPTS } from '../utils/departments';

// The department page's header and tabs: Counter (patients), the list
// (medicines / tests, with prices and costs) and the Report.
export function DeptTabs({ dept, actions }: { dept: Department; actions?: React.ReactNode }) {
  const info = DEPTS[dept];
  const { pathname } = useLocation();
  const tabs = [
    { to: info.base, label: 'Counter' },
    { to: `${info.base}/settings`, label: info.listTitle },
    { to: `${info.base}/report`, label: 'Report' },
  ];
  const active = tabs.filter((t) => pathname === t.to || pathname.startsWith(`${t.to}/`)).sort((a, b) => b.to.length - a.to.length)[0]?.to;
  return (
    <div className="mb-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-gray-900">
          <Icon name={info.icon} className="h-6 w-6 text-teal" /> {info.label}
        </h1>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      <nav className="flex gap-1 overflow-x-auto border-b border-gray-200" aria-label={`${info.label} sections`}>
        {tabs.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            aria-current={t.to === active ? 'page' : undefined}
            className={`-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium ${
              t.to === active ? 'border-teal text-teal' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
            data-testid={`dept-tab-${t.label.toLowerCase().replace(/\s+/g, '-')}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
