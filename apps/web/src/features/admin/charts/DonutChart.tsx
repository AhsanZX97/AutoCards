import { useState } from 'react';
import { SERIES_COLORS } from './chartUtils';

export interface DonutSlice {
  label: string;
  value: number;
  /** Optional second line in the legend — an accuracy, a note. */
  note?: string;
}

interface DonutChartProps {
  slices: DonutSlice[];
  /** Sits in the hole: what the total is a total of. */
  centerLabel: string;
  size?: number;
}

const GAP_DEGREES = 2;

/**
 * Part-to-whole at a glance, for a handful of segments.
 *
 * Every slice is listed beside the ring with its own count and share, because a
 * ring is only good for "roughly how is this split" — two close slices are not
 * comparable by arc, and the legend is what makes them readable.
 */
export function DonutChart({ slices, centerLabel, size = 168 }: DonutChartProps) {
  const [active, setActive] = useState<string | null>(null);
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const radius = size / 2 - 10;
  const inner = radius * 0.62;

  let cursor = -90;
  const arcs = slices.map((slice, index) => {
    const sweep = total === 0 ? 0 : (slice.value / total) * 360;
    const start = cursor + (sweep > GAP_DEGREES ? GAP_DEGREES / 2 : 0);
    const end = cursor + sweep - (sweep > GAP_DEGREES ? GAP_DEGREES / 2 : 0);
    cursor += sweep;
    return {
      ...slice,
      color: SERIES_COLORS[index % SERIES_COLORS.length]!,
      path: annulusPath(size / 2, size / 2, radius, inner, start, end),
      share: total === 0 ? 0 : Math.round((slice.value / total) * 1000) / 10,
    };
  });

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg width={size} height={size} className="shrink-0" role="img" aria-label={centerLabel}>
        {arcs.map((arc) => (
          <path
            key={arc.label}
            d={arc.path}
            fill={arc.color}
            opacity={active === null || active === arc.label ? 1 : 0.5}
            onPointerEnter={() => setActive(arc.label)}
            onPointerLeave={() => setActive(null)}
          />
        ))}
        <text
          x={size / 2}
          y={size / 2 - 2}
          textAnchor="middle"
          className="fill-slate-900 text-lg font-semibold tabular-nums dark:fill-white"
        >
          {total.toLocaleString('en-US')}
        </text>
        <text x={size / 2} y={size / 2 + 14} textAnchor="middle" className="fill-[var(--viz-ink-muted)] text-[10px]">
          {centerLabel}
        </text>
      </svg>

      <ul className="min-w-[9rem] flex-1 space-y-2">
        {arcs.map((arc) => (
          <li
            key={arc.label}
            className="flex items-baseline justify-between gap-3 text-sm"
            onPointerEnter={() => setActive(arc.label)}
            onPointerLeave={() => setActive(null)}
          >
            <span className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: arc.color }} />
              <span>
                {arc.label}
                {arc.note && <span className="ml-1.5 text-xs text-slate-400">{arc.note}</span>}
              </span>
            </span>
            <span className="tabular-nums text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-slate-800 dark:text-slate-200">{arc.value}</span>
              <span className="ml-1.5 text-xs">{arc.share}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One ring segment, as a filled path between two radii. */
function annulusPath(
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  startDeg: number,
  endDeg: number,
): string {
  // A full circle cannot be drawn as a single arc — its start and end points
  // are the same, so the renderer draws nothing at all.
  const sweep = endDeg - startDeg;
  if (sweep <= 0) return '';
  if (sweep >= 359.9) {
    return [
      `M${cx - outer},${cy}`,
      `A${outer},${outer} 0 1 1 ${cx + outer},${cy}`,
      `A${outer},${outer} 0 1 1 ${cx - outer},${cy}`,
      `M${cx - inner},${cy}`,
      `A${inner},${inner} 0 1 0 ${cx + inner},${cy}`,
      `A${inner},${inner} 0 1 0 ${cx - inner},${cy}`,
      'Z',
    ].join(' ');
  }

  const start = polar(cx, cy, outer, startDeg);
  const end = polar(cx, cy, outer, endDeg);
  const innerEnd = polar(cx, cy, inner, endDeg);
  const innerStart = polar(cx, cy, inner, startDeg);
  const large = sweep > 180 ? 1 : 0;

  return [
    `M${start.x},${start.y}`,
    `A${outer},${outer} 0 ${large} 1 ${end.x},${end.y}`,
    `L${innerEnd.x},${innerEnd.y}`,
    `A${inner},${inner} 0 ${large} 0 ${innerStart.x},${innerStart.y}`,
    'Z',
  ].join(' ');
}

function polar(cx: number, cy: number, radius: number, degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  return { x: cx + radius * Math.cos(radians), y: cy + radius * Math.sin(radians) };
}
