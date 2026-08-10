import { PLAN_LIMITS, type ExtractedDocument, type Plan } from '../types';

/**
 * The plan limits that are not about money.
 *
 * The monthly upload allowance is enforced on the server, because each one
 * spends real money on a model — see `domain/uploadQuota.ts` and the
 * `generate-deck` function. These two cost nothing to exceed, so they are
 * checked here: they exist to make the tiers mean something and to keep a
 * single upload from being absurd, not to protect a bill.
 */

/** Decks the plan allows in total. `Infinity` on the unlimited tiers. */
export function decksRemaining(plan: Plan, deckCount: number): number {
  const limit = PLAN_LIMITS[plan].maxDecks;
  if (limit === Number.POSITIVE_INFINITY) return limit;
  return Math.max(0, limit - deckCount);
}

/**
 * Whether another deck may be made.
 *
 * This is the whole of what a downgrade does. Someone who drops from Pro with
 * twelve decks keeps all twelve — they can still study them, edit them and
 * export them — but cannot make a thirteenth until they are back under three.
 * Freezing or deleting the excess would mean picking which of their decks to
 * take away, and there is no answer to that which is not someone's revision
 * gone.
 */
export function canCreateDeck(plan: Plan, deckCount: number): boolean {
  return decksRemaining(plan, deckCount) > 0;
}

/**
 * The uploads too long for the plan, in the order they were given.
 *
 * Only formats that have pages can be over: Word documents and plain text
 * reflow, so there is nothing to count and nothing to refuse.
 */
export function oversizedDocuments(plan: Plan, documents: ExtractedDocument[]): ExtractedDocument[] {
  const limit = PLAN_LIMITS[plan].maxPagesPerPdf;
  return documents.filter((document) => document.pageCount !== undefined && document.pageCount > limit);
}
