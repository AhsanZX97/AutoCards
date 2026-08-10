import type { UploadQuotaSnapshot } from '../../types';
import type { ModelInfo } from './types';

/**
 * How a chat completion gets from this app to a model, and nothing else.
 *
 * There are two ways, and the difference between them is only where the
 * OpenRouter key is: `EdgeFunctionTransport` posts to our own function, which
 * holds the key and the upload allowance, and `DirectOpenRouterTransport`
 * calls OpenRouter with a key supplied here. Everything above this line — the
 * prompts, the model choice, reading the reply — is the same either way, and
 * lives once in `ChatCompletionLlmService`.
 */

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

/** An OpenRouter chat-completions request, as far as this app ever builds one. */
export interface ChatRequestBody {
  model: string;
  messages: ChatMessage[];
  max_tokens: number;
  response_format?: { type: 'json_object' };
}

/** The reply, in the shape both paths hand back. */
export interface ChatCompletionPayload {
  choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

/**
 * What the completion is for. The two cost wildly different amounts — a deck
 * is the thing a plan sells, a suggested wrong answer is a few words — so the
 * server handles them at separate endpoints with separate ceilings, and the
 * transport has to be told which one it is making.
 */
export type CompletionPurpose = 'deck' | 'suggestion';

export interface CompletionOutcome {
  payload: ChatCompletionPayload;
  /** Only the server-side path knows this; a direct call has no allowance to report. */
  quota?: UploadQuotaSnapshot;
}

export interface ChatTransport {
  /** Identifies the path in the UI, e.g. `edge` or `openrouter`. */
  readonly id: string;
  listModels(): Promise<ModelInfo[]>;
  complete(
    body: ChatRequestBody,
    purpose: CompletionPurpose,
    signal?: AbortSignal,
  ): Promise<CompletionOutcome>;
  /**
   * Live prices from a catalogue this path has already fetched, for costing a
   * run more accurately than the bundled catalogue can. Optional: a path with
   * no live catalogue falls back to the bundled prices.
   */
  cachedModels?(): ModelInfo[] | undefined;
}
