import { describe, expect, it } from 'vitest';
import {
  DECK_EXPORT_FORMAT,
  buildDeckExport,
  decodeBase64Url,
  decodeShareCode,
  deckExportFromShareUrl,
  encodeBase64Url,
  encodeShareCode,
  normalizeDeckExport,
  parseDeckExport,
  serializeDeckExport,
  shareUrlForDeck,
} from '../deckTransfer';
import { createDefaultStudySettings } from '../../domain';
import { makeCard } from '../../domain/__tests__/testHelpers';
import type { Deck } from '../../types';

function makeDeck(overrides: Partial<Deck> = {}): Deck {
  return {
    id: 'deck_1',
    ownerId: 'user_1',
    title: 'Biology 101',
    description: 'Cell division',
    icon: '🧬',
    accent: 'indigo',
    tags: ['biology'],
    categories: [{ id: 'cat_1', name: 'Mitosis', accent: 'emerald', icon: '🔬' }],
    defaultSettings: {
      mode: 'cram',
      shuffle: 'random',
      reversed: false,
      gradingScale: 'four-point',
      timer: { enabled: false, perCardSeconds: 20, totalSeconds: 0, autoAdvance: true, showAsBar: true },
      filters: {
        categoryIds: [],
        tags: [],
        difficulties: [],
        priorities: [],
        starredOnly: false,
        excludeMastered: false,
        masteredThreshold: 90,
        cardLimit: 0,
      },
      streakBonus: true,
      speedBonus: true,
      hintPenalty: true,
      readAloud: false,
      sound: true,
    },
    archived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildDeckExport / parseDeckExport', () => {
  it('round-trips a deck with its cards', () => {
    const deck = makeDeck();
    const cards = [
      makeCard({
        type: 'cloze',
        front: '',
        back: '',
        clozeText: 'Mitosis {{c1::duplicates}} the chromosomes.',
        categoryId: 'cat_1',
      }),
      makeCard({ type: 'multiple-choice', choices: [
        { id: 'ch1', text: 'A', correct: false },
        { id: 'ch2', text: 'B', correct: true },
      ] }),
      makeCard({ type: 'type-in', acceptedAnswers: ['chromosome', 'chromatid'], tags: ['dna'] }),
    ];

    const payload = buildDeckExport(deck, cards);
    expect(payload.format).toBe(DECK_EXPORT_FORMAT);

    const restored = parseDeckExport(serializeDeckExport(payload));
    expect(restored).not.toBeNull();
    expect(restored?.title).toBe('Biology 101');
    expect(restored?.generatedBy).toBeUndefined();
    expect(restored?.cards).toHaveLength(3);

    // Content survives, review state never enters the payload.
    const cloze = restored?.cards[0];
    expect(cloze?.type).toBe('cloze');
    expect(cloze?.clozeText).toBe('Mitosis {{c1::duplicates}} the chromosomes.');
    expect(cloze?.front).toBe(parsePrompt('Mitosis {{c1::duplicates}} the chromosomes.'));
    expect(cloze?.categoryId).toBe('cat_1');

    const mcq = restored?.cards[1];
    expect(mcq?.type).toBe('multiple-choice');
    expect(mcq?.choices?.map((c) => ({ text: c.text, correct: c.correct }))).toEqual([
      { text: 'A', correct: false },
      { text: 'B', correct: true },
    ]);
    // Choice ids are regenerated on import so imported decks can never collide
    // with ids the receiving account already holds.
    expect(mcq?.choices?.[0]?.id).not.toBe('ch1');

    const typeIn = restored?.cards[2];
    expect(typeIn?.type).toBe('type-in');
    expect(typeIn?.acceptedAnswers).toEqual(['Back 3', 'chromosome', 'chromatid']);
  });

  it('preserves generatedBy provenance', () => {
    const payload = buildDeckExport(makeDeck({ generatedBy: 'anthropic/claude-sonnet-4.5' }), []);
    expect(parseDeckExport(serializeDeckExport(payload))?.generatedBy).toBe('anthropic/claude-sonnet-4.5');
  });

  it('leaves mastery and SRS state out of the payload', () => {
    const card = makeCard({ mastery: 93, timesSeen: 40, timesCorrect: 38, weight: 2 });
    const payload = buildDeckExport(makeDeck(), [card]);
    const restored = parseDeckExport(serializeDeckExport(payload));
    expect(restored?.cards[0]).not.toHaveProperty('mastery');
    expect(restored?.cards[0]).not.toHaveProperty('srs');
    expect(restored?.cards[0]?.weight).toBe(2);
  });
});

