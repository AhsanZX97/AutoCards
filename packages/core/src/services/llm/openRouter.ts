import { createId } from '../../lib/id';
import { nowIso } from '../../lib/date';
import { truncate } from '../../lib/text';
import type {
  DocumentImage,
  ExtractedDocument,
  GenerationProgress,
  GenerationResult,
} from '../../types';
import { cardTypeLabel } from '../../types';
import { costOf, DEFAULT_VISION_MODEL_ID, isVisionModel, MODEL_CATALOG } from './models';
import {
  MAX_AUTO_CATEGORIES,
  allowedCardTypes,
  categoryTargetFor,
  normalizeGeneratedCards,
} from './normalizeCards';
import { promptRules, resolvePreset } from './presets';
import { GenerationAbortedError } from './types';
import type { GenerateArgs, LlmService, ModelInfo, SuggestChoiceArgs } from './types';
import type {
  ChatCompletionPayload,
  ChatRequestBody,
  ChatTransport,
  CompletionOutcome,
  CompletionPurpose,
  ContentPart,
} from './transport';

const API_BASE = 'https://openrouter.ai/api/v1';
const COMPLETIONS_ENDPOINT = `${API_BASE}/chat/completions`;
const MODELS_ENDPOINT = `${API_BASE}/models`;

/**
 * Characters of source text sent to the model, across every uploaded file.
 *
 * Roughly 30k tokens, against the 128k window of the default model — well
 * inside it, and a few tenths of a penny at DeepSeek's input price. The limit
 * is here to bound a runaway upload, not to save money.
 */
export const MAX_CONTEXT_CHARS = 120_000;

/** Floor and ceiling on the output budget; the per-card rate is the preset's. */
const MIN_OUTPUT_TOKENS = 2_000;
export const MAX_OUTPUT_TOKENS = 32_000;

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
 * Calls OpenRouter straight from wherever this is running, with a key held
 * here.
 *
 * That is only safe where the key is genuinely private — a user's own key
 * pasted into settings, or a script. The app's shared key is not: it lives on
 * the server behind `EdgeFunctionTransport`, because a key in the bundle is a
 * key anyone can read, and an allowance nobody can enforce.
 */
export class DirectOpenRouterTransport implements ChatTransport {
  readonly id = 'openrouter';

  /** Live catalog, fetched once per session. */
  private modelCache?: ModelInfo[];
  /** In-flight catalog fetch, so concurrent callers share one request. */
  private modelFetch?: Promise<ModelInfo[]>;

  constructor(private readonly config: OpenRouterConfig) {
    if (!config.apiKey) {
      throw new Error('DirectOpenRouterTransport requires an API key');
    }
  }

