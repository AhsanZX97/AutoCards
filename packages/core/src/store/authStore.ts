import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { isAdmin } from '../domain/admin';
import type { AuthService } from '../services/auth/types';
import { AuthError } from '../services/auth/types';
import type { StorageAdapter } from '../lib/storage';
import { STORAGE_KEYS } from '../lib/storage';
import { toZustandStorage } from './persistBridge';
import type { Credentials, Plan, Session, SignUpInput, User } from '../types';

export interface AuthState {
  session: Session | null;
  status: 'idle' | 'restoring' | 'loading' | 'authenticated' | 'signed-out';
  error: string | null;
  errorField: 'email' | 'password' | 'name' | null;
  /** Set when sign-up lands in the `confirmation-required` state — the UI
   *  shows a "check your email" screen instead of navigating into the app. */
  pendingConfirmationEmail: string | null;
  /**
   * Re-validates the session against the provider.
   *
   * Pass `fromProvider` when the call is driven by the provider announcing a
   * session (`onAuthStateChange`) rather than by app start-up. Without it, a
   * cold start with nothing persisted resolves straight to signed-out and
   * never touches the network — which is right for start-up and wrong for a
   * recovery link, where the only copy of the session lives in the provider's
   * client and nothing has been persisted yet.
   */
  restore: (options?: { fromProvider?: boolean }) => Promise<void>;
  signIn: (credentials: Credentials) => Promise<boolean>;
  signUp: (input: SignUpInput) => Promise<boolean>;
  /**
   * Sends the browser to Google. `true` means the hand-off was accepted and
   * the page is on its way out — not that anyone is signed in yet.
   *
   * The status is deliberately left on 'loading' in that case: the button
   * should keep spinning until the navigation actually happens, and there is
   * no session to move to 'authenticated' with. The one that comes back lands
   * through `restore({ fromProvider: true })` on the return page.
   */
  signInWithGoogle: (redirectTo: string) => Promise<boolean>;
  /**
   * Signs out, after giving anything unsynced a chance to reach the server.
   *
   * Returns false without signing out when local changes could not be pushed —
   * signing out wipes them, so that is the caller's decision to make, not
   * this store's. Pass `{ force: true }` once the user has chosen to lose them.
   */
  signOut: (options?: { force?: boolean }) => Promise<boolean>;
  updateProfile: (patch: Partial<Pick<User, 'username' | 'avatarUrl'>>) => Promise<void>;
  changePlan: (plan: Plan) => Promise<void>;
  /** Applies a session snapshot from an external auth source (Supabase's
   *  `onAuthStateChange`), so a silently-refreshed token updates the store
   *  proactively rather than only when `restore()` happens to run. */
  syncFromProvider: (session: Session | null) => void;
  clearError: () => void;
}

export interface AuthStoreOptions {
  /**
   * Run before the session is given up, to push anything still queued.
   * Resolves false when something could not be flushed — see `signOut`.
   *
   * Injected rather than imported so the store keeps knowing nothing about
   * sync, the same way the deck store only knows it has an `onChange`.
   */
  flushBeforeSignOut?: () => Promise<boolean>;
}

/** Longest the sign-out flush may hold things up before we stop waiting. */
const FLUSH_TIMEOUT_MS = 8_000;

