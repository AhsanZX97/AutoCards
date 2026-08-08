import { hasCloze, parseCloze, type Flashcard } from '@autocards/core';

/** The text shown on a card's question side.
 *
 *  Cloze cards carry their content in `clozeText` rather than front/back, so
 *  they are split on the fly and ignore `reversed` — a cloze read backwards
 *  would just be the sentence with the blank already filled in. */
export function getPromptText(card: Flashcard, reversed = false): string {
  if (card.type === 'cloze' && card.clozeText && hasCloze(card.clozeText)) {
    return parseCloze(card.clozeText).prompt;
  }
  return reversed ? card.back : card.front;
}

/** The text shown on a card's answer side. See {@link getPromptText}. */
export function getAnswerText(card: Flashcard, reversed = false): string {
  if (card.type === 'cloze' && card.clozeText && hasCloze(card.clozeText)) {
    return parseCloze(card.clozeText).answer;
  }
  return reversed ? card.front : card.back;
}
