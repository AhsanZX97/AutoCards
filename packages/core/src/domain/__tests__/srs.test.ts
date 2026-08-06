import { describe, expect, it } from 'vitest';
import { computeMastery, createSrsState, reviewCard } from '../srs';

const now = new Date('2026-01-01T00:00:00.000Z');

describe('createSrsState', () => {
  it('starts new with zero interval and due immediately', () => {
    const srs = createSrsState(now);
    expect(srs.state).toBe('new');
    expect(srs.intervalDays).toBe(0);
    expect(srs.repetitions).toBe(0);
    expect(new Date(srs.dueAt).getTime()).toBe(now.getTime());
  });
});

describe('reviewCard', () => {
  it('moves a new card to learning on "again"', () => {
    const srs = createSrsState(now);
    const next = reviewCard(srs, 'again', now);
    expect(next.state).toBe('learning');
    expect(next.repetitions).toBe(0);
  });

  it('graduates a new card to review on "good"', () => {
    const srs = createSrsState(now);
    const next = reviewCard(srs, 'good', now);
    expect(next.state).toBe('review');
    expect(next.repetitions).toBe(1);
    expect(next.intervalDays).toBeGreaterThan(0);
  });

  it('schedules the due date at now + intervalDays', () => {
    const srs = createSrsState(now);
    const next = reviewCard(srs, 'good', now);
    const dueDate = new Date(next.dueAt);
    const expectedDate = new Date(now.getTime() + next.intervalDays * 86_400_000);
    expect(dueDate.getTime()).toBe(expectedDate.getTime());
  });

  it('grows the interval faster for "easy" than "good"', () => {
    let easySrs = createSrsState(now);
    let goodSrs = createSrsState(now);
    // graduate both to review state first
    easySrs = reviewCard(easySrs, 'good', now);
    goodSrs = reviewCard(goodSrs, 'good', now);

    const easyNext = reviewCard(easySrs, 'easy', now);
    const goodNext = reviewCard(goodSrs, 'good', now);
    expect(easyNext.intervalDays).toBeGreaterThan(goodNext.intervalDays);
  });

  it('increments ease on "easy" and decreases it on "again"', () => {
    const srs = createSrsState(now);
    const afterEasy = reviewCard(srs, 'easy', now);
    const afterAgain = reviewCard(srs, 'again', now);
    expect(afterEasy.ease).toBeGreaterThan(srs.ease);
    expect(afterAgain.ease).toBeLessThan(srs.ease);
  });

  it('never lets ease drop below the floor', () => {
    let srs = createSrsState(now);
    for (let i = 0; i < 20; i += 1) {
      srs = reviewCard(srs, 'again', now);
    }
    expect(srs.ease).toBeGreaterThanOrEqual(1.3);
  });

  it('records a lapse when a reviewed card is forgotten', () => {
    let srs = createSrsState(now);
    srs = reviewCard(srs, 'good', now); // -> review
    srs = reviewCard(srs, 'good', now); // still review, interval grows
    const lapsed = reviewCard(srs, 'again', now);
    expect(lapsed.lapses).toBe(1);
    expect(lapsed.state).toBe('relearning');
  });

  it('resets interval to a short value on relapse', () => {
    let srs = createSrsState(now);
    srs = reviewCard(srs, 'good', now);
    srs = reviewCard(srs, 'good', now);
    const lapsed = reviewCard(srs, 'again', now);
    expect(lapsed.intervalDays).toBe(0);
  });
});

describe('computeMastery', () => {
  it('is zero for a card never seen', () => {
    const srs = createSrsState(now);
    expect(computeMastery(srs, 0, 0)).toBe(0);
  });

  it('increases with accuracy and interval length', () => {
    const newSrs = createSrsState(now);
    const matureSrs = { ...newSrs, state: 'review' as const, intervalDays: 60 };
    const lowMastery = computeMastery(newSrs, 5, 2);
    const highMastery = computeMastery(matureSrs, 5, 5);
    expect(highMastery).toBeGreaterThan(lowMastery);
  });

  it('stays within 0-100', () => {
    const srs = { ...createSrsState(now), state: 'review' as const, intervalDays: 1000 };
    const mastery = computeMastery(srs, 10, 10);
    expect(mastery).toBeLessThanOrEqual(100);
    expect(mastery).toBeGreaterThanOrEqual(0);
  });
});
