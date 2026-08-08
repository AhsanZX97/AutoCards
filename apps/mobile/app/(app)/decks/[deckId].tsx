import { useMemo } from 'react';
import { Alert, Pressable, Share, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  buildDeckExport,
  cardTypeLabel,
  computeDeckStats,
  hasCloze,
  parseCloze,
  serializeDeckExport,
  shareUrlForDeck,
  type Flashcard,
} from '@autocards/core';
import { useApp } from '../../../src/lib/appContext';
import { useTheme, DIFFICULTY_COLOR, PRIORITY_COLOR, spacing } from '../../../src/lib/theme';
import { Badge, Button, Card, ProgressBar, Screen } from '../../../src/components';

export default function DeckDetailScreen() {
  const { deckId } = useLocalSearchParams<{ deckId: string }>();
  const app = useApp();
  const theme = useTheme();

  const deck = app.deckStore((s) => (deckId ? s.getDeck(deckId) : undefined));
  const cards = app.deckStore((s) => (deckId ? s.cardsByDeck[deckId] ?? [] : []));
  const toggleStar = app.deckStore((s) => s.toggleStar);
  const toggleSuspend = app.deckStore((s) => s.toggleSuspend);
  const deleteCard = app.deckStore((s) => s.deleteCard);

  const stats = useMemo(() => computeDeckStats(cards), [cards]);

  if (!deck || !deckId) {
    return (
      <Screen>
        <Text style={{ color: theme.textMuted }}>Deck not found.</Text>
      </Screen>
    );
  }
  const currentDeck = deck;

  function confirmDelete(card: Flashcard) {
    Alert.alert('Delete card', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteCard(deckId!, card.id) },
    ]);
  }

  async function handleShare() {
    const payload = buildDeckExport(currentDeck, cards);
    try {
      await Share.share({
        title: `${payload.title} — Auto Cards`,
        message: `Study "${payload.title}" (${payload.cards.length} cards) on Auto Cards: ${shareUrlForDeck(
          payload,
          'https://autocards.app/app/decks',
        )}`,
      });
    } catch {
      // User dismissed the share sheet.
    }
  }

  async function handleExport() {
    const payload = buildDeckExport(currentDeck, cards);
    try {
      await Share.share({
        title: payload.title,
        message: serializeDeckExport(payload),
      });
    } catch {
      // User dismissed the share sheet.
    }
  }

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg }}>
        <Text style={{ fontSize: 32 }}>{deck.icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: theme.text }}>{deck.title}</Text>
          <Text style={{ fontSize: 13, color: theme.textMuted }} numberOfLines={2}>
            {deck.description}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg }}>
        <Button
          title="Share"
          variant="outline"
          onPress={handleShare}
          style={{ flexGrow: 1 }}
        />
        <Button
          title="Export"
          variant="outline"
          onPress={handleExport}
          style={{ flexGrow: 1 }}
        />
        <Button
          title="Study now"
          onPress={() => router.push(`/study/${deckId}/setup`)}
          disabled={stats.total === 0}
          style={{ flexGrow: 1.5 }}
        />
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
        <MiniStat label="Cards" value={stats.total} theme={theme} />
        <MiniStat label="New" value={stats.new} theme={theme} />
        <MiniStat label="Mastered" value={stats.mastered} theme={theme} />
      </View>

      <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text, marginBottom: spacing.sm }}>
        Cards ({cards.length})
      </Text>

      <View style={{ gap: spacing.sm }}>
        {cards.map((card) => {
          const front =
            card.type === 'cloze' && card.clozeText && hasCloze(card.clozeText)
              ? parseCloze(card.clozeText).prompt
              : card.front;
          return (
            <Card key={card.id} style={card.suspended ? { opacity: 0.5 } : undefined}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
                <Pressable onPress={() => toggleStar(deckId!, card.id)}>
                  <Text style={{ fontSize: 16 }}>{card.starred ? '⭐' : '☆'}</Text>
                </Pressable>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text }} numberOfLines={2}>
                    {front}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    <Badge label={cardTypeLabel(card.type)} color={theme.textMuted} softColor={theme.surfaceAlt} />
                    <Badge
                      label={card.difficulty}
                      color={DIFFICULTY_COLOR[card.difficulty]}
                      softColor={`${DIFFICULTY_COLOR[card.difficulty]}22`}
                    />
                    <Badge
                      label={card.priority}
                      color={PRIORITY_COLOR[card.priority]}
                      softColor={`${PRIORITY_COLOR[card.priority]}22`}
                    />
                  </View>
                  <View style={{ marginTop: spacing.sm }}>
                    <ProgressBar value={card.mastery} max={100} />
                  </View>
                </View>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.md, marginTop: spacing.sm }}>
                <Pressable onPress={() => toggleSuspend(deckId!, card.id)}>
                  <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '600' }}>
                    {card.suspended ? 'Resume' : 'Suspend'}
                  </Text>
                </Pressable>
                <Pressable onPress={() => confirmDelete(card)}>
                  <Text style={{ color: theme.danger, fontSize: 12, fontWeight: '600' }}>Delete</Text>
                </Pressable>
              </View>
            </Card>
          );
        })}
      </View>
    </Screen>
  );
}

function MiniStat({ label, value, theme, highlight }: { label: string; value: number; theme: ReturnType<typeof useTheme>; highlight?: boolean }) {
  return (
    <Card style={{ flexBasis: '22%', flexGrow: 1, alignItems: 'center', paddingVertical: spacing.sm }}>
      <Text style={{ fontSize: 18, fontWeight: '800', color: highlight ? theme.warning : theme.text }}>{value}</Text>
      <Text style={{ fontSize: 10, color: theme.textFaint }}>{label}</Text>
    </Card>
  );
}
