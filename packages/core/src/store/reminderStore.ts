import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { STORAGE_KEYS, type StorageAdapter } from '../lib/storage';
import { toZustandStorage } from './persistBridge';
import { nowIso } from '../lib/date';
import { isReminderActive, normalizeReminder } from '../domain/reminders';
import type { ReminderChange } from '../services/reminders/types';
import { MAX_REMINDERS_PER_DECK, type DeckReminder, type Id } from '../types';

const NO_REMINDERS: DeckReminder[] = [];

/**
 * The email reminders set on each deck — a list per deck, keyed by deck id.
 *
 * A list rather than one reminder each, because a single schedule cannot say
 * "weekdays at 8am, and again on Sunday evening". Adding a row is the way that
 * gets expressed, which is also the only thing left to understand: a reminder
 * exists or it does not, and there is nothing to switch on.
 *
 * Everything is normalized on the way in. These rows are read back by whatever
 * sends the mail, long after the tab that wrote them has gone, so a cadence
 * that cannot be scheduled has to be caught here rather than at send time.
 */
export interface ReminderState {
  remindersByDeck: Record<Id, DeckReminder[]>;

  /** Always an array, so callers never branch on "this deck has none yet". */
  remindersFor: (deckId: Id) => DeckReminder[];
  /** False when the deck is already at {@link MAX_REMINDERS_PER_DECK}. */
  addReminder: (reminder: DeckReminder) => boolean;
  /** Replaces one by id. Does nothing if it has since been removed. */
  updateReminder: (reminder: DeckReminder) => void;
  removeReminder: (deckId: Id, reminderId: Id) => void;
  /** Drops the lot — for when the deck itself is deleted. */
  clearDeck: (deckId: Id) => void;
  /** How many of a deck's reminders still have an email coming. */
  activeCountFor: (deckId: Id, now?: Date) => number;
  /**
   * Replaces everything with what the server holds, on sign-in.
   *
   * The server is authoritative here, unlike decks and cards: these rows are
   * only ever written from a reminder editor, and the copy that the sender has
   * been mailing from is the one that matters. Does not report changes back
   * up — this *is* the server's state arriving.
   */
  hydrate: (reminders: DeckReminder[]) => void;
}

/**
 * @param onChange fired after every local edit, so it can be mirrored to the
 * server. Not called for {@link ReminderState.hydrate}, which is the server's
 * own state coming the other way.
 */
export function createReminderStore(storage: StorageAdapter, onChange?: (change: ReminderChange) => void) {
  return create<ReminderState>()(
    persist(
      (set, get) => ({
        remindersByDeck: {},

        remindersFor: (deckId) => get().remindersByDeck[deckId] ?? NO_REMINDERS,

        addReminder: (reminder) => {
          const existing = get().remindersByDeck[reminder.deckId] ?? NO_REMINDERS;
          if (existing.length >= MAX_REMINDERS_PER_DECK) return false;
          const saved = normalizeReminder({ ...reminder, updatedAt: nowIso() });
          set((state) => ({
            remindersByDeck: {
              ...state.remindersByDeck,
              [reminder.deckId]: [...(state.remindersByDeck[reminder.deckId] ?? NO_REMINDERS), saved],
            },
          }));
          onChange?.({ kind: 'upsert', reminder: saved });
          return true;
        },

        updateReminder: (reminder) => {
          const existing = get().remindersByDeck[reminder.deckId];
          const current = existing?.find((r) => r.id === reminder.id);
          if (!current) return;
          const saved = normalizeReminder({
            ...reminder,
            // Editing is not creating. An inactivity cadence counts from this
            // stamp on a deck that was never studied.
            createdAt: current.createdAt,
            updatedAt: nowIso(),
          });
          set((state) => ({
            remindersByDeck: {
              ...state.remindersByDeck,
              [reminder.deckId]: (state.remindersByDeck[reminder.deckId] ?? NO_REMINDERS).map((row) =>
                row.id === reminder.id ? saved : row,
              ),
            },
          }));
          onChange?.({ kind: 'upsert', reminder: saved });
        },

        removeReminder: (deckId, reminderId) => {
          const existing = get().remindersByDeck[deckId];
          if (!existing?.some((reminder) => reminder.id === reminderId)) return;
          set((state) => {
            const rows = state.remindersByDeck[deckId] ?? NO_REMINDERS;
            const kept = rows.filter((reminder) => reminder.id !== reminderId);
            // An empty array would persist as a deck that "has reminders", none
            // of them real; dropping the key keeps the stored shape honest.
            if (kept.length === 0) {
              const { [deckId]: _emptied, ...rest } = state.remindersByDeck;
              return { remindersByDeck: rest };
            }
            return { remindersByDeck: { ...state.remindersByDeck, [deckId]: kept } };
          });
          onChange?.({ kind: 'remove', deckId, reminderId });
        },

        clearDeck: (deckId) => {
          if (!get().remindersByDeck[deckId]) return;
          set((state) => {
            const { [deckId]: _removed, ...rest } = state.remindersByDeck;
            return { remindersByDeck: rest };
          });
          onChange?.({ kind: 'clear-deck', deckId });
        },

        activeCountFor: (deckId, now = new Date()) =>
          (get().remindersByDeck[deckId] ?? NO_REMINDERS).filter((reminder) =>
            isReminderActive(reminder, now),
          ).length,

        hydrate: (reminders) => {
          const byDeck: Record<Id, DeckReminder[]> = {};
          for (const reminder of reminders) {
            const rows = byDeck[reminder.deckId] ?? [];
            // The server's own limit should make this unreachable; honoured
            // here too so a hand-written row cannot grow the list past the cap.
            if (rows.length >= MAX_REMINDERS_PER_DECK) continue;
            rows.push(normalizeReminder(reminder));
            byDeck[reminder.deckId] = rows;
          }
          set({ remindersByDeck: byDeck });
        },
      }),
      {
        name: STORAGE_KEYS.reminders,
        storage: createJSONStorage(() => toZustandStorage(storage)),
        partialize: (state) => ({ remindersByDeck: state.remindersByDeck }),
      },
    ),
  );
}

export type ReminderStore = ReturnType<typeof createReminderStore>;
