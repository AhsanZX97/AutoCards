import { nowIso } from '../../lib/date';
import type { AuthStore } from '../../store/authStore';
import type { DeckStore } from '../../store/deckStore';
import { syncOpKey, type SyncStore } from '../../store/syncStore';
import type { Deck, Flashcard, Id, IsoDate, RemoteRow } from '../../types';
import { resolveMerge } from './mergePolicy';
import type { SyncBackend } from './syncBackend';

export interface SyncEngineOptions {
  authStore: AuthStore;
  deckStore: DeckStore;
  syncStore: SyncStore;
  backend: SyncBackend;
  /** Flush + pull cadence in ms. Defaults to 10s. */
  flushIntervalMs?: number;
}

/**
 * Local-first background sync. Watches `authStore`; once a session is active
 * it pulls the initial snapshot, then keeps a periodic flush+pull timer and a
 * realtime subscription running. On sign-out it tears everything down and
 * clears local deck/sync state so a second account never inherits the first.
 */
export class SyncEngine {
  private readonly flushIntervalMs: number;
  private readonly backend: SyncBackend;
  private readonly authStore: AuthStore;
  private readonly deckStore: DeckStore;
  private readonly syncStore: SyncStore;

  private unsubscribeAuth: () => void = () => {};
  private unsubscribeRealtime: () => void = () => {};
  private timer: ReturnType<typeof setInterval> | null = null;
  private ownerId: Id | null = null;
  private syncing = false;

  constructor(options: SyncEngineOptions) {
    this.flushIntervalMs = options.flushIntervalMs ?? 10_000;
    this.backend = options.backend;
    this.authStore = options.authStore;
    this.deckStore = options.deckStore;
    this.syncStore = options.syncStore;
  }

  start(): void {
    this.unsubscribeAuth = this.authStore.subscribe((state) =>
      this.onAuthState(state.status, state.session?.user.id ?? null),
    );
    const current = this.authStore.getState();
    this.onAuthState(current.status, current.session?.user.id ?? null);
  }

  stop(): void {
    this.unsubscribeAuth();
    this.teardown();
    this.ownerId = null;
  }

  /** Runs a single push-then-pull pass. Awaitable so tests (and any caller
   *  that wants an immediate, known-flushed state) can wait for completion. */
  async syncNow(): Promise<void> {
    await this.sync();
  }

  private onAuthState(status: string, userId: Id | null): void {
    if (status === 'authenticated' && userId) {
      if (this.ownerId === userId) return;
      this.startSync(userId);
      return;
    }
    // Any non-authenticated state for a session we were syncing is a sign-out.
    if (this.ownerId !== null) {
      this.teardown();
      this.deckStore.getState().clear();
      this.syncStore.getState().clear();
      this.ownerId = null;
    }
  }

  private startSync(ownerId: Id): void {
    this.ownerId = ownerId;
    void this.sync();
    this.unsubscribeRealtime = this.backend.subscribeToChanges(ownerId, () => void this.sync());
    this.timer = setInterval(() => void this.sync(), this.flushIntervalMs);
  }

  private teardown(): void {
    this.unsubscribeRealtime();
    this.unsubscribeRealtime = () => {};
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** One pass: push the outbox, then pull remote changes and merge them in. */
  private async sync(): Promise<void> {
    if (this.syncing || !this.ownerId) return;
    this.syncing = true;
    try {
      // Push reads fresh store state per op rather than a snapshot taken at
      // enqueue time, so N rapid `reviewCard` calls collapse into one push
      // carrying the final SRS state (see `syncStore.enqueue`).
      await this.flush(this.ownerId);
      await this.pull(this.ownerId);
    } finally {
      this.syncing = false;
    }
  }

  private async flush(ownerId: Id): Promise<void> {
    const captured = Object.values(this.syncStore.getState().pendingOps);
    if (captured.length === 0) return;

    const deckState = this.deckStore.getState();
    const deckUpserts: Deck[] = [];
    const cardUpserts: Flashcard[] = [];
    const deckDeletes: Id[] = [];
    const cardDeletes: Id[] = [];

    for (const op of captured) {
      if (op.kind === 'deck') {
        if (op.op === 'delete') {
          deckDeletes.push(op.id);
        } else {
          const deck = deckState.decks.find((d) => d.id === op.id);
          if (deck) deckUpserts.push(deck);
        }
      } else if (op.op === 'delete') {
        cardDeletes.push(op.id);
      } else {
        const card = (deckState.cardsByDeck[op.deckId ?? ''] ?? []).find((c) => c.id === op.id);
        if (card) cardUpserts.push(card);
      }
    }

    try {
      if (deckUpserts.length) await this.backend.pushDecks(ownerId, deckUpserts);
      if (cardUpserts.length) await this.backend.pushCards(ownerId, cardUpserts);
      for (const id of deckDeletes) await this.backend.softDeleteDeck(id);
      for (const id of cardDeletes) await this.backend.softDeleteCard(id);

      // Dequeue only ops still exactly equal to what we captured — one that
      // was re-enqueued mid-push (a review landing during the await) must stay
      // so the next pass re-pushes its newer state.
      const current = this.syncStore.getState().pendingOps;
      const stillPending = captured.filter((op) => current[syncOpKey(op)] === op);
      this.syncStore.getState().dequeue(stillPending.map((op) => syncOpKey(op)));
      this.syncStore.getState().setStatus('idle');
    } catch (err) {
      this.syncStore.getState().setStatus('error', err instanceof Error ? err.message : 'Sync failed.');
    }
  }

  private async pull(ownerId: Id): Promise<void> {
    const since = this.syncStore.getState().lastPulledAt;
    // Capture the cursor *before* the round trip so rows written while this
    // pull is in flight aren't silently skipped; the realtime subscription
    // would catch them anyway, but this removes the window.
    const cursorAt: IsoDate = nowIso();
    try {
      const changes = await this.backend.pull(ownerId, since);

      const decks = new Map<string, IsoDate>(this.deckStore.getState().decks.map((d) => [d.id, d.updatedAt]));
      for (const row of changes.decks) {
        const localAt = decks.get(row.id);
        const action = resolveMerge(localAt ? { updatedAt: localAt } : undefined, row);
        if (action.type === 'upsert') this.deckStore.getState().applyRemoteDeck(row.data);
        else if (action.type === 'remove') this.deckStore.getState().applyRemoteDeleteDeck(row.id);
      }

      const cards = new Map<string, IsoDate>();
      for (const list of Object.values(this.deckStore.getState().cardsByDeck)) {
        for (const c of list) cards.set(c.id, c.updatedAt);
      }
      for (const row of changes.cards) {
        const localAt = cards.get(row.id);
        const action = resolveMerge(localAt ? { updatedAt: localAt } : undefined, row);
        if (action.type === 'upsert') this.deckStore.getState().applyRemoteCard(row.data);
        else if (action.type === 'remove') this.deckStore.getState().applyRemoteDeleteCard(row.data.deckId, row.id);
      }

      this.syncStore.getState().setLastPulledAt(cursorAt);
    } catch (err) {
      this.syncStore.getState().setStatus('error', err instanceof Error ? err.message : 'Sync failed.');
    }
  }
}
