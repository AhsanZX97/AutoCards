import { describe, expect, it } from 'vitest';
import { computeMastery } from '../mastery';

describe('computeMastery', () => {
  it('is zero for a card never seen', () => {
    expect(computeMastery(0, 0)).toBe(0);
  });

  it('is the rounded percentage of correct answers', () => {
    expect(computeMastery(4, 3)).toBe(75);
  });

  it('is 100 when every answer was correct', () => {
    expect(computeMastery(10, 10)).toBe(100);
  });

  it('is 0 when every answer was wrong', () => {
    expect(computeMastery(5, 0)).toBe(0);
  });
});
