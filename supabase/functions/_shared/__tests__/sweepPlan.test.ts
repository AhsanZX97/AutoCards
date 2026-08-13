import { describe, expect, it } from 'vitest';
import { planSweep, SWEEP_GRACE_MS } from '../sweepPlan';
import type { ScheduleInput } from '../reminderSchedule';

/**
 * What one sweep should do with one row.
 *
 * The case that matters most is the first one: a reminder written a minute
 * before its own slot used to be scheduled for the *following* day, because the
 * slot was worked out from whenever the sweep happened to notice the row rather
 * than from when the row was written. Nothing in the build caught that — the
 * schedule was correct, the sending was correct, and the join between them
 * quietly lost a day.
 */

/** A daily reminder at 17:02 London, which is 16:02 UTC in August. */
function daily(createdAt: string): ScheduleInput {
  return {
    cadence: { kind: 'daily' },
    timeOfDay: '17:02',
    timeZone: 'Europe/London',
    createdAt,
  };
}

describe('planSweep, on a row the sweep has never seen', () => {
  it('sends a slot that fell between the row being written and this sweep', () => {
    // The real row from 13 August: written 16:01:40Z for a 16:02Z slot, first
    // swept at 16:05Z. It went out a day late.
    const action = planSweep(
      daily('2026-08-13T16:01:40.174Z'),
      null,
      new Date('2026-08-13T16:05:00Z'),
    );

    expect(action).toEqual({ kind: 'send' });
  });

  it('records the slot without sending when it is still ahead', () => {
    const action = planSweep(
      daily('2026-08-13T14:55:53Z'),
      null,
      new Date('2026-08-13T15:00:00Z'),
    );

    expect(action).toEqual({ kind: 'wait', record: new Date('2026-08-13T16:02:00Z') });
  });

  it('does not fire the moment it is noticed, when the slot is hours away', () => {
    // A reminder created at 3pm for 6pm must still wait until 6pm.
    const action = planSweep(
      daily('2026-08-13T09:00:00Z'),
      null,
      new Date('2026-08-13T09:05:00Z'),
    );

    expect(action).toEqual({ kind: 'wait', record: new Date('2026-08-13T16:02:00Z') });
  });

  it('rolls forward instead of mailing about a slot missed long ago', () => {
    // Four hours late is not a nudge any more, so the missed slot is skipped
    // and the next one taken.
    const action = planSweep(
      daily('2026-08-13T10:00:00Z'),
      null,
      new Date('2026-08-13T20:00:00Z'),
    );

    expect(action).toEqual({ kind: 'wait', record: new Date('2026-08-14T16:02:00Z') });
  });

  it('still sends a slot missed by just under the grace window', () => {
    const now = new Date(new Date('2026-08-13T16:02:00Z').getTime() + SWEEP_GRACE_MS - 1000);
    const action = planSweep(daily('2026-08-13T16:01:00Z'), null, now);

    expect(action).toEqual({ kind: 'send' });
  });

  it('retires a one-off whose date had already gone when it was written', () => {
    const action = planSweep(
      { ...daily('2026-08-13T16:01:40Z'), cadence: { kind: 'once', date: '2026-08-01' } },
      null,
      new Date('2026-08-13T16:05:00Z'),
    );

    expect(action).toEqual({ kind: 'drop' });
  });

  it('falls back to the sweep clock when created_at is unusable', () => {
    // `created_at` arrives from the client on the upsert, so it is not to be
    // trusted to be a date at all. A bad one must not take the batch down.
    const action = planSweep(daily('not a date'), null, new Date('2026-08-13T16:05:00Z'));

    expect(action).toEqual({ kind: 'wait', record: new Date('2026-08-14T16:02:00Z') });
  });
});

describe('planSweep, on a row that already carries a slot', () => {
  it('waits, and rewrites nothing, while the slot is ahead', () => {
    const action = planSweep(
      daily('2026-08-13T09:00:00Z'),
      '2026-08-13T16:02:00Z',
      new Date('2026-08-13T15:00:00Z'),
    );

    expect(action).toEqual({ kind: 'wait', record: null });
  });

  it('sends once the slot has arrived', () => {
    const action = planSweep(
      daily('2026-08-13T09:00:00Z'),
      '2026-08-13T16:02:00Z',
      new Date('2026-08-13T16:05:00Z'),
    );

    expect(action).toEqual({ kind: 'send' });
  });

  it('still sends a slot the sweep is hours late for', () => {
    // An outage catching up. The grace window deliberately does not apply
    // here: a sweep that was down for an afternoon must not silently eat
    // everyone's reminders.
    const action = planSweep(
      daily('2026-08-13T09:00:00Z'),
      '2026-08-13T16:02:00Z',
      new Date('2026-08-14T04:00:00Z'),
    );

    expect(action).toEqual({ kind: 'send' });
  });

  it('treats an unparseable stored slot as never having been scheduled', () => {
    const action = planSweep(
      daily('2026-08-13T14:55:53Z'),
      'not a date',
      new Date('2026-08-13T15:00:00Z'),
    );

    expect(action).toEqual({ kind: 'wait', record: new Date('2026-08-13T16:02:00Z') });
  });
});
