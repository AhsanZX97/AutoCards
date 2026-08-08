import { describe, expect, it } from 'vitest';
import {
  buildActivity,
  buildDeckPerformance,
  computeAchievements,
  computeOverallStats,
  computeStreak,
  levelFromXp,
} from '../statsAggregation';
import type { DayActivity, SessionSummary } from '../../types';

function makeSummary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: 'sesh_1',
    deckId: 'deck_1',
    deckTitle: 'Deck',
    mode: 'cram',
    answered: 10,
    correct: 8,
    accuracy: 0.8,
    finalScore: 500,
    xp: 100,
    letter: 'B',
    maxStreak: 5,
    durationMs: 120_000,
    endedAt: '2026-06-15T12:00:00.000Z',
    ...overrides,
  };
}

describe('levelFromXp', () => {
  it('starts at level 1 with zero xp', () => {
    const level = levelFromXp(0);
    expect(level.level).toBe(1);
    expect(level.xpIntoLevel).toBe(0);
  });

  it('increases level as xp accumulates', () => {
    const low = levelFromXp(50);
    const high = levelFromXp(5000);
    expect(high.level).toBeGreaterThan(low.level);
  });

  it('keeps progress between 0 and 1', () => {
    const level = levelFromXp(1234);
    expect(level.progress).toBeGreaterThanOrEqual(0);
    expect(level.progress).toBeLessThan(1);
  });
});

describe('computeStreak', () => {
  it('is zero with no activity', () => {
    const streak = computeStreak(new Map());
    expect(streak.current).toBe(0);
    expect(streak.longest).toBe(0);
  });

  it('counts consecutive active days ending today', () => {
    const now = new Date('2026-06-15T12:00:00.000Z');
    const activity = new Map<string, DayActivity>([
      ['2026-06-13', { date: '2026-06-13', sessions: 1, cards: 5, correct: 5, xp: 10, minutes: 5 }],
      ['2026-06-14', { date: '2026-06-14', sessions: 1, cards: 5, correct: 5, xp: 10, minutes: 5 }],
      ['2026-06-15', { date: '2026-06-15', sessions: 1, cards: 5, correct: 5, xp: 10, minutes: 5 }],
    ]);
    const streak = computeStreak(activity, now);
    expect(streak.current).toBe(3);
    expect(streak.atRisk).toBe(false);
  });

  it('flags at-risk when yesterday was active but today is not yet', () => {
    const now = new Date('2026-06-15T08:00:00.000Z');
    const activity = new Map<string, DayActivity>([
      ['2026-06-14', { date: '2026-06-14', sessions: 1, cards: 5, correct: 5, xp: 10, minutes: 5 }],
    ]);
    const streak = computeStreak(activity, now);
    expect(streak.current).toBe(1);
    expect(streak.atRisk).toBe(true);
  });

  it('resets current streak after a gap day', () => {
    const now = new Date('2026-06-15T12:00:00.000Z');
    const activity = new Map<string, DayActivity>([
      ['2026-06-10', { date: '2026-06-10', sessions: 1, cards: 5, correct: 5, xp: 10, minutes: 5 }],
    ]);
    const streak = computeStreak(activity, now);
    expect(streak.current).toBe(0);
  });
});

describe('buildActivity', () => {
  it('buckets sessions by day', () => {
    const now = new Date('2026-06-15T12:00:00.000Z');
    const sessions = [
      makeSummary({ endedAt: '2026-06-15T09:00:00.000Z', answered: 5, correct: 4 }),
      makeSummary({ endedAt: '2026-06-15T18:00:00.000Z', answered: 3, correct: 3 }),
    ];
    const activity = buildActivity(sessions, now);
    const today = activity.find((a) => a.date === '2026-06-15');
    expect(today?.sessions).toBe(2);
    expect(today?.cards).toBe(8);
    expect(today?.correct).toBe(7);
  });

  it('returns a fixed window of days even with no sessions', () => {
    const activity = buildActivity([], new Date('2026-06-15T12:00:00.000Z'));
    expect(activity.length).toBeGreaterThan(0);
    expect(activity.every((day) => day.sessions === 0)).toBe(true);
  });
});

describe('buildDeckPerformance', () => {
  it('aggregates per deck and sorts by xp descending', () => {
    const sessions = [
      makeSummary({ deckId: 'a', deckTitle: 'Deck A', xp: 50 }),
      makeSummary({ deckId: 'b', deckTitle: 'Deck B', xp: 500 }),
      makeSummary({ deckId: 'a', deckTitle: 'Deck A', xp: 50 }),
    ];
    const perf = buildDeckPerformance(sessions);
    expect(perf[0]?.deckId).toBe('b');
    expect(perf.find((p) => p.deckId === 'a')?.sessions).toBe(2);
    expect(perf.find((p) => p.deckId === 'a')?.xp).toBe(100);
  });
});

describe('computeOverallStats', () => {
  it('aggregates totals across sessions', () => {
    const sessions = [makeSummary({ answered: 10, correct: 8, xp: 100 }), makeSummary({ answered: 5, correct: 5, xp: 50 })];
    const stats = computeOverallStats(sessions, new Date('2026-06-15T12:00:00.000Z'));
    expect(stats.totalSessions).toBe(2);
    expect(stats.totalCards).toBe(15);
    expect(stats.totalCorrect).toBe(13);
    expect(stats.totalXp).toBe(150);
    expect(stats.accuracy).toBeCloseTo(13 / 15);
  });

  it('returns zeroed stats for no sessions', () => {
    const stats = computeOverallStats([]);
    expect(stats.totalSessions).toBe(0);
    expect(stats.accuracy).toBe(0);
    expect(stats.level.level).toBe(1);
  });
});

describe('computeAchievements', () => {
  it('unlocks the first-session achievement once a session exists', () => {
    const stats = computeOverallStats([makeSummary()], new Date('2026-06-15T12:00:00.000Z'));
    const achievements = computeAchievements(stats);
    const first = achievements.find((a) => a.id === 'first_session');
    expect(first?.unlocked).toBe(true);
  });

  it('leaves achievements locked with no activity', () => {
    const stats = computeOverallStats([]);
    const achievements = computeAchievements(stats);
    expect(achievements.every((a) => !a.unlocked)).toBe(true);
  });

  it('reports fractional progress toward an unmet goal', () => {
    const stats = computeOverallStats([makeSummary({ answered: 10 })], new Date('2026-06-15T12:00:00.000Z'));
    const achievements = computeAchievements(stats);
    const century = achievements.find((a) => a.id === 'century');
    expect(century?.progress).toBeCloseTo(0.1);
    expect(century?.unlocked).toBe(false);
  });
});
