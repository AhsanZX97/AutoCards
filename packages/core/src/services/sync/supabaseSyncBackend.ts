import type { SupabaseClient } from '@supabase/supabase-js';
import { nowIso } from '../../lib/date';
import type { Deck, Flashcard, Id, IsoDate, RemoteRow } from '../../types';
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

/** Sync backend against the `decks`/`cards` tables in `supabase/schema.sql`. */
export class SupabaseSyncBackend implements SyncBackend {
  constructor(private readonly client: SupabaseClient) {}

  async pull(ownerId: Id, since: IsoDate | null): Promise<PulledChanges> {
    const sinceIso = since ?? EPOCH;
    const [decksRes, cardsRes] = await Promise.all([
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
    ]);
    if (decksRes.error) throw decksRes.error;
    if (cardsRes.error) throw cardsRes.error;
    return {
      decks: (decksRes.data as Row<Deck>[]).map(toRemoteRow),
      cards: (cardsRes.data as Row<Flashcard>[]).map(toRemoteRow),
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
      .subscribe();
    return () => {
      void this.client.removeChannel(channel);
    };
  }
}
