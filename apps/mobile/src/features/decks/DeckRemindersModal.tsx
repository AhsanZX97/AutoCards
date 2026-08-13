import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  INACTIVITY_DAY_CHOICES,
  MAX_REMINDERS_PER_DECK,
  WEEKDAYS,
  WEEKDAY_LABELS,
  createReminder,
  describeCadence,
  formatNextReminder,
  localTimeZone,
  nextReminderAt,
  toDateInput,
  type DeckReminder,
  type ReminderCadence,
  type ReminderCadenceKind,
  type Weekday,
} from '@autocards/core';
import { useApp } from '../../lib/appContext';
import { useTheme, radius, spacing } from '../../lib/theme';
import { toast } from '../../lib/toastStore';
import { requestNotificationPermission } from '../../lib/reminderNotifications';
import {
  Button,
  Chip,
  Modal,
  SelectField,
  SwitchRow,
  TimeField,
  type SelectOption,
} from '../../components';

interface DeckRemindersModalProps {
  open: boolean;
  onClose: () => void;
  deckId: string;
  deckTitle: string;
}

/**
 * The six schedules, in the order they are offered — the same set, labels and
 * hints as the web's `DeckRemindersModal`, so a schedule set on one reads the
 * same on the other.
 */
const CADENCE_OPTIONS: Array<{ kind: ReminderCadenceKind; label: string; hint: string }> = [
  { kind: 'daily', label: 'Every day', hint: 'A steady habit — best for language and vocab decks.' },
  { kind: 'weekdays', label: 'Weekdays', hint: 'Monday to Friday, nothing at the weekend.' },
  { kind: 'weekly', label: 'Certain days', hint: 'Pick the days that suit your timetable.' },
  { kind: 'monthly', label: 'Monthly', hint: 'A once-a-month sweep to keep old decks warm.' },
  { kind: 'inactivity', label: 'If I fall behind', hint: 'Nothing while you keep up — a nudge when you stop.' },
  { kind: 'once', label: 'Just once', hint: 'A single reminder, for an exam or a deadline.' },
];

/** A starting shape for each cadence, so switching preset never needs a form reset. */
function cadenceFor(kind: ReminderCadenceKind, current: ReminderCadence): ReminderCadence {
  if (kind === current.kind) return current;
  switch (kind) {
    case 'weekly':
      return { kind: 'weekly', days: ['mon', 'wed', 'fri'] };
    case 'monthly':
      return { kind: 'monthly', dayOfMonth: 1 };
    case 'inactivity':
      return { kind: 'inactivity', afterDays: 3 };
    case 'once':
      return { kind: 'once', date: toDateInput(new Date(Date.now() + 7 * 86_400_000)) };
    default:
      return { kind };
  }
}

const DAY_OF_MONTH_OPTIONS: SelectOption[] = Array.from({ length: 31 }, (_, i) => ({
  value: `${i + 1}`,
  label: `${i + 1}`,
}));

const INACTIVITY_OPTIONS: SelectOption[] = INACTIVITY_DAY_CHOICES.map((days) => ({
  value: `${days}`,
  label: `${days} days without studying`,
}));

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Today and the next eight weeks — the horizon a "just once" reminder is set on. */
function onceDateOptions(now: Date): SelectOption[] {
  return Array.from({ length: 60 }, (_, offset) => {
    const day = new Date(now.getTime() + offset * 86_400_000);
    const value = toDateInput(day);
    const weekday = WEEKDAY_LABELS[WEEKDAYS[day.getDay()]!];
    const label =
      offset === 0 ? `Today (${weekday})` : offset === 1 ? `Tomorrow (${weekday})` : `${weekday} ${day.getDate()} ${MONTHS[day.getMonth()]}`;
    return { value, label };
  });
}

/**
 * The study reminders set on one deck.
 *
 * Mirrors the web's modal — list of what is set, editor for one row — with the
 * one thing a phone adds: the reminder fires as a notification on this device
 * whatever happens, so the email is the part that becomes optional here.
 */
