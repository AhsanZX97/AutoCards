import { MS_PER_DAY, nowIso, startOfDay } from '../lib/date';
import { createId } from '../lib/id';
import { WEEKDAYS, WEEKDAY_LABELS } from '../types';
import type { DeckReminder, Id, IsoDate, ReminderCadence, Weekday } from '../types';

/** Early evening: after a school or work day, early enough to still act on it. */
export const DEFAULT_REMINDER_TIME = '18:00';

/** The gaps offered for an inactivity reminder, in days. */
export const INACTIVITY_DAY_CHOICES = [2, 3, 5, 7, 14, 30] as const;

const MAX_INACTIVITY_DAYS = 90;
/** A month is never longer, so a monthly reminder is clamped at send time instead. */
const MAX_DAY_OF_MONTH = 31;

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Whatever the browser knows, or UTC where there is no Intl (older runtimes, tests). */
export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * A new reminder, as the editor opens it: daily, early evening.
 *
 * Nothing is saved until it is added to a deck, so this is only ever a
 * starting point — the id is minted here so the editor has something stable to
 * key on while it is still being filled in.
 */
export function createReminder(
  deckId: Id,
  options: { now?: Date; timeZone?: string } = {},
): DeckReminder {
  const now = options.now ?? new Date();
  const stamp = nowIso(now);
  return {
    id: createId('rem'),
    deckId,
    cadence: { kind: 'daily' },
    timeOfDay: DEFAULT_REMINDER_TIME,
    timeZone: options.timeZone ?? localTimeZone(),
    createdAt: stamp,
    updatedAt: stamp,
  };
}

/** `HH:mm` as minutes past midnight, or null if it is not a readable time. */
function parseTimeOfDay(value: string): { hours: number; minutes: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
}

/** The given calendar day, at the reminder's wall-clock time. */
function atTime(day: Date, timeOfDay: string): Date {
  const time = parseTimeOfDay(timeOfDay) ?? parseTimeOfDay(DEFAULT_REMINDER_TIME)!;
  const out = startOfDay(day);
  out.setHours(time.hours, time.minutes, 0, 0);
  return out;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

/** Local `YYYY-MM-DD` read back as a Date, without the UTC shift `new Date(s)` applies. */
function fromDateInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Local `YYYY-MM-DD`, which is the format an `<input type="date">` reads and writes. */
export function toDateInput(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.round(value), min), max);
}

/**
 * Repairs a cadence that cannot be scheduled — a day of month past 31, an
 * inactivity gap of zero, weekly with nothing selected.
 *
 * Reminders are edited on one device and sent from a server days later, so a
 * value that only ever produced a broken schedule would do it silently and
 * forever. Everything is pulled into range rather than rejected: the intent is
 * always clear enough to honour.
 */
export function normalizeReminder(reminder: DeckReminder): DeckReminder {
  return {
    ...reminder,
    timeOfDay: parseTimeOfDay(reminder.timeOfDay) ? reminder.timeOfDay : DEFAULT_REMINDER_TIME,
    cadence: normalizeCadence(reminder.cadence),
  };
}

export function normalizeCadence(cadence: ReminderCadence): ReminderCadence {
  switch (cadence.kind) {
    case 'weekly': {
      const chosen = new Set(cadence.days.filter((day) => WEEKDAYS.includes(day)));
      const days = WEEKDAYS.filter((day) => chosen.has(day));
      return { kind: 'weekly', days: days.length > 0 ? days : ['mon'] };
    }
    case 'monthly':
      return { kind: 'monthly', dayOfMonth: clamp(cadence.dayOfMonth, 1, MAX_DAY_OF_MONTH) };
    case 'inactivity':
      return { kind: 'inactivity', afterDays: clamp(cadence.afterDays, 1, MAX_INACTIVITY_DAYS) };
    case 'once':
      return { kind: 'once', date: fromDateInput(cadence.date) ? cadence.date : toDateInput(new Date()) };
    case 'daily':
    case 'weekdays':
      return cadence;
    default:
      return { kind: 'daily' };
  }
}

export interface ReminderContext {
  now: Date;
  /** When this deck was last studied, used only by the inactivity cadence. */
  lastStudiedAt?: IsoDate;
}

/** The next slot strictly after `after` whose weekday passes `matches`. */
function nextMatchingDay(after: Date, timeOfDay: string, matches: (day: number) => boolean): Date | null {
  for (let offset = 0; offset <= 7; offset += 1) {
    const candidate = atTime(addDays(startOfDay(after), offset), timeOfDay);
    if (candidate.getTime() > after.getTime() && matches(candidate.getDay())) return candidate;
  }
  return null;
}

/** The chosen date in the given month, pulled back to the last day of short months. */
function monthlySlot(year: number, month: number, dayOfMonth: number, timeOfDay: string): Date {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return atTime(new Date(year, month, Math.min(dayOfMonth, lastDay)), timeOfDay);
}

/**
 * When this reminder would next go out, or null if it never would again —
 * which only happens to a one-off that has passed, or a weekly reminder left
 * with no days.
 */