export function createAuthStore(
  auth: AuthService,
  storage: StorageAdapter,
  options: AuthStoreOptions = {},
) {
  return create<AuthState>()(
    persist(
      (set, get) => ({
        session: null,
        status: 'idle',
        error: null,
        errorField: null,
        pendingConfirmationEmail: null,

        restore: async ({ fromProvider = false } = {}) => {
          const { session } = get();
          // Nothing stored and no provider event to go on: there is nothing to
          // recover, and asking the network would only delay a cold start.
          if (!session && !fromProvider) {
            set({ status: 'signed-out' });
            return;
          }
          set({ status: 'restoring' });
          try {
            const restored = await auth.restore(session);
            set(
              restored
                ? { session: restored, status: 'authenticated' }
                : { session: null, status: 'signed-out' },
            );
          } catch (err) {
            // Anything thrown here — offline, a Supabase blip, a profile row
            // that never got created — used to reject unhandled and leave the
            // status on 'restoring' forever, which the app renders as a
            // spinner that never resolves. Failing to signed-out at least
            // gives the user a screen they can act on.
            console.error('[autocards] could not restore the session', err);
            set({ session: null, status: 'signed-out' });
          }
        },

        signIn: async (credentials) => {
          set({ status: 'loading', error: null, errorField: null, pendingConfirmationEmail: null });
          try {
            const session = await auth.signIn(credentials);
            set({ session, status: 'authenticated' });
            return true;
          } catch (err) {
            set({
              status: 'signed-out',
              error: err instanceof Error ? err.message : 'Sign in failed.',
              errorField: err instanceof AuthError ? (err.field ?? null) : null,
            });
            return false;
          }
        },

        signUp: async (input) => {
          set({ status: 'loading', error: null, errorField: null, pendingConfirmationEmail: null });
          try {
            const result = await auth.signUp(input);
            if (result.status === 'authenticated') {
              set({ session: result.session, status: 'authenticated' });
              return true;
            }
            // Provider requires email confirmation — no session yet.
            set({ status: 'signed-out', pendingConfirmationEmail: result.email });
            return false;
          } catch (err) {
            set({
              status: 'signed-out',
              error: err instanceof Error ? err.message : 'Sign up failed.',
              errorField: err instanceof AuthError ? (err.field ?? null) : null,
            });
            return false;
          }
        },

        signInWithGoogle: async (redirectTo) => {
          set({ status: 'loading', error: null, errorField: null, pendingConfirmationEmail: null });
          try {
            await auth.signInWithGoogle(redirectTo);
            return true;
          } catch (err) {
            // No field to hang this on — there is no form. It renders as the
            // notice above the buttons.
            set({
              status: 'signed-out',
              error: err instanceof Error ? err.message : 'Could not continue with Google.',
              errorField: null,
            });
            return false;
          }
        },

        signOut: async ({ force = false } = {}) => {
          // Signing out wipes local decks and history, so anything still in
          // the outbox has to reach the server first — it is gone otherwise,
          // and the server's older copy takes its place on the next sign-in.
          // Done before `auth.signOut()` because the token is what authorises
          // the push.
          if (!force && options.flushBeforeSignOut) {
            const flushed = await withTimeout(options.flushBeforeSignOut(), FLUSH_TIMEOUT_MS);
            if (!flushed) return false;
          }

          await auth.signOut();
          set({ session: null, status: 'signed-out', error: null, errorField: null, pendingConfirmationEmail: null });
          return true;
        },

        updateProfile: async (patch) => {
          const { session } = get();
          if (!session) return;
          const user = await auth.updateProfile(session.user, patch);
          set({ session: { ...session, user } });
        },

        changePlan: async (plan) => {
          const { session } = get();
          if (!session) return;
          // Plans are not self-serve — only the owner account switches them.
          if (!isAdmin(session.user)) return;
          const user = await auth.changePlan(session.user, plan);
          set({ session: { ...session, user } });
        },

        syncFromProvider: (session) => {
          if (session) set({ session, status: 'authenticated', error: null, errorField: null });
          else set({ session: null, status: 'signed-out', pendingConfirmationEmail: null });
        },

        clearError: () => set({ error: null, errorField: null }),
      }),
      {
        name: STORAGE_KEYS.auth,
        storage: createJSONStorage(() => toZustandStorage(storage)),
        partialize: (state) => ({ session: state.session }),
      },
    ),
  );
}

/**
 * Resolves false rather than hanging when the flush takes too long. An
 * offline sign-out must still reach a decision — the user is then asked
 * whether to sign out anyway.
 */
async function withTimeout(work: Promise<boolean>, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), ms);
  });
  try {
    return await Promise.race([work.catch(() => false), expiry]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export type AuthStore = ReturnType<typeof createAuthStore>;
