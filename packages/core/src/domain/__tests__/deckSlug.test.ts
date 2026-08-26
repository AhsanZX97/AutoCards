import { describe, expect, it } from 'vitest';
import { publicDeckSlug } from '../deckSlug';

describe('publicDeckSlug', () => {
  it('lowercases and hyphenates a plain title', () => {
    expect(publicDeckSlug('World Capitals', 'deck_abc123', [])).toBe('world-capitals');
  });

  it('strips punctuation', () => {
    expect(publicDeckSlug("Newton's Laws of Motion!", 'deck_abc123', [])).toBe('newtons-laws-of-motion');
  });

  it('strips accents', () => {
    expect(publicDeckSlug('Café Vocabulary', 'deck_abc123', [])).toBe('cafe-vocabulary');
  });

  it('collapses repeated whitespace and punctuation into one hyphen', () => {
    expect(publicDeckSlug('Spanish  --  Verbs', 'deck_abc123', [])).toBe('spanish-verbs');
  });

  it('falls back to a placeholder for a title with nothing sluggable', () => {
    expect(publicDeckSlug('!!!', 'deck_abc123', [])).toBe('deck');
  });

  it('falls back to a placeholder for an empty title', () => {
    expect(publicDeckSlug('', 'deck_abc123', [])).toBe('deck');
  });

  it('truncates a very long title without leaving a trailing hyphen', () => {
    const long = Array.from({ length: 20 }, () => 'chapter').join(' ');
    const slug = publicDeckSlug(long, 'deck_abc123', []);
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('appends a stable, deck-specific suffix on collision', () => {
    const slug = publicDeckSlug('World Capitals', 'deck_abc123', ['world-capitals']);
    expect(slug).toBe('world-capitals-abc123');
  });

  it('is deterministic: the same deck always gets the same slug', () => {
    const first = publicDeckSlug('World Capitals', 'deck_abc123', ['world-capitals']);
    const second = publicDeckSlug('World Capitals', 'deck_abc123', ['world-capitals']);
    expect(first).toBe(second);
  });

  it('falls back further when even the suffixed slug collides', () => {
    const taken = ['world-capitals', 'world-capitals-abc123'];
    const slug = publicDeckSlug('World Capitals', 'deck_abc123', taken);
    expect(taken).not.toContain(slug);
    expect(slug.startsWith('world-capitals')).toBe(true);
  });

  it('does not collide with itself', () => {
    // Re-publishing the same deck under the same title must not treat its own
    // existing slug as taken.
    expect(publicDeckSlug('World Capitals', 'deck_abc123', ['world-capitals'], 'world-capitals')).toBe(
      'world-capitals',
    );
  });
});
