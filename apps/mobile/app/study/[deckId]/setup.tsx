import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  DIFFICULTIES,
  PRIORITIES,
  STUDY_MODES,
  STUDY_MODE_INFO,
  SHUFFLE_MODES,
  SHUFFLE_MODE_LABELS,
  applyModePreset,
  createDefaultStudySettings,
  filterCards,
  normalizeStudySettings,
  type StudySettings,
} from '@autocards/core';
import { useApp } from '../../../src/lib/appContext';
import { useTheme, spacing, radius } from '../../../src/lib/theme';
import { Button, Card, Chip, Notice, Screen, Stepper, SwitchRow } from '../../../src/components';
import { EMPTY_ARRAY } from '../../../src/lib/empty';

function capitalize(value: string): string {
  return value[0]?.toUpperCase() + value.slice(1);
}

export default function StudySetupScreen() {
  const { deckId } = useLocalSearchParams<{ deckId: string }>();
  const app = useApp();
  const theme = useTheme();

  const deck = app.deckStore((s) => (deckId ? s.getDeck(deckId) : undefined));
  const cards = app.deckStore((s) => (deckId ? s.cardsByDeck[deckId] ?? EMPTY_ARRAY : EMPTY_ARRAY));
  const startSession = app.studyStore((s) => s.startSession);

  // Decks saved before a mode was retired still name it, which would leave
  // the picker with nothing selected — normalize before it reaches the UI.
  const [settings, setSettings] = useState<StudySettings>(() =>
    deck ? normalizeStudySettings(deck.defaultSettings) : createDefaultStudySettings(),
  );

  // What the session would actually queue up. `activeCount` below only counts
  // unsuspended cards, so it says nothing about whether the filters match.
  const matchingCount = useMemo(() => filterCards(cards, settings.filters).length, [cards, settings.filters]);

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

  function updateFilters<K extends keyof StudySettings['filters']>(key: K, value: StudySettings['filters'][K]) {
    setSettings((s) => ({ ...s, filters: { ...s.filters, [key]: value } }));
  }

  function updateTimer<K extends keyof StudySettings['timer']>(key: K, value: StudySettings['timer'][K]) {
    setSettings((s) => ({ ...s, timer: { ...s.timer, [key]: value } }));
  }

  function toggleDifficulty(d: (typeof DIFFICULTIES)[number]) {
    const current = settings.filters.difficulties;
    updateFilters('difficulties', current.includes(d) ? current.filter((x) => x !== d) : [...current, d]);
  }

  function togglePriority(p: (typeof PRIORITIES)[number]) {
    const current = settings.filters.priorities;
    updateFilters('priorities', current.includes(p) ? current.filter((x) => x !== p) : [...current, p]);
  }

  function toggleCategory(id: string) {
    const current = settings.filters.categoryIds;
    updateFilters('categoryIds', current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
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

      <Text style={{ fontWeight: '700', color: theme.text, marginBottom: spacing.sm }}>Card order &amp; pacing</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.sm }}>
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
        <Stepper
          label="Card limit"
          value={settings.filters.cardLimit}
          min={0}
          max={Math.max(20, activeCount)}
          step={5}
          formatValue={(v) => (v === 0 ? 'No limit' : `${v} cards`)}
          onChange={(v) => updateFilters('cardLimit', v)}
        />
        <SwitchRow
          label="Timer"
          description="Countdown per card"
          value={settings.timer.enabled}
          onValueChange={(v) => updateTimer('enabled', v)}
        />
        {settings.timer.enabled && (
          <Stepper
            label="Seconds per card"
            value={settings.timer.perCardSeconds}
            min={5}
            max={90}
            step={5}
            formatValue={(v) => `${v}s`}
            onChange={(v) => updateTimer('perCardSeconds', v)}
          />
        )}
        <SwitchRow
          label="Reversed"
          description="Show the answer first, ask for the question"
          value={settings.reversed}
          onValueChange={(v) => setSettings((s) => ({ ...s, reversed: v }))}
        />
      </Card>

      <Text style={{ fontWeight: '700', color: theme.text, marginBottom: spacing.sm }}>Filters</Text>
      <Card style={{ marginBottom: spacing.lg }}>
        {deck.categories.length > 0 && (
          <View style={{ marginBottom: spacing.sm }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: theme.text, marginBottom: spacing.xs }}>Categories</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {deck.categories.map((cat) => (
                <Chip
                  key={cat.id}
                  label={`${cat.icon} ${cat.name}`}
                  active={settings.filters.categoryIds.includes(cat.id)}
                  onPress={() => toggleCategory(cat.id)}
                />
              ))}
            </View>
          </View>
        )}

        <View style={{ marginBottom: spacing.sm }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: theme.text, marginBottom: spacing.xs }}>Difficulty</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {DIFFICULTIES.map((d) => (
              <Chip
                key={d}
                label={capitalize(d)}
                active={settings.filters.difficulties.includes(d)}
                onPress={() => toggleDifficulty(d)}
              />
            ))}
          </View>
        </View>

        <View style={{ marginBottom: spacing.sm }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: theme.text, marginBottom: spacing.xs }}>Priority</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {PRIORITIES.map((p) => (
              <Chip
                key={p}
                label={capitalize(p)}
                active={settings.filters.priorities.includes(p)}
                onPress={() => togglePriority(p)}
              />
            ))}
          </View>
        </View>

        <SwitchRow
          label="Starred only"
          value={settings.filters.starredOnly}
          onValueChange={(v) => updateFilters('starredOnly', v)}
        />
        <SwitchRow
          label="Exclude mastered"
          description={`Skip cards at ${settings.filters.masteredThreshold}%+ mastery`}
          value={settings.filters.excludeMastered}
          onValueChange={(v) => updateFilters('excludeMastered', v)}
        />
      </Card>

      <Text style={{ fontWeight: '700', color: theme.text, marginBottom: spacing.sm }}>Scoring</Text>
      <Card style={{ marginBottom: spacing.lg }}>
        <SwitchRow
          label="Streak bonus"
          description="Extra points for consecutive correct answers"
          value={settings.streakBonus}
          onValueChange={(v) => setSettings((s) => ({ ...s, streakBonus: v }))}
        />
        <SwitchRow
          label="Speed bonus"
          description="Extra points for fast answers"
          value={settings.speedBonus}
          onValueChange={(v) => setSettings((s) => ({ ...s, speedBonus: v }))}
        />
        <SwitchRow
          label="Hint penalty"
          description="Deduct points when a hint is revealed"
          value={settings.hintPenalty}
          onValueChange={(v) => setSettings((s) => ({ ...s, hintPenalty: v }))}
        />
        <SwitchRow
          label="Sound effects"
          value={settings.sound}
          onValueChange={(v) => setSettings((s) => ({ ...s, sound: v }))}
        />
      </Card>

      {matchingCount === 0 && (
        <Notice variant="warning">
          {activeCount === 0
            ? 'Every card in this deck is suspended, so there is nothing to study yet.'
            : 'No cards match these filters. Widen them to start studying.'}
        </Notice>
      )}

      <Button
        title="Start studying"
        size="lg"
        disabled={matchingCount === 0}
        style={{ marginTop: spacing.lg }}
        onPress={() => {
          startSession(deck, cards, settings);
          router.push(`/study/${deckId}/run`);
        }}
      />
    </Screen>
  );
}
