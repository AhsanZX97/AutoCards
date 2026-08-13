import { describe, expect, it, vi } from 'vitest';
import { createAuthStore } from '../../../store/authStore';
import { createDeckStore } from '../../../store/deckStore';
import { createStudyStore, type StudyStore } from '../../../store/studyStore';
import { createSyncStore } from '../../../store/syncStore';
import { createDefaultStudySettings, createEmptyDraft } from '../../../domain';
import { makeCard } from '../../../domain/__tests__/testHelpers';
import { createMemoryStorage } from '../../../lib/storage';
import { SyncEngine } from '../syncEngine';
import type { AuthService } from '../../auth/types';
import type { SyncBackend } from '../syncBackend';
import type { Deck, Flashcard, SessionSummary, Session } from '../../../types';
import { nowIso } from '../../../lib/date';

const SESSION: Session = {
  user: {
    id: 'user-1',
    email: 'ada@example.com',
    username: 'ada_lovelace',
    initials: 'AD',
    plan: 'free',
    isAdmin: false,
    createdAt: '2024-01-01T00:00:00.000Z',
  },
  token: 'token-1',
  expiresAt: '2025-01-01T00:00:00.000Z',
};

function fakeAuth(): AuthService {
  return {
    signIn: async () => SESSION,
    signUp: async () => ({ status: 'authenticated' as const, session: SESSION }),
    signInWithGoogle: async () => {},
    startGoogleSignIn: async () => 'https://accounts.google.com/o/oauth2/auth',
    restoreFromUrl: async () => null,
    signOut: async () => {},
    restore: async () => SESSION,
    updateProfile: async (user) => user,
    changePlan: async (user, plan) => ({ ...user, plan }),
    requestPasswordReset: async () => {},
    updatePassword: async () => {},
  };
}

function fakeBackend(overrides: Partial<SyncBackend> = {}): SyncBackend {
  return {
    pull: vi.fn(async () => ({ decks: [], cards: [], sessions: [] })),
    pushDecks: vi.fn(async () => {}),
    pushCards: vi.fn(async () => {}),
    pushSessions: vi.fn(async () => {}),
    softDeleteDeck: vi.fn(async () => {}),
    softDeleteCard: vi.fn(async () => {}),
    subscribeToChanges: vi.fn(() => () => {}),
    ...overrides,
  };
}

function makeDeckAndCard(storage = createMemoryStorage()) {
  const authStore = createAuthStore(fakeAuth(), storage);
  authStore.getState().syncFromProvider(SESSION);
  const syncStore = createSyncStore(storage);
  const deckStore = createDeckStore(storage, (ops) => syncStore.getState().enqueue(ops));
  const studyStore = createStudyStore(deckStore, storage, (ops) => syncStore.getState().enqueue(ops));
  return { authStore, deckStore, studyStore, syncStore };
}

function remoteSummary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: 'session_remote',
    deckId: 'deck_1',
    deckTitle: 'Deck',
    mode: 'cram',
    answered: 4,
    correct: 3,
    accuracy: 0.75,
    finalScore: 300,
    xp: 40,
    letter: 'B',
    maxStreak: 2,
    durationMs: 60_000,
    endedAt: '2026-02-01T00:00:00.000Z',
    ...overrides,
  };
}

