import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { STORAGE_KEYS, type StorageAdapter } from '../lib/storage';
import { toZustandStorage } from './persistBridge';

/** Whether this device has already been shown the first-login walkthrough. */
export interface OnboardingState {
  hasSeenOnboarding: boolean;

  /** Marks onboarding done, whether it was played through or skipped. */
  completeOnboarding: () => void;
  /** Puts onboarding back on, for someone who wants to watch it again. */
  resetOnboarding: () => void;
}

export function createOnboardingStore(storage: StorageAdapter) {
  return create<OnboardingState>()(
    persist(
      (set) => ({
        hasSeenOnboarding: false,

        completeOnboarding: () => set({ hasSeenOnboarding: true }),
        resetOnboarding: () => set({ hasSeenOnboarding: false }),
      }),
      {
        name: STORAGE_KEYS.onboarding,
        storage: createJSONStorage(() => toZustandStorage(storage)),
        partialize: (state) => ({ hasSeenOnboarding: state.hasSeenOnboarding }),
      },
    ),
  );
}

export type OnboardingStore = ReturnType<typeof createOnboardingStore>;
