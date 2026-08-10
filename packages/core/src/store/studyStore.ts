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
import type { Deck, Flashcard, Grade, SessionSummary, StudySession, StudySettings, SyncOp } from '../types';

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

  /** Files a run finished on another device. Does not fire `onChange` — it is
   *  remote truth arriving, not a local run that needs pushing back up. */
  applyRemoteSession: (summary: SessionSummary) => void;
  /** Empties history without firing `onChange` — used on sign-out so a second
   *  account on the same device doesn't inherit the first one's streak and XP. */
  clear: () => void;
}

/** History is display state as much as stat input; the cap bounds what a very
 *  long-running account keeps in storage. */
const HISTORY_LIMIT = 500;

function sessionOp(id: string): SyncOp {
  return { kind: 'session', id, op: 'upsert' };
}

/**
 * Newest first, and never the same run twice — a device pushes a summary and
 * then pulls it straight back, and a duplicate would count its XP twice in
 * `computeOverallStats`. Locally-finished runs are already the newest, so the
 * sort only actually reorders when a pull backfills an older one.
 */
function fileSummary(history: SessionSummary[], summary: SessionSummary): SessionSummary[] {
  if (history.some((s) => s.id === summary.id)) return history;
  return [summary, ...history]
    .sort((a, b) => new Date(b.endedAt).getTime() - new Date(a.endedAt).getTime())
    .slice(0, HISTORY_LIMIT);
}

/**
 * `onChange` is how finished runs reach the sync outbox — see `createApp.ts`,
 * which wires it to `syncStore.enqueue`. Study history is the account's, not
 * the browser's: every dashboard number (streak, level, accuracy, activity)
 * is computed from it, so it has to travel with the user.
 */
export function createStudyStore(
  deckStore: DeckStore,
  storage: StorageAdapter,
  onChange: (ops: SyncOp[]) => void = () => {},
) {
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
            set((state) => ({ history: fileSummary(state.history, summary) }));
            onChange([sessionOp(summary.id)]);
          }
        },

        pauseAndAbandon: () => {
          const { activeSession } = get();
          if (!activeSession) return;
          const abandoned = abandonSession(activeSession);
          set({ activeSession: abandoned });
          if (abandoned.answers.length > 0) {
            const summary = toSessionSummary(abandoned);
            set((state) => ({ history: fileSummary(state.history, summary) }));
            onChange([sessionOp(summary.id)]);
          }
        },

        clearActiveSession: () => set({ activeSession: null }),

        sessionsForDeck: (deckId) => get().history.filter((s) => s.deckId === deckId),

        applyRemoteSession: (summary) => {
          set((state) => ({ history: fileSummary(state.history, summary) }));
        },

        clear: () => set({ history: [], activeSession: null }),
      }),
      {
        name: STORAGE_KEYS.sessions,
        storage: createJSONStorage(() => toZustandStorage(storage)),
        // `activeSession` is persisted only so that a reload can close it out —
        // see `merge`. It is never restored as something to carry on with.
        partialize: (state) => ({ history: state.history, activeSession: state.activeSession }),
        version: 1,
        // v0 history was written under a storage key with no user in it, so
        // there is no way to tell whose runs it holds — on a shared browser it
        // is genuinely a mix of accounts. It is dropped rather than adopted:
        // claiming it for whoever signs in next would write the very bug this
        // table exists to fix, permanently, to the server. From v1 on, history
        // belongs to an account and arrives by pull.
        migrate: (persisted, fromVersion) =>
          fromVersion < 1 ? { history: [], activeSession: null } : persisted,
        merge: (persisted, current) => {
          const saved = (persisted ?? {}) as Partial<StudyState>;
          const history = saved.history ?? current.history;
          const stale = saved.activeSession;

          // A session still marked active at load time is one the learner
          // walked away from. Record it, then drop it: the runner has no resume
          // path, so leaving it in place would only strand them mid-run.
          if (stale && stale.status === 'active' && stale.answers.length > 0) {
            const summary = toSessionSummary(abandonStaleSession(stale));
            // Enqueued from `merge` because this is the one path that appends a
            // summary without a caller behind it, and a run recovered here is
            // as real as one that finished cleanly.
            onChange([sessionOp(summary.id)]);
            return {
              ...current,
              ...saved,
              history: fileSummary(history, summary),
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
