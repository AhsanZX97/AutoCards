import { createId } from '../../lib/id';
import { nowIso } from '../../lib/date';
import { truncate } from '../../lib/text';
import type { GenerationProgress, GenerationResult } from '../../types';
import { cardTypeLabel } from '../../types';
import { costOf, MODEL_CATALOG } from './models';
import { allowedCardTypes, normalizeGeneratedCards } from './normalizeCards';
import { GenerationAbortedError } from './types';
import type { GenerateArgs, LlmService, ModelInfo, SuggestChoiceArgs } from './types';

const API_BASE = 'https://openrouter.ai/api/v1';
const COMPLETIONS_ENDPOINT = `${API_BASE}/chat/completions`;
const MODELS_ENDPOINT = `${API_BASE}/models`;

/** Characters of PDF text sent to the model. Keeps a single call bounded. */
const MAX_CONTEXT_CHARS = 60_000;

/** Rough output budget per card, so a 60-card deck is not cut off mid-JSON. */
const TOKENS_PER_CARD = 220;
const MIN_OUTPUT_TOKENS = 2_000;
const MAX_OUTPUT_TOKENS = 32_000;

/** A single choice is a short phrase, not a paragraph. */
const SUGGEST_CHOICE_MAX_TOKENS = 60;

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

  async generateDeck({ document, options, avoidPrompts, onProgress, signal }: GenerateArgs): Promise<GenerationResult> {
    const startedAt = Date.now();
    throwIfAborted(signal);

    // A placeholder document would produce a deck of cards about the
    // placeholder, at full token cost. Refuse before spending anything.
    if (document.synthetic) {
      throw new Error(
        `We could not read any text out of ${document.filename}. If it is a scan or photos of pages, the words are really just pictures — try a PDF you can select text in.`,
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
        { role: 'system', content: buildSystemPrompt(options, avoidPrompts) },
        { role: 'user', content: buildUserPrompt(document.text) },
      ],
      response_format: { type: 'json_object' as const },
      max_tokens: outputBudget(options.cardCount),
    };

    // The call is one long await with no server-side progress events, so the
    // bar creeps toward a ceiling instead of freezing for the whole wait.
    const stopTicking = startWaitingTicker(report);

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
      throw new Error(offlineMessage(error));
    } finally {
      stopTicking();
    }

    if (!response.ok) {
      throw new Error(await describeHttpFailure(response));
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      error?: { message?: string };
    };

    // OpenRouter can return a 200 carrying an upstream provider error.
    if (payload.error?.message) {
      throw new Error(upstreamMessage(payload.error.message));
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
          ? 'None of the cards came back in a usable state. Try again, or turn off a card type or two.'
          : 'No cards came back from this PDF. If it is a scan or photos of pages, there is no text in it to work from.',
      );
    }

    report({ stage: 'done', progress: 1, message: 'Ready', cardsGenerated: cards.length });

    const promptTokens = payload.usage?.prompt_tokens ?? 0;
    const completionTokens = payload.usage?.completion_tokens ?? 0;

    return {
      deckTitle: document.title?.trim() || titleFromFilename(document.filename),
      deckDescription: `Generated from ${document.filename}.`,
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

  async suggestChoice({ front, back, existingChoices, model, signal }: SuggestChoiceArgs): Promise<string> {
    throwIfAborted(signal);

    const body = {
      model,
      messages: [
        { role: 'system', content: SUGGEST_CHOICE_SYSTEM_PROMPT },
        { role: 'user', content: buildSuggestChoicePrompt({ front, back, existingChoices }) },
      ],
      max_tokens: SUGGEST_CHOICE_MAX_TOKENS,
    };

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
      throw new Error(offlineMessage(error));
    }

    if (!response.ok) {
      throw new Error(await describeHttpFailure(response));
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };

    if (payload.error?.message) {
      throw new Error(upstreamMessage(payload.error.message));
    }

    const text = stripSuggestionWrapping(payload.choices?.[0]?.message?.content ?? '');
    if (!text) {
      throw new Error('Nothing came back that time. Try again in a moment.');
    }
    return text;
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
function startWaitingTicker(report: (progress: GenerationProgress) => void): () => void {
  let elapsed = 0;
  const timer = setInterval(() => {
    elapsed += TICK_MS;
    // Approaches 0.85 asymptotically, so a slow model never looks stalled and
    // never looks finished either.
    const progress = 0.1 + 0.75 * (1 - Math.exp(-elapsed / 20_000));
    report({
      stage: 'generating',
      progress,
      message: 'Writing your flashcards',
      cardsGenerated: 0,
    });
  }, TICK_MS);

  return () => clearInterval(timer);
}

function buildSystemPrompt(options: GenerateArgs['options'], avoidPrompts: string[] = []): string {
  const types = allowedCardTypes(options.cardTypes);
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
    describeAvoided(avoidPrompts),
  ]
    .filter((line) => line !== '')
    .join('\n');
}

/** Existing prompts listed to the model. Bounded so a large deck cannot crowd
 *  the document out of the context window. */
