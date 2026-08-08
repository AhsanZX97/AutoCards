import { describe, expect, it } from 'vitest';
import { demoteRetiredCard } from '../retiredCards';
import type { CardDraft } from '../../types';

function draft(patch: Partial<CardDraft> = {}): CardDraft {
  return {
    type: 'basic',
    front: '',
    back: '',
    difficulty: 'medium',
    priority: 'normal',
    tags: [],
    starred: false,
    suspended: false,
    weight: 1,
    ...patch,
  };
}

describe('demoteRetiredCard', () => {
  it('leaves a card on a current type untouched', () => {
    const card = draft({ type: 'type-in', front: 'Q', back: 'A' });
    expect(demoteRetiredCard(card)).toBe(card);
  });

  it('reads a cloze sentence out into a question and an answer', () => {
    const result = demoteRetiredCard(
      draft({ type: 'cloze', clozeText: 'Water boils at {{c1::100C}}.' }),
    );
    expect(result.type).toBe('basic');
    expect(result.front).toBe('Water boils at [ … ].');
    expect(result.back).toBe('Water boils at 100C.');
    expect(result.clozeText).toBeUndefined();
  });

  it('keeps sides that were already written rather than overwriting them', () => {
    const result = demoteRetiredCard(
      draft({
        type: 'cloze',
        front: 'Hand-written question',
        back: 'Hand-written answer',
        clozeText: 'Water boils at {{c1::100C}}.',
      }),
    );
    expect(result).toMatchObject({ front: 'Hand-written question', back: 'Hand-written answer' });
  });

  it('turns a reversed card into a basic one without touching its sides', () => {
    const result = demoteRetiredCard(draft({ type: 'reversed', front: 'Term', back: 'Definition' }));
    expect(result).toMatchObject({ type: 'basic', front: 'Term', back: 'Definition' });
  });

  it('leaves a cloze card with no markers with the sides it has', () => {
    const result = demoteRetiredCard(
      draft({ type: 'cloze', front: 'Q', back: 'A', clozeText: 'No blanks here.' }),
    );
    expect(result).toMatchObject({ type: 'basic', front: 'Q', back: 'A' });
  });

  it('keeps every other field as it was', () => {
    const result = demoteRetiredCard(
      draft({ type: 'cloze', clozeText: 'A {{c1::b}}.', difficulty: 'hard', starred: true }),
    );
    expect(result).toMatchObject({ difficulty: 'hard', starred: true });
  });
});
