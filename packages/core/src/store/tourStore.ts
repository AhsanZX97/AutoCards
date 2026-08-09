import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { STORAGE_KEYS, type StorageAdapter } from '../lib/storage';
import { toZustandStorage } from './persistBridge';
import type { TourId } from '../types';

/**
 * Which guided walkthroughs this device has already been shown.
 *
 * Held as the list of tours *finished* rather than a flag per screen so adding
 * a new tour later means adding an id, not a migration — an id nobody has
 * completed yet is simply unseen. Skipping counts as finishing: a learner who
 * dismissed a tour does not want it again on the next visit.
 */
export interface TourState {
  completedTours: TourId[];

  hasSeenTour: (id: TourId) => boolean;
  /** Marks a tour done, whether it was played through or skipped. */
  completeTour: (id: TourId) => void;
  /** Puts every tour back on, for a learner who wants to watch them again. */
  resetTours: () => void;
}

export function createTourStore(storage: StorageAdapter) {
  return create<TourState>()(
    persist(
      (set, get) => ({
        completedTours: [],

        hasSeenTour: (id) => get().completedTours.includes(id),

        completeTour: (id) =>
          set((state) =>
            state.completedTours.includes(id)
              ? state
              : { completedTours: [...state.completedTours, id] },
          ),

        resetTours: () => set({ completedTours: [] }),
      }),
      {
        name: STORAGE_KEYS.tours,
        storage: createJSONStorage(() => toZustandStorage(storage)),
        partialize: (state) => ({ completedTours: state.completedTours }),
      },
    ),
  );
}

export type TourStore = ReturnType<typeof createTourStore>;
