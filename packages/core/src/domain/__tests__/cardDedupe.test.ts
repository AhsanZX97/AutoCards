import { describe, expect, it } from 'vitest';
import { dropDuplicateCards, isDuplicateOf, promptAnswerKey } from '../cardDedupe';
import { makeCard } from './testHelpers';
import type { GeneratedCard } from '../../types';

function generated(front: string, back: string, extra: Partial<GeneratedCard> = {}): GeneratedCard {
  return { front, back, ...extra };
}

describe('promptAnswerKey', () => {
  it('normalizes front and back', () => {
    expect(promptAnswerKey({ front: 'What is Osmosis?', back: 'The Diffusion of Water.' })).toEqual({
      prompt: 'what is osmosis',
      answer: 'diffusion of water',
    });
  });

  it('reads a cloze card from its blanked sentence, not its empty front', () => {
    const key = promptAnswerKey({
      type: 'cloze',
      front: '',
      back: '',
      clozeText: 'The {{c1::mitochondrion}} is the powerhouse of the cell.',
    });
    expect(key.prompt).not.toContain('mitochondrion');
    expect(key.answer).toContain('mitochondrion');
  });
});

describe('isDuplicateOf', () => {
  it('flags the same question asked with different punctuation and case', () => {
    const a = promptAnswerKey({ front: 'What is the testing effect?', back: 'Recall strengthens memory' });
    const b = promptAnswerKey({ front: 'what is the testing effect', back: 'Recall strengthens memory.' });
    expect(isDuplicateOf(a, b)).toBe(true);
  });

  it('flags a reworded near-match with the same answer', () => {
    const a = promptAnswerKey({ front: 'What is the testing effect?', back: 'Recall strengthens memory' });
    const b = promptAnswerKey({ front: 'What is the testing effects?', back: 'Recall strengthens memories' });
    expect(isDuplicateOf(a, b)).toBe(true);
  });

  it('keeps two questions that differ only in their subject', () => {
    const a = promptAnswerKey({ front: 'What is the capital of France?', back: 'Paris' });
    const b = promptAnswerKey({ front: 'What is the capital of Spain?', back: 'Madrid' });
    expect(isDuplicateOf(a, b)).toBe(false);
  });

  it('keeps two cloze cards blanking different words in one sentence', () => {
    const sentence = 'The mitochondrion is the powerhouse of the cell.';
    const a = promptAnswerKey({
      type: 'cloze',
      front: '',
      back: '',
      clozeText: sentence.replace('mitochondrion', '{{c1::mitochondrion}}'),
    });
    const b = promptAnswerKey({
      type: 'cloze',
      front: '',
      back: '',
      clozeText: sentence.replace('powerhouse', '{{c1::powerhouse}}'),
    });
    expect(isDuplicateOf(a, b)).toBe(false);
  });

  it('flags an identical question even when the answers disagree', () => {
    const a = promptAnswerKey({ type: 'true-false', front: 'Osmosis moves water.', back: 'True' });
    const b = promptAnswerKey({ type: 'true-false', front: 'Osmosis moves water.', back: 'False' });
    expect(isDuplicateOf(a, b)).toBe(true);
  });

  it('keeps two differently-worded true/false claims', () => {
    const a = promptAnswerKey({ type: 'true-false', front: 'Osmosis moves water across a membrane.', back: 'True' });
    const b = promptAnswerKey({ type: 'true-false', front: 'Diffusion needs an energy input.', back: 'False' });
    expect(isDuplicateOf(a, b)).toBe(false);
  });

  it('never matches a card with no prompt at all', () => {
    const blank = promptAnswerKey({ front: '', back: '' });
    expect(isDuplicateOf(blank, blank)).toBe(false);
  });
});

describe('dropDuplicateCards', () => {
  it('drops a candidate that repeats an existing card', () => {
    const existing = [makeCard({ front: 'What is osmosis?', back: 'Diffusion of water' })];
    const result = dropDuplicateCards([generated('What is osmosis?', 'Diffusion of water.')], existing);
    expect(result.kept).toHaveLength(0);
    expect(result.duplicates).toHaveLength(1);
  });

  it('keeps a candidate that covers new ground', () => {
    const existing = [makeCard({ front: 'What is osmosis?', back: 'Diffusion of water' })];
    const result = dropDuplicateCards([generated('What is diffusion?', 'Movement down a gradient')], existing);
    expect(result.kept).toHaveLength(1);
    expect(result.duplicates).toHaveLength(0);
  });

  it('drops candidates that duplicate each other within one batch', () => {
    const result = dropDuplicateCards(
      [generated('What is osmosis?', 'Diffusion of water'), generated('What is osmosis?', 'Diffusion of water')],
      [],
    );
    expect(result.kept).toHaveLength(1);
    expect(result.duplicates).toHaveLength(1);
  });

  it('returns candidates untouched when the deck is empty', () => {
    const cards = [generated('A', 'B'), generated('C', 'D')];
    expect(dropDuplicateCards(cards, []).kept).toEqual(cards);
  });

  it('handles an empty candidate list', () => {
    expect(dropDuplicateCards([], [makeCard()])).toEqual({ kept: [], duplicates: [] });
  });
});
