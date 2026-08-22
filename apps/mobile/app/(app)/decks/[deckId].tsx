import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  DIFFICULTIES,
  PRIORITIES,
  buildDeckExport,
  computeDeckStats,
  describeCadence,
  draftFromCard,
  hasCloze,
  isReminderActive,
  isRetiredCardType,
  parseCloze,
  shareUrlForDeck,
  type CardDraft,
  type CardType,
  type Difficulty,
  type Flashcard,
  type Translator,
} from '@autocards/core';
import { useApp } from '../../../src/lib/appContext';
import { useT } from '../../../src/lib/i18n';
import { useTheme, useDifficultyColors, usePriorityColors, BRAND_GRADIENT, cardShadow, glowShadow, radius, spacing } from '../../../src/lib/theme';
import { toast } from '../../../src/lib/toastStore';

/** Label for a type read back off a stored card, retired ones included — see `cardTypeLabel` in core. */
function cardTypeLabelT(t: Translator, type: string): string {
  const key = (isRetiredCardType(type) ? 'basic' : type) as CardType;
  return t(`cardType.${key}` as const);
}
import {
  BackIcon,
  Badge,
  Button,
  Card,
  Chip,
  FilterIcon,
  IconButton,
  IconTile,
  Modal,
  MoreIcon,
  PlayIcon,
  ProgressBar,
  Screen,
  SearchIcon,
  ShareIcon,
} from '../../../src/components';
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
  const t = useT();
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
  const [actionsOpen, setActionsOpen] = useState(false);
  const [addCardOpen, setAddCardOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<Flashcard | null>(null);
  const [view, setView] = useState<'list' | 'flashcards'>('flashcards');

  const stats = useMemo(() => computeDeckStats(cards), [cards]);

  // A dot on the bell whenever something is still coming. A one-off that has
  // been and gone leaves its row behind, so the count is of live reminders
  // rather than saved ones.
  const reminderStatus = useMemo(() => {
    const live = (reminders ?? EMPTY_ARRAY).filter((reminder) => isReminderActive(reminder));
    if (live.length === 0) return { label: t('deckDetail.studyReminders'), dot: false };
    if (live.length === 1) return { label: t('deckDetail.reminderNamed', { cadence: describeCadence(live[0]!) }), dot: true };
    return { label: t.plural('deckDetail.remindersSet', live.length, { count: live.length }), dot: true };
  }, [reminders, t]);

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
  const filterButtonActive = filtersOpen || difficultyFilter !== 'all' || starredOnly || suspendedOnly;

  if (!deck || !deckId) {
    return (
      <Screen>
        <Text style={{ color: theme.textMuted }}>{t('deckDetail.notFound')}</Text>
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
      toast({ variant: 'success', title: t('deckDetail.cardUpdated') });
    } else {
      addCard(deckId!, draft);
      toast({ variant: 'success', title: t('deckDetail.cardAdded') });
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
    toast({ variant: 'success', title: t('deckDetail.deckUpdated') });
  }

  function confirmDelete(card: Flashcard) {
    Alert.alert(t('cardRow.delete'), t('mobileDeckDetail.confirmDeleteCard'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('cardRow.delete'), style: 'destructive', onPress: () => deleteCard(deckId!, card.id) },
    ]);
  }

  function handleArchiveDeck() {
    const next = !currentDeck.archived;
    archiveDeck(deckId!, next);
    setDeckEditorOpen(false);
    toast({ variant: 'success', title: next ? t('deckDetail.deckArchived') : t('deckDetail.deckRestored') });
  }

  function handleDeleteDeck() {
    Alert.alert(
      t('deckEditor.deleteDeck'),
      t('deckDetail.confirmDeleteDeck', { title: currentDeck.title, count: cards.length }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('cardRow.delete'),
          style: 'destructive',
          onPress: () => {
            deleteDeck(deckId!);
            clearReminders(deckId!);
            setDeckEditorOpen(false);
            toast({ variant: 'success', title: t('deckDetail.deckDeleted') });
            router.back();
          },
        },
      ],
    );
  }

  function clearFilters() {
    setQuery('');
    setCategoryFilter(null);
    setDifficultyFilter('all');
    setStarredOnly(false);
    setSuspendedOnly(false);
  }

  function handleAddCard() {
    setAddCardOpen(true);
  }

  async function handleShare() {
    const payload = buildDeckExport(currentDeck, cards);
    try {
      await Share.share({
        title: t('mobileDeckDetail.shareTitle', { title: payload.title }),
        message: t('mobileDeckDetail.shareMessage', {
          title: payload.title,
          count: payload.cards.length,
          url: shareUrlForDeck(payload, 'https://autocards.study/app/decks'),
        }),
      });
    } catch {
      // User dismissed the share sheet.
    }
  }

  const emptyState = (
    <Card>
      <Text style={{ textAlign: 'center', color: theme.textMuted }}>
        {cards.length === 0 ? t('deckDetail.emptyNoCards') : t('deckDetail.emptyNoMatches')}
      </Text>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.md }}>
        {cards.length > 0 ? (
          <Button title={t('deckDetail.clearFilters')} variant="outline" size="sm" onPress={clearFilters} />
        ) : (
          <>
            <Button title={t('deckDetail.writeOne')} variant="outline" size="sm" onPress={openNewCard} />
            <Button title={t('mobileDeckDetail.generateShort')} size="sm" onPress={() => setGenerateOpen(true)} />
          </>
        )}
      </View>
    </Card>
  );

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg }}>
        <IconButton accessibilityLabel={t('mobileDeckDetail.back')} onPress={() => router.back()}>
          <BackIcon color={theme.text} />
        </IconButton>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Text style={{ fontSize: 16 }}>{deck.icon}</Text>
            <Text style={{ fontSize: 17, fontWeight: '800', color: theme.text }} numberOfLines={1}>
              {deck.title}
            </Text>
            {deck.archived && <Badge label={t('deckDetail.archived')} color={theme.warning} softColor={theme.warningSoft} />}
          </View>
          <Text style={{ fontSize: 12, color: theme.textFaint, fontWeight: '600' }} numberOfLines={1}>
            {deck.description || t.plural('mobileDeckDetail.cardCount', stats.total, { count: stats.total })}
          </Text>
        </View>
        <IconButton
          accessibilityLabel={t('mobileDeckDetail.deckActions')}
          onPress={() => setActionsOpen(true)}
          dotColor={reminderStatus.dot ? theme.success : undefined}
        >
          <MoreIcon color={theme.text} />
        </IconButton>
      </View>

      <Card style={{ padding: 0, marginBottom: spacing.lg }}>
        <View style={{ padding: spacing.lg, paddingBottom: spacing.md }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textFaint, textTransform: 'uppercase', letterSpacing: 1 }}>
              {t('mobileDeckDetail.mastery')}
            </Text>
            <Text style={{ fontSize: 14, fontWeight: '800', color: theme.primaryText }}>{stats.averageMastery}%</Text>
          </View>
          <ProgressBar value={stats.averageMastery} max={100} height={8} />
        </View>
        <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: theme.border }}>
          <StatPill label={t('deckDetail.stat.cards')} value={stats.total} theme={theme} borderRight />
          <StatPill label={t('deckDetail.stat.new')} value={stats.new} color={theme.primary} theme={theme} borderRight />
          <StatPill label={t('deckDetail.stat.learning')} value={stats.learning} color={theme.warning} theme={theme} borderRight />
          <StatPill label={t('deckDetail.stat.mastered')} value={stats.mastered} color={theme.success} theme={theme} />
        </View>
      </Card>

      <Pressable
        onPress={() => router.push(`/study/${deckId}/setup`)}
        disabled={stats.total === 0}
        style={({ pressed }) => [
          {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.sm,
            paddingVertical: 14,
            borderRadius: radius.xl,
            overflow: 'hidden',
            opacity: stats.total === 0 ? 0.5 : pressed ? 0.88 : 1,
            marginBottom: spacing.lg,
          },
          stats.total === 0 ? null : glowShadow(theme.primary),
        ]}
      >
        <LinearGradient
          colors={[...BRAND_GRADIENT]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <PlayIcon color="#ffffff" size={16} />
        <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 14 }}>{t('mobileDeckDetail.studyNow')}</Text>
      </Pressable>

      <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            borderRadius: radius.lg,
            backgroundColor: theme.surfaceAlt,
            paddingHorizontal: spacing.md,
          }}
        >
          <SearchIcon color={theme.textFaint} size={16} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('deckDetail.searchCards')}
            placeholderTextColor={theme.textFaint}
            style={{ flex: 1, paddingVertical: 12, fontSize: 14, color: theme.text }}
          />
        </View>
        <Pressable
          onPress={() => setFiltersOpen((v) => !v)}
          accessibilityLabel={t('mobileDeckDetail.toggleFilters')}
          style={({ pressed }) => [
            {
              width: 44,
              height: 44,
              borderRadius: radius.lg,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: filterButtonActive ? theme.primary : theme.surface,
              opacity: pressed ? 0.85 : 1,
            },
            cardShadow,
          ]}
        >
          <FilterIcon color={filterButtonActive ? '#ffffff' : theme.textMuted} size={16} />
        </Pressable>
      </View>

      {deck.categories.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginBottom: spacing.sm }}
          contentContainerStyle={{ flexDirection: 'row' }}
        >
          <Chip label={t('mobileDeckDetail.allCategoriesCount', { count: cards.length })} active={categoryFilter === null} onPress={() => setCategoryFilter(null)} />
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
              label={t('mobileDeckDetail.uncategorizedCount', { count: categoryCounts.uncategorized })}
              active={categoryFilter === UNCATEGORIZED}
              onPress={() => setCategoryFilter(UNCATEGORIZED)}
            />
          )}
        </ScrollView>
      )}

      {filtersOpen && (
        <Card style={{ marginBottom: spacing.sm }}>
          <Text
            style={{
              fontSize: 11,
              fontWeight: '700',
              color: theme.textFaint,
              textTransform: 'uppercase',
              letterSpacing: 1,
              marginBottom: spacing.sm,
            }}
          >
            {t('deckDetail.filterByDifficulty')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.sm }}>
            <Chip label={t('mobileDeckDetail.any')} active={difficultyFilter === 'all'} onPress={() => setDifficultyFilter('all')} />
            {DIFFICULTIES.map((d) => (
              <Chip key={d} label={t(`difficulty.${d}` as const)} active={difficultyFilter === d} onPress={() => setDifficultyFilter(d)} />
            ))}
          </View>
          <Text
            style={{
              fontSize: 11,
              fontWeight: '700',
              color: theme.textFaint,
              textTransform: 'uppercase',
              letterSpacing: 1,
              marginBottom: spacing.sm,
            }}
          >
            {t('mobileDeckDetail.other')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Chip label={t('deckDetail.starred')} active={starredOnly} onPress={() => setStarredOnly((v) => !v)} />
            <Chip label={t('deckDetail.suspended')} active={suspendedOnly} onPress={() => setSuspendedOnly((v) => !v)} />
          </View>
        </Card>
      )}

      {isFiltered && (
        <Pressable onPress={clearFilters} style={{ marginBottom: spacing.sm }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: theme.primaryText }}>{t('deckDetail.clearFilters')}</Text>
        </Pressable>
      )}

      <View style={{ flexDirection: 'row', marginBottom: spacing.md }}>
        <Chip label={t('deckDetail.viewList')} active={view === 'list'} onPress={() => setView('list')} />
        <Chip label={t('deckDetail.viewFlashcards')} active={view === 'flashcards'} onPress={() => setView('flashcards')} />
      </View>

      {isFiltered && cards.length > 0 && (
        <Text style={{ fontSize: 12, color: theme.textFaint, marginBottom: spacing.sm }}>
          {t('deckDetail.showingOf', { shown: filteredCards.length, total: cards.length })}
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
              t={t}
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

      <Modal open={actionsOpen} onClose={() => setActionsOpen(false)} title={t('mobileDeckDetail.deckActions')}>
        <DeckActionRow
          icon={<IconTile icon="➕" color={theme.primary} size={36} fontSize={16} />}
          label={t('mobileDeckDetail.addCard')}
          onPress={() => {
            setActionsOpen(false);
            handleAddCard();
          }}
        />
        <View style={{ height: 1, backgroundColor: theme.border }} />
        <DeckActionRow
          icon={
            <IconTile color={theme.text} size={36}>
              <ShareIcon color={theme.text} size={16} />
            </IconTile>
          }
          label={t('deckDetail.shareDeck')}
          onPress={() => {
            setActionsOpen(false);
            void handleShare();
          }}
        />
        <View style={{ height: 1, backgroundColor: theme.border }} />
        <DeckActionRow
          icon={<IconTile icon="🔔" color={theme.warning} size={36} fontSize={16} />}
          label={reminderStatus.label}
          onPress={() => {
            setActionsOpen(false);
            setRemindersOpen(true);
          }}
        />
        <View style={{ height: 1, backgroundColor: theme.border }} />
        <DeckActionRow
          icon={<IconTile icon="✏️" color={theme.primaryText} size={36} fontSize={16} />}
          label={t('deckDetail.editDeck')}
          onPress={() => {
            setActionsOpen(false);
            setDeckEditorOpen(true);
          }}
        />
      </Modal>

      <Modal open={addCardOpen} onClose={() => setAddCardOpen(false)} title={t('mobileDeckDetail.addCard')}>
        <DeckActionRow
          icon={<IconTile icon="✍️" color={theme.primaryText} size={36} fontSize={16} />}
          label={t('addCardMenu.writeOne')}
          onPress={() => {
            setAddCardOpen(false);
            openNewCard();
          }}
        />
        <View style={{ height: 1, backgroundColor: theme.border }} />
        <DeckActionRow
          icon={<IconTile icon="📄" color={theme.primary} size={36} fontSize={16} />}
          label={t('addCardMenu.generateFromDocument')}
          onPress={() => {
            setAddCardOpen(false);
            setGenerateOpen(true);
          }}
        />
      </Modal>
    </Screen>
  );
}

