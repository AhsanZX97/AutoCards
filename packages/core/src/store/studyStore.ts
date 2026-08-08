import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { hashSeed, seededRng } from '../lib/random';
import { STORAGE_KEYS, type StorageAdapter } from '../lib/storage';
import { toZustandStorage } from './persistBridge';
import {
  abandonSession,
  abandonStaleSession,
  createSession,
  gradeFromCorrectness,
  recordAnswer,
  toSessionSummary,
} from '../domain';
import type { DeckStore } from './deckStore';
import type { Deck, Flashcard, Grade, SessionSummary, StudySession, StudySettings } from '../types';

export interface StudyState {
  activeSession: StudySession | null;
  history: SessionSummary[];

  startSession: (deck: Deck, cards: Flashcard[], settings: StudySettings) => StudySession;
  answer: (input: {
    cardId: string;
    grade?: Grade;
    correct: boolean;
    timeMs: number;
    usedHint: boolean;
    timedOut: boolean;
    response?: string;
  }) => void;
  pauseAndAbandon: () => void;
  clearActiveSession: () => void;
  sessionsForDeck: (deckId: string) => SessionSummary[];
}

export function createStudyStore(deckStore: DeckStore, storage: StorageAdapter) {
  return create<StudyState>()(
    persist(
      (set, get) => ({
        activeSession: null,
        history: [],

        startSession: (deck, cards, settings) => {
          const rng = seededRng(hashSeed(deck.id + Date.now().toString()));
          const session = createSession(deck, cards, settings, rng);
          set({ activeSession: session });
          return session;
        },

        answer: ({ cardId, grade, correct, timeMs, usedHint, timedOut, response }) => {
          const { activeSession } = get();
          if (!activeSession || activeSession.status !== 'active') return;

          const deckId = activeSession.deckId;
          const cards = deckStore.getState().getCards(deckId);
          const cardsById = new Map(cards.map((card) => [card.id, card]));

          const finalGrade = gradeFromCorrectness(correct, grade);
          const updated = recordAnswer(activeSession, {
            cardId,
            grade: finalGrade,
            correct,
            timeMs,
            usedHint,
            timedOut,
            response,
          }, cardsById);

          deckStore.getState().reviewCard(deckId, cardId, correct);
          set({ activeSession: updated });

          if (updated.status === 'completed') {
            const summary = toSessionSummary(updated);
            set((state) => ({ history: [summary, ...state.history].slice(0, 500) }));
          }
        },

        pauseAndAbandon: () => {
          const { activeSession } = get();
          if (!activeSession) return;
          const abandoned = abandonSession(activeSession);
          set({ activeSession: abandoned });
          if (abandoned.answers.length > 0) {
            set((state) => ({ history: [toSessionSummary(abandoned), ...state.history].slice(0, 500) }));
          }
        },

        clearActiveSession: () => set({ activeSession: null }),

        sessionsForDeck: (deckId) => get().history.filter((s) => s.deckId === deckId),
      }),
      {
        name: STORAGE_KEYS.sessions,
        storage: createJSONStorage(() => toZustandStorage(storage)),
        // `activeSession` is persisted only so that a reload can close it out —
        // see `merge`. It is never restored as something to carry on with.
        partialize: (state) => ({ history: state.history, activeSession: state.activeSession }),
        merge: (persisted, current) => {
          const saved = (persisted ?? {}) as Partial<StudyState>;
          const history = saved.history ?? current.history;
          const stale = saved.activeSession;

          // A session still marked active at load time is one the learner
          // walked away from. Record it, then drop it: the runner has no resume
          // path, so leaving it in place would only strand them mid-run.
          if (stale && stale.status === 'active' && stale.answers.length > 0) {
            return {
              ...current,
              ...saved,
              history: [toSessionSummary(abandonStaleSession(stale)), ...history].slice(0, 500),
              activeSession: null,
            };
          }

          return { ...current, ...saved, history, activeSession: null };
        },
      },
    ),
  );
}

export type StudyStore = ReturnType<typeof createStudyStore>;
