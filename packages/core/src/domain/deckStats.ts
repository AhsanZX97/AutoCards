import { isDue } from '../lib/date';
import type { DeckStats, Flashcard } from '../types';

const MASTERED_THRESHOLD = 90;

export function computeDeckStats(cards: readonly Flashcard[], now: Date = new Date()): DeckStats {
  const stats: DeckStats = {
    total: cards.length,
    new: 0,
    learning: 0,
    review: 0,
    due: 0,
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
    if (card.srs.state === 'new') stats.new += 1;
    if (card.srs.state === 'learning' || card.srs.state === 'relearning') stats.learning += 1;
    if (card.srs.state === 'review') stats.review += 1;
    if (!card.suspended && isDue(card.srs.dueAt, now)) stats.due += 1;
    if (card.mastery >= MASTERED_THRESHOLD) stats.mastered += 1;

    if (!card.suspended) {
      masterySum += card.mastery;
      activeCount += 1;
    }
  }

  stats.averageMastery = activeCount > 0 ? Math.round(masterySum / activeCount) : 0;
  return stats;
}
