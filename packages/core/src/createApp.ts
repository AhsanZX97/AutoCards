import type { StorageAdapter } from './lib/storage';
import type { AuthService } from './services/auth/types';
import { RoutingLlmService } from './services/llm';
import type { EdgeLlmConfig, LlmService, OpenRouterConfig } from './services/llm';
import { EdgeBillingService } from './services/billing';
import type { BillingService } from './services/billing';
import { SupabaseAccountBackend } from './services/account';
import type { AccountBackend } from './services/account';
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
   * The Supabase project the `generate-deck` and `suggest-choice` functions
   * are deployed to. Generation goes through them, because that is where the
   * OpenRouter key and the monthly allowance live.
   *
   * Without it there is no generation at all unless someone supplies their own
   * key — see `openRouter`.
   */
  edge?: EdgeLlmConfig;
  /**
   * A fallback OpenRouter key, used only when nothing has been set in
   * settings and as a last resort before giving up.
   *
   * Anything passed here on web or mobile is compiled into the bundle and can
   * be read by anyone who loads the app, which is why the shared key is not
   * passed here any more. Reasonable for a script or a local experiment; not
   * for a deployment that sells plans.
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
  // on the next generation instead of on the next page load. With no key
  // anywhere — the normal case — the call goes to the server instead.
  const llm: LlmService = new RoutingLlmService(() => {
    const saved = settingsStore.getState().openRouterApiKey.trim();
    if (saved) return { ...options.openRouter, apiKey: saved };
    return options.openRouter;
  }, options.edge);

  // Only available where the functions are: checkout has to be started by the
  // server, since that is where the prices and the Stripe key live.
  const billing: BillingService | null = options.edge ? new EdgeBillingService(options.edge) : null;

  // Plan and allowance as the server holds them. Read straight from Postgres:
  // both tables are owner-readable under RLS and neither needs a secret.
  const account: AccountBackend | null = options.supabase
    ? new SupabaseAccountBackend(options.supabase)
    : null;

  // Declared up front so the auth store can reach the engine that does not
  // exist yet: signing out has to push the outbox before local state is wiped,
  // and only the engine knows how. Without a backend there is nothing to
  // flush, so sign-out is never blocked.
  let syncEngine: SyncEngine | null = null;

  const authStore = createAuthStore(auth, options.storage, {
    flushBeforeSignOut: async () => (syncEngine ? syncEngine.flushPending() : true),
  });
  const syncStore = options.supabase ? createSyncStore(options.storage) : null;
  const deckStore = createDeckStore(options.storage, (ops) => syncStore?.getState().enqueue(ops));
  const studyStore = createStudyStore(deckStore, options.storage, (ops) =>
    syncStore?.getState().enqueue(ops),
  );
  const usageStore = createUsageStore(options.storage);
  const tourStore = createTourStore(options.storage);

  if (options.supabase) {
    syncEngine = new SyncEngine({
      authStore,
      deckStore,
      studyStore,
      syncStore: syncStore!,
      backend: new SupabaseSyncBackend(options.supabase),
      flushIntervalMs: options.syncFlushIntervalMs,
    });
    syncEngine.start();
    // Keep the store in step with Supabase's own session lifecycle (silent
    // token refresh, sign-in/out) rather than only when restore() runs.
    //
    // `fromProvider` matters most for password recovery: the link in the email
    // is consumed by the Supabase client on page load, which fires here with a
    // session the app has never persisted. Without the flag, restore() sees an
    // empty store, concludes signed-out, and the reset page reports a link that
    // is in fact perfectly good as expired.
    options.supabase.auth.onAuthStateChange((_event, supabaseSession) => {
      if (!supabaseSession) {
        authStore.getState().syncFromProvider(null);
        return;
      }
      void authStore.getState().restore({ fromProvider: true });
    });
  }

  return {
    services: { auth, llm, billing, account, documents: options.documentExtractor },
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
