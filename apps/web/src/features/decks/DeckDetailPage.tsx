import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  DIFFICULTIES,
  LEARNING_THRESHOLD,
  MASTERED_THRESHOLD,
  PRIORITIES,
  cardTypeLabel,
  computeDeckStats,
  hasCloze,
  parseCloze,
  type CardDraft,
  type Difficulty,
  type Flashcard,
} from '@autocards/core';
import { useApp } from '../../lib/appContext';
import { Badge, Button, Card, CardBody, Chip, InfoButton, Input, Modal, Progress, Select } from '../../components/ui';
import { DIFFICULTY_BADGE, PRIORITY_BADGE } from '../../lib/badges';
import { accentOf } from '../../lib/accent';
import { AddCardMenu } from './AddCardMenu';
import { CardEditorModal } from './CardEditorModal';
import { DeckEditorModal, type DeckEdits } from './DeckEditorModal';
import { DeckFlashcardView } from './DeckFlashcardView';
import { DeckGenerateCardsModal } from './DeckGenerateCardsModal';
import { DeckShareModal } from './DeckShareModal';
import { toast } from '../../components/ui/toastStore';
import { EMPTY_ARRAY } from '../../lib/empty';
import { formatQuota, useUploadQuota } from '../../lib/useUploadQuota';
import { cn } from '../../lib/cn';

/** Sentinel for the category filter, standing for "cards in no category". */
const UNCATEGORIZED = '__uncategorized__';

