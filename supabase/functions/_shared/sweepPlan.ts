import { nextSendAt, type ScheduleInput } from './reminderSchedule.ts';

/**
 * What one sweep should do with one reminder row.
 *
 * Split out from the sender so it can be tested without a database, and
 * because the decision is the subtle half: `nextSendAt` answers "when is this
 * cadence next due", which is a pure calendar question, while this answers
 * "given when it was written and when we are looking, is it due *now*" — which
 * is where a reminder can quietly lose a day.
 *
 * It used to. A row is written with no `next_send_at`, and the sweep that
 * first saw it worked the slot out from its own clock, then recorded it and
 * moved on without sending. Any slot that fell in the gap between the row
 * being written and the next sweep was therefore already in the past by the
 * time anything looked, so it rolled to the following day: a reminder set for
 * 17:02 and written at 17:01 arrived twenty-four hours later. Anchoring on
 * `createdAt` instead is what fixes it, and it also takes the sweep interval
 * out of the correctness argument — the five-minute cron now decides only how
 * late a reminder can be, not whether it is sent at all.
 */

/**
 * How long after its slot a first-seen reminder is still worth mailing.
 *
 * Only ever reached by a row that was written but not swept for longer than
 * this — a sweep that was down, or a backlog past `BATCH_LIMIT`. An hour late
 * is a nudge; the next morning it is just noise about a study session that
 * did not happen, so the missed slot is skipped and the next one taken.
 */
export const SWEEP_GRACE_MS = 60 * 60 * 1000;

export type SweepAction =
  /** No slot will ever come again — a spent one-off, or a cadence with no days. */
  | { kind: 'drop' }
  /**
   * Not due. `record` is the slot to write to `next_send_at`, or null when the
   * row already carries the right one and there is nothing to write.
   */
  | { kind: 'wait'; record: Date | null }
  /** Due — mail it, then reschedule from now. */
  | { kind: 'send' };

function asDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

/**
 * @param stored `next_send_at` as it currently stands on the row, if at all.
 * @param now The instant this sweep is running at.
 */
export function planSweep(
  input: ScheduleInput,
  stored: string | null,
  now: Date,
  graceMs: number = SWEEP_GRACE_MS,
): SweepAction {
  const scheduled = asDate(stored);

  if (scheduled) {
    if (scheduled.getTime() > now.getTime()) return { kind: 'wait', record: null };
    // Overdue, however far. The grace window deliberately does not apply to a
    // slot that was already committed to the row: a sweep that was down for an
    // afternoon has to catch up rather than silently drop what it owed.
    return { kind: 'send' };
  }

  // First sight — including a row whose stored slot is unreadable, which is
  // treated as never having been scheduled rather than as due right now.
  //
  // The anchor is when the reminder was written, not when this sweep noticed
  // it. `created_at` comes off the client on the upsert, so it is not to be
  // trusted to be a date; an unusable one falls back to the sweep clock, which
  // is the old behaviour and no worse than it was.
  const anchor = asDate(input.createdAt) ?? now;
  const first = nextSendAt(input, anchor);
  if (!first) return { kind: 'drop' };

  if (first.getTime() > now.getTime()) return { kind: 'wait', record: first };

  if (now.getTime() - first.getTime() <= graceMs) return { kind: 'send' };

  const following = nextSendAt(input, now);
  return following ? { kind: 'wait', record: following } : { kind: 'drop' };
}
