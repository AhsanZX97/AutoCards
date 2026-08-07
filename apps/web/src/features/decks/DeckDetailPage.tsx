import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  CARD_TYPE_LABELS,
  DIFFICULTIES,
  computeDeckStats,
  hasCloze,
  parseCloze,
  type CardDraft,
  type Difficulty,
  type Flashcard,
} from '@autocards/core';
import { useApp } from '../../lib/appContext';
import { Badge, Button, Card, CardBody, Chip, Input, Progress, Select } from '../../components/ui';
import { DIFFICULTY_BADGE, PRIORITY_BADGE } from '../../lib/badges';
import { accentOf } from '../../lib/accent';
import { CardEditorModal } from './CardEditorModal';
import { DeckEditorModal, type DeckEdits } from './DeckEditorModal';
import { DeckShareModal } from './DeckShareModal';
import { toast } from '../../components/ui/toastStore';
import { EMPTY_ARRAY } from '../../lib/empty';
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
  const [shareOpen, setShareOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<Flashcard | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const stats = useMemo(() => computeDeckStats(cards), [cards]);

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
            {deck.generatedBy && (
              <p className="mt-1 text-xs text-slate-400">Generated with {deck.generatedBy}</p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="outline" onClick={() => setDeckEditorOpen(true)}>
            Edit deck
          </Button>
          <Button variant="outline" onClick={openNewCard}>
            + Add card
          </Button>
          <Button variant="outline" onClick={() => setShareOpen(true)}>
            Share
          </Button>
          <Button onClick={() => navigate(`/app/study/${deckId}`)} disabled={stats.total === 0}>
            Study now
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <MiniStat label="Cards" value={stats.total} />
        <MiniStat label="New" value={stats.new} />
        <MiniStat label="Learning" value={stats.learning} />
        <MiniStat label="Mastered" value={stats.mastered} />
        <MiniStat label="Avg mastery" value={`${stats.averageMastery}%`} />
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
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {isFiltered && cards.length > 0 && (
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Showing {filteredCards.length} of {cards.length} cards
            </p>
          )}
          {cards.length > 1 && (
            <p className="text-xs text-slate-400">
              {isFiltered
                ? 'Clear the search and filters to drag cards. The number box still moves a card anywhere.'
                : 'Drag the ⠿ grip to reorder, or type a card’s new number.'}
            </p>
          )}
        </div>
      </div>

      {filteredCards.length === 0 ? (
        <Card>
          <CardBody className="py-14 text-center">
            <p className="text-slate-500 dark:text-slate-400">
              {cards.length === 0 ? 'No cards yet. Add your first one.' : 'No cards match your filters.'}
            </p>
            {cards.length > 0 && (
              <Button size="sm" variant="outline" className="mt-4" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </CardBody>
        </Card>
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
      {deckId && <DeckShareModal open={shareOpen} onClose={() => setShareOpen(false)} deckId={deckId} />}
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
}) {
  // Only armed while the grip is held, so the row stays selectable and
  // clickable everywhere else.
  const [gripHeld, setGripHeld] = useState(false);
  const [positionInput, setPositionInput] = useState(String(position));

  useEffect(() => setPositionInput(String(position)), [position]);

  const displayFront = card.type === 'cloze' && card.clozeText && hasCloze(card.clozeText)
    ? parseCloze(card.clozeText).prompt
    : card.front;

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
      <CardBody className="flex items-center gap-4 p-4">
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
        <div className="min-w-0 flex-1 cursor-pointer" onClick={onEdit}>
          <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">{displayFront}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge variant="neutral">{CARD_TYPE_LABELS[card.type]}</Badge>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${DIFFICULTY_BADGE[card.difficulty].classes}`}>
              {DIFFICULTY_BADGE[card.difficulty].label}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_BADGE[card.priority].classes}`}>
              {PRIORITY_BADGE[card.priority].label}
            </span>
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
      </CardBody>
    </Card>
  );
}
