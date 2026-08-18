import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { formatDuration } from '@autocards/core';
import { useApp } from '../../../../src/lib/appContext';
import { useT } from '../../../../src/lib/i18n';
import { useTheme, spacing } from '../../../../src/lib/theme';
import { Button, Card, Screen } from '../../../../src/components';

const LETTER_COLOR: Record<string, string> = {
  S: '#8b5cf6',
  A: '#10b981',
  B: '#0ea5e9',
  C: '#f59e0b',
  D: '#f97316',
  F: '#f43f5e',
};

export default function StudyResultsScreen() {
  const { deckId, sessionId } = useLocalSearchParams<{ deckId: string; sessionId: string }>();
  const app = useApp();
  const t = useT();
  const theme = useTheme();

  const activeSession = app.studyStore((s) => s.activeSession);
  const history = app.studyStore((s) => s.history);
  const clearActiveSession = app.studyStore((s) => s.clearActiveSession);

  const fullSession = activeSession?.id === sessionId ? activeSession : undefined;
  const summary = history.find((s) => s.id === sessionId);

  useEffect(() => {
    return () => {
      if (activeSession?.id === sessionId) clearActiveSession();
    };
  }, [activeSession?.id, sessionId, clearActiveSession]);

  const score = fullSession?.score;
  const answered = score?.answered ?? summary?.answered ?? 0;
  const correct = score?.correct ?? summary?.correct ?? 0;
  const accuracy = score?.accuracy ?? summary?.accuracy ?? 0;
  const finalScore = score?.finalScore ?? summary?.finalScore ?? 0;
  const xp = score?.xp ?? summary?.xp ?? 0;
  const letter = score?.letter ?? summary?.letter ?? 'F';
  const durationMs = fullSession?.durationMs ?? summary?.durationMs ?? 0;
  const deckTitle = fullSession?.deckTitle ?? summary?.deckTitle ?? t('results.deck');

  return (
    <Screen>
      <View style={{ alignItems: 'center', marginTop: spacing.xl }}>
        <Text style={{ color: theme.textMuted, fontSize: 13 }}>{deckTitle}</Text>
        <Text style={{ fontSize: 72, fontWeight: '900', color: LETTER_COLOR[letter] ?? theme.textMuted }}>{letter}</Text>
        <Text style={{ fontSize: 17, fontWeight: '700', color: theme.text }}>
          {t('results.pointsXp', { points: finalScore.toLocaleString(), xp })}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xl }}>
        <Stat label={t('results.accuracy')} value={`${Math.round(accuracy * 100)}%`} theme={theme} />
        <Stat label={t('results.correct')} value={`${correct}/${answered}`} theme={theme} />
        <Stat label={t('results.time')} value={formatDuration(durationMs)} theme={theme} />
      </View>

      {score && (
        <Card style={{ marginTop: spacing.lg }}>
          <Text style={{ fontWeight: '700', color: theme.text, marginBottom: spacing.sm }}>{t('results.scoreBreakdown')}</Text>
          <BreakdownRow label={t('results.basePoints')} value={score.basePoints} theme={theme} />
          {score.difficultyBonus > 0 && <BreakdownRow label={t('results.difficultyBonus')} value={score.difficultyBonus} theme={theme} positive />}
          {score.speedBonus > 0 && <BreakdownRow label={t('results.speedBonus')} value={score.speedBonus} theme={theme} positive />}
          {score.streakBonus > 0 && <BreakdownRow label={t('results.streakBonus')} value={score.streakBonus} theme={theme} positive />}
          {score.hintPenalty > 0 && <BreakdownRow label={t('results.hintPenalty')} value={-score.hintPenalty} theme={theme} />}
        </Card>
      )}

      <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl }}>
        <Button title={t('results.backToDeck')} variant="outline" onPress={() => router.replace(`/(app)/decks/${deckId}`)} style={{ flex: 1 }} />
        <Button title={t('results.studyAgain')} onPress={() => router.replace(`/study/${deckId}/setup`)} style={{ flex: 1 }} />
      </View>
    </Screen>
  );
}

function Stat({ label, value, theme }: { label: string; value: string; theme: ReturnType<typeof useTheme> }) {
  return (
    <Card style={{ flexBasis: '31%', flexGrow: 1, alignItems: 'center' }}>
      <Text style={{ fontSize: 18, fontWeight: '800', color: theme.text }}>{value}</Text>
      <Text style={{ fontSize: 11, color: theme.textFaint }}>{label}</Text>
    </Card>
  );
}

function BreakdownRow({ label, value, theme, positive }: { label: string; value: number; theme: ReturnType<typeof useTheme>; positive?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
      <Text style={{ color: theme.textMuted, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: positive ? theme.success : theme.text, fontSize: 13, fontWeight: '600' }}>
        {value > 0 ? '+' : ''}
        {value}
      </Text>
    </View>
  );
}
