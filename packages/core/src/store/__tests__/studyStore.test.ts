import { describe, expect, it } from 'vitest';
import { createMemoryStorage, STORAGE_KEYS, type StorageAdapter } from '../../lib/storage';
import { createSession, recordAnswer } from '../../domain';
import { createDeckStore } from '../deckStore';
import { createStudyStore } from '../studyStore';
import { makeCard } from '../../domain/__tests__/testHelpers';
import { createDefaultStudySettings } from '../../domain';
import type { Deck, StudySession } from '../../types';

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
    JSON.stringify({ state: { history: [], activeSession: session }, version: 0 }),
  );
  return storage;
}

async function hydrate(storage: StorageAdapter) {
  const store = createStudyStore(createDeckStore(createMemoryStorage()), storage);
  await store.persist.rehydrate();
  return store;
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
});
