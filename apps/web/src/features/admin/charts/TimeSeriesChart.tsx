import { useMemo, useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent } from 'react';
import { cn } from '../../../lib/cn';
import {
  areaPath,
  barPath,
  formatDayFull,
  formatDayLabel,
  formatNumber,
  labelStride,
  linePath,
  niceTicks,
  seriesMax,
  useMeasuredWidth,
  type Series,
} from './chartUtils';

interface TimeSeriesChartProps {
  /** One `YYYY-MM-DD` per position, in order. */
  dates: string[];
  series: Series[];
  kind?: 'line' | 'column';
  /** Only for a single series: a 10% wash under the line. */
  area?: boolean;
  /** Height of the plot itself; the axis band is added on top of it. */
  height?: number;
  /** Fixes the top of the scale — 100 for a percentage, so days compare. */
  yMax?: number;
  format?: (value: number | null) => string;
  windowDays: number;
}

const AXIS_BAND = 24;
const TOP_PAD = 14;
const MAX_BAR_WIDTH = 24;
/** The surface gap that separates touching marks, and the ring around dots. */
const GAP = 2;

export function TimeSeriesChart({
  dates,
  series,
  kind = 'line',
  area = false,
  height = 200,
  yMax,
  format = formatNumber,
  windowDays,
}: TimeSeriesChartProps) {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const ticks = useMemo(() => niceTicks(yMax ?? seriesMax(series)), [series, yMax]);
  const top = ticks[ticks.length - 1] ?? 1;
  const tickLabels = ticks.map((t) => format(t));
  const leftPad = Math.max(30, Math.max(...tickLabels.map((t) => t.length)) * 7 + 8);
  // Room for the end labels a line chart writes beside its last point.
  const rightPad = kind === 'line' ? 44 : 10;

  const innerWidth = Math.max(0, width - leftPad - rightPad);
  const plotBottom = height;
  const band = dates.length > 0 ? innerWidth / dates.length : 0;
  const xAt = (index: number) => leftPad + band * (index + 0.5);
  const yAt = (value: number) => plotBottom - (value / top) * (plotBottom - TOP_PAD);

  const activeDate = active !== null ? dates[active] : undefined;

  function pointerIndex(event: ReactPointerEvent<HTMLDivElement>): number | null {
    if (band <= 0) return null;
    const bounds = event.currentTarget.getBoundingClientRect();
    const index = Math.floor((event.clientX - bounds.left - leftPad) / band);
    if (index < 0 || index >= dates.length) return null;
    return index;
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const step = event.key === 'ArrowRight' ? 1 : -1;
    const from = active ?? (step > 0 ? -1 : dates.length);
    setActive(Math.min(dates.length - 1, Math.max(0, from + step)));
  }

  const stride = labelStride(dates.length, innerWidth);
  const endLabels = kind === 'line' ? buildEndLabels(series, yAt) : [];

  return (
    <div className="w-full">
      {series.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1">
          {series.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <span
                aria-hidden
                className={cn('inline-block rounded-full', kind === 'column' ? 'h-2.5 w-2.5' : 'h-0.5 w-4')}
                style={{ background: s.color }}
              />
              {s.label}
            </span>
          ))}
        </div>
      )}

      <div
        ref={ref}
        className="relative w-full outline-none"
        tabIndex={0}
        role="img"
        aria-label={`${series.map((s) => s.label).join(', ')} by day`}
        onPointerMove={(event) => setActive(pointerIndex(event))}
        onPointerLeave={() => setActive(null)}
        onBlur={() => setActive(null)}
        onKeyDown={onKeyDown}
      >
        <svg width={width || 1} height={height + AXIS_BAND} className="block">
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={leftPad}
                x2={width - rightPad + 4}
                y1={yAt(tick)}
                y2={yAt(tick)}
                stroke="var(--viz-grid)"
                strokeWidth={1}
                shapeRendering="crispEdges"
              />
              <text
                x={leftPad - 8}
                y={yAt(tick) + 3.5}
                textAnchor="end"
                className="fill-[var(--viz-ink-muted)] text-[10px] tabular-nums"
              >
                {format(tick)}
              </text>
            </g>
          ))}

          {/* The hovered day, drawn under the marks so it never hides them. */}
          {active !== null && (
            <rect
              x={xAt(active) - band / 2}
              y={TOP_PAD - 6}
              width={band}
              height={plotBottom - TOP_PAD + 6}
              className="fill-slate-900/[0.04] dark:fill-white/[0.06]"
            />
          )}

          {kind === 'column'
            ? series.map((s, seriesIndex) => {
                // Clamped at both ends: a 90-day window over a narrow card
                // leaves less room per band than the gaps want, and the very
                // first render happens before the container has been measured
                // at all — an unclamped width goes negative in both cases.
                const slot = Math.max(1, band - GAP * 2);
                const barWidth = Math.max(
                  1,
                  Math.min(MAX_BAR_WIDTH, (slot - GAP * (series.length - 1)) / series.length),
                );
                return (
                  <g key={s.key}>
                    {s.values.map((value, index) => {
                      if (value === null || value <= 0) return null;
                      const groupWidth = barWidth * series.length + GAP * (series.length - 1);
                      const x = xAt(index) - groupWidth / 2 + seriesIndex * (barWidth + GAP);
                      const y = yAt(value);
                      return (
                        <path
                          key={index}
                          d={barPath(x, y, barWidth, Math.max(1, plotBottom - y))}
                          fill={s.color}
                          opacity={active === null || active === index ? 1 : 0.55}
                        />
                      );
                    })}
                  </g>
                );
              })
            : series.map((s) => (
                <g key={s.key}>
                  {area && series.length === 1 && (
                    <path d={areaPath(s.values, xAt, yAt, plotBottom)} fill={s.color} opacity={0.1} />
                  )}
                  <path
                    d={linePath(s.values, xAt, yAt)}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {active !== null && s.values[active] !== null && s.values[active] !== undefined && (
                    <circle
                      cx={xAt(active)}
                      cy={yAt(s.values[active] as number)}
                      r={4}
                      fill={s.color}
                      stroke="var(--viz-surface)"
                      strokeWidth={GAP}
                    />
                  )}
                </g>
              ))}

          {endLabels.map((label) => (
            <text
              key={label.key}
              x={width - rightPad + 6}
              y={label.y + 3.5}
              className="fill-slate-500 text-[10px] font-semibold tabular-nums dark:fill-slate-400"
            >
              {format(label.value)}
            </text>
          ))}

          <line
            x1={leftPad}
            x2={width - rightPad + 4}
            y1={plotBottom}
            y2={plotBottom}
            stroke="var(--viz-axis)"
            strokeWidth={1}
            shapeRendering="crispEdges"
          />

          {dates.map((date, index) =>
            index % stride === 0 ? (
              <text
                key={date}
                x={xAt(index)}
                y={plotBottom + 15}
                textAnchor="middle"
                className="fill-[var(--viz-ink-muted)] text-[10px]"
              >
                {formatDayLabel(date, windowDays)}
              </text>
            ) : null,
          )}
        </svg>

        {activeDate && (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-[9rem] rounded-xl border border-slate-200 bg-white/95 p-2.5 shadow-soft backdrop-blur dark:border-slate-700 dark:bg-slate-800/95"
            style={{
              left: Math.min(Math.max(xAt(active as number) - 72, 0), Math.max(0, width - 150)),
            }}
          >
            <p className="mb-1.5 text-[11px] font-medium text-slate-400">{formatDayFull(activeDate)}</p>
            <ul className="space-y-1">
              {series.map((s) => (
                <li key={s.key} className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                    <span aria-hidden className="inline-block h-0.5 w-3 rounded-full" style={{ background: s.color }} />
                    {s.label}
                  </span>
                  <span className="font-semibold tabular-nums text-slate-900 dark:text-white">
                    {format(s.values[active as number] ?? null)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The last value of each series, written beside its line — but only while the
 * labels stay attached to the right lines.
 *
 * Nudging overlapping labels apart detaches them from the series they belong
 * to, so when two would collide none are drawn and the legend and tooltip
 * carry it instead.
 */
function buildEndLabels(
  series: Series[],
  yAt: (value: number) => number,
): { key: string; y: number; value: number }[] {
  const labels = series
    .map((s) => {
      const value = [...s.values].reverse().find((v) => v !== null);
      return value === undefined || value === null ? null : { key: s.key, y: yAt(value), value };
    })
    .filter((label): label is { key: string; y: number; value: number } => label !== null);

  const sorted = [...labels].sort((a, b) => a.y - b.y);
  for (let i = 1; i < sorted.length; i += 1) {
    if (Math.abs(sorted[i]!.y - sorted[i - 1]!.y) < 14) return [];
  }
  return labels;
}