/** Plays a one-card run to completion — the thing that appends to `history`. */
function completeRun(studyStore: StudyStore, deck: Deck): void {
  const cards = [makeCard({ deckId: deck.id })];
  const session = studyStore
    .getState()
    .startSession(deck, cards, { ...createDefaultStudySettings(), shuffle: 'none' });
  studyStore.getState().answer({
    cardId: session.queue[0]!,
    grade: 'good',
    correct: true,
    timeMs: 1000,
    usedHint: false,
    timedOut: false,
  });
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('SyncEngine', () => {
  it('pulls the initial snapshot once a session becomes authenticated', async () => {
    const { authStore, deckStore, studyStore, syncStore } = makeDeckAndCard();
    const backend = fakeBackend({
      pull: vi.fn(async () => ({
        decks: [
          {
            id: 'deck_remote',
            updatedAt: '2024-01-02T00:00:00.000Z',
            deletedAt: null,
            data: { id: 'deck_remote', title: 'Remote deck' } as unknown as Deck,
          },
        ],
        cards: [],
        sessions: [],
      })),
    });
    const engine = new SyncEngine({
      authStore,
      deckStore,
      studyStore,
      syncStore,
      backend,
      flushIntervalMs: 10 ** 9,
    });
    engine.start();
    await settle();

    expect(backend.pull).toHaveBeenCalled();
    // Store keeps only real Deck objects; the fake data carries just an id+title
    // but applyRemoteDeck still inserts it, proving the remote row was applied.
    expect(deckStore.getState().decks.some((d) => d.id === 'deck_remote')).toBe(true);
    engine.stop();
  });

  it('collapses N rapid reviewCard calls into a single push carrying the final review state', async () => {
    const storage = createMemoryStorage();
    const { authStore, deckStore, studyStore, syncStore } = makeDeckAndCard(storage);
    const backend = fakeBackend();
    const engine = new SyncEngine({
      authStore,
      deckStore,
      studyStore,
      syncStore,
      backend,
      flushIntervalMs: 10 ** 9,
    });
    engine.start();
    await settle();

    const deck = deckStore.getState().createBlankDeck('user-1', 'Study');
    deckStore.getState().addCard(deck.id, { ...createEmptyDraft(), front: 'q', back: 'a' });
    const cardId = deckStore.getState().getCards(deck.id)![0]!.id;

    for (let i = 0; i < 5; i += 1) {
      deckStore.getState().reviewCard(deck.id, cardId, false);
    }

    await engine.syncNow();

    expect(backend.pushCards).toHaveBeenCalledTimes(1);
    const pushed = (backend.pushCards as ReturnType<typeof vi.fn>).mock.calls[0]![1] as Flashcard[];
    expect(pushed).toHaveLength(1);
    const card = pushed[0]!;
    expect(card.id).toBe(cardId);
    // Fresh read at flush time, not a snapshot from the first review.
    expect(card.timesSeen).toBe(5);
    expect(backend.pushDecks).toHaveBeenCalledTimes(1);
    engine.stop();
  });

  it('pushes a finished run so the account keeps the streak and XP', async () => {
    const storage = createMemoryStorage();
    const { authStore, deckStore, studyStore, syncStore } = makeDeckAndCard(storage);
    const backend = fakeBackend();
    const engine = new SyncEngine({
      authStore,
      deckStore,
      studyStore,
      syncStore,
      backend,
      flushIntervalMs: 10 ** 9,
    });
    engine.start();
    await settle();

    const deck = deckStore.getState().createBlankDeck('user-1', 'Study');
    completeRun(studyStore, deck);

    await engine.syncNow();

    expect(backend.pushSessions).toHaveBeenCalledTimes(1);
    const pushed = (backend.pushSessions as ReturnType<typeof vi.fn>).mock.calls[0]![1] as SessionSummary[];
    expect(pushed.map((s) => s.id)).toEqual([studyStore.getState().history[0]!.id]);
    expect(syncStore.getState().pendingOps).toEqual({});
    engine.stop();
  });

  it('files a run pulled from another device into local history', async () => {
    const storage = createMemoryStorage();
    const { authStore, deckStore, studyStore, syncStore } = makeDeckAndCard(storage);
    const backend = fakeBackend({
      pull: vi.fn(async () => ({
        decks: [],
        cards: [],
        sessions: [
          {
            id: 'session_remote',
            updatedAt: '2026-02-01T00:00:00.000Z',
            deletedAt: null,
            data: remoteSummary(),
          },
        ],
      })),
    });
    const engine = new SyncEngine({
      authStore,
      deckStore,
      studyStore,
      syncStore,
      backend,
      flushIntervalMs: 10 ** 9,
    });
    engine.start();
    await settle();

    expect(studyStore.getState().history.map((s) => s.id)).toEqual(['session_remote']);
    engine.stop();
  });

  it('does not re-file a pulled run it pushed itself, which would double its XP', async () => {
    const storage = createMemoryStorage();
    const { authStore, deckStore, studyStore, syncStore } = makeDeckAndCard(storage);
    const backend = fakeBackend({
      // Echo back whatever was pushed, which is what a real pull does on the
      // pass right after a flush.
      pull: vi.fn(async () => ({
        decks: [],
        cards: [],
        sessions: studyStore.getState().history.map((s) => ({
          id: s.id,
          updatedAt: nowIso(),
          deletedAt: null,
          data: s,
        })),
      })),
    });
    const engine = new SyncEngine({
      authStore,
      deckStore,
      studyStore,
      syncStore,
      backend,
      flushIntervalMs: 10 ** 9,
    });
    engine.start();
    await settle();

    const deck = deckStore.getState().createBlankDeck('user-1', 'Study');
    completeRun(studyStore, deck);
    await engine.syncNow();
    await engine.syncNow();

    expect(studyStore.getState().history).toHaveLength(1);
    engine.stop();
  });

  it('clears local deck + sync state on sign-out so a second account starts clean', async () => {
    const storage = createMemoryStorage();
    const { authStore, deckStore, studyStore, syncStore } = makeDeckAndCard(storage);
    const backend = fakeBackend();
    const engine = new SyncEngine({
      authStore,
      deckStore,
      studyStore,
      syncStore,
      backend,
      flushIntervalMs: 10 ** 9,
    });
    engine.start();
    await settle();

    const deck = deckStore.getState().createBlankDeck('user-1', 'Only for Ada');
    completeRun(studyStore, deck);
    expect(deckStore.getState().decks.length).toBe(1);
    expect(studyStore.getState().history.length).toBe(1);

    await authStore.getState().signOut();

    expect(deckStore.getState().decks).toEqual([]);
    expect(studyStore.getState().history).toEqual([]);
    expect(syncStore.getState().pendingOps).toEqual({});
    engine.stop();
  });

  it('clears the first account when the session switches straight to another one', async () => {
    const storage = createMemoryStorage();
    const { authStore, deckStore, studyStore, syncStore } = makeDeckAndCard(storage);
    const backend = fakeBackend();
    const engine = new SyncEngine({
      authStore,
      deckStore,
      studyStore,
      syncStore,
      backend,
      flushIntervalMs: 10 ** 9,
    });
    engine.start();
    await settle();

    const deck = deckStore.getState().createBlankDeck('user-1', 'Only for Ada');
    completeRun(studyStore, deck);

    // No signed-out state in between — what `syncFromProvider` does when
    // Supabase hands over a session for a different user.
    authStore.getState().syncFromProvider({
      ...SESSION,
      user: { ...SESSION.user, id: 'user-2', username: 'grace' },
    });
    await settle();

    expect(deckStore.getState().decks).toEqual([]);
    expect(studyStore.getState().history).toEqual([]);
    expect(syncStore.getState().pendingOps).toEqual({});
    engine.stop();
  });

  it('removes a local deck when a pull reports a remote tombstone for it', async () => {
    const storage = createMemoryStorage();
    const { authStore, deckStore, studyStore, syncStore } = makeDeckAndCard(storage);
    const deck = deckStore.getState().createBlankDeck('user-1', 'Doomed');
    const tombstoneAt = nowIso();
    const backend = fakeBackend({
      pull: vi.fn(async () => ({
        decks: [
          { id: deck.id, updatedAt: tombstoneAt, deletedAt: tombstoneAt, data: deck },
        ],
        cards: [],
        sessions: [],
      })),
    });
    const engine = new SyncEngine({
      authStore,
      deckStore,
      studyStore,
      syncStore,
      backend,
      flushIntervalMs: 10 ** 9,
    });
    engine.start();
    await settle();

    await engine.syncNow();
    expect(deckStore.getState().decks.some((d) => d.id === deck.id)).toBe(false);
    engine.stop();
  });

  it('does not push a tombstoned card, but processes a deck tombstone the local side never had as a no-op', async () => {
    const storage = createMemoryStorage();
    const { authStore, deckStore, studyStore, syncStore } = makeDeckAndCard(storage);
    const deck = deckStore.getState().createBlankDeck('user-1', 'Base');
    const backend = fakeBackend({
      pull: vi.fn(async () => ({
        decks: [],
        cards: [
          {
            id: 'card_unknown',
            deckId: deck.id,
            updatedAt: nowIso(),
            deletedAt: nowIso(),
            data: { id: 'card_unknown', deckId: deck.id } as unknown as Flashcard,
          },
        ],
        sessions: [],
      })),
    });
    const engine = new SyncEngine({
      authStore,
      deckStore,
      studyStore,
      syncStore,
      backend,
      flushIntervalMs: 10 ** 9,
    });
    engine.start();
    await settle();
    await engine.syncNow();

    expect(deckStore.getState().getCards(deck.id).length).toBe(0);
    engine.stop();
  });

  /**
   * A pull used to call one `set()` per row, so a first sync of a few hundred
   * cards notified every subscriber that many times in a tight loop. Each
   * notification forces `useSyncExternalStore` into a synchronous re-render,
   * and past ~50 of them React aborts the tree with "Maximum update depth
   * exceeded" — the whole pull has to land as one update.
   */
  it('applies a whole pull as a single store update rather than one per row', async () => {
    const storage = createMemoryStorage();
    const { authStore, deckStore, studyStore, syncStore } = makeDeckAndCard(storage);
    const deck = deckStore.getState().createBlankDeck('user-1', 'Big');
    const remoteCards = Array.from({ length: 100 }, (_, i) =>
      makeCard({ id: `card_pulled_${i}`, deckId: deck.id }),
    );
    const backend = fakeBackend({
      pull: vi.fn(async () => ({
        decks: [],
        cards: remoteCards.map((card) => ({
          id: card.id,
          deckId: deck.id,
          updatedAt: nowIso(),
          deletedAt: null,
          data: card,
        })),
        sessions: [],
      })),
    });
    const engine = new SyncEngine({
      authStore,
      deckStore,
      studyStore,
      syncStore,
      backend,
      flushIntervalMs: 10 ** 9,
    });
    engine.start();
    await settle();

    let notifications = 0;
    const unsubscribe = deckStore.subscribe(() => {
      notifications += 1;
    });
    await engine.syncNow();
    unsubscribe();

    expect(deckStore.getState().getCards(deck.id)).toHaveLength(100);
    expect(notifications).toBe(1);
    engine.stop();
  });

  it('leaves the outbox intact when a push fails, then re-pushes on the next pass', async () => {
    const storage = createMemoryStorage();
    const { authStore, deckStore, studyStore, syncStore } = makeDeckAndCard(storage);
    let fail = true;
    const backend = fakeBackend({
      pushDecks: vi.fn(async () => {
        if (fail) throw new Error('network down');
      }),
    });
    const engine = new SyncEngine({
      authStore,
      deckStore,
      studyStore,
      syncStore,
      backend,
      flushIntervalMs: 10 ** 9,
    });
    engine.start();
    await settle();

    deckStore.getState().createBlankDeck('user-1', 'Fragile');
    await engine.syncNow();
    expect(syncStore.getState().status).toBe('error');
    expect(Object.keys(syncStore.getState().pendingOps)).not.toHaveLength(0);

    fail = false;
    await engine.syncNow();
    expect(syncStore.getState().pendingOps).toEqual({});
    engine.stop();
  });
});

describe('SyncEngine cursor', () => {
  function engineWith(backend: SyncBackend) {
    const storage = createMemoryStorage();
    const stores = makeDeckAndCard(storage);
    const engine = new SyncEngine({ ...stores, backend, flushIntervalMs: 10 ** 9 });
    return { ...stores, engine };
  }

  function deckRow(updatedAt: string, id = 'deck_remote') {
    return { id, updatedAt, deletedAt: null, data: { id } as unknown as Deck };
  }

  /**
   * The cursor used to be `nowIso()` from this device. A machine running fast
   * wrote one into the future, and every row another device committed before
   * that instant was skipped for good.
   */
  it('advances the cursor to a server timestamp, not the device clock', async () => {
    const newest = '2020-01-01T00:00:00.000Z'; // deliberately long past
    const { syncStore, engine } = engineWith(
      fakeBackend({
        pull: vi.fn(async () => ({ decks: [deckRow(newest)], cards: [], sessions: [] })),
      }),
    );

    engine.start();
    await settle();

    const cursor = syncStore.getState().lastPulledAt as string;
    expect(Date.parse(cursor)).toBeLessThanOrEqual(Date.parse(newest));
    expect(Date.parse(cursor)).toBeLessThan(Date.now());
    engine.stop();
  });

  it('leaves the cursor alone when a pull returns nothing', async () => {
    const { syncStore, engine } = engineWith(fakeBackend());

    engine.start();
    await settle();

    expect(syncStore.getState().lastPulledAt).toBeNull();
    engine.stop();
  });

  it('asks for changes from the cursor the previous pull set', async () => {
    const backend = fakeBackend({
      pull: vi.fn(async () => ({
        decks: [deckRow('2026-03-01T12:00:00.000Z')],
        cards: [],
        sessions: [],
      })),
    });
    const { syncStore, engine } = engineWith(backend);

    engine.start();
    await settle();
    await engine.syncNow();

    const calls = (backend.pull as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0]![1]).toBeNull();
    expect(calls[1]![1]).toBe(syncStore.getState().lastPulledAt);
    engine.stop();
  });

  it('does not rewind the cursor when an older row arrives late', async () => {
    let batch = 0;
    const backend = fakeBackend({
      pull: vi.fn(async () => {
        batch += 1;
        return {
          decks: [
            deckRow(batch === 1 ? '2026-03-01T12:00:00.000Z' : '2020-01-01T00:00:00.000Z', 'deck_a'),
          ],
          cards: [],
          sessions: [],
        };
      }),
    });
    const { syncStore, engine } = engineWith(backend);

    engine.start();
    await settle();
    const afterFirst = syncStore.getState().lastPulledAt;
    await engine.syncNow();

    expect(syncStore.getState().lastPulledAt).toBe(afterFirst);
    engine.stop();
  });
});

