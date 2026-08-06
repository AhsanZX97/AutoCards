import { createId } from '../../lib/id';
import { nowIso } from '../../lib/date';
import { truncate } from '../../lib/text';
import type { GenerationProgress, GenerationResult } from '../../types';
import { CARD_TYPE_LABELS } from '../../types';
import { costOf, MODEL_CATALOG } from './models';
import { normalizeGeneratedCards } from './normalizeCards';
import { GenerationAbortedError } from './types';
import type { GenerateArgs, LlmService, ModelInfo } from './types';

const API_BASE = 'https://openrouter.ai/api/v1';
const COMPLETIONS_ENDPOINT = `${API_BASE}/chat/completions`;
const MODELS_ENDPOINT = `${API_BASE}/models`;

/** Characters of PDF text sent to the model. Keeps a single call bounded. */
const MAX_CONTEXT_CHARS = 60_000;

/** Rough output budget per card, so a 60-card deck is not cut off mid-JSON. */
const TOKENS_PER_CARD = 220;
const MIN_OUTPUT_TOKENS = 2_000;
const MAX_OUTPUT_TOKENS = 32_000;

/** How often the waiting indicator creeps forward during the single long call. */
const TICK_MS = 700;

export interface OpenRouterConfig {
  apiKey: string;
  /** Sent as `HTTP-Referer`; OpenRouter uses it for attribution. */
  appUrl?: string;
  appName?: string;
}

/**
 * Live generation against OpenRouter's chat-completions API.
 *
 * One call per deck: the whole document (truncated to `MAX_CONTEXT_CHARS`) goes
 * up, one JSON object comes back. There is no chunking across a long document
 * and no retry — a failed call surfaces to the caller as an error rather than
 * silently falling back to canned cards, so a broken key or a dead model slug
 * is visible instead of masquerading as a successful generation.
 *
 * Model output is never trusted: everything goes through
 * `normalizeGeneratedCards` before it becomes a deck.
 */
export class OpenRouterLlmService implements LlmService {
  readonly id = 'openrouter';
  readonly isMock = false;

  /** Live catalog, fetched once per session. */
  private modelCache?: ModelInfo[];
  /** In-flight catalog fetch, so concurrent callers share one request. */
  private modelFetch?: Promise<ModelInfo[]>;

  constructor(private readonly config: OpenRouterConfig) {
    if (!config.apiKey) {
      throw new Error('OpenRouterLlmService requires an API key');
    }
  }

  /**
   * The bundled catalog is a hand-maintained stand-in and drifts against what
   * OpenRouter actually serves. Picking a slug that no longer exists fails the
   * whole generation with a 400, so the live list wins where it is reachable
   * and the bundled one is only a fallback for an offline or unauthorized key.
   */
  async listModels(): Promise<ModelInfo[]> {
    if (this.modelCache) return this.modelCache;
    // Two screens can ask at once, as can a StrictMode double-mount.
    this.modelFetch ??= this.fetchModels().finally(() => {
      this.modelFetch = undefined;
    });
    return this.modelFetch;
  }

  private async fetchModels(): Promise<ModelInfo[]> {
    try {
      const response = await fetch(MODELS_ENDPOINT, { headers: this.headers() });
      if (!response.ok) return MODEL_CATALOG;

      const payload = (await response.json()) as { data?: unknown };
      const live = new Map<string, LiveModel>();
      for (const entry of Array.isArray(payload.data) ? payload.data : []) {
        const parsed = parseLiveModel(entry);
        if (parsed) live.set(parsed.id, parsed);
      }
      if (live.size === 0) return MODEL_CATALOG;

      // Keep the curated shortlist rather than dumping several hundred models
      // into a dropdown — but drop any entry OpenRouter no longer serves, and
      // take pricing and context from the live record so they stay honest.
      const merged = MODEL_CATALOG.filter((model) => live.has(model.id)).map((model) => {
        const actual = live.get(model.id) as LiveModel;
        return {
          ...model,
          name: actual.name || model.name,
          context: actual.context || model.context,
          inputPrice: actual.inputPrice,
          outputPrice: actual.outputPrice,
        };
      });

      this.modelCache = merged.length > 0 ? merged : MODEL_CATALOG;
      return this.modelCache;
    } catch {
      // Offline, CORS-blocked, or a bad key. The dropdown still needs options.
      return MODEL_CATALOG;
    }
  }

