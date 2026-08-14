import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { computeAchievements, computeOverallStats } from '@autocards/core';
import { useApp } from '../../src/lib/appContext';
import { ACCENT_HEX, BRAND_GRADIENT, useTheme, radius, spacing, type Theme } from '../../src/lib/theme';
import { Badge, Card, CheckIcon, IconTile, ProgressBar, Screen } from '../../src/components';
import { ActivityHeatmap } from '../../src/features/stats/ActivityHeatmap';

export default function StatsScreen() {
  const app = useApp();
  const theme = useTheme();
  const history = app.studyStore((s) => s.history);
  const decks = app.deckStore((s) => s.decks);
  const stats = useMemo(() => computeOverallStats(history), [history]);
  const achievements = useMemo(() => computeAchievements(stats), [stats]);
  const decksById = useMemo(() => new Map(decks.map((d) => [d.id, d])), [decks]);
  const studiedToday = stats.streak.current > 0 && !stats.streak.atRisk;

  return (
    <Screen>
      <Text style={{ fontSize: 24, fontWeight: '800', color: theme.text }}>Statistics</Text>
      <Text style={{ fontSize: 14, color: theme.textMuted, marginTop: 4, marginBottom: spacing.lg }}>
        Your learning overview
      </Text>

      <Card style={{ marginBottom: spacing.md, padding: 0, overflow: 'hidden' }}>
        <View style={{ backgroundColor: theme.primarySoft, padding: spacing.lg }}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: spacing.sm,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <LinearGradient
                colors={[...BRAND_GRADIENT]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ width: 28, height: 28, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 12 }}>{stats.level.level}</Text>
              </LinearGradient>
              <Text style={{ fontWeight: '700', color: theme.text }}>Level {stats.level.level}</Text>
            </View>
            <Text style={{ color: theme.textFaint, fontSize: 12, fontWeight: '600' }}>
              {stats.level.xpIntoLevel}/{stats.level.xpForNextLevel} XP
            </Text>
          </View>
          <ProgressBar value={stats.level.progress * 100} max={100} height={8} />
        </View>
        <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: theme.border }}>
          <StatPill label="Total XP" value={stats.totalXp} theme={theme} />
          <StatPill label="Sessions" value={stats.totalSessions} theme={theme} divider />
          <StatPill label="Minutes" value={stats.totalMinutes} theme={theme} divider />
        </View>
      </Card>

      <Card style={{ marginBottom: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <IconTile icon="🔥" color={theme.warning} size={56} fontSize={28} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 28, fontWeight: '800', color: theme.text }}>{stats.streak.current}</Text>
            <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: 2 }}>
              day streak · <Text style={{ color: theme.text, fontWeight: '700' }}>best {stats.streak.longest}</Text>
            </Text>
          </View>
          {studiedToday && (
            <View style={{ alignItems: 'flex-end' }}>
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '700',
                  color: theme.textFaint,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                Today
              </Text>
              <LinearGradient
                colors={[...BRAND_GRADIENT]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: radius.full,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: 4,
                }}
              >
                <CheckIcon color="#ffffff" size={12} />
              </LinearGradient>
            </View>
          )}
        </View>
        {stats.streak.atRisk && (
          <View style={{ marginTop: spacing.md }}>
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
          <View style={{ gap: spacing.md }}>
            {stats.perDeck.map((deckStat) => {
              const deck = decksById.get(deckStat.deckId);
              const accentColor = deck ? ACCENT_HEX[deck.accent] : theme.textFaint;
              return (
                <View key={deckStat.deckId} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <IconTile icon={deck?.icon ?? '📁'} color={accentColor} size={40} fontSize={18} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontWeight: '600', color: theme.text, fontSize: 13 }} numberOfLines={1}>
                      {deckStat.deckTitle}
                    </Text>
                    <Text style={{ fontSize: 11, color: theme.textFaint }}>
                      {deckStat.sessions} session{deckStat.sessions === 1 ? '' : 's'} · {Math.round(deckStat.accuracy * 100)}%
                    </Text>
                  </View>
                  <Text style={{ color: accentColor, fontWeight: '700', fontSize: 13 }}>{deckStat.xp} XP</Text>
                </View>
              );
            })}
          </View>
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
            <IconTile icon={a.icon} color={theme.primary} size={40} fontSize={18} />
            <Text style={{ fontSize: 10, fontWeight: '700', color: theme.text, marginTop: spacing.xs, textAlign: 'center' }}>
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

function StatPill({ label, value, theme, divider }: { label: string; value: number; theme: Theme; divider?: boolean }) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        paddingVertical: spacing.md,
        borderLeftWidth: divider ? 1 : 0,
        borderLeftColor: theme.border,
      }}
    >
      <Text style={{ fontSize: 18, fontWeight: '800', color: theme.text }}>{value}</Text>
      <Text style={{ fontSize: 11, color: theme.textFaint, marginTop: 2 }}>{label}</Text>
    </View>
  );
}
