import { createId } from '../../lib/id';
import { nowIso } from '../../lib/date';
import { truncate } from '../../lib/text';
import type { GeneratedCard, GenerationResult } from '../../types';
import { estimateCost, MODEL_CATALOG } from './models';
import type { GenerateArgs, LlmService, ModelInfo } from './types';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

/** Characters of PDF text sent to the model. Keeps a single call bounded. */
const MAX_CONTEXT_CHARS = 60_000;

export interface OpenRouterConfig {
  apiKey: string;
  /** Sent as `HTTP-Referer`; OpenRouter uses it for attribution. */
  appUrl?: string;
  appName?: string;
}

/**
 * Real generator. Not wired up yet — the app runs on `MockLlmService` until a
 * key is supplied, and this class is the drop-in replacement for that day.
 *
 * Left deliberately thin: no retries, no streaming, no chunking across a long
 * document. Those belong here once the mock comes out.
 */
export class OpenRouterLlmService implements LlmService {
  readonly id = 'openrouter';
  readonly isMock = false;

  constructor(private readonly config: OpenRouterConfig) {
    if (!config.apiKey) {
      throw new Error('OpenRouterLlmService requires an API key');
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    // The live catalog lives at GET /api/v1/models. Until this path is
    // exercised for real, fall back to the bundled list.
    return MODEL_CATALOG;
  }

  async generateDeck({ document, options, onProgress, signal }: GenerateArgs): Promise<GenerationResult> {
    const startedAt = Date.now();
    onProgress?.({
      stage: 'generating',
      progress: 0.2,
      message: 'Asking the model for flashcards',
      cardsGenerated: 0,
    });

    const response = await fetch(ENDPOINT, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
        ...(this.config.appUrl ? { 'HTTP-Referer': this.config.appUrl } : {}),
        ...(this.config.appName ? { 'X-Title': this.config.appName } : {}),
      },
      body: JSON.stringify({
        model: options.model,
        messages: [
          { role: 'system', content: buildSystemPrompt(options) },
          { role: 'user', content: buildUserPrompt(document.text) },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter returned ${response.status}: ${await response.text()}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = payload.choices?.[0]?.message?.content ?? '{}';
    const cards = parseCards(content);

    onProgress?.({
      stage: 'done',
      progress: 1,
      message: 'Ready',
      cardsGenerated: cards.length,
    });

    const promptTokens = payload.usage?.prompt_tokens ?? 0;
    const completionTokens = payload.usage?.completion_tokens ?? 0;

    return {
      deckTitle: document.title?.trim() || document.filename.replace(/\.[^.]+$/, ''),
      deckDescription: `Generated from ${document.filename}.`,
      deckIcon: '📄',
      categories: [],
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
}

function buildSystemPrompt(options: GenerateArgs['options']): string {
  return [
    'You write flashcards from source documents.',
    `Produce at most ${options.cardCount} cards, aimed at ${options.difficulty} difficulty.`,
    `Allowed card types: ${options.cardTypes.join(', ')}.`,
    options.includeHints ? 'Include a short hint on each card.' : '',
    options.includeExplanations ? 'Include an explanation of why the answer is correct.' : '',
    options.includeSourceQuotes ? 'Quote the source passage each card came from.' : '',
    options.autoCategories ? 'Group the cards into categories drawn from the document.' : '',
    options.instructions ?? '',
    'Each card must ask exactly one thing.',
    'Reply with JSON: {"cards": [{"type","front","back","hint","explanation","difficulty","priority","tags"}]}.',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildUserPrompt(text: string): string {
  return `Source document:\n\n${truncate(text, MAX_CONTEXT_CHARS)}`;
}

function parseCards(content: string): GeneratedCard[] {
  try {
    const parsed = JSON.parse(content) as { cards?: GeneratedCard[] };
    return Array.isArray(parsed.cards) ? parsed.cards : [];
  } catch {
    throw new Error('Model did not return valid JSON');
  }
}
