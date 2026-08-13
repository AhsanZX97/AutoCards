import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { computeAchievements, computeOverallStats } from '@autocards/core';
import { useApp } from '../../src/lib/appContext';
import { useTheme, spacing } from '../../src/lib/theme';
import { Badge, Card, ProgressBar, Screen } from '../../src/components';
import { ActivityHeatmap } from '../../src/features/stats/ActivityHeatmap';

export default function StatsScreen() {
  const app = useApp();
  const theme = useTheme();
  const history = app.studyStore((s) => s.history);
  const stats = useMemo(() => computeOverallStats(history), [history]);
  const achievements = useMemo(() => computeAchievements(stats), [stats]);

  return (
    <Screen>
      <Text style={{ fontSize: 24, fontWeight: '800', color: theme.text, marginBottom: spacing.lg }}>Stats</Text>

      <Card style={{ marginBottom: spacing.md }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm }}>
          <Text style={{ fontWeight: '700', color: theme.text }}>Level {stats.level.level}</Text>
          <Text style={{ color: theme.textFaint, fontSize: 12 }}>
            {stats.level.xpIntoLevel}/{stats.level.xpForNextLevel} XP
          </Text>
        </View>
        <ProgressBar value={stats.level.progress * 100} max={100} height={8} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: spacing.lg }}>
          <Stat label="Total XP" value={stats.totalXp} theme={theme} />
          <Stat label="Sessions" value={stats.totalSessions} theme={theme} />
          <Stat label="Minutes" value={stats.totalMinutes} theme={theme} />
        </View>
      </Card>

      <Card style={{ marginBottom: spacing.md, alignItems: 'center' }}>
        <Text style={{ fontSize: 32 }}>🔥</Text>
        <Text style={{ fontSize: 26, fontWeight: '800', color: theme.text, marginTop: 4 }}>{stats.streak.current}</Text>
        <Text style={{ color: theme.textMuted, fontSize: 13 }}>day streak · best {stats.streak.longest}</Text>
        {stats.streak.atRisk && (
          <View style={{ marginTop: spacing.sm }}>
            <Badge label="Study today to keep it!" color={theme.warning} softColor={theme.warningSoft} />
          </View>
        )}
      </Card>

      <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text, marginBottom: spacing.sm }}>Activity</Text>
      <Card style={{ marginBottom: spacing.md }}>
        <ActivityHeatmap activity={stats.activity} />
      </Card>

      <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text, marginBottom: spacing.sm }}>
        Performance by deck
      </Text>
      <Card style={{ marginBottom: spacing.md }}>
        {stats.perDeck.length === 0 ? (
          <Text style={{ color: theme.textFaint, textAlign: 'center' }}>No sessions yet.</Text>
        ) : (
          stats.perDeck.map((deck) => (
            <View
              key={deck.deckId}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                paddingVertical: spacing.sm,
              }}
            >
              <View>
                <Text style={{ fontWeight: '600', color: theme.text, fontSize: 13 }}>{deck.deckTitle}</Text>
                <Text style={{ fontSize: 11, color: theme.textFaint }}>
                  {deck.sessions} sessions · {Math.round(deck.accuracy * 100)}%
                </Text>
              </View>
              <Text style={{ color: theme.primaryText, fontWeight: '700', fontSize: 13 }}>{deck.xp} XP</Text>
            </View>
          ))
        )}
      </Card>

      <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text, marginBottom: spacing.sm }}>Achievements</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {achievements.map((a) => (
          <Card
            key={a.id}
            style={{
              flexBasis: '31%',
              flexGrow: 1,
              alignItems: 'center',
              opacity: a.unlocked ? 1 : 0.5,
              paddingVertical: spacing.md,
            }}
          >
            <Text style={{ fontSize: 22 }}>{a.icon}</Text>
            <Text style={{ fontSize: 10, fontWeight: '700', color: theme.text, marginTop: 4, textAlign: 'center' }}>
              {a.name}
            </Text>
            {!a.unlocked && (
              <View style={{ alignSelf: 'stretch', marginTop: spacing.sm }}>
                <ProgressBar value={a.progress * 100} max={100} height={4} />
              </View>
            )}
          </Card>
        ))}
      </View>
    </Screen>
  );
}

function Stat({ label, value, theme }: { label: string; value: number; theme: ReturnType<typeof useTheme> }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ fontSize: 18, fontWeight: '800', color: theme.text }}>{value}</Text>
      <Text style={{ fontSize: 11, color: theme.textFaint }}>{label}</Text>
    </View>
  );
}