describe('SyncEngine.flushPending', () => {
  it('reports success when there was nothing waiting', async () => {
    const storage = createMemoryStorage();
    const stores = makeDeckAndCard(storage);
    const engine = new SyncEngine({ ...stores, backend: fakeBackend(), flushIntervalMs: 10 ** 9 });
    engine.start();
    await settle();

    await expect(engine.flushPending()).resolves.toBe(true);
    engine.stop();
  });

  it('pushes what is queued and reports the outbox empty', async () => {
    const storage = createMemoryStorage();
    const stores = makeDeckAndCard(storage);
    const backend = fakeBackend();
    const engine = new SyncEngine({ ...stores, backend, flushIntervalMs: 10 ** 9 });
    engine.start();
    await settle();

    stores.deckStore.getState().createBlankDeck('user-1', 'Unsaved work');

    await expect(engine.flushPending()).resolves.toBe(true);
    expect(backend.pushDecks).toHaveBeenCalled();
    expect(stores.syncStore.getState().pendingOps).toEqual({});
    engine.stop();
  });

  /**
   * Sign-out wipes local decks, so a push that failed has to be reported —
   * otherwise the work is gone and the server's older copy replaces it.
   */
  it('reports failure and keeps the outbox when the push cannot land', async () => {
    const storage = createMemoryStorage();
    const stores = makeDeckAndCard(storage);
    const backend = fakeBackend({
      pushDecks: vi.fn(async () => {
        throw new Error('offline');
      }),
    });
    const engine = new SyncEngine({ ...stores, backend, flushIntervalMs: 10 ** 9 });
    engine.start();
    await settle();

    stores.deckStore.getState().createBlankDeck('user-1', 'Unsaved work');

    await expect(engine.flushPending()).resolves.toBe(false);
    expect(Object.keys(stores.syncStore.getState().pendingOps)).toHaveLength(1);
    engine.stop();
  });
});
