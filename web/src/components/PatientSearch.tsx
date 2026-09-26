import { useEffect, useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { PatientSearchResult } from '@opd/shared';
import { findPatients } from '../api/patients';
import { Icon } from './Icon';
import { formatDate, sexAge } from '../utils/patientFormat';

export function useDebounced<T>(value: T, ms = 200): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function usePatientSearch(query: string) {
  const q = useDebounced(query.trim());
  return useQuery({
    queryKey: ['patient-search', q],
    queryFn: () => findPatients(q),
    enabled: q.length >= 1,
    placeholderData: (prev) => prev,
    staleTime: 10_000,
  });
}

export function PatientResultRow({ p, active, showLastVisit = true }: { p: PatientSearchResult; active?: boolean; showLastVisit?: boolean }) {
  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 ${active ? 'bg-teal-light' : ''}`}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-light text-sm font-semibold text-teal">
        {p.name.charAt(0).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium text-gray-900">{p.name}</span>
          <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-600">{p.patientCode}</span>
        </span>
        <span className="block truncate text-xs text-gray-500">
          {[
            sexAge(p.gender, p.age),
            p.phone,
            showLastVisit && (p.lastVisit ? `Last visit ${formatDate(p.lastVisit)}` : 'No visits yet'),
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </span>
    </div>
  );
}

// The one patient search used everywhere: type any part of a name, a
// mobile number however it's written, or a Patient ID; pick a suggestion
// with the mouse or ↑/↓/Enter. By default picking opens the profile.
export function PatientSearch({
  onSelect,
  placeholder = 'Search by name, mobile number or Patient ID',
  autoFocus,
  size = 'md',
}: {
  onSelect?: (p: PatientSearchResult) => void;
  placeholder?: string;
  autoFocus?: boolean;
  size?: 'md' | 'lg';
}) {
  const navigate = useNavigate();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const { data, isFetching } = usePatientSearch(query);
  const results = query.trim() ? (data ?? []) : [];

  useEffect(() => setActive(0), [data]);

  function pick(p: PatientSearchResult) {
    setOpen(false);
    setQuery('');
    if (onSelect) onSelect(p);
    else navigate(`/patients/${p.id}`);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!results.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(results[active]!);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  const showList = open && query.trim().length > 0;

  return (
    <div className="relative">
      <div
        className={`flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 shadow-sm focus-within:border-teal focus-within:ring-2 focus-within:ring-teal/20 ${
          size === 'lg' ? 'py-3' : 'py-2'
        }`}
      >
        <Icon name="search" className="h-5 w-5 text-gray-400" />
        <input
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label="Search patients"
          data-testid="patient-search"
          autoFocus={autoFocus}
          value={query}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
          className="w-full bg-transparent text-gray-900 placeholder:text-gray-400 focus:outline-none"
        />
        {isFetching && <span className="h-4 w-4 animate-spin rounded-full border-2 border-teal border-t-transparent" />}
      </div>
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-96 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
        >
          {results.length === 0 && !isFetching && (
            <li className="px-3 py-3 text-sm text-gray-500">No patient matches “{query.trim()}”.</li>
          )}
          {results.map((p, i) => (
            <li
              key={p.id}
              role="option"
              aria-selected={i === active}
              data-testid="patient-search-result"
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(p)}
              className="cursor-pointer"
            >
              <PatientResultRow p={p} active={i === active} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
