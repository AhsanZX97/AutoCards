import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * The shared geometry every chart here needs. Nothing product-specific lives in
 * this file — it is scales, ticks and paths, kept apart from the marks so the
 * charts themselves stay about what they draw.
 */

/** Categorical slots, in the fixed order defined in `app.css`. */
export const SERIES_COLORS = [
  'var(--viz-series-1)',
  'var(--viz-series-2)',
  'var(--viz-series-3)',
  'var(--viz-series-4)',
] as const;

/** The ordinal ramp, light → dark. Only for values that carry their own order. */
export const STEP_COLORS = [
  'var(--viz-step-1)',
  'var(--viz-step-2)',
  'var(--viz-step-3)',
  'var(--viz-step-4)',
] as const;

export const STATUS_COLORS = {
  good: 'var(--viz-good)',
  warning: 'var(--viz-warning)',
  critical: 'var(--viz-critical)',
} as const;

export interface Series {
  key: string;
  label: string;
  color: string;
  /** One entry per x position. Null is "no data" and leaves a gap, never a zero. */
  values: (number | null)[];
}

/**
 * Width of the element, tracked as it resizes.
 *
 * SVG could scale itself with a viewBox, but that stretches the type with it —
 * axis labels end up wider on a wide screen and unreadable on a narrow one. The
 * charts are laid out in real pixels instead, so text stays text.
 */
export function useMeasuredWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const observer = new ResizeObserver((entries) => {
      const measured = entries[0]?.contentRect.width ?? 0;
      setWidth(Math.round(measured));
    });
    observer.observe(node);
    setWidth(Math.round(node.getBoundingClientRect().width));
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}

/**
 * Round tick values covering 0..max — 0 / 5 / 10, never 0 / 3.7 / 7.4.
 *
 * The ticks carry every value that is not directly labelled, so they have to be
 * numbers a reader can hold in their head.
 */
export function niceTicks(max: number, count = 4): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0, 1];
  const rawStep = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const step = (normalized > 5 ? 10 : normalized > 2 ? 5 : normalized > 1 ? 2 : 1) * magnitude;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= top + step / 2; value += step) {
    // Floating-point steps like 0.1 accumulate error; round to the step's scale.
    ticks.push(Math.round(value * 1e6) / 1e6);
  }
  return ticks;
}

/** The largest value across every series, treating nulls as absent. */
export function seriesMax(series: Series[]): number {
  let max = 0;
  for (const s of series) {
    for (const value of s.values) {
      if (value !== null && value > max) max = value;
    }
  }
  return max;
}

/**
 * A polyline through the points, broken wherever the data is missing.
 *
 * A line drawn straight across a null day claims a measurement nobody took, so
 * the path restarts on the far side of the gap instead.
 */
export function linePath(
  values: (number | null)[],
  x: (index: number) => number,
  y: (value: number) => number,
): string {
  let path = '';
  let open = false;
  values.forEach((value, index) => {
    if (value === null) {
      open = false;
      return;
    }
    path += `${open ? 'L' : 'M'}${x(index).toFixed(2)},${y(value).toFixed(2)}`;
    open = true;
  });
  return path;
}

/** The same line closed down to the baseline, for a single-series area wash. */
export function areaPath(
  values: (number | null)[],
  x: (index: number) => number,
  y: (value: number) => number,
  baseline: number,
): string {
  let path = '';
  let runStart: number | null = null;
  let previous: number | null = null;

  values.forEach((value, index) => {
    if (value === null) {
      if (runStart !== null && previous !== null) {
        path += `L${x(previous).toFixed(2)},${baseline.toFixed(2)}L${x(runStart).toFixed(2)},${baseline.toFixed(2)}Z`;
      }
      runStart = null;
      previous = null;
      return;
    }
    if (runStart === null) {
      runStart = index;
      path += `M${x(index).toFixed(2)},${baseline.toFixed(2)}L${x(index).toFixed(2)},${y(value).toFixed(2)}`;
    } else {
      path += `L${x(index).toFixed(2)},${y(value).toFixed(2)}`;
    }
    previous = index;
  });

  if (runStart !== null && previous !== null) {
    path += `L${x(previous).toFixed(2)},${baseline.toFixed(2)}L${x(runStart).toFixed(2)},${baseline.toFixed(2)}Z`;
  }
  return path;
}

/**
 * A column: rounded at the top, square where it meets the baseline.
 *
 * A `rect` with `rx` rounds all four corners, which lifts the bar off its own
 * baseline and makes short bars read as floating pills. The radius also shrinks
 * with the bar so a one-pixel column is not all corner.
 */
export function barPath(x: number, y: number, width: number, height: number): string {
  const r = Math.max(0, Math.min(4, width / 2, height));
  const bottom = y + height;
  return [
    `M${x},${bottom}`,
    `L${x},${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    `L${x + width - r},${y}`,
    `Q${x + width},${y} ${x + width},${y + r}`,
    `L${x + width},${bottom}`,
    'Z',
  ].join(' ');
}

/**
 * How many x labels to skip so they never collide.
 *
 * A 90-day window cannot label every column at any font size; labelling every
 * nth keeps the axis readable and the tooltip carries the rest.
 */
export function labelStride(count: number, width: number): number {
  const perLabel = 54;
  const fits = Math.max(1, Math.floor(width / perLabel));
  return Math.max(1, Math.ceil(count / fits));
}

/** `Mon 12` on a short window, `12 Aug` once the weekday stops helping. */
export function formatDayLabel(date: string, windowDays: number): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return windowDays <= 14
    ? parsed.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })
    : parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** `Tuesday 12 August` — the tooltip's fuller version of the same day. */
export function formatDayFull(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function formatNumber(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '—';
  return value.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

export function formatPercent(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '—';
  return `${Math.round(value * 10) / 10}%`;
}
