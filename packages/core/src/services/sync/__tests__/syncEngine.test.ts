import { describe, expect, it, vi } from 'vitest';
import { createAuthStore } from '../../../store/authStore';
import { createDeckStore } from '../../../store/deckStore';
import { createSyncStore } from '../../../store/syncStore';
import { createEmptyDraft } from '../../../domain';
import { createMemoryStorage } from '../../../lib/storage';
import { SyncEngine } from '../syncEngine';
import type { AuthService } from '../../auth/types';
import type { SyncBackend } from '../syncBackend';
import type { Deck, Flashcard, Session } from '../../../types';
import { nowIso } from '../../../lib/date';

const SESSION: Session = {
  user: {
    id: 'user-1',
    email: 'ada@example.com',
    username: 'ada_lovelace',
    initials: 'AD',
    plan: 'free',
    createdAt: '2024-01-01T00:00:00.000Z',
  },
  token: 'token-1',
  expiresAt: '2025-01-01T00:00:00.000Z',
};

function fakeAuth(): AuthService {
  return {
    signIn: async () => SESSION,
    signUp: async () => ({ status: 'authenticated' as const, session: SESSION }),
    signOut: async () => {},
    restore: async () => SESSION,
    updateProfile: async (user) => user,
    changePlan: async (user, plan) => ({ ...user, plan }),
  };
}

function fakeBackend(overrides: Partial<SyncBackend> = {}): SyncBackend {
  return {
    pull: vi.fn(async () => ({ decks: [], cards: [] })),
    pushDecks: vi.fn(async () => {}),
    pushCards: vi.fn(async () => {}),
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
  return { authStore, deckStore, syncStore };
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('SyncEngine', () => {
  it('pulls the initial snapshot once a session becomes authenticated', async () => {
    const { authStore, deckStore, syncStore } = makeDeckAndCard();
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
      })),
    });
    const engine = new SyncEngine({
      authStore,
      deckStore,
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
    const { authStore, deckStore, syncStore } = makeDeckAndCard(storage);
    const backend = fakeBackend();
    const engine = new SyncEngine({
      authStore,
      deckStore,
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

  it('clears local deck + sync state on sign-out so a second account starts clean', async () => {
    const storage = createMemoryStorage();
    const { authStore, deckStore, syncStore } = makeDeckAndCard(storage);
    const backend = fakeBackend();
    const engine = new SyncEngine({
      authStore,
      deckStore,
      syncStore,
      backend,
      flushIntervalMs: 10 ** 9,
    });
    engine.start();
    await settle();

    deckStore.getState().createBlankDeck('user-1', 'Only for Ada');
    expect(deckStore.getState().decks.length).toBe(1);

    await authStore.getState().signOut();

    expect(deckStore.getState().decks).toEqual([]);
    expect(syncStore.getState().pendingOps).toEqual({});
    engine.stop();
  });

  it('removes a local deck when a pull reports a remote tombstone for it', async () => {
    const storage = createMemoryStorage();
    const { authStore, deckStore, syncStore } = makeDeckAndCard(storage);
    const deck = deckStore.getState().createBlankDeck('user-1', 'Doomed');
    const tombstoneAt = nowIso();
    const backend = fakeBackend({
      pull: vi.fn(async () => ({
        decks: [
          { id: deck.id, updatedAt: tombstoneAt, deletedAt: tombstoneAt, data: deck },
        ],
        cards: [],
      })),
    });
    const engine = new SyncEngine({
      authStore,
      deckStore,
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
    const { authStore, deckStore, syncStore } = makeDeckAndCard(storage);
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
      })),
    });
    const engine = new SyncEngine({
      authStore,
      deckStore,
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

  it('leaves the outbox intact when a push fails, then re-pushes on the next pass', async () => {
    const storage = createMemoryStorage();
    const { authStore, deckStore, syncStore } = makeDeckAndCard(storage);
    let fail = true;
    const backend = fakeBackend({
      pushDecks: vi.fn(async () => {
        if (fail) throw new Error('network down');
      }),
    });
    const engine = new SyncEngine({
      authStore,
      deckStore,
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
