import { describe, expect, it } from 'vitest';
import { computeScore, emptyScore } from '../scoring';
import { makeCard } from './testHelpers';
import type { CardAnswer } from '../../types';

function answer(overrides: Partial<CardAnswer> = {}): CardAnswer {
  return {
    cardId: 'card_1',
    grade: 'good',
    correct: true,
    timeMs: 2000,
    usedHint: false,
    timedOut: false,
    answeredAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const settings = { streakBonus: true, speedBonus: true, hintPenalty: true };

describe('emptyScore', () => {
  it('has zeroed fields and an F letter grade', () => {
    const score = emptyScore();
    expect(score.answered).toBe(0);
    expect(score.finalScore).toBe(0);
    expect(score.letter).toBe('F');
  });
});

describe('computeScore', () => {
  it('returns emptyScore for no answers', () => {
    expect(computeScore([], new Map(), settings)).toEqual(emptyScore());
  });

  it('awards base points per correct answer', () => {
    const card = makeCard({ id: 'card_1', difficulty: 'easy' });
    const cardsById = new Map([[card.id, card]]);
    const score = computeScore([answer()], cardsById, {
      streakBonus: false,
      speedBonus: false,
      hintPenalty: false,
    });
    expect(score.basePoints).toBe(100);
    expect(score.correct).toBe(1);
    expect(score.accuracy).toBe(1);
  });

  it('applies a difficulty bonus for harder cards', () => {
    const easyCard = makeCard({ id: 'easy', difficulty: 'easy' });
    const expertCard = makeCard({ id: 'expert', difficulty: 'expert' });
    const cardsById = new Map([
      [easyCard.id, easyCard],
      [expertCard.id, expertCard],
    ]);
    const flatSettings = { streakBonus: false, speedBonus: false, hintPenalty: false };

    const easyScore = computeScore([answer({ cardId: 'easy' })], cardsById, flatSettings);
    const expertScore = computeScore([answer({ cardId: 'expert' })], cardsById, flatSettings);

    expect(expertScore.finalScore).toBeGreaterThan(easyScore.finalScore);
    expect(expertScore.difficultyBonus).toBeGreaterThan(easyScore.difficultyBonus);
  });

  it('awards a bigger speed bonus for faster answers', () => {
    const card = makeCard({ id: 'card_1' });
    const cardsById = new Map([[card.id, card]]);
    const fast = computeScore([answer({ timeMs: 500 })], cardsById, settings);
    const slow = computeScore([answer({ timeMs: 14000 })], cardsById, settings);
    expect(fast.speedBonus).toBeGreaterThan(slow.speedBonus);
  });

  it('accumulates a streak bonus across consecutive correct answers', () => {
    const card = makeCard({ id: 'card_1' });
    const cardsById = new Map([[card.id, card]]);
    const answers = [answer(), answer(), answer()];
    const score = computeScore(answers, cardsById, settings);
    expect(score.maxStreak).toBe(3);
    expect(score.streakBonus).toBeGreaterThan(0);
  });

  it('resets the streak on a wrong answer', () => {
    const card = makeCard({ id: 'card_1' });
    const cardsById = new Map([[card.id, card]]);
    const answers = [answer(), answer({ correct: false, grade: 'again' }), answer()];
    const score = computeScore(answers, cardsById, settings);
    expect(score.maxStreak).toBe(1);
  });

  it('applies a hint penalty', () => {
    const card = makeCard({ id: 'card_1' });
    const cardsById = new Map([[card.id, card]]);
    const withHint = computeScore([answer({ usedHint: true })], cardsById, settings);
    const withoutHint = computeScore([answer({ usedHint: false })], cardsById, settings);
    expect(withHint.finalScore).toBeLessThan(withoutHint.finalScore);
    expect(withHint.hintPenalty).toBeGreaterThan(0);
  });

  it('applies a timeout penalty and treats it as incorrect for streaks', () => {
    const card = makeCard({ id: 'card_1' });
    const cardsById = new Map([[card.id, card]]);
    const score = computeScore(
      [answer({ correct: false, timedOut: true, grade: 'again' })],
      cardsById,
      settings,
    );
    expect(score.timeoutPenalty).toBeGreaterThan(0);
    expect(score.correct).toBe(0);
  });

  it('never returns a negative final score', () => {
    const card = makeCard({ id: 'card_1' });
    const cardsById = new Map([[card.id, card]]);
    const score = computeScore(
      [answer({ correct: false, timedOut: true, usedHint: true, grade: 'again' })],
      cardsById,
      settings,
    );
    expect(score.finalScore).toBeGreaterThanOrEqual(0);
  });

  it('assigns letter grades based on accuracy', () => {
    const card = makeCard({ id: 'card_1' });
    const cardsById = new Map([[card.id, card]]);
    const perfect = computeScore(Array.from({ length: 10 }, () => answer()), cardsById, settings);
    expect(perfect.letter).toBe('S');

    const poor = computeScore(
      Array.from({ length: 10 }, (_unused, i) => answer({ correct: i < 3, grade: i < 3 ? 'good' : 'again' })),
      cardsById,
      settings,
    );
    expect(poor.letter).toBe('F');
  });
});
