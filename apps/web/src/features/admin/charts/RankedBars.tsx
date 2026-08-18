import { cn } from '../../../lib/cn';

export interface RankedRow {
  label: string;
  value: number;
  /** Right-hand detail — cards answered, a plan name. */
  note?: string;
}

interface RankedBarsProps {
  rows: RankedRow[];
  /** What the number is, for the row's accessible name. */
  unit: string;
  empty?: string;
}

/**
 * A leaderboard: one bar per row, longest first.
 *
 * Every bar is the same colour on purpose. These are names — decks, models,
 * providers — with no order of their own beyond the length of the bar, and
 * shading them by value would re-encode the only thing the bar already says.
 */
export function RankedBars({ rows, unit, empty = 'Nothing yet in this window.' }: RankedBarsProps) {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-400">{empty}</p>;
  }

  const max = rows.reduce((top, row) => Math.max(top, row.value), 0) || 1;

  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="truncate text-sm text-slate-700 dark:text-slate-200" title={row.label}>
              {row.label}
            </span>
            <span className="shrink-0 text-xs tabular-nums text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {row.value.toLocaleString('en-US')}
              </span>{' '}
              {unit}
              {row.note && <span className="ml-1.5 text-slate-400">{row.note}</span>}
            </span>
          </div>
          <div className={cn('h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800')}>
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max(2, (row.value / max) * 100)}%`, background: 'var(--viz-series-1)' }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
