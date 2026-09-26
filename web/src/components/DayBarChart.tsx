import type { DashboardDay } from '@opd/shared';

// One value per day of the month as thin columns: one hue (a single series,
// so the card title names it and there's no legend), rounded tops on a
// shared baseline, a hairline axis, and the exact value on hover/focus.
export function DayBarChart({
  days,
  value,
  format,
  label,
}: {
  days: DashboardDay[];
  value: (d: DashboardDay) => number;
  format: (n: number) => string;
  label: string;
}) {
  const values = days.map(value);
  const max = Math.max(...values, 0);
  // A clean top tick: 1, 2, 5 × 10^n at or above the largest value.
  const top = max === 0 ? 1 : (() => {
    const p = 10 ** Math.floor(Math.log10(max));
    return [1, 2, 5, 10].map((m) => m * p).find((t) => t >= max)!;
  })();

  return (
    <figure aria-label={label}>
      <div className="flex gap-2">
        <div className="flex h-40 w-12 flex-col justify-between text-right text-[11px] text-gray-400">
          <span>{format(top)}</span>
          {/* Only a mid tick that reads cleanly (5 → no "2.5"). */}
          <span>{Number.isInteger(top / 2) || top >= 1000 ? format(top / 2) : ''}</span>
          <span>0</span>
        </div>
        <div className="relative h-40 flex-1">
          <div className="absolute inset-x-0 top-0 border-t border-gray-100" />
          <div className="absolute inset-x-0 top-1/2 border-t border-gray-100" />
          <div className="absolute inset-x-0 bottom-0 border-t border-gray-200" />
          <div className="relative flex h-full items-end gap-[2px]">
            {days.map((d, i) => {
              const v = values[i]!;
              return (
                <div key={d.date} className="group relative flex h-full flex-1 items-end justify-center" tabIndex={0} aria-label={`${d.date}: ${format(v)}`}>
                  {v > 0 && (
                    <div className="w-full max-w-[24px] rounded-t bg-teal-mid transition group-hover:bg-teal" style={{ height: `${(v / top) * 100}%` }} />
                  )}
                  <div className="pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs text-white shadow group-hover:block group-focus:block">
                    {Number(d.date.slice(8))} {new Date(`${d.date}T12:00:00`).toLocaleDateString('en-IN', { month: 'short' })}: {format(v)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="ml-14 mt-1 flex text-[11px] text-gray-400">
        {days.map((d) => {
          const n = Number(d.date.slice(8));
          return (
            <span key={d.date} className="flex-1 text-center">
              {n === 1 || n % 7 === 1 ? n : ''}
            </span>
          );
        })}
      </div>
    </figure>
  );
}
