import type { StorageAdapter } from './lib/storage';
import { createTranslator, resolveLocale, type Translator } from './i18n';
import type { AuthService } from './services/auth/types';
import { RoutingLlmService } from './services/llm';
import type { EdgeLlmConfig, LlmService, OpenRouterConfig } from './services/llm';
import { EdgeBillingService, EdgePlayBillingService } from './services/billing';
import type { BillingService, PlayBillingService } from './services/billing';
import { EdgeFeedbackService } from './services/feedback';
import type { FeedbackService } from './services/feedback';
import { SupabaseAccountBackend } from './services/account';
import type { AccountBackend } from './services/account';
import { SupabaseAnalyticsBackend } from './services/analytics';
import type { AnalyticsBackend } from './services/analytics';
import { SupabaseReminderBackend } from './services/reminders';
import type { ReminderBackend } from './services/reminders';
import type { DocumentExtractor } from './services/documents';
import { EdgeQuizletImporter } from './services/quizlet';
import type { QuizletImporter } from './services/quizlet';
import { SupabaseAuthService } from './services/auth/supabaseAuth';
import { SupabaseSyncBackend } from './services/sync/supabaseSyncBackend';
import { SyncEngine } from './services/sync/syncEngine';
import {
  createAuthStore,
  createDeckStore,
  createOnboardingStore,
  createReminderStore,
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
  /**
   * The device's own language tags, most preferred first — `navigator.languages`
   * on web, `Localization.getLocales()` on mobile. Combined with the settings
   * store's own `language` preference to translate the chrome text a
   * generation reports (progress messages, thrown errors) — never the target
   * language of the cards themselves, which is `GenerationOptions.language`
   * and can be overridden per deck.
   */
  getDeviceLocales?: () => readonly string[];
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

  // Same reasoning as the key below: read fresh so a language changed in
  // Settings takes effect on the next generation, not the next reload. This
  // is the app's own chrome language — progress messages, thrown errors —
  // never the language the cards are written in.
  const getT = (): Translator =>
    createTranslator(resolveLocale(settingsStore.getState().language, options.getDeviceLocales?.() ?? []));

  // Resolved per call rather than once here: the user can paste a key into
  // Settings long after the app object was built, and it should take effect
  // on the next generation instead of on the next page load. With no key
  // anywhere — the normal case — the call goes to the server instead.
  const llm: LlmService = new RoutingLlmService(
    () => {
      const saved = settingsStore.getState().openRouterApiKey.trim();
      if (saved) return { ...options.openRouter, apiKey: saved };
      return options.openRouter;
    },
    options.edge,
    getT,
  );

  // Only available where the functions are: checkout has to be started by the
  // server, since that is where the prices and the Stripe key live.
  const billing: BillingService | null = options.edge ? new EdgeBillingService(options.edge) : null;

  // Same reasoning as billing: only our own server can ask Google whether a
  // purchase token is real. Web has no use for this — Play only exists on
  // Android — but it costs nothing to wire everywhere `edge` is set.
  const playBilling: PlayBillingService | null = options.edge ? new EdgePlayBillingService(options.edge) : null;

  // Same reasoning as billing: sending mail needs a credential only the
  // server holds, so this only exists where the functions are deployed.
  const feedback: FeedbackService | null = options.edge ? new EdgeFeedbackService(options.edge) : null;

  // A browser cannot fetch a Quizlet set at all — no CORS headers, and the set
  // pages turn away anything that is not a browser — so this is server-only
  // too, and the create screen hides the option where it is missing.
  const quizlet: QuizletImporter | null = options.edge ? new EdgeQuizletImporter(options.edge) : null;

  // Plan and allowance as the server holds them. Read straight from Postgres:
  // both tables are owner-readable under RLS and neither needs a secret.
  const account: AccountBackend | null = options.supabase
    ? new SupabaseAccountBackend(options.supabase)
    : null;

  // Owner-only, and gated by the server rather than by this line: the function
  // behind it checks `profiles.is_admin` before it will read anything. Built
  // for every account because the screen it feeds is what decides whether to
  // ask, and the answer to a non-admin asking is an exception, not data.
  const analytics: AnalyticsBackend | null = options.supabase
    ? new SupabaseAnalyticsBackend(options.supabase)
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
  const onboardingStore = createOnboardingStore(options.storage);

  // Reminders go straight to their own table rather than through the sync
  // outbox. They are not offline-first the way decks are — a schedule that
  // never reaches the server is a schedule nothing can mail from — and they
  // carry no merge problem worth an outbox: one row, last write wins.
  const reminders: ReminderBackend | null = options.supabase
    ? new SupabaseReminderBackend(options.supabase)
    : null;

  const reminderStore = createReminderStore(options.storage, (change) => {
    if (!reminders) return;
    // Fire and forget: the edit is already saved locally, and the backend
    // logs its own failures. Nothing here is worth blocking the editor on.
    switch (change.kind) {
      case 'upsert':
        void reminders.push(change.reminder);
        break;
      case 'remove':
        void reminders.remove(change.reminderId);
        break;
      case 'clear-deck':
        void reminders.removeForDeck(change.deckId);
        break;
    }
  });

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

    // Reminders are pulled once per signed-in account rather than kept on a
    // timer: nothing but the reminder editor writes them, and the editor
    // pushes as it goes. The pull is what lets a second device see a schedule
    // set on the first — and what stops one account inheriting another's.
    let remindersFor: string | null = null;
    const followAccount = (userId: string | null) => {
      if (userId === remindersFor) return;
      const previous = remindersFor;
      remindersFor = userId;
      if (!userId) {
        // Only on a real sign-out, never on a first load that was already
        // signed out — otherwise a reload would clear the local copy before
        // the session had finished restoring.
        if (previous) reminderStore.getState().hydrate([]);
        return;
      }
      void reminders!.pull().then((rows) => {
        // A slow read must not land on an account that has since changed, and
        // null means the server was unreachable rather than empty.
        if (rows && remindersFor === userId) reminderStore.getState().hydrate(rows);
      });
    };
    followAccount(authStore.getState().session?.user.id ?? null);
    authStore.subscribe((state) => followAccount(state.session?.user.id ?? null));

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
    services: { auth, llm, billing, playBilling, feedback, quizlet, account, analytics, documents: options.documentExtractor },
    authStore,
    deckStore,
    studyStore,
    settingsStore,
    usageStore,
    tourStore,
    onboardingStore,
    reminderStore,
    syncStore,
    syncEngine,
    dispose: () => syncEngine?.stop(),
  };
}

export type App = ReturnType<typeof createApp>;
