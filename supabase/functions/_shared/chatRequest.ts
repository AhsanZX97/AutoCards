/**
 * What a client is allowed to ask the model for.
 *
 * The client still writes the prompt — that logic lives in
 * `services/llm/openRouter.ts` and there is no reason to keep a second copy of
 * it here. What this side owns is the bill. Anything that decides how much a
 * single call can cost is re-decided here from scratch: the model, the output
 * budget, and how much content goes up.
 *
 * The returned request is rebuilt field by field rather than spread from the
 * input, so a field this file does not know about cannot reach OpenRouter.
 * That is what keeps `stream`, provider routing overrides and prompt
 * transforms off the table.
 *
 * Held to the app's model catalogue by `edgeContract.test.ts` in core.
 */

/** Every slug the app offers. A request naming anything else is refused. */
export const ALLOWED_MODEL_IDS = [
  'deepseek/deepseek-v3.2',
  'xiaomi/mimo-v2.5',
  'moonshotai/kimi-k2',
  'qwen/qwen3-max',
  'z-ai/glm-4.6',
  'google/gemini-2.5-flash-lite',
  'anthropic/claude-haiku-4.5',
] as const;

/**
 * Text ceiling across the whole request. The client truncates its document
 * text at 120k and adds a prompt of a few thousand on top, so this leaves
 * headroom while still refusing a payload an order of magnitude bigger.
 */
export const MAX_TEXT_CHARS = 150_000;

/**
 * Mirrors `MAX_IMAGES_PER_RUN` in `services/llm/openRouter.ts` — the *run*
 * limit, not the per-document one.
 *
 * These were mismatched: the client picks up to 8 pictures out of each file
 * and then caps the whole run at 12, while this refused anything above 8. A
 * generation reading two illustrated slide decks therefore failed at the door
 * every time. The run limit is the one that bounds a single request, so it is
 * the one to mirror here.
 */
export const MAX_IMAGES = 12;

/**
 * Ceiling on the data URLs.
 *
 * The client caps each document's pictures at 4MB of raw bytes — roughly 5.4MB
 * base64 — and a run can draw from more than one file. This leaves room for
 * two full-size documents' worth without accepting an unbounded payload.
 */
export const MAX_IMAGE_URL_CHARS = 10_000_000;

/** Mirrors `MAX_OUTPUT_TOKENS` in `services/llm/openRouter.ts`. */
export const MAX_OUTPUT_TOKENS = 32_000;

/** A deck generation sends two; nothing the app does needs more than this. */
export const MAX_MESSAGES = 8;

export type ChatRole = 'system' | 'user' | 'assistant';

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface ChatMessage {
  role: ChatRole;
  content: string | ContentPart[];
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  max_tokens: number;
  response_format?: { type: 'json_object' };
}

export type SanitizeResult =
  | { ok: true; request: ChatRequest }
  | { ok: false; reason: string };

interface SanitizeOptions {
  /**
   * Lowers the output ceiling for a caller that has no business asking for a
   * long reply — `suggest-choice` writes one phrase.
   */
  maxOutputTokens?: number;
  /**
   * Lowers the input ceiling the same way. Neither can be raised above the
   * constants above; an endpoint may only ask for less.
   */
  maxTextChars?: number;
}

export function sanitizeChatRequest(input: unknown, options: SanitizeOptions = {}): SanitizeResult {
  if (!isRecord(input)) return refuse('Request body must be an object.');

  const model = input.model;
  if (typeof model !== 'string' || !(ALLOWED_MODEL_IDS as readonly string[]).includes(model)) {
    return refuse('Unsupported model.');
  }

  const rawMessages = input.messages;
  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    return refuse('Request must carry at least one message.');
  }
  if (rawMessages.length > MAX_MESSAGES) {
    return refuse('Too many messages in one request.');
  }

  const budget = { text: 0, images: 0, imageChars: 0 };
  const messages: ChatMessage[] = [];

  for (const raw of rawMessages) {
    const message = readMessage(raw, budget);
    if ('reason' in message) return refuse(message.reason);
    messages.push(message.value);
  }

  const textCeiling = Math.min(MAX_TEXT_CHARS, options.maxTextChars ?? MAX_TEXT_CHARS);
  if (budget.text > textCeiling) return refuse('That is more text than one generation may send.');
  if (budget.images > MAX_IMAGES) return refuse('Too many images in one request.');
  if (budget.imageChars > MAX_IMAGE_URL_CHARS) return refuse('Those images are too large to send.');

  const ceiling = Math.min(MAX_OUTPUT_TOKENS, options.maxOutputTokens ?? MAX_OUTPUT_TOKENS);
  const request: ChatRequest = {
    model,
    messages,
    max_tokens: clampOutputTokens(input.max_tokens, ceiling),
  };

  // The only response_format the app uses. Anything else is dropped rather
  // than refused — it changes the reply's shape, not its price.
  const format = input.response_format;
  if (isRecord(format) && format.type === 'json_object') {
    request.response_format = { type: 'json_object' };
  }

  return { ok: true, request };
}

interface Budget {
  text: number;
  images: number;
  imageChars: number;
}

type Read<T> = { value: T } | { reason: string };

function readMessage(raw: unknown, budget: Budget): Read<ChatMessage> {
  if (!isRecord(raw)) return { reason: 'Each message must be an object.' };
  if (!isRole(raw.role)) return { reason: 'Unknown message role.' };

  if (typeof raw.content === 'string') {
    budget.text += raw.content.length;
    return { value: { role: raw.role, content: raw.content } };
  }

  if (!Array.isArray(raw.content)) {
    return { reason: 'Message content must be text or a list of parts.' };
  }

  const parts: ContentPart[] = [];
  for (const rawPart of raw.content) {
    const part = readPart(rawPart, budget);
    if ('reason' in part) return part;
    parts.push(part.value);
  }
  return { value: { role: raw.role, content: parts } };
}

function readPart(raw: unknown, budget: Budget): Read<ContentPart> {
  if (!isRecord(raw)) return { reason: 'Each content part must be an object.' };

  if (raw.type === 'text') {
    if (typeof raw.text !== 'string') return { reason: 'A text part must carry text.' };
    budget.text += raw.text.length;
    return { value: { type: 'text', text: raw.text } };
  }

  if (raw.type === 'image_url') {
    const url = isRecord(raw.image_url) ? raw.image_url.url : undefined;
    // Only inline pictures the client extracted. A remote URL would have the
    // model — and therefore us — fetch whatever address the caller names.
    if (typeof url !== 'string' || !url.startsWith('data:image/')) {
      return { reason: 'Images must be inline data URLs.' };
    }
    budget.images += 1;
    budget.imageChars += url.length;
    return { value: { type: 'image_url', image_url: { url } } };
  }

  return { reason: 'Unknown content part.' };
}

/**
 * Missing or unusable budgets take the ceiling, which is what the caller would
 * have been allowed anyway — this is a cap, not a default worth guessing at.
 */
function clampOutputTokens(value: unknown, ceiling: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) return ceiling;
  return Math.min(ceiling, Math.floor(value));
}

function isRole(value: unknown): value is ChatRole {
  return value === 'system' || value === 'user' || value === 'assistant';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function refuse(reason: string): SanitizeResult {
  return { ok: false, reason };
}
