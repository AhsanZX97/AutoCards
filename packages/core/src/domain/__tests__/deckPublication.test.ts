import { describe, expect, it } from 'vitest';
import {
  MIN_INDEXABLE_CARD_COUNT,
  MIN_INDEXABLE_NON_AUTHOR_STUDIERS,
  canSetDeckVisibility,
  isIndexable,
  type IndexabilityInput,
} from '../deckPublication';

describe('canSetDeckVisibility', () => {
  it('lets the owner change visibility', () => {
    expect(canSetDeckVisibility({ ownerId: 'user_1', archived: false }, 'user_1')).toBe(true);
  });

  it('refuses anyone but the owner', () => {
    expect(canSetDeckVisibility({ ownerId: 'user_1', archived: false }, 'user_2')).toBe(false);
  });

  it('refuses an archived deck, even for its owner', () => {
    // Archived decks are a step from deleted — publishing one would put a page
    // up for a deck its owner has already put away.
    expect(canSetDeckVisibility({ ownerId: 'user_1', archived: true }, 'user_1')).toBe(false);
  });
});

describe('isIndexable', () => {
  function input(overrides: Partial<IndexabilityInput> = {}): IndexabilityInput {
    return {
      visibility: 'public',
      title: 'World Capitals',
      cardCount: MIN_INDEXABLE_CARD_COUNT,
      distinctNonAuthorStudiers: MIN_INDEXABLE_NON_AUTHOR_STUDIERS,
      otherPublicDeckTitles: [],
      ...overrides,
    };
  }

  it('indexes a public deck that clears every gate', () => {
    expect(isIndexable(input())).toEqual({ indexable: true, reasons: [] });
  });

  it('never indexes a private deck, whatever else is true', () => {
    const verdict = isIndexable(input({ visibility: 'private' }));
    expect(verdict.indexable).toBe(false);
    expect(verdict.reasons).toContain('not-public');
  });

  it('rejects an empty deck', () => {
    const verdict = isIndexable(input({ cardCount: 0 }));
    expect(verdict.indexable).toBe(false);
    expect(verdict.reasons).toContain('too-few-cards');
  });

  it('rejects a deck one card short of the threshold', () => {
    const verdict = isIndexable(input({ cardCount: MIN_INDEXABLE_CARD_COUNT - 1 }));
    expect(verdict.indexable).toBe(false);
    expect(verdict.reasons).toContain('too-few-cards');
  });

  it('indexes a deck exactly at the card-count threshold', () => {
    expect(isIndexable(input({ cardCount: MIN_INDEXABLE_CARD_COUNT })).indexable).toBe(true);
  });

  it('rejects a deck only its author has ever studied', () => {
    const verdict = isIndexable(input({ distinctNonAuthorStudiers: 0 }));
    expect(verdict.indexable).toBe(false);
    expect(verdict.reasons).toContain('no-independent-study');
  });

  it('indexes a deck exactly at the studier threshold', () => {
    expect(
      isIndexable(input({ distinctNonAuthorStudiers: MIN_INDEXABLE_NON_AUTHOR_STUDIERS })).indexable,
    ).toBe(true);
  });

  it('rejects a near-duplicate of an already-public deck', () => {
    const verdict = isIndexable(
      input({ title: 'World Capitals!', otherPublicDeckTitles: ['World Capitals'] }),
    );
    expect(verdict.indexable).toBe(false);
    expect(verdict.reasons).toContain('duplicate-title');
  });

  it('is unbothered by an unrelated public deck sharing no wording', () => {
    expect(
      isIndexable(input({ otherPublicDeckTitles: ['Spanish Verb Conjugations'] })).indexable,
    ).toBe(true);
  });

  it('flags an exact title match against another public deck', () => {
    // Callers must exclude the deck's own previous title from
    // `otherPublicDeckTitles` — this function has no id to tell "me" from
    // "someone else" and treats every entry as another deck.
    expect(isIndexable(input({ otherPublicDeckTitles: ['World Capitals'] })).reasons).toContain(
      'duplicate-title',
    );
  });

  it('reports every failing gate at once, not just the first', () => {
    const verdict = isIndexable(
      input({ visibility: 'private', cardCount: 0, distinctNonAuthorStudiers: 0 }),
    );
    expect(verdict.reasons).toEqual(
      expect.arrayContaining(['not-public', 'too-few-cards', 'no-independent-study']),
    );
    expect(verdict.reasons).toHaveLength(3);
  });

  it('treats an empty title as never duplicating anything', () => {
    expect(isIndexable(input({ title: '', otherPublicDeckTitles: ['Untitled'] })).reasons).not.toContain(
      'duplicate-title',
    );
  });
});
