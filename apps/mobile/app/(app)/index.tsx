import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { computeDeckStats, computeOverallStats, formatRelative, type SessionSummary } from '@autocards/core';
import { useApp } from '../../src/lib/appContext';
import { useTheme, radius, spacing, type Theme } from '../../src/lib/theme';
import { Badge, Button, Card, Screen } from '../../src/components';
import { DeckRow } from '../../src/features/decks/DeckRow';

export default function DashboardScreen() {
  const app = useApp();
  const theme = useTheme();
  const user = app.authStore((s) => s.session?.user);
  const allDecks = app.deckStore((s) => s.decks);
  const cardsByDeck = app.deckStore((s) => s.cardsByDeck);
  const history = app.studyStore((s) => s.history);

  const stats = useMemo(() => computeOverallStats(history), [history]);
  const activeDecks = useMemo(() => allDecks.filter((d) => !d.archived), [allDecks]);
  const deckSummaries = useMemo(
    () => activeDecks.slice(0, 5).map((deck) => ({ deck, stats: computeDeckStats(cardsByDeck[deck.id] ?? []) })),
    [activeDecks, cardsByDeck],
  );
  /* History outlives the decks it came from, so rows for a deleted deck stay flat text. */
  const existingDeckIds = useMemo(() => new Set(allDecks.map((d) => d.id)), [allDecks]);
  const firstName = user?.username ?? 'there';

  return (
    <Screen>
      <Text style={{ fontSize: 24, fontWeight: '800', color: theme.text }}>Welcome back, {firstName} 👋</Text>
      <Text style={{ fontSize: 14, color: theme.textMuted, marginTop: 4, marginBottom: spacing.lg }}>
        {activeDecks.length > 0 ? `${activeDecks.length} deck${activeDecks.length === 1 ? '' : 's'} ready to study.` : 'Create your first deck to get started.'}
      </Text>

      <Button title="Create deck" onPress={() => router.push('/(app)/decks/new')} />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.lg }}>
        <StatTile icon="🔥" label="Streak" value={String(stats.streak.current)} />
        <StatTile icon="⭐" label="Level" value={String(stats.level.level)} />
        <StatTile icon="🎯" label="Accuracy" value={`${Math.round(stats.accuracy * 100)}%`} />
        <StatTile icon="📚" label="Decks" value={String(activeDecks.length)} />
      </View>

      <Text style={{ fontSize: 18, fontWeight: '700', color: theme.text, marginTop: spacing.xl, marginBottom: spacing.md }}>
        Your decks
      </Text>
      {deckSummaries.length === 0 ? (
        <Card>
          <Text style={{ textAlign: 'center', color: theme.textMuted }}>No decks yet — create your first one.</Text>
        </Card>
      ) : (
        <View style={{ gap: spacing.sm }}>
          {deckSummaries.map(({ deck, stats: deckStats }) => (
            <DeckRow key={deck.id} deck={deck} stats={deckStats} onPress={() => router.push(`/(app)/decks/${deck.id}`)} />
          ))}
        </View>
      )}

      {history.length > 0 && (
        <>
          <Text
            style={{ fontSize: 18, fontWeight: '700', color: theme.text, marginTop: spacing.xl, marginBottom: spacing.md }}
          >
            Recent sessions
          </Text>
          <Card>
            {history.slice(0, 5).map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                theme={theme}
                onPress={
                  existingDeckIds.has(session.deckId)
                    ? () => router.push(`/(app)/decks/${session.deckId}`)
                    : undefined
                }
              />
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}

function SessionRow({
  session,
  theme,
  onPress,
}: {
  session: SessionSummary;
  theme: Theme;
  onPress?: () => void;
}) {
  const grade =
    session.letter === 'F'
      ? { color: theme.danger, soft: theme.dangerSoft }
      : session.letter === 'S' || session.letter === 'A'
        ? { color: theme.success, soft: theme.successSoft }
        : { color: theme.primaryText, soft: theme.primarySoft };

  const content = (
    <>
      <View style={{ flex: 1, marginRight: spacing.sm }}>
        <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '600', color: theme.text }}>
          {session.deckTitle}
        </Text>
        <Text style={{ fontSize: 11, color: theme.textFaint }}>{formatRelative(session.endedAt)}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Text style={{ fontSize: 12, color: theme.textMuted }}>
          {session.correct}/{session.answered} correct
        </Text>
        <Badge label={session.letter} color={grade.color} softColor={grade.soft} />
      </View>
    </>
  );

  const layout = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  } as const;

  if (!onPress) return <View style={layout}>{content}</View>;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${session.deckTitle}`}
      style={({ pressed }) => ({
        ...layout,
        marginHorizontal: -spacing.sm,
        paddingHorizontal: spacing.sm,
        borderRadius: radius.md,
        backgroundColor: pressed ? theme.surfaceAlt : 'transparent',
      })}
    >
      {content}
    </Pressable>
  );
}

function StatTile({ icon, label, value }: { icon: string; label: string; value: string }) {
  const theme = useTheme();
  return (
    <Card style={{ flexBasis: '47%', flexGrow: 1 }}>
      <Text style={{ fontSize: 18 }}>{icon}</Text>
      <Text style={{ fontSize: 22, fontWeight: '800', color: theme.text, marginTop: 6 }}>{value}</Text>
      <Text style={{ fontSize: 12, color: theme.textFaint, marginTop: 2 }}>{label}</Text>
    </Card>
  );
}
