import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { nextReminderAt, type App, type DeckReminder } from '@autocards/core';

/**
 * The reminder schedule, as local notifications on this device.
 *
 * The server's cron mails whoever is due, and knows nothing about phones. So
 * rather than hang push off that pipeline, the device schedules its own: the
 * cadence is already on the row, and `nextReminderAt` is the same function the
 * sender uses, so both arrive at the same instant without talking to each
 * other. That also means a reminder with email switched off still fires here.
 *
 * Only ever the *next* occurrence per reminder, never a repeating trigger.
 * `expo-notifications` can repeat daily or weekly and nothing else, which
 * covers two of the six cadences — monthly, a custom set of weekdays, and the
 * "if I fall behind" gap all have to be worked out afresh each time. Rather
 * than schedule some cadences one way and some another, every reminder gets
 * one dated notification and the whole set is recomputed whenever the state it
 * was derived from moves: an edit, a finished session, or the app coming back
 * to the foreground.
 */

const ANDROID_CHANNEL = 'study-reminders';

/** Shown even with the app open — otherwise a 6pm nudge is silently dropped. */
export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  // Android needs a channel before anything can be posted to it; iOS ignores
  // this entirely.
  if (Platform.OS === 'android') {
    void Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
      name: 'Study reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: '#4f46e5',
    });
  }
}

/** Whether this device has already agreed to notifications. */
export async function hasNotificationPermission(): Promise<boolean> {
  try {
    const { granted } = await Notifications.getPermissionsAsync();
    return granted;
  } catch {
    return false;
  }
}

/**
 * Asks, but only the first time — the OS shows its prompt once and answers
 * from the saved decision after that, so this is safe to call on every save.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted) return true;
    if (!existing.canAskAgain) return false;
    const { granted } = await Notifications.requestPermissionsAsync();
    return granted;
  } catch {
    return false;
  }
}

/**
 * The run in flight, so two overlapping syncs cannot interleave their
 * cancel-then-reschedule passes and leave the second one's cancel landing
 * after the first one's schedule.
 */
let inFlight: Promise<void> = Promise.resolve();

/**
 * Rebuilds every scheduled notification from the reminders currently in the
 * store.
 *
 * Cancel-then-reschedule rather than a diff: the set is at most a handful of
 * decks by five reminders, and there is no id to match on once a cadence has
 * moved its next occurrence. Silent when permission has not been given —
 * asking is the editor's job, not this function's.
 */
export function syncScheduledNotifications(app: App): Promise<void> {
  inFlight = inFlight.then(() => rebuild(app));
  return inFlight;
}

async function rebuild(app: App): Promise<void> {
  try {
    if (!(await hasNotificationPermission())) {
      // Cancel anyway: permission can be withdrawn in system settings between
      // launches, and anything still queued from before would outlive it.
      await Notifications.cancelAllScheduledNotificationsAsync();
      return;
    }

    await Notifications.cancelAllScheduledNotificationsAsync();

    const now = new Date();
    const { remindersByDeck } = app.reminderStore.getState();
    const deckState = app.deckStore.getState();
    const studyState = app.studyStore.getState();

    for (const [deckId, reminders] of Object.entries(remindersByDeck)) {
      const deck = deckState.getDeck(deckId);
      // A reminder outliving its deck has nothing to nudge about. The row is
      // cleared on delete; this only catches a copy pulled from the server
      // before the deck itself had synced.
      if (!deck) continue;

      const lastStudiedAt = studyState.sessionsForDeck(deckId)[0]?.endedAt;

      for (const reminder of reminders) {
        const next = nextReminderAt(reminder, { now, lastStudiedAt });
        if (!next) continue;
        await schedule(reminder, deck.title, next);
      }
    }
  } catch (error) {
    // A device that refuses to schedule still has the email side of the
    // reminder, and the schedule itself is saved either way.
    console.warn('[autocards] could not schedule study reminders', error);
  }
}

async function schedule(reminder: DeckReminder, deckTitle: string, at: Date): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `Time to study ${deckTitle}`,
      body: 'A few minutes is enough to keep it from slipping.',
      data: { deckId: reminder.deckId, reminderId: reminder.id },
      ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL } : {}),
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
  });
}
