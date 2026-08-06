import type { GenerationResult } from '../../types';
import { MockLlmService } from './mockLlm';
import { OpenRouterLlmService, type OpenRouterConfig } from './openRouter';
import type { GenerateArgs, LlmService, ModelInfo } from './types';

/**
 * Picks between the mock and the real generator on every call.
 *
 * The key is not known when the app is constructed: it lives in the settings
 * store, which the user can fill in from Settings → Generation at any point,
 * and the app object is a page-load singleton. Deciding once at startup would
 * mean a key entered in Settings did nothing until a reload — and clearing it
 * would leave the app calling a dead key. So the decision is deferred to the
 * moment of use, and the underlying service is rebuilt only when the key
 * actually changes.
 */
export class RoutingLlmService implements LlmService {
  private mock = new MockLlmService();
  private real?: { key: string; service: OpenRouterLlmService };

  constructor(private readonly resolveConfig: () => OpenRouterConfig | undefined) {}

  get id(): string {
    return this.active().id;
  }

  get isMock(): boolean {
    return this.active().isMock;
  }

  listModels(): Promise<ModelInfo[]> {
    return this.active().listModels();
  }

  generateDeck(args: GenerateArgs): Promise<GenerationResult> {
    return this.active().generateDeck(args);
  }

  /** The service the next call would use, given the key available right now. */
  active(): LlmService {
    const config = this.resolveConfig();
    const key = config?.apiKey.trim();
    if (!config || !key) {
      this.real = undefined;
      return this.mock;
    }
    if (this.real?.key !== key) {
      this.real = { key, service: new OpenRouterLlmService({ ...config, apiKey: key }) };
    }
    return this.real.service;
  }
}
