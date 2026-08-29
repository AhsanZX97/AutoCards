import { describe, expect, it } from 'vitest';
import {
  DECK_SOURCE_KINDS,
  DEFAULT_DECK_SOURCE_KIND,
  MAX_TOPIC_CHARS,
  MIN_PASTED_TEXT_CHARS,
  isUsablePastedText,
  isUsableTopic,
  normalizeTopic,
} from '../deckSources';

describe('deck sources', () => {
  it('offers a document, an image, a topic, a paste and a Quizlet import', () => {
    expect(DECK_SOURCE_KINDS).toEqual(['upload', 'image', 'topic', 'paste', 'quizlet']);
  });

  it('opens on uploading, which is how most decks are made', () => {
    expect(DEFAULT_DECK_SOURCE_KIND).toBe('upload');
  });
});

describe('normalizeTopic', () => {
  it('collapses the line breaks and runs of spaces a paste brings with it', () => {
    expect(normalizeTopic('  The   Krebs\n cycle  ')).toBe('The Krebs cycle');
  });

  it('leaves a tidy topic exactly as typed', () => {
    expect(normalizeTopic('React hooks')).toBe('React hooks');
  });
});

describe('isUsableTopic', () => {
  it('accepts a named subject', () => {
    expect(isUsableTopic('The Krebs cycle')).toBe(true);
  });

  it('rejects nothing, or whitespace pretending to be something', () => {
    expect(isUsableTopic('')).toBe(false);
    expect(isUsableTopic('   ')).toBe(false);
  });

  it('rejects a couple of characters, which is a typo rather than a subject', () => {
    expect(isUsableTopic('ab')).toBe(false);
  });

  it('rejects an essay pasted into the topic box', () => {
    // Past this it is instructions or material, and both have their own field.
    expect(isUsableTopic('x'.repeat(MAX_TOPIC_CHARS + 1))).toBe(false);
    expect(isUsableTopic('x'.repeat(MAX_TOPIC_CHARS))).toBe(true);
  });
});

describe('isUsablePastedText', () => {
  it('accepts a passage long enough to write cards from', () => {
    expect(isUsablePastedText('x'.repeat(MIN_PASTED_TEXT_CHARS))).toBe(true);
  });

  it('rejects a scrap, which the model would only pad out by inventing', () => {
    expect(isUsablePastedText('Mitochondria make ATP.')).toBe(false);
  });

  it('does not count the surrounding whitespace towards the length', () => {
    expect(isUsablePastedText(`  ${'x'.repeat(MIN_PASTED_TEXT_CHARS - 1)}  `)).toBe(false);
  });
});
