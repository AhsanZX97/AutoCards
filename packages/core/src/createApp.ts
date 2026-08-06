import type { StorageAdapter } from './lib/storage';
import { MockAuthService } from './services/auth/mockAuth';
import type { AuthService } from './services/auth/mockAuth';
import { MockLlmService, OpenRouterLlmService } from './services/llm';
import type { LlmService, OpenRouterConfig } from './services/llm';
import type { PdfExtractor } from './services/pdf';
import { createAuthStore, createDeckStore, createSettingsStore, createStudyStore } from './store';

export interface CreateAppOptions {
  storage: StorageAdapter;
  pdfExtractor: PdfExtractor;
  /** Supplying this switches generation from the mock deck to real OpenRouter calls. */
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
  const llm: LlmService = options.openRouter
    ? new OpenRouterLlmService(options.openRouter)
    : new MockLlmService();

  const authStore = createAuthStore(auth, options.storage);
  const deckStore = createDeckStore(options.storage);
  const studyStore = createStudyStore(deckStore, options.storage);
  const settingsStore = createSettingsStore(options.storage);

  return {
    services: { auth, llm, pdf: options.pdfExtractor },
    authStore,
    deckStore,
    studyStore,
    settingsStore,
  };
}

export type App = ReturnType<typeof createApp>;
