import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CARD_TYPE_LABELS, type Flashcard } from '@autocards/core';
import { Badge, Button, Card, CardBody, Progress } from '../../components/ui';
import { DIFFICULTY_BADGE } from '../../lib/badges';
import { getAnswerText, getPromptText } from '../../lib/cardText';
import { cn } from '../../lib/cn';

/** Fisher-Yates on a copy, so the caller's array is left alone. */
function shuffleIds(ids: string[]): string[] {
  const next = ids.slice();
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j]!, next[i]!];
  }
  return next;
}

/** Browsing view: one card at a time, answer hidden until asked for.
 *
 *  This is a reading tool, not a study session — nothing here records a review
 *  or touches mastery. "Study now" remains the graded path.
 *
 *  `cards` is the filtered list actually being browsed; `deckCards` is the
 *  whole deck, which is what a shuffle permutes. `emptyState` is rendered in
 *  place of the card when the filters match nothing — taken as a prop, rather
 *  than the page swapping this component out, so that a filter passing through
 *  zero matches does not unmount the shuffle along with it. */
export function DeckFlashcardView({
  cards,
  deckCards,
  emptyState,
}: {
  cards: Flashcard[];
  deckCards: Flashcard[];
  emptyState: ReactNode;
}) {
  // `null` means deck order. Otherwise a permutation of the *whole deck's* ids,
  // so narrowing the filters just hides part of it and clearing them brings the
  // same shuffle back, instead of snapping to deck order.
  const [shuffleOrder, setShuffleOrder] = useState<string[] | null>(null);
  // Position is held as a card id, not an index, so filtering or reordering
  // keeps you on the card you were looking at rather than at some other card
  // that happens to have moved into the same slot.
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  const ordered = useMemo(() => {
    if (!shuffleOrder) return cards;
    const rank = new Map(shuffleOrder.map((id, i) => [id, i]));
    // Cards added since the shuffle have no rank; MAX_SAFE_INTEGER parks them
    // at the end, where the stable sort leaves them in deck order.
    const rankOf = (id: string) => rank.get(id) ?? Number.MAX_SAFE_INTEGER;
    return cards.slice().sort((a, b) => rankOf(a.id) - rankOf(b.id));
  }, [cards, shuffleOrder]);

  const total = ordered.length;
  const foundIndex = currentId ? ordered.findIndex((c) => c.id === currentId) : -1;
  // Falls back to the first card whenever the current one is filtered out or deleted.
  const safeIndex = foundIndex >= 0 ? foundIndex : 0;
  const card = ordered[safeIndex];

  // Any change of card — next, back, shuffle, or a filter edit that moves us —
  // starts face down again.
  useEffect(() => {
    setRevealed(false);
  }, [card?.id]);

  const go = useCallback(
    (delta: number) => {
      if (total === 0) return;
      const from = foundIndex >= 0 ? foundIndex : 0;
      setCurrentId(ordered[(from + delta + total) % total]!.id);
    },
    [ordered, foundIndex, total],
  );

  function handleShuffle() {
    setShuffleOrder(shuffleIds(deckCards.map((c) => c.id)));
    setCurrentId(null); // start the new order from the top
  }

  function handleReset() {
    setShuffleOrder(null);
    setCurrentId(null);
  }

  // Arrows to move, space/enter to reveal — skipped while typing so the search
  // box keeps working, and while a modal is open so the card behind it does not
  // react to keys meant for the dialog.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        go(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        go(-1);
      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        setRevealed((v) => !v);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [go]);

  // Renders in place rather than returning null: this component staying mounted
  // is what preserves the shuffle across a filter that matches nothing.
  if (!card) return <>{emptyState}</>;

  const answer = getAnswerText(card);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
          Card {safeIndex + 1} of {total}
          {shuffleOrder && <span className="ml-2 text-xs text-slate-400">shuffled</span>}
        </p>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleShuffle} disabled={deckCards.length < 2}>
            🔀 Shuffle
          </Button>
          {shuffleOrder && (
            <Button size="sm" variant="ghost" onClick={handleReset}>
              Reset order
            </Button>
          )}
        </div>
      </div>

      <div className="w-full">
        <Progress value={safeIndex + 1} max={total} />
      </div>

      <Card
        role="button"
        tabIndex={0}
        aria-expanded={revealed}
        onClick={() => setRevealed((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            setRevealed((v) => !v);
          }
        }}
        className="cursor-pointer select-none transition hover:border-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:border-brand-500/60"
      >
        <CardBody className="flex min-h-[320px] flex-col items-center justify-center gap-5 p-8 text-center">
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            <Badge variant="neutral">{CARD_TYPE_LABELS[card.type]}</Badge>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${DIFFICULTY_BADGE[card.difficulty].classes}`}>
              {DIFFICULTY_BADGE[card.difficulty].label}
            </span>
            {card.starred && <span className="text-sm">⭐</span>}
            {card.suspended && <Badge variant="warning">Suspended</Badge>}
          </div>

          <p className="max-w-2xl whitespace-pre-wrap break-words text-lg font-semibold leading-snug text-slate-900 dark:text-white sm:text-xl">
            {getPromptText(card)}
          </p>

          {revealed ? (
            <div className="w-full max-w-2xl border-t border-slate-200 pt-5 dark:border-slate-800">
              <p className="text-xs font-medium uppercase tracking-wide text-brand-700 dark:text-brand-400">Answer</p>
              <p className="mt-2 whitespace-pre-wrap break-words text-base text-slate-800 dark:text-slate-100 sm:text-lg">
                {answer || <span className="italic text-slate-400">No answer set.</span>}
              </p>
              {card.explanation && (
                <p className="mt-3 whitespace-pre-wrap break-words text-sm text-slate-500 dark:text-slate-400">
                  {card.explanation}
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-400">Click the card to show the answer</p>
          )}
        </CardBody>
      </Card>

      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" onClick={() => go(-1)} disabled={total < 2}>
          ← Back
        </Button>
        <Button
          variant="ghost"
          onClick={() => setRevealed((v) => !v)}
          className={cn(revealed && 'text-brand-700 dark:text-brand-400')}
        >
          {revealed ? 'Hide answer' : 'Show answer'}
        </Button>
        <Button variant="outline" onClick={() => go(1)} disabled={total < 2}>
          Next →
        </Button>
      </div>
    </div>
  );
}
