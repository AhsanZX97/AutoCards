import type { UploadQuotaSnapshot } from '../../types';
import type { EdgeConfig } from '../edgeConfig';
import { MODEL_CATALOG } from './models';
import { ChatCompletionLlmService } from './openRouter';
import { GenerationAbortedError, UploadQuotaExceededError } from './types';
import type { ModelInfo } from './types';
import type {
  ChatCompletionPayload,
  ChatRequestBody,
  ChatTransport,
  CompletionOutcome,
  CompletionPurpose,
} from './transport';

/** Where each kind of call goes. See `supabase/functions/`. */
const FUNCTION_BY_PURPOSE: Record<CompletionPurpose, string> = {
  deck: 'generate-deck',
  suggestion: 'suggest-choice',
};

/**
 * Nothing of its own beyond {@link EdgeConfig} — named separately because it
 * is what `createApp` and the app contexts pass for generation.
 */
export type EdgeLlmConfig = EdgeConfig;

/**
 * Sends the call to our own server, which holds the OpenRouter key.
 *
 * This is the path every normal generation takes. The key is not in the app —
 * it cannot be, because anything shipped to a browser or a phone can be read
 * out of it, and a readable key makes the monthly allowance decorative. What
 * goes up is the request this app built; what comes back is the model's reply
 * plus the allowance as the server counted it.
 */
export class EdgeFunctionTransport implements ChatTransport {
  readonly id = 'edge';
  private readonly base: string;

  constructor(private readonly config: EdgeLlmConfig) {
    this.base = config.supabaseUrl.replace(/\/+$/, '');
  }

  /**
   * The bundled catalogue, with no call out.
   *
   * The live merge the direct path does exists to keep prices honest, and it
   * needs the key to ask. From here the prices are only ever used to label a
   * run after the fact, so the bundled numbers will do.
   */
  async listModels(): Promise<ModelInfo[]> {
    return MODEL_CATALOG;
  }

  async complete(
    body: ChatRequestBody,
    purpose: CompletionPurpose,
    signal?: AbortSignal,
  ): Promise<CompletionOutcome> {
    const token = await this.config.getAccessToken();
    if (!token) {
      throw new Error('Sign in to generate cards.');
    }

    let response: Response;
    try {
      response = await fetch(`${this.base}/functions/v1/${FUNCTION_BY_PURPOSE[purpose]}`, {
        method: 'POST',
        signal,
        headers: {
          'Content-Type': 'application/json',
          apikey: this.config.anonKey,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw new GenerationAbortedError();
      throw new Error('We could not reach card generation just now. Check your connection and try again.');
    }

    const envelope = await readJson(response);

    if (!response.ok) {
      throw failureFrom(envelope, readQuota(envelope?.quota));
    }

    const quota = readQuota(envelope?.quota);
    return {
      payload: (envelope?.completion ?? {}) as ChatCompletionPayload,
      ...(quota === undefined ? {} : { quota }),
    };
  }
}

/** The generator every signed-in user runs on. */
export class EdgeLlmService extends ChatCompletionLlmService {
  constructor(config: EdgeLlmConfig) {
    super(new EdgeFunctionTransport(config));
  }
}

interface Envelope {
  completion?: unknown;
  quota?: unknown;
  error?: { code?: unknown; message?: unknown };
}

async function readJson(response: Response): Promise<Envelope | undefined> {
  try {
    const parsed: unknown = await response.json();
    return typeof parsed === 'object' && parsed !== null ? (parsed as Envelope) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The function writes its errors for the person reading them, so the message
 * is passed through as-is. Only the code is interpreted, and only to tell a
 * spent allowance apart from a genuine failure.
 */
function failureFrom(envelope: Envelope | undefined, quota: UploadQuotaSnapshot | undefined): Error {
  const message =
    typeof envelope?.error?.message === 'string' && envelope.error.message
      ? envelope.error.message
      : 'Card generation did not work that time. Try again in a moment.';

  if (envelope?.error?.code === 'quota_exhausted') {
    // A refusal reports the count too, so a meter that was out of step is
    // right again the moment the user is turned away.
    return new UploadQuotaExceededError(message, quota);
  }
  return new Error(message);
}

function readQuota(value: unknown): UploadQuotaSnapshot | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const { period, uploads, limit } = value as Record<string, unknown>;
  if (typeof period !== 'string' || typeof uploads !== 'number') return undefined;
  return { period, uploads, limit: typeof limit === 'number' ? limit : null };
}
