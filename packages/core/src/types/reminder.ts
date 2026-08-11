import type { Id, IsoDate } from './common';

/** Indexed to match `Date.getDay()`, so `WEEKDAYS[d.getDay()]` is always right. */
export const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  sun: 'Sun',
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
};

/**
 * How many reminders one deck may carry.
 *
 * Capped because the list is meant to stay readable at a glance, and because
 * past a handful the answer is a different schedule rather than another row.
 */
export const MAX_REMINDERS_PER_DECK = 5;

/**
 * How often a reminder goes out.
 *
 * A union rather than a cron string: every arm carries exactly the fields that
 * arm needs, so a weekly reminder cannot be saved with a day-of-month and the
 * editor never has to guess which control to show.
 *
 * `inactivity` is the irregular one — it has no calendar of its own and fires
 * relative to when the deck was last studied, which is the only cadence that
 * goes quiet on its own while someone is keeping up.
 */
export type ReminderCadence =
  | { kind: 'daily' }
  /** Monday to Friday. */
  | { kind: 'weekdays' }
  | { kind: 'weekly'; days: Weekday[] }
  /** `dayOfMonth` past the end of a short month lands on its last day. */
  | { kind: 'monthly'; dayOfMonth: number }
  /** Sent only once the deck has gone `afterDays` untouched. */
  | { kind: 'inactivity'; afterDays: number }
  /** One-off, on a local `YYYY-MM-DD`. Retires itself once it has passed. */
  | { kind: 'once'; date: string };

export type ReminderCadenceKind = ReminderCadence['kind'];

/**
 * One standing email about one deck.
 *
 * There is no on/off flag: a reminder either exists or it has been deleted.
 * A deck holds a list of these, so "weekdays at 8am and again on Sunday
 * evening" is two rows rather than one setting nobody could express.
 */
export interface DeckReminder {
  id: Id;
  deckId: Id;
  cadence: ReminderCadence;
  /** Local wall-clock `HH:mm`, 24h. */
  timeOfDay: string;
  /**
   * IANA zone captured from the browser when the reminder was saved. The
   * sender runs on a server with no idea where the learner is, so the zone has
   * to travel with the reminder rather than be inferred at send time.
   */
  timeZone: string;
  /**
   * Set by whatever sends the mail, never by the editor. The inactivity
   * cadence counts from it so an abandoned deck is nudged on its own gap
   * rather than every day once the gap has passed.
   */
  lastSentAt?: IsoDate;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

/** The parts of a reminder the editor lets someone change. */
export type ReminderDraft = Pick<DeckReminder, 'cadence' | 'timeOfDay' | 'timeZone'>;
