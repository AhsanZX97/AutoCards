import { describe, expect, it } from 'vitest';
import { canCreateDeck, decksRemaining, oversizedDocuments } from '../planLimits';
import type { ExtractedDocument } from '../../types';

function document(filename: string, pageCount?: number): ExtractedDocument {
  return {
    filename,
    size: 1_000,
    pages: ['text'],
    text: 'text',
    ...(pageCount === undefined ? {} : { pageCount }),
  };
}

describe('decksRemaining', () => {
  it('counts down from the plan’s allowance', () => {
    expect(decksRemaining('free', 0)).toBe(3);
    expect(decksRemaining('free', 2)).toBe(1);
  });

  it('never goes negative, however far over someone is', () => {
    // A downgrade lands people here: twelve decks, an allowance of three.
    expect(decksRemaining('free', 12)).toBe(0);
  });

  it('is unlimited on the plans that say so', () => {
    expect(decksRemaining('pro', 500)).toBe(Number.POSITIVE_INFINITY);
    expect(decksRemaining('lifetime', 500)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('canCreateDeck', () => {
  it('allows a new deck while the plan has room', () => {
    expect(canCreateDeck('free', 2)).toBe(true);
  });

  it('stops at the allowance', () => {
    expect(canCreateDeck('free', 3)).toBe(false);
  });

  /**
   * The rule a downgrade has to obey: nothing already made is taken away, but
   * nothing new is added until they are back under the limit. Deleting decks
   * is what earns the next one.
   */
  it('stops someone who is over the limit without touching what they have', () => {
    expect(canCreateDeck('free', 12)).toBe(false);
    expect(canCreateDeck('free', 3)).toBe(false);
    expect(canCreateDeck('free', 2)).toBe(true);
  });

  it('never stops an unlimited plan', () => {
    expect(canCreateDeck('pro', 10_000)).toBe(true);
  });
});

describe('oversizedDocuments', () => {
  it('finds the ones past the plan’s page limit', () => {
    const documents = [document('short.pdf', 10), document('textbook.pdf', 400)];
    expect(oversizedDocuments('free', documents).map((d) => d.filename)).toEqual(['textbook.pdf']);
  });

  it('lets the same file through on a bigger plan', () => {
    const chapter = document('chapter.pdf', 40);
    expect(oversizedDocuments('free', [chapter]).map((d) => d.filename)).toEqual(['chapter.pdf']);
    expect(oversizedDocuments('pro', [chapter])).toEqual([]);
  });

  it('refuses a whole textbook on every plan short of lifetime', () => {
    const textbook = [document('textbook.pdf', 400)];
    expect(oversizedDocuments('pro', textbook).map((d) => d.filename)).toEqual(['textbook.pdf']);
    expect(oversizedDocuments('lifetime', textbook)).toEqual([]);
  });

  it('says nothing about a document with no page count', () => {
    // Word documents and plain text reflow, so they have no pages to count.
    expect(oversizedDocuments('free', [document('notes.docx')])).toEqual([]);
  });

  it('allows a document exactly at the limit', () => {
    expect(oversizedDocuments('free', [document('twenty.pdf', 20)])).toEqual([]);
  });
});
