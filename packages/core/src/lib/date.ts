import type { IsoDate } from '../types/common';

export const MS_PER_DAY = 86_400_000;

export function nowIso(now: Date = new Date()): IsoDate {
  return now.toISOString();
}

/** Local-time `YYYY-MM-DD`, which is what the activity heatmap buckets on. */
export function toDayKey(date: Date | IsoDate): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const year = d.getFullYear();
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function fromDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

/** Whole days from `a` to `b`, counting calendar days rather than 24h blocks. */
export function daysBetween(a: Date | IsoDate, b: Date | IsoDate): number {
  const from = startOfDay(typeof a === 'string' ? new Date(a) : a);
  const to = startOfDay(typeof b === 'string' ? new Date(b) : b);
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

/** `1:05`, or `1:02:03` once it passes an hour. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = hours > 0 ? `${minutes}`.padStart(2, '0') : `${minutes}`;
  return hours > 0
    ? `${hours}:${mm}:${`${seconds}`.padStart(2, '0')}`
    : `${mm}:${`${seconds}`.padStart(2, '0')}`;
}

/** `1.4s` / `820ms` — used for per-card answer times. */
export function formatSeconds(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatRelative(date: IsoDate, now: Date = new Date()): string {
  const diff = now.getTime() - new Date(date).getTime();
  const abs = Math.abs(diff);
  const future = diff < 0;
  const units: Array<[number, string]> = [
    [60_000, 'minute'],
    [3_600_000, 'hour'],
    [MS_PER_DAY, 'day'],
    [7 * MS_PER_DAY, 'week'],
    [30 * MS_PER_DAY, 'month'],
    [365 * MS_PER_DAY, 'year'],
  ];
  if (abs < 60_000) return 'just now';
  let value = 0;
  let unit = 'minute';
  for (let i = 0; i < units.length; i += 1) {
    const [size, name] = units[i] as [number, string];
    const next = units[i + 1];
    if (!next || abs < next[0]) {
      value = Math.floor(abs / size);
      unit = name;
      break;
    }
  }
  const plural = value === 1 ? unit : `${unit}s`;
  return future ? `in ${value} ${plural}` : `${value} ${plural} ago`;
}

/** Day keys for the last `count` days, oldest first, ending today. */
export function lastNDayKeys(count: number, now: Date = new Date()): string[] {
  const keys: string[] = [];
  const today = startOfDay(now);
  for (let i = count - 1; i >= 0; i -= 1) {
    keys.push(toDayKey(addDays(today, -i)));
  }
  return keys;
}
