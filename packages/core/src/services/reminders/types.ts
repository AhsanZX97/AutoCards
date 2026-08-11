import type { DeckReminder, Id } from '../../types';

/**
 * Where a deck's reminders live for the server to read.
 *
 * Reminders are the one thing in this app that has to work with the app shut.
 * Local storage is enough for a setting the app reads back itself; it is no use
 * at all to a cron job that has to email someone at 6pm on a Tuesday, so these
 * rows are pushed to Postgres as they change.
 *
 * Every method fails soft. A reminder that could not be pushed is still saved
 * locally and re-pushed on the next change or the next sign-in; the alternative
 * — refusing the edit — would break the editor for someone briefly offline.
 */
export interface ReminderBackend {
  /**
   * Everything the account has, for hydrating a device that has just signed in.
   *
   * Null means the server could not be reached — which is emphatically not the
   * same as an account with no reminders, and must not be allowed to look like
   * one. Hydrating on a failed read would wipe a perfectly good schedule off a
   * device that was briefly offline.
   */
  pull(): Promise<DeckReminder[] | null>;
  /** Creates or replaces one reminder. */
  push(reminder: DeckReminder): Promise<void>;
  remove(reminderId: Id): Promise<void>;
  /** Drops every reminder on a deck, for when the deck itself goes. */
  removeForDeck(deckId: Id): Promise<void>;
}

/** What the store reports upward when something changes. */
export type ReminderChange =
  | { kind: 'upsert'; reminder: DeckReminder }
  | { kind: 'remove'; deckId: Id; reminderId: Id }
  | { kind: 'clear-deck'; deckId: Id };
