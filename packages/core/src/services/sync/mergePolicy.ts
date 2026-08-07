import type { IsoDate, RemoteRow } from '../../types';

export type MergeAction<T> =
  | { type: 'upsert'; value: T }
  | { type: 'remove' }
  | { type: 'noop' };

/**
 * Last-write-wins merge of one remote row against the local copy, if any.
 * Tombstone-aware: a deleted remote row removes a local row that still has
 * it, but is a no-op if the local side never had it in the first place —
 * this is also how a deck's cascade-deleted cards (tombstoned server-side by
 * `cards_respect_deck_tombstone`) get cleared out of `cardsByDeck` on pull.
 */
export function resolveMerge<T>(
  local: { updatedAt: IsoDate } | undefined,
  remote: RemoteRow<T>,
): MergeAction<T> {
  if (remote.deletedAt) {
    return local ? { type: 'remove' } : { type: 'noop' };
  }
  if (!local) return { type: 'upsert', value: remote.data };
  return new Date(remote.updatedAt).getTime() > new Date(local.updatedAt).getTime()
    ? { type: 'upsert', value: remote.data }
    : { type: 'noop' };
}
