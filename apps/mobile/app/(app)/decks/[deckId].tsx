import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Share, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  DIFFICULTIES,
  PRIORITIES,
  buildDeckExport,
  cardTypeLabel,
  computeDeckStats,
  describeCadence,
  draftFromCard,
  hasCloze,
  isReminderActive,
  parseCloze,
  serializeDeckExport,
  shareUrlForDeck,
  type CardDraft,
  type Difficulty,
  type Flashcard,
} from '@autocards/core';
import { useApp } from '../../../src/lib/appContext';
import { useTheme, useDifficultyColors, usePriorityColors, spacing } from '../../../src/lib/theme';
import { toast } from '../../../src/lib/toastStore';
import { Badge, Button, Card, Chip, Field, ProgressBar, Screen } from '../../../src/components';
import { EMPTY_ARRAY } from '../../../src/lib/empty';
import { CardEditorModal } from '../../../src/features/decks/CardEditorModal';
import { DeckEditorModal, type DeckEdits } from '../../../src/features/decks/DeckEditorModal';
import { GenerateCardsModal } from '../../../src/features/decks/GenerateCardsModal';
import { DeckFlashcardView } from '../../../src/features/decks/DeckFlashcardView';
import { DeckRemindersModal } from '../../../src/features/decks/DeckRemindersModal';

/** Sentinel for the category filter, standing for "cards in no category". */
const UNCATEGORIZED = '__uncategorized__';

