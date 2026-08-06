import { addDays, nowIso } from '../lib/date';
import type { Grade, SrsState } from '../types';

const MIN_EASE = 1.3;
const DEFAULT_EASE = 2.5;

export function createSrsState(now: Date = new Date()): SrsState {
  return {
    state: 'new',
    intervalDays: 0,
    ease: DEFAULT_EASE,
    repetitions: 0,
    lapses: 0,
    dueAt: now.toISOString(),
  };
}

/** SM-2-derived ease delta per grade. */
const EASE_DELTA: Record<Grade, number> = {
  again: -0.3,
  hard: -0.15,
  good: 0,
  easy: 0.15,
};

/**
 * Advances a card's SRS state after one review.
 *
 * Loosely SM-2: `again` sends the card back to `learning` with a short
 * interval and a lapse recorded; anything else graduates it forward with the
 * interval scaled by ease. Deliberately doesn't implement SM-2's sub-day
 * learning steps — a full day for the first "good" review to keep the mental
 * model of "days until due" simple everywhere else in the app.
 */
export function reviewCard(srs: SrsState, grade: Grade, now: Date = new Date()): SrsState {
  const ease = clampEase(srs.ease + EASE_DELTA[grade]);

  if (grade === 'again') {
    return {
      state: srs.state === 'new' ? 'learning' : 'relearning',
      intervalDays: 0,
      ease,
      repetitions: 0,
      lapses: srs.lapses + (srs.state === 'review' ? 1 : 0),
      dueAt: addMinutes(now, 10).toISOString(),
      lastReviewedAt: now.toISOString(),
    };
  }

  const repetitions = srs.repetitions + 1;
  let intervalDays: number;
  if (srs.state === 'new' || srs.state === 'learning' || srs.state === 'relearning') {
    intervalDays = grade === 'hard' ? 1 : grade === 'easy' ? 3 : 1;
  } else {
    const base = Math.max(srs.intervalDays, 1);
    const multiplier = grade === 'hard' ? 1.2 : grade === 'easy' ? ease * 1.3 : ease;
    intervalDays = Math.round(base * multiplier * 10) / 10;
  }

  return {
    state: 'review',
    intervalDays,
    ease,
    repetitions,
    lapses: srs.lapses,
    dueAt: addDays(now, intervalDays).toISOString(),
    lastReviewedAt: now.toISOString(),
  };
}

function clampEase(ease: number): number {
  return Math.max(MIN_EASE, Math.round(ease * 100) / 100);
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

/**
 * 0-100 mastery derived from the SRS state and accuracy history. Combines how
 * far the card has graduated with how reliably it's been answered, so a card
 * with a long interval but a rocky history doesn't read as fully mastered.
 */
export function computeMastery(
  srs: SrsState,
  timesSeen: number,
  timesCorrect: number,
): number {
  if (timesSeen === 0) return 0;
  const accuracy = timesCorrect / timesSeen;
  const intervalScore = Math.min(1, srs.intervalDays / 60);
  const stateFloor = srs.state === 'review' ? 0.35 : srs.state === 'relearning' ? 0.1 : 0;
  const raw = stateFloor + (1 - stateFloor) * (0.5 * accuracy + 0.5 * intervalScore);
  return Math.round(Math.min(1, raw) * 100);
}

export { nowIso };
