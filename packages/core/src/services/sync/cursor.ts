import type { IsoDate } from '../../types';

/**
 * How far the cursor deliberately lags the newest row it saw.
 *
 * A row's `updated_at` is stamped when its transaction starts, but it only
 * becomes visible when that transaction commits — so a row can appear *after*
 * a query that should have included it. Holding the cursor a few seconds back
 * means the next pull re-reads that window and picks up anything that landed
 * late. Pulls use `>=` and every merge is idempotent, so re-reading costs a
 * handful of rows and nothing else.
 */
export const CURSOR_SAFETY_WINDOW_MS = 5_000;

/**
 * Where the next pull should start, given where the last one started and the
 * timestamps the server just returned.
 *
 * Derived entirely from row timestamps, never from the device clock. The
 * previous version stamped `nowIso()` here, which meant a machine running fast
 * wrote a cursor into the future: every row another device committed before
 * that instant sorted underneath it and was never pulled again. Study history
 * quietly went missing, and no amount of re-syncing brought it back, because
 * the cursor had already moved past it.
 *
 * The cursor only ever moves forward. An older row arriving late — a device
 * flushing something it wrote offline yesterday — must not rewind it, or every
 * pull after that re-reads the whole account.
 */
export function nextCursor(previous: IsoDate | null, seen: readonly IsoDate[]): IsoDate | null {
  let newest = Number.NEGATIVE_INFINITY;
  for (const value of seen) {
    const at = Date.parse(value);
    if (Number.isFinite(at) && at > newest) newest = at;
  }
  if (newest === Number.NEGATIVE_INFINITY) return previous;

  const candidate = newest - CURSOR_SAFETY_WINDOW_MS;
  const floor = previous === null ? Number.NEGATIVE_INFINITY : Date.parse(previous);
  if (Number.isFinite(floor) && candidate <= floor) return previous;

  return new Date(candidate).toISOString();
}
