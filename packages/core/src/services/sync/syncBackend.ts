import type { Deck, Flashcard, Id, IsoDate, RemoteRow, SessionSummary } from '../../types';

export interface PulledChanges {
  decks: RemoteRow<Deck>[];
  cards: RemoteRow<Flashcard>[];
  /** Always tombstone-free — study history is append-only. */
  sessions: RemoteRow<SessionSummary>[];
}

/**
 * The remote half of sync. `pull` must return tombstoned rows within the
 * window too (not filter them out) so a device that missed a delete can
 * still remove its local copy — see `resolveMerge`.
 */
export interface SyncBackend {
  pull(ownerId: Id, since: IsoDate | null): Promise<PulledChanges>;
  pushDecks(ownerId: Id, decks: Deck[]): Promise<void>;
  pushCards(ownerId: Id, cards: Flashcard[]): Promise<void>;
  /**
   * Finished runs, which are immutable — re-pushing one that already landed
   * must be a no-op rather than an error or a timestamp bump, so a retry after
   * a half-failed flush is safe.
   */
  pushSessions(ownerId: Id, sessions: SessionSummary[]): Promise<void>;
  softDeleteDeck(id: Id): Promise<void>;
  softDeleteCard(id: Id): Promise<void>;
  /** Returns an unsubscribe function. */
  subscribeToChanges(ownerId: Id, onNotify: () => void): () => void;
}