describe('normalizeDeckExport', () => {
  it('rejects payloads that are not decks', () => {
    expect(normalizeDeckExport(null)).toBeNull();
    expect(normalizeDeckExport('deck')).toBeNull();
    expect(normalizeDeckExport({ format: 'anki' })).toBeNull();
    expect(normalizeDeckExport({ format: DECK_EXPORT_FORMAT })).toBeNull();
    expect(normalizeDeckExport({ cards: 'nope' })).toBeNull();
  });

  it('defaults missing fields and accepts decks without a format marker', () => {
    const restored = normalizeDeckExport({ cards: [] });
    expect(restored?.format).toBe(DECK_EXPORT_FORMAT);
    expect(restored?.title).toBe('Untitled deck');
    expect(restored?.icon).toBe('🗂️');
    expect(restored?.accent).toBe('indigo');
    expect(restored?.cards).toEqual([]);
  });

  it('moves a retired study mode forward without losing the rest of the settings', () => {
    const restored = normalizeDeckExport({
      cards: [],
      defaultSettings: {
        mode: 'classic',
        reversed: true,
        sound: false,
        filters: { categoryIds: [], tags: [], difficulties: [], priorities: [], starredOnly: true, excludeMastered: false, masteredThreshold: 90, cardLimit: 15 },
      },
    });
    expect(restored?.defaultSettings.mode).toBe(createDefaultStudySettings().mode);
    expect(restored?.defaultSettings.reversed).toBe(true);
    expect(restored?.defaultSettings.sound).toBe(false);
    expect(restored?.defaultSettings.filters.cardLimit).toBe(15);
    expect(restored?.defaultSettings.filters.starredOnly).toBe(true);
  });

  it('drops cards that cannot be salvaged', () => {
    const restored = normalizeDeckExport({
      title: 'Mixed',
      cards: [
        { front: 'Only a front', type: 'basic' },
        { front: 'Q', back: 'A', type: 'not-a-type' },
        { front: 'Q2', back: 'A2', type: 'basic' },
      ],
    });
    expect(restored?.cards).toHaveLength(2);
    expect(restored?.cards[0]?.type).toBe('basic');
  });

  it('demotes an ungradable multiple-choice to basic', () => {
    const restored = normalizeDeckExport({
      cards: [
        {
          front: 'Pick one',
          back: 'B',
          type: 'multiple-choice',
          choices: [
            { id: 'a', text: 'A', correct: false },
            { id: 'b', text: 'B', correct: false },
          ],
        },
      ],
    });
    expect(restored?.cards[0]?.type).toBe('basic');
  });

  it('normalizes choice objects and keeps exactly one correct', () => {
    const restored = normalizeDeckExport({
      cards: [
        {
          front: 'Pick one',
          type: 'mcq',
          choices: [
            { id: 'a', text: 'A', correct: true },
            { id: 'b', text: 'B', correct: true },
          ],
        },
      ],
    });
    expect(restored?.cards[0]?.type).toBe('multiple-choice');
    expect(restored?.cards[0]?.choices?.filter((c) => c.correct)).toHaveLength(1);
  });

  it('rebuilds true-false cards from a truth value', () => {
    const restored = normalizeDeckExport({
      cards: [{ front: 'DNA is a protein.', back: 'False', type: 'true-false' }],
    });
    expect(restored?.cards[0]?.type).toBe('true-false');
    expect(restored?.cards[0]?.choices?.find((c) => c.correct)?.text).toBe('False');
  });

  it('always accepts the back for type-in cards', () => {
    const restored = normalizeDeckExport({
      cards: [{ front: 'Cell wall polymer?', back: 'Cellulose', type: 'type-in' }],
    });
    expect(restored?.cards[0]?.acceptedAnswers).toContain('Cellulose');
  });

  it('clamps weight and coerces tags from a comma string', () => {
    const restored = normalizeDeckExport({
      cards: [{ front: 'Q', back: 'A', weight: 99, tags: 'dna, cell' }],
    });
    expect(restored?.cards[0]?.weight).toBe(4);
    expect(restored?.cards[0]?.tags).toEqual(['dna', 'cell']);
  });

  it('drops categoryId references to unknown categories', () => {
    const restored = normalizeDeckExport({
      categories: [{ id: 'cat_1', name: 'Known', accent: 'sky', icon: '📘' }],
      cards: [
        { front: 'Q', back: 'A', categoryId: 'cat_1' },
        { front: 'Q2', back: 'A2', categoryId: 'ghost' },
      ],
    });
    expect(restored?.cards[0]?.categoryId).toBe('cat_1');
    expect(restored?.cards[1]?.categoryId).toBeUndefined();
  });

  it('repairs malformed categories', () => {
    const restored = normalizeDeckExport({
      categories: [
        { name: 'No accent' },
        { id: 'c', name: 'Good', accent: 'bogus', icon: '' },
        { id: '', name: 'No id' },
        { name: 'Dup' },
        { name: 'Dup' },
      ],
      cards: [],
    });
    expect(restored?.categories).toHaveLength(5);
    for (const category of restored?.categories ?? []) {
      expect(category.id.length).toBeGreaterThan(0);
      expect(ACCENT_NAMES).toContain(category.accent);
      expect(category.name.length).toBeGreaterThan(0);
    }
  });
});

