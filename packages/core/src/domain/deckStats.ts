import type { DeckStats, Flashcard } from '../types';

/** Exported so the UI can explain these counts without restating the numbers. */
export const MASTERED_THRESHOLD = 90;
export const LEARNING_THRESHOLD = 40;

export function computeDeckStats(cards: readonly Flashcard[]): DeckStats {
  const stats: DeckStats = {
    total: cards.length,
    new: 0,
    learning: 0,
    review: 0,
    mastered: 0,
    suspended: 0,
    starred: 0,
    averageMastery: 0,
  };

  let masterySum = 0;
  let activeCount = 0;

  for (const card of cards) {
    if (card.suspended) stats.suspended += 1;
    if (card.starred) stats.starred += 1;
    if (card.timesSeen === 0) stats.new += 1;
    else if (card.mastery < LEARNING_THRESHOLD) stats.learning += 1;
    else stats.review += 1;
    if (card.mastery >= MASTERED_THRESHOLD) stats.mastered += 1;

    if (!card.suspended) {
      masterySum += card.mastery;
      activeCount += 1;
    }
  }

  stats.averageMastery = activeCount > 0 ? Math.round(masterySum / activeCount) : 0;
  return stats;
}
