import type { Deck, Flashcard, Id, IsoDate, RemoteRow } from '../../types';

export interface PulledChanges {
  decks: RemoteRow<Deck>[];
  cards: RemoteRow<Flashcard>[];
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
  softDeleteDeck(id: Id): Promise<void>;
  softDeleteCard(id: Id): Promise<void>;
  /** Returns an unsubscribe function. */
  subscribeToChanges(ownerId: Id, onNotify: () => void): () => void;
}
