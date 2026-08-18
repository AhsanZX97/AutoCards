import { SERIES_COLORS } from './chartUtils';

export interface StackSegment {
  label: string;
  value: number;
}

/**
 * One horizontal bar split into its parts, with the legend carrying the values.
 *
 * The 2px gaps between segments are the surface showing through — that is what
 * separates two neighbouring fills. A stroke around each one would add ink that
 * is not data and make a thin segment read as a border.
 */
export function StackedBar({ segments, empty }: { segments: StackSegment[]; empty?: string }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  if (total === 0) {
    return <p className="py-6 text-center text-sm text-slate-400">{empty ?? 'Nothing to show yet.'}</p>;
  }

  return (
    <div>
      <div className="flex h-4 w-full gap-0.5 overflow-hidden rounded-full">
        {segments.map((segment, index) => (
          <div
            key={segment.label}
            title={`${segment.label}: ${segment.value}`}
            style={{
              width: `${(segment.value / total) * 100}%`,
              background: SERIES_COLORS[index % SERIES_COLORS.length],
            }}
          />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        {segments.map((segment, index) => (
          <li key={segment.label} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: SERIES_COLORS[index % SERIES_COLORS.length] }}
            />
            <span className="text-slate-600 dark:text-slate-300">{segment.label}</span>
            <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-200">
              {segment.value.toLocaleString('en-US')}
            </span>
            <span className="text-xs tabular-nums text-slate-400">
              {Math.round((segment.value / total) * 1000) / 10}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
