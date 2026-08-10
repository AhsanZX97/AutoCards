import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { STORAGE_KEYS, type StorageAdapter } from '../lib/storage';
import { toZustandStorage } from './persistBridge';
import { countUpload, usageForPeriod } from '../domain/uploadQuota';
import type { Id, UploadUsage } from '../types';

/**
 * The month's upload spend, per account.
 *
 * Keyed by user id rather than held as a single counter because one device can
 * carry more than one account — signing out and back in as someone else must
 * not hand them the first account's remaining allowance, or charge them for
 * uploads they never made. Nothing is cleared on sign-out for the same reason:
 * a count that vanished on sign-out would reset the allowance on demand.
 *
 * Local-only, and therefore a meter rather than a paywall — see
 * `domain/uploadQuota.ts`.
 */
export interface UsageState {
  uploadsByUser: Record<Id, UploadUsage>;

  /** Spends one upload against `userId`'s allowance. */
  recordUpload: (userId: Id, now?: Date) => void;
  /**
   * Replaces the local count with the one the server reported alongside a
   * generation. The server's number is the one that decides, so this overrides
   * rather than merges — including downwards, which is how a device whose
   * storage was cleared or copied gets back in step.
   */
  adoptServerCount: (userId: Id, usage: UploadUsage) => void;
  /** This month's count, zeroed if the stored record predates the month. */
  getUploads: (userId: Id, now?: Date) => UploadUsage;
}

export function createUsageStore(storage: StorageAdapter) {
  return create<UsageState>()(
    persist(
      (set, get) => ({
        uploadsByUser: {},

        recordUpload: (userId, now = new Date()) => {
          set((state) => ({
            uploadsByUser: {
              ...state.uploadsByUser,
              [userId]: countUpload(state.uploadsByUser[userId], now),
            },
          }));
        },

        adoptServerCount: (userId, usage) => {
          set((state) => ({
            uploadsByUser: { ...state.uploadsByUser, [userId]: usage },
          }));
        },

        getUploads: (userId, now = new Date()) => usageForPeriod(get().uploadsByUser[userId], now),
      }),
      {
        name: STORAGE_KEYS.usage,
        storage: createJSONStorage(() => toZustandStorage(storage)),
        partialize: (state) => ({ uploadsByUser: state.uploadsByUser }),
      },
    ),
  );
}

export type UsageStore = ReturnType<typeof createUsageStore>;
