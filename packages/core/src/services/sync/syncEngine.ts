import type { AuthStore } from '../../store/authStore';
import type { DeckStore, RemoteChanges } from '../../store/deckStore';
import type { StudyStore } from '../../store/studyStore';
import { syncOpKey, type SyncStore } from '../../store/syncStore';
import type { Deck, Flashcard, Id, IsoDate, SessionSummary } from '../../types';
import { nextCursor } from './cursor';
import { resolveMerge } from './mergePolicy';
import type { SyncBackend } from './syncBackend';

export interface SyncEngineOptions {
  authStore: AuthStore;
  deckStore: DeckStore;
  studyStore: StudyStore;
  syncStore: SyncStore;
  backend: SyncBackend;
  /** Flush + pull cadence in ms. Defaults to 10s. */
  flushIntervalMs?: number;
}

/**
 * Local-first background sync. Watches `authStore`; once a session is active
 * it pulls the initial snapshot, then keeps a periodic flush+pull timer and a
 * realtime subscription running. When the account it was syncing goes away —
 * sign-out, or a straight switch to another user — it tears everything down
 * and wipes local deck/history/sync state so the next account never inherits
 * the previous one's decks, streak or XP.
 */
export class SyncEngine {
  private readonly flushIntervalMs: number;
  private readonly backend: SyncBackend;
  private readonly authStore: AuthStore;
  private readonly deckStore: DeckStore;
  private readonly studyStore: StudyStore;
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
    this.studyStore = options.studyStore;
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

  /**
   * Pushes whatever is waiting and reports whether the outbox came out empty.
   *
   * Called before sign-out, which is the one moment local state is about to be
   * thrown away: anything still queued at that point would be lost outright,
   * and the server's older copy would come back in its place next time the
   * account signed in.
   *
   * False means something is still queued — offline, or the push failed — and
   * the caller has to decide whether losing it is acceptable.
   */
  async flushPending(): Promise<boolean> {
    if (Object.keys(this.syncStore.getState().pendingOps).length === 0) return true;
    if (!this.ownerId) return false;

    await this.flush(this.ownerId);
    return Object.keys(this.syncStore.getState().pendingOps).length === 0;
  }

  private onAuthState(status: string, userId: Id | null): void {
    if (status === 'authenticated' && userId) {
      if (this.ownerId === userId) return;
      // A different account without a signed-out state in between — which is
      // what `syncFromProvider` produces when Supabase hands over a session
      // for another user. The previous owner's local state has to go before
      // this one's pull lands on top of it.
      if (this.ownerId !== null) this.wipeLocalState();
      this.startSync(userId);
      return;
    }
    // Any non-authenticated state for a session we were syncing is a sign-out.
    if (this.ownerId !== null) {
      this.wipeLocalState();
    }
  }

  /** Everything local that belongs to the account being left behind. */
  private wipeLocalState(): void {
    this.teardown();
    this.deckStore.getState().clear();
    this.studyStore.getState().clear();
    this.syncStore.getState().clear();
    this.ownerId = null;
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
    const history = this.studyStore.getState().history;
    const deckUpserts: Deck[] = [];
    const cardUpserts: Flashcard[] = [];
    const sessionUpserts: SessionSummary[] = [];
    const deckDeletes: Id[] = [];
    const cardDeletes: Id[] = [];

    for (const op of captured) {
      if (op.kind === 'session') {
        // Append-only: there is no delete op for a finished run.
        const summary = history.find((s) => s.id === op.id);
        if (summary) sessionUpserts.push(summary);
      } else if (op.kind === 'deck') {
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
      if (sessionUpserts.length) await this.backend.pushSessions(ownerId, sessionUpserts);
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
    try {
      const changes = await this.backend.pull(ownerId, since);

      // Resolved first, applied second: the whole pull lands as one update per
      // store, because applying row by row re-rendered every subscriber once
      // per row and blew React's nested-update limit on a big first sync.
      const resolved: RemoteChanges = { deckUpserts: [], deckDeletes: [], cardUpserts: [], cardDeletes: [] };

      const decks = new Map<string, IsoDate>(this.deckStore.getState().decks.map((d) => [d.id, d.updatedAt]));
      for (const row of changes.decks) {
        const localAt = decks.get(row.id);
        const action = resolveMerge(localAt ? { updatedAt: localAt } : undefined, row);
        if (action.type === 'upsert') resolved.deckUpserts.push(row.data);
        else if (action.type === 'remove') resolved.deckDeletes.push(row.id);
      }

      const cards = new Map<string, IsoDate>();
      for (const list of Object.values(this.deckStore.getState().cardsByDeck)) {
        for (const c of list) cards.set(c.id, c.updatedAt);
      }
      for (const row of changes.cards) {
        const localAt = cards.get(row.id);
        const action = resolveMerge(localAt ? { updatedAt: localAt } : undefined, row);
        if (action.type === 'upsert') resolved.cardUpserts.push(row.data);
        else if (action.type === 'remove') resolved.cardDeletes.push({ deckId: row.data.deckId, cardId: row.id });
      }

      this.deckStore.getState().applyRemoteChanges(resolved);

      // No merge policy for study history: a finished run is immutable, so
      // there is nothing to resolve. `applyRemoteSessions` ignores ids it
      // already holds, which is what makes the echo of our own push harmless.
      this.studyStore.getState().applyRemoteSessions(changes.sessions.map((row) => row.data));

      // Advanced to the newest row the *server* stamped, never to this
      // device's idea of now — see `nextCursor`. A pull that returned nothing
      // leaves the cursor exactly where it was.
      const seen: IsoDate[] = [
        ...changes.decks.map((row) => row.updatedAt),
        ...changes.cards.map((row) => row.updatedAt),
        ...changes.sessions.map((row) => row.updatedAt),
      ];
      const advanced = nextCursor(since, seen);
      if (advanced !== null && advanced !== since) {
        this.syncStore.getState().setLastPulledAt(advanced);
      }
    } catch (err) {
      this.syncStore.getState().setStatus('error', err instanceof Error ? err.message : 'Sync failed.');
    }
  }
}