export function nextReminderAt(reminder: DeckReminder, context: ReminderContext): Date | null {
  const after = context.now;
  const { timeOfDay, cadence } = reminder;

  switch (cadence.kind) {
    case 'daily':
      return nextMatchingDay(after, timeOfDay, () => true);

    case 'weekdays':
      return nextMatchingDay(after, timeOfDay, (day) => day >= 1 && day <= 5);

    case 'weekly': {
      const wanted = new Set(cadence.days.map((day) => WEEKDAYS.indexOf(day)));
      if (wanted.size === 0) return null;
      return nextMatchingDay(after, timeOfDay, (day) => wanted.has(day));
    }

    case 'monthly': {
      const thisMonth = monthlySlot(after.getFullYear(), after.getMonth(), cadence.dayOfMonth, timeOfDay);
      if (thisMonth.getTime() > after.getTime()) return thisMonth;
      return monthlySlot(after.getFullYear(), after.getMonth() + 1, cadence.dayOfMonth, timeOfDay);
    }

    case 'inactivity': {
      // Counted from the last thing that happened, studying *or* nudging. Left
      // at just `lastStudiedAt`, an untouched deck would clear the gap once and
      // then mail every single day until it was studied.
      const marks = [reminder.createdAt, context.lastStudiedAt, reminder.lastSentAt]
        .filter((mark): mark is IsoDate => Boolean(mark))
        .map((mark) => new Date(mark).getTime())
        .filter((time) => Number.isFinite(time));
      const since = new Date(Math.max(...marks));
      const due = atTime(addDays(startOfDay(since), cadence.afterDays), timeOfDay);
      if (due.getTime() > after.getTime()) return due;
      // Already overdue — catch the next slot rather than a date in the past.
      return nextMatchingDay(after, timeOfDay, () => true);
    }

    case 'once': {
      const day = fromDateInput(cadence.date);
      if (!day) return null;
      const slot = atTime(day, timeOfDay);
      return slot.getTime() > after.getTime() ? slot : null;
    }

    default:
      return null;
  }
}

/** Whether this reminder still has an email ahead of it. */
export function isReminderActive(reminder: DeckReminder, now: Date = new Date()): boolean {
  return nextReminderAt(reminder, { now }) !== null;
}

/** `18:00` → `6:00 PM`. Stored 24h so it sorts and parses; shown 12h so it reads. */
export function formatReminderTime(timeOfDay: string): string {
  const time = parseTimeOfDay(timeOfDay) ?? parseTimeOfDay(DEFAULT_REMINDER_TIME)!;
  const suffix = time.hours < 12 ? 'AM' : 'PM';
  const hours = time.hours % 12 === 0 ? 12 : time.hours % 12;
  return `${hours}:${`${time.minutes}`.padStart(2, '0')} ${suffix}`;
}

/** `1st`, `2nd`, `3rd`, `11th`, `22nd` — for the day of the month. */
function ordinal(value: number): string {
  const lastTwo = value % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${value}th`;
  const suffix = ['th', 'st', 'nd', 'rd'][value % 10] ?? 'th';
  return `${value}${suffix}`;
}

function listWeekdays(days: Weekday[]): string {
  const labels = WEEKDAYS.filter((day) => days.includes(day)).map((day) => WEEKDAY_LABELS[day]);
  if (labels.length <= 1) return labels[0] ?? '';
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

function formatDay(date: Date): string {
  return `${date.getDate()} ${MONTH_LABELS[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * The whole schedule as one sentence, e.g. "Every Mon, Wed and Fri at 6:00 PM".
 *
 * Shown under the controls so the setup can be checked without re-reading every
 * toggle that produced it.
 */
export function describeCadence(reminder: Pick<DeckReminder, 'cadence' | 'timeOfDay'>): string {
  const at = `at ${formatReminderTime(reminder.timeOfDay)}`;
  const cadence = reminder.cadence;
  switch (cadence.kind) {
    case 'daily':
      return `Every day ${at}`;
    case 'weekdays':
      return `Every weekday ${at}`;
    case 'weekly':
      return cadence.days.length > 0 ? `Every ${listWeekdays(cadence.days)} ${at}` : 'No days chosen yet';
    case 'monthly':
      return `On the ${ordinal(cadence.dayOfMonth)} of each month ${at}`;
    case 'inactivity':
      return `After ${cadence.afterDays} day${cadence.afterDays === 1 ? '' : 's'} without studying, ${at}`;
    case 'once': {
      const day = fromDateInput(cadence.date);
      return day ? `Once, on ${formatDay(day)} ${at}` : `Once ${at}`;
    }
    default:
      return `Every day ${at}`;
  }
}

/** `today at 6:00 PM` / `tomorrow at 6:00 PM` / `Mon 17 Aug at 6:00 PM`. */
export function formatNextReminder(next: Date, now: Date = new Date()): string {
  const time = formatReminderTime(
    `${`${next.getHours()}`.padStart(2, '0')}:${`${next.getMinutes()}`.padStart(2, '0')}`,
  );
  const days = Math.round(
    (startOfDay(next).getTime() - startOfDay(now).getTime()) / MS_PER_DAY,
  );
  if (days === 0) return `today at ${time}`;
  if (days === 1) return `tomorrow at ${time}`;
  const weekday = WEEKDAY_LABELS[WEEKDAYS[next.getDay()]!];
  return `${weekday} ${next.getDate()} ${MONTH_LABELS[next.getMonth()]} at ${time}`;
}
