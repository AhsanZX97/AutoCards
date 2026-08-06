import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { CARD_TYPE_LABELS, computeDeckStats, hasCloze, parseCloze, type CardDraft, type Flashcard } from '@autocards/core';
import { useApp } from '../../lib/appContext';
import { Badge, Button, Card, CardBody, Input, Progress } from '../../components/ui';
import { DIFFICULTY_BADGE, PRIORITY_BADGE } from '../../lib/badges';
import { accentOf } from '../../lib/accent';
import { CardEditorModal } from './CardEditorModal';
import { toast } from '../../components/ui/toastStore';
import { EMPTY_ARRAY } from '../../lib/empty';

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
  const updateDeck = app.deckStore((s) => s.updateDeck);

  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<Flashcard | null>(null);

  const stats = useMemo(() => computeDeckStats(cards), [cards]);

  const filteredCards = useMemo(() => {
    return cards.filter((card) => {
      if (categoryFilter && card.categoryId !== categoryFilter) return false;
      if (!query) return true;
      const q = query.toLowerCase();
      return card.front.toLowerCase().includes(q) || card.back.toLowerCase().includes(q) || card.clozeText?.toLowerCase().includes(q);
    });
  }, [cards, categoryFilter, query]);

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

  function handleDelete(card: Flashcard) {
    if (confirm('Delete this card?')) {
      deleteCard(deckId!, card.id);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="flex items-start gap-4">
          <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-3xl ${accent.bgSoft}`}>
            {deck.icon}
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">{deck.title}</h1>
            <p className="mt-1 max-w-xl text-sm text-slate-500 dark:text-slate-400">{deck.description}</p>
            {deck.generatedBy && (
              <p className="mt-1 text-xs text-slate-400">Generated with {deck.generatedBy}</p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" onClick={openNewCard}>
            + Add card
          </Button>
          <Button onClick={() => navigate(`/app/study/${deckId}`)} disabled={stats.total === 0}>
            Study now
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
        <MiniStat label="Cards" value={stats.total} />
        <MiniStat label="New" value={stats.new} />
        <MiniStat label="Learning" value={stats.learning} />
        <MiniStat label="Due" value={stats.due} highlight={stats.due > 0} />
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
            All categories
          </button>
          {deck.categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategoryFilter(cat.id)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                categoryFilter === cat.id
                  ? 'border-brand-600 bg-brand-600 text-white'
                  : 'border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300'
              }`}
            >
              {cat.icon} {cat.name}
            </button>
          ))}
        </div>
      )}

      <div className="max-w-sm">
        <Input placeholder="Search cards…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {filteredCards.length === 0 ? (
        <Card>
          <CardBody className="py-14 text-center">
            <p className="text-slate-500 dark:text-slate-400">
              {cards.length === 0 ? 'No cards yet. Add your first one.' : 'No cards match your search.'}
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredCards.map((card) => (
            <CardRow
              key={card.id}
              card={card}
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
  onEdit,
  onDelete,
  onToggleStar,
  onToggleSuspend,
}: {
  card: Flashcard;
  onEdit: () => void;
  onDelete: () => void;
  onToggleStar: () => void;
  onToggleSuspend: () => void;
}) {
  const displayFront = card.type === 'cloze' && card.clozeText && hasCloze(card.clozeText)
    ? parseCloze(card.clozeText).prompt
    : card.front;

  return (
    <Card className={card.suspended ? 'opacity-60' : undefined}>
      <CardBody className="flex items-center gap-4 p-4">
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
