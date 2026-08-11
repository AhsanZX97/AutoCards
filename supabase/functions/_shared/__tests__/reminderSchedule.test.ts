import { describe, expect, it } from 'vitest';
// Reached by path rather than through the package barrel: the barrel pulls in
// pdf.js, which wants a DOM this runner does not have.
import { nextReminderAt } from '../../../../packages/core/src/domain/reminders';
import { MAX_REMINDERS_PER_DECK as CLIENT_MAX_REMINDERS } from '../../../../packages/core/src/types/reminder';
import type { DeckReminder } from '../../../../packages/core/src/types/reminder';
import {
  MAX_REMINDERS_PER_DECK,
  WEEKDAYS,
  nextSendAt,
  type ReminderCadence,
} from '../reminderSchedule';

/**
 * The Edge runtime cannot import the app's copy of this, so it keeps its own.
 * These tests are what stops the two drifting: a cadence the app schedules one
 * way and the sender another means an email at the wrong hour, or none at all,
 * and nothing else in the build would notice.
 */

/** Tuesday 11 August 2026, 09:00 UTC. */
const NOW = new Date('2026-08-11T09:00:00Z');

/** The zone this runner is in, which is the one the app's copy works in. */
const LOCAL_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

const CADENCES: ReminderCadence[] = [
  { kind: 'daily' },
  { kind: 'weekdays' },
  { kind: 'weekly', days: ['mon'] },
  { kind: 'weekly', days: ['mon', 'thu'] },
  { kind: 'weekly', days: ['sat', 'sun'] },
  { kind: 'monthly', dayOfMonth: 1 },
  { kind: 'monthly', dayOfMonth: 20 },
  { kind: 'monthly', dayOfMonth: 31 },
  { kind: 'inactivity', afterDays: 3 },
  { kind: 'inactivity', afterDays: 14 },
  { kind: 'once', date: '2026-08-20' },
  { kind: 'once', date: '2026-01-01' },
];

describe('the sender and the app agree on every cadence', () => {
  // Run at several instants, so a disagreement that only shows up either side
  // of the send time is caught rather than missed by a lucky choice of "now".
  const instants = [
    new Date('2026-08-11T06:00:00Z'),
    NOW,
    new Date('2026-08-11T19:00:00Z'),
    new Date('2026-08-14T23:30:00Z'),
    new Date('2027-01-31T20:00:00Z'),
    // Either side of the EU clock change, where a fixed wall-clock time moves
    // by an hour in UTC but must not move in the learner's day.
    new Date('2026-10-24T12:00:00Z'),
    new Date('2026-10-26T12:00:00Z'),
  ];

  for (const cadence of CADENCES) {
    for (const timeOfDay of ['18:00', '07:30', '00:00', '23:45']) {
      it(`${cadence.kind} (${JSON.stringify(cadence)}) at ${timeOfDay}`, () => {
        for (const now of instants) {
          const reminder: DeckReminder = {
            id: 'rem-1',
            deckId: 'deck-1',
            cadence,
            timeOfDay,
            timeZone: LOCAL_ZONE,
            createdAt: '2026-08-01T12:00:00Z',
            updatedAt: '2026-08-01T12:00:00Z',
          };
          const lastStudiedAt = '2026-08-09T08:00:00Z';

          const fromApp = nextReminderAt(reminder, { now, lastStudiedAt });
          const fromSender = nextSendAt(
            {
              cadence,
              timeOfDay,
              timeZone: LOCAL_ZONE,
              createdAt: reminder.createdAt,
              lastStudiedAt,
            },
            now,
          );

          expect(fromSender?.toISOString() ?? null).toBe(fromApp?.toISOString() ?? null);
        }
      });
    }
  }
});

