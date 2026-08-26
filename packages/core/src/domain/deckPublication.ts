import { normalizeAnswer, textSimilarity } from '../lib/text';
import type { Id } from '../types';

/**
 * Whether a deck's public page, if it has one, is visible to anyone with the
 * link (`public`) or only to its owner (`private`). Distinct from
 * indexability below: a deck can be public and still kept out of search.
 */
export type DeckVisibility = 'private' | 'public';

/**
 * Only an owner may publish or unpublish their own deck, and only while it is
 * still active — an archived deck is a step from deleted, and putting a page
 * up for one would contradict what its owner just did to it.
 */
export function canSetDeckVisibility(
  deck: { ownerId: Id; archived: boolean },
  actorId: Id,
): boolean {
  return deck.ownerId === actorId && !deck.archived;
}

/** Decks with fewer cards than this read as a stub, not a study resource. */
export const MIN_INDEXABLE_CARD_COUNT = 10;

/**
 * At least this many people other than the deck's own author must have
 * studied it. This is the guard against mass-published, never-touched,
 * model-generated pages — exactly what search engines' scaled-content-abuse
 * policies target. A page nobody but its creator has ever opened has no
 * evidence behind it that it is useful to anyone else.
 */
export const MIN_INDEXABLE_NON_AUTHOR_STUDIERS = 1;

/**
 * Two public deck titles this alike are the same deck in the reader's eyes,
 * republished — which is exactly the kind of near-duplicate content search
 * engines penalize a whole site for. Matches the conservatism of the
 * near-duplicate card check in `cardDedupe.ts`.
 */
const DUPLICATE_TITLE_SIMILARITY = 0.85;

export type IndexabilityReason =
  | 'not-public'
  | 'too-few-cards'
  | 'no-independent-study'
  | 'duplicate-title';

export interface IndexabilityInput {
  visibility: DeckVisibility;
  title: string;
  cardCount: number;
  /** Distinct people, other than the deck's author, known to have studied it. */
  distinctNonAuthorStudiers: number;
  /**
   * Titles of decks already public, excluding this deck itself. Callers must
   * do that exclusion — this function has no deck id to tell "me" from
   * "someone else" and treats every entry as another deck.
   */
  otherPublicDeckTitles: readonly string[];
}

export interface IndexabilityVerdict {
  indexable: boolean;
  /** Every gate this deck failed, so a UI can explain why rather than just refuse. */
  reasons: IndexabilityReason[];
}

/**
 * Whether a public deck earns a search-indexable page, gated on all three
 * anti-scaled-content signals at once rather than short-circuiting, so a
 * caller showing this to the deck's owner can explain everything wrong in one
 * pass instead of one gate at a time.
 */
export function isIndexable(input: IndexabilityInput): IndexabilityVerdict {
  const reasons: IndexabilityReason[] = [];

  if (input.visibility !== 'public') reasons.push('not-public');
  if (input.cardCount < MIN_INDEXABLE_CARD_COUNT) reasons.push('too-few-cards');
  if (input.distinctNonAuthorStudiers < MIN_INDEXABLE_NON_AUTHOR_STUDIERS) {
    reasons.push('no-independent-study');
  }

  const normalizedTitle = normalizeAnswer(input.title);
  if (
    normalizedTitle &&
    input.otherPublicDeckTitles.some(
      (other) => textSimilarity(normalizedTitle, normalizeAnswer(other)) >= DUPLICATE_TITLE_SIMILARITY,
    )
  ) {
    reasons.push('duplicate-title');
  }

  return { indexable: reasons.length === 0, reasons };
}
