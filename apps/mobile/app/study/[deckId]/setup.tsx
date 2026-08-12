import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  STUDY_MODES,
  STUDY_MODE_INFO,
  SHUFFLE_MODES,
  SHUFFLE_MODE_LABELS,
  applyModePreset,
  createDefaultStudySettings,
  type StudySettings,
} from '@autocards/core';
import { useApp } from '../../../src/lib/appContext';
import { useTheme, spacing, radius } from '../../../src/lib/theme';
import { Button, Card, Chip, Screen, SwitchRow } from '../../../src/components';

export default function StudySetupScreen() {
  const { deckId } = useLocalSearchParams<{ deckId: string }>();
  const app = useApp();
  const theme = useTheme();

  const deck = app.deckStore((s) => (deckId ? s.getDeck(deckId) : undefined));
  const cards = app.deckStore((s) => (deckId ? s.cardsByDeck[deckId] ?? [] : []));
  const startSession = app.studyStore((s) => s.startSession);

  const [settings, setSettings] = useState<StudySettings>(() => deck?.defaultSettings ?? createDefaultStudySettings());

  if (!deck || !deckId) {
    return (
      <Screen>
        <Text style={{ color: theme.textMuted }}>Deck not found.</Text>
      </Screen>
    );
  }

  function setMode(mode: StudySettings['mode']) {
    setSettings((s) => applyModePreset(s, mode));
  }

  const activeCount = cards.filter((c) => !c.suspended).length;

  return (
    <Screen>
      <Pressable onPress={() => router.back()} style={{ marginBottom: spacing.md }}>
        <Text style={{ color: theme.primaryText, fontWeight: '600' }}>← Back</Text>
      </Pressable>
      <Text style={{ fontSize: 22, fontWeight: '800', color: theme.text }}>Study &quot;{deck.title}&quot;</Text>
      <Text style={{ color: theme.textMuted, fontSize: 13, marginBottom: spacing.lg }}>
        {activeCount} cards available
      </Text>

      <Text style={{ fontWeight: '700', color: theme.text, marginBottom: spacing.sm }}>Study mode</Text>
      <View style={{ gap: spacing.sm, marginBottom: spacing.lg }}>
        {STUDY_MODES.map((mode) => {
          const info = STUDY_MODE_INFO[mode];
          const active = settings.mode === mode;
          return (
            <Pressable
              key={mode}
              onPress={() => setMode(mode)}
              style={{
                flexDirection: 'row',
                gap: spacing.md,
                padding: spacing.md,
                borderRadius: radius.lg,
                borderWidth: 1,
                borderColor: active ? theme.primary : theme.border,
                backgroundColor: active ? theme.primarySoft : theme.surface,
              }}
            >
              <Text style={{ fontSize: 20 }}>{info.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: theme.text, fontSize: 14 }}>{info.label}</Text>
                <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>{info.description}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <Text style={{ fontWeight: '700', color: theme.text, marginBottom: spacing.sm }}>Shuffle</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.lg }}>
        {SHUFFLE_MODES.map((mode) => (
          <Chip
            key={mode}
            label={SHUFFLE_MODE_LABELS[mode]}
            active={settings.shuffle === mode}
            onPress={() => setSettings((s) => ({ ...s, shuffle: mode }))}
          />
        ))}
      </View>

      <Card style={{ marginBottom: spacing.lg }}>
        <SwitchRow
          label="Timer"
          description="Countdown per card"
          value={settings.timer.enabled}
          onValueChange={(v) => setSettings((s) => ({ ...s, timer: { ...s.timer, enabled: v } }))}
        />
        <SwitchRow
          label="Streak bonus"
          value={settings.streakBonus}
          onValueChange={(v) => setSettings((s) => ({ ...s, streakBonus: v }))}
        />
        <SwitchRow
          label="Speed bonus"
          value={settings.speedBonus}
          onValueChange={(v) => setSettings((s) => ({ ...s, speedBonus: v }))}
        />
      </Card>

      <Button
        title="Start studying"
        size="lg"
        disabled={activeCount === 0}
        onPress={() => {
          startSession(deck, cards, settings);
          router.push(`/study/${deckId}/run`);
        }}
      />
    </Screen>
  );
}