function DeckActionRow({ icon, label, onPress }: { icon: ReactNode; label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: spacing.md,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {icon}
      <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: theme.text }}>{label}</Text>
    </Pressable>
  );
}

function StatPill({
  label,
  value,
  color,
  theme,
  borderRight,
}: {
  label: string;
  value: number | string;
  color?: string;
  theme: ReturnType<typeof useTheme>;
  borderRight?: boolean;
}) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        paddingVertical: spacing.md,
        borderRightWidth: borderRight ? 1 : 0,
        borderRightColor: theme.border,
      }}
    >
      <Text style={{ fontSize: 16, fontWeight: '800', color: color ?? theme.text }}>{value}</Text>
      <Text style={{ fontSize: 10, fontWeight: '600', color: theme.textFaint, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function CardRow({
  t,
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
  t: Translator;
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
            accessibilityLabel={t('mobileDeckDetail.cardNumber')}
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
            <Badge label={cardTypeLabelT(t, card.type)} color={theme.textMuted} softColor={theme.surfaceAlt} />
            <Badge
              label={t(`difficulty.${card.difficulty}` as const)}
              color={difficultyColors[card.difficulty]}
              softColor={`${difficultyColors[card.difficulty]}22`}
            />
            <Pressable onPress={onCyclePriority}>
              <Badge
                label={t(`priority.${card.priority}` as const)}
                color={priorityColors[card.priority]}
                softColor={`${priorityColors[card.priority]}22`}
              />
            </Pressable>
            {card.suspended && <Badge label={t('cardRow.suspended')} color={theme.warning} softColor={theme.warningSoft} />}
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
                {t('cardRow.answer')}
              </Text>
              <Text style={{ marginTop: 4, fontSize: 13, color: theme.text }}>
                {displayBack || t('cardRow.noAnswerSet')}
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
            {card.suspended ? t('cardRow.resume') : t('cardRow.suspend')}
          </Text>
        </Pressable>
        <Pressable onPress={onEdit}>
          <Text style={{ color: theme.primaryText, fontSize: 12, fontWeight: '600' }}>{t('cardRow.edit')}</Text>
        </Pressable>
        <Pressable onPress={onDelete}>
          <Text style={{ color: theme.danger, fontSize: 12, fontWeight: '600' }}>{t('cardRow.delete')}</Text>
        </Pressable>
      </View>
    </Card>
  );
}
