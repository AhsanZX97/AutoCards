import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  DIFFICULTIES,
  PRIORITIES,
  STUDY_MODES,
  SHUFFLE_MODES,
  applyModePreset,
  createDefaultStudySettings,
  filterCards,
  normalizeStudySettings,
  type StudySettings,
} from '@autocards/core';
import { useApp } from '../../../src/lib/appContext';
import { useT } from '../../../src/lib/i18n';
import { useTheme, spacing, radius } from '../../../src/lib/theme';
import { Button, Card, Chip, Notice, Screen, Stepper, SwitchRow } from '../../../src/components';
import { EMPTY_ARRAY } from '../../../src/lib/empty';
import { STUDY_MODE_ICONS } from '../../../src/features/decks/studyModeIcons';

export default function StudySetupScreen() {
  const { deckId } = useLocalSearchParams<{ deckId: string }>();
  const app = useApp();
  const t = useT();
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
        <Text style={{ color: theme.textMuted }}>{t('studySetup.notFound')}</Text>
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
        <Text style={{ color: theme.primaryText, fontWeight: '600' }}>{t('common.backArrow')}</Text>
      </Pressable>
      <Text style={{ fontSize: 22, fontWeight: '800', color: theme.text }}>{t('studySetup.title', { deckTitle: deck.title })}</Text>
      <Text style={{ color: theme.textMuted, fontSize: 13, marginBottom: spacing.lg }}>
        {t.plural('studySetup.cardsAvailable', activeCount, { count: activeCount })}
      </Text>

      <Text style={{ fontWeight: '700', color: theme.text, marginBottom: spacing.sm }}>{t('studySetup.studyMode')}</Text>
      <View style={{ gap: spacing.sm, marginBottom: spacing.lg }}>
        {STUDY_MODES.map((mode) => {
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
              <Text style={{ fontSize: 20 }}>{STUDY_MODE_ICONS[mode]}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: theme.text, fontSize: 14 }}>{t(`studyMode.${mode}` as const)}</Text>
                <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>{t(`studyMode.${mode}.description` as const)}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <Text style={{ fontWeight: '700', color: theme.text, marginBottom: spacing.sm }}>{t('studySetup.cardOrderPacing')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.sm }}>
        {SHUFFLE_MODES.map((mode) => (
          <Chip
            key={mode}
            label={t(`shuffleMode.${mode}` as const)}
            active={settings.shuffle === mode}
            onPress={() => setSettings((s) => ({ ...s, shuffle: mode }))}
          />
        ))}
      </View>

      <Card style={{ marginBottom: spacing.lg }}>
        <Stepper
          label={t('studySetup.cardLimit')}
          value={settings.filters.cardLimit}
          min={0}
          max={Math.max(20, activeCount)}
          step={5}
          formatValue={(v) => (v === 0 ? t('studySetup.noLimit') : t('studySetup.cardsUnit', { count: v }))}
          onChange={(v) => updateFilters('cardLimit', v)}
        />
        <SwitchRow
          label={t('studySetup.timer')}
          description={t('studySetup.timerDescription')}
          value={settings.timer.enabled}
          onValueChange={(v) => updateTimer('enabled', v)}
        />
        {settings.timer.enabled && (
          <Stepper
            label={t('studySetup.secondsPerCard')}
            value={settings.timer.perCardSeconds}
            min={5}
            max={90}
            step={5}
            formatValue={(v) => t('studySetup.secondsUnit', { count: v })}
            onChange={(v) => updateTimer('perCardSeconds', v)}
          />
        )}
        <SwitchRow
          label={t('studySetup.reversed')}
          description={t('studySetup.reversedDescription')}
          value={settings.reversed}
          onValueChange={(v) => setSettings((s) => ({ ...s, reversed: v }))}
        />
      </Card>

      <Text style={{ fontWeight: '700', color: theme.text, marginBottom: spacing.sm }}>{t('studySetup.filters')}</Text>
      <Card style={{ marginBottom: spacing.lg }}>
        {deck.categories.length > 0 && (
          <View style={{ marginBottom: spacing.sm }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: theme.text, marginBottom: spacing.xs }}>{t('studySetup.categories')}</Text>
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
          <Text style={{ fontSize: 13, fontWeight: '600', color: theme.text, marginBottom: spacing.xs }}>{t('studySetup.difficulty')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {DIFFICULTIES.map((d) => (
              <Chip
                key={d}
                label={t(`difficulty.${d}` as const)}
                active={settings.filters.difficulties.includes(d)}
                onPress={() => toggleDifficulty(d)}
              />
            ))}
          </View>
        </View>

        <View style={{ marginBottom: spacing.sm }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: theme.text, marginBottom: spacing.xs }}>{t('studySetup.priority')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {PRIORITIES.map((p) => (
              <Chip
                key={p}
                label={t(`priority.${p}` as const)}
                active={settings.filters.priorities.includes(p)}
                onPress={() => togglePriority(p)}
              />
            ))}
          </View>
        </View>

        <SwitchRow
          label={t('studySetup.starredOnly')}
          value={settings.filters.starredOnly}
          onValueChange={(v) => updateFilters('starredOnly', v)}
        />
        <SwitchRow
          label={t('studySetup.excludeMastered')}
          description={t('studySetup.excludeMasteredDescription', { threshold: settings.filters.masteredThreshold })}
          value={settings.filters.excludeMastered}
          onValueChange={(v) => updateFilters('excludeMastered', v)}
        />
      </Card>

      <Text style={{ fontWeight: '700', color: theme.text, marginBottom: spacing.sm }}>{t('studySetup.scoring')}</Text>
      <Card style={{ marginBottom: spacing.lg }}>
        <SwitchRow
          label={t('studySetup.streakBonus')}
          description={t('studySetup.streakBonusDescription')}
          value={settings.streakBonus}
          onValueChange={(v) => setSettings((s) => ({ ...s, streakBonus: v }))}
        />
        <SwitchRow
          label={t('studySetup.speedBonus')}
          description={t('studySetup.speedBonusDescription')}
          value={settings.speedBonus}
          onValueChange={(v) => setSettings((s) => ({ ...s, speedBonus: v }))}
        />
        <SwitchRow
          label={t('studySetup.hintPenalty')}
          description={t('studySetup.hintPenaltyDescription')}
          value={settings.hintPenalty}
          onValueChange={(v) => setSettings((s) => ({ ...s, hintPenalty: v }))}
        />
        <SwitchRow
          label={t('studySetup.soundEffects')}
          value={settings.sound}
          onValueChange={(v) => setSettings((s) => ({ ...s, sound: v }))}
        />
      </Card>

      {matchingCount === 0 && (
        <Notice variant="warning">
          {activeCount === 0 ? t('studySetup.allSuspended') : t('studySetup.noMatches')}
        </Notice>
      )}

      <Button
        title={t('studySetup.startStudying')}
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
