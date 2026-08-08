import { hasCloze, parseCloze } from '../lib/text';
import { isRetiredCardType, type StoredCardType } from '../types';

/** The parts of a card this conversion reads and rewrites. */
export interface RetireableCard {
  type?: StoredCardType;
  front?: string;
  back?: string;
  clozeText?: string;
}

/**
 * Rewrites a card that still carries a retired type as the plain question and
 * answer it always effectively was.
 *
 * A cloze card keeps its content in `clozeText` and can leave front and back
 * empty, so those are filled from the sentence — the blanked version becomes
 * the question, the whole sentence becomes the answer. Anything already
 * written into front/back is left alone, because a hand-edited side beats a
 * derived one. Cards on a current type are returned untouched.
 */
export function demoteRetiredCard<T extends RetireableCard>(card: T): T {
  if (!card.type || !isRetiredCardType(card.type)) return card;

  const parsed = card.clozeText && hasCloze(card.clozeText) ? parseCloze(card.clozeText) : undefined;
  return {
    ...card,
    type: 'basic',
    front: card.front?.trim() ? card.front : parsed?.prompt ?? card.front ?? '',
    back: card.back?.trim() ? card.back : parsed?.answer ?? card.back ?? '',
    clozeText: undefined,
  };
}