export function DeckDetailPage() {
  const { deckId } = useParams<{ deckId: string }>();
  const navigate = useNavigate();
  const app = useApp();

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

  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [difficultyFilter, setDifficultyFilter] = useState<Difficulty | 'all'>('all');
  const [starredOnly, setStarredOnly] = useState(false);
  const [suspendedOnly, setSuspendedOnly] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [deckEditorOpen, setDeckEditorOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [statsHelpOpen, setStatsHelpOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<Flashcard | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'flashcards'>('list');

  const stats = useMemo(() => computeDeckStats(cards), [cards]);
  const quota = useUploadQuota();

  // `cards` is stored in deck order, so a card's index is its place in the deck.
  const indexById = useMemo(() => new Map(cards.map((card, index) => [card.id, index])), [cards]);

  // Dragging onto a partial list would drop cards at the wrong place, so the
  // grip is disabled while the list is narrowed. The number box still works —
  // it names an absolute place in the deck either way.
  const isFiltered =
    query.trim() !== '' || categoryFilter !== null || difficultyFilter !== 'all' || starredOnly || suspendedOnly;

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

  /** Card counts per category, plus how many sit in none, for the filter chips. */
  const categoryCounts = useMemo(() => {
    const byCategory = new Map<string, number>();
    let uncategorized = 0;
    for (const card of cards) {
      if (card.categoryId) byCategory.set(card.categoryId, (byCategory.get(card.categoryId) ?? 0) + 1);
      else uncategorized += 1;
    }
    return { byCategory, uncategorized };
  }, [cards]);

  if (!deckId) return <Navigate to="/app/decks" replace />;
  if (!deck) {
    return (
      <Card>
        <CardBody className="py-16 text-center">
          <p className="text-slate-500 dark:text-slate-400">Deck not found.</p>
          <Link to="/app/decks" className="mt-3 inline-block text-sm font-medium text-brand-700 dark:text-brand-400">
            Back to decks
          </Link>
        </CardBody>
      </Card>
    );
  }

  const accent = accentOf(deck.accent);

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

  /** Steps a card through low → normal → high → critical and back around. */
  function cyclePriority(card: Flashcard) {
    const next = PRIORITIES[(PRIORITIES.indexOf(card.priority) + 1) % PRIORITIES.length]!;
    updateCard(deckId!, card.id, { ...draftFromExisting(card), priority: next });
  }

  /** The modal hands back the whole intended category list; turn that into the
   *  add / update / delete calls the store actually takes. */
  function handleSaveDeck(edits: DeckEdits) {
    const existing = deck!.categories;
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

    // Filtering by a category that no longer exists would show an empty list
    // with no way back to it, so fall back to showing everything.
    if (categoryFilter && !keptIds.has(categoryFilter)) setCategoryFilter(null);

    setDeckEditorOpen(false);
    toast({ variant: 'success', title: 'Deck updated' });
  }

  function handleDelete(card: Flashcard) {
    if (confirm('Delete this card?')) {
      deleteCard(deckId!, card.id);
    }
  }

  function handleArchiveDeck() {
    const next = !deck!.archived;
    archiveDeck(deckId!, next);
    setDeckEditorOpen(false);
    toast({ variant: 'success', title: next ? 'Deck archived' : 'Deck restored' });
  }

  function handleDeleteDeck() {
    if (!confirm(`Delete "${deck!.title}" and all ${cards.length} of its cards? This cannot be undone.`)) return;
    deleteDeck(deckId!);
    setDeckEditorOpen(false);
    toast({ variant: 'success', title: 'Deck deleted' });
    navigate('/app/decks');
  }

  function clearFilters() {
    setQuery('');
    setCategoryFilter(null);
    setDifficultyFilter('all');
    setStarredOnly(false);
    setSuspendedOnly(false);
  }

  function handleDropOn(targetCardId: string) {
    const targetIndex = indexById.get(targetCardId);
    if (draggingId && draggingId !== targetCardId && targetIndex !== undefined) {
      reorderCard(deckId!, draggingId, targetIndex);
    }
    setDraggingId(null);
    setDropTargetId(null);
  }

  // Shared by both views, so the flashcard view can show it without unmounting.
  const emptyState = (
    <Card>
      <CardBody className="py-14 text-center">
        <p className="text-slate-500 dark:text-slate-400">
          {cards.length === 0 ? 'No cards yet. Add your first one.' : 'No cards match your filters.'}
        </p>
        {cards.length > 0 ? (
          <Button size="sm" variant="outline" className="mt-4" onClick={clearFilters}>
            Clear filters
          </Button>
        ) : (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button size="sm" variant="outline" onClick={openNewCard}>
              ✍️ Write one
            </Button>
            <Button size="sm" onClick={() => setGenerateOpen(true)}>
              📄 Generate from a PDF
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="flex items-start gap-4">
          <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-3xl ${accent.bgSoft}`}>
            {deck.icon}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">{deck.title}</h1>
              {deck.archived && <Badge variant="warning">Archived</Badge>}
            </div>
            <p className="mt-1 max-w-xl text-sm text-slate-500 dark:text-slate-400">{deck.description}</p>
            {deck.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {deck.tags.map((tag) => (
                  <Badge key={tag} variant="neutral">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="outline" onClick={() => setDeckEditorOpen(true)}>
            Edit deck
          </Button>
          <AddCardMenu
            onWriteCard={openNewCard}
            onGenerateFromPdf={() => setGenerateOpen(true)}
            quotaLabel={formatQuota(quota)}
          />
          <Button variant="outline" onClick={() => setShareOpen(true)}>
            Share
          </Button>
          <Button onClick={() => navigate(`/app/study/${deckId}`)} disabled={stats.total === 0}>
            Study now
          </Button>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center gap-1.5">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Progress</p>
          <InfoButton label="What do these numbers mean?" onClick={() => setStatsHelpOpen(true)} />
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <MiniStat label="Cards" value={stats.total} />
          <MiniStat label="New" value={stats.new} />
          <MiniStat label="Learning" value={stats.learning} />
          <MiniStat label="Mastered" value={stats.mastered} />
          <MiniStat label="Avg mastery" value={`${stats.averageMastery}%`} />
        </div>
      </div>

      {deck.categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setCategoryFilter(null)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
              categoryFilter === null
                ? 'border-brand-600 bg-brand-600 text-white'
                : 'border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300'
            }`}
          >
            All categories <CountPill>{cards.length}</CountPill>
          </button>
          {deck.categories.map((cat) => {
            const catAccent = accentOf(cat.accent);
            return (
              <button
                key={cat.id}
                onClick={() => setCategoryFilter(cat.id)}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                  categoryFilter === cat.id
                    ? `border-transparent text-white ${catAccent.bg}`
                    : `${catAccent.border} ${catAccent.text}`
                }`}
              >
                {cat.icon} {cat.name} <CountPill>{categoryCounts.byCategory.get(cat.id) ?? 0}</CountPill>
              </button>
            );
          })}
          {categoryCounts.uncategorized > 0 && (
            <button
              onClick={() => setCategoryFilter(UNCATEGORIZED)}
              className={`rounded-full border border-dashed px-3 py-1.5 text-sm font-medium ${
                categoryFilter === UNCATEGORIZED
                  ? 'border-solid border-slate-600 bg-slate-600 text-white'
                  : 'border-slate-300 text-slate-500 dark:border-slate-700 dark:text-slate-400'
              }`}
            >
              Uncategorized <CountPill>{categoryCounts.uncategorized}</CountPill>
            </button>
          )}
        </div>
      )}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-full max-w-xs">
            <Input placeholder="Search cards…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <Select
            className="w-auto"
            value={difficultyFilter}
            onChange={(e) => setDifficultyFilter(e.target.value as Difficulty | 'all')}
            aria-label="Filter by difficulty"
          >
            <option value="all">Any difficulty</option>
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {d[0]?.toUpperCase() + d.slice(1)}
              </option>
            ))}
          </Select>
          <Chip active={starredOnly} onClick={() => setStarredOnly((v) => !v)}>
            ⭐ Starred
          </Chip>
          <Chip active={suspendedOnly} onClick={() => setSuspendedOnly((v) => !v)}>
            ⏸ Suspended
          </Chip>
          {isFiltered && (
            <Button size="sm" variant="ghost" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
          <div className="ml-auto flex items-center gap-1 rounded-xl border border-slate-200 p-1 dark:border-slate-800">
            <ViewTab active={view === 'list'} onClick={() => setView('list')}>
              ☰ List
            </ViewTab>
            <ViewTab active={view === 'flashcards'} onClick={() => setView('flashcards')}>
              🃏 Flashcards
            </ViewTab>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {isFiltered && cards.length > 0 && (
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Showing {filteredCards.length} of {cards.length} cards
            </p>
          )}
          {view === 'flashcards'
            ? filteredCards.length > 0 && (
                <p className="text-xs text-slate-400">
                  Click the card to reveal the answer. ← → to move between cards, space to flip.
                </p>
              )
            : cards.length > 1 && (
                <p className="text-xs text-slate-400">
                  {isFiltered
                    ? 'Clear the search and filters to drag cards. The number box still moves a card anywhere.'
                    : 'Drag the ⠿ grip to reorder, or type a card’s new number.'}
                </p>
              )}
        </div>
      </div>

      {/* The flashcard view is checked first and handles its own empty state.
          Swapping it out for the shared one whenever a filter matched nothing
          would unmount it, throwing away the shuffle and the current place. */}
      {view === 'flashcards' ? (
        <DeckFlashcardView cards={filteredCards} deckCards={cards} emptyState={emptyState} />
      ) : filteredCards.length === 0 ? (
        emptyState
      ) : (
        <div className="space-y-2">
          {filteredCards.map((card) => (
            <CardRow
              key={card.id}
              card={card}
              position={(indexById.get(card.id) ?? 0) + 1}
              total={cards.length}
              reorderable={!isFiltered}
              dragging={draggingId === card.id}
              dropTarget={dropTargetId === card.id && draggingId !== card.id}
              onMoveTo={(next) => reorderCard(deckId!, card.id, next - 1)}
              onDragStart={() => setDraggingId(card.id)}
              onDragEnter={() => setDropTargetId(card.id)}
              onDragEnd={() => {
                setDraggingId(null);
                setDropTargetId(null);
              }}
              onDrop={() => handleDropOn(card.id)}
              onEdit={() => openEditCard(card)}
              onDelete={() => handleDelete(card)}
              onToggleStar={() => toggleStar(deckId!, card.id)}
              onToggleSuspend={() => toggleSuspend(deckId!, card.id)}
              onCyclePriority={() => cyclePriority(card)}
            />
          ))}
        </div>
      )}

      <CardEditorModal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSave={handleSaveCard}
        initial={editingCard ? draftFromExisting(editingCard) : null}
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
      <DeckGenerateCardsModal
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        deck={deck}
        cards={cards}
      />
      {deckId && <DeckShareModal open={shareOpen} onClose={() => setShareOpen(false)} deckId={deckId} />}

      <Modal
        open={statsHelpOpen}
        onClose={() => setStatsHelpOpen(false)}
        title="How progress is measured"
        description="All of it comes from how often you answer each card correctly."
        size="md"
        footer={<Button onClick={() => setStatsHelpOpen(false)}>Got it</Button>}
      >
        <dl className="space-y-3.5 text-sm">
          <StatHelp term="Mastery">
            The share of times you have answered a card right — 8 correct out of 10 tries is 80%. A brand new card
            starts at 0% because it has no answers behind it yet.
          </StatHelp>
          <StatHelp term="New">You have not studied these cards even once.</StatHelp>
          <StatHelp term="Learning">
            Cards you are still getting wrong more often than not — under {LEARNING_THRESHOLD}% mastery.
          </StatHelp>
          <StatHelp term="Mastered">
            Cards you almost always get right — {MASTERED_THRESHOLD}% mastery or better. You can skip these in a
            session from the study screen.
          </StatHelp>
          <StatHelp term="Avg mastery">
            The average across every card in the deck, leaving out any you have paused.
          </StatHelp>
        </dl>
      </Modal>
    </div>
  );
}

function StatHelp({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div>
      <dt className="font-semibold text-slate-800 dark:text-slate-100">{term}</dt>
      <dd className="mt-0.5 text-slate-600 dark:text-slate-400">{children}</dd>
    </div>
  );
}

function draftFromExisting(card: Flashcard): CardDraft {
  return {
    type: card.type,
    front: card.front,
    back: card.back,
    clozeText: card.clozeText,
    choices: card.choices,
    acceptedAnswers: card.acceptedAnswers,
    hint: card.hint,
    explanation: card.explanation,
    mnemonic: card.mnemonic,
    example: card.example,
    notes: card.notes,
    difficulty: card.difficulty,
    priority: card.priority,
    categoryId: card.categoryId,
    tags: card.tags,
    accent: card.accent,
    starred: card.starred,
    suspended: card.suspended,
    weight: card.weight,
    lang: card.lang,
  };
}

/** Card count that rides inside a filter chip, dimmed so the label still leads. */
function CountPill({ children }: { children: ReactNode }) {
  return <span className="ml-0.5 text-xs opacity-60">{children}</span>;
}

/** One half of the list / flashcards segmented control. */
function ViewTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-lg px-3 py-1.5 text-sm font-medium transition',
        active
          ? 'bg-brand-600 text-white'
          : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
      )}
    >
      {children}
    </button>
  );
}

function MiniStat({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <Card>
      <CardBody className="p-3 text-center">
        <p className={`text-xl font-bold ${highlight ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white'}`}>
          {value}
        </p>
        <p className="text-xs text-slate-400">{label}</p>
      </CardBody>
    </Card>
  );
}

function CardRow({
  card,
  position,
  total,
  reorderable,
  dragging,
  dropTarget,
  onMoveTo,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onDrop,
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
  reorderable: boolean;
  dragging: boolean;
  dropTarget: boolean;
  onMoveTo: (position: number) => void;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleStar: () => void;
  onToggleSuspend: () => void;
  onCyclePriority: () => void;
}) {
  // Only armed while the grip is held, so the row stays selectable and
  // clickable everywhere else.
  const [gripHeld, setGripHeld] = useState(false);
  const [positionInput, setPositionInput] = useState(String(position));
  const [answerShown, setAnswerShown] = useState(false);

  useEffect(() => setPositionInput(String(position)), [position]);

  const isCloze = card.type === 'cloze' && card.clozeText && hasCloze(card.clozeText);
  const displayFront = isCloze ? parseCloze(card.clozeText!).prompt : card.front;
  const displayBack = isCloze ? parseCloze(card.clozeText!).answer : card.back;

  function commitPosition() {
    const parsed = Number.parseInt(positionInput, 10);
    // Out-of-range and unparseable entries snap back rather than erroring.
    const target = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), total) : position;
    setPositionInput(String(target));
    if (target !== position) onMoveTo(target);
  }

  return (
    <Card
      draggable={gripHeld}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        // Firefox refuses to start a drag without payload on the transfer.
        e.dataTransfer.setData('text/plain', card.id);
        onDragStart();
      }}
      onMouseUp={() => setGripHeld(false)}
      onDragEnter={onDragEnter}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }}
      onDragEnd={() => {
        setGripHeld(false);
        onDragEnd();
      }}
      onDrop={(e) => {
        e.preventDefault();
        setGripHeld(false);
        onDrop();
      }}
      className={cn(
        card.suspended && 'opacity-60',
        dragging && 'opacity-40',
        dropTarget && 'ring-2 ring-brand-500',
      )}
    >
      <CardBody className="p-4">
        <div className="flex items-center gap-4">
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              aria-label="Drag to reorder"
              title={reorderable ? 'Drag to reorder' : 'Clear the search and filter to drag cards'}
              disabled={!reorderable}
              onMouseDown={() => setGripHeld(true)}
              onMouseUp={() => setGripHeld(false)}
              className="cursor-grab select-none px-1 text-lg leading-none text-slate-300 hover:text-slate-500 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-600 dark:hover:text-slate-400"
            >
              ⠿
            </button>
            <input
              type="number"
              min={1}
              max={total}
              aria-label="Card number"
              title="Type a number to move this card there"
              value={positionInput}
              onChange={(e) => setPositionInput(e.target.value)}
              onBlur={commitPosition}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') setPositionInput(String(position));
              }}
              className="w-12 rounded-lg border border-slate-200 bg-transparent px-1.5 py-1 text-center text-xs font-semibold text-slate-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:text-slate-400"
            />
          </div>
          <button onClick={onToggleStar} className="text-lg" aria-label="Toggle star">
            {card.starred ? '⭐' : '☆'}
          </button>
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setAnswerShown((v) => !v)}
              aria-expanded={answerShown}
              title={answerShown ? 'Hide answer' : 'Show answer'}
              className="w-full text-left"
            >
              <p
                className={cn(
                  'text-sm font-medium text-slate-800 dark:text-slate-200',
                  answerShown ? 'break-words' : 'truncate',
                )}
              >
                {displayFront}
              </p>
            </button>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge variant="neutral">{cardTypeLabel(card.type)}</Badge>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${DIFFICULTY_BADGE[card.difficulty].classes}`}>
                {DIFFICULTY_BADGE[card.difficulty].label}
              </span>
              {/* Priority is a triage call made while looking over a deck, so it
                  is set here rather than buried in the card editor. */}
              <button
                type="button"
                onClick={onCyclePriority}
                title="Click to change priority — it decides which cards come up first"
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs font-medium transition-opacity hover:opacity-75',
                  PRIORITY_BADGE[card.priority].classes,
                )}
              >
                {PRIORITY_BADGE[card.priority].label}
              </button>
              {card.suspended && <Badge variant="warning">Suspended</Badge>}
            </div>
          </div>
          <div className="hidden w-32 shrink-0 sm:block">
            <Progress value={card.mastery} max={100} />
            <p className="mt-1 text-center text-xs text-slate-400">{card.mastery}% mastery</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button size="sm" variant="ghost" onClick={onToggleSuspend}>
              {card.suspended ? 'Resume' : 'Suspend'}
            </Button>
            <Button size="sm" variant="ghost" onClick={onEdit}>
              Edit
            </Button>
            <Button size="sm" variant="ghost" onClick={onDelete} className="text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10">
              Delete
            </Button>
          </div>
        </div>

        {answerShown && (
          <div className="mt-3 rounded-xl border border-brand-200 bg-brand-50/60 p-3 dark:border-brand-500/30 dark:bg-brand-500/10">
            <p className="text-xs font-medium uppercase tracking-wide text-brand-700 dark:text-brand-400">Answer</p>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700 dark:text-slate-200">
              {displayBack || <span className="italic text-slate-400">No answer set.</span>}
            </p>
            {card.explanation && (
              <p className="mt-2 whitespace-pre-wrap break-words text-xs text-slate-500 dark:text-slate-400">
                {card.explanation}
              </p>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
