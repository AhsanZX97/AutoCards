import { createId } from '../lib/id';
import { nowIso } from '../lib/date';
import { createSrsState } from './srs';
import type { CardDraft, Flashcard, GeneratedCard, Id } from '../types';

const DRAFT_DEFAULTS: CardDraft = {
  type: 'basic',
  front: '',
  back: '',
  difficulty: 'medium',
  priority: 'normal',
  tags: [],
  starred: false,
  suspended: false,
  weight: 1,
};

export function createEmptyDraft(): CardDraft {
  return { ...DRAFT_DEFAULTS, tags: [] };
}

export function draftFromCard(card: Flashcard): CardDraft {
  return {
    type: card.type,
    front: card.front,
    back: card.back,
    clozeText: card.clozeText,
    choices: card.choices,
    acceptedAnswers: card.acceptedAnswers,
    hint: card.hint,
    explanation: card.explanation,
    mnemonic: card.mnemonic,
    example: card.example,
    notes: card.notes,
    difficulty: card.difficulty,
    priority: card.priority,
    categoryId: card.categoryId,
    tags: card.tags,
    accent: card.accent,
    starred: card.starred,
    suspended: card.suspended,
    weight: card.weight,
    lang: card.lang,
  };
}

export function createCardFromDraft(deckId: Id, draft: CardDraft, now: Date = new Date()): Flashcard {
  const timestamp = nowIso(now);
  return {
    id: createId('card'),
    deckId,
    ...draft,
    starred: draft.starred ?? false,
    suspended: draft.suspended ?? false,
    weight: draft.weight ?? 1,
    mastery: 0,
    timesSeen: 0,
    timesCorrect: 0,
    srs: createSrsState(now),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function applyDraftToCard(card: Flashcard, draft: CardDraft, now: Date = new Date()): Flashcard {
  return { ...card, ...draft, updatedAt: nowIso(now) };
}

/** Turns generator output into full `Flashcard` records with fresh ids and SRS state. */
export function materializeGeneratedCards(
  deckId: Id,
  generated: readonly GeneratedCard[],
  now: Date = new Date(),
): Flashcard[] {
  return generated.map((card) => {
    const draft: CardDraft = {
      ...DRAFT_DEFAULTS,
      ...card,
      tags: card.tags ?? [],
    };
    const flashcard = createCardFromDraft(deckId, draft, now);
    return card.source ? { ...flashcard, source: card.source } : flashcard;
  });
}