describe('share codes', () => {
  it('encodes and decodes unicode content losslessly', () => {
    const payload = buildDeckExport(makeDeck({ title: '日本語 🧬 éàü' }), [
      makeCard({ front: 'Mitose', back: '細胞分裂 🌱' }),
    ]);
    const code = encodeShareCode(payload);
    expect(code).not.toContain('+');
    expect(code).not.toContain('=');
    const restored = decodeShareCode(code);
    expect(restored?.title).toBe('日本語 🧬 éàü');
    expect(restored?.cards[0]?.back).toBe('細胞分裂 🌱');
  });

  it('round-trips through base64url primitives', () => {
    const bytes = new TextEncoder().encode('Auto Cards 🃏 → ünïcödé');
    const code = encodeBase64Url(bytes);
    expect(new TextDecoder().decode(decodeBase64Url(code))).toBe('Auto Cards 🃏 → ünïcödé');
  });

  it('builds and parses share URLs', () => {
    const payload = buildDeckExport(makeDeck(), [makeCard()]);
    const url = shareUrlForDeck(payload, 'https://autocards.app/app/decks');
    expect(url.startsWith('https://autocards.app/app/decks?deck=')).toBe(true);
    const restored = deckExportFromShareUrl(url);
    expect(restored?.title).toBe('Biology 101');
    expect(restored?.cards).toHaveLength(1);
  });

  it('returns null for non-share URLs and garbage codes', () => {
    expect(deckExportFromShareUrl('https://autocards.app/app/decks')).toBeNull();
    expect(deckExportFromShareUrl('https://autocards.app/app/decks?deck=%%%not-base64%%%')).toBeNull();
    expect(decodeShareCode('not-a-deck')).toBeNull();
  });

  it('rejects tampered or wrong-format codes', () => {
    const payload = buildDeckExport(makeDeck(), []);
    const code = encodeShareCode(payload);
    expect(decodeShareCode(`${code.slice(0, -1)}x`)).toBeNull();
  });
});

function parsePrompt(cloze: string): string {
  const matches = [...cloze.matchAll(/\{\{c\d+::(.*?)(?:::(.*?))?\}\}/g)];
  let prompt = cloze;
  for (const match of matches) {
    prompt = prompt.replace(match[0], '[ … ]');
  }
  return prompt;
}

const ACCENT_NAMES = ['indigo', 'violet', 'sky', 'emerald', 'amber', 'rose', 'teal', 'slate'];