export function DeckRemindersModal({ open, onClose, deckId, deckTitle }: DeckRemindersModalProps) {
  const app = useApp();
  const theme = useTheme();
  const reminders = app.reminderStore((s) => s.remindersByDeck[deckId]);
  const addReminder = app.reminderStore((s) => s.addReminder);
  const updateReminder = app.reminderStore((s) => s.updateReminder);
  const removeReminder = app.reminderStore((s) => s.removeReminder);
  const sessions = app.studyStore((s) => s.history);

  /** Null while the list is showing; a reminder while one is being edited. */
  const [draft, setDraft] = useState<DeckReminder | null>(null);
  const [isNew, setIsNew] = useState(false);

  // Reopening should land on the list, not on whatever was half-set and
  // abandoned last time.
  useEffect(() => {
    if (open) {
      setDraft(null);
      setIsNew(false);
    }
  }, [open]);

  /** Only the inactivity cadence reads this, and only to preview the next send. */
  const lastStudiedAt = useMemo(
    () => sessions.find((session) => session.deckId === deckId)?.endedAt,
    [sessions, deckId],
  );

  const saved = reminders ?? [];
  const isFull = saved.length >= MAX_REMINDERS_PER_DECK;
  const now = new Date();

  function startAdding() {
    setDraft(createReminder(deckId));
    setIsNew(true);
  }

  function handleDelete(reminder: DeckReminder) {
    removeReminder(deckId, reminder.id);
    toast({ variant: 'success', title: 'Reminder deleted' });
  }

  function handleSave() {
    if (!draft) return;
    const reminder = { ...draft, timeZone: localTimeZone() };
    if (isNew) {
      addReminder(reminder);
      toast({ variant: 'success', title: 'Reminder added', description: describeCadence(reminder) });
    } else {
      updateReminder(reminder);
      toast({ variant: 'success', title: 'Reminder updated', description: describeCadence(reminder) });
    }
    // Asked on save rather than on open: by now there is a schedule worth
    // being interrupted for, which is the only context in which the OS prompt
    // makes sense. The store subscription does the scheduling either way.
    void requestNotificationPermission();
    setDraft(null);
    setIsNew(false);
  }

  // Weekly with nothing ticked has no schedule at all. Blocked at the button
  // rather than quietly corrected, so nobody saves a Monday they did not pick.
  const incomplete = draft?.cadence.kind === 'weekly' && draft.cadence.days.length === 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={draft ? (isNew ? 'New reminder' : 'Edit reminder') : 'Study reminders'}
      description={deckTitle}
      footer={
        draft ? (
          <>
            <Button title="Cancel" variant="ghost" onPress={() => setDraft(null)} style={{ flex: 1 }} />
            <Button
              title={isNew ? 'Add reminder' : 'Save changes'}
              onPress={handleSave}
              disabled={incomplete}
              style={{ flex: 1.5 }}
            />
          </>
        ) : (
          <>
            <Button
              title="+ Add reminder"
              variant="outline"
              onPress={startAdding}
              disabled={isFull}
              style={{ flex: 1.5 }}
            />
            <Button title="Done" onPress={onClose} style={{ flex: 1 }} />
          </>
        )
      }
    >
      {draft ? (
        <ReminderEditor draft={draft} onChange={setDraft} lastStudiedAt={lastStudiedAt} now={now} />
      ) : saved.length === 0 ? (
        <View style={{ paddingVertical: spacing.xl, alignItems: 'center' }}>
          <Text style={{ fontSize: 30 }}>🔔</Text>
          <Text style={{ marginTop: spacing.md, fontSize: 15, fontWeight: '700', color: theme.text }}>
            No reminders on this deck yet
          </Text>
          <Text
            style={{ marginTop: 4, fontSize: 13, color: theme.textMuted, textAlign: 'center' }}
          >
            Add one and your phone will nudge you when it&apos;s time to study — daily, on set days,
            or just once before an exam.
          </Text>
        </View>
      ) : (
        <View style={{ gap: spacing.sm, paddingBottom: spacing.sm }}>
          {saved.map((reminder) => {
            const next = nextReminderAt(reminder, { now, lastStudiedAt });
            return (
              <View
                key={reminder.id}
                style={{
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: radius.md,
                  padding: spacing.md,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text }}>
                  {describeCadence(reminder)}
                </Text>
                <Text style={{ marginTop: 2, fontSize: 12, color: theme.textMuted }}>
                  {next ? `Next ${formatNextReminder(next, now)}` : 'Already sent — nothing more to come'}
                  {reminder.emailEnabled ? ' · notification and email' : ' · notification only'}
                </Text>
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.lg, marginTop: spacing.sm }}>
                  <Pressable
                    onPress={() => {
                      setDraft(reminder);
                      setIsNew(false);
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '600', color: theme.primaryText }}>Edit</Text>
                  </Pressable>
                  <Pressable onPress={() => handleDelete(reminder)}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: theme.danger }}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
          <Text style={{ fontSize: 12, color: theme.textFaint }}>
            {isFull
              ? `That's the limit of ${MAX_REMINDERS_PER_DECK} reminders on one deck.`
              : `${saved.length} of ${MAX_REMINDERS_PER_DECK} reminders used.`}
          </Text>
        </View>
      )}
    </Modal>
  );
}

