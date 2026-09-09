import { describe, expect, it } from 'vitest';
import { dashboardDeckPage } from '../dashboardDeckPage';

describe('dashboardDeckPage', () => {
  it('makes all 100 decks available in pages of four', () => {
    const decks = Array.from({ length: 100 }, (_, i) => i);
    const pages = Array.from({ length: 25 }, (_, i) => dashboardDeckPage(decks, i));
    expect(pages.flatMap((page) => page.items)).toEqual(decks);
    expect(pages.every((page) => page.items.length === 4)).toBe(true);
    expect(pages[0]).toMatchObject({ page: 0, pageCount: 25 });
    expect(pages[24]).toMatchObject({ page: 24, pageCount: 25 });
  });
  it('clamps the page when decks are removed and keeps the final partial page', () => {
    expect(dashboardDeckPage([1, 2, 3, 4, 5], 24)).toEqual({ items: [5], page: 1, pageCount: 2 });
    expect(dashboardDeckPage([1], -1)).toEqual({ items: [1], page: 0, pageCount: 1 });
  });
  it('handles an empty collection', () => {
    expect(dashboardDeckPage([], 4)).toEqual({ items: [], page: 0, pageCount: 1 });
  });
});