describe('nextSendAt across timezones', () => {
  it('places the same wall-clock time at a different instant in each zone', () => {
    const base = { cadence: { kind: 'daily' } as ReminderCadence, timeOfDay: '18:00', createdAt: '2026-08-01T12:00:00Z' };
    const london = nextSendAt({ ...base, timeZone: 'Europe/London' }, NOW);
    const warsaw = nextSendAt({ ...base, timeZone: 'Europe/Warsaw' }, NOW);
    const kolkata = nextSendAt({ ...base, timeZone: 'Asia/Kolkata' }, NOW);

    // August, so London is UTC+1 and Warsaw UTC+2 — 6pm comes to Warsaw first.
    expect(london?.toISOString()).toBe('2026-08-11T17:00:00.000Z');
    expect(warsaw?.toISOString()).toBe('2026-08-11T16:00:00.000Z');
    expect(kolkata?.toISOString()).toBe('2026-08-11T12:30:00.000Z');
  });

  it('sends an American 5pm reminder at their 5pm, summer and winter', () => {
    const at5pm = (timeZone: string, now: Date) =>
      nextSendAt(
        { cadence: { kind: 'daily' }, timeOfDay: '17:00', timeZone, createdAt: '2026-08-01T12:00:00Z' },
        now,
      )?.toISOString();

    // August: New York is on EDT (UTC-4), Los Angeles on PDT (UTC-7).
    expect(at5pm('America/New_York', NOW)).toBe('2026-08-11T21:00:00.000Z');
    expect(at5pm('America/Los_Angeles', NOW)).toBe('2026-08-12T00:00:00.000Z');

    // December: EST (UTC-5) and PST (UTC-8). Same 5pm, an hour later in UTC.
    const december = new Date('2026-12-15T09:00:00Z');
    expect(at5pm('America/New_York', december)).toBe('2026-12-15T22:00:00.000Z');
    expect(at5pm('America/Los_Angeles', december)).toBe('2026-12-16T01:00:00.000Z');
  });

  it('follows each country’s own clock-change date, not a shared one', () => {
    // The EU turns its clocks back on 25 October 2026; the US not until
    // 1 November. For that week the usual five-hour gap between London and New
    // York is four, which a fixed offset per zone would get wrong.
    const at5pm = (timeZone: string) =>
      nextSendAt(
        {
          cadence: { kind: 'daily' },
          timeOfDay: '17:00',
          timeZone,
          createdAt: '2026-08-01T12:00:00Z',
        },
        new Date('2026-10-28T09:00:00Z'),
      )?.toISOString();

    expect(at5pm('Europe/London')).toBe('2026-10-28T17:00:00.000Z'); // GMT already
    expect(at5pm('America/New_York')).toBe('2026-10-28T21:00:00.000Z'); // still EDT
  });

  it('keeps an American 5pm at 5pm across the US clock change', () => {
    // Saturday 31 October, 18:30 in New York — 5pm has gone for the day. The
    // next one falls after the clocks go back, so it is an hour later in UTC
    // while being the same time on the learner's wall.
    const next = nextSendAt(
      {
        cadence: { kind: 'daily' },
        timeOfDay: '17:00',
        timeZone: 'America/New_York',
        createdAt: '2026-08-01T12:00:00Z',
      },
      new Date('2026-10-31T22:30:00Z'),
    );
    expect(next?.toISOString()).toBe('2026-11-01T22:00:00.000Z');
  });

  it('keeps 6pm at 6pm across a daylight-saving change', () => {
    // The EU turns the clocks back on 25 October 2026.
    const before = nextSendAt(
      { cadence: { kind: 'daily' }, timeOfDay: '18:00', timeZone: 'Europe/London', createdAt: '2026-08-01T12:00:00Z' },
      new Date('2026-10-24T20:00:00Z'),
    );
    const after = nextSendAt(
      { cadence: { kind: 'daily' }, timeOfDay: '18:00', timeZone: 'Europe/London', createdAt: '2026-08-01T12:00:00Z' },
      new Date('2026-10-26T20:00:00Z'),
    );
    // BST then GMT: the same 6pm, an hour apart in UTC.
    expect(before?.toISOString()).toBe('2026-10-25T18:00:00.000Z');
    expect(after?.toISOString()).toBe('2026-10-27T18:00:00.000Z');
  });

  it('is always strictly in the future, so a reminder cannot send twice', () => {
    for (const cadence of CADENCES) {
      const next = nextSendAt(
        { cadence, timeOfDay: '18:00', timeZone: 'Europe/London', createdAt: '2026-08-01T12:00:00Z' },
        NOW,
      );
      if (next) expect(next.getTime()).toBeGreaterThan(NOW.getTime());
    }
  });

  it('falls back to a sane time rather than refusing an unreadable one', () => {
    const next = nextSendAt(
      { cadence: { kind: 'daily' }, timeOfDay: 'not a time', timeZone: 'Europe/London', createdAt: '2026-08-01T12:00:00Z' },
      NOW,
    );
    expect(next?.toISOString()).toBe('2026-08-11T17:00:00.000Z');
  });

  it('retires a one-off that has passed', () => {
    const next = nextSendAt(
      { cadence: { kind: 'once', date: '2026-01-01' }, timeOfDay: '18:00', timeZone: 'Europe/London', createdAt: '2025-12-01T12:00:00Z' },
      NOW,
    );
    expect(next).toBeNull();
  });
});

describe('the two copies of the shared constants match', () => {
  it('caps reminders per deck at the same number', () => {
    // The database has a third copy of this, in the limit trigger in
    // migration 0009 — change one, change all three.
    expect(MAX_REMINDERS_PER_DECK).toBe(CLIENT_MAX_REMINDERS);
  });

  it('indexes weekdays the same way', () => {
    expect([...WEEKDAYS]).toEqual(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']);
  });
});
