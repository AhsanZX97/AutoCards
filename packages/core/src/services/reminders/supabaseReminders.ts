import type { SupabaseClient } from '@supabase/supabase-js';
import type { DeckReminder, Id, ReminderCadence } from '../../types';
import type { ReminderBackend } from './types';

interface ReminderRow {
  id: string;
  deck_id: string;
  cadence: ReminderCadence;
  time_of_day: string;
  time_zone: string;
  last_sent_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * The `deck_reminders` table, as the app sees it.
 *
 * A plain table rather than another Edge Function: the rows are owner-scoped
 * under RLS and carry no entitlement, so there is nothing here a client could
 * gain by writing directly. What it may *not* write is `next_send_at` and
 * `last_sent_at` — those grants are revoked in migration 0009, because a tab
 * that could move its own next send could mail itself as often as it liked.
 *
 * Every call fails soft, and says so by returning rather than throwing. The
 * reminder is already saved locally by the time any of this runs; a push that
 * did not land is retried the next time the reminder is touched or the account
 * signs in somewhere.
 */
export class SupabaseReminderBackend implements ReminderBackend {
  constructor(private readonly client: SupabaseClient) {}

  async pull(): Promise<DeckReminder[] | null> {
    const { data, error } = await this.client
      .from('deck_reminders')
      .select('id,deck_id,cadence,time_of_day,time_zone,last_sent_at,created_at,updated_at');

    // Null, not an empty list: the caller replaces local state with whatever
    // comes back, and a failed read must not read as "you have none".
    if (error || !data) {
      if (error) console.warn('[autocards] could not read reminders', error.message);
      return null;
    }
    return (data as ReminderRow[]).map(toReminder);
  }

  async push(reminder: DeckReminder): Promise<void> {
    const { error } = await this.client.from('deck_reminders').upsert(
      {
        id: reminder.id,
        deck_id: reminder.deckId,
        cadence: reminder.cadence,
        time_of_day: reminder.timeOfDay,
        time_zone: reminder.timeZone,
        created_at: reminder.createdAt,
        updated_at: reminder.updatedAt,
      },
      { onConflict: 'id' },
    );
    // A deck that has not itself synced yet has no row to hang this off, and
    // the insert trips the owner trigger. Worth a line in the console and
    // nothing more — the next push after the deck lands will succeed.
    if (error) console.warn('[autocards] could not save a reminder to the server', error.message);
  }

  async remove(reminderId: Id): Promise<void> {
    const { error } = await this.client.from('deck_reminders').delete().eq('id', reminderId);
    if (error) console.warn('[autocards] could not remove a reminder', error.message);
  }

  async removeForDeck(deckId: Id): Promise<void> {
    const { error } = await this.client.from('deck_reminders').delete().eq('deck_id', deckId);
    if (error) console.warn('[autocards] could not remove a deck’s reminders', error.message);
  }
}

function toReminder(row: ReminderRow): DeckReminder {
  return {
    id: row.id,
    deckId: row.deck_id,
    cadence: row.cadence,
    timeOfDay: row.time_of_day,
    timeZone: row.time_zone,
    ...(row.last_sent_at ? { lastSentAt: row.last_sent_at } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