export default function DeckDetailScreen() {
  const { deckId } = useLocalSearchParams<{ deckId: string }>();
  const app = useApp();
  const theme = useTheme();
  const difficultyColors = useDifficultyColors();
  const priorityColors = usePriorityColors();

  const deck = app.deckStore((s) => (deckId ? s.getDeck(deckId) : undefined));
  const cards = app.deckStore((s) => (deckId ? s.cardsByDeck[deckId] ?? EMPTY_ARRAY : EMPTY_ARRAY));
  const addCard = app.deckStore((s) => s.addCard);
  const updateCard = app.deckStore((s) => s.updateCard);
  const deleteCard = app.deckStore((s) => s.deleteCard);
  const toggleStar = app.deckStore((s) => s.toggleStar);
  const toggleSuspend = app.deckStore((s) => s.toggleSuspend);
  const reorderCard = app.deckStore((s) => s.reorderCard);
  const updateDeck = app.deckStore((s) => s.updateDeck);
  const addCategory = app.deckStore((s) => s.addCategory);
  const updateCategory = app.deckStore((s) => s.updateCategory);
  const deleteCategory = app.deckStore((s) => s.deleteCategory);
  const archiveDeck = app.deckStore((s) => s.archiveDeck);
  const deleteDeck = app.deckStore((s) => s.deleteDeck);
  const clearReminders = app.reminderStore((s) => s.clearDeck);
  const reminders = app.reminderStore((s) => (deckId ? s.remindersByDeck[deckId] : undefined));

  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [difficultyFilter, setDifficultyFilter] = useState<Difficulty | 'all'>('all');
  const [starredOnly, setStarredOnly] = useState(false);
  const [suspendedOnly, setSuspendedOnly] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [deckEditorOpen, setDeckEditorOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [remindersOpen, setRemindersOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<Flashcard | null>(null);
  const [view, setView] = useState<'list' | 'flashcards'>('list');

  const stats = useMemo(() => computeDeckStats(cards), [cards]);

  // A dot on the bell whenever something is still coming. A one-off that has
  // been and gone leaves its row behind, so the count is of live reminders
  // rather than saved ones.
  const reminderStatus = useMemo(() => {
    const live = (reminders ?? EMPTY_ARRAY).filter((reminder) => isReminderActive(reminder));
    if (live.length === 0) return { label: 'Study reminders', dot: false };
    if (live.length === 1) return { label: `Reminder — ${describeCadence(live[0]!)}`, dot: true };
    return { label: `${live.length} reminders set`, dot: true };
  }, [reminders]);

  // `cards` is stored in deck order, so a card's index is its place in the deck.
  const indexById = useMemo(() => new Map(cards.map((card, index) => [card.id, index])), [cards]);

  const filteredCards = useMemo(() => {
    return cards.filter((card) => {
      if (categoryFilter === UNCATEGORIZED) {
        if (card.categoryId) return false;
      } else if (categoryFilter && card.categoryId !== categoryFilter) {
        return false;
      }
      if (starredOnly && !card.starred) return false;
      if (suspendedOnly && !card.suspended) return false;
      if (difficultyFilter !== 'all' && card.difficulty !== difficultyFilter) return false;
      if (!query) return true;
      const q = query.toLowerCase();
      return card.front.toLowerCase().includes(q) || card.back.toLowerCase().includes(q) || card.clozeText?.toLowerCase().includes(q);
    });
  }, [cards, categoryFilter, difficultyFilter, query, starredOnly, suspendedOnly]);

  const categoryCounts = useMemo(() => {
    const byCategory = new Map<string, number>();
    let uncategorized = 0;
    for (const card of cards) {
      if (card.categoryId) byCategory.set(card.categoryId, (byCategory.get(card.categoryId) ?? 0) + 1);
      else uncategorized += 1;
    }
    return { byCategory, uncategorized };
  }, [cards]);

  const isFiltered =
    query.trim() !== '' || categoryFilter !== null || difficultyFilter !== 'all' || starredOnly || suspendedOnly;

  if (!deck || !deckId) {
    return (
      <Screen>
        <Text style={{ color: theme.textMuted }}>Deck not found.</Text>
      </Screen>
    );
  }
  const currentDeck = deck;

  function openNewCard() {
    setEditingCard(null);
    setEditorOpen(true);
  }

  function openEditCard(card: Flashcard) {
    setEditingCard(card);
    setEditorOpen(true);
  }

  function handleSaveCard(draft: CardDraft) {
    if (editingCard) {
      updateCard(deckId!, editingCard.id, draft);
      toast({ variant: 'success', title: 'Card updated' });
    } else {
      addCard(deckId!, draft);
      toast({ variant: 'success', title: 'Card added' });
    }
    setEditorOpen(false);
  }

  function cyclePriority(card: Flashcard) {
    const next = PRIORITIES[(PRIORITIES.indexOf(card.priority) + 1) % PRIORITIES.length]!;
    updateCard(deckId!, card.id, { ...draftFromCard(card), priority: next });
  }

  function handleSaveDeck(edits: DeckEdits) {
    const existing = currentDeck.categories;
    updateDeck(deckId!, {
      title: edits.title,
      description: edits.description,
      icon: edits.icon,
      accent: edits.accent,
      tags: edits.tags,
    });

    const keptIds = new Set(edits.categories.map((c) => c.id));
    for (const removed of existing.filter((c) => !keptIds.has(c.id))) {
      deleteCategory(deckId!, removed.id);
    }
    for (const next of edits.categories) {
      const prev = existing.find((c) => c.id === next.id);
      if (!prev) {
        addCategory(deckId!, next.name, next.accent, next.icon);
      } else if (prev.name !== next.name || prev.accent !== next.accent || prev.icon !== next.icon) {
        updateCategory(deckId!, next.id, { name: next.name, accent: next.accent, icon: next.icon });
      }
    }

    if (categoryFilter && !keptIds.has(categoryFilter)) setCategoryFilter(null);

    setDeckEditorOpen(false);
    toast({ variant: 'success', title: 'Deck updated' });
  }

  function confirmDelete(card: Flashcard) {
    Alert.alert('Delete card', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteCard(deckId!, card.id) },
    ]);
  }

  function handleArchiveDeck() {
    const next = !currentDeck.archived;
    archiveDeck(deckId!, next);
    setDeckEditorOpen(false);
    toast({ variant: 'success', title: next ? 'Deck archived' : 'Deck restored' });
  }

  function handleDeleteDeck() {
    Alert.alert('Delete deck', `Delete "${currentDeck.title}" and all ${cards.length} of its cards? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteDeck(deckId!);
          clearReminders(deckId!);
          setDeckEditorOpen(false);
          toast({ variant: 'success', title: 'Deck deleted' });
          router.back();
        },
      },
    ]);
  }

  function clearFilters() {
    setQuery('');
    setCategoryFilter(null);
    setDifficultyFilter('all');
    setStarredOnly(false);
    setSuspendedOnly(false);
  }

  function handleAddCard() {
    Alert.alert('Add card', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: '✍️ Write one myself', onPress: openNewCard },
      { text: '📄 Generate from a document', onPress: () => setGenerateOpen(true) },
    ]);
  }

  async function handleShare() {
    const payload = buildDeckExport(currentDeck, cards);
    try {
      await Share.share({
        title: `${payload.title} — Auto Cards`,
        message: `Study "${payload.title}" (${payload.cards.length} cards) on Auto Cards: ${shareUrlForDeck(
          payload,
          'https://autocards.study/app/decks',
        )}`,
      });
    } catch {
      // User dismissed the share sheet.
    }
  }

  async function handleExport() {
    const payload = buildDeckExport(currentDeck, cards);
    try {
      await Share.share({ title: payload.title, message: serializeDeckExport(payload) });
    } catch {
      // User dismissed the share sheet.
    }
  }

  const emptyState = (
    <Card>
      <Text style={{ textAlign: 'center', color: theme.textMuted }}>
        {cards.length === 0 ? 'No cards yet. Add your first one.' : 'No cards match your filters.'}
      </Text>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.md }}>
        {cards.length > 0 ? (
          <Button title="Clear filters" variant="outline" size="sm" onPress={clearFilters} />
        ) : (
          <>
            <Button title="✍️ Write one" variant="outline" size="sm" onPress={openNewCard} />
            <Button title="📄 Generate" size="sm" onPress={() => setGenerateOpen(true)} />
          </>
        )}
      </View>
    </Card>
  );

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md }}>
        <Text style={{ fontSize: 32 }}>{deck.icon}</Text>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: theme.text }}>{deck.title}</Text>
            {deck.archived && <Badge label="Archived" color={theme.warning} softColor={theme.warningSoft} />}
          </View>
          <Text style={{ fontSize: 13, color: theme.textMuted }} numberOfLines={2}>
            {deck.description}
          </Text>
        </View>
        <Pressable
          onPress={() => setRemindersOpen(true)}
          accessibilityLabel={reminderStatus.label}
          style={{ padding: spacing.sm }}
        >
          <Text style={{ fontSize: 18 }}>🔔</Text>
          {reminderStatus.dot && (
            <View
              style={{
                position: 'absolute',
                top: 4,
                right: 4,
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: theme.success,
              }}
            />
          )}
        </Pressable>
        <Pressable onPress={() => setDeckEditorOpen(true)} accessibilityLabel="Edit deck" style={{ padding: spacing.sm }}>
          <Text style={{ fontSize: 18 }}>✏️</Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg, flexWrap: 'wrap' }}>
        <Button title="Add card" variant="outline" onPress={handleAddCard} style={{ flexGrow: 1 }} />
        <Button title="Share" variant="outline" onPress={handleShare} style={{ flexGrow: 1 }} />
        <Button title="Export" variant="outline" onPress={handleExport} style={{ flexGrow: 1 }} />
        <Button
          title="Study now"
          onPress={() => router.push(`/study/${deckId}/setup`)}
          disabled={stats.total === 0}
          style={{ flexGrow: 1.5 }}
        />
      </View>

      <Text style={{ fontSize: 13, fontWeight: '600', color: theme.textMuted, marginBottom: spacing.sm }}>Progress</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
        <MiniStat label="Cards" value={stats.total} theme={theme} />
        <MiniStat label="New" value={stats.new} theme={theme} />
        <MiniStat label="Learning" value={stats.learning} theme={theme} />
        <MiniStat label="Mastered" value={stats.mastered} theme={theme} />
        <MiniStat label="Avg mastery" value={`${stats.averageMastery}%`} theme={theme} />
      </View>

      {deck.categories.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.sm }}>
          <Chip label={`All categories (${cards.length})`} active={categoryFilter === null} onPress={() => setCategoryFilter(null)} />
          {deck.categories.map((cat) => (
            <Chip
              key={cat.id}
              label={`${cat.icon} ${cat.name} (${categoryCounts.byCategory.get(cat.id) ?? 0})`}
              active={categoryFilter === cat.id}
              onPress={() => setCategoryFilter(cat.id)}
            />
          ))}
          {categoryCounts.uncategorized > 0 && (
            <Chip
              label={`Uncategorized (${categoryCounts.uncategorized})`}
              active={categoryFilter === UNCATEGORIZED}
              onPress={() => setCategoryFilter(UNCATEGORIZED)}
            />
          )}
        </View>
      )}

      <Field label="" placeholder="Search cards…" value={query} onChangeText={setQuery} style={{ marginBottom: spacing.xs }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginBottom: spacing.sm }}>
        <Chip label="Any difficulty" active={difficultyFilter === 'all'} onPress={() => setDifficultyFilter('all')} />
        {DIFFICULTIES.map((d) => (
          <Chip key={d} label={d[0]!.toUpperCase() + d.slice(1)} active={difficultyFilter === d} onPress={() => setDifficultyFilter(d)} />
        ))}
        <Chip label="⭐ Starred" active={starredOnly} onPress={() => setStarredOnly((v) => !v)} />
        <Chip label="⏸ Suspended" active={suspendedOnly} onPress={() => setSuspendedOnly((v) => !v)} />
      </View>
      {isFiltered && (
        <Pressable onPress={clearFilters} style={{ marginBottom: spacing.sm }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: theme.primaryText }}>Clear filters</Text>
        </Pressable>
      )}

      <View style={{ flexDirection: 'row', marginBottom: spacing.md }}>
        <Chip label="☰ List" active={view === 'list'} onPress={() => setView('list')} />
        <Chip label="🃏 Flashcards" active={view === 'flashcards'} onPress={() => setView('flashcards')} />
      </View>

      {isFiltered && cards.length > 0 && (
        <Text style={{ fontSize: 12, color: theme.textFaint, marginBottom: spacing.sm }}>
          Showing {filteredCards.length} of {cards.length} cards
        </Text>
      )}

      {view === 'flashcards' ? (
        <DeckFlashcardView cards={filteredCards} deckCards={cards} emptyState={emptyState} />
      ) : filteredCards.length === 0 ? (
        emptyState
      ) : (
        <View style={{ gap: spacing.sm }}>
          {filteredCards.map((card) => (
            <CardRow
              key={card.id}
              card={card}
              position={(indexById.get(card.id) ?? 0) + 1}
              total={cards.length}
              onMoveTo={(next) => reorderCard(deckId!, card.id, next - 1)}
              onEdit={() => openEditCard(card)}
              onDelete={() => confirmDelete(card)}
              onToggleStar={() => toggleStar(deckId!, card.id)}
              onToggleSuspend={() => toggleSuspend(deckId!, card.id)}
              onCyclePriority={() => cyclePriority(card)}
            />
          ))}
        </View>
      )}

      <CardEditorModal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSave={handleSaveCard}
        initial={editingCard ? draftFromCard(editingCard) : null}
        categories={deck.categories}
      />
      <DeckEditorModal
        open={deckEditorOpen}
        onClose={() => setDeckEditorOpen(false)}
        onSave={handleSaveDeck}
        onArchive={handleArchiveDeck}
        onDelete={handleDeleteDeck}
        deck={deck}
      />
      <GenerateCardsModal open={generateOpen} onClose={() => setGenerateOpen(false)} deck={deck} cards={cards} />
      <DeckRemindersModal
        open={remindersOpen}
        onClose={() => setRemindersOpen(false)}
        deckId={deckId}
        deckTitle={deck.title}
      />
    </Screen>
  );
}

function MiniStat({ label, value, theme }: { label: string; value: number | string; theme: ReturnType<typeof useTheme> }) {
  return (
    <Card style={{ flexBasis: '30%', flexGrow: 1, alignItems: 'center', paddingVertical: spacing.sm }}>
      <Text style={{ fontSize: 18, fontWeight: '800', color: theme.text }}>{value}</Text>
      <Text style={{ fontSize: 10, color: theme.textFaint }}>{label}</Text>
    </Card>
  );
}

function CardRow({
  card,
  position,
  total,
  onMoveTo,
  onEdit,
  onDelete,
  onToggleStar,
  onToggleSuspend,
  onCyclePriority,
}: {
  card: Flashcard;
  /** 1-based place in the deck, which is what the number box shows and takes. */
  position: number;
  total: number;
  onMoveTo: (position: number) => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleStar: () => void;
  onToggleSuspend: () => void;
  onCyclePriority: () => void;
}) {
  const theme = useTheme();
  const difficultyColors = useDifficultyColors();
  const priorityColors = usePriorityColors();
  const [positionInput, setPositionInput] = useState(String(position));
  const [answerShown, setAnswerShown] = useState(false);

  useEffect(() => setPositionInput(String(position)), [position]);

  const isCloze = card.type === 'cloze' && card.clozeText && hasCloze(card.clozeText);
  const displayFront = isCloze ? parseCloze(card.clozeText!).prompt : card.front;
  const displayBack = isCloze ? parseCloze(card.clozeText!).answer : card.back;

  function commitPosition() {
    const parsed = Number.parseInt(positionInput, 10);
    const target = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), total) : position;
    setPositionInput(String(target));
    if (target !== position) onMoveTo(target);
  }

  return (
    <Card style={card.suspended ? { opacity: 0.6 } : undefined}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
        <View style={{ alignItems: 'center' }}>
          <TextInput
            value={positionInput}
            onChangeText={setPositionInput}
            onEndEditing={commitPosition}
            keyboardType="number-pad"
            accessibilityLabel="Card number"
            style={{
              width: 34,
              textAlign: 'center',
              fontSize: 11,
              fontWeight: '700',
              color: theme.textMuted,
              borderWidth: 1,
              borderColor: theme.border,
              borderRadius: 6,
              paddingVertical: 3,
            }}
          />
        </View>
        <Pressable onPress={onToggleStar}>
          <Text style={{ fontSize: 16 }}>{card.starred ? '⭐' : '☆'}</Text>
        </Pressable>
        <Pressable style={{ flex: 1 }} onPress={() => setAnswerShown((v) => !v)}>
          <Text
            style={{ fontSize: 14, fontWeight: '600', color: theme.text }}
            numberOfLines={answerShown ? undefined : 2}
          >
            {displayFront}
          </Text>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            <Badge label={cardTypeLabel(card.type)} color={theme.textMuted} softColor={theme.surfaceAlt} />
            <Badge
              label={card.difficulty}
              color={difficultyColors[card.difficulty]}
              softColor={`${difficultyColors[card.difficulty]}22`}
            />
            <Pressable onPress={onCyclePriority}>
              <Badge
                label={card.priority}
                color={priorityColors[card.priority]}
                softColor={`${priorityColors[card.priority]}22`}
              />
            </Pressable>
            {card.suspended && <Badge label="Suspended" color={theme.warning} softColor={theme.warningSoft} />}
          </View>
          <View style={{ marginTop: spacing.sm }}>
            <ProgressBar value={card.mastery} max={100} />
          </View>

          {answerShown && (
            <View
              style={{
                marginTop: spacing.sm,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: theme.primary,
                backgroundColor: theme.primarySoft,
                padding: spacing.sm,
              }}
            >
              <Text style={{ fontSize: 10, fontWeight: '700', color: theme.primaryText, textTransform: 'uppercase' }}>
                Answer
              </Text>
              <Text style={{ marginTop: 4, fontSize: 13, color: theme.text }}>
                {displayBack || 'No answer set.'}
              </Text>
              {card.explanation && (
                <Text style={{ marginTop: 6, fontSize: 12, color: theme.textMuted }}>{card.explanation}</Text>
              )}
            </View>
          )}
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.md, marginTop: spacing.sm }}>
        <Pressable onPress={onToggleSuspend}>
          <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '600' }}>
            {card.suspended ? 'Resume' : 'Suspend'}
          </Text>
        </Pressable>
        <Pressable onPress={onEdit}>
          <Text style={{ color: theme.primaryText, fontSize: 12, fontWeight: '600' }}>Edit</Text>
        </Pressable>
        <Pressable onPress={onDelete}>
          <Text style={{ color: theme.danger, fontSize: 12, fontWeight: '600' }}>Delete</Text>
        </Pressable>
      </View>
    </Card>
  );
}