  async generateDeck({ document, options, onProgress, signal }: GenerateArgs): Promise<GenerationResult> {
    const startedAt = Date.now();
    throwIfAborted(signal);

    // A placeholder document would produce a deck of cards about the
    // placeholder, at full token cost. Refuse before spending anything.
    if (document.synthetic) {
      throw new Error(
        `No text could be read out of ${document.filename}, so there is nothing to write cards from. Scanned or image-only PDFs need OCR first.`,
      );
    }

    const report = (progress: GenerationProgress) => onProgress?.(progress);

    report({
      stage: 'chunking',
      progress: 0.05,
      message: `Preparing ${document.filename}`,
      cardsGenerated: 0,
    });

    const body = {
      model: options.model,
      messages: [
        { role: 'system', content: buildSystemPrompt(options) },
        { role: 'user', content: buildUserPrompt(document.text) },
      ],
      response_format: { type: 'json_object' as const },
      max_tokens: outputBudget(options.cardCount),
    };

    // The call is one long await with no server-side progress events, so the
    // bar creeps toward a ceiling instead of freezing for the whole wait.
    const stopTicking = startWaitingTicker(report, options.model);

    let response: Response;
    try {
      response = await fetch(COMPLETIONS_ENDPOINT, {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json', ...this.headers() },
        body: JSON.stringify(body),
      });
    } catch (error) {
      if (isAbortError(error)) throw new GenerationAbortedError();
      throw new Error(`Could not reach OpenRouter: ${messageOf(error)}`);
    } finally {
      stopTicking();
    }

    if (!response.ok) {
      throw new Error(await describeHttpFailure(response, options.model));
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      error?: { message?: string };
    };

    // OpenRouter can return a 200 carrying an upstream provider error.
    if (payload.error?.message) {
      throw new Error(`OpenRouter: ${payload.error.message}`);
    }

    report({
      stage: 'refining',
      progress: 0.9,
      message: 'Checking the cards over',
      cardsGenerated: 0,
    });

    const choice = payload.choices?.[0];
    const parsed = parseJsonPayload(choice?.message?.content ?? '', choice?.finish_reason);
    const { cards, categories, discarded } = normalizeGeneratedCards(parsed, options);

    if (cards.length === 0) {
      throw new Error(
        discarded > 0
          ? `The model returned ${discarded} card${discarded === 1 ? '' : 's'} but none were usable. Try a different model or fewer card types.`
          : 'The model returned no cards. The PDF may have no extractable text — see if it is a scanned document.',
      );
    }

    report({ stage: 'done', progress: 1, message: 'Ready', cardsGenerated: cards.length });

    const promptTokens = payload.usage?.prompt_tokens ?? 0;
    const completionTokens = payload.usage?.completion_tokens ?? 0;

    return {
      deckTitle: document.title?.trim() || titleFromFilename(document.filename),
      deckDescription: `Generated from ${document.filename} with ${options.model}.`,
      deckIcon: '📄',
      categories,
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
        costUsd: costOf(this.modelCache, options.model, promptTokens, completionTokens),
      },
      elapsedMs: Date.now() - startedAt,
    };
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.apiKey}`,
      ...(this.config.appUrl ? { 'HTTP-Referer': this.config.appUrl } : {}),
      ...(this.config.appName ? { 'X-Title': this.config.appName } : {}),
    };
  }
}

/** `lecture-notes-week-3.pdf` -> `Lecture Notes Week 3`. */
function titleFromFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  if (!base) return 'Generated deck';
  return base
    .split(/\s+/)
    .map((word) => (word.length > 2 ? word[0]?.toUpperCase() + word.slice(1) : word))
    .join(' ');
}

function outputBudget(cardCount: number): number {
  return Math.min(MAX_OUTPUT_TOKENS, Math.max(MIN_OUTPUT_TOKENS, cardCount * TOKENS_PER_CARD));
}

/**
 * Creeps the progress bar toward a ceiling while the single model call is in
 * flight. Never reaches 1 — only a real response does that.
 */
function startWaitingTicker(
  report: (progress: GenerationProgress) => void,
  model: string,
): () => void {
  let elapsed = 0;
  const timer = setInterval(() => {
    elapsed += TICK_MS;
    // Approaches 0.85 asymptotically, so a slow model never looks stalled and
    // never looks finished either.
    const progress = 0.1 + 0.75 * (1 - Math.exp(-elapsed / 20_000));
    report({
      stage: 'generating',
      progress,
      message: `${model} is writing your flashcards`,
      cardsGenerated: 0,
    });
  }, TICK_MS);

  return () => clearInterval(timer);
}

function buildSystemPrompt(options: GenerateArgs['options']): string {
  const types = options.cardTypes;
  return [
    'You write flashcards from source documents. You reply with JSON only.',
    '',
    `Write at most ${options.cardCount} cards, pitched at "${options.difficulty}" difficulty.`,
    `Use only these card types: ${types.join(', ')}.`,
    'Cover the document evenly rather than exhausting its first section.',
    'Each card must ask exactly one thing, and must be answerable from the document alone.',
    'Never write a card about the document itself ("what does this chapter cover") — write cards about what it teaches.',
    options.instructions ? `\nThe user asked specifically: ${options.instructions}\n` : '',
    'Reply with a JSON object of this exact shape:',
    '{"cards": [{ ...card }]}',
    '',
    'Every card carries:',
    '  "type"        one of the allowed types above',
    '  "front"       the question side',
    '  "back"        the answer side',
    `  "difficulty"  one of: easy, medium, hard, expert`,
    '  "priority"    one of: low, normal, high, critical — how central the fact is',
    '  "tags"        array of 1-3 lowercase topic keywords',
    options.includeHints ? '  "hint"        a nudge that does not give the answer away' : '',
    options.includeExplanations ? '  "explanation" why the answer is correct' : '',
    options.includeSourceQuotes ? '  "source"      {"page": number, "quote": "verbatim sentence the card came from"}' : '',
    options.autoCategories ? '  "category"    a section name drawn from the document; reuse the same name across related cards' : '',
    '',
    // The runner cannot render or grade these types without their extra fields,
    // so spell out the contract per type rather than hoping the model infers it.
    'Type-specific fields — these are required, a card missing them is discarded:',
    describeTypes(types),
  ]
    .filter((line) => line !== '')
    .join('\n');
}

function describeTypes(types: GenerateArgs['options']['cardTypes']): string {
  const rules: Record<string, string> = {
    basic: '  basic — nothing extra. "front" asks, "back" answers.',
    reversed:
      '  reversed — "front" is a term, "back" is its definition. It is also shown in reverse, so both sides must stand alone.',
    cloze:
      '  cloze — add "clozeText": the full sentence with the hidden words wrapped as {{c1::hidden}}, numbered c1, c2… Use 1-2 blanks. Leave "front" and "back" as empty strings.',
    'multiple-choice':
      '  multiple-choice — add "choices": an array of 4 objects {"text": "…", "correct": true|false}. Exactly one is correct, and "back" repeats that correct text. Wrong options must be plausible.',
    'true-false':
      '  true-false — "front" is a statement, "back" is exactly "True" or "False". Do not add choices.',
    'type-in':
      '  type-in — add "acceptedAnswers": an array of every reasonable spelling or phrasing of the answer, including "back" itself. Keep answers to a few words.',
  };
  return types
    .map((type) => rules[type] ?? `  ${CARD_TYPE_LABELS[type]}`)
    .join('\n');
}

function buildUserPrompt(text: string): string {
  return `Source document:\n\n${truncate(text, MAX_CONTEXT_CHARS)}`;
}

/**
 * Models ignore `response_format` often enough that the fenced-code and
 * prose-wrapped cases are worth handling rather than failing the whole run.
 */
function parseJsonPayload(content: string, finishReason?: string): unknown {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error('The model returned an empty response. Try again, or pick a different model.');
  }

  const candidates = [trimmed, stripCodeFence(trimmed), firstJsonObject(trimmed)];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next shape.
    }
  }

  if (finishReason === 'length') {
    throw new Error(
      'The model ran out of room before finishing the deck. Ask for fewer cards, or pick a model with a larger output limit.',
    );
  }
  throw new Error('The model did not return valid JSON. Try again, or pick a different model.');
}

function stripCodeFence(value: string): string | undefined {
  const match = /^```(?:json)?\s*\n([\s\S]*?)\n?```$/.exec(value);
  return match?.[1]?.trim();
}

/** Grabs the outermost {...} when the model wrapped its JSON in prose. */
function firstJsonObject(value: string): string | undefined {
  const start = value.indexOf('{');
  const end = value.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;
  return value.slice(start, end + 1);
}

async function describeHttpFailure(response: Response, model: string): Promise<string> {
  const raw = await response.text().catch(() => '');
  let detail = raw.slice(0, 300);
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } };
    if (parsed.error?.message) detail = parsed.error.message;
  } catch {
    // Not JSON — the truncated body is the best detail available.
  }

  switch (response.status) {
    case 401:
      return 'OpenRouter rejected the API key. Check it in Settings → Generation.';
    case 402:
      return 'Your OpenRouter account is out of credit.';
    case 404:
      return `OpenRouter does not serve "${model}". Pick a different model.`;
    case 429:
      return 'OpenRouter is rate-limiting this key. Wait a moment and try again.';
    default:
      return `OpenRouter returned ${response.status}${detail ? `: ${detail}` : ''}`;
  }
}

interface LiveModel {
  id: string;
  name: string;
  context: number;
  inputPrice: number;
  outputPrice: number;
}

/** OpenRouter prices per token as decimal strings; the UI works per million. */
function parseLiveModel(entry: unknown): LiveModel | undefined {
  if (typeof entry !== 'object' || entry === null) return undefined;
  const record = entry as Record<string, unknown>;
  if (typeof record.id !== 'string') return undefined;
  const pricing = (record.pricing ?? {}) as Record<string, unknown>;
  return {
    id: record.id,
    name: typeof record.name === 'string' ? record.name : record.id,
    context: typeof record.context_length === 'number' ? record.context_length : 0,
    inputPrice: perMillion(pricing.prompt),
    outputPrice: perMillion(pricing.completion),
  };
}

function perMillion(value: unknown): number {
  const parsed = typeof value === 'string' ? Number.parseFloat(value) : typeof value === 'number' ? value : NaN;
  return Number.isFinite(parsed) ? parsed * 1_000_000 : 0;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new GenerationAbortedError();
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error instanceof GenerationAbortedError);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
