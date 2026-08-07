import { describe, expect, it } from 'vitest';
import { nextPosition, reorderCards, sortCardsByPosition } from '../cardOrder';
import { makeCard } from './testHelpers';

const NOW = new Date('2026-06-01T12:00:00.000Z');

function fronts(cards: readonly { front: string }[]): string[] {
  return cards.map((card) => card.front);
}

describe('sortCardsByPosition', () => {
  it('orders cards by their position', () => {
    const cards = [
      makeCard({ front: 'c', position: 2 }),
      makeCard({ front: 'a', position: 0 }),
      makeCard({ front: 'b', position: 1 }),
    ];
    expect(fronts(sortCardsByPosition(cards))).toEqual(['a', 'b', 'c']);
  });

  it('keeps array order for cards that carry no position', () => {
    const cards = [makeCard({ front: 'a' }), makeCard({ front: 'b' }), makeCard({ front: 'c' })];
    expect(fronts(sortCardsByPosition(cards))).toEqual(['a', 'b', 'c']);
  });

  it('slots a positioned card among unpositioned ones by comparing it to their index', () => {
    const cards = [
      makeCard({ front: 'a' }),
      makeCard({ front: 'b' }),
      makeCard({ front: 'c' }),
      makeCard({ front: 'pinned', position: 1.5 }),
    ];
    expect(fronts(sortCardsByPosition(cards))).toEqual(['a', 'b', 'pinned', 'c']);
  });

  it('breaks ties on the original array order', () => {
    const cards = [
      makeCard({ front: 'first', position: 1 }),
      makeCard({ front: 'second', position: 1 }),
    ];
    expect(fronts(sortCardsByPosition(cards))).toEqual(['first', 'second']);
  });

  it('returns a new array and leaves the input untouched', () => {
    const cards = [makeCard({ front: 'b', position: 1 }), makeCard({ front: 'a', position: 0 })];
    const sorted = sortCardsByPosition(cards);
    expect(sorted).not.toBe(cards);
    expect(fronts(cards)).toEqual(['b', 'a']);
  });

  it('returns an empty array for an empty deck', () => {
    expect(sortCardsByPosition([])).toEqual([]);
  });
});

describe('nextPosition', () => {
  it('is 0 for an empty deck', () => {
    expect(nextPosition([])).toBe(0);
  });

  it('is one past the highest position in the deck', () => {
    expect(nextPosition([makeCard({ position: 0 }), makeCard({ position: 4 })])).toBe(5);
  });

  it('counts unpositioned cards by their index so a new card lands last', () => {
    expect(nextPosition([makeCard(), makeCard(), makeCard()])).toBe(3);
  });
});

describe('reorderCards', () => {
  function deck() {
    return [
      makeCard({ id: 'a', front: 'a', position: 0 }),
      makeCard({ id: 'b', front: 'b', position: 1 }),
      makeCard({ id: 'c', front: 'c', position: 2 }),
      makeCard({ id: 'd', front: 'd', position: 3 }),
    ];
  }

  it('moves a card down to the target index', () => {
    const { cards } = reorderCards(deck(), 'a', 2, NOW);
    expect(fronts(cards)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('moves a card up to the target index', () => {
    const { cards } = reorderCards(deck(), 'd', 0, NOW);
    expect(fronts(cards)).toEqual(['d', 'a', 'b', 'c']);
  });

  it('renumbers every card to a contiguous 0..n-1 run', () => {
    const { cards } = reorderCards(deck(), 'd', 1, NOW);
    expect(cards.map((card) => card.position)).toEqual([0, 1, 2, 3]);
  });

  it('reports only the cards whose position actually changed', () => {
    const { changedIds } = reorderCards(deck(), 'c', 3, NOW);
    expect(changedIds).toEqual(['d', 'c']);
  });

  it('stamps updatedAt on the cards it moved', () => {
    const { cards } = reorderCards(deck(), 'd', 0, NOW);
    expect(cards[0]?.updatedAt).toBe(NOW.toISOString());
  });

  it('leaves updatedAt alone on cards that did not move', () => {
    const original = deck();
    const { cards } = reorderCards(original, 'c', 3, NOW);
    expect(cards[0]?.updatedAt).toBe(original[0]?.updatedAt);
  });

  it('clamps a target index past the end to the last slot', () => {
    const { cards } = reorderCards(deck(), 'a', 99, NOW);
    expect(fronts(cards)).toEqual(['b', 'c', 'd', 'a']);
  });

  it('clamps a negative target index to the first slot', () => {
    const { cards } = reorderCards(deck(), 'c', -3, NOW);
    expect(fronts(cards)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('reports no change when the card is already at the target index', () => {
    const { changedIds } = reorderCards(deck(), 'b', 1, NOW);
    expect(changedIds).toEqual([]);
  });

  it('backfills positions on a deck that has never been ordered', () => {
    const legacy = [
      makeCard({ id: 'a', front: 'a' }),
      makeCard({ id: 'b', front: 'b' }),
      makeCard({ id: 'c', front: 'c' }),
    ];
    const { cards, changedIds } = reorderCards(legacy, 'c', 0, NOW);
    expect(fronts(cards)).toEqual(['c', 'a', 'b']);
    expect(cards.map((card) => card.position)).toEqual([0, 1, 2]);
    expect(changedIds).toEqual(['c', 'a', 'b']);
  });

  it('ignores an unknown card id', () => {
    const original = deck();
    const { cards, changedIds } = reorderCards(original, 'missing', 0, NOW);
    expect(fronts(cards)).toEqual(['a', 'b', 'c', 'd']);
    expect(changedIds).toEqual([]);
  });

  it('handles a single-card deck', () => {
    const { changedIds } = reorderCards([makeCard({ id: 'a', position: 0 })], 'a', 0, NOW);
    expect(changedIds).toEqual([]);
  });
});
