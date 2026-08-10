import { describe, expect, it, vi } from 'vitest';
import { createMemoryStorage, STORAGE_KEYS, type StorageAdapter } from '../../lib/storage';
import { createSession, recordAnswer } from '../../domain';
import { createDeckStore } from '../deckStore';
import { createStudyStore, type StudyStore } from '../studyStore';
import { makeCard } from '../../domain/__tests__/testHelpers';
import { createDefaultStudySettings } from '../../domain';
import type { Deck, SessionSummary, StudySession, SyncOp } from '../../types';

const DECK = { id: 'deck_1', title: 'Deck' } as Deck;

/** A session with one answer in it, still marked active — what a reload leaves behind. */
function sessionInProgress(): StudySession {
  const cards = [makeCard(), makeCard()];
  const session = createSession(DECK, cards, { ...createDefaultStudySettings(), shuffle: 'none' });
  return recordAnswer(
    session,
    { cardId: session.queue[0]!, grade: 'good', correct: true, timeMs: 1200, usedHint: false, timedOut: false },
    new Map(cards.map((card) => [card.id, card])),
  );
}

async function storageWith(session: StudySession | null): Promise<StorageAdapter> {
  const storage = createMemoryStorage();
  await storage.setItem(
    STORAGE_KEYS.sessions,
    JSON.stringify({ state: { history: [], activeSession: session }, version: 1 }),
  );
  return storage;
}

async function hydrate(storage: StorageAdapter, onChange: (ops: SyncOp[]) => void = () => {}) {
  const store = createStudyStore(createDeckStore(createMemoryStorage()), storage, onChange);
  await store.persist.rehydrate();
  return store;
}

function summary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: 'session_1',
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

/** Plays a one-card deck through to completion, which is what appends to `history`. */
function completeRun(store: StudyStore): void {
  const cards = [makeCard({ deckId: DECK.id })];
  const settings = { ...createDefaultStudySettings(), shuffle: 'none' as const };
  const session = store.getState().startSession(DECK, cards, settings);
  store.getState().answer({
    cardId: session.queue[0]!,
    grade: 'good',
    correct: true,
    timeMs: 1000,
    usedHint: false,
    timedOut: false,
  });
}

describe('a session left active by a reload', () => {
  it('is never restored as something to carry on with', async () => {
    const store = await hydrate(await storageWith(sessionInProgress()));
    expect(store.getState().activeSession).toBeNull();
  });

  it('is recorded in history so the stats match the mastery already written', async () => {
    const store = await hydrate(await storageWith(sessionInProgress()));
    const history = store.getState().history;

    expect(history).toHaveLength(1);
    expect(history[0]?.deckId).toBe('deck_1');
    expect(history[0]?.answered).toBe(1);
  });

  it('does not record a run that was never answered', async () => {
    const cards = [makeCard()];
    const untouched = createSession(DECK, cards, createDefaultStudySettings());
    const store = await hydrate(await storageWith(untouched));

    expect(store.getState().history).toEqual([]);
    expect(store.getState().activeSession).toBeNull();
  });

  it('leaves an ordinary load with no session alone', async () => {
    const store = await hydrate(await storageWith(null));
    expect(store.getState().activeSession).toBeNull();
    expect(store.getState().history).toEqual([]);
  });

  it('enqueues the recovered run so it still reaches the account', async () => {
    const onChange = vi.fn();
    const store = await hydrate(await storageWith(sessionInProgress()), onChange);
    const recovered = store.getState().history[0]!;

    expect(onChange).toHaveBeenCalledWith([{ kind: 'session', id: recovered.id, op: 'upsert' }]);
  });
});

describe('study history as account state', () => {
  it('enqueues a sync op when a run is completed', async () => {
    const onChange = vi.fn();
    const store = await hydrate(createMemoryStorage(), onChange);

    completeRun(store);

    const recorded = store.getState().history[0]!;
    expect(onChange).toHaveBeenCalledWith([{ kind: 'session', id: recorded.id, op: 'upsert' }]);
  });

  it('enqueues a sync op when a run is abandoned part-way', async () => {
    const onChange = vi.fn();
    const store = await hydrate(createMemoryStorage(), onChange);
    const cards = [makeCard({ deckId: DECK.id }), makeCard({ deckId: DECK.id })];
    const session = store
      .getState()
      .startSession(DECK, cards, { ...createDefaultStudySettings(), shuffle: 'none' });
    store.getState().answer({
      cardId: session.queue[0]!,
      grade: 'good',
      correct: true,
      timeMs: 1000,
      usedHint: false,
      timedOut: false,
    });
    onChange.mockClear();

    store.getState().pauseAndAbandon();

    const abandoned = store.getState().history[0]!;
    expect(onChange).toHaveBeenCalledWith([{ kind: 'session', id: abandoned.id, op: 'upsert' }]);
  });

  it('files a run from another device into history', async () => {
    const store = await hydrate(createMemoryStorage());

    store.getState().applyRemoteSession(summary({ id: 'session_remote' }));

    expect(store.getState().history.map((s) => s.id)).toEqual(['session_remote']);
  });

  it('keeps history newest-first when a remote run predates a local one', async () => {
    const store = await hydrate(createMemoryStorage());

    store.getState().applyRemoteSession(summary({ id: 'older', endedAt: '2026-01-01T00:00:00.000Z' }));
    store.getState().applyRemoteSession(summary({ id: 'newer', endedAt: '2026-03-01T00:00:00.000Z' }));

    expect(store.getState().history.map((s) => s.id)).toEqual(['newer', 'older']);
  });

  it('ignores a run it already has, so a push-then-pull cannot double the XP', async () => {
    const onChange = vi.fn();
    const store = await hydrate(createMemoryStorage(), onChange);
    completeRun(store);
    const recorded = store.getState().history[0]!;

    store.getState().applyRemoteSession(recorded);

    expect(store.getState().history).toHaveLength(1);
  });

  it('does not enqueue a run that arrived from the server', async () => {
    const onChange = vi.fn();
    const store = await hydrate(createMemoryStorage(), onChange);

    store.getState().applyRemoteSession(summary());

    expect(onChange).not.toHaveBeenCalled();
  });

  it('drops ownerless v0 history rather than adopting it for whoever signs in', async () => {
    const storage = createMemoryStorage();
    await storage.setItem(
      STORAGE_KEYS.sessions,
      JSON.stringify({ state: { history: [summary()], activeSession: null }, version: 0 }),
    );
    const onChange = vi.fn();

    const store = await hydrate(storage, onChange);

    expect(store.getState().history).toEqual([]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('empties history on clear, so a second account starts from zero', async () => {
    const store = await hydrate(createMemoryStorage());
    completeRun(store);
    expect(store.getState().history).toHaveLength(1);

    store.getState().clear();

    expect(store.getState().history).toEqual([]);
    expect(store.getState().activeSession).toBeNull();
  });
});
