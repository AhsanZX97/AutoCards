import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createId } from '../lib/id';
import { nowIso } from '../lib/date';
import { STORAGE_KEYS, type StorageAdapter } from '../lib/storage';
import { toZustandStorage } from './persistBridge';
import {
  applyDraftToCard,
  computeDeckStats,
  computeMastery,
  createCardFromDraft,
  createDefaultStudySettings,
  materializeGeneratedCards,
  reviewCard as advanceSrs,
} from '../domain';
import type {
  Accent,
  CardDraft,
  Category,
  Deck,
  DeckStats,
  Flashcard,
  GenerationResult,
  Grade,
  Id,
} from '../types';

export interface DeckState {
  decks: Deck[];
  cardsByDeck: Record<Id, Flashcard[]>;

  createDeckFromGeneration: (result: GenerationResult, ownerId: Id) => Deck;
  createBlankDeck: (ownerId: Id, title: string, accent?: Accent, icon?: string) => Deck;
  updateDeck: (deckId: Id, patch: Partial<Pick<Deck, 'title' | 'description' | 'icon' | 'accent' | 'tags'>>) => void;
  archiveDeck: (deckId: Id, archived: boolean) => void;
  deleteDeck: (deckId: Id) => void;

  addCategory: (deckId: Id, name: string, accent: Accent, icon: string) => Category;
  deleteCategory: (deckId: Id, categoryId: Id) => void;

  addCard: (deckId: Id, draft: CardDraft) => Flashcard;
  updateCard: (deckId: Id, cardId: Id, draft: CardDraft) => void;
  deleteCard: (deckId: Id, cardId: Id) => void;
  deleteCards: (deckId: Id, cardIds: Id[]) => void;
  toggleStar: (deckId: Id, cardId: Id) => void;
  toggleSuspend: (deckId: Id, cardId: Id) => void;

  reviewCard: (deckId: Id, cardId: Id, grade: Grade, correct: boolean) => void;

  getDeck: (deckId: Id) => Deck | undefined;
  getCards: (deckId: Id) => Flashcard[];
  getDeckStats: (deckId: Id) => DeckStats;
}

export function createDeckStore(storage: StorageAdapter) {
  return create<DeckState>()(
    persist(
      (set, get) => ({
        decks: [],
        cardsByDeck: {},

        createDeckFromGeneration: (result, ownerId) => {
          const timestamp = nowIso();
          const deckId = createId('deck');
          const deck: Deck = {
            id: deckId,
            ownerId,
            title: result.deckTitle,
            description: result.deckDescription,
            icon: result.deckIcon,
            accent: 'indigo',
            tags: [],
            categories: result.categories,
            source: result.source,
            generatedBy: result.model,
            defaultSettings: createDefaultStudySettings(),
            archived: false,
            createdAt: timestamp,
            updatedAt: timestamp,
          };
          const cards = materializeGeneratedCards(deckId, result.cards).map((card) => ({
            ...card,
            deckId,
          }));
          set((state) => ({
            decks: [deck, ...state.decks],
            cardsByDeck: { ...state.cardsByDeck, [deckId]: cards },
          }));
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
          return deck;
        },

        updateDeck: (deckId, patch) => {
          set((state) => ({
            decks: state.decks.map((deck) =>
              deck.id === deckId ? { ...deck, ...patch, updatedAt: nowIso() } : deck,
            ),
          }));
        },

        archiveDeck: (deckId, archived) => {
          set((state) => ({
            decks: state.decks.map((deck) =>
              deck.id === deckId ? { ...deck, archived, updatedAt: nowIso() } : deck,
            ),
          }));
        },

        deleteDeck: (deckId) => {
          set((state) => {
            const { [deckId]: _removed, ...rest } = state.cardsByDeck;
            return {
              decks: state.decks.filter((deck) => deck.id !== deckId),
              cardsByDeck: rest,
            };
          });
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
          return category;
        },

        deleteCategory: (deckId, categoryId) => {
          set((state) => ({
            decks: state.decks.map((deck) =>
              deck.id === deckId
                ? {
                    ...deck,
                    categories: deck.categories.filter((c) => c.id !== categoryId),
                    updatedAt: nowIso(),
                  }
                : deck,
            ),
            cardsByDeck: {
              ...state.cardsByDeck,
              [deckId]: (state.cardsByDeck[deckId] ?? []).map((card) =>
                card.categoryId === categoryId ? { ...card, categoryId: undefined } : card,
              ),
            },
          }));
        },

        addCard: (deckId, draft) => {
          const card = createCardFromDraft(deckId, draft);
          set((state) => ({
            cardsByDeck: {
              ...state.cardsByDeck,
              [deckId]: [...(state.cardsByDeck[deckId] ?? []), card],
            },
          }));
          return card;
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
        },

        deleteCard: (deckId, cardId) => {
          set((state) => ({
            cardsByDeck: {
              ...state.cardsByDeck,
              [deckId]: (state.cardsByDeck[deckId] ?? []).filter((card) => card.id !== cardId),
            },
          }));
        },

        deleteCards: (deckId, cardIds) => {
          const idSet = new Set(cardIds);
          set((state) => ({
            cardsByDeck: {
              ...state.cardsByDeck,
              [deckId]: (state.cardsByDeck[deckId] ?? []).filter((card) => !idSet.has(card.id)),
            },
          }));
        },

        toggleStar: (deckId, cardId) => {
          set((state) => ({
            cardsByDeck: {
              ...state.cardsByDeck,
              [deckId]: (state.cardsByDeck[deckId] ?? []).map((card) =>
                card.id === cardId ? { ...card, starred: !card.starred } : card,
              ),
            },
          }));
        },

        toggleSuspend: (deckId, cardId) => {
          set((state) => ({
            cardsByDeck: {
              ...state.cardsByDeck,
              [deckId]: (state.cardsByDeck[deckId] ?? []).map((card) =>
                card.id === cardId ? { ...card, suspended: !card.suspended } : card,
              ),
            },
          }));
        },

        reviewCard: (deckId, cardId, grade, correct) => {
          set((state) => ({
            cardsByDeck: {
              ...state.cardsByDeck,
              [deckId]: (state.cardsByDeck[deckId] ?? []).map((card) => {
                if (card.id !== cardId) return card;
                const srs = advanceSrs(card.srs, grade);
                const timesSeen = card.timesSeen + 1;
                const timesCorrect = card.timesCorrect + (correct ? 1 : 0);
                return {
                  ...card,
                  srs,
                  timesSeen,
                  timesCorrect,
                  mastery: computeMastery(srs, timesSeen, timesCorrect),
                  updatedAt: nowIso(),
                };
              }),
            },
          }));
        },

        getDeck: (deckId) => get().decks.find((deck) => deck.id === deckId),
        getCards: (deckId) => get().cardsByDeck[deckId] ?? [],
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
