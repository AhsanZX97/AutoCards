import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REMINDER_TIME,
  createReminder,
  describeCadence,
  formatNextReminder,
  formatReminderTime,
  isReminderActive,
  nextReminderAt,
  normalizeReminder,
} from '../reminders';
import type { DeckReminder, ReminderCadence } from '../../types';

/** Tuesday 11 August 2026, 09:00 local. Every case below is anchored to it. */
const NOW = new Date(2026, 7, 11, 9, 0, 0, 0);

function reminder(cadence: ReminderCadence, patch: Partial<DeckReminder> = {}): DeckReminder {
  return {
    id: 'rem-1',
    deckId: 'deck-1',
    cadence,
    timeOfDay: '18:00',
    timeZone: 'Europe/London',
    emailEnabled: true,
    createdAt: new Date(2026, 7, 1, 12, 0).toISOString(),
    updatedAt: new Date(2026, 7, 1, 12, 0).toISOString(),
    ...patch,
  };
}

describe('createReminder', () => {
  it('gives every reminder its own id so a deck can hold more than one', () => {
    const first = createReminder('deck-1', { now: NOW });
    const second = createReminder('deck-1', { now: NOW });
    expect(first.id).not.toBe(second.id);
  });

  it('opens on a daily evening reminder', () => {
    const created = createReminder('deck-1', { now: NOW });
    expect(created.cadence).toEqual({ kind: 'daily' });
    expect(created.timeOfDay).toBe(DEFAULT_REMINDER_TIME);
    expect(created.deckId).toBe('deck-1');
  });

  it('opens with email on, matching today’s always-on behaviour', () => {
    expect(createReminder('deck-1', { now: NOW }).emailEnabled).toBe(true);
  });
});

describe('nextReminderAt', () => {
  it('returns today for a daily reminder whose time has not passed yet', () => {
    expect(nextReminderAt(reminder({ kind: 'daily' }), { now: NOW })).toEqual(
      new Date(2026, 7, 11, 18, 0),
    );
  });

  it('rolls a daily reminder to tomorrow once the time has passed', () => {
    const evening = new Date(2026, 7, 11, 20, 0);
    expect(nextReminderAt(reminder({ kind: 'daily' }), { now: evening })).toEqual(
      new Date(2026, 7, 12, 18, 0),
    );
  });

  it('skips the weekend for a weekdays reminder', () => {
    const fridayNight = new Date(2026, 7, 14, 20, 0);
    expect(nextReminderAt(reminder({ kind: 'weekdays' }), { now: fridayNight })).toEqual(
      new Date(2026, 7, 17, 18, 0),
    );
  });

  it('picks the nearest chosen day for a weekly reminder', () => {
    const weekly = reminder({ kind: 'weekly', days: ['mon', 'thu'] });
    expect(nextReminderAt(weekly, { now: NOW })).toEqual(new Date(2026, 7, 13, 18, 0));
  });

  it('returns null for a weekly reminder with no days chosen', () => {
    expect(nextReminderAt(reminder({ kind: 'weekly', days: [] }), { now: NOW })).toBeNull();
  });

  it('uses this month for a monthly reminder whose date is still ahead', () => {
    expect(nextReminderAt(reminder({ kind: 'monthly', dayOfMonth: 20 }), { now: NOW })).toEqual(
      new Date(2026, 7, 20, 18, 0),
    );
  });

  it('moves to next month once this month’s date has gone', () => {
    expect(nextReminderAt(reminder({ kind: 'monthly', dayOfMonth: 3 }), { now: NOW })).toEqual(
      new Date(2026, 8, 3, 18, 0),
    );
  });

  it('lands on the last day of a month too short for the chosen date', () => {
    const january = new Date(2027, 0, 31, 20, 0);
    expect(nextReminderAt(reminder({ kind: 'monthly', dayOfMonth: 31 }), { now: january })).toEqual(
      new Date(2027, 1, 28, 18, 0),
    );
  });

  it('counts an inactivity reminder from the last time the deck was studied', () => {
    const idle = reminder({ kind: 'inactivity', afterDays: 3 });
    const lastStudiedAt = new Date(2026, 7, 10, 8, 0).toISOString();
    expect(nextReminderAt(idle, { now: NOW, lastStudiedAt })).toEqual(new Date(2026, 7, 13, 18, 0));
  });

  it('falls back to the next daily slot when the deck is already overdue', () => {
    const idle = reminder({ kind: 'inactivity', afterDays: 3 });
    const lastStudiedAt = new Date(2026, 6, 1, 8, 0).toISOString();
    expect(nextReminderAt(idle, { now: NOW, lastStudiedAt })).toEqual(new Date(2026, 7, 11, 18, 0));
  });

  it('waits out the gap again after a nudge rather than mailing every day', () => {
    const idle = reminder({ kind: 'inactivity', afterDays: 3 }, {
      lastSentAt: new Date(2026, 7, 11, 18, 0).toISOString(),
    });
    const lastStudiedAt = new Date(2026, 6, 1, 8, 0).toISOString();
    expect(nextReminderAt(idle, { now: NOW, lastStudiedAt })).toEqual(new Date(2026, 7, 14, 18, 0));
  });

  it('counts an inactivity reminder from when it was created if the deck was never studied', () => {
    // Created 1 Aug, so a 20-day gap is still running on the 11th.
    const idle = reminder({ kind: 'inactivity', afterDays: 20 });
    expect(nextReminderAt(idle, { now: NOW })).toEqual(new Date(2026, 7, 21, 18, 0));
  });

  it('returns the day itself for a one-off still to come', () => {
    expect(nextReminderAt(reminder({ kind: 'once', date: '2026-08-20' }), { now: NOW })).toEqual(
      new Date(2026, 7, 20, 18, 0),
    );
  });

  it('retires a one-off that has already passed', () => {
    expect(nextReminderAt(reminder({ kind: 'once', date: '2026-08-01' }), { now: NOW })).toBeNull();
  });
});

