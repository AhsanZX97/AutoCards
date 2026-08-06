import { daysOverdue, isDue } from '../lib/date';
import { shuffle, weightedShuffle, type Rng } from '../lib/random';
import { DIFFICULTY_WEIGHT, PRIORITY_WEIGHT } from '../types';
import type { Flashcard, StudyFilters, ShuffleMode } from '../types';

/** Applies every filter in `StudyFilters` to a deck's cards. */
export function filterCards(
  cards: readonly Flashcard[],
  filters: StudyFilters,
  now: Date = new Date(),
): Flashcard[] {
  return cards.filter((card) => {
    if (card.suspended) return false;
    if (filters.starredOnly && !card.starred) return false;
    if (filters.dueOnly && !isDue(card.srs.dueAt, now)) return false;
    if (filters.excludeMastered && card.mastery >= filters.masteredThreshold) return false;
    if (filters.categoryIds.length > 0) {
      if (!card.categoryId || !filters.categoryIds.includes(card.categoryId)) return false;
    }
    if (filters.difficulties.length > 0 && !filters.difficulties.includes(card.difficulty)) {
      return false;
    }
    if (filters.priorities.length > 0 && !filters.priorities.includes(card.priority)) {
      return false;
    }
    if (filters.tags.length > 0 && !filters.tags.some((tag) => card.tags.includes(tag))) {
      return false;
    }
    return true;
  });
}

/** Combined draw weight for `priority-first` and `random` shuffles. */
function cardWeight(card: Flashcard): number {
  return PRIORITY_WEIGHT[card.priority] * card.weight;
}

/**
 * Orders a filtered card set for a study session. `random` is weighted by
 * priority/manual weight so important cards surface more often without being
 * forced to the very front every time; the other modes are strict sorts.
 */
export function orderCards(
  cards: readonly Flashcard[],
  mode: ShuffleMode,
  rng: Rng = Math.random,
  now: Date = new Date(),
): Flashcard[] {
  switch (mode) {
    case 'none':
      return cards.slice();
    case 'random':
      return weightedShuffle(cards, cardWeight, rng);
    case 'priority-first':
      return cards
        .slice()
        .sort((a, b) => PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority]);
    case 'hardest-first':
      return cards
        .slice()
        .sort((a, b) => DIFFICULTY_WEIGHT[b.difficulty] - DIFFICULTY_WEIGHT[a.difficulty]);
    case 'weakest-first':
      return cards.slice().sort((a, b) => a.mastery - b.mastery);
    case 'due-first':
      return cards
        .slice()
        .sort((a, b) => daysOverdue(b.srs.dueAt, now) - daysOverdue(a.srs.dueAt, now));
    default:
      return shuffle(cards, rng);
  }
}

/**
 * Builds the ordered id queue for a new session: filter, cap to `cardLimit`,
 * then order. Capping before ordering keeps `cardLimit` meaning "study N
 * cards" rather than "order N out of everything then maybe drop some".
 */
export function buildQueue(
  cards: readonly Flashcard[],
  filters: StudyFilters,
  shuffleMode: ShuffleMode,
  rng: Rng = Math.random,
  now: Date = new Date(),
): string[] {
  const filtered = filterCards(cards, filters, now);
  const capped =
    filters.cardLimit > 0 && filters.cardLimit < filtered.length
      ? orderCards(filtered, shuffleMode === 'none' ? 'random' : shuffleMode, rng, now).slice(
          0,
          filters.cardLimit,
        )
      : filtered;
  return orderCards(capped, shuffleMode, rng, now).map((card) => card.id);
}

export const DEFAULT_FILTERS: StudyFilters = {
  categoryIds: [],
  tags: [],
  difficulties: [],
  priorities: [],
  starredOnly: false,
  dueOnly: false,
  excludeMastered: false,
  masteredThreshold: 90,
  cardLimit: 0,
};
