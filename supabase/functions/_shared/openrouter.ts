import type { ChatRequest } from './chatRequest.ts';

const COMPLETIONS_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * What came back from OpenRouter, kept verbatim.
 *
 * The client parses this with exactly the code it used when it made the call
 * itself, so the function stays a pipe with a lock on it rather than a second
 * place that understands model replies.
 */
export interface UpstreamOutcome {
  /**
   * Whether the model ran. False for a rejected request or a provider outage —
   * those cost nothing, so the upload that paid for them is given back.
   */
  billed: boolean;
  status: number;
  payload: unknown;
  /** Set when `billed` is false: what to tell the user. */
  message?: string;
}

export function apiKey(): string {
  const key = Deno.env.get('OPENROUTER_API_KEY')?.trim();
  if (!key) throw new Error('OPENROUTER_API_KEY is not set on this project');
  return key;
}

export async function complete(request: ChatRequest, signal?: AbortSignal): Promise<UpstreamOutcome> {
  let response: Response;
  try {
    response = await fetch(COMPLETIONS_ENDPOINT, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey()}`,
        // Attribution only; OpenRouter shows these on the activity page.
        'HTTP-Referer': Deno.env.get('APP_URL') ?? 'https://autocards.app',
        'X-Title': 'Auto Cards',
      },
      body: JSON.stringify(request),
    });
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === 'AbortError';
    return {
      billed: false,
      status: aborted ? 499 : 502,
      payload: null,
      message: aborted
        ? 'That generation was cancelled.'
        : 'We could not reach the model just now. Try again in a moment.',
    };
  }

  const raw = await response.text();
  const payload = parseJson(raw);

  if (!response.ok) {
    return {
      billed: false,
      status: response.status,
      payload,
      message: describeFailure(response.status, payload, raw),
    };
  }

  // OpenRouter can answer 200 carrying an upstream provider error. Nothing was
  // generated, so nothing should have been charged.
  const upstream = errorMessageIn(payload);
  if (upstream) {
    return { billed: false, status: 502, payload, message: upstream };
  }

  return { billed: true, status: 200, payload };
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function errorMessageIn(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined;
  const error = (payload as { error?: { message?: unknown } }).error;
  return typeof error?.message === 'string' ? error.message : undefined;
}

/**
 * Said in terms of what the user can do about it. A 401 or a 402 is our
 * account's problem, not theirs, so neither names the key or the balance.
 */
function describeFailure(status: number, payload: unknown, raw: string): string {
  if (status === 401 || status === 403) {
    return 'Card generation is not set up correctly on our side. Nothing was charged to your account.';
  }
  if (status === 402) {
    return 'Card generation is temporarily unavailable. Nothing was charged to your account.';
  }
  if (status === 429) {
    return 'The model is busy right now. Give it a minute and try again.';
  }
  const detail = errorMessageIn(payload) ?? raw.slice(0, 200);
  return detail
    ? `The model could not complete that: ${detail}`
    : 'The model could not complete that. Try again in a moment.';
}
