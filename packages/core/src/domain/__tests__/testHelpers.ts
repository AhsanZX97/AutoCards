import type { Difficulty, Flashcard, Priority } from '../../types';

let counter = 0;

export function makeCard(overrides: Partial<Flashcard> = {}): Flashcard {
  counter += 1;
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id: `card_${counter}`,
    deckId: 'deck_1',
    type: 'basic',
    front: `Front ${counter}`,
    back: `Back ${counter}`,
    tags: [],
    difficulty: 'medium' as Difficulty,
    priority: 'normal' as Priority,
    starred: false,
    suspended: false,
    weight: 1,
    mastery: 0,
    timesSeen: 0,
    timesCorrect: 0,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides,
  };
}
