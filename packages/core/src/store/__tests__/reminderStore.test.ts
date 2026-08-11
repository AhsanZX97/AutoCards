import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryStorage } from '../../lib/storage';
import { createReminderStore } from '../reminderStore';
import { createReminder } from '../../domain/reminders';
import { MAX_REMINDERS_PER_DECK } from '../../types';

function freshStore() {
  return createReminderStore(createMemoryStorage());
}

describe('reminderStore', () => {
  let store: ReturnType<typeof freshStore>;

  beforeEach(() => {
    store = freshStore();
  });

  it('starts a deck with no reminders', () => {
    expect(store.getState().remindersFor('deck-1')).toEqual([]);
  });

  it('adds a reminder to its deck', () => {
    const added = store.getState().addReminder(createReminder('deck-1'));
    expect(added).toBe(true);
    expect(store.getState().remindersFor('deck-1')).toHaveLength(1);
  });

  it('keeps each deck’s reminders to itself', () => {
    store.getState().addReminder(createReminder('deck-1'));
    store.getState().addReminder(createReminder('deck-2'));
    expect(store.getState().remindersFor('deck-1')).toHaveLength(1);
    expect(store.getState().remindersFor('deck-2')).toHaveLength(1);
  });

  it(`refuses more than ${MAX_REMINDERS_PER_DECK} reminders on one deck`, () => {
    for (let i = 0; i < MAX_REMINDERS_PER_DECK; i += 1) {
      expect(store.getState().addReminder(createReminder('deck-1'))).toBe(true);
    }
    expect(store.getState().addReminder(createReminder('deck-1'))).toBe(false);
    expect(store.getState().remindersFor('deck-1')).toHaveLength(MAX_REMINDERS_PER_DECK);
  });

  it('repairs a cadence that could never be scheduled', () => {
    const draft = createReminder('deck-1');
    store.getState().addReminder({ ...draft, cadence: { kind: 'weekly', days: [] } });
    expect(store.getState().remindersFor('deck-1')[0]?.cadence).toEqual({
      kind: 'weekly',
      days: ['mon'],
    });
  });

  it('updates a reminder in place, leaving its neighbours alone', () => {
    const first = createReminder('deck-1');
    const second = createReminder('deck-1');
    store.getState().addReminder(first);
    store.getState().addReminder(second);

    store.getState().updateReminder({ ...second, timeOfDay: '07:30' });

    const saved = store.getState().remindersFor('deck-1');
    expect(saved).toHaveLength(2);
    expect(saved.find((r) => r.id === second.id)?.timeOfDay).toBe('07:30');
    expect(saved.find((r) => r.id === first.id)?.timeOfDay).toBe(first.timeOfDay);
  });

  it('keeps the original creation stamp when a reminder is edited', () => {
    const created = createReminder('deck-1', { now: new Date(2026, 0, 1) });
    store.getState().addReminder(created);
    store.getState().updateReminder({ ...created, createdAt: new Date().toISOString() });
    expect(store.getState().remindersFor('deck-1')[0]?.createdAt).toBe(created.createdAt);
  });

  it('ignores an update for a reminder that is not there', () => {
    store.getState().addReminder(createReminder('deck-1'));
    store.getState().updateReminder({ ...createReminder('deck-1'), timeOfDay: '07:30' });
    expect(store.getState().remindersFor('deck-1')).toHaveLength(1);
  });

  it('removes one reminder without touching the rest', () => {
    const first = createReminder('deck-1');
    const second = createReminder('deck-1');
    store.getState().addReminder(first);
    store.getState().addReminder(second);

    store.getState().removeReminder('deck-1', first.id);

    const saved = store.getState().remindersFor('deck-1');
    expect(saved).toHaveLength(1);
    expect(saved[0]?.id).toBe(second.id);
  });

  it('drops the deck entirely once its last reminder goes', () => {
    const only = createReminder('deck-1');
    store.getState().addReminder(only);
    store.getState().removeReminder('deck-1', only.id);
    expect(store.getState().remindersByDeck['deck-1']).toBeUndefined();
  });

  it('clears every reminder on a deck, for when the deck itself is deleted', () => {
    store.getState().addReminder(createReminder('deck-1'));
    store.getState().addReminder(createReminder('deck-1'));
    store.getState().clearDeck('deck-1');
    expect(store.getState().remindersFor('deck-1')).toEqual([]);
  });

  it('counts only the reminders that still have an email ahead of them', () => {
    const now = new Date(2026, 7, 11, 9, 0);
    store.getState().addReminder(createReminder('deck-1'));
    store.getState().addReminder({
      ...createReminder('deck-1'),
      cadence: { kind: 'once', date: '2026-01-01' },
    });
    expect(store.getState().activeCountFor('deck-1', now)).toBe(1);
  });
});
