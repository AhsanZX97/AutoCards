import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import {
  computeDeckStats,
  computeOverallStats,
  formatNextReminder,
  formatRelative,
  nextReminderAt,
  type DeckReminder,
  type SessionSummary,
} from '@autocards/core';
import { useApp } from '../../src/lib/appContext';
import { useT } from '../../src/lib/i18n';
import { useTheme, radius, spacing, type Theme } from '../../src/lib/theme';
import { Badge, Card, GradientPanel, IconTile, Screen } from '../../src/components';
import { DeckRow } from '../../src/features/decks/DeckRow';

export default function DashboardScreen() {
  const app = useApp();
  const t = useT();
  const theme = useTheme();
  const user = app.authStore((s) => s.session?.user);
  const allDecks = app.deckStore((s) => s.decks);
  const cardsByDeck = app.deckStore((s) => s.cardsByDeck);
  const history = app.studyStore((s) => s.history);
  const remindersByDeck = app.reminderStore((s) => s.remindersByDeck);

  const stats = useMemo(() => computeOverallStats(history), [history]);
  const activeDecks = useMemo(() => allDecks.filter((d) => !d.archived), [allDecks]);
  const deckSummaries = useMemo(
    () => activeDecks.slice(0, 5).map((deck) => ({ deck, stats: computeDeckStats(cardsByDeck[deck.id] ?? []) })),
    [activeDecks, cardsByDeck],
  );
  /* History outlives the decks it came from, so rows for a deleted deck stay flat text. */
  const existingDeckIds = useMemo(() => new Set(allDecks.map((d) => d.id)), [allDecks]);
  const firstName = user?.username ?? t('dashboard.guestName');

  /* The soonest reminder still ahead, across every deck — same math the
     device's local notifications use, so the two never disagree. */
  const nextReminder = useMemo(() => {
    const now = new Date();
    let best: { reminder: DeckReminder; deckTitle: string; at: Date } | null = null;
    for (const deck of activeDecks) {
      const reminders = remindersByDeck[deck.id];
      if (!reminders?.length) continue;
      const lastStudiedAt = history.find((s) => s.deckId === deck.id)?.endedAt;
      for (const reminder of reminders) {
        const at = nextReminderAt(reminder, { now, lastStudiedAt });
        if (at && (!best || at.getTime() < best.at.getTime())) best = { reminder, deckTitle: deck.title, at };
      }
    }
    return best;
  }, [activeDecks, remindersByDeck, history]);

  /* The deck to send someone into next: whichever needs the most work, so
     "Start Studying" never points at something already mastered. */
  const nextDeckToStudy = useMemo(() => {
    const withCards = deckSummaries.filter(({ stats: s }) => s.total > 0);
    const pool = withCards.length > 0 ? withCards : deckSummaries;
    if (pool.length === 0) return activeDecks[0];
    return pool.reduce((lowest, current) =>
      current.stats.averageMastery < lowest.stats.averageMastery ? current : lowest,
    ).deck;
  }, [deckSummaries, activeDecks]);

  return (
    <Screen>
      <Text style={{ fontSize: 24, fontWeight: '800', color: theme.text }}>{t('dashboard.welcome', { name: firstName })}</Text>
      <Text style={{ fontSize: 14, color: theme.textMuted, marginTop: 4, marginBottom: spacing.lg }}>
        {activeDecks.length > 0
          ? t.plural('dashboard.decksReady', activeDecks.length, { count: activeDecks.length })
          : t('dashboard.noDecksYetPrompt')}
      </Text>

      <GradientPanel>
        <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' }}>
          {nextReminder ? t('mobileDashboard.nextReminder') : activeDecks.length > 0 ? t('mobileDashboard.todaysGoal') : t('mobileDashboard.getStarted')}
        </Text>
        <Text style={{ color: '#ffffff', fontSize: 22, fontWeight: '800', marginTop: 4 }}>
          {nextReminder ? nextReminder.deckTitle : activeDecks.length > 0 ? t('mobileDashboard.keepStreak') : t('mobileDashboard.createFirstDeck')}
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, marginTop: 4 }}>
          {nextReminder
            ? t('mobileDashboard.reminderAt', { when: formatNextReminder(nextReminder.at) })
            : activeDecks.length > 0
              ? t('mobileDashboard.reviewOneDeck')
              : t('mobileDashboard.uploadToGenerate')}
        </Text>
        <Pressable
          onPress={() =>
            nextDeckToStudy ? router.push(`/(app)/decks/${nextDeckToStudy.id}`) : router.push('/(app)/decks/new')
          }
          style={({ pressed }) => ({
            marginTop: spacing.md,
            alignSelf: 'flex-start',
            paddingHorizontal: spacing.lg,
            paddingVertical: 10,
            borderRadius: radius.md,
            backgroundColor: 'rgba(255,255,255,0.25)',
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '700' }}>
            {nextDeckToStudy ? t('mobileDashboard.startStudying') : t('mobileDashboard.createDeckArrow')}
          </Text>
        </Pressable>
      </GradientPanel>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.lg }}>
        <StatTile icon="🔥" label={t('mobileDashboard.streak')} value={String(stats.streak.current)} color={theme.warning} />
        <StatTile icon="⭐" label={t('mobileDashboard.level')} value={String(stats.level.level)} color={theme.warning} />
        <StatTile icon="🎯" label={t('mobileDashboard.accuracy')} value={`${Math.round(stats.accuracy * 100)}%`} color={theme.danger} />
        <StatTile icon="📚" label={t('mobileDashboard.decks')} value={String(activeDecks.length)} color={theme.primary} />
      </View>

      <Text style={{ fontSize: 18, fontWeight: '700', color: theme.text, marginTop: spacing.xl, marginBottom: spacing.md }}>
        {t('mobileDashboard.yourDecks')}
      </Text>
      {deckSummaries.length === 0 ? (
        <Card>
          <Text style={{ textAlign: 'center', color: theme.textMuted }}>{t('mobileDashboard.noDecksYet')}</Text>
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
            {t('mobileDashboard.recentSessions')}
          </Text>
          <Card>
            {history.slice(0, 5).map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                theme={theme}
                t={t}
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
  t,
  onPress,
}: {
  session: SessionSummary;
  theme: Theme;
  t: ReturnType<typeof useT>;
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
          {t('mobileDashboard.correctOf', { correct: session.correct, answered: session.answered })}
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
      accessibilityLabel={t('mobileDashboard.openDeck', { deckTitle: session.deckTitle })}
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

function StatTile({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) {
  const theme = useTheme();
  return (
    <Card style={{ flexBasis: '47%', flexGrow: 1 }}>
      <IconTile icon={icon} color={color} size={36} fontSize={16} />
      <Text style={{ fontSize: 22, fontWeight: '800', color: theme.text, marginTop: 8 }}>{value}</Text>
      <Text style={{ fontSize: 12, color: theme.textFaint, marginTop: 2 }}>{label}</Text>
    </Card>
  );
}
