import type { Accent, Difficulty, Id, IsoDate, Priority } from './common';

export const CARD_TYPES = [
  'basic',
  'multiple-choice',
  'true-false',
  'type-in',
] as const;
export type CardType = (typeof CARD_TYPES)[number];

/**
 * Types the app no longer writes, kept only so cards saved while they existed
 * still describe themselves honestly.
 *
 * `reversed` was a basic card asked backwards, which the study settings already
 * offer for a whole session. `cloze` was a sentence with a blank in it, which a
 * basic or type-in card asks just as well without the `{{c1::}}` markup nobody
 * outside Anki recognises. Both are read as basic everywhere downstream; see
 * `demoteRetiredCard` for the one-way conversion.
 */
export const RETIRED_CARD_TYPES = ['reversed', 'cloze'] as const;
export type RetiredCardType = (typeof RETIRED_CARD_TYPES)[number];

/** A card type as it can come back off a card already in storage. */
export type StoredCardType = CardType | RetiredCardType;

export const CARD_TYPE_LABELS: Record<CardType, string> = {
  basic: 'Basic',
  'multiple-choice': 'Multiple choice',
  'true-false': 'True / false',
  'type-in': 'Type the answer',
};

/** Plain-English explanation of each type, for the pickers that offer them. */
export const CARD_TYPE_DESCRIPTIONS: Record<CardType, string> = {
  basic: 'A question on the front, the answer on the back. You grade yourself.',
  'multiple-choice': 'A question with a few options, one of them right. Graded for you.',
  'true-false': 'A statement you mark true or false. Graded for you.',
  'type-in': 'You type the answer and it is checked against the expected one, allowing for typos.',
};

/** Label for a type read back off a stored card, retired ones included. */
export function cardTypeLabel(type: string): string {
  return CARD_TYPE_LABELS[type as CardType] ?? CARD_TYPE_LABELS.basic;
}

export function isRetiredCardType(type: string): type is RetiredCardType {
  return (RETIRED_CARD_TYPES as readonly string[]).includes(type);
}

/** Card types the runner can mark right/wrong on its own, with no self-grading. */
export const AUTO_GRADED_TYPES: readonly CardType[] = [
  'multiple-choice',
  'true-false',
  'type-in',
];

export interface Choice {
  id: Id;
  text: string;
  correct: boolean;
}

/** Where in the source PDF this card came from. */
export interface CardSource {
  page?: number;
  /** Verbatim snippet the generator based the card on. */
  quote?: string;
}

export interface Flashcard {
  id: Id;
  deckId: Id;
  /** Anything new is a {@link CardType}; older cards can carry a retired one. */
  type: StoredCardType;

  /** Question side. For cloze cards this is the rendered prompt. */
  front: string;
  /** Answer side. For cloze cards this is the full un-blanked sentence. */
  back: string;

  /** `{{c1::text}}` markers mark the blanks. Only set for cloze cards. */
  clozeText?: string;
  /** Only set for multiple-choice and true-false cards. */
  choices?: Choice[];
  /** Accepted answers for type-in cards, matched case/punctuation-insensitively. */
  acceptedAnswers?: string[];

  hint?: string;
  explanation?: string;
  mnemonic?: string;
  example?: string;
  notes?: string;

  difficulty: Difficulty;
  priority: Priority;
  categoryId?: Id;
  tags: string[];
  accent?: Accent;

  starred: boolean;
  /** Suspended cards never enter a study queue. */
  suspended: boolean;
  /** Manual bias on how often the card is drawn. 0.25–4, default 1. */
  weight: number;

  /**
   * Manual sort order within the deck — lower comes first, and a deck that has
   * been reordered holds a contiguous 0..n-1 run. Optional because cards
   * written before manual ordering existed don't carry one; `sortCardsByPosition`
   * falls back to array order for those, so nothing needs migrating.
   */
  position?: number;

  /** 0–100, derived from review history. */
  mastery: number;
  timesSeen: number;
  timesCorrect: number;

  source?: CardSource;

  /** BCP-47 tag used by text-to-speech. */
  lang?: string;

  createdAt: IsoDate;
  updatedAt: IsoDate;
}

/** Everything a card editor may change. Identity and derived stats are excluded. */
export type CardDraft = Pick<
  Flashcard,
  | 'type'
  | 'front'
  | 'back'
  | 'clozeText'
  | 'choices'
  | 'acceptedAnswers'
  | 'hint'
  | 'explanation'
  | 'mnemonic'
  | 'example'
  | 'notes'
  | 'difficulty'
  | 'priority'
  | 'categoryId'
  | 'tags'
  | 'accent'
  | 'starred'
  | 'suspended'
  | 'weight'
  | 'lang'
>;

/** A card as returned by the generator, before it is given an id and defaults. */
export type GeneratedCard = Partial<CardDraft> &
  Pick<Flashcard, 'front' | 'back'> & { source?: CardSource };