const MAX_AVOID_PROMPTS = 150;
/** Enough of a question to recognise it by; the full text is rarely needed. */
const MAX_AVOID_PROMPT_CHARS = 160;

/**
 * Tells the model what the deck already asks. Cheaper than letting it write
 * repeats and throwing them away afterwards, though `dropDuplicateCards` still
 * runs on the result — models restate a question they were asked to skip.
 */
function describeAvoided(prompts: string[]): string {
  const listed = prompts
    .map((prompt) => prompt.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, MAX_AVOID_PROMPTS);
  if (listed.length === 0) return '';

  return [
    '',
    `These questions are already in the deck${
      prompts.length > listed.length ? ` (showing ${listed.length} of ${prompts.length})` : ''
    }. Do not write them again, and do not reword them — cover material they leave out:`,
    ...listed.map((prompt) => `- ${truncate(prompt, MAX_AVOID_PROMPT_CHARS)}`),
  ].join('\n');
}

function describeTypes(types: GenerateArgs['options']['cardTypes']): string {
  const rules: Record<string, string> = {
    basic: '  basic — nothing extra. "front" asks, "back" answers.',
    'multiple-choice':
      '  multiple-choice — add "choices": an array of 4 objects {"text": "…", "correct": true|false}. Exactly one is correct, and "back" repeats that correct text. Wrong options must be plausible.',
    'true-false':
      '  true-false — "front" is a statement, "back" is exactly "True" or "False". Do not add choices.',
    'type-in':
      '  type-in — add "acceptedAnswers": an array of every reasonable spelling or phrasing of the answer, including "back" itself. Keep answers to a few words.',
  };
  return types
    .map((type) => rules[type] ?? `  ${cardTypeLabel(type)}`)
    .join('\n');
}

function buildUserPrompt(text: string): string {
  return `Source document:\n\n${truncate(text, MAX_CONTEXT_CHARS)}`;
}

const SUGGEST_CHOICE_SYSTEM_PROMPT = [
  'You write one wrong answer choice for a multiple-choice flashcard.',
  'Reply with only the choice text itself — no quotes, numbering, labels, or explanation.',
  'It must be clearly incorrect but plausible, matching the style and length of the existing choices.',
  'It must not repeat the correct answer or any existing choice.',
].join('\n');

function buildSuggestChoicePrompt({
  front,
  back,
  existingChoices,
}: Pick<SuggestChoiceArgs, 'front' | 'back' | 'existingChoices'>): string {
  const lines = [`Question: ${front}`, `Correct answer: ${back}`];
  if (existingChoices.length > 0) {
    lines.push(`Choices already on the card: ${existingChoices.join('; ')}`);
  }
  lines.push('Write one new wrong choice.');
  return lines.join('\n');
}

/** Models sometimes wrap the bare choice text in quotes or a leading dash. */
function stripSuggestionWrapping(text: string): string {
  return text
    .trim()
    .replace(/^[-*]\s*/, '')
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .trim();
}

/**
 * Models ignore `response_format` often enough that the fenced-code and
 * prose-wrapped cases are worth handling rather than failing the whole run.
 */
function parseJsonPayload(content: string, finishReason?: string): unknown {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error(GARBLED_MESSAGE);
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
    throw new Error('This deck was too big to finish in one go. Ask for fewer cards and try again.');
  }
  throw new Error(GARBLED_MESSAGE);
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

/**
 * What the user is told when a run fails.
 *
 * None of these name the provider, the model or an HTTP status: the person
 * reading them uploaded a PDF and wants cards, and cannot act on any of that.
 * They split by who can actually fix it — the user waits and retries, or we
 * do. The underlying detail goes to the console for whoever is on support.
 */
const UNAVAILABLE_MESSAGE =
  'Card generation is unavailable right now. This one is on us — please try again a little later.';
const BUSY_MESSAGE = 'Card generation is busy at the moment. Give it a minute and try again.';
const GARBLED_MESSAGE = 'The cards came back garbled that time. Try generating again.';

function offlineMessage(error: unknown): string {
  logFailure('request failed', messageOf(error));
  return 'Could not reach the internet. Check your connection and try again.';
}

function upstreamMessage(detail: string): string {
  logFailure('upstream error', detail);
  return UNAVAILABLE_MESSAGE;
}

async function describeHttpFailure(response: Response): Promise<string> {
  const raw = await response.text().catch(() => '');
  let detail = raw.slice(0, 300);
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } };
    if (parsed.error?.message) detail = parsed.error.message;
  } catch {
    // Not JSON — the truncated body is the best detail available.
  }
  logFailure(`HTTP ${response.status}`, detail);

  // 401 (bad key), 402 (no credit) and 404 (retired model) are all our
  // configuration rather than anything the user did or can change.
  return response.status === 429 ? BUSY_MESSAGE : UNAVAILABLE_MESSAGE;
}

function logFailure(context: string, detail: string): void {
  console.error(`[autocards] generation ${context}${detail ? `: ${detail}` : ''}`);
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
