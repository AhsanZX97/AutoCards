import { describe, expect, it } from 'vitest';
import { seededRng } from '../../lib/random';
import { buildQueue, DEFAULT_FILTERS, filterCards, orderCards } from '../studyQueue';
import { makeCard } from './testHelpers';

describe('filterCards', () => {
  it('excludes suspended cards unconditionally', () => {
    const cards = [makeCard({ suspended: true }), makeCard()];
    const result = filterCards(cards, DEFAULT_FILTERS);
    expect(result).toHaveLength(1);
    expect(result[0]?.suspended).toBe(false);
  });

  it('filters to starred only when requested', () => {
    const cards = [makeCard({ starred: true }), makeCard({ starred: false })];
    const result = filterCards(cards, { ...DEFAULT_FILTERS, starredOnly: true });
    expect(result).toHaveLength(1);
    expect(result[0]?.starred).toBe(true);
  });

  it('excludes mastered cards above the threshold', () => {
    const mastered = makeCard({ mastery: 95 });
    const learning = makeCard({ mastery: 40 });
    const result = filterCards(
      [mastered, learning],
      { ...DEFAULT_FILTERS, excludeMastered: true, masteredThreshold: 90 },
    );
    expect(result.map((c) => c.id)).toEqual([learning.id]);
  });

  it('filters by category, difficulty, priority and tags', () => {
    const target = makeCard({
      categoryId: 'catA',
      difficulty: 'hard',
      priority: 'critical',
      tags: ['exam'],
    });
    const other = makeCard({
      categoryId: 'catB',
      difficulty: 'easy',
      priority: 'low',
      tags: ['misc'],
    });
    const result = filterCards([target, other], {
      ...DEFAULT_FILTERS,
      categoryIds: ['catA'],
      difficulties: ['hard'],
      priorities: ['critical'],
      tags: ['exam'],
    });
    expect(result.map((c) => c.id)).toEqual([target.id]);
  });
});

describe('orderCards', () => {
  it('none returns cards unmodified in order', () => {
    const cards = [makeCard(), makeCard(), makeCard()];
    const result = orderCards(cards, 'none');
    expect(result.map((c) => c.id)).toEqual(cards.map((c) => c.id));
  });

  it('hardest-first sorts by descending difficulty weight', () => {
    const easy = makeCard({ difficulty: 'easy' });
    const expert = makeCard({ difficulty: 'expert' });
    const medium = makeCard({ difficulty: 'medium' });
    const result = orderCards([easy, expert, medium], 'hardest-first');
    expect(result.map((c) => c.id)).toEqual([expert.id, medium.id, easy.id]);
  });

  it('weakest-first sorts by ascending mastery', () => {
    const strong = makeCard({ mastery: 90 });
    const weak = makeCard({ mastery: 10 });
    const result = orderCards([strong, weak], 'weakest-first');
    expect(result.map((c) => c.id)).toEqual([weak.id, strong.id]);
  });

  it('priority-first sorts critical before low', () => {
    const low = makeCard({ priority: 'low' });
    const critical = makeCard({ priority: 'critical' });
    const result = orderCards([low, critical], 'priority-first');
    expect(result.map((c) => c.id)).toEqual([critical.id, low.id]);
  });

  it('random preserves the full set and is deterministic per seed', () => {
    const cards = [makeCard(), makeCard(), makeCard(), makeCard()];
    const a = orderCards(cards, 'random', seededRng(5));
    const b = orderCards(cards, 'random', seededRng(5));
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
    expect(new Set(a.map((c) => c.id))).toEqual(new Set(cards.map((c) => c.id)));
  });
});

describe('buildQueue', () => {
  it('respects the card limit', () => {
    const cards = Array.from({ length: 10 }, () => makeCard());
    const queue = buildQueue(cards, { ...DEFAULT_FILTERS, cardLimit: 4 }, 'random', seededRng(1));
    expect(queue).toHaveLength(4);
  });

  it('returns no duplicate ids', () => {
    const cards = Array.from({ length: 10 }, () => makeCard());
    const queue = buildQueue(cards, DEFAULT_FILTERS, 'random', seededRng(1));
    expect(new Set(queue).size).toBe(queue.length);
  });

  it('excludes suspended cards from the queue entirely', () => {
    const suspended = makeCard({ suspended: true });
    const active = makeCard();
    const queue = buildQueue([suspended, active], DEFAULT_FILTERS, 'none');
    expect(queue).toEqual([active.id]);
  });
});
