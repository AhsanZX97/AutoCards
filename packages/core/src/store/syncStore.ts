import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { STORAGE_KEYS, type StorageAdapter } from '../lib/storage';
import { toZustandStorage } from './persistBridge';
import type { IsoDate, SyncOp } from '../types';

export type SyncStatus = 'idle' | 'syncing' | 'error';

export function syncOpKey(op: Pick<SyncOp, 'kind' | 'id'>): string {
  return `${op.kind}:${op.id}`;
}

export interface SyncState {
  /** Outbox keyed by `kind:id` — re-enqueuing the same row collapses to the
   * latest op, so e.g. rapid `reviewCard` calls during a study session only
   * ever produce one pending push per card. */
  pendingOps: Record<string, SyncOp>;
  lastPulledAt: IsoDate | null;
  status: SyncStatus;
  error: string | null;

  enqueue: (ops: SyncOp[]) => void;
  dequeue: (keys: string[]) => void;
  clear: () => void;
  setStatus: (status: SyncStatus, error?: string | null) => void;
  setLastPulledAt: (at: IsoDate) => void;
}

export function createSyncStore(storage: StorageAdapter) {
  return create<SyncState>()(
    persist(
      (set) => ({
        pendingOps: {},
        lastPulledAt: null,
        status: 'idle',
        error: null,

        enqueue: (ops) => {
          if (ops.length === 0) return;
          set((state) => {
            const pendingOps = { ...state.pendingOps };
            for (const op of ops) {
              pendingOps[syncOpKey(op)] = op;
            }
            return { pendingOps };
          });
        },

        dequeue: (keys) => {
          if (keys.length === 0) return;
          set((state) => {
            const pendingOps = { ...state.pendingOps };
            for (const key of keys) delete pendingOps[key];
            return { pendingOps };
          });
        },

        clear: () => set({ pendingOps: {}, lastPulledAt: null, status: 'idle', error: null }),

        setStatus: (status, error = null) => set({ status, error }),
        setLastPulledAt: (at) => set({ lastPulledAt: at }),
      }),
      {
        name: STORAGE_KEYS.sync,
        storage: createJSONStorage(() => toZustandStorage(storage)),
      },
    ),
  );
}

export type SyncStore = ReturnType<typeof createSyncStore>;
