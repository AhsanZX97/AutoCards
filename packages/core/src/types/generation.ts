import type { Difficulty, Id } from './common';
import type { CardType, GeneratedCard } from './card';
import type { Category, SourceDocument } from './deck';

/** Text pulled out of an uploaded PDF, before any model sees it. */
export interface ExtractedDocument {
  filename: string;
  size: number;
  pageCount: number;
  /** One entry per page, in order. */
  pages: string[];
  text: string;
  /** PDF metadata title, when the file declares one. */
  title?: string;
  /**
   * True when `text` is a placeholder rather than the document's real contents
   * — an image-only PDF, or a platform with no extractor. Harmless for the
   * mock generator, which ignores the text; a live model must refuse it rather
   * than bill for cards written about a placeholder.
   */
  synthetic?: boolean;
}

export interface GenerationOptions {
  /** OpenRouter model slug. */
  model: string;
  /** Target number of cards. The generator may return fewer. */
  cardCount: number;
  /** Card types the generator is allowed to produce. */
  cardTypes: CardType[];
  /** Overall difficulty target for the deck. */
  difficulty: Difficulty;
  /** Let the model invent categories from the document's structure. */
  autoCategories: boolean;
  /** Extra steering, passed through to the prompt. */
  instructions?: string;
  /** Also write a hint for each card. */
  includeHints: boolean;
  /** Also write an explanation for each card. */
  includeExplanations: boolean;
  /** Quote the source passage on each card. */
  includeSourceQuotes: boolean;
  language: string;
}

export const GENERATION_STAGES = [
  'reading',
  'extracting',
  'chunking',
  'generating',
  'refining',
  'done',
] as const;
export type GenerationStage = (typeof GENERATION_STAGES)[number];

export const GENERATION_STAGE_LABELS: Record<GenerationStage, string> = {
  reading: 'Reading your PDF',
  extracting: 'Extracting text',
  chunking: 'Splitting into study chunks',
  generating: 'Writing flashcards',
  refining: 'Tagging and scoring difficulty',
  done: 'Ready',
};

export interface GenerationProgress {
  stage: GenerationStage;
  /** 0–1 across the whole job. */
  progress: number;
  message: string;
  /** Cards finished so far. */
  cardsGenerated: number;
}

export interface GenerationResult {
  deckTitle: string;
  deckDescription: string;
  deckIcon: string;
  categories: Category[];
  cards: GeneratedCard[];
  source: SourceDocument;
  model: string;
  /** Mock token accounting so the usage meter has something to show. */
  usage: { promptTokens: number; completionTokens: number; costUsd: number };
  /** Wall-clock time the job took, in ms. */
  elapsedMs: number;
}

export interface GenerationJob {
  id: Id;
  filename: string;
  options: GenerationOptions;
  progress: GenerationProgress;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  error?: string;
  result?: GenerationResult;
}
