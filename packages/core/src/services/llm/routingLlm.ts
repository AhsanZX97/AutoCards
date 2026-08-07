import type { GenerationResult } from '../../types';
import { OpenRouterLlmService, type OpenRouterConfig } from './openRouter';
import type { GenerateArgs, LlmService, ModelInfo, SuggestChoiceArgs } from './types';

/** Thrown when no usable OpenRouter key is configured at call time. */
export class LlmConfigError extends Error {
  constructor() {
    super('No OpenRouter API key is configured.');
    this.name = 'LlmConfigError';
  }
}

/**
 * Resolves the OpenRouter key on every call rather than once at construction.
 *
 * The key is not known when the app is constructed: it lives in the settings
 * store, which can change at any point, and the app object is a page-load
 * singleton. Deciding once at startup would mean a key change did nothing
 * until a reload. So the decision is deferred to the moment of use, and the
 * underlying service is rebuilt only when the key actually changes.
 */
export class RoutingLlmService implements LlmService {
  private real?: { key: string; service: OpenRouterLlmService };

  constructor(private readonly resolveConfig: () => OpenRouterConfig | undefined) {}

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

  /** The service the next call would use, given the key available right now. */
  active(): LlmService {
    const config = this.resolveConfig();
    const key = config?.apiKey.trim();
    if (!config || !key) {
      this.real = undefined;
      throw new LlmConfigError();
    }
    if (this.real?.key !== key) {
      this.real = { key, service: new OpenRouterLlmService({ ...config, apiKey: key }) };
    }
    return this.real.service;
  }
}
