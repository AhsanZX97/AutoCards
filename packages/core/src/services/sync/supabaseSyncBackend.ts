import type { SupabaseClient } from '@supabase/supabase-js';
import { nowIso } from '../../lib/date';
import type { Deck, Flashcard, Id, IsoDate, RemoteRow, SessionSummary } from '../../types';
import type { PulledChanges, SyncBackend } from './syncBackend';

const EPOCH: IsoDate = new Date(0).toISOString();

/**
 * Rows per request.
 *
 * PostgREST caps a response at 1,000 rows by default and says nothing about
 * having done so. Asking for everything in one query therefore returned a
 * silently truncated page, and the engine then advanced its cursor past the
 * rows it never received — a new device belonging to anyone with a decent
 * library lost the remainder for good. Staying under the cap and paging is
 * what makes a full pull actually full.
 */
const PAGE_SIZE = 500;

/**
 * Hard stop on paging, so a bug upstream cannot spin here forever. At this
 * size it is not a real library, so it fails loudly rather than truncating —
 * the cursor stays put and the next pass starts over.
 */
const MAX_PAGES = 200;

interface Row<T> {
  id: string;
  updated_at: string;
  deleted_at: string | null;
  data: T;
}

function toRemoteRow<T>(row: Row<T>): RemoteRow<T> {
  return { id: row.id, updatedAt: row.updated_at, deletedAt: row.deleted_at, data: row.data };
}

/** `study_sessions` has no `deleted_at` column — the rows are append-only. */
function toSessionRow(row: Omit<Row<SessionSummary>, 'deleted_at'>): RemoteRow<SessionSummary> {
  return { id: row.id, updatedAt: row.updated_at, deletedAt: null, data: row.data };
}

/** Sync backend against the `decks`/`cards`/`study_sessions` tables in `supabase/schema.sql`. */
export class SupabaseSyncBackend implements SyncBackend {
  constructor(private readonly client: SupabaseClient) {}

  async pull(ownerId: Id, since: IsoDate | null): Promise<PulledChanges> {
    const sinceIso = since ?? EPOCH;
    const [decks, cards, sessions] = await Promise.all([
      this.fetchPaged<Row<Deck>>('decks', 'id,updated_at,deleted_at,data', ownerId, sinceIso),
      this.fetchPaged<Row<Flashcard>>('cards', 'id,updated_at,deleted_at,data', ownerId, sinceIso),
      this.fetchPaged<Omit<Row<SessionSummary>, 'deleted_at'>>(
        'study_sessions',
        'id,updated_at,data',
        ownerId,
        sinceIso,
      ),
    ]);
    return {
      decks: decks.map(toRemoteRow),
      cards: cards.map(toRemoteRow),
      sessions: sessions.map(toSessionRow),
    };
  }

  /**
   * Every row in one table since the cursor, however many pages that takes.
   *
   * Ordered by `updated_at` — with `id` breaking ties so paging is stable
   * across requests — because the engine derives its next cursor from the
   * newest row it saw. Ascending order is what makes that safe: whatever a
   * page did not reach has a later timestamp, so the cursor never advances
   * past a row that was not returned.
   *
   * The window is inclusive (`gte`). A row committed in the last moments of
   * the previous pull may not have been visible then, and every merge is
   * idempotent, so re-reading the boundary costs a few rows and closes the gap.
   */
  private async fetchPaged<T>(
    table: string,
    columns: string,
    ownerId: Id,
    sinceIso: IsoDate,
  ): Promise<T[]> {
    const rows: T[] = [];
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const from = page * PAGE_SIZE;
      const { data, error } = await this.client
        .from(table)
        .select(columns)
        .eq('owner_id', ownerId)
        .gte('updated_at', sinceIso)
        .order('updated_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;

      const batch = (data ?? []) as T[];
      rows.push(...batch);
      if (batch.length < PAGE_SIZE) return rows;
    }
    throw new Error(
      `Reading ${table} needed more than ${MAX_PAGES * PAGE_SIZE} rows, which should not happen.`,
    );
  }

  async pushDecks(ownerId: Id, decks: Deck[]): Promise<void> {
    if (decks.length === 0) return;
    const rows = decks.map((deck) => ({
      id: deck.id,
      owner_id: ownerId,
      updated_at: deck.updatedAt,
      deleted_at: null,
      data: deck,
    }));
    const { error } = await this.client.from('decks').upsert(rows);
    if (error) throw error;
  }

  async pushCards(ownerId: Id, cards: Flashcard[]): Promise<void> {
    if (cards.length === 0) return;
    const rows = cards.map((card) => ({
      id: card.id,
      deck_id: card.deckId,
      // Overwritten server-side from the parent deck by the
      // `cards_owner_from_deck` trigger — sent here only to satisfy NOT NULL.
      owner_id: ownerId,
      updated_at: card.updatedAt,
      deleted_at: null,
      data: card,
    }));
    const { error } = await this.client.from('cards').upsert(rows);
    if (error) throw error;
  }

  async pushSessions(ownerId: Id, sessions: SessionSummary[]): Promise<void> {
    if (sessions.length === 0) return;
    // `updated_at` is left to the column default so the server clock decides
    // where a row falls in the pull window — see the migration.
    const rows = sessions.map((session) => ({
      id: session.id,
      owner_id: ownerId,
      data: session,
    }));
    // A finished run never changes, so a row that is already there is already
    // correct. Ignoring the conflict keeps a retried flush from bumping
    // `updated_at` and re-broadcasting the row to every other device.
    const { error } = await this.client
      .from('study_sessions')
      .upsert(rows, { ignoreDuplicates: true });
    if (error) throw error;
  }

  async softDeleteDeck(id: Id): Promise<void> {
    const timestamp = nowIso();
    const { error } = await this.client
      .from('decks')
      .update({ deleted_at: timestamp, updated_at: timestamp })
      .eq('id', id);
    if (error) throw error;
  }

  async softDeleteCard(id: Id): Promise<void> {
    const timestamp = nowIso();
    const { error } = await this.client
      .from('cards')
      .update({ deleted_at: timestamp, updated_at: timestamp })
      .eq('id', id);
    if (error) throw error;
  }

  subscribeToChanges(ownerId: Id, onNotify: () => void): () => void {
    const channel = this.client
      .channel(`sync:${ownerId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'decks', filter: `owner_id=eq.${ownerId}` },
        onNotify,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cards', filter: `owner_id=eq.${ownerId}` },
        onNotify,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'study_sessions', filter: `owner_id=eq.${ownerId}` },
        onNotify,
      )
      .subscribe();
    return () => {
      void this.client.removeChannel(channel);
    };
  }
}
