import type { StorageAdapter } from './lib/storage';
import { MockAuthService } from './services/auth/mockAuth';
import type { AuthService } from './services/auth/mockAuth';
import { RoutingLlmService } from './services/llm';
import type { LlmService, OpenRouterConfig } from './services/llm';
import type { PdfExtractor } from './services/pdf';
import { createAuthStore, createDeckStore, createSettingsStore, createStudyStore } from './store';

export interface CreateAppOptions {
  storage: StorageAdapter;
  pdfExtractor: PdfExtractor;
  /**
   * Build-time OpenRouter credentials. A key the user saves in Settings takes
   * precedence over this one; without either, generation stays on the mock.
   *
   * Note that on web this key is compiled into the bundle and is readable by
   * anyone who loads the app — fine for local development against your own
   * key, not for a deployed build. There, leave it unset and let each user
   * supply their own in Settings, or proxy the call through a server that
   * holds the key.
   */
  openRouter?: OpenRouterConfig;
  /** Override for tests; defaults to `MockAuthService`. */
  authService?: AuthService;
}

/**
 * Wires services and stores into one object apps can pull from a context or
 * module-level singleton. This is the single place that decides mock vs. real
 * — everything else in the app talks to the `LlmService`/`AuthService`
 * interfaces and doesn't know which implementation is behind them.
 */
export function createApp(options: CreateAppOptions) {
  const auth: AuthService = options.authService ?? new MockAuthService();

  const settingsStore = createSettingsStore(options.storage);

  // Resolved per call rather than once here: the user can paste a key into
  // Settings long after the app object was built, and it should take effect
  // on the next generation instead of on the next page load.
  const llm: LlmService = new RoutingLlmService(() => {
    const saved = settingsStore.getState().openRouterApiKey.trim();
    if (saved) return { ...options.openRouter, apiKey: saved };
    return options.openRouter;
  });

  const authStore = createAuthStore(auth, options.storage);
  const deckStore = createDeckStore(options.storage);
  const studyStore = createStudyStore(deckStore, options.storage);

  return {
    services: { auth, llm, pdf: options.pdfExtractor },
    authStore,
    deckStore,
    studyStore,
    settingsStore,
  };
}

export type App = ReturnType<typeof createApp>;
