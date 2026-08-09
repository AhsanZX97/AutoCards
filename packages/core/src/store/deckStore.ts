import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createId } from '../lib/id';
import { nowIso } from '../lib/date';
import { STORAGE_KEYS, type StorageAdapter } from '../lib/storage';
import { toZustandStorage } from './persistBridge';
import { buildDeckExport, type DeckExport } from '../lib/deckTransfer';
import {
  applyDraftToCard,
  computeDeckStats,
  computeMastery,
  createCardFromDraft,
  createDefaultStudySettings,
  dropDuplicateCards,
  materializeGeneratedCards,
  nextPosition,
  reorderCards,
  sortCardsByPosition,
} from '../domain';
import type {
  Accent,
  CardDraft,
  Category,
  Deck,
  DeckStats,
  Flashcard,
  GeneratedCard,
  GenerationResult,
  Id,
  SyncOp,
} from '../types';

export interface AddGeneratedCardsResult {
  /** The cards that actually landed in the deck, in the order they were added. */
  added: Flashcard[];
  /** How many candidates were dropped for repeating a card the deck already had. */
  duplicates: number;
}

/**
 * What the person creating the deck called it, when they were asked.
 *
 * The generator still suggests a name off the filename, but a caller that put
 * the question to the user wins — including an empty description, which is a
 * choice rather than a gap. A blank title is the one thing not honoured: a deck
 * has to be findable in the library, so that falls back to the suggestion.
 */
export interface DeckDetails {
  title: string;
  description: string;
}

export interface DeckState {
  decks: Deck[];
  cardsByDeck: Record<Id, Flashcard[]>;

  createDeckFromGeneration: (result: GenerationResult, ownerId: Id, details?: DeckDetails) => Deck;
  createBlankDeck: (ownerId: Id, title: string, accent?: Accent, icon?: string) => Deck;
  importDeck: (payload: DeckExport, ownerId: Id) => Deck;
  updateDeck: (deckId: Id, patch: Partial<Pick<Deck, 'title' | 'description' | 'icon' | 'accent' | 'tags'>>) => void;
  archiveDeck: (deckId: Id, archived: boolean) => void;
  deleteDeck: (deckId: Id) => void;

  addCategory: (deckId: Id, name: string, accent: Accent, icon: string) => Category;
  updateCategory: (deckId: Id, categoryId: Id, patch: Partial<Omit<Category, 'id'>>) => void;
  deleteCategory: (deckId: Id, categoryId: Id) => void;

  addCard: (deckId: Id, draft: CardDraft) => Flashcard;
  /**
   * Appends a fresh batch of generated cards to a deck that already exists,
   * dropping any that repeat what is already there. `categories` are the ones
   * the generator invented for this batch; those matching a category the deck
   * already has are folded into it rather than added twice.
   */
  addGeneratedCards: (
    deckId: Id,
    cards: readonly GeneratedCard[],
    categories?: readonly Category[],
  ) => AddGeneratedCardsResult;
  updateCard: (deckId: Id, cardId: Id, draft: CardDraft) => void;
  deleteCard: (deckId: Id, cardId: Id) => void;
  deleteCards: (deckId: Id, cardIds: Id[]) => void;
  toggleStar: (deckId: Id, cardId: Id) => void;
  toggleSuspend: (deckId: Id, cardId: Id) => void;
  /** Moves a card to `toIndex` (0-based) in the deck's manual order. */
  reorderCard: (deckId: Id, cardId: Id, toIndex: number) => void;

  reviewCard: (deckId: Id, cardId: Id, correct: boolean) => void;

  /** Remote-merge entry points driven by the sync engine on pull. Unlike the
   *  local mutators above, none of these fire `onChange`, because they reflect
   *  remote truth rather than a local edit that needs pushing back up. */
  applyRemoteDeck: (deck: Deck) => void;
  applyRemoteDeleteDeck: (deckId: Id) => void;
  applyRemoteCard: (card: Flashcard) => void;
  applyRemoteDeleteCard: (deckId: Id, cardId: Id) => void;
  /** Empties local state without firing `onChange` — used on sign-out so a
   *  second account on the same device never starts from the first account's
   *  decks. */
  clear: () => void;

