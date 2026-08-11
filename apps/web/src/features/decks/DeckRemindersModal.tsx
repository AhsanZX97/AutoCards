import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_REMINDER_TIME,
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
import { Button, Chip, Field, Input, Modal, Select } from '../../components/ui';
import { toast } from '../../components/ui/toastStore';
import { useApp } from '../../lib/appContext';
import { cn } from '../../lib/cn';

interface DeckRemindersModalProps {
  open: boolean;
  onClose: () => void;
  deckId: string;
  deckTitle: string;
}

/**
 * The six schedules, in the order they are offered.
 *
 * Presets rather than a free-form rule builder: a schedule is picked once and
 * then lived with, so the whole thing has to be readable in a glance. Each one
 * opens at most a single extra control, and four of the six need none at all.
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
      // A week out: far enough that the date picker is not showing a time
      // that has already passed today.
      return { kind: 'once', date: toDateInput(new Date(Date.now() + 7 * 86_400_000)) };
    default:
      return { kind };
  }
}

/**
 * The reminder emails set on one deck.
 *
 * Two screens in one modal: the list of what is set, and the editor for one
 * row. Reminders are a small collection rather than a page of settings — you
 * add one, change one, or delete one — and keeping the editor off the list
 * means the list itself stays a plain answer to "when will you email me?".
 */
export function DeckRemindersModal({ open, onClose, deckId, deckTitle }: DeckRemindersModalProps) {
  const app = useApp();
  const reminders = app.reminderStore((s) => s.remindersByDeck[deckId]);
  const addReminder = app.reminderStore((s) => s.addReminder);
  const updateReminder = app.reminderStore((s) => s.updateReminder);
  const removeReminder = app.reminderStore((s) => s.removeReminder);
  const email = app.authStore((s) => s.session?.user.email);
  const sessions = app.studyStore((s) => s.history);

  /** Null while the list is showing; a reminder while one is being edited. */
  const [draft, setDraft] = useState<DeckReminder | null>(null);
  const [isNew, setIsNew] = useState(false);

  // Reopening should land on the list, not on whatever was half-typed and
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

  function startEditing(reminder: DeckReminder) {
    setDraft(reminder);
    setIsNew(false);
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
      description={draft ? deckTitle : email ? `Emailed to ${email}` : deckTitle}
      size="lg"
      footer={
        draft ? (
          <>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={incomplete}>
              {isNew ? 'Add reminder' : 'Save changes'}
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="outline"
              className="mr-auto"
              onClick={startAdding}
              disabled={isFull}
              title={isFull ? `A deck can hold ${MAX_REMINDERS_PER_DECK} reminders` : undefined}
            >
              + Add reminder
            </Button>
            <Button onClick={onClose}>Done</Button>
          </>
        )
      }
    >
      {draft ? (
        <ReminderEditor
          draft={draft}
          onChange={setDraft}
          lastStudiedAt={lastStudiedAt}
          now={now}
        />
      ) : (
        <ReminderList
          reminders={saved}
          now={now}
          lastStudiedAt={lastStudiedAt}
          isFull={isFull}
          onAdd={startAdding}
          onEdit={startEditing}
          onDelete={handleDelete}
        />
      )}
    </Modal>
  );
}

