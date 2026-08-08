import { hasCloze, normalizeAnswer, parseCloze, textSimilarity } from '../lib/text';
import type { CardType } from '../types';

/**
 * Keeps a second pass of generation from re-covering ground the deck already
 * holds.
 *
 * The model is told what is already there (see `avoidPrompts` in the OpenRouter
 * service), but being told is not the same as complying — it will still restate
 * a question it has seen, usually reworded rather than verbatim. So this runs
 * as the safety net on the way in, on the model's output rather than on its
 * promises.
 *
 * Matching is deliberately conservative: dropping a card the user wanted is
 * worse than letting a borderline pair through, because the kept card is
 * visible and deletable while the dropped one is simply never seen.
 */

/** Enough of any card shape to compare it against another. */
export interface ComparableCard {
  type?: CardType;
  front: string;
  back: string;
  clozeText?: string;
}

/** A card's two sides, normalized so only wording differences count. */
export interface CardKey {
  prompt: string;
  answer: string;
}

/**
 * Two prompts must be this alike before their answers are even consulted.
 * Set above the score of two questions that share a template but differ in
 * subject ("capital of France" vs "capital of Spain"), which is a real pair of
 * cards rather than a duplicate.
 */
const NEAR_PROMPT = 0.88;

/**
 * Looser than the prompt threshold: a duplicate question is usually answered in
 * slightly different words, and by this point the prompts already match closely.
 */
const NEAR_ANSWER = 0.7;

/**
 * The comparable text of a card. Cloze cards carry their content in
 * `clozeText` and leave front/back empty or derived, so they are read from the
 * blanked sentence — which also keeps two cards blanking different words in the
 * same sentence apart, since the visible text differs.
 */
export function promptAnswerKey(card: ComparableCard): CardKey {
  if (card.type === 'cloze' && card.clozeText && hasCloze(card.clozeText)) {
    const parsed = parseCloze(card.clozeText);
    return { prompt: normalizeAnswer(parsed.prompt), answer: normalizeAnswer(parsed.answer) };
  }
  return { prompt: normalizeAnswer(card.front), answer: normalizeAnswer(card.back) };
}

/** True when two cards ask the same thing, verbatim or reworded. */
export function isDuplicateOf(a: CardKey, b: CardKey): boolean {
  // A card with nothing on its question side has no ground to overlap with —
  // matching on emptiness would drop every such card after the first.
  if (!a.prompt || !b.prompt) return false;
  // The same question twice is a duplicate however it is answered — a deck that
  // asks one thing two ways is the exact failure a second generation pass over
  // overlapping source material produces.
  if (a.prompt === b.prompt) return true;
  return (
    textSimilarity(a.prompt, b.prompt) >= NEAR_PROMPT &&
    textSimilarity(a.answer, b.answer) >= NEAR_ANSWER
  );
}

export interface DedupeResult<T> {
  /** Candidates that survived, in their original order. */
  kept: T[];
  /** Candidates dropped as repeats of an existing card or of an earlier candidate. */
  duplicates: T[];
}

/**
 * Splits `candidates` into the cards worth adding and the ones that repeat
 * something. Candidates are checked against `existing` and against every
 * candidate already kept, so a batch that repeats itself only contributes once.
 */
export function dropDuplicateCards<T extends ComparableCard>(
  candidates: readonly T[],
  existing: readonly ComparableCard[],
): DedupeResult<T> {
  const seen = existing.map(promptAnswerKey).filter((key) => key.prompt);
  const kept: T[] = [];
  const duplicates: T[] = [];

  for (const candidate of candidates) {
    const key = promptAnswerKey(candidate);
    if (seen.some((other) => isDuplicateOf(key, other))) {
      duplicates.push(candidate);
      continue;
    }
    kept.push(candidate);
    if (key.prompt) seen.push(key);
  }

  return { kept, duplicates };
}
