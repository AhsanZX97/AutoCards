import type { StorageAdapter } from './lib/storage';
import type { AuthService } from './services/auth/types';
import { RoutingLlmService } from './services/llm';
import type { LlmService, OpenRouterConfig } from './services/llm';
import type { DocumentExtractor } from './services/documents';
import { SupabaseAuthService } from './services/auth/supabaseAuth';
import { SupabaseSyncBackend } from './services/sync/supabaseSyncBackend';
import { SyncEngine } from './services/sync/syncEngine';
import {
  createAuthStore,
  createDeckStore,
  createSettingsStore,
  createStudyStore,
  createSyncStore,
  createTourStore,
  createUsageStore,
} from './store';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface CreateAppOptions {
  storage: StorageAdapter;
  /** Reads uploads of every supported format; see `RoutingDocumentExtractor`. */
  documentExtractor: DocumentExtractor;
  /**
   * OpenRouter credentials generation runs on. Every user's generation calls
   * go through this one key — there is no per-user bring-your-own-key path.
   *
   * Note that on web this key is compiled into the bundle and is readable by
   * anyone who loads the app. Proxy the call through a server that holds the
   * key instead if that's not acceptable for your deployment.
   */
  openRouter?: OpenRouterConfig;
  /** Override for tests; a real client requires either this or `supabase`. */
  authService?: AuthService;
  /** A pre-built Supabase client — required (via this or `authService`) for real accounts and cross-device deck sync. */
  supabase?: SupabaseClient;
  /** Sync flush cadence; defaults to 10s. Only used when `supabase` is set. */
  syncFlushIntervalMs?: number;
}

/**
 * Wires services and stores into one object apps can pull from a context or
 * module-level singleton — everything else in the app talks to the
 * `LlmService`/`AuthService` interfaces and doesn't know which implementation
 * is behind them.
 */
export function createApp(options: CreateAppOptions) {
  if (!options.authService && !options.supabase) {
    throw new Error(
      'createApp requires a Supabase client (set `supabase`), or an `authService` override for tests.',
    );
  }
  const auth: AuthService = options.authService ?? new SupabaseAuthService(options.supabase!);

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
  const syncStore = options.supabase ? createSyncStore(options.storage) : null;
  const deckStore = createDeckStore(options.storage, (ops) => syncStore?.getState().enqueue(ops));
  const studyStore = createStudyStore(deckStore, options.storage);
  const usageStore = createUsageStore(options.storage);
  const tourStore = createTourStore(options.storage);

  let syncEngine: SyncEngine | null = null;
  if (options.supabase) {
    syncEngine = new SyncEngine({
      authStore,
      deckStore,
      syncStore: syncStore!,
      backend: new SupabaseSyncBackend(options.supabase),
      flushIntervalMs: options.syncFlushIntervalMs,
    });
    syncEngine.start();
    // Keep the store in step with Supabase's own session lifecycle (silent
    // token refresh, sign-in/out) rather than only when restore() runs.
    options.supabase.auth.onAuthStateChange((_event, supabaseSession) => {
      if (!supabaseSession) {
        authStore.getState().syncFromProvider(null);
        return;
      }
      void authStore.getState().restore();
    });
  }

  return {
    services: { auth, llm, documents: options.documentExtractor },
    authStore,
    deckStore,
    studyStore,
    settingsStore,
    usageStore,
    tourStore,
    syncStore,
    syncEngine,
    dispose: () => syncEngine?.stop(),
  };
}

export type App = ReturnType<typeof createApp>;
