import type { SupabaseClient } from '@supabase/supabase-js';
import { nowIso } from '../../lib/date';
import type { Deck, Flashcard, Id, IsoDate, RemoteRow, SessionSummary } from '../../types';
import type { PulledChanges, SyncBackend } from './syncBackend';

const EPOCH: IsoDate = new Date(0).toISOString();

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
    const [decksRes, cardsRes, sessionsRes] = await Promise.all([
      this.client
        .from('decks')
        .select('id,updated_at,deleted_at,data')
        .eq('owner_id', ownerId)
        .gt('updated_at', sinceIso),
      this.client
        .from('cards')
        .select('id,updated_at,deleted_at,data')
        .eq('owner_id', ownerId)
        .gt('updated_at', sinceIso),
      this.client
        .from('study_sessions')
        .select('id,updated_at,data')
        .eq('owner_id', ownerId)
        .gt('updated_at', sinceIso),
    ]);
    if (decksRes.error) throw decksRes.error;
    if (cardsRes.error) throw cardsRes.error;
    if (sessionsRes.error) throw sessionsRes.error;
    return {
      decks: (decksRes.data as Row<Deck>[]).map(toRemoteRow),
      cards: (cardsRes.data as Row<Flashcard>[]).map(toRemoteRow),
      sessions: (sessionsRes.data as Omit<Row<SessionSummary>, 'deleted_at'>[]).map(toSessionRow),
    };
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
