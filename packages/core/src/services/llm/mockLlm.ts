import { createId } from '../../lib/id';
import { hashSeed, seededRng, shuffle } from '../../lib/random';
import { nowIso } from '../../lib/date';
import type {
  GeneratedCard,
  GenerationProgress,
  GenerationResult,
  GenerationStage,
} from '../../types';
import { GENERATION_STAGE_LABELS } from '../../types';
import {
  DEFAULT_CARDS,
  DEFAULT_CATEGORIES,
  DEFAULT_DECK_DESCRIPTION,
  DEFAULT_DECK_ICON,
  DEFAULT_DECK_TITLE,
} from './defaultDeck';
import { estimateCost, MODEL_CATALOG } from './models';
import { GenerationAbortedError } from './types';
import type { GenerateArgs, LlmService, ModelInfo } from './types';

/** Fraction of the job each stage accounts for, in order. */
const STAGE_WEIGHTS: Array<[GenerationStage, number]> = [
  ['reading', 0.1],
  ['extracting', 0.15],
  ['chunking', 0.1],
  ['generating', 0.45],
  ['refining', 0.15],
  ['done', 0.05],
];

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new GenerationAbortedError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(new GenerationAbortedError());
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** `lecture-notes-week-3.pdf` -> `Lecture Notes Week 3`. */
function titleFromFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  if (!base) return DEFAULT_DECK_TITLE;
  return base
    .split(/\s+/)
    .map((word) => (word.length > 2 ? word[0]?.toUpperCase() + word.slice(1) : word))
    .join(' ');
}

/**
 * Stand-in for the real generator.
 *
 * It ignores the document's text and always returns the same curated deck —
 * only the deck title, card count and per-card extras respond to the caller's
 * options. Swapping in `OpenRouterLlmService` is the only change needed to make
 * generation real; nothing outside this file assumes the cards are canned.
 */
export class MockLlmService implements LlmService {
  readonly id = 'mock';
  readonly isMock = true;

  /** Multiplier on the simulated stage delays. Set to 0 in tests. */
  constructor(private readonly speed = 1) {}

  async listModels(): Promise<ModelInfo[]> {
    await delay(120 * this.speed);
    return MODEL_CATALOG;
  }

  async generateDeck({
    document,
    options,
    onProgress,
    signal,
  }: GenerateArgs): Promise<GenerationResult> {
    const startedAt = Date.now();
    const cards = this.buildCards(document.filename, options);

    let elapsedWeight = 0;
    for (const [stage, weight] of STAGE_WEIGHTS) {
      const steps = stage === 'generating' ? Math.min(cards.length, 8) : 1;
      for (let step = 0; step < steps; step += 1) {
        await delay((320 * this.speed * weight) / steps + 60 * this.speed, signal);
        const stageProgress = (step + 1) / steps;
        const progress: GenerationProgress = {
          stage,
          progress: Math.min(1, elapsedWeight + weight * stageProgress),
          message:
            stage === 'generating'
              ? `Writing flashcards (${Math.round(cards.length * stageProgress)}/${cards.length})`
              : GENERATION_STAGE_LABELS[stage],
          cardsGenerated: stage === 'generating'
            ? Math.round(cards.length * stageProgress)
            : elapsedWeight > 0.5
              ? cards.length
              : 0,
        };
        onProgress?.(progress);
      }
      elapsedWeight += weight;
    }

    // Token counts are invented so the usage meter has something to render.
    const promptTokens = Math.max(500, Math.round(document.text.length / 4));
    const completionTokens = cards.length * 140;

    return {
      deckTitle: document.title?.trim() || titleFromFilename(document.filename),
      deckDescription: DEFAULT_DECK_DESCRIPTION,
      deckIcon: DEFAULT_DECK_ICON,
      categories: options.autoCategories
        ? DEFAULT_CATEGORIES.map((category) => ({ ...category }))
        : [],
      cards,
      source: {
        id: createId('src'),
        filename: document.filename,
        size: document.size,
        pageCount: document.pageCount,
        charCount: document.text.length,
        uploadedAt: nowIso(),
      },
      model: options.model,
      usage: {
        promptTokens,
        completionTokens,
        costUsd: estimateCost(options.model, promptTokens, completionTokens),
      },
      elapsedMs: Date.now() - startedAt,
    };
  }

  /** Filters the canned deck down to the requested types and count. */
  private buildCards(filename: string, options: GenerateArgs['options']): GeneratedCard[] {
    const allowed = new Set(options.cardTypes);
    const pool = DEFAULT_CARDS.filter((card) => allowed.has(card.type ?? 'basic'));
    // Every requested type was excluded — fall back to the full deck rather
    // than handing back an empty one.
    const usable = pool.length > 0 ? pool : DEFAULT_CARDS;

    // Seeded by filename so re-running the same upload gives the same deck.
    const rng = seededRng(hashSeed(filename));
    const ordered =
      options.cardCount >= usable.length ? usable.slice() : shuffle(usable, rng);

    return ordered.slice(0, Math.max(1, options.cardCount)).map((card) => ({
      ...card,
      difficulty: card.difficulty ?? options.difficulty,
      categoryId: options.autoCategories ? card.categoryId : undefined,
      hint: options.includeHints ? card.hint : undefined,
      explanation: options.includeExplanations ? card.explanation : undefined,
      source: options.includeSourceQuotes ? card.source : undefined,
      lang: options.language,
    }));
  }
}