function ReminderEditor({
  draft,
  onChange,
  lastStudiedAt,
  now,
}: {
  draft: DeckReminder;
  onChange: (reminder: DeckReminder) => void;
  lastStudiedAt?: string;
  now: Date;
}) {
  const theme = useTheme();
  const next = nextReminderAt(draft, { now, lastStudiedAt });
  const dateOptions = useMemo(() => onceDateOptions(now), [now.toDateString()]);

  function patch(changes: Partial<DeckReminder>) {
    onChange({ ...draft, ...changes });
  }

  function toggleWeekday(day: Weekday) {
    if (draft.cadence.kind !== 'weekly') return;
    const days = draft.cadence.days.includes(day)
      ? draft.cadence.days.filter((d) => d !== day)
      : [...draft.cadence.days, day];
    patch({ cadence: { kind: 'weekly', days } });
  }

  return (
    <View style={{ paddingBottom: spacing.sm }}>
      <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text, marginBottom: spacing.sm }}>
        How often
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {CADENCE_OPTIONS.map((option) => (
          <Chip
            key={option.kind}
            label={option.label}
            active={draft.cadence.kind === option.kind}
            onPress={() => patch({ cadence: cadenceFor(option.kind, draft.cadence) })}
          />
        ))}
      </View>
      <Text style={{ fontSize: 12, color: theme.textFaint, marginBottom: spacing.lg }}>
        {CADENCE_OPTIONS.find((o) => o.kind === draft.cadence.kind)?.hint}
      </Text>

      {/* At most one of these ever shows — the extra control the chosen cadence
          needs, and nothing more. */}
      {draft.cadence.kind === 'weekly' && (
        <View style={{ marginBottom: spacing.md }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text, marginBottom: spacing.sm }}>
            Which days
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {WEEKDAYS.map((day) => (
              <Chip
                key={day}
                label={WEEKDAY_LABELS[day]}
                active={draft.cadence.kind === 'weekly' && draft.cadence.days.includes(day)}
                onPress={() => toggleWeekday(day)}
              />
            ))}
          </View>
        </View>
      )}

      {draft.cadence.kind === 'monthly' && (
        <SelectField
          label="Day of the month"
          hint="29th–31st fall back"
          value={`${draft.cadence.dayOfMonth}`}
          options={DAY_OF_MONTH_OPTIONS}
          onChange={(value) => patch({ cadence: { kind: 'monthly', dayOfMonth: Number(value) } })}
        />
      )}

      {draft.cadence.kind === 'inactivity' && (
        <SelectField
          label="Nudge me after"
          hint="From your last session"
          value={`${draft.cadence.afterDays}`}
          options={INACTIVITY_OPTIONS}
          onChange={(value) => patch({ cadence: { kind: 'inactivity', afterDays: Number(value) } })}
        />
      )}

      {draft.cadence.kind === 'once' && (
        <SelectField
          label="On this date"
          value={draft.cadence.date}
          options={dateOptions}
          onChange={(value) => patch({ cadence: { kind: 'once', date: value } })}
        />
      )}

      <TimeField
        label="Time of day"
        hint={draft.timeZone || localTimeZone()}
        value={draft.timeOfDay}
        onChange={(value) => patch({ timeOfDay: value })}
      />

      <SwitchRow
        label="Email me as well"
        description="The notification always arrives on this phone. Turn this on to get an email too."
        value={draft.emailEnabled}
        onValueChange={(value) => patch({ emailEnabled: value })}
      />

      {/* The payoff line. Everything above is a control; this is the one
          sentence that says what will actually happen. */}
      <View
        style={{
          marginTop: spacing.md,
          borderRadius: radius.md,
          backgroundColor: theme.surfaceAlt,
          padding: spacing.md,
        }}
      >
        <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text }}>
          {next ? `Next reminder ${formatNextReminder(next, now)}` : 'Pick at least one day'}
        </Text>
        {next && (
          <Text style={{ marginTop: 2, fontSize: 12, color: theme.textMuted }}>{describeCadence(draft)}</Text>
        )}
      </View>
    </View>
  );
}