describe('isReminderActive', () => {
  it('is false for a one-off that has already been and gone', () => {
    expect(isReminderActive(reminder({ kind: 'once', date: '2026-08-01' }), NOW)).toBe(false);
  });

  it('is true for a daily reminder', () => {
    expect(isReminderActive(reminder({ kind: 'daily' }), NOW)).toBe(true);
  });
});

describe('normalizeReminder', () => {
  it('replaces an unreadable time with the default', () => {
    expect(normalizeReminder(reminder({ kind: 'daily' }, { timeOfDay: '25:99' })).timeOfDay).toBe(
      DEFAULT_REMINDER_TIME,
    );
  });

  it('puts weekly days in week order and drops duplicates', () => {
    const fixed = normalizeReminder(reminder({ kind: 'weekly', days: ['fri', 'mon', 'fri'] }));
    expect(fixed.cadence).toEqual({ kind: 'weekly', days: ['mon', 'fri'] });
  });

  it('falls back to Monday when a weekly reminder has no days left', () => {
    const fixed = normalizeReminder(reminder({ kind: 'weekly', days: [] }));
    expect(fixed.cadence).toEqual({ kind: 'weekly', days: ['mon'] });
  });

  it('clamps a day of month into range', () => {
    const fixed = normalizeReminder(reminder({ kind: 'monthly', dayOfMonth: 44 }));
    expect(fixed.cadence).toEqual({ kind: 'monthly', dayOfMonth: 31 });
  });

  it('clamps an inactivity gap into range', () => {
    const fixed = normalizeReminder(reminder({ kind: 'inactivity', afterDays: 0 }));
    expect(fixed.cadence).toEqual({ kind: 'inactivity', afterDays: 1 });
  });

  it('turns email on for a reminder written before the field existed', () => {
    const stale = reminder({ kind: 'daily' });
    const { emailEnabled: _drop, ...withoutField } = stale;
    expect(normalizeReminder(withoutField as DeckReminder).emailEnabled).toBe(true);
  });

  it('leaves email off once someone has switched it off', () => {
    const fixed = normalizeReminder(reminder({ kind: 'daily' }, { emailEnabled: false }));
    expect(fixed.emailEnabled).toBe(false);
  });
});

describe('formatReminderTime', () => {
  it('reads 24h storage back as a 12h clock', () => {
    expect(formatReminderTime('18:00')).toBe('6:00 PM');
    expect(formatReminderTime('09:30')).toBe('9:30 AM');
    expect(formatReminderTime('00:00')).toBe('12:00 AM');
    expect(formatReminderTime('12:15')).toBe('12:15 PM');
  });
});

describe('describeCadence', () => {
  it('describes each cadence as a sentence someone can check at a glance', () => {
    expect(describeCadence(reminder({ kind: 'daily' }))).toBe('Every day at 6:00 PM');
    expect(describeCadence(reminder({ kind: 'weekdays' }))).toBe('Every weekday at 6:00 PM');
    expect(describeCadence(reminder({ kind: 'weekly', days: ['mon'] }))).toBe('Every Mon at 6:00 PM');
    expect(describeCadence(reminder({ kind: 'weekly', days: ['mon', 'wed', 'fri'] }))).toBe(
      'Every Mon, Wed and Fri at 6:00 PM',
    );
    expect(describeCadence(reminder({ kind: 'monthly', dayOfMonth: 1 }))).toBe(
      'On the 1st of each month at 6:00 PM',
    );
    expect(describeCadence(reminder({ kind: 'monthly', dayOfMonth: 22 }))).toBe(
      'On the 22nd of each month at 6:00 PM',
    );
    expect(describeCadence(reminder({ kind: 'inactivity', afterDays: 1 }))).toBe(
      'After 1 day without studying, at 6:00 PM',
    );
    expect(describeCadence(reminder({ kind: 'inactivity', afterDays: 3 }))).toBe(
      'After 3 days without studying, at 6:00 PM',
    );
    expect(describeCadence(reminder({ kind: 'once', date: '2026-08-20' }))).toBe(
      'Once, on 20 Aug 2026 at 6:00 PM',
    );
  });
});

describe('formatNextReminder', () => {
  it('names today and tomorrow rather than spelling out the date', () => {
    expect(formatNextReminder(new Date(2026, 7, 11, 18, 0), NOW)).toBe('today at 6:00 PM');
    expect(formatNextReminder(new Date(2026, 7, 12, 18, 0), NOW)).toBe('tomorrow at 6:00 PM');
  });

  it('gives the weekday for anything further out', () => {
    expect(formatNextReminder(new Date(2026, 7, 17, 18, 0), NOW)).toBe('Mon 17 Aug at 6:00 PM');
  });
});
