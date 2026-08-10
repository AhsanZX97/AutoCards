import { describe, expect, it } from 'vitest';
import { CURSOR_SAFETY_WINDOW_MS, nextCursor } from '../cursor';

const at = (iso: string) => iso;
const minus = (iso: string, ms: number) => new Date(Date.parse(iso) - ms).toISOString();

describe('nextCursor', () => {
  const previous = '2026-03-01T12:00:00.000Z';

  it('advances to the newest row the server actually returned', () => {
    const newest = '2026-03-01T12:30:00.000Z';

    expect(nextCursor(previous, [at('2026-03-01T12:10:00.000Z'), at(newest)])).toBe(
      minus(newest, CURSOR_SAFETY_WINDOW_MS),
    );
  });

  /**
   * The whole point of deriving this from row timestamps: the device clock
   * never enters into it. A machine running an hour fast used to stamp a
   * cursor into the future, and every row another device wrote in that hour
   * sorted below it and was skipped for good.
   */
  it('ignores the device clock entirely', () => {
    const rows = ['2026-03-01T12:30:00.000Z'];
    const result = nextCursor(previous, rows);

    expect(Date.parse(result as string)).toBeLessThan(Date.parse(rows[0] as string));
  });

  it('holds still when the pull returned nothing', () => {
    expect(nextCursor(previous, [])).toBe(previous);
  });

  it('stays null on a first pull that returned nothing', () => {
    expect(nextCursor(null, [])).toBeNull();
  });

  it('moves off null once there is something to move to', () => {
    const newest = '2026-03-01T12:30:00.000Z';
    expect(nextCursor(null, [newest])).toBe(minus(newest, CURSOR_SAFETY_WINDOW_MS));
  });

  /**
   * A row committed inside the safety window may not have been visible when
   * the query ran, so the cursor deliberately lags the newest row. Pulls use
   * `>=`, and every merge is idempotent, so re-reading that window costs a
   * few rows and closes the gap.
   */
  it('lags the newest row by the safety window', () => {
    const newest = '2026-03-01T12:30:00.000Z';
    const result = nextCursor(previous, [newest]) as string;

    expect(Date.parse(newest) - Date.parse(result)).toBe(CURSOR_SAFETY_WINDOW_MS);
  });

  it('never moves backwards, even if the window would take it there', () => {
    // Only just past the previous cursor — the window would rewind it.
    const barelyNewer = new Date(Date.parse(previous) + 1_000).toISOString();
    expect(nextCursor(previous, [barelyNewer])).toBe(previous);
  });

  it('never moves backwards when an older row arrives late', () => {
    expect(nextCursor(previous, ['2026-02-01T00:00:00.000Z'])).toBe(previous);
  });

  it('skips timestamps it cannot read', () => {
    const newest = '2026-03-01T12:30:00.000Z';
    expect(nextCursor(previous, ['not a date', newest, ''])).toBe(
      minus(newest, CURSOR_SAFETY_WINDOW_MS),
    );
  });

  it('holds still when every timestamp is unreadable', () => {
    expect(nextCursor(previous, ['not a date', ''])).toBe(previous);
  });
});
