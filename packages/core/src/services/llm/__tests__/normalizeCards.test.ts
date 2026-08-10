import { describe, expect, it } from 'vitest';
import { MAX_AUTO_CATEGORIES, allowedCardTypes, normalizeGeneratedCards } from '../normalizeCards';
import { CARD_TYPES, type CardType, type GenerationOptions } from '../../../types';

const BASE_OPTIONS: GenerationOptions = {
  model: 'deepseek/deepseek-v3.2',
  cardCount: 10,
  cardTypes: ['basic', 'multiple-choice', 'true-false', 'type-in'],
  difficulty: 'medium',
  autoCategories: false,
  includeHints: true,
  includeExplanations: true,
  includeSourceQuotes: true,
  language: 'en',
};

function options(patch: Partial<GenerationOptions> = {}): GenerationOptions {
  return { ...BASE_OPTIONS, ...patch };
}

describe('normalizeGeneratedCards', () => {
  it('returns no cards when the payload is not an object', () => {
    expect(normalizeGeneratedCards(null, options()).cards).toEqual([]);
    expect(normalizeGeneratedCards('nope', options()).cards).toEqual([]);
  });

  it('returns no cards when the cards field is missing or not an array', () => {
    expect(normalizeGeneratedCards({}, options()).cards).toEqual([]);
    expect(normalizeGeneratedCards({ cards: 'one' }, options()).cards).toEqual([]);
  });

  it('accepts a bare array of cards', () => {
    const { cards } = normalizeGeneratedCards(
      [{ type: 'basic', front: 'Q', back: 'A' }],
      options(),
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]?.front).toBe('Q');
  });

  it('trims whitespace off front and back', () => {
    const { cards } = normalizeGeneratedCards(
      { cards: [{ type: 'basic', front: '  Q  ', back: '\nA\n' }] },
      options(),
    );
    expect(cards[0]).toMatchObject({ front: 'Q', back: 'A' });
  });

  it('drops cards missing a front or a back', () => {
    const { cards } = normalizeGeneratedCards(
      {
        cards: [
          { type: 'basic', front: 'Q', back: 'A' },
          { type: 'basic', front: '', back: 'A' },
          { type: 'basic', front: 'Q' },
          { type: 'basic', back: 'A' },
        ],
      },
      options(),
    );
    expect(cards).toHaveLength(1);
  });

  it('reports how many cards it discarded', () => {
    const { cards, discarded } = normalizeGeneratedCards(
      { cards: [{ front: 'Q', back: 'A' }, { front: '' }, 'garbage'] },
      options(),
    );
    expect(cards).toHaveLength(1);
    expect(discarded).toBe(2);
  });

  it('falls back to basic when the model invents a card type', () => {
    const { cards } = normalizeGeneratedCards(
      { cards: [{ type: 'short-answer', front: 'Q', back: 'A' }] },
      options(),
    );
    expect(cards[0]?.type).toBe('basic');
  });

  it('caps the result at the requested card count', () => {
    const raw = Array.from({ length: 12 }, (_, i) => ({ front: `Q${i}`, back: `A${i}` }));
    const { cards } = normalizeGeneratedCards({ cards: raw }, options({ cardCount: 5 }));
    expect(cards).toHaveLength(5);
  });

  it('demotes a card whose type was not requested to an allowed type', () => {
    const { cards } = normalizeGeneratedCards(
      { cards: [{ type: 'true-false', front: 'Q', back: 'True' }] },
      options({ cardTypes: ['basic'] }),
    );
    expect(cards[0]?.type).toBe('basic');
    expect(cards[0]?.choices).toBeUndefined();
  });

  it('drops a card that cannot be demoted into any requested type', () => {
    const { cards } = normalizeGeneratedCards(
      { cards: [{ type: 'basic', front: 'Q', back: '' }] },
      options({ cardTypes: ['type-in'] }),
    );
    expect(cards).toEqual([]);
  });

  describe('difficulty and priority', () => {
    it('keeps a valid difficulty and priority', () => {
      const { cards } = normalizeGeneratedCards(
        { cards: [{ front: 'Q', back: 'A', difficulty: 'hard', priority: 'critical' }] },
        options(),
      );
      expect(cards[0]).toMatchObject({ difficulty: 'hard', priority: 'critical' });
    });

    it('falls back to the requested difficulty when the model returns an unknown one', () => {
      const { cards } = normalizeGeneratedCards(
        { cards: [{ front: 'Q', back: 'A', difficulty: 'very hard' }] },
        options({ difficulty: 'expert' }),
      );
      expect(cards[0]?.difficulty).toBe('expert');
    });

    it('falls back to normal priority when the model returns an unknown one', () => {
      const { cards } = normalizeGeneratedCards(
        { cards: [{ front: 'Q', back: 'A', priority: 'urgent' }] },
        options(),
      );
      expect(cards[0]?.priority).toBe('normal');
    });
  });

  describe('tags', () => {
    it('keeps an array of string tags', () => {
      const { cards } = normalizeGeneratedCards(
        { cards: [{ front: 'Q', back: 'A', tags: ['one', 'two'] }] },
        options(),
      );
      expect(cards[0]?.tags).toEqual(['one', 'two']);
    });

    it('splits a comma-separated tag string', () => {
      const { cards } = normalizeGeneratedCards(
        { cards: [{ front: 'Q', back: 'A', tags: 'one, two' }] },
        options(),
      );
      expect(cards[0]?.tags).toEqual(['one', 'two']);
    });

    it('drops non-string entries from a tag array', () => {
      const { cards } = normalizeGeneratedCards(
        { cards: [{ front: 'Q', back: 'A', tags: ['one', 3, null] }] },
        options(),
      );
      expect(cards[0]?.tags).toEqual(['one']);
    });
  });

  describe('multiple-choice cards', () => {
    it('keeps well-formed choices and assigns ids when missing', () => {
      const { cards } = normalizeGeneratedCards(
        {
          cards: [
            {
              type: 'multiple-choice',
              front: 'Q',
              back: 'B',
              choices: [
                { text: 'A', correct: false },
                { text: 'B', correct: true },
              ],
            },
          ],
        },
        options(),
      );
      expect(cards[0]?.type).toBe('multiple-choice');
      expect(cards[0]?.choices).toHaveLength(2);
      expect(cards[0]?.choices?.every((c) => typeof c.id === 'string' && c.id.length > 0)).toBe(true);
      expect(cards[0]?.choices?.filter((c) => c.correct)).toHaveLength(1);
    });

    it('gives every choice a distinct id', () => {
      const { cards } = normalizeGeneratedCards(
        {
          cards: [
            {
              type: 'multiple-choice',
              front: 'Q',
              back: 'A',
              choices: [
                { text: 'A', correct: true },
                { text: 'B', correct: false },
                { text: 'C', correct: false },
              ],
            },
          ],
        },
        options(),
      );
      const ids = cards[0]?.choices?.map((c) => c.id) ?? [];
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('marks the choice matching back as correct when no flag is given', () => {
      const { cards } = normalizeGeneratedCards(
        {
          cards: [
            {
              type: 'multiple-choice',
              front: 'Q',
              back: 'Paris',
              choices: ['London', 'Paris', 'Rome'],
            },
          ],
        },
        options(),
      );
      const correct = cards[0]?.choices?.filter((c) => c.correct) ?? [];
      expect(correct).toHaveLength(1);
      expect(correct[0]?.text).toBe('Paris');
    });

    it('reads a correctIndex when the model uses one', () => {
      const { cards } = normalizeGeneratedCards(
        {
          cards: [
            {
              type: 'multiple-choice',
              front: 'Q',
              back: 'Paris',
              choices: ['London', 'Paris', 'Rome'],
              correctIndex: 1,
            },
          ],
        },
        options(),
      );
      expect(cards[0]?.choices?.[1]?.correct).toBe(true);
    });

    it('demotes to basic when fewer than two choices came back', () => {
      const { cards } = normalizeGeneratedCards(
        { cards: [{ type: 'multiple-choice', front: 'Q', back: 'A', choices: ['A'] }] },
        options(),
      );
      expect(cards[0]?.type).toBe('basic');
      expect(cards[0]?.choices).toBeUndefined();
    });

    it('demotes to basic when no choice can be marked correct', () => {
      const { cards } = normalizeGeneratedCards(
        {
          cards: [
            { type: 'multiple-choice', front: 'Q', back: 'Berlin', choices: ['London', 'Paris'] },
          ],
        },
        options(),
      );
      expect(cards[0]?.type).toBe('basic');
    });

    it('keeps only the first correct choice when the model marks several', () => {
      const { cards } = normalizeGeneratedCards(
        {
          cards: [
            {
              type: 'multiple-choice',
              front: 'Q',
              back: 'A',
              choices: [
                { text: 'A', correct: true },
                { text: 'B', correct: true },
              ],
            },
          ],
        },
        options(),
      );
      expect(cards[0]?.choices?.filter((c) => c.correct)).toHaveLength(1);
    });
  });

  describe('true-false cards', () => {
    it('synthesizes True/False choices from the back when none are given', () => {
      const { cards } = normalizeGeneratedCards(
        { cards: [{ type: 'true-false', front: 'The sky is green.', back: 'False' }] },
        options(),
      );
      expect(cards[0]?.type).toBe('true-false');
      expect(cards[0]?.choices).toEqual([
        { id: 'true', text: 'True', correct: false },
        { id: 'false', text: 'False', correct: true },
      ]);
    });

    it('reads a boolean back', () => {
      const { cards } = normalizeGeneratedCards(
        { cards: [{ type: 'true-false', front: 'Q', back: true }] },
        options(),
      );
      expect(cards[0]?.choices?.find((c) => c.id === 'true')?.correct).toBe(true);
      expect(cards[0]?.back).toBe('True');
    });

    it('demotes to basic when the back is not a truth value', () => {
      const { cards } = normalizeGeneratedCards(
        { cards: [{ type: 'true-false', front: 'Q', back: 'Sometimes' }] },
        options(),
      );
      expect(cards[0]?.type).toBe('basic');
    });
  });

  describe('type-in cards', () => {
    it('keeps accepted answers and always includes the back', () => {
      const { cards } = normalizeGeneratedCards(
        {
          cards: [
            {
              type: 'type-in',
              front: 'Q',
              back: 'The testing effect',
              acceptedAnswers: ['testing effect'],
            },
          ],
        },
        options(),
      );
      expect(cards[0]?.acceptedAnswers).toContain('The testing effect');
      expect(cards[0]?.acceptedAnswers).toContain('testing effect');
    });

    it('defaults accepted answers to the back when none are given', () => {
      const { cards } = normalizeGeneratedCards(
        { cards: [{ type: 'type-in', front: 'Q', back: 'A' }] },
        options(),
      );
      expect(cards[0]?.acceptedAnswers).toEqual(['A']);
    });

    it('drops duplicate accepted answers', () => {
      const { cards } = normalizeGeneratedCards(
        { cards: [{ type: 'type-in', front: 'Q', back: 'A', acceptedAnswers: ['A', 'A'] }] },
        options(),
      );
      expect(cards[0]?.acceptedAnswers).toEqual(['A']);
    });
  });

  describe('cloze cards, which the app no longer writes', () => {
    it('reads a blanked sentence out into a basic question and answer', () => {
      const { cards } = normalizeGeneratedCards(
        {
          cards: [
            {
              type: 'cloze',
              front: '',
              back: '',
              clozeText: 'The capital of France is {{c1::Paris}}.',
            },
          ],
        },
        options(),
      );
      expect(cards[0]?.type).toBe('basic');
      expect(cards[0]?.clozeText).toBeUndefined();
      expect(cards[0]?.front).toContain('The capital of France is');
      expect(cards[0]?.back).toBe('The capital of France is Paris.');
    });

    it('leaves a front and back the model did write alone', () => {
      const { cards } = normalizeGeneratedCards(
        {
          cards: [
            { type: 'cloze', front: 'Q', back: 'A', clozeText: 'Water boils at {{c1::100C}}.' },
          ],
        },
        options(),
      );
      expect(cards[0]).toMatchObject({ type: 'basic', front: 'Q', back: 'A' });
    });

    it('drops a cloze card with neither markers nor a usable front and back', () => {
      const { cards } = normalizeGeneratedCards(
        { cards: [{ type: 'cloze', front: '', back: '', clozeText: 'No blanks.' }] },
        options(),
      );
      expect(cards).toEqual([]);
    });
  });

  describe('option flags', () => {
    it('strips hints when hints were not requested', () => {
      const { cards } = normalizeGeneratedCards(
        { cards: [{ front: 'Q', back: 'A', hint: 'a hint' }] },
        options({ includeHints: false }),
      );
      expect(cards[0]?.hint).toBeUndefined();
    });

    it('strips explanations when explanations were not requested', () => {
      const { cards } = normalizeGeneratedCards(
        { cards: [{ front: 'Q', back: 'A', explanation: 'because' }] },
        options({ includeExplanations: false }),
      );
      expect(cards[0]?.explanation).toBeUndefined();
    });

    it('strips source quotes when they were not requested', () => {
      const { cards } = normalizeGeneratedCards(
        { cards: [{ front: 'Q', back: 'A', source: { page: 2, quote: 'a quote' } }] },
        options({ includeSourceQuotes: false }),
      );
      expect(cards[0]?.source).toBeUndefined();
    });

    it('keeps a source quote when it was requested', () => {
      const { cards } = normalizeGeneratedCards(
        { cards: [{ front: 'Q', back: 'A', source: { page: 2, quote: 'a quote' } }] },
        options(),
      );
      expect(cards[0]?.source).toEqual({ page: 2, quote: 'a quote' });
    });

    it('tags every card with the requested language', () => {
      const { cards } = normalizeGeneratedCards(
        { cards: [{ front: 'Q', back: 'A' }] },
        options({ language: 'fr' }),
      );
      expect(cards[0]?.lang).toBe('fr');
    });
  });

  describe('categories', () => {
    it('returns no categories when auto-categorize is off', () => {
      const { categories, cards } = normalizeGeneratedCards(
        { cards: [{ front: 'Q', back: 'A', category: 'Memory' }] },
        options({ autoCategories: false }),
      );
      expect(categories).toEqual([]);
      expect(cards[0]?.categoryId).toBeUndefined();
    });

    it('builds a category per distinct name and links cards to it', () => {
      const { categories, cards } = normalizeGeneratedCards(
        {
          cards: [
            { front: 'Q1', back: 'A1', category: 'Memory' },
            { front: 'Q2', back: 'A2', category: 'Memory' },
            { front: 'Q3', back: 'A3', category: 'Techniques' },
          ],
        },
        options({ autoCategories: true }),
      );
      expect(categories.map((c) => c.name)).toEqual(['Memory', 'Techniques']);
      expect(cards[0]?.categoryId).toBe(categories[0]?.id);
      expect(cards[1]?.categoryId).toBe(categories[0]?.id);
      expect(cards[2]?.categoryId).toBe(categories[1]?.id);
    });

    it('treats category names case-insensitively', () => {
      const { categories } = normalizeGeneratedCards(
        {
          cards: [
            { front: 'Q1', back: 'A1', category: 'Memory' },
            { front: 'Q2', back: 'A2', category: 'memory' },
          ],
        },
        options({ autoCategories: true }),
      );
      expect(categories).toHaveLength(1);
    });

    it('leaves a card uncategorized when it names no category', () => {
      const { cards } = normalizeGeneratedCards(
        { cards: [{ front: 'Q', back: 'A' }] },
        options({ autoCategories: true }),
      );
      expect(cards[0]?.categoryId).toBeUndefined();
    });

    it('only emits categories that survive the card cap', () => {
      const { categories } = normalizeGeneratedCards(
        {
          cards: [
            { front: 'Q1', back: 'A1', category: 'Kept' },
            { front: 'Q2', back: 'A2', category: 'Dropped' },
          ],
        },
        options({ autoCategories: true, cardCount: 1 }),
      );
      expect(categories.map((c) => c.name)).toEqual(['Kept']);
    });

    it('folds a card onto the declared category it names, ignoring case and spacing', () => {
      const { categories, cards } = normalizeGeneratedCards(
        {
          categories: ['Memory', 'Techniques'],
          cards: [
            { front: 'Q1', back: 'A1', category: '  memory ' },
            { front: 'Q2', back: 'A2', category: 'Techniques' },
          ],
        },
        options({ autoCategories: true }),
      );
      expect(categories.map((c) => c.name)).toEqual(['Memory', 'Techniques']);
      expect(cards[0]?.categoryId).toBe(categories[0]?.id);
      expect(cards[1]?.categoryId).toBe(categories[1]?.id);
    });

    it('caps how many categories a deck may end up with', () => {
      // The failure this exists for: one category per card, which is clutter
      // rather than grouping.
      const { categories } = normalizeGeneratedCards(
        {
          cards: Array.from({ length: 25 }, (_unused, index) => ({
            front: `Q${index}`,
            back: `A${index}`,
            category: `Topic ${index}`,
          })),
        },
        options({ autoCategories: true, cardCount: 25 }),
      );
      expect(categories.length).toBeLessThanOrEqual(MAX_AUTO_CATEGORIES);
    });

    it('keeps the categories carrying the most cards when it has to cut', () => {
      const { categories, cards } = normalizeGeneratedCards(
        {
          cards: [
            { front: 'Q1', back: 'A1', category: 'Big' },
            { front: 'Q2', back: 'A2', category: 'Big' },
            { front: 'Q3', back: 'A3', category: 'Big' },
            { front: 'Q4', back: 'A4', category: 'Tiny' },
          ],
        },
        // A cap of one, reached via a deck too small to justify more.
        options({ autoCategories: true, cardCount: 4 }),
      );
      expect(categories.map((c) => c.name)).toContain('Big');
      // A card whose category did not survive is uncategorized, not misfiled.
      const tiny = cards.find((card) => card.front === 'Q4');
      const big = cards.find((card) => card.front === 'Q1');
      expect(big?.categoryId).toBe(categories.find((c) => c.name === 'Big')?.id);
      if (!categories.some((c) => c.name === 'Tiny')) {
        expect(tiny?.categoryId).toBeUndefined();
      }
    });
  });

  describe('retired card types', () => {
    it('drops a type the app no longer knows', () => {
      expect(allowedCardTypes(['basic', 'reversed' as CardType])).toEqual(['basic']);
    });

    it('falls back to every current type when nothing requested survives', () => {
      expect(allowedCardTypes(['reversed' as CardType])).toEqual([...CARD_TYPES]);
    });

    it('writes a card claiming a retired type as a basic one', () => {
      const { cards } = normalizeGeneratedCards(
        { cards: [{ type: 'reversed', front: 'Term', back: 'Definition' }] },
        options(),
      );
      expect(cards[0]?.type).toBe('basic');
    });

    it('keeps a retired type out of a run that only asked for it', () => {
      const { cards } = normalizeGeneratedCards(
        { cards: [{ type: 'reversed', front: 'Term', back: 'Definition' }] },
        options({ cardTypes: ['reversed' as CardType] }),
      );
      expect(cards[0]?.type).toBe('basic');
    });
  });
});
