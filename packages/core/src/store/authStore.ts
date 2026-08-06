import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { AuthService } from '../services/auth/mockAuth';
import { AuthError } from '../services/auth/mockAuth';
import type { StorageAdapter } from '../lib/storage';
import { STORAGE_KEYS } from '../lib/storage';
import { toZustandStorage } from './persistBridge';
import type { Credentials, Plan, Session, SignUpInput, User } from '../types';

export interface AuthState {
  session: Session | null;
  status: 'idle' | 'restoring' | 'loading' | 'authenticated' | 'signed-out';
  error: string | null;
  errorField: 'email' | 'password' | 'name' | null;
  restore: () => Promise<void>;
  signIn: (credentials: Credentials) => Promise<boolean>;
  signUp: (input: SignUpInput) => Promise<boolean>;
  signOut: () => Promise<void>;
  updateProfile: (patch: Partial<Pick<User, 'name' | 'avatarUrl'>>) => Promise<void>;
  changePlan: (plan: Plan) => Promise<void>;
  clearError: () => void;
}

export function createAuthStore(auth: AuthService, storage: StorageAdapter) {
  return create<AuthState>()(
    persist(
      (set, get) => ({
        session: null,
        status: 'idle',
        error: null,
        errorField: null,

        restore: async () => {
          const { session } = get();
          if (!session) {
            set({ status: 'signed-out' });
            return;
          }
          set({ status: 'restoring' });
          const restored = await auth.restore(session);
          set(
            restored
              ? { session: restored, status: 'authenticated' }
              : { session: null, status: 'signed-out' },
          );
        },

        signIn: async (credentials) => {
          set({ status: 'loading', error: null, errorField: null });
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
          set({ status: 'loading', error: null, errorField: null });
          try {
            const session = await auth.signUp(input);
            set({ session, status: 'authenticated' });
            return true;
          } catch (err) {
            set({
              status: 'signed-out',
              error: err instanceof Error ? err.message : 'Sign up failed.',
              errorField: err instanceof AuthError ? (err.field ?? null) : null,
            });
            return false;
          }
        },

        signOut: async () => {
          await auth.signOut();
          set({ session: null, status: 'signed-out', error: null, errorField: null });
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
          const user = await auth.changePlan(session.user, plan);
          set({ session: { ...session, user } });
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

export type AuthStore = ReturnType<typeof createAuthStore>;
