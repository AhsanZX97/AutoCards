import { describe, expect, it } from 'vitest';
import {
  cardsFromQuizletTerms,
  isQuizletShareUrl,
  isQuizletUrl,
  normalizeQuizletShareUrl,
  parseQuizletExport,
} from '../quizletImport';

describe('parseQuizletExport', () => {
  it('reads the default export: a tab between the two sides, one card per line', () => {
    const cards = parseQuizletExport('Mitochondria\tThe powerhouse of the cell\nRibosome\tMakes protein');

    expect(cards).toEqual([
      { type: 'basic', front: 'Mitochondria', back: 'The powerhouse of the cell' },
      { type: 'basic', front: 'Ribosome', back: 'Makes protein' },
    ]);
  });

  it('reads a set exported with a dash between the sides', () => {
    const cards = parseQuizletExport('Mitochondria - The powerhouse of the cell\nRibosome - Makes protein');

    expect(cards.map((card) => card.front)).toEqual(['Mitochondria', 'Ribosome']);
    expect(cards[0]?.back).toBe('The powerhouse of the cell');
  });

  it('reads a set exported with semicolons between the cards', () => {
    // Quizlet offers a custom row separator, and someone who picks one gets a
    // single line back rather than one line per card.
    const cards = parseQuizletExport('Mitochondria - Powerhouse; Ribosome - Makes protein');
    expect(cards).toHaveLength(2);
    expect(cards[1]?.front).toBe('Ribosome');
  });

  it('keeps commas inside a definition instead of splitting on the first one', () => {
    // The separator is chosen by how cleanly it cuts every row in two, so a
    // definition full of commas cannot promote the comma to a separator.
    const cards = parseQuizletExport(
      'Photosynthesis\tLight, water and carbon dioxide become glucose\nOsmosis\tWater moves, solute does not',
    );

    expect(cards).toHaveLength(2);
    expect(cards[0]?.back).toBe('Light, water and carbon dioxide become glucose');
  });

  it('skips blank lines rather than making empty cards from them', () => {
    const cards = parseQuizletExport('Mitochondria\tPowerhouse\n\n\nRibosome\tMakes protein\n');
    expect(cards).toHaveLength(2);
  });

  it('drops a row with nothing on one side, which is not a card', () => {
    const cards = parseQuizletExport('Mitochondria\tPowerhouse\nRibosome\t');
    expect(cards).toEqual([{ type: 'basic', front: 'Mitochondria', back: 'Powerhouse' }]);
  });

  it('trims the whitespace either side of both halves', () => {
    const cards = parseQuizletExport('  Mitochondria  \t  Powerhouse  ');
    expect(cards[0]).toEqual({ type: 'basic', front: 'Mitochondria', back: 'Powerhouse' });
  });

  it('keeps the rest of a definition that contains the separator again', () => {
    const cards = parseQuizletExport('Half-life\tTime for half - roughly - of a sample to decay');
    expect(cards[0]?.back).toBe('Time for half - roughly - of a sample to decay');
  });

  it('returns nothing for text that is not an exported set', () => {
    expect(parseQuizletExport('Just a paragraph of prose with no structure to it at all.')).toEqual([]);
    expect(parseQuizletExport('   ')).toEqual([]);
  });

  it('stops at the cap rather than importing a set of any size', () => {
    const rows = Array.from({ length: 900 }, (_unused, i) => `Term ${i}\tDefinition ${i}`).join('\n');
    const cards = parseQuizletExport(rows);
    expect(cards.length).toBeLessThanOrEqual(500);
    expect(cards[0]?.front).toBe('Term 0');
  });
});

describe('isQuizletUrl', () => {
  it('recognises a set link, so the screen can say what to do with it', () => {
    // Pasting the link is the obvious first attempt, and "no cards found" is a
    // dead end. The screen answers it with the export instructions instead.
    expect(isQuizletUrl('https://quizlet.com/gb/123456789/biology-unit-1-flash-cards/')).toBe(true);
    expect(isQuizletUrl('  quizlet.com/123456789/biology  ')).toBe(true);
  });

  it('does not mistake an exported set for a link', () => {
    expect(isQuizletUrl('Mitochondria\tPowerhouse')).toBe(false);
  });

  it('does not treat a mention of quizlet inside a definition as a link', () => {
    expect(isQuizletUrl('Spaced repetition\tWhat quizlet.com is built on')).toBe(false);
  });
});

describe('isQuizletShareUrl', () => {
  it('accepts the link Share gives you, which carries both params', () => {
    // Those two are what get a request past the bot wall on the set page —
    // the same address without them is refused, whoever asks.
    expect(isQuizletShareUrl('https://quizlet.com/gb/87887151/driving-flash-cards/?i=1995er&x=1jqt')).toBe(true);
  });

  it('rejects the plain set address, which cannot be read', () => {
    expect(isQuizletShareUrl('https://quizlet.com/gb/87887151/driving-flash-cards/')).toBe(false);
  });

  it('rejects a link missing either half of the pair', () => {
    expect(isQuizletShareUrl('https://quizlet.com/1/x/?i=1995er')).toBe(false);
    expect(isQuizletShareUrl('https://quizlet.com/1/x/?x=1jqt')).toBe(false);
  });

  it('is not fooled by a host that merely ends in something similar', () => {
    expect(isQuizletShareUrl('https://quizlet.com.example.com/1/x/?i=a&x=b')).toBe(false);
    expect(isQuizletShareUrl('https://notquizlet.com/1/x/?i=a&x=b')).toBe(false);
  });

  it('accepts a subdomain of the real site', () => {
    expect(isQuizletShareUrl('https://www.quizlet.com/1/x/?i=a&x=b')).toBe(true);
  });

  it('takes a link pasted without its scheme', () => {
    expect(isQuizletShareUrl('quizlet.com/1/x/?i=a&x=b')).toBe(true);
  });
});

describe('normalizeQuizletShareUrl', () => {
  it('returns the link ready to send', () => {
    expect(normalizeQuizletShareUrl('  quizlet.com/1/x/?i=a&x=b  ')).toBe('https://quizlet.com/1/x/?i=a&x=b');
  });

  it('returns nothing for a link that cannot be read', () => {
    expect(normalizeQuizletShareUrl('https://quizlet.com/1/x/')).toBeUndefined();
  });
});

describe('cardsFromQuizletTerms', () => {
  it('turns the pairs the server found into cards', () => {
    expect(cardsFromQuizletTerms([{ front: 'Mitochondria', back: 'Powerhouse' }])).toEqual([
      { type: 'basic', front: 'Mitochondria', back: 'Powerhouse' },
    ]);
  });

  it('drops a side that came back empty, which is half a card', () => {
    // A side Quizlet holds as an image alone has no text to import.
    expect(cardsFromQuizletTerms([{ front: 'Mitochondria', back: '  ' }])).toEqual([]);
  });

  it('ignores anything that is not a pair of strings', () => {
    expect(cardsFromQuizletTerms([null, 'nope', { front: 1, back: 2 }, {}])).toEqual([]);
  });

  it('survives a reply that is not a list at all', () => {
    expect(cardsFromQuizletTerms(undefined)).toEqual([]);
    expect(cardsFromQuizletTerms({ terms: [] })).toEqual([]);
  });

  it('stops at the same cap a pasted set does', () => {
    const terms = Array.from({ length: 900 }, (_unused, i) => ({ front: `T${i}`, back: `D${i}` }));
    expect(cardsFromQuizletTerms(terms)).toHaveLength(500);
  });
});