function ReminderList({
  reminders,
  now,
  lastStudiedAt,
  isFull,
  onAdd,
  onEdit,
  onDelete,
}: {
  reminders: DeckReminder[];
  now: Date;
  lastStudiedAt?: string;
  isFull: boolean;
  onAdd: () => void;
  onEdit: (reminder: DeckReminder) => void;
  onDelete: (reminder: DeckReminder) => void;
}) {
  if (reminders.length === 0) {
    return (
      <div className="py-10 text-center">
        <span className="text-3xl">🔔</span>
        <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-200">
          No reminders on this deck yet
        </p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">
          Add one and we&apos;ll email you when it&apos;s time to study — daily, on set days, or
          just once before an exam.
        </p>
        <Button className="mt-4" onClick={onAdd}>
          + Add reminder
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {reminders.map((reminder) => {
        const next = nextReminderAt(reminder, { now, lastStudiedAt });
        return (
          <div
            key={reminder.id}
            className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-800"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                {describeCadence(reminder)}
              </p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {next ? `Next email ${formatNextReminder(next, now)}` : 'Already sent — nothing more to come'}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button size="sm" variant="ghost" onClick={() => onEdit(reminder)}>
                Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onDelete(reminder)}
                className="text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"
              >
                Delete
              </Button>
            </div>
          </div>
        );
      })}
      <p className="pt-1 text-xs text-slate-400">
        {isFull
          ? `That's the limit of ${MAX_REMINDERS_PER_DECK} reminders on one deck.`
          : `${reminders.length} of ${MAX_REMINDERS_PER_DECK} reminders used.`}
      </p>
    </div>
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
  const next = nextReminderAt(draft, { now, lastStudiedAt });

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
    <div className="space-y-6">
      <section>
        <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">How often</p>
        <div className="flex flex-wrap gap-2">
          {CADENCE_OPTIONS.map((option) => (
            <Chip
              key={option.kind}
              active={draft.cadence.kind === option.kind}
              onClick={() => patch({ cadence: cadenceFor(option.kind, draft.cadence) })}
            >
              {option.label}
            </Chip>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-400">
          {CADENCE_OPTIONS.find((o) => o.kind === draft.cadence.kind)?.hint}
        </p>
      </section>

      {/* At most one of these ever shows — the extra control the chosen cadence
          needs, and nothing more. */}
      {draft.cadence.kind === 'weekly' && (
        <section>
          <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Which days</p>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((day) => {
              const picked = draft.cadence.kind === 'weekly' && draft.cadence.days.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleWeekday(day)}
                  aria-pressed={picked}
                  className={cn(
                    'h-10 w-12 rounded-xl border text-sm font-medium transition-colors',
                    picked
                      ? 'border-brand-600 bg-brand-600 text-white'
                      : 'border-slate-300 text-slate-600 hover:border-slate-400 dark:border-slate-700 dark:text-slate-300',
                  )}
                >
                  {WEEKDAY_LABELS[day]}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {draft.cadence.kind === 'monthly' && (
        <Field label="Day of the month" hint="The 29th to 31st fall back to the last day">
          <Select
            className="w-auto"
            value={draft.cadence.dayOfMonth}
            onChange={(e) => patch({ cadence: { kind: 'monthly', dayOfMonth: Number(e.target.value) } })}
          >
            {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {draft.cadence.kind === 'inactivity' && (
        <Field label="Nudge me after" hint="Counted from your last session on this deck">
          <Select
            className="w-auto"
            value={draft.cadence.afterDays}
            onChange={(e) => patch({ cadence: { kind: 'inactivity', afterDays: Number(e.target.value) } })}
          >
            {INACTIVITY_DAY_CHOICES.map((days) => (
              <option key={days} value={days}>
                {days} days without studying
              </option>
            ))}
          </Select>
        </Field>
      )}

      {draft.cadence.kind === 'once' && (
        <Field label="On this date">
          <Input
            type="date"
            className="w-auto"
            min={toDateInput(new Date())}
            value={draft.cadence.date}
            onChange={(e) => patch({ cadence: { kind: 'once', date: e.target.value } })}
          />
        </Field>
      )}

      <Field label="Time of day" hint={draft.timeZone || localTimeZone()}>
        <Input
          type="time"
          className="w-auto"
          value={draft.timeOfDay}
          onChange={(e) => patch({ timeOfDay: e.target.value || DEFAULT_REMINDER_TIME })}
        />
      </Field>

      {/* The payoff line. Everything above is a control; this is the one
          sentence that says what will actually happen. */}
      <div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800/50">
        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
          {next ? `Next email ${formatNextReminder(next, now)}` : 'Pick at least one day'}
        </p>
        {next && (
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{describeCadence(draft)}</p>
        )}
      </div>
    </div>
  );
}
