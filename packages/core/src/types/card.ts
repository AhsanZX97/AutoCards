import type { Accent, Difficulty, Id, IsoDate, Priority } from './common';

export const CARD_TYPES = [
  'basic',
  'reversed',
  'cloze',
  'multiple-choice',
  'true-false',
  'type-in',
] as const;
export type CardType = (typeof CARD_TYPES)[number];

export const CARD_TYPE_LABELS: Record<CardType, string> = {
  basic: 'Basic',
  reversed: 'Reversed',
  cloze: 'Cloze deletion',
  'multiple-choice': 'Multiple choice',
  'true-false': 'True / false',
  'type-in': 'Type the answer',
};

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

export const SRS_STATES = ['new', 'learning', 'review', 'relearning'] as const;
export type SrsStateName = (typeof SRS_STATES)[number];

export interface SrsState {
  state: SrsStateName;
  /** Days until the next review. */
  intervalDays: number;
  /** SM-2 ease factor. Floors at 1.3. */
  ease: number;
  repetitions: number;
  /** Times the card was forgotten after having graduated. */
  lapses: number;
  dueAt: IsoDate;
  lastReviewedAt?: IsoDate;
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
  type: CardType;

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

  /** 0–100, derived from review history. */
  mastery: number;
  timesSeen: number;
  timesCorrect: number;

  srs: SrsState;
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
