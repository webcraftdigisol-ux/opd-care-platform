import { useState } from 'react';

// A list of brand names as removable chips; type a brand and press Enter
// or comma to add it (a pasted "Dolo 650, Calpol 650" adds both).
export function BrandsInput({
  value,
  onChange,
  placeholder = 'Add brand, press Enter',
  testId,
}: {
  value: string[];
  onChange: (brands: string[]) => void;
  placeholder?: string;
  testId?: string;
}) {
  const [draft, setDraft] = useState('');

  function commit(text: string) {
    const next = [...value];
    for (const part of text.split(',')) {
      const b = part.trim();
      if (b && !next.some((n) => n.toLowerCase() === b.toLowerCase())) next.push(b);
    }
    if (next.length !== value.length) onChange(next);
    setDraft('');
  }

  return (
    <div className="flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2 py-1.5 focus-within:border-teal focus-within:ring-2 focus-within:ring-teal/20">
      {value.map((b) => (
        <span key={b} className="inline-flex items-center gap-1 rounded-md bg-gold-light px-2 py-0.5 text-sm text-gray-800">
          {b}
          <button
            type="button"
            onClick={() => onChange(value.filter((x) => x !== b))}
            className="text-gray-500 hover:text-red-600"
            aria-label={`Remove brand ${b}`}
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => (e.target.value.includes(',') ? commit(e.target.value) : setDraft(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit(draft);
          } else if (e.key === 'Backspace' && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => draft.trim() && commit(draft)}
        placeholder={value.length ? '' : placeholder}
        aria-label="Brands"
        data-testid={testId}
        className="min-w-[8rem] flex-1 bg-transparent py-0.5 text-sm focus:outline-none"
      />
    </div>
  );
}