  getDeck: (deckId: Id) => Deck | undefined;
  getCards: (deckId: Id) => Flashcard[];
  getDeckExport: (deckId: Id) => DeckExport | undefined;
  getDeckStats: (deckId: Id) => DeckStats;
}

function deckOp(deckId: Id, op: 'upsert' | 'delete' = 'upsert'): SyncOp {
  return { kind: 'deck', id: deckId, op };
}

function cardOp(deckId: Id, cardId: Id, op: 'upsert' | 'delete' = 'upsert'): SyncOp {
  return { kind: 'card', id: cardId, deckId, op };
}

/**
 * `onChange` is how deck/card mutations reach the sync outbox — see
 * `createApp.ts`, which wires it to `syncStore.enqueue`. Every mutator below
 * calls it after `set()`, batched even for a single row, so a caller never
 * has to special-case a multi-row mutator like `deleteCards`.
 */
export function createDeckStore(storage: StorageAdapter, onChange: (ops: SyncOp[]) => void = () => {}) {
  return create<DeckState>()(
    persist(
      (set, get) => ({
        decks: [],
        cardsByDeck: {},

        createDeckFromGeneration: (result, ownerId, details) => {
          const timestamp = nowIso();
          const deckId = createId('deck');
          // A single pass restates itself often enough to be worth checking —
          // the model covers one section twice, or asks the same thing plainly
          // and again as a cloze. Same rule as `addGeneratedCards` applies.
          const { kept } = dropDuplicateCards(result.cards, []);
          const cards = materializeGeneratedCards(deckId, kept).map((card) => ({
            ...card,
            deckId,
          }));
          // A category left with no cards would render as an empty filter chip.
          const usedCategoryIds = new Set(cards.map((card) => card.categoryId).filter(Boolean));
          const deck: Deck = {
            id: deckId,
            ownerId,
            title: details?.title.trim() || result.deckTitle,
            description: details ? details.description.trim() : result.deckDescription,
            icon: result.deckIcon,
            accent: 'indigo',
            tags: [],
            categories: result.categories.filter((category) => usedCategoryIds.has(category.id)),
            sources: result.sources,
            generatedBy: result.model,
            defaultSettings: createDefaultStudySettings(),
            archived: false,
            createdAt: timestamp,
            updatedAt: timestamp,
          };
          set((state) => ({
            decks: [deck, ...state.decks],
            cardsByDeck: { ...state.cardsByDeck, [deckId]: cards },
          }));
          onChange([deckOp(deckId), ...cards.map((card) => cardOp(deckId, card.id))]);
          return deck;
        },

        createBlankDeck: (ownerId, title, accent = 'indigo', icon = '🗂️') => {
          const timestamp = nowIso();
          const deckId = createId('deck');
          const deck: Deck = {
            id: deckId,
            ownerId,
            title,
            description: '',
            icon,
            accent,
            tags: [],
            categories: [],
            defaultSettings: createDefaultStudySettings(),
            archived: false,
            createdAt: timestamp,
            updatedAt: timestamp,
          };
          set((state) => ({
            decks: [deck, ...state.decks],
            cardsByDeck: { ...state.cardsByDeck, [deckId]: [] },
          }));
          onChange([deckOp(deckId)]);
          return deck;
        },

        importDeck: (payload, ownerId) => {
          const timestamp = nowIso();
          const deckId = createId('deck');
          // Remap every id the shared deck carries so nothing can collide with
          // ids the receiving account already owns. The export strips mastery,
          // so `createCardFromDraft` is the right entry point.
          const categoryIdMap = new Map<string, string>();
          const categories = payload.categories.map((category) => {
            const id = createId('cat');
            categoryIdMap.set(category.id, id);
            return { ...category, id };
          });
          const cards = payload.cards.map((draft, index) => ({
            ...createCardFromDraft(deckId, {
              ...draft,
              categoryId: draft.categoryId ? categoryIdMap.get(draft.categoryId) : undefined,
            }),
            // The export carries order as the array order — keep it.
            position: index,
          }));
          const deck: Deck = {
            id: deckId,
            ownerId,
            title: payload.title,
            description: payload.description,
            icon: payload.icon,
            accent: payload.accent,
            tags: payload.tags,
            categories,
            defaultSettings: payload.defaultSettings,
            ...(payload.generatedBy ? { generatedBy: payload.generatedBy } : {}),
            archived: false,
            createdAt: timestamp,
            updatedAt: timestamp,
          };
          set((state) => ({
            decks: [deck, ...state.decks],
            cardsByDeck: { ...state.cardsByDeck, [deckId]: cards },
          }));
          onChange([deckOp(deckId), ...cards.map((card) => cardOp(deckId, card.id))]);
          return deck;
        },

        updateDeck: (deckId, patch) => {
          set((state) => ({
            decks: state.decks.map((deck) =>
              deck.id === deckId ? { ...deck, ...patch, updatedAt: nowIso() } : deck,
            ),
          }));
          onChange([deckOp(deckId)]);
        },

        archiveDeck: (deckId, archived) => {
          set((state) => ({
            decks: state.decks.map((deck) =>
              deck.id === deckId ? { ...deck, archived, updatedAt: nowIso() } : deck,
            ),
          }));
          onChange([deckOp(deckId)]);
        },

        deleteDeck: (deckId) => {
          set((state) => {
            const { [deckId]: _removed, ...rest } = state.cardsByDeck;
            return {
              decks: state.decks.filter((deck) => deck.id !== deckId),
              cardsByDeck: rest,
            };
          });
          // Cards are cascade-tombstoned server-side once the deck delete
          // lands (see `decks_cascade_delete` in supabase/schema.sql), so
          // only the deck op needs to be enqueued here.
          onChange([deckOp(deckId, 'delete')]);
        },

        addCategory: (deckId, name, accent, icon) => {
          const category: Category = { id: createId('cat'), name, accent, icon };
          set((state) => ({
            decks: state.decks.map((deck) =>
              deck.id === deckId
                ? { ...deck, categories: [...deck.categories, category], updatedAt: nowIso() }
                : deck,
            ),
          }));
          onChange([deckOp(deckId)]);
          return category;
        },

        updateCategory: (deckId, categoryId, patch) => {
          set((state) => ({
            decks: state.decks.map((deck) =>
              deck.id === deckId
                ? {
                    ...deck,
                    categories: deck.categories.map((category) =>
                      category.id === categoryId ? { ...category, ...patch } : category,
                    ),
                    updatedAt: nowIso(),
                  }
                : deck,
            ),
          }));
          onChange([deckOp(deckId)]);
        },

        deleteCategory: (deckId, categoryId) => {
          const timestamp = nowIso();
          const affectedCardIds: Id[] = [];
          set((state) => ({
            decks: state.decks.map((deck) =>
              deck.id === deckId
                ? {
                    ...deck,
                    categories: deck.categories.filter((c) => c.id !== categoryId),
                    updatedAt: timestamp,
                  }
                : deck,
            ),
            cardsByDeck: {
              ...state.cardsByDeck,
              [deckId]: (state.cardsByDeck[deckId] ?? []).map((card) => {
                if (card.categoryId !== categoryId) return card;
                affectedCardIds.push(card.id);
                return { ...card, categoryId: undefined, updatedAt: timestamp };
              }),
            },
          }));
          onChange([deckOp(deckId), ...affectedCardIds.map((cardId) => cardOp(deckId, cardId))]);
        },

        addCard: (deckId, draft) => {
          const existing = get().cardsByDeck[deckId] ?? [];
          const card: Flashcard = {
            ...createCardFromDraft(deckId, draft),
            position: nextPosition(existing),
          };
          set((state) => ({
            cardsByDeck: {
              ...state.cardsByDeck,
              [deckId]: [...(state.cardsByDeck[deckId] ?? []), card],
            },
          }));
          onChange([cardOp(deckId, card.id)]);
          return card;
        },

        addGeneratedCards: (deckId, cards, categories = []) => {
          const deck = get().decks.find((d) => d.id === deckId);
          if (!deck) return { added: [], duplicates: 0 };

          const existing = get().cardsByDeck[deckId] ?? [];
          const { kept, duplicates } = dropDuplicateCards(cards, existing);
          if (kept.length === 0) return { added: [], duplicates: duplicates.length };

          // A generated category that names one the deck already has is the same
          // category — folding them together is what keeps a second pass from
          // splitting "Transport" across two chips.
          const byName = new Map(deck.categories.map((category) => [category.name.trim().toLowerCase(), category]));
          const addedCategories: Category[] = [];
          const categoryIdMap = new Map<Id, Id>();
          for (const category of categories) {
            const match = byName.get(category.name.trim().toLowerCase());
            if (match) {
              categoryIdMap.set(category.id, match.id);
            } else {
              byName.set(category.name.trim().toLowerCase(), category);
              addedCategories.push(category);
              categoryIdMap.set(category.id, category.id);
            }
          }

          const timestamp = nowIso();
          const offset = nextPosition(existing);
          const added = materializeGeneratedCards(deckId, kept).map((card) => {
            const categoryId = card.categoryId ? categoryIdMap.get(card.categoryId) : undefined;
            return {
              ...card,
              // `materializeGeneratedCards` numbers from zero; these cards go
              // after everything the deck already holds.
              position: (card.position ?? 0) + offset,
              ...(card.categoryId ? { categoryId } : {}),
            };
          });

          // A category whose every card was dropped as a duplicate would show up
          // as an empty filter chip, so only keep the ones still in use.
          const usedCategoryIds = new Set(added.map((card) => card.categoryId).filter(Boolean));
          const keptCategories = addedCategories.filter((category) => usedCategoryIds.has(category.id));

          set((state) => ({
            decks: keptCategories.length
              ? state.decks.map((d) =>
                  d.id === deckId
                    ? { ...d, categories: [...d.categories, ...keptCategories], updatedAt: timestamp }
                    : d,
                )
              : state.decks,
            cardsByDeck: {
              ...state.cardsByDeck,
              [deckId]: [...(state.cardsByDeck[deckId] ?? []), ...added],
            },
          }));

          onChange([
            ...(keptCategories.length ? [deckOp(deckId)] : []),
            ...added.map((card) => cardOp(deckId, card.id)),
          ]);
          return { added, duplicates: duplicates.length };
        },

        updateCard: (deckId, cardId, draft) => {
          set((state) => ({
            cardsByDeck: {
              ...state.cardsByDeck,
              [deckId]: (state.cardsByDeck[deckId] ?? []).map((card) =>
                card.id === cardId ? applyDraftToCard(card, draft) : card,
              ),
            },
          }));
          onChange([cardOp(deckId, cardId)]);
        },

        deleteCard: (deckId, cardId) => {
          set((state) => ({
            cardsByDeck: {
              ...state.cardsByDeck,
              [deckId]: (state.cardsByDeck[deckId] ?? []).filter((card) => card.id !== cardId),
            },
          }));
          onChange([cardOp(deckId, cardId, 'delete')]);
        },

        deleteCards: (deckId, cardIds) => {
          const idSet = new Set(cardIds);
          set((state) => ({
            cardsByDeck: {
              ...state.cardsByDeck,
              [deckId]: (state.cardsByDeck[deckId] ?? []).filter((card) => !idSet.has(card.id)),
            },
          }));
          onChange(cardIds.map((cardId) => cardOp(deckId, cardId, 'delete')));
        },

        toggleStar: (deckId, cardId) => {
          set((state) => ({
            cardsByDeck: {
              ...state.cardsByDeck,
              [deckId]: (state.cardsByDeck[deckId] ?? []).map((card) =>
                card.id === cardId ? { ...card, starred: !card.starred, updatedAt: nowIso() } : card,
              ),
            },
          }));
          onChange([cardOp(deckId, cardId)]);
        },

        toggleSuspend: (deckId, cardId) => {
          set((state) => ({
            cardsByDeck: {
              ...state.cardsByDeck,
              [deckId]: (state.cardsByDeck[deckId] ?? []).map((card) =>
                card.id === cardId ? { ...card, suspended: !card.suspended, updatedAt: nowIso() } : card,
              ),
            },
          }));
          onChange([cardOp(deckId, cardId)]);
        },

        reorderCard: (deckId, cardId, toIndex) => {
          const { cards, changedIds } = reorderCards(get().cardsByDeck[deckId] ?? [], cardId, toIndex);
          if (changedIds.length === 0) return;
          set((state) => ({ cardsByDeck: { ...state.cardsByDeck, [deckId]: cards } }));
          onChange(changedIds.map((id) => cardOp(deckId, id)));
        },

        reviewCard: (deckId, cardId, correct) => {
          set((state) => ({
            cardsByDeck: {
              ...state.cardsByDeck,
              [deckId]: (state.cardsByDeck[deckId] ?? []).map((card) => {
                if (card.id !== cardId) return card;
                const timesSeen = card.timesSeen + 1;
                const timesCorrect = card.timesCorrect + (correct ? 1 : 0);
                return {
                  ...card,
                  timesSeen,
                  timesCorrect,
                  mastery: computeMastery(timesSeen, timesCorrect),
                  updatedAt: nowIso(),
                };
              }),
            },
          }));
          onChange([cardOp(deckId, cardId)]);
        },

        applyRemoteDeck: (deck) => {
          set((state) => ({
            decks: state.decks.some((d) => d.id === deck.id)
              ? state.decks.map((d) => (d.id === deck.id ? deck : d))
              : [deck, ...state.decks],
          }));
        },

        applyRemoteDeleteDeck: (deckId) => {
          set((state) => {
            const { [deckId]: _removed, ...cardsByDeck } = state.cardsByDeck;
            return { decks: state.decks.filter((d) => d.id !== deckId), cardsByDeck };
          });
        },

        applyRemoteCard: (card) => {
          set((state) => {
            const existing = state.cardsByDeck[card.deckId] ?? [];
            const present = existing.some((c) => c.id === card.id);
            const merged = present
              ? existing.map((c) => (c.id === card.id ? card : c))
              : [...existing, card];
            // Every reader treats the stored array as display order, so a card
            // arriving from another device has to land in its ordered slot
            // rather than at the end.
            return { cardsByDeck: { ...state.cardsByDeck, [card.deckId]: sortCardsByPosition(merged) } };
          });
        },

        applyRemoteDeleteCard: (deckId, cardId) => {
          set((state) => ({
            cardsByDeck: {
              ...state.cardsByDeck,
              [deckId]: (state.cardsByDeck[deckId] ?? []).filter((c) => c.id !== cardId),
            },
          }));
        },

        clear: () => set({ decks: [], cardsByDeck: {} }),

        getDeck: (deckId) => get().decks.find((deck) => deck.id === deckId),
        getCards: (deckId) => get().cardsByDeck[deckId] ?? [],
        getDeckExport: (deckId) => {
          const deck = get().decks.find((d) => d.id === deckId);
          if (!deck) return undefined;
          return buildDeckExport(deck, get().cardsByDeck[deckId] ?? []);
        },
        getDeckStats: (deckId) => computeDeckStats(get().cardsByDeck[deckId] ?? []),
      }),
      {
        name: STORAGE_KEYS.decks,
        storage: createJSONStorage(() => toZustandStorage(storage)),
        partialize: (state) => ({ decks: state.decks, cardsByDeck: state.cardsByDeck }),
      },
    ),
  );
}

export type DeckStore = ReturnType<typeof createDeckStore>;
