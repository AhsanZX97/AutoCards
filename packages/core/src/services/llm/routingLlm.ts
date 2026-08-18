import type { GenerationResult } from '../../types';
import { createTranslator, type Translator } from '../../i18n/translate';
import { EdgeLlmService, type EdgeLlmConfig } from './edgeTransport';
import { OpenRouterLlmService, type OpenRouterConfig } from './openRouter';
import type { GenerateArgs, LlmService, ModelInfo, SuggestChoiceArgs } from './types';

const defaultGetT = (): Translator => createTranslator('en');

/**
 * Thrown when there is nowhere to send a generation: no server configured and
 * no personal key either. The message is what the user sees, so it says what
 * it means for them rather than naming what is missing — an app deployed
 * without its backend is our problem, not theirs.
 */
export class LlmConfigError extends Error {
  constructor(message = 'Card generation is not switched on for this app yet.') {
    super(message);
    this.name = 'LlmConfigError';
  }
}

/**
 * Decides, per call, where a generation goes.
 *
 * Normally it goes to our own server — that is where the OpenRouter key lives
 * and where the monthly allowance is counted, and it is the only arrangement
 * in which a plan limit means anything.
 *
 * A key pasted into settings overrides that and calls OpenRouter directly.
 * That is someone spending their own money on their own account, so it does
 * not touch our allowance and does not need our server.
 *
 * The choice is deferred to the moment of use rather than made at
 * construction: the app object is a page-load singleton, and a key added or
 * cleared in settings should take effect on the next generation instead of the
 * next reload. The underlying service is rebuilt only when the key changes.
 */
export class RoutingLlmService implements LlmService {
  private real?: { key: string; service: OpenRouterLlmService };
  private readonly edge?: EdgeLlmService;

  constructor(
    private readonly resolveConfig: () => OpenRouterConfig | undefined,
    edge?: EdgeLlmConfig,
    private readonly getT: () => Translator = defaultGetT,
  ) {
    this.edge = edge ? new EdgeLlmService(edge, getT) : undefined;
  }

  get id(): string {
    return this.active().id;
  }

  listModels(): Promise<ModelInfo[]> {
    return this.active().listModels();
  }

  generateDeck(args: GenerateArgs): Promise<GenerationResult> {
    return this.active().generateDeck(args);
  }

  suggestChoice(args: SuggestChoiceArgs): Promise<string> {
    return this.active().suggestChoice(args);
  }

  /** The service the next call would use, given the settings right now. */
  active(): LlmService {
    const config = this.resolveConfig();
    const key = config?.apiKey.trim();

    if (!config || !key) {
      this.real = undefined;
      if (this.edge) return this.edge;
      throw new LlmConfigError(this.getT()('llmProgress.notConfigured'));
    }

    if (this.real?.key !== key) {
      this.real = { key, service: new OpenRouterLlmService({ ...config, apiKey: key }, this.getT) };
    }
    return this.real.service;
  }
}
