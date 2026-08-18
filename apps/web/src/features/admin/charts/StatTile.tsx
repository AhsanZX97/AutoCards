import { compactCount, type AnalyticsDelta } from '@autocards/core';
import { Card, CardBody } from '../../../components/ui';
import { cn } from '../../../lib/cn';
import { linePath } from './chartUtils';

interface StatTileProps {
  label: string;
  value: number | null;
  /** Rendered as-is when the value is not a plain count (a percentage, minutes). */
  display?: string;
  delta?: AnalyticsDelta;
  /** What the delta is measured against — "vs previous 7 days". */
  deltaLabel?: string;
  /** One point per day of the window, oldest first. */
  trend?: (number | null)[];
  /** True when a fall is the good direction (overdue reminders, say). */
  invert?: boolean;
  hint?: string;
}

export function StatTile({ label, value, display, delta, deltaLabel, trend, invert, hint }: StatTileProps) {
  return (
    <Card>
      <CardBody className="flex h-full flex-col justify-between gap-3 p-4">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
            {display ?? compactCount(value)}
          </p>
          {delta && <DeltaBadge delta={delta} label={deltaLabel} invert={invert} />}
          {!delta && hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
        </div>
        {trend && trend.length > 1 && <Sparkline values={trend} />}
      </CardBody>
    </Card>
  );
}

/**
 * The change, and whether it is good news.
 *
 * Direction and goodness are separate: fewer overdue reminders is a fall and a
 * win. The arrow says which way it moved, the colour says whether to worry, and
 * the text says both so neither is carried by colour alone.
 */
function DeltaBadge({ delta, label, invert }: { delta: AnalyticsDelta; label?: string; invert?: boolean }) {
  if (delta.direction === 'flat') {
    return (
      <p className="mt-1.5 text-[11px] text-slate-400">No change{label ? ` ${label}` : ''}</p>
    );
  }

  const good = invert ? delta.direction === 'down' : delta.direction === 'up';
  const arrow = delta.direction === 'up' ? '↑' : '↓';
  const amount =
    delta.percent === null
      ? `${delta.absolute > 0 ? '+' : ''}${delta.absolute.toLocaleString('en-US')}`
      : `${delta.percent > 0 ? '+' : ''}${delta.percent}%`;

  return (
    <p className="mt-1.5 flex items-center gap-1 text-[11px]">
      {/* The arrow and the amount are one reading — never broken across lines
          by a narrow tile. */}
      <span
        className={cn(
          'whitespace-nowrap font-semibold',
          good ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
        )}
      >
        {arrow} {amount}
      </span>
      {label && <span className="text-slate-400">{label}</span>}
    </p>
  );
}

/** Twelve-ish points of context under the number. Deliberately unlabelled. */
function Sparkline({ values }: { values: (number | null)[] }) {
  const width = 120;
  const height = 28;
  const max = values.reduce<number>((top, v) => (v !== null && v > top ? v : top), 0) || 1;
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const x = (index: number) => index * step;
  const y = (value: number) => height - (value / max) * (height - 3) - 1.5;

  // Stretched to the tile's width, so the stroke is held at its real weight and
  // no round mark is drawn — an ellipse-shaped "dot" is worse than none.
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="h-7 w-full"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        d={linePath(values, x, y)}
        fill="none"
        stroke="var(--viz-series-1)"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
