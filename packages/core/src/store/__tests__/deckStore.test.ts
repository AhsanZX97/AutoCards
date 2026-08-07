import { describe, expect, it } from 'vitest';
import { createMemoryStorage } from '../../lib/storage';
import { createDeckStore } from '../deckStore';
import type { SyncOp } from '../../types';

function setup() {
  const ops: SyncOp[] = [];
  const store = createDeckStore(createMemoryStorage(), (batch) => ops.push(...batch));
  const deck = store.getState().createBlankDeck('user_1', 'Biology');
  ops.length = 0;
  return { store, deck, ops };
}

describe('createDeckStore.updateDeck', () => {
  it('applies the patched fields and leaves the rest untouched', () => {
    const { store, deck } = setup();
    store.getState().updateDeck(deck.id, { title: 'Cell Biology', description: 'Chapter 3' });
    const updated = store.getState().getDeck(deck.id);
    expect(updated?.title).toBe('Cell Biology');
    expect(updated?.description).toBe('Chapter 3');
    expect(updated?.icon).toBe(deck.icon);
  });

  it('enqueues a deck upsert so the edit reaches the sync outbox', () => {
    const { store, deck, ops } = setup();
    store.getState().updateDeck(deck.id, { title: 'Renamed' });
    expect(ops).toEqual([{ kind: 'deck', id: deck.id, op: 'upsert' }]);
  });
});

describe('createDeckStore.updateCategory', () => {
  it('renames a category without touching its id', () => {
    const { store, deck } = setup();
    const category = store.getState().addCategory(deck.id, 'Mitosis', 'sky', '🧬');
    store.getState().updateCategory(deck.id, category.id, { name: 'Cell division' });
    const [updated] = store.getState().getDeck(deck.id)?.categories ?? [];
    expect(updated).toEqual({ id: category.id, name: 'Cell division', accent: 'sky', icon: '🧬' });
  });

  it('updates the icon and accent independently of the name', () => {
    const { store, deck } = setup();
    const category = store.getState().addCategory(deck.id, 'Mitosis', 'sky', '🧬');
    store.getState().updateCategory(deck.id, category.id, { accent: 'rose', icon: '🔬' });
    const [updated] = store.getState().getDeck(deck.id)?.categories ?? [];
    expect(updated?.name).toBe('Mitosis');
    expect(updated?.accent).toBe('rose');
    expect(updated?.icon).toBe('🔬');
  });

  it('leaves other categories in the deck alone', () => {
    const { store, deck } = setup();
    const first = store.getState().addCategory(deck.id, 'Mitosis', 'sky', '🧬');
    store.getState().addCategory(deck.id, 'Meiosis', 'amber', '🧫');
    store.getState().updateCategory(deck.id, first.id, { name: 'Cell division' });
    const names = store.getState().getDeck(deck.id)?.categories.map((c) => c.name);
    expect(names).toEqual(['Cell division', 'Meiosis']);
  });

  it('enqueues a deck upsert', () => {
    const { store, deck, ops } = setup();
    const category = store.getState().addCategory(deck.id, 'Mitosis', 'sky', '🧬');
    ops.length = 0;
    store.getState().updateCategory(deck.id, category.id, { name: 'Cell division' });
    expect(ops).toEqual([{ kind: 'deck', id: deck.id, op: 'upsert' }]);
  });

  it('ignores an unknown category id', () => {
    const { store, deck } = setup();
    const category = store.getState().addCategory(deck.id, 'Mitosis', 'sky', '🧬');
    store.getState().updateCategory(deck.id, 'cat_missing', { name: 'Nope' });
    expect(store.getState().getDeck(deck.id)?.categories).toEqual([category]);
  });
});

describe('createDeckStore.reorderCard', () => {
  function setupDeckWithCards() {
    const { store, deck, ops } = setup();
    const fronts = ['one', 'two', 'three'];
    const cards = fronts.map((front) =>
      store.getState().addCard(deck.id, {
        type: 'basic',
        front,
        back: front,
        difficulty: 'medium',
        priority: 'normal',
        tags: [],
        starred: false,
        suspended: false,
        weight: 1,
      }),
    );
    ops.length = 0;
    return { store, deck, ops, cards };
  }

  it('appends new cards in the order they were added', () => {
    const { store, deck } = setupDeckWithCards();
    expect(store.getState().getCards(deck.id).map((c) => c.front)).toEqual(['one', 'two', 'three']);
  });

  it('moves a card to the requested index', () => {
    const { store, deck, cards } = setupDeckWithCards();
    store.getState().reorderCard(deck.id, cards[2]!.id, 0);
    expect(store.getState().getCards(deck.id).map((c) => c.front)).toEqual(['three', 'one', 'two']);
  });

  it('enqueues a card upsert for each card that moved', () => {
    const { store, deck, ops, cards } = setupDeckWithCards();
    store.getState().reorderCard(deck.id, cards[0]!.id, 1);
    expect(ops).toEqual([
      { kind: 'card', id: cards[1]!.id, deckId: deck.id, op: 'upsert' },
      { kind: 'card', id: cards[0]!.id, deckId: deck.id, op: 'upsert' },
    ]);
  });

  it('does nothing when the card is already at the target index', () => {
    const { store, deck, ops, cards } = setupDeckWithCards();
    store.getState().reorderCard(deck.id, cards[1]!.id, 1);
    expect(ops).toEqual([]);
  });

  it('keeps a card added after a reorder at the end of the deck', () => {
    const { store, deck, cards } = setupDeckWithCards();
    store.getState().reorderCard(deck.id, cards[2]!.id, 0);
    store.getState().addCard(deck.id, {
      type: 'basic',
      front: 'four',
      back: 'four',
      difficulty: 'medium',
      priority: 'normal',
      tags: [],
      starred: false,
      suspended: false,
      weight: 1,
    });
    expect(store.getState().getCards(deck.id).map((c) => c.front)).toEqual([
      'three',
      'one',
      'two',
      'four',
    ]);
  });

  it('ignores a card id that is not in the deck', () => {
    const { store, deck, ops } = setupDeckWithCards();
    store.getState().reorderCard(deck.id, 'card_missing', 0);
    expect(store.getState().getCards(deck.id).map((c) => c.front)).toEqual(['one', 'two', 'three']);
    expect(ops).toEqual([]);
  });
});

describe('createDeckStore.deleteCategory', () => {
  it('clears the category from cards that referenced it', () => {
    const { store, deck } = setup();
    const category = store.getState().addCategory(deck.id, 'Mitosis', 'sky', '🧬');
    const card = store.getState().addCard(deck.id, {
      type: 'basic',
      front: 'What is prophase?',
      back: 'The first stage of mitosis.',
      difficulty: 'medium',
      priority: 'normal',
      tags: [],
      categoryId: category.id,
      starred: false,
      suspended: false,
      weight: 1,
    });
    store.getState().deleteCategory(deck.id, category.id);
    expect(store.getState().getDeck(deck.id)?.categories).toEqual([]);
    expect(store.getState().getCards(deck.id).find((c) => c.id === card.id)?.categoryId).toBeUndefined();
  });
});
