import { describe, expect, it } from 'vitest';
import { resolveMerge } from '../mergePolicy';
import type { RemoteRow } from '../../../types';

function row(overrides: Partial<RemoteRow<{ title: string }>> = {}): RemoteRow<{ title: string }> {
  return {
    id: 'deck_1',
    updatedAt: '2024-01-02T00:00:00.000Z',
    deletedAt: null,
    data: { title: 'remote title' },
    ...overrides,
  };
}

describe('resolveMerge', () => {
  it('upserts when there is no local copy yet', () => {
    const action = resolveMerge(undefined, row());
    expect(action).toEqual({ type: 'upsert', value: { title: 'remote title' } });
  });

  it('upserts when the remote row is newer than the local copy', () => {
    const local = { updatedAt: '2024-01-01T00:00:00.000Z' };
    const action = resolveMerge(local, row({ updatedAt: '2024-01-02T00:00:00.000Z' }));
    expect(action.type).toBe('upsert');
  });

  it('keeps the local copy when it is newer than the remote row', () => {
    const local = { updatedAt: '2024-01-03T00:00:00.000Z' };
    const action = resolveMerge(local, row({ updatedAt: '2024-01-02T00:00:00.000Z' }));
    expect(action).toEqual({ type: 'noop' });
  });

  it('keeps the local copy on a timestamp tie, so a pending local push still wins later', () => {
    const local = { updatedAt: '2024-01-02T00:00:00.000Z' };
    const action = resolveMerge(local, row({ updatedAt: '2024-01-02T00:00:00.000Z' }));
    expect(action).toEqual({ type: 'noop' });
  });

  it('removes a local row when the remote copy has been tombstoned', () => {
    const local = { updatedAt: '2024-01-01T00:00:00.000Z' };
    const action = resolveMerge(local, row({ deletedAt: '2024-01-05T00:00:00.000Z' }));
    expect(action).toEqual({ type: 'remove' });
  });

  it('does nothing for a tombstoned row the local side never had — e.g. a card cascade-deleted with its deck before this device ever pulled it', () => {
    const action = resolveMerge(undefined, row({ deletedAt: '2024-01-05T00:00:00.000Z' }));
    expect(action).toEqual({ type: 'noop' });
  });
});
