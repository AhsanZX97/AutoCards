import type { Difficulty, Id } from './common';
import type { CardType, GeneratedCard } from './card';
import type { Category, DocumentKind, SourceDocument } from './deck';
import type { UploadQuotaSnapshot } from './usage';

/**
 * A picture lifted out of an uploaded file, ready to send to a model that can
 * see. Inlined as a data URL because the model call is made from the browser —
 * there is no server to host the bytes from.
 */
export interface DocumentImage {
  /** `data:image/png;base64,…` */
  dataUrl: string;
  /** 1-based page or slide it appeared on, when the format says. */
  page?: number;
  /** Encoded size after any downscaling, used to bound what is sent. */
  bytes: number;
}

/** Text pulled out of an uploaded file, before any model sees it. */
export interface ExtractedDocument {
  filename: string;
  size: number;
  /** What the file was. Absent means a PDF, for extractors written before the rest. */
  kind?: DocumentKind;
  /** Absent for flow formats — see {@link SourceDocument.pageCount}. */
  pageCount?: number;
  /** One entry per page or slide, in order. A single entry for flow formats. */
  pages: string[];
  text: string;
  /**
   * Pictures found in the file — diagrams, charts, screenshots. Extracted
   * whatever the settings say; whether they are actually sent to a model is
   * {@link GenerationOptions.readImages}.
   */
  images?: DocumentImage[];
  /** Document metadata title, when the file declares one. */
  title?: string;
  /**
   * True when `text` is a placeholder rather than the document's real contents
   * — an image-only PDF, or a platform with no extractor. Harmless for the
   * mock generator, which ignores the text; a live model must refuse it rather
   * than bill for cards written about a placeholder.
   */
  synthetic?: boolean;
}

/**
 * What the deck is *for*. The same upload makes a different deck depending on the
 * answer, and the difference is not quality but genre: revising a chapter wants
 * recall questions answerable from the text, while preparing for an interview
 * wants the text read as a syllabus and answered from professional knowledge.
 *
 * A preset carries that intent through to the prompt. `study` is what the app
 * has always done, so it stays the default and an absent preset means it.
 */
export const GENERATION_PRESETS = ['auto', 'study', 'concepts', 'exam', 'interview'] as const;
export type GenerationPresetId = (typeof GENERATION_PRESETS)[number];

export const DEFAULT_GENERATION_PRESET: GenerationPresetId = 'study';

/** One word each: the chips sit in a row, and the description below carries the detail. */
export const GENERATION_PRESET_LABELS: Record<GenerationPresetId, string> = {
  auto: 'Any',
  study: 'Study',
  concepts: 'Understand',
  exam: 'Exam',
  interview: 'Interview',
};

export const GENERATION_PRESET_DESCRIPTIONS: Record<GenerationPresetId, string> = {
  auto: 'Works out what the document is and picks the approach that fits it.',
  study: 'Recall questions covering the document evenly, answered straight from the text.',
  concepts: 'Questions about causes, mechanisms and trade-offs, answered with the reasoning behind them.',
  exam: 'The questions an examiner would set, leaning on applying the material rather than reciting it.',
  interview: 'Reads a job spec as a syllabus and asks what an interviewer would, answered from professional knowledge.',
};

export function isGenerationPreset(value: string): value is GenerationPresetId {
  return (GENERATION_PRESETS as readonly string[]).includes(value);
}

export interface GenerationOptions {
  /** OpenRouter model slug. */
  model: string;
  /**
   * What the cards are for. Absent means {@link DEFAULT_GENERATION_PRESET},
   * which keeps every call written before presets existed behaving as it did.
   */
  preset?: GenerationPresetId;
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
  /**
   * Send the pictures to the model as well as the text.
   *
   * Off by default, and deliberately so: it needs a model that can see, which
   * costs several times more per run than the house default, and most uploads
   * are text where it would buy nothing. Worth turning on for slides that are
   * mostly diagrams.
   */
  readImages?: boolean;
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
  reading: 'Reading your files',
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
  /** One entry per uploaded file, in the order they were given. */
  sources: SourceDocument[];
  model: string;
  /** Mock token accounting so the usage meter has something to show. */
  usage: { promptTokens: number; completionTokens: number; costUsd: number };
  /**
   * The monthly allowance as the server counted it after this run. Absent when
   * the call did not go through the server — see {@link UploadQuotaSnapshot}.
   */
  quota?: UploadQuotaSnapshot;
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