  /** Live prices, if the catalogue has already been fetched this session. */
  cachedModels(): ModelInfo[] | undefined {
    return this.modelCache;
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

  async complete(body: ChatRequestBody, _purpose: CompletionPurpose, signal?: AbortSignal): Promise<CompletionOutcome> {
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

    const payload = (await response.json()) as ChatCompletionPayload;

    // OpenRouter can return a 200 carrying an upstream provider error.
    if (payload.error?.message) {
      throw new Error(upstreamMessage(payload.error.message));
    }

    return { payload };
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.apiKey}`,
      ...(this.config.appUrl ? { 'HTTP-Referer': this.config.appUrl } : {}),
      ...(this.config.appName ? { 'X-Title': this.config.appName } : {}),
    };
  }
}

/**
 * Turns an upload into a deck of flashcards.
 *
 * One call per deck: the whole document (truncated to `MAX_CONTEXT_CHARS`) goes
 * up, one JSON object comes back. There is no chunking across a long document
 * and no retry — a failed call surfaces to the caller as an error rather than
 * silently falling back to canned cards, so a broken key or a dead model slug
 * is visible instead of masquerading as a successful generation.
 *
 * Model output is never trusted: everything goes through
 * `normalizeGeneratedCards` before it becomes a deck.
 *
 * Everything here is about what to ask for and what came back. Who holds the
 * key, and whether an upload allowance was spent, is the transport's business
 * — see `transport.ts`.
 */
export class ChatCompletionLlmService implements LlmService {
  constructor(private readonly transport: ChatTransport) {}

  get id(): string {
    return this.transport.id;
  }

  listModels(): Promise<ModelInfo[]> {
    return this.transport.listModels();
  }

  async generateDeck({ documents, options, avoidPrompts, onProgress, signal }: GenerateArgs): Promise<GenerationResult> {
    const startedAt = Date.now();
    throwIfAborted(signal);

    if (documents.length === 0) {
      throw new Error('No file was uploaded, so there is nothing to write cards from.');
    }

    // A placeholder document would produce a deck of cards about the
    // placeholder, at full token cost. Ones that could not be read are dropped
    // here and the rest carry on; only an upload with nothing readable in it
    // fails, and it fails before spending anything.
    const readable = documents.filter((document) => !document.synthetic);
    if (readable.length === 0) {
      throw new Error(unreadableMessage(documents));
    }

    const report = (progress: GenerationProgress) => onProgress?.(progress);

    report({
      stage: 'chunking',
      progress: 0.05,
      message: describePreparing(readable),
      cardsGenerated: 0,
    });

    // Pictures only reach the model when the user asked for it *and* the files
    // actually contained some — an upload with none should not be quietly
    // moved onto a model that costs ten times as much for nothing.
    const pictures = options.readImages ? picturesIn(readable) : [];
    const model = pictures.length > 0 ? visionModelFor(options.model) : options.model;

    const body: ChatRequestBody = {
      model,
      messages: [
        { role: 'system', content: buildSystemPrompt(options, avoidPrompts, readable, pictures.length) },
        { role: 'user', content: buildUserContent(readable, pictures) },
      ],
      response_format: { type: 'json_object' },
      max_tokens: outputBudget(options.cardCount, resolvePreset(options.preset).tokensPerCard),
    };

    // The call is one long await with no progress events coming back from the
    // far end, so the bar creeps toward a ceiling instead of freezing for the
    // whole wait.
    const stopTicking = startWaitingTicker(report);

    let outcome: CompletionOutcome;
    try {
      outcome = await this.transport.complete(body, 'deck', signal);
    } finally {
      stopTicking();
    }
    const payload = outcome.payload;

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
          : 'No cards came back from that. If it is a scan or photos of pages, there is no text in it to work from.',
      );
    }

    report({ stage: 'done', progress: 1, message: 'Ready', cardsGenerated: cards.length });

    const promptTokens = payload.usage?.prompt_tokens ?? 0;
    const completionTokens = payload.usage?.completion_tokens ?? 0;

    const first = documents[0] as ExtractedDocument;
    const uploadedAt = nowIso();

    return {
      // Only a fallback now: both upload screens ask for a name up front. It
      // still has to be something, for a caller that does not.
      deckTitle: first.title?.trim() || titleFromFilename(first.filename),
      deckDescription: describeGeneratedFrom(documents),
      deckIcon: '📄',
      categories,
      cards,
      // Every file the user handed over, readable or not — the deck should
      // record what was uploaded, not only what could be parsed.
      sources: documents.map((document) => ({
        id: createId('src'),
        filename: document.filename,
        size: document.size,
        ...(document.pageCount === undefined ? {} : { pageCount: document.pageCount }),
        charCount: document.text.length,
        kind: document.kind ?? 'pdf',
        uploadedAt,
      })),
      // The model that actually ran, which is not `options.model` when reading
      // pictures moved the run onto one that can see.
      model,
      usage: {
        promptTokens,
        completionTokens,
        costUsd: costOf(this.transport.cachedModels?.(), model, promptTokens, completionTokens),
      },
      // Only the server-side path reports one; a direct call has no allowance
      // to speak of, and the caller falls back to its own local count.
      ...(outcome.quota === undefined ? {} : { quota: outcome.quota }),
      elapsedMs: Date.now() - startedAt,
    };
  }

  async suggestChoice({ front, back, existingChoices, model, signal }: SuggestChoiceArgs): Promise<string> {
    throwIfAborted(signal);

    const body: ChatRequestBody = {
      model,
      messages: [
        { role: 'system', content: SUGGEST_CHOICE_SYSTEM_PROMPT },
        { role: 'user', content: buildSuggestChoicePrompt({ front, back, existingChoices }) },
      ],
      max_tokens: SUGGEST_CHOICE_MAX_TOKENS,
    };

    const { payload } = await this.transport.complete(body, 'suggestion', signal);

    const text = stripSuggestionWrapping(payload.choices?.[0]?.message?.content ?? '');
    if (!text) {
      throw new Error('Nothing came back that time. Try again in a moment.');
    }
    return text;
  }
}

/**
 * The app's generator, talking to OpenRouter with a key held on this device.
 *
 * Kept as its own name because that is what a bring-your-own-key setup is, and
 * because every test of the prompt and reply handling constructs one. The
 * shared-key path is `EdgeLlmService`.
 */
export class OpenRouterLlmService extends ChatCompletionLlmService {
  constructor(config: OpenRouterConfig) {
    super(new DirectOpenRouterTransport(config));
  }
}

/** Comma-separated filenames, e.g. `a.pdf, b.docx and c.pptx`. */
function listFilenames(documents: ExtractedDocument[]): string {
  const names = documents.map((document) => document.filename);
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** Said when nothing in the upload had readable text — usually all scans. */
function unreadableMessage(documents: ExtractedDocument[]): string {
  const subject =
    documents.length === 1 ? (documents[0] as ExtractedDocument).filename : 'any of those files';
  return `We could not read any text out of ${subject}. If they are scans or photos of pages, the words are really just pictures, so try a version you can select text in.`;
}

function describePreparing(documents: ExtractedDocument[]): string {
  return documents.length === 1
    ? `Preparing ${(documents[0] as ExtractedDocument).filename}`
    : `Preparing ${documents.length} documents`;
}

function describeGeneratedFrom(documents: ExtractedDocument[]): string {
  return `Generated from ${listFilenames(documents)}.`;
}

/** `lecture-notes-week-3.pdf` -> `Lecture Notes Week 3`. */
export function titleFromFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  if (!base) return 'Generated deck';
  return base
    .split(/\s+/)
    .map((word) => (word.length > 2 ? word[0]?.toUpperCase() + word.slice(1) : word))
    .join(' ');
}

function outputBudget(cardCount: number, tokensPerCard: number): number {
  return Math.min(MAX_OUTPUT_TOKENS, Math.max(MIN_OUTPUT_TOKENS, cardCount * tokensPerCard));
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

function buildSystemPrompt(
  options: GenerateArgs['options'],
  avoidPrompts: string[] = [],
  documents: ExtractedDocument[] = [],
  imageCount = 0,
): string {
  const types = allowedCardTypes(options.cardTypes);
  const preset = resolvePreset(options.preset);
  return [
    `${preset.persona} You reply with JSON only.`,
    '',
    `Write at most ${options.cardCount} cards, pitched at "${options.difficulty}" difficulty.`,
    `Use only these card types: ${types.join(', ')}.`,
    ...promptRules(preset, isTerseSource(documents)),
    describeImages(imageCount),
    describeMultipleDocuments(documents.length),
    options.instructions ? `\nThe user asked specifically: ${options.instructions}\n` : '',
    'Reply with a JSON object of this exact shape:',
    options.autoCategories
      ? '{"categories": ["…", "…"], "cards": [{ ...card }]}'
      : '{"cards": [{ ...card }]}',
    '',
    ...describeCategoryPlan(options, resolvePreset(options.preset).categoryHint),
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
    options.autoCategories
      ? '  "category"    exactly one name, copied verbatim from the "categories" list above'
      : '',
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

/**
 * Makes the model settle on its categories before it writes a single card.
 *
 * Asking for a `"category"` per card and hoping for repetition does not work:
 * each card is written in isolation, the most natural name for it is the one
 * describing that card exactly, and a 25-card deck comes back with 25
 * categories. Naming the whole list up front turns it into one decision about
 * the deck, which the cards are then assigned against — and gives
 * `buildCategories` a canonical spelling to fold near-misses onto.
 *
 * The count is `categoryTargetFor`, the same number the normalizer enforces.
 */
function describeCategoryPlan(
  options: GenerateArgs['options'],
  hint: string,
): string[] {
  if (!options.autoCategories) return [];
  const target = categoryTargetFor(options.cardCount);
  return [
    `Before writing any cards, decide on about ${target} categories for this deck — each one ${hint}. List them in "categories", then give every card one of them.`,
    `Rules for "categories": at most ${MAX_AUTO_CATEGORIES} names, each broad enough to hold several cards. Do not invent a category for a single card, and do not name one that only rewords another — if two would overlap, use one name for both.`,
    '',
  ];
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

/**
 * Above this many characters per slide, a deck is carrying real prose and the
 * ordinary source rule applies. Below it, the slides are a topic list: the
 * sample that prompted this averaged 139.
 */
const TERSE_CHARS_PER_PAGE = 400;

/**
 * True when the upload is headings and bullet points rather than prose.
 *
 * Both halves matter. Only slide decks qualify, so a chapter uploaded
 * alongside them still supplies real text to be faithful to; and a wordy deck
 * with speaker notes on every slide is prose however it was authored, so the
 * density has to be low as well.
 */
function isTerseSource(documents: ExtractedDocument[]): boolean {
  if (documents.length === 0) return false;
  if (!documents.every((document) => document.kind === 'slides')) return false;

  const chars = documents.reduce((sum, document) => sum + document.text.length, 0);
  const pages = documents.reduce((sum, document) => sum + (document.pageCount ?? 1), 0);
  return pages > 0 && chars / pages < TERSE_CHARS_PER_PAGE;
}

/**
 * What to do with the pictures, said only when some were actually sent.
 *
 * Without this the model treats them as illustration and writes cards from the
 * text alone — which is the whole thing the setting exists to avoid.
 */
function describeImages(count: number): string {
  if (count === 0) return '';
  return [
    '',
    `${count} image${count === 1 ? '' : 's'} from the source material ${
      count === 1 ? 'is' : 'are'
    } included below, each labelled with the file and slide it came from. They are part of the material, not decoration:`,
    '  - Read what they show — diagram labels, chart values, worked examples, anything written inside them.',
    '  - Where an image teaches something the text does not, that is worth a card.',
    '  - Do not write cards about an image as an object ("what does the diagram on slide 3 show") — write cards about what is in it.',
    '  - Ignore an image that turns out to be a logo, a stock photo or decoration.',
  ].join('\n');
}

/**
 * The extra rules that only apply once there is more than one file.
 *
 * Silent for a single document: a lone upload should produce byte-identical
 * prompts to the ones this wrote before multi-upload existed.
 */
function describeMultipleDocuments(count: number): string {
  if (count < 2) return '';
  return [
    '',
    `You have been given ${count} documents. They are one body of material, not ${count} separate jobs:`,
    '  - Spread the cards across all of them rather than working through the first and stopping.',
    '  - Where two documents make the same point, write one card, not one each.',
    '  - Where one document explains or contradicts another, that connection is worth a card of its own.',
    '  - Attribute nothing to the wrong document; each is labelled where it starts.',
  ].join('\n');
}

/**
 * Pictures across every uploaded file, capped for the whole run.
 *
 * Each extractor already limits its own file, but five illustrated decks at
 * eight images each would be forty pictures and several dollars. The run-level
 * cap is what the user is actually billed against, so it is enforced here.
 */
export const MAX_IMAGES_PER_RUN = 12;

interface LabelledImage {
  image: DocumentImage;
  filename: string;
}

function picturesIn(documents: ExtractedDocument[]): LabelledImage[] {
  const all: LabelledImage[] = [];
  for (const document of documents) {
    for (const image of document.images ?? []) {
      all.push({ image, filename: document.filename });
    }
  }
  // Round-robin across the documents rather than filling up on the first one,
  // so a deck uploaded second still gets looked at.
  return interleaveByDocument(all).slice(0, MAX_IMAGES_PER_RUN);
}

function interleaveByDocument(images: LabelledImage[]): LabelledImage[] {
  const byDocument = new Map<string, LabelledImage[]>();
  for (const entry of images) {
    const bucket = byDocument.get(entry.filename);
    if (bucket) bucket.push(entry);
    else byDocument.set(entry.filename, [entry]);
  }

  const buckets = [...byDocument.values()];
  const ordered: LabelledImage[] = [];
  for (let round = 0; ordered.length < images.length; round += 1) {
    for (const bucket of buckets) {
      const entry = bucket[round];
      if (entry) ordered.push(entry);
    }
  }
  return ordered;
}

/**
 * The user turn: the document text, plus each picture behind a line saying
 * where it came from so the model can attribute what it sees.
 */
function buildUserContent(
  documents: ExtractedDocument[],
  pictures: LabelledImage[],
): string | ContentPart[] {
  const text = buildUserPrompt(documents);
  if (pictures.length === 0) return text;

  const parts: ContentPart[] = [{ type: 'text', text }];
  for (const { image, filename } of pictures) {
    const where = image.page === undefined ? filename : `${filename}, slide ${image.page}`;
    parts.push({ type: 'text', text: `Image from ${where}:` });
    parts.push({ type: 'image_url', image_url: { url: image.dataUrl } });
  }
  return parts;
}

/** A model that can see, keeping the caller's choice when it already can. */
function visionModelFor(requested: string): string {
  return isVisionModel(requested) ? requested : DEFAULT_VISION_MODEL_ID;
}

function buildUserPrompt(documents: ExtractedDocument[]): string {
  const budgets = shareBudget(
    documents.map((document) => document.text.length),
    MAX_CONTEXT_CHARS,
  );

  if (documents.length === 1) {
    const only = documents[0] as ExtractedDocument;
    return `Source document:\n\n${truncate(only.text, budgets[0] as number)}`;
  }

  return documents
    .map((document, index) => {
      const heading = `=== Document ${index + 1} of ${documents.length}: ${document.filename} ===`;
      return `${heading}\n\n${truncate(document.text, budgets[index] as number)}`;
    })
    .join('\n\n');
}

/**
 * Splits a character budget across documents so no document is cut off
 * entirely.
 *
 * Concatenating everything and truncating the result would spend the whole
 * budget on whichever file happened to be first, and the last one would never
 * reach the model at all — silently, which is the worst part. Instead each
 * document is offered an equal share; anything shorter than its share takes
 * only what it needs and hands the remainder back for the longer ones to
 * divide. Shortest first, so the handing back compounds.
 */
function shareBudget(lengths: number[], total: number): number[] {
  const order = lengths.map((length, index) => ({ length, index }));
  order.sort((a, b) => a.length - b.length);

  const budgets = new Array<number>(lengths.length).fill(0);
  let remaining = total;
  let left = order.length;

  for (const { length, index } of order) {
    const share = Math.floor(remaining / left);
    const taken = Math.min(length, share);
    budgets[index] = taken;
    remaining -= taken;
    left -= 1;
  }
  return budgets;
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
  'Card generation is unavailable right now. This one is on us, so please try again a little later.';
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
