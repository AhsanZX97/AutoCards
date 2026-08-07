import type { Id, IsoDate } from './common';

export type SyncEntityKind = 'deck' | 'card';

export interface SyncOp {
  kind: SyncEntityKind;
  id: Id;
  op: 'upsert' | 'delete';
  /** Card ops only — the parent deck id. */
  deckId?: Id;
}

/** A row as returned from a pull, before being unwrapped into a Deck/Flashcard. */
export interface RemoteRow<T> {
  id: Id;
  updatedAt: IsoDate;
  deletedAt: IsoDate | null;
  data: T;
}
