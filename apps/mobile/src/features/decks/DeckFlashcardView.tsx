import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { cardTypeLabel, getAnswerText, getPromptText, type Flashcard } from '@autocards/core';
import { useTheme, useDifficultyColors, spacing } from '../../lib/theme';
import { Badge, Button, Card, ProgressBar } from '../../components';

/** Fisher-Yates on a copy, so the caller's array is left alone. */
function shuffleIds(ids: string[]): string[] {
  const next = ids.slice();
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j]!, next[i]!];
  }
  return next;
}

/** Browsing view: one card at a time, answer hidden until tapped. Mirrors the
 *  web's `DeckFlashcardView.tsx` — a reading tool, not a study session, so
 *  nothing here records a review or touches mastery.
 *
 *  `cards` is the filtered list actually being browsed; `deckCards` is the
 *  whole deck, which is what a shuffle permutes. `emptyState` is rendered in
 *  place of the card when the filters match nothing, without unmounting this
 *  component — otherwise a filter passing through zero matches would throw
 *  away the shuffle and current position. */
export function DeckFlashcardView({
  cards,
  deckCards,
  emptyState,
}: {
  cards: Flashcard[];
  deckCards: Flashcard[];
  emptyState: ReactNode;
}) {
  const theme = useTheme();
  const difficultyColors = useDifficultyColors();
  const [shuffleOrder, setShuffleOrder] = useState<string[] | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  const ordered = useMemo(() => {
    if (!shuffleOrder) return cards;
    const rank = new Map(shuffleOrder.map((id, i) => [id, i]));
    const rankOf = (id: string) => rank.get(id) ?? Number.MAX_SAFE_INTEGER;
    return cards.slice().sort((a, b) => rankOf(a.id) - rankOf(b.id));
  }, [cards, shuffleOrder]);

  const total = ordered.length;
  const foundIndex = currentId ? ordered.findIndex((c) => c.id === currentId) : -1;
  const safeIndex = foundIndex >= 0 ? foundIndex : 0;
  const card = ordered[safeIndex];

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
    setCurrentId(null);
  }

  function handleReset() {
    setShuffleOrder(null);
    setCurrentId(null);
  }

  if (!card) return <>{emptyState}</>;

  const answer = getAnswerText(card);

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: theme.textMuted }}>
          Card {safeIndex + 1} of {total}
          {shuffleOrder && <Text style={{ fontSize: 11, color: theme.textFaint }}>  shuffled</Text>}
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button title="🔀 Shuffle" variant="outline" size="sm" onPress={handleShuffle} disabled={deckCards.length < 2} />
          {shuffleOrder && <Button title="Reset order" variant="ghost" size="sm" onPress={handleReset} />}
        </View>
      </View>

      <ProgressBar value={safeIndex + 1} max={total} />

      <Pressable onPress={() => setRevealed((v) => !v)}>
        <Card style={{ minHeight: 280, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, paddingVertical: spacing.xl }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 }}>
            <Badge label={cardTypeLabel(card.type)} color={theme.textMuted} softColor={theme.surfaceAlt} />
            <Badge
              label={card.difficulty}
              color={difficultyColors[card.difficulty]}
              softColor={`${difficultyColors[card.difficulty]}22`}
            />
            {card.starred && <Text style={{ fontSize: 14 }}>⭐</Text>}
            {card.suspended && <Badge label="Suspended" color={theme.warning} softColor={theme.warningSoft} />}
          </View>

          <Text style={{ fontSize: 18, fontWeight: '700', color: theme.text, textAlign: 'center' }}>
            {getPromptText(card)}
          </Text>

          {revealed ? (
            <View style={{ width: '100%', borderTopWidth: 1, borderTopColor: theme.border, paddingTop: spacing.md }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: theme.primaryText, textTransform: 'uppercase' }}>
                Answer
              </Text>
              <Text style={{ marginTop: spacing.xs, fontSize: 16, color: theme.text, textAlign: 'center' }}>
                {answer || <Text style={{ fontStyle: 'italic', color: theme.textFaint }}>No answer set.</Text>}
              </Text>
              {card.explanation && (
                <Text style={{ marginTop: spacing.sm, fontSize: 13, color: theme.textMuted, textAlign: 'center' }}>
                  {card.explanation}
                </Text>
              )}
            </View>
          ) : (
            <Text style={{ fontSize: 12, color: theme.textFaint }}>Tap the card to show the answer</Text>
          )}
        </Card>
      </Pressable>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xxl }}>
        <Button title="← Back" variant="outline" onPress={() => go(-1)} disabled={total < 2} style={{ flex: 1 }} />
        <View style={{ width: spacing.sm }} />
        <Button
          title={revealed ? 'Hide answer' : 'Show answer'}
          variant="outline"
          onPress={() => setRevealed((v) => !v)}
          style={{ flex: 1 }}
        />
        <View style={{ width: spacing.sm }} />
        <Button title="Next →" variant="outline" onPress={() => go(1)} disabled={total < 2} style={{ flex: 1 }} />
      </View>
    </View>
  );
}
