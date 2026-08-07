import { nowIso } from '../lib/date';
import type { Flashcard, Id } from '../types';

/**
 * Sort key for a card. Cards created before manual ordering existed carry no
 * `position`, so they fall back to where they already sit in the array — which
 * is the order the deck has always displayed in.
 */
function positionOf(card: Flashcard, index: number): number {
  return typeof card.position === 'number' ? card.position : index;
}

/** Puts a deck's cards in display order. Ties keep their original array order. */
export function sortCardsByPosition(cards: readonly Flashcard[]): Flashcard[] {
  return cards
    .map((card, index) => ({ card, key: positionOf(card, index), index }))
    .sort((a, b) => a.key - b.key || a.index - b.index)
    .map((entry) => entry.card);
}

/** Position for a card being appended to the end of `cards`. */
export function nextPosition(cards: readonly Flashcard[]): number {
  if (cards.length === 0) return 0;
  return Math.max(...cards.map(positionOf)) + 1;
}

export interface ReorderResult {
  /** The whole deck in its new order, renumbered 0..n-1. */
  cards: Flashcard[];
  /** Ids of the cards whose position moved — the only rows sync needs to push. */
  changedIds: Id[];
}

/**
 * Moves one card to `toIndex` (0-based) and renumbers the deck so positions
 * stay contiguous. The first reorder of a deck that never had positions
 * backfills them all, which is why every card can come back as changed.
 */
export function reorderCards(
  cards: readonly Flashcard[],
  cardId: Id,
  toIndex: number,
  now: Date = new Date(),
): ReorderResult {
  const ordered = sortCardsByPosition(cards);
  const fromIndex = ordered.findIndex((card) => card.id === cardId);
  if (fromIndex === -1) return { cards: ordered, changedIds: [] };

  const target = Math.min(Math.max(toIndex, 0), ordered.length - 1);
  const [moved] = ordered.splice(fromIndex, 1);
  ordered.splice(target, 0, moved!);

  const timestamp = nowIso(now);
  const changedIds: Id[] = [];
  const renumbered = ordered.map((card, index) => {
    if (card.position === index) return card;
    changedIds.push(card.id);
    return { ...card, position: index, updatedAt: timestamp };
  });
  return { cards: renumbered, changedIds };
}
