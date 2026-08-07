import { describe, expect, it } from 'vitest';
import { createMemoryStorage } from '../../lib/storage';
import { createSyncStore } from '../syncStore';
import type { SyncOp } from '../../types';

function upsertDeck(id: string): SyncOp {
  return { kind: 'deck', id, op: 'upsert' };
}

function deleteDeck(id: string): SyncOp {
  return { kind: 'deck', id, op: 'delete' };
}

describe('createSyncStore', () => {
  it('enqueues a new op', () => {
    const store = createSyncStore(createMemoryStorage());
    store.getState().enqueue([upsertDeck('deck_1')]);
    expect(store.getState().pendingOps).toEqual({ 'deck:deck_1': upsertDeck('deck_1') });
  });

  it('collapses repeated upserts to the same row into a single pending op', () => {
    const store = createSyncStore(createMemoryStorage());
    store.getState().enqueue([upsertDeck('deck_1')]);
    store.getState().enqueue([upsertDeck('deck_1')]);
    store.getState().enqueue([upsertDeck('deck_1')]);
    expect(Object.keys(store.getState().pendingOps)).toEqual(['deck:deck_1']);
  });

  it('lets a later delete replace an earlier pending upsert for the same row', () => {
    const store = createSyncStore(createMemoryStorage());
    store.getState().enqueue([upsertDeck('deck_1')]);
    store.getState().enqueue([deleteDeck('deck_1')]);
    expect(store.getState().pendingOps).toEqual({ 'deck:deck_1': deleteDeck('deck_1') });
  });

  it('dequeues by key after a successful push', () => {
    const store = createSyncStore(createMemoryStorage());
    store.getState().enqueue([upsertDeck('deck_1'), upsertDeck('deck_2')]);
    store.getState().dequeue(['deck:deck_1']);
    expect(Object.keys(store.getState().pendingOps)).toEqual(['deck:deck_2']);
  });

  it('clear resets the outbox and pull cursor', () => {
    const store = createSyncStore(createMemoryStorage());
    store.getState().enqueue([upsertDeck('deck_1')]);
    store.getState().setLastPulledAt('2024-01-01T00:00:00.000Z');
    store.getState().clear();
    expect(store.getState().pendingOps).toEqual({});
    expect(store.getState().lastPulledAt).toBeNull();
  });
});
