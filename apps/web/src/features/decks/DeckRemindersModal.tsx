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
import { useT } from '../../lib/i18n';
import type { Translator } from '@autocards/core';
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
function cadenceOptions(t: Translator): Array<{ kind: ReminderCadenceKind; label: string; hint: string }> {
  return [
    { kind: 'daily', label: t('reminders.cadence.daily'), hint: t('reminders.cadence.daily.hint') },
    { kind: 'weekdays', label: t('reminders.cadence.weekdays'), hint: t('reminders.cadence.weekdays.hint') },
    { kind: 'weekly', label: t('reminders.cadence.weekly'), hint: t('reminders.cadence.weekly.hint') },
    { kind: 'monthly', label: t('reminders.cadence.monthly'), hint: t('reminders.cadence.monthly.hint') },
    { kind: 'inactivity', label: t('reminders.cadence.inactivity'), hint: t('reminders.cadence.inactivity.hint') },
    { kind: 'once', label: t('reminders.cadence.once'), hint: t('reminders.cadence.once.hint') },
  ];
}

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
  const t = useT();
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
    toast({ variant: 'success', title: t('reminders.deleted') });
  }

  function handleSave() {
    if (!draft) return;
    const reminder = { ...draft, timeZone: localTimeZone() };
    if (isNew) {
      addReminder(reminder);
      toast({ variant: 'success', title: t('reminders.added'), description: describeCadence(reminder) });
    } else {
      updateReminder(reminder);
      toast({ variant: 'success', title: t('reminders.updated'), description: describeCadence(reminder) });
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
      title={draft ? (isNew ? t('reminders.newTitle') : t('reminders.editTitle')) : t('reminders.listTitle')}
      description={draft ? deckTitle : email ? t('reminders.emailedTo', { email }) : deckTitle}
      size="lg"
      footer={
        draft ? (
          <>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              {t('reminders.cancel')}
            </Button>
            <Button onClick={handleSave} disabled={incomplete}>
              {isNew ? t('reminders.addReminder') : t('reminders.saveChanges')}
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="outline"
              className="mr-auto"
              onClick={startAdding}
              disabled={isFull}
              title={isFull ? t('reminders.limitHint', { max: MAX_REMINDERS_PER_DECK }) : undefined}
            >
              {t('reminders.addReminderButton')}
            </Button>
            <Button onClick={onClose}>{t('reminders.done')}</Button>
          </>
        )
      }
    >
      {draft ? (
        <ReminderEditor
          t={t}
          draft={draft}
          onChange={setDraft}
          lastStudiedAt={lastStudiedAt}
          now={now}
        />
      ) : (
        <ReminderList
          t={t}
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
  t,
  reminders,
  now,
  lastStudiedAt,
  isFull,
  onAdd,
  onEdit,
  onDelete,
}: {
  t: Translator;
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
          {t('reminders.emptyTitle')}
        </p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">
          {t('reminders.emptyBody')}
        </p>
        <Button className="mt-4" onClick={onAdd}>
          {t('reminders.addReminderButton')}
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
                {next ? t('reminders.nextEmail', { when: formatNextReminder(next, now) }) : t('reminders.alreadySent')}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button size="sm" variant="ghost" onClick={() => onEdit(reminder)}>
                {t('reminders.edit')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onDelete(reminder)}
                className="text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"
              >
                {t('reminders.delete')}
              </Button>
            </div>
          </div>
        );
      })}
      <p className="pt-1 text-xs text-slate-400">
        {isFull
          ? t('reminders.limitReached', { max: MAX_REMINDERS_PER_DECK })
          : t('reminders.usedOf', { used: reminders.length, max: MAX_REMINDERS_PER_DECK })}
      </p>
    </div>
  );
}

function ReminderEditor({
  t,
  draft,
  onChange,
  lastStudiedAt,
  now,
}: {
  t: Translator;
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
        <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">{t('reminders.howOften')}</p>
        <div className="flex flex-wrap gap-2">
          {cadenceOptions(t).map((option) => (
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
          {cadenceOptions(t).find((o) => o.kind === draft.cadence.kind)?.hint}
        </p>
      </section>

      {/* At most one of these ever shows — the extra control the chosen cadence
          needs, and nothing more. */}
      {draft.cadence.kind === 'weekly' && (
        <section>
          <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">{t('reminders.whichDays')}</p>
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
        <Field label={t('reminders.dayOfMonth')} hint={t('reminders.dayOfMonthHint')}>
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
        <Field label={t('reminders.nudgeAfter')} hint={t('reminders.nudgeAfterHint')}>
          <Select
            className="w-auto"
            value={draft.cadence.afterDays}
            onChange={(e) => patch({ cadence: { kind: 'inactivity', afterDays: Number(e.target.value) } })}
          >
            {INACTIVITY_DAY_CHOICES.map((days) => (
              <option key={days} value={days}>
                {t('reminders.daysWithoutStudying', { days })}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {draft.cadence.kind === 'once' && (
        <Field label={t('reminders.onThisDate')}>
          <Input
            type="date"
            className="w-auto"
            min={toDateInput(new Date())}
            value={draft.cadence.date}
            onChange={(e) => patch({ cadence: { kind: 'once', date: e.target.value } })}
          />
        </Field>
      )}

      <Field label={t('reminders.timeOfDay')} hint={draft.timeZone || localTimeZone()}>
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
          {next ? t('reminders.nextEmail', { when: formatNextReminder(next, now) }) : t('reminders.pickOneDay')}
        </p>
        {next && (
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{describeCadence(draft)}</p>
        )}
      </div>
    </div>
  );
}
