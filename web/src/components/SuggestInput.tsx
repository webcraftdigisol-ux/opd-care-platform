import { useMemo, useState } from 'react';

interface SuggestInputProps {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  // Offered only after every match in `suggestions` (e.g. the standard
  // list behind the clinic's own).
  fallback?: string[];
  placeholder?: string;
  className?: string;
  required?: boolean;
  testId?: string;
  // List every suggestion when the box is focused and empty (a short list,
  // like a medicine's brands).
  showAllOnFocus?: boolean;
}

const MAX_SUGGESTIONS = 8;

// A plain filtered dropdown over an already-fetched list (a clinic's own
// pharmacy/lab/radiology catalog, typically a few dozen to a few hundred
// entries) -- not a remote-search autocomplete. Matching the smallness of
// what it searches, there's no debounce or server round-trip: every
// keystroke just re-filters the array already sitting in memory.
export function SuggestInput({ value, onChange, suggestions, fallback, placeholder, className, required, testId, showAllOnFocus }: SuggestInputProps) {
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    const query = value.trim().toLowerCase();
    if (!query) return showAllOnFocus ? suggestions.slice(0, MAX_SUGGESTIONS) : [];
    const rank = (list: string[]) => {
      const hits = list.filter((s) => s.toLowerCase().includes(query) && s.toLowerCase() !== query);
      // Names that start with what was typed come first.
      const starts = hits.filter((s) => s.toLowerCase().startsWith(query));
      return [...starts, ...hits.filter((s) => !s.toLowerCase().startsWith(query))];
    };
    return [...rank(suggestions), ...rank(fallback ?? [])].slice(0, MAX_SUGGESTIONS);
  }, [value, suggestions, fallback, showAllOnFocus]);

  function selectSuggestion(s: string) {
    onChange(s);
    setOpen(false);
  }

  return (
    <div className="relative">
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        // A short delay lets the mousedown on a suggestion register before
        // blur closes the dropdown -- otherwise the click never lands.
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        data-testid={testId}
        className={className}
      />
      {open && matches.length > 0 && (
        <ul
          data-testid={testId ? `${testId}-suggestions` : undefined}
          className="absolute z-10 mt-1 max-h-60 w-max min-w-full max-w-[min(28rem,90vw)] overflow-auto rounded-md border border-gray-200 bg-white text-sm shadow-lg"
        >
          {matches.map((s) => (
            <li key={s}>
              <button
                type="button"
                onMouseDown={() => selectSuggestion(s)}
                className="block w-full px-3 py-1.5 text-left hover:bg-teal-light"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
