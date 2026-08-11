/**
 * When a reminder is next due, worked out in the learner's own timezone.
 *
 * The app has this same logic in `packages/core/src/domain/reminders.ts`, and
 * Deno cannot import that package — see the note at the top of `plans.ts` for
 * why the copies exist. `__tests__/reminderSchedule.test.ts` runs the two side
 * by side and fails if they ever disagree.
 *
 * The difference between the copies is the clock they read. The app can use
 * plain `Date`, because the browser is already sitting in the learner's
 * timezone. This runs in a datacentre on UTC, so every calendar question —
 * what day is it, when is 6pm — has to be asked of a specific zone, and the
 * answer converted back to an instant.
 */

export const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export type ReminderCadence =
  | { kind: 'daily' }
  | { kind: 'weekdays' }
  | { kind: 'weekly'; days: Weekday[] }
  | { kind: 'monthly'; dayOfMonth: number }
  | { kind: 'inactivity'; afterDays: number }
  | { kind: 'once'; date: string };

/** Mirrors `MAX_REMINDERS_PER_DECK`, and the limit trigger in migration 0009. */
export const MAX_REMINDERS_PER_DECK = 5;

export const DEFAULT_REMINDER_TIME = '18:00';

export interface ScheduleInput {
  cadence: ReminderCadence;
  /** Local wall-clock `HH:mm`. */
  timeOfDay: string;
  /** IANA zone the wall-clock time is meant in. */
  timeZone: string;
  createdAt: string;
  lastSentAt?: string | null;
  /** Latest study session on this deck; only the inactivity cadence reads it. */
  lastStudiedAt?: string | null;
}

const FORMATTERS = new Map<string, Intl.DateTimeFormat>();

/** Cached: building one of these is far more expensive than using it. */
function formatter(timeZone: string): Intl.DateTimeFormat {
  let found = FORMATTERS.get(timeZone);
  if (!found) {
    found = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
    FORMATTERS.set(timeZone, found);
  }
  return found;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = Sunday, matching `Date.getDay()`. */
  weekday: number;
}

/** What a zone's wall clock and calendar read at a given instant. */
function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = formatter(timeZone).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '0';
  return {
    year: Number(value('year')),
    month: Number(value('month')),
    day: Number(value('day')),
    // Some ICU builds render midnight as "24" under hour12: false.
    hour: Number(value('hour')) % 24,
    minute: Number(value('minute')),
    second: Number(value('second')),
    weekday: WEEKDAY_INDEX[value('weekday')] ?? 0,
  };
}

/** How far `timeZone` is from UTC at `date`, in ms. */
function offsetMs(date: Date, timeZone: string): number {
  const parts = zonedParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  // The parts carry no milliseconds, so the instant is floored to the second
  // before subtracting — otherwise sub-second noise lands in the offset.
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * The instant at which `timeZone`'s wall clock reads the given date and time.
 *
 * Two passes, because the offset depends on the answer: the first guess uses
 * the offset in force at the wrong instant, which is only wrong across a
 * daylight-saving change, and the second uses the offset at the guess. Clock
 * changes happen at most twice a year and never move more than an hour, so the
 * second pass always lands.
 */
function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const wall = Date.UTC(year, month - 1, day, hour, minute, 0);
  const guess = wall - offsetMs(new Date(wall), timeZone);
  return new Date(wall - offsetMs(new Date(guess), timeZone));
}

interface CivilDate {
  year: number;
  month: number;
  day: number;
  weekday: number;
}

/**
 * Plain calendar arithmetic — no zone involved.
 *
 * Anchored at UTC noon so that adding days can never tip over a date boundary,
 * which is what makes "the day after" mean the same thing on a clock-change
 * weekend as on any other.
 */
function civilAdd(year: number, month: number, day: number, days: number): CivilDate {
  const anchor = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return {
    year: anchor.getUTCFullYear(),
    month: anchor.getUTCMonth() + 1,
    day: anchor.getUTCDate(),
    weekday: anchor.getUTCDay(),
  };
}

/** Days in a civil month, for pulling the 31st back into February. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function parseTimeOfDay(value: string): { hours: number; minutes: number } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (match) {
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) return { hours, minutes };
  }
  return { hours: 18, minutes: 0 };
}

function parseDateInput(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function timeOf(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

/**
 * The next instant this reminder should be emailed, or null if it never should
 * again — a one-off that has passed, or a weekly reminder with no days.
 *
 * Always strictly after `now`, so a reminder just sent can never be read as
 * still due and mailed twice.
 */
export function nextSendAt(input: ScheduleInput, now: Date): Date | null {
  const { hours, minutes } = parseTimeOfDay(input.timeOfDay);
  const zone = input.timeZone;
  const cadence = input.cadence;

  const today = zonedParts(now, zone);
  const slotOn = (date: { year: number; month: number; day: number }) =>
    zonedTimeToUtc(date.year, date.month, date.day, hours, minutes, zone);

  /** First slot strictly after `now` whose weekday passes `matches`. */
  const nextMatchingDay = (matches: (weekday: number) => boolean): Date | null => {
    for (let offset = 0; offset <= 7; offset += 1) {
      const date = civilAdd(today.year, today.month, today.day, offset);
      const slot = slotOn(date);
      if (slot.getTime() > now.getTime() && matches(date.weekday)) return slot;
    }
    return null;
  };

  const monthlySlot = (year: number, month: number, dayOfMonth: number): Date => {
    // Month 13 rolls into January of the next year.
    const y = month > 12 ? year + 1 : year;
    const m = month > 12 ? month - 12 : month;
    return slotOn({ year: y, month: m, day: Math.min(dayOfMonth, daysInMonth(y, m)) });
  };

  switch (cadence.kind) {
    case 'daily':
      return nextMatchingDay(() => true);

    case 'weekdays':
      return nextMatchingDay((weekday) => weekday >= 1 && weekday <= 5);

    case 'weekly': {
      const wanted = new Set(cadence.days.map((day) => WEEKDAYS.indexOf(day)).filter((i) => i >= 0));
      if (wanted.size === 0) return null;
      return nextMatchingDay((weekday) => wanted.has(weekday));
    }

    case 'monthly': {
      const thisMonth = monthlySlot(today.year, today.month, cadence.dayOfMonth);
      if (thisMonth.getTime() > now.getTime()) return thisMonth;
      return monthlySlot(today.year, today.month + 1, cadence.dayOfMonth);
    }

    case 'inactivity': {
      // Counted from the last thing that happened, studying *or* nudging. Left
      // at just the study time, an untouched deck would clear the gap once and
      // then mail every day until it was opened.
      const marks = [timeOf(input.createdAt), timeOf(input.lastStudiedAt), timeOf(input.lastSentAt)]
        .filter((mark): mark is number => mark !== null);
      if (marks.length === 0) return nextMatchingDay(() => true);
      const since = zonedParts(new Date(Math.max(...marks)), zone);
      const due = slotOn(civilAdd(since.year, since.month, since.day, cadence.afterDays));
      if (due.getTime() > now.getTime()) return due;
      // Already overdue — catch the next slot rather than a date in the past.
      return nextMatchingDay(() => true);
    }

    case 'once': {
      const date = parseDateInput(cadence.date);
      if (!date) return null;
      const slot = slotOn(date);
      return slot.getTime() > now.getTime() ? slot : null;
    }

    default:
      return null;
  }
}
