import { describe, expect, it } from 'vitest';
import { checkTypeIn, hasCloze, normalizeAnswer, parseCloze, slugify, textSimilarity } from '../text';

describe('textSimilarity', () => {
  it('scores identical strings 1', () => {
    expect(textSimilarity('testing effect', 'testing effect')).toBe(1);
  });

  it('scores two empty strings 1', () => {
    expect(textSimilarity('', '')).toBe(1);
  });

  it('scores an empty string against a non-empty one 0', () => {
    expect(textSimilarity('', 'testing effect')).toBe(0);
  });

  it('scores unrelated strings low', () => {
    expect(textSimilarity('what is osmosis', 'name the three branches of government')).toBeLessThan(0.4);
  });

  it('scores a reworded phrasing of the same question high', () => {
    expect(textSimilarity('what is the testing effect', 'what is the testing affect')).toBeGreaterThan(0.9);
  });

  it('keeps two questions about different subjects apart', () => {
    expect(textSimilarity('what is the capital of france', 'what is the capital of spain')).toBeLessThan(0.88);
  });
});

describe('normalizeAnswer', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizeAnswer('The Testing-Effect!')).toBe('testing effect');
  });

  it('strips leading articles', () => {
    expect(normalizeAnswer('a mitochondrion')).toBe('mitochondrion');
    expect(normalizeAnswer('The Answer')).toBe('answer');
  });

  it('collapses whitespace', () => {
    expect(normalizeAnswer('  spaced   out  ')).toBe('spaced out');
  });
});

describe('checkTypeIn', () => {
  it('accepts an exact match', () => {
    const verdict = checkTypeIn('Testing Effect', ['testing effect']);
    expect(verdict.correct).toBe(true);
    expect(verdict.nearMiss).toBe(false);
  });

  it('accepts a near-miss typo on a long answer', () => {
    const verdict = checkTypeIn('testng effect', ['testing effect']);
    expect(verdict.correct).toBe(true);
    expect(verdict.nearMiss).toBe(true);
  });

  it('rejects a short wrong answer even with 1 char off', () => {
    const verdict = checkTypeIn('cat', ['dog']);
    expect(verdict.correct).toBe(false);
  });

  it('rejects an empty response', () => {
    expect(checkTypeIn('', ['answer']).correct).toBe(false);
  });

  it('matches against any of several accepted answers', () => {
    const verdict = checkTypeIn('7', ['seven', '7', '7 plus or minus 2']);
    expect(verdict.correct).toBe(true);
  });
});

describe('parseCloze', () => {
  it('extracts a single blank', () => {
    const result = parseCloze('The {{c1::mitochondria}} is the powerhouse.');
    expect(result.blanks).toEqual(['mitochondria']);
    expect(result.answer).toBe('The mitochondria is the powerhouse.');
    expect(result.prompt).toContain('[ … ]');
  });

  it('extracts multiple blanks in order', () => {
    const result = parseCloze('{{c1::A}} then {{c2::B}}');
    expect(result.blanks).toEqual(['A', 'B']);
  });

  it('captures an optional hint', () => {
    const result = parseCloze('{{c1::mitochondria::organelle}}');
    expect(result.hints).toEqual(['organelle']);
  });
});

describe('hasCloze', () => {
  it('detects cloze markers', () => {
    expect(hasCloze('{{c1::x}}')).toBe(true);
    expect(hasCloze('no markers here')).toBe(false);
  });
});

describe('slugify', () => {
  it('produces url-safe slugs', () => {
    expect(slugify('Hello, World!')).toBe('hello-world');
  });
});
