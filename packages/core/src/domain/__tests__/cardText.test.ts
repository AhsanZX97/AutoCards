import { describe, expect, it } from 'vitest';
import { getAnswerText, getPromptText } from '../cardText';
import type { Flashcard } from '../../types';

function card(patch: Partial<Flashcard> = {}): Flashcard {
  return {
    id: 'card_1',
    deckId: 'deck_1',
    type: 'basic',
    front: 'Capital of France?',
    back: 'Paris',
    difficulty: 'medium',
    priority: 'normal',
    tags: [],
    starred: false,
    suspended: false,
    weight: 1,
    mastery: 0,
    timesSeen: 0,
    timesCorrect: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...patch,
  };
}

describe('getPromptText', () => {
  it('asks the front of the card by default', () => {
    expect(getPromptText(card())).toBe('Capital of France?');
  });

  it('asks the back of the card when reversed', () => {
    expect(getPromptText(card(), true)).toBe('Paris');
  });

  it('shows a cloze sentence with the blank still blank', () => {
    const cloze = card({ type: 'cloze', clozeText: 'Water boils at {{c1::100C}}.' });
    expect(getPromptText(cloze)).toBe('Water boils at [ … ].');
  });

  it('ignores reversed on a cloze card, which has no other side to ask', () => {
    const cloze = card({ type: 'cloze', clozeText: 'Water boils at {{c1::100C}}.' });
    expect(getPromptText(cloze, true)).toBe(getPromptText(cloze, false));
  });

  it('falls back to the front when a cloze card has no blanks in it', () => {
    const broken = card({ type: 'cloze', clozeText: 'No blanks here.', front: 'Front' });
    expect(getPromptText(broken)).toBe('Front');
  });

  it('falls back to the front when a cloze card has no clozeText at all', () => {
    expect(getPromptText(card({ type: 'cloze', clozeText: undefined }))).toBe('Capital of France?');
  });
});

describe('getAnswerText', () => {
  it('answers with the back of the card by default', () => {
    expect(getAnswerText(card())).toBe('Paris');
  });

  it('answers with the front of the card when reversed', () => {
    expect(getAnswerText(card(), true)).toBe('Capital of France?');
  });

  it('answers a cloze card with the sentence, blank filled in', () => {
    const cloze = card({ type: 'cloze', clozeText: 'Water boils at {{c1::100C}}.' });
    expect(getAnswerText(cloze)).toBe('Water boils at 100C.');
  });

  it('ignores reversed on a cloze card', () => {
    const cloze = card({ type: 'cloze', clozeText: 'Water boils at {{c1::100C}}.' });
    expect(getAnswerText(cloze, true)).toBe(getAnswerText(cloze, false));
  });
});
